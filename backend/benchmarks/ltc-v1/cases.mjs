// ENARA Language Teaching Benchmark v1.0: case generator.
// All lessons, learner profiles and learner messages are ORIGINAL text written
// for this benchmark (no corpus rows, paraphrases or transformations).
// CEFR labels are PROVISIONAL, assigned by the author against published CEFR
// level descriptions (A1/A2/B1), pending review by qualified language educators.
// Usage: node cases.mjs <out.jsonl>
import fs from 'fs';
import crypto from 'crypto';

const COHORTS = ['child', 'teen', 'adult'];
const LEVELS = ['A1', 'A2', 'B1'];

// Grade stored for school-age synthetic learners (an age band, not a birthdate).
const GRADE = { child: 'Grade 3', teen: 'Grade 9', adult: '' };

// Lessons per level. Context words vary by cohort so examples can be age-appropriate.
const LESSONS = {
  A1: {
    title: 'Talking about my family',
    objective: 'Introduce family members using "This is my …" and "He is / She is …".',
    spec: {
      objectives: ['Introduce a family member with "This is my …"', 'Say one fact about them with "He is / She is …"'],
      successCriteria: ['Uses "This is my + family word" correctly', 'Chooses he/she correctly'],
      vocabulary: ['mother', 'father', 'brother', 'sister', 'grandmother', 'grandfather'],
      grammar: ['This is my …', 'He is … / She is …'],
      functions: ['introducing people'],
      skills: ['writing', 'reading'],
      examples: ['This is my sister. She is ten.', 'This is my father. He is a driver.'],
    },
    exercise: { prompt: 'Complete: "This is my brother. ___ is twelve."', answer: 'He is twelve', key: 'He' },
    nextItem: { prompt: 'Complete: "This is my grandmother. ___ is very kind."', answer: 'She is very kind', key: 'She' },
  },
  A2: {
    title: 'My daily routine',
    objective: 'Describe daily routines with the present simple, including he/she/it + -s and adverbs of frequency.',
    spec: {
      objectives: ['Describe a routine with the present simple', 'Use he/she/it + -s', 'Place adverbs of frequency before the main verb'],
      successCriteria: ['Adds -s/-es for he/she/it', 'Puts always/usually/sometimes/never before the main verb'],
      vocabulary: ['get up', 'have breakfast', 'go to school', 'go to work', 'usually', 'sometimes', 'never', 'always'],
      grammar: ['present simple (he/she/it + -s)', 'adverbs of frequency before the main verb'],
      functions: ['describing habits'],
      skills: ['writing', 'reading'],
      examples: ['My brother usually gets up at seven.', 'I never have coffee in the evening.'],
    },
    exercise: { prompt: 'Correct the verb: "She go to bed at ten."', answer: 'She goes to bed at ten', key: 'goes' },
    nextItem: { prompt: 'Correct the verb: "My dad watch TV after dinner."', answer: 'My dad watches TV after dinner', key: 'watches' },
  },
  B1: {
    title: 'Life experiences',
    objective: 'Talk about life experiences with the present perfect and contrast it with the past simple for finished times.',
    spec: {
      objectives: ['Ask and answer "Have you ever …?"', 'Use the past simple, not the present perfect, with a finished time (yesterday, last year)'],
      successCriteria: ['Forms have/has + past participle', 'Switches to past simple when a finished time is given'],
      vocabulary: ['ever', 'never', 'already', 'yet', 'been to', 'tried', 'met'],
      grammar: ['present perfect for experiences', 'past simple with finished time expressions'],
      functions: ['talking about experiences'],
      skills: ['writing', 'reading'],
      examples: ['Have you ever tried sushi? Yes, I have. I tried it last summer.', 'She has never been to the sea.'],
    },
    exercise: { prompt: 'Choose: "I ___ (visit) my aunt in Aswan last year."', answer: 'I visited my aunt in Aswan last year', key: 'visited' },
    nextItem: { prompt: 'Choose: "___ you ever ___ (see) a camel?"', answer: 'Have you ever seen a camel', key: 'seen' },
  },
};

// Cohort-flavoured situations (varied, not stereotyped: each cohort gets mixed interests).
const CTX = {
  child: { place: 'school', person: 'my teacher', hobby: 'drawing', thing: 'my bike' },
  teen: { place: 'the sports club', person: 'my best friend', hobby: 'coding', thing: 'my phone' },
  adult: { place: 'the office', person: 'my manager', hobby: 'cooking', thing: 'my car' },
};

// Case types. Each returns { turns, expected, checks, evidence? }.
// `turns` are scripted learner messages (synthetic; they do not react to the tutor's text).
const T = {
  T01_limited_vocab: (lv, c) => ({
    dims: ['A', 'C'],
    turns: [{ A1: 'how say ماما english? and baba?', A2: 'i want say my sister wake up early but i dont know word for every day', B1: 'I want to say I have travelled a lot but I dont know how to say the word for going to many countries' }[lv]],
    expected: 'Gives the needed word(s) directly and simply, with one short model sentence from the lesson pattern; for A1 keeps language very simple and may gloss in the learner\'s language; checks with one tiny production prompt.',
    unacceptable: 'Long abstract grammar explanation; many new words at once; refusing to give the word; assuming the learner knows more than they showed.',
    nextMove: 'model + tiny production prompt',
    movesAny: ['short_explanation', 'comprehensible_model', 'l1_support'],
  }),
  T02_word_in_context: (lv, c) => ({
    dims: ['A', 'B'],
    turns: [{ A1: 'In "This is my sister" — sister is the mother of me?', A2: 'Does "usually" mean the same as "always"?', B1: 'If I say "I have been to Luxor", does it mean I am in Luxor now?' }[lv]],
    expected: 'Corrects the misunderstanding precisely with a contrast example in context; checks understanding with a short task.',
    unacceptable: 'Confirms the wrong meaning; vague answer; unrelated digression.',
    nextMove: 'contrastive example + check',
    movesAny: ['short_explanation', 'comprehension_check'],
  }),
  T03_blocking_error: (lv, c) => ({
    dims: ['C', 'D'],
    turns: ['Can you give me one exercise from this lesson?', { A1: 'Is my brother mother.', A2: 'Yesterday she go school and every day she went to bed late.', B1: 'I have visited my aunt last year and I never have seen her since now yesterday.' }[lv]],
    expected: 'Identifies the error that blocks meaning, explains briefly with the lesson pattern, gives a hint and asks for a retry before giving the full answer.',
    unacceptable: 'Praises as correct; rewrites everything without letting the learner retry; lists every tiny error at once for a beginner.',
    nextMove: 'targeted feedback + retry',
    movesAny: ['corrective_feedback_retry'],
    exerciseFirst: true,
  }),
  T04_minor_error: (lv, c) => ({
    dims: ['C', 'D'],
    turns: ['Can you give me one exercise from this lesson?', { A1: 'he is twelve', A2: 'She go to bed at ten o clock — sorry, She goes to bed at ten', B1: 'I visited my aunt in aswan last year.' }[lv]],
    expected: 'Recognises the answer is essentially correct, confirms clearly, at most mentions the minor surface point (capital letter/apostrophe) lightly, and moves forward.',
    unacceptable: 'Treats it as wrong; heavy correction of trivial points; long re-explanation.',
    nextMove: 'confirm + light note + next step',
    movesAny: ['corrective_feedback_retry'],
    exerciseFirst: true,
  }),
  T05_partially_correct: (lv, c) => ({
    dims: ['D', 'E'],
    turns: ['Can you give me one exercise from this lesson?', { A1: 'This is my brother. She is twelve.', A2: 'She usually go to bed at ten.', B1: 'I have visited my aunt in Aswan last year.' }[lv]],
    expected: 'Says specifically what is right and what is wrong, gives a hint for the wrong part, and asks for a retry.',
    unacceptable: 'Marks fully right or fully wrong; gives the full corrected answer immediately without a chance to retry.',
    nextMove: 'partial credit + hint + retry',
    movesAny: ['corrective_feedback_retry'],
    exerciseFirst: true,
    evidence: { masteryStatus: 'developing' },
  }),
  T06_repeated_misconception: (lv, c) => ({
    dims: ['D', 'C'],
    turns: [
      { A1: 'Can you explain he and she?', A2: 'Can you explain when I add -s to the verb?', B1: 'Can you explain have been and went?' }[lv],
      { A1: 'This is my sister. He is nine.', A2: 'My brother get up at six.', B1: 'I have gone to Alexandria last summer.' }[lv],
      { A1: 'This is my mother. He is a nurse.', A2: 'My mother get up before me.', B1: 'I have been to Cairo two years ago.' }[lv],
    ],
    expected: 'After the same error repeats following an explanation, changes approach (simpler step, contrasting minimal pair, different example) instead of repeating the same explanation; keeps the learner trying.',
    unacceptable: 'Repeats the identical explanation; gives up; scolds; long lecture.',
    nextMove: 'change of approach + smaller step',
    movesAny: ['reteach_simpler', 'corrective_feedback_retry'],
    evidence: { masteryStatus: 'emerging', misconception: { A1: 'Uses "he" for female family members', A2: 'Omits -s with he/she/it', B1: 'Uses present perfect with finished past time expressions' }[lv] },
  }),
  T07_hint_then_fail: (lv, c) => ({
    dims: ['E', 'D'],
    turns: [
      'Can you give me one exercise from this lesson?',
      { A1: 'This is my brother. She is twelve.', A2: 'She goed to bed at ten.', B1: 'I have visited my aunt in Aswan last year.' }[lv],
      { A1: 'This is my brother. He is twelve.', A2: 'She goes to bed at ten.', B1: 'I visited my aunt in Aswan last year.' }[lv],
      { A1: 'OK. This is my grandmother. He is very kind.', A2: 'Next one: My dad watch TV after dinner.', B1: 'Next: You ever saw a camel?' }[lv],
    ],
    expected: 'Treats the hint-aided success as progress, not mastery; on the independent item, recognises the repeat error and gives targeted support plus another independent attempt; makes no mastery claim.',
    unacceptable: 'Declares mastery after the hinted success; ignores the independent error; gives the answer without an attempt.',
    nextMove: 'targeted support + another independent item',
    movesAny: ['corrective_feedback_retry', 'scaffold_hint'],
    exerciseFirst: true,
  }),
  T08_mastery_move_on: (lv, c) => ({
    dims: ['E', 'C'],
    turns: [
      'Can you give me one exercise from this lesson?',
      { A1: 'This is my brother. He is twelve.', A2: 'She goes to bed at ten.', B1: 'I visited my aunt in Aswan last year.' }[lv],
      { A1: 'This is my grandmother. She is very kind. This is my father. He is tall.', A2: 'My dad watches TV after dinner. I always do my homework before that.', B1: 'Have you ever seen a camel? I have seen one, but I saw it only once, in 2019.' }[lv],
    ],
    expected: 'Recognises consistent unassisted success, reduces support, and moves forward with a transfer or slightly harder task; does not claim full mastery or invent progress percentages.',
    unacceptable: 'Keeps re-explaining basics; claims "you have mastered" or gives a percentage; repeats the same easy exercise.',
    nextMove: 'transfer / harder task',
    movesAny: ['corrective_feedback_retry', 'fade_support', 'independent_practice'],
    exerciseFirst: true,
    evidence: { masteryStatus: 'developing' },
  }),
  T09_age_example: (lv, c) => ({
    dims: ['C', 'A'],
    turns: [{ A1: `Can you give me an example about ${c.person}?`, A2: `Can you show me the rule with an example about ${c.place}?`, B1: `Give me an example about ${c.hobby}, please.` }[lv]],
    expected: 'Gives an example in the lesson pattern that fits the learner\'s age band and the requested topic, at the right language level and length; checks with a short task.',
    unacceptable: 'Childish tone for adults or overly abstract/long for children; ignores the requested topic; off-level vocabulary.',
    nextMove: 'age-fitting model + short task',
    movesAny: ['short_explanation', 'comprehensible_model', 'comprehension_check'],
  }),
  T10_missing_context: (lv, c) => ({
    dims: ['A', 'B'],
    noLesson: true,
    turns: ['hi, help me with english'],
    expected: 'Asks one short question to find the learner\'s goal (and offers a few concrete options); does not invent the learner\'s level, history or a curriculum.',
    unacceptable: 'Launches a long lesson on an invented topic; claims to know the learner\'s level or past work.',
    nextMove: 'clarify goal',
    movesAny: ['clarify_goal'],
  }),
  T11_off_topic: (lv, c) => ({
    dims: ['B'],
    turns: [{ child: 'Can you do my maths homework? 25 + 37', teen: 'Write my history essay about the pyramids for me', adult: 'Can you write an email to my landlord about the broken heater?' }[c.cohort]],
    expected: 'Acknowledges the request is outside this lesson, does not do non-language work for the learner, offers brief help that stays educational or links back to the lesson, and redirects.',
    unacceptable: 'Completes the off-topic task in full; ignores the lesson; refuses rudely.',
    nextMove: 'boundary + redirect',
    movesAny: [],
  }),
  T12_contradictory_evidence: (lv, c) => ({
    dims: ['A', 'E'],
    turns: [{ A1: 'This is my sister. He is ten.', A2: 'My sister always get up at six.', B1: 'I have met my teacher yesterday.' }[lv]],
    expected: 'Treats the school record (proficient) as one piece of evidence: notices the current error, probes with a quick check, and does not assume mastery or say the learner "already knows" it.',
    unacceptable: 'Ignores the error because the record says proficient; claims mastery; lectures from scratch as if the learner knows nothing.',
    nextMove: 'probe with a quick check',
    movesAny: ['corrective_feedback_retry', 'comprehension_check', 'short_explanation', 'fade_support'],
    evidence: { masteryStatus: 'proficient' },
  }),
  T13_answer_request: (lv, c) => ({
    dims: ['D', 'C'],
    turns: ['Can you give me one exercise from this lesson?', 'just tell me the answer pls'],
    expected: 'Encourages an attempt with a targeted hint first (the learner has not tried yet); gives the answer only with reasoning if the learner still cannot, then a similar item.',
    unacceptable: 'Immediately gives the full answer with no attempt; refuses all help.',
    nextMove: 'hint first',
    movesAny: ['scaffold_hint', 'answer_with_reasoning'],
    exerciseFirst: true,
    noFullAnswer: true,
  }),
};
const TYPE_IDS = Object.keys(T);

// Allocation: 14 cases in each A1 cell (extra T01 limited-vocabulary case), 13 elsewhere = 120.
const WORD_LIMIT = { child: { A1: 90, A2: 120, B1: 150 }, teen: { A1: 140, A2: 170, B1: 200 }, adult: { A1: 160, A2: 200, B1: 240 } };

const cases = [];
for (const cohort of COHORTS) {
  for (const level of LEVELS) {
    const types = level === 'A1' ? [...TYPE_IDS, 'T01_limited_vocab'] : TYPE_IDS;
    types.forEach((type, i) => {
      const lesson = LESSONS[level];
      const c = { ...CTX[cohort], cohort };
      const def = T[type](level, c);
      const variant = types.slice(0, i).filter((t) => t === type).length;
      const turns = def.turns.map((x) => (typeof x === 'string' ? x : String(x)));
      const id = `LTB-${cohort[0].toUpperCase()}${level}-${type.slice(0, 3)}${variant ? `-v${variant + 1}` : ''}`;
      const t01b = type === 'T01_limited_vocab' && variant === 1
        ? { A1: { child: 'teacher I not know word for my mama sister', teen: 'whats the word for my fathers father', adult: 'my wife mother, english word?' }[cohort] }[level]
        : null;
      cases.push({
        id,
        benchmarkVersion: 'ltb-v1.0',
        cohort,
        cefr: level,
        cefrLabel: { value: level, status: 'provisional', basis: 'author-assigned against published CEFR level descriptions; not expert-validated' },
        caseType: type,
        dimensions: def.dims,
        learner: {
          ageBand: cohort,
          grade: GRADE[cohort] || null,
          adultSchool: cohort === 'adult',
          knownLanguages: null,
          goal: def.noLesson ? null : `Learn: ${lesson.objective}`,
          priorEvidence: def.evidence ?? null,
        },
        lesson: def.noLesson ? null : { title: lesson.title, objective: lesson.objective, spec: lesson.spec, exercise: lesson.exercise, nextItem: lesson.nextItem },
        skill: 'writing + reading (text interaction)',
        turns: t01b ? [t01b] : turns,
        expectedBehavior: def.expected,
        unacceptableBehavior: def.unacceptable,
        expectedNextMove: def.nextMove,
        structuredExpectations: {
          movesAny: def.movesAny,
          maxWords: WORD_LIMIT[cohort][level],
          noMasteryClaim: true,
          noFullAnswer: Boolean(def.noFullAnswer),
          answerKey: def.noFullAnswer ? lesson.exercise.answer : null,
          offTopic: type === 'T11_off_topic',
          clarifyGoal: type === 'T10_missing_context',
        },
        provenance: { source: 'original synthetic content written for ENARA LTB v1.0', author: 'Claude (AI) for ENARA; pending educator review', license: 'ENARA internal; no third-party text', createdAt: '2026-11-09' },
      });
    });
  }
}

const out = process.argv[2] || 'benchmark_cases.jsonl';
const text = cases.map((c) => JSON.stringify(c)).join('\n') + '\n';
fs.writeFileSync(out, text);
const cells = {};
for (const c of cases) cells[`${c.cohort}-${c.cefr}`] = (cells[`${c.cohort}-${c.cefr}`] ?? 0) + 1;
console.log(JSON.stringify({ cases: cases.length, turns: cases.reduce((n, c) => n + c.turns.length, 0), cells, sha256: crypto.createHash('sha256').update(text).digest('hex') }));
