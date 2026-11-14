import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { logger, serializeError } from '../utils/logging';

// Language Teaching Context Engine (Phase 1, ltc-v1). For language courses only:
// a labelled learner and lesson context, deterministic per-turn teaching moves,
// a short versioned prompt block, and a minimal non-mastery record of the turn.
// Research basis: docs/teaching/phase-1-evidence-ledger.md (LTC-D1..D12).
// Design: docs/architecture/language-teaching-context-engine.md.

export const LANGUAGE_CONTEXT_VERSION = 'ltc-v1';
// Policy revision of ltc-v1 (extended in place, same context version and block).
// r1 (LTB v1.0 remediation): hint-first answer requests, pending-task answer
// detection, length/register targets by age band and CEFR step, off-topic redirect.
// r2 (LTB v1.0 r1 follow-up): repeated-misconception strategy shift with a
// bounded exit, targeted clarification of missing context (no stacked teaching,
// no placeholder lessons), feedback that models on a different example and
// handles one error at a time, and age-band observability.
// r3: trusted age-band contract (resolver with provenance; child/teen bands
// only from a trusted runtime source, none of which exists yet), minor-slip and
// self-correction triage, progression after confirmed success, evaluation of a
// volunteered first sentence (record vs current evidence), revised r2 wording.
export const LANGUAGE_POLICY_REVISION = 'ltc-v1-r3';

export type KnowledgeStatus = 'known' | 'inferred' | 'not_assessed' | 'unknown';

export interface Fact<T> {
  status: KnowledgeStatus;
  value?: T;
  // Where it came from: never a guess presented as data.
  source: string;
  asOf?: string;
}

export type LevelBand = 'beginner' | 'intermediate' | 'advanced' | 'unknown';

export interface LanguageLearnerContext {
  targetLanguage: Fact<string>;
  // The learner's own (support) language.
  supportLanguage: Fact<string>;
  // Proficiency is never 'known' in this phase: ENARA holds no validated
  // placement result (LTC-D1).
  proficiency: Fact<string> & { band: LevelBand };
  ageBand: Fact<AgeBand>;
  // From the existing evidence model, passed through unchanged.
  objectiveStatus?: Fact<string>;
}

// r3: coarse age band. Only resolveTrustedAgeBand() produces it, from server-side
// records; never from grade, CEFR, writing, names, client input or benchmark labels.
export type AgeBand = 'child' | 'teen' | 'adult' | 'unknown';
export type AgeBandSource = 'school_setting_adult_learners' | 'no_trusted_learner_age_source' | 'invalid_school_setting';
export interface TrustedAgeBand {
  band: AgeBand;
  status: 'known' | 'unknown';
  source: AgeBandSource;
}

// The only trusted runtime source today is the school-level adult-learners
// setting, whose documented policy (models/Institution.ts) is that every
// student of such a school is taught as an adult. ENARA stores no learner-level
// age, date of birth or age band, so child and teen cannot be resolved: they
// stay 'unknown' (BLOCKED pending a product decision; see r3 report). A
// non-boolean setting is treated as invalid, never as adult.
export function resolveTrustedAgeBand(learningSettings: unknown): TrustedAgeBand {
  const raw = learningSettings && typeof learningSettings === 'object' ? (learningSettings as Record<string, unknown>).adultLearners : undefined;
  if (raw === true) return { band: 'adult', status: 'known', source: 'school_setting_adult_learners' };
  if (raw !== undefined && raw !== null && typeof raw !== 'boolean') return { band: 'unknown', status: 'unknown', source: 'invalid_school_setting' };
  return { band: 'unknown', status: 'unknown', source: 'no_trusted_learner_age_source' };
}

export interface LanguageSpec {
  objectives?: string[];
  successCriteria?: string[];
  vocabulary?: string[];
  grammar?: string[];
  functions?: string[];
  skills?: string[];
  examples?: string[];
}

export interface LanguageLessonContext {
  status: 'structured' | 'unstructured' | 'none';
  lessonId?: string;
  title?: string;
  description?: string;
  spec?: LanguageSpec;
  courseTitle?: string;
}

// How the tutor's previous reply invited the learner to respond (r1). Derived
// from the session's own history each turn: no new persistence, so it can't
// outlive or leak beyond the session it was read from.
export type InvitationKind = 'question' | 'instruction' | 'sentence_frame';

export type LearnerResponseKind =
  | 'answer'
  | 'answer_request'
  | 'hint_request'
  | 'dont_know'
  | 'repeat_request'
  | 'example_request'
  | 'help_request'
  | 'confusion'
  | 'greeting'
  | 'off_topic'
  | 'other_request'
  | 'no_pending_task';

export type OffTopicKind = 'unrelated' | 'adjacent' | 'social';

// r2: does this answer repeat the error the tutor flagged in the learner's
// previous answer? 'unknown' when the previous feedback flagged nothing that
// can be matched; the prompt then states the conditional policy.
export type ErrorRecurrence = 'repeated' | 'changed' | 'unknown';

export interface TurnSignals {
  firstTurn: boolean;
  helpRequest: boolean;
  answerRequest: boolean;
  confusionCount: number;
  // The learner is answering a pending task (r1: any invitation kind, not only a
  // closing question mark).
  answeringCheck: boolean;
  writesInArabicScript: boolean;
  vague: boolean;
  // r1 additions
  pendingTask?: InvitationKind;
  learnerResponse?: LearnerResponseKind;
  // Learner attempts on the current task chain before this message.
  attemptsOnTask?: number;
  hintRequest?: boolean;
  dontKnow?: boolean;
  repeatRequest?: boolean;
  exampleRequest?: boolean;
  offTopic?: OffTopicKind;
  // r2
  errorRecurrence?: ErrorRecurrence;
  // Earlier answers in this task chain that already repeated a flagged error
  // (each one got a change of approach).
  priorStrategyShifts?: number;
  // The learner's own words saying what they want to practise (no lesson case).
  learnerGoal?: string;
  goalAmbiguous?: boolean;
  goalAsked?: boolean;
  // r3
  selfCorrected?: boolean;
  // Consecutive earlier answers in this task chain that the tutor confirmed as correct.
  confirmedSuccessStreak?: number;
  // A first message that is the learner's own sentence (not a request): evaluated as an answer.
  unpromptedSentence?: boolean;
}

export type MoveId =
  | 'clarify_goal'
  | 'activate_prior_knowledge'
  | 'comprehensible_model'
  | 'short_explanation'
  | 'comprehension_check'
  | 'corrective_feedback_retry'
  | 'scaffold_hint'
  | 'reteach_simpler'
  | 'l1_support'
  | 'answer_with_reasoning'
  | 'fade_support'
  | 'independent_practice'
  // r1
  | 'restate_task'
  | 'distinct_example'
  | 'redirect_to_lesson'
  // r2
  | 'general_practice';

export interface SelectedMove {
  id: MoveId;
  reasons: string[];
  ledger: string[];
}

export interface LanguageTeachingContext {
  version: typeof LANGUAGE_CONTEXT_VERSION;
  learner: LanguageLearnerContext;
  lesson: LanguageLessonContext;
  signals: TurnSignals;
  moves: SelectedMove[];
  length?: LengthTarget;
  prompt: string;
}

export interface LengthTarget {
  targetWords: number;
  maxWords: number;
  basis: string;
}

// The record stored on the tutor's reply: minimal, low-confidence, never mastery.
export interface LanguageTurnEvidence {
  version: string;
  lessonId?: string;
  objectiveId?: string;
  skill: 'written_interaction';
  moves: string[];
  reasonCodes: string[];
  supportRequested: boolean;
  confusionSignals: number;
  answeringCheck: boolean;
  proficiency: { status: KnowledgeStatus; value?: string; source: string };
  nextStep?: string;
  provenance: 'deterministic_turn_signals';
  confidence: 'low';
  masteryClaim: false;
  // r1
  policyRevision?: string;
  pendingTask?: string;
  learnerResponse?: string;
  attemptsOnTask?: number;
  offTopic?: string;
  lengthTarget?: { targetWords: number; maxWords: number; basis: string };
  // r2
  errorRecurrence?: string;
  missingContext?: string[];
  ageBand?: string;
  ageBandSource?: string;
  // r3
  ageBandStatus?: string;
  confirmedSuccessStreak?: number;
}

// ---------------------------------------------------------------------------
// Learner context

const CEFR = /\b(pre-?a1|a1|a2|b1|b2|c1|c2)\b/i;

export function levelBand(level?: string): LevelBand {
  const m = CEFR.exec(level ?? '');
  if (!m) {
    if (/beginner|starter|elementary|مبتدئ/i.test(level ?? '')) return 'beginner';
    if (/intermediate|متوسط/i.test(level ?? '')) return 'intermediate';
    if (/advanced|proficient|متقدم/i.test(level ?? '')) return 'advanced';
    return 'unknown';
  }
  // CEFR's broad groups: A1-A2 basic user, B1-B2 independent user, C1-C2
  // proficient user. A course level is only an estimate of the learner (LTC-D1).
  const v = m[1].toLowerCase().replace('-', '');
  if (v === 'prea1' || v === 'a1' || v === 'a2') return 'beginner';
  if (v === 'b1' || v === 'b2') return 'intermediate';
  return 'advanced';
}

export function isLanguageCourse(type?: string): boolean {
  return /language|لغة/i.test(type ?? '');
}

export function targetLanguageOf(languages: string[] | undefined): Fact<string> {
  const list = (languages ?? []).map((l) => l.trim()).filter(Boolean);
  if (list.length !== 1) return { status: 'unknown', source: list.length ? 'course_languages_ambiguous' : 'course_languages_missing' };
  // Arabic as a target language is Modern Standard Arabic in this phase.
  const value = /^arabic$|^العربية$/i.test(list[0]) ? 'Arabic (Modern Standard)' : list[0];
  return { status: 'known', value, source: 'course_configuration' };
}

const ARABIC_CHARS = /[؀-ۿ]/g;
const LATIN_CHARS = /[A-Za-z]/g;

export function mostlyArabicScript(text: string): boolean {
  const ar = (text.match(ARABIC_CHARS) ?? []).length;
  const la = (text.match(LATIN_CHARS) ?? []).length;
  return ar > 0 && ar >= la;
}

// Any substantive Arabic in the message (mixed messages such as
// "يعني ايه breakfast" count: the learner is using Arabic to ask).
export function usesArabicScript(text: string): boolean {
  return (text.match(ARABIC_CHARS) ?? []).length >= 3;
}

export function deriveLearnerContext(input: {
  courseLevel?: string;
  courseLanguages?: string[];
  adultSchool: boolean;
  // r3: the resolver's output (preferred); adultSchool is the legacy form.
  trustedAgeBand?: TrustedAgeBand;
  grade?: string; // ignored for age (kept for call compatibility)
  learnerMessages: string[];
  objectiveStatus?: string;
}): LanguageLearnerContext {
  const target = targetLanguageOf(input.courseLanguages);
  const band = levelBand(input.courseLevel);
  const proficiency: LanguageLearnerContext['proficiency'] = input.courseLevel?.trim()
    ? { status: 'inferred', value: input.courseLevel.trim(), source: 'course_level', band }
    : { status: 'unknown', source: 'no_level_information', band: 'unknown' };
  const arabicWriting = input.learnerMessages.some(usesArabicScript);
  const supportLanguage: Fact<string> =
    arabicWriting && !/arabic/i.test(target.value ?? '')
      ? { status: 'inferred', value: 'Arabic', source: 'learner_messages' }
      : { status: 'unknown', source: 'not_collected' };
  // r3: age band only from the trusted resolver; grade is never used (it was
  // never passed at runtime; the r3 brief forbids grade as an age source).
  const trusted = input.trustedAgeBand ?? resolveTrustedAgeBand({ adultLearners: input.adultSchool });
  const ageBand: Fact<AgeBand> = trusted.status === 'known'
    ? { status: 'known', value: trusted.band, source: trusted.source }
    : { status: 'unknown', value: 'unknown', source: trusted.source };
  return {
    targetLanguage: target,
    supportLanguage,
    proficiency,
    ageBand,
    ...(input.objectiveStatus
      ? { objectiveStatus: { status: input.objectiveStatus === 'not_assessed' ? 'not_assessed' : 'known', value: input.objectiveStatus, source: 'evidence_model' } as Fact<string> }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Lesson context

const LIST_LIMIT = 20;
const ITEM_LIMIT = 200;
const clean = (list?: unknown): string[] | undefined => {
  if (!Array.isArray(list)) return undefined;
  const out = list.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, ITEM_LIMIT)).filter(Boolean).slice(0, LIST_LIMIT);
  return out.length ? out : undefined;
};

export function sanitizeLanguageSpec(spec: unknown): LanguageSpec | undefined {
  if (!spec || typeof spec !== 'object') return undefined;
  const s = spec as Record<string, unknown>;
  const out: LanguageSpec = {
    objectives: clean(s.objectives),
    successCriteria: clean(s.successCriteria),
    vocabulary: clean(s.vocabulary),
    grammar: clean(s.grammar),
    functions: clean(s.functions),
    skills: clean(s.skills)?.filter((k) => ['listening', 'speaking', 'reading', 'writing', 'integrated'].includes(k)),
    examples: clean(s.examples),
  };
  return Object.values(out).some((v) => v?.length) ? out : undefined;
}

export function deriveLessonContext(chapter: { id: string; title?: string; description?: string; languageSpec?: unknown } | undefined, courseTitle?: string): LanguageLessonContext {
  if (!chapter) return { status: 'none', courseTitle };
  const spec = sanitizeLanguageSpec(chapter.languageSpec);
  return {
    status: spec ? 'structured' : 'unstructured',
    lessonId: chapter.id,
    title: chapter.title,
    description: chapter.description?.slice(0, 1000),
    spec,
    courseTitle,
  };
}

// ---------------------------------------------------------------------------
// Turn signals (deterministic; English and Arabic, including Egyptian forms)

const HELP = /\b(explain|teach me|can you (teach|explain|help)|what does .{1,40} mean|does (it|this|that) mean|how to say|what'?s the word for|the word for|what is the meaning|meaning of|how do (i|you) say|translate|what's the difference|why (is it|do we|do you|does)|when (do|should) (we|i))\b|اشرح|اشرحلي|يعني (ايه|إيه)|معنى|ترجم|ازاي اقول|إزاي أقول/i;
const ANSWER = /\b(just tell me|give me the answer|tell me the answer|what'?s the answer|the answer is what)\b|(قول|قولي|اديني|أعطني|اعطني)\s*(ال)?(اجابة|إجابة|الحل)/i;
const CONFUSED = /\b(i don'?t (understand|get it)|i'?m (confused|lost)|not clear|didn'?t understand)\b|مش فاهم|مش فاهمة|لا أفهم|لا افهم|مفهمتش|مش واضح/i;
const GREETING = /^(hi|hello|hey|salam|السلام عليكم|اهلا|أهلا|مرحبا|hi there|good (morning|evening))[\s!.,؟?]*$/i;

export function isConfusion(text: string): boolean {
  const t = text.trim();
  return CONFUSED.test(t) || /^[?؟]+$/.test(t);
}

// The learner is asking or requesting something rather than answering.
const REQUEST = /^(can|could|would|will) you\b|^(please|explain|teach|help|tell me|show me)\b|^(what|why|how|when|where|which|who)\b/i;

// The tutor's last reply ended by asking the learner something: a question in
// its closing part (replies often end with a gap-fill line after the question).
export function endsWithCheck(reply: string): boolean {
  return /[?؟]/.test(reply.trim().slice(-300));
}

// r1: how the tutor's previous reply invited a response, read from its closing
// part. Baseline (ltc-v1) only recognised a question mark; tutors usually close
// an exercise with an instruction ("Write your answers, and I'll check them!")
// or a gap-fill frame, so those count too.
const INVITE_VERB =
  /(^|[\n.!:;)\-•*]\s*|\b(now|please|then|and|so)\s+)(write|complete|fill( in)?|choose|pick|circle|try|tell me|make|correct|fix|rewrite|change|put|answer|translate|use|say|describe|order|match|add|send me|type|give me|finish)\b/im;
const INVITE_PHRASE = /\b(your turn|now you|over to you|i'?ll check|let me (check|see)|send (me )?your|what do you think|in your own words|have a go|give it a try)\b|دورك|جرب|اكتب|أكمل|اكمل/i;
const GAP = /_{2,}|\.{3}\s*[.?!]?\s*$|…|\[\s*\]|\(\s*\)/m;

export function taskInvitation(reply: string): InvitationKind | undefined {
  const tail = reply.trim().slice(-400);
  if (!tail) return undefined;
  if (/[?؟]/.test(tail.slice(-300))) return 'question';
  if (GAP.test(tail)) return 'sentence_frame';
  if (INVITE_VERB.test(tail) || INVITE_PHRASE.test(tail)) return 'instruction';
  return undefined;
}

const HINT_REQUEST = /\b(hint|clue|help me (start|with (this|it|that))|a little help|give me a tip|how do i start)\b|تلميح|ساعدني|ادينى تلميح|اديني تلميح/i;
const DONT_KNOW = /^(i\s*(really\s*)?(don'?t|do not|dont) know|idk|no idea|not sure|i'?m not sure|dunno)\b|مش عارف|مش عارفة|معرفش|ما اعرف|ما أعرف|لا اعرف|لا أعرف|مش متأكد/i;
const REPEAT = /\b(repeat( that| the question| please)?|say (it|that) again|what (do|should) i (do|write)|i don'?t understand the (question|task|exercise)|what do you mean)\b|يعني اعمل ايه|اعمل ايه|مش فاهم السؤال/i;
const EXAMPLE = /\b((give|show) me (an?|another|one more|some)? ?(example|examples|model)|example sentence|for example\?|can you give an example)\b|مثال/i;
const SOCIAL = /^(hi|hello|hey|thanks|thank you|thx|ok(ay)?|cool|great|bye|good (morning|evening|night)|how are you)\b[\s\w!.,?]{0,20}$|^(شكرا|تمام|اهلا|أهلا|مرحبا|ازيك|السلام عليكم)/i;

// r1: requests for work outside language learning that the lesson tutor should
// not do (another subject's homework, or a finished piece of writing for them).
const OTHER_SUBJECT = /\b(maths?|mathematics|algebra|geometry|fractions?|equations?|physics|chemistry|biology|science|history|geography|coding|programming|python|javascript)\b|\b\d+\s*[-+×x*/÷=]\s*\d+\b|\b\d*[a-z]\s*[-+]\s*\d+\s*=|رياضيات|فيزياء|كيمياء|تاريخ|جغرافيا|علوم/i;
const DO_IT_FOR_ME =
  /\b(do|write|make|finish|complete|solve)\b[^.?!]{0,40}\b(my|an?|the|this)\b[^.?!]{0,40}\b(homework|essay|email|e-mail|letter|report|assignment|project|cv|resume|application|speech|presentation|exercise sheet)\b|\b(do|solve|finish) (it|this|them) for me\b|\bfor me\b[^.?!]{0,20}\b(essay|email|letter|report|homework)\b/i;
// Language questions are on-topic or adjacent even when the content is not in
// the lesson ("how do I say fractions in English?").
const LANGUAGE_QUESTION = /\b(how (do|can) (i|you) say|in english|what('?s| is| does)\b[^?]{0,40}\b(mean|meaning)|translate|spell|pronounce|is (this|it) correct|correct my|check my (english|grammar|sentence|writing|spelling))\b|بالانجليزي|بالإنجليزي|ازاي اقول|يعني ايه/i;

export function offTopicKind(text: string, lesson?: { title?: string; spec?: LanguageSpec }): OffTopicKind | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (LANGUAGE_QUESTION.test(t) || HELP.test(t)) {
    return OTHER_SUBJECT.test(t) || DO_IT_FOR_ME.test(t) ? 'adjacent' : undefined;
  }
  // A request naming the lesson's own words or patterns is on topic.
  const lessonTerms = [...(lesson?.spec?.vocabulary ?? []), ...(lesson?.title ? [lesson.title] : [])]
    .flatMap((v) => v.toLowerCase().split(/[^\p{L}]+/u))
    .filter((w) => w.length >= 4);
  const lower = t.toLowerCase();
  const mentionsLesson = lessonTerms.some((w) => lower.includes(w));
  // Only a request can be off-topic: a learner sentence that mentions homework
  // ("I always do my homework before that") is language, not a request.
  const asks = REQUEST.test(t) || /^(can|could|would|will) u\b/i.test(t) || /\bfor me\b/i.test(t) || /^(do|write|make|solve|finish|help)\b/i.test(t) || /[?؟]\s*$/.test(t) || /\b(i need you to|i want you to)\b/i.test(t);
  if (asks && DO_IT_FOR_ME.test(t)) return 'unrelated';
  if (asks && OTHER_SUBJECT.test(t) && /\b(help|homework|do|solve|teach|calculate|explain)\b/i.test(t) && !mentionsLesson) return 'unrelated';
  if (SOCIAL.test(t) && !GREETING.test(t)) return 'social';
  return undefined;
}

type Turn = { role: 'user' | 'assistant'; content: string };

// Classify a learner message against the task the tutor left open, if any.
export function classifyLearnerResponse(text: string, pending: InvitationKind | undefined, offTopic?: OffTopicKind): LearnerResponseKind {
  const t = text.trim();
  if (ANSWER.test(t)) return 'answer_request';
  if (DONT_KNOW.test(t)) return 'dont_know';
  if (HINT_REQUEST.test(t)) return 'hint_request';
  if (REPEAT.test(t)) return 'repeat_request';
  if (EXAMPLE.test(t)) return 'example_request';
  if (isConfusion(t)) return 'confusion';
  if (offTopic === 'unrelated') return 'off_topic';
  if (GREETING.test(t)) return 'greeting';
  if (HELP.test(t)) return 'help_request';
  if (REQUEST.test(t)) return 'other_request';
  if (!pending) return 'no_pending_task';
  // A pending task makes a plain message a candidate answer: short, unpunctuated
  // and error-containing replies included. A trailing "?" alone doesn't make it
  // a request ("She goes to bed at ten?" is a tentative answer).
  return 'answer';
}

// Learner attempts on the current task chain, before this message: walk back
// through (tutor invitation → learner answer) pairs and stop at the first learner
// message that wasn't an answer (a new request starts a new chain).
export function attemptsOnCurrentTask(history: Turn[]): number {
  let attempts = 0;
  for (let i = history.length - 1; i >= 1; i -= 1) {
    const h = history[i];
    if (h.role !== 'user') continue;
    const prev = [...history.slice(0, i)].reverse().find((x) => x.role === 'assistant');
    const kind = classifyLearnerResponse(h.content, prev ? taskInvitation(prev.content) : undefined);
    if (kind !== 'answer') break;
    attempts += 1;
  }
  return attempts;
}

// r2: error recurrence. Learner-side words or short phrases that the tutor's
// feedback marked as wrong (emphasised, in a sentence with an error cue, and
// present in the learner's previous answer), then checked in the new answer.
const ERROR_CUE = /\b(fix|wrong|missing|not quite|needs?|change|careful|almost|still|error|mistakes?|instead|should be|look again|problem|incorrect|not right|isn'?t right)\b|❌|✗/i;
const PRAISE = /\b(correct|right|good|great|well done|perfect|nice|yes)\b|✅|✓/i;
const SPAN = /\*\*\s*["“']?([^*"”]{1,40}?)["”']?\s*\*\*|["“]([^"”]{1,40})["”]/g;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
const hasPhrase = (text: string, phrase: string) => new RegExp(`(^|[^\\p{L}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(norm(text));

const OPENS_WITH_PRAISE = /^\W*(correct|that'?s (correct|right)|yes|well done|perfect|great( job)?|excellent|exactly)\b/i;

export function flaggedErrorSpans(tutorFeedback: string, previousAnswer: string): string[] {
  const out = new Set<string>();
  // Feedback that opens by confirming the answer flags nothing.
  if (OPENS_WITH_PRAISE.test(tutorFeedback.trim())) return [];
  for (const sentence of tutorFeedback.split(/(?<=[.!?])\s+|\n+/)) {
    if (!ERROR_CUE.test(sentence)) continue;
    for (const m of sentence.matchAll(SPAN)) {
      const phrase = norm(m[1] ?? m[2] ?? '');
      if (!phrase || phrase.split(' ').length > 3) continue;
      // A span followed closely by praise ("**up at six** is correct") is not an error.
      const after = sentence.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 30);
      if (PRAISE.test(after) && !ERROR_CUE.test(after)) continue;
      if (hasPhrase(previousAnswer, phrase)) out.add(phrase);
    }
  }
  return [...out];
}

// A flagged span recurs if the new answer contains it, or, for a multi-word
// span, all its words except the last (the head that carries the error stays;
// trailing content may change with the new sentence: "He is nine" → "He is a nurse").
function spanRecurs(answer: string, span: string): boolean {
  if (hasPhrase(answer, span)) return true;
  const words = span.split(' ');
  return words.length > 1 && hasPhrase(answer, words.slice(0, -1).join(' '));
}

const wordSet = (t: string) => new Set(norm(t).split(' ').filter(Boolean));
function overlap(a: string, b: string): number {
  const A = wordSet(a); const B = wordSet(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
}

export function errorRecurrenceFor(previousAnswer: string, tutorFeedback: string, answer: string): ErrorRecurrence {
  const flagged = flaggedErrorSpans(tutorFeedback, previousAnswer);
  if (!flagged.length) return 'unknown';
  const recurring = flagged.filter((p) => spanRecurs(answer, p));
  if (!recurring.length) return 'changed';
  if (norm(answer) === norm(previousAnswer)) return 'repeated';
  // A retry of the same sentence that changed something but kept a flagged
  // span can't be judged from text alone (the flagged span may be context).
  if (overlap(answer, previousAnswer) >= 0.6) return 'unknown';
  return 'repeated';
}

// Recurrence for each answer in the current task chain (oldest first), given
// the answers' preceding feedback; the first answer has none.
function chainRecurrences(history: Turn[], current: string): ErrorRecurrence[] {
  const answers: { text: string; feedbackAfter?: string }[] = [];
  for (let i = history.length - 1; i >= 1; i -= 1) {
    const h = history[i];
    if (h.role !== 'user') continue;
    const prev = [...history.slice(0, i)].reverse().find((x) => x.role === 'assistant');
    if (classifyLearnerResponse(h.content, prev ? taskInvitation(prev.content) : undefined) !== 'answer') break;
    const next = history.slice(i + 1).find((x) => x.role === 'assistant');
    answers.unshift({ text: h.content, feedbackAfter: next?.content });
  }
  const seq = [...answers.map((a) => a.text), current];
  const out: ErrorRecurrence[] = [];
  for (let k = 1; k < seq.length; k += 1) out.push(errorRecurrenceFor(seq[k - 1], answers[k - 1].feedbackAfter ?? '', seq[k]));
  return out;
}

// r2: what a learner says they want to practise. Greetings and generic words
// ("help me with English") are not a goal.
const GOAL_STOP = new Set(['hi', 'hello', 'hey', 'please', 'help', 'me', 'with', 'my', 'english', 'learn', 'learning', 'want', 'wanna', 'to', 'i', 'can', 'you', 'could', 'practise', 'practice', 'improve', 'the', 'a', 'an', 'some', 'today', 'and', 'in', 'on', 'for', 'lesson', 'study', 'teach', 'good', 'morning', 'evening', 'there', 'thanks', 'thank', 'would', 'like', 'do', 'something', 'let', 'us', "let's", 'lets', 'start', 'ok', 'okay', 'please.']);
const AMBIGUOUS_GOAL = /^(anything|whatever|idk|i\s*(don'?t|dont) know|not sure|everything|you choose|any|dunno|no idea|doesn'?t matter|up to you)\b/i;

export function goalFromText(text: string): string | undefined {
  const words = norm(text).split(' ').filter((w) => w && !GOAL_STOP.has(w));
  const content = words.filter((w) => w.length >= 3);
  return content.length ? text.trim().replace(/\s+/g, ' ').slice(0, 120) : undefined;
}

// r3: did the tutor's feedback confirm the previous answer as correct? Read from
// the opening sentence only, and never when it also carries an error cue.
const CONFIRM = /\b(correct|right|well done|perfect|excellent|exactly|great job|spot on)\b|^\W*yes\b|✅|✓/i;
const NOT_CONFIRM = /\b(not (quite )?(correct|right)|almost|nearly|but|however|one thing|good (start|try))\b/i;
export function confirmsCorrect(feedback: string): boolean {
  const t = feedback.trim();
  const first = t.split(/(?<=[.!?])\s+|\n+/)[0] ?? '';
  // Praise in the opening sentence, and no error talk anywhere in the opening part
  // ("'This is my sister.' is correct. But 'He is nine' is not right" is not a confirmation).
  const opening = t.slice(0, 250);
  return CONFIRM.test(first) && !ERROR_CUE.test(opening) && !NOT_CONFIRM.test(opening);
}

function confirmedStreak(history: Turn[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 1; i -= 1) {
    const h = history[i];
    if (h.role !== 'user') continue;
    const prev = [...history.slice(0, i)].reverse().find((x) => x.role === 'assistant');
    if (classifyLearnerResponse(h.content, prev ? taskInvitation(prev.content) : undefined) !== 'answer') break;
    const next = history.slice(i + 1).find((x) => x.role === 'assistant');
    if (!next || !confirmsCorrect(next.content)) break;
    streak += 1;
  }
  return streak;
}

// r3: the learner corrected themselves in the same message ("— sorry, She goes…").
const SELF_CORRECTION = /\b(sorry|i mean|i meant|oops|correction|i mean to say)\b|\*\s*\w+/i;
// Words that make a first message a request about language, not a sentence to evaluate.
const META_REQUEST = /\b(know|word|words|say|mean|meaning|help|explain|example|exercise|practi[cs]e|learn|teach|lesson|answer|question|homework)\b/i;

export function detectTurnSignals(message: string, history: Turn[], lesson?: { title?: string; spec?: LanguageSpec }): TurnSignals {
  const text = message.trim();
  const learner = [...history.filter((h) => h.role === 'user').map((h) => h.content), text].slice(-3);
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant')?.content.trim() ?? '';
  // The learner's first message (a tutor greeting before it doesn't count).
  const firstTurn = !history.some((h) => h.role === 'user');
  // A session greeting before the learner's first message is not a task.
  const pendingTask = firstTurn ? undefined : taskInvitation(lastAssistant);
  const offTopic = offTopicKind(text, lesson);
  const learnerResponse = classifyLearnerResponse(text, pendingTask, offTopic);
  return {
    firstTurn,
    helpRequest: HELP.test(text),
    answerRequest: learnerResponse === 'answer_request',
    confusionCount: learner.filter(isConfusion).length,
    answeringCheck: learnerResponse === 'answer',
    writesInArabicScript: usesArabicScript(text),
    vague: GREETING.test(text) || text.length < 3,
    pendingTask,
    learnerResponse,
    attemptsOnTask: attemptsOnCurrentTask(history),
    hintRequest: learnerResponse === 'hint_request',
    dontKnow: learnerResponse === 'dont_know',
    repeatRequest: learnerResponse === 'repeat_request',
    exampleRequest: learnerResponse === 'example_request',
    offTopic,
    ...r2Signals(text, history, learnerResponse, lesson, firstTurn, offTopic),
  };
}

function r2Signals(text: string, history: Turn[], learnerResponse: LearnerResponseKind, lesson: { title?: string; spec?: LanguageSpec } | undefined, firstTurn: boolean, offTopic?: OffTopicKind): Partial<TurnSignals> {
  const out: Partial<TurnSignals> = {};
  if (learnerResponse === 'answer') {
    out.selfCorrected = SELF_CORRECTION.test(text);
    out.confirmedSuccessStreak = confirmedStreak(history);
    const rec = chainRecurrences(history, text);
    if (rec.length) {
      out.errorRecurrence = rec[rec.length - 1];
      out.priorStrategyShifts = rec.slice(0, -1).filter((r) => r === 'repeated').length;
    }
  }
  // r3: a first message that is the learner's own sentence (no request, greeting
  // or question) in a lesson is their attempt: evaluate it, don't lecture.
  if (firstTurn && lesson && learnerResponse === 'no_pending_task' && !offTopic && !GREETING.test(text) && !/[?؟]/.test(text) && !META_REQUEST.test(text) && norm(text).split(' ').length >= 3) {
    out.unpromptedSentence = true;
    out.selfCorrected = SELF_CORRECTION.test(text);
  }
  // No lesson: the goal is the essential missing field. It was asked on the
  // learner's first message if that message stated none; the next learner
  // message is the answer, used from then on (never asked again).
  if (!lesson) {
    const learnerMsgs = history.filter((h) => h.role === 'user').map((h) => h.content);
    const stated = goalFromText(text);
    if (firstTurn) {
      if (stated && offTopic !== 'unrelated' && !GREETING.test(text)) out.learnerGoal = stated;
    } else {
      const firstGoal = goalFromText(learnerMsgs[0]);
      if (firstGoal) out.learnerGoal = firstGoal;
      else {
        out.goalAsked = true;
        const answer = learnerMsgs.length >= 2 ? learnerMsgs[1] : text;
        const g = goalFromText(answer);
        if (g && !AMBIGUOUS_GOAL.test(answer.trim())) out.learnerGoal = g;
        else out.goalAmbiguous = true;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Move selection: a pure, inspectable function. No fixed sequence.

export function selectLanguageMoves(input: {
  band: LevelBand;
  targetLanguage?: string;
  lessonStatus: LanguageLessonContext['status'];
  signals: TurnSignals;
  hintsOnly?: boolean;
  masteryStatus?: string;
}): SelectedMove[] {
  const { band, signals: s } = input;
  const moves: SelectedMove[] = [];
  const add = (id: MoveId, reasons: string[], ledger: string[]) => {
    if (!moves.some((m) => m.id === id)) moves.push({ id, reasons, ledger });
  };
  const novice = band === 'beginner' || band === 'unknown';
  const strong = band === 'advanced' || input.masteryStatus === 'proficient' || input.masteryStatus === 'mastered';

  // r2: ask only for context that is essential and missing, once, with a target.
  // A known lesson makes a vague message no reason to ask: start the lesson.
  const missing = missingContext({ targetLanguage: input.targetLanguage, lessonStatus: input.lessonStatus, signals: s });
  const clarifying = s.offTopic !== 'unrelated' && missing.length > 0 && !s.goalAsked && (s.firstTurn || s.vague);
  if (clarifying) add('clarify_goal', [`missing_${missing[0]}`], ['LTC-D13']);
  else if (s.firstTurn && !s.unpromptedSentence && (input.lessonStatus === 'structured' || (input.lessonStatus === 'unstructured' && s.vague)) && !s.helpRequest && !s.answerRequest && !s.exampleRequest && s.offTopic !== 'unrelated') add('activate_prior_knowledge', [s.vague ? 'vague_message_lesson_known' : 'first_turn_with_lesson_spec'], ['LTC-D3']);
  if (input.lessonStatus === 'none' && s.goalAsked && s.goalAmbiguous && s.offTopic !== 'unrelated' && !s.helpRequest) add('general_practice', ['goal_answer_ambiguous'], ['LTC-D13']);

  // r1: an unrelated request (another subject's homework, a finished text for
  // them) is redirected, not done; no mini-lesson is stacked on top of it.
  const offTopic = s.offTopic === 'unrelated';
  if (offTopic) add('redirect_to_lesson', [input.lessonStatus === 'none' ? 'off_topic_no_lesson' : 'off_topic_request'], ['LTC-D14']);

  if (s.confusionCount >= 2) add('reteach_simpler', [`confusion_signals_${s.confusionCount}`], ['LTC-D7']);
  if (s.unpromptedSentence) {
    // r3 (T12-type): the learner's own sentence, possibly against an evidence
    // record that says the point is secure. Evaluate it; when the record and the
    // sentence disagree, check once rather than trusting either.
    add('corrective_feedback_retry', ['unprompted_learner_sentence', ...(strong ? ['record_vs_current_check'] : []), ...(s.selfCorrected ? ['self_corrected'] : [])], ['LTC-D4']);
  }
  if (s.answeringCheck && !s.answerRequest) {
    const n = (s.attemptsOnTask ?? 0) + 1;
    // r2 (replaces r1's "show the correct form on attempt 2"): a repeated
    // flagged error gets a change of approach first; only if the same error
    // survives that change does the tutor show the model and give a fresh item.
    if (n >= 2 && s.errorRecurrence === 'repeated' && (s.priorStrategyShifts ?? 0) === 0) {
      add('reteach_simpler', ['repeated_misconception_strategy_shift'], ['LTC-D7']);
    } else if (n >= 2 && s.errorRecurrence === 'repeated') {
      add('answer_with_reasoning', ['repeated_after_strategy_shift_model_then_transfer'], ['LTC-D7']);
    } else {
      add('corrective_feedback_retry', [
        `answer_to_${s.pendingTask ?? 'check'}`,
        novice ? 'level_novice_prompt_first' : 'level_strong_reformulation_ok',
        ...(n >= 2 ? [s.errorRecurrence === 'changed' ? 'flagged_error_not_repeated' : (s.priorStrategyShifts ?? 0) > 0 ? 'recurrence_unknown_after_shift' : 'recurrence_unknown'] : []),
        ...(s.selfCorrected ? ['self_corrected'] : []),
        ...((s.confirmedSuccessStreak ?? 0) >= 1 ? ['after_confirmed_success'] : []),
      ], ['LTC-D4']);
    }
  }
  // r1 hint-first (LTC-D6 revised): an answer request before any attempt on the
  // task gets a hint and an invitation to try; after an attempt, the answer with
  // its reason. A hints-only assignment policy still never gives the answer.
  const hintFirst = s.answerRequest && !input.hintsOnly && (s.attemptsOnTask ?? 0) === 0;
  if (s.answerRequest) {
    if (input.hintsOnly) add('scaffold_hint', ['answer_requested_hints_only_policy'], ['LTC-D6']);
    else if (hintFirst) add('scaffold_hint', ['answer_requested_before_attempt'], ['LTC-D6']);
    else add('answer_with_reasoning', [`answer_requested_after_${s.attemptsOnTask}_attempt${s.attemptsOnTask === 1 ? '' : 's'}`], ['LTC-D6']);
  }
  if (s.dontKnow) add('scaffold_hint', ['learner_does_not_know'], ['LTC-D6']);
  if (s.hintRequest) add('scaffold_hint', ['hint_requested'], ['LTC-D6']);
  if (s.repeatRequest) add('restate_task', ['task_unclear_to_learner'], ['LTC-D6']);
  // An example for an active exercise must not reveal its answer; with no task
  // open, an example request is an ordinary request for a model and explanation.
  if (s.exampleRequest && s.pendingTask) add('distinct_example', ['example_requested_task_open'], ['LTC-D3']);
  const exampleNoTask = Boolean(s.exampleRequest && !s.pendingTask);
  const supportOnly = hintFirst || s.dontKnow || s.hintRequest || s.repeatRequest || offTopic || clarifying || s.unpromptedSentence;
  if (s.helpRequest || exampleNoTask || (novice && !s.answeringCheck && !s.vague && !supportOnly)) add('short_explanation', [s.helpRequest ? 'help_requested' : exampleNoTask ? 'example_requested' : 'novice_level'], ['LTC-D3']);
  if (s.confusionCount === 1 || (input.hintsOnly && !s.answerRequest)) add('scaffold_hint', [s.confusionCount === 1 ? 'confusion_signal' : 'hints_only_policy'], ['LTC-D6']);
  const feedbackTurn = moves.some((m) => ['corrective_feedback_retry', 'reteach_simpler'].includes(m.id) && m.reasons.some((r) => r.startsWith('answer_to_') || r.startsWith('repeated_') || r === 'unprompted_learner_sentence'));
  if (novice && !clarifying) add('comprehensible_model', [band === 'unknown' ? 'level_unknown_start_simple' : 'level_beginner', ...(feedbackTurn ? ['during_feedback'] : [])], ['LTC-D2']);
  if (novice && s.writesInArabicScript && !/arabic/i.test(input.targetLanguage ?? '')) add('l1_support', ['learner_writes_arabic_script', 'novice_level'], ['LTC-D8']);
  if (strong && s.confusionCount === 0 && !offTopic && !s.unpromptedSentence) {
    add('fade_support', [band === 'advanced' ? 'level_advanced' : `mastery_${input.masteryStatus}`], ['LTC-D3']);
    if (!s.answeringCheck && !hintFirst) add('independent_practice', ['strong_and_not_confused'], ['LTC-D3']);
  }
  const explained = moves.some((m) => m.id === 'short_explanation' || m.id === 'reteach_simpler' || m.id === 'answer_with_reasoning');
  if (explained && !(strong && s.helpRequest) && !clarifying) add('comprehension_check', ['after_explanation'], ['LTC-D5']);
  return moves;
}

// r2: essential context that is missing, most important first. Proficiency is
// never asked (the tutor calibrates from replies); the lesson or goal is needed
// to choose what to practise; the target language before everything else.
export function missingContext(input: { targetLanguage?: string; lessonStatus: LanguageLessonContext['status']; signals: TurnSignals }): string[] {
  const out: string[] = [];
  // With a lesson, the course and lesson already fix the language being taught.
  if (!input.targetLanguage && input.lessonStatus === 'none') out.push('target_language');
  if (input.lessonStatus === 'none' && !input.signals.learnerGoal) out.push('lesson_or_goal');
  return out;
}

// ---------------------------------------------------------------------------
// Prompt (versioned; the only place these instructions live)

const MOVE_TEXT: Record<MoveId, string> = {
  clarify_goal: 'First find out what the learner wants to do today (one short question), unless their message already says.',
  general_practice: 'No lesson is selected and their answer did not name a goal. Start one short general practice task suited to their level, and say plainly that it is general practice, not a lesson from their course.',
  activate_prior_knowledge: 'Start by briefly connecting to what they already know about this lesson\'s topic (one quick question or reminder).',
  comprehensible_model: 'Use short sentences and common words; introduce at most 2-3 new words or forms per reply, each with a short gloss; show a model sentence in a meaningful context.',
  short_explanation: 'Give a short, direct explanation with one example in context. Do not answer with only questions.',
  comprehension_check: 'End with one short, focused check (a question or a mini task) tied to the lesson objective.',
  corrective_feedback_retry:
    'They are answering your task: say specifically what is right and what is wrong in their answer (quote the part). First decide whether it is essentially correct: if the only issues are small surface slips (a capital letter, punctuation, spelling of a word that is not the lesson target) or they already corrected themselves, confirm it clearly, mention the slip in a few words at most, and move on to the next step, with no reteaching and no retry. Otherwise keep what is correct; if there are several errors, focus on the one that matters most for meaning and for this lesson\'s target, and mention small slips briefly or not at all; if something is wrong, give one hint aimed only at the gap and ask them to try again before you show the correct form; for strong learners a brief correct reformulation is enough. Never call one correct answer mastery.',
  scaffold_hint: 'Give a hint matched to their last reply (one step), not the full answer.',
  restate_task: 'They did not understand the task: restate it in one simpler line and show the format with a different example (not the answer). Then ask them to try.',
  distinct_example: 'They asked for an example: give a new example of the same pattern that is different from their current exercise, so the exercise answer stays theirs to find.',
  redirect_to_lesson:
    'This request is outside this English lesson. In one or two short sentences, kindly say you are their English tutor and won\'t do that task itself: no answer, no worked method, no finished text, and don\'t teach the other subject. Offer one English-language option (e.g. the English words or a sentence frame they could use to do it themselves), or return to the lesson with one small task. Keep the whole reply short.',
  reteach_simpler: 'They are confused: change approach, use a smaller step and a concrete everyday example; do not repeat the same explanation.',
  l1_support: 'You may add a brief gloss or clarification in Arabic, then continue in the target language.',
  answer_with_reasoning: 'They asked for the answer: give it with the reason in one or two sentences, then one similar item for them to try.',
  fade_support: 'They are strong: answer directly at their level with precise terms; no beginner tables, basic definitions or step-by-step scaffolds unless they ask; use fewer hints and offer a harder variant or a nuance instead.',
  independent_practice: 'Offer a short independent task (e.g. write two sentences using the target form) rather than more explanation.',
};

// r1: variants of the hint move by why it was chosen.
const HINT_VARIANT: Record<string, string> = {
  answer_requested_before_attempt:
    'They asked for the answer before trying. Don\'t give the answer yet: give one hint matched to the task (a cue, a sentence starter or a contrast) and ask for one try. Say warmly that you\'ll show the answer after they try.',
  learner_does_not_know: 'They said they don\'t know. That\'s fine: give the first small step or a choice of two options, and ask them to pick or try. Don\'t grade or score it.',
  hint_requested: 'They asked for a hint: give one hint (one step, not the answer), then ask them to try.',
};

export function moveText(m: SelectedMove): string {
  if (m.id === 'scaffold_hint') {
    const r = m.reasons.find((x) => HINT_VARIANT[x]);
    if (r) return HINT_VARIANT[r];
  }
  if (m.id === 'clarify_goal') {
    const field = m.reasons.find((r) => r.startsWith('missing_'));
    if (field === 'missing_target_language') return 'Ask one short question: which language do they want to practise? Don\'t start teaching yet.';
    if (field === 'missing_lesson_or_goal')
      return 'Ask one short question to find out what they want to practise (a topic or a skill), offering at most three short options in a few words each. Don\'t start a task, give a model sentence or explain anything yet, and don\'t name any chapter or lesson from the course outline as theirs.';
  }
  if (m.id === 'reteach_simpler' && m.reasons.includes('repeated_misconception_strategy_shift')) {
    return 'They made the same mistake again after your feedback. Don\'t repeat your earlier explanation and don\'t give the corrected sentence. Change approach: a contrasting pair on a different example that differs only in the point they keep missing, or one smaller step, or one question that pinpoints the confusion. Then ask them to try their own sentence again.';
  }
  if (m.id === 'answer_with_reasoning' && m.reasons.includes('repeated_after_strategy_shift_model_then_transfer')) {
    return 'The same mistake survived a change of approach. Now show the correct form of their sentence with a one-line reason, then give one fresh similar item (a different sentence) for them to try.';
  }
  if (m.id === 'comprehensible_model' && m.reasons.includes('during_feedback')) {
    return 'Use short sentences and common words. Any model sentence must use a different example, never the corrected version of their own answer.';
  }
  if (m.id === 'corrective_feedback_retry' && m.reasons.includes('unprompted_learner_sentence')) {
    const record = m.reasons.includes('record_vs_current_check')
      ? ' Their school record suggests this point is usually secure, but judge this sentence on its own: if it has an error in the lesson target, don\'t assume either the record or the slip is the truth; point to the part to check and ask them to fix it themselves (one quick check), without giving the corrected sentence and without any mastery claims.'
      : '';
    return `They wrote their own sentence: treat it as an attempt and give feedback on it; don't start a lesson or explanation first.${record} ${MOVE_TEXT.corrective_feedback_retry}`;
  }
  if (m.id === 'corrective_feedback_retry' && m.reasons.includes('after_confirmed_success')) {
    return `${MOVE_TEXT.corrective_feedback_retry} Their previous answer on this task was correct: if this one is also correct, say so briefly (no mastery or percentage claims), don't give another item of the same kind, and move on to a harder or freer transfer task (e.g. two or three sentences of their own). If this one has an error, give one targeted check rather than assuming either way.`;
  }
  if (m.id === 'corrective_feedback_retry' && m.reasons.includes('recurrence_unknown')) {
    return `${MOVE_TEXT.corrective_feedback_retry} If this repeats the same mistake as their last answer, don't repeat your explanation or give the corrected sentence: change approach (a contrasting pair on a different example, or a smaller step) and ask them to try again.`;
  }
  if (m.id === 'corrective_feedback_retry' && m.reasons.includes('recurrence_unknown_after_shift')) {
    return `${MOVE_TEXT.corrective_feedback_retry} They already had a change of approach on this task: if it is still the same mistake, show the correct form with a one-line reason, then give one fresh similar item.`;
  }
  if (m.id === 'answer_with_reasoning' && m.reasons.some((r) => r.startsWith('answer_requested_after_'))) {
    return 'They have already tried: now give the correct answer with the reason in one or two sentences, then one similar item for them to try.';
  }
  return MOVE_TEXT[m.id];
}

// r1 length and register policy. Targets are per reply, in the tutor's own words
// (quoted learner text doesn't count). Age band comes only from the school's
// adult-learners setting; ENARA has no approved child/teen source, so other
// learners are 'age unknown' and get the conservative school-safe target.
export function cefrStep(level?: string): string | undefined {
  const m = CEFR.exec(level ?? '');
  return m ? m[1].toLowerCase().replace('-', '') : undefined;
}

// Target/max words per reply, by age band (rows) and CEFR step (columns).
// 'unknown' and 'adult' are unchanged since r1. 'child' and 'teen' are
// reachable only from a trusted source, which does not exist yet (BLOCKED):
// child is never longer than 'unknown'; teen sits between unknown and adult.
const LENGTH: Record<AgeBand, Record<string, [number, number]>> = {
  unknown: { prea1: [50, 75], a1: [55, 80], a2: [70, 100], b1: [90, 130], b2: [110, 160], c1: [130, 190], c2: [130, 190], none: [70, 100] },
  child: { prea1: [40, 60], a1: [45, 70], a2: [60, 90], b1: [80, 120], b2: [100, 150], c1: [110, 160], c2: [110, 160], none: [60, 90] },
  teen: { prea1: [55, 85], a1: [60, 90], a2: [80, 120], b1: [100, 150], b2: [120, 180], c1: [140, 200], c2: [140, 200], none: [80, 120] },
  adult: { prea1: [60, 100], a1: [70, 110], a2: [90, 140], b1: [120, 180], b2: [140, 210], c1: [160, 240], c2: [160, 240], none: [90, 140] },
};

export function lengthTarget(ageBand: Fact<AgeBand>, level?: string): LengthTarget {
  const age: AgeBand = ageBand.status === 'known' && ageBand.value ? ageBand.value : 'unknown';
  const step = cefrStep(level) ?? 'none';
  const [targetWords, maxWords] = LENGTH[age][step] ?? LENGTH[age].none;
  return { targetWords, maxWords, basis: `${age === 'unknown' ? 'age_unknown' : age}:${step}` };
}

// Register by age band: tone, contexts for examples, how much is asked at once
// and how much independence is expected. Independent of CEFR (see REGISTER for
// the level axis): the same objective and level target hold for every band.
const AGE_REGISTER: Record<AgeBand, string> = {
  child:
    'Register: a child - warm, simple and concrete; examples from family, school, games and animals; one instruction at a time; praise effort specifically; short guided tasks before independent ones; nothing adult or frightening.',
  teen:
    'Register: a teenager - friendly and direct, never childish; examples from school, friends, hobbies, sport and apps; up to two steps at a time; expect some independent work; specific, honest feedback.',
  adult: 'Register: adults - respectful and practical, everyday adult contexts; never childish.',
  unknown:
    'Register: the learner\'s age is not known - plain, friendly and respectful language that suits a school-age learner or an adult; no baby talk, no slang, no academic grammar terms unless they use them.',
};

const REGISTER: Record<string, string> = {
  prea1: 'Very short, concrete sentences; high-frequency words; one clear step; give a sentence frame or model.',
  a1: 'Very short, concrete sentences; high-frequency words; one clear step; give a sentence frame or model.',
  a2: 'Simple connected sentences in familiar contexts; short explanations; guided variation.',
  b1: 'Connected explanations are fine; invite them to elaborate or self-correct.',
};

const list = (label: string, items?: string[]) => (items?.length ? [`  ${label}: ${items.join('; ')}`] : []);
const factLine = (label: string, f: Fact<string>) =>
  `- ${label}: ${f.value ?? '(not known)'} [${f.status}${f.status === 'known' ? '' : `; source: ${f.source}`}]`;

export function renderLanguageContextPrompt(ctx: Omit<LanguageTeachingContext, 'prompt'>): string {
  const { learner: l, lesson } = ctx;
  const lines = [
    `<language_teaching_context version="${LANGUAGE_CONTEXT_VERSION}">`,
    'Language course context (from the school\'s records; use it, don\'t recite it). Labels: known = configured by the school; inferred = an estimate; unknown = not available.',
    factLine('Target language', l.targetLanguage),
    factLine('Learner level', l.proficiency) + ' - an estimate, not a test result: never tell them their level; calibrate from their actual replies.',
    factLine('Learner\'s own language', l.supportLanguage),
    ...(l.ageBand.status === 'known' && l.ageBand.value !== 'unknown' ? [`- Learner age band: ${l.ageBand.value} [known; source: ${l.ageBand.source}].`] : []),
    ...(l.objectiveStatus ? [factLine('Objective status (assessed evidence)', l.objectiveStatus)] : []),
  ];
  if (lesson.status === 'structured' && lesson.spec) {
    lines.push(
      `Current lesson (from the course): "${lesson.title ?? ''}"`,
      ...list('Objectives', lesson.spec.objectives),
      ...list('Success criteria', lesson.spec.successCriteria),
      ...list('Target vocabulary', lesson.spec.vocabulary),
      ...list('Target grammar', lesson.spec.grammar),
      ...list('Language functions', lesson.spec.functions),
      ...list('Skill focus', lesson.spec.skills),
      ...list('Course examples', lesson.spec.examples),
      'Stay within this lesson\'s objectives unless they ask about something else. Your own examples are yours; don\'t present them as course content.',
    );
  } else if (lesson.status === 'unstructured') {
    lines.push(
      `Current lesson: "${lesson.title ?? ''}". The course gives no structured objectives or word lists for it; don't claim it covered specific items. Use the lesson description in the curriculum.`,
    );
  } else {
    lines.push('No lesson is selected for this session. The course outline may list chapter titles: none of them is this learner\'s current or next lesson, so don\'t name one as theirs or invent lesson content.');
    if (ctx.signals.learnerGoal) lines.push(`What the learner said they want to practise (their words, not a course lesson): "${ctx.signals.learnerGoal.replace(/["<>]/g, '')}". Work on that; don't ask again.`);
  }
  const len = ctx.length ?? lengthTarget(l.ageBand, l.proficiency.value);
  const band: AgeBand = l.ageBand.status === 'known' && l.ageBand.value ? l.ageBand.value : 'unknown';
  const step = cefrStep(l.proficiency.value);
  lines.push(
    'Teaching moves for this reply:',
    ...ctx.moves.map((m) => `- ${moveText(m)}`),
    `Length and style (policy ${LANGUAGE_POLICY_REVISION}): about ${len.targetWords} words, never more than ${len.maxWords} (count only your own words). One step per reply: one idea, one instruction, one task. Plain short lines; no tables, no headings, at most one short list. If more is needed, give the first part and offer to continue.`,
    ...(step && REGISTER[step] ? [`Level: ${REGISTER[step]}`] : []),
    AGE_REGISTER[band],
    'Always: respond to what they actually wrote; feedback is about the work, never the person; keep it short and encouraging. This is a text chat (reading and writing): don\'t present it as listening or speaking practice.',
    '</language_teaching_context>',
  );
  return lines.join('\n');
}

export function nextStepFor(moves: SelectedMove[]): string | undefined {
  const ids = new Set(moves.map((m) => m.id));
  if (ids.has('redirect_to_lesson')) return 'return_to_lesson';
  if (ids.has('general_practice')) return 'general_practice_task';
  if (ids.has('reteach_simpler')) return 'reteach_with_simpler_step';
  if (ids.has('scaffold_hint') && moves.some((m) => m.reasons.includes('answer_requested_before_attempt'))) return 'learner_attempt_after_hint';
  if (ids.has('corrective_feedback_retry')) return 'learner_retry';
  if (ids.has('independent_practice')) return 'independent_practice';
  if (ids.has('comprehension_check')) return 'answer_check_question';
  if (ids.has('clarify_goal')) return 'state_goal';
  return undefined;
}

export function turnEvidence(ctx: LanguageTeachingContext, objectiveId?: string): LanguageTurnEvidence {
  return {
    version: ctx.version,
    lessonId: ctx.lesson.lessonId,
    ...(objectiveId ? { objectiveId } : {}),
    skill: 'written_interaction',
    moves: ctx.moves.map((m) => m.id),
    reasonCodes: [...new Set(ctx.moves.flatMap((m) => m.reasons))],
    supportRequested: ctx.signals.helpRequest || ctx.signals.answerRequest || ctx.signals.confusionCount > 0,
    confusionSignals: ctx.signals.confusionCount,
    answeringCheck: ctx.signals.answeringCheck,
    proficiency: { status: ctx.learner.proficiency.status, value: ctx.learner.proficiency.value, source: ctx.learner.proficiency.source },
    nextStep: nextStepFor(ctx.moves),
    provenance: 'deterministic_turn_signals',
    confidence: 'low',
    masteryClaim: false,
    policyRevision: LANGUAGE_POLICY_REVISION,
    ...(ctx.signals.pendingTask ? { pendingTask: ctx.signals.pendingTask } : {}),
    ...(ctx.signals.learnerResponse ? { learnerResponse: ctx.signals.learnerResponse } : {}),
    ...(ctx.signals.attemptsOnTask !== undefined ? { attemptsOnTask: ctx.signals.attemptsOnTask } : {}),
    ...(ctx.signals.offTopic ? { offTopic: ctx.signals.offTopic } : {}),
    ...(ctx.length ? { lengthTarget: ctx.length } : {}),
    ...(ctx.signals.errorRecurrence ? { errorRecurrence: ctx.signals.errorRecurrence } : {}),
    ...(() => {
      const missing = missingContext({ targetLanguage: ctx.learner.targetLanguage.value, lessonStatus: ctx.lesson.status, signals: ctx.signals });
      return missing.length ? { missingContext: missing } : {};
    })(),
    // Observability (non-identifying category only): the age band that reached
    // the engine and where it came from.
    ageBand: ctx.learner.ageBand.status === 'known' ? ctx.learner.ageBand.value : 'unknown',
    ageBandStatus: ctx.learner.ageBand.status,
    ageBandSource: ctx.learner.ageBand.source,
  };
}

// ---------------------------------------------------------------------------
// Assembly (server-side, tenant-scoped). Null when not a language course or on
// any error, so the tutor carries on exactly as before.

export async function buildLanguageTeachingContext(params: {
  institutionId?: string;
  curriculumId?: string;
  lessonId?: string;
  grade?: string;
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  hintsOnly?: boolean;
  masteryStatus?: string;
}): Promise<LanguageTeachingContext | null> {
  try {
    if (!params.curriculumId) return null;
    const curriculum = await Curriculum.findOne({ id: params.curriculumId, ...(params.institutionId ? { institutionId: params.institutionId } : {}) })
      .select('type level languages courseName name chapters')
      .lean();
    if (!curriculum || !isLanguageCourse(curriculum.type)) return null;
    const institution = params.institutionId ? await Institution.findOne({ id: params.institutionId }).select('learningSettings').lean() : null;
    const learnerMessages = [...params.history.filter((h) => h.role === 'user').map((h) => h.content), params.message];
    const learner = deriveLearnerContext({
      courseLevel: curriculum.level,
      courseLanguages: curriculum.languages,
      adultSchool: false,
      // r3: tenant-scoped server read (institutionId from the owner-checked session).
      trustedAgeBand: resolveTrustedAgeBand((institution as { learningSettings?: unknown } | null)?.learningSettings),
      grade: params.grade,
      learnerMessages,
      objectiveStatus: params.masteryStatus,
    });
    const chapter = (curriculum.chapters ?? []).find((c) => c.id === params.lessonId);
    const lesson = deriveLessonContext(chapter as never, curriculum.courseName || curriculum.name);
    const signals = detectTurnSignals(params.message, params.history, lesson.status === 'none' ? undefined : { title: lesson.title, spec: lesson.spec });
    const moves = selectLanguageMoves({
      band: learner.proficiency.band,
      targetLanguage: learner.targetLanguage.value,
      lessonStatus: lesson.status,
      signals,
      hintsOnly: params.hintsOnly,
      masteryStatus: params.masteryStatus,
    });
    const base0 = lengthTarget(learner.ageBand, learner.proficiency.value);
    // r2: a clarification-only turn is one short question, so a tighter target.
    const clarifyOnly = moves.some((m) => m.id === 'clarify_goal') && !moves.some((m) => ['short_explanation', 'comprehension_check', 'redirect_to_lesson'].includes(m.id));
    const length = clarifyOnly ? { targetWords: Math.min(base0.targetWords, 40), maxWords: Math.min(base0.maxWords, 60), basis: `${base0.basis}:clarify` } : base0;
    const base = { version: LANGUAGE_CONTEXT_VERSION, learner, lesson, signals, moves, length } as const;
    return { ...base, prompt: renderLanguageContextPrompt(base) };
  } catch (error) {
    logger.warn('language_context_failed', { error: serializeError(error) });
    return null;
  }
}
