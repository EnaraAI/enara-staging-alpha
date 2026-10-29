import { AppError } from '../middleware/errorHandler';
import { UsageLedger } from '../models/UsageLedger';
import { CommercialPlan, CurrentToolSpend, type ICommercialPlan } from '../models/CommercialPlan';
import { originFilter, type OriginView } from './analyticsService';

// Customer-facing usage (P5). Built only from the append-only usage ledger,
// filtered by the caller's institution on the server before any grouping.
// Never returns ENARA's internal provider cost (costInternal) or prices.
// Customer credits come only from the school's ENARA commercial plan; without
// a plan or a credit rate for a tool, credits are "not configured", never 0.
// Unpriced and usage-unknown rows are counted and flagged, never free.
// Savings and projections are estimates and say "Not enough data" whenever an
// input is missing or incomparable; no prices or exchange rates are invented.

export const NOT_ENOUGH_DATA = 'Not enough data';
export const MAX_RANGE_DAYS = 92;
export const MAX_GROUPS = 200;
const DAY = 86_400_000;

export const FEATURE_LABELS: Record<string, string> = {
  educator_chat: 'AI Chat', educator_analytics_intent: 'AI Chat (question routing)', ai_assessment_draft: 'Assessment drafts', ai_question_regenerate: 'Question regeneration', ai_lesson_plan: 'Lesson plans',
  ai_lesson_plan_section: 'Lesson plan sections', ai_grading: 'Grading', chat: 'AI Tutor', voice: 'AI Tutor (voice)', visualize: 'AI Tutor visuals', staff_assistant: 'Staff assistant', assessment: 'Assessments', avatar_visual: 'Avatar visuals', curriculum_ingestion: 'Curriculum ingestion', speaking_exam_stt: 'Speaking exam (speech to text)',
  speaking_exam_tts: 'Speaking exam (examiner voice)', conversation_exam: 'Exam examiner', stt: 'Avatar speech to text', tts: 'Avatar voice', avatar_session: 'Avatar session',
};

export function parseRange(q: Record<string, unknown>, now = new Date()) {
  const to = q.to ? new Date(String(q.to)) : now;
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 30 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new AppError('from/to must be dates, from before to', 400, 'VALIDATION_ERROR');
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) throw new AppError(`The range can be at most ${MAX_RANGE_DAYS} days`, 400, 'VALIDATION_ERROR');
  return { from, to };
}

type Row = { feature: string; status: string; costStatus: string; units?: Record<string, number | undefined>; userId?: string; createdAt: Date; origin?: string };

// Credits for one ledger row under a plan: a number, or null when it cannot
// be known (no plan, no rate for the tool, or the needed units are missing).
// Only successful operations use credits.
export function creditsForRow(row: Row, plan: Pick<ICommercialPlan, 'creditRates'> | null): number | null | 0 {
  if (row.status !== 'ok') return 0;
  const rate = plan?.creditRates?.get?.(row.feature) ?? (plan?.creditRates as unknown as Record<string, { unit: string; credits: number }> | undefined)?.[row.feature];
  if (!rate) return null;
  const u = row.units ?? {};
  switch (rate.unit) {
    case 'operation':
      return rate.credits;
    case 'minute': {
      const s = u.audioSeconds ?? u.avatarSeconds;
      return s === undefined ? null : (s / 60) * rate.credits;
    }
    case 'thousand_characters':
      return u.characters === undefined ? null : (u.characters / 1000) * rate.credits;
    case 'thousand_tokens': {
      if (u.inputTokens === undefined && u.outputTokens === undefined) return null;
      return (((u.inputTokens ?? 0) + (u.outputTokens ?? 0)) / 1000) * rate.credits;
    }
    default:
      return null;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

function emptyGroup() {
  return { operations: 0, succeeded: 0, failed: 0, refused: 0, cancelled: 0, unpriced: 0, usageUnknown: 0, credits: 0, creditsUnknownOps: 0, units: { inputTokens: 0, outputTokens: 0, characters: 0, audioSeconds: 0, avatarSeconds: 0 } };
}
type Group = ReturnType<typeof emptyGroup>;

function add(g: Group, r: Row, plan: ICommercialPlan | null) {
  g.operations++;
  if (r.status === 'ok') g.succeeded++;
  else if (r.status === 'error') g.failed++;
  else if (r.status === 'refusal') g.refused++;
  else if (r.status === 'cancelled') g.cancelled++;
  if (r.costStatus === 'unpriced') g.unpriced++;
  if (r.costStatus === 'usage_unknown') g.usageUnknown++;
  for (const k of Object.keys(g.units) as (keyof Group['units'])[]) g.units[k] += Number(r.units?.[k] ?? 0);
  const c = creditsForRow(r, plan);
  if (c === null) g.creditsUnknownOps++;
  else g.credits += c;
}

function present(g: Group, planned: boolean) {
  return {
    operations: g.operations, succeeded: g.succeeded, failed: g.failed, refused: g.refused, cancelled: g.cancelled,
    unpriced: g.unpriced, usageUnknown: g.usageUnknown,
    units: { inputTokens: g.units.inputTokens, outputTokens: g.units.outputTokens, characters: g.units.characters, audioMinutes: round(g.units.audioSeconds / 60), avatarMinutes: round(g.units.avatarSeconds / 60) },
    // Never a number that hides unknowns: partial credits say so.
    credits: !planned ? { status: 'not_configured' as const, value: null } : g.creditsUnknownOps ? { status: 'partial' as const, value: round(g.credits), unknownOperations: g.creditsUnknownOps } : { status: 'measured' as const, value: round(g.credits) },
  };
}

export async function loadPlan(institutionId: string) {
  return CommercialPlan.findOne({ institutionId }) as Promise<ICommercialPlan | null>;
}

// A school's usage, grouped by feature, user or day. Bounded.
export async function usageReport(params: { institutionId: string; from: Date; to: Date; groupBy: 'feature' | 'user' | 'day'; origin: OriginView; page: number; pageSize: number }) {
  const plan = await loadPlan(params.institutionId);
  const rows = (await UsageLedger.find({ institutionId: params.institutionId, createdAt: { $gte: params.from, $lte: params.to }, ...originFilter(params.origin) })
    .select('feature status costStatus units userId createdAt origin')
    .limit(100_000)
    .lean()) as unknown as Row[];
  const total = emptyGroup();
  const groups = new Map<string, Group>();
  for (const r of rows) {
    add(total, r, plan);
    const key = params.groupBy === 'feature' ? r.feature : params.groupBy === 'user' ? r.userId ?? 'system' : new Date(r.createdAt).toISOString().slice(0, 10);
    const g = groups.get(key) ?? emptyGroup();
    add(g, r, plan);
    groups.set(key, g);
  }
  const keys = [...groups.keys()].sort((a, b) => (params.groupBy === 'day' ? a.localeCompare(b) : groups.get(b)!.operations - groups.get(a)!.operations || a.localeCompare(b)));
  const start = (params.page - 1) * params.pageSize;
  const coverage =
    total.unpriced || total.usageUnknown || total.creditsUnknownOps
      ? { status: 'incomplete' as const, note: `${total.unpriced} unpriced and ${total.usageUnknown} usage-unknown operations; ${total.creditsUnknownOps} operations without a known credit amount. Totals are lower bounds.` }
      : rows.length ? { status: 'complete' as const } : { status: 'no_data' as const };
  return {
    range: { from: params.from, to: params.to },
    origin: params.origin,
    originNote: params.origin === 'all' ? 'All origins (live and demo) combined.' : undefined,
    groupBy: params.groupBy,
    plan: plan ? { configured: true, status: plan.status, includedCredits: plan.includedCredits } : { configured: false },
    coverage,
    truncated: rows.length >= 100_000,
    total: present(total, Boolean(plan)),
    groups: {
      total: keys.length,
      page: params.page,
      pageSize: params.pageSize,
      items: keys.slice(start, start + params.pageSize).map((k) => ({ key: k, label: params.groupBy === 'feature' ? FEATURE_LABELS[k] ?? k : k, ...present(groups.get(k)!, Boolean(plan)) })),
    },
  };
}

// Usage of one request (a chat answer, a draft, a speaking turn), for the
// caller's own operations only.
export async function requestUsage(params: { institutionId?: string; userId: string; requestId: string }) {
  const rows = (await UsageLedger.find({ requestId: params.requestId, userId: params.userId, ...(params.institutionId ? { institutionId: params.institutionId } : {}) })
    .select('feature status costStatus units userId createdAt')
    .limit(50)
    .lean()) as unknown as Row[];
  if (!rows.length) return { state: 'none' as const };
  const plan = params.institutionId ? await loadPlan(params.institutionId) : null;
  const g = emptyGroup();
  for (const r of rows) add(g, r, plan);
  return { state: 'measured' as const, features: [...new Set(rows.map((r) => FEATURE_LABELS[r.feature] ?? r.feature))], ...present(g, Boolean(plan)) };
}

// Monthly ENARA price for a credit total under the plan, or why not.
export function enaraPrice(plan: ICommercialPlan | null, credits: number | null, seats?: number): { value: number; currency: string } | { missing: string[] } {
  const missing: string[] = [];
  if (!plan) return { missing: ['an ENARA commercial price for this school'] };
  if (credits === null) missing.push('credit amounts for every tool in the usage basis');
  if (plan.seatPrice !== undefined && seats === undefined) missing.push(`the number of ${plan.seatBasis ?? 'seats'}`);
  if (credits !== null && credits > plan.includedCredits && plan.overagePricePerCredit === undefined) missing.push('a price for credits above the included amount');
  if (missing.length) return { missing };
  const over = Math.max(0, credits! - plan.includedCredits) * (plan.overagePricePerCredit ?? 0);
  return { value: round(plan.basePrice + (plan.seatPrice ?? 0) * (seats ?? 0) + over), currency: plan.currency };
}

// The school's current AI-tool spend as a monthly equivalent, or why not.
export async function currentMonthlySpend(institutionId: string, currency: string | null) {
  const items = await CurrentToolSpend.find({ institutionId, removedAt: { $exists: false }, replacedByEnara: true }).lean();
  if (!items.length) return { missing: ['the school\'s current AI-tool spend'], items };
  const currencies = [...new Set(items.map((i) => i.currency))];
  if (currencies.length > 1 || (currency && currencies[0] !== currency)) {
    return { missing: [`one currency for all amounts (found ${[...new Set([...currencies, ...(currency ? [currency] : [])])].join(', ')}); no verified exchange rate is used`], items };
  }
  const value = round(items.reduce((s, i) => s + (i.period === 'annual' ? i.amount / 12 : i.amount), 0));
  return { value, currency: currencies[0], items, annualConverted: items.some((i) => i.period === 'annual') };
}

// Measured live credits over the last 30 days, as the usage basis.
export async function measuredMonthlyCredits(institutionId: string, plan: ICommercialPlan | null, now = new Date()) {
  const rows = (await UsageLedger.find({ institutionId, createdAt: { $gte: new Date(now.getTime() - 30 * DAY), $lte: now }, ...originFilter('live') }).select('feature status costStatus units').limit(100_000).lean()) as unknown as Row[];
  if (!rows.length) return { credits: null, missingTools: [] as string[], operations: 0 };
  let credits = 0;
  const missingTools = new Set<string>();
  for (const r of rows) {
    const c = creditsForRow(r, plan);
    if (c === null) missingTools.add(r.feature);
    else credits += c;
  }
  return { credits: missingTools.size ? null : round(credits), missingTools: [...missingTools], operations: rows.length };
}

export async function savingsEstimate(institutionId: string, basis: { kind: 'measured_30_days' } | { kind: 'scenario'; credits: number | null; seats?: number; assumptions: Record<string, unknown> }) {
  const plan = await loadPlan(institutionId);
  const spend = await currentMonthlySpend(institutionId, plan?.currency ?? null);
  const usage = basis.kind === 'measured_30_days' ? await measuredMonthlyCredits(institutionId, plan) : { credits: basis.credits, missingTools: [] as string[], operations: null };
  const missing: string[] = [];
  const spendMissing = (spend as { missing?: string[] }).missing;
  if (spendMissing) missing.push(...spendMissing);
  if (basis.kind === 'measured_30_days' && usage.operations === 0) missing.push('measured live usage in the last 30 days');
  if (usage.missingTools.length) missing.push(`credit rates for: ${usage.missingTools.map((f) => FEATURE_LABELS[f] ?? f).join(', ')}`);
  const price = enaraPrice(plan, usage.credits, basis.kind === 'scenario' ? basis.seats : undefined);
  if ('missing' in price) missing.push(...price.missing.filter((m) => !missing.includes(m)));
  const assumptions = {
    period: 'monthly',
    usageBasis: basis.kind === 'measured_30_days' ? 'Measured live usage over the last 30 days (demo data excluded)' : 'Scenario entered in the simulator',
    ...(basis.kind === 'scenario' ? basis.assumptions : {}),
    currentSpend: 'Entered by the school (tools marked as replaced by ENARA); annual amounts divided by 12',
    enaraPrice: plan ? `ENARA ${plan.status} price, version ${plan.version}` : 'none',
    exchangeRates: 'none used',
  };
  if (missing.length || spendMissing || 'missing' in price || !('value' in spend)) {
    return { result: NOT_ENOUGH_DATA, missing: [...new Set(missing)], assumptions, label: 'estimate' };
  }
  return {
    result: 'estimate',
    label: 'Estimate: not validated against actual invoices or final commercial terms.',
    currency: price.currency,
    currentMonthlySpend: (spend as { value: number }).value,
    enaraMonthlyPrice: price.value,
    usageCredits: usage.credits,
    grossMonthlySavings: round((spend as { value: number }).value - price.value),
    assumptions,
    sources: { currentSpend: 'user_entered', enaraPrice: 'enara_commercial_plan', usage: basis.kind === 'measured_30_days' ? 'measured' : 'scenario' },
  };
}
