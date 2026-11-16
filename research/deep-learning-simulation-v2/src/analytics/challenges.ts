import { mean, pearson, wilson } from '../stats/stats';
import type { BlockResult } from './analyze';
const ok = (r: BlockResult[]) => r.filter((x) => x.status === 'ok');
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'n/a');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const taught = ['A', 'C', 'D', 'E'];
const gain = (r: BlockResult[]) => mean(r.map((x) => x.post - x.pre));
/** Challenge tests A-G, each defined from recorded results only (no extra provider calls). Each states exactly what was measured. */
export function challengeReport(results: BlockResult[]): string {
  const g = ok(results); const T = g.filter((r) => taught.includes(r.condition)); const A = g.filter((r) => r.condition === 'A'); const F = g.filter((r) => r.condition === 'F');
  const L: string[] = ['# Challenge tests A-G (derived from recorded results; simulation only)\n'];
  const sub = (title: string, body: string[]) => L.push(`## ${title}\n`, ...body, '');
  const adv = A.filter((r) => r.tags.includes('adversarial')); const nonAdv = A.filter((r) => !r.tags.includes('adversarial'));
  sub('A. Adversarial learning (misconception-heavy, slow, guessing profiles)', [`ENARA (A) gain: adversarial ${f2(gain(adv))} (n=${adv.length}) vs other students ${f2(gain(nonAdv))} (n=${nonAdv.length}). No-teaching (F) gain for adversarial: ${f2(gain(F.filter((r) => r.tags.includes('adversarial'))))}.`, `Reading: if the tutor still raises adversarial students above their own no-teaching baseline, the gain over F is positive even though it is smaller than for typical students.`]);
  const mastered = T.filter((r) => r.mastered); const falseM = mastered.filter((r) => r.delayed < 0.5);
  sub('B. False mastery (mastery declared but not retained / guessed)', [`Taught blocks reaching the pre-set mastery criteria: ${mastered.length}. Of these, delayed retention below 50%: ${falseM.length} (${pct(falseM.length / Math.max(1, mastered.length))}).`, `Mastery reached by the no-teaching control F (should be rare; chance/prior knowledge): ${pct(mean(F.map((r) => (r.mastered ? 1 : 0))))}.`, `Guessed-correct answers per block (taught): ${f2(mean(T.map((r) => r.guessedCorrect)))}; correlation of guessed-correct with mastery: ${f2(pearson(T.map((r) => r.guessedCorrect), T.map((r) => (r.mastered ? 1 : 0))))}.`]);
  const fail = T.filter((r) => r.post <= r.pre);
  sub('C. Teaching-failure recovery (limited)', [`Taught blocks with no gain (post <= pre): ${fail.length} of ${T.length} (${pct(fail.length / Math.max(1, T.length))}). By condition: ${['A', 'C', 'D', 'E'].map((c) => `${c} ${T.filter((r) => r.condition === c && r.post <= r.pre).length}/${T.filter((r) => r.condition === c).length}`).join(', ')}.`, `**Limitation:** this harness identifies teaching failures but does not run a second recovery session, so recovery after a failed first session is NOT measured.`]);
  const weak = g.filter((r) => r.prereq === false); const strong = g.filter((r) => r.prereq === true);
  sub('D. Prerequisite gap', [`Prerequisite probe failed (n=${weak.filter((r) => ['A'].includes(r.condition)).length} A-blocks) vs passed (n=${strong.filter((r) => r.condition === 'A').length}): ENARA gain ${f2(gain(weak.filter((r) => r.condition === 'A')))} vs ${f2(gain(strong.filter((r) => r.condition === 'A')))}. All taught conditions: ${f2(gain(weak.filter((r) => taught.includes(r.condition))))} vs ${f2(gain(strong.filter((r) => taught.includes(r.condition))))}.`]);
  sub('E. Context transfer (new situation after teaching)', [`Transfer minus post, by condition: ${['A', 'B', 'C', 'D', 'E', 'F'].map((c) => `${c} ${f2(mean(g.filter((r) => r.condition === c).map((r) => r.transfer - r.post)))}`).join('; ')}. A more negative value means learning did not carry to a new context.`]);
  const cal = (rs: BlockResult[]) => mean(rs.map((r) => r.calibrationGap ?? NaN).filter(Number.isFinite));
  sub('F. Confidence calibration (mean stated confidence minus actual correctness; 0 = calibrated, + = over-confident)', [`Taught ${f2(cal(T))}; control F ${f2(cal(F))}. By tag: over-confident students ${f2(cal(g.filter((r) => r.tags.includes('overconfident'))))}, under-confident ${f2(cal(g.filter((r) => r.tags.includes('underconfident'))))} (the simulator should reproduce the configured bias).`]);
  const hd = A.filter((r) => r.hintDependence !== null);
  sub('G. Hint dependency', [`ENARA blocks: correlation between share of tutor turns containing hints and transfer score = ${f2(pearson(hd.map((r) => r.hintDependence as number), hd.map((r) => r.transfer)))} (n=${hd.length}). Negative = heavy hint use goes with weaker independent transfer. Hint share is a text-pattern proxy.`]);
  const w = wilson(fail.length, T.length); L.push(`_No-gain rate in taught blocks 95% Wilson CI: ${pct(w.lo)}-${pct(w.hi)}._`);
  return L.join('\n');
}
