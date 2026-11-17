// SIMULATION ONLY. Lists the answers the B2 error-correction check would see (ENARA_EC_CHECK=on), and writes the
// stand-in task with the production prompt copied from the code. Usage: tsx ecinputs.ts <answers.json>... -> stdout counts
process.env.ENARA_ENGINE_V2 = 'graderV2'; process.env.ENARA_EC_CHECK = 'on';
import fs from 'fs'; import path from 'path';
import { useErrorCorrectionCheck } from '../../../../backend/src/services/graderV2';
import { EC_CHECK_SYSTEM } from '../../../../backend/src/services/gradingProposals';
const here = path.dirname(new URL(import.meta.url).pathname); const root = path.resolve(here, '../../../..');
const items = new Map<string, any>();
for (const f of fs.readdirSync(path.join(root, 'data/assessments/outcomes'))) if (f.endsWith('.json'))
  for (const form of Object.values<any[]>(JSON.parse(fs.readFileSync(path.join(root, 'data/assessments/outcomes', f), 'utf8')).forms)) for (const it of form) items.set(it.id, it);
const [outName, ...files] = process.argv.slice(2);
const cases: any[] = [];
for (const f of files) for (const a of JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'))) {
  const it = items.get(a.itemId); if (it?.type !== 'error_correction') continue;
  if (useErrorCorrectionCheck({ ...it, prompt: it.prompt }, a.answer)) cases.push({ id: a.answerId, question: it.prompt, correctAnswerForGraderOnly: String(it.answerKey ?? ''), studentAnswer: a.answer });
}
fs.writeFileSync(path.join(here, outName), JSON.stringify(cases, null, 1));
fs.writeFileSync(path.join(here, 'EC_STANDIN_TASK.md'), `SIMULATION ONLY

# Error-correction check (option B2): AGENT STAND-IN, not the production model

No API calls, no git, no sub-agents. You act as the AI model in ENARA's error-correction check. Read ONLY the input file named in your instructions. Do NOT open any other file: no references, scorer files, answers_design, code, rubric documents or other rounds. Judge exactly as a careful model given this system prompt would.

**System prompt (verbatim from production, \`EC_CHECK_SYSTEM\` in backend/src/services/gradingProposals.ts):**

> ${EC_CHECK_SYSTEM}

**User message for each case:** \`{"question": <question>, "correctAnswerForGraderOnly": <correctAnswerForGraderOnly>, "studentAnswer": "<student_answer>" + <studentAnswer> + "</student_answer>"}\`

Treat each case independently, as a separate model call. Write the output file named in your instructions:
\`{"<id>": {"correct": true|false, "scoreExplanation": "...", "feedback": "...", "flags": []}, ...}\`, one entry per input case.
Validate it with python3 json.load, and reply with only the count of true and false.
`);
console.log(outName, cases.length);
