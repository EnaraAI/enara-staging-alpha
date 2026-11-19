// TRACK 2 (teaching quality): the example guard (plan §2), criterion choice and the rule-bank / vocabulary rule lines (§3), the right/wrong post-check (§3.5),
// the corrective-feedback ladder (M3) and the deterministic ageFit checker (§5). Pure functions only (no DB, no model call): the pool of items the learner
// will solve is assembled server-side by the caller and NEVER rendered into a prompt. Switches: engineV2 ruleBank / exampleGuard / feedbackLadder / kidsBand.
import { acceptedKeys, normaliseV2, scoreTargetForm, sensitivityOf, type TargetFormItem } from './graderV2';
import { RULE_BANK_BY_ID, isVocabEntry, type RuleBankEntry, type RuleModel } from './ruleBank';
import { KIDS_WORDS, ADULT_WORDS } from './kidsWordList';

// ---------------------------------------------------------------------------------------------------------------- the pool
/** One item the learner will solve (an unsolved lesson item or an assessment / quick-check item of the objective). Server-side only. */
export interface PoolItem {
  id: string;
  source: 'lesson' | 'assessment';
  prompt: string;
  keys: string[];
  /** compare with case kept (capital-letter and spelling items) */
  caseKept: boolean;
  /** an open item (free sentence): checked with its own target-form scorer and its scene */
  open: boolean;
  targetForm?: string;
  scoring?: string;
  matchingNote?: string;
}

export interface LessonItemLike { id: string; prompt: string; acceptedAnswers?: string[]; targetForms?: string[] }
export interface BankItemLike { id: string; type?: string; prompt: string; answerKey?: string; acceptedAnswers?: string[]; matchingNote?: string; acceptedAnswersNote?: string; targetForm?: string; scoring?: string }

const OPEN_TYPES = /free_production|transfer|open/;
const plain = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
/** The sentence part of an item prompt: no "Write ...:" instruction, no "(answer with only ...)" tail, no outer quotes. */
export function itemCore(prompt: string): string {
  let p = prompt.replace(/\s*\(answer with only the [^)]*\)\s*$/i, '').trim();
  const colon = p.indexOf(':');
  if (colon > 0 && colon < 60 && /^(write|complete|correct|rewrite|put|join|make|fix|find|choose|fill|answer|add|change)\b/i.test(p)) p = p.slice(colon + 1).trim();
  return p.replace(/^["“']+|["”']+$/g, '').trim();
}
export function poolFromLessonItems(items: LessonItemLike[], openTargetForm?: string): PoolItem[] {
  return items.map((i) => {
    const keys = (i.acceptedAnswers ?? []).filter(Boolean);
    const core = itemCore(i.prompt);
    const caseKept = keys.some((k) => k !== k.toLowerCase() && plain(k) === plain(core.replace(/_{2,}/g, ' ')));
    return { id: i.id, source: 'lesson' as const, prompt: i.prompt, keys, caseKept, open: !keys.length, ...(openTargetForm && !keys.length ? { targetForm: openTargetForm, scoring: 'target_form_0_1_2' } : {}) };
  });
}
export function poolFromBankItems(items: BankItemLike[]): PoolItem[] {
  return items.map((b) => {
    const open = b.scoring === 'target_form_0_1_2' || OPEN_TYPES.test(b.type ?? '');
    const sens = sensitivityOf(b);
    const keys = acceptedKeys({ answerKey: b.answerKey, acceptedAnswers: b.acceptedAnswers }).filter((k) => !/^e\.g\.|\.\.\.|…/.test(k));
    return { id: b.id, source: 'assessment' as const, prompt: b.prompt, keys, caseKept: sens !== 'none', open, targetForm: b.targetForm, scoring: b.scoring, matchingNote: b.matchingNote };
  });
}

// ---------------------------------------------------------------------------------------------------------------- the guard (plan §2)
const GAP = /_{2,}|…/;
const STOP = new Set(('a an the and or but of to in on at for with about from by is are am be was were it its this that these those your you my me i he she we they his her our their ' +
  'one two three some any write writing sentence sentences word words use using answer complete correct fill gap gaps put order join make rewrite fix mistake ' +
  'find choose name says say tell ask question what who where when how which do does did now please here there imagine add picture people doing ' +
  'something someone thing things start end time place right wrong form same new own after before every each e g ' +
  'can cant will would could should much many did does done regular irregular verb verbs than comparing compare going plan plans like well yet very ' +
  'question questions negative positive give tell have has had got get look around please day days week weeks month months year years ' +
  'always usually sometimes never often some any last next ago yesterday tomorrow tonight today eat drink favourite ' +
  "don't doesn't didn't isn't aren't wasn't can't not no") .split(' '));
/** Semantic groups for the open-item scene check (a model about an uncle is in the scene of "someone in your family"). */
const GROUPS: Record<string, string[]> = {
  family: ['family', 'mother', 'father', 'mum', 'mom', 'dad', 'brother', 'sister', 'uncle', 'aunt', 'cousin', 'grandmother', 'grandfather', 'grandma', 'grandpa', 'son', 'daughter', 'parents', 'wife', 'husband', 'baby', 'twins'],
  home: ['home', 'house', 'flat'],
  school: ['school', 'class', 'classroom', 'classmate', 'teacher', 'desk', 'board', 'lesson'],
  friend: ['friend', 'friends', 'classmate', 'neighbour', 'neighbours', 'colleague'],
  park: ['park', 'garden', 'playground'],
};
const contentWords = (t: string) => plain(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const sceneOf = (t: string): Set<string> => {
  const out = new Set<string>();
  for (const w of contentWords(t)) { out.add(w); for (const [g, ws] of Object.entries(GROUPS)) if (ws.includes(w)) out.add(`#${g}`); }
  return out;
};
const toks = (t: string, caseKept: boolean) => (caseKept ? t.replace(/[“”"]/g, ' ').replace(/[^\p{L}\p{N}\s'.,!?]/gu, ' ').replace(/([.,!?])/g, ' $1 ') : normaliseV2(t)).split(/\s+/).filter(Boolean);
const containsSeq = (hay: string[], needle: string[]) => {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, k) => hay[i + k] === w)) return true;
  return false;
};
/** The gapped clause of a prompt with the key filled in (several gaps take "x, y" keys in order). */
function filledClauses(item: PoolItem): string[][] {
  const core = itemCore(item.prompt).replace(/\(([^()]*\/[^()]*)\)/g, ' ').replace(/\((?:for|a|an|the)[^()]*\)/gi, ' ');
  if (!GAP.test(core)) return [];
  const clauses = core.split(/(?<=[.!?])\s+/).filter((c) => GAP.test(c));
  const out: string[][] = [];
  for (const key of item.keys) {
    const parts = key.includes(',') ? key.split(',').map((x) => x.trim()) : [key];
    for (const c of clauses) {
      let k = 0; const filled = c.replace(/_{2,}|…/g, () => parts[Math.min(k++, parts.length - 1)] ?? key);
      const t = toks(filled, item.caseKept);
      if (t.filter((w) => /\p{L}/u.test(w)).length >= 3) out.push(t);
    }
  }
  return out;
}
export interface GuardHit { itemId: string; source: PoolItem['source']; sentence: string; why: 'completes_item' | 'scores_open_item' }
const LABEL = /^\s*(?:[-*•>]\s*)?(?:\*\*)?\s*(right|wrong|example|model|result|watch|correct|for example|e\.g\.|step \d+|answer)\s*[:)]\s*/i;
/** Sentences of a reply that model language (not the task line, not quotes of the learner, not a labelled wrong example). */
export function modelledSentences(reply: string, learnerText = '', pool: PoolItem[] = [], confirmed: string[] = []): string[] {
  const learner = ` ${plain(learnerText)} `;
  // the task line: a sentence that presents an item without a gap ("Rewrite correctly: my brother likes tea"); case kept for case-sensitive items
  const cores = pool.map((p) => ({ raw: itemCore(p.prompt), caseKept: p.caseKept })).filter((c) => !GAP.test(c.raw) && plain(c.raw).split(' ').length >= 3);
  const out: string[] = [];
  for (const line of reply.split('\n')) {
    if (GAP.test(line)) continue; // the task line (a gap) is never a model
    for (let s of line.split(/(?<=[.!?])\s+(?=\S)/)) {
      const label = LABEL.exec(s);
      if (label && /wrong/i.test(label[1])) continue;
      s = s.replace(LABEL, '').replace(/\*\*/g, '').trim();
      if (!s) continue;
      const p = plain(s);
      if (cores.some((c) => (c.caseKept ? s.replace(/["“”]/g, '').includes(c.raw.replace(/["“”]/g, '')) : p.includes(plain(c.raw))))) continue; // the tutor presenting an item (the task line)
      if (confirmed.some((c) => c && ` ${p} `.includes(` ${c} `))) continue; // confirming an item the learner has just solved (its completed sentence)
      if (learner.trim().split(' ').length >= 3 && (learner.includes(` ${p} `) || ` ${p} `.includes(learner))) continue; // restating the learner's own answer
      const quoted = [...s.matchAll(/["“]([^"”]+)["”]/g)].map((m) => plain(m[1]));
      if (quoted.length && quoted.every((q) => q && learner.includes(` ${q} `))) continue; // quoting the learner's own words
      out.push(s);
    }
  }
  return out;
}
/** Plan §2: flags a modelled sentence that completes any pool item (frame + key) or scores as a correct answer to an open item in the same scene. */
export function exampleGuardHits(reply: string, pool: PoolItem[], learnerText = '', confirmed: string[] = []): GuardHit[] {
  const hits: GuardHit[] = [];
  const sentences = modelledSentences(reply, learnerText, pool, confirmed);
  for (const s of sentences) {
    for (const item of pool) {
      if (item.open) {
        if (!item.targetForm) continue;
        const own = new Set(contentWords(item.targetForm ?? ''));
        const scene = new Set([...sceneOf(itemCore(item.prompt))].filter((w) => !own.has(w)));
        const mine = sceneOf(s);
        const shared = [...scene].some((w) => mine.has(w));
        if (!shared) continue;
        let score: number | null = null;
        try { score = scoreTargetForm({ prompt: item.prompt, targetForm: item.targetForm, scoring: 'target_form_0_1_2', answerKey: item.keys[0], acceptedAnswers: item.keys, matchingNote: item.matchingNote } as TargetFormItem, s); } catch { score = null; }
        if (score === 2) { hits.push({ itemId: item.id, source: item.source, sentence: s, why: 'scores_open_item' }); break; }
        continue;
      }
      const st = toks(s, item.caseKept);
      const frames = filledClauses(item);
      const whole = GAP.test(itemCore(item.prompt)) ? [] : item.keys.map((k) => toks(k, item.caseKept)).filter((t) => t.filter((w) => /\p{L}/u.test(w)).length >= 3);
      if (frames.some((f) => containsSeq(st, f)) || whole.some((k) => containsSeq(st, k))) {
        hits.push({ itemId: item.id, source: item.source, sentence: s, why: 'completes_item' });
        break;
      }
    }
  }
  return hits;
}
/** The completed sentences of items the learner has already solved (a confirmation may restate them; it is not a model). */
export function confirmedSentences(items: LessonItemLike[]): string[] {
  return items.flatMap((i) => (i.acceptedAnswers ?? []).map((a) => { const core = itemCore(i.prompt); return plain(GAP.test(core) ? core.replace(/_{2,}|…/, a).replace(/\([^)]*\)/g, ' ') : a); })).filter((x) => x.split(' ').length >= 2);
}
/** Production fallback: the flagged sentences are removed (after one regeneration did not clear them). */
export function removeGuardHits(reply: string, hits: GuardHit[]): string {
  let text = reply;
  for (const h of hits) text = text.split(h.sentence).join(' ');
  text = text.split('\n').map((l) => l.replace(/\s{2,}/g, ' ').replace(/^\s*(?:Right|Example|Model|Result)\s*:\s*$/i, '').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}
export const GUARD_REGEN_REASON = (hits: GuardHit[]) => `Your last draft showed a sentence that answers an exercise the learner still has to solve ("${hits[0].sentence.replace(/["<>]/g, '')}"). Write the reply again: keep the same teaching step, but any worked example must use a different answer (the contrasting case) or a different scene, and must not answer any exercise.`;

// ---------------------------------------------------------------------------------------------------------------- criterion choice (§3.2)
/** The success criterion (1-based) that matches the outcome: most rule-bank keywords; none when nothing matches (never a blind "criterion 1"). */
export function criterionFor(successCriteria: string[] | undefined, entry: RuleBankEntry | undefined): number | undefined {
  if (!entry || !successCriteria?.length) return undefined;
  let best = 0; let at: number | undefined;
  successCriteria.forEach((c, i) => {
    const t = ` ${c.toLowerCase()} `;
    const score = entry.keywords.reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0);
    if (score > best) { best = score; at = i + 1; }
  });
  return at;
}

// ---------------------------------------------------------------------------------------------------------------- rule lines (§3.1, §3.4, plan §1)
/** The worked example: a model whose form differs from the open task's answer and that the guard passes. */
export function pickModel(entry: RuleBankEntry, pool: PoolItem[], openKeys: string[] = []): RuleModel | undefined {
  const keys = openKeys.map((k) => plain(k)).filter(Boolean);
  const sameForm = (m: RuleModel, k: string) => (m.keyPattern ? new RegExp(m.keyPattern).test(k) : plain(m.form) === k);
  const fine = (m: RuleModel) => !keys.some((k) => sameForm(m, k)) && !exampleGuardHits(m.sentence, pool).length;
  return entry.models.find(fine) ?? undefined;
}
const q = (t: string) => `"${t.replace(/["<>]/g, '')}"`;
/** The rule line for a grammar / mechanics / function outcome, from the bank only. */
export function ruleBankLine(entry: RuleBankEntry, model: RuleModel | undefined, opts: { openTask?: boolean; beforeFirstTry?: boolean } = {}): string {
  const ex = model
    ? `use this worked example (its answer is different from the exercise's answer, so the exercise stays theirs): ${q(model.sentence)}`
    : 'write no worked example of the exercise\'s pattern in this reply (none passes the answer check); the right/wrong pair is enough';
  return `Rule for this point (from the checked rule bank; use it, do not invent another): ${q(entry.rule)} (1) Say this rule in one plain sentence (you may shorten it, never change it). (2) Show exactly this right/wrong pair: Right: ${q(entry.right)} Wrong: ${q(entry.wrong)} and say what makes the wrong one wrong (the usual error: ${entry.usualError}). (3) Worked example: ${ex}.${opts.openTask ? ' For an open writing task, set any example in a different scene from the task and ask for "your own, different sentence".' : ''} Never write the answer to an exercise the learner still has to solve, and never use a different rule from the one above.`;
}
/** §3.4 / M6 vocabulary template: meaning from a clue, then the spelling, then use in a frame; the only contrast is the real confusion. */
export function vocabLine(entry: RuleBankEntry, model: RuleModel | undefined): string {
  const c = entry.clue!; const conf = entry.confusion!;
  return `Vocabulary point (from the checked rule bank; this is a word-learning outcome, so do NOT use the grammar right/wrong template): ${q(entry.rule)} Teach it as form, meaning and use (one short line each): (1) meaning from a clue, worked once: clue ${q(c.clue)} gives the word ${q(c.word)}; (2) the spelling of that word, letter by letter if it helps; (3) use it in a short frame${model ? `, for example ${q(model.sentence)}` : ''}. The worked example's result must be a word from the set, never the clue repeated. The only right/wrong contrast you may show is the real confusion: Right: ${q(conf.right)} Wrong: ${q(conf.wrong)}. Never write the answer to an exercise the learner still has to solve.`;
}
export const CONTRAST_EXAMPLE_LINE = 'Worked examples (plan §1): any worked example in this reply must have a DIFFERENT answer from the exercise you set (model the contrasting case: if the exercise needs one form, model the other), or, for an open writing task, a different scene; then ask for "your own, different sentence". An example that answers any exercise the learner will solve is removed.';

// ---------------------------------------------------------------------------------------------------------------- post-check (§3.5)
export interface PostCheck { problems: ('pair_identical' | 'no_target_word')[]; pair?: { right: string; wrong: string } }
/** The right and wrong examples must differ; a vocabulary reply's worked example must produce a word from the set. */
export function ruleLinePostCheck(reply: string, entry: RuleBankEntry | undefined): PostCheck {
  const problems: PostCheck['problems'] = [];
  const r = /\bright\s*:\s*\**["“]?([^"”\n*]+?[.!?]?)["”]?\**\s*[;,]?\s*\bwrong\s*:\s*\**["“]?([^"”\n*.!?]+[.!?]?)/i.exec(reply.replace(/\n/g, ' '));
  let pair: PostCheck['pair'];
  if (r) { pair = { right: r[1].trim(), wrong: r[2].trim() }; if (plain(r[1]) === plain(r[2]) && r[1].replace(/[.!?\s]+$/, '') === r[2].replace(/[.!?\s]+$/, '')) problems.push('pair_identical'); }
  if (isVocabEntry(entry)) {
    const t = ` ${plain(reply.split('\n').filter((l) => !GAP.test(l)).join(' '))} `;
    if (!(entry!.targetWords ?? []).some((w) => t.includes(` ${plain(w)} `))) problems.push('no_target_word');
  }
  return { problems, ...(pair ? { pair } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------- M3 corrective-feedback ladder
export type FeedbackRung = 'elicitation' | 'metalinguistic' | 'recast' | 'explicit';
/** The rung for a reply to a wrong answer: 1st failed attempt elicitation, 2nd a metalinguistic clue, from the 3rd (two failed prompts) explicit correction. */
export function feedbackRung(failedAttempts: number): FeedbackRung | undefined {
  if (failedAttempts <= 0) return undefined;
  if (failedAttempts === 1) return 'elicitation';
  if (failedAttempts === 2) return 'metalinguistic';
  return 'explicit';
}
export const LADDER_RELEASE_AFTER = 3;
export const FEEDBACK_LADDER_LINE: Record<FeedbackRung, string> = {
  elicitation: 'Corrective feedback, rung 1 of 3 (elicitation): if this answer is wrong, do not give the correct form and do not recast it. Quote the part that is right, stop just before the error (or ask "Look at this word again: ...?") and let them repair it themselves.',
  metalinguistic: 'Corrective feedback, rung 2 of 3 (metalinguistic clue): if this answer is still wrong, do not give the correct form yet. Give one short clue about the rule (for example "Think about who does the action" or "What do we add after he?") and ask them to fix it.',
  recast: 'Corrective feedback, rung 3 of 3 (recast): two prompts have not worked, so now say the correct form once with a one-line reason, then give one new item on the same point.',
  explicit: 'Corrective feedback, rung 3 of 3 (explicit correction): two prompts have not worked, so now state the correct form with a one-line reason and the rule, then give one new item on the same point.',
};

// ---------------------------------------------------------------------------------------------------------------- §5 kids language by band: ageFit
export type FitBand = 'child' | 'teen' | 'adult';
export const BAND_LIMITS: Record<FitBand, { avg: number; max: number; instructions: number }> = {
  child: { avg: 8, max: 12, instructions: 1 },
  teen: { avg: 12, max: 16, instructions: 2 },
  adult: { avg: 14, max: 20, instructions: 2 },
};
const IDIOMS = /\b(piece of cake|break a leg|hit the books|on the ball|under the weather|cost an arm|spill the beans|in a nutshell|a no-brainer|nail(ed)? it|you rock|crush(ed)? it|knock(ed)? it out|ballpark|game changer|hang in there|hit the nail|bite the bullet|easy peasy)\b/i;
const SARCASM = /\b(oh great|yeah right|as if|obviously|duh|good luck with that)\b/i;
const ABILITY_PRAISE = /\b(you(?:'re| are) (?:so |very |really )?(?:smart|clever|brilliant|a genius|gifted|talented|a natural))\b/i;
const BARE_WRONG = /(^|[.!?]\s+|\n)\s*(?:wrong|that'?s wrong|no, wrong|incorrect)\s*[.!]/i;
const FRIGHT = /\b(kill|killed|blood|die|died|dead|gun|knife|war|drunk|beer|wine|cigarette|sexy|monster attack)\b/i;
const CHILDISH = /\b(yummy|teeny|itsy|bitsy|boo-boo|tummy|doggy|kitty|sweetie|little one)\b/i;
const GRAMMAR_LABELS = /\b(subject|object|verb|noun|adjective|adverb|preposition|article|pronoun|plural|singular|infinitive|participle|auxiliary|tense|clause|conjunction|uncountable|countable|consonant|vowel|comparative|superlative|possessive)\b/gi;
const IMPERATIVE = /^(?:now |then |next |please |so )?(write|complete|fill|choose|pick|circle|try|tell|make|correct|fix|rewrite|change|put|answer|use|say|describe|order|match|add|draw|send|give|count|copy|spell|ask)\b/i;
const splitSentences = (t: string) => t.split('\n').flatMap((l) => l.split(/(?<=[.!?])\s+(?=\S)/)).map((s) => s.replace(/^[-*•>\d.)\s]+/, '').trim()).filter((s) => /\p{L}/u.test(s));
const wordList = (t: string) => (t.match(/[A-Za-z][A-Za-z'-]*/g) ?? []);
/** Base forms tried for a word not in the list: plural, -ed, -ing, -er/-est, 's, contractions. */
function known(w: string, list: Set<string>): boolean {
  const x = w.toLowerCase().replace(/^'+|'+$/g, '');
  if (list.has(x)) return true;
  const c = x.replace(/'(s|re|ve|ll|d|m|t)$/, '').replace(/n$/, '');
  if (list.has(c) || list.has(x.replace(/n't$/, ''))) return true;
  const cand = [x.replace(/ies$/, 'y'), x.replace(/es$/, ''), x.replace(/s$/, ''), x.replace(/ied$/, 'y'), x.replace(/ed$/, ''), x.replace(/d$/, ''), x.replace(/ing$/, ''), x.replace(/ing$/, 'e'), x.replace(/([a-z])\1ing$/, '$1'), x.replace(/([a-z])\1ed$/, '$1'), x.replace(/ier$/, 'y'), x.replace(/iest$/, 'y'), x.replace(/er$/, ''), x.replace(/est$/, ''), x.replace(/r$/, ''), x.replace(/st$/, ''), x.replace(/([a-z])\1er$/, '$1'), x.replace(/([a-z])\1est$/, '$1'), x.replace(/ly$/, '')];
  return cand.some((y) => y.length > 1 && list.has(y));
}
export interface AgeFit {
  band: FitBand; sentences: number; avgWords: number; maxWords: number; instructions: number; vocabCoverage: number; unknownWords: string[];
  labels: string[]; flags: string[]; within: boolean;
}
/** Deterministic readability / register check of one tutor message against the band limits (§5 table). lessonWords count as known. */
export function ageFit(text: string, band: FitBand, lessonWords: string[] = [], allowedLabels: string[] = []): AgeFit {
  const clean = text.replace(/\[\[[^\]]*\]\]/g, ' ');
  const sents = splitSentences(clean);
  const counts = sents.map((s) => wordList(s).length);
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const instructions = sents.filter((s) => IMPERATIVE.test(s) || /_{2,}/.test(s)).length;
  const list = new Set([...(band === 'child' ? KIDS_WORDS : ADULT_WORDS), ...lessonWords.flatMap((w) => wordList(w).map((x) => x.toLowerCase()))]);
  const ws = wordList(clean);
  const names = new Set(ws.filter((w, i) => /^[A-Z][a-z]+$/.test(w) && i > 0 && !list.has(w.toLowerCase())));
  const unknown = ws.filter((w) => !names.has(w) && !known(w, list));
  const coverage = ws.length ? 1 - unknown.length / ws.length : 1;
  const allowed = new Set(allowedLabels.map((l) => l.toLowerCase()));
  const labels = [...new Set((clean.match(GRAMMAR_LABELS) ?? []).map((l) => l.toLowerCase()))].filter((l) => !allowed.has(l));
  const lim = BAND_LIMITS[band];
  const flags: string[] = [];
  if (avg > lim.avg) flags.push('avg_sentence_long');
  if (max > lim.max) flags.push('sentence_too_long');
  if (instructions > lim.instructions) flags.push('too_many_instructions');
  if (coverage < 0.95) flags.push('vocab_coverage_low');
  if (IDIOMS.test(clean)) flags.push('idiom');
  if (SARCASM.test(clean)) flags.push('sarcasm');
  if (ABILITY_PRAISE.test(clean)) flags.push('ability_praise');
  if (FRIGHT.test(clean)) flags.push('frightening_or_adult');
  if (band === 'child' && BARE_WRONG.test(clean)) flags.push('bare_wrong');
  if (band === 'child' && labels.length) flags.push('grammar_label_not_taught');
  if (band !== 'child' && CHILDISH.test(clean)) flags.push('childish');
  return { band, sentences: sents.length, avgWords: Math.round(avg * 10) / 10, maxWords: max, instructions, vocabCoverage: Math.round(coverage * 1000) / 1000, unknownWords: [...new Set(unknown.map((w) => w.toLowerCase()))], labels, flags, within: flags.length === 0 };
}

/** The register line per band (§5), with the effort-not-ability praise rule (Mueller & Dweck 1998). */
export const BAND_REGISTER: Record<FitBand, string> = {
  child: 'Register: a child (under 13). Sentences: about 8 words on average, never more than 12. Use words from the lesson and everyday words a young learner knows; grammar labels only if the lesson teaches them. ONE instruction per message. Warm and simple: when an answer is not right say "Not yet" or "Almost", never a bare "Wrong". Praise their effort or their strategy ("You checked the ending - good thinking"), never their ability ("you are clever"). Examples from family, school, animals, games and food. No sarcasm, irony or idioms; nothing frightening or adult.',
  teen: 'Register: a teenager (13-17). Sentences: about 12 words on average, never more than 16. Everyday words at their level; basic grammar labels are fine. At most two steps per message. Friendly and direct, never childish. Praise effort or strategy, never ability. Examples from friends, sport, school and apps. No sarcasm, irony or idioms; nothing adult.',
  adult: 'Register: an adult (18+). Sentences: about 14 words on average, never more than 20. Everyday words at their level; basic grammar labels are fine. At most two steps per message. Respectful and practical, everyday adult contexts; never childish. Praise effort or strategy, never ability. No sarcasm, irony or idioms.',
};

// ---------------------------------------------------------------------------------------------------------------- lesson data check (§3.3)
export interface LessonDataFinding { outcomeId: string; problem: 'item_without_criteria' | 'no_item_tests_outcome' | 'no_items' | 'no_matching_criterion' }
/** Every lesson item carries criteria, and at least one item tests the outcome (its criteria include the outcome's matching criterion). */
export function checkLessonData(outcomeId: string, spec: { successCriteria?: string[]; items?: { id: string; criteria?: number[] }[] }): LessonDataFinding[] {
  const out: LessonDataFinding[] = [];
  const entry = RULE_BANK_BY_ID.get(outcomeId);
  const items = spec.items ?? [];
  if (!items.length) out.push({ outcomeId, problem: 'no_items' });
  if (items.some((i) => !i.criteria?.length)) out.push({ outcomeId, problem: 'item_without_criteria' });
  const c = criterionFor(spec.successCriteria, entry);
  if (!c) out.push({ outcomeId, problem: 'no_matching_criterion' });
  else if (items.length && !items.some((i) => i.criteria?.includes(c))) out.push({ outcomeId, problem: 'no_item_tests_outcome' });
  return out;
}
