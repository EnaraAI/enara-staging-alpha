// liveRolePlay PR 4: the 5-learner simulation (docs/tutor/ROLEPLAY_SIM.md). SIMULATION ONLY: fake learners, fake school, a throwaway database.
//
// The REAL text tutor runs here (createApp, POST /api/me/tutor/sessions/:id/messages: the JSON path with its guards and regenerations), with the
// lms-test engine switches (deploy/lms-test.flags.json) and liveRolePlay OFF (today's tutor) or ON. The only model is the lms-test tutor model
// (DeepSeek V4.1 Flash): every call goes through lms-test's own maintenance route POST /api/maintenance/llm-compare, so the key stays on the
// server and nothing here can reach Anthropic (no Anthropic key; modelFallback is off). A tiny local chat-completions endpoint passes the
// tutor's requests on to that route; the DeepSeek adapter's extra parts (ds*) run once, on lms-test, as they do live.
// The same route plays the learners (persona prompts) and pre-screens every tutor reply ("would a teacher accept this reply").
//
// Needs: MONGODB_URI (throwaway), LMSTEST_MAINTENANCE_TOKEN (GitHub secret, never printed). Writes ROLEPLAY_SIM_OUT (default ./roleplay-sim).
// Usage: npx tsx src/scripts/rolePlaySim.ts [--turns 14] [--only a1-adult] [--fake]   (--fake: no network, canned replies, to check the wiring)
import http from 'http';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FAKE = process.argv.includes('--fake');
const TURNS = Number(arg('turns', '14'));
const ONLY = arg('only');
const OUT = process.env.ROLEPLAY_SIM_OUT || path.resolve('roleplay-sim');
const SITE = 'https://lms-test.enara.app';
const FLAGS = JSON.parse(readFileSync(path.resolve(__dirname, '../../../deploy/lms-test.flags.json'), 'utf8')) as { features: { flags: Record<string, string> }[] };
const flag = (k: string) => FLAGS.features.find((f) => f.flags[k])?.flags[k] ?? '';
// lms-test's switches, without the DeepSeek adapter parts (they run once, on lms-test) and without liveRolePlay (set per condition).
const BASE_V2 = flag('ENARA_ENGINE_V2').split(',').map((x) => x.trim()).filter((x) => x && !/^ds[A-Z]/.test(x) && x !== 'liveRolePlay');

// ------------------------------------------------------------------------------------------------ the model (through lms-test)
let calls = 0; let inTok = 0; let outTok = 0;
async function llm(system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens = 800): Promise<string> {
  calls += 1;
  if (FAKE) return fakeReply(system, messages);
  const token = process.env.LMSTEST_MAINTENANCE_TOKEN;
  if (!token) throw new Error('LMSTEST_MAINTENANCE_TOKEN is not set');
  const body = JSON.stringify({ system: system.slice(0, 60_000), messages: messages.slice(-40).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })), max_tokens: maxTokens });
  for (let attempt = 1; ; attempt += 1) {
    const r = await fetch(`${SITE}/api/maintenance/llm-compare`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(65_000) }).catch(() => null);
    const j = r?.ok ? (await r.json().catch(() => null)) as { ok?: boolean; text?: string; usage?: { input_tokens?: number; output_tokens?: number } } | null : null;
    if (j?.ok && typeof j.text === 'string') { inTok += j.usage?.input_tokens ?? 0; outTok += j.usage?.output_tokens ?? 0; return j.text; }
    if (attempt >= 3) throw new Error(`llm-compare failed (HTTP ${r?.status ?? 0})`);
    await new Promise((res) => setTimeout(res, 3000 * attempt));
  }
}
function fakeReply(system: string, messages: { role: string; content: string }[]): string {
  if (/teacher reviewing/.test(system)) return '{"accept": true, "reason": "fake"}';
  if (/simulated language learner/.test(system)) return 'I like apples.';
  const last = messages.at(-1)?.content ?? '';
  return `[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM]]\nThanks! ${/role-play|ROLE-PLAY/.test(system) ? 'Good evening. A table for one?' : 'Write one sentence with is.'} (${last.length})`;
}
/** A local chat-completions endpoint for the tutor's DeepSeek adapter: the request goes on to lms-test (system + messages), the reply comes back. */
async function startShim(): Promise<string> {
  const { DEEPSEEK_REMINDER } = await import('../services/llmProvider');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      try {
        const b = JSON.parse(raw) as { messages: { role: string; content: string }[]; max_tokens?: number; stream?: boolean };
        // The adapter here adds its reminder; lms-test's adapter adds it again: send the system without it.
        const system = b.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n').replace(`\n\n${DEEPSEEK_REMINDER}`, '');
        const msgs = b.messages.filter((m) => m.role !== 'system').map((m) => ({ role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.content }));
        const text = await llm(system, msgs, b.max_tokens ?? 800);
        if (b.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 } })}\n\ndata: [DONE]\n\n`);
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'sim', model: flag('TUTOR_LLM_MODEL'), choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
        }
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e).slice(0, 200) }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
}

// ------------------------------------------------------------------------------------------------ the fake school
interface Learner { key: string; label: string; band: 'adult' | 'teen' | 'child'; age?: number; level: string; interests: string[]; lesson: string; persona: string; stuck?: boolean; ask: string }
const LESSONS: Record<string, { title: string; level: string; spec: Record<string, unknown> }> = {
  jobs: { title: 'Jobs and the verb be', level: 'A1', spec: { objectives: ['Say what people do with am, is and are'], successCriteria: ['Uses am/is/are after the subject', 'Uses a/an before a job'], grammar: ['be: am/is/are', 'a/an + job'], vocabulary: ['teacher', 'doctor', 'engineer', 'nurse', 'driver'], items: [
    { id: 'j1', prompt: 'Complete: My brother ___ a driver.', acceptedAnswers: ['is'], targetForms: ['is'], criteria: [1] },
    { id: 'j2', prompt: 'Complete: I ___ a nurse.', acceptedAnswers: ['am'], targetForms: ['am'], criteria: [1] },
    { id: 'j3', prompt: 'Write a or an: She is ___ engineer.', acceptedAnswers: ['an'], targetForms: ['an'], criteria: [2] },
    { id: 'j4', prompt: 'Correct the sentence: "They teachers."', acceptedAnswers: ['They are teachers', 'They are teachers.'], targetForms: ['are'], criteria: [1] }] } },
  routine: { title: 'Daily routines (he/she -s)', level: 'A2', spec: { objectives: ['Describe routines with the present simple'], successCriteria: ['Adds -s/-es with he/she/it'], grammar: ['present simple he/she/it -s'], items: [
    { id: 'r1', prompt: 'Correct the verb: "She go to school at eight."', acceptedAnswers: ['She goes to school at eight', 'goes'], targetForms: ['goes'], criteria: [1] },
    { id: 'r2', prompt: 'Correct the verb: "My dad watch TV after dinner."', acceptedAnswers: ['My dad watches TV after dinner', 'watches'], targetForms: ['watches'], criteria: [1] },
    { id: 'r3', prompt: 'Complete: Omar ___ (play) football on Fridays.', acceptedAnswers: ['plays'], targetForms: ['plays'], criteria: [1] },
    { id: 'r4', prompt: 'Complete: The shop ___ (open) at nine.', acceptedAnswers: ['opens'], targetForms: ['opens'], criteria: [1] }] } },
  holiday: { title: 'Last holiday (past simple)', level: 'B1', spec: { objectives: ['Talk about a past holiday with the past simple'], successCriteria: ['Uses regular past forms (-ed)', 'Uses common irregular past forms'], grammar: ['past simple regular and irregular'], items: [
    { id: 'h1', prompt: 'Complete: Last summer we ___ (go) to Alexandria.', acceptedAnswers: ['went'], targetForms: ['went'], criteria: [2] },
    { id: 'h2', prompt: 'Complete: We ___ (stay) in a small hotel.', acceptedAnswers: ['stayed'], targetForms: ['stayed'], criteria: [1] },
    { id: 'h3', prompt: 'Complete: I ___ (buy) a hat at the market.', acceptedAnswers: ['bought'], targetForms: ['bought'], criteria: [2] },
    { id: 'h4', prompt: 'Correct the sentence: "We visit the museum yesterday."', acceptedAnswers: ['We visited the museum yesterday', 'visited'], targetForms: ['visited'], criteria: [1] }] } },
  food: { title: 'Food I like', level: 'Pre-A1', spec: { objectives: ['Say what food you like and ask for food politely'], successCriteria: ['Says I like + food', 'Asks with I would like ..., please'], vocabulary: ['apple', 'banana', 'rice', 'chicken', 'cake', 'milk'], items: [
    { id: 'f1', prompt: 'Complete: I ___ apples.', acceptedAnswers: ['like'], targetForms: ['like'], criteria: [1] },
    { id: 'f2', prompt: 'Complete: I would ___ a banana, please.', acceptedAnswers: ['like'], targetForms: ['like'], criteria: [2] },
    { id: 'f3', prompt: 'Write a or an: I have ___ egg.', acceptedAnswers: ['an'], targetForms: ['an'], criteria: [1] }] } },
  animals: { title: 'Animals: can and can\'t', level: 'A1', spec: { objectives: ['Say what animals can and can\'t do'], successCriteria: ['Uses can + verb', 'Uses can\'t + verb'], grammar: ['can / can\'t + verb'], vocabulary: ['fish', 'bird', 'monkey', 'swim', 'fly', 'jump'], items: [
    { id: 'n1', prompt: 'Complete: A fish ___ swim.', acceptedAnswers: ['can'], targetForms: ['can'], criteria: [1] },
    { id: 'n2', prompt: 'Complete: A cat ___ fly.', acceptedAnswers: ["can't", 'cannot', 'can not'], targetForms: ["can't"], criteria: [2] },
    { id: 'n3', prompt: 'Correct the sentence: "A bird can flies."', acceptedAnswers: ['A bird can fly', 'can fly'], targetForms: ['fly'], criteria: [1] }] } },
};
const LEARNERS: Learner[] = [
  { key: 'a1-adult', label: 'A1 adult', band: 'adult', level: 'A1', interests: ['cooking', 'travel'], lesson: 'jobs', ask: 'Can we do a role-play?',
    persona: 'an Egyptian adult beginner (A1), 34, works in an office. Short simple sentences; you often leave out am/is/are ("He teacher") and a/an. You try hard.' },
  { key: 'a2-teen', label: 'A2 teen (stuck)', band: 'teen', age: 15, level: 'A2', interests: ['football', 'games'], lesson: 'routine', stuck: true, ask: 'Can we practise with a role-play?',
    persona: 'an Egyptian teenager (A2), 15. You are STUCK on he/she -s: for your first four answers to exercises you keep the base verb ("She go", "He watch") or say "I don\'t know"; after that you slowly get it right. In a role-play, for the first two lines you say "I don\'t know" or "what?", then you answer.' },
  { key: 'b1-adult', label: 'B1 adult', band: 'adult', level: 'B1', interests: ['travel', 'technology'], lesson: 'holiday', ask: "Let's do a role-play, please.",
    persona: 'an Egyptian adult (B1), 41, an engineer. Mostly fluent; sometimes uses the base verb for the past ("We visit") or "goed". Answers with 1-2 sentences.' },
  { key: 'child-8', label: 'Child aged 8', band: 'child', age: 8, level: 'Pre-A1', interests: ['animals', 'cooking'], lesson: 'food', ask: 'Can we play a role-play game?',
    persona: 'an Egyptian child aged 8 (Pre A1). Very short answers of 1-5 words, sometimes one word or a word in Arabic; you like animals and food.' },
  { key: 'child-11', label: 'Child aged 11', band: 'child', age: 11, level: 'A1', interests: ['animals', 'reading'], lesson: 'animals', ask: 'Can we do a role-play?',
    persona: 'an Egyptian child aged 11 (A1). Short sentences; sometimes "can swims" or leaves out a/an. Polite and keen.' },
];

async function seed(M: Record<string, any>, l: Learner, cond: string) {
  const id = `${l.key}-${cond}`; const pw = bcrypt.hashSync('sim-password-not-secret', 4);
  const lesson = LESSONS[l.lesson];
  const born = l.age ? new Date(Date.now() - (l.age * 365.25 + 100) * 86_400_000) : undefined;
  await M.Batch.create({ id: `b-${id}`, name: 'B', institutionId: 'sim-school', academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: `s-${id}`, name: `Sim ${l.label}`, email: `${id}@sim.test`, grade: 'Grade 9', institutionId: 'sim-school', batchId: `b-${id}`, learnerAgeBand: l.band, ...(born ? { birthDate: born } : {}) });
  await M.StudentCredit.create({ studentId: `s-${id}`, institutionId: 'sim-school', limit: 100000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.User.create({ email: `${id}@sim.test`, password: pw, role: 'student', name: `Sim ${l.label}`, status: 'active', institutionId: 'sim-school', studentId: `s-${id}` });
  await M.LearnerProfile.create({ studentId: `s-${id}`, institutionId: 'sim-school', interests: l.interests, accommodations: [] });
  await M.Curriculum.create({ id: `cur-${id}`, name: `English ${lesson.level}`, institutionId: 'sim-school', courseName: `English ${lesson.level}`, type: 'Language', level: lesson.level, languages: ['English'], summary: 'x', lastUpdated: '2026-11-27', status: 'deployed', chapters: [{ id: `lsn-${id}`, title: lesson.title, description: lesson.title, languageSpec: lesson.spec }] });
  await M.CourseInstance.create({ id: `cls-${id}`, courseId: `crs-${id}`, courseName: `English ${lesson.level}`, institutionId: 'sim-school', academicYear: '2026', batchId: `b-${id}`, curriculumId: `cur-${id}`, studentIds: [`s-${id}`], instructorIds: [], visibility: 'student' });
  return { email: `${id}@sim.test`, course: `crs-${id}`, lesson: `lsn-${id}`, student: `s-${id}` };
}

// ------------------------------------------------------------------------------------------------ learners, judge
const LEARNER_SYSTEM = (l: Learner) => `You are a simulated language learner in a test of an English tutor (SIMULATION ONLY). You are ${l.persona}
Reply to the tutor's LAST message as this learner would: only your own words, 1-2 short sentences (children: very short), no explanations of what you are doing, never in the role of the tutor. If the tutor sets an exercise, try it at your level (mistakes are fine). If the tutor plays a character in a role-play, answer that character. Never write anything but the learner's message.`;
const JUDGE_SYSTEM = `You are an experienced English teacher reviewing an AI tutor's replies for a school (SIMULATION ONLY). For the tutor's LAST reply, decide: would a good teacher accept this reply, as it is, for this learner at this point? Accept means: correct English and correct feedback (no wrong answer praised as right, no right answer called wrong), suitable for the learner's age and level, one clear task or question, it follows on from what the learner said, it stays on the lesson or on the role-play scene that is running, it does not just give away the answer to a new exercise before any try, and it is safe and kind. Small style issues are still acceptable. Reply ONLY with JSON: {"accept": true or false, "reason": "one short sentence"}`;
async function judge(l: Learner, lessonTitle: string, convo: { role: string; text: string }[], reply: string): Promise<{ accept: boolean; reason: string }> {
  const ctx = convo.slice(-6).map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`).join('\n');
  const prompt = `Learner: ${l.label}${l.age ? `, aged ${l.age}` : ''}, level ${l.level}, Arabic first language.\nLesson: ${lessonTitle}.\n\nConversation so far:\n${ctx}\n\nThe tutor's LAST reply (judge this one):\n${reply}`;
  const raw = await llm(JUDGE_SYSTEM, [{ role: 'user', content: prompt }], 200);
  const m = /\{[\s\S]*\}/.exec(raw);
  try { const j = JSON.parse(m?.[0] ?? '') as { accept?: unknown; reason?: unknown }; return { accept: j.accept === true, reason: String(j.reason ?? '').slice(0, 300) }; } catch { return { accept: false, reason: `unreadable judge reply: ${raw.slice(0, 120)}` }; }
}

// ------------------------------------------------------------------------------------------------ stuck measure (code, from the stored turns)
type LT = { assessment?: { verdict?: string }; activeItem?: { lessonItemId?: string } | null; answeringCheck?: boolean; hintLevel?: number; moves?: string[]; answerReleased?: boolean; rolePlay?: { phase?: string; beat?: number; tries?: number; help?: string; scene?: string } };
const right = (v?: string) => v === 'CORRECT' || v === 'CORRECT_WITH_EQUIVALENT_FORMULATION';
const wrong = (v?: string) => v === 'INCORRECT' || v === 'PARTIALLY_CORRECT';
export function stuckMeasure(lts: (LT | undefined)[]): { sameMethodFails: boolean; unassistedRight: number; sceneUnaided: number; maxFailsOneItem: number } {
  let run = 0; let runItem: string | undefined; let lastMoves = ''; let sameRun = 0; let sameMethodFails = false; let unassistedRight = 0; let maxFails = 0; let sceneUnaided = 0;
  let prevHint = 0; let prevReleased = false;
  for (const lt of lts) {
    if (!lt) continue;
    const v = lt.assessment?.verdict; const item = lt.activeItem?.lessonItemId;
    if (lt.answeringCheck && wrong(v)) {
      if (item && item === runItem) { run += 1; const mv = (lt.moves ?? []).slice().sort().join(','); sameRun = mv === lastMoves ? sameRun + 1 : 1; lastMoves = mv; } else { run = 1; runItem = item; sameRun = 1; lastMoves = (lt.moves ?? []).slice().sort().join(','); }
      maxFails = Math.max(maxFails, run);
      if (sameRun >= 3) sameMethodFails = true;
    } else if (lt.answeringCheck && right(v)) {
      if (prevHint <= 1 && !prevReleased) unassistedRight += 1;
      run = 0; sameRun = 0;
    }
    // a scene line answered with no help (the next beat came with no hint or model line)
    if (lt.rolePlay?.phase === 'beat' && (lt.rolePlay.beat ?? 1) > 1 && !lt.rolePlay.help) sceneUnaided += 1;
    if ((lt.rolePlay?.tries ?? 0) >= 3) sameMethodFails = true;
    prevHint = lt.hintLevel ?? 0; prevReleased = Boolean(lt.answerReleased);
  }
  return { sameMethodFails, unassistedRight, sceneUnaided, maxFailsOneItem: maxFails };
}

// ------------------------------------------------------------------------------------------------ run
async function main() {
  mkdirSync(OUT, { recursive: true });
  const endpoint = await startShim();
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'sim-jwt-secret-32-characters-minimum-x', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'sim-hmac-secret-32-characters-minimum-x', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    // No Anthropic key: the tutor is the DeepSeek adapter only (the placeholder only marks the direct model as configured).
    ANTHROPIC_API_KEY: 'unused-by-the-simulation', TUTOR_LLM_PROVIDER: 'deepseek', TUTOR_LLM_ENDPOINT: endpoint, TUTOR_LLM_API_KEY: 'local-shim-no-secret', TUTOR_LLM_MODEL: flag('TUTOR_LLM_MODEL'),
    LOGIN_RATE_LIMIT_MAX: '1000', LOG_LEVEL: 'warn',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  // Locally (no MONGODB_URI): a throwaway in-memory database.
  if (!process.env.MONGODB_URI) { const { MongoMemoryServer } = await import('mongodb-memory-server'); process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri(); }
  const mongoose = (await import('mongoose')).default;
  (await import('../config/env')).resetConfigForTests();
  await mongoose.connect(process.env.MONGODB_URI!);
  await mongoose.connection.db!.dropDatabase();
  const M: Record<string, any> = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[n] = (await import(`../models/${n}`))[n];
  M.LearnerProfile = (await import('../models/LearnerMemory')).LearnerProfile;
  await M.Institution.create({ id: 'sim-school', name: 'Simulation school', features: {}, learningSettings: { adultLearners: false } });
  const app = (await import('../app')).createApp();
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = async (p: string, token: string | null, body?: unknown) => {
    const r = await fetch(`${base}${p}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); if (!r.ok) throw new Error(`${p} -> ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t);
  };
  const results: any[] = []; const replies: any[] = [];
  const runOne = async (l: Learner, cond: 'off' | 'on') => {
    const ids = await seed(M, l, cond);
    const token = (await api('/api/auth/login', null, { email: ids.email, password: 'sim-password-not-secret' })).token as string;
    const sess = await api('/api/me/tutor/sessions', token, { courseId: ids.course, lessonId: ids.lesson });
    const convo: { role: string; text: string }[] = [];
    for (let t = 1; t <= TURNS; t += 1) {
      const said = t === 1 ? 'Hello' : t === 4 ? l.ask : (await llm(LEARNER_SYSTEM(l), convo.map((m) => ({ role: (m.role === 'user' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text })), 120)).trim().replace(/^learner:\s*/i, '').slice(0, 400) || 'OK';
      convo.push({ role: 'user', text: said });
      const r = await api(`/api/me/tutor/sessions/${sess.id ?? sess.session?.id}/messages`, token, { text: said });
      const reply = String(r.assistantMessage?.text ?? '');
      const lt = r.assistantMessage?.meta?.languageTurn as LT | undefined;
      convo.push({ role: 'ai', text: reply });
      const j = await judge(l, LESSONS[l.lesson].title, convo.slice(0, -1), reply);
      replies.push({ learner: l.label, cond, turn: t, learnerSaid: said, tutor: reply, accept: j.accept, reason: j.reason, rolePlay: lt?.rolePlay ? `${lt.rolePlay.scene}:${lt.rolePlay.phase}${lt.rolePlay.beat ? `#${lt.rolePlay.beat}` : ''}${lt.rolePlay.help ? `:${lt.rolePlay.help}` : ''}` : '' });
    }
    // The stored turns (the engine's own evidence) for the stuck measure.
    const { TutorMessage } = await import('../models/TutorMessage');
    const msgs = await TutorMessage.find({ sessionId: sess.id ?? sess.session?.id, role: 'ai' }).sort({ timestamp: 1 }).lean();
    const sm = stuckMeasure(msgs.map((m: any) => m.meta?.languageTurn as LT | undefined));
    const mine = replies.filter((x) => x.learner === l.label && x.cond === cond);
    results.push({ learner: l.label, cond, replies: mine.length, accepted: mine.filter((x) => x.accept).length, sceneReplies: mine.filter((x) => x.rolePlay && !/:(after|declined)$/.test(x.rolePlay)).length, ...sm, stuck: sm.sameMethodFails || sm.unassistedRight === 0 });
    console.log(`done ${l.label} ${cond}: ${mine.filter((x) => x.accept).length}/${mine.length} accepted; stuck=${sm.sameMethodFails || sm.unassistedRight === 0}`);
  };
  const learners = LEARNERS.filter((l) => !ONLY || l.key === ONLY);
  for (const cond of ['off', 'on'] as const) {
    process.env.ENARA_ENGINE_V2 = [...BASE_V2, ...(cond === 'on' ? ['liveRolePlay'] : [])].join(',');
    // The five learners run side by side (each its own school records and session).
    await Promise.all(learners.map((l) => runOne(l, cond).catch((e) => { console.log(`FAILED ${l.label} ${cond}: ${String(e).slice(0, 300)}`); results.push({ learner: l.label, cond, error: String(e).slice(0, 300) }); })));
  }
  const sum = (cond: string) => { const r = results.filter((x) => x.cond === cond && !x.error); const n = r.reduce((a, x) => a + x.replies, 0); const acc = r.reduce((a, x) => a + x.accepted, 0); return { sessions: r.length, replies: n, accepted: acc, acceptedPct: n ? Math.round((1000 * acc) / n) / 10 : 0, stuckLearners: r.filter((x) => x.stuck).length, sceneReplies: r.reduce((a, x) => a + x.sceneReplies, 0) }; };
  const summary = { off: sum('off'), on: sum('on'), calls, tokens: { input: inTok, output: outTok }, switches: BASE_V2.join(','), turnsPerSession: TURNS, fake: FAKE };
  // 20 replies for a teacher to rate: 10 with the switch on (role-play replies first), 10 off; fixed order (no randomness).
  const pick = (cond: string, n: number) => { const r = replies.filter((x) => x.cond === cond); const rp = r.filter((x) => x.rolePlay && !/:(after|declined)$/.test(x.rolePlay)); const rest = r.filter((x) => !rp.includes(x)); const out: any[] = []; const step = (a: any[], k: number) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / k)) === 0).slice(0, k); out.push(...step(rp, cond === 'on' ? 7 : 0), ...step(rest, n)); return out.slice(0, n); };
  const sample = [...pick('on', 10), ...pick('off', 10)];
  const csv = (s: string) => `"${String(s).replace(/"/g, '""').replace(/\n/g, ' / ')}"`;
  writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, results }, null, 1));
  writeFileSync(path.join(OUT, 'replies.json'), JSON.stringify(replies, null, 1));
  writeFileSync(path.join(OUT, 'teacher-sample.csv'), ['n,learner,switch,turn,role_play,learner_said,tutor_reply,model_prescreen,model_reason,teacher_accepts(yes/no),teacher_reason', ...sample.map((x, i) => [i + 1, csv(x.learner), x.cond, x.turn, csv(x.rolePlay), csv(x.learnerSaid), csv(x.tutor), x.accept ? 'yes' : 'no', csv(x.reason), '', ''].join(','))].join('\n'));
  console.log(JSON.stringify(summary, null, 1));
  server.close(); await mongoose.disconnect();
  process.exit(0);
}
if (require.main === module) void main().catch((e) => { console.error(e); process.exit(1); });
