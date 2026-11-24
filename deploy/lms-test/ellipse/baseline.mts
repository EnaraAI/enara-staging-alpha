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
const cfg = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as { sample: number; seed: number; concurrency: number; split: 'test' | 'train'; datasets: string[] };
if (process.env.BASELINE_CONFIG) Object.assign(cfg, JSON.parse(process.env.BASELINE_CONFIG)); // e.g. {"datasets":["bench-en","bench-ar"]}

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

// ---- datasets (downloaded at run time from the official repositories; essay text never written or logged) ----
type Essay = { id: string; text: string; stem: string; lang: 'en' | 'ar'; human: Record<string, number>; raw: Record<string, number> };
let s0 = cfg.seed; const rnd = () => ((s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648);
const sample = (xs: Essay[]) => xs.map((e) => [rnd(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e).filter((e) => e.text.length <= 5000).slice(0, cfg.sample);
const csvJson = (csv: string, cols: string[]) => JSON.parse(execSync(`python3 -c "import csv,json,sys; print(json.dumps([{k:r.get(k,'') for k in json.loads(sys.argv[1])} for r in csv.DictReader(sys.stdin)]))" '${JSON.stringify(cols)}'`, { input: csv, maxBuffer: 1 << 29 }).toString()) as Record<string, string>[];
// 1-5 (ELLIPSE, half points) or 0-5 (LAILA) -> ENARA 0-2
const binEllipse = (x: number) => (x <= 2.5 ? 0 : x <= 3.5 ? 1 : 2);
const binLaila = (x: number) => (x <= 1 ? 0 : x <= 3 ? 1 : 2);
function loadEllipse(): Essay[] {
  const DATA = '/tmp/ellipse';
  if (!existsSync(DATA)) execSync(`git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git ${DATA}`);
  const pw = /password for the zip file is \*\*(\S+?)\*\*/.exec(readFileSync(join(DATA, 'README.md'), 'utf8'))![1]; // public in the README; never printed
  const csv = cfg.split === 'test'
    ? execSync(`python3 -c "import zipfile,sys,os; z=zipfile.ZipFile('${DATA}/ELLIPSE_Final_github_test.zip'); sys.stdout.write(z.read(z.namelist()[0], pwd=os.environ['PW'].encode()).decode('utf-8','replace'))"`, { env: { ...process.env, PW: pw }, maxBuffer: 1 << 28 }).toString()
    : readFileSync(join(DATA, 'ELLIPSE_Final_github_train.csv'), 'utf8');
  return sample(csvJson(csv, ['text_id_kaggle', 'full_text', 'prompt', 'Cohesion', 'Syntax', 'Vocabulary', 'Phraseology', 'Grammar', 'Conventions']).map((e) => {
    const n = (k: string) => Number(e[k]);
    const raw = { grammar_accuracy: (n('Grammar') + n('Syntax')) / 2, vocabulary_range: (n('Vocabulary') + n('Phraseology')) / 2, organisation: n('Cohesion'), mechanics: n('Conventions') };
    return { id: e.text_id_kaggle, text: e.full_text, stem: `Write an essay about: ${e.prompt}.`, lang: 'en' as const, raw, human: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, binEllipse(v)])) };
  }));
}
function loadLaila(): Essay[] {
  const DATA = '/tmp/laila';
  if (!existsSync(DATA)) execSync(`git clone -q --depth 1 https://gitlab.com/bigirqu/laila.git ${DATA}`);
  const prompts: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) { const p = JSON.parse(readFileSync(join(DATA, 'prompts', `prompt${i}.json`), 'utf8')); prompts[String(p.prompt_id ?? i)] = String(p.prompt_text); }
  const csv = readFileSync(join(DATA, 'essays_and_scores', 'all_essays_with_indivdual_rater_scores.csv'), 'utf8');
  return sample(csvJson(csv, ['essay_id', 'prompt_id', 'essay', 'relevance', 'organization', 'vocabulary', 'mechanics', 'grammar']).map((e) => {
    const n = (k: string) => Number(e[k]);
    const raw = { task_completion: n('relevance'), organisation: n('organization'), vocabulary_range: n('vocabulary'), mechanics: n('mechanics'), grammar_accuracy: n('grammar') };
    return { id: e.essay_id, text: e.essay, stem: prompts[e.prompt_id] ?? 'اكتب مقالًا.', lang: 'ar' as const, raw, human: { task_completion: raw.task_completion, organisation: binLaila(raw.organisation), vocabulary_range: binLaila(raw.vocabulary_range), mechanics: binLaila(raw.mechanics), grammar_accuracy: binLaila(raw.grammar_accuracy) } };
  }));
}

// ---- today's grader, unchanged ----
const mongoose = (await import(join(LIVE, 'node_modules/mongoose/index.js'))).default;
const { MongoMemoryServer } = await import(join(LIVE, 'node_modules/mongodb-memory-server/index.js'));
const mongo = await MongoMemoryServer.create(); process.env.MONGODB_URI = mongo.getUri(); await mongoose.connect(mongo.getUri());
const { gradeOpenAnswer } = await import(join(LIVE, 'src/assessment/grading-engine/open.ts'));
const { rubricFor } = await import(join(LIVE, 'src/assessment/rubrics/templates.ts'));

const qwk = (a: number[], b: number[], k = 3) => {
  const O = Array.from({ length: k }, () => Array(k).fill(0)); a.forEach((x, j) => O[x][b[j]]++);
  const n = a.length; const ha = Array(k).fill(0); const hb = Array(k).fill(0); a.forEach((x) => ha[x]++); b.forEach((x) => hb[x]++);
  let num = 0; let den = 0;
  for (let x = 0; x < k; x++) for (let y = 0; y < k; y++) { const w = ((x - y) ** 2) / ((k - 1) ** 2); num += w * O[x][y]; den += w * (ha[x] * hb[y]) / n; }
  return den ? Math.round((1 - num / den) * 1000) / 1000 : null;
};
const rank = (v: number[]) => { const o = v.map((x, j) => [x, j] as const).sort((p, q) => p[0] - q[0]); const r = Array(v.length); for (let j = 0; j < o.length;) { let k = j; while (k + 1 < o.length && o[k + 1][0] === o[j][0]) k++; for (let m = j; m <= k; m++) r[o[m][1]] = (j + k) / 2; j = k + 1; } return r as number[]; };
const spearman = (a: number[], b: number[]) => { const ra = rank(a); const rb = rank(b); const m = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length; const ma = m(ra); const mb = m(rb); let n = 0; let da = 0; let db = 0; ra.forEach((x, j) => { n += (x - ma) * (rb[j] - mb); da += (x - ma) ** 2; db += (rb[j] - mb) ** 2; }); return da && db ? Math.round((n / Math.sqrt(da * db)) * 1000) / 1000 : null; };
const r3 = (x: number) => Math.round(x * 1000) / 1000;

const results: Record<string, unknown> = {};
for (const ds of (cfg.datasets ?? ['ellipse']).filter((d) => !d.startsWith('bench-') && !d.startsWith('mishkat-'))) {
  const essays = ds === 'laila' ? loadLaila() : loadEllipse();
  const lang = essays[0]?.lang ?? 'en';
  const rubric = rubricFor('language', 'essay', lang)!;
  const maxByCriterion = Object.fromEntries(rubric.criteria.map((c: { id: string; maxPoints: number }) => [c.id, c.maxPoints]));
  const mapped = Object.keys(essays[0]?.human ?? {});
  type Row = { model: Record<string, number> | null; e: Essay; flagged: boolean; ms: number };
  const out: Row[] = []; let i = 0; const calls0 = relayCalls;
  const worker = async () => {
    while (i < essays.length) {
      const e = essays[i++]; const t0 = Date.now();
      const g = await gradeOpenAnswer({ attempt: { id: `${ds}-${e.id}` }, item: { questionId: String(e.id), stem: e.stem, type: 'essay', domain: 'language', language: e.lang }, answer: e.text, uiLanguage: e.lang, maxByCriterion, modelReady: true, options: { store: false, allowFallback: false } }).catch(() => null);
      const ok = g && g.grader !== 'none';
      out.push({ model: ok ? Object.fromEntries(g!.criterionScores.map((c: { criterionId: string; points: number }) => [c.criterionId, c.points])) : null, e, flagged: !!g?.flagged, ms: Date.now() - t0 });
      if (out.length % 25 === 0) console.log(ds, 'graded', out.length, 'of', essays.length);
    }
  };
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  const graded = out.filter((r) => r.model);
  const per = Object.fromEntries(mapped.map((c) => {
    const m = graded.map((r) => r.model![c]); const h = graded.map((r) => r.e.human[c]);
    return [c, { exact: r3(m.filter((x, j) => x === h[j]).length / m.length), within1: r3(m.filter((x, j) => Math.abs(x - h[j]) <= 1).length / m.length), qwk: qwk(m, h), spearmanVsRawHuman: spearman(m, graded.map((r) => r.e.raw[c])), modelMean: r3(m.reduce((x, y) => x + y, 0) / m.length), humanMean: r3(h.reduce((x, y) => x + y, 0) / h.length) }];
  }));
  const tm = graded.map((r) => mapped.reduce((n, c) => n + r.model![c], 0)); const th = graded.map((r) => mapped.reduce((n, c) => n + r.e.human[c], 0));
  const ms = graded.map((r) => r.ms).sort((a, b) => a - b);
  results[ds] = {
    n: out.length, graded: graded.length, errorRate: r3((out.length - graded.length) / out.length), flagRate: r3(out.filter((r) => r.flagged).length / out.length),
    mapping: ds === 'laila' ? 'LAILA 0-5 -> ENARA 0-2: 0-1 -> 0, 2-3 -> 1, 4-5 -> 2; relevance 0-2 = task_completion; style and development not in ENARA' : 'ELLIPSE 1-5 -> ENARA 0-2: <=2.5 -> 0, 3-3.5 -> 1, >=4 -> 2; grammar = mean(Grammar, Syntax); vocabulary = mean(Vocabulary, Phraseology); organisation = Cohesion; mechanics = Conventions; no task completion',
    perCriterion: per, total: { criteria: mapped.length, exact: r3(tm.filter((x, j) => x === th[j]).length / tm.length), within1: r3(tm.filter((x, j) => Math.abs(x - th[j]) <= 1).length / tm.length), spearman: spearman(tm, th) },
    latencyMs: { p50: ms[Math.floor(ms.length / 2)], p95: ms[Math.floor(ms.length * 0.95)] }, modelCalls: relayCalls - calls0,
    sampledIds: essays.map((e) => e.id), // ids only (to keep them out of any later training split)
  };
  console.log(ds, JSON.stringify({ ...(results[ds] as object), sampledIds: undefined }));
}
// ---- ENARA's own language benchmark (data/assessment-bench, in the repo; synthetic answers, so per-answer scores may be published) ----
for (const ds of (cfg.datasets ?? []).filter((d) => d.startsWith('bench-'))) {
  const lang = ds.slice(6) as 'en' | 'ar';
  const dset = await import(join(LIVE, 'src/assessment/bench/dataset.ts'));
  const set = dset.loadSet('language', lang, join(LIVE, '..', 'data', 'assessment-bench'));
  const items = new Map(set.items.map((it: { id: string }) => [it.id, it]));
  const rows: Record<string, unknown>[] = []; let i = 0; const calls0 = relayCalls;
  const worker = async () => {
    while (i < set.answers.length) {
      const a = set.answers[i++]; const it = items.get(a.itemId) as { id: string; domain: string; type: string; language: 'en' | 'ar'; points?: number; units?: string };
      const rubric = rubricFor(it.domain, it.type, it.language, { points: it.points, units: it.units })!;
      const maxByCriterion = Object.fromEntries(rubric.criteria.map((c: { id: string; maxPoints: number }) => [c.id, c.maxPoints]));
      const t0 = Date.now();
      const g = await gradeOpenAnswer({ attempt: { id: `aesbench-${a.id}` }, item: dset.openItemOf(it), answer: dset.answerTextOf ? dset.answerTextOf(a) : a.answer, uiLanguage: it.language, maxByCriterion, modelReady: true, options: { store: false, allowFallback: false } }).catch(() => null);
      const ok = g && g.grader !== 'none';
      rows.push({ id: a.id, itemId: it.id, type: it.type, band: a.band, gold: a.gold, max: maxByCriterion, ds: ok ? Object.fromEntries(g!.criterionScores.map((c: { criterionId: string; points: number }) => [c.criterionId, c.points])) : null, flagged: !!g?.flagged, ms: Date.now() - t0 });
      if (rows.length % 15 === 0) console.log(ds, 'graded', rows.length, 'of', set.answers.length);
    }
  };
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  const okRows = rows.filter((r) => r.ds);
  results[ds] = { n: rows.length, graded: okRows.length, flagRate: r3(rows.filter((r) => r.flagged).length / rows.length), modelCalls: relayCalls - calls0, perAnswer: rows };
  console.log(ds, 'done', okRows.length, 'of', rows.length);
}
// ---- Mishkat marker (a): DeepSeek marks the model-marked dev pool with the live v3b language rubric, ONE run per answer ----
for (const ds of (cfg.datasets ?? []).filter((d) => d.startsWith('mishkat-'))) {
  const name = ds.slice(8); // 'en' | 'ar' (the dev pool) or 'compare-en' | 'compare-ar' (answers Claude graded earlier)
  const { gradeOpenRun } = await import(join(LIVE, 'src/assessment/grading-engine/graders/domains/index.ts'));
  const file = name.startsWith('compare-') ? join(LIVE, '..', 'data', 'mishkat-dev', 'claude-compare', `${name}.json`) : name.startsWith('remark-') ? join(LIVE, '..', 'data', 'mishkat-dev', 'remark', `${name.slice(7)}.json`) : join(LIVE, '..', 'data', 'mishkat-dev', `pool-${name}.json`);
  const pool = JSON.parse(readFileSync(file, 'utf8')) as { id: string; stem: string; type: 'short_answer' | 'essay'; answer: string; lang?: 'en' | 'ar' }[];
  const langOf = (a: { lang?: 'en' | 'ar' }) => (a.lang ?? (name.endsWith('ar') ? 'ar' : 'en')) as 'en' | 'ar';
  const rows: Record<string, unknown>[] = []; let i = 0; const calls0 = relayCalls;
  const worker = async () => {
    while (i < pool.length) {
      const a = pool[i++];
      const r = await gradeOpenRun({ attempt: { id: `mishkat-${a.id}` }, item: { questionId: a.id, stem: a.stem, type: a.type, domain: 'language', language: langOf(a) }, answer: a.answer, uiLanguage: langOf(a), run: 1, options: { store: false, allowFallback: false } }).catch(() => null);
      const ok = r && r.status === 'proposed';
      rows.push({ id: a.id, marks: ok ? Object.fromEntries(r!.criterionScores.map((c: { criterionId: string; points: number }) => [c.criterionId, c.points])) : null, status: r?.status ?? 'error' });
      if (rows.length % 50 === 0) console.log(ds, 'marked', rows.length, 'of', pool.length);
    }
  };
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  rows.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  results[ds] = { n: rows.length, marked: rows.filter((r) => r.marks).length, modelCalls: relayCalls - calls0, perAnswer: rows };
  console.log(ds, 'done', (results[ds] as { marked: number }).marked, 'of', rows.length);
}
// ---- Egyptian test set (owner, 24 Nov 2026): Zenodo 10.5281/zenodo.18630360, CC BY 4.0, never trained on. Downloaded at run time;
// the same 300 answers as Mishkat's sample (every k-th valid row). v3b (one run per answer) as a short answer; numbers only. ----
if ((cfg.datasets ?? []).includes('egypt')) {
  const { gradeOpenRun } = await import(join(LIVE, 'src/assessment/grading-engine/graders/domains/index.ts'));
  const meta = await (await fetch('https://zenodo.org/api/records/18630360')).json() as { files: { key: string; links: { self: string } }[]; metadata: { license?: unknown } };
  const csvText = await (await fetch(meta.files.find((f) => f.key.endsWith('.csv'))!.links.self)).text();
  const all = csvJson(csvText, ['id', 'TeacherAnswer', 'StudentAnswer', 'degree']);
  const valid = all.filter((r) => r.StudentAnswer && r.StudentAnswer.trim() && Number.isFinite(Number(r.degree)) && Number(r.degree) >= 0 && Number(r.degree) <= 5);
  const k = Math.max(1, Math.floor(valid.length / 300)); const sample = valid.map((r, i) => ({ r, i })).filter((x) => x.i % k === 0).slice(0, 300);
  const rows: Record<string, unknown>[] = []; let j = 0; const calls0 = relayCalls;
  const worker = async () => {
    while (j < sample.length) {
      const { r, i } = sample[j++];
      const stem = `أجب عن سؤال في مادة علم الاجتماع. الإجابة النموذجية للمعلم: ${r.TeacherAnswer}`;
      const g = await gradeOpenRun({ attempt: { id: `egypt-${i}` }, item: { questionId: `egypt-${r.id}`, stem, type: 'short_answer', domain: 'language', language: 'ar' }, answer: r.StudentAnswer, uiLanguage: 'ar', run: 1, options: { store: false, allowFallback: false } }).catch(() => null);
      const ok = g && g.status === 'proposed';
      rows.push({ index: i, human: Number(r.degree), v3b: ok ? Object.fromEntries(g!.criterionScores.map((c: { criterionId: string; points: number }) => [c.criterionId, c.points])) : null, status: g?.status ?? 'error' });
    }
  };
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  rows.sort((a, b) => Number(a.index) - Number(b.index));
  results.egypt = { licence: meta.metadata.license, validRows: valid.length, k, n: rows.length, marked: rows.filter((r) => r.v3b).length, modelCalls: relayCalls - calls0, perAnswer: rows };
  console.log('egypt done', (results.egypt as { marked: number }).marked, 'of', rows.length);
}
const summary = { grader: "today's engine language essay grader (engine-v2), DeepSeek on lms-test via llm-compare; no fallback", relayErrors, results };
mkdirSync('out', { recursive: true });
writeFileSync('out/summary.json', JSON.stringify(summary, null, 1));
await mongoose.disconnect(); await mongo.stop(); server.close();
process.exit(0);
