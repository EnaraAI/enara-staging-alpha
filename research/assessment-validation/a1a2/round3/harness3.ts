// SIMULATION ONLY · DRAFT. Round 3 Path A: real production grader, graderV2 ON.
process.env.ENARA_ENGINE_V2 = 'graderV2';
import fs from 'fs';
import path from 'path';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { needsAiEvaluation } from '../../../../backend/src/services/autoGrading';
import { graderV2On, scoreTargetForm, matchKeyV2 } from '../../../../backend/src/services/graderV2';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../../../..');
const answers = JSON.parse(fs.readFileSync(path.join(here, 'answers.json'), 'utf8'));
const items = new Map<string, any>();
for (const f of fs.readdirSync(path.join(root, 'data/assessments/outcomes'))) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(fs.readFileSync(path.join(root, 'data/assessments/outcomes', f), 'utf8'));
  for (const form of Object.values<any[]>(d.forms)) for (const it of form) items.set(it.id, it);
}
if (!graderV2On()) throw new Error('graderV2 not on');

export function buildQuestion(it: any): any {
  const tf = it.scoring === 'target_form_0_1_2';
  const choice = /choice/.test(it.type);
  const q: any = {
    id: it.id, type: tf ? 'open-response' : choice ? 'multiple-choice' : 'short-answer',
    text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey,
    acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote,
    targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, scoringNote: it.scoringNote, points: tf ? undefined : 1,
  };
  if (it.options) q.options = it.options;
  if (tf) {
    // Bank rubric is a 0/1/2 string; expressed as one 3-level criterion so questionPoints() = 2.
    q.rubric = { criteria: [{ id: 'target_form', title: 'Target form', description: String(it.rubric ?? it.scoringNote ?? ''), maxPoints: 2,
      levels: [{ id: 'l0', label: '0', points: 0, description: 'target form missing or wrong' }, { id: 'l1', label: '1', points: 1, description: 'target form attempted with a minor slip' }, { id: 'l2', label: '2', points: 2, description: 'target form correct' }] }] };
  }
  return q;
}

const out: any[] = [];
for (const a of answers) {
  const it = items.get(a.itemId);
  if (!it) { out.push({ answerId: a.answerId, score: null, path: 'not_expressible', note: 'item not found in bank' }); continue; }
  const q = buildQuestion(it);
  const [r] = gradeAnswers([q], { [q.id]: a.answer });
  const ai = needsAiEvaluation(q, r as any);
  if (it.scoring === 'target_form_0_1_2') {
    const raw = scoreTargetForm(q, a.answer);
    if (r.method === 'rule' && r.points !== null) out.push({ answerId: a.answerId, score: r.points, path: 'target_form_rule', note: `scoreTargetForm=${raw}; gradeAnswers points ${r.points}/${r.maxPoints}; needsAiEvaluation=${ai}` });
    else out.push({ answerId: a.answerId, score: null, path: 'no_rule_fallback', note: `scoreTargetForm=null; fallback: gradeAnswers points=null needsReview=${(r as any).needsReview}; production sends to rubric model (needsAiEvaluation=${ai})` });
  } else {
    out.push({ answerId: a.answerId, score: r.isCorrect ? 1 : 0, path: q.type === 'multiple-choice' ? 'exact_choice' : 'exact', note: `gradeAnswer(matchKeyV2)=${r.isCorrect}; direct matchKeyV2=${matchKeyV2(q, a.answer)}; needsAiEvaluation=${ai}${!r.isCorrect && q.type === 'multiple-choice' ? ' (multiple-choice miss: production has no meaning check)' : ''}` });
  }
}
fs.writeFileSync(path.join(here, 'GRADER_DET.json'), JSON.stringify(out, null, 1));
const c: Record<string, number> = {};
for (const o of out) c[`${o.path}:${o.score}`] = (c[`${o.path}:${o.score}`] ?? 0) + 1;
console.log(c);
