import { readFileSync } from 'fs';
import path from 'path';
import { runExperiment, generateReports, lockPrereg, loadBenchmark, type ExperimentConfig } from './orchestrator/run';
import { validateBenchmark } from './benchmark/validate';
import { writeFileSync, mkdirSync } from 'fs';
import { challengeReport } from './analytics/challenges';
import { simulatorChecks, renderChecks, loadRaw } from './students/simulatorValidation';
const ROOT = path.resolve(__dirname, '..');
const LIMITATIONS = [
  'All learners are AI-simulated. Nothing here is evidence of learning in real humans; it can only guide engineering and prioritise a real classroom study.',
  'The simulated learner is itself a language model prompted from numeric parameters; its learning behaviour has not been validated against real learner data. Simulator-validity checks (docs/SIMULATOR_VALIDATION.md) test internal sanity, not human realism.',
  'Listening outcomes are TEXT-BASED dialogue comprehension, not audio. Pronunciation and speaking are not assessed.',
  'Delayed retention is simulated by seeded sentence-level forgetting of the learner\'s own note, not by real elapsed time.',
  'Deterministic key/rubric scoring is authoritative; the blind second judge is a model and agrees only imperfectly (see judge agreement in finished.json). Disagreements are listed for human review.',
  'Teaching exposure differs by condition (e.g. notes have no interaction; the scripted tutor is not generative); differences are recorded per block as unavoidableDifferences.',
  'The ENARA ablation (condition E) removes prompt-level adaptive instructions only; answer-hiding guards stay on in all ENARA conditions.',
  'Student replies and tutor replies are sampled from provider models, so reruns with the same seed reproduce the design, assignment and student parameters exactly but not word-for-word model output.',
];
const [cmd, arg] = process.argv.slice(2);
(async () => {
  if (cmd === 'validate-benchmark') { const e = validateBenchmark(loadBenchmark()); console.log(e.length ? e.join('\n') : '48 outcomes valid'); process.exit(e.length ? 1 : 0); }
  else if (cmd === 'lock-prereg') console.log('locked', lockPrereg());
  else if (cmd === 'run') { const cfg = JSON.parse(readFileSync(path.resolve(arg), 'utf8')) as ExperimentConfig; const r = await runExperiment(cfg, { dry: process.argv.includes('--dry') }); generateReports(r.dir, LIMITATIONS); console.log(JSON.stringify({ dir: r.dir, complete: r.finished.complete, recorded: r.finished.blocksRecorded, planned: r.finished.blocksPlanned, failed: r.finished.blocksFailed, spentUsd: r.finished.ledger.totalUsd, leakage: r.finished.leakageEvents }, null, 1)); }
  else if (cmd === 'analyze-extra') { const d = path.resolve(arg); const raw = loadRaw(path.join(d, 'raw/blocks.jsonl')); const mf = JSON.parse(readFileSync(path.join(d, 'manifest.json'), 'utf8')).config; const nAdv = Math.round(mf.students * mf.adversarialShare); for (const r of raw) { if (Number(r.result.studentId.slice(1)) <= nAdv && !r.result.tags.includes('adversarial')) r.result.tags.push('adversarial'); } /* adversarial flag derived from config (students 1..N) for runs recorded before the tag existed */ const audit = readFileSync(path.join(d, 'raw/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); mkdirSync(path.join(d, 'reports'), { recursive: true });
    writeFileSync(path.join(d, 'reports/8_challenge_tests.md'), challengeReport(raw.map((r) => r.result)));
    const cs = simulatorChecks(raw, audit); writeFileSync(path.join(d, 'reports/9_simulator_validation.md'), `# Simulator validation (independent of tutor quality)\n\nSimulation only. These checks test the simulator's internal sanity, not its realism against real learners.\n\n${renderChecks(cs)}\n`); console.log(renderChecks(cs)); }
  else if (cmd === 'repeat-check') { const a = loadRaw(path.join(path.resolve(arg), 'raw/blocks.jsonl')); const b = loadRaw(path.join(path.resolve(process.argv[4]), 'raw/blocks.jsonl')); const m = new Map<string, boolean>(); for (const r of b) if (r.scores) for (const x of [...r.scores.pre, ...r.scores.post, ...r.scores.transfer, ...r.scores.delayed]) m.set(`${r.result.blockId}|${x.itemId}`, x.correct);
    const A: string[] = []; const B: string[] = []; for (const r of a) if (r.scores) for (const x of [...r.scores.pre, ...r.scores.post, ...r.scores.transfer, ...r.scores.delayed]) { const o = m.get(`${r.result.blockId}|${x.itemId}`); if (o !== undefined) { A.push(x.correct ? 'c' : 'w'); B.push(o ? 'c' : 'w'); } }
    const agree = A.filter((x, i) => x === B[i]).length / A.length; const { cohenKappa } = await import('./stats/stats'); const out = `# Repeat-run consistency\n\nTwo runs, same seed and design, independent provider sampling. Items compared: ${A.length}. Raw agreement on correct/incorrect: ${(agree * 100).toFixed(1)}%. Cohen's kappa: ${cohenKappa(A, B).toFixed(2)}.\n`; writeFileSync(path.join(path.resolve(arg), 'reports/10_repeat_run_consistency.md'), out); console.log(out); }
  else if (cmd === 'report') { generateReports(path.resolve(arg), LIMITATIONS); console.log('reports regenerated from raw results'); }
  else { console.log('commands: validate-benchmark | lock-prereg | run <config.json> [--dry] | report <run-dir>'); process.exit(2); }
})().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
