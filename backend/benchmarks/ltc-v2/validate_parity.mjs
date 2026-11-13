// ENARA Language Teaching Benchmark: information-parity validator.
//
// For every case, compares
//   1. tutor-visible lesson/item context,
//   2. the learner script's targets,
//   3. judge-visible evidence,
//   4. reviewer-visible evidence,
// and fails the fixture on any parity defect. Works on fixture v2 records and,
// for comparison, on v1.0 cases (mapped with the v1.0 harness's actual views:
// the tutor received title/objective/spec without items; judge.ts and the AI
// review's blind_review.ts both showed the full `lesson` incl. exercise/nextItem).
//
// Usage: node validate_parity.mjs v2 <fixture_v2_cases.jsonl> [report.json]
//        node validate_parity.mjs v1 <v1 benchmark_cases.jsonl> [report.json]
import { readFileSync, writeFileSync } from 'fs';

const ANSWER_FIELDS = ['acceptedAnswers', 'targetForms', 'answer', 'key', 'answerKey'];
const LESSON_FIELDS = ['title', 'objective', 'spec'];

function containsAnswerFields(obj) {
  const found = [];
  const walk = (o, p) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (ANSWER_FIELDS.includes(k)) found.push(`${p}.${k}`);
      walk(v, `${p}.${k}`);
    }
  };
  walk(obj, '$');
  return found;
}
const itemIndex = (lesson) => new Map((lesson?.spec?.items ?? []).map((i) => [i.id, i.prompt]));

// Core check on normalised views. Returns a list of {code, detail}.
export function checkParity({ id, tutorLesson, evaluatorLessons, script, provenance }) {
  const issues = [];
  const tutorItems = itemIndex(tutorLesson);
  // 1. Learner targets must be visible to the tutor.
  script.forEach((s, i) => {
    if (!s.target) issues.push({ code: 'missing_target_declaration', detail: `turn ${i + 1}` });
    else if (s.target.startsWith('lesson_item:')) {
      const itemId = s.target.slice('lesson_item:'.length);
      if (!tutorItems.has(itemId)) issues.push({ code: 'learner_targets_unseen_exercise', detail: `turn ${i + 1} -> ${itemId}` });
    } else if (s.target === 'unseen_exercise') issues.push({ code: 'learner_targets_unseen_exercise', detail: `turn ${i + 1}` });
    else if (s.target === 'tutor_task' && i === 0) issues.push({ code: 'tutor_task_before_any_tutor_turn', detail: 'turn 1' });
    else if (!['request', 'own_sentence', 'tutor_task'].includes(s.target)) issues.push({ code: 'malformed_target', detail: `turn ${i + 1}: ${s.target}` });
  });
  // 2. Every tutor-visible item needs a well-formed id and prompt.
  for (const [itemId, prompt] of tutorItems) if (!/^[A-Za-z0-9_-]{1,40}$/.test(itemId) || !prompt) issues.push({ code: 'inconsistent_exercise_identifier', detail: itemId });
  if (tutorLesson && containsAnswerFields(tutorLesson).length) issues.push({ code: 'answer_key_in_tutor_view', detail: containsAnswerFields(tutorLesson).join(',') });
  // 3/4. Evaluators may not see lesson content or items the tutor did not receive, nor answer keys.
  for (const [who, ev] of Object.entries(evaluatorLessons)) {
    if (!ev) continue;
    for (const k of Object.keys(ev)) if (!LESSON_FIELDS.includes(k)) issues.push({ code: 'evaluator_only_target_information', detail: `${who}.lesson.${k}` });
    if (JSON.stringify(ev.title ?? null) !== JSON.stringify(tutorLesson?.title ?? null) || JSON.stringify(ev.objective ?? null) !== JSON.stringify(tutorLesson?.objective ?? null)) issues.push({ code: 'evaluator_lesson_differs_from_tutor', detail: who });
    const evItems = itemIndex(ev);
    for (const [itemId, prompt] of evItems) {
      if (!tutorItems.has(itemId)) issues.push({ code: 'evaluator_only_target_information', detail: `${who} item ${itemId}` });
      else if (tutorItems.get(itemId) !== prompt) issues.push({ code: 'inconsistent_exercise_identifier', detail: `${who} item ${itemId} prompt differs` });
    }
    const leaks = containsAnswerFields(ev);
    if (leaks.length) issues.push({ code: 'evaluator_only_target_information', detail: `${who}: ${leaks.join(',')}` });
    const specKeys = (o) => Object.keys(o?.spec ?? {}).filter((k) => k !== 'items').sort().join(',');
    if (specKeys(ev) !== specKeys(tutorLesson)) issues.push({ code: 'evaluator_lesson_differs_from_tutor', detail: `${who} spec fields` });
  }
  if (!provenance || !provenance.fixtureVersion && !provenance.source) issues.push({ code: 'missing_context_provenance', detail: id });
  return issues;
}

export function viewsFromV2(r) {
  return {
    id: r.id,
    tutorLesson: r.tutorView,
    evaluatorLessons: { judge: r.evaluatorView.lesson, reviewer: r.evaluatorView.lesson },
    script: r.learnerScript,
    provenance: r.provenance,
  };
}

// v1.0 as actually run: tutor got {title, description=objective, languageSpec=spec};
// the judge (judge.ts caseView.lesson) and the reviewer (blind_review.ts caseView.lesson)
// got the whole case lesson, including exercise and nextItem.
export function viewsFromV1(c) {
  const exFirst = c.turns[0]?.startsWith('Can you give me one exercise');
  const tutorLesson = c.lesson ? { title: c.lesson.title, objective: c.lesson.objective, spec: c.lesson.spec } : null;
  return {
    id: c.id,
    tutorLesson,
    evaluatorLessons: { judge: c.lesson, reviewer: c.lesson },
    script: c.turns.map((_, i) => ({ target: i === 0 ? 'request' : exFirst ? 'unseen_exercise' : c.caseType.startsWith('T12') ? 'own_sentence' : c.caseType.startsWith('T06') ? 'tutor_task' : 'request' })),
    provenance: c.provenance,
  };
}

export function validateFile(kind, file) {
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const results = rows.map((r) => {
    const v = kind === 'v2' ? viewsFromV2(r) : viewsFromV1(r);
    const issues = checkParity(v);
    return { id: v.id, pass: issues.length === 0, issues };
  });
  const codes = {};
  for (const r of results) for (const i of r.issues) codes[i.code] = (codes[i.code] ?? 0) + 1;
  return { kind, file, cases: rows.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, issueCounts: codes, results };
}

if (process.argv[1] && process.argv[1].endsWith('validate_parity.mjs')) {
  const [kind, file, out] = process.argv.slice(2);
  const report = validateFile(kind, file);
  if (out) writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ kind: report.kind, cases: report.cases, passed: report.passed, failed: report.failed, issueCounts: report.issueCounts }));
  if (kind === 'v2' && report.failed) process.exitCode = 1;
}
