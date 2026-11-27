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

// The learners (plan: A1 adult, A2 teen, B1 adult, child aged 8, child aged 11; owner, 27 Nov 2026: the live tutor teaches every
// subject, so also maths, science and Arabic, in both lesson languages, and the stuck learner in a non-English subject).
// Each is played on a seed learner of the same age band, in that learner's own course for the subject.
export const PROFILES = [
  { id: 'a1-adult-english', email: 'hassan.shaker@school.enara.app', band: 'adult', subject: /english/i, lang: 'english', persona: 'an adult beginner (CEFR A1), 30 years old. You use very short, simple sentences and make basic mistakes, often forgetting -s with he/she/it.' },
  { id: 'b1-adult-english', email: 'nadine.soliman@school.enara.app', band: 'adult', subject: /english/i, lang: 'english', persona: 'an adult at CEFR B1, 28 years old, studying English in the evening for work. Mostly correct, an occasional slip.' },
  { id: 'a2-teen-maths', email: 'farida.fahmy@school.enara.app', band: 'teen', subject: /math/i, lang: 'english', persona: 'a 15-year-old school student (English level A2) in a maths lesson taught in English. You answer the maths questions yourself; you are right most of the time but sometimes make an arithmetic slip.' },
  { id: 'teen-science-arabic', email: 'nadine.nasser@school.enara.app', band: 'teen', subject: /science|علوم/i, lang: 'arabic', persona: 'طالبة عمرها 14 سنة في درس علوم باللغة العربية. تجيبين بجمل قصيرة، وتخطئين أحيانًا.' },
  { id: 'child-8-arabic', email: 'khaled.nasser@school.enara.app', band: 'child', subject: /العربية|arabic/i, lang: 'arabic', persona: 'طفل عمره 8 سنوات في درس اللغة العربية. يجيب بكلمات قليلة، وأحيانًا يخطئ.' },
  { id: 'child-11-science-stuck', email: 'menna.osman@school.enara.app', band: 'child', subject: /science/i, lang: 'english', stuck: true, persona: 'an 11-year-old child in a science lesson taught in English, who finds this lesson hard. In your 2nd and 3rd replies you say you don\'t know (in your own words), once you ask why, and you often give a wrong answer even after help.' },
];
const LEARNER_RULES = {
  english: 'You are role-playing a learner in Egypt (first language Arabic) in a spoken video call with a tutor. Write ONLY what you say next, as speech: one or two short sentences, no emojis, no stage directions, never mention being an AI or role-playing. Answer the tutor\'s question or task yourself, at your level, with your typical mistakes.',
  arabic: 'أنت تؤدي دور متعلم في مصر في مكالمة فيديو صوتية مع معلم. اكتب فقط ما تقوله بعد ذلك، كلامًا منطوقًا: جملة أو جملتان قصيرتان بالعربية، بلا رموز تعبيرية ولا وصف للأفعال، ولا تذكر أبدًا أنك ذكاء اصطناعي. أجب عن سؤال المعلم بنفسك، بمستواك وبأخطائك المعتادة.',
};
const FIRST = { english: 'Hello. Can you give me a question about this lesson, please?', arabic: 'مرحبًا. هل يمكنك أن تعطيني سؤالًا عن هذا الدرس من فضلك؟' };
const DRAW = { english: 'Can you draw a picture for me, please?', arabic: 'هل يمكنك أن ترسم لي صورة من فضلك؟' };

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

async function subjectLesson(get, subject) {
  const list = await (await get('/api/me/courses')).json().catch(() => []);
  const courses = Array.isArray(list) ? list : (list?.courses ?? []);
  const course = courses.find((c) => subject.test(`${c.name ?? ''} ${c.courseName ?? ''} ${c.title ?? ''} ${c.subject ?? ''}`));
  if (!course) return null;
  const courseId = String(course.id ?? course.courseId);
  const tree = await (await get(`/api/me/courses/${encodeURIComponent(courseId)}`)).json().catch(() => null);
  const lessons = (tree?.modules ?? []).flatMap((m) => m.lessons ?? []);
  const lesson = lessons.find((l) => /routine/i.test(l.title)) ?? lessons.find((l) => /family/i.test(l.title)) ?? lessons[0];
  return { courseId, lessonId: lesson?.id, lessonTitle: lesson?.title ?? String(course.name ?? course.title ?? ''), subject: String(course.subject ?? '') };
}

const CUE_TEXT = /\[\s*(happy|warm|supportive|curious|concerned|playful|sad|surprised|angry|distressed|laughter)\s*\]/i;
async function session(profile, arm) {
  const token = await login(profile.email);
  if (!token) return { profile: profile.id, arm, error: 'login' };
  const get = asUser(token);
  const lesson = await subjectLesson(get, profile.subject);
  if (!lesson) return { profile: profile.id, arm, error: `no course for ${profile.subject}` };
  const start = await get('/api/avatar/session', { method: 'POST', headers: { 'x-enara-expressive-test': arm, 'x-enara-ci-token': CI_TOKEN }, body: JSON.stringify({ course_id: lesson.courseId, lesson_id: lesson.lessonId, lesson_title: lesson.lessonTitle, subject: lesson.subject, preferred_language: profile.lang }) });
  const sj = await start.json().catch(() => ({}));
  if (!start.ok || !sj.session_id) return { profile: profile.id, arm, error: `start ${start.status} ${sj.code ?? sj.error?.code ?? ''}` };
  const out = { profile: profile.id, band: profile.band, arm, lang: profile.lang, lesson: lesson.lessonTitle, subject: lesson.subject, start: sj.expressive_test ?? null, panel: sj.expressive?.panel ?? null, turns: [] };
  const history = [];
  try {
    for (let n = 0; n < TURNS; n++) {
      let said = n === 0 ? FIRST[profile.lang] : n === TURNS - 2 ? DRAW[profile.lang] : null;
      if (!said) {
        const convo = history.map((h) => ({ role: h.role === 'user' ? 'assistant' : 'user', content: h.content }));
        said = (await deepseek(`${LEARNER_RULES[profile.lang]}\n${profile.lang === 'arabic' ? 'أنت' : 'You are'} ${profile.persona}`, [{ role: 'user', content: '(The call starts.)' }, ...convo], 120)) ?? "I don't know.";
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
  // Each turn's stored reply, matched by its text (a turn that produced no reply stores nothing).
  const used = new Set();
  out.turns.forEach((t) => {
    const k = ai.findIndex((m, j) => !used.has(j) && String(m.text ?? '').trim() === t.text.trim());
    if (k >= 0) used.add(k);
    const doc = k >= 0 ? ai[k] : null;
    t.stored = Boolean(doc);
    const lt = doc?.meta?.languageTurn;
    const ex = doc?.meta?.expressive;
    t.verdict = ex?.verdict ?? lt?.assessment?.verdict ?? null;
    t.next = lt?.assessment?.next ?? null;
    t.stuckRecorded = Boolean(ex?.stuck);
    t.storedCues = ex?.cues ?? null;
    t.item = lt?.assessment?.item ?? lt?.activeItem?.id ?? null;
    t.storedCueInText = doc?.text ? CUE_TEXT.test(doc.text) : null;
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
  const stuck = t.stuckRecorded;
  if (SUCCESS.has(t.verdict)) return first === (band === 'child' ? 'warm' : 'happy');
  if (stuck) return first === 'concerned';
  if (FAILURE.has(t.verdict)) return first === 'supportive' || first === 'concerned';
  // No verdict: a neutral cue only.
  return first === 'curious' || first === 'warm';
}
/** Score 2 (plan): stuck = 3+ failed tries in a row (wrong or "I don't know"), or no right answer in the whole session.
 *  Read from an independent label of each learner message (DeepSeek, same prompt for both arms), not from the tutor's own grade,
 *  so subjects without a stored verdict (switch off) are judged the same way. */
export function stuckSession(s) {
  let run = 0; let worst = 0;
  for (const t of s.turns) {
    if (t.label === 'WRONG' || t.label === 'STUCK') { run += 1; worst = Math.max(worst, run); } else if (t.label === 'RIGHT') run = 0;
  }
  return worst >= 3 || !s.turns.some((t) => t.label === 'RIGHT');
}
const LABEL = 'You check a tutoring conversation. You see the tutor\'s previous message and the learner\'s reply. Label the learner\'s reply with exactly one word: RIGHT (a correct answer to the tutor\'s question or task), WRONG (an incorrect or partly incorrect answer), STUCK (says they do not know, are confused, ask for help or why), or OTHER (anything else).';
async function label(s) {
  await Promise.all(s.turns.map(async (t, i) => {
    if (i === 0) { t.label = 'OTHER'; return; }
    const out = (await deepseek(LABEL, [{ role: 'user', content: `Tutor: ${s.turns[i - 1].text}\nLearner: ${t.said}` }], 5)) ?? '';
    t.label = (/RIGHT|WRONG|STUCK|OTHER/.exec(out.toUpperCase()) ?? ['OTHER'])[0];
  }));
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
  await Promise.all(sessions.filter((s) => !s.error).map(label));
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
  // Informational: when the learner's message is independently labelled STUCK, did the cue say so?
  const stuckTurns = onTurns.filter((t) => t.label === 'STUCK');
  const stuckCued = stuckTurns.filter((t) => t.cues[0] === 'concerned').length;
  // Informational: the cue against an independent right/wrong label (the tutor's own grade can differ from it).
  const indep = onTurns.filter((t) => t.label === 'RIGHT' || t.label === 'WRONG');
  const indepAgree = indep.filter((t) => (t.label === 'RIGHT' ? ['happy', 'warm'] : ['supportive', 'concerned']).includes(t.cues[0])).length;
  const result = {
    sessions: sessions.length, failedSessions: sessions.filter((s) => s.error).map((s) => `${s.profile}/${s.arm}: ${s.error}`),
    cueMatch: { matched: matches, turns: onTurns.length, pct: onTurns.length ? Math.round((matches / onTurns.length) * 1000) / 10 : 0, bar: 95 },
    blockedCues: blocked, cuesWithSwitchOff: offCues, childrenCalm: childCalm, childBands: children.map((s) => `${s.profile}:${s.start?.band}`),
    cueShownOrStored: shown, cueAfterWords: notBefore,
    teacherAccept: { accepted, sample: judged.length, pct: judged.length ? Math.round((accepted / judged.length) * 1000) / 10 : 0, bar: 90 },
    stuck: { off: stuckOff, on: stuckOn, noWorse: stuckOn.length <= stuckOff.length },
    info: { stuckWordsCuedConcerned: `${stuckCued}/${stuckTurns.length}`, cueVsIndependentRightWrong: `${indepAgree}/${indep.length}`, subjects: [...new Set(ok.map((s) => `${s.profile}:${s.subject}/${s.lang}`))] },
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
