import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { AiControl, BudgetCounter, OrgBudget } from '../models/OrgBudget';
import { enforcementProblems, forgetAiBudgetCache, UNKNOWN_PRICED_TOOLS } from '../services/aiBudget';
import { logger } from '../utils/logging';
import { CommercialPlan, CREDIT_UNITS } from '../models/CommercialPlan';

// ENARA-admin controls for AI spend (P0d): per-school budgets and pause, and
// the global pause. Internal amounts; never exposed to school roles.
const router = Router();
router.use(authMiddleware, requireRole('enara-admin'));

const EDITABLE = ['enforcementEnabled', 'aiPaused', 'dailyCapUsd', 'monthlyCapUsd', 'perUserDailyCapUsd', 'gradingAllowanceUsd', 'maxReservationUsdPerCall', 'intendedTools'] as const;
const TOOL = /^[a-z_]+:[a-z_]+$/;

function parseChanges(body: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (!(EDITABLE as readonly string[]).includes(key)) throw new AppError(`Unknown field ${key}`, 400, 'VALIDATION_ERROR');
  }
  for (const key of ['enforcementEnabled', 'aiPaused'] as const) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') throw new AppError(`${key} must be true or false`, 400, 'VALIDATION_ERROR');
      changes[key] = body[key];
    }
  }
  for (const key of ['dailyCapUsd', 'monthlyCapUsd', 'perUserDailyCapUsd', 'gradingAllowanceUsd'] as const) {
    if (key in body) {
      const v = body[key];
      if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new AppError(`${key} must be a non-negative number or null`, 400, 'VALIDATION_ERROR');
      changes[key] = v ?? undefined;
    }
  }
  if ('maxReservationUsdPerCall' in body) {
    const raw = body.maxReservationUsdPerCall;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('maxReservationUsdPerCall must be an object', 400, 'VALIDATION_ERROR');
    for (const [k, v] of Object.entries(raw)) {
      if (!TOOL.test(k) || !(typeof v === 'number' && Number.isFinite(v) && v > 0)) throw new AppError(`Invalid reservation ceiling for ${k}`, 400, 'VALIDATION_ERROR');
    }
    changes.maxReservationUsdPerCall = raw;
  }
  if ('intendedTools' in body) {
    const tools = body.intendedTools;
    if (!Array.isArray(tools) || !tools.every((t) => typeof t === 'string' && TOOL.test(t))) throw new AppError('intendedTools must be a list of provider:feature', 400, 'VALIDATION_ERROR');
    changes.intendedTools = tools;
  }
  return changes;
}

async function requireInstitution(id: string) {
  if (!(await Institution.exists({ id }))) throw new AppError('Institution not found', 404, 'NOT_FOUND');
}

router.get('/budgets/:institutionId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  const budget = await OrgBudget.findOne({ institutionId }).lean();
  res.json({ budget, unknownPricedTools: UNKNOWN_PRICED_TOOLS });
}));

router.put('/budgets/:institutionId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const changes = parseChanges(body);
  const current = (await OrgBudget.findOne({ institutionId }).lean()) as Record<string, unknown> | null;
  const next = { ...(current ?? {}), ...changes } as Parameters<typeof enforcementProblems>[0] & { enforcementEnabled?: boolean };
  if (next.enforcementEnabled) {
    const problems = enforcementProblems(next);
    if (problems.length) throw new AppError(`Budget enforcement needs: ${problems.join('; ')}`, 400, 'BUDGET_CONFIG_INCOMPLETE');
  }
  const version = ((current?.version as number | undefined) ?? 0) + 1;
  const unset = Object.fromEntries(Object.entries(changes).filter(([, v]) => v === undefined).map(([k]) => [k, 1]));
  const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
  const budget = await OrgBudget.findOneAndUpdate(
    { institutionId },
    {
      $set: { ...set, version, updatedBy: req.user!.id },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: { history: { version, at: new Date(), by: req.user!.id, changes } },
      $setOnInsert: { institutionId },
    },
    { upsert: true, new: true, lean: true },
  );
  forgetAiBudgetCache(institutionId);
  logger.info('ai_budget_config_changed', { institutionId, version, by: req.user!.id, fields: Object.keys(changes) });
  res.json({ budget });
}));

router.put('/budgets/:institutionId/pause', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  const paused = (req.body as { paused?: unknown })?.paused;
  if (typeof paused !== 'boolean') throw new AppError('paused must be true or false', 400, 'VALIDATION_ERROR');
  const current = await OrgBudget.findOne({ institutionId }).select('version').lean();
  const version = (current?.version ?? 0) + 1;
  await OrgBudget.updateOne(
    { institutionId },
    { $set: { aiPaused: paused, version, updatedBy: req.user!.id }, $push: { history: { version, at: new Date(), by: req.user!.id, changes: { aiPaused: paused } } }, $setOnInsert: { institutionId } },
    { upsert: true },
  );
  forgetAiBudgetCache(institutionId);
  logger.warn('ai_paused_changed', { scope: 'institution', institutionId, paused, by: req.user!.id });
  res.json({ institutionId, aiPaused: paused });
}));

router.put('/pause', asyncHandler(async (req: AuthRequest, res: Response) => {
  const paused = (req.body as { paused?: unknown })?.paused;
  if (typeof paused !== 'boolean') throw new AppError('paused must be true or false', 400, 'VALIDATION_ERROR');
  const current = await AiControl.findById('global').select('version').lean();
  const version = (current?.version ?? 0) + 1;
  await AiControl.updateOne(
    { _id: 'global' },
    { $set: { aiPaused: paused, version, updatedBy: req.user!.id, updatedAt: new Date() }, $push: { history: { version, at: new Date(), by: req.user!.id, changes: { aiPaused: paused } } } },
    { upsert: true },
  );
  forgetAiBudgetCache();
  logger.warn('ai_paused_changed', { scope: 'global', paused, by: req.user!.id });
  res.json({ aiPaused: paused });
}));

// Consumption of the current windows as fractions of each cap.
router.get('/budgets/:institutionId/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  const counters = await BudgetCounter.find({ institutionId }).sort({ _id: 1 }).lean();
  res.json({ counters });
}));

// P5: the school's ENARA commercial price and credit rates (customer-facing).
// Entered by ENARA admins only; never derived from provider costs.
router.get('/commercial/:institutionId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  res.json({ plan: await CommercialPlan.findOne({ institutionId }).lean() });
}));

router.put('/commercial/:institutionId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = String(req.params.institutionId);
  await requireInstitution(institutionId);
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const num = (k: string, required = false) => {
    const v = b[k];
    if (v === undefined || v === null) {
      if (required) throw new AppError(`${k} is required`, 400, 'VALIDATION_ERROR');
      return undefined;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9) throw new AppError(`${k} must be a non-negative number`, 400, 'VALIDATION_ERROR');
    return v;
  };
  if (b.status !== 'proposed' && b.status !== 'contracted') throw new AppError('status must be proposed or contracted', 400, 'VALIDATION_ERROR');
  if (typeof b.currency !== 'string' || !/^[A-Z]{3}$/.test(b.currency)) throw new AppError('currency must be a 3-letter code', 400, 'VALIDATION_ERROR');
  if (b.seatBasis !== undefined && b.seatBasis !== 'staff' && b.seatBasis !== 'students') throw new AppError('seatBasis must be staff or students', 400, 'VALIDATION_ERROR');
  const rates = (b.creditRates ?? {}) as Record<string, { unit?: unknown; credits?: unknown }>;
  if (typeof rates !== 'object' || Array.isArray(rates) || Object.keys(rates).length > 40) throw new AppError('creditRates must be an object', 400, 'VALIDATION_ERROR');
  for (const [k, r] of Object.entries(rates)) {
    if (!/^[a-z_]{2,40}$/.test(k) || !CREDIT_UNITS.includes(r?.unit as never) || typeof r?.credits !== 'number' || !(r.credits >= 0)) throw new AppError(`Invalid credit rate for ${k}`, 400, 'VALIDATION_ERROR');
  }
  const plan = {
    status: b.status, currency: b.currency, period: 'monthly', basePrice: num('basePrice', true), seatPrice: num('seatPrice'), seatBasis: b.seatBasis,
    includedCredits: num('includedCredits', true), overagePricePerCredit: num('overagePricePerCredit'), creditRates: rates, maxCustomerMonthlyCredits: num('maxCustomerMonthlyCredits'),
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : undefined,
  };
  const current = await CommercialPlan.findOne({ institutionId }).select('version').lean();
  const version = (current?.version ?? 0) + 1;
  const saved = await CommercialPlan.findOneAndUpdate(
    { institutionId },
    { $set: { ...Object.fromEntries(Object.entries(plan).filter(([, v]) => v !== undefined)), version, updatedBy: req.user!.id }, $push: { history: { version, at: new Date(), by: req.user!.id, changes: plan } }, $setOnInsert: { institutionId } },
    { upsert: true, new: true, lean: true },
  );
  logger.info('commercial_plan_changed', { institutionId, version, by: req.user!.id });
  res.json({ plan: saved });
}));

export default router;
