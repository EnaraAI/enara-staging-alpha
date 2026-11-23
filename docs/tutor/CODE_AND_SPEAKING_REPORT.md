# Code grader and speaking: what was done and what it changes

_23 Nov 2026. lms-test only; test.enara.app untouched. Your decisions this morning: "Run the code grader here" (in a sandbox inside lms-test) and "yes to speaking"._

## In three lines
1. **Code questions are graded automatically.** Learners' JavaScript runs in a locked sandbox inside lms-test, against tests the teacher writes. It needs no model and has no cost.
2. **Speaking exams can use the new language grader.** It knows it is reading a speech transcript, never marks spelling or punctuation, and never scores pronunciation.
3. **Both passed the full E2E suite and are live on lms-test:** code grader ([#98](https://github.com/EnaraAI/enara-staging-alpha/pull/98)) and speaking ([#99](https://github.com/EnaraAI/enara-staging-alpha/pull/99)).

---

## 1. Code grader ([#98](https://github.com/EnaraAI/enara-staging-alpha/pull/98))

### What was done
- **A sandbox inside ENARA.** Learners' JavaScript runs in QuickJS, a small JavaScript engine compiled to WebAssembly, inside our own server. There is no outside service.
- **Locked down:**
  - the code cannot reach files, the network, timers or the rest of the server;
  - limits: 16 MB of memory, 0.5 s per test, 2 s per answer, and at most 20,000 characters of code;
  - each answer gets a fresh sandbox, which is thrown away after any error.
- **New question type "code":**
  - the teacher writes the question, optional starter code, and tests (for example `add(2, 3)` should give `5`);
  - the tests are hidden from learners, who see only "Test 1, Test 2…".
- **Grading:**
  - one point per passing test;
  - the feedback names the failing tests and why ("test 2: too slow", "test 3: wrong result") without revealing them;
  - feedback is in Arabic or English, following the learner's screen language.
- **Learner screen:** a code box (left to right, fixed-width font) pre-filled with the starter code.
- **Switch:** `assessCode`, on for lms-test only.

### What it changes
| For | Effect |
|---|---|
| Teachers | They can set code questions and get them marked instantly and consistently, with no review needed. |
| Learners | They get their score and test-by-test feedback as soon as they submit. |
| Cost | Zero: no AI model and no outside service. About 6 ms per answer. |
| Reliability | It works even when DeepSeek or Anthropic is down, because no model is involved. |
| Server safety | An endless loop is stopped at 0.5 s per test. A crash (deep recursion, memory blow-up) breaks only that answer's sandbox, never the server. |
| Existing features | Unchanged. The only shared change: the "close to the pass mark" flag now applies only to model-graded answers. |

### Tested
- **Real sandbox, 7 unit tests, no mocks:**
  - right and wrong answers;
  - a missing function and a syntax error;
  - an endless loop, stopped quickly;
  - deep recursion contained, with the next answer still working;
  - no host access (`require`, `process`, `fetch`, timers all absent);
  - memory and size limits;
  - tests hidden from the learner.
- **E2E 26** (end to end, no model): a quiz with two code questions; the learner never sees the tests; an endless loop is stopped; released automatically at **2 of 4**.

### Limits and risks
- **JavaScript only.** Python needs an equally strict sandbox, so I'll add it only if one is found (a WebAssembly Python with no bridge to the host).
- **No authoring screen yet.** Teachers create code questions through the API or question JSON; there is no form in the Assessment Builder. That is a good next step.
- **Code style isn't marked.** Only correctness is scored by the tests. The plan's optional "readability" rubric (model-graded) is not built.
- **Server load:** a very large class submitting at once runs one sandbox per answer (about 6 ms each, roughly 16 MB of memory while running). That is fine at lms-test scale; watch it at production scale.

---

## 2. Speaking through the new grader ([#99](https://github.com/EnaraAI/enara-staging-alpha/pull/99))

### What was done
- **Pronunciation is still never scored.** There is no audio evidence, only the transcript, so the existing rule is kept.
- **A "spoken" question:** an English language short answer or essay marked `spoken`.
  - **Rubric:** the spelling and punctuation criterion is removed, so a spoken essay is worth 8 points and a spoken short answer 3.
  - **Grader instructions:**
    - the text is a speech-to-text transcript;
    - transcription noise (um, missing full stops, repeated words, words that sound alike) is not penalised;
    - pronunciation, accent and intonation are never judged.
  - **Error codes:** spelling and punctuation codes are dropped, so learners aren't sent to practise writing errors they never made.
- **Speaking exams** now accept these spoken questions as well as the old open-response questions, both in the assignment check and the teacher preview.
- **Safety:** the examiner's follow-up questions can never reveal the question's model answer.

### What it changes
| For | Effect |
|---|---|
| Learners | Speaking scores are no longer pulled down by transcription mistakes. Feedback is about what they said (grammar, vocabulary, completing the task, organisation), not how the text was typed. |
| Teachers | Speaking questions get the same grader as written work: two runs, confidence, flags to the teacher's queue, and a reason required to change a score. |
| Errors to work on | Speaking grammar and vocabulary errors now feed the learner's practice; spelling and punctuation do not. |
| Old speaking exams | Unchanged. Existing open-response speaking questions are graded exactly as before. |
| Cost | Same model calls as written answers: DeepSeek on lms-test, no fallback to Anthropic in tests. |

### Tested
- **Unit tests:**
  - the rubric drops spelling and punctuation (8 and 3 points);
  - the grader is told it is reading a transcript and never to judge pronunciation;
  - spelling and punctuation codes are dropped;
  - speaking exams accept spoken English questions and refuse unmarked or Arabic ones.
- **The full E2E suite** passed with the change.

### Limits and risks
- **English only.** The speech-to-text used by speaking exams is English, so Arabic speaking is refused for now.
- **No E2E that drives a whole speaking exam with spoken questions yet.** One could be added using the exam's typed fallback mode.
- **No authoring screen yet.** Teachers mark a question "spoken" in the question JSON; the Assessment Builder has no checkbox yet.
- **No benchmark yet.** The language benchmark covers written answers only. A small set of spoken transcripts with reference scores would confirm the 0.85 bar for speaking too.

---

## Suggested next steps
1. **Assessment Builder forms** for code questions (tests editor) and a "spoken" checkbox for language questions.
2. **A speaking benchmark:** 30 English speaking transcripts (weak, mid, strong) with reference scores.
3. **A speaking E2E** using the exam's typed fallback.
4. **Python code questions,** if a strict enough sandbox is found.
