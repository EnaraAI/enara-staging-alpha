// ESL stage-1 study: post-test, free-production scoring, rating and tag helpers (NO API; agents answer, score and rate; this file prepares batches and does the deterministic parts).
// SIMULATION ONLY. Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/eslPost.ts <command> ...
// Commands: postprep <dir> <outDir> | postscore <outDir> | freeprep <outDir> <pass> | freescore <outDir> | rateprep <dir> <outDir> <pass> | tags <dir> <out.json>
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { makeStudent, itemBehaviour } from '../students/population';
import { scoreItem } from '../benchmark/scoring';
import { LESSONS, STUDENTS, SEED, ARMS, FREE_RUBRIC, postItems, type Arm, type Form } from './eslFixtures';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const shuffle = <T>(arr: T[], seed: string): T[] => [...arr].map((x, i) => ({ x, k: sha(`${seed}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.x);
const [cmd, a1, a2, a3] = process.argv.slice(2);
interface Turn { learner: string; tutor?: string; [k: string]: unknown }
interface Session { arm: Arm; studentIdx: number; band: string; form: Form; status: string; persona: string; turns: Turn[] }
const TURNS = Number(process.env.ESL_TURNS ?? 4); // sessions are cut to 4 tutor turns (PROTOCOL.md addendum 2)
const loadSession = (dir: string, idx: number, arm: Arm): Session => {
  const f = path.join(dir, 'sessions', `s${idx}_${arm}.json`); const s = JSON.parse(readFileSync(f, 'utf8')) as Session;
  if (s.turns.length < TURNS || s.turns.slice(0, TURNS).some((t) => t.tutor === undefined)) throw new Error(`session ${f} is not complete (${s.turns.length} turns)`); s.turns = s.turns.slice(0, TURNS); return s;
};
const dlg = (s: Session) => s.turns.map((t) => `STUDENT: ${t.learner}\nTUTOR: ${t.tutor}`).join('\n');
const FILLER = 'Unrelated task (do it as the learner would, then go on): write three numbers between 1 and 100 and say which one is the biggest.';
const caseId = (idx: number, arm: Arm) => `s${idx}_${arm}`;

if (cmd === 'postprep') {
  const dir = a1; const out = a2; mkdirSync(out, { recursive: true });
  const jobs = STUDENTS.flatMap((es) => ARMS.map((arm) => ({ es, arm, s: loadSession(dir, es.idx, arm) })));
  // 3 cases per agent, from 3 different students (an agent never sees two lessons of the same student), arms mixed.
  const PER_POST = Number(process.env.ESL_POST_PER ?? 6); const order = shuffle(jobs, 'esl1-post-order'); const groups: typeof jobs[] = [];
  for (const j of order) { let g = groups.find((x) => x.length < PER_POST && !x.some((y) => y.es.idx === j.es.idx)); if (!g) { g = []; groups.push(g); } g.push(j); }
  const flagsFor = (idx: number, blockId: string, itemId: string, stage: string) => {
    const b = itemBehaviour(makeStudent(idx, SEED), blockId, itemId, stage, 3);
    return [b.lapse ? 'Right now you are distracted: answer quickly and carelessly, without checking.' : '', b.guess ? 'You are not sure and you just guess (or repeat a pattern you memorised without understanding).' : '', b.slip ? 'This point is hard for you: in this answer you slip and make a typical error.' : ''].filter(Boolean).join(' ');
  };
  const fmtItems = (es: typeof STUDENTS[number], version: 'v1' | 'v2', stage: string) => postItems(es.form, es.band, version).map((it, k) => { const d = flagsFor(es.idx, es.blockId, it.id, stage); return `Q${k + 1} [${it.id}]${d ? ` (directive: ${d})` : ''}\n${it.prompt}`; }).join('\n\n');
  groups.forEach((g, n) => {
    const id = `pt${String(n + 1).padStart(2, '0')}`;
    let t = 'You will answer short English-language questions as several different learners, one after the other. Treat each CASE as completely separate: use only that learner\'s card and that learner\'s own lesson conversation. Answer every question as that learner would: use what the lesson taught to the extent the learner would have learned and kept it, keep the typical mistake if the lesson did not convince the learner, and follow the directive for a question if there is one. For "answer with only the missing word" questions write only that word; for "write two sentences" questions write exactly two sentences.\n';
    for (const j of g) {
      t += `\n\n=========== CASE ${caseId(j.es.idx, j.arm)} ===========\nLEARNER CARD:\n${j.s.persona}\n\nTHE LEARNER'S RECENT LESSON (this is all the learner remembers being taught):\n${dlg(j.s)}\n\nPART 1: the learner answers 8 questions ALONE (no tutor, no notes, no help).\n\n${fmtItems(j.es, 'v1', 'post')}\n\n${FILLER}\n\nPART 2: 8 more questions, again alone.\n\n${fmtItems(j.es, 'v2', 'cons')}\n`;
    }
    writeFileSync(path.join(out, `${id}.md`), t);
  });
  writeFileSync(path.join(out, 'KEY.json'), JSON.stringify(groups.map((g, n) => ({ file: `pt${String(n + 1).padStart(2, '0')}`, cases: g.map((j) => ({ case: caseId(j.es.idx, j.arm), arm: j.arm, studentIdx: j.es.idx })) })), null, 1));
  console.log('cases', jobs.length, 'batches', groups.length);
} else if (cmd === 'postscore') {
  const out = a1; const key = JSON.parse(readFileSync(path.join(out, 'KEY.json'), 'utf8')) as { file: string; cases: { case: string; arm: Arm; studentIdx: number }[] }[];
  const rows: any[] = []; const free: any[] = []; let missing = 0;
  for (const g of key) {
    const f = path.join(out, `${g.file}.answers.json`); if (!existsSync(f)) { console.log('missing', g.file); missing++; continue; }
    const ans = JSON.parse(readFileSync(f, 'utf8')) as Record<string, Record<string, string>>;
    for (const c of g.cases) {
      const es = STUDENTS[c.studentIdx]; const a = ans[c.case] ?? {};
      for (const version of ['v1', 'v2'] as const) for (const it of postItems(es.form, es.band, version)) {
        const given = String(a[it.id] ?? '');
        if (it.kind === 'free') free.push({ case: c.case, arm: c.arm, studentIdx: c.studentIdx, version, itemId: it.id, form: es.form, prompt: it.prompt, response: given });
        else rows.push({ case: c.case, arm: c.arm, studentIdx: c.studentIdx, version, itemId: it.id, kind: it.kind, correct: scoreItem(given, { scoring: { type: 'key', accepted: it.accepted!, mode: 'exact' } } as never).correct ? 1 : 0 });
      }
    }
  }
  writeFileSync(path.join(out, 'POSTTEST_CLOSED_SCORES.json'), JSON.stringify(rows, null, 1)); writeFileSync(path.join(out, 'FREE_RESPONSES.json'), JSON.stringify(free, null, 1));
  console.log('closed items scored', rows.length, 'free responses', free.length, missing ? `(${missing} batch file(s) missing)` : '');
} else if (cmd === 'freeprep') {
  const out = a1; const pass = a2; const free = JSON.parse(readFileSync(path.join(out, 'FREE_RESPONSES.json'), 'utf8')) as any[];
  const withId = free.map((r) => ({ ...r, rid: `r${sha(`${r.case}|${r.version}|${r.itemId}|esl1-free`).slice(0, 8)}` }));
  const order = shuffle(withId, `esl1-free-order-${pass}`); const per = Number(process.env.ESL_FREE_PER ?? 48); const key: any[] = [];
  for (let n = 0; n * per < order.length; n++) {
    const chunk = order.slice(n * per, (n + 1) * per); const id = `fs${String(n + 1).padStart(2, '0')}_p${pass}`;
    let t = `Batch ${id}. Score each response (2 sentences) with the rubric printed above it. Output JSON {"batch":"${id}","scores":{"<response id>":[s1,s2],...}} to the file named in your task.\n`;
    for (const r of chunk) t += `\n--- response ${r.rid} ---\nTarget form: ${r.form}\nRubric: ${FREE_RUBRIC[r.form as Form]}\nTask given to the learner: ${r.prompt}\nResponse: ${r.response.replace(/\n+/g, ' ')}\n`;
    writeFileSync(path.join(out, `${id}.md`), t); key.push({ batch: id, ids: chunk.map((r) => r.rid) });
  }
  writeFileSync(path.join(out, `FREE_KEY.json`), JSON.stringify(withId.map((r) => ({ rid: r.rid, case: r.case, arm: r.arm, studentIdx: r.studentIdx, version: r.version, itemId: r.itemId })), null, 1));
  writeFileSync(path.join(out, `FREE_BATCHES_p${pass}.json`), JSON.stringify(key, null, 1)); console.log('free batches', key.length, 'responses', withId.length);
} else if (cmd === 'freescore') {
  const out = a1; const keyRows = JSON.parse(readFileSync(path.join(out, 'FREE_KEY.json'), 'utf8')) as any[]; const byRid = new Map(keyRows.map((r) => [r.rid, r]));
  const passes: Record<string, number[]>[] = []; const agree: number[] = [];
  for (const pass of ['1', '2']) {
    const batches = JSON.parse(readFileSync(path.join(out, `FREE_BATCHES_p${pass}.json`), 'utf8')) as { batch: string; ids: string[] }[]; const m: Record<string, number[]> = {};
    for (const b of batches) { const f = path.join(out, `${b.batch}.scores.json`); if (!existsSync(f)) { console.log('missing', f); continue; } const sc = (JSON.parse(readFileSync(f, 'utf8')) as { scores: Record<string, number[]> }).scores; for (const rid of b.ids) if (sc[rid]) m[rid] = sc[rid].slice(0, 2).map((x) => (x ? 1 : 0)); }
    passes.push(m);
  }
  const rows: any[] = []; let same = 0; let both = 0;
  for (const [rid, r] of byRid) {
    const p = passes.map((m) => m[rid]).filter(Boolean) as number[][]; if (!p.length) continue;
    const sc = p.map((x) => ((x[0] ?? 0) + (x[1] ?? 0)) / 2); if (p.length === 2) { both++; if (sc[0] === sc[1]) same++; agree.push(sc[0] === sc[1] ? 1 : 0); }
    rows.push({ ...r, score: sc.reduce((a, b) => a + b, 0) / sc.length, pass1: sc[0], pass2: sc[1] ?? null });
  }
  writeFileSync(path.join(out, 'POSTTEST_FREE_SCORES.json'), JSON.stringify(rows, null, 1)); console.log('free items scored', rows.length, 'exact agreement between the two passes', both ? (same / both).toFixed(3) : 'n/a');
} else if (cmd === 'rateprep') {
  const dir = a1; const out = a2; const pass = a3; mkdirSync(out, { recursive: true });
  const cases = STUDENTS.map((es) => {
    const arms = shuffle(ARMS, `esl1-rate-${pass}-${es.idx}`); const labels = ['V', 'W', 'X', 'Y']; const map: Record<string, Arm> = {};
    arms.forEach((a, k) => { map[labels[k]] = a; }); return { es, map };
  });
  const order = shuffle(cases, `esl1-rate-order-${pass}`); const key: Record<string, any> = {};
  const PER_RATE = Number(process.env.ESL_RATE_PER ?? 6);
  for (let n = 0; n * PER_RATE < order.length; n++) {
    const chunk = order.slice(n * PER_RATE, (n + 1) * PER_RATE); const id = `rt${String(n + 1).padStart(2, '0')}_p${pass}`; let t = `Batch ${id}. Rate every case as described in the rater instructions, and write the JSON to the file named in your task.\n`;
    key[id] = {};
    for (const c of chunk) {
      const cid = `c${sha(`${c.es.idx}|esl1-case`).slice(0, 6)}`; key[id][cid] = { studentIdx: c.es.idx, labels: c.map };
      t += `\n\n=========== CASE ${cid} ===========\nLearner: English learner in Egypt (first language Arabic). Lesson topic: ${LESSONS[c.es.form].title}.\n`;
      for (const L of ['V', 'W', 'X', 'Y']) t += `\n----- TUTOR ${L} -----\n${dlg(loadSession(dir, c.es.idx, c.map[L]))}\n`;
    }
    writeFileSync(path.join(out, `${id}.md`), t);
  }
  writeFileSync(path.join(out, `KEY_p${pass}.json`), JSON.stringify(key, null, 1)); console.log('rater batches', Object.keys(key).length);
} else if (cmd === 'tags') {
  const dir = a1; const rows: any[] = [];
  for (const es of STUDENTS) for (const arm of ARMS) {
    const s = loadSession(dir, es.idx, arm);
    s.turns.forEach((t, k) => rows.push({ studentIdx: es.idx, band: es.band, form: es.form, status: es.status, arm, turn: k + 1, moves: t.moves ?? [], strand: t.strand ?? null, explicitFirst: t.explicitFirst ?? null, levelExplicit: t.levelExplicit ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, guardRemoved: t.guardRemoved ?? 0, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, twoAsks: t.twoAsks ?? false, method: (t.method as any)?.primary ?? t.method ?? null, words: String(t.tutor ?? '').split(/\s+/).filter(Boolean).length }));
  }
  writeFileSync(a2, JSON.stringify(rows, null, 1)); console.log('turn rows', rows.length);
}
export { FREE_RUBRIC };
