import type { AssessmentItem, Outcome, Stage } from '../benchmark/schema';
import { scoreItem } from '../benchmark/scoring';
import type { Provider, CallCtx } from '../providers/guard';
import { type StudentState, itemBehaviour, retainedAfter } from '../students/population';

export interface ItemResult { itemId: string; stage: Stage; days: number; answer: string; confidence: number | null; correct: boolean; scoreDetail: string; lapse: boolean; guess: boolean; memoryChars: number; misconceptionId: string | null; }
export const DELAYED_DAYS = [1, 7, 30, 30]; // simulated retention intervals for delayed items 1..4

/** Simulated forgetting: each sentence of the learner's note survives with probability exp(-ln2*days/halfLife), decided by seeded rolls. */
export function forget(s: StudentState, blockId: string, note: string, days: number): string {
  if (!note.trim() || days <= 0) return note;
  const parts = note.split(/(?<=[.!?\n])\s+/).filter(Boolean);
  return parts.filter((p, i) => retainedAfter(s, blockId, `note${i}`, days)).join(' ');
}
export function parseAnswer(raw: string): { answer: string; confidence: number | null } {
  const m = raw.match(/ANSWER:\s*([\s\S]*?)(?:\n\s*CONFIDENCE:\s*(\d{1,3}))?\s*$/i);
  if (!m) return { answer: raw.trim(), confidence: null };
  const c = m[2] === undefined ? null : Math.min(100, Number(m[2]));
  return { answer: m[1].trim(), confidence: c };
}
export async function answerItem(o: { provider: Provider; model: string; persona: string; student: StudentState; blockId: string; item: AssessmentItem; stage: Stage; memory: string; days: number; ctx: (role: string) => CallCtx }): Promise<ItemResult> {
  const { student: s, item } = o; const b = itemBehaviour(s, o.blockId, item.id, o.stage);
  const directives = [b.lapse ? 'Right now you are distracted: answer quickly and carelessly, without checking.' : '', b.guess ? 'You are not sure and you just guess (or repeat a pattern you memorised without understanding).' : ''].filter(Boolean).join(' ');
  const sys = `${o.persona}\n\nNow you take a short quiz on your own (no help). Answer as this learner really would, with your current knowledge and habits. ${directives}\nReply in exactly this format:\nANSWER: <your answer only>\nCONFIDENCE: <0-100, how sure you are>`;
  const mem = o.memory.trim() ? `Your note to yourself from studying${o.days > 0 ? ` (${o.days} days ago; this is what you still remember)` : ''}: ${o.memory}` : '(You have not studied this point.)';
  const q = `${mem}\n\nQuiz question: ${item.prompt}${item.material ? `\n\n${item.material}` : ''}`;
  const raw = (await o.provider.chat({ model: o.model, system: sys, user: q, maxTokens: 1500, effort: 'low' }, o.ctx('student_assess'))).text;
  const { answer, confidence } = parseAnswer(raw); const r = scoreItem(answer, item);
  return { itemId: item.id, stage: o.stage, days: o.days, answer, confidence, correct: r.correct, scoreDetail: r.detail, lapse: b.lapse, guess: b.guess, memoryChars: o.memory.length, misconceptionId: item.misconceptionId ?? null };
}
export interface BlockScores { pre: ItemResult[]; post: ItemResult[]; transfer: ItemResult[]; delayed: ItemResult[]; prereq: ItemResult | null; }
export const frac = (r: ItemResult[]): number => (r.length ? r.filter((x) => x.correct).length / r.length : NaN);

export async function assessBlock(o: { provider: Provider; model: string; persona: string; student: StudentState; blockId: string; outcome: Outcome; note: string; ctx: (role: string) => CallCtx; stages?: Stage[] }): Promise<BlockScores> {
  const base = { provider: o.provider, model: o.model, persona: o.persona, student: o.student, blockId: o.blockId, ctx: o.ctx };
  const out: BlockScores = { pre: [], post: [], transfer: [], delayed: [], prereq: null };
  out.prereq = await answerItem({ ...base, item: o.outcome.prereqProbe, stage: 'pre', memory: '', days: 0 });
  for (const it of o.outcome.items.pre) out.pre.push(await answerItem({ ...base, item: it, stage: 'pre', memory: '', days: 0 }));
  return out;
}
export async function assessAfter(o: { provider: Provider; model: string; persona: string; student: StudentState; blockId: string; outcome: Outcome; note: string; ctx: (role: string) => CallCtx }, out: BlockScores): Promise<BlockScores> {
  const base = { provider: o.provider, model: o.model, persona: o.persona, student: o.student, blockId: o.blockId, ctx: o.ctx };
  for (const it of o.outcome.items.post) out.post.push(await answerItem({ ...base, item: it, stage: 'post', memory: o.note, days: 0 }));
  for (const it of o.outcome.items.transfer) out.transfer.push(await answerItem({ ...base, item: it, stage: 'transfer', memory: o.note, days: 0 }));
  for (const [i, it] of o.outcome.items.delayed.entries()) { const d = DELAYED_DAYS[i]; out.delayed.push(await answerItem({ ...base, item: it, stage: 'delayed', memory: forget(o.student, o.blockId, o.note, d), days: d })); }
  return out;
}
/** Outcome-specific mastery, fixed in the benchmark before any testing. Never derived from a single correct answer. */
export function mastery(o: Outcome, s: BlockScores): { mastered: boolean; post: number; transfer: number } {
  const post = frac(s.post); const transfer = frac(s.transfer);
  return { mastered: post >= o.mastery.postMinCorrect && transfer >= o.mastery.transferMinCorrect, post, transfer };
}
/** The eight assessment dimensions, computed from recorded item results only. */
export function dimensions(o: Outcome, s: BlockScores, turns: number) {
  const pre = frac(s.pre); const post = frac(s.post); const tr = frac(s.transfer); const del = frac(s.delayed);
  const withM = (r: ItemResult[]) => r.filter((x) => x.misconceptionId);
  const preM = withM(s.pre); const postM = withM(s.post);
  return {
    acquisition: post - pre, comprehension: frac(s.post.filter((x) => !x.guess && !x.lapse)), application: post, transfer: tr, retention: del,
    errorCorrection: s.pre.some((x) => !x.correct) ? frac(s.post) : NaN, misconceptionRecovery: preM.some((x) => !x.correct) && postM.length ? frac(postM) : NaN,
    independentPerformance: frac([...s.post, ...s.transfer]), // measured with no tutor present, from memory only
    _pre: pre, _turns: turns,
  };
}
