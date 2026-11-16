import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { logger, serializeError } from '../utils/logging';

// Language Teaching Context Engine (Phase 1, ltc-v1). For language courses only:
// a labelled learner and lesson context, deterministic per-turn teaching moves,
// a short versioned prompt block, and a minimal non-mastery record of the turn.
// Research basis: docs/teaching/phase-1-evidence-ledger.md (LTC-D1..D12).
// Design: docs/architecture/language-teaching-context-engine.md.

export const LANGUAGE_CONTEXT_VERSION = 'ltc-v1';

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

export interface TurnSignals {
  firstTurn: boolean;
  helpRequest: boolean;
  answerRequest: boolean;
  confusionCount: number;
  answeringCheck: boolean;
  writesInArabicScript: boolean;
  vague: boolean;
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
  | 'independent_practice';

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
  prompt: string;
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

const HELP = /\b(explain|teach me|can you (teach|explain|help)|what does .{1,40} mean|what is the meaning|meaning of|how do (i|you) say|translate|what's the difference|why (is it|do we|do you|does)|when (do|should) (we|i))\b|اشرح|اشرحلي|يعني (ايه|إيه)|معنى|ترجم|ازاي اقول|إزاي أقول/i;
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

export function detectTurnSignals(message: string, history: { role: 'user' | 'assistant'; content: string }[]): TurnSignals {
  const text = message.trim();
  const learner = [...history.filter((h) => h.role === 'user').map((h) => h.content), text].slice(-3);
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant')?.content.trim() ?? '';
  // The learner's first message (a tutor greeting before it doesn't count).
  const firstTurn = !history.some((h) => h.role === 'user');
  const asking = /[?؟]\s*$/.test(text) || REQUEST.test(text) || HELP.test(text) || ANSWER.test(text);
  return {
    firstTurn,
    helpRequest: HELP.test(text),
    answerRequest: ANSWER.test(text),
    confusionCount: learner.filter(isConfusion).length,
    // Only after the learner has spoken (the session greeting is not a check
    // question), and only when this message reads as an answer, not a request.
    answeringCheck: !firstTurn && endsWithCheck(lastAssistant) && !asking && !isConfusion(text),
    writesInArabicScript: usesArabicScript(text),
    vague: GREETING.test(text) || text.length < 3,
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

  if (s.vague || (s.firstTurn && input.lessonStatus === 'none')) add('clarify_goal', [s.vague ? 'vague_message' : 'no_lesson'], ['LTC-D13']);
  else if (s.firstTurn && input.lessonStatus === 'structured' && !s.helpRequest && !s.answerRequest) add('activate_prior_knowledge', ['first_turn_with_lesson_spec'], ['LTC-D3']);

  if (s.confusionCount >= 2) add('reteach_simpler', [`confusion_signals_${s.confusionCount}`], ['LTC-D7']);
  if (s.answeringCheck && !s.answerRequest) add('corrective_feedback_retry', ['answer_to_check_question', novice ? 'level_novice_prompt_first' : 'level_strong_reformulation_ok'], ['LTC-D4']);
  if (s.answerRequest) {
    if (input.hintsOnly) add('scaffold_hint', ['answer_requested_hints_only_policy'], ['LTC-D6']);
    else add('answer_with_reasoning', ['answer_requested'], ['LTC-D6']);
  }
  if (s.helpRequest || (novice && !s.answeringCheck && !s.vague)) add('short_explanation', [s.helpRequest ? 'help_requested' : 'novice_level'], ['LTC-D3']);
  if (s.confusionCount === 1 || (input.hintsOnly && !s.answerRequest)) add('scaffold_hint', [s.confusionCount === 1 ? 'confusion_signal' : 'hints_only_policy'], ['LTC-D6']);
  if (novice) add('comprehensible_model', [band === 'unknown' ? 'level_unknown_start_simple' : 'level_beginner'], ['LTC-D2']);
  if (novice && s.writesInArabicScript && !/arabic/i.test(input.targetLanguage ?? '')) add('l1_support', ['learner_writes_arabic_script', 'novice_level'], ['LTC-D8']);
  if (strong && s.confusionCount === 0) {
    add('fade_support', [band === 'advanced' ? 'level_advanced' : `mastery_${input.masteryStatus}`], ['LTC-D3']);
    if (!s.answeringCheck) add('independent_practice', ['strong_and_not_confused'], ['LTC-D3']);
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
    'They are answering your question: say specifically what is right and what is wrong in their answer (quote the part). If something is wrong, give one hint and ask them to try again before you show the correct form; for strong learners a brief correct reformulation is enough.',
  scaffold_hint: 'Give a hint matched to their last reply (one step), not the full answer.',
  reteach_simpler: 'They are confused: change approach, use a smaller step and a concrete everyday example; do not repeat the same explanation.',
  l1_support: 'You may add a brief gloss or clarification in Arabic, then continue in the target language.',
  answer_with_reasoning: 'They asked for the answer: give it with the reason in one or two sentences, then one similar item for them to try.',
  fade_support: 'They are strong: answer directly at their level with precise terms; no beginner tables, basic definitions or step-by-step scaffolds unless they ask; use fewer hints and offer a harder variant or a nuance instead.',
  independent_practice: 'Offer a short independent task (e.g. write two sentences using the target form) rather than more explanation.',
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
  lines.push(
    'Teaching moves for this reply:',
    ...ctx.moves.map((m) => `- ${MOVE_TEXT[m.id]}`),
    'Always: respond to what they actually wrote; feedback is about the work, never the person; keep it short and encouraging. This is a text chat (reading and writing): don\'t present it as listening or speaking practice.',
    '</language_teaching_context>',
  );
  return lines.join('\n');
}

export function nextStepFor(moves: SelectedMove[]): string | undefined {
  const ids = new Set(moves.map((m) => m.id));
  if (ids.has('reteach_simpler')) return 'reteach_with_simpler_step';
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
    const signals = detectTurnSignals(params.message, params.history);
    const moves = selectLanguageMoves({
      band: learner.proficiency.band,
      targetLanguage: learner.targetLanguage.value,
      lessonStatus: lesson.status,
      signals,
      hintsOnly: params.hintsOnly,
      masteryStatus: params.masteryStatus,
    });
    const base = { version: LANGUAGE_CONTEXT_VERSION, learner, lesson, signals, moves } as const;
    return { ...base, prompt: renderLanguageContextPrompt(base) };
  } catch (error) {
    logger.warn('language_context_failed', { error: serializeError(error) });
    return null;
  }
}
