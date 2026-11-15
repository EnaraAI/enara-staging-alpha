// ESL stage-3, step 2: validation rerun of the FROZEN simulator on 12 NEW learners (ids 200-211, seeds "esl3-val"). SIMULATION ONLY. NO API.
// Only creates the sessions; every other step uses learnerSim.ts unchanged (vtutor, vapply, vpost, agreeprep, agreescore).
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/esl3Validate.ts <dir>
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { initialState, VTUTORS } from './learnerSim';
import type { Form } from './eslFixtures';
const TOPIC: Record<Form, string> = { articles: 'a, an and the', copula: 'am, is and are', thirdS: 'he, she and it with -s' };
const dir = process.argv[2]; mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
const forms: Form[] = ['articles', 'copula', 'thirdS'];
for (let i = 0; i < 12; i++) {
  const form = forms[i % 3]; const band = i < 6 ? 'A1' : 'A2'; const primary = (Math.floor(i / 3) % 2 === 0 ? 'W1' : 'W2') as 'W1' | 'W2'; const idx = 200 + i;
  for (const t of VTUTORS) {
    const st = initialState(form, band, primary);
    const s = { id: `v${idx}_${t}`, tutor: t, learnerIdx: idx, seed: `esl3-val|L${idx}|${t.endsWith('2') ? 'rep2' : 'rep1'}`, state: st, start: st, turns: [{ learner: `Hello! Can you give me an exercise on ${TOPIC[form]}?`, production: { kind: 'none', text: '' } }] };
    writeFileSync(path.join(dir, 'sessions', `${s.id}.json`), JSON.stringify(s, null, 1));
  }
}
console.log('validation sessions', 12 * VTUTORS.length);
