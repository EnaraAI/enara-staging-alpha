import { Rng } from '../util/rng';
import { mean, sd, hedgesG, clusterBootstrapMean, signFlipPermutation, holm, benjaminiHochberg, wilson, type Obs } from '../stats/stats';
import { CONDITIONS, CONDITION_NAMES, type Condition } from '../design/assignment';
import { summarizeLedger, type Attempt } from '../ledger/ledger';
import type { Area } from '../benchmark/schema';

export interface BlockResult {
  blockId: string; studentId: string; replication: number; outcomeId: string; area: Area; condition: Condition; order: number; tags: string[]; difficulty: number; cefr: string;
  status: 'ok' | 'failed'; error: string | null;
  pre: number; post: number; transfer: number; delayed: number; delayed1: number | null; delayed7: number | null; delayed30: number | null; prereq: boolean | null;
  mastered: boolean; misconceptionHeld: boolean; misconceptionRecovered: boolean | null; errorCorrection: number | null;
  turns: number; exposureWords: number; tutorCalls: number; costUsd: number | null; unknownCost: boolean; teachingSeconds: number | null;
  confidenceMean: number | null; calibrationGap: number | null; hintDependence: number | null; guessedCorrect: number; lapses: number; leakageEvents: number;
}
const ok = (r: BlockResult[]) => r.filter((x) => x.status === 'ok');
export type Measure = 'gain' | 'post' | 'transfer' | 'delayed' | 'mastered' | 'misconception';
export const MEASURES: Record<Measure, (r: BlockResult) => number | null> = {
  gain: (r) => r.post - r.pre, post: (r) => r.post, transfer: (r) => r.transfer, delayed: (r) => r.delayed, mastered: (r) => (r.mastered ? 1 : 0), misconception: (r) => (r.misconceptionRecovered === null ? null : r.misconceptionRecovered ? 1 : 0),
};
export interface Contrast { a: Condition; b: Condition; measure: Measure; confirmatory: boolean; nStudents: number; meanA: number; meanB: number; diff: number; ciLo: number; ciHi: number; g: number; p: number; pAdj: number | null; q: number | null; label: 'confirmatory' | 'exploratory'; }

/** Per-student paired difference: mean over the student's condition-a blocks minus condition-b blocks (the crossed design gives each student one block per condition). */
function pairedObs(res: BlockResult[], a: Condition, b: Condition, m: Measure) {
  const by = new Map<string, { a: BlockResult[]; b: BlockResult[] }>(); for (const r of ok(res)) { const e = by.get(r.studentId) ?? by.set(r.studentId, { a: [], b: [] }).get(r.studentId)!; if (r.condition === a) e.a.push(r); if (r.condition === b) e.b.push(r); }
  const obs: Obs[] = []; const va: number[] = []; const vb: number[] = [];
  for (const [student, e] of by) { const xa = e.a.map(MEASURES[m]).filter((v): v is number => v !== null); const xb = e.b.map(MEASURES[m]).filter((v): v is number => v !== null); if (!xa.length || !xb.length) continue; const ma = mean(xa); const mb = mean(xb); va.push(ma); vb.push(mb); obs.push({ student, outcome: e.a[0].outcomeId, value: ma - mb }); }
  return { obs, va, vb };
}
export function contrast(res: BlockResult[], a: Condition, b: Condition, m: Measure, seed: string, confirmatory: boolean): Contrast {
  const { obs, va, vb } = pairedObs(res, a, b, m); const rng = Rng.of(seed, 'contrast', a, b, m);
  const ci = clusterBootstrapMean(obs, rng, 2000); const p = signFlipPermutation(obs.map((o) => o.value), rng, 10000);
  return { a, b, measure: m, confirmatory, nStudents: obs.length, meanA: mean(va), meanB: mean(vb), diff: ci.est, ciLo: ci.lo, ciHi: ci.hi, g: hedgesG(va, vb).g, p, pAdj: null, q: null, label: confirmatory ? 'confirmatory' : 'exploratory' };
}
export interface Prereg { confirmatory: { a: Condition; b: Condition; measure: Measure }[]; seed: string; }
/** Confirmatory family (pre-registered) gets Holm; every other contrast is exploratory and gets Benjamini-Hochberg. */
export function allContrasts(res: BlockResult[], prereg: Prereg): Contrast[] {
  const key = (a: string, b: string, m: string) => `${a}|${b}|${m}`; const conf = new Set(prereg.confirmatory.map((c) => key(c.a, c.b, c.measure))); const out: Contrast[] = [];
  for (const c of prereg.confirmatory) out.push(contrast(res, c.a, c.b, c.measure, prereg.seed, true));
  const meas: Measure[] = ['gain', 'post', 'transfer', 'delayed', 'mastered', 'misconception'];
  for (const a of CONDITIONS) for (const b of CONDITIONS) { if (a >= b) continue; for (const m of meas) if (!conf.has(key(a, b, m)) && !conf.has(key(b, a, m))) out.push(contrast(res, a, b, m, prereg.seed, false)); }
  const C = out.filter((c) => c.confirmatory); const adj = holm(C.map((c) => c.p)); C.forEach((c, i) => { c.pAdj = adj[i]; });
  const E = out.filter((c) => !c.confirmatory); const q = benjaminiHochberg(E.map((c) => c.p)); E.forEach((c, i) => { c.q = q[i]; });
  return out;
}
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'n/a');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const condTable = (res: BlockResult[], extra: (r: BlockResult[]) => string[] = () => []) => ['| Condition | blocks | pre | post | transfer | delayed | mastery |' + (extra([]).length ? ' extra |' : ''), '|---|---|---|---|---|---|---|' + (extra([]).length ? '---|' : ''),
  ...CONDITIONS.map((c) => { const r = ok(res).filter((x) => x.condition === c); const e = extra(r); return `| ${c} ${CONDITION_NAMES[c]} | ${r.length} | ${pct(mean(r.map((x) => x.pre)))} | ${pct(mean(r.map((x) => x.post)))} | ${pct(mean(r.map((x) => x.transfer)))} | ${pct(mean(r.map((x) => x.delayed)))} | ${pct(mean(r.map((x) => (x.mastered ? 1 : 0))))} |${e.length ? ` ${e.join(' ')} |` : ''}`; })].join('\n');

export interface ReportInput { results: BlockResult[]; attempts: Attempt[]; prereg: Prereg; runId: string; experimentId: string; simulatedOnly: true; limitations: string[]; }
export function buildReports(inp: ReportInput): Record<string, string> {
  const { results, prereg } = inp; const good = ok(results); const failed = results.filter((r) => r.status === 'failed'); const cs = allContrasts(results, prereg); const led = summarizeLedger(inp.attempts);
  const head = (t: string) => `# ${t}\n\nExperiment ${inp.experimentId} · run ${inp.runId}\n\n> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.\n\n${good.length} completed blocks, ${failed.length} failed/incomplete blocks (failed blocks are listed, never dropped).\n`;
  const cTable = (cc: Contrast[]) => ['| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |', '|---|---|---|---|---|---|---|---|---|---|', ...cc.map((c) => `| ${c.a} vs ${c.b} | ${c.measure} | ${c.nStudents} | ${f2(c.meanA)} | ${f2(c.meanB)} | ${f2(c.diff)} [${f2(c.ciLo)}, ${f2(c.ciHi)}] | ${f2(c.g)} | ${c.p.toFixed(4)} | ${c.pAdj !== null ? 'Holm ' + c.pAdj.toFixed(4) : 'BH ' + (c.q ?? NaN).toFixed(4)} | ${c.label} |`)].join('\n');
  const R: Record<string, string> = {};
  R['1_overall_effectiveness'] = `${head('Report 1: Overall effectiveness')}\n${condTable(results)}\n\n## Confirmatory contrasts (pre-registered; Holm-adjusted)\n\n${cTable(cs.filter((c) => c.confirmatory))}\n\n## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)\n\n${cTable(cs.filter((c) => !c.confirmatory && ['A', 'F'].some((x) => x === c.a || x === c.b)))}\n\nUnit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.\n`;
  const perStudent = new Map<string, BlockResult[]>(); for (const r of good) (perStudent.get(r.studentId) ?? perStudent.set(r.studentId, []).get(r.studentId)!).push(r);
  R['2_student_level'] = `${head('Report 2: Student-level')}\n| Student | tags | blocks | mean gain (tutored A/C/D/E) | mean gain (B notes) | mean gain (F control) | mastered blocks |\n|---|---|---|---|---|---|---|\n${[...perStudent].map(([s, rs]) => { const g = (cs: string[]) => mean(rs.filter((r) => cs.includes(r.condition)).map((r) => r.post - r.pre)); return `| ${s} | ${rs[0].tags.join(', ')} | ${rs.length} | ${f2(g(['A', 'C', 'D', 'E']))} | ${f2(g(['B']))} | ${f2(g(['F']))} | ${rs.filter((r) => r.mastered).length} |`; }).join('\n')}\n\n## Subgroups (tag = overlapping behavioural dimension; exploratory)\n\n| Tag | students | A−F gain | A−B gain |\n|---|---|---|---|\n${[...new Set(good.flatMap((r) => r.tags))].sort().map((t) => { const sub = results.filter((r) => r.tags.includes(t)); const a = contrast(sub, 'A', 'F', 'gain', prereg.seed, false); const b = contrast(sub, 'A', 'B', 'gain', prereg.seed, false); return `| ${t} | ${a.nStudents} | ${f2(a.diff)} [${f2(a.ciLo)}, ${f2(a.ciHi)}] | ${f2(b.diff)} [${f2(b.ciLo)}, ${f2(b.ciHi)}] |`; }).join('\n')}\n`;
  const adapt = ['A', 'E'].map((c) => ok(results).filter((r) => r.condition === c));
  R['3_adaptive_teaching'] = `${head('Report 3: Adaptive teaching effectiveness (A = full ENARA vs E = ablation)')}\n${cTable(cs.filter((c) => (c.a === 'A' && c.b === 'E') || (c.a === 'E' && c.b === 'A')))}\n\nMeans: A post ${pct(mean(adapt[0].map((r) => r.post)))}, E post ${pct(mean(adapt[1].map((r) => r.post)))}; A mastery ${pct(mean(adapt[0].map((r) => (r.mastered ? 1 : 0))))}, E mastery ${pct(mean(adapt[1].map((r) => (r.mastered ? 1 : 0))))}.\nAblated features are listed in the run manifest; guards (answer-hiding) are never ablated.\n`;
  const withM = good.filter((r) => r.misconceptionHeld);
  R['4_misconception_recovery'] = `${head('Report 4: Misconception recovery')}\nBlocks where the student started with a held misconception (pre-test showed it): ${withM.length}.\n\n| Condition | blocks | recovered (post right on misconception items) |\n|---|---|---|\n${CONDITIONS.map((c) => { const r = withM.filter((x) => x.condition === c && x.misconceptionRecovered !== null); const k = r.filter((x) => x.misconceptionRecovered).length; const w = wilson(k, r.length); return `| ${c} | ${r.length} | ${pct(w.p)} [${pct(w.lo)}, ${pct(w.hi)}] |`; }).join('\n')}\n`;
  R['5_transfer_retention'] = `${head('Report 5: Transfer and retention')}\n${condTable(results, (r) => [`d1 ${pct(mean(r.map((x) => x.delayed1 ?? NaN).filter(Number.isFinite)))} / d7 ${pct(mean(r.map((x) => x.delayed7 ?? NaN).filter(Number.isFinite)))} / d30 ${pct(mean(r.map((x) => x.delayed30 ?? NaN).filter(Number.isFinite)))}`])}\n\n${cTable(cs.filter((c) => ['transfer', 'delayed'].includes(c.measure) && (c.a === 'A' || c.b === 'A')))}\n`;
  const byO = new Map<string, BlockResult[]>(); for (const r of good) (byO.get(r.outcomeId) ?? byO.set(r.outcomeId, []).get(r.outcomeId)!).push(r);
  R['6_outcome_performance'] = `${head('Report 6: Outcome performance and difficulty')}\n| Outcome | area | difficulty | blocks | post (taught A/C/D/E) | post (control F) | gain taught | mastery taught |\n|---|---|---|---|---|---|---|---|\n${[...byO].sort().map(([o, rs]) => { const t = rs.filter((r) => ['A', 'C', 'D', 'E'].includes(r.condition)); const f = rs.filter((r) => r.condition === 'F'); return `| ${o} | ${rs[0].area} | ${rs[0].difficulty} | ${rs.length} | ${pct(mean(t.map((r) => r.post)))} | ${pct(mean(f.map((r) => r.post)))} | ${f2(mean(t.map((r) => r.post - r.pre)))} | ${pct(mean(t.map((r) => (r.mastered ? 1 : 0))))} |`; }).join('\n')}\n\n## Failure analysis\n\nTaught blocks that did not improve (post ≤ pre): ${good.filter((r) => ['A', 'C', 'D', 'E'].includes(r.condition) && r.post <= r.pre).length} of ${good.filter((r) => ['A', 'C', 'D', 'E'].includes(r.condition)).length}. Failed/incomplete blocks: ${failed.length}${failed.length ? ' (' + failed.slice(0, 10).map((f) => `${f.blockId}: ${f.error}`).join('; ') + ')' : ''}.\n`;
  const costOf = (c: Condition) => good.filter((r) => r.condition === c);
  R['7_economic_efficiency'] = `${head('Report 7: Economic efficiency (actual recorded provider cost; unknown cost is reported, never guessed)')}\nTotal recorded provider cost: **$${led.totalUsd.toFixed(2)}** over ${led.attempts} attempts (${led.failedAttempts} failed; retry cost $${led.retryCostUsd.toFixed(2)}; failed-attempt cost $${led.failedCostUsd.toFixed(2)}; **${led.unknownCostAttempts} attempts with unknown/unpriced cost**).\n\n| Condition | blocks | tutor calls/block | exposure words/block | cost/block (tutor-side + student) | cost per mastered outcome |\n|---|---|---|---|---|---|\n${CONDITIONS.map((c) => { const r = costOf(c); const cost = r.reduce((s, x) => s + (x.costUsd ?? 0), 0); const m = r.filter((x) => x.mastered).length; return `| ${c} ${CONDITION_NAMES[c]} | ${r.length} | ${f2(mean(r.map((x) => x.tutorCalls)))} | ${f2(mean(r.map((x) => x.exposureWords)))} | $${(cost / Math.max(1, r.length)).toFixed(3)} | ${m ? '$' + (cost / m).toFixed(2) : 'n/a (none mastered)'} |`; }).join('\n')}\n\nBy role: ${Object.entries(led.byRole).map(([k, v]) => `${k} $${v.costUsd.toFixed(2)}`).join(', ')}.\n`;
  R['0_limitations'] = `# Limitations\n\n${inp.limitations.map((l) => '- ' + l).join('\n')}\n`;
  return R;
}
export { sd };
