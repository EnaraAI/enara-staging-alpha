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
export const LANGUAGE_POLICY_REVISION = 'ltc-v1-r1';

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
  ageBand: Fact<'adult' | 'school'>;
  // From the existing evidence model, passed through unchanged.
  objectiveStatus?: Fact<string>;
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
  | 'redirect_to_lesson';

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
  grade?: string;
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
  const ageBand: Fact<'adult' | 'school'> = input.adultSchool
    ? { status: 'known', value: 'adult', source: 'school_setting_adult_learners' }
    : /\d/.test(input.grade ?? '')
      ? { status: 'known', value: 'school', source: 'student_grade' }
      : { status: 'unknown', source: 'not_collected' };
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
  };
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

  if (s.offTopic !== 'unrelated' && (s.vague || (s.firstTurn && input.lessonStatus === 'none'))) add('clarify_goal', [s.vague ? 'vague_message' : 'no_lesson'], ['LTC-D13']);
  else if (s.firstTurn && input.lessonStatus === 'structured' && !s.helpRequest && !s.answerRequest && !s.exampleRequest && s.offTopic !== 'unrelated') add('activate_prior_knowledge', ['first_turn_with_lesson_spec'], ['LTC-D3']);

  // r1: an unrelated request (another subject's homework, a finished text for
  // them) is redirected, not done; no mini-lesson is stacked on top of it.
  const offTopic = s.offTopic === 'unrelated';
  if (offTopic) add('redirect_to_lesson', [input.lessonStatus === 'none' ? 'off_topic_no_lesson' : 'off_topic_request'], ['LTC-D14']);

  if (s.confusionCount >= 2) add('reteach_simpler', [`confusion_signals_${s.confusionCount}`], ['LTC-D7']);
  if (s.answeringCheck && !s.answerRequest) {
    const n = (s.attemptsOnTask ?? 0) + 1;
    add('corrective_feedback_retry', [
      `answer_to_${s.pendingTask ?? 'check'}`,
      novice ? 'level_novice_prompt_first' : 'level_strong_reformulation_ok',
      ...(n >= 2 ? ['attempt_2_plus_show_model_if_still_wrong'] : []),
    ], ['LTC-D4']);
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
  const supportOnly = hintFirst || s.dontKnow || s.hintRequest || s.repeatRequest || offTopic;
  if (s.helpRequest || exampleNoTask || (novice && !s.answeringCheck && !s.vague && !supportOnly)) add('short_explanation', [s.helpRequest ? 'help_requested' : exampleNoTask ? 'example_requested' : 'novice_level'], ['LTC-D3']);
  if (s.confusionCount === 1 || (input.hintsOnly && !s.answerRequest)) add('scaffold_hint', [s.confusionCount === 1 ? 'confusion_signal' : 'hints_only_policy'], ['LTC-D6']);
  if (novice) add('comprehensible_model', [band === 'unknown' ? 'level_unknown_start_simple' : 'level_beginner'], ['LTC-D2']);
  if (novice && s.writesInArabicScript && !/arabic/i.test(input.targetLanguage ?? '')) add('l1_support', ['learner_writes_arabic_script', 'novice_level'], ['LTC-D8']);
  if (strong && s.confusionCount === 0 && !offTopic) {
    add('fade_support', [band === 'advanced' ? 'level_advanced' : `mastery_${input.masteryStatus}`], ['LTC-D3']);
    if (!s.answeringCheck && !hintFirst) add('independent_practice', ['strong_and_not_confused'], ['LTC-D3']);
  }
  const explained = moves.some((m) => m.id === 'short_explanation' || m.id === 'reteach_simpler' || m.id === 'answer_with_reasoning');
  if (explained && !(strong && s.helpRequest)) add('comprehension_check', ['after_explanation'], ['LTC-D5']);
  return moves;
}

// ---------------------------------------------------------------------------
// Prompt (versioned; the only place these instructions live)

const MOVE_TEXT: Record<MoveId, string> = {
  clarify_goal: 'First find out what the learner wants to do today (one short question), unless their message already says.',
  activate_prior_knowledge: 'Start by briefly connecting to what they already know about this lesson\'s topic (one quick question or reminder).',
  comprehensible_model: 'Use short sentences and common words; introduce at most 2-3 new words or forms per reply, each with a short gloss; show a model sentence in a meaningful context.',
  short_explanation: 'Give a short, direct explanation with one example in context. Do not answer with only questions.',
  comprehension_check: 'End with one short, focused check (a question or a mini task) tied to the lesson objective.',
  corrective_feedback_retry:
    'They are answering your task: say specifically what is right and what is wrong in their answer (quote the part). Keep what is correct; if something is wrong, give one hint aimed only at the gap and ask them to try again before you show the correct form; for strong learners a brief correct reformulation is enough. Never call one correct answer mastery.',
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
  if (m.id === 'answer_with_reasoning' && m.reasons.some((r) => r.startsWith('answer_requested_after_'))) {
    return 'They have already tried: now give the correct answer with the reason in one or two sentences, then one similar item for them to try.';
  }
  if (m.id === 'corrective_feedback_retry' && m.reasons.includes('attempt_2_plus_show_model_if_still_wrong')) {
    return `${MOVE_TEXT.corrective_feedback_retry} They have tried before on this task: if it is still wrong, show the correct form with a one-line reason, then give one fresh similar item.`;
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

const LENGTH: Record<'adult' | 'unknown', Record<string, [number, number]>> = {
  unknown: { prea1: [50, 75], a1: [55, 80], a2: [70, 100], b1: [90, 130], b2: [110, 160], c1: [130, 190], c2: [130, 190], none: [70, 100] },
  adult: { prea1: [60, 100], a1: [70, 110], a2: [90, 140], b1: [120, 180], b2: [140, 210], c1: [160, 240], c2: [160, 240], none: [90, 140] },
};

export function lengthTarget(ageBand: Fact<'adult' | 'school'>, level?: string): LengthTarget {
  const age = ageBand.status === 'known' && ageBand.value === 'adult' ? 'adult' : 'unknown';
  const step = cefrStep(level) ?? 'none';
  const [targetWords, maxWords] = LENGTH[age][step] ?? LENGTH[age].none;
  return { targetWords, maxWords, basis: `${age === 'adult' ? 'adult' : 'age_unknown'}:${step}` };
}

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
    ...(l.ageBand.status === 'known' ? [`- Learners: ${l.ageBand.value === 'adult' ? 'adults' : 'school students'}.`] : []),
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
    lines.push('No current lesson is known: ask what they want to practise.');
  }
  const len = ctx.length ?? lengthTarget(l.ageBand, l.proficiency.value);
  const adult = len.basis.startsWith('adult');
  const step = cefrStep(l.proficiency.value);
  lines.push(
    'Teaching moves for this reply:',
    ...ctx.moves.map((m) => `- ${moveText(m)}`),
    `Length and style (policy ${LANGUAGE_POLICY_REVISION}): about ${len.targetWords} words, never more than ${len.maxWords} (count only your own words). One step per reply: one idea, one instruction, one task. Plain short lines; no tables, no headings, at most one short list. If more is needed, give the first part and offer to continue.`,
    ...(step && REGISTER[step] ? [`Level: ${REGISTER[step]}`] : []),
    adult
      ? 'Register: adults - respectful and practical, everyday adult contexts; never childish.'
      : 'Register: the learner\'s age is not known - plain, friendly and respectful language that suits a school-age learner or an adult; no baby talk, no slang, no academic grammar terms unless they use them.',
    'Always: respond to what they actually wrote; feedback is about the work, never the person; keep it short and encouraging. This is a text chat (reading and writing): don\'t present it as listening or speaking practice.',
    '</language_teaching_context>',
  );
  return lines.join('\n');
}

export function nextStepFor(moves: SelectedMove[]): string | undefined {
  const ids = new Set(moves.map((m) => m.id));
  if (ids.has('redirect_to_lesson')) return 'return_to_lesson';
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
      adultSchool: Boolean((institution as { learningSettings?: { adultLearners?: boolean } } | null)?.learningSettings?.adultLearners),
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
    const length = lengthTarget(learner.ageBand, learner.proficiency.value);
    const base = { version: LANGUAGE_CONTEXT_VERSION, learner, lesson, signals, moves, length } as const;
    return { ...base, prompt: renderLanguageContextPrompt(base) };
  } catch (error) {
    logger.warn('language_context_failed', { error: serializeError(error) });
    return null;
  }
}
