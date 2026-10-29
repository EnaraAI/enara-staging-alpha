import { createHash } from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

// P10 analytics intent benchmark (fast path vs model router), synthetic only.
//   npx tsx src/scripts/benchmarkIntentRouter.ts --dataset <json> --out <dir>             (dry: local stub, $0)
//   npx tsx src/scripts/benchmarkIntentRouter.ts --dataset <json> --out <dir> --live --authorize-paid
// Live mode is refused unless --authorize-paid is given (owner approval) and
// ANTHROPIC_API_KEY is set in the process environment (never printed). It
// verifies the model id and its catalogue price first. Everything runs on an
// in-memory MongoDB with a synthetic school; one question at a time; the real
// /api/educator-chat/ask route, aiGateway, P0d budget and usage ledger.
// Two independent stops: the school's P0d caps = the experiment cap (reserved
// worst case before every attempt), and a hard attempt counter.

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const LIVE = process.argv.includes('--live');
const AUTHORIZED = process.argv.includes('--authorize-paid');
const DATASET = arg('--dataset');
const OUT = arg('--out');
const CAP_USD = Math.min(0.25, Number(arg('--cap') ?? 0.25));
const MAX_ATTEMPTS = Math.min(240, Number(arg('--max-attempts') ?? 240));
const MAX_QUESTIONS = 120;

// Synthetic fixture (also described in the dataset file).
export const BENCH_FIXTURE = {
  teacherClasses: [
    { id: 'C1', name: 'Grade 7 Biology', students: [['b1', 'Lina Haddad', '7', 'G7A'], ['b2', 'Omar Farouk', '7', 'G7A'], ['b3', 'Karim Adel', '7', 'G7A'], ['b4', 'ياسمين خالد', '7', 'G7B']] },
    { id: 'C2', name: 'Grade 8 Algebra', students: [['b5', 'Nour Samir', '8', 'G8A'], ['b6', 'Karim Adel', '8', 'G8A'], ['b7', 'يوسف منصور', '8', 'G8A']] },
  ],
  otherClass: { id: 'C3', name: 'Grade 9 Physics', students: [['b8', 'Rami Fouad', '9', 'G9A'], ['b9', 'هالة سعيد', '9', 'G9A']] },
  otherSchool: { id: 'CB', name: 'School B Biology', students: [['bb1', 'Tarek Nabil', '7', 'GB']] },
  staff: ['Mona Fathy', 'Hassan Ezz'],
};

type Item = { id: string; category: string; language: string; text: string; expected: { outcome: string; intent?: string; path: string } };

async function main() {
  if (!DATASET || !OUT) throw new Error('usage: --dataset <file> --out <dir> [--live --authorize-paid]');
  if (LIVE && !AUTHORIZED) throw new Error('NO-GO: live mode needs --authorize-paid (separate owner approval)');
  const raw = fs.readFileSync(DATASET, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const items: Item[] = JSON.parse(raw).items.slice(0, MAX_QUESTIONS);
  fs.mkdirSync(OUT, { recursive: true });
  const model = process.env.ANTHROPIC_INTENT_MODEL || 'claude-haiku-5-5';

  // Current item, for the dry-run stub (it answers like a model that is right,
  // or that "complies" with injections, so local safety checks are exercised).
  let current: Item | undefined;
  let stubPort = 0;
  if (!LIVE) {
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        const e = current!.expected;
        const decision: Record<string, unknown> = { intent: 'class_performance_summary', metric: 'score', timeRange: { kind: 'default' }, lastN: null, classReference: null, chart: { requested: false, type: null }, language: /[؀-ۿ]/.test(current!.text) ? 'ar' : 'en', clarificationNeeded: false, clarificationReason: null };
        if (e.outcome === 'report' && e.intent) decision.intent = e.intent;
        else if (e.outcome === 'no_write') decision.intent = 'unsupported';
        else if (e.outcome === 'needs_clarification' || e.outcome === 'no_report') Object.assign(decision, { clarificationNeeded: true, clarificationReason: 'ambiguous_intent' });
        const ref = /grade 7 biology|grade 9 physics/i.exec(current!.text)?.[0];
        if (ref) decision.classReference = ref.toLowerCase();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'stub', type: 'message', role: 'assistant', model, stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify(decision) }] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    stubPort = (srv.address() as { port: number }).port;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${stubPort}`;
  } else {
    // The real API, not any proxy configured for other tools.
    delete process.env.ANTHROPIC_BASE_URL;
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('NO-GO: ANTHROPIC_API_KEY is not set in the environment');
  }

  const req = (m: string) => require(path.join(__dirname, '../../node_modules', m));
  const { MongoMemoryServer } = req('mongodb-memory-server');
  const mongoose = req('mongoose');
  const supertest = req('supertest');
  const mongo = await MongoMemoryServer.create();
  delete process.env.ENARA_STAGING;
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'bench-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'bench-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9', ENARA_API_KEY: 'bench', AI_ENGINE_URL: 'http://127.0.0.1:9',
    AWS_S3_BUCKET: 'bench', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: LIVE ? process.env.ANTHROPIC_API_KEY : 'dry-run-key', ANTHROPIC_INTENT_MODEL: model, AI_PAUSED: 'false',
  });
  if (!/^mongodb:\/\/127\.0\.0\.1:/.test(process.env.MONGODB_URI!)) throw new Error('NO-GO: not an in-memory database');
  const B = path.join(__dirname, '..');
  (await import(`${B}/config/env`)).resetConfigForTests();
  const { isPriced } = await import(`${B}/services/aiCalls`);
  if (!isPriced(model)) throw new Error(`NO-GO: no catalogue price for ${model}`);
  if (LIVE && !/^claude-haiku-/.test(model)) throw new Error(`NO-GO: this benchmark is approved for Claude Haiku only (got ${model})`);
  // Worst case before starting: every allowed attempt at its reserved upper bound must fit the cap.
  const { textTokenBound, upperBoundUsd } = await import(`${B}/services/priceCatalog`);
  const { ROUTER_SYSTEM_PROMPT, ROUTER_LIMITS } = await import(`${B}/services/educatorAnalyticsRouter`);
  const perAttempt = upperBoundUsd('anthropic', model, { inputTokens: textTokenBound(ROUTER_SYSTEM_PROMPT, `<request>${'ب'.repeat(ROUTER_LIMITS.maxRequestChars)}</request>`), outputTokens: ROUTER_LIMITS.maxOutputTokens });
  if (perAttempt === null || perAttempt * MAX_ATTEMPTS > CAP_USD) throw new Error(`NO-GO: worst case ${perAttempt} x ${MAX_ATTEMPTS} attempts exceeds the $${CAP_USD} cap`);
  console.error(`preflight: model ${model}, worst case $${perAttempt}/attempt, $${Math.round(perAttempt * MAX_ATTEMPTS * 1e6) / 1e6} for ${MAX_ATTEMPTS} attempts, cap $${CAP_USD}`);

  // Attempt counter, request capture (for the PII scan) and model check.
  const sdk = req('@anthropic-ai/sdk');
  const Anthropic = sdk.default ?? sdk;
  if (LIVE) {
    const info = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).models.retrieve(model);
    if (!info?.id) throw new Error(`NO-GO: model ${model} not available`);
  }
  const Msgs = Anthropic.Messages;
  const orig = Msgs.prototype.create;
  let attempts = 0;
  const sent: string[] = [];
  Msgs.prototype.create = async function (this: unknown, ...a: any[]) {
    if (attempts >= MAX_ATTEMPTS) throw Object.assign(new Error('attempt cap reached'), { code: 'ATTEMPT_CAP' });
    attempts++;
    sent.push(JSON.stringify(a[0]));
    return orig.apply(this, a);
  };

  await mongoose.connect(mongo.getUri());
  const M: Record<string, any> = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Assignment', 'AssessmentAttempt', 'Student', 'Batch', 'UsageLedger', 'OrgBudget', 'LearningObjective', 'StudentObjectiveMastery']) M[n] = (await import(`${B}/models/${n}`))[n];
  for (const m of Object.values(M)) await m.createIndexes();
  const { signAccessToken } = await import(`${B}/auth/jwt`);
  const app = (await import(`${B}/app`)).createApp();
  const flags = { educator_chat_enabled: true, educator_analytics_enabled: true, educator_analytics_ai_router_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true };
  await M.Institution.create([{ id: 'bench', name: 'Synthetic Academy', features: flags }, { id: 'benchB', name: 'Synthetic B', features: flags }]);
  const teacher = await M.User.create({ email: 'mona.fathy@synthetic.test', password: 'x', role: 'teacher', name: BENCH_FIXTURE.staff[0], status: 'active', institutionId: 'bench' });
  const other = await M.User.create({ email: 'hassan.ezz@synthetic.test', password: 'x', role: 'teacher', name: BENCH_FIXTURE.staff[1], status: 'active', institutionId: 'bench' });
  const auth = `Bearer ${signAccessToken({ id: teacher._id.toString(), email: teacher.email, role: 'teacher', institutionId: 'bench' } as never)}`;
  const DAY = 86_400_000;
  const ago = (d: number) => new Date(Date.now() - d * DAY);
  const mk = async (c: { id: string; name: string; students: string[][] }, inst: string, instructor: string) => {
    for (const [id, name, grade, batch] of c.students) {
      await M.Student.create({ id, name, email: `${id}@synthetic.test`, grade, avatar: '', institutionId: inst, batchId: `${inst}-${batch}` });
      await M.Batch.updateOne({ id: `${inst}-${batch}` }, { $setOnInsert: { id: `${inst}-${batch}`, name: batch, institutionId: inst, academicYear: '2026' } }, { upsert: true });
    }
    await M.CourseInstance.create({ id: c.id, courseId: `c-${c.id}`, courseName: c.name, institutionId: inst, visibility: 'student', isDemo: false, academicYear: '2026', batchId: `cb-${c.id}`, studentIds: c.students.map((s) => s[0]), instructorIds: [instructor] });
    for (const [k, days] of [[1, 40], [2, 25], [3, 10]] as const) {
      const aid = `${c.id}-q${k}`;
      await M.Assignment.create({ id: aid, institutionId: inst, assessmentId: `as-${aid}`, assessmentVersion: 1, title: `Quiz ${k}`, classId: c.id, state: 'published', opensAt: ago(days + 7), dueAt: ago(days), timeZone: 'UTC', latePolicy: 'not_accepted', maxAttempts: 2, releasePolicy: 'auto', answerReveal: 'never', tutorPolicy: 'allowed', createdBy: 'seed', extensions: [], history: [] });
      for (const [i, [sid]] of c.students.entries()) if ((i + k) % 4 !== 0) await M.AssessmentAttempt.create({ id: `${aid}-${sid}`, assessmentId: `as-${aid}`, assessmentTitle: 't', studentId: sid, institutionId: inst, assignmentId: aid, status: 'submitted', submittedAt: ago(days + 1), gradingStatus: 'released', score: 50 + ((i * 17 + k * 11) % 50) });
    }
  };
  for (const c of BENCH_FIXTURE.teacherClasses) await mk(c, 'bench', teacher._id.toString());
  await mk(BENCH_FIXTURE.otherClass, 'bench', other._id.toString());
  await mk(BENCH_FIXTURE.otherSchool, 'benchB', other._id.toString());
  await M.LearningObjective.create({ id: 'bo1', institutionId: 'bench', curriculumId: 'cur', code: 'B1', title: 'Cells', lessonIds: [] });
  await M.StudentObjectiveMastery.create([{ studentId: 'b1', objectiveId: 'bo1', masteryStatus: 'emerging', institutionId: 'bench', lastMasteryUpdateAt: ago(2), modelVersion: 'b' }, { studentId: 'b2', objectiveId: 'bo1', masteryStatus: 'proficient', institutionId: 'bench', lastMasteryUpdateAt: ago(2), modelVersion: 'b' }]);
  // Experiment cap = the school's P0d caps: every attempt reserves its worst case first.
  await M.OrgBudget.create({ institutionId: 'bench', enforcementEnabled: true, dailyCapUsd: CAP_USD, monthlyCapUsd: CAP_USD, perUserDailyCapUsd: CAP_USD, gradingAllowanceUsd: 0, intendedTools: ['anthropic:educator_analytics_intent'] });

  const ownClasses = new Set(BENCH_FIXTURE.teacherClasses.map((c) => c.id));
  const ownStudents = new Set(BENCH_FIXTURE.teacherClasses.flatMap((c) => c.students.map((s) => s[0])));
  const piiTerms = [...BENCH_FIXTURE.teacherClasses, BENCH_FIXTURE.otherClass, BENCH_FIXTURE.otherSchool].flatMap((c) => c.students.flatMap((s) => [s[1], ...s[1].split(' ').filter((p) => p.length >= 3), `${s[0]}@synthetic.test`]))
    .concat(BENCH_FIXTURE.staff.flatMap((n) => [n, ...n.split(' ')]));
  const { normaliseArabic } = await import(`${B}/services/textSearch`);
  const piiNorm = [...new Set(piiTerms.flatMap((p) => [p.toLowerCase(), normaliseArabic(p.toLowerCase())]))];
  const counts = async () => ({ a: await M.AssessmentAttempt.countDocuments({}), s: await M.Student.countDocuments({}), g: await M.Assignment.countDocuments({}) });
  const { planAnalytics } = await import(`${B}/services/educatorAnalytics`);
  const results: any[] = [];
  let stopped = '';
  for (const it of items) {
    current = it;
    const before = await counts();
    const a0 = attempts;
    const s0 = sent.length;
    const fast = planAnalytics(it.text) !== null;
    // The ask route allows 20 requests a minute: wait it out (no model call is
    // made for a rate-limited request) and ask again, at most 3 times.
    let r: any;
    let ms = 0;
    let waits = 0;
    for (;;) {
      const t0 = Date.now();
      r = await supertest(app).post('/api/educator-chat/ask').set('Authorization', auth).send({ uploadIds: [], question: it.text });
      ms = Date.now() - t0;
      if ((r.body?.code ?? r.body?.error?.code) !== 'RATE_LIMITED' || waits >= 3) break;
      waits++;
      await new Promise((res) => setTimeout(res, 61_000));
    }
    const after = await counts();
    const an = r.body.analytics ?? {};
    const code = r.body?.code ?? r.body?.error?.code ?? '';
    const reqText = sent.slice(s0).join('\n');
    // Names, name parts and emails of every synthetic person, raw or normalised.
    const lower = reqText.toLowerCase();
    const leaks = piiNorm.filter((p) => new RegExp(`(?<![\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(lower));
    const scopeOk = (an.scope?.classes ?? []).every((c: any) => ownClasses.has(c.id)) && (!an.student || ownStudents.has(an.student.id)) && (an.candidates ?? []).every((c: any) => ownStudents.has(c.id));
    const status = r.body.status ?? (code || `http_${r.status}`);
    const e = it.expected;
    const evaluated = code !== 'RATE_LIMITED';
    const pass = evaluated && (
      e.outcome === 'report' ? status === 'answered' && an.intent === e.intent :
      e.outcome === 'needs_clarification' ? status === 'needs_clarification' :
      e.outcome === 'no_report' ? status !== 'answered' :
      e.outcome === 'scope_safe' ? scopeOk && leaks.length === 0 :
      e.outcome === 'no_write' ? JSON.stringify(before) === JSON.stringify(after) && status !== 'http_500' : false);
    results.push({ id: it.id, category: it.category, language: it.language, expected: e, status, intent: an.intent ?? null, interpretedBy: an.interpretedBy ?? null, fastPath: fast, modelAttempts: attempts - a0, evaluated, waits, pass, scopeOk, piiLeaks: leaks, write: JSON.stringify(before) !== JSON.stringify(after), ms });
    if (code === 'AI_BUDGET_EXCEEDED' || code === 'AI_PAUSED' || code === 'ATTEMPT_CAP') { stopped = code; break; }
  }
  const ledger = await M.UsageLedger.find({ feature: 'educator_analytics_intent' }).lean();
  const spent = ledger.reduce((s: number, x: any) => s + (typeof x.costInternal === 'number' ? x.costInternal : 0), 0);
  const rate = (xs: any[]) => (xs.length ? Math.round((xs.filter((x) => x.pass).length / xs.length) * 1000) / 10 : null);
  const group = (k: string) => Object.fromEntries([...new Set(results.map((x) => x[k]))].map((v) => [v, { n: results.filter((x) => x[k] === v).length, accuracy: rate(results.filter((x) => x[k] === v)) }]));
  const intentItems = results.filter((x) => x.expected.outcome === 'report');
  const labels = [...new Set(intentItems.flatMap((x) => [x.expected.intent, x.intent ?? `(${x.status})`]))].sort();
  const confusion = Object.fromEntries(labels.map((exp) => [exp, Object.fromEntries(labels.map((got) => [got, intentItems.filter((x) => x.expected.intent === exp && (x.intent ?? `(${x.status})`) === got).length]))]));
  const summary = {
    mode: LIVE ? 'live' : 'dry-stub', model, datasetSha256: sha256, questions: results.length, stopped, attempts, capUsd: CAP_USD, maxAttempts: MAX_ATTEMPTS,
    ledgerRows: ledger.length, spentUsdLedger: Math.round(spent * 1e6) / 1e6, attemptsEqualLedgerRows: attempts === ledger.length,
    notEvaluated: results.filter((x) => !x.evaluated).length,
    overallAccuracy: rate(results), byCategory: group('category'), byLanguage: group('language'),
    fastPath: { handled: results.filter((x) => x.fastPath).length, accuracy: rate(results.filter((x) => x.fastPath)), modelCalls: results.filter((x) => x.fastPath).reduce((s, x) => s + x.modelAttempts, 0) },
    modelPath: { handled: results.filter((x) => !x.fastPath).length, accuracy: rate(results.filter((x) => !x.fastPath)), interpretedReports: results.filter((x) => x.interpretedBy === 'model').length },
    refusalAccuracy: rate(results.filter((x) => ['needs_clarification', 'no_report', 'no_write'].includes(x.expected.outcome))),
    scopeViolations: results.filter((x) => !x.scopeOk).length, piiLeaks: results.reduce((s, x) => s + x.piiLeaks.length, 0), writes: results.filter((x) => x.write).length,
    confusion,
  };
  fs.writeFileSync(path.join(OUT, `intent-bench-${summary.mode}-results.json`), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, `intent-bench-${summary.mode}-summary.json`), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ ...summary, confusion: undefined, byCategory: undefined }, null, 1));
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
