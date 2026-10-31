import { describe, expect, it } from 'vitest';
import { GUIDE_METHODS, LEGACY_METHOD_ALIASES, STRATEGIES, STRATEGY_BY_ID, resolveMethodId, validateComposition } from '../src/services/strategyRegistry';

// P21 C1: teaching-method registry v2 (the 23 methods of the Enara AI Tutor
// Teaching Methods Reference Guide v1.0 plus five ENARA techniques). No provider,
// no database: the registry is data plus a deterministic composition check.

const GUIDE_NAMES = [
  'Direct Instruction', 'Socratic Method', 'Scaffolded Instruction', 'Mastery Learning', 'Inquiry-Based Learning', 'Problem-Based Learning',
  'Case-Based Learning', 'Project-Based Learning', 'Retrieval Practice', 'Spaced Repetition', 'Interleaving', 'Worked Examples',
  'Elaborative Interrogation', 'Analogical Reasoning', 'Metacognitive Strategy Instruction', 'Think-Aloud', 'Concept Mapping',
  'Differentiated Instruction', 'Adaptive Learning Pathways', 'Formative Assessment & Feedback Loops', 'Gamification & Game-Based Learning',
  'Narrative-Based & Contextual Learning', "Bloom's Taxonomy-Guided Instruction",
];
const V1_IDS = ['socratic_questioning', 'direct_instruction', 'worked_example', 'scaffolding', 'analogy', 'visual_explanation', 'retrieval_practice', 'error_analysis', 'guided_practice', 'independent_practice', 'prerequisite_remediation'];

describe('registry v2: all 23 guide methods', () => {
  it('has exactly the 23 guide methods, numbered 1-23 in guide order', () => {
    expect(GUIDE_METHODS.map((m) => m.guideNumber)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(GUIDE_METHODS.map((m) => m.name)).toEqual(GUIDE_NAMES);
  });

  it('every method and technique has every required field', () => {
    for (const m of STRATEGIES) {
      for (const k of ['id', 'name', 'kind', 'description', 'intendedWhen', 'limitations', 'promptInstructions', 'expectedInteraction', 'successCriteria'] as const) expect(m[k], `${m.id}.${k}`).toBeTruthy();
      expect(m.version, m.id).toBeGreaterThanOrEqual(1);
      expect(m.roles?.length, `${m.id}.roles`).toBeGreaterThan(0);
      expect(Array.isArray(m.conflictsWith), `${m.id}.conflictsWith`).toBe(true);
      expect(Array.isArray(m.switchWhen), `${m.id}.switchWhen`).toBe(true);
      expect(typeof m.minGrade, `${m.id}.minGrade`).toBe('number');
      if (m.kind === 'guide') {
        for (const k of ['objective', 'exitWhen', 'assessmentRequirements'] as const) expect(m[k], `${m.id}.${k}`).toBeTruthy();
        for (const k of ['learnerConditions', 'subjects', 'requiredSignals', 'phases', 'successIndicators'] as const) expect(m[k]?.length, `${m.id}.${k}`).toBeGreaterThan(0);
      } else {
        expect(STRATEGY_BY_ID.get(m.guideMethod!)?.kind, `${m.id} belongs to a guide method`).toBe('guide');
      }
    }
  });

  it('ids are unique, and every switch target and conflict refers to a real method', () => {
    expect(new Set(STRATEGIES.map((m) => m.id)).size).toBe(STRATEGIES.length);
    for (const m of STRATEGIES) {
      for (const sw of m.switchWhen ?? []) expect(STRATEGY_BY_ID.has(sw.to), `${m.id} -> ${sw.to}`).toBe(true);
      for (const c of m.conflictsWith ?? []) expect(STRATEGY_BY_ID.has(c), `${m.id} x ${c}`).toBe(true);
    }
  });

  it('prompt instructions are derived principles, about 120 tokens, never the guide\'s injection blocks', () => {
    for (const m of STRATEGIES) {
      const words = m.promptInstructions.split(/\s+/).length;
      expect(words, `${m.id}: ${words} words`).toBeLessThanOrEqual(100); // ~130 tokens
      expect(m.promptInstructions, m.id).not.toMatch(/\[TEACHING METHOD|You are an AI tutor|PROHIBITED:|Copy the block/);
    }
  });

  it('no real company or person from the guide\'s examples is used as content', () => {
    const text = JSON.stringify(STRATEGIES);
    for (const name of ['BP', 'Deepwater', 'Macbeth', 'Congo']) expect(text).not.toContain(name);
  });
});

describe('backward compatibility', () => {
  it('all registry v1 ids are still present (historical decisions and interventions resolve)', () => {
    for (const id of V1_IDS) expect(STRATEGY_BY_ID.has(id), id).toBe(true);
  });
  it('the legacy tutor TeachingMethod values resolve to registry ids', () => {
    for (const legacy of ['socratic', 'gap_filler', 'error_analysis']) expect(STRATEGY_BY_ID.has(LEGACY_METHOD_ALIASES[legacy]), legacy).toBe(true);
    expect(resolveMethodId('socratic')).toBe('socratic_questioning');
    expect(resolveMethodId('worked_example')).toBe('worked_example');
    expect(resolveMethodId('not_a_method')).toBeUndefined();
  });
  it('"DI" ambiguity in the guide is resolved by distinct ids', () => {
    expect(STRATEGY_BY_ID.get('direct_instruction')!.guideNumber).toBe(1);
    expect(STRATEGY_BY_ID.get('differentiated_instruction')!.guideNumber).toBe(18);
  });
});

describe('composition: primary + compatible supporting methods; contradictions rejected', () => {
  const ok = (c: Parameters<typeof validateComposition>[0]) => expect(validateComposition(c), JSON.stringify(c)).toEqual([]);
  const bad = (c: Parameters<typeof validateComposition>[0], why: RegExp) => expect(validateComposition(c).join('; ')).toMatch(why);

  it('accepts the guide\'s selection-matrix pairs', () => {
    ok({ primary: 'direct_instruction', supporting: ['worked_example', 'analogy'], modifiers: ['differentiated_instruction', 'formative_feedback'] });
    ok({ primary: 'scaffolding', supporting: ['metacognitive'], modifiers: [] });
    ok({ primary: 'retrieval_practice', supporting: [], reinforcement: 'spaced_repetition', modifiers: [] });
    ok({ primary: 'mastery_learning', supporting: [], reinforcement: 'interleaving', modifiers: [] });
    ok({ primary: 'socratic_questioning', supporting: ['elaborative_interrogation'], modifiers: [] }); // guide matrix: deeper thinking
  });
  it('C3: an answer-withholding primary with a last-resort-answer method is rejected', () => {
    bad({ primary: 'socratic_questioning', supporting: ['scaffolding'], modifiers: [] }, /withholds answers/);
    bad({ primary: 'inquiry_based', supporting: [], reinforcement: 'retrieval_practice', modifiers: [] }, /withholds answers/);
  });
  it('C5: discovery methods do not combine with worked examples or direct instruction', () => {
    bad({ primary: 'problem_based', supporting: ['worked_example'], modifiers: [] }, /conflicts/);
    bad({ primary: 'inquiry_based', supporting: ['direct_instruction'], modifiers: [] }, /conflicts|cannot be supporting/);
    bad({ primary: 'socratic_questioning', supporting: ['worked_example'], modifiers: [] }, /conflicts|withholds/);
  });
  it('roles, counts and unknown ids are enforced', () => {
    bad({ primary: 'spaced_repetition', supporting: [], modifiers: [] }, /cannot be primary/);
    bad({ primary: 'direct_instruction', supporting: ['analogy', 'worked_example', 'think_aloud'], modifiers: [] }, /at most two/);
    bad({ primary: 'direct_instruction', supporting: [], modifiers: ['guided_practice'] }, /cannot be a modifier/);
    bad({ primary: 'nope', supporting: [], modifiers: [] }, /unknown method/);
    bad({ primary: 'analogy', supporting: ['analogy'], modifiers: [] }, /twice/);
  });
});
