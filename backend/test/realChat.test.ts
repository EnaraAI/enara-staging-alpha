import { afterEach, describe, expect, it } from 'vitest';
import { CHILD_CHAT_TOPICS, REAL_CHAT_FROM, REAL_CHAT_LINE, realChatStep } from '../src/services/languageTeachingContext';

// realChat (NEXT_PLAN item 3, owner go 21 Nov 2026): part of each session is a real conversation about the learner's life and interests,
// errors corrected inside the talk (recast), then back to the lesson. Children get a fixed safe topic list.
const u = (content = 'x') => ({ role: 'user', content });
const a = (lt?: object) => ({ role: 'assistant', content: 'y', languageTurn: lt });
const none = { answeringCheck: false } as const;
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('realChat', () => {
  it('starts only after REAL_CHAT_FROM tutor replies, and not in the middle of a wrong answer', () => {
    process.env.ENARA_ENGINE_V2 = 'realChat';
    const two = [u(), a(), u(), a(), u()];
    expect(realChatStep(two, none)).toBeUndefined();
    const three = [u(), a(), u(), a(), u(), a(), u()];
    expect(REAL_CHAT_FROM).toBe(3);
    expect(realChatStep(three, none)).toBe(1);
    expect(realChatStep(three, { answeringCheck: true, keyVerdict: 'INCORRECT' } as never)).toBeUndefined();
    expect(realChatStep(three, { answeringCheck: true, keyVerdict: 'CORRECT' } as never)).toBe(1);
  });

  it('reply 2 follows reply 1, then the chat is over for the session', () => {
    process.env.ENARA_ENGINE_V2 = 'realChat';
    const h1 = [u(), a(), u(), a(), u(), a(), u(), a({ realChat: 1 }), u('I like cats')];
    expect(realChatStep(h1, { answeringCheck: true, keyVerdict: 'INCORRECT' } as never)).toBe(2);
    const h2 = [...h1, a({ realChat: 2 }), u()];
    expect(realChatStep(h2, none)).toBeUndefined();
  });

  it('children get the fixed safe topic list; everyone gets the personal-details rule; English only', () => {
    const child = REAL_CHAT_LINE(1, true);
    for (const t of CHILD_CHAT_TOPICS) expect(child).toContain(t);
    expect(child).toMatch(/Never ask for personal details/);
    expect(child).toMatch(/No exercise in this reply/);
    expect(child).toMatch(/English only/);
    const adult = REAL_CHAT_LINE(1, false);
    expect(adult).toMatch(/their interests/);
    expect(adult).not.toContain('toys and games');
    const back = REAL_CHAT_LINE(2, false);
    expect(back).toMatch(/recast/);
    expect(back).toMatch(/at most one correction/);
    expect(back).toMatch(/present the next lesson exercise/);
  });

  it('switch off: never', () => {
    expect(realChatStep([u(), a(), u(), a(), u(), a(), u()], none)).toBeUndefined();
  });
});
