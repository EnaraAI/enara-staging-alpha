import { type ConditionAdapter, type Turn, lessonText, practiceList, studentReply, writeNote, transcriptText, wordCount } from './types';

// B: study notes only (no interaction). The same notes text the benchmark ships; no tutor.
export const conditionB: ConditionAdapter = { id: 'B', name: 'study notes', async teach(c) {
  const mat = `${c.outcome.studyNotes}\n\nPractice (no answers given):\n${practiceList(c.outcome)}`;
  const notes = await writeNote(c, `You have just read this study material (no tutor):\n${mat}`);
  return { condition: 'B', blockId: c.blockId, turns: [], materialShown: mat, exposureWords: wordCount(mat), tutorCalls: 0, notes, unavoidableDifferences: ['no interaction or feedback; learner reads material only'] };
} };

// F: no-teaching control. The learner gets no instruction; the same note-to-self step runs with an empty source so the measurement path is identical.
export const conditionF: ConditionAdapter = { id: 'F', name: 'no-teaching control', async teach(c) {
  return { condition: 'F', blockId: c.blockId, turns: [], materialShown: null, exposureWords: 0, tutorCalls: 0, notes: '', unavoidableDifferences: ['no exposure at all (by definition)'] };
} };

// D: scripted human-like tutor. Deterministic, no model call for the tutor: fixed explanation, hint ladder and feedback keyed to the practice items' accepted answers.
export const conditionD: ConditionAdapter = { id: 'D', name: 'scripted human-like tutor', async teach(c) {
  const sc = c.outcome.scriptedTutor; const items = c.outcome.lesson.spec.items; const turns: Turn[] = [];
  let tutorMsg = `${sc.explanation}\n\nLet's practise. ${items[0].prompt}`; let item = 0; let hint = 0;
  for (let t = 0; t < c.maxTurns; t += 1) {
    const learner = await studentReply(c, turns, t === 0);
    turns.push({ learner, tutor: tutorMsg });
    const ok = items[item].acceptedAnswers.some((a) => ` ${learner.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ')} `.includes(` ${a.toLowerCase()} `));
    if (ok) { item += 1; hint = 0; tutorMsg = item >= items.length ? sc.closing : `${sc.correctFeedback} Next: ${items[item].prompt}`; if (item >= items.length) { if (t + 1 < c.maxTurns) { turns.push({ learner: await studentReply(c, turns, false), tutor: tutorMsg }); } break; } }
    else { tutorMsg = `${sc.incorrectFeedback} ${sc.hints[Math.min(hint, sc.hints.length - 1)]}`; hint += 1; }
  }
  const notes = await writeNote(c, `You have just had this lesson with your tutor:\n${transcriptText(turns)}`);
  return { condition: 'D', blockId: c.blockId, turns, materialShown: null, exposureWords: turns.reduce((n, t) => n + wordCount(t.tutor ?? ''), 0), tutorCalls: 0, notes, unavoidableDifferences: ['tutor responses are scripted text, not generated; feedback is key-matching on practice items only'] };
} };

// C: generic AI tutor. Opus with a minimal tutoring prompt + the lesson spec; no ENARA pipeline.
export const conditionC: ConditionAdapter = { id: 'C', name: 'generic AI tutor', async teach(c) {
  const sys = `You are a friendly English tutor. Help the student learn the lesson below through conversation. Keep replies short and in simple English.\n\n${lessonText(c.outcome)}\n\nPractice exercises you may use:\n${practiceList(c.outcome)}${c.seedEvidence && c.hidden ? `\n\nStudent record from the school's system: earlier assessments show this skill is ${c.hidden.knowsAlready ? 'largely mastered' : 'still emerging (not yet secure)'}.${!c.hidden.knowsAlready && c.hidden.misconception ? ` A confirmed mistaken idea from earlier work: ${c.hidden.misconception}.` : ''} Use this record to choose how to teach.` : ''}`;
  const turns: Turn[] = [];
  for (let t = 0; t < c.maxTurns; t += 1) {
    const learner = await studentReply(c, turns, t === 0);
    const hist = [...turns.map((x) => `Student: ${x.learner}\nTutor: ${x.tutor}`), `Student: ${learner}`].join('\n\n');
    const reply = (await c.provider.chat({ model: 'claude-opus-5-5', system: sys, user: `${hist}\n\nWrite the tutor's next reply.`, maxTokens: 1500, effort: 'low' }, c.ctx('generic_tutor'))).text;
    turns.push({ learner, tutor: reply });
  }
  const notes = await writeNote(c, `You have just had this lesson with your tutor:\n${transcriptText(turns)}`);
  return { condition: 'C', blockId: c.blockId, turns, materialShown: null, exposureWords: turns.reduce((n, t) => n + wordCount(t.tutor ?? ''), 0), tutorCalls: turns.length, notes, unavoidableDifferences: ['generic tutor has no ENARA pipeline: no answer-key guards, hint ladder, diagnosis or learner profile'] };
} };
