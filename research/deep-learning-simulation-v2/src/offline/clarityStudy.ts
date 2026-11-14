// Part 2 helpers (agent-run clarity study, no API). Commands:
//   freeze                      -> config/agent_sim_clarity/POSTTEST_ITEMS.json (+ sha256) from the benchmark's post-stage items of the 18 study outcomes
//   postprep <sessionsDir> <outDir> -> post-test batches (3 sessions of 3 different outcomes per agent file) + key
//   postscore <outDir>          -> deterministic scoring of agent answers (benchmark scoring.ts)
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { loadBenchmark } from '../orchestrator/run';
import { makeStudent, blockStart, itemBehaviour } from '../students/population';
import { scoreItem } from '../benchmark/scoring';
import { selectTeachingPlan, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { arbitratePedagogy } from '../../../../backend/src/services/languageTurnPipeline';
import type { Outcome } from '../benchmark/schema';

export const STUDY_OUTCOMES = ['GR-02', 'WR-02', 'RD-06', 'LS-02', 'VO-02', 'FN-04', 'FN-06', 'FN-08', 'GR-04', 'GR-06', 'LS-05', 'LS-08', 'RD-07', 'RD-08', 'VO-04', 'WR-06', 'WR-02', 'RD-06']; // index = student index
export const SEED = 'enara-agent-sim-1';
const ROOT = path.resolve(__dirname, '../..');
const CONFIG = path.join(ROOT, 'config/agent_sim_clarity');

// Fixed, documented mapping from a student's hidden starting state to the school's record (the production route reads these from real records):
// status = proficient if the student already knows the point, else emerging; a held misconception is recorded as confirmed with a category by skill area;
// grade by CEFR cohort (A1 child 4, A2 teen 9, else adult 18); subject from the skill area. The misconception TEXT is not shown to the tutor.
const CATEGORY: Record<string, string> = { grammar: 'procedural_error', vocabulary: 'conceptual_misunderstanding', reading: 'misinterpretation', writing: 'incomplete_reasoning', functional: 'misinterpretation', listening: 'misinterpretation' };
const SUBJECT: Record<string, string> = { grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading', writing: 'Writing', functional: 'Functional language', listening: 'Listening' };
export function planFor(idx: number, o: Outcome) {
  const st = makeStudent(idx, SEED); const start = blockStart(st, o.area, o.id, o.misconceptions.length, o.difficulty);
  const status = start.knowsAlready ? 'proficient' : 'emerging';
  const grade = o.cefr === 'A1' ? 4 : o.cefr === 'A2' ? 9 : 18;
  const input: PlanInput = {
    objectiveId: o.id, masteryStatus: status, masteryEstimate: start.knowsAlready ? 0.8 : 0.3, evidenceStrength: 'moderate', weakPrerequisiteIds: [],
    misconceptions: !start.knowsAlready ? [{ id: 'm1', category: CATEGORY[o.area], status: 'confirmed' }] : [], supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [],
    gradeLevel: grade, subject: SUBJECT[o.area], relatedSecureObjectives: 0,
  };
  const plan = selectTeachingPlan(input);
  const lines = [
    'Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):',
    `- Target objective: ${o.id} "${o.objective}". Status: ${STATUS_WORDS[status]}.`,
    ...planLines(plan, undefined, status),
    '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.',
    '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).',
  ];
  const text = arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n');
  return { plan, status, text, method: { primary: plan.primary, supporting: plan.supporting, reinforcement: plan.reinforcement ?? null, reasonCodes: plan.reasonCodes } };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const cmd = process.argv[2];
if (cmd) {
  const bm = loadBenchmark();
  if (cmd === 'freeze') {
    mkdirSync(CONFIG, { recursive: true });
    const items = STUDY_OUTCOMES.map((id, idx) => { const o = bm.find((x) => x.id === id)!; return { studentIdx: idx, outcome: id, area: o.area, rule: o.title, objective: o.objective, post: o.items.post.map((i) => ({ id: i.id, prompt: i.prompt, material: i.material ?? null, scoring: i.scoring })) }; });
    const body = JSON.stringify({ note: 'Frozen BEFORE the new sessions of the clarity study. These are the benchmark post-stage items (4 per outcome), written before any tutoring run and never shown to any tutor prompt (tutors see lesson practice items only). Scored deterministically with benchmark/scoring.ts.', items }, null, 1);
    writeFileSync(path.join(CONFIG, 'POSTTEST_ITEMS.json'), body); writeFileSync(path.join(CONFIG, 'POSTTEST_ITEMS.sha256'), sha(body) + '\n'); console.log('frozen', items.length, 'outcomes, sha', sha(body).slice(0, 12));
  } else if (cmd === 'postprep') {
    const [, , , sessDir, outDir] = process.argv; mkdirSync(outDir, { recursive: true });
    const frozen = JSON.parse(readFileSync(path.join(CONFIG, 'POSTTEST_ITEMS.json'), 'utf8')).items as any[];
    const TUT: Record<string, string> = { A0: 'D', A: 'E', B: 'F', C: 'G', P: 'C' }; // study arm -> session file suffix
    const jobs: any[] = [];
    for (const f of frozen) for (const arm of Object.keys(TUT)) {
      const file = path.join(sessDir, `s${f.studentIdx}_${TUT[arm]}.json`); if (!existsSync(file)) continue;
      const sess = JSON.parse(readFileSync(file, 'utf8')); const turns = sess.turns.slice(0, 6).filter((t: any) => t.tutor !== undefined);
      const o = bm.find((x) => x.id === f.outcome)!; const st = makeStudent(f.studentIdx, SEED); const blockId = `${f.studentIdx}-${f.outcome}`;
      const flags = f.post.map((it: any) => { const b = itemBehaviour(st, blockId, it.id, 'post', o.difficulty); return [b.lapse ? 'Right now you are distracted: answer quickly and carelessly, without checking.' : '', b.guess ? 'You are not sure and you just guess (or repeat a pattern you memorised without understanding).' : '', b.slip ? 'This point is hard for you: in this answer you slip and make a typical error.' : ''].filter(Boolean).join(' '); });
      jobs.push({ job: `${arm}|s${f.studentIdx}`, arm, studentIdx: f.studentIdx, outcome: f.outcome, persona: sess.persona, turns, items: f.post.map((it: any, k: number) => ({ id: it.id, prompt: it.prompt, material: it.material, directive: flags[k] })) });
    }
    // 3 jobs per agent file, from 3 different outcomes and different arms where possible (no agent sees two sessions on the same outcome)
    const order = [...jobs].sort((a, b) => (a.studentIdx * 7 + a.arm.length) % 31 - (b.studentIdx * 7 + b.arm.length) % 31 || a.job.localeCompare(b.job));
    const groups: any[][] = []; for (const j of order) { let g = groups.find((x) => x.length < 3 && !x.some((y) => y.outcome === j.outcome)); if (!g) { g = []; groups.push(g); } g.push(j); }
    groups.forEach((g, n) => {
      const id = `pt${String(n + 1).padStart(2, '0')}`; let t = 'You will answer short English-language questions as three different learners, one after the other. Treat each CASE as completely separate: use only that learner\'s card and that learner\'s own lesson conversation.\n';
      for (const j of g) {
        t += `\n\n=========== CASE ${j.job.replace('|', '_')} ===========\nLEARNER CARD:\n${j.persona}\n\nTHE LEARNER'S RECENT LESSON (this is all the learner remembers being taught):\n${j.turns.map((x: any) => `STUDENT: ${x.learner}\nTUTOR: ${x.tutor}`).join('\n')}\n\nNOW THE LEARNER ANSWERS 4 QUESTIONS ALONE (no tutor, no notes, no help). Answer each as this learner would: use what the lesson taught to the extent the learner would have learned and kept it, keep the mistaken idea if the lesson did not convince the learner, and follow the directive for each question if there is one.\n`;
        j.items.forEach((it: any, k: number) => { t += `\nQ${k + 1} [${it.id}]${it.directive ? ` (directive: ${it.directive})` : ''}\n${it.material ? `${it.material}\n` : ''}${it.prompt}\n`; });
      }
      writeFileSync(path.join(outDir, `${id}.md`), t);
    });
    writeFileSync(path.join(outDir, 'KEY.json'), JSON.stringify(groups.map((g, n) => ({ file: `pt${String(n + 1).padStart(2, '0')}`, jobs: g.map((j) => ({ case: j.job.replace('|', '_'), arm: j.arm, studentIdx: j.studentIdx, outcome: j.outcome, itemIds: j.items.map((i: any) => i.id) })) })), null, 1));
    console.log('jobs', jobs.length, 'batches', groups.length);
  } else if (cmd === 'postscore') {
    const outDir = process.argv[3]; const key = JSON.parse(readFileSync(path.join(outDir, 'KEY.json'), 'utf8')); const rows: any[] = [];
    for (const g of key) {
      const f = path.join(outDir, `${g.file}.answers.json`); if (!existsSync(f)) { console.log('missing', g.file); continue; }
      const ans = JSON.parse(readFileSync(f, 'utf8'));
      for (const j of g.jobs) { const o = bm.find((x) => x.id === j.outcome)!; const a = ans[j.case] ?? {}; const res = o.items.post.map((it) => scoreItem(String(a[it.id] ?? ''), it).correct); rows.push({ ...j, correct: res.filter(Boolean).length, n: res.length, acc: res.filter(Boolean).length / res.length }); }
    }
    writeFileSync(path.join(outDir, 'POSTTEST_SCORES.json'), JSON.stringify(rows, null, 1)); console.log('scored', rows.length);
  }
}
