// Learning-outcome simulation, quiz stage. For each simulated learner (same persona as in the
// tutoring run), answer two held-out quiz items under three conditions:
//   pre      - before any lesson (persona only)
//   control  - after reading the lesson notes only (objective, criteria, examples; no tutor)
//   tutor    - after the recorded ENARA tutoring conversation
// Each answer is sampled N times and scored by the same normalised answer-key match the tutor uses.
// This is a SIMULATION PROXY: a model learner is not a child. It measures whether the tutoring
// conversation carries what is needed to answer new items, not real learning.
//   npx tsx benchmarks/ltc-v2/outcome_quiz.ts --cases <outcome_cases.jsonl> --raw <raw_results.jsonl> --out <dir> --cap 1 --key-file <path> [--samples 3] [--dry]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { evaluateAgainstKey, type LessonItem } from '../../src/services/languageLearningState';
import { unitPriceUsd } from '../../src/services/priceCatalog';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const need = (k: string) => { const v = args.get(k); if (!v) throw new Error(`--${k} is required`); return v; };
const DRY = args.has('dry');
const CAP = Number(args.get('cap') ?? '1');
const N = Number(args.get('samples') ?? '3');
const MODEL = args.get('model') ?? 'claude-haiku-5-5';
const SUMMARY = args.has('summary');
const OUT = need('out');
mkdirSync(OUT, { recursive: true });
const KEY = DRY ? '' : readFileSync(need('key-file'), 'utf8').trim();
const cases = readFileSync(need('cases'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const raw = new Map(readFileSync(need('raw'), 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.caseId, r]; }));
let usd = 0;
let calls = 0;
const price = (k: 'input_token' | 'output_token') => unitPriceUsd('anthropic', MODEL, k) ?? NaN;

// Lenient scoring (primary): the answer contains an accepted answer as a whole phrase (normalised),
// and is not hedged between options ("Bred? Bread?", "X or Y"). Strict exact-key match is kept too.
const norm = (t: string) => ` ${t.toLowerCase().replace(/['’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
export function lenientCorrect(answer: string, accepted: string[]): boolean {
  const a = norm(answer);
  if (/\bor\b/i.test(answer) || (answer.match(/\?/g) ?? []).length >= 2) return false;
  return accepted.some((k) => { const n = norm(k).trim(); return n.length > 0 && a.includes(` ${n} `); });
}

async function ask(system: string, user: string): Promise<string> {
  calls += 1;
  if (DRY) return 'dry';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, output_config: { effort: "low" }, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await res.json() as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  usd += (j.usage?.input_tokens ?? 0) * price('input_token') + (j.usage?.output_tokens ?? 0) * price('output_token');
  if (!Number.isFinite(usd)) throw new Error('unpriced model');
  return (j.content ?? []).filter((b) => (b as { type?: string }).type === 'text').map((b) => b.text ?? '').join('').trim();
}

(async () => {
  const OUTF = path.join(OUT, `${DRY ? 'dry_' : ''}outcome_quiz.jsonl`);
  writeFileSync(OUTF, '');
  let stopped: string | null = null;
  for (const c of cases) {
    const r = raw.get(c.id);
    if (!r) { appendFileSync(OUTF, JSON.stringify({ caseId: c.id, missing: 'no tutoring transcript' }) + '\n'); continue; }
    const transcript = r.turns.map((t: { learner: string; reply: string | null }) => `YOU: ${t.learner}\nTUTOR: ${t.reply ?? ''}`).join('\n\n');
    const notes = `Lesson notes: ${c.notes.objective}\nSuccess criteria: ${c.notes.successCriteria.join('; ')}\nExamples: ${(c.notes.examples ?? []).join(' / ') || '(none)'}`;
    let conds: Record<string, string> = {
      pre: '(You have not had this lesson yet.)',
      control: `You have just read these class notes (no tutor):\n${notes}`,
      tutor: `You have just had this lesson with your tutor:\n${transcript}`,
    };
    const out: Record<string, unknown> = { caseId: c.id, skill: c.skill, cefr: c.cefr };
    if (SUMMARY) {
      // v2: the learner first writes what it now believes; the quiz is answered from that note only,
      // so it does not re-enact its own hesitant chat messages.
      const learned: Record<string, string> = {};
      for (const ck of ['control', 'tutor'] as const) {
        learned[ck] = await ask(`${c.simLearner.persona}\n\nWrite a short note to yourself (2-3 lines, as the learner): what is your rule for this lesson NOW? If nothing convinced you to change your belief, keep your old belief.`, conds[ck]);
      }
      out.learned = learned;
      conds = {
        pre: '(You have not had this lesson yet.)',
        control: `Your note to yourself after studying: ${learned.control}`,
        tutor: `Your note to yourself after the lesson: ${learned.tutor}`,
      };
    }
    for (const [qk, q] of Object.entries(c.quiz) as [string, { prompt: string; acceptedAnswers: string[] }][]) {
      const item = { id: qk, prompt: q.prompt, acceptedAnswers: q.acceptedAnswers } as LessonItem;
      for (const [ck, mem] of Object.entries(conds)) {
        const answers: string[] = [];
        for (let k = 0; k < N; k += 1) {
          if (usd >= CAP) { stopped = `cap $${CAP} reached in ${c.id}`; break; }
          answers.push(await ask(`${c.simLearner.persona}\n\nNow you take a short quiz on your own (no help). Reply with ONLY your answer, as the learner would write it.`, `${mem}\n\nQuiz question: ${q.prompt}`));
        }
        const strict = answers.filter((a) => Boolean(evaluateAgainstKey(a, item))).length;
        const correct = answers.filter((a) => lenientCorrect(a, q.acceptedAnswers)).length;
        out[`${qk}_${ck}`] = { answers, correct, strictCorrect: strict, n: answers.length };
      }
    }
    appendFileSync(OUTF, JSON.stringify(out) + '\n');
    console.log(c.id, `$${usd.toFixed(4)}`);
    if (stopped) break;
  }
  const status = { finishedAt: new Date().toISOString(), model: MODEL, samples: N, calls, meteredUsd: Number(usd.toFixed(6)), capUsd: CAP, stopped, dry: DRY };
  writeFileSync(path.join(OUT, `${DRY ? 'dry_' : ''}outcome_quiz_status.json`), JSON.stringify(status, null, 2));
  console.log('outcome quiz done', JSON.stringify(status));
})().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
