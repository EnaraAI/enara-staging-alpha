// SIMULATION ONLY · DRAFT. Option B: AGENT STAND-IN for the model path (not the production model; no API calls).
// Production flow for an exact (error-correction) item: rules first (matchKeyV2 via gradeAnswers); on a miss, if
// production would call the meaning check (needsAiEvaluation), the word-target guard decides by the key alone when
// the word itself is the target; otherwise the stand-in reply goes through the real validateShortAnswer and the
// graderV2 targetFormMissing guard. Usage: tsx standin9.ts <answers.json> <rules.json> <standin.json> <out.json>
process.env.ENARA_ENGINE_V2 = 'graderV2';
import fs from 'fs';
import path from 'path';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { needsAiEvaluation } from '../../../../backend/src/services/autoGrading';
import { validateShortAnswer } from '../../../../backend/src/services/gradingProposals';
import { matchKeyV2, spellingIsTarget, targetFormMissing } from '../../../../backend/src/services/graderV2';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../../../..');
const [ansF, rulesF, standF, outF] = process.argv.slice(2).map((p) => path.resolve(p));
const answers = JSON.parse(fs.readFileSync(ansF, 'utf8'));
const rules = new Map<string, any>(JSON.parse(fs.readFileSync(rulesF, 'utf8')).map((d: any) => [d.answerId, d]));
const stand = JSON.parse(fs.readFileSync(standF, 'utf8'));
const items = new Map<string, any>();
for (const f of fs.readdirSync(path.join(root, 'data/assessments/outcomes'))) if (f.endsWith('.json'))
  for (const form of Object.values<any[]>(JSON.parse(fs.readFileSync(path.join(root, 'data/assessments/outcomes', f), 'utf8')).forms)) for (const it of form) items.set(it.id, it);

function buildQuestion(it: any): any {
  const choice = /choice/.test(it.type);
  const q: any = { id: it.id, type: choice ? 'multiple-choice' : 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey,
    acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, points: 1 };
  if (it.options) q.options = it.options;
  if (it.objectiveIds) q.objectiveIds = it.objectiveIds;
  return q;
}

const out: any[] = [];
const path_: Record<string, number> = {};
for (const a of answers) {
  if (a.scoring !== 'exact') continue;
  const it = items.get(a.itemId); const q = buildQuestion(it);
  const [r] = gradeAnswers([q], { [q.id]: a.answer });
  const rule = rules.get(a.answerId)?.score ?? (r.isCorrect ? 1 : 0);
  let score = rule; let via = 'rules';
  if (rule === 0) {
    if (!needsAiEvaluation(q, r as any)) via = 'rules (production makes no model call)';
    else if (spellingIsTarget(q)) { score = matchKeyV2({ ...q, prompt: q.text }, a.answer) ? 1 : 0; via = 'word-target guard: key only, no model call'; }
    else {
      const raw = stand[a.answerId];
      if (!raw) { score = 0; via = 'MISSING stand-in reply'; }
      else {
        try {
          const v = validateShortAnswer(raw) as any;
          score = v.correct ? 1 : 0; via = 'stand-in meaning check';
          if (v.correct && targetFormMissing(q, a.answer) === true) { score = 0; via = 'stand-in said correct; guard target_form_missing -> 0'; }
        } catch (e) { score = 0; via = `validateShortAnswer rejected the reply (${(e as Error).message})`; }
      }
    }
  }
  path_[via] = (path_[via] ?? 0) + 1;
  out.push({ answerId: a.answerId, score, rule, path: via, label: 'AGENT STAND-IN for the model path, not the production model' });
}
fs.writeFileSync(outF, JSON.stringify(out, null, 1));
console.log(path_);
