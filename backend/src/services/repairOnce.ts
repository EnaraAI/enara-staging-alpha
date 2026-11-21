// repairOnce (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item H, ARCHITECTURE.md §6 "repair only when a concrete validator fails, with a hard
// bound"): a reply that must carry the hidden grading line (English lessons, and every subject with gradeAllSubjects) but came back without a
// trusted leading line is regenerated ONCE with the reason. If the second draft still has no trusted line (or the call fails), the first
// draft is kept, as today. One extra call at most per turn; only on the non-streamed path (a streamed reply is already on screen). The
// answer-leak check (exampleGuard) keeps its own single regeneration; this never runs after it.
import { engineV2 } from './engineV2';
import type { StrippedReply } from './languageLearningState';

export const repairOnceOn = (): boolean => engineV2('repairOnce');
export const MISSING_MARKER_NOTE = 'YOUR LAST DRAFT WAS REJECTED: it did not start with the hidden grading line. Write the reply again and start it with exactly one line [[assess verdict=... relevance=... next=...]] as instructed, then the visible reply. Change nothing else.';
/** The reply carries a trusted (leading) grading line. */
export const hasTrustedMarker = (m: StrippedReply | undefined): boolean => Boolean(m?.assessment);
/** Whether to make the one repair call. */
export function needsRepair(p: { gradedTurn: boolean; marker: StrippedReply | undefined; alreadyRegenerated: boolean; text: string }): boolean {
  return repairOnceOn() && p.gradedTurn && !p.alreadyRegenerated && Boolean(p.text) && !hasTrustedMarker(p.marker);
}
