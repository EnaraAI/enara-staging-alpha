// Baseline: TODAY'S engine language grader (unchanged, from lms-test-live) on ELLIPSE essays with human trait scores.
// ELLIPSE (Crossley et al. 2023, CC BY 4.0, github.com/scrosseye/ELLIPSE-Corpus) is downloaded at run time from its official repository;
// essays are never written to the repo, the results or the logs. Only numbers are written.
// The grader's model calls go through a local relay to lms-test's maintenance route llm-compare (DeepSeek on lms-test), so the model key never
// leaves lms-test. No fallback provider (allowFallback false); nothing stored (store false); a throwaway in-memory database.
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LIVE = process.env.LIVE_BACKEND!; // path to lms-test-live backend
const SITE = 'https://lms-test.enara.app';
const TOKEN = process.env.LMSTEST_MAINTENANCE_TOKEN!;
const cfg = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as { sample: number; seed: number; concurrency: number; split: 'test' | 'train' };

// ---- relay: OpenAI chat completions -> lms-test llm-compare ----
let relayCalls = 0; let relayErrors = 0;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  try {
    const body = JSON.parse(raw) as { messages: { role: string; content: string }[]; max_tokens?: number };
    const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = body.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    let j: { ok?: boolean; text?: string; usage?: { input_tokens?: number; output_tokens?: number }; stop?: string; reason?: string } = {};
    for (let i = 0; i < 4; i++) {
      const r = await fetch(`${SITE}/api/maintenance/llm-compare`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages, max_tokens: Math.min(body.max_tokens ?? 2000, 2000) }), signal: AbortSignal.timeout(90_000) }).catch(() => null);
      if (r && r.status === 200) { j = await r.json(); if (j.ok) break; }
      await new Promise((x) => setTimeout(x, 5000 * (i + 1)));
    }
    relayCalls++;
    if (!j.ok) { relayErrors++; res.writeHead(502); res.end(JSON.stringify({ error: { message: 'relay failed' } })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `relay-${relayCalls}`, choices: [{ index: 0, message: { role: 'assistant', content: j.text ?? '' }, finish_reason: j.stop === 'max_tokens' ? 'length' : 'stop' }], usage: { prompt_tokens: j.usage?.input_tokens ?? 0, completion_tokens: j.usage?.output_tokens ?? 0 } }));
  } catch { relayErrors++; res.writeHead(500); res.end('{}'); }
});
await new Promise<void>((r) => server.listen(18765, '127.0.0.1', () => r()));
Object.assign(process.env, {
  TUTOR_LLM_PROVIDER: 'deepseek', TUTOR_LLM_ENDPOINT: 'http://127.0.0.1:18765/v1', TUTOR_LLM_API_KEY: 'relay-local', TUTOR_LLM_MODEL: process.env.TUTOR_LLM_MODEL,
  ANTHROPIC_API_KEY: 'unused-by-the-baseline', ENARA_ENGINE_V2: 'assessGrading', NODE_ENV: 'test',
  JWT_SECRET: 'baseline-jwt-secret-32-characters-minimum-x', INGEST_HMAC_SECRET: 'baseline-hmac-secret-32-characters-minimum-x', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
});

// ---- data (official test split; the zip password is public in the dataset README and is never printed) ----
const DATA = '/tmp/ellipse';
if (!existsSync(DATA)) execSync(`git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git ${DATA}`);
const readme = readFileSync(join(DATA, 'README.md'), 'utf8');
const pw = /password for the zip file is \*\*(\S+?)\*\*/.exec(readme)![1];
const csvText = cfg.split === 'test'
  ? execSync(`python3 -c "import zipfile,sys; z=zipfile.ZipFile('${DATA}/ELLIPSE_Final_github_test.zip'); sys.stdout.write(z.read(z.namelist()[0], pwd=sys.argv[1].encode()).decode('utf-8','replace'))" "$PW"`, { env: { ...process.env, PW: pw }, maxBuffer: 1 << 28 }).toString()
  : readFileSync(join(DATA, 'ELLIPSE_Final_github_train.csv'), 'utf8');
const rows = execSync(`python3 -c "import csv,json,sys; print(json.dumps([{k:r[k] for k in ('text_id_kaggle','full_text','prompt','Cohesion','Syntax','Vocabulary','Phraseology','Grammar','Conventions','Overall')} for r in csv.DictReader(sys.stdin)]))"`, { input: csvText, maxBuffer: 1 << 28 }).toString();
let essays = JSON.parse(rows) as Record<string, string>[];
// seeded shuffle, then the first N whose request fits llm-compare's 8 000-character message limit
let s = cfg.seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
essays = essays.map((e) => [rnd(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e).filter((e) => e.full_text.length <= 5500).slice(0, cfg.sample);

// ---- today's grader, unchanged ----
const mongoose = (await import(join(LIVE, 'node_modules/mongoose/index.js'))).default;
const { MongoMemoryServer } = await import(join(LIVE, 'node_modules/mongodb-memory-server/index.js'));
const mongo = await MongoMemoryServer.create(); process.env.MONGODB_URI = mongo.getUri(); await mongoose.connect(mongo.getUri());
const { gradeOpenAnswer } = await import(join(LIVE, 'src/assessment/grading-engine/open.ts'));
const { rubricFor } = await import(join(LIVE, 'src/assessment/rubrics/templates.ts'));
const rubric = rubricFor('language', 'essay', 'en')!;
const maxByCriterion = Object.fromEntries(rubric.criteria.map((c: { id: string; maxPoints: number }) => [c.id, c.maxPoints]));

// ELLIPSE (1-5, half points) -> ENARA 0-2: <= 2.5 -> 0, 3-3.5 -> 1, >= 4 -> 2.
const bin = (x: number) => (x <= 2.5 ? 0 : x <= 3.5 ? 1 : 2);
const human = (e: Record<string, string>) => {
  const n = (k: string) => Number(e[k]);
  return { grammar_accuracy: (n('Grammar') + n('Syntax')) / 2, vocabulary_range: (n('Vocabulary') + n('Phraseology')) / 2, organisation: n('Cohesion'), mechanics: n('Conventions') };
};
const MAPPED = ['grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics'] as const;
type Row = { model: Record<string, number> | null; human: Record<string, number>; flagged: boolean; ms: number };
const out: Row[] = [];
let i = 0;
async function worker() {
  while (i < essays.length) {
    const e = essays[i++];
    const t0 = Date.now();
    const g = await gradeOpenAnswer({ attempt: { id: `ellipse-${e.text_id_kaggle}` }, item: { questionId: e.text_id_kaggle, stem: `Write an essay about: ${e.prompt}.`, type: 'essay', domain: 'language', language: 'en' }, answer: e.full_text, uiLanguage: 'en', maxByCriterion, modelReady: true, options: { store: false, allowFallback: false } }).catch(() => null);
    const ok = g && g.grader !== 'none';
    out.push({ model: ok ? Object.fromEntries(g!.criterionScores.map((c: { criterionId: string; points: number }) => [c.criterionId, c.points])) : null, human: human(e), flagged: !!g?.flagged, ms: Date.now() - t0 });
    if (out.length % 20 === 0) console.log('graded', out.length, 'of', essays.length);
  }
}
await Promise.all(Array.from({ length: cfg.concurrency }, worker));

// ---- metrics (numbers only) ----
const qwk = (a: number[], b: number[], k = 3) => {
  const O = Array.from({ length: k }, () => Array(k).fill(0)); a.forEach((x, j) => O[x][b[j]]++);
  const n = a.length; const ha = Array(k).fill(0); const hb = Array(k).fill(0); a.forEach((x) => ha[x]++); b.forEach((x) => hb[x]++);
  let num = 0; let den = 0;
  for (let x = 0; x < k; x++) for (let y = 0; y < k; y++) { const w = ((x - y) ** 2) / ((k - 1) ** 2); num += w * O[x][y]; den += w * (ha[x] * hb[y]) / n; }
  return den ? Math.round((1 - num / den) * 1000) / 1000 : null;
};
const rank = (v: number[]) => { const o = v.map((x, j) => [x, j] as const).sort((p, q) => p[0] - q[0]); const r = Array(v.length); for (let j = 0; j < o.length;) { let k = j; while (k + 1 < o.length && o[k + 1][0] === o[j][0]) k++; for (let m = j; m <= k; m++) r[o[m][1]] = (j + k) / 2; j = k + 1; } return r as number[]; };
const spearman = (a: number[], b: number[]) => { const ra = rank(a); const rb = rank(b); const m = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length; const ma = m(ra); const mb = m(rb); let n = 0; let da = 0; let db = 0; ra.forEach((x, j) => { n += (x - ma) * (rb[j] - mb); da += (x - ma) ** 2; db += (rb[j] - mb) ** 2; }); return Math.round((n / Math.sqrt(da * db)) * 1000) / 1000; };
const graded = out.filter((r) => r.model);
const per = Object.fromEntries(MAPPED.map((c) => {
  const m = graded.map((r) => r.model![c]); const h = graded.map((r) => bin(r.human[c]));
  return [c, { exact: Math.round((m.filter((x, j) => x === h[j]).length / m.length) * 1000) / 1000, within1: Math.round((m.filter((x, j) => Math.abs(x - h[j]) <= 1).length / m.length) * 1000) / 1000, qwk: qwk(m, h), spearmanVsRawHuman: spearman(m, graded.map((r) => r.human[c])), modelMean: Math.round((m.reduce((x, y) => x + y, 0) / m.length) * 100) / 100, humanMean: Math.round((h.reduce((x, y) => x + y, 0) / h.length) * 100) / 100 }];
}));
const tm = graded.map((r) => MAPPED.reduce((n, c) => n + r.model![c], 0)); const th = graded.map((r) => MAPPED.reduce((n, c) => n + bin(r.human[c]), 0));
const ms = graded.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  dataset: 'ELLIPSE (CC BY 4.0), official test split', grader: "today's engine language essay grader (engine-v2), DeepSeek on lms-test via llm-compare", n: out.length, graded: graded.length,
  errorRate: Math.round(((out.length - graded.length) / out.length) * 1000) / 1000, flagRate: Math.round((out.filter((r) => r.flagged).length / out.length) * 1000) / 1000,
  mapping: 'ELLIPSE 1-5 -> ENARA 0-2: <=2.5 -> 0, 3-3.5 -> 1, >=4 -> 2; grammar = mean(Grammar, Syntax); vocabulary = mean(Vocabulary, Phraseology); organisation = Cohesion; mechanics = Conventions; task_completion not in ELLIPSE',
  perCriterion: per,
  total4: { exact: Math.round((tm.filter((x, j) => x === th[j]).length / tm.length) * 1000) / 1000, within1: Math.round((tm.filter((x, j) => Math.abs(x - th[j]) <= 1).length / tm.length) * 1000) / 1000, spearman: spearman(tm, th) },
  latencyMs: { p50: ms[Math.floor(ms.length / 2)], p95: ms[Math.floor(ms.length * 0.95)] }, modelCalls: relayCalls, relayErrors,
};
mkdirSync('out', { recursive: true });
writeFileSync('out/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await mongoose.disconnect(); await mongo.stop(); server.close();
process.exit(0);
