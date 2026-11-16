import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeQuiz, quizFingerprint, quizProblems } from './ChapterQuizEditor.tsx';

test('a quiz is ready to save only with a question, filled options and a right answer', () => {
  assert.deepEqual(quizProblems([{ text: 'Q?', options: ['a', 'b'], correctAnswer: 1 }]), []);
  const p = quizProblems([{ text: ' ', options: ['a', ''], correctAnswer: -1 }]);
  assert.equal(p.length, 3);
  assert.match(p.join(' '), /write the question/);
  assert.match(p.join(' '), /fill in every option/);
  assert.match(p.join(' '), /mark the right answer/);
  assert.match(quizProblems(Array.from({ length: 11 }, () => ({ text: 'Q', options: ['a', 'b'], correctAnswer: 0 })))[0], /at most 10/);
});

test('changes are spotted ignoring ids and spaces; saving trims text', () => {
  const saved = [{ id: 'q1', text: 'Q?', options: ['a', 'b'], correctAnswer: 0, explanation: '' }];
  assert.equal(quizFingerprint(saved), quizFingerprint([{ text: ' Q? ', options: ['a ', 'b'], correctAnswer: 0 }]));
  assert.notEqual(quizFingerprint(saved), quizFingerprint([{ text: 'Q?', options: ['a', 'b'], correctAnswer: 1 }]));
  assert.equal(quizFingerprint(undefined), quizFingerprint([]));
  assert.deepEqual(normalizeQuiz([{ text: ' Q ', options: [' a', 'b '], correctAnswer: 1, explanation: ' e ' }]), [{ text: 'Q', options: ['a', 'b'], correctAnswer: 1, explanation: 'e' }]);
});
