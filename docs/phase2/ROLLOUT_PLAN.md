# Phase 2 (ELIE): Rollout Plan and Pilot Readiness

Nothing here has been deployed. Every stage change below needs the owner's explicit approval.

## Controls
- **Flags** (`Institution.features`, Enara admins, `PUT /api/learning/flags`): master `learning_intelligence_enabled` plus 7 sub-flags, all off by default. Turning one off hides the feature and stops new processing; data is kept.
- **Shadow mode** (`learningSettings.shadowMode`, Enara admins, `PUT /api/learning/settings`): everything is computed, staff see it, students see nothing new (no "My progress" tab, no diagnostics, no recommendations, unchanged tutor). Tested in `elie.sprint7`; checked in a browser.
- **Pathway mode** per school (`strict_sequence`, `teacher_controlled` default, `adaptive`).

## Stages
| Stage | What | Entry | Exit |
|---|---|---|---|
| A. Development | Code, tests, docs on `phase2-elie` | — | Done (Sprints 1–7) |
| B. Internal sandbox | Merge PR into `connect-backend` (deploys the sandbox and runs the 6 additive migrations). Enable flags for a test school only. Run the e2e loop by hand; check tenant boundaries with two schools | Owner approves the merge | Checks in "Sandbox checklist" pass |
| C. Shadow mode | One real school: master + mastery + insights flags on, `shadowMode: true`. Questions get linked to objectives; estimates build from normal quizzes. Staff review **Estimates vs. assessment scores** on School Insights weekly | Owner approves; S1 fixed; school agrees | 2–4 weeks; disagreements reviewed and explained; no tenant or integrity incident |
| D. Limited pilot | Shadow mode off for that school; diagnostics, knowledge map, recommendations, interventions and teacher insights on, with teachers involved | Owner approves; evaluation reviewed (see below) | Teacher feedback collected; reliability and evaluation reviews pass |
| E. Expansion | More schools, one at a time | Owner approves | — |

## Sandbox checklist (stage B)
1. Migrations listed in `MIGRATION_PLAN.md` all applied once (`migrations` collection).
2. With flags off, the app behaves as before (no new tabs or calls).
3. Two test schools: no cross-school data in objectives, mastery, insights, analytics, retrieval.
4. The e2e loop from `elie.e2e.test.ts`, by hand in the browser.
5. Upload a real school PDF; check processing status and a cited tutor answer.
6. Daily cron output includes `evidence`, `ttu` and `curriculumFiles`.

## Rollback
- **Fast:** turn the school's master flag off (or turn shadow mode on). Takes effect within 30 seconds (flag cache), no deploy.
- **Code:** revert the merge on `connect-backend`; the added collections and fields are ignored by older code.
- **Data:** migrations are additive. Undo for the event keys is documented and tested (`elie.sprint7`: unset the fields, delete the record, run again gives identical results). Derived data (evidence, mastery, retention, TTU, passages) can be deleted and rebuilt from events and files; the rebuild is tested to give identical mastery.

## Pilot readiness (as of Sprint 7)
| Area | Status | Evidence |
|---|---|---|
| Automated tests | Pass | 178 backend tests (20 files) incl. e2e loop, security, migrations; frontend build |
| Tenant isolation | Pass | Tests in every sprint; `SECURITY_REVIEW.md` |
| Account security | **Blocked: S1 open** | Registration can take over a student record by email. Must be fixed before stage C (real students' data) |
| AI evaluation | **Not ready** | 18/19 mechanical checks on one run of an unreviewed 16-case set; teacher and Arabic review not done (`EVALUATION_RESULTS.md`) |
| Performance | Ready for one school | Baseline in `TEST_PLAN.md`: class heatmap of 500 students in 0.16 s; 10,000 events processed in 22 s; 50 concurrent diagnostics completed |
| Migrations / recovery | Pass | Tested idempotent runs, undo and rebuild |
| Shadow mode | Available | Tested; browser-checked |
| Observability | Partial | Request ids, failure logs, cron counts. No latency metrics or alerts for ELIE jobs yet |
| Teacher experience | Partial | Teachers use the admin sign-in (D10) |
| Arabic / RTL | Partial | Arabic extraction, retrieval and tutor replies work; dialect needs review; Arabic PDF glyph-order quirk |

**Verdict:** ready for stage B (sandbox) once the owner approves the merge. **Not ready for stage C** until S1 is fixed and the evaluation set is reviewed.
