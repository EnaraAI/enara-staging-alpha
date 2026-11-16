// DRAFT — round 2 offline harness. Run from backend/: npx tsx ../research/assessment-validation/a1a2/round2/harness2.ts
// Deterministic arm = REAL grader code, offline (no API, no DB):
//   scoring 'exact'            -> gradeAnswers/gradeAnswer (assignment key, correctAnswer = answerKey; choice items as multiple-choice)
//   scoring 'target_form_0_1_2' -> evaluateAgainstKey (tutor key, acceptedAnswers; ENARA_ENGINE_V2 unset). CORRECT -> 2, else 0.
//                                  No target-form scoring exists deterministically: right/wrong only.
// Stand-in arm = AGENT STAND-IN — not the production grader: replies (standin2.json) written by applying
//   the evaluateShortAnswer system prompt and RUBRIC_SYSTEM (eval-v2) by reading, validated with the real
//   validateShortAnswer / validateProposal / agree. No agreement with any reference is computed here.
import fs from 'fs';
import path from 'path';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { evaluateAgainstKey } from '../../../../backend/src/services/languageLearningState';
import { validateShortAnswer, validateProposal } from '../../../../backend/src/services/gradingProposals';
import { agree } from '../../../../backend/src/services/autoGrading';
import type { IQuestion } from '../../../../backend/src/models/Assessment';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(DIR, '../../../../data/assessments/outcomes');
const items: Record<string, any> = {};
for (const f of fs.readdirSync(BANK).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(BANK, f), 'utf8'));
  for (const form of Object.values(d.forms) as any[]) for (const i of form) items[i.id] = i;
}
const answers: any[] = JSON.parse(fs.readFileSync(path.join(DIR, 'SCORING_INPUT.json'), 'utf8')).answers;
const S = JSON.parse(fs.readFileSync(path.join(DIR, 'standin2.json'), 'utf8'));
const CHOICE = new Set(['multiple_choice', 'controlled_choice']);
const crit = (desc: string) => ({
  id: 'target_form', title: 'Target form', description: desc, maxPoints: 2,
  levels: [{ id: 'tf0', label: 'Target form missing or wrong', points: 0 }, { id: 'tf1', label: 'Target form attempted with a minor slip', points: 1 }, { id: 'tf2', label: 'Target form correct', points: 2 }],
});
delete process.env.ENARA_ENGINE_V2;
const det: Record<string, number> = {}, standin: Record<string, number> = {}, log: string[] = [];
for (const a of answers) {
  const it = items[a.itemId]; const k = a.answerId.slice(-3);
  if (a.scoring === 'exact') {
    const q = { id: it.id, type: CHOICE.has(it.type) ? 'multiple-choice' : 'short-answer', text: a.prompt, correctAnswer: a.answerKey, explanation: '', points: 1 } as IQuestion;
    const [g] = gradeAnswers([q], { [q.id]: a.response });
    det[a.answerId] = g.isCorrect ? 1 : 0;
    if (g.isCorrect) standin[a.answerId] = 1;
    else if (q.type === 'short-answer') {
      const v = validateShortAnswer({ correct: S.short[k] === 1, scoreExplanation: S.label, feedback: 'Check your answer again.', flags: [] });
      standin[a.answerId] = v.correct ? 1 : 0;
    } else standin[a.answerId] = 0; // multiple-choice: no model fallback in production
  } else {
    const verdict = evaluateAgainstKey(a.response, { id: it.id, prompt: a.prompt, acceptedAnswers: a.acceptedAnswers } as any);
    det[a.answerId] = verdict === 'CORRECT' ? 2 : 0;
    const c = crit(a.rubric || a.targetForm);
    const q = { id: it.id, type: 'open-response', text: a.prompt, explanation: '', modelAnswer: a.answerKey, rubric: { criteria: [c] } } as IQuestion;
    const [lvl, quote] = S.rubric[k];
    const reply = { criteria: [{ criterionId: 'target_form', levelId: lvl, evidence: quote ? [quote] : [], rationale: `Target form only; level ${lvl}.` }],
      scoreExplanation: `Scored on the target form only (${lvl}).`, strengths: [], improvements: [], feedback: 'Look again at the form this task practises.', objectiveIds: [], confidence: 'medium', flags: [] };
    const v = validateProposal(reply, [c] as any, a.response, []);
    const e = { status: 'proposed', points: v.criteria.reduce((n, x) => n + x.points, 0), criteria: v.criteria, flags: v.flags } as any;
    if (!agree(e, e, q)) throw new Error('agree failed ' + a.answerId);
    if (v.flags.length) log.push(`${a.answerId} flags ${v.flags}`);
    standin[a.answerId] = e.points;
  }
}
fs.writeFileSync(path.join(DIR, 'GRADER_DET.json'), JSON.stringify(det, null, 1));
fs.writeFileSync(path.join(DIR, 'GRADER_STANDIN.json'), JSON.stringify(standin, null, 1));
console.log('det', Object.keys(det).length, 'standin', Object.keys(standin).length, log);
