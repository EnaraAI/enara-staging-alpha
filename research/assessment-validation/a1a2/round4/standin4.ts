// SIMULATION ONLY · DRAFT. Path B: AGENT STAND-IN — not the production grader.
// Replies were written by an agent applying the eval-v2 prompts; they go through the real validators and the graderV2 guard.
process.env.ENARA_ENGINE_V2 = 'graderV2';
import fs from 'fs';
import path from 'path';
import { validateShortAnswer, validateProposal } from '../../../../backend/src/services/gradingProposals';
import { agree } from '../../../../backend/src/services/autoGrading';
import { targetFormMissing } from '../../../../backend/src/services/graderV2';
import { buildQuestion } from './harness4';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../../../..');
const answers = JSON.parse(fs.readFileSync(path.join(here, 'answers.json'), 'utf8'));
const det = new Map(JSON.parse(fs.readFileSync(path.join(here, 'GRADER_DET.json'), 'utf8')).map((d: any) => [d.answerId, d]));
const J = JSON.parse(fs.readFileSync(path.join(here, 'standin_judgments.json'), 'utf8'));
const items = new Map<string, any>();
for (const f of fs.readdirSync(path.join(root, 'data/assessments/outcomes'))) if (f.endsWith('.json'))
  for (const form of Object.values<any[]>(JSON.parse(fs.readFileSync(path.join(root, 'data/assessments/outcomes', f), 'utf8')).forms)) for (const it of form) items.set(it.id, it);

const out: any[] = [];
for (const a of answers) {
  const d: any = det.get(a.answerId); const it = items.get(a.itemId); const q = buildQuestion(it);
  const label = 'AGENT STAND-IN — not the production grader';
  if (a.scoring === 'exact') {
    if (d.score === 1) continue;
    const j = J.short[a.answerId];
    const raw = { correct: j[0], scoreExplanation: j[1], feedback: j[0] ? 'Well done.' : 'Look again at the form the question asks for and try once more.', flags: [] as string[] };
    const notes = [label, 'prompt: evaluateShortAnswer (eval-v2)'];
    if (q.type === 'multiple-choice') notes.push('multiple-choice: production needsAiEvaluation=false, so the real flow does NOT run this check; shown for completeness');
    let v: any;
    try { v = validateShortAnswer(raw); } catch (e) { out.push({ answerId: a.answerId, score: null, rawReply: JSON.stringify(raw), note: [...notes, `validateShortAnswer failed: ${(e as Error).message}`].join('; ') }); continue; }
    if (v.correct && targetFormMissing(q, a.answer) === true) { v.correct = false; notes.push('guard: target_form_missing -> 0'); }
    else notes.push(`guard: targetFormMissing=${targetFormMissing(q, a.answer)}`);
    out.push({ answerId: a.answerId, score: v.correct ? 1 : 0, rawReply: JSON.stringify(raw), note: notes.join('; ') });
  } else {
    const notes = [label, 'prompt: RUBRIC_SYSTEM (eval-v2), bank 0/1/2 rubric as one criterion', `deterministic=${d.score}`];
    if (!String(a.answer).trim()) { out.push({ answerId: a.answerId, score: 0, rawReply: '', note: [...notes, 'blank answer: production never calls the model (0)'].join('; ') }); continue; }
    const j = J.rubric[a.answerId];
    const raw = { criteria: [{ criterionId: 'target_form', levelId: `l${j[0]}`, evidence: j[1] ? [j[1]] : [], rationale: j[2] }], scoreExplanation: j[2], strengths: j[0] ? ['You tried the target form.'] : [], improvements: j[0] < 2 ? ['Check the target form again.'] : [], feedback: j[0] === 2 ? 'Good use of the form. Next, try a longer sentence.' : 'Check the form the task asks for and write the sentence again.', objectiveIds: [], confidence: 'medium', flags: [] };
    let v: any;
    try { v = validateProposal(raw, q.rubric.criteria, a.answer, []); } catch (e) { out.push({ answerId: a.answerId, score: null, rawReply: JSON.stringify(raw), note: [...notes, `validateProposal failed: ${(e as Error).message}`].join('; ') }); continue; }
    let pts = v.criteria.reduce((n: number, c: any) => n + c.points, 0);
    const ev = { points: pts, criteria: v.criteria } as any;
    notes.push(`agree(single run vs itself)=${agree(ev, ev, q)} (one run only; consistency not tested)`);
    const tfm = targetFormMissing(q, a.answer);
    if (pts > 0 && tfm === true) { pts = 0; notes.push('guard: target_form_missing -> 0 (guard is wired only to evaluateShortAnswer in production; applied here per task)'); }
    else notes.push(`guard: targetFormMissing=${tfm}`);
    out.push({ answerId: a.answerId, score: pts, rawReply: JSON.stringify(raw), note: notes.join('; ') });
  }
}
fs.writeFileSync(path.join(here, 'GRADER_STANDIN.json'), JSON.stringify(out, null, 1));
const c: Record<string, number> = {}; for (const o of out) c[String(o.score)] = (c[String(o.score)] ?? 0) + 1;
console.log(out.length, c, out.filter((o) => /guard: target_form_missing|failed/.test(o.note)).map((o) => o.answerId));
