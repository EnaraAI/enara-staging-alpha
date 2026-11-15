import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, renderLanguageContextParts, selectLanguageMoves, researchSignals, ruleFirstDecision, turnEvidence, finalizeLanguageTurn, guardedItems, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { diagnoseError, type HistoryTurn, type LessonItem } from '../src/services/languageLearningState';
import { applyTurn, summarizeProfile, summarizeProfileV2 } from '../src/services/learnerLanguageProfile';

// ESL5 parity: with the five ESL5 switches (liveError, releaseAfterTwo, reviewOpen, fadeKnown, ownSentence) off, the language engine's output must be
// byte-for-byte what it was before ESL5: prompts (both renderings), turn evidence, finalized turns, guarded items and replies, error diagnoses and
// learner-record updates/summaries, over a matrix that includes ENARA_ENGINE_V2='levelExplicit'. The hash was taken from the code at commit 927f4b4
// (before ESL5). If you change a prompt on purpose, update the hash and say why in the commit.
const BASELINE_SHA256 = 'dd94aa402487af4cbfade0069df605e1af5687ed9a533d630049522c2fa59241';
const SPEC: LanguageSpec = { objectives: ['Articles a/an'], successCriteria: ['Uses a before a consonant sound', 'Uses an before a vowel sound'], items: [
  { id: 'a1', prompt: 'Complete: I saw ___ apple.', acceptedAnswers: ['an'], targetForms: ['an'], criteria: [2] },
  { id: 'a2', prompt: 'Complete: He is ___ doctor.', acceptedAnswers: ['a'], targetForms: ['a'], criteria: [1] },
  { id: 'i1', prompt: 'My cousin ___ (go) to the gym on Fridays.', acceptedAnswers: ['goes'], targetForms: ['goes'], criteria: [1] }] };
const LESSON = { title: 'Articles', spec: SPEC };
const li = (id: string) => ({ id: `lesson:${id}`, source: 'lesson' as const, lessonItemId: id });
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = (id: string) => ({ assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: id }, activeItem: li(id) });
const wrong = (id: string) => ({ assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li(id), hintLevel: 1 });
const right = (id: string, c: number) => ({ assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [c], next: 'NEW_ITEM', source: 'tutor_assessment' }, activeItem: li(id) });
const H: Record<string, HistoryTurn[]> = {
  none: [],
  presented: [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))],
  wrong2: [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1')), u('a'), a('Look at the next sound.', wrong('a1')), u('a'), a('Think about vowels.', wrong('a1'))],
  wrongDk: [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1')), u("I don't know"), a('Look at the first sound of apple. Try again: I saw ___ apple.', open('a1')), u(''), a('Try: I saw ___ apple.', open('a1'))],
  known: [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1')), u('an'), a('Correct! Next: He is ___ doctor.', right('a1', 2)), u('a'), a('Correct! Now: My cousin ___ (go) to the gym on Fridays.', right('a2', 1))],
  long: [u('hi'), a('Hello! Ready?'), u('yes'), a('Complete: He is ___ doctor.', open('a2')), u('a'), a('Correct! Next: I saw ___ apple.', right('a2', 1)), u('an'), a('Correct! Write one sentence about your day.', right('a1', 2))],
};
const MSG = ['Give me an exercise', 'a', 'an', 'I saw apple', 'He is doctor', 'She teacher', "I don't know", 'why is it wrong?', 'hint please', 'Complete: I saw ___ apple.'];
const ENVS = ['', 'levelExplicit', 'levelExplicit,ruleFirst,shortRecap', 'all', 'closing,hints,clarity,wrongAnswer', 'all,closing,selfCheck,clarity,hints,ruleFirst,shortRecap,arbitration,levelExplicit,strandLog,keyMatch'];
const REPLIES = ['Recap. Tell me the rule in your own words.', 'Rule: use an before a vowel sound.\n\nNow: I saw ___ orange.', 'I saw an apple.', 'The answer is "an": apple starts with a vowel sound. Right: an apple. Wrong: a apple. Next: She has ___ umbrella.'];
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });

function esl5Matrix(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const env of ENVS) for (const lvl of ['A1', 'B1', '']) for (const ms of [undefined, 'emerging', 'proficient']) for (const [hk, hist] of Object.entries(H)) for (const msg of MSG) for (const pp of [undefined, 'direct_instruction']) {
    process.env.ENARA_ENGINE_V2 = env;
    const signals = detectTurnSignals(msg, hist, LESSON, undefined);
    const band = levelBand(lvl || undefined);
    const moves = selectLanguageMoves({ band, targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: ms });
    const learner = deriveLearnerContext({ courseLevel: lvl || undefined, courseLanguages: ['English'], adultSchool: false, learnerMessages: [msg], objectiveStatus: ms });
    const research = researchSignals(hist, signals, SPEC);
    const { explicit, ruleFirst } = ruleFirstDecision({ band, masteryStatus: ms, history: hist, signals, spec: SPEC, moves });
    const history = hist.length ? [] : ['Learner history across sessions (school records of earlier tutor turns; error types only): use it to choose examples and checks, and never tell them about this record.'];
    const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, research, ...(history.length ? { history } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(pp ? { planPrimary: pp } : {}) } as Omit<LanguageTeachingContext, 'prompt'>;
    const prompt = renderLanguageContextPrompt(ctx);
    const parts = renderLanguageContextParts(ctx);
    const lang = { ...ctx, prompt } as LanguageTeachingContext;
    const ev = turnEvidence(lang, 'o');
    const fin = REPLIES.map((r) => finalizeLanguageTurn(ctx, { reply: r, learnerText: msg, messageId: 'm1', parsed: null }));
    const g = REPLIES.map((r) => applyReplyGuards(lang, r, msg));
    out[[env, lvl, ms, hk, msg, pp].join('|')] = { prompt, parts, ev: JSON.stringify(ev), fin: JSON.stringify(fin), gi: guardedItems(lang).map((i) => i.id), g: g.map((x) => [x.text, x.removed, x.closingAsk ?? '']) };
  }
  const items = SPEC.items as LessonItem[];
  const sentences = ['I saw apple', 'He is doctor', 'She teacher', 'He very tall', 'He is a doctor', 'I saw an apple', 'She is a teacher', 'He is very tall', 'I saw apples', 'He likes music', 'She teaches English', 'I saw it', 'He very much likes tea', 'a', 'an', 'go', 'goes', 'goed'];
  const t0 = new Date('2026-01-01T00:00:00Z');
  for (const env of ENVS) {
    process.env.ENARA_ENGINE_V2 = env;
    for (const it of items) for (const s of sentences) out[`diag|${env}|${it.id}|${s}`] = diagnoseError(s, it);
    const e1 = applyTurn([], { errorCode: 'missing_third_person_s', now: t0 });
    const e2 = applyTurn(e1, { errorCode: 'missing_third_person_s', now: t0, independentSuccessOn: items[2] });
    out[`profile|${env}`] = JSON.stringify([e1, e2, summarizeProfile(e2, t0), summarizeProfileV2({ beliefs: [{ tag: 'a_before_every_noun', occurrences: 2, firstSeenAt: t0, lastSeenAt: t0 }], worked: [] }, { now: t0, opening: true })]);
  }
  return out;
}

describe('ESL5 parity with the five ESL5 switches off', () => {
  it('output is identical to the pre-ESL5 engine over the whole matrix', () => {
    const out = esl5Matrix();
    const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
    expect(sha).toBe(BASELINE_SHA256);
  }, 180000);
});
