// Shared fixtures for the ESL5 switch tests (not a test file itself).
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, ruleFirstDecision, turnEvidence, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import type { HistoryTurn } from '../src/services/languageLearningState';

export const SPEC: LanguageSpec = { objectives: ['Articles a/an'], successCriteria: ['Uses a before a consonant sound', 'Uses an before a vowel sound'], items: [
  { id: 'a1', prompt: 'Complete: I saw ___ apple.', acceptedAnswers: ['an', 'I saw an apple', 'I saw an apple.'], targetForms: ['an'], criteria: [2] },
  { id: 'a2', prompt: 'Complete: He is ___ doctor.', acceptedAnswers: ['a', 'He is a doctor', 'He is a doctor.'], targetForms: ['a'], criteria: [1] },
  { id: 'a3', prompt: 'Complete: They ___ (be) happy.', acceptedAnswers: ['are'], targetForms: ['are'], criteria: [1] }] };
export const LESSON = { title: 'Articles', spec: SPEC };
export const li = (id: string) => ({ id: `lesson:${id}`, source: 'lesson' as const, lessonItemId: id });
export const u = (content: string): HistoryTurn => ({ role: 'user', content });
export const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
export const open = (id: string, extra: object = {}) => ({ assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: id }, activeItem: li(id), ...extra });
export const wrong = (id: string, extra: object = {}) => ({ assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li(id), hintLevel: 1, ...extra });
export const noEval = (id: string, extra: object = {}) => ({ assessment: { verdict: 'NOT_EVALUATED', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li(id), hintLevel: 1, ...extra });
export const right = (id: string, c: number, nextId?: string, extra: object = {}) => ({ assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [c], next: 'NEW_ITEM', source: 'tutor_assessment', ...(nextId ? { item: nextId } : {}) }, activeItem: nextId ? li(nextId) : { id: 'msg:x', source: 'tutor' }, ...extra });

export function withEnv<T>(env: string, f: () => T): T {
  const saved = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = env;
  try { return f(); } finally { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; }
}

/** Builds the language context the way buildLanguageTeachingContext does, without the database. */
export function build(msg: string, hist: HistoryTurn[], o: { level?: string; masteryStatus?: string; history?: string[] } = {}): LanguageTeachingContext {
  const signals = detectTurnSignals(msg, hist, LESSON);
  const band = levelBand(o.level ?? 'A1');
  const moves = selectLanguageMoves({ band, targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: o.masteryStatus });
  const learner = deriveLearnerContext({ courseLevel: o.level ?? 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [msg], objectiveStatus: o.masteryStatus });
  const research = researchSignals(hist, signals, SPEC);
  const { explicit, ruleFirst } = ruleFirstDecision({ band, masteryStatus: o.masteryStatus, history: hist, signals, spec: SPEC, moves });
  const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, research, ...(o.history?.length ? { history: o.history } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}) } as Omit<LanguageTeachingContext, 'prompt'>;
  return { ...ctx, prompt: renderLanguageContextPrompt(ctx) } as LanguageTeachingContext;
}
export const evidence = (c: LanguageTeachingContext) => turnEvidence(c, 'o');
