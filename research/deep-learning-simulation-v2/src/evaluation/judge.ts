import type { AssessmentItem } from '../benchmark/schema';
import type { Provider, CallCtx } from '../providers/guard';
import { Rng } from '../util/rng';
import { cohenKappa } from '../stats/stats';
import { norm } from '../benchmark/scoring';
import type { ItemResult } from './assess';

/** Independent, blind second evaluator. It never sees the condition, the tutor, the key's accepted list or the deterministic verdict;
 *  it gets only the question, the learner's answer, and a plain-language description of what a correct answer must do.
 *  ENARA does not grade itself: the judge is a separate model call (default haiku-class) and the deterministic key remains authoritative. */
export async function blindJudge(p: Provider, model: string, item: AssessmentItem, answer: string, ctx: CallCtx): Promise<boolean> {
  const sys = 'You grade one answer to an English-learning question. Reply with exactly one word: CORRECT or INCORRECT. An answer that hedges between options, or only partly meets the requirement, is INCORRECT.';
  const req = item.scoring.type === 'key' ? `A correct answer must express: ${item.right[0]} (equivalent correct wording is fine).` : `A correct answer must satisfy: ${item.scoring.checks.filter((c) => c.required).map((c) => c.description).join('; ')}.`;
  const t = (await p.chat({ model, system: sys, user: `Question: ${item.prompt}${item.material ? `\n${item.material}` : ''}\n${req}\n\nLearner answer: ${answer}`, maxTokens: 400, effort: 'low' }, ctx)).text;
  return /^\s*correct\b/i.test(t);
}
export interface JudgeRecord { blockId: string; itemId: string; answer: string; deterministic: boolean; judge: boolean; agree: boolean; }
/** Judge a seeded sample (fraction) of item results; returns records for the audit log and agreement statistics. */
export async function judgeSample(p: Provider, model: string, seed: string, rate: number, rows: { blockId: string; item: AssessmentItem; result: ItemResult }[], ctx: (role: string) => CallCtx): Promise<JudgeRecord[]> {
  const out: JudgeRecord[] = [];
  for (const r of rows) {
    if (!Rng.of(seed, 'judge', r.blockId, r.item.id).bool(rate)) continue;
    const j = await blindJudge(p, model, r.item, r.result.answer, { ...ctx('judge'), blockId: r.blockId });
    out.push({ blockId: r.blockId, itemId: r.item.id, answer: r.result.answer, deterministic: r.result.correct, judge: j, agree: j === r.result.correct });
  }
  return out;
}
export function agreement(recs: JudgeRecord[]) {
  const a = recs.map((r) => (r.deterministic ? 'c' : 'w')); const b = recs.map((r) => (r.judge ? 'c' : 'w'));
  return { n: recs.length, rawAgreement: recs.length ? recs.filter((r) => r.agree).length / recs.length : NaN, kappa: cohenKappa(a, b), disagreements: recs.filter((r) => !r.agree) };
}
/** Human-auditable disagreement sample: all disagreements, capped, in a plain list for a person to review. */
export const disagreementSample = (recs: JudgeRecord[], cap = 50): JudgeRecord[] => recs.filter((r) => !r.agree).slice(0, cap);

/** Post-hoc leakage detection over everything the tutor/notes side produced: no assessment prompt, material or accepted phrase may appear. */
export function leakageScan(texts: { where: string; text: string }[], phrases: string[]): { where: string; phrase: string }[] {
  const ps = [...new Set(phrases.map((x) => norm(x).trim()).filter((x) => x.split(' ').length >= 6))]; const hits: { where: string; phrase: string }[] = [];
  for (const t of texts) { const n = norm(t.text); for (const p of ps) if (n.includes(p)) hits.push({ where: t.where, phrase: p }); }
  return hits;
}
