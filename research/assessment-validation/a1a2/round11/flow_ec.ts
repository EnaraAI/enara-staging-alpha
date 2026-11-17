// SIMULATION ONLY · DRAFT. Option B2 flow for error-correction items, ENARA_EC_CHECK=on, AGENT STAND-IN for the model.
// Exact key / case-sensitive -> rules; otherwise the stand-in reply to EC_CHECK_SYSTEM goes through the real
// validateShortAnswer (round 11: NO targetFormMissing guard, as in production gradingProposals.evaluateErrorCorrection). Usage: tsx flow_ec.ts <answers.json> <standin.json> <out.json>
process.env.ENARA_ENGINE_V2 = 'graderV2'; process.env.ENARA_EC_CHECK = 'on';
import fs from 'fs'; import path from 'path';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { validateShortAnswer } from '../../../../backend/src/services/gradingProposals';
import { useErrorCorrectionCheck } from '../../../../backend/src/services/graderV2';
const here = path.dirname(new URL(import.meta.url).pathname); const root = path.resolve(here, '../../../..');
const items = new Map<string, any>();
for (const f of fs.readdirSync(path.join(root, 'data/assessments/outcomes'))) if (f.endsWith('.json'))
  for (const form of Object.values<any[]>(JSON.parse(fs.readFileSync(path.join(root, 'data/assessments/outcomes', f), 'utf8')).forms)) for (const it of form) items.set(it.id, it);
const [ansF, standF, outF] = process.argv.slice(2).map((p) => path.resolve(p));
const stand = JSON.parse(fs.readFileSync(standF, 'utf8'));
const out: any[] = []; const paths: Record<string, number> = {};
for (const a of JSON.parse(fs.readFileSync(ansF, 'utf8'))) {
  const it = items.get(a.itemId); if (it?.type !== 'error_correction') continue;
  const q: any = { id: it.id, type: 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, points: 1, objectiveIds: it.objectiveIds };
  const [r] = gradeAnswers([q], { [q.id]: a.answer }); const rule = r.isCorrect ? 1 : 0;
  let score = rule; let via = 'rules (exact key or case-sensitive item)';
  if (useErrorCorrectionCheck(q, a.answer)) {
    const raw = stand[a.answerId];
    if (!raw) { score = 0; via = 'MISSING stand-in reply'; }
    else { try { const v: any = validateShortAnswer(raw); score = v.correct ? 1 : 0; via = 'EC check (stand-in)'; } catch (e) { score = 0; via = 'reply rejected by validateShortAnswer'; } }
  }
  paths[via] = (paths[via] ?? 0) + 1;
  out.push({ answerId: a.answerId, score, rule, path: via, label: 'AGENT STAND-IN for the model, not the production model' });
}
fs.writeFileSync(outF, JSON.stringify(out, null, 1)); console.log(paths);
