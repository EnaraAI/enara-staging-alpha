# P16: real staging end-to-end learning journey (2026-10-29)

| | |
|---|---|
| **Window (UTC)** | Preflight 22:02Z; journey 22:06–22:13Z (stopped at grading); owner decision; grading run 22:48–22:50Z |
| **Live deployment** | `dpl_8tccc1rcKRNQKURe5wKYbBSX82cP` (alias `enara-staging-alpha.vercel.app`), commit `574010aee32bd2fd0493c768ae431baed1cf78c9`, target production |
| **Staging school** | `enara-staging-school` (synthetic) |

## Final decision: **PASS** for the learning journey, with recorded owner waivers and two accounting items not independently verified

The whole journey ran against the deployed staging app with **real AI calls**:
- teacher preparation and publishing;
- student lesson access;
- a real tutor reply;
- submission;
- **real autonomous grading**, released with no teacher step, with AI feedback;
- the educator views;
- usage records;
- authorization refusals.

**Owner decisions and waivers (recorded, not passed):**
- **Key rotation (preflight 6): waived.** The run used the current `ANTHROPIC_API_KEY`, which was exposed in chat (set 21:01:04Z, never rotated). **Rotate it after this test.**
- **Stop A** (key-disable rehearsal): waived, not passed.
- **One synthetic student:** approved.
- **`ai_grading_enabled` turned on** for the staging school, and **left on**, per the owner's choice.

## Preflight

| # | Gate | Result |
|---|---|---|
| 1 | Deployment and commit | PASS (above) |
| 2 | Staging guard | PASS (`/health` 200 on a guarded entry point) |
| 3 | App cap $4.50 | PASS (`AI_TEST_SPEND_CAP_USD=4.50`; the guard refuses a cap above $5) |
| 4 | Provider cap ≤ $5 | Operator-attested only; not independently verified |
| 5 | Fresh `AI_TEST_SPEND_ID` | PASS (`p14-live-20261029-12a335`) |
| 6 | Key rotated | **FAIL, then WAIVED by the owner** ("use the key available to you") |
| 7 | Ledger and counter | Ledger PASS (per-request and report reads). The cumulative counter is readable only in Atlas (not read). Provider console: not accessible to Claude |
| 8 | Rollback target | PASS: `dpl_GsPGJSaGeDxJtGNiWrwcj2EYwbZ1` (keyless; rehearsed in P14.11) |
| 9 | U1 | Not blocking (cosmetic toasts on shared admin pages) |
| 10 | Synthetic identities | Teacher, academic manager, workspace admin and ENARA admin designated; **student created with owner approval** (below) |

## Test identities (no credentials)

| Role | Identity |
|---|---|
| Teacher | `teacher@enara-staging-school.demo.enara.test` (existing) |
| Academic manager | `academic.manager@…` (existing) |
| Workspace admin | `workspace.admin@…` (existing) |
| ENARA admin | existing |
| **Student** | `p16-student@p16.staging.enara.test` (created), Student `STU57776246`. Password only in a local 0600 file |

## Journey: steps and results

| # | Action | Expected | Actual | Persisted state checked | Result |
|---|---|---|---|---|---|
| 1–3 | Teacher login. Admin creates a dedicated batch `b1793311573178` and class `inst-1793311573652` ("P16 Fractions"), taught by the teacher | Isolated class, no change to the seeded class | 201/201; teacher in `instructorIds` | Class listing | PASS |
| 4 | Teacher creates the lesson (curriculum `CUR-X8MU9A-4135`, chapter `ch1793311574135lv9`) and publishes it to the class | Linked to own class only | 201 / 200 | The student reads the content later | PASS |
| 5 | Teacher creates an MCQ + open-response rubric assessment `ASM575250`, publishes and assigns it (`asg-fb27a1e3-…`) | Assignment visible to the class | 201/200/201; `releasePolicy: auto`, `answerReveal: after-close` | Student assignment list | PASS |
| 6 | ENARA admin creates the synthetic student; admin enrolls them in the class (membership, not batch); real student login | Login works; access only to the p16 class | 201/200; token | `/api/me/courses` lists only `p16-course` | PASS |
| 7 | Student opens the lesson and the assignment | Lesson content visible; no answer keys | 200; content includes "2/4 + 1/4 = 3/4"; no `correctAnswer`/`modelAnswer` | — | PASS |
| 8 | **REAL tutor call** (1 message) on the lesson | A relevant answer | 200 in 8.1 s: a Socratic hint ("rewrite 1/2 as quarters… how many quarters…") | Session history holds the exchange | PASS |
| 9 | Student submits (q1 "3/4"; q2 a one-sentence explanation); repeat submit | Receipt; repeat idempotent | 200; repeat → same receipt | — | PASS |
| 10a | Grading with the school's original setting (`ai_grading_enabled: false`) | Per design: MCQ auto-scored; open response → teacher review, no AI | `needs_review`, `gradedByAi: 0`, 1/3 points, **not released**; the student sees "awaiting review", with no fake grade | Grading queue | PASS (behaviour matches configuration) |
| 10b | Owner approved enabling `ai_grading_enabled`; teacher re-assigned (`asg-2`); student submitted a fresh attempt | **REAL autonomous grading**, released without a teacher step | **Released in 7 s**: score 100, 3/3, `gradedByAi: 1` | Grading queue: `released` | PASS |
| 11 | Grade and feedback persisted | Rubric points and feedback | q2 2/2. Feedback: "Great work! You explained clearly why the parts need to be the same size… Next step: try explaining what the denominator itself tells us…" | Result endpoint, profile | PASS |
| 12 | Release policy | Auto release; key withheld until close | Released; no answer key in the result | — | PASS |
| 13 | Teacher views | Correct student, class and result | Roster lists "P16 Student (synthetic)"; the profile shows both assignments and the released result; the queue shows both attempts; the academic manager reads school analytics | — | PASS |
| 14 | Usage records | One ledger row per provider attempt, measured | See below | Usage report (admin), per-request record | PASS (app side) |
| 15 | Authorization (10 probes, all read-only) | Refused | Unauthenticated lesson and result → 401. Academic manager → roster, grading queue, assignment 403. Student → grading queue, roster, assessment, grade correction 403. Teacher → the student's result endpoint 403. The student sees only the p16 course | — | PASS |

## Real AI calls and spend

| # | Workflow step | Feature | Model | Tokens (input / output) | App status | Approx. cost (catalogue) |
|---|---|---|---|---|---|---|
| 1 | 8 (tutor) | `tutor_chat` | `claude-opus-5-5` (app default; not overridden) | 692 / 154 | measured, succeeded | $0.0058 |
| 2–3 | 10b (grading; 2 evaluations by design) | `ai_grading` | `claude-opus-5-5` | 1,528 / 827 (combined) | measured, succeeded | $0.0227 |
| | **P16 total** | | | **2,220 / 981** | 3 operations; 0 failed; 0 unknown | **≈ $0.028** |

- **School usage report** (admin, 30 days): 4 operations: the 3 above plus P14.11's `staff_assistant` rehearsal (371/48). All succeeded; 0 unpriced, 0 usage-unknown.
- **Cumulative app spend:** about **$0.031** of the $4.50 cap. A direct key check in P14.11 added about $0.000004 outside the app.
- **Not independently verified:**
  - **`test_spend:p14-live-20261029-12a335` counter:** readable only in Atlas. Expected settled ≈ $0.031 (the operator can confirm).
  - **Provider console usage:** the owner can confirm 4 calls plus the direct check on the staging workspace key.
- Costs above are catalogue estimates (`estimated` status), not invoiced amounts.

## Failures and defects

- **No product defect found on staging.** The grading stop at 10a was **configuration**: AI grading off for the school. The product handled it correctly, sending the answer to teacher review without a fake grade.
- **U1** (cosmetic, P15): not encountered; not relevant to this API journey.
- **The P15 local UI fixes (D1/D2) are not deployed**, so the staging UI still has those two issues. Not exercised here.

## Staging data created (cleanup status: **left in place**, all tagged)

| Record | Id | API-removable |
|---|---|---|
| Batch | `b1793311573178` | yes (`DELETE /api/batches/:id`) |
| Class | `inst-1793311573652` (`p16-course`) | yes (`DELETE /api/course-instances/:id`) |
| Curriculum and lesson | `CUR-X8MU9A-4135` / `ch1793311574135lv9` | yes (`DELETE /api/curriculums/:id`) |
| Assessment | `ASM575250` | yes (`DELETE /api/assessments/:id`) or archive |
| Assignments | `asg-fb27a1e3-0477-451e-83d6-56b83efe6c12` and the second assignment (id in the local inventory) | archive (`POST /api/assignments/:id/archive`) |
| Attempts | 2 (one `needs_review`, one released) | no route (history) |
| Tutor session | 1 | student delete route |
| Student record | `STU57776246` | yes (`DELETE /api/students/:id`) |
| Student **user** | `p16-student@p16.staging.enara.test` | **no API route.** Atlas deletion by `_id`; needs a named cleanup owner |
| Usage-ledger rows | 3 | append-only by design (kept) |
| School setting | `ai_grading_enabled` false → **true** | kept on (owner choice); revert via `PUT /api/learning/flags` |

Nothing was deleted, because cleanup was not requested in this run. The local inventory file lists every id.

## Remaining risks and next actions

1. **Rotate the Anthropic key now.** Create a new key in the staging workspace, enter it yourself in Vercel, then redeploy. The current key is in the chat history.
2. Confirm the provider console usage (≈ 4 calls + 1 direct) and the Atlas counter (≈ $0.031).
3. Decide on cleanup of the `p16` records (the API-removable ones can be removed on request) and name the **Atlas owner** for the student user.
4. Deploy the P15 UI fixes (D1/D2) when approved; re-check the teacher and student dashboards on staging.
5. Stop A remains waived; batch-based enrollment remains an open owner decision.
