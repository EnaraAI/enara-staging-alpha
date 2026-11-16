// DRAFT — offline harness. Run from backend/: npx tsx ../research/assessment-validation/a1a2/harness.ts
// Calls the REAL grader functions (no API, no DB): gradeAnswers (assignment
// grader, grading-v2), evaluateAgainstKey (tutor key match, keyMatch off/on),
// validateShortAnswer / validateProposal / agree on AGENT STAND-IN replies.
import fs from 'fs';
import path from 'path';
import { gradeAnswers } from '../../../backend/src/services/grading';
import { evaluateAgainstKey } from '../../../backend/src/services/languageLearningState';
import { validateShortAnswer, validateProposal } from '../../../backend/src/services/gradingProposals';
import { agree } from '../../../backend/src/services/autoGrading';
import type { IQuestion } from '../../../backend/src/models/Assessment';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(DIR, '../../../data/assessments/outcomes');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const items: Record<string, any> = {};
for (const f of fs.readdirSync(BANK).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(BANK, f), 'utf8'));
  for (const form of Object.values(d.forms) as any[]) for (const i of form) items[i.id] = i;
}
const answers: any[] = read('answers.json').answers;
const ref: Record<string, number> = Object.fromEntries(read('reference.json').scores.map((s: any) => [s.answerId, s.reference]));
const sa = read('standin_short.json').replies;
const r1 = read('standin_rubric_run1.json').replies;
const r2 = read('standin_rubric_run2.json').replies;

const CHOICE = new Set(['multiple_choice', 'controlled_choice']);
const criterion = {
  id: 'target_form', title: 'Target form', maxPoints: 2,
  levels: [{ id: 'tf0', label: 'Missing or wrong', points: 0 }, { id: 'tf1', label: 'Minor slip', points: 1 }, { id: 'tf2', label: 'Correct', points: 2 }],
};
function question(a: any, it: any): IQuestion {
  if (a.group === 'controlled') return { id: it.id, type: CHOICE.has(it.type) ? 'multiple-choice' : 'short-answer', text: it.prompt, correctAnswer: it.answerKey, explanation: '', points: 1 } as IQuestion;
  return { id: it.id, type: 'open-response', text: it.prompt, explanation: '', modelAnswer: it.answerKey, rubric: { criteria: [criterion] } } as IQuestion;
}
const keyMatch = (resp: string, it: any, on: boolean) => {
  process.env.ENARA_ENGINE_V2 = on ? 'keyMatch' : '';
  return evaluateAgainstKey(resp, { id: it.id, prompt: it.prompt, acceptedAnswers: it.acceptedAnswers }) === 'CORRECT';
};

const rows: any[] = [];
for (const a of answers) {
  const it = items[a.itemId];
  const q = question(a, it);
  const [g] = gradeAnswers([q], { [q.id]: a.response });
  const max = a.group === 'controlled' ? 1 : 2;
  const row: any = { answerId: a.answerId, group: a.group, itemType: a.itemType, qType: q.type, response: a.response, reference: ref[a.answerId] };
  row.det_assignment = g.points === null ? null : (g.points ? max : 0);           // grading-v2 answer key (null = left for a person / model)
  row.det_tutorKey = keyMatch(a.response, it, false) ? max : 0;                  // evaluateAgainstKey, keyMatch off
  row.det_tutorKeyV2 = keyMatch(a.response, it, true) ? max : 0;                 // evaluateAgainstKey, keyMatch on
  if (a.group === 'controlled') {
    // Production pipeline: key first; short-answer misses go to the model meaning check (here: stand-in).
    if (g.isCorrect) row.standin_pipeline = 1;
    else if (q.type === 'short-answer') {
      const v = validateShortAnswer(sa[a.answerId]);
      row.standin_pipeline = v.correct ? 1 : 0; row.standin_used = true;
    } else row.standin_pipeline = 0; // multiple-choice: no model fallback in production
  } else {
    const ev = (rep: any) => {
      const v = validateProposal(rep, [criterion] as any, a.response, []);
      return { status: 'proposed', points: v.criteria.reduce((n, c) => n + c.points, 0), criteria: v.criteria, flags: v.flags } as any;
    };
    try {
      const e1 = ev(r1[a.answerId]); const e2 = ev(r2[a.answerId]);
      row.standin_run1 = e1.points; row.standin_run2 = e2.points; row.standin_agree = agree(e1, e2, q);
      row.standin_rubric = row.standin_agree ? e1.points : null; // production keeps run 1 when runs agree; else a 3rd run decides
      row.validator = 'ok';
    } catch (err) { row.validator = String((err as Error).message); row.standin_rubric = null; }
  }
  rows.push(row);
}

function exact(xs: any[], k: string) { const v = xs.filter((r) => r[k] !== null && r[k] !== undefined); return { n: v.length, of: xs.length, agree: v.filter((r) => r[k] === r.reference).length }; }
function qwk(xs: any[], k: string, K = 3) {
  const v = xs.filter((r) => r[k] !== null && r[k] !== undefined);
  const O = Array.from({ length: K }, () => Array(K).fill(0));
  for (const r of v) O[r.reference][r[k]]++;
  const n = v.length, ra = O.map((r) => r.reduce((a, b) => a + b, 0)), cb = O[0].map((_, j) => O.reduce((a, r) => a + r[j], 0));
  let num = 0, den = 0;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const w = ((i - j) ** 2) / ((K - 1) ** 2); num += w * O[i][j]; den += w * (ra[i] * cb[j]) / n; }
  return { n, of: xs.length, kappa: den ? +(1 - num / den).toFixed(3) : null, matrix: O };
}
const C = rows.filter((r) => r.group === 'controlled'), F = rows.filter((r) => r.group === 'free'), T = rows.filter((r) => r.group === 'transfer');
const summary = {
  label: 'Deterministic = real grader code, offline. Stand-in = AGENT STAND-IN — not the production grader.',
  controlled: { det_assignment: exact(C, 'det_assignment'), det_tutorKey: exact(C, 'det_tutorKey'), det_tutorKeyV2: exact(C, 'det_tutorKeyV2'), standin_pipeline: exact(C, 'standin_pipeline') },
  free: { det_assignment: qwk(F, 'det_assignment'), det_tutorKey: qwk(F, 'det_tutorKey'), standin_rubric: qwk(F, 'standin_rubric'), standin_run1: qwk(F, 'standin_run1') },
  transfer: { det_tutorKey: qwk(T, 'det_tutorKey'), det_tutorKeyV2: qwk(T, 'det_tutorKeyV2'), standin_rubric: qwk(T, 'standin_rubric') },
  freePlusTransfer: { det_tutorKeyV2: qwk([...F, ...T], 'det_tutorKeyV2'), standin_rubric: qwk([...F, ...T], 'standin_rubric') },
  standinRunsAgree: rows.filter((r) => r.standin_agree === true).length, standinRunsDisagree: rows.filter((r) => r.standin_agree === false).length,
  validatorFailures: rows.filter((r) => r.validator && r.validator !== 'ok').map((r) => [r.answerId, r.validator]),
};
fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify({ status: 'DRAFT', summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log('controlled misses (det_assignment / tutorKeyV2 / pipeline vs ref):');
for (const r of C) if (r.det_assignment !== r.reference || r.det_tutorKeyV2 !== r.reference || r.standin_pipeline !== r.reference) console.log(r.answerId, r.qType, JSON.stringify(r.response), 'ref', r.reference, 'A', r.det_assignment, 'K', r.det_tutorKey, 'K2', r.det_tutorKeyV2, 'P', r.standin_pipeline);
console.log('free/transfer:');
for (const r of [...F, ...T]) if (r.standin_rubric !== r.reference || r.det_tutorKeyV2 !== r.reference) console.log(r.answerId, JSON.stringify(r.response), 'ref', r.reference, 'K2', r.det_tutorKeyV2, 'S', r.standin_run1, r.standin_run2, r.standin_rubric);
