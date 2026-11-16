import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { sanitizeLanguageSpec } from '../src/services/languageTeachingContext';

// Measurement repair (ltb-fixture-v2): builder, information-parity validator and
// fixture integrity. Reads the frozen v1.0 case set read-only. No provider call.

const ROOT = path.resolve(__dirname, '../..');
const V1 = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109T1211-ltb-v1.0-ageband/official/benchmark_cases.jsonl');
const V1_SHA = '725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb';
const have = existsSync(V1);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<{ build: any; parity: any }> => ({
  build: await import('../benchmarks/ltc-v2/build_fixture_v2.mjs'),
  parity: await import('../benchmarks/ltc-v2/validate_parity.mjs'),
});

describe('fixture v2 builder', () => {
  it.skipIf(!have)('maps all 120 v1.0 ids one-to-one, leaves v1.0 untouched, and revises only the 9 T03 learner turns (logged)', async () => {
    const { build } = await load();
    const lines = readFileSync(V1, 'utf8').trim().split('\n');
    const v2 = lines.map((l) => build.buildCase(l));
    expect(v2).toHaveLength(120);
    expect(new Set(v2.map((r: { v1Id: string }) => r.v1Id)).size).toBe(120);
    expect(v2.every((r: { id: string; v1Id: string }) => r.id === r.v1Id)).toBe(true);
    const revised = v2.filter((r: { changeLog: { field: string }[] }) => r.changeLog.some((c) => c.field.startsWith('turns')));
    expect(revised.map((r: { caseType: string }) => r.caseType.slice(0, 3))).toEqual(Array(9).fill('T03'));
    for (const r of revised) expect(r.changeLog[0]).toMatchObject({ originalIntention: expect.any(String), reason: expect.any(String), comparableToV1: expect.any(String) });
    expect(v2.reduce((n: number, r: { learnerScript: unknown[] }) => n + r.learnerScript.length, 0)).toBe(219);
    expect(createHash('sha256').update(readFileSync(V1)).digest('hex')).toBe(V1_SHA);
  });

  it.skipIf(!have)('delivered items survive the product sanitiser unchanged; tutor and evaluator views carry no answers', async () => {
    const { build } = await load();
    for (const l of readFileSync(V1, 'utf8').trim().split('\n')) {
      const r = build.buildCase(l);
      if (!r.lessonDelivered) continue;
      expect(sanitizeLanguageSpec(r.lessonDelivered.spec)!.items).toEqual(r.lessonDelivered.spec.items);
      const views = JSON.stringify([r.tutorView, r.evaluatorView]);
      for (const k of ['acceptedAnswers', 'targetForms', '"answer"', '"key"']) expect(views).not.toContain(k);
      for (const s of r.learnerScript) if (s.target.startsWith('lesson_item:')) expect(r.tutorView.spec.items.map((i: { id: string }) => i.id)).toContain(s.target.slice(12));
    }
  });

  it('a single-gap "Complete:" item also accepts the whole completed sentence', async () => {
    const { build } = await load();
    const line = JSON.stringify({ id: 'X', cohort: 'child', cefr: 'A1', caseType: 'T04_minor_error', learner: { knownLanguages: null, goal: 'g', priorEvidence: null }, lesson: { title: 't', objective: 'o', spec: { objectives: ['o'] }, exercise: { prompt: 'Complete: "This is my brother. ___ is twelve."', answer: 'He is twelve', key: 'He' }, nextItem: { prompt: 'Complete: "This is my grandmother. ___ is very kind."', answer: 'She is very kind', key: 'She' } }, turns: ['Can you give me one exercise from this lesson?', 'he is twelve'], expectedBehavior: 'e', unacceptableBehavior: 'u', expectedNextMove: 'n', structuredExpectations: { maxWords: 90, answerKey: null }, provenance: { source: 's' } });
    const r = build.buildCase(line);
    expect(r.lessonDelivered.spec.items[0].acceptedAnswers).toEqual(['He is twelve', 'He', 'This is my brother. He is twelve']);
  });
});

describe('information-parity validator', () => {
  const lesson = { title: 'T', objective: 'O', spec: { objectives: ['o'], items: [{ id: 'ex1', prompt: 'P1' }] } };
  const ok = { id: 'c', tutorLesson: lesson, evaluatorLessons: { judge: lesson, reviewer: lesson }, script: [{ target: 'request' }, { target: 'lesson_item:ex1' }], provenance: { fixtureVersion: 'ltb-fixture-v2' } };

  it('a parity-correct case passes', async () => {
    const { parity } = await load();
    expect(parity.checkParity(ok)).toEqual([]);
  });

  it.each([
    ['missing tutor exercise / learner answer targeting an unseen exercise', { script: [{ target: 'request' }, { target: 'lesson_item:ex9' }] }, 'learner_targets_unseen_exercise'],
    ['evaluator-only target information (extra exercise field)', { evaluatorLessons: { judge: { ...lesson, exercise: { prompt: 'Q' } }, reviewer: lesson } }, 'evaluator_only_target_information'],
    ['evaluator-only item', { evaluatorLessons: { judge: lesson, reviewer: { ...lesson, spec: { ...lesson.spec, items: [{ id: 'ex1', prompt: 'P1' }, { id: 'ex2', prompt: 'P2' }] } } } }, 'evaluator_only_target_information'],
    ['answer key visible to an evaluator', { evaluatorLessons: { judge: { ...lesson, spec: { ...lesson.spec, items: [{ id: 'ex1', prompt: 'P1', acceptedAnswers: ['a'] }] } }, reviewer: lesson } }, 'evaluator_only_target_information'],
    ['answer key in the tutor view', { tutorLesson: { ...lesson, spec: { ...lesson.spec, items: [{ id: 'ex1', prompt: 'P1', acceptedAnswers: ['a'] }] } } }, 'answer_key_in_tutor_view'],
    ['inconsistent exercise identifiers (same id, different prompt)', { evaluatorLessons: { judge: { ...lesson, spec: { ...lesson.spec, items: [{ id: 'ex1', prompt: 'OTHER' }] } }, reviewer: lesson } }, 'inconsistent_exercise_identifier'],
    ['malformed exercise identifier', { tutorLesson: { ...lesson, spec: { ...lesson.spec, items: [{ id: 'bad id', prompt: 'P' }] } }, evaluatorLessons: {} }, 'inconsistent_exercise_identifier'],
    ['missing provenance', { provenance: null }, 'missing_context_provenance'],
    ['undeclared learner target', { script: [{ target: '' }] }, 'missing_target_declaration'],
    ['malformed learner target', { script: [{ target: 'whatever' }] }, 'malformed_target'],
    ['evaluator sees a different objective', { evaluatorLessons: { judge: { ...lesson, objective: 'X' }, reviewer: lesson } }, 'evaluator_lesson_differs_from_tutor'],
  ])('fails on %s', async (_label, patch, code) => {
    const { parity } = await load();
    const issues = parity.checkParity({ ...ok, ...patch });
    expect(issues.map((i: { code: string }) => i.code)).toContain(code);
  });

  it.skipIf(!have)('v1.0 as actually run fails parity in 111/120 cases; fixture v2 passes 120/120', async () => {
    const { build, parity } = await load();
    const v1 = readFileSync(V1, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const v1fail = v1.filter((c) => parity.checkParity(parity.viewsFromV1(c)).length > 0);
    expect(v1fail).toHaveLength(111);
    const unseen = v1.filter((c) => parity.checkParity(parity.viewsFromV1(c)).some((i: { code: string }) => i.code === 'learner_targets_unseen_exercise'));
    expect(unseen).toHaveLength(54); // the diagnostic's 54 exercise-first cases
    const v2 = readFileSync(V1, 'utf8').trim().split('\n').map((l) => build.buildCase(l));
    expect(v2.filter((r: unknown) => parity.checkParity(parity.viewsFromV2(r)).length > 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// r4.1 POST-13: the rubric v2 evaluator consumes evaluatorView only, fails
// explicitly without it, records versions, and applies the outcome rule.
describe('rubric v2 evaluator (judge_v2_core)', () => {
  const FIX = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl');
  const RUB = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109-post-remediation-final/rubric_v2_machine.json');
  const haveV2 = existsSync(FIX) && existsSync(RUB);
  const core = () => import('../benchmarks/ltc-v2/judge_v2_core');
  const DIMS = ['context_grounding', 'task_alignment', 'age_fit', 'cefr_fit', 'answer_judgement', 'scaffolding', 'hint_leakage', 'independence', 'formative_check', 'grammar_accuracy', 'progression'];
  const all = (v: number | string) => Object.fromEntries(DIMS.map((d) => [d, v]));
  const ok = { pass: true, parityValid: true, privacyBreach: false, failures: [] as string[] };

  it.skipIf(!haveV2)('the machine rubric carries all 11 dimensions with verbatim draft anchors and the four core dimensions', async () => {
    const { loadRubricV2 } = await core();
    const { rubric } = loadRubricV2(readFileSync(RUB, 'utf8'));
    expect(rubric.dimensions.map((d) => d.id)).toEqual(DIMS);
    const md = readFileSync(path.join(ROOT, 'docs/benchmarks/language-teaching/20261109-full-remediation/rubric_v2_draft.md'), 'utf8');
    for (const d of rubric.dimensions) for (const k of ['0', '1', '2', '3', '4'] as const) expect(md, `${d.id}/${k}`).toContain(`| ${k} | ${d.anchors[k]} |`);
  });

  it.skipIf(!haveV2)('every v2 case yields a valid evaluatorView with no answers; a v1 record, a missing or a tampered view fail explicitly', async () => {
    const { requireEvaluatorView, EvaluatorViewError } = await core();
    const recs = readFileSync(FIX, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    for (const r of recs) {
      const v = requireEvaluatorView(r);
      const s = JSON.stringify(v);
      for (const it of r.lessonDelivered?.spec?.items ?? []) for (const a of it.acceptedAnswers ?? []) if (a.split(' ').length > 1) expect(s).not.toContain(a);
    }
    const r0 = recs.find((r) => r.lessonDelivered);
    expect(() => requireEvaluatorView({ ...r0, evaluatorView: undefined })).toThrow(EvaluatorViewError);
    expect(() => requireEvaluatorView({ ...r0, fixtureVersion: 'ltb-v1.0' })).toThrow(/fixtureVersion/);
    expect(() => requireEvaluatorView({ ...r0, evaluatorView: { ...r0.evaluatorView, case_id: 'other' } })).toThrow(/case_id/);
    const leaked = JSON.parse(JSON.stringify(r0.evaluatorView));
    leaked.lesson.spec.items[0].acceptedAnswers = ['x'];
    expect(() => requireEvaluatorView({ ...r0, evaluatorView: leaked })).toThrow(/forbidden field/);
    // A v1-style record (lesson but no evaluatorView) is never silently read.
    expect(() => requireEvaluatorView({ id: r0.id, fixtureVersion: 'ltb-fixture-v2', lesson: r0.lessonDelivered } as never)).toThrow(/missing/);
  });

  it.skipIf(!haveV2)('the evaluator prompt is built from the view and the visible transcript only', async () => {
    const { requireEvaluatorView, userPrompt, systemPrompt, loadRubricV2 } = await core();
    const r = readFileSync(FIX, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((x) => x.lessonDelivered?.spec?.items?.length);
    const p = userPrompt(requireEvaluatorView(r), [{ turn: 0, learner: 'hello', reply: 'Hi! Correct the verb.', runtimeParity: { keyVerdict: 'CORRECT' } } as never]);
    expect(p).toContain('LEARNER: hello');
    for (const secret of ['acceptedAnswers', 'targetForms', 'keyVerdict', 'runtimeParity', 'languageTurn', ...r.lessonDelivered.spec.items.flatMap((i: { acceptedAnswers: string[] }) => i.acceptedAnswers.filter((a) => a.split(' ').length > 1))]) expect(p).not.toContain(secret);
    const sys = systemPrompt(loadRubricV2(readFileSync(RUB, 'utf8')).rubric);
    expect(sys).toContain('[CORE]');
    expect(sys).toContain('insufficient_evidence');
  });

  it.skipIf(!haveV2)('outcome rule: critical never offset; 0 fails; core floor 3; mean 3.0; majors block MEETS; insufficient core is UNCERTAIN; parity failure is INVALID', async () => {
    const { computeOutcomeV2, loadRubricV2, parseJudgeOutput, reconcile, cohenKappa, deterministicChecks } = await core();
    const { rubric } = loadRubricV2(readFileSync(RUB, 'utf8'));
    const o = (scores: Record<string, unknown>, failures: unknown[] = [], det = ok) => computeOutcomeV2({ scores: scores as never, evidence: {}, failures: failures as never }, det, rubric);
    expect(o(all(3)).outcome).toBe('MEETS');
    expect(o(all(4), [{ severity: 'critical' }]).outcome).toBe('DOES_NOT_MEET');
    expect(o({ ...all(4), age_fit: 0 }).outcome).toBe('DOES_NOT_MEET');
    expect(o({ ...all(4), hint_leakage: 2 }).outcome).toBe('PARTIAL');
    expect(o(all(4), [{ severity: 'major' }]).outcome).toBe('PARTIAL');
    expect(o({ ...all(3), age_fit: 2 }).outcome).toBe('PARTIAL'); // mean < 3.00
    expect(o({ ...all(3), formative_check: 'n/a', progression: 'insufficient_evidence' }).outcome).toBe('MEETS'); // excluded, never counted as 3
    expect(o({ ...all(3), answer_judgement: 'insufficient_evidence' }).outcome).toBe('UNCERTAIN');
    // A core dimension that cannot apply (n/a, e.g. no answer to judge) is excluded, not a failure.
    expect(o({ ...all(3), answer_judgement: 'n/a', hint_leakage: 'n/a' }).outcome).toBe('MEETS');
    expect(o({ ...all(3), answer_judgement: 'n/a', hint_leakage: 'n/a', context_grounding: 'n/a', grammar_accuracy: 'n/a' }).outcome).toBe('PARTIAL');
    expect(o(all(4), [], { ...ok, parityValid: false }).outcome).toBe('INVALID');
    expect(o(all(4), [], { ...ok, pass: false, failures: ['marker visible'] }).outcome).toBe('PARTIAL');
    expect(o(all(4), [], { ...ok, privacyBreach: true }).outcome).toBe('DOES_NOT_MEET');
    expect(parseJudgeOutput(JSON.stringify({ scores: { ...all(3), age_fit: 5 }, failures: [] }), rubric)).toBeNull();
    expect(parseJudgeOutput('not json', rubric)).toBeNull();
    expect(reconcile({ outcome: 'MEETS', mean: 3.09, scored: 11, reasons: [] }, { outcome: 'PARTIAL', mean: 2.8, scored: 11, reasons: [] })).toBe('UNCERTAIN');
    expect(reconcile({ outcome: 'MEETS', mean: 3.5, scored: 11, reasons: [] }, { outcome: 'PARTIAL', mean: 2.8, scored: 11, reasons: [] })).toBe('MEETS');
    expect(cohenKappa([['A', 'A'], ['B', 'B'], ['A', 'B'], ['B', 'B']]).agreement).toBe(0.75);
    expect(deterministicChecks([{ turn: 0, learner: 'x', reply: 'ok [[assess verdict=CORRECT]]', httpStatus: 200 }]).pass).toBe(false);
    expect(deterministicChecks([{ turn: 0, learner: 'x', reply: 'ok', httpStatus: 200, runtimeParity: { tutorSawTarget: false } }]).parityValid).toBe(false);
  });
});
