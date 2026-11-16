// Change H (switch `strandLog`): which of Nation's four strands each language turn serves, and the split reported per learner and per course.
// Tags and counts only. No learner text is read, stored or returned.
//   input            meaning-focused input (the tutor supplies graded text or a model to understand)
//   output           meaning-focused output (the learner writes or says something of their own)
//   language_focused deliberate study of form: explanation, hints, correction, exercises, checks
//   fluency          getting faster with known language (no move produces this yet; it stays at 0 until change G exists)
import type { MoveId } from './languageTeachingContext';
import { engineV2 } from './engineV2';

export const STRANDS = ['input', 'output', 'language_focused', 'fluency'] as const;
export type Strand = (typeof STRANDS)[number];

// Exactly one strand per move. Record<MoveId, Strand> makes the compiler refuse a new MoveId that is not listed here; strandLog.test.ts also checks it at run time.
// Conventions (judgement calls, stated so they can be disputed): setup and management moves (clarify_goal, redirect_to_lesson, l1_support, restate_task) count as
// language_focused because the turn is about the lesson, not about meaning-focused use; comprehensible_model counts as input because the tutor supplies graded sentences to understand.
export const STRAND_BY_MOVE: Record<MoveId, Strand> = {
  clarify_goal: 'language_focused',
  general_practice: 'language_focused',
  activate_prior_knowledge: 'language_focused',
  comprehensible_model: 'input',
  short_explanation: 'language_focused',
  comprehension_check: 'language_focused',
  corrective_feedback_retry: 'language_focused',
  scaffold_hint: 'language_focused',
  restate_task: 'language_focused',
  distinct_example: 'language_focused',
  redirect_to_lesson: 'language_focused',
  reteach_simpler: 'language_focused',
  l1_support: 'language_focused',
  answer_with_reasoning: 'language_focused',
  fade_support: 'language_focused',
  independent_practice: 'output',
  present_lesson_item: 'language_focused',
};

/** The practice stage of the target form (rule, guided, unguided, free, return). Empty until change D exists: nothing sets it. */
export type PracticeStage = 'rule' | 'guided' | 'unguided' | 'free' | 'return';

/** A turn's strand = the strand of its first selected move (the main purpose of the reply; later moves are style or support rules). No moves: untagged. */
export function strandOfMoves(moves: { id: MoveId }[]): Strand | undefined {
  const first = moves[0]?.id;
  return first ? STRAND_BY_MOVE[first] : undefined;
}

/** Tags for the turn evidence. Empty object when the switch is off, so nothing is stored. */
export function strandTags(moves: { id: MoveId }[]): { strand?: Strand; stage?: PracticeStage } {
  if (!engineV2('strandLog')) return {};
  const strand = strandOfMoves(moves);
  return strand ? { strand } : {};
}

export interface StrandSplit {
  turns: number;          // tagged turns counted
  untagged: number;       // turns with no strand tag (older messages, or the switch was off)
  counts: Record<Strand, number>;
  shares: Record<Strand, number>; // 0 to 1 over tagged turns; all 0 when there are none
}

/** Counts only. Input: any list of stored turn records (only `strand` is read). */
export function strandSplit(turns: { strand?: string | null }[]): StrandSplit {
  const counts = Object.fromEntries(STRANDS.map((s) => [s, 0])) as Record<Strand, number>;
  let untagged = 0;
  for (const t of turns) { if (t.strand && (STRANDS as readonly string[]).includes(t.strand)) counts[t.strand as Strand] += 1; else untagged += 1; }
  const n = STRANDS.reduce((a, s) => a + counts[s], 0);
  const shares = Object.fromEntries(STRANDS.map((s) => [s, n ? counts[s] / n : 0])) as Record<Strand, number>;
  return { turns: n, untagged, counts, shares };
}

/** The split for one learner and/or one course (at least one of studentId, courseId). Reads only the strand tag of tutor replies. */
export async function loadStrandSplit(opts: { institutionId: string; studentId?: string; courseId?: string }): Promise<StrandSplit> {
  if (!opts.studentId && !opts.courseId) throw new Error('strand split needs a studentId or a courseId');
  const { TutorMessage } = await import('../models/TutorMessage');
  const query: Record<string, unknown> = { institutionId: opts.institutionId, role: 'ai' };
  if (opts.studentId) query.studentId = opts.studentId;
  if (opts.courseId) {
    const { TutorSession } = await import('../models/TutorSession');
    const sessions = await TutorSession.find({ institutionId: opts.institutionId, courseId: opts.courseId, ...(opts.studentId ? { studentId: opts.studentId } : {}) }).select({ id: 1, _id: 0 }).lean();
    query.sessionId = { $in: sessions.map((x) => x.id) };
  }
  query['meta.languageTurn'] = { $exists: true };
  const rows = await TutorMessage.find(query).select({ 'meta.languageTurn.strand': 1, _id: 0 }).lean();
  return strandSplit(rows.map((r) => ({ strand: (r as { meta?: { languageTurn?: { strand?: string } } }).meta?.languageTurn?.strand })));
}
