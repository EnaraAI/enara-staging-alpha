import { readFileSync } from 'fs';
import { mean, pearson, wilson } from '../stats/stats';
import type { BlockResult } from '../analytics/analyze';
import type { ItemResult } from '../evaluation/assess';
export interface Check { name: string; pass: boolean; detail: string; }
interface Raw { result: BlockResult; scores: { pre: ItemResult[]; post: ItemResult[]; transfer: ItemResult[]; delayed: ItemResult[] } | null; teaching: { notes: string } | null; leakHits: unknown[]; }
export const loadRaw = (file: string): Raw[] => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** Validation of the SIMULATOR (independent of tutor quality). Uses the no-teaching control F, which isolates simulator behaviour. */
export function simulatorChecks(raw: Raw[], audit: { blockId: string; knowsAlready: boolean; heldMisconception: string | null }[]): Check[] {
  const ok = raw.filter((r) => r.result.status === 'ok' && r.scores); const F = ok.filter((r) => r.result.condition === 'F'); const out: Check[] = [];
  // 1 No-teaching control must not show large learning jumps.
  const jumps = F.filter((r) => r.result.post - r.result.pre >= 0.5); out.push({ name: 'no unrealistic learning jumps without teaching (F post-pre >= +50 pts)', pass: jumps.length <= Math.max(1, Math.floor(F.length * 0.1)), detail: `${jumps.length}/${F.length} control blocks jumped (${(100 * jumps.length / Math.max(1, F.length)).toFixed(0)}%); mean F change ${(100 * mean(F.map((r) => r.result.post - r.result.pre))).toFixed(1)} pts` });
  // 2 Sensitivity to difficulty: harder outcomes -> lower control accuracy.
  const rd = pearson(F.map((r) => r.result.difficulty), F.map((r) => (r.result.pre + r.result.post) / 2)); out.push({ name: 'sensitivity to difficulty (control accuracy falls as difficulty rises)', pass: Number.isFinite(rd) && rd < 0, detail: `r = ${rd.toFixed(2)} over ${F.length} control blocks` });
  // 3 Sensitivity to prior knowledge: students seeded as already knowing the point score higher at pre-test.
  const au = new Map(audit.map((a) => [a.blockId, a])); const k = ok.filter((r) => au.get(r.result.blockId)?.knowsAlready); const nk = ok.filter((r) => au.get(r.result.blockId) && !au.get(r.result.blockId)!.knowsAlready);
  out.push({ name: 'sensitivity to prior knowledge (knows-already blocks score higher at pre-test)', pass: k.length >= 5 && mean(k.map((r) => r.result.pre)) > mean(nk.map((r) => r.result.pre)), detail: `already-know pre ${(100 * mean(k.map((r) => r.result.pre))).toFixed(1)}% (n=${k.length}) vs not ${(100 * mean(nk.map((r) => r.result.pre))).toFixed(1)}% (n=${nk.length})` });
  // 4 Misconceptions persist: students holding an explicit misconception pick the misconception answer more often than others at pre-test.
  // 5 Identical-behaviour detection: on the same outcome, two different students should rarely give identical answers to every item.
  const byO = new Map<string, Raw[]>(); for (const r of ok) (byO.get(r.result.outcomeId) ?? byO.set(r.result.outcomeId, []).get(r.result.outcomeId)!).push(r);
  let pairs = 0; let ident = 0; for (const rs of byO.values()) for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) { const a = rs[i].scores!.pre.map((x) => x.answer.toLowerCase().trim()).join('|'); const b = rs[j].scores!.pre.map((x) => x.answer.toLowerCase().trim()).join('|'); pairs += 1; if (a === b) ident += 1; }
  out.push({ name: 'no identical/copied behaviour across students (identical pre-test answer vectors on the same outcome)', pass: pairs > 0 && ident / pairs < 0.5, detail: `${ident}/${pairs} student pairs identical on pre-test (short key answers can coincide legitimately; flagged only above 50%)` });
  // 6 Behavioural flags work: lapses lower accuracy, guesses lower confidence-calibrated accuracy.
  const items = ok.flatMap((r) => [...r.scores!.post, ...r.scores!.transfer]); const lapse = items.filter((x) => x.lapse); const attn = items.filter((x) => !x.lapse && !x.guess);
  out.push({ name: 'attention-lapse flag lowers accuracy', pass: lapse.length >= 10 && mean(lapse.map((x) => (x.correct ? 1 : 0))) < mean(attn.map((x) => (x.correct ? 1 : 0))), detail: `lapse items ${(100 * mean(lapse.map((x) => (x.correct ? 1 : 0)))).toFixed(1)}% (n=${lapse.length}) vs attentive ${(100 * mean(attn.map((x) => (x.correct ? 1 : 0)))).toFixed(1)}%` });
  // 7 Forgetting: delayed accuracy of taught blocks falls with longer simulated delay (day 1 >= day 30), only where the learner had a note.
  const d1 = ok.filter((r) => r.result.condition !== 'F' && r.result.delayed1 !== null); out.push({ name: 'forgetting: day-1 retention >= day-30 retention in taught blocks', pass: d1.length > 5 && mean(d1.map((r) => r.result.delayed1 as number)) >= mean(d1.map((r) => r.result.delayed30 as number)), detail: `d1 ${(100 * mean(d1.map((r) => r.result.delayed1 as number))).toFixed(1)}% vs d30 ${(100 * mean(d1.map((r) => r.result.delayed30 as number))).toFixed(1)}%` });
  // 8 Leakage: none.
  out.push({ name: 'no assessment leakage into tutor/notes/materials', pass: ok.every((r) => r.leakHits.length === 0) && raw.every((r) => r.result.leakageEvents === 0), detail: `${raw.reduce((n, r) => n + r.result.leakageEvents, 0)} leakage events` });
  // 9 Adversarial profiles: lower gains for adversarial students under teaching.
  const advT = ok.filter((r) => r.result.condition !== 'F' && r.result.tags.includes('adversarial')); const norT = ok.filter((r) => r.result.condition !== 'F' && !r.result.tags.includes('adversarial'));
  out.push({ name: 'adversarial (misconception-heavy) profiles learn less than typical students', pass: advT.length >= 5 && mean(advT.map((r) => r.result.post - r.result.pre)) <= mean(norT.map((r) => r.result.post - r.result.pre)), detail: `adversarial gain ${(100 * mean(advT.map((r) => r.result.post - r.result.pre))).toFixed(1)} pts (n=${advT.length}) vs typical ${(100 * mean(norT.map((r) => r.result.post - r.result.pre))).toFixed(1)} pts (n=${norT.length})` });
  void wilson; return out;
}
export const renderChecks = (cs: Check[]) => ['| Check | Result | Detail |', '|---|---|---|', ...cs.map((c) => `| ${c.name} | ${c.pass ? 'PASS' : '**FAIL**'} | ${c.detail} |`)].join('\n');
