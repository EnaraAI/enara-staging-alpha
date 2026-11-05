import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEcho, isRepeatUtterance, REPEAT_WINDOW_MS } from './voiceText.ts';

// Live calls (2 Nov): each sentence reached the tutor twice while the
// transcription session was being replaced. One answer per sentence.
test('the same sentence reported twice within the window is a repeat', () => {
  const recent = [{ text: 'What is the job of a pilot?', at: 1000 }];
  assert.equal(isRepeatUtterance('what is the job of a pilot', recent, 1800), true);
  assert.equal(isRepeatUtterance('What is the job of a pilot? ', recent, 1000 + REPEAT_WINDOW_MS), true);
});
test('one transcript containing the other counts as the same sentence', () => {
  const recent = [{ text: 'She is a doctor', at: 0 }];
  assert.equal(isRepeatUtterance('Yes she is a doctor', recent, 500), true);
});
test('a new sentence, or the same one said again later, is answered', () => {
  const recent = [{ text: 'She is a doctor', at: 0 }];
  assert.equal(isRepeatUtterance('He is an engineer', recent, 500), false);
  assert.equal(isRepeatUtterance('She is a doctor', recent, REPEAT_WINDOW_MS + 1), false);
  assert.equal(isRepeatUtterance('Yes', [{ text: 'Yes', at: 0 }], 9000), false);
});
test('short answers are compared whole, not as parts of longer ones', () => {
  assert.equal(isRepeatUtterance('No', [{ text: 'No, I am a teacher', at: 0 }], 100), false);
});
test('echo of the avatar is still recognised', () => {
  assert.equal(isEcho('a pilot flies airplanes every day', 'Yes, a pilot is a job. A pilot flies airplanes every day.'), true);
  assert.equal(isEcho('I want to be a pilot', 'What job do you want?'), false);
});

// Live calls 3-4 Nov: unclear Arabic speech came back as Portuguese and Russian.
import { isOffLanguage, notCaughtLine } from './voiceText.ts';
test('speech labelled or written as another language is not caught', () => {
  assert.equal(isOffLanguage('Até logo.', 'por'), true);
  assert.equal(isOffLanguage('М-м-м, в каком бассейне? Да нету кресла, как в картинке.', 'rus'), true);
  assert.equal(isOffLanguage('М-м-м, в каком бассейне?', null), true); // Cyrillic even without a label
  assert.equal(isOffLanguage('嗯。', 'zho'), true);
});
test('English, Arabic and a mix of both are kept', () => {
  assert.equal(isOffLanguage('I want to be a doctor.', 'eng'), false);
  assert.equal(isOffLanguage('أنا عايز أتعلم Good morning', 'ara'), false);
  assert.equal(isOffLanguage('Speak to me in Arabic, please', 'en'), false);
  assert.equal(isOffLanguage('Hello', undefined), false);
});
test('the ask-again line follows the call language', () => {
  assert.match(notCaughtLine('english'), /didn't catch/);
  assert.match(notCaughtLine('arabic'), /[؀-ۿ]/);
});
