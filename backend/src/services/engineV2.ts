// Language-engine v2 switches. Default OFF everywhere. ENARA_ENGINE_V2="wrongAnswer,belief,memory,cache" (or "all") turns features on.
// These are production-capable (not research-only): they exist so each change can be compared against the current engine and enabled per environment once it has earned it.
//  wrongAnswer - teach the rule after a recorded wrong attempt (the key can only confirm success, so the old wrong-answer path never ran)
//  belief      - the tutor names the learner's mistaken idea in its hidden marker; repeated ideas trigger hold-the-line + scope-rule teaching
//  memory      - beliefs, what worked and due reviews persist across sessions; an opening review check; due-review endpoint
//  cache       - stable instructions first with a cache breakpoint, volatile state last (same content, cheaper input)
//  keyMatch    - the answer key treats contractions as their full forms (doesn't = does not); named-only, NOT part of "all"
//  closing     - production version of the closing recap: from the learner's 5th message (or when every success criterion has been shown) recap the rule, ask for it in their own words, and the engine appends that ask if the model left it out; named-only, NOT part of "all"
//  selfCheck   - an independent check on the tutor's own CORRECT grade for closed items: if the learner's answer contains none of the item's target forms, the grade is held back (no credit) instead of trusted; named-only, NOT part of "all"
//  clarity     - when the learner is stuck or asks why, explain plainly: the rule first in one everyday sentence, then a right/wrong contrast example with other words, then ask them to apply it; named-only, NOT part of "all"
//  hints       - when the tutor's last two replies were the same kind of hint question, change the form (state the rule + contrast, then ask them to try again); named-only, NOT part of "all"
//  ruleFirst   - first exposure to a rule (once per rule per session), inside whichever teaching method is selected: the rule in one plain sentence (<=20 words), one right and one wrong example, then apply it to a new item; never the answer; named-only, NOT part of "all"
//  shortRecap  - replaces the closing "tell me the rule in your own words" ask with: the rule in one line, then one new example from the learner; once per session; named-only, NOT part of "all"
//  socraticOff - RESEARCH ONLY, ignored when NODE_ENV=production: removes the two "no rule before the first try" instructions of the language engine (exercise presentation, hint level 1) and nothing else; answer-hiding stays
//  strandLog   - tag every language turn with its Nation strand (input, output, language_focused, fluency) so the split can be reported per learner and per course; tags and counts only, never learner text; named-only, NOT part of "all"
//  levelExplicit - level-based explicitness: learners who are A1-A2, or whose record for the objective is not_assessed/emerging, get the rule stated plainly BEFORE their first try (once per rule per session), a hint ladder whose level 1 states the rule in general terms and level 2 shows a right/wrong pair, and below B1 the open-ended methods (Socratic, inquiry, problem, case, project, Bloom's) are not the primary method; everyone else is unchanged. Always runs with arbitration (turned on automatically, recorded in the turn evidence); named-only, NOT part of "all"
//  liveError     - ESL5 (framework §3 explicit correction tied to this learner, §9 library of expected Arabic L1 errors): two more error types, article_omitted ("I saw apple") and copula_omitted ("She teacher"), detected conservatively in the learner's own message; when the latest message shows one, the rule line, the right/wrong contrast and the next item target THAT error type instead of the lesson's next sub-rule; the learner record keeps the error types seen (codes and counts only, never text); named-only, NOT part of "all"
//  releaseAfterTwo - ESL5 (framework §3, §4): after two GENUINE failed attempts on the same item (empty replies, "I don't know" and copies of the prompt do not count) the tutor states the answer with a one-line reason and a right/wrong pair, then gives a NEW item on the same point; never before two; answerReleased is recorded in the turn evidence; named-only, NOT part of "all"
//  reviewOpen    - ESL5 (framework §7 spaced retrieval as recall attempts): a later session (learner record from an earlier session, no learner message yet in this one) opens with 1-2 recall items on error types still live in the record, attempted from memory with no re-explanation; the routine "tell me the rule in your own words" closing becomes one new item in a new context on a live error type (still once, still one task); named-only, NOT part of "all"
//  fadeKnown     - ESL5 (framework §2 explicit for novices, fade for experts): when the record shows >=2 independent correct answers on a point, the full rule line and worked example for it are skipped: a quick check, then harder/mixed items; a failed quick check returns to explicit support; named-only, NOT part of "all"
//  ownSentence   - ESL5 (framework §5 focus on form in their own sentences, §6 pushed output): from the learner's 3rd message of the session on (second half of the 5-message session the closing assumes), at most one "write one sentence about ... using ..." task per session, with feedback on the target form only; named-only, NOT part of "all"
//  esl5          - bundle: turns on liveError, releaseAfterTwo, reviewOpen, fadeKnown and ownSentence together; itself NOT part of "all"
//  graderV2    - SIMULATION ONLY / DRAFT: the five answer-key fixes (services/graderV2.ts): normalised matching, several accepted answers, option letter = text, target-form scorer 0/1/2, meaning-check guard; affects lessons, assignments, assessments, diagnostics and placement; named-only, NOT part of "all"
//  ruleBank     - TRACK 2 (teaching quality): the rule line, its right/wrong pair and the worked example come from the checked rule bank (services/ruleBank.ts, one entry per
//                 outcome), the criterion is chosen to match the outcome (never "criterion 1"), vocabulary outcomes get the vocabulary template (meaning from a clue,
//                 spelling, use in a frame), and a post-check flags a right/wrong pair that does not differ; named-only, NOT part of "all"
//  exampleGuard - TRACK 2: no modelled sentence may complete any item the learner will solve (unsolved lesson items + the objective's assessment items, kept
//                 server-side) or score as a correct answer to an open item; a hit gets one regeneration with the reason (chat JSON path), otherwise the
//                 sentence is removed; the worked example uses the contrasting answer / a different scene; named-only, NOT part of "all"
//  feedbackLadder - TRACK 2 (M3): corrective feedback is a named, logged ladder: elicitation, then a metalinguistic clue, and a recast/explicit correction only
//                 after two failed prompts (the answer release moves from the 2nd to the 3rd genuine failed attempt); named-only, NOT part of "all"
//  methodSelect - TRACK 2 (M2, M4, M5, M7): plan selection: an A1-A2 novice with no diagnosed error gets direct instruction; a later-session opening on live
//                 errors is retrieval + spacing (agrees with reviewOpen); a form right twice in a session adds interleaving with its confusable form; under 13
//                 a narrative or game frame is added as support (never replacing focus on form); named-only, NOT part of "all"
//  kidsBand     - TRACK 2 (§5): when no age band is set, a staff-entered birth date (under 13 child, 13-17 teen, 18+ adult) or the Enara Kids interface sets the
//                 tutor's band; band rules for sentence length, instructions per message, tone (praise effort or strategy, never ability); named-only, NOT part of "all"
//  teach2       - bundle: ruleBank, exampleGuard, feedbackLadder, methodSelect and kidsBand; itself NOT part of "all"
//  kidsPack     - Enara Kids pack (kidsPack.ts): shorter child replies, Pre-A1 Starters outcomes and words, listen-and-do lesson content per
//                 stage for the LAD shape; needs planner2 for the shape; named-only, NOT part of "all"
//  planner2     - the lesson planner as a rule table (lessonPlanner.ts): lesson shape first (S1-S6), then the main method from the ped-v2 rule
//                 table, skipping methods with no stage in the shape or outside the approved age/level gates; named-only, NOT part of "all"
//  workOn       - learner memory phase 1 (errorsToWorkOn.ts): errors from released assessments open the next tutor session (gated: closed and released only);
//                 teachers see the list; named-only, NOT part of "all"
//  sessionMemory  - learner memory phase 2 (learnerMemory.ts): session summaries, the "last session" opening line, no lesson item repeated across
//                 sessions on the same lesson, the per-turn learner brief; named-only, NOT part of "all"
//  learnerProfile - learner memory phase 3: first language, interests, accommodations (fixed codes; only their effect reaches the model) and the
//                 nightly study-habits rollup (a learner back after 7+ days gets a short review first); named-only, NOT part of "all"
//  moodleQuiz     - errors to work on from Moodle's own quizzes (integrations/lms/core/moodleQuiz.ts; needs workOn; per school: a read-only token and its own switch)
//  workOnTrusted  - LIT_REVIEW_GAP_PLAN 3.4: only grades from validated paths (choice items, teacher-set scores, gap items under graderV2) create errors to work on
//  oneTaskMethod  - LIT_REVIEW_GAP_PLAN 3.5: every teaching method asks for one thing per reply (no 'deeper question' next to a task)
//  spacedReview   - LIT_REVIEW_GAP_PLAN 3.1: errors to work on come back after 1, 3, 7, 21 days; one closes only after an unassisted right answer 2+ days after the last wrong; one more check 21 days after closing
//  ruleOnWrong    - LIT_REVIEW_GAP_PLAN 3.2: after a wrong first try on a new item, the reply states the rule again in one line before the retry
//  switchMove     - LIT_REVIEW_GAP_PLAN 3.3: the same error code twice in a session changes the main method (contrast -> smaller steps -> worked example)
//  spellingPattern- LIT_REVIEW_GAP_PLAN 3.6: a spelling error gets the right spelling split to show the pattern on another word (never the misspelling)
//  l1Lexical      - LIT_REVIEW_GAP_PLAN 3.7: known Arabic-transfer word swaps ("my woman" for "my wife") are named with the right English word, in English only
//  avatarSpeaking - NEXT_PLAN item 5: live avatar speaking practice line + one pronunciation tip from the last scored sentence (adults only;
//                 audio never stored; needs the Azure Speech key, the pronunciation flag and its price); latency kept per call; named-only
//  kidsAudioVisual - NEXT_PLAN item 1: under 9, the tutor may name 2-4 picture choices (pics= in the hidden line); the kids app shows them
//                 as tap-able pictures (ENARA's own set) that are read aloud; speaking stays off (legal review); named-only
//  realChat       - NEXT_PLAN item 3: after 3 tutor replies, two replies are a short real conversation (children: fixed safe topics; others:
//                 their interests), errors recast inside the talk, then back to the lesson; named-only
//  mixedReview    - NEXT_PLAN item 2: with spacedReview, review items (reviewFirst opening, the review brief, the reviewOpen closing item) mix
//                 the reviewed point with another known point, so the learner must choose the rule (interleaving); named-only
//  adaptiveSpacing - NEXT_PLAN item 4: with spacedReview, an easy right (unassisted, first try) skips one review step; a right after a hint
//                 keeps the step (it never closes an error; before, a hinted right on a listed error counted as wrong); named-only
//  childRule      - NEXT_PLAN step 0 (owner go 21 Nov 2026): under 9 (childShort), the first-time rule and the rule-on-wrong lines take a child
//                 form that fits 3 short sentences + task: rule <= 10 words, one right example <= 8 words, no wrong example; named-only
//  reviewFirst    - REVIEW_FIRST_PLAN (owner go 21 Nov 2026): with spacedReview rows due, the first one or two replies of a session are review items
//                 only (no rule line, no lesson exercise, no last-session "Start here"); the lesson and its first-time rule come after; named-only
//  childShort     - owner decision 2: under 9 at most 3 sentences of at most 12 words plus one task (code trim); 9-12 the kids-pack length table
//  whatWorks      - learner memory phase 4: per-learner view of methods followed by an independent success (teachers only; the planner does not use it)
//  arbitration - one order of authority between the teaching-plan layer (23 methods: HOW to explain) and the language engine (WHAT may be revealed and when); named-only, NOT part of "all"
// avatarSentences: the live avatar speaks a language-lesson reply sentence by sentence as the lesson guards keep it (guardedStream.ts); named-only, NOT part of "all"
// rulesFirst: open engine answers are checked by code rules first; the model scores only what they leave open (docs/tutor/RULES_FIRST_GRADING_PLAN.md); named-only, NOT part of "all"
// mishkatSplit: written language answers (not spoken): Mishkat, a trained scorer on its own service (MISHKAT_ENDPOINT / MISHKAT_TOKEN), scores
//   grammar, spelling/punctuation and (essays) vocabulary in parallel with v3b and replaces v3b's score there; boundary cases keep v3b, a
//   2-level disagreement goes to the teacher, unavailable = v3b alone (docs/tutor/MISHKAT_SPLIT_PLAN.md); named-only, NOT part of "all"
// anamNoRecording: the live tutor asks Anam to keep no recording and no transcript of the call (sessionOptions.dataRetention; ENARA keeps its own text transcript); named-only, NOT part of "all"
// liveMute: live avatar call: a microphone off/on and a tutor voice off/on button (the browser learns it from POST /api/avatar/session features.mute); named-only, NOT part of "all"
// dsGradeFirst, dsAnswerCheck, dsExamples, dsReplyChecks, dsTuning, dsFast, dsWarmup: DeepSeek stand-in only (services/deepseekTutor.ts); named-only, NOT part of "all"
export type EngineV2Feature = 'wrongAnswer' | 'belief' | 'memory' | 'cache' | 'arbitration' | 'keyMatch' | 'closing' | 'selfCheck' | 'clarity' | 'hints' | 'ruleFirst' | 'shortRecap' | 'socraticOff' | 'strandLog' | 'levelExplicit' | 'liveError' | 'releaseAfterTwo' | 'reviewOpen' | 'fadeKnown' | 'ownSentence' | 'graderV2' | 'ruleBank' | 'exampleGuard' | 'feedbackLadder' | 'methodSelect' | 'kidsBand' | 'planner2' | 'kidsPack' | 'workOn' | 'sessionMemory' | 'learnerProfile' | 'whatWorks' | 'moodleQuiz' | 'workOnTrusted' | 'oneTaskMethod' | 'spacedReview' | 'ruleOnWrong' | 'switchMove' | 'spellingPattern' | 'l1Lexical' | 'childShort' | 'reviewFirst' | 'childRule' | 'adaptiveSpacing' | 'mixedReview' | 'realChat' | 'kidsAudioVisual' | 'avatarSpeaking' | 'kidsSpeaking' | 'modelFallback' | 'gradeAllSubjects' | 'ragRewrite' | 'ragReuse' | 'groundedRefusal' | 'topicMemory' | 'methodFromEvidence' | 'repairOnce' | 'injectionCheck' | 'dsGradeFirst' | 'dsAnswerCheck' | 'dsExamples' | 'dsReplyChecks' | 'dsTuning' | 'dsFast' | 'dsWarmup' | 'avatarSentences' | 'assessTypesV1' | 'assessGrading' | 'assessGen' | 'assessSubjects' | 'assessMedia' | 'assessCode' | 'rulesFirst' | 'mishkatSplit' | 'anamNoRecording' | 'liveMute';
const ESL5: EngineV2Feature[] = ['liveError', 'releaseAfterTwo', 'reviewOpen', 'fadeKnown', 'ownSentence'];
export const TEACH2: EngineV2Feature[] = ['ruleBank', 'exampleGuard', 'feedbackLadder', 'methodSelect', 'kidsBand'];
export const engineV2 = (feature: EngineV2Feature): boolean => {
  if (feature === 'socraticOff' && process.env.NODE_ENV === 'production') return false; // research-only
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  if (feature === 'arbitration' && v.includes('levelExplicit')) return true; // levelExplicit always runs with arbitration
  if (v.includes('esl5') && ESL5.includes(feature)) return true; // the esl5 bundle (never turned on by "all")
  if (v.includes('teach2') && TEACH2.includes(feature)) return true; // the track-2 bundle (never turned on by "all")
  return v.includes(feature) || (v.includes('all') && !['arbitration', 'keyMatch', 'closing', 'selfCheck', 'clarity', 'hints', 'ruleFirst', 'shortRecap', 'socraticOff', 'strandLog', 'levelExplicit', 'graderV2', 'planner2', 'kidsPack', 'workOn', 'sessionMemory', 'learnerProfile', 'whatWorks', 'moodleQuiz', 'workOnTrusted', 'oneTaskMethod', 'spacedReview', 'ruleOnWrong', 'switchMove', 'spellingPattern', 'l1Lexical', 'childShort', 'reviewFirst', 'childRule', 'adaptiveSpacing', 'mixedReview', 'realChat', 'kidsAudioVisual', 'avatarSpeaking', 'kidsSpeaking', 'modelFallback', 'gradeAllSubjects', 'ragRewrite', 'ragReuse', 'groundedRefusal', 'topicMemory', 'methodFromEvidence', 'repairOnce', 'injectionCheck', 'dsGradeFirst', 'dsAnswerCheck', 'dsExamples', 'dsReplyChecks', 'dsTuning', 'dsFast', 'dsWarmup', 'avatarSentences', 'assessTypesV1', 'assessGrading', 'assessGen', 'assessSubjects', 'assessMedia', 'assessCode', 'rulesFirst', 'mishkatSplit', 'anamNoRecording', 'liveMute', ...ESL5, ...TEACH2].includes(feature));
};

/** True when `arbitration` is on only because `levelExplicit` forced it (recorded in the turn evidence). */
export const arbitrationForced = (): boolean => {
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  return v.includes('levelExplicit') && !v.includes('arbitration');
};
