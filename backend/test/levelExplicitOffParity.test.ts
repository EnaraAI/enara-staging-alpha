import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, rulesToIntroduce, turnEvidence, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { hintInstruction, type HistoryTurn } from '../src/services/languageLearningState';
import { engineV2 } from '../src/services/engineV2';
const SPEC: LanguageSpec = { objectives: ['Third person -s'], successCriteria: ['Adds -s or -es after he, she and it', 'Uses do/does in questions'], items: [
  { id: 'i1', prompt: 'My cousin ___ (go) to the gym on Fridays.', acceptedAnswers: ['goes'], targetForms: ['goes'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [2] }] };
const LESSON = { title: 'Routines', spec: SPEC };
const li = { id: 'lesson:i1', source: 'lesson' as const, lessonItemId: 'i1' };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i1' }, activeItem: li };
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 };
const H: Record<string, HistoryTurn[]> = {
  none: [],
  presented: [u('Give me an exercise'), a('My cousin ___ (go) to the gym on Fridays.', open)],
  wrong2: [u('Give me an exercise'), a('My cousin ___ (go) to the gym on Fridays.', open), u('go'), a('Look at the subject.', wrong), u('go'), a('Think about he/she.', wrong)],
  late: [u('Give me an exercise'), a('My cousin ___ (go) to the gym on Fridays.', open), u('go'), a('Look.', wrong), u('goed'), a('Look again.', wrong), u('gos'), a('Hmm.', wrong), u('go'), a('Think.', wrong)],
};
const MSG = ['Give me an exercise', 'go', 'why is it wrong?', 'hint please', 'I do not know'];
const ENVS = ['', 'all', 'all,closing,selfCheck,clarity,hints,ruleFirst,shortRecap,arbitration', 'arbitration,keyMatch,clarity,hints,ruleFirst', 'closing', 'shortRecap,ruleFirst,arbitration'];
// With every new switch off (levelExplicit, strandLog) the language engine's output must be byte-for-byte what it was before change A and H:
// prompts, turn evidence, guarded replies and hint texts over a fixed matrix of levels, objective statuses, histories, messages, plan methods and switch sets.
// The hash was taken from the code at commit c84ef86 (before levelExplicit). If you change a prompt on purpose, update the hash and say why in the commit.
const BASELINE_SHA256 = 'd8655c2d6c017b367cc7420e538890066c4463d6fae3e159975d2415b1401774';
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
describe('parity with switches off', () => {
it('output is identical to the pre-levelExplicit engine over the whole matrix', () => {
  const out: Record<string, unknown> = {};
  for (const env of ENVS) for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1', '']) for (const ms of [undefined, 'not_assessed', 'emerging', 'developing', 'proficient']) for (const [hk, hist] of Object.entries(H)) for (const msg of MSG) for (const pp of [undefined, 'direct_instruction', 'socratic_questioning']) {
    process.env.ENARA_ENGINE_V2 = env;
    const signals = detectTurnSignals(msg, hist, LESSON);
    const band = levelBand(lvl || undefined);
    const moves = selectLanguageMoves({ band, targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: ms });
    const learner = deriveLearnerContext({ courseLevel: lvl || undefined, courseLanguages: ['English'], adultSchool: false, learnerMessages: [msg] });
    const research = researchSignals(hist, signals, SPEC);
    const ruleFirst = engineV2('ruleFirst') ? rulesToIntroduce(hist, signals, SPEC) : undefined;
    const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, research, ...(ruleFirst ? { ruleFirst } : {}), ...(pp ? { planPrimary: pp } : {}) } as Omit<LanguageTeachingContext, 'prompt'>;
    const prompt = renderLanguageContextPrompt(ctx);
    const lang = { ...ctx, prompt } as LanguageTeachingContext;
    const ev = turnEvidence(lang, 'o');
    const g = ['Recap.', 'Rule: add -s.\n\nNow a new one. Write: She ___ (watch) TV.', 'My cousin goes to the gym on Fridays.'].map((r) => applyReplyGuards(lang, r, msg));
    out[[env, lvl, ms, hk, msg, pp].join('|')] = { prompt, ev: JSON.stringify(ev), g: g.map((x) => x.text), r: g.map((x) => x.removed) };
  }
  for (const env of ENVS) { process.env.ENARA_ENGINE_V2 = env; for (const l of [1, 2, 3, 4, 5, 6]) for (const o of [{}, { binary: true }, { beginner: true }, { kind: 'word' }]) out[`hint|${env}|${l}|${JSON.stringify(o)}`] = hintInstruction(l, o); }
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  
  expect(Object.keys(out).length).toBe(10944); expect(sha).toBe(BASELINE_SHA256);
}, 120000);
});
