# Phase 3: Test Plan and Results

## Automated (backend, Vitest + mongodb-memory-server)
| File | Covers |
|---|---|
| `phase3.sprint1.test.ts` | lifecycle, publish snapshots, immutability, assignment windows, late policy, extensions, attempts, idempotent submit, draft save, tenant/teacher scope |
| `phase3.autograding.test.ts` (replaces `phase3.sprint2.test.ts`, which tested the teacher-approval flow) | the 18 required areas: 1 MCQ auto-grading · 2 short answers (exact by rule, meaning check, key leak refused) · 3 open answers (two agreeing evaluations) · 4 essays (multi-criterion, Arabic) · 5 rubric/total/version/leak validation · 6-8 automatic finalize + release with no teacher action, dashboard and study plan updated · 9 provider failure, retry with backoff, exception after 3 runs with no score · 10 invalid output and integrity flag · 11 duplicate triggers (one release, one email, one evidence set) and expired leases · 12 cross-tenant · 13 student manipulation and appeals · 14 teacher corrections keep the original, replace evidence, answer appeals · 15 Phase 2 evidence (AI weight 0.8) · 16 Phase 2 failure keeps the grade and retries without regrading · 17 one results email · plus disagreeing evaluations, exceptions graded by hand or regraded, and hand grading when AI grading is off |
| `phase3.sprint3.test.ts` | AI assessment drafts, per-question regenerate, source verification, lesson plans, flags off → refused |
| `phase3.sprint4.test.ts` | teaching overview, roster, learner profile, educator interventions, scope checks |
| `phase3.sprint5.test.ts` | study plans (replan, stable keys, concurrency, no invented items), tutor handoff, tutor policy in chat/course/voice |
| `phase3.e2e.test.ts` | 18 full integration: generate → edit → publish → assign → submit → automatic evaluation, validation, finalize and release → feedback, next step and evidence → teacher correction; ops metrics |

## Results (actually run 2026-10-25)
| Check | Result |
|---|---|
| `backend: npx vitest run` | **234/234 pass, 26 files** (after the autonomous-grading change) |
| `backend: npx tsc --noEmit` | pass |
| `frontend: npm run build` | pass |
| `frontend: npx tsc --noEmit` | 8 errors, all pre-existing (unchanged from the audit baseline) |
| Browser run with real AI (Playwright, local) | teacher publish → assign → student submit → AI proposal → accept → finalize → student result: pass, no page errors. Found and fixed: unpublished (v0) assessments offered in the assign form |

## Browser run of autonomous grading (real AI, local, 2026-10-25)
Done with Playwright on a local copy with sample data.
- **Student:** submits an assignment with two MC questions and one open answer, and sees "Enara is grading your answers". Two real evaluations run, the attempt is validated and released, and the student's page updates to 4/4. It shows the score explanation, strengths, improvements and feedback. The student then sends a review request.
- **Teacher:** the grading list shows the released result with "1 request(s)". The teacher corrects the open answer from 2 to 1 with a reason ("was 2" is shown) and agrees to the request. The student sees 3/4 and the teacher's reply.
- No page errors.
- **Bug found and fixed:** the student page polled only once while grading, so it stayed on "grading". It now polls every 4 s until the result arrives.

## Grading reliability (real AI)
`npm run benchmark:grading`, set `bench-v1`, model `claude-opus-5-5`. Results: English exact agreement 15/16 and QWK 0.988; Arabic 11/12 and QWK 0.985; short answers 10/10; 0 exceptions. **The reference scores are provisional (engineering), not teacher scores**, so subjective grading is **not validated**. See `PHASE3_GRADING_BENCHMARK.md` for the criteria and what is missing. The automated tests above use a mocked AI. They check the workflow and safeguards, not grading quality.

## Not run
- No run against production data or the production migration.
- No load test. No browser pass yet of the teaching dashboard, lesson planner or study plan pages (covered by API tests only).
- No guardian flows (deferred).
- No benchmark on teacher-scored real student work yet.
