// ltc-v1-r4: structured learning state for language turns (LTB diagnostic 2026-11-09).
//
// Replaces prose-regex success detection as the primary source of "was the last
// answer correct?" and adds item-scoped hint state. Everything here is pure and
// derived from the session's own stored messages (TutorMessage.meta.languageTurn),
// so state is session-isolated by construction, idempotent across retries (an
// unsaved reply leaves no state), and needs no new collection.
//
// Verdict sources, in order of authority:
//   1. answer_key       - the learner's answer matches an accepted answer of the
//                         active lesson item (deterministic; only ever "correct").
//   2. tutor_assessment - a hidden assessment marker the tutor writes at the start
//                         of its reply; stripped server-side (stream-safe) and
//                         stored as structured state, never shown to the learner.
//   3. prose_fallback   - the r3 confirmsCorrect() reading of the reply, used only
//                         when neither of the above exists (older messages).

import { engineV2 } from './engineV2';
export const ANSWER_VERDICTS = ['NOT_EVALUATED', 'INCORRECT', 'PARTIALLY_CORRECT', 'CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION', 'AMBIGUOUS'] as const;
export type AnswerVerdict = (typeof ANSWER_VERDICTS)[number];
// Relevance of the learner's message to the task the tutor left open.
export const ANSWER_RELEVANCE = ['ACTIVE_ITEM', 'OTHER_ITEM', 'UNRELATED', 'NO_ACTIVE_ITEM'] as const;
export type AnswerRelevance = (typeof ANSWER_RELEVANCE)[number];
// What the tutor's reply leaves for the learner to do next.
export const NEXT_TASK = ['NEW_ITEM', 'SAME_ITEM', 'NONE'] as const;
export type NextTask = (typeof NEXT_TASK)[number];
export type VerdictSource = 'answer_key' | 'tutor_assessment' | 'prose_fallback' | 'none';

export interface Assessment {
  verdict: AnswerVerdict;
  relevance: AnswerRelevance;
  // 1-based indices of the lesson's success criteria shown in the learner's own text.
  criteria: number[];
  next: NextTask;
  // Lesson item the reply presented, when it presented one (echoed by the tutor).
  item?: string;
  // v2 (belief): the learner's mistaken idea behind an INCORRECT/PARTIALLY_CORRECT answer, in a few words (sanitised, never shown to the learner).
  belief?: string;
  source: VerdictSource;
}

export interface ActiveItemRef {
  id: string; // 'lesson:<itemId>' or 'msg:<assistantMessageId>'
  source: 'lesson' | 'tutor';
  lessonItemId?: string;
}

// What a stored assistant message carries (subset of LanguageTurnEvidence).
export interface StoredLearningFields {
  assessment?: Assessment;
  activeItem?: ActiveItemRef | null;
  hintLevel?: number;
  // r4.1 (POST-03): the namespace this state belongs to (tenant, learner, session,
  // course, curriculum, lesson). State is only ever read back within one scope.
  stateScope?: string;
  // r4.1 (POST-12): the item whose answer this reply disclosed (L6), if any.
  revealedItemId?: string;
}
export type HistoryTurn = { role: 'user' | 'assistant'; content: string; languageTurn?: StoredLearningFields | null };

export const isSuccess = (v?: AnswerVerdict) => v === 'CORRECT' || v === 'CORRECT_WITH_EQUIVALENT_FORMULATION';
export const isFailure = (v?: AnswerVerdict) => v === 'INCORRECT' || v === 'PARTIALLY_CORRECT';

// ---------------------------------------------------------------------------
// Hidden assessment marker. One line, ASCII, at the start of the reply:
//   [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1,2 next=NEW_ITEM item=i2]]

export const MARKER_OPEN = '[[assess';
// r4.1 (POST-01): an open marker is held until its closing "]]" arrives, the
// stream ends, a blank line shows it was never closed, or it exceeds this size.
// Every decision depends only on the text, never on how it was chunked, so the
// streamed and the whole-text paths produce identical visible text.
export const MAX_MARKER = 1000;

export function formatAssessmentMarker(a: Omit<Assessment, 'source'>): string {
  return `[[assess verdict=${a.verdict} relevance=${a.relevance}${a.criteria.length ? ` criteria=${a.criteria.join(',')}` : ''} next=${a.next}${a.item ? ` item=${a.item}` : ''}]]`;
}

// Tolerant parse: unknown values fall back to safe defaults (NOT_EVALUATED / NONE),
// never to success. Returns null when the text is not an assess marker.
// r4.1 (POST-04): a marker with no next= is marked nextMissing, so the caller can
// use the reply-based reading instead of silently closing the item.
/** Belief text from the marker: underscores to spaces, letters/digits/space/apostrophe/hyphen only, 3-80 chars; anything else is dropped. */
export function sanitizeBelief(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.replace(/_+/g, ' ').replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t.length >= 3 ? t : undefined;
}
export type ParsedMarker = Omit<Assessment, 'source'> & { nextMissing?: true };
export function parseAssessmentMarker(marker: string): ParsedMarker | null {
  const m = /^\[\[assess\b([^\]]*)\]\]$/i.exec(marker.trim());
  if (!m) return null;
  const kv = new Map<string, string>();
  for (const part of m[1].trim().split(/\s+/)) {
    const i = part.indexOf('=');
    if (i > 0) kv.set(part.slice(0, i).toLowerCase(), part.slice(i + 1).replace(/[,;.]+$/, ''));
  }
  const pick = <T extends string>(allowed: readonly T[], v: string | undefined, dflt: T): T => {
    const u = (v ?? '').toUpperCase();
    return (allowed as readonly string[]).includes(u) ? (u as T) : dflt;
  };
  const criteria = (kv.get('criteria') ?? '')
    .split(',')
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 20);
  const item = kv.get('item');
  return {
    verdict: pick(ANSWER_VERDICTS, kv.get('verdict'), 'NOT_EVALUATED'),
    relevance: pick(ANSWER_RELEVANCE, kv.get('relevance'), 'NO_ACTIVE_ITEM'),
    criteria: [...new Set(criteria)],
    next: pick(NEXT_TASK, kv.get('next'), 'NONE'),
    ...(item && /^[\w-]{1,40}$/.test(item) ? { item } : {}),
    ...(sanitizeBelief(kv.get('belief')) ? { belief: sanitizeBelief(kv.get('belief')) } : {}),
    ...(kv.has('next') ? {} : { nextMissing: true as const }),
  };
}

export interface MarkerScan {
  // Visible text is everything except markers and malformed marker regions.
  markers: { raw: string; leading: boolean }[];
  malformed: boolean;
}

// Streaming filter: feed text deltas, get only learner-visible text back.
// Trust (POST-02): only a marker that comes before any visible text (the
// "leading" marker) can carry the tutor's assessment. Any other marker, e.g. one
// echoed from the learner's message or quoted later in the reply, is removed
// from the visible text and reported, never trusted.
export class AssessmentMarkerFilter {
  private pending = '';
  private visibleSeen = false;
  readonly markers: { raw: string; leading: boolean }[] = [];
  malformed = false;

  push(delta: string): string {
    this.pending += delta;
    return this.drain(false);
  }

  // End of stream: a still-open marker is malformed and dropped (with the rest
  // of its region); ordinary text that only looked like a prefix is released.
  end(): string {
    return this.drain(true);
  }

  // Leading whitespace is dropped until the first visible character, so a
  // leading marker on its own line leaves no blank line behind.
  private emit(text: string): string {
    const t = this.visibleSeen ? text : text.replace(/^\s+/, '');
    if (t.trim()) this.visibleSeen = true;
    return t;
  }

  private drain(final: boolean): string {
    let out = '';
    for (;;) {
      const open = this.pending.indexOf('[');
      if (open < 0) {
        out += this.emit(this.pending);
        this.pending = '';
        break;
      }
      if (open > 0) {
        out += this.emit(this.pending.slice(0, open));
        this.pending = this.pending.slice(open);
      }
      const lower = this.pending.toLowerCase();
      // Need the character after "[[assess" to decide.
      if (lower.length <= MARKER_OPEN.length) {
        if (MARKER_OPEN.startsWith(lower)) {
          if (!final) break; // could still become a marker: hold
          if (lower === MARKER_OPEN) { this.malformed = true; this.pending = ''; break; }
        }
        out += this.emit(this.pending[0]);
        this.pending = this.pending.slice(1);
        continue;
      }
      const after = lower.charAt(MARKER_OPEN.length);
      if (!lower.startsWith(MARKER_OPEN) || !/[\s\]]/.test(after)) {
        // Not a marker ("[1]", "[[note]]", "[[assessment ...]]"): release one char.
        out += this.emit(this.pending[0]);
        this.pending = this.pending.slice(1);
        continue;
      }
      const close = this.pending.indexOf(']]');
      const blank = this.pending.indexOf('\n\n');
      if (close >= 0 && close + 2 <= MAX_MARKER && (blank < 0 || close < blank)) {
        const raw = this.pending.slice(0, close + 2);
        this.markers.push({ raw, leading: !this.visibleSeen });
        this.pending = this.pending.slice(close + 2);
        continue;
      }
      const brokenAt = blank >= 0 && (close < 0 || blank < close) ? blank : -1;
      if (brokenAt < 0 && close < 0 && this.pending.length < MAX_MARKER && !final) break; // still open: hold
      // Malformed: never closed before a blank line, too long, or the stream ended.
      // Drop the whole marker region (up to the blank line, the size limit, or the end).
      this.malformed = true;
      const cut = brokenAt >= 0 ? brokenAt : Math.min(this.pending.length, MAX_MARKER);
      this.pending = this.pending.slice(cut);
      if (!final && !this.pending.length) break;
    }
    return out;
  }

  // The trusted assessment: the leading marker only. Null when there is none,
  // when it is not well formed, or when the first marker came after visible text.
  assessment(): Omit<Assessment, 'source'> | null {
    const first = this.markers[0];
    if (!first?.leading) return null;
    return parseAssessmentMarker(first.raw);
  }

  // Markers that were removed but not trusted (echoes, quotes, duplicates).
  get untrustedMarkers(): number {
    return this.markers.length - (this.markers[0]?.leading ? 1 : 0);
  }

  get firstMarkerNotLeading(): boolean {
    return this.markers.length > 0 && !this.markers[0].leading;
  }
}

export interface StrippedReply {
  text: string;
  assessment: Omit<Assessment, 'source'> | null;
  markers: number;
  untrustedMarkers: number;
  firstMarkerNotLeading: boolean;
  malformed: boolean;
}

export function filterSummary(f: AssessmentMarkerFilter, text: string): StrippedReply {
  return { text, assessment: f.assessment(), markers: f.markers.length, untrustedMarkers: f.untrustedMarkers, firstMarkerNotLeading: f.firstMarkerNotLeading, malformed: f.malformed };
}

// Whole-text version for the JSON endpoint (same rules as the stream filter).
export function stripAssessmentMarkers(text: string): StrippedReply {
  const f = new AssessmentMarkerFilter();
  const visible = (f.push(text) + f.end()).trim();
  return filterSummary(f, visible);
}

export const hasMarkerText = (text: string) => /\[\[assess/i.test(text);

// ---------------------------------------------------------------------------
// Lesson items and deterministic answer-key matching.

export interface LessonItem {
  id: string;
  prompt: string;
  acceptedAnswers?: string[];
  // Forms the item tests (e.g. "has", "goes"); used for leak telemetry, never sent to the model.
  targetForms?: string[];
  // 1-based success-criteria indices this item tests.
  criteria?: number[];
}

const normAnswer = (t: string) =>
  t
    .toLowerCase()
    // r4.1: Arabic diacritics (harakat) and tatweel do not change the answer.
    .replace(/\p{M}/gu, '')
    .replace(/\u0640/g, '')
    .replace(/[’']/g, "'")
    .replace(/o'?\s?clock/g, 'oclock')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// "She go to bed — sorry, She goes to bed": the last self-corrected version counts.
const SELF_CORRECTION_SPLIT = /\s*(?:—|–|-{2}|\bsorry\b,?|\bi mean\b,?|\bi meant\b,?|\boops\b,?|\bcorrection\b:?)\s*/i;

// Only ever returns a success verdict: an answer that doesn't match a stored
// accepted answer may still be right (valid alternative), so the tutor decides.
/** v2 (keyMatch): contractions are matched as their full forms on both sides (She doesn't go = She does not go). Ambiguous 's and 'd are left alone. */
export function expandContractions(t: string): string {
  return t.replace(/[’‘]/g, "'").replace(/\bcan't\b/gi, 'can not').replace(/\bcannot\b/gi, 'can not').replace(/\bwon't\b/gi, 'will not').replace(/\bshan't\b/gi, 'shall not')
    .replace(/n't\b/gi, ' not').replace(/\b(\w+)'re\b/gi, '$1 are').replace(/\b(\w+)'ve\b/gi, '$1 have').replace(/\b(\w+)'ll\b/gi, '$1 will').replace(/\bi'm\b/gi, 'i am');
}
export function evaluateAgainstKey(answer: string, item: LessonItem | undefined): AnswerVerdict | null {
  if (!item?.acceptedAnswers?.length) return null;
  const nrm = engineV2('keyMatch') ? (x: string) => normAnswer(expandContractions(x)) : normAnswer;
  const accepted = item.acceptedAnswers.map(nrm).filter(Boolean);
  const whole = nrm(answer);
  if (accepted.includes(whole)) return 'CORRECT';
  const parts = answer.split(SELF_CORRECTION_SPLIT).filter((p) => p && p.trim());
  if (parts.length > 1 && accepted.includes(nrm(parts[parts.length - 1]))) return 'CORRECT';
  return null;
}

// ---------------------------------------------------------------------------
// State derived from the session's stored turns.

export interface LearningState {
  activeItem: ActiveItemRef | null;
  // Highest hint level already used on the active item, and how many hint turns.
  hintLevelOnItem: number;
  hintTurnsOnItem: number;
  // Consecutive successful assessments of the learner's answers (structured only).
  successStreak: number;
  lastAssessment?: Assessment;
  // Whether the last success came after help on that item.
  lastSuccessAssisted?: boolean;
  // Success criteria (1-based) shown by the learner, and how.
  criteria: Record<number, 'independent' | 'assisted'>;
  satisfiedLessonItems: string[];
  // Did the previous assistant turn carry a structured assessment?
  previousStructured: boolean;
  structuredTurns: number;
  // r4.1 (POST-12): evaluated answers to the active item (genuine attempts), item-scoped.
  attemptsOnItem: number;
  // Items whose answer was disclosed in this scope.
  revealedItems: string[];
  // r4.4 #3: per success criterion (1-based), the distinct tasks it was shown independently on.
  independentEvidence: Record<number, string[]>;
  // v2 (belief): mistaken ideas the tutor named in this session, merged by word overlap, with how many turns showed them.
  beliefs: { text: string; count: number }[];
}

// r4.1 (POST-03): when a scope is given, only turns stored under that same scope
// contribute (another lesson, course, learner or tenant never does; neither do
// older turns stored before scoping existed). Live updates store the scope the
// turn was built with, so reconstruction and live state use one namespace.
export function inScope(lt: StoredLearningFields | null | undefined, scope?: string): boolean {
  return scope === undefined || Boolean(lt && lt.stateScope === scope);
}

const beliefTokens = (t: string) => new Set(t.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
export function sameBelief(a: string, b: string): boolean { const A = beliefTokens(a); const B = beliefTokens(b); if (!A.size || !B.size) return false; let n = 0; for (const w of A) if (B.has(w)) n += 1; return n / (A.size + B.size - n) >= 0.5; }
function mergeBelief(list: { text: string; count: number }[], text: string) { const hit = list.find((x) => sameBelief(x.text, text)); if (hit) hit.count += 1; else list.push({ text, count: 1 }); }
export function deriveLearningState(history: HistoryTurn[], scope?: string): LearningState {
  const s: LearningState = { activeItem: null, hintLevelOnItem: 0, hintTurnsOnItem: 0, successStreak: 0, criteria: {}, satisfiedLessonItems: [], previousStructured: false, structuredTurns: 0, attemptsOnItem: 0, revealedItems: [], independentEvidence: {}, beliefs: [] };
  for (const h of history) {
    if (h.role !== 'assistant') continue;
    const lt = inScope(h.languageTurn, scope) ? h.languageTurn ?? undefined : undefined;
    const structured = (a?: Assessment) => Boolean(a && (a.source === 'answer_key' || a.source === 'tutor_assessment'));
    s.previousStructured = structured(lt?.assessment);
    if (!lt) continue;
    const a = lt.assessment;
    if (structured(a)) s.structuredTurns += 1;
    if (a && a.verdict !== 'NOT_EVALUATED') {
      s.lastAssessment = a;
      if (a.relevance === 'ACTIVE_ITEM' && s.activeItem) s.attemptsOnItem += 1;
      if (isSuccess(a.verdict) && a.relevance !== 'UNRELATED') {
        // r4.1 (POST-06): any success after support on the open item is assisted,
        // including a correct sentence for another item that uses the same hint.
        // A disclosed answer is never independent evidence: a success on the item
        // that was revealed, or on another item after any reveal, is assisted.
        const assisted = s.hintTurnsOnItem > 0
          || (Boolean(s.activeItem) && s.revealedItems.includes(s.activeItem!.id))
          || (a.relevance !== 'ACTIVE_ITEM' && s.revealedItems.length > 0);
        s.successStreak += 1;
        s.lastSuccessAssisted = assisted;
        for (const c of a.criteria ?? []) {
          // Independent evidence is never downgraded by a later assisted one.
          if (s.criteria[c] !== 'independent') s.criteria[c] = assisted ? 'assisted' : 'independent';
          if (!assisted) {
            const ctxKey = s.activeItem?.id ?? 'free';
            const list = (s.independentEvidence[c] ??= []);
            if (!list.includes(ctxKey)) list.push(ctxKey);
          }
        }
        // Only an answer to the active item completes that item.
        if (structured(a) && a.relevance === 'ACTIVE_ITEM' && s.activeItem?.lessonItemId && !s.satisfiedLessonItems.includes(s.activeItem.lessonItemId)) {
          s.satisfiedLessonItems.push(s.activeItem.lessonItemId);
        }
      } else if (isFailure(a.verdict) || a.verdict === 'AMBIGUOUS') {
        s.successStreak = 0;
      }
      if (a.belief && (a.verdict === 'INCORRECT' || a.verdict === 'PARTIALLY_CORRECT')) mergeBelief(s.beliefs, a.belief);
    }
    if (lt.revealedItemId && !s.revealedItems.includes(lt.revealedItemId)) s.revealedItems.push(lt.revealedItemId);
    // The item the learner is expected to answer after this reply.
    if (lt.activeItem !== undefined) {
      const next = lt.activeItem;
      if ((next?.id ?? null) !== (s.activeItem?.id ?? null)) {
        s.hintLevelOnItem = 0;
        s.hintTurnsOnItem = 0;
        s.attemptsOnItem = 0;
      }
      s.activeItem = next ?? null;
    }
    if ((lt.hintLevel ?? 0) > 0 && s.activeItem) {
      s.hintTurnsOnItem += 1;
      s.hintLevelOnItem = Math.max(s.hintLevelOnItem, lt.hintLevel ?? 0);
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Graduated hint controller. The level is a ceiling for this reply: the tutor
// uses it only if the answer needs support. One level per support turn already
// spent on the same item; entry rules keep first hints low.

export interface HintLadderLevel { level: number; name: string; mayReveal: string; mustNotReveal: string; learnerAction: string }
export const HINT_LADDER: HintLadderLevel[] = [
  // r4.3: attention cue, conceptual cue, guided reasoning, partial scaffold, worked example, answer.
  { level: 1, name: 'attention cue', mayReveal: 'where to look (the word or part to check)', mustNotReveal: 'the rule, the correct form, or which option fits', learnerAction: 'look again and retry' },
  { level: 2, name: 'conceptual cue', mayReveal: 'the concept or rule in general terms', mustNotReveal: 'the rule applied to this item, or the fact that decides this item', learnerAction: 'apply the idea and retry' },
  { level: 3, name: 'guided reasoning', mayReveal: 'one question that leads them through the next reasoning step', mustNotReveal: 'the answer form, or a question that already contains it', learnerAction: 'answer the question, then retry the item' },
  { level: 4, name: 'partial scaffold', mayReveal: 'a frame or steps with the tested slot left blank', mustNotReveal: 'the tested slot, or the answer form anywhere in the reply', learnerAction: 'fill the tested slot' },
  { level: 5, name: 'worked example', mayReveal: 'a full example with a different word that does not share the answer form (never the same verb or word)', mustNotReveal: 'this item\'s word or answer', learnerAction: 'transfer the pattern to the item' },
  { level: 6, name: 'direct explanation', mayReveal: 'the answer with a one-line reason', mustNotReveal: 'mastery claims', learnerAction: 'do a fresh similar item without help' },
];

export function selectHintLevel(state: LearningState, ctx: { answerRequestBeforeAttempt?: boolean; dontKnowOrConfused?: boolean; newItem?: boolean; noAttemptYet?: boolean }): number {
  const base = ctx.newItem ? 1 : Math.min(6, state.hintLevelOnItem + 1);
  if (ctx.answerRequestBeforeAttempt) return Math.min(base, 2);
  if (ctx.dontKnowOrConfused && state.hintTurnsOnItem === 0) return Math.min(base, 2);
  // r4.1 (POST-12): repeated requests, pressure or "don't know" without any genuine
  // attempt never reach level 6 (the answer); the ladder stays at most at 5.
  // r4.3: without any genuine attempt, support stays at guided reasoning or below.
  if (ctx.noAttemptYet) return Math.min(base, 3);
  return base;
}

// Fix 2B: on a two-option item (he/she, or a prompt offering "x / y") any pointer
// to the deciding word settles the choice, so early hints ask for re-reading or
// for the learner's reason instead.
const BINARY_EARLY: Record<number, string> = {
  1: 'ask them to read their whole sentence again, slowly, and check it once more',
  2: 'ask them to explain in a few words why they chose their word',
  3: 'ask one question about the meaning of the whole sentence (who or what it is about) without naming either option or the deciding word',
};
export function isBinaryItem(item: LessonItem | undefined): boolean {
  if (!item) return false;
  const f = (item.targetForms ?? []).map((x) => x.toLowerCase());
  return (f.length > 0 && f.every((x) => x === 'he' || x === 'she')) || /\([^()]*\b\w+\s*\/\s*\w+[^()]*\)/.test(item.prompt);
}

// Fix 3: beginners (pre-A1/A1) are not asked to explain in English.
const BINARY_EARLY_BEGINNER: Record<number, string> = {
  1: 'ask them to read their whole sentence again, slowly, and check it once more',
  2: 'ask one short question they can answer with one word: who is the sentence about?',
  3: 'ask them to point to the person word in their own sentence (one word is enough), without naming either option',
};

// Fix 4: skill-aware limits on early hints (the multi-skill run's S4/S6 leaks).
const KIND_LIMIT: Record<string, [number, string]> = {
  reading: [4, "For this reading item, don't quote or point to the sentence of the text that holds the answer; ask them to re-read the question and find the part of the text themselves."],
  word: [5, 'For this word item, never give letters, the first letter, the spelling or the word itself; give a meaning clue or a situation instead.'],
  open: [5, 'For this open task, never give a sentence starter or frame that already contains what they should say; ask one question about what they want to say.'],
};
export function hintInstruction(level: number, opts: { binary?: boolean; beginner?: boolean; kind?: string } = {}): string {
  const lim = opts.kind ? KIND_LIMIT[opts.kind] : undefined;
  const extra = lim && level < lim[0] ? ` ${lim[1]}` : '';
  return hintInstructionBase(level, opts) + extra;
}
function hintInstructionBase(level: number, opts: { binary?: boolean; beginner?: boolean } = {}): string {
  const l = HINT_LADDER[Math.max(1, Math.min(6, level)) - 1];
  if (opts.binary && BINARY_EARLY[l.level]) {
    const move = (opts.beginner ? BINARY_EARLY_BEGINNER : BINARY_EARLY)[l.level];
    return `Support level ${l.level} of 6 (two-option item): this item is a choice between two words, so any pointer settles it. Do not point to the word to change, the word that decides it, or the rule; do not restate the rule. Instead ${move}, then let them retry. Start with the smallest hint that could work.`;
  }
  if (l.level === 6) {
    return 'Support level 6 of 6 (direct explanation): if they still need help, give the correct answer with a one-line reason, then one fresh similar item they do on their own.';
  }
  return `Support level ${l.level} of 6 (${l.name}): if their answer needs help, you may reveal ${l.mayReveal}; you must not reveal ${l.mustNotReveal}. Then ask them to ${l.learnerAction}. If the answer is a choice between two words (like he/she) or a single ending (like -s/-es), don't say which one fits this item before level 4. Before level 6, never offer the correct form as one of the options in a choice or list, never state the fact that decides this item (e.g. "a brother is a boy"), and never write the corrected form of the tested word anywhere in a hint, not even inside a question (e.g. not "Who goes to bed?"). Start with the smallest hint that could work.`;
}

// ---------------------------------------------------------------------------
// Post-reply quality telemetry (deterministic, log-only; no extra model call).

const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const words = (t: string) => t.replace(/[*_`"“”'’()]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
function changedTokens(a: string[], b: string[]): number {
  // Tokens not shared in order (LCS-based), counted on the longer side.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return Math.max(a.length, b.length) - dp[0][0];
}

// "Only one word changes:" followed by a pair that differs in more than one token.
export function contrastPairClaimMismatch(reply: string): boolean {
  const lines = reply.split('\n');
  const idx = lines.findIndex((l) => /\bonly (?:one|the) (?:word|thing|part|verb|letter)\b[^.\n]*\bchang/i.test(l) || /\bonly (?:one|the) (?:word|thing|part|verb)\b/i.test(l) && /chang/i.test(l));
  if (idx < 0) return false;
  // The pair is usually listed right after the claim, sometimes right before it.
  const listed = (ls: string[]) => ls.map((l) => LIST_LINE.exec(l)?.[1]).filter((x): x is string => Boolean(x));
  let pair = listed(lines.slice(idx + 1, idx + 6)).slice(0, 2);
  if (pair.length < 2) pair = listed(lines.slice(Math.max(0, idx - 5), idx)).slice(-2);
  if (pair.length < 2) return false;
  const strip = (t: string) => words(t.replace(/\([^)]*\)\s*$/, ''));
  return changedTokens(strip(pair[0]), strip(pair[1])) > 1;
}

// A span the reply attributes to the learner ("you wrote ...", "The words "x" are a
// good start") must be a substring of what the learner actually wrote.
const ATTRIBUTION_BEFORE = /(you wrote|you said|you used|your (?:sentence|answer|words?)|the words?|you've written)\s*[:]?\s*(?:\*\*)?\s*$/i;
const ATTRIBUTION_AFTER = /^\s*(?:\*\*)?\s*(?:is|are) (?:correct|right|fine|good|a good start)\b/i;
export function learnerQuoteMismatches(reply: string, learnerText: string): string[] {
  const out: string[] = [];
  const learner = ` ${words(learnerText).join(' ')} `;
  const re = /["“]([^"”\n]{2,80})["”]/g;
  for (let m = re.exec(reply); m; m = re.exec(reply)) {
    const before = reply.slice(Math.max(0, m.index - 40), m.index);
    const after = reply.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (!ATTRIBUTION_BEFORE.test(before) && !ATTRIBUTION_AFTER.test(after)) continue;
    const q = words(m[1]);
    if (!q.length) continue;
    const overlap = q.filter((w) => learner.includes(` ${w} `)).length / q.length;
    // Only spans that are recognisably the learner's words; a span that is the
    // tutor's own correction ("you wrote "go" - we say "goes"") is not a quote of them.
    if (overlap >= 0.6 && !learner.includes(` ${q.join(' ')} `)) out.push(m[1]);
  }
  return out;
}

// A lesson item's tested form appearing in a support reply before level 6.
export function possibleAnswerLeak(reply: string, item: LessonItem | undefined, hintLevel: number, verdict?: AnswerVerdict): boolean {
  if (!item?.targetForms?.length || hintLevel >= 6 || isSuccess(verdict)) return false;
  // r4.3: meta-language about word order ("every day goes at the end") is not the answer form.
  const text = ` ${words(reply).join(' ')} `.replace(/ (goes|go) (?=(at|before|after|between|first|last) )/g, ' _meta_ ');
  return item.targetForms.some((f) => {
    const w = words(f).join(' ');
    return w.length > 0 && text.includes(` ${w} `);
  });
}

// ---------------------------------------------------------------------------
// Fix 1 (post-r4.3): enforced, not only instructed. Before the learner's first
// attempt on an item, an example or model line that shows that item's tested form
// is removed from the reply (deterministic, no second model call). Plain prose
// that merely uses the word is kept; so are the item prompt, its own option list
// and quotes of the learner's words.
const MODEL_LINE = /^\s*(?:[-*•]|\d+[.)])\s+|→|->|=>/;
const SPANS = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|"([^"\n]+)"|“([^”\n]+)”|_([^_\n]+)_/g;
const PRE_ATTEMPT_FALLBACK = 'Have a go at it first. If you get stuck, ask me for a hint.';

const ARROW = /→|->|=>/;
const hasForm = (text: string, forms: string[]) => {
  // meta-language about word order ("always goes before the verb") is not the answer form
  const t = ` ${words(text).join(' ')} `.replace(/ (goes|go) (?=(at|before|after|between|first|last) )/g, ' _meta_ ');
  return forms.some((f) => f && t.includes(` ${f} `));
};

export function stripPreAttemptModels(reply: string, items: LessonItem[], learnerText = '', shownMaterial: string[] = []): { text: string; removed: string[] } {
  // A form that the lesson itself shows the learner (a reading text inside an item
  // prompt, the lesson's word list) is course material, not a leaked answer.
  const shown = ` ${words([...items.map((i) => i.prompt), ...shownMaterial].join(' ')).join(' ')} `;
  const forms = [...new Set(items.flatMap((i) => (i.targetForms ?? []).map((f) => words(f).join(' '))))].filter((f) => f && f !== 'he' && f !== 'she' && !shown.includes(` ${f} `));
  if (!forms.length) return { text: reply, removed: [] };
  const learner = ` ${words(learnerText).join(' ')} `;
  const prompts = items.map((i) => i.prompt.split(':').slice(1).join(':').trim() || i.prompt).filter(Boolean);
  const removed: string[] = [];
  const clean = (segment: string) => {
    let s = segment;
    for (const p of prompts) s = s.split(p).join(' ');
    s = s.replace(/\(([^()]*\/[^()]*)\)/g, ' '); // the item's own "(go / goes)" choice
    // quotes of the learner's own words are not a model
    s = s.replace(/"([^"\n]+)"|“([^”\n]+)”/g, (m, a, b) => {
      const w = words(a ?? b).join(' ');
      return w && learner.includes(` ${w} `) ? ' ' : m;
    });
    return s;
  };
  const isModel = (segment: string, listLine: boolean) => {
    const s = clean(segment);
    if (!hasForm(s, forms)) return false;
    if (listLine) return true;
    for (const m of s.matchAll(SPANS)) if (hasForm(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '', forms)) return true;
    return false;
  };
  const out: string[] = [];
  for (const line of reply.split('\n')) {
    if (MODEL_LINE.test(line) && !/_{2,}/.test(line)) { // a line with a gap is the task, never dropped whole
      // a list line goes when it models the form: an arrow transformation or the form shown as an example
      if (isModel(line, ARROW.test(line))) { removed.push(line); continue; }
      out.push(line);
      continue;
    }
    // other lines: drop only the sentences that model the form
    const parts = line.split(/(?<=[.!?])\s+(?=[*_"“A-Z(])/);
    const kept = parts.filter((p) => { if (isModel(p, false)) { removed.push(p); return false; } return true; });
    if (kept.length || !line.trim()) out.push(kept.join(' '));
  }
  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) text = PRE_ATTEMPT_FALLBACK;
  return { text: removed.length ? text : reply, removed };
}

// ---------------------------------------------------------------------------
// Fix 2A: a gapped check must not be answerable by copying. A sentence that is the
// same frame as a gapped task with the gap filled in is removed from the reply
// (any lesson, any item; deterministic). The learner's own words are kept.
const SENT_SPLIT = /(?<=[.!?])\s+/;
const ATTRIBUTED = /\b(?:you wrote|you said|you typed|your (?:try|answer|sentence|attempt|version))\b/i;
const GAP = /_{2,}/;
const frameWords = (t: string) => t.replace(/\([^)]*\)/g, ' ').replace(/_{2,}|…|\.{3}/g, ' ␣ ').replace(/[*_`"“”'’]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}␣-]+/u).filter(Boolean);
function fillsFrame(template: string[], cand: string[]): boolean {
  // template tokens match exactly; each ␣ takes 1-3 candidate words
  const go = (i: number, j: number): boolean => {
    if (i === template.length) return j === cand.length;
    if (template[i] === '␣') { for (let k = 1; k <= 3 && j + k <= cand.length; k += 1) if (go(i + 1, j + k)) return true; return false; }
    return j < cand.length && cand[j] === template[i] && go(i + 1, j + 1);
  };
  return go(0, 0);
}

export function stripCopyReadyModels(reply: string, learnerText = ''): { text: string; removed: string[] } {
  if (!GAP.test(reply)) return { text: reply, removed: [] };
  const learner = ` ${words(learnerText).join(' ')} `;
  const lines = reply.split('\n');
  // templates: the gapped sentence, and it with the sentence before it on the same line
  const templates: string[][] = [];
  for (const line of lines) {
    const body = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^[^.!?:\n]{0,40}:\s+(?=\S)/, '');
    const sents = body.split(SENT_SPLIT);
    sents.forEach((s, i) => {
      if (!GAP.test(s)) return;
      for (const t of [frameWords(s), i > 0 ? frameWords(`${sents[i - 1]} ${s}`) : []]) if (t.filter((w) => w !== '␣').length >= 3) templates.push(t);
    });
  }
  if (!templates.length) return { text: reply, removed: [] };
  const removed: string[] = [];
  const out = lines.map((line) => {
    if (GAP.test(line)) return line;
    const prefix = /^\s*(?:[-*•]|\d+[.)])\s+/.exec(line)?.[0] ?? '';
    const sents = line.slice(prefix.length).split(SENT_SPLIT);
    const drop = new Set<number>();
    for (let i = 0; i < sents.length; i += 1) {
      for (const span of [1, 2]) {
        if (i + span > sents.length) continue;
        const unit = sents.slice(i, i + span).join(' ');
        const w = frameWords(unit);
        // a frame description ("This is my … introduces the person") or a quote of the
        // learner's earlier try ("Your try was: ...") is not a model answer
        if (/…|\.{3}|_{2,}/.test(unit) || ATTRIBUTED.test(line.slice(0, Math.max(0, line.indexOf(sents[i])) + sents[i].length))) continue;
        if (!w.length || learner.includes(` ${words(unit).join(' ')} `)) continue;
        if (templates.some((t) => fillsFrame(t, w))) for (let k = i; k < i + span; k += 1) drop.add(k);
      }
    }
    if (!drop.size) return line;
    drop.forEach((k) => removed.push(sents[k]));
    let kept = sents.filter((_, k) => !drop.has(k)).join(' ').trim();
    // emphasis markers left unbalanced by the removal are dropped
    if ((kept.match(/\*\*/g) ?? []).length % 2) kept = kept.replace(/\*\*/g, '');
    else if ((kept.replace(/\*\*/g, '').match(/\*/g) ?? []).length % 2) kept = kept.replace(/(?<!\*)\*(?!\*)/g, '');
    return kept && /[\p{L}\p{N}]/u.test(kept) ? prefix + kept : null;
  }).filter((l): l is string => l !== null);
  return removed.length ? { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed } : { text: reply, removed: [] };
}

// Fix 3: log-only load telemetry for beginner replies (no change to the text).
const TASK_VERB = /^(?:now\s+|then\s+|next\s+|your turn:?\s*)*(?:write|complete|choose|fill|answer|say|tell me|make|put|correct|try|use|find|read)\b/i;
export function loadOverBudget(reply: string, maxWords: number): string[] {
  const flags: string[] = [];
  const sents = reply.replace(/[*_`]/g, '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const tasks = sents.filter((x) => /\?$/.test(x) || TASK_VERB.test(x.replace(/^[^:]{0,20}:\s*/, (m) => (/turn|task|check/i.test(m) ? '' : m)))).length;
  if (tasks >= 2) flags.push('multiple_tasks');
  if (reply.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length > maxWords) flags.push('over_length');
  return flags;
}

// ---------------------------------------------------------------------------
// r4.4 #1 (rebuilt): diagnose the likely CAUSE of a wrong answer so the hint targets the cause.
// Deterministic and generic (forms come from the item's own targetForms); the cue never contains
// the item's answer form.
export const ERROR_CODES = [
  'missing_third_person_s', 'wrong_third_person_ending', 'past_form_for_routine', 'pronoun_gender_swap', 'pronoun_omitted',
  'perfect_with_finished_time', 'past_for_life_experience', 'wrong_participle', 'unchanged_from_prompt', 'unknown',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export interface Diagnosis { code: ErrorCode; cue: string; evidence: string }

const CUES: Record<ErrorCode, string> = {
  missing_third_person_s: 'the verb after he/she/it in the present simple still has its base form: point them to the subject and ask what happens to the verb with he/she/it',
  wrong_third_person_ending: 'they know the verb changes but chose the wrong ending: ask which ending this verb takes (think about how it is spelled at the end)',
  past_form_for_routine: 'they used a past form for something that happens every day: ask whether the sentence is about yesterday or about a routine',
  pronoun_gender_swap: 'they chose the other pronoun: ask them to look at the family word and think about who it describes',
  pronoun_omitted: 'they left out the pronoun: ask who the second sentence is about and what word we use for that person',
  perfect_with_finished_time: 'they used have/has with a finished time: ask whether the time they mention is finished or still going on',
  past_for_life_experience: 'they used a past form for a life experience: ask whether the sentence is about a time in their whole life, and what helper word goes before the verb',
  wrong_participle: 'the helper word is right but the verb form after it is not: ask them to think about the form we use after have/has',
  unchanged_from_prompt: 'they copied the sentence without changing anything: ask them what in the sentence needs to change',
  unknown: 'the cause is not clear: ask them to say in their own words what they were thinking',
};

const toks = (t: string) => normAnswer(t).split(' ').filter(Boolean);
const DIRECT_PRONOUNS = new Set(['he', 'she']);

export function diagnoseError(answer: string, item: LessonItem | undefined): Diagnosis | null {
  if (!item?.acceptedAnswers?.length || evaluateAgainstKey(answer, item)) return null;
  const a = toks(answer.split(SELF_CORRECTION_SPLIT).filter((p) => p.trim()).pop() ?? answer);
  if (!a.length) return null;
  const promptBody = toks((/"([^"]+)"/.exec(item.prompt)?.[1] ?? '').replace(/\([^)]*\)/g, ' ').replace(/_+/g, ' '));
  const forms = (item.targetForms ?? []).map((f) => f.toLowerCase());
  const mk = (code: ErrorCode, evidence: string): Diagnosis => ({ code, cue: CUES[code], evidence });
  if (promptBody.length > 2 && a.join(' ') === promptBody.join(' ')) return mk('unchanged_from_prompt', a.join(' '));
  if (forms.length && forms.every((f) => DIRECT_PRONOUNS.has(f))) {
    const want = forms[0];
    if (a.includes(want === 'he' ? 'she' : 'he')) return mk('pronoun_gender_swap', want === 'he' ? 'she' : 'he');
    if (!a.some((w) => DIRECT_PRONOUNS.has(w))) return mk('pronoun_omitted', a.join(' '));
    return null;
  }
  for (const f of forms) {
    if (/(?:s|es)$/.test(f) && f.length > 2) {
      const base = f.endsWith('ies') ? f.slice(0, -3) + 'y' : f.endsWith('es') && /(o|sh|ch|ss|x|z)es$/.test(f) ? f.slice(0, -2) : f.slice(0, -1);
      if (a.includes(base)) return mk('missing_third_person_s', base);
      const stem = base.replace(/e$/, '');
      const wrong = a.find((w) => w !== f && w.startsWith(stem) && w.length > stem.length && !w.endsWith('ed'));
      if (wrong) return mk('wrong_third_person_ending', wrong);
      const past = a.find((w) => w.startsWith(stem) && w.endsWith('ed'));
      if (past || a.some((w) => ['went', 'watched', 'did', 'was'].includes(w))) return mk('past_form_for_routine', past ?? 'past form');
    }
    if (f.endsWith('ed') && a.includes(f) && a.some((w) => ['have', 'has', "'ve"].includes(w))) return mk('perfect_with_finished_time', `have ${f}`);
    if (['seen', 'been', 'done', 'gone', 'eaten', 'written', 'taken'].includes(f)) {
      if (a.some((w) => ['have', 'has'].includes(w)) && !a.includes(f)) return mk('wrong_participle', a.join(' '));
      if (!a.some((w) => ['have', 'has'].includes(w)) && a.some((w) => /ed$|saw|went|did|ate|wrote|took/.test(w))) return mk('past_for_life_experience', a.join(' '));
    }
  }
  return mk('unknown', a.join(' '));
}
