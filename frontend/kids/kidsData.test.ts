import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as D from './kidsData.ts';

test('home: resume is the active lesson, due puts open work first, the week counts the last 7 days', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const tree = { id: 'c1', title: 'Numbers', subject: 'Mathematics', modules: [{ lessons: [
    { id: 'l1', title: 'Count', status: 'completed' }, { id: 'l2', title: 'Tens', status: 'active' }, { id: 'l3', title: 'More', status: 'locked' }] }] };
  const h = D.homeData({
    lang: 'en', now, tree,
    dashboard: { student: { name: 'Layla Hassan' }, recentActivity: [{ date: '2026-11-16T08:00:00Z' }, { date: '2026-11-15T08:00:00Z' }, { date: '2026-11-01T08:00:00Z' }] },
    assignments: [{ id: 'a1', title: 'Essay', canSubmit: true, status: 'not_started', dueAt: '2026-11-20' }, { id: 'a2', title: 'Done', canSubmit: false, status: 'released' }],
    assessments: [{ id: 'q1', title: 'Later quiz', status: 'upcoming', dueDate: '2026-11-25' }, { id: 'q2', title: 'Open quiz', status: 'active', dueDate: '2026-11-18', duration: 15, questionCount: 8 }],
    achievements: [{ id: 'x', title: 'First quiz', unlocked: true }, { id: 'y', title: '5 lessons', unlocked: false }],
    results: [{ id: 'r1', assessmentTitle: 'Shapes', date: '2026-11-12', score: 90 }],
    courses: [{ id: 'c1', title: 'Numbers', subject: 'Mathematics', completedLessons: 1, lessonsCount: 3 }],
  });
  assert.equal(h.name, 'Layla');
  assert.deepEqual({ lessonId: h.resume.lessonId, n: h.resume.n, of: h.resume.of }, { lessonId: 'l2', n: 2, of: 3 });
  assert.deepEqual(h.due.map((d: any) => d.id), ['q2', 'a1', 'q1']);
  assert.equal(h.due[2].open, false);
  assert.deepEqual(h.week, [0, 0, 0, 0, 0, 1, 1]);
  assert.equal(h.badges[1].locked, true);
  assert.equal(h.courses[0].band, 'sun');
});

test('quizzes answer choices by index; homework by option text', () => {
  const qs = [{ id: 'a', type: 'multiple-choice', options: ['x', 'y'] }, { id: 'b', type: 'short-answer' }, { id: 'c', type: 'true-false' }];
  assert.deepEqual(D.quizQuestions(qs)[0].choices, [{ id: '0', text: 'x' }, { id: '1', text: 'y' }]);
  assert.deepEqual(D.quizAnswers(qs, { a: '1', b: ' 6 ', c: '0' }), { a: 1, b: ' 6 ', c: 0 });
  assert.deepEqual(D.homeworkQuestions(qs)[0].choices, [{ id: 'x', text: 'x' }, { id: 'y', text: 'y' }]);
  assert.deepEqual(D.homeworkQuestions(qs)[2].choices, [{ id: 'True', text: 'True' }, { id: 'False', text: 'False' }]);
});

test('reviews send the index for choices and text for typed answers; a retired question is mastered', () => {
  const [mc, typed] = D.reviewQuestions([{ id: 'r', topic: 't', question: 'Q', options: ['a', 'b'] }, { id: 's', topic: 't', question: 'Q2' }]);
  assert.equal(D.reviewAnswer(mc, '1'), 1);
  assert.equal(D.reviewAnswer(typed, 'kitten'), 'kitten');
  assert.deepEqual(D.reviewResult({ correct: true, answer: 'b', explanation: 'e', nextInDays: null }), { correct: true, answerText: 'b', explanation: 'e', days: undefined, mastered: true });
});

test('skills use the kid levels and group like the standard page', () => {
  const s = D.skillList([
    { id: 'o1', title: 'Halves', masteryStatus: 'developing', isGap: true, weakPrerequisites: [{ id: 'o2', code: 'M.1' }] },
    { id: 'o2', title: 'Counting', masteryStatus: 'not_assessed', readyToLearn: true },
    { id: 'o3', title: 'Shapes', masteryStatus: 'weird' },
  ], 'en');
  assert.deepEqual(s.map(x => x.group), ['help', 'next', 'all']);
  assert.equal(s[0].learnFirst, 'Counting');
  assert.equal(s[2].level, 'not_assessed');
});

test('homework results show points and what to work on; unreleased results are not shown', () => {
  assert.equal(D.homeworkResult({ released: false }), null);
  const r = D.homeworkResult({ released: true, totalPoints: 8, maxPoints: 10, answers: [
    { questionText: 'Q1', studentAnswer: '3', points: 1, maxPoints: 1 },
    { questionText: 'Q2', studentAnswer: 'x', points: 0, maxPoints: 1, correctAnswer: 'y', improvements: ['Look again.'] }] })!;
  assert.equal(r.points, 8);
  assert.equal(r.items[0].right, true);
  assert.equal(r.items[1].correct, 'y');
  assert.equal(r.items[1].work, 'Look again.');
});

test('plan items map sources and keep done or dismissed items aside', () => {
  const p = D.planItems({ items: [{ key: 'k1', source: 'assignment', title: 'A', status: 'todo' }, { key: 'k2', source: 'recommendation', title: 'B', status: 'dismissed' }] });
  assert.deepEqual(p.items.map((x: any) => x.source), ['assignment', 'suggested']);
  assert.deepEqual(p.done, ['k2']);
});

test('lessons carry the uploaded video and the practice quiz (choices by index)', () => {
  const tree = { modules: [{ title: 'Counting', lessons: [
    { id: 'l1', title: 'Tens', order: 1, status: 'active', content: 'A\n\nB', materials: ['/uploads/instA~3f2a9c1e-1b2c-4d5e-8f90-123456789abc-worksheet.pdf?exp=1&sig=ab'], videoUrl: '/uploads/a~2-lesson.mp4?exp=1&sig=cd',
      quiz: { questions: [{ id: 'q1', text: 'After 30?', options: ['31', '40'], correctAnswer: 1, explanation: '+10' }] } },
    { id: 'l2', title: 'Next', order: 2, status: 'locked', content: '' }] }] };
  const v = D.lessonView(tree, 'l1')!;
  assert.equal(v.videoUrl, '/uploads/a~2-lesson.mp4?exp=1&sig=cd');
  assert.deepEqual(v.lesson.quiz, [{ id: 'q1', text: 'After 30?', choices: [{ id: '0', text: '31' }, { id: '1', text: '40' }], answer: '1', why: '+10' }]);
  assert.deepEqual(v.lesson.text, ['A', 'B']);
  assert.equal(v.lesson.files[0].name, 'worksheet.pdf');
  assert.equal(D.lessonView(tree, 'l2')!.lesson.quiz.length, 0);
});
