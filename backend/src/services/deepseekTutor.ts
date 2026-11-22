// DeepSeek match (owner go 21 Nov 2026, docs/tutor/DEEPSEEK_MATCH_PLAN.md): make the stand-in model's tutor turns as close to Claude's as we can,
// in EVERY subject (not only English). Used only by the DeepSeek adapter (llmProvider.ts) on a graded turn (the request asks for the hidden
// [[assess ...]] line: English lessons, and every subject with gradeAllSubjects). Each part has its own named-only engine switch:
//   dsGradeFirst  - two calls instead of one: (1) grade only, as strict JSON (verdict, next step, expected answer, the exact mistake);
//                   (2) the visible reply, written from that decision. The server writes the hidden line from (1), so it is always there
//                   and always valid.
//   dsAnswerCheck - code checks the answer before the model explains it: numbers by value (0.5 = 1/2 = 50%, Arabic digits), a missing unit,
//                   and spelling (the exact letters, English and Arabic: hamza, taa marbuta, alef maqsura).
//   dsExamples    - short example replies (by kind of turn and age) at the end of the system prompt; the model copies style closely.
//   dsReplyChecks - one regeneration when a reply breaks a rule code can see: the expected answer given away while the learner must try again,
//                   no task at the end, too long for a young child, the wrong language (subject turns), no citation for a passage-based answer.
//   dsTuning      - temperature 0.3; the grading call may use a little reasoning (TUTOR_LLM_GRADE_REASONING=none|low|high, default none).
// Every part is a pure function here except gradedReply, which takes the chat call as an argument (tests pass a fake).
import { foldArabic, westernDigits } from '../assessment/text/ar';
import { engineV2 } from './engineV2';

export type DsParts = { gradeFirst: boolean; answerCheck: boolean; examples: boolean; replyChecks: boolean; tuning: boolean; fast?: boolean };
// dsFast (speed plan, owner go 21 Nov 2026): one shared prompt for both calls (the model server reuses what it read), no grading call when
// there is nothing to grade, a smaller grading call, and a streamed reply checked sentence by sentence.
export const dsParts = (all?: boolean): DsParts => ({
  gradeFirst: all ?? engineV2('dsGradeFirst'), answerCheck: all ?? engineV2('dsAnswerCheck'), examples: all ?? engineV2('dsExamples'),
  replyChecks: all ?? engineV2('dsReplyChecks'), tuning: all ?? engineV2('dsTuning'), fast: all ?? engineV2('dsFast'),
});

// ---------------------------------------------------------------------------------------------------------------- what kind of turn
export type TurnKind = 'language' | 'practice' | 'sources' | 'outOfScope' | 'general';
export type AgeBand = 'under9' | 'child' | 'older';
export const isGraded = (system: string): boolean => system.includes('[[assess');
export function turnKind(system: string): TurnKind {
  if (system.includes('NOT IN THE COURSE MATERIALS')) return 'outOfScope';
  if (/language_teaching_context/.test(system)) return 'language';
  if (/<source n="/.test(system)) return 'sources';
  if (system.includes('HIDDEN GRADING LINE (every reply, any subject)')) return 'practice';
  return 'general';
}
export function ageBand(system: string): AgeBand {
  if (/under 9|under-9|younger than 9/i.test(system)) return 'under9';
  if (/\bchild\b|\bkids?\b|under 13|aged? (9|10|11|12)\b/i.test(system)) return 'child';
  return 'older';
}

// ---------------------------------------------------------------------------------------------------------------- answer checks (code)

/** A number from "0.5", "1/2", "50%", "2 1/2", "-3", "1,000", Arabic digits; with a unit word after it, if any. */
export function parseNumber(raw: string): { value: number; unit: string } | null {
  const s = westernDigits(raw).trim().toLowerCase().replace(/^(=|the answer is|answer:|it is|it's|x\s*=)\s*/, '').replace(/[.。]$/, '');
  const m = /^(-?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(%|[a-z؀-ۿ°²³]+(?:\s*[²³])?)?$/i.exec(s);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ''));
  if (m[2] && m[3]) v = v + (v < 0 ? -1 : 1) * Number(m[2]) / Number(m[3]);
  if (m[4]) { const d = Number(m[4]); if (!d) return null; v = v / d; }
  let unit = (m[5] ?? '').trim();
  if (unit === '%') { v = v / 100; unit = ''; }
  return Number.isFinite(v) ? { value: v, unit } : null;
}
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 + 1e-6 * Math.max(Math.abs(a), Math.abs(b));

/** Arabic spelling forms that learners often mix up, folded together. */
export { foldArabic } from '../assessment/text/ar'; // one Arabic fold for the tutor and the assessment engine
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const nth = (i: number) => ORD[i] ?? `${i + 1}th`;
/** The exact spelling difference between one learner word and the expected word, in plain words; null when not a near miss. */
export function spellingNote(learner: string, expected: string): string | null {
  const a = learner.trim().toLowerCase().replace(/[.!?؟,،]+$/, ''); const b = expected.trim().toLowerCase().replace(/[.!?؟,،]+$/, '');
  if (!a || !b || a === b || /\s/.test(b) || /\s/.test(a)) return null;
  const bare = (x: string) => x.replace(/[\u064B-\u0652\u0640]/g, ''); // vowel marks are not spelling
  if (bare(a) === bare(b)) return null;
  if ([...bare(b)].length < 4) return null; // short words ("in"/"on", "is"/"as") are a word choice, not a spelling slip
  if (isArabic(b)) {
    if (foldArabic(a) === foldArabic(b)) return `only the spelling of a hamza, taa marbuta or alef differs: the right spelling is "${expected.trim()}"`;
  }
  const diffs = a.length === b.length ? [...b].map((c, i) => (c !== a[i] ? i : -1)).filter((i) => i >= 0) : [];
  if (diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]) return `two letters are swapped: "${b.slice(diffs[0], diffs[0] + 2)}", not "${a.slice(diffs[0], diffs[0] + 2)}"`;
  const dist = editDistance(a, b);
  if (dist === 0 || dist > Math.max(1, Math.min(2, Math.floor(b.length / 3)))) return null;
  if (a.length === b.length) {
    return diffs.map((i) => `the ${nth(i)} letter: "${a[i]}" should be "${b[i]}"`).join('; ');
  }
  let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  if (a.length < b.length) return `a letter is missing: "${b[i]}" after "${b.slice(0, i) || '(the start)'}"`;
  return `an extra letter "${a[i]}" after "${a.slice(0, i) || '(the start)'}"`;
}

export type CheckResult = { verdict?: 'CORRECT' | 'INCORRECT' | 'PARTIALLY_CORRECT'; note?: string };
/** Code's own reading of an answer against the expected answer. Only overrides the model where code is certain (numbers); otherwise adds a note. */
export function answerCheck(learner: string | undefined, expected: string | undefined): CheckResult {
  if (!learner || !expected) return {};
  const L = parseNumber(learner); const E = parseNumber(expected);
  if (L && E) {
    if (!close(L.value, E.value)) return { verdict: 'INCORRECT', note: `the value is wrong: ${learner.trim()} is not ${expected.trim()}` };
    if (E.unit && !L.unit) return { verdict: 'PARTIALLY_CORRECT', note: `the number is right but the unit (${E.unit}) is missing` };
    if (E.unit && L.unit && foldArabic(E.unit.toLowerCase()) !== foldArabic(L.unit.toLowerCase()) && !E.unit.startsWith(L.unit) && !L.unit.startsWith(E.unit)) return { verdict: 'PARTIALLY_CORRECT', note: `the number is right but the unit should be ${E.unit}, not ${L.unit}` };
    return { verdict: 'CORRECT', note: L.value === E.value && westernDigits(learner).trim() !== westernDigits(expected).trim() ? 'the same value written another way: count it as right' : undefined };
  }
  const s = spellingNote(learner, expected);
  return s ? { note: `spelling: ${s}` } : {};
}

// ---------------------------------------------------------------------------------------------------------------- the grading call
export const VERDICTS = ['CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION', 'PARTIALLY_CORRECT', 'INCORRECT', 'AMBIGUOUS', 'NOT_EVALUATED'] as const;
export const RELEVANCE = ['ACTIVE_ITEM', 'OTHER_ITEM', 'UNRELATED', 'NO_ACTIVE_ITEM'] as const;
export const NEXT = ['NEW_ITEM', 'SAME_ITEM', 'NONE'] as const;
export const GRADE_INSTRUCTION = [
  'GRADING STEP (no reply yet). Do not write a reply to the student. Decide only the hidden grading line described above, for the STUDENT\'s LAST message, and return ONLY a JSON object:',
  '{"verdict": one of CORRECT, CORRECT_WITH_EQUIVALENT_FORMULATION, PARTIALLY_CORRECT, INCORRECT, AMBIGUOUS, NOT_EVALUATED,',
  ' "relevance": one of ACTIVE_ITEM, OTHER_ITEM, UNRELATED, NO_ACTIVE_ITEM,',
  ' "next": NEW_ITEM (your reply will set a new task), SAME_ITEM (they try the same task again) or NONE,',
  ' "criteria": [numbers of the success criteria their text shows correctly, if the instructions list any],',
  ' "item": "the lesson item id you will present, if any, else empty", "focus": "E1/E2/E3 if the instructions ask for it, else empty", "pics": "pics value if the instructions ask for it, else empty",',
  ' "expected": "the correct answer to the task they answered (short; empty if none)", "answer": "the student\'s answer copied exactly (empty if none)",',
  ' "mistake": "the ONE exact mistake in their answer, in a few words (which part, which letter, which step); empty if right or not an answer"}',
  'A spelling slip, a wrong letter, a wrong unit or a wrong step is a mistake. A question, a greeting or a new topic is NOT_EVALUATED with NO_ACTIVE_ITEM.',
].join('\n');
/** dsFast: the same decision in fewer words, and a short answer (capped at 160 tokens). */
export const GRADE_INSTRUCTION_SHORT = [
  'GRADING ONLY - do not reply to the student. Grade the STUDENT\'s message above (the hidden grading line rules) and return ONLY this JSON:',
  '{"verdict":"CORRECT|CORRECT_WITH_EQUIVALENT_FORMULATION|PARTIALLY_CORRECT|INCORRECT|AMBIGUOUS|NOT_EVALUATED","relevance":"ACTIVE_ITEM|OTHER_ITEM|UNRELATED|NO_ACTIVE_ITEM","next":"NEW_ITEM|SAME_ITEM|NONE","criteria":[],"item":"","focus":"","pics":"","expected":"correct answer, short","answer":"their answer","mistake":"the one exact mistake, few words"}',
  'Spelling, letter, unit or step errors are mistakes. Not an answer (question, greeting, new topic) = NOT_EVALUATED + NO_ACTIVE_ITEM. Leave unknown fields empty.',
].join('\n');
export type Grade = { verdict: string; relevance: string; next: string; criteria: number[]; item?: string; focus?: string; pics?: string; expected?: string; answer?: string; mistake?: string };
const pick = (allowed: readonly string[], v: unknown, d: string) => { const u = String(v ?? '').trim().toUpperCase(); return allowed.includes(u) ? u : d; };
/** Lenient JSON read of the grading call; never throws. */
export function readGrade(text: string): Grade | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const crit = (Array.isArray(j.criteria) ? j.criteria : String(j.criteria ?? '').split(',')).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20);
  return {
    verdict: pick(VERDICTS, j.verdict, 'NOT_EVALUATED'), relevance: pick(RELEVANCE, j.relevance, 'NO_ACTIVE_ITEM'), next: pick(NEXT, j.next, 'NONE'), criteria: [...new Set(crit)],
    item: str(j.item, 40)?.match(/^[\w-]{1,40}$/)?.[0], focus: str(j.focus, 4)?.match(/^E[1-3]$/i)?.[0].toUpperCase(), pics: str(j.pics, 120)?.match(/^[a-z_ |-]{1,120}$/i)?.[0],
    expected: str(j.expected), answer: str(j.answer), mistake: str(j.mistake),
  };
}
/** The hidden line, built by the server (same format the engine parses). */
export function markerOf(g: Grade): string {
  return `[[assess verdict=${g.verdict} relevance=${g.relevance}${g.criteria.length ? ` criteria=${g.criteria.join(',')}` : ''} next=${g.next}${g.item ? ` item=${g.item}` : ''}${g.focus ? ` focus=${g.focus}` : ''}${g.pics ? ` pics=${g.pics.replace(/\s+/g, '_')}` : ''}]]`;
}
const RIGHT = new Set(['CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION']);
/** The decision note for the reply call. The expected answer is shown to the model with a "do not reveal" when they must try again. */
export function decisionNote(g: Grade, check: CheckResult): string {
  const lines = ['THE GRADING IS ALREADY DONE (follow it; do NOT write the hidden [[assess]] line, write only the visible reply):'];
  if (g.verdict === 'NOT_EVALUATED' || g.relevance === 'NO_ACTIVE_ITEM') lines.push('- Their last message is not an answer to a task: respond to what they said.');
  else lines.push(`- Their answer is ${RIGHT.has(g.verdict) ? 'RIGHT' : g.verdict === 'PARTIALLY_CORRECT' ? 'PARTLY RIGHT' : g.verdict === 'INCORRECT' ? 'WRONG' : 'UNCLEAR'}.`);
  const mistake = check.note ?? g.mistake;
  if (mistake && !RIGHT.has(g.verdict)) lines.push(`- The exact mistake (name THIS one, nothing else): ${mistake}.`);
  else if (check.note && RIGHT.has(g.verdict)) lines.push(`- Note: ${check.note}.`);
  if (g.expected) lines.push(g.next === 'SAME_ITEM' ? `- The correct answer is "${g.expected}". Do NOT say it or spell it out: they must try again. Give a hint that points at the mistake.` : `- The correct answer is "${g.expected}".`);
  lines.push(g.next === 'NEW_ITEM' ? '- End with ONE new task.' : g.next === 'SAME_ITEM' ? '- End by asking them to try the same task again.' : '- End with one short question or task only if it fits.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------- examples (dsExamples)
// Style examples, written for this purpose (fake learners, other topics). They show length, tone, one task, naming the exact mistake,
// citing passages and saying when the materials do not cover a question. Never their content.
const EX: Record<TurnKind, Record<'young' | 'older', string[]>> = {
  language: {
    young: ['Student: "I has a dog." → Tutor: "Nice try! With I we say have, not has. Write it again: I ___ a dog."', 'Student: "brid" → Tutor: "Close! Two letters are swapped. Look at the r and the i. Write the word again."'],
    older: ['Student: "She don\'t like tea." → Tutor: "Almost. With she, use doesn\'t: She doesn\'t like tea. Now you: correct \\"He don\'t play golf.\\""', 'Student: "at" (right) → Tutor: "Yes, at goes with a clock time. Next: Write in, on or at: We met ___ June."'],
  },
  practice: {
    young: ['Student: "7" for 3 + 5 → Tutor: "Good try! Count on from 5: 6, 7, 8. What is 3 + 5?"', 'Student: "روت" for root → Tutor: "Close! Check the first letter of the word. Try again."'],
    older: ['Student: "x = 4" for 2x + 3 = 13 → Tutor: "Not quite: 2 × 4 + 3 = 11, not 13. Check the step where you take 3 away from 13. Try again: 2x + 3 = 13."', 'Student: "النباتات تصنع غذاءها بالبناء الضوئي" (right) → Tutor: "صحيح! سؤال جديد: ما الغاز الذي يخرج من الورقة أثناء البناء الضوئي؟"'],
  },
  sources: {
    young: ['Student: "Why do leaves look green?" → Tutor: "Leaves have a green stuff called chlorophyll [1]. It catches sunlight to make food. What do plants need to make food?"'],
    older: ['Student: "What is a common denominator?" → Tutor: "It is the same bottom number for two fractions, so you can add them [2]. For 1/2 + 1/3 we use 6: 3/6 + 2/6 = 5/6. Try: 1/4 + 1/2."'],
  },
  outOfScope: {
    young: ['Student: "How far is the moon?" → Tutor: "This isn\'t in your course materials. From general knowledge: very far, about 384,000 km. You can ask your teacher too!"'],
    older: ['Student: "Who invented the telephone?" → Tutor: "This isn\'t in your course materials. General knowledge: it is usually credited to Alexander Graham Bell (1876). Check with your teacher if it is part of the course."'],
  },
  general: { young: [], older: [] },
};
export function examplesFor(kind: TurnKind, band: AgeBand): string {
  const list = EX[kind][band === 'older' ? 'older' : 'young'];
  return list.length ? `STYLE EXAMPLES (other topics; copy the style and length, never the content):\n${list.map((x) => `- ${x}`).join('\n')}` : '';
}

// ---------------------------------------------------------------------------------------------------------------- reply checks (dsReplyChecks)
const norm = (s: string) => foldArabic(westernDigits(s).toLowerCase()).replace(/(?<!\d)[./]|[./](?!\d)/g, ' ').replace(/[^\p{L}\p{N}./ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const arabicShare = (s: string) => { const letters = s.match(/\p{L}/gu) ?? []; return letters.length ? letters.filter((c) => isArabic(c)).length / letters.length : 0; };
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** Reasons a reply must be written again (empty: fine). */
export function replyProblems(p: { reply: string; grade: Grade | null; kind: TurnKind; band: AgeBand; learnerText: string; taskText?: string }): string[] {
  const out: string[] = [];
  const { reply, grade } = p;
  const exp = grade?.expected ? norm(grade.expected) : '';
  if (grade?.next === 'SAME_ITEM' && exp.length >= 2 && !/^(yes|no|true|false|a|b|c|d|in|on|at)$/.test(exp)) {
    const r = ` ${norm(reply)} `;
    const alreadyThere = ` ${norm(p.learnerText)} `.includes(` ${exp} `) || ` ${norm(p.taskText ?? '')} `.includes(` ${exp} `); // in their answer or in the question itself
    if (r.includes(` ${exp} `) && !alreadyThere) out.push('You gave the correct answer away, but they must try again: give a hint that points at the mistake, never the answer.');
  }
  if (grade && (grade.next === 'NEW_ITEM' || grade.next === 'SAME_ITEM')) {
    const tail = foldArabic(reply.trim().split('\n').filter((l) => l.trim()).slice(-2).join(' '));
    if (!/[?؟]|_{2,}|…|\.\.\.|:\s*$|\b(write|try|complete|correct|answer|choose|find|work out|calculate|solve|say|tell me|read|fill|name|draw|explain)\b|اكتب|حاول|اجب|اختر|احسب|اكمل|اذكر|استخرج|جرب|قل|هل/i.test(tail)) out.push('End with ONE clear task for them (a question or an instruction).');
  }
  if (p.band === 'under9' && words(reply) > 45) out.push('Too long for a child under 9: at most 3 short sentences and one task.');
  else if (p.band === 'child' && words(reply) > 80) out.push('Too long for a child: keep it short, then one task.');
  if (p.kind !== 'language' && words(p.learnerText) >= 3) { // a one-word answer says little about the conversation's language
    const learnerAr = arabicShare(p.learnerText); const replyAr = arabicShare(reply);
    if (learnerAr > 0.6 && replyAr < 0.3) out.push('The student wrote in Arabic: reply in Arabic.');
    else if (learnerAr < 0.1 && /[a-z]{3}/i.test(p.learnerText) && replyAr > 0.6) out.push('The student wrote in English: reply in English.');
  }
  if (p.kind === 'outOfScope' && !NOT_COVERED.test(reply.split(/(?<=[.!?؟])\s/)[0] ?? '')) out.push('Start with ONE short sentence saying this is not in their course materials (for example "This isn\'t in your course materials." / "هذا ليس في مواد مقررك."), then a short general-knowledge answer labelled as such.');
  if (p.kind === 'sources' && (!grade || grade.verdict === 'NOT_EVALUATED') && !/\[[0-9٠-٩]{1,2}\]/.test(reply) && !/not (in|cover)|isn'?t in|لا ت(غطي|تناول)|ليس في/i.test(reply)) out.push('You used the course passages: cite each one as [n] right after the sentence that uses it.');
  return out;
}
const NOT_COVERED = /not (in|covered|part of)|isn'?t (in|covered)|doesn'?t cover|don'?t cover|aren'?t in|ليس(ت)? (في|من)|لا (ت|ي)(غطي|تناول|شمل)|مش موجود|غير موجود|مش في/i;
export const regenNote = (reasons: string[]) => `YOUR LAST DRAFT WAS REJECTED. Fix this and change nothing else:\n${reasons.map((r) => `- ${r}`).join('\n')}`;

// ---------------------------------------------------------------------------------------------------------------- the whole graded turn
export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
type CallOut = { text: string; finish: string; usage: { input_tokens: number; output_tokens: number } };
export type ChatCall = (p: { messages: ChatMsg[]; max_tokens: number; json?: boolean; reasoning?: string; temperature?: number; onDelta?: (t: string) => boolean | void }) => Promise<CallOut>;
const stripLeadingMarker = (t: string) => t.replace(/^\s*\[\[assess\b[^\]]*\]\]\s*/i, '').trim();
export type Timings = { gradeMs?: number; firstMs?: number; replyMs?: number; regenMs?: number; totalMs: number; skippedGrade?: boolean; streamed?: boolean; cut?: boolean };

// dsFast: extra instructions go AFTER the learner's message (marked as not theirs), so the system prompt and the conversation are the same
// bytes in the grading call and the reply call. (The chat template moves every system message to the front, which would break that.)
export const NOTE_MARK = '[NOTE FOR THE TUTOR - added by the system, not written by the student]';
export function withNote(messages: ChatMsg[], note: string): ChatMsg[] {
  if (!note) return messages;
  const out = messages.slice(); const last = out[out.length - 1];
  if (last?.role === 'user') out[out.length - 1] = { role: 'user', content: `${last.content}\n\n${NOTE_MARK}\n${note}` };
  else out.push({ role: 'user', content: `${NOTE_MARK}\n${note}` });
  return out;
}

// dsFast: turns with nothing to grade get no grading call. Conservative: a first message, a greeting, or a clear question that the last
// tutor message did not ask for ("ask the tutor ..." makes a question the answer).
const GREETING = /^\s*(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|ok(ay)?|سلام|السلام عليكم|مرحبا|أهلا|اهلا|شكرا)\b[\s!.,؟?]*$/i;
const QUESTION_START = /^\s*(what|why|how|when|where|who|which|whose|explain|define|describe|tell me|can you|could you|wait)\b|^\s*(ما|ماذا|لماذا|ليه|ازاي|إزاي|كيف|متى|امتى|أين|فين|مين|اشرح|عرف|عرّف|وضح|يعني|هو|هي)\s/i;
export function nothingToGrade(learnerText: string, taskText: string): boolean {
  const t = learnerText.trim();
  if (!taskText.trim()) return true;
  if (GREETING.test(t)) return true;
  if (/\bask\b|اسأل/i.test(taskText)) return false;
  return QUESTION_START.test(t) && /[?؟]\s*$|^\s*(explain|define|describe|tell me|اشرح|عرف|عرّف|وضح)/i.test(t) && t.split(/\s+/).length >= 3;
}

const SENTENCE_END = /([.!?؟]["'”»)]*\s+|\n+)/;
const TRY_AGAIN = (arabic: boolean) => (arabic ? 'حاول مرة أخرى.' : 'Try the same task again.');

/** A graded DeepSeek turn: grade (JSON) → code check → reply (with examples) → checks (one regeneration) → hidden line + reply.
 * With onText (a stream), the hidden line is sent first, then the reply sentence by sentence as each one passes the checks. */
export async function gradedReply(p: { system: string; messages: ChatMsg[]; maxTokens: number; temperature?: number; parts: DsParts; call: ChatCall; gradeReasoning?: string; onText?: (t: string) => void }): Promise<{ text: string; finish: string; usage: { input_tokens: number; output_tokens: number }; meta: { grade: Grade | null; check: CheckResult; regenerated: string[]; timings: Timings } }> {
  const t0 = Date.now(); const timings: Timings = { totalMs: 0 };
  const usage = { input_tokens: 0, output_tokens: 0 };
  const add = (u: { input_tokens: number; output_tokens: number }) => { usage.input_tokens += u.input_tokens; usage.output_tokens += u.output_tokens; };
  const fast = Boolean(p.parts.fast);
  const kind = turnKind(p.system); const band = ageBand(p.system);
  const learnerText = [...p.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const taskText = [...p.messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const temperature = p.parts.tuning ? Math.min(p.temperature ?? 0.3, 0.3) : p.temperature;
  const sysMsg: ChatMsg = { role: 'system', content: p.system };
  let grade: Grade | null = null; let check: CheckResult = {};
  if (p.parts.gradeFirst) {
    if (fast && nothingToGrade(learnerText, taskText)) {
      grade = { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', next: taskText.trim() ? 'SAME_ITEM' : 'NONE', criteria: [] };
      timings.skippedGrade = true;
    } else {
      const g0 = Date.now();
      const g = fast
        ? await p.call({ messages: [sysMsg, ...withNote(p.messages, GRADE_INSTRUCTION_SHORT)], max_tokens: 160, json: true, reasoning: p.parts.tuning ? p.gradeReasoning : undefined, temperature: 0 })
        : await p.call({ messages: [{ role: 'system', content: `${p.system}\n\n${GRADE_INSTRUCTION}` }, ...p.messages], max_tokens: 400, json: true, reasoning: p.parts.tuning ? p.gradeReasoning : undefined, temperature: 0 });
      timings.gradeMs = Date.now() - g0;
      add(g.usage);
      grade = readGrade(g.text);
      if (grade && p.parts.answerCheck && grade.relevance === 'ACTIVE_ITEM' && grade.verdict !== 'NOT_EVALUATED') {
        check = answerCheck(grade.answer ?? learnerText, grade.expected);
        if (!check.verdict && check.note?.startsWith('spelling:') && RIGHT.has(grade.verdict)) check = { ...check, verdict: 'PARTIALLY_CORRECT' }; // the prompt: a spelling error is never "right" as a whole
        if (check.verdict && check.verdict !== grade.verdict && !(check.verdict === 'CORRECT' && grade.verdict === 'CORRECT_WITH_EQUIVALENT_FORMULATION')) {
          grade = { ...grade, verdict: check.verdict, next: check.verdict === 'CORRECT' ? (grade.next === 'SAME_ITEM' ? 'NEW_ITEM' : grade.next) : grade.next === 'NEW_ITEM' ? 'SAME_ITEM' : grade.next };
        }
      }
    }
  }
  const cap = band === 'under9' ? 45 : band === 'child' ? 80 : 0; // words; a streamed reply can't be shortened afterwards, so say it up front too
  const extra = [grade ? decisionNote(grade, check) : '', cap ? `LENGTH: at most ${cap} words in the whole reply (a young learner).` : '', p.parts.examples ? examplesFor(kind, band) : ''].filter(Boolean).join('\n\n');
  const build = (note?: string): ChatMsg[] => {
    const n = [extra, note].filter(Boolean).join('\n\n');
    return fast ? [sysMsg, ...withNote(p.messages, n)] : [{ role: 'system', content: n ? `${p.system}\n\n${n}` : p.system }, ...p.messages];
  };
  const clean = (t: string) => (grade ? stripLeadingMarker(t) : t);
  const write = async (note?: string) => { const r = await p.call({ messages: build(note), max_tokens: p.maxTokens, temperature }); add(r.usage); return { ...r, text: clean(r.text) }; };
  const problems = (text: string) => replyProblems({ reply: text, grade, kind, band, learnerText, taskText });
  const regenerated: string[] = [];
  const marker = grade ? `${markerOf(grade)}\n` : '';

  // Streamed: send the hidden line now; hold the first sentence for the opening checks (language, "not in your materials"); then send each
  // sentence that does not give the answer away. A sentence that does ends the reply with "try again" (nothing already shown is taken back).
  if (p.onText && fast && p.parts.gradeFirst) {
    timings.streamed = true;
    const emit = (t: string) => { if (!t) return; if (timings.firstMs === undefined) timings.firstMs = Date.now() - t0; p.onText!(t); };
    if (marker) p.onText(marker);
    let buf = ''; let sent = ''; let first = true; let stop = false; let tooLong = false; let redo: string[] | null = null;
    const r0 = Date.now();
    const leaks = (sentence: string) => p.parts.replyChecks && grade ? problems(`${sentence} ?`).some((x) => x.startsWith('You gave the correct answer away')) : false;
    const flush = (sentence: string): boolean => {
      if (first) {
        first = false;
        if (p.parts.replyChecks) {
          const open = replyProblems({ reply: `${sentence} ?`, grade: null, kind, band, learnerText, taskText }).filter((x) => /not in their course materials|reply in (Arabic|English)/.test(x));
          if (open.length) { redo = open; return false; }
        }
      }
      if (leaks(sentence)) { stop = true; timings.cut = true; regenerated.push('answer given away mid-stream: ended with "try again"'); return false; }
      if (cap && sent && words(sent + sentence) > cap) { stop = true; timings.cut = true; tooLong = true; return false; } // young learner: stop at a sentence end
      emit(sentence); sent += sentence; return true;
    };
    const r = await p.call({ messages: build(), max_tokens: p.maxTokens, temperature, onDelta: (d) => {
      if (stop || redo) return false;
      buf += d;
      if (first && sent === '' && /^\s*\[\[assess/i.test(buf) && !/\]\]/.test(buf)) return true; // a hidden line the model wrote anyway: wait for its end
      if (grade) buf = buf.replace(/^\s*\[\[assess\b[^\]]*\]\]\s*/i, '');
      let m: RegExpExecArray | null;
      while (!stop && !redo && (m = SENTENCE_END.exec(buf))) { const cut = m.index + m[0].length; const piece = buf.slice(0, cut); buf = buf.slice(cut); if (!flush(piece)) break; }
      return !(stop || redo);
    } });
    add(r.usage);
    if (!redo && !stop && buf.trim()) flush(buf); // the last sentence (no end mark)
    const redoNow = redo as string[] | null;
    if (redoNow) {
      regenerated.push(...redoNow);
      const g0 = Date.now(); const again = await write(regenNote(redoNow)); timings.regenMs = Date.now() - g0;
      emit(again.text); sent = again.text;
    } else if (stop && !tooLong) {
      const ending = TRY_AGAIN(/[\u0600-\u06FF]/.test(sent + learnerText));
      emit(sent ? ` ${ending}` : ending); sent += sent ? ` ${ending}` : ending;
    }
    timings.replyMs = Date.now() - r0; timings.totalMs = Date.now() - t0;
    const text = marker && sent.trim() ? `${marker}${sent.trim()}` : sent.trim();
    return { text, finish: r.finish, usage, meta: { grade, check, regenerated, timings } };
  }

  const r0 = Date.now();
  let r = await write();
  timings.replyMs = Date.now() - r0; timings.firstMs = Date.now() - t0;
  if (p.parts.replyChecks && r.text) {
    const reasons = problems(r.text);
    if (reasons.length) {
      regenerated.push(...reasons);
      const g0 = Date.now(); const again = await write(regenNote(reasons)); timings.regenMs = Date.now() - g0;
      if (again.text && problems(again.text).length < reasons.length) r = again;
    }
  }
  timings.totalMs = Date.now() - t0;
  const text = grade && r.text ? `${marker}${r.text}` : r.text;
  return { text, finish: r.finish, usage, meta: { grade, check, regenerated, timings } };
}
