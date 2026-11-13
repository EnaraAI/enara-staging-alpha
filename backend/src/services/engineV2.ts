// Language-engine v2 switches. Default OFF everywhere. ENARA_ENGINE_V2="wrongAnswer,belief,memory,cache" (or "all") turns features on.
// These are production-capable (not research-only): they exist so each change can be compared against the current engine and enabled per environment once it has earned it.
//  wrongAnswer - teach the rule after a recorded wrong attempt (the key can only confirm success, so the old wrong-answer path never ran)
//  belief      - the tutor names the learner's mistaken idea in its hidden marker; repeated ideas trigger hold-the-line + scope-rule teaching
//  memory      - beliefs, what worked and due reviews persist across sessions; an opening review check; due-review endpoint
//  cache       - stable instructions first with a cache breakpoint, volatile state last (same content, cheaper input)
//  keyMatch    - the answer key treats contractions as their full forms (doesn't = does not); named-only, NOT part of "all"
//  closing     - production version of the closing recap: from the learner's 5th message (or when every success criterion has been shown) recap the rule, ask for it in their own words, and the engine appends that ask if the model left it out; named-only, NOT part of "all"
//  selfCheck   - an independent check on the tutor's own CORRECT grade for closed items: if the learner's answer contains none of the item's target forms, the grade is held back (no credit) instead of trusted; named-only, NOT part of "all"
//  arbitration - one order of authority between the teaching-plan layer (23 methods: HOW to explain) and the language engine (WHAT may be revealed and when); named-only, NOT part of "all"
export type EngineV2Feature = 'wrongAnswer' | 'belief' | 'memory' | 'cache' | 'arbitration' | 'keyMatch' | 'closing' | 'selfCheck';
export const engineV2 = (feature: EngineV2Feature): boolean => {
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  return v.includes(feature) || (v.includes('all') && !['arbitration', 'keyMatch', 'closing', 'selfCheck'].includes(feature));
};
