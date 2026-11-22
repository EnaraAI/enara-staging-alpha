// The assessment engine's grading entry (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3): every grade comes from here.
//   - closed items: code (graders/closed), gradeClosed;
//   - open engine items (short answer, essay, maths steps): the domain graders, two runs, flags (open.ts), gradeOpenAnswer;
//   - the older open questions (open-response, short-answer meaning check) keep their audited eval-v2 graders, now reached through
//     this module (legacyOpen), unchanged: same prompts, checks, consistency runs and GradingProposal records.
export { gradeClosed, InvalidItemError } from './graders/closed';
export { gradeOpenAnswer, combineRuns, nearPassMark, CONFIDENCE_FLAG, FLAG_REASONS, type OpenGrade, type FlagReason } from './open';
export { ERROR_CODES, PROMPT_VERSION } from './graders/domains';
export { evaluateRubricAnswer as legacyRubricAnswer, evaluateShortAnswer as legacyShortAnswer } from '../../services/gradingProposals';
