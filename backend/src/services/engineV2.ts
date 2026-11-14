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
//  arbitration - one order of authority between the teaching-plan layer (23 methods: HOW to explain) and the language engine (WHAT may be revealed and when); named-only, NOT part of "all"
export type EngineV2Feature = 'wrongAnswer' | 'belief' | 'memory' | 'cache' | 'arbitration' | 'keyMatch' | 'closing' | 'selfCheck' | 'clarity' | 'hints' | 'ruleFirst' | 'shortRecap' | 'socraticOff' | 'strandLog' | 'levelExplicit';
export const engineV2 = (feature: EngineV2Feature): boolean => {
  if (feature === 'socraticOff' && process.env.NODE_ENV === 'production') return false; // research-only
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  if (feature === 'arbitration' && v.includes('levelExplicit')) return true; // levelExplicit always runs with arbitration
  return v.includes(feature) || (v.includes('all') && !['arbitration', 'keyMatch', 'closing', 'selfCheck', 'clarity', 'hints', 'ruleFirst', 'shortRecap', 'socraticOff', 'strandLog', 'levelExplicit'].includes(feature));
};

/** True when `arbitration` is on only because `levelExplicit` forced it (recorded in the turn evidence). */
export const arbitrationForced = (): boolean => {
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  return v.includes('levelExplicit') && !v.includes('arbitration');
};
