import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { LearningEvidence } from '../models/LearningEvidence';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { Student } from '../models/Student';
import { StudentMisconception } from '../models/StudentMisconception';
import { MasteryHistory } from '../models/StudentObjectiveMastery';
import { TeachingEpisode, type EpisodeLabel, type EvidenceQuality, type EvidenceWindow, type ITeachingEpisode } from '../models/TeachingEpisode';
import { logger, serializeError } from '../utils/logging';
import { examContextFor, type ExamContext } from './assessmentEvidenceContext';

// Teaching effectiveness engine (P21): links Student -> Learning objective ->
// Teaching plan -> Assessment evidence -> Outcome, as TeachingEpisodes.
//
// Measurement rules (and what they deliberately do not claim):
// - Only independent assessment evidence counts (assessments, diagnostics,
//   retention reviews, teacher-verified); tutor chat and assisted practice never.
// - Scores are the evidence's normalised 0-1 score (points / max points), so
//   different scales compare; per-criterion evidence (C3) keeps objectives apart.
// - Baseline: evidence on the objective in the 90 days before the plan started;
//   historical exams count even though no teaching method was attributed then.
// - Post: evidence after the plan started, until the next different plan or 14
//   days; retention reviews are delayed-recall checks and never count as post.
// - Retention: evidence at least 7 days after the post window (up to 120 days).
// - Transfer: post evidence on questions the student had not seen before.
// - Comparability flags mark everything that makes before/after unlike (missing
//   baseline, too few items, the same questions again, a difficulty shift, a
//   different kind of assessment, a change in how it was graded, a long gap).
// - Labels: insufficient_evidence (no baseline or no post), observed_change
//   (comparability problems), associated_with_intervention (comparable evidence,
//   at least two items on each side). Never causal: other teaching, practice
//   outside ENARA and normal growth are not observed. A causal estimate needs a
//   comparison design (see the plan's future evaluation section); none exists.

export const IMPACT_VERSION = 'impact-v1';
const DAY = 86_400_000;
const BASELINE_DAYS = 90;
const POST_MAX_DAYS = 14;
const RETENTION_MIN_DAYS = 7;
const RETENTION_MAX_DAYS = 120;
const LONG_GAP_DAYS = 60;
export const INDEPENDENT_EVIDENCE = ['independent_assessment', 'diagnostic', 'retention_review', 'teacher_verified'];
const BLOCKING = new Set(['missing_baseline', 'no_post_evidence', 'few_items', 'repeated_items', 'difficulty_shift', 'assessment_kind_differs', 'grading_method_changed', 'long_gap']);
export const OBSERVATIONAL_NOTE =
  'Observational: teaching outside ENARA, classroom instruction, practice and normal growth are not observed, so a change cannot be attributed to the method.';

type Ev = { id: string; objectiveId: string; normalizedScore?: number | null; itemKey?: string; occurredAt: Date; sourceEventId: string; evidenceType: string };

export function windowOf(rows: Ev[], ctx: Map<string, ExamContext>): EvidenceWindow {
  const scored = rows.filter((r) => typeof r.normalizedScore === 'number');
  const difficulties = rows.map((r) => ctx.get(r.id)?.difficulty).filter((d): d is number => typeof d === 'number');
  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return {
    n: rows.length,
    score: scored.length ? Math.round((scored.reduce((s, r) => s + (r.normalizedScore as number), 0) / scored.length) * 1000) / 1000 : null,
    evidenceIds: rows.map((r) => r.id),
    items: new Set(rows.map((r) => r.itemKey ?? r.id)).size,
    from: sorted[0]?.occurredAt,
    to: sorted[sorted.length - 1]?.occurredAt,
    assessmentKinds: [...new Set(rows.map((r) => ctx.get(r.id)?.assessmentKind ?? 'unspecified'))].sort(),
    gradedBy: [...new Set(rows.map((r) => ctx.get(r.id)?.gradedBy).filter(Boolean) as string[])].sort(),
    meanDifficulty: difficulties.length === rows.length && rows.length ? Math.round((difficulties.reduce((a, b) => a + b, 0) / difficulties.length) * 10) / 10 : null,
  };
}

// Comparability of a before/after pair, as flags; then the label and quality.
export function judge(baseline: EvidenceWindow, post: EvidenceWindow, baselineItems: Set<string>, postItems: string[]) {
  const flags: string[] = [];
  if (!baseline.n) flags.push('missing_baseline');
  if (!post.n) flags.push('no_post_evidence');
  if (baseline.n && post.n) {
    if (baseline.items < 2 || post.items < 2) flags.push('few_items');
    if (postItems.some((k) => baselineItems.has(k))) flags.push('repeated_items');
    if (baseline.meanDifficulty == null || post.meanDifficulty == null) flags.push('difficulty_unknown');
    else if (Math.abs(post.meanDifficulty - baseline.meanDifficulty) > 1) flags.push('difficulty_shift');
    const bk = baseline.assessmentKinds.filter((k) => k !== 'unspecified');
    const pk = post.assessmentKinds.filter((k) => k !== 'unspecified');
    if (bk.length && pk.length && !bk.some((k) => pk.includes(k))) flags.push('assessment_kind_differs');
    if (!bk.length || !pk.length) flags.push('assessment_kind_unspecified');
    if (baseline.gradedBy.join() !== post.gradedBy.join()) flags.push('grading_method_changed');
    if (baseline.to && post.from && post.from.getTime() - baseline.to.getTime() > LONG_GAP_DAYS * DAY) flags.push('long_gap');
  }
  flags.push('outside_instruction_unknown');
  const blocking = flags.filter((f) => BLOCKING.has(f));
  const label: EpisodeLabel =
    flags.includes('missing_baseline') || flags.includes('no_post_evidence')
      ? 'insufficient_evidence'
      : blocking.length
        ? 'observed_change'
        : 'associated_with_intervention';
  const quality: EvidenceQuality =
    label === 'insufficient_evidence' ? 'none' : blocking.length ? 'weak' : baseline.items >= 3 && post.items >= 3 ? 'strong' : 'moderate';
  return { flags, label, quality };
}

const LIMITATION_TEXT: Record<string, string> = {
  missing_baseline: 'No assessed evidence on this objective before the plan.',
  no_post_evidence: 'No assessed evidence after the plan yet.',
  few_items: 'Fewer than two different questions before or after.',
  repeated_items: 'Some questions after the plan were the same as before (practice effect).',
  difficulty_shift: 'Questions before and after differ in difficulty by more than one level.',
  difficulty_unknown: 'Question difficulty not set on all items; difficulty could not be compared.',
  assessment_kind_differs: 'Different kinds of assessment before and after.',
  assessment_kind_unspecified: 'Assessment kind not recorded for some evidence.',
  grading_method_changed: 'Grading method differs before and after (answer key, AI or teacher).',
  long_gap: 'More than 60 days between the last evidence before and the first after.',
  outside_instruction_unknown: OBSERVATIONAL_NOTE,
};
export const limitationsFor = (flags: string[]) => flags.map((f) => LIMITATION_TEXT[f] ?? f);

// Recomputes all episodes of one student (deterministic ids: rerunning replaces
// the derived records; decisions and evidence are only read).
export async function recomputeStudentEpisodes(studentId: string, now = new Date()): Promise<number> {
  const decisions = await PedagogicalDecision.find({ studentId }).sort({ at: 1 }).lean();
  if (!decisions.length) return 0;
  const objectiveIds = [...new Set(decisions.map((d) => d.objectiveId))];
  const [student, evidence] = await Promise.all([
    Student.findOne({ id: studentId }).select('id batchId origin institutionId grade').lean(),
    LearningEvidence.find({ studentId, objectiveId: { $in: objectiveIds }, evidenceType: { $in: INDEPENDENT_EVIDENCE }, invalidatedAt: { $exists: false } })
      .select('id objectiveId normalizedScore itemKey occurredAt sourceEventId evidenceType')
      .lean(),
  ]);
  const ctx = await examContextFor(evidence);
  const attemptIds = [...new Set([...ctx.values()].map((c) => c.attemptId).filter(Boolean))] as string[];
  const attempts = attemptIds.length ? await AssessmentAttempt.find({ id: { $in: attemptIds } }).select('id score').lean() : [];
  const overall = new Map(attempts.map((a) => [a.id, typeof a.score === 'number' ? Math.round((a.score / 100) * 1000) / 1000 : null]));
  const misconceptionIds = [...new Set(decisions.flatMap((d) => d.misconceptionIds ?? []))];
  const categories = new Map((misconceptionIds.length ? await StudentMisconception.find({ id: { $in: misconceptionIds } }).select('id category').lean() : []).map((m) => [m.id, m.category]));
  const grade = Number(/(\d{1,2})/.exec(student?.grade ?? '')?.[1]);
  const gradeBand = Number.isFinite(grade) ? (grade <= 5 ? 'K-5' : grade <= 8 ? '6-8' : '9-12') : 'unknown';
  const history = await MasteryHistory.find({ studentId, objectiveId: { $in: objectiveIds } }).sort({ at: 1 }).select('objectiveId masteryStatus masteryEstimate at').lean();

  let written = 0;
  for (const objectiveId of objectiveIds) {
    const own = decisions.filter((d) => d.objectiveId === objectiveId);
    // Consecutive decisions with the same composition are one episode.
    const groups: (typeof own)[] = [];
    for (const d of own) {
      const last = groups[groups.length - 1]?.[0];
      const same = last && last.strategyId === d.strategyId && (last.supportingStrategyIds ?? []).join() === (d.supportingStrategyIds ?? []).join() && (last.reinforcementStrategyId ?? '') === (d.reinforcementStrategyId ?? '');
      if (same) groups[groups.length - 1].push(d);
      else groups.push([d]);
    }
    const ev = evidence.filter((e) => e.objectiveId === objectiveId);
    const hist = history.filter((h) => h.objectiveId === objectiveId);
    for (let g = 0; g < groups.length; g++) {
      const first = groups[g][0];
      const start = first.at;
      const end = groups[g + 1]?.[0].at;
      const postEnd = new Date(Math.min(end?.getTime() ?? Infinity, start.getTime() + POST_MAX_DAYS * DAY, now.getTime()));
      const before = ev.filter((e) => e.occurredAt < start && e.occurredAt.getTime() >= start.getTime() - BASELINE_DAYS * DAY);
      const after = ev.filter((e) => e.occurredAt > start && e.occurredAt <= postEnd && e.evidenceType !== 'retention_review');
      const baseline = windowOf(before, ctx);
      const post = windowOf(after, ctx);
      const retentionFrom = new Date((post.to ?? start).getTime() + RETENTION_MIN_DAYS * DAY);
      const later = ev.filter((e) => e.occurredAt >= retentionFrom && e.occurredAt.getTime() <= retentionFrom.getTime() + (RETENTION_MAX_DAYS - RETENTION_MIN_DAYS) * DAY);
      const retention = windowOf(later, ctx);
      const seen = new Set(ev.filter((e) => e.occurredAt < start).map((e) => e.itemKey).filter(Boolean) as string[]);
      const transfer = windowOf(after.filter((e) => e.itemKey && !seen.has(e.itemKey)), ctx);
      const { flags, label, quality } = judge(baseline, post, new Set(before.map((e) => e.itemKey).filter(Boolean) as string[]), after.map((e) => e.itemKey).filter(Boolean) as string[]);
      const byAttempt = new Map<string, Ev[]>();
      for (const e of after) {
        const a = ctx.get(e.id)?.attemptId;
        if (a) byAttempt.set(a, [...(byAttempt.get(a) ?? []), e]);
      }
      const exams = [...byAttempt.entries()].map(([attemptId, rows]) => ({
        attemptId,
        assessmentId: ctx.get(rows[0].id)?.assessmentId,
        assessmentKind: ctx.get(rows[0].id)?.assessmentKind ?? 'unspecified',
        overallScore: overall.get(attemptId) ?? null,
        objectiveScore: windowOf(rows, ctx).score,
        at: rows[0].occurredAt,
      }));
      const afterHist = [...hist].reverse().find((h) => h.at <= (end ?? now));
      const beforeHist = [...hist].reverse().find((h) => h.at <= start);
      const doc: Partial<ITeachingEpisode> = {
        id: `ep-${first.id}`,
        institutionId: first.institutionId ?? student?.institutionId,
        studentId,
        batchId: student?.batchId,
        origin: student?.origin === 'demo_seed' ? 'demo_seed' : 'live',
        objectiveId,
        subject: [...before, ...after].map((e) => ctx.get(e.id)?.subject).find(Boolean),
        gradeBand,
        misconceptionCategories: [...new Set(groups[g].flatMap((d) => (d.misconceptionIds ?? []).map((id) => categories.get(id)).filter(Boolean) as string[]))],
        decisionIds: groups[g].map((d) => d.id),
        primary: first.strategyId,
        supporting: first.supportingStrategyIds ?? [],
        reinforcement: first.reinforcementStrategyId,
        primaryVersion: first.strategyVersion,
        registryVersion: first.registryVersion,
        decisionVersion: first.decisionVersion,
        channel: first.channel,
        interventionId: first.interventionId,
        startAt: start,
        endAt: end,
        baseline,
        post,
        retention: { ...retention, delayDays: retention.from && post.to ? Math.round((retention.from.getTime() - post.to.getTime()) / DAY) : null },
        transfer,
        exams,
        mastery: {
          statusBefore: first.masteryStatusAtDecision ?? beforeHist?.masteryStatus,
          estimateBefore: first.masteryAtDecision ?? beforeHist?.masteryEstimate ?? null,
          statusAfter: afterHist && afterHist.at > start ? afterHist.masteryStatus : undefined,
          estimateAfter: afterHist && afterHist.at > start ? afterHist.masteryEstimate : null,
        },
        observedChange: baseline.score != null && post.score != null ? Math.round((post.score - baseline.score) * 1000) / 1000 : null,
        retentionChange: baseline.score != null && retention.score != null ? Math.round((retention.score - baseline.score) * 1000) / 1000 : null,
        comparability: flags,
        evidenceQuality: quality,
        label,
        limitations: limitationsFor(flags),
        computeVersion: IMPACT_VERSION,
        computedAt: now,
      };
      await TeachingEpisode.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
      written++;
    }
  }
  return written;
}

// After new evidence: keep a student's episodes current. Never throws.
export async function recomputeStudentEpisodesSafely(studentId: string) {
  try {
    return await recomputeStudentEpisodes(studentId);
  } catch (error) {
    logger.warn('teaching_episodes_failed', { studentId, error: serializeError(error) });
    return 0;
  }
}

// Objective-level trend from assessment history alone, with no teaching method
// attributed (historical exams, or students without tutor episodes): earliest vs
// latest half of the independent evidence. Always observational.
export async function objectiveEvidenceTrend(studentId: string, objectiveId: string) {
  const ev = await LearningEvidence.find({ studentId, objectiveId, evidenceType: { $in: INDEPENDENT_EVIDENCE }, invalidatedAt: { $exists: false } })
    .sort({ occurredAt: 1 })
    .select('id objectiveId normalizedScore itemKey occurredAt sourceEventId evidenceType')
    .lean();
  const ctx = await examContextFor(ev);
  if (ev.length < 4) {
    return { n: ev.length, first: windowOf(ev, ctx), last: null, change: null, label: 'insufficient_evidence' as const, comparability: ['few_items'], limitations: limitationsFor(['few_items', 'outside_instruction_unknown']) };
  }
  const half = Math.floor(ev.length / 2);
  const firstRows = ev.slice(0, half);
  const lastRows = ev.slice(half);
  const first = windowOf(firstRows, ctx);
  const last = windowOf(lastRows, ctx);
  const { flags } = judge(first, last, new Set(firstRows.map((e) => e.itemKey).filter(Boolean) as string[]), lastRows.map((e) => e.itemKey).filter(Boolean) as string[]);
  return {
    n: ev.length,
    first,
    last,
    change: first.score != null && last.score != null ? Math.round((last.score - first.score) * 1000) / 1000 : null,
    label: 'observed_change' as const, // no intervention attributed: never "associated"
    comparability: flags,
    limitations: limitationsFor(flags),
  };
}
