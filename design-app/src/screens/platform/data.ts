// Platform admin (enara-admin): data helpers for the wired platform screens.
// Endpoints (all exist on lms-test today; nothing new is built here):
//   GET /api/integrations/institutions        every school, its status and LMS (enara-admin only)
//   GET /api/credits                          students per school (first 1,000), AI credits by day and feature (last 30 days)
//   GET /api/analytics/ai-usage?days=&institutionId=   AI calls, errors, latency and estimated USD cost (cost:internal)
//   GET /api/ai-controls/budgets/:institutionId        ENARA's internal monthly USD cap and pause per school
//   GET /ready                                public: which providers are configured, database reachable
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, get } from '@/lib/api';
import { num, type Lang } from '@/lib/preview';

type Any = any;

export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean; at?: Date }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ data, loading: false, at: new Date() }); },
      (error) => { if (!ctl.signal.aborted) setState((s) => ({ ...s, error, loading: false })); },
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const numOr = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------- Schools ----------
export interface School { id: string; name: string; status: 'active' | 'suspended' | string; lms: string; contact: string; apiKeys: number; createdAt: string | null }
export async function fetchSchools(signal?: AbortSignal): Promise<School[]> {
  const r: Any = await get('/api/integrations/institutions', signal);
  const rows: Any[] = Array.isArray(r?.data) ? r.data : [];
  return rows.filter((x) => x && x.id != null).map((x) => ({
    id: str(x.id), name: str(x.name) || str(x.id), status: str(x.status) || 'active', lms: str(x.lmsSystem),
    contact: str(x.contactName) || str(x.contactEmail), apiKeys: numOr(x.activeApiKeys), createdAt: x.createdAt ? str(x.createdAt) : null,
  }));
}

/** Learners per school from the credits report (it lists at most 1,000 students: `truncated` says so). */
export interface CreditsSummary { learnersBySchool: Map<string, number>; learners: number; truncated: boolean; byDay: { date: string; credits: number; events: number }[]; byFeature: { feature: string; credits: number; events: number }[]; periodDays: number }
export async function fetchCredits(signal?: AbortSignal): Promise<CreditsSummary> {
  const r: Any = await get('/api/credits', signal);
  const students: Any[] = Array.isArray(r?.students) ? r.students : [];
  const by = new Map<string, number>();
  for (const s of students) { const id = str(s?.institutionId); if (id) by.set(id, (by.get(id) ?? 0) + 1); }
  return {
    learnersBySchool: by,
    learners: numOr(r?.summary?.studentCount, students.length),
    truncated: r?.summary?.truncated === true,
    byDay: (Array.isArray(r?.usageByDay) ? r.usageByDay : []).map((d: Any) => ({ date: str(d?.date), credits: numOr(d?.credits), events: numOr(d?.events) })).filter((d: { date: string }) => d.date),
    byFeature: (Array.isArray(r?.usageByFeature) ? r.usageByFeature : []).map((f: Any) => ({ feature: str(f?.feature), credits: numOr(f?.credits), events: numOr(f?.events) })),
    periodDays: numOr(r?.periodDays, 30),
  };
}

// ---------- AI usage (calls, latency, estimated cost) ----------
export interface AiUsageRow { feature: string; model: string; calls: number; errors: number; refusals: number; costUsd: number | null; unpricedCalls: number; avgLatencyMs: number; avgFirstTokenMs: number | null }
export interface AiUsage { days: number; calls: number; errors: number; costUsd: number | null; unpricedCalls: number; rows: AiUsageRow[] }
export async function fetchAiUsage(days: number, institutionId?: string, signal?: AbortSignal): Promise<AiUsage> {
  const q = new URLSearchParams({ days: String(Math.max(1, Math.min(180, Math.round(days)))) });
  if (institutionId) q.set('institutionId', institutionId);
  const r: Any = await get(`/api/analytics/ai-usage?${q}`, signal);
  const rows: AiUsageRow[] = (Array.isArray(r?.byFeature) ? r.byFeature : []).map((g: Any) => ({
    feature: str(g?.feature), model: str(g?.model), calls: numOr(g?.calls), errors: numOr(g?.errors), refusals: numOr(g?.refusals),
    costUsd: typeof g?.costUsd === 'number' ? g.costUsd : null, unpricedCalls: numOr(g?.unpricedCalls),
    avgLatencyMs: numOr(g?.avgLatencyMs), avgFirstTokenMs: typeof g?.avgFirstTokenMs === 'number' ? g.avgFirstTokenMs : null,
  }));
  return {
    days: numOr(r?.days, days), calls: numOr(r?.totals?.calls), errors: numOr(r?.totals?.errors),
    costUsd: typeof r?.totals?.costUsd === 'number' ? r.totals.costUsd : null, unpricedCalls: numOr(r?.totals?.unpricedCalls), rows,
  };
}

export interface Budget { monthlyCapUsd: number | null; dailyCapUsd: number | null; enforced: boolean; paused: boolean; configured: boolean }
export async function fetchBudget(institutionId: string, signal?: AbortSignal): Promise<Budget> {
  const r: Any = await get(`/api/ai-controls/budgets/${encodeURIComponent(institutionId)}`, signal);
  const b = r?.budget;
  return {
    configured: !!b, enforced: b?.enforcementEnabled === true, paused: b?.aiPaused === true,
    monthlyCapUsd: typeof b?.monthlyCapUsd === 'number' ? b.monthlyCapUsd : null, dailyCapUsd: typeof b?.dailyCapUsd === 'number' ? b.dailyCapUsd : null,
  };
}

/** Runs tasks a few at a time (the API allows 300 requests a minute per user). */
export async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// ---------- Readiness (public) ----------
export interface Ready { status: 'ready' | 'not_ready' | string; checks: Record<string, string>; required: string[]; httpStatus: number }
/** GET /ready answers 503 with the same body when a required dependency is down, so the body is read whatever the status. */
export async function fetchReady(signal?: AbortSignal): Promise<Ready> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ready`, { headers: { Accept: 'application/json' }, signal, credentials: 'omit' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw Object.assign(new Error('offline'), { code: 'NETWORK', status: 0 });
  }
  let body: Any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!body || typeof body !== 'object' || typeof body.checks !== 'object') throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status >= 500 ? res.status : 500 });
  const checks: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.checks ?? {})) if (typeof v === 'string') checks[k] = v;
  return { status: str(body.status), checks, required: Array.isArray(body.required) ? body.required.map(str) : [], httpStatus: res.status };
}

// ---------- Formatting ----------
/** US dollars with Latin digits; in Arabic the amount is isolated (LRI...PDI) so "$" stays in front of the number. */
export const usd = (n: number, lang: Lang, digits = 0) => {
  const v = `$${num(n, lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return lang === 'ar' ? `⁦${v}⁩` : v;
};
export const dateShort = (iso: string | null | undefined, lang: Lang) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' });
};
export const timeShort = (d: Date | undefined, lang: Lang) => (d ? d.toLocaleTimeString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '');
export const ms = (v: number, lang: Lang) =>
  lang === 'ar'
    ? `${num(v / 1000, lang, { maximumFractionDigits: v >= 1000 ? 1 : 2 })} ث`
    : v >= 1000 ? `${num(v / 1000, lang, { maximumFractionDigits: 1 })} s` : `${num(Math.round(v), lang)} ms`;

// Feature names as the usage report labels them (backend services/usageReport.ts FEATURE_LABELS), in both languages.
const FEATURES: Record<string, [string, string]> = {
  educator_chat: ['AI Chat', 'المحادثة الذكية'], educator_analytics_intent: ['AI Chat (question routing)', 'المحادثة الذكية (توجيه الأسئلة)'],
  ai_assessment_draft: ['Assessment drafts', 'مسودات التقييم'], ai_question_regenerate: ['Question regeneration', 'إعادة توليد الأسئلة'],
  ai_lesson_plan: ['Lesson plans', 'خطط الدروس'], ai_lesson_plan_section: ['Lesson plan sections', 'أقسام خطط الدروس'], ai_grading: ['Grading', 'التصحيح'],
  chat: ['AI Tutor', 'المعلّم الذكي'], voice: ['AI Tutor (voice)', 'المعلّم الذكي (صوت)'], visualize: ['AI Tutor visuals', 'رسوم المعلّم الذكي'],
  staff_assistant: ['Staff assistant', 'مساعد الموظفين'], assessment: ['Assessments', 'التقييمات'], avatar_visual: ['Avatar visuals', 'رسوم الصورة الرمزية'],
  tutor_visual: ['Tutor visuals', 'رسوم المعلّم'], curriculum_ingestion: ['Curriculum ingestion', 'استيعاب المنهج'],
  speaking_exam_stt: ['Speaking exam (speech to text)', 'اختبار التحدث (تحويل الكلام إلى نص)'], speaking_exam_tts: ['Speaking exam (examiner voice)', 'اختبار التحدث (صوت الممتحن)'],
  conversation_exam: ['Exam examiner', 'ممتحن الاختبار'], stt: ['Avatar speech to text', 'تحويل كلام الصورة الرمزية إلى نص'], tts: ['Avatar voice', 'صوت الصورة الرمزية'],
  avatar_session: ['Avatar session', 'جلسة الصورة الرمزية'],
};
export function featureLabel(f: string, lang: Lang) {
  const k = FEATURES[f];
  if (k) return lang === 'ar' ? k[1] : k[0];
  const s = f.replace(/[_:]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '—';
}
