// Expressive avatar (live tutor item 5): the 5-learner simulation on the TEXT path of the live tutor, lms-test.enara.app ONLY.
// No video and no paid voice: each simulated call starts a live tutor session (a video token is made but never used) and
// talks to /api/avatar/query-stream, the same path the live call uses, with liveExpressive off and on for that call
// (the CI-only per-call test override). The tutor is DeepSeek V4.1 Flash on lms-test; the learner is DeepSeek too, through
// the maintenance llm-compare route, playing a fixed profile. DeepSeek then pre-screens 20 "on" replies as a teacher
// would ("would a teacher accept this reply?"). No Anthropic model. Secrets are never printed or written.
//
//   node sim.mjs      writes $EXPR_OUT/sim.json and $EXPR_OUT/sim.md
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, assertSiteUrl } from '../lib.mjs';

const OUT = process.env.EXPR_OUT || './out';
mkdirSync(OUT, { recursive: true });
const PW = process.env.SEED_USER_PASSWORD;
const CI_TOKEN = process.env.LMSTEST_MAINTENANCE_TOKEN;
const log = (...a) => console.log(...a);
const summary = (s) => { log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const site = (path, init = {}) => fetch(assertSiteUrl(`${SITE}${path}`), { redirect: 'manual', ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 90_000) });
const TURNS = Number(process.env.SIM_TURNS || 8);

// The five profiles (plan: A1 adult, A2 teen, B1 adult, child aged 8, child aged 11; the 11-year-old is scripted to get stuck).
// Each is played on a seed learner of the same age band (their school's English course).
export const PROFILES = [
  { id: 'a1-adult', email: 'hassan.shaker@school.enara.app', band: 'adult', persona: 'an adult beginner (CEFR A1), 30 years old. You use very short, simple sentences and make basic mistakes, often forgetting -s with he/she/it.' },
  { id: 'a2-teen', email: 'farida.fahmy@school.enara.app', band: 'teen', persona: 'a 15-year-old school student at CEFR A2. Short sentences, some mistakes with he/she/it -s and past forms, friendly and quick.' },
  { id: 'b1-adult', email: 'nadine.soliman@school.enara.app', band: 'adult', persona: 'an adult at CEFR B1, 28 years old, studying English in the evening for work. Mostly correct, an occasional slip.' },
  { id: 'child-8', email: 'khaled.nasser@school.enara.app', band: 'child', persona: 'an 8-year-old child (Pre-A1 to A1). Very short answers of a few words, sometimes one word, sometimes a mistake.' },
  { id: 'child-11-stuck', email: 'menna.osman@school.enara.app', band: 'child', stuck: true, persona: 'an 11-year-old child at A1 who finds this lesson hard. You keep forgetting the -s with he/she/it even after help. In your 2nd and 3rd replies you say "I don\'t know" (in your own words), and once you ask why.' },
];
const LEARNER_RULES = 'You are role-playing an English learner in Egypt (first language Arabic) in a spoken video call with an English tutor. Write ONLY what you say next, as speech: one or two short sentences, no emojis, no stage directions, never mention being an AI or role-playing. Answer the tutor\'s question or task yourself, at your level, with your typical mistakes.';
const FIRST = 'Hello. Can you give me a question about this lesson, please?';
const DRAW = 'Can you draw a picture for me, please?';

async function login(email) {
  const r = await site('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.token ? j.token : null;
}
const asUser = (token) => (path, init = {}) => site(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
async function deepseek(system, messages, maxTokens = 200) {
  const r = await site('/api/maintenance/llm-compare', { method: 'POST', headers: { Authorization: `Bearer ${CI_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages, max_tokens: maxTokens }) });
  const j = await r.json().catch(() => ({}));
  return j.ok ? String(j.text ?? '').trim() : null;
}

async function englishLesson(get) {
  const list = await (await get('/api/me/courses')).json().catch(() => []);
  const courses = Array.isArray(list) ? list : (list?.courses ?? []);
  const course = courses.find((c) => /english/i.test(`${c.name ?? ''} ${c.courseName ?? ''} ${c.title ?? ''} ${c.subject ?? ''}`));
  if (!course) return null;
  const courseId = String(course.id ?? course.courseId);
  const tree = await (await get(`/api/me/courses/${encodeURIComponent(courseId)}`)).json().catch(() => null);
  const lessons = (tree?.modules ?? []).flatMap((m) => m.lessons ?? []);
  const lesson = lessons.find((l) => /routine/i.test(l.title)) ?? lessons.find((l) => /family/i.test(l.title)) ?? lessons[0];
  return { courseId, lessonId: lesson?.id, lessonTitle: lesson?.title ?? 'English' };
}

const CUE_TEXT = /\[\s*(happy|warm|supportive|curious|concerned|playful|sad|surprised|angry|distressed|laughter)\s*\]/i;
async function session(profile, arm) {
  const token = await login(profile.email);
  if (!token) return { profile: profile.id, arm, error: 'login' };
  const get = asUser(token);
  const lesson = await englishLesson(get);
  if (!lesson) return { profile: profile.id, arm, error: 'no English course' };
  const start = await get('/api/avatar/session', { method: 'POST', headers: { 'x-enara-expressive-test': arm, 'x-enara-ci-token': CI_TOKEN }, body: JSON.stringify({ course_id: lesson.courseId, lesson_id: lesson.lessonId, lesson_title: lesson.lessonTitle, preferred_language: 'english' }) });
  const sj = await start.json().catch(() => ({}));
  if (!start.ok || !sj.session_id) return { profile: profile.id, arm, error: `start ${start.status} ${sj.code ?? sj.error?.code ?? ''}` };
  const out = { profile: profile.id, band: profile.band, arm, lesson: lesson.lessonTitle, start: sj.expressive_test ?? null, panel: sj.expressive?.panel ?? null, turns: [] };
  const history = [];
  try {
    for (let n = 0; n < TURNS; n++) {
      let said = n === 0 ? FIRST : n === TURNS - 2 ? DRAW : null;
      if (!said) {
        const convo = history.map((h) => ({ role: h.role === 'user' ? 'assistant' : 'user', content: h.content }));
        said = (await deepseek(`${LEARNER_RULES}\nYou are ${profile.persona}`, [{ role: 'user', content: '(The call starts.)' }, ...convo], 120)) ?? "I don't know.";
        said = said.replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ').slice(0, 240);
      }
      history.push({ role: 'user', content: said });
      const t0 = Date.now();
      const r = await get('/api/avatar/query-stream', { method: 'POST', body: JSON.stringify({ session_id: sj.session_id, messages: history.slice(-12) }), timeoutMs: 120_000 });
      const lines = (await r.text().catch(() => '')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
      const text = lines.filter((l) => l.content).map((l) => l.content).join('');
      const cues = lines.filter((l) => l.cue).map((l) => l.cue);
      const cueBeforeWords = cues.length ? lines.findIndex((l) => l.cue) < lines.findIndex((l) => l.content) : null;
      out.turns.push({ n, said, status: r.status, ms: Date.now() - t0, cues, cueBeforeWords, drawing: lines.some((l) => l.visual === 'drawing'), text, cueInText: CUE_TEXT.test(text) });
      history.push({ role: 'assistant', content: text || '...' });
    }
  } finally {
    await get(`/api/avatar/session/${encodeURIComponent(sj.session_id)}`, { method: 'DELETE' }).catch(() => undefined);
  }
  // The engine's own record of each turn (verdict, next step) and what was stored as the transcript.
  await sleep(1500);
  const stored = await (await get(`/api/me/tutor/sessions/${encodeURIComponent(sj.session_id)}`)).json().catch(() => null);
  const ai = (stored?.messages ?? stored?.session?.messages ?? []).filter((m) => m.role !== 'user');
  out.turns.forEach((t, i) => {
    const lt = ai[i]?.meta?.languageTurn;
    t.verdict = lt?.assessment?.verdict ?? null;
    t.next = lt?.assessment?.next ?? null;
    t.item = lt?.assessment?.item ?? lt?.activeItem?.id ?? null;
    t.storedCueInText = ai[i]?.text ? CUE_TEXT.test(ai[i].text) : null;
  });
  return out;
}

// ---- the checks
const SUCCESS = new Set(['CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION']);
const FAILURE = new Set(['INCORRECT', 'PARTIALLY_CORRECT']);
const STUCK_SAID = /\b(i\s*(really\s*)?(don'?t|do not|dont) know|no idea|not sure|i'?m not sure|confused|don'?t understand|do not understand|why|hint|help me)\b/i;
const BLOCKED = new Set(['angry', 'sad', 'distressed', 'laughter']);
/** Does the first cue match the engine's recorded verdict for the turn? */
export function cueMatches(t, band) {
  const first = t.cues[0];
  const stuck = STUCK_SAID.test(t.said);
  if (SUCCESS.has(t.verdict)) return first === (band === 'child' ? 'warm' : 'happy');
  if (stuck) return first === 'concerned';
  if (FAILURE.has(t.verdict)) return first === 'supportive' || first === 'concerned';
  if (t.next === 'NEW_ITEM' || t.drawing) return first === 'curious';
  return first === undefined || first === 'curious';
}
/** Score 2 (plan): stuck = 3+ failed tries on one item, or no unassisted right answer in the whole session. */
export function stuckSession(s) {
  let run = 0; let item = null; let worst = 0;
  for (const t of s.turns) {
    if (FAILURE.has(t.verdict)) { run = t.item && t.item === item ? run + 1 : 1; item = t.item; worst = Math.max(worst, run); } else if (SUCCESS.has(t.verdict)) { run = 0; }
  }
  return worst >= 3 || !s.turns.some((t) => SUCCESS.has(t.verdict));
}

const JUDGE = 'You are an experienced English teacher of Egyptian learners. You will see the learner profile, the last part of a spoken lesson, and the tutor\'s latest reply. Decide whether a good teacher would accept this reply as it is: it must be correct English, fit the learner\'s age and level, respond to what the learner said, never mock or discourage, keep the lesson moving, and not give away an answer the learner should find. Answer with exactly one line: "YES: <short reason>" or "NO: <short reason>".';
async function judge(sample) {
  const out = [];
  for (const s of sample) {
    const text = `Learner: ${s.persona}\n\nLesson so far:\n${s.context}\n\nTutor's latest reply:\n${s.reply}`;
    const verdict = (await deepseek(JUDGE, [{ role: 'user', content: text }], 80)) ?? 'NO: judge unavailable';
    out.push({ ...s, verdict: verdict.split('\n')[0].slice(0, 200), accepted: /^\W*yes\b/i.test(verdict) });
  }
  return out;
}

async function main() {
  if (!PW || !CI_TOKEN) throw new Error('secrets missing');
  const arms = ['off', 'on'];
  const sessions = [];
  for (const arm of arms) sessions.push(...(await Promise.all(PROFILES.map((p) => session(p, arm).catch((e) => ({ profile: p.id, arm, error: String(e?.message ?? e).slice(0, 120) }))))));
  for (const s of sessions) log(`SESSION ${s.profile} ${s.arm} ${s.error ?? `turns=${s.turns.length} band=${s.start?.band ?? '-'} cues=${JSON.stringify(s.turns.map((t) => t.cues.join('+') || '-'))} verdicts=${JSON.stringify(s.turns.map((t) => t.verdict ?? '-'))}`}`);
  const ok = sessions.filter((s) => !s.error);
  const on = ok.filter((s) => s.arm === 'on');
  const onTurns = on.flatMap((s) => s.turns.filter((t) => t.status === 200 && t.text).map((t) => ({ ...t, band: s.band })));
  const allTurns = ok.flatMap((s) => s.turns);
  const matches = onTurns.filter((t) => cueMatches(t, t.band)).length;
  const blocked = on.flatMap((s) => s.turns.flatMap((t) => t.cues)).filter((c) => BLOCKED.has(c)).length;
  const offCues = ok.filter((s) => s.arm === 'off').flatMap((s) => s.turns.flatMap((t) => t.cues)).length;
  const children = on.filter((s) => s.band === 'child');
  const childCalm = children.every((s) => s.start?.band === 'child' && s.turns.every((t) => !t.cues.includes('happy')));
  const shown = allTurns.filter((t) => t.cueInText || t.storedCueInText).length;
  const notBefore = onTurns.filter((t) => t.cues.length && t.cueBeforeWords === false).length;
  // 20 "on" replies for the teacher check: spread over the five learners.
  const byProfile = PROFILES.map((p) => on.find((s) => s.profile === p.id)).filter(Boolean);
  const sample = [];
  for (let i = 0; sample.length < 20 && i < TURNS; i++) for (const s of byProfile) if (sample.length < 20 && s.turns[i]?.text) {
    const ctx = s.turns.slice(Math.max(0, i - 2), i).map((t) => `Learner: ${t.said}\nTutor: ${t.text}`).join('\n');
    sample.push({ profile: s.profile, turn: i, persona: PROFILES.find((p) => p.id === s.profile).persona, context: `${ctx}\nLearner: ${s.turns[i].said}`, reply: s.turns[i].text });
  }
  const judged = await judge(sample);
  const accepted = judged.filter((j) => j.accepted).length;
  const stuckOff = ok.filter((s) => s.arm === 'off' && stuckSession(s)).map((s) => s.profile);
  const stuckOn = on.filter((s) => stuckSession(s)).map((s) => s.profile);
  const result = {
    sessions: sessions.length, failedSessions: sessions.filter((s) => s.error).map((s) => `${s.profile}/${s.arm}: ${s.error}`),
    cueMatch: { matched: matches, turns: onTurns.length, pct: onTurns.length ? Math.round((matches / onTurns.length) * 1000) / 10 : 0, bar: 95 },
    blockedCues: blocked, cuesWithSwitchOff: offCues, childrenCalm: childCalm, childBands: children.map((s) => `${s.profile}:${s.start?.band}`),
    cueShownOrStored: shown, cueAfterWords: notBefore,
    teacherAccept: { accepted, sample: judged.length, pct: judged.length ? Math.round((accepted / judged.length) * 1000) / 10 : 0, bar: 90 },
    stuck: { off: stuckOff, on: stuckOn, noWorse: stuckOn.length <= stuckOff.length },
  };
  result.pass = result.cueMatch.pct >= 95 && blocked === 0 && childCalm && shown === 0 && result.teacherAccept.pct >= 90 && result.stuck.noWorse && result.failedSessions.length === 0;
  writeFileSync(join(OUT, 'sim.json'), JSON.stringify({ result, sessions, judged }, null, 1));
  summary(`SIM ${JSON.stringify(result)}`);
  const mismatches = onTurns.filter((t) => !cueMatches(t, t.band)).map((t) => `${t.band} said "${t.said.slice(0, 60)}" verdict=${t.verdict} next=${t.next} cues=${t.cues.join('+') || '-'}`);
  writeFileSync(join(OUT, 'sim-mismatches.txt'), mismatches.join('\n'));
  for (const m of mismatches) log(`MISMATCH ${m}`);
  for (const j of judged.filter((x) => !x.accepted)) log(`REJECTED ${j.profile} t${j.turn}: ${j.verdict} | ${j.reply.slice(0, 160)}`);
}

main().catch((e) => { log(`FAILED: ${String(e?.message ?? e).slice(0, 300)}`); process.exitCode = 1; });
