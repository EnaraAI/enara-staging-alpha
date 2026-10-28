import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../auth/permissions';
import { requireInstitutionId } from '../auth/authorization';
import { BudgetCounter, OrgBudget } from '../models/OrgBudget';
import { CommercialPlan, CurrentToolSpend } from '../models/CommercialPlan';
import { parseOriginView } from '../services/originScope';
import { forgetAiBudgetCache } from '../services/aiBudget';
import { FEATURE_LABELS, NOT_ENOUGH_DATA, creditsForRow, enaraPrice, loadPlan, parseRange, requestUsage, savingsEstimate, usageReport } from '../services/usageReport';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';
import { logger } from '../utils/logging';

// P5 usage, budget, savings and simulator for schools. The institution always
// comes from the signed-in user, never from the request. No response here
// carries ENARA's internal provider cost or internal USD caps.
const router = Router();
router.use(authMiddleware);

// Usage chip: the caller's own usage for one request (X-Request-Id).
router.get('/me/requests/:requestId', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await requestUsage({ institutionId: req.user!.institutionId, userId: req.user!.id, requestId: String(req.params.requestId).slice(0, 128) }));
}));

// Usage chip: the caller's own usage today for a tool.
router.get('/me/today', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const features = String(req.query.features ?? '').split(',').map((f) => f.trim()).filter((f) => /^[a-z_]{2,40}$/.test(f)).slice(0, 10);
  if (!features.length) throw new AppError('features is required', 400, 'VALIDATION_ERROR');
  const { UsageLedger } = await import('../models/UsageLedger');
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await UsageLedger.find({ institutionId, userId: req.user!.id, feature: { $in: features }, createdAt: { $gte: start } }).select('feature status costStatus units').limit(5000).lean();
  const plan = await loadPlan(institutionId);
  let credits = 0;
  let unknown = 0;
  for (const r of rows) {
    const c = creditsForRow(r as never, plan);
    if (c === null) unknown++;
    else credits += c;
  }
  res.json({
    operations: rows.length,
    succeeded: rows.filter((r) => r.status === 'ok').length,
    unpriced: rows.filter((r) => r.costStatus === 'unpriced').length,
    usageUnknown: rows.filter((r) => r.costStatus === 'usage_unknown').length,
    credits: !plan ? { status: 'not_configured', value: null } : unknown ? { status: 'partial', value: Math.round(credits * 100) / 100, unknownOperations: unknown } : { status: 'measured', value: Math.round(credits * 100) / 100 },
  });
}));

// Everything below: Workspace Admin (workspace:billing), own school only.
const billing = requirePermission('workspace:billing');

router.get('/report', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const q = req.query as Record<string, unknown>;
  const { from, to } = parseRange(q);
  const groupBy = q.groupBy === 'user' || q.groupBy === 'day' ? q.groupBy : 'feature';
  const page = Math.max(1, Math.min(1000, Math.floor(Number(q.page) || 1)));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(q.pageSize) || 25)));
  res.json(await usageReport({ institutionId, from, to, groupBy, origin: parseOriginView(q.origin), page, pageSize }));
}));

// The school's ENARA price as the school sees it (no internal costs).
router.get('/plan', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = await loadPlan(requireInstitutionId(req));
  if (!plan) {
    res.json({ configured: false, message: `${NOT_ENOUGH_DATA}: ENARA has not set a price for your school yet.` });
    return;
  }
  res.json({
    configured: true,
    status: plan.status,
    currency: plan.currency,
    period: plan.period,
    basePrice: plan.basePrice,
    seatPrice: plan.seatPrice ?? null,
    seatBasis: plan.seatBasis ?? null,
    includedCredits: plan.includedCredits,
    overagePricePerCredit: plan.overagePricePerCredit ?? null,
    creditRates: [...(plan.creditRates?.entries?.() ?? [])].map(([feature, r]) => ({ feature, label: FEATURE_LABELS[feature] ?? feature, unit: r.unit, credits: r.credits })),
    maxCustomerMonthlyCredits: plan.maxCustomerMonthlyCredits ?? null,
    version: plan.version,
    updatedAt: plan.updatedAt,
  });
}));

const level = (used: number, cap?: number) => {
  if (!cap) return 'no_limit';
  const p = (used / cap) * 100;
  return p >= 100 ? 'reached' : p >= 80 ? '80_100' : p >= 50 ? '50_80' : 'below_50';
};

// Budget status from P0d: enforcement and pause, and how far through each
// window the school is, in coarse bands only (no internal amounts).
router.get('/budget', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const budget = await OrgBudget.findOne({ institutionId }).lean();
  const now = new Date().toISOString();
  const [day, month] = await Promise.all([BudgetCounter.findById(`${institutionId}:day:${now.slice(0, 10)}`).lean(), BudgetCounter.findById(`${institutionId}:month:${now.slice(0, 7)}`).lean()]);
  const plan = await loadPlan(institutionId);
  const usage = await usageReport({ institutionId, from: new Date(`${now.slice(0, 7)}-01T00:00:00Z`), to: new Date(), groupBy: 'day', origin: 'live', page: 1, pageSize: 1 });
  const today = await usageReport({ institutionId, from: new Date(`${now.slice(0, 10)}T00:00:00Z`), to: new Date(), groupBy: 'day', origin: 'live', page: 1, pageSize: 1 });
  res.json({
    policy: !budget ? 'not_configured' : budget.enforcementEnabled ? 'enforced' : 'not_enforced',
    aiPaused: Boolean(budget?.aiPaused),
    // Fractions of ENARA's internal limits, as bands; the limits themselves stay private.
    windows: budget?.enforcementEnabled
      ? { day: level((day?.committedMicros ?? 0) / 1e6, budget.dailyCapUsd), month: level((month?.committedMicros ?? 0) / 1e6, budget.monthlyCapUsd) }
      : null,
    grading: 'Automatic grading keeps its own allowance and is never held for approval.',
    customerLimits: budget?.customerLimits ?? null,
    customerLimitsEnforced: false,
    maxMonthlyCredits: plan?.maxCustomerMonthlyCredits ?? null,
    usage: { today: today.total.credits, month: usage.total.credits },
    refusalCodes: {
      AI_PAUSED: 'AI features are paused for your school.',
      AI_BUDGET_EXCEEDED: "Your school's AI allowance for now has been reached.",
      AI_BUDGET_POLICY_MISSING: 'This AI feature is not enabled for your school yet.',
      AI_BUDGET_UNAVAILABLE: 'AI usage could not be checked, so the request was not run.',
    },
  });
}));

// The school's own alert limits, in credits, within ENARA's ceiling. Alerts
// only: they never block AI or grading, and never touch ENARA's limits.
router.put('/budget/limits', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const plan = await loadPlan(institutionId);
  if (!plan || plan.maxCustomerMonthlyCredits === undefined) throw new AppError('Credit limits are available once ENARA has set your credit plan', 409, 'NO_CREDIT_PLAN');
  const ceiling = plan.maxCustomerMonthlyCredits;
  const limits: Record<string, number> = {};
  for (const k of ['dailyCredits', 'monthlyCredits', 'perUserDailyCredits'] as const) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > ceiling) throw new AppError(`${k} must be a whole number from 0 to ${ceiling}`, 400, 'VALIDATION_ERROR');
    limits[k] = v;
  }
  const current = await OrgBudget.findOne({ institutionId }).select('version').lean();
  const version = (current?.version ?? 0) + 1;
  await OrgBudget.updateOne(
    { institutionId },
    { $set: { customerLimits: limits, version, updatedBy: req.user!.id }, $push: { history: { version, at: new Date(), by: req.user!.id, changes: { customerLimits: limits } } }, $setOnInsert: { institutionId } },
    { upsert: true },
  );
  forgetAiBudgetCache(institutionId);
  logger.info('customer_credit_limits_changed', { institutionId, by: req.user!.id, version });
  res.json({ customerLimits: limits, enforced: false });
}));

// Current AI-tool spend (user-entered). Soft removal keeps the audit trail.
const CURRENCY = /^[A-Z]{3}$/;
function parseSpend(body: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  const text = (k: string, max: number, required = false) => {
    const v = body[k];
    if (v === undefined) {
      if (required && !partial) throw new AppError(`${k} is required`, 400, 'VALIDATION_ERROR');
      return;
    }
    if (typeof v !== 'string' || v.trim().length > max || (required && !v.trim())) throw new AppError(`${k} must be text up to ${max} characters`, 400, 'VALIDATION_ERROR');
    out[k] = v.trim();
  };
  text('toolName', 120, true);
  text('provider', 120);
  text('plan', 120);
  text('reference', 300);
  if (body.amount !== undefined || !partial) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0 || body.amount > 100_000_000) throw new AppError('amount must be a number from 0', 400, 'VALIDATION_ERROR');
    out.amount = Math.round(body.amount * 100) / 100;
  }
  if (body.currency !== undefined || !partial) {
    if (typeof body.currency !== 'string' || !CURRENCY.test(body.currency)) throw new AppError('currency must be a 3-letter code such as EGP or USD', 400, 'VALIDATION_ERROR');
    out.currency = body.currency;
  }
  if (body.period !== undefined || !partial) {
    if (body.period !== 'monthly' && body.period !== 'annual') throw new AppError('period must be monthly or annual', 400, 'VALIDATION_ERROR');
    out.period = body.period;
  }
  if (body.seats !== undefined) {
    if (typeof body.seats !== 'number' || !Number.isInteger(body.seats) || body.seats < 0 || body.seats > 100000) throw new AppError('seats must be a whole number', 400, 'VALIDATION_ERROR');
    out.seats = body.seats;
  }
  if (body.replacedByEnara !== undefined) {
    if (typeof body.replacedByEnara !== 'boolean') throw new AppError('replacedByEnara must be true or false', 400, 'VALIDATION_ERROR');
    out.replacedByEnara = body.replacedByEnara;
  }
  return out;
}
const spendView = (s: Record<string, any>) => ({
  id: s.id, toolName: s.toolName, provider: s.provider ?? null, plan: s.plan ?? null, seats: s.seats ?? null, amount: s.amount, currency: s.currency, period: s.period,
  replacedByEnara: s.replacedByEnara, reference: s.reference ?? null, source: 'user_entered', createdBy: s.createdBy, updatedBy: s.updatedBy, createdAt: s.createdAt, updatedAt: s.updatedAt,
});

router.get('/current-tools', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const items = await CurrentToolSpend.find({ institutionId: requireInstitutionId(req), removedAt: { $exists: false } }).sort({ createdAt: 1 }).limit(200).lean();
  res.json({ items: items.map(spendView) });
}));

router.post('/current-tools', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const data = parseSpend(body);
  if ((await CurrentToolSpend.countDocuments({ institutionId, removedAt: { $exists: false } })) >= 50) throw new AppError('Up to 50 tools can be listed', 409, 'TOO_MANY_TOOLS');
  const now = new Date();
  const item = await CurrentToolSpend.create({ id: `cts-${randomUUID()}`, institutionId, ...data, createdBy: req.user!.id, updatedBy: req.user!.id, history: [{ at: now, by: req.user!.id, action: 'created', changes: data }] });
  res.status(201).json({ item: spendView(item.toObject()) });
}));

router.put('/current-tools/:id', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const data = parseSpend(body, true);
  const item = await CurrentToolSpend.findOneAndUpdate(
    { id: String(req.params.id), institutionId, removedAt: { $exists: false } },
    { $set: { ...data, updatedBy: req.user!.id }, $push: { history: { at: new Date(), by: req.user!.id, action: 'updated', changes: data } } },
    { new: true, lean: true },
  );
  if (!item) throw new AppError('Not found', 404, 'NOT_FOUND');
  res.json({ item: spendView(item) });
}));

router.delete('/current-tools/:id', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const now = new Date();
  const r = await CurrentToolSpend.updateOne(
    { id: String(req.params.id), institutionId, removedAt: { $exists: false } },
    { $set: { removedAt: now, removedBy: req.user!.id }, $push: { history: { at: now, by: req.user!.id, action: 'removed' } } },
  );
  if (!r.matchedCount) throw new AppError('Not found', 404, 'NOT_FOUND');
  res.status(204).end();
}));

// Savings estimate against measured live usage (last 30 days).
router.get('/savings', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await savingsEstimate(requireInstitutionId(req), { kind: 'measured_30_days' }));
}));

// Scale simulator: projected credits and ENARA price for a scenario. Quantities
// are per month in each tool's credit unit (operations, minutes, ...).
router.post('/simulate', billing, asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = requireInstitutionId(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const int = (v: unknown, k: string, max: number) => {
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new AppError(`${k} must be a number from 0 to ${max}`, 400, 'VALIDATION_ERROR');
    return v;
  };
  const students = int(body.students, 'students', 100000);
  const staff = int(body.staff, 'staff', 10000);
  const raw = ensurePlainObject(body.quantities ?? {}, 'quantities');
  const quantities: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[a-z_]{2,40}$/.test(k)) throw new AppError('Unknown tool', 400, 'VALIDATION_ERROR');
    quantities[k] = int(v, `quantities.${k}`, 10_000_000)!;
  }
  if (Object.keys(quantities).length > 30) throw new AppError('Too many tools', 400, 'VALIDATION_ERROR');
  const plan = await loadPlan(institutionId);
  const missing: string[] = [];
  let credits: number | null = 0;
  const perTool = Object.entries(quantities).map(([feature, qty]) => {
    const rate = plan?.creditRates?.get(feature);
    if (!rate) {
      missing.push(`a credit rate for ${FEATURE_LABELS[feature] ?? feature}`);
      credits = null;
      return { feature, label: FEATURE_LABELS[feature] ?? feature, quantity: qty, unit: null, credits: null };
    }
    const c = rate.unit === 'thousand_characters' || rate.unit === 'thousand_tokens' ? (qty / 1000) * rate.credits : qty * rate.credits;
    if (credits !== null) credits += c;
    return { feature, label: FEATURE_LABELS[feature] ?? feature, quantity: qty, unit: rate.unit, credits: Math.round(c * 100) / 100 };
  });
  const seats = plan?.seatBasis === 'students' ? students : plan?.seatBasis === 'staff' ? staff : undefined;
  const price = enaraPrice(plan, credits, seats);
  if ('missing' in price) missing.push(...price.missing);
  const assumptions = { students: students ?? null, staff: staff ?? null, quantitiesPerMonth: quantities, includedCredits: plan?.includedCredits ?? null, overage: plan?.overagePricePerCredit === undefined ? 'not priced' : 'priced per credit', period: 'monthly' };
  const savings = await savingsEstimate(institutionId, { kind: 'scenario', credits, seats, assumptions });
  res.json({
    projection: true,
    label: 'Projection from your assumptions, not measured usage.',
    perTool,
    credits: credits === null ? null : Math.round((credits as number) * 100) / 100,
    enaraPrice: 'missing' in price ? { result: NOT_ENOUGH_DATA, missing: [...new Set(missing)] } : price,
    savings,
    assumptions,
  });
}));

export default router;
