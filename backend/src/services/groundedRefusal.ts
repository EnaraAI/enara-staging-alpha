// groundedRefusal (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item D, from ARCHITECTURE.md §5 "every answer includes citations and an
// out-of-scope flag"): in a subject course with uploaded materials, when a learner's question finds no fitting passage (after ragRewrite),
// the tutor says plainly that the course materials do not cover it, may then give a short answer clearly labelled as general knowledge,
// and suggests asking the teacher. The turn is flagged outOfScope so teachers can see what their materials miss. English-lesson turns
// (taught from the lesson spec) and answers to a practice item are never flagged. Named-only switch, off by default.
import { engineV2 } from './engineV2';
import { CurriculumChunk } from '../models/CurriculumChunk';
import { retrievalScope } from './curriculumRetrieval';

export const groundedRefusalOn = (): boolean => engineV2('groundedRefusal');

const QUESTION = /[?؟]\s*$|^\s*(what|why|how|when|where|who|which|whose|explain|define|describe|tell me|is|are|does|do|can|could)\b|^\s*(ما|ماذا|لماذا|ليه|ازاي|إزاي|كيف|متى|امتى|أين|فين|مين|من هو|من هي|اشرح|عرف|عرّف|وضح|هل)/i;
/** A learner question (not an answer, greeting or command to continue). */
export const isQuestion = (text: string): boolean => text.trim().length >= 6 && QUESTION.test(text.trim());

export const OUT_OF_SCOPE_LINE = 'NOT IN THE COURSE MATERIALS: the school\'s materials for this course do not cover this question. Start with one short sentence that says so (for example "This isn\'t in your course materials."). Then you may give a short answer from general knowledge, clearly labelled as general knowledge, and suggest checking with the teacher. Do not cite any source.';

/** Whether this course has any searchable passages in the learner's scope (so "nothing found" means "not covered"). */
export async function courseHasMaterials(p: { institutionId?: string; curriculumId?: string }): Promise<boolean> {
  const scope = await retrievalScope(p);
  if (!scope) return false;
  return (await CurriculumChunk.countDocuments(scope).limit(1)) > 0;
}

/** Decide the flag: switch on, a subject (non-language) turn, a question, no passage found, and the course has materials. */
export async function outOfScopeTurn(p: { language: boolean; answeringPractice: boolean; text: string; sourcesFound: number; institutionId?: string; curriculumId?: string }, has = courseHasMaterials): Promise<boolean> {
  if (!groundedRefusalOn() || p.language || p.answeringPractice || p.sourcesFound > 0 || !isQuestion(p.text)) return false;
  return has({ institutionId: p.institutionId, curriculumId: p.curriculumId });
}
