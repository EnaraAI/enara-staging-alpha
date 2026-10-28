# Test Plan and Executed Tests

Backend: Vitest + supertest + mongodb-memory-server (`npm test` in `backend/`); AI calls are mocked. CI runs them on every pull request.

| File | Covers |
|---|---|
| `elie.sprint1.test.ts` | Graph cycles, closure, ready-to-learn, weak prerequisites; flags (default off, master flag, Enara-admin only); objective create/edit/version/approve order/archive; cycle rejection; school and class isolation; AI extraction validation (no overwrite, invalid lessons dropped, cyclic link dropped); question tags across schools; event idempotency and validation; migration keying with duplicates |
| `elie.sprint2.test.ts` | Mastery estimator rules and determinism; evidence policy (what counts, repeat discount, AI/activity excluded); submit → evidence → mastery → history; idempotent reprocessing; knowledge map gaps and weak prerequisites; flag off keeps events pending; access by student/teacher/admin/other school; question linking applies to past answers and keeps answer keys intact; unlinking and invalidation keep evidence and recompute; recompute determinism |
| `elie.sprint3.test.ts` | Selection rules (prerequisites first, difficulty, unseen first, settling, blocking, stops); no answer-key leakage; resume; stale and duplicate answers, parallel submits; full diagnostic to report with prerequisite gap and evidence; school question limit and time limit; early end and inconclusive report; access by other student/school/teacher; flag off; distractor-based misconception, student vs teacher views, teacher decision preserved, automatic resolution |
| `elie.sprint4.test.ts` | Strategy rules (prerequisite first, misconception responses, switching only after trying, status, teacher choice); full loop gap → intervention → focused tutoring with context in the system prompt → completion doesn't change mastery → reassessment outcome → later independent evidence verifies TTU with tutoring time; graceful degradation with the flag off; teacher-assigned strategy and cancel rules; class scoping; TTU time rules (pause cap, lesson cap, assessments excluded); TTU distributions and scoping |
| `elie.sprint5.test.ts` | Retention replay (start rule, intervals, no early credit, reset, assisted/invalidated excluded, due/overdue); pathway modes (strict vs adaptive), sequence; recommendations order with teacher work first, explanation numbers and evidence ids, drafts excluded; review due; per-question review items untouched; class insights heatmap, gaps, misconception groups, baseline-to-latest; scoping by class, school, role and flag |

## Manual browser check (Sprint 2)
Local backend on an in-memory MongoDB + frontend dev server + Playwright: admin created two objectives (with Arabic titles and a prerequisite), approved them, linked a quiz's questions; a student answered 2 of 3 correctly and saw "Developing, estimate 63%, moderate evidence" with the weak prerequisite, the evidence list, and a working layout at 390 px. No page errors. This found and fixed one bug: saving question links wiped the questions' answer keys (now a field-level update, with a regression test).

## Manual browser check (Sprint 3)
Student opened My progress → Take a quick check → answered three questions one at a time (no feedback shown) → report showed ALG.1 "Needs work, 1 of 3 right, overall estimate 38%" and ALG.2 "Check ALG.1 first" with practise buttons. No page errors.

## Manual browser check (Sprint 4)
After a quick check left ALG.1 emerging, "Practise with the AI tutor" created and started an intervention and opened the tutor in its focused session (request went to that session); My plan showed it with Continue practice, I've finished practising and Take the check. No page errors.

## Manual browser check (Sprint 5)
Student after a quick check saw "Recommended for you: Practise ALG.1: 1 of 3 recent independent answers correct" with a Practise button. Admin's Class Insights showed the heatmap (E for ALG.1), common gap with Assign practice, diagnostic completion 1/1, TTU in progress and baseline 25% → latest 38%. Assigning practice worked. No page errors.

## Sprint 6 automated tests (`elie.sprint6.test.ts`)
Arabic normalisation; chunking at word boundaries with page kept and no text lost; citations only for sources the answer cites; source text escaped and marked untrusted; PDF extraction (English + Arabic, two pages) with objective links; scanned PDF reported as `no_text` with no passages; idempotent reprocessing and removal of passages for removed files; recovery of an interrupted job; English and Arabic retrieval scoped to school and curriculum (another school's fixture never returned); no result for unrelated queries; processing endpoints (status, admin-only trigger, cross-school 404); school analytics values, definitions, role and school scoping.

## Manual browser check (Sprint 6)
Admin opened School Insights: metric tiles with definitions and "Nothing recorded yet" for empty sections; objectives table with "—"; "Process files" extracted lesson.pdf (2 pages, 2 passages) and reported scanned.pdf as not readable (needs OCR). Phone width (390 px): no horizontal scroll. No page errors. The citation display in chat was not checked in the browser (no model key in the local run); the backend side is covered by tests.

## Sprint 7 automated tests
- `elie.e2e.test.ts`: the 13-step loop (teacher approves objectives in prerequisite order → diagnostic finds a prerequisite gap without asking dependants → recommendation with evidence → intervention and tutoring with objective and strategy in the prompt, no answer keys → completion leaves mastery unchanged → reassessment raises it → teacher heatmap shows it → objective review scheduled → quiz mistake becomes a spaced review whose answer adds retention evidence).
- `elie.sprint7.test.ts`: shadow mode (students blocked, staff see results, tutor context off, comparison report and its scoping); students can't change objectives or read others; teachers limited to their classes; other schools see nothing; query operators rejected; per-user rate limit (240/min) with a classmate on the same IP unaffected; migrations idempotent and recoverable after the documented undo; evidence and mastery rebuilt from events give identical results.

## Performance baseline (Sprint 7)
`npx tsx perf/elie.perf.ts` on the development container with in-memory MongoDB (no network latency; Atlas will be slower per query). Times in ms, one run each.

| Case | Size | Before | After parallel processing |
|---|---|---|---|
| Graph cycle check | 300 objectives | 1 | 1 |
| Prerequisite closure | 300 objectives | 10 | 7 |
| Event ingestion (batches of 500) | 10,000 events | 3,200 | 2,364 |
| Re-sending the same events | 10,000 events | 2,423 | 2,861 |
| Bulk evidence + mastery | 10,000 events → 1,000 states | 49,113 | 22,867 (re-run: 22,174) |
| Recompute all states, sequential | 1,000 states | 7,126 | 7,193 |
| Concurrent recomputes on the same 50 pairs | 200 calls | 575 | 664 |
| Class insights heatmap | 500 students × 40 objectives | 171 | 158 |
| Concurrent diagnostics to completion | 50 students, 600 answers | — (rate-limited, see D14) | 19,437 (re-run: 19,588) |
| Retrieval | 5,000 passages, mean of 20 | 75 | 76 |

Correctness during the runs: 10,000 processed, 0 failed, 10,000 evidence rows, 1,000 mastery states, no duplicate states after concurrent recomputes, every diagnostic completed. The "before" run of concurrent diagnostics failed at the per-IP rate limit, which led to D14.

## Manual browser check (Sprint 7)
With shadow mode on: the student's app showed no "My progress" tab (same as before Phase 2); the admin's School Insights showed "Estimates vs. assessment scores" with its caveat and "No estimates to compare yet". No page errors.
