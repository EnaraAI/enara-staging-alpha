// Assessment engine P4 item bank service (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §4, §6.4). A school sees its own items and the shared
// ones. Items are immutable: an edit makes a new version (checks again; judged again when a model is available). A teacher approves, edits
// or rejects (with a reason code); every decision is a ReviewDecision. Only approved items become questions ("Add to assessment" goes
// through the normal assessment update, so the existing publish checks apply).
import { randomUUID } from 'crypto';
import { BankItem, type IBankItem } from '../../models/BankItem';
import { ReviewDecision, REVIEW_REASON_CODES } from '../../models/ReviewDecision';
import { AppError } from '../../middleware/errorHandler';
import { checkGenerated, questionOf, type GenItem } from './checks';
import { judgeItem } from './judge';

const genOf = (b: Pick<IBankItem, 'type' | 'subject' | 'language' | 'stem' | 'options' | 'answer_key' | 'difficulty' | 'objective_code' | 'flags' | 'level'> & { passage?: string | null }): GenItem => ({
  type: b.type, domain: ['short_answer', 'essay', 'math_steps'].includes(b.type) ? b.subject : undefined, subject: b.subject, language: b.language === 'ar' ? 'ar' : 'en',
  stem: b.stem, options: b.options ?? undefined, answer_key: b.answer_key, difficulty: b.difficulty, objective_code: b.objective_code,
  level: b.level, flags: Object.fromEntries(Object.entries(b.flags ?? {}).filter(([k]) => k !== 'kids')), ...(b.passage ? { source: b.passage } : {}),
});

async function latest(id: string, schoolId: string | null) {
  const item = await BankItem.findOne({ id, $or: [{ school_id: schoolId }, { school_id: null }] }).sort({ version: -1 }).lean();
  if (!item) throw new AppError('Item not found', 404, 'NOT_FOUND');
  return item;
}

export async function listBank(p: { schoolId: string | null; status?: string; subject?: string; language?: string; limit?: number }) {
  const rows = await BankItem.aggregate([
    { $match: { $or: [{ school_id: p.schoolId }, { school_id: null }], ...(p.subject ? { subject: p.subject } : {}), ...(p.language ? { language: p.language } : {}) } },
    { $sort: { version: -1 } },
    { $group: { _id: '$id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    ...(p.status ? [{ $match: { review_status: p.status } }] : []),
    { $sort: { created_at: -1 } },
    { $limit: Math.min(200, p.limit ?? 50) },
    { $project: { _id: 0, __v: 0 } },
  ]);
  return rows;
}

/** A teacher's own item (source 'teacher'): checked by code, judged when a model is available, then waits for review. */
export async function createTeacherItem(p: { item: Omit<GenItem, 'language'> & { language: string; subject: string; level: string }; teacherId: string; schoolId: string | null; judge: boolean }) {
  const gen: GenItem = { ...p.item, subject: p.item.subject, language: p.item.language === 'ar' ? 'ar' : 'en', domain: ['short_answer', 'essay', 'math_steps'].includes(p.item.type) ? p.item.subject : undefined };
  const problems = checkGenerated(gen);
  if (problems.length) throw new AppError(`The item was refused: ${problems.join('; ')}`, 400, 'ITEM_REFUSED');
  const report = p.judge ? await judgeItem(gen, {}).catch(() => null) : null;
  const id = `bi-${randomUUID()}`;
  await BankItem.create({
    id, version: 1, subject: p.item.subject, language: gen.language, curriculum: 'custom', level: p.item.level, objective_code: gen.objective_code,
    type: gen.type, difficulty: gen.difficulty, stem: gen.stem, options: gen.options ?? null, answer_key: gen.answer_key, flags: gen.flags ?? {},
    source: 'teacher', review_status: report ? 'judged' : 'draft', judge_report: report, created_by: p.teacherId, school_id: p.schoolId, passage: gen.source ?? null,
  });
  return latest(id, p.schoolId);
}

export async function reviewItem(p: { id: string; decision: string; reasonCode?: string; edits?: Partial<Pick<GenItem, 'stem' | 'options' | 'answer_key' | 'difficulty'>>; teacherId: string; schoolId: string | null; judge: boolean }) {
  if (!['approve', 'edit', 'reject'].includes(p.decision)) throw new AppError('decision must be approve, edit or reject', 400, 'VALIDATION_ERROR');
  if (p.decision === 'reject' && !(REVIEW_REASON_CODES as readonly string[]).includes(String(p.reasonCode))) throw new AppError(`reasonCode must be one of ${REVIEW_REASON_CODES.join(', ')}`, 400, 'VALIDATION_ERROR');
  const item = await latest(p.id, p.schoolId);
  if (item.school_id === null && p.decision !== 'approve') throw new AppError('Shared items cannot be changed by a school', 403, 'FORBIDDEN');
  let version = item.version;
  if (p.decision === 'edit') {
    const edited = { ...genOf(item as never), ...Object.fromEntries(Object.entries(p.edits ?? {}).filter(([k]) => ['stem', 'options', 'answer_key', 'difficulty'].includes(k))) } as GenItem;
    const problems = checkGenerated(edited);
    if (problems.length) throw new AppError(`The edit was refused: ${problems.join('; ')}`, 400, 'ITEM_REFUSED');
    const report = p.judge ? await judgeItem(edited, {}).catch(() => null) : null;
    version = item.version + 1;
    const { _id, ...rest } = item as unknown as Record<string, unknown>;
    void _id;
    await BankItem.create({ ...rest, version, stem: edited.stem, options: edited.options ?? null, answer_key: edited.answer_key, difficulty: edited.difficulty, review_status: report ? 'judged' : 'draft', judge_report: report, created_by: p.teacherId, created_at: new Date() });
  } else {
    await BankItem.updateOne({ id: p.id, version: item.version }, { $set: { review_status: p.decision === 'approve' ? 'approved' : 'rejected' } });
  }
  await ReviewDecision.create({ item_id: p.id, item_version: version, teacher_id: p.teacherId, school_id: p.schoolId, decision: p.decision, ...(p.reasonCode ? { reason_code: p.reasonCode } : {}) });
  return latest(p.id, p.schoolId);
}

/** An approved item as an assessment question (keeps itemId + itemVersion). */
export async function questionFor(id: string, schoolId: string | null) {
  const item = await latest(id, schoolId);
  if (item.review_status !== 'approved') throw new AppError('Only approved items can be added to an assessment', 409, 'ITEM_NOT_APPROVED');
  return { ...questionOf(genOf(item as never), `bank-${item.id.slice(3, 11)}-v${item.version}`), itemId: item.id, itemVersion: item.version };
}

/** P5: the Item bank card (school view): items by subject, language and status; the judge's pass rate; review reasons; the share of
 * engine-graded answers flagged for the teacher (last 30 days); the last bench run on this deployment. */
export async function bankStats(schoolId: string | null) {
  const latestRows = await BankItem.aggregate([
    { $match: { $or: [{ school_id: schoolId }, { school_id: null }] } },
    { $sort: { version: -1 } }, { $group: { _id: '$id', doc: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$doc' } },
    { $project: { subject: 1, language: 1, review_status: 1, source: 1, pass: '$judge_report.pass' } },
  ]);
  const count = (key: 'subject' | 'language' | 'review_status') => latestRows.reduce((m: Record<string, number>, r: Record<string, string>) => { m[r[key]] = (m[r[key]] ?? 0) + 1; return m; }, {});
  const judged = latestRows.filter((r: { pass?: boolean }) => typeof r.pass === 'boolean');
  const reasons = await ReviewDecision.aggregate([{ $match: { school_id: schoolId, decision: 'reject' } }, { $group: { _id: '$reason_code', n: { $sum: 1 } } }]);
  const { AssessmentAttempt } = await import('../../models/AssessmentAttempt');
  const since = new Date(Date.now() - 30 * 86_400_000);
  const flags = schoolId ? await AssessmentAttempt.aggregate([
    { $match: { institutionId: schoolId, submittedAt: { $gte: since } } },
    { $unwind: '$answers' },
    { $match: { 'answers.grader': { $exists: true, $ne: null } } },
    { $group: { _id: null, n: { $sum: 1 }, flagged: { $sum: { $cond: ['$answers.flagged', 1, 0] } }, byModel: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$answers.grader', ''] }, regex: '^model:' } }, 1, 0] } } } },
  ]) : [];
  const { AssessmentBenchRun } = await import('../../models/AssessmentBenchResult');
  const bench = await AssessmentBenchRun.findOne({ finishedAt: { $ne: null } }).sort({ finishedAt: -1 }).lean();
  const f = flags[0] as { n: number; flagged: number; byModel: number } | undefined;
  return {
    items: { total: latestRows.length, bySubject: count('subject'), byLanguage: count('language'), byStatus: count('review_status') },
    judgePassRate: judged.length ? Math.round((judged.filter((r: { pass?: boolean }) => r.pass).length / judged.length) * 1000) / 1000 : null,
    rejectReasons: Object.fromEntries(reasons.map((r: { _id: string; n: number }) => [r._id, r.n])),
    grading30d: f ? { answers: f.n, byModel: f.byModel, flagRate: f.n ? Math.round((f.flagged / f.n) * 1000) / 1000 : 0 } : { answers: 0, byModel: 0, flagRate: 0 },
    lastBench: bench ? { runId: bench.runId, finishedAt: bench.finishedAt, failures: bench.failures ?? [], sets: ((bench.summary ?? []) as { set: string; within1: number; flagRate: number; latencyP50: number; latencyP95: number; n: number }[]).map((s) => ({ set: s.set, within1: s.within1, flagRate: s.flagRate, p50: s.latencyP50, p95: s.latencyP95, n: s.n })) } : null,
  };
}
