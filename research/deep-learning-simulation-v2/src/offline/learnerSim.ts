// Rule-based learner simulator for the ESL stage-2 study. SIMULATION ONLY. NO API.
// The learner's knowledge state changes ONLY through the fixed rules in config/agent_sim_esl2/LEARNING_RULES.md, applied to judge-agent labels.
// The learner's productions and the post-test are drawn by this script from the state with fixed seeds; no agent answers for the learner.
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/learnerSim.ts <command> ...
// Validation commands: vinit <dir> | vtutor <dir> <turn> | vapply <dir> <turn> | vpost <dir> | agreeprep <dir> | agreescore <dir>
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { LESSONS, type Form } from './eslFixtures';

export type Belief = 'W1' | 'W2' | 'C1' | 'C2';
export interface KState { form: Form; band: 'A1' | 'A2' | 'B2'; primary: 'W1' | 'W2'; s: Record<Belief, number>; indep: { C1: number; C2: number } }
export interface Production { kind: 'blank' | 'sentence' | 'rule' | 'none'; correct?: boolean; fired?: 'W1' | 'W2'; text: string }
export interface NextTask { kind: 'blank' | 'sentence' | 'rule' | 'none'; probes?: string[]; correct?: string; errors?: Record<string, string> }
export interface JudgeEvent { rule: string; belief: string; quote?: string }

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const rand = (...parts: (string | number)[]) => parseInt(sha(parts.join('|')).slice(0, 8), 16) / 2 ** 32;
export const pError = (strength: number) => (strength >= 2 ? 0.8 : strength === 1 ? 0.4 : 0.05);

export const BELIEF_TEXT: Record<Form, Record<Belief, string>> = {
  articles: { W1: 'no a/an is needed before a singular noun', W2: 'a and an are the same; "a" (or "the") goes everywhere', C1: 'a singular countable noun needs a/an (or the)', C2: 'an before a vowel sound, a before a consonant sound' },
  copula: { W1: 'no am/is/are is needed in a present sentence', W2: '"is" works with every subject', C1: 'a present sentence like "She is a teacher" needs am/is/are', C2: 'am with I, is with he/she/it, are with you/we/they' },
  thirdS: { W1: 'the verb does not change after he/she/it', W2: '-s goes on every verb and -es/-ies are not needed', C1: 'add -s/-es after he/she/it', C2: '-es after sh/ch/s/x/o, -ies after consonant + y, no -s after I/you/we/they' },
};
export const ERROR_TEXT: Record<Form, Record<'W1' | 'W2', string>> = {
  articles: { W1: 'leaves out a/an ("She is teacher")', W2: 'uses "a" where "an" is needed ("a apple")' },
  copula: { W1: 'leaves out am/is/are ("She teacher")', W2: 'uses "is" with every subject ("They is happy")' },
  thirdS: { W1: 'leaves the verb unchanged after he/she/it ("She like tea")', W2: 'adds -s wrongly or misspells -es/-ies ("She watchs TV", "I plays")' },
};
export function initialState(form: Form, band: 'A1' | 'A2' | 'B2', primary: 'W1' | 'W2'): KState {
  const other = primary === 'W1' ? 'W2' : 'W1';
  const s = band === 'B2' ? { W1: 0, W2: 0, C1: 3, C2: 3 } : band === 'A1' ? { [primary]: 3, [other]: 1, C1: 0, C2: 0 } : { [primary]: 2, [other]: 1, C1: 1, C2: 0 };
  return { form, band, primary, s: s as Record<Belief, number>, indep: { C1: 0, C2: 0 } };
}
export function stateText(k: KState): string {
  const b = BELIEF_TEXT[k.form];
  return [`Target form: ${k.form}. Learner level ${k.band}. First language Arabic.`,
    `W1 (wrong) strength ${k.s.W1}: ${b.W1}. Its error: ${ERROR_TEXT[k.form].W1}.`,
    `W2 (wrong) strength ${k.s.W2}: ${b.W2}. Its error: ${ERROR_TEXT[k.form].W2}.`,
    `C1 (correct) strength ${k.s.C1}: ${b.C1}. Independent correct productions so far: ${k.indep.C1}.`,
    `C2 (correct) strength ${k.s.C2}: ${b.C2}. Independent correct productions so far: ${k.indep.C2}.`].join('\n');
}

/** Apply judge events with the LEARNING_RULES.md numbers. Events inconsistent with the production fact are rejected (logged). */
export function applyEvents(k: KState, events: JudgeEvent[], last: Production | undefined): { state: KState; applied: string[]; rejected: string[] } {
  const st: KState = JSON.parse(JSON.stringify(k)); const applied: string[] = []; const rejected: string[] = []; const drop: Record<string, number> = { W1: 0, W2: 0 };
  const seen = new Set<string>();
  for (const e of events ?? []) {
    const key = `${e.rule}:${e.belief}`; if (seen.has(key)) continue; seen.add(key);
    const W = e.belief === 'W1' || e.belief === 'W2' ? (e.belief as 'W1' | 'W2') : undefined; const C = e.belief === 'C1' || e.belief === 'C2' ? (e.belief as 'C1' | 'C2') : undefined;
    if ((e.rule === 'R1' || e.rule === 'R2') && W) { if (drop[W] < 2 && st.s[W] > 0) { st.s[W] -= 1; drop[W] += 1; } applied.push(key); }
    else if (e.rule === 'R3' && C) { if (last?.correct) { st.s[C] = Math.min(3, st.s[C] + 1); applied.push(key); } else rejected.push(`${key}:no_correct_production`); }
    else if (e.rule === 'R4' && C) {
      if (last?.correct && (last.kind === 'blank' || last.kind === 'sentence')) { st.s[C] = Math.min(3, st.s[C] + 1); st.indep[C] += 1; if (st.indep[C] >= 2) st.s[C === 'C1' ? 'W1' : 'W2'] = 0; applied.push(key); }
      else rejected.push(`${key}:no_correct_production`);
    } else if (e.rule === 'R7' && W) { if (last && last.correct === false && last.fired === W) { st.s[W] = Math.min(3, st.s[W] + 1); applied.push(key); } else rejected.push(`${key}:fact_mismatch`); }
    else if (e.rule === 'R5' || e.rule === 'R6') applied.push(`${e.rule}`);
    else rejected.push(`${key}:invalid`);
  }
  return { state: st, applied, rejected };
}

/** The learner's next message, drawn from the state (section 2 and 4 of LEARNING_RULES.md). */
export function learnerReply(k: KState, task: NextTask | undefined, seed: string, turn: number): Production {
  const t = task ?? { kind: 'none' };
  if (t.kind === 'blank' || t.kind === 'sentence') {
    const probes = (t.probes ?? ['W1', 'W2']).filter((p) => p === 'W1' || p === 'W2') as ('W1' | 'W2')[];
    for (const w of probes) if (rand(seed, 'prod', turn, w) < pError(k.s[w])) { const txt = t.errors?.[w]; return { kind: t.kind, correct: false, fired: w, text: txt === undefined || txt === '' ? (t.kind === 'blank' ? '(I leave it empty, no word)' : String(t.correct ?? '')) : txt }; }
    return { kind: t.kind, correct: true, text: String(t.correct ?? '') };
  }
  if (t.kind === 'rule') return { kind: 'rule', text: k.s.C1 >= 2 ? `I think: ${BELIEF_TEXT[k.form].C1}.` : `I think ${BELIEF_TEXT[k.form].W1}.` };
  return { kind: 'none', text: 'OK. Can I have an exercise, please?' };
}
export const factLine = (p: Production | undefined, form: Form) => !p || p.kind === 'none' || p.kind === 'rule' ? 'FACT: the last learner message did not produce the form (no exercise answer or sentence).' : p.correct ? 'FACT: the last learner message produced the form CORRECTLY.' : `FACT: the last learner message contained the error of ${p.fired} (${ERROR_TEXT[form][p.fired!]}).`;

// ---------------------------------------------------------------------------------------------------------- post-test (stage-1 frozen items, v1 controlled + free, tagged with the wrong beliefs each can reveal)
export const POST_PROBES: Record<Form, { id: string; kind: 'controlled' | 'free'; probes: ('W1' | 'W2')[] }[]> = {
  articles: [{ id: 'c1', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'c2', kind: 'controlled', probes: ['W1'] }, { id: 'c3', kind: 'controlled', probes: ['W1'] }, { id: 'c4', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'f1', kind: 'free', probes: ['W1', 'W2'] }, { id: 'f2', kind: 'free', probes: ['W1', 'W2'] }],
  copula: [{ id: 'c1', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'c2', kind: 'controlled', probes: ['W1'] }, { id: 'c3', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'c4', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'f1', kind: 'free', probes: ['W1', 'W2'] }, { id: 'f2', kind: 'free', probes: ['W1', 'W2'] }],
  thirdS: [{ id: 'c1', kind: 'controlled', probes: ['W1'] }, { id: 'c2', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'c3', kind: 'controlled', probes: ['W1', 'W2'] }, { id: 'c4', kind: 'controlled', probes: ['W1'] }, { id: 'f1', kind: 'free', probes: ['W1', 'W2'] }, { id: 'f2', kind: 'free', probes: ['W1', 'W2'] }],
};
export function postTest(k: KState, seed: string) {
  const items = POST_PROBES[k.form].map((it) => {
    const okOnce = (tag: string) => it.probes.every((w) => rand(seed, 'post', it.id, tag, w) >= pError(k.s[w]));
    const pOk = it.probes.reduce((a, w) => a * (1 - pError(k.s[w])), 1);
    const score = it.kind === 'controlled' ? (okOnce('a') ? 1 : 0) : ((okOnce('s1') ? 1 : 0) + (okOnce('s2') ? 1 : 0)) / 2;
    return { id: it.id, kind: it.kind, score, expected: pOk };
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const c = items.filter((i) => i.kind === 'controlled'); const f = items.filter((i) => i.kind === 'free');
  return { combined: mean(items.map((i) => i.score)), controlled: mean(c.map((i) => i.score)), free: mean(f.map((i) => i.score)), expected: mean(items.map((i) => i.expected)), expectedControlled: mean(c.map((i) => i.expected)), expectedFree: mean(f.map((i) => i.expected)), wrongAtZero: (k.s.W1 === 0 ? 1 : 0) + (k.s.W2 === 0 ? 1 : 0), items };
}

// ---------------------------------------------------------------------------------------------------------- judge batches (shared by validation and the comparison)
export interface SimTurn { learner: string; production?: Production; tutor?: string; judgeInput?: string; events?: JudgeEvent[]; next_task?: NextTask; applied?: string[]; rejected?: string[]; stateAfter?: KState }
export const stripArm = (t: string) => t.replace(/\[\[assess[^\]]*\]\]/gi, '').replace(/\bENARA\b/gi, 'the tutor').trim();
export function judgeCase(state: KState, prevTutor: string | undefined, last: Production | undefined, learnerMsg: string, tutor: string): string {
  return `KNOWLEDGE STATE (before this tutor turn):\n${stateText(state)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n${prevTutor ? stripArm(prevTutor) : '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${learnerMsg}\n${factLine(last, state.form)}\n\nTUTOR TURN TO JUDGE:\n${stripArm(tutor)}`;
}
export function writeJudgeBatches(dir: string, tag: string, cases: { id: string; text: string }[], per = 24, seed = 'esl2') {
  const order = [...cases].map((c, i) => ({ c, k: sha(`${seed}|${tag}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.c);
  const files: { batch: string; ids: string[] }[] = [];
  for (let n = 0; n * per < order.length; n++) {
    const chunk = order.slice(n * per, (n + 1) * per); const batch = `${tag}_j${String(n + 1).padStart(2, '0')}`;
    writeFileSync(path.join(dir, `${batch}.md`), `Batch ${batch}. Judge every case with JUDGE_INSTRUCTIONS.md and LEARNING_RULES.md. Write {"batch":"${batch}","cases":{...}} to the file named in your task.\n` + chunk.map((c) => `\n=========== CASE ${c.id} ===========\n${c.text}\n`).join(''));
    files.push({ batch, ids: chunk.map((c) => c.id) });
  }
  return files;
}
export function readJudge(dir: string, files: { batch: string; ids: string[] }[]) {
  const out: Record<string, { events: JudgeEvent[]; next_task: NextTask }> = {}; const missing: string[] = [];
  for (const f of files) {
    const p = path.join(dir, `${f.batch}.json`); if (!existsSync(p)) { missing.push(f.batch); continue; }
    const d = JSON.parse(readFileSync(p, 'utf8')) as { cases: Record<string, { events: JudgeEvent[]; next_task: NextTask }> };
    for (const id of f.ids) if (d.cases?.[id]) out[id] = d.cases[id]; else missing.push(`${f.batch}:${id}`);
  }
  return { out, missing };
}

// ---------------------------------------------------------------------------------------------------------- scripted validation tutors
const TOPIC: Record<Form, string> = { articles: 'a, an and the', copula: 'am, is and are', thirdS: 'he, she and it with -s' };
const RULE: Record<Form, string> = {
  articles: 'Here is the rule. Before one thing (a singular noun) we always put a or an: "a book", not "book". Use an before a vowel sound (an apple, an egg) and a before a consonant sound (a cat, a dog).',
  copula: 'Here is the rule. In English every present sentence needs am, is or are: "She is a teacher", not "She teacher". Use am with I, is with he, she and it, and are with you, we and they.',
  thirdS: 'Here is the rule. After he, she or it, the verb takes -s: "She likes tea", not "She like tea". Add -es after sh, ch, s, x and o (watches, goes) and change consonant + y to -ies (studies). Do not add -s after I, you, we or they.',
};
const CONTRAST: Record<Form, Record<'W1' | 'W2', string>> = {
  articles: { W1: 'Right: "My brother is a doctor." Wrong: "My brother is doctor."', W2: 'Right: "I want an apple." Wrong: "I want a apple."' },
  copula: { W1: 'Right: "My sister is happy." Wrong: "My sister happy."', W2: 'Right: "They are happy." Wrong: "They is happy."' },
  thirdS: { W1: 'Right: "He plays football." Wrong: "He play football."', W2: 'Right: "She watches TV." Wrong: "She watchs TV."' },
};
const PRODUCE: Record<Form, string[]> = {
  articles: ['Now write one sentence of your own about something in your bag. Use a or an.', 'Write one more new sentence of your own about an animal you like. Use a or an.', 'One more: write a new sentence about a job someone in your family has. Use a or an.'],
  copula: ['Now write one sentence of your own about a friend: who is your friend and how is he or she today?', 'Write one more new sentence of your own about your family. Use am, is or are.', 'One more: write a new sentence about you and your classmates today. Use am, is or are.'],
  thirdS: ['Now write one sentence of your own about what your father or mother does every morning.', 'Write one more new sentence of your own about what your best friend likes.', 'One more: write a new sentence about what your teacher does every day.'],
};
const CHAT = ['Hi! How are you today? What did you do this weekend?', 'That sounds nice. Do you like music?', 'Great. What is your favourite food?', 'Thanks for chatting with me today!'];
const ANSWERS: Record<Form, string[]> = {
  articles: ['Here is an example: "She has an orange in her bag." The answer is "an".', 'Next one: "My uncle is a doctor." The answer is "a".', 'Next: "I bought a book. The book is very good." The answer is "the".', 'Last one: "We saw an elephant at the zoo." The answer is "an".'],
  copula: ['Here is an example: "I am a student." The answer is "am".', 'Next one: "She is at home today." The answer is "is".', 'Next: "They are happy." The answer is "are".', 'Last one: "My father is a pilot." The answer is "is".'],
  thirdS: ['Here is an example: "My sister plays tennis on Sundays." The answer is "plays".', 'Next one: "He drinks tea in the morning." The answer is "drinks".', 'Next: "She watches TV after dinner." The answer is "watches".', 'Last one: "The baby cries at night." The answer is "cries".'],
};
export function scriptedTutor(kind: string, k: KState, turn: number, last: Production | undefined): string {
  const f = k.form; const base = kind.replace(/2$/, '');
  if (base === 'a') return CHAT[turn - 1];
  if (base === 'b') return ANSWERS[f][turn - 1];
  if (base === 'c') return turn === 1 ? RULE[f] : ['OK, thank you for listening.', 'Do you have any questions?', 'Good luck with your English!'][turn - 2];
  // d: rule + contrast on the learner's own (primary) error + 2 independent productions, with feedback
  if (turn === 1) return `${RULE[f]}\n\nLook at this pair. ${CONTRAST[f][k.primary]}\n\n${PRODUCE[f][0]}`;
  const fb = last?.correct ? 'Yes, that is correct. Well done.' : `Not quite. ${CONTRAST[f][last?.fired ?? k.primary]}`;
  return turn <= 3 ? `${fb}\n\n${PRODUCE[f][turn - 1]}` : fb;
}

// ---------------------------------------------------------------------------------------------------------- validation CLI
export const VTUTORS = ['a', 'b', 'c', 'd', 'c2', 'd2'];
const VTURNS = 4;
interface VSession { id: string; tutor: string; learnerIdx: number; seed: string; state: KState; start: KState; turns: SimTurn[] }
const vfile = (dir: string, id: string) => path.join(dir, 'sessions', `${id}.json`);
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'vinit') {
  const dir = a1; mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
  const forms: Form[] = ['articles', 'copula', 'thirdS'];
  for (let i = 0; i < 12; i++) {
    const form = forms[i % 3]; const band = i < 6 ? 'A1' : 'A2'; const primary = (Math.floor(i / 3) % 2 === 0 ? 'W1' : 'W2') as 'W1' | 'W2';
    for (const t of VTUTORS) {
      const st = initialState(form, band, primary); const seed = `esl2-val|L${i}|${t.endsWith('2') ? 'rep2' : 'rep1'}`;
      const s: VSession = { id: `v${i}_${t}`, tutor: t, learnerIdx: i, seed, state: st, start: st, turns: [{ learner: `Hello! Can you give me an exercise on ${TOPIC[form]}?`, production: { kind: 'none', text: '' } }] };
      writeFileSync(vfile(dir, s.id), JSON.stringify(s, null, 1));
    }
  }
  console.log('validation sessions', 12 * VTUTORS.length);
} else if (cmd === 'vtutor') {
  const dir = a1; const turn = Number(a2); const cases: { id: string; text: string }[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) {
    const s = JSON.parse(readFileSync(path.join(dir, 'sessions', f), 'utf8')) as VSession; const cur = s.turns[turn - 1];
    if (!cur || cur.tutor !== undefined) continue;
    const prev = s.turns[turn - 2]; cur.tutor = scriptedTutor(s.tutor, s.state, turn, cur.production);
    cur.judgeInput = judgeCase(s.state, prev?.tutor, cur.production, cur.learner, cur.tutor);
    cases.push({ id: `${s.id}_t${turn}`, text: cur.judgeInput }); writeFileSync(vfile(dir, s.id), JSON.stringify(s, null, 1));
  }
  const files = writeJudgeBatches(path.join(dir, 'judge'), `vr${turn}`, cases, 24);
  writeFileSync(path.join(dir, 'judge', `vr${turn}_FILES.json`), JSON.stringify(files, null, 1)); console.log('cases', cases.length, 'batches', files.map((x) => x.batch).join(' '));
} else if (cmd === 'vapply') {
  const dir = a1; const turn = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `vr${turn}_FILES.json`), 'utf8'));
  const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
  let n = 0; const rej: string[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) {
    const s = JSON.parse(readFileSync(path.join(dir, 'sessions', f), 'utf8')) as VSession; const cur = s.turns[turn - 1]; const j = out[`${s.id}_t${turn}`]; if (!cur || !j || cur.events) continue;
    const r = applyEvents(s.state, j.events, cur.production); cur.events = j.events; cur.next_task = j.next_task; cur.applied = r.applied; cur.rejected = r.rejected; s.state = r.state; cur.stateAfter = r.state; rej.push(...r.rejected.map((x) => `${s.id}:${x}`));
    if (turn < VTURNS) { const p = learnerReply(s.state, j.next_task, s.seed, turn + 1); s.turns.push({ learner: p.text, production: p }); }
    writeFileSync(vfile(dir, s.id), JSON.stringify(s, null, 1)); n++;
  }
  console.log('applied', n, 'rejected events', rej.length, rej.slice(0, 8).join(' '));
} else if (cmd === 'vpost') {
  const dir = a1; const rows: any[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = JSON.parse(readFileSync(path.join(dir, 'sessions', f), 'utf8')) as VSession; rows.push({ id: s.id, tutor: s.tutor, learner: s.learnerIdx, ...postTest(s.state, s.seed), final: s.state.s }); }
  const by = (t: string, key: string) => { const r = rows.filter((x) => x.tutor === t); return r.reduce((a, b) => a + b[key], 0) / r.length; };
  const summary: Record<string, unknown> = {};
  for (const t of VTUTORS) summary[t] = { n: rows.filter((x) => x.tutor === t).length, combined: +by(t, 'combined').toFixed(3), expected: +by(t, 'expected').toFixed(3), controlled: +by(t, 'controlled').toFixed(3), free: +by(t, 'free').toFixed(3), wrongAtZero: +by(t, 'wrongAtZero').toFixed(2) };
  const e = (t: string) => by(t, 'expected');
  const order = e('d') > e('c') && e('c') > Math.max(e('a'), e('b')) && Math.abs(e('a') - e('b')) <= 0.05;
  const orderSampled = by('d', 'combined') > by('c', 'combined') && by('c', 'combined') > Math.max(by('a', 'combined'), by('b', 'combined'));
  const noise = { c_vs_c2: { expected: +(e('c') - e('c2')).toFixed(3), sampled: +(by('c', 'combined') - by('c2', 'combined')).toFixed(3) }, d_vs_d2: { expected: +(e('d') - e('d2')).toFixed(3), sampled: +(by('d', 'combined') - by('d2', 'combined')).toFixed(3) } };
  const res = { summary, orderCheck: { rule: 'expected accuracy d > c > max(a, b) and |a - b| <= 0.05', pass: order, sampledOrderAlsoHolds: orderSampled }, noise, rows };
  writeFileSync(path.join(dir, 'VALIDATION_RESULTS.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify({ summary, orderCheck: res.orderCheck, noise }, null, 1));
} else if (cmd === 'agreeprep') {
  // 20% of judged turns, re-judged by a second judge on the identical input
  const dir = a1; const cases: { id: string; text: string }[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = JSON.parse(readFileSync(path.join(dir, 'sessions', f), 'utf8')) as VSession; s.turns.forEach((t, k) => { const id = `${s.id}_t${k + 1}`; if (t.judgeInput && rand('esl2-agree', id) < 0.2) cases.push({ id, text: t.judgeInput }); }); }
  const files = writeJudgeBatches(path.join(dir, 'judge'), 'agree', cases, 30, 'esl2-agree'); writeFileSync(path.join(dir, 'judge', 'agree_FILES.json'), JSON.stringify(files, null, 1)); console.log('agreement cases', cases.length, files.map((x) => x.batch).join(' '));
} else if (cmd === 'agreescore') {
  const dir = a1; const files = JSON.parse(readFileSync(path.join(dir, 'judge', 'agree_FILES.json'), 'utf8')); const { out } = readJudge(path.join(dir, 'judge'), files);
  let same = 0; let n = 0; const diffs: string[] = [];
  const eff = (ev: JudgeEvent[] | undefined) => (ev ?? []).filter((e) => ['R1', 'R2', 'R3', 'R4', 'R7'].includes(e.rule)).map((e) => `${e.rule}:${e.belief}`).sort().join(',');
  for (const [id, j2] of Object.entries(out)) {
    const sid = id.replace(/_t\d+$/, ''); const turn = Number(id.match(/_t(\d+)$/)![1]); const s = JSON.parse(readFileSync(vfile(dir, sid), 'utf8')) as VSession; const t = s.turns[turn - 1];
    const before = turn === 1 ? s.start : s.turns[turn - 2].stateAfter!; const r1 = applyEvents(before, t.events ?? [], t.production); const r2 = applyEvents(before, j2.events, t.production);
    n++; if (JSON.stringify(r1.state) === JSON.stringify(r2.state)) same++; else diffs.push(`${id}: [${eff(t.events)}] vs [${eff(j2.events)}]`);
  }
  const res = { cases: n, sameResultingState: same, agreement: n ? +(same / n).toFixed(3) : null, diffs };
  writeFileSync(path.join(dir, 'JUDGE_AGREEMENT.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify({ cases: n, same, agreement: res.agreement, diffs: diffs.slice(0, 10) }, null, 1));
}
