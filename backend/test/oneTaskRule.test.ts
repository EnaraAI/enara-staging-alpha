import { afterEach, describe, expect, it } from 'vitest';
import { hasTwoAsks, learnerAsks, enforceSingleAsk } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import fx from './fixtures/esl2TwoAskTurns.json';

// ESL stage 3, step 1: a reply sets exactly one task. The 117 ESL2 turns flagged by the old two-asks detector (48 of them A0+LE) fall into six causes:
// three detector false positives (F1-F3) and three real two-task replies (R1-R3). Each cause has a test; the last block replays every flagged ESL2 turn.
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });

describe('detector false positives (one task, now counted as one)', () => {
  it('F1: a feedback label "Correct:" is not a task', () => {
    expect(hasTwoAsks('Correct: "cries". Consonant + y changes to -ies.\nYou wrote "plays" and "watches".\nTell me the rule in your own words.')).toBe(false);
  });
  it('F2: a rule line or recap in the imperative ("Use am with I", "add -es after") is not a task', () => {
    expect(hasTwoAsks('Correct: "is".\nUse am with I, is with he, she or it, and are with you, we or they.\nTell me the rule in your own words.')).toBe(false);
    expect(hasTwoAsks('Right. After he, she or it, add -s; add -es after -sh, -ch, -s, -x or -o.\nTell me the rule in your own words.')).toBe(false);
  });
  it('F3: the closing ask with its own format note is one task', () => {
    expect(hasTwoAsks('Yes, "am" is right.\nNow tell me the rule in your own words. Write one short sentence: which word goes with I?')).toBe(false);
    expect(hasTwoAsks('Now tell me the rule in your own words, in one short sentence. Start like this: With "I", we use ...')).toBe(false);
    expect(learnerAsks('Now tell me the rule in your own words. Which word goes with I? Write one short sentence.')).toHaveLength(1);
  });
});

describe('real two-task replies are fixed by the levelExplicit guard', () => {
  const R1 = 'Not quite.\nRight: I have an apple.\nTell me the rule in your own words.\nExample: I have ___ orange.';
  const R2 = '"is" is the right word, but the task asks for the whole sentence. Where does it go?\nTell me the rule in your own words.';
  const R3 = 'Not this time. Say the next word out loud and listen to its first sound.\nA vowel sound takes an.\nTell me the rule in your own words.';
  it('R1/R2/R3 are detected as two asks', () => { for (const r of [R1, R2, R3]) expect(hasTwoAsks(r)).toBe(true); });
  it('enforceSingleAsk keeps the task, removes the closing ask, and leaves one ask', () => {
    for (const r of [R1, R2, R3]) { const o = enforceSingleAsk(r); expect(o.droppedClosing).toBe(true); expect(learnerAsks(o.text)).toHaveLength(1); expect(o.text).not.toMatch(/own words/i); }
  });
  it('a reply with one task is left exactly as it was', () => {
    const one = 'Correct: "is".\nUse am with I.\nTell me the rule in your own words.';
    expect(enforceSingleAsk(one)).toEqual({ text: one, droppedClosing: false });
  });
});

describe('applyReplyGuards: behind the levelExplicit switch', () => {
  const ctx = { lesson: { spec: { successCriteria: ['Uses an before a vowel sound'] } }, signals: {}, moves: [], research: undefined } as never;
  const R2 = '"is" is the right word. Where does it go?\nTell me the rule in your own words.';
  it('switch on: the closing ask is removed and deferred', () => {
    process.env.ENARA_ENGINE_V2 = 'levelExplicit'; const g = applyReplyGuards(ctx, R2, 'is');
    expect(hasTwoAsks(g.text)).toBe(false); expect(g.closingAsk).toBe('deferred');
  });
  it('switch off: the reply is unchanged', () => {
    delete process.env.ENARA_ENGINE_V2; const g = applyReplyGuards(ctx, R2, 'is');
    expect(g.text).toBe(R2); expect(g.closingAsk).toBeUndefined();
  });
});

describe('replay of every ESL2 turn flagged by the old detector', () => {
  const turns = fx as Array<{ session: string; arm: string; turn: number; reply: string }>;
  it('117 turns, 48 of them A0+LE', () => { expect(turns).toHaveLength(117); expect(turns.filter((t) => t.arm === 'LE')).toHaveLength(48); });
  it('after the guard, every flagged turn sets at most one task', () => {
    for (const t of turns) { const out = enforceSingleAsk(t.reply).text; expect(hasTwoAsks(out), `${t.session} turn ${t.turn}`).toBe(false); expect(learnerAsks(out).length, `${t.session} turn ${t.turn}`).toBeLessThanOrEqual(1); }
  });
  it('only the real two-task A0+LE turns (3 of 48) still count as two asks before the guard', () => {
    expect(turns.filter((t) => t.arm === 'LE' && hasTwoAsks(t.reply))).toHaveLength(3);
  });
});
