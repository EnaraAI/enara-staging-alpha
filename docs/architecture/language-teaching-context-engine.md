# Language Teaching Context Engine (Phase 1, `ltc-v1`)

Status: implemented in the working tree (not committed or deployed). The research basis for each decision is in `docs/teaching/phase-1-evidence-ledger.md`, as decision IDs LTC-D1 to LTC-D13.

## Purpose

This is an increment on top of the existing tutor pipeline, not a replacement. It applies only when the student's course is a **language course**, meaning `Curriculum.type` matches "language". Its jobs are to:

1. Assemble a typed learner and lesson context in which every fact is labelled `known`, `inferred`, `not_assessed` or `unknown`, with its source.
2. Choose this turn's teaching moves with deterministic, inspectable rules from the context and the learner's actual messages.
3. Give the tutor model a short, versioned instruction block built from 1 and 2.
4. Store a minimal record of the turn on the tutor's reply. The record is low-confidence evidence and is never used as mastery.

Non-language courses are unchanged, except for the privacy fix (LTC-D12), which applies to every course.

## Existing components it reuses

| Need | Existing component | How it is used |
|---|---|---|
| Course and lesson access | `studentCourseService.buildCourseTree` (checks enrolment) | Unchanged. A course the student isn't enrolled in throws, so no context is built for it |
| Objective-level plan (ped-v2, 23 methods) | `learningContext.buildTeachingContext` | Unchanged. When it returns a plan, the language block is added beside it. The plan's teaching method still wins conflicts |
| Curriculum grounding | `directTutorModel.describeCurriculum`, `curriculumRetrieval` | Unchanged. The lesson specification is added as curriculum facts |
| Learner snapshot | `learnerSnapshot.describeSnapshot` | Name removed from the model text (LTC-D12) |
| Metering, budgets, gateway | `aiGateway`, `aiBudget`, `UsageLedger` | Unchanged. No new model calls: the engine is rules plus prompt text |
| Reply metadata | `TutorMessage.meta.teaching` | New sibling field `meta.languageTurn` |

There is no second context engine and no second model call.

## Data flow (chat and stream tutor turns)

```
student message ─▶ POST /api/me/tutor/sessions/:id/messages (or /stream)
  prepareTutorTurn (tutor.controller)
    ├─ session = TutorSession{ id, studentId = req.user.studentId }   ← ownership check
    ├─ course  = buildCourseTree(studentId, courseId)                 ← enrolment check
    ├─ plan    = buildTeachingContext(...)                            ← unchanged
    └─ lang    = buildLanguageTeachingContext({ institutionId, curriculumId, lessonId, studentId,
                                                history, message, plan, tutorPolicy })
          ├─ Curriculum.findOne({ id, institutionId })                ← tenant-scoped read
          ├─ Institution learningSettings.adultLearners (age band)
          ├─ deriveLearnerContext(...)  → LanguageLearnerContext (labelled facts)
          ├─ deriveLessonContext(...)   → LanguageLessonContext (curriculum facts only)
          ├─ detectTurnSignals(message, history)                      ← deterministic
          └─ selectLanguageMoves(...)   → moves + reason codes + ledger IDs
  If lang applies, the turn uses the direct model (as a ped-v2 plan does),
  because the external orchestrator cannot take the context.
  buildTutorRequest: system += renderLanguageContextPrompt(lang)       ← versioned text
  finishTutorTurn:   reply.meta.languageTurn = turnEvidence(lang)       ← minimal, non-mastery
```

## Trust boundaries

- **Identity and scope come from the server only.** These come from the authenticated token:
  - `studentId` (`req.user.studentId`);
  - the tutor session (looked up by `{ id, studentId }`);
  - the course (enrolment checked by `buildCourseTree`);
  - the curriculum (read with `{ id: course.curriculumId, institutionId: instance.institutionId }`).

  A client-supplied `courseId` or `lessonId` is only a hint. An id the student isn't enrolled in throws, and no context is built.
- **What goes to the model provider.** Only instructional context:
  - the target language;
  - level estimates with their labels;
  - lesson objectives, vocabulary and grammar;
  - the moves.

  No name, email, student ID, class roster or institution ID. The engine has a unit test for this (`no direct identifiers`).
- **Teacher and Academic Manager routes are untouched.** The engine runs only on the student tutor routes.

## Schemas

### Labelled fact

```ts
type KnowledgeStatus = 'known' | 'inferred' | 'not_assessed' | 'unknown';
interface Fact<T> { status: KnowledgeStatus; value?: T; source: string; asOf?: string }
```

Rules, enforced in code and tests:

- `known` is used only for school-configured facts: the course's target language, and an adult-learners school setting.
- **Level bands** follow CEFR's broad groups: A1–A2 (and pre-A1) map to `beginner` (basic user), B1–B2 to `intermediate` (independent user), C1–C2 to `advanced` (proficient user). Words such as "beginner" or "intermediate" map the same way; anything else is `unknown`. The bands only steer how much support the tutor gives, and the course level stays labelled as an estimate.
- **Proficiency is never `known` in this phase.** ENARA has no validated placement result. The course level is `inferred` (source `course_level`). With no level, proficiency is `unknown` (LTC-D1).
- The learner's own language is `inferred` from Arabic script in the learner's messages, or else `unknown` (LTC-D8).
- Objective mastery from the existing evidence model is passed through with its existing status (`not_assessed`, `emerging` and so on). The engine never changes it.

### Lesson specification (new optional field on curriculum lessons)

`Curriculum.chapters[].languageSpec` is optional and absent on every existing curriculum, so no migration is needed:

```ts
{
  objectives?: string[];        // what the learner should be able to do
  successCriteria?: string[];
  vocabulary?: string[];        // target words/phrases
  grammar?: string[];           // target structures
  functions?: string[];         // language functions, e.g. "ordering food politely"
  skills?: ('listening'|'speaking'|'reading'|'writing'|'integrated')[];
  examples?: string[];          // curriculum-authored model sentences
}
```

Each list has a size and length cap. When a lesson has no `languageSpec`, the lesson context is `unstructured`: only the title and description are passed on, and the tutor is told not to claim the lesson covered specific items (LTC-D2, LTC-D11). The demo template's four lessons now carry a spec, as an original sample course authored by Enara.

### Turn signals (deterministic, English and Arabic patterns)

- `helpRequest`: an explanation or meaning request ("explain", "what does … mean", "اشرح", "يعني ايه").
- `answerRequest`: the learner asks for the answer ("just tell me", "give me the answer", "قولي الاجابة").
- `confusionCount`: confusion signals in the last 3 learner messages ("I don't understand", "مش فاهم", "لا أفهم", a bare "?").
- `answeringCheck`: the learner has already spoken in this session (a session greeting doesn't count), the tutor's last reply asked a question in its closing part (last 300 characters), and this message reads as an answer, not as a question or request. These rules were tightened after the live evaluation found false positives.
- `firstTurn`: no earlier messages.
- `writesInArabicScript`: the current message is mostly Arabic script.

### Move selection

`selectLanguageMoves()` is a pure function. Its inputs are the level band, whether a lesson spec exists, the signals, the tutor policy (`hints_only`) and the ped-v2 mastery status. It returns a list of moves, each with reason codes and ledger IDs. The supported moves:

| Move | Main triggers (summary) | Ledger |
|---|---|---|
| `clarify_goal` | A vague message (e.g. a bare greeting), or the first message when no lesson is known | D13 |
| `activate_prior_knowledge` | First turn with a lesson spec | D3 |
| `comprehensible_model` | Beginner or unknown level | D2 |
| `short_explanation` | Help request, or a beginner meeting a new item | D3 |
| `comprehension_check` | After an explanation, unless an advanced learner asked a direct factual question | D5 |
| `corrective_feedback_retry` | The learner is answering a check question | D4 |
| `scaffold_hint` | Confusion, or a `hints_only` policy | D6 |
| `reteach_simpler` | Two or more confusion signals | D7 |
| `l1_support` | Beginner or unknown level, target English, learner writes in Arabic script | D8 |
| `answer_with_reasoning` | Answer request, allowed only without `hints_only` | D6 |
| `fade_support` | Advanced level, or ped-v2 status proficient or mastered | D3 |
| `independent_practice` | Advanced or proficient, and not confused | D3 |

There is no fixed sequence: every turn is chosen fresh from the evidence. If ped-v2 also gives a teaching method, the method still governs conflicts (existing rule), and the moves act as language-specific refinements.

## Prompt

`renderLanguageContextPrompt()` returns one text block tagged `<language_teaching_context version="ltc-v1">`. It contains:

- the labelled learner facts;
- the lesson facts, marked "from the course" as distinct from the tutor's own examples;
- this turn's moves with one-line instructions;
- standing rules:
  - the level is an estimate;
  - respond to the actual answer;
  - feedback on the work, never the person;
  - text chat is not speaking or listening practice;
  - no fabricated curriculum claims.

The block is kept to a few hundred tokens. Instructions live in one place in `languageTeachingContext.ts`; no route duplicates them.

## Evidence record (`TutorMessage.meta.languageTurn`)

```ts
{ version: 'ltc-v1', lessonId?, objectiveId?, skill: 'written_interaction',
  moves: string[], reasonCodes: string[], supportRequested: boolean,
  confusionSignals: number, answeringCheck: boolean,
  proficiency: { status, value?, source }, nextStep?: string,
  provenance: 'deterministic_turn_signals', confidence: 'low', masteryClaim: false }
```

- It does not copy the learner's text, which is already stored as the user message.
- It never writes to `StudentObjectiveMastery` or `LearningEvidence` (LTC-D11).

## Fallbacks and failure behaviour

| Situation | What happens |
|---|---|
| Not a language course, or no course | No language context; the tutor behaves exactly as before |
| No lesson spec | Unstructured lesson context; the tutor asks a goal question on the first turn and doesn't invent lesson content |
| No proficiency information | `unknown`; the tutor starts simple and calibrates from the replies |
| Any error while building | Logged as `language_context_failed`, returns null, and the turn continues as before (same pattern as `buildTeachingContext`) |
| Assessment open with "no tutor" | Unchanged: refused before any context is built |

## Voice (live tutor)

Unchanged in this phase, apart from the privacy fix: the opening no longer greets the student by name. Adding the language block to voice turns is proposed next. The same function can render a compact form.

## Unresolved assumptions and experimental decisions

- **Partner feedback:** 4Level1's specific feedback was not available in the repository or this session. The increment follows the Phase 1 spec's requirements instead.
- **Detecting a language course:** a course counts as a language course when `Curriculum.type` contains "language". The single entry in `Curriculum.languages` is taken as the target language. That field's meaning is ambiguous in other course types (it can mean language of instruction), so it is used only for language courses.
- **Experimental decisions:**
  - the signal patterns (D7);
  - the mapping from level to prompts or recasts (D4);
  - first-language support (D8);
  - coverage-based simplification in chat (D2).
- **Arabic as a target language:** the spec scopes it to Modern Standard Arabic. The engine passes "Arabic (Modern Standard)" as the target when the course's language is Arabic. Separately, the tutor's existing Egyptian-dialect instruction applies only to voice replies in Arabic-medium calls; text chat is unaffected.
