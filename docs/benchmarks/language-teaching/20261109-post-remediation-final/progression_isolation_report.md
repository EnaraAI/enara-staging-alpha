# Progression isolation: POST-03 (and POST-04/05/06)

**Result: FIXED and verified.** Verified by unit tests and route tests through the real controller. The live dry run and Stage C store a scope on every language turn.

## 1. The namespace

```
stateScope = sha256("ltc-scope-v1" | institutionId | studentId | sessionId | courseId | curriculumId | lessonId)[0:24]
```

| Component | Source (all server-side) |
|---|---|
| institutionId | Owner-checked tutor session |
| studentId | `req.user.studentId`; the session is loaded with `{ id, studentId }` |
| sessionId | Owner-checked session |
| courseId | Only when the course was resolved and **enrolment-checked** in this turn (`buildCourseTree`) |
| curriculumId | From the enrolment-checked course; the curriculum read is tenant-scoped |
| lessonId | The chapter actually resolved in that curriculum |

**Properties:**
- **Deterministic.** The same inputs give the same scope.
- **Opaque.** It is a hash; a test checks that no component appears in it.
- **Total.** Changing any one component changes the scope; a test checks each of the six.
- **Not client-controlled.** A client can switch lesson, but cannot choose or forge a scope.

## 2. Where it is enforced

| Reader | Behaviour |
|---|---|
| `deriveLearningState(history, scope)` | Ignores every turn whose stored `stateScope` differs. This covers the active item, completed items, hint level, hint turns, success streak, criteria, attempts on item and revealed items. |
| Pending-task fallback (`detectTurnSignals`) | Uses the stored open item only when it is in scope |
| `attemptsOnCurrentTask(history, scope)` | Stops at a task left open under another scope |
| Live writes | `turnEvidence` stores the same `stateScope` that the engine used to read |

**Legacy turns** (stored before r4.1, no scope) never feed scoped state. Effect: an existing session restarts item progress once after deployment. This is the safe direction; no migration is needed.

**Server-side only.** The scope is computed in `buildLanguageTeachingContext`. The model never sees it or the stored state.

## 3. Evidence

### Unit tests (`languageTeachingR4.test.ts`, "r4.1 POST-03")

- **Scope function:** each of the six fields changes the scope; the scope is deterministic, 24 hex characters, and contains no input value.
- **Another lesson with the same item ids:** lesson A (i1 completed, i1 reopened with a hint) gives the full state for A and **empty** state for B: no item, no completed items, no hints, no criteria.
- **Legacy unscoped turns** contribute nothing to scoped state.
- **After a lesson switch:**
  - lesson B presents its own `i1`;
  - there is no active item;
  - the pending task is not inherited;
  - the attempt count is 0;
  - the signals carry B's scope.

### Route tests (real controller, SDK mocked)

The test curriculum has two lessons whose items both use the id `i1`.

| Step | Result |
|---|---|
| Lesson A: present i1, answer correctly | Scope stored |
| Switch to lesson B in the **same session** | B's own i1 is presented (its prompt is in the system prompt). `activeItemBefore` is null. The scope differs from A's. |
| Answer B's i1 with **A's** correct answer | No key match: B is checked only against B's key |
| Answer B's i1 correctly | `keyVerdict: CORRECT` from B's key |
| Return to lesson A | The engine presents **i2**: A's i1 completion is still A's own, unaffected by B |

The existing r4 test still passes: a new session or another learner starts with no active item or hints.

### Live

| Run | Turns with a scope |
|---|---|
| Dry run (final code) | 219/219 |
| Stage A | 28/28 |
| Stage C | See `paid_evaluation_report.md` |

## 4. Assisted vs independent evidence

| Item | Change |
|---|---|
| POST-06 | After support on the open item, a correct answer to another item counts as **assisted** (previously only `ACTIVE_ITEM` successes could be assisted) |
| Stage A finding (fixed) | When the answer was disclosed (L6) in a reply that also presented the next item, the learner's later repeat of the disclosed answer counted as **independent**: hints reset with the new item. Now the reveal is stored against the item it disclosed (`revealedItemId`), and any later success on that item, or on another item after a reveal, is assisted. Covered by a unit test that replays the live SA-05 shape. |

Independent evidence is still never downgraded by a later assisted one, and is never upgraded from assisted.

## 5. Related fixes

| ID | Fix | Test |
|---|---|---|
| POST-04 | A marker without `next=` no longer closes the open item | `activeItem` stays `lesson:i1`, `next=SAME_ITEM`; `nextMissing` is never stored |
| POST-05 | Quoting a completed item is not a re-presentation | A new tutor task (`msg:m2`) becomes active |

## 6. Residual

- POST-14 (a pre-existing curriculum-context upload-path listing) is unrelated to progression and **still open**.
- No tenant or permission rules were changed.
