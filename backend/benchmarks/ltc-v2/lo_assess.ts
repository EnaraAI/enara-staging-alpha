// ENARA LO experiment, assessment stage (simulated learners; NOT real-learner evidence).
// For each tutored learner (same persona as in its ENARA session) and each condition:
//   A tutor   - note written by the learner after its recorded ENARA tutoring session
//   B none    - no instruction (no note)
//   C static  - note written after reading the lesson's static material (objectives, rules, examples)
//   D misleading - validity probe: note written after material that restates the learner's own belief
// Stages: pre (before anything, shared), post, transfer, ret1 (short delay), ret2 (long delay).
// Retention applies the profile's transparent forgetting model to the note (full / first line / none);
// no answers or feedback are ever shown between stages. Each item is answered N times; an item counts
// as correct when a majority of samples match the frozen key (deterministic, blind to the condition).
//   npx tsx benchmarks/ltc-v2/lo_assess.ts --cases lo_cases.jsonl --bank lo_assessment_bank.json --raw raw_results.jsonl --out <dir> --cap 6 --key-file <path> [--samples 3] [--concurrency 10] [--dry]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { unitPriceUsd } from '../../src/services/priceCatalog';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const need = (k: string) => { const v = args.get(k); if (!v) throw new Error(`--${k} is required`); return v; };
const DRY = args.has('dry');
const CAP = Number(args.get('cap') ?? '6');
const N = Number(args.get('samples') ?? '3');
const CONC = Number(args.get('concurrency') ?? '10');
const MODEL = args.get('model') ?? 'claude-haiku-5-5';
const OUT = need('out');
mkdirSync(OUT, { recursive: true });
const KEY = DRY ? '' : readFileSync(need('key-file'), 'utf8').trim();
const cases = readFileSync(need('cases'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const bank = JSON.parse(readFileSync(need('bank'), 'utf8'));
const raw = new Map(readFileSync(need('raw'), 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.caseId, r]; }));
const price = (k: 'input_token' | 'output_token') => unitPriceUsd('anthropic', MODEL, k) ?? NaN;
let usd = 0;
let calls = 0;

const norm = (t: string) => ` ${t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
export function keyMatch(answer: string, accepted: string[]): boolean {
  if (/\bor\b/i.test(answer) || (answer.match(/\?/g) ?? []).length >= 2) return false; // hedged between options
  const a = norm(answer);
  return accepted.some((k) => { const n = norm(k).trim(); return n.length > 0 && a.includes(` ${n} `); });
}

async function ask(system: string, user: string, maxTokens = 1500): Promise<string> {
  calls += 1;
  if (DRY) return 'dry';
  let j: { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } } | null = null;
  for (let attempt = 1; attempt <= 10 && !j; attempt += 1) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: user }] }),
      });
      const body = await res.text();
      if (res.ok) j = JSON.parse(body);
      else if (res.status === 400 || res.status === 404) throw Object.assign(new Error(`api ${res.status}`), { fatal: true });
    } catch (e) { if ((e as { fatal?: boolean }).fatal) throw e; }
    if (!j) await new Promise((r) => setTimeout(r, Math.min(120000, 3000 * 2 ** attempt)));
  }
  if (!j) throw new Error('API unavailable after 10 attempts');
  usd += (j.usage?.input_tokens ?? 0) * price('input_token') + (j.usage?.output_tokens ?? 0) * price('output_token');
  if (!Number.isFinite(usd)) throw new Error('unpriced model');
  return (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
}

const forgetNote = (note: string, mode: string) => (mode === 'full' ? note : mode === 'first_line' ? (note.split(/\n|(?<=[.!?])\s/)[0] ?? '') : '');

(async () => {
  const OUTF = path.join(OUT, `${DRY ? 'dry_' : ''}lo_assessment.jsonl`);
  writeFileSync(OUTF, '');
  let stopped: string | null = null;
  // learners are independent: process CONC of them at a time
  const processCase = async (c: any) => {
    if (usd >= CAP) { stopped = `cap $${CAP} reached before ${c.id}`; return; }
    const r = raw.get(c.id);
    const o = bank.outcomes.find((x: { id: string }) => x.id === c.lo);
    const p = bank.profiles.find((x: { id: string }) => x.id === c.profile);
    const persona = c.simLearner.persona;
    const quizSys = `${persona}\n\nNow you take a short quiz on your own (no help, no notes except what is given). Answer as this learner really would, with your current knowledge and habits. Reply with ONLY your answer.`;
    const noteSys = `${persona}\n\nWrite a short note to yourself (2-3 lines, as this learner): what is your rule for this point NOW? If nothing convinced you to change your belief, keep your old belief. Do not invent rules you were not taught.`;
    const rec: Record<string, unknown> = { caseId: c.id, lo: c.lo, profile: c.profile, cefr: c.cefr, tutored: Boolean(r), turns: r?.turns?.length ?? 0 };
    const answerStage = async (stage: string, mem: string) => {
      const out: { prompt: string; answers: string[]; correctSamples: number; itemCorrect: boolean }[] = [];
      for (const it of o[stage] as { prompt: string; accepted: string[] }[]) {
        const answers: string[] = [];
        for (let k = 0; k < N; k += 1) answers.push(await ask(quizSys, `${mem}\n\nQuiz question: ${it.prompt}`, 1500));
        const cs = answers.filter((a) => keyMatch(a, it.accepted)).length;
        out.push({ prompt: it.prompt, answers, correctSamples: cs, itemCorrect: cs * 2 > answers.length });
      }
      return out;
    };
    rec.pre = await answerStage('pre', '(You have not had this lesson yet.)');
    const material = bank.staticMaterial[o.lesson];
    const staticText = `Lesson: ${material.title}. ${material.objective}\nObjectives: ${(material.spec.objectives ?? []).join('; ')}\nSuccess criteria: ${(material.spec.successCriteria ?? []).join('; ')}\nGrammar: ${(material.spec.grammar ?? []).join('; ')}\nExamples: ${(material.spec.examples ?? []).join(' / ')}`;
    const transcript = r ? r.turns.map((t: { learner: string; reply: string | null }) => `YOU: ${t.learner}\nTUTOR: ${t.reply ?? ''}`).join('\n\n') : '';
    const notes: Record<string, string> = {
      A: r ? await ask(noteSys, `You have just had this lesson with your tutor:\n${transcript}`, 1500) : '',
      B: '',
      C: await ask(noteSys, `You have just read this study material (no tutor):\n${staticText}`, 1500),
      D: await ask(noteSys, `You have just read this note from a classmate (no tutor): "${o.belief}"`, 1500),
    };
    rec.notes = notes;
    const forget = bank.forget[p.forget] as { short: string; long: string };
    for (const g of ['A', 'B', 'C', 'D']) {
      if (g === 'A' && !r) continue;
      const mem = (n: string, label: string) => (n ? `Your note to yourself ${label}: ${n}` : '(You have not studied this point.)');
      rec[`${g}_post`] = await answerStage('post', mem(notes[g], 'after studying'));
      rec[`${g}_transfer`] = await answerStage('transfer', mem(notes[g], 'after studying'));
      rec[`${g}_ret1`] = await answerStage('ret1', mem(forgetNote(notes[g], forget.short), 'from some days ago (this is what you still remember)'));
      rec[`${g}_ret2`] = await answerStage('ret2', mem(forgetNote(notes[g], forget.long), 'from weeks ago (this is what you still remember)'));
    }
    appendFileSync(OUTF, JSON.stringify(rec) + '\n');
    console.log(c.id, `$${usd.toFixed(4)}`);
  };
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (next < cases.length) { const c = cases[next++]; await processCase(c); } }));
  const status = { finishedAt: new Date().toISOString(), model: MODEL, samples: N, calls, meteredUsd: Number(usd.toFixed(6)), capUsd: CAP, stopped, dry: DRY };
  writeFileSync(path.join(OUT, `${DRY ? 'dry_' : ''}lo_assessment_status.json`), JSON.stringify(status, null, 2));
  console.log('lo assessment done', JSON.stringify(status));
})().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
