import { describe, expect, it } from 'vitest';
import * as LS from '../src/services/languageLearningState';

// Fix 2: run-to-run instability came mostly from (A) a filled-in model sentence
// next to a gapped check (copyable), and (B) early hints on two-option items that
// point at the deciding word. Synthetic wording modelled on the r4.3 grader evidence.
const strip = (LS as unknown as { stripCopyReadyModels?: (r: string, learner?: string) => { text: string; removed: string[] } }).stripCopyReadyModels;

describe('fix 2A: a check is never answerable by copying a model next to it', () => {
  it('exists', () => expect(typeof strip).toBe('function'));
  it('removes the filled model of the same frame and keeps the check', () => {
    const r = 'Here is my example:\nThis is my uncle. He is a pilot.\n\nYour turn: write about your uncle.\nThis is my uncle. ___ is ___.';
    const o = strip!(r);
    expect(o.text).not.toContain('He is a pilot');
    expect(o.text).toContain('This is my uncle. ___ is ___.');
    expect(o.removed.length).toBeGreaterThan(0); // the model's two sentences
  });
  it('removes a filled model inside a sentence and keeps unrelated examples', () => {
    const r = 'My cousin usually **cooks** dinner on Fridays. My dog sleeps a lot.\nNow you: My cousin usually ___ (cook) dinner on Fridays.';
    const o = strip!(r);
    expect(o.text).not.toMatch(/\bcooks\b/);
    expect(o.text).toContain('My dog sleeps a lot.');
    expect(o.text).toContain('My cousin usually ___ (cook) dinner on Fridays.');
  });
  it('keeps the learner\'s own sentence quoted back and replies without a gap', () => {
    const q = 'You wrote: "This is my aunt. He is a nurse." Look again.\nThis is my aunt. ___ is a nurse.';
    expect(strip!(q, 'This is my aunt. He is a nurse.').text).toBe(q);
    const plain = 'This is my aunt. She is a nurse. Great work!';
    expect(strip!(plain).text).toBe(plain);
  });
  it('keeps frame descriptions and quotes of an earlier try; removes a whole model, not half', () => {
    const r = '- **This is my …** introduces the person.\nYour try was: **"You ever saw a camel?"**\nChoose: "___ you ever ___ (see) a camel?"';
    expect(strip!(r).text).toBe(r);
    const m = 'My example:\n*This is my grandmother. **She** is ninety.*\nComplete:\n*This is my ______. ___ is …*';
    const o = strip!(m);
    expect(o.text).not.toMatch(/grandmother|ninety/);
  });
  it('leaves no unbalanced emphasis behind', () => {
    const o = strip!('**This is my cousin, Ali. He is ten. He likes chess.**\nThis is my ___. ___ is ___.');
    expect(o.text).toContain('He likes chess.');
    expect(o.text).not.toMatch(/\*\*/);
  });
  it('does not treat a different frame as a model (few shared words)', () => {
    const r = 'I go to school by bus.\nNow: Tom ___ (play) football on Sundays.';
    expect(strip!(r).text).toBe(r);
  });
});

describe('fix 2B: two-option items get non-pointing early hints', () => {
  it('levels 1-3 on a two-option item ask the learner to re-read or explain, never point at the deciding word', () => {
    const h = (LS.hintInstruction as unknown as (l: number, o?: { binary?: boolean }) => string);
    for (const l of [1, 2, 3]) {
      const t = h(l, { binary: true });
      expect(t).toMatch(/two-option/i);
      expect(t).toMatch(/explain|why|whole sentence/i);
      expect(t).toMatch(/do not point to the word|never point/i);
    }
    expect(h(1)).not.toMatch(/two-option/i);
  });
});
