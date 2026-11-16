// DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)
// Pure, deterministic placement engine. Rules: docs/PLACEMENT_TEST.md.
// Not wired into the tutor or any route. No I/O, no model calls: controlled items are
// scored by exact/accepted-answer match; writing is scored elsewhere and passed in.

import { graderV2On, matchKeyV2 } from '../graderV2';

export type Level = string; // 'A1' | 'A2' | ... (order comes from the bank)
export type ControlledSkill = 'grammar' | 'vocabulary' | 'reading';
export type Skill = ControlledSkill | 'writing';

export interface PlacementItem {
  id: string;
  level: Level;
  skill: Skill;
  type: 'multiple-choice' | 'true-false' | 'short-answer' | 'open-response';
  prompt: string;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  points: number;
  outcomeIds: string[];
  reference: string;
}

export interface PlacementBank {
  status: string;
  levels: Level[];
  startLevel: Level;
  items: PlacementItem[];
}

export interface AnswerRecord { itemId: string; level: Level; skill: ControlledSkill; correct: boolean }

export interface PlacementState {
  current: Level;
  answers: AnswerRecord[];
  sinceMove: number; // items answered at `current` since the last move
}

export const CONFIG = {
  maxItems: 25,
  blockSize: 5,
  moveUp: 0.8, // block accuracy >= moveUp -> up one level
  moveDown: 0.4, // block accuracy <= moveDown -> down one level
  pass: 0.6, // cumulative accuracy >= pass at a level = level passed
  minAtLevel: 5, // items needed at a level to pass/fail it
  minAtEdge: 10, // items needed at the top level (pass) or bottom level (fail) to stop there
  minSkillAtLevel: 2,
  skillTarget: 4, // items per skill for full evidence weight
  overallTarget: 10,
  writingCap: 0.6, // writing confidence never above this (single, model-scored task)
  skillOrder: ['grammar', 'vocabulary', 'reading'] as ControlledSkill[],
};

export const BELOW = 'pre-A1';

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '').trim();
}

export function scoreControlled(item: PlacementItem, response: string): boolean {
  if (item.type === 'open-response') throw new Error(`item ${item.id} is open-response; pass a writing score instead`);
  // graderV2 ON: normalised matching, accepted answers, option letter = option text.
  if (graderV2On()) return matchKeyV2({ type: item.type, prompt: item.prompt, correctAnswer: item.correctAnswer, acceptedAnswers: item.acceptedAnswers }, response);
  const keys = [item.correctAnswer ?? '', ...(item.acceptedAnswers ?? [])].filter(Boolean).map(normalise);
  return keys.includes(normalise(response));
}

export function startSession(bank: PlacementBank): PlacementState {
  if (!bank.levels.includes(bank.startLevel)) throw new Error('startLevel not in levels');
  return { current: bank.startLevel, answers: [], sinceMove: 0 };
}

function stats(answers: AnswerRecord[], level: Level, skill?: ControlledSkill) {
  const a = answers.filter((x) => x.level === level && (!skill || x.skill === skill));
  const correct = a.filter((x) => x.correct).length;
  return { n: a.length, correct, acc: a.length ? correct / a.length : 0 };
}

export function nextItem(bank: PlacementBank, state: PlacementState): PlacementItem | null {
  if (checkStop(bank, state).stop) return null;
  return pickItem(bank, state);
}

function pickItem(bank: PlacementBank, state: PlacementState): PlacementItem | null {
  const used = new Set(state.answers.map((a) => a.itemId));
  const pool = bank.items.filter((i) => i.level === state.current && i.skill !== 'writing' && !used.has(i.id));
  if (!pool.length) return null;
  const counts = CONFIG.skillOrder.map((s) => stats(state.answers, state.current, s).n);
  const order = CONFIG.skillOrder.map((s, i) => ({ s, c: counts[i], i })).sort((a, b) => a.c - b.c || a.i - b.i);
  for (const { s } of order) {
    const hit = pool.find((i) => i.skill === s);
    if (hit) return hit;
  }
  return pool[0];
}

export function answer(bank: PlacementBank, state: PlacementState, itemId: string, response: string): PlacementState {
  const item = bank.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`unknown item ${itemId}`);
  if (item.skill === 'writing') throw new Error('writing is scored via result(..., writingScore)');
  if (item.level !== state.current) throw new Error(`item ${itemId} is not at current level ${state.current}`);
  if (state.answers.some((a) => a.itemId === itemId)) throw new Error(`item ${itemId} already answered`);
  const rec: AnswerRecord = { itemId, level: item.level, skill: item.skill as ControlledSkill, correct: scoreControlled(item, response) };
  const answers = [...state.answers, rec];
  let { current, sinceMove } = state;
  sinceMove += 1;
  if (sinceMove >= CONFIG.blockSize) {
    const block = answers.slice(-CONFIG.blockSize);
    const acc = block.filter((b) => b.correct).length / block.length;
    const idx = bank.levels.indexOf(current);
    if (acc >= CONFIG.moveUp && idx < bank.levels.length - 1) { current = bank.levels[idx + 1]; sinceMove = 0; }
    else if (acc <= CONFIG.moveDown && idx > 0) { current = bank.levels[idx - 1]; sinceMove = 0; }
    else sinceMove = 0; // stay: start a new block at the same level
  }
  return { current, answers, sinceMove };
}

/** Level decided by the controlled items (overall), or null if not yet clear. */
export function clearLevel(bank: PlacementBank, answers: AnswerRecord[]): Level | null {
  const L = bank.levels;
  const passed = (i: number, min: number) => { const s = stats(answers, L[i]); return s.n >= min && s.acc >= CONFIG.pass; };
  const failed = (i: number, min: number) => { const s = stats(answers, L[i]); return s.n >= min && s.acc < CONFIG.pass; };
  for (let i = L.length - 1; i >= 0; i--) {
    const top = i === L.length - 1;
    if (top ? passed(i, CONFIG.minAtEdge) : passed(i, CONFIG.minAtLevel) && failed(i + 1, CONFIG.minAtLevel)) return L[i];
  }
  if (failed(0, CONFIG.minAtEdge)) return BELOW;
  return null;
}

export function checkStop(bank: PlacementBank, state: PlacementState): { stop: boolean; reason: 'max_items' | 'level_clear' | 'bank_exhausted' | null } {
  if (state.answers.length >= CONFIG.maxItems) return { stop: true, reason: 'max_items' };
  if (state.sinceMove === 0 && clearLevel(bank, state.answers) !== null) return { stop: true, reason: 'level_clear' };
  if (!pickItem(bank, state)) return { stop: true, reason: 'bank_exhausted' };
  return { stop: false, reason: null };
}

const margin = (acc: number) => Math.min(1, Math.abs(acc - CONFIG.pass) / 0.4);
const round2 = (x: number) => Math.round(x * 100) / 100;
export function label(c: number): 'high' | 'medium' | 'low' { return c >= 0.75 ? 'high' : c >= 0.5 ? 'medium' : 'low'; }

export interface LevelEstimate { level: Level | null; confidence: number; label: 'high' | 'medium' | 'low'; n: number }

/** Best-supported level from per-level accuracies (used for overall without a clear stop, and per skill). */
function estimate(bank: PlacementBank, answers: AnswerRecord[], minN: number, target: number, skill?: ControlledSkill): LevelEstimate {
  const L = bank.levels;
  const st = L.map((l) => stats(answers, l, skill));
  const n = st.reduce((s, x) => s + x.n, 0);
  if (n === 0) return { level: null, confidence: 0, label: 'low', n };
  let placed = -1; // index; -1 = below lowest
  for (let i = L.length - 1; i >= 0; i--) if (st[i].n >= minN && st[i].acc >= CONFIG.pass) { placed = i; break; }
  // Thin evidence: accept a pass on fewer than minN items (confidence stays low via n/target).
  if (placed === -1) for (let i = L.length - 1; i >= 0; i--) if (st[i].n > 0 && st[i].acc >= CONFIG.pass) { placed = i; break; }
  if (placed === -1) {
    const lowestTested = st.findIndex((x) => x.n > 0);
    placed = lowestTested - 1; // one level below the lowest level that was tested (and not passed)
  }
  const margins: number[] = [];
  if (placed >= 0 && st[placed].n > 0) margins.push(margin(st[placed].acc));
  if (placed + 1 < L.length && st[placed + 1].n > 0) margins.push(margin(st[placed + 1].acc));
  const m = margins.length ? Math.min(...margins) : 0;
  const confidence = round2(Math.min(1, n / target) * (0.5 + 0.5 * m));
  return { level: placed >= 0 ? L[placed] : placed === -1 ? BELOW : L[0], confidence, label: label(confidence), n };
}

export function writingTask(bank: PlacementBank, state: PlacementState): PlacementItem | null {
  const overall = clearLevel(bank, state.answers) ?? estimate(bank, state.answers, CONFIG.minAtLevel, CONFIG.overallTarget).level ?? bank.startLevel;
  const lvl = overall === BELOW ? bank.levels[0] : overall;
  return bank.items.find((i) => i.skill === 'writing' && i.level === lvl) ?? null;
}

export interface WritingScore { itemId: string; points: number }

export interface PlacementResult {
  status: 'DRAFT';
  stopReason: string | null;
  itemsUsed: number;
  overall: LevelEstimate;
  skills: Record<Skill, LevelEstimate>;
}

export function result(bank: PlacementBank, state: PlacementState, writing?: WritingScore): PlacementResult {
  const clear = clearLevel(bank, state.answers);
  const est = estimate(bank, state.answers, CONFIG.minAtLevel, CONFIG.overallTarget);
  const overall = clear ? { ...est, level: clear } : est;
  const skills = {} as Record<Skill, LevelEstimate>;
  for (const s of CONFIG.skillOrder) skills[s] = estimate(bank, state.answers, CONFIG.minSkillAtLevel, CONFIG.skillTarget, s);
  skills.writing = { level: null, confidence: 0, label: 'low', n: 0 };
  if (writing) {
    const item = bank.items.find((i) => i.id === writing.itemId && i.skill === 'writing');
    if (!item) throw new Error(`unknown writing item ${writing.itemId}`);
    if (writing.points < 0 || writing.points > item.points) throw new Error('writing points out of range');
    const frac = writing.points / item.points;
    const idx = bank.levels.indexOf(item.level);
    const level = frac >= CONFIG.pass ? item.level : idx > 0 ? bank.levels[idx - 1] : BELOW;
    const confidence = round2(CONFIG.writingCap * (0.5 + 0.5 * margin(frac)));
    skills.writing = { level, confidence, label: label(confidence), n: 1 };
  }
  return { status: 'DRAFT', stopReason: checkStop(bank, state).reason, itemsUsed: state.answers.length, overall, skills };
}

/** Run a whole session with a deterministic answer function (for simulations/tests). */
export function simulate(bank: PlacementBank, respond: (item: PlacementItem) => string, writingPoints?: (item: PlacementItem) => number): PlacementResult {
  let state = startSession(bank);
  for (let item = nextItem(bank, state); item; item = nextItem(bank, state)) state = answer(bank, state, item.id, respond(item));
  const w = writingTask(bank, state);
  return result(bank, state, w && writingPoints ? { itemId: w.id, points: writingPoints(w) } : undefined);
}
