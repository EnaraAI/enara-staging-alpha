// ENARA Language Teaching Benchmark: fixture v2 builder (ltb-fixture-v2).
//
// Derives fixture v2 from the frozen v1.0 case set (read-only; never modified):
//   - every lesson case delivers its exercise and next item to the tutor as lesson
//     items (languageSpec.items: id + prompt reach the model; accepted answers and
//     target forms stay server-side for the answer key and leak telemetry);
//   - every scripted learner turn declares what it targets (a lesson item the tutor
//     received, the tutor's own task from the visible transcript, a request, or the
//     learner's own sentence);
//   - evaluators get an explicit view containing only what the tutor received plus
//     the case's evaluation guidance (no exercise answers, no hidden items);
//   - T03 learner turns are revised so they answer the delivered item (documented
//     in the change log with the original intention).
// Case ids are unchanged (traceable to v1.0); each record carries v1Sha256 of its
// v1.0 source line.
//
// Usage: node build_fixture_v2.mjs <v1 benchmark_cases.jsonl> <out dir>
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export const FIXTURE_VERSION = 'ltb-fixture-v2';
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Which success criteria (1-based) each lesson's items test.
const ITEM_CRITERIA = { A1: { ex1: [2], ex2: [2] }, A2: { ex1: [1], ex2: [1] }, B1: { ex1: [2], ex2: [1] } };

// T03 revision: v1.0 learner answers did not answer the case exercise at all.
const T03_V2 = {
  A1: { text: 'This is my brother. Mother is twelve.', v1: 'Is my brother mother.', note: 'Keeps the meaning-blocking brother/mother confusion, now as an attempt at item ex1 ("This is my brother. ___ is twelve.").' },
  A2: { text: 'Yesterday she go to bed and every day she went to bed at ten.', v1: 'Yesterday she go school and every day she went to bed late.', note: 'Keeps the past/present time-marker confusion that blocks meaning, now built on item ex1 ("She go to bed at ten").' },
  B1: { text: 'I have visited my aunt in Aswan last year and I never have seen her since now yesterday.', v1: 'I have visited my aunt last year and I never have seen her since now yesterday.', note: 'Adds "in Aswan" so the attempt is at item ex1; the tense errors are unchanged.' },
};

// What each scripted learner turn targets, by case type (turn index -> target).
// lesson_item:<id> = an item the tutor received; tutor_task = the task in the
// tutor's previous visible reply; request = a request/question; own_sentence = an
// unprompted learner sentence.
function targets(caseType, turns) {
  const t = caseType.slice(0, 3);
  const map = {
    T03: ['request', 'lesson_item:ex1'],
    T04: ['request', 'lesson_item:ex1'],
    T05: ['request', 'lesson_item:ex1'],
    T07: ['request', 'lesson_item:ex1', 'lesson_item:ex1', 'lesson_item:ex2'],
    T08: ['request', 'lesson_item:ex1', 'lesson_item:ex2'],
    T13: ['request', 'request'],
    T06: ['request', 'tutor_task', 'tutor_task'],
    T12: ['own_sentence'],
  }[t];
  return turns.map((_, i) => (map ? map[i] : 'request'));
}

// Accepted answers: the case answer, the key alone, and - for a single-gap
// "Complete:" item - the whole completed sentence (an equivalent formulation).
function accepted(item) {
  const out = [item.answer, item.key];
  const m = /^Complete:\s*"(.+)"$/.exec(item.prompt);
  if (m && (m[1].match(/___/g) ?? []).length === 1) out.push(m[1].replace('___', item.key).replace(/\.$/, ''));
  return out;
}

export function buildCase(v1line) {
  const c = JSON.parse(v1line);
  const changes = [];
  let turns = [...c.turns];
  if (c.caseType.startsWith('T03')) {
    const r = T03_V2[c.cefr];
    if (turns[1] !== r.v1) throw new Error(`${c.id}: unexpected v1 T03 text`);
    turns[1] = r.text;
    changes.push({ field: 'turns[1]', original: r.v1, revised: r.text, originalIntention: 'Learner attempt with a meaning-blocking error after asking for an exercise', reason: 'In v1.0 the scripted answer did not answer the case exercise (which the tutor never received); in v2 the tutor receives item ex1, so the attempt must be at ex1 for parity.', change: r.note, comparableToV1: 'partially: same situation type and error class; different sentence' });
  }
  const tgt = targets(c.caseType, turns);
  let delivered = null;
  if (c.lesson) {
    const crit = ITEM_CRITERIA[c.cefr];
    const items = [
      { id: 'ex1', prompt: c.lesson.exercise.prompt, acceptedAnswers: accepted(c.lesson.exercise), targetForms: [c.lesson.exercise.key], criteria: crit.ex1 },
      { id: 'ex2', prompt: c.lesson.nextItem.prompt, acceptedAnswers: accepted(c.lesson.nextItem), targetForms: [c.lesson.nextItem.key], criteria: crit.ex2 },
    ];
    delivered = { title: c.lesson.title, objective: c.lesson.objective, spec: { ...c.lesson.spec, items } };
    changes.push({ field: 'lesson.spec.items', change: 'exercise and nextItem delivered to the tutor as lesson items ex1/ex2 (prompts only reach the model)', reason: 'v1.0 learner turns targeted an exercise the tutor never received (diagnostic: 54/120 cases)', comparableToV1: 'yes for the scripted turns; the tutor now has the item' });
  }
  // What the tutor model receives about the lesson (answers and target forms are server-side only).
  const tutorView = delivered
    ? { title: delivered.title, objective: delivered.objective, spec: { ...delivered.spec, items: delivered.spec.items.map(({ id, prompt }) => ({ id, prompt })) } }
    : null;
  const evaluatorView = {
    case_id: c.id,
    trustedAgeBand: c.cohort,
    cefrEstimate: c.cefr,
    situationType: c.caseType,
    learner: { knownLanguages: c.learner.knownLanguages, goal: c.learner.goal, priorEvidence: c.learner.priorEvidence },
    lesson: tutorView,
    // Evaluation guidance (rubric-side, not lesson content).
    guidance: { expectedBehavior: c.expectedBehavior, unacceptableBehavior: c.unacceptableBehavior, expectedNextMove: c.expectedNextMove, wordLimitPerReply: c.structuredExpectations.maxWords },
  };
  return {
    id: c.id,
    fixtureVersion: FIXTURE_VERSION,
    v1Id: c.id,
    v1Sha256: sha(v1line),
    cohort: c.cohort,
    cefr: c.cefr,
    caseType: c.caseType,
    learner: c.learner,
    lessonDelivered: delivered,
    tutorView,
    learnerScript: turns.map((text, i) => ({ turn: i + 1, text, target: tgt[i] })),
    evaluatorView,
    structuredExpectations: { ...c.structuredExpectations, answerKey: c.structuredExpectations.answerKey },
    changeLog: changes,
    provenance: { ...c.provenance, derivedFrom: 'ltb-v1.0 benchmark_cases.jsonl (frozen; read-only)', fixtureVersion: FIXTURE_VERSION },
  };
}

if (process.argv[1] && process.argv[1].endsWith('build_fixture_v2.mjs')) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) throw new Error('usage: node build_fixture_v2.mjs <v1 cases.jsonl> <out dir>');
  const lines = readFileSync(src, 'utf8').trim().split('\n');
  const built = lines.map(buildCase);
  mkdirSync(out, { recursive: true });
  const body = built.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(path.join(out, 'fixture_v2_cases.jsonl'), body);
  const mapping = built.map((r) => ({ v2Id: r.id, v1Id: r.v1Id, v1Sha256: r.v1Sha256, revised: r.changeLog.some((x) => x.field.startsWith('turns')), itemsDelivered: Boolean(r.lessonDelivered) }));
  const manifest = {
    fixtureVersion: FIXTURE_VERSION,
    builtAt: new Date().toISOString(),
    sourceCaseSet: { file: path.basename(src), sha256: sha(readFileSync(src)), cases: lines.length },
    fixtureSha256: sha(body),
    cases: built.length,
    turns: built.reduce((n, r) => n + r.learnerScript.length, 0),
    v1IdsAccountedFor: mapping.length === lines.length && new Set(mapping.map((m) => m.v1Id)).size === lines.length,
    revisedCases: mapping.filter((m) => m.revised).map((m) => m.v2Id),
    casesWithItemsDelivered: mapping.filter((m) => m.itemsDelivered).length,
    builder: 'backend/benchmarks/ltc-v2/build_fixture_v2.mjs',
  };
  writeFileSync(path.join(out, 'fixture_v2_mapping.json'), JSON.stringify(mapping, null, 1));
  writeFileSync(path.join(out, 'fixture_v2_manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(out, 'fixture_v2_changelog.json'), JSON.stringify(built.filter((r) => r.changeLog.length).map((r) => ({ id: r.id, changes: r.changeLog })), null, 1));
  console.log(JSON.stringify(manifest));
}
