// Language-engine v2 switches. Default OFF everywhere. ENARA_ENGINE_V2="wrongAnswer,belief,memory,cache" (or "all") turns features on.
// These are production-capable (not research-only): they exist so each change can be compared against the current engine and enabled per environment once it has earned it.
//  wrongAnswer - teach the rule after a recorded wrong attempt (the key can only confirm success, so the old wrong-answer path never ran)
//  belief      - the tutor names the learner's mistaken idea in its hidden marker; repeated ideas trigger hold-the-line + scope-rule teaching
//  memory      - beliefs, what worked and due reviews persist across sessions; an opening review check; due-review endpoint
//  cache       - stable instructions first with a cache breakpoint, volatile state last (same content, cheaper input)
export type EngineV2Feature = 'wrongAnswer' | 'belief' | 'memory' | 'cache';
export const engineV2 = (feature: EngineV2Feature): boolean => {
  const v = (process.env.ENARA_ENGINE_V2 ?? '').split(',').map((x) => x.trim());
  return v.includes('all') || v.includes(feature);
};
