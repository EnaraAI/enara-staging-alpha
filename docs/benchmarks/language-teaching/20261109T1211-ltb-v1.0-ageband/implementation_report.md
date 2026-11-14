# Option B: trusted learner age band, implementation report

**Status:**
- `CODE-VERIFIED` and `TEST-VERIFIED` (local; SDK mocked for tests).
- Benchmark: see `benchmark_comparison.md` (`LIVE-PROVIDER-VERIFIED`, local in-process).
- Staging `NOT RUN`. Not committed, not deployed.

## 1. Decisions implemented

| Approved decision | Implemented as |
|---|---|
| Coarse `learnerAgeBand`, exactly `child`, `teen` or `adult` | `LEARNER_AGE_BANDS` in `models/learnerAgeBand.ts`. Exact-match `isLearnerAgeBand()`: no casing variants, trimming, numbers or booleans |
| Workspace Admin is the only writer | Write routes use `requireRole('admin')` (`admin` is ENARA's tenant-scoped Workspace/School Admin role; `enara-admin` is platform staff and is **not** allowed) |
| Academic Manager views read-only | `GET /api/age-bands` allows `admin` and `academic_manager`; the response's `canEdit` is false for AM. AM portal tab "Learner age bands (view)" |
| Teacher and Student can't create, update or delete | No route. The existing student/batch routes don't accept the field. Tested: 403 on writes and reads |
| Client fields never set or override the band | The tenant comes from the token; targets are looked up as `{ id, institutionId: req.user.institutionId }`; the body accepts only `ageBand`. The tutor path takes the band from server records only |
| `adultLearners === true` has absolute precedence | Resolver step 1 |
| `unknown` when no trusted source | Resolver step 4 (`no_trusted_learner_age_source`). Never inferred |
| No numeric age boundaries | None anywhere. The UI says "a category … not an exact age" |

## 2. Files

**Backend**

| File | Purpose |
|---|---|
| `src/models/learnerAgeBand.ts` (new) | The enum and exact validator |
| `src/models/Student.ts` | `learnerAgeBand?`: enum, **`select: false`** (never returned by existing reads) |
| `src/models/Batch.ts` | The same field at class level |
| `src/controllers/learnerAgeBand.controller.ts` (new) | `GET` overview (classes, students, own band, class band, effective band and source); `PUT` student and class band with an exact-enum or `null` body; tenant scoping; 404 across tenants; `recordAudit('learner_age_band_changed', …, {scope, from, to})` |
| `src/routes/learnerAgeBand.routes.ts` (new) | `authMiddleware`; `GET /` for admin and academic_manager; `PUT /students/:id` and `PUT /classes/:id` for admin only |
| `src/app.ts` | Mounts `/api/age-bands` |
| `src/services/languageTeachingContext.ts` | The resolver (precedence below); `loadTrustedAgeBand()` loads the student and their own batch within the session's institution; policy label `ltc-v1-r3-ab1` (the teaching policy is unchanged from r3) |
| `src/controllers/tutor.controller.ts` | Passes the owner-checked session's `studentId` to the engine, used for the age band only |
| `benchmarks/ltc-v1/run_trusted_age.ts` (new) | A copy of the frozen `run.ts`. **Only fixture construction differs** (see `code_diffs/run_trusted_age_vs_run.diff`). `run.ts` is unchanged (hash `a4d17a85…`) |
| `test/learnerAgeBand.test.ts` (new) | 54 tests |
| `test/languageTeachingR3.test.ts` | 1 assertion: the policy label `ltc-v1-r3-ab1` |

**Frontend**

| File | Purpose |
|---|---|
| `pages/workspace/LearnerAgeBands.tsx` (new) | `LearnerAgeBandsView` (presentational: class and student tables, child/teen/adult/"Not set" selectors, effective band with source "Set for this student", "Inherited from class", "School setting (adult learners)" or "Not set", plus the precedence and "not an exact age" explanation and a read-only note) and the `LearnerAgeBands` container. The container loads, saves and uses the existing `window.confirm` pattern when replacing or clearing, with toast feedback |
| `services/apiService.ts` | `fetchAgeBands`, `setStudentAgeBand`, `setClassAgeBand` and their types |
| `App.tsx` | Admin portal page `age-bands` (shown when role is `admin`); AM portal tab `age-bands` (read-only) |
| `components/Layout.tsx` | Nav item "Learner Age Bands" (`workspaceAdminOnly`) |
| `services/roleRouting.ts` | `age-bands` added to `SCHOOL_ADMIN_PAGES` (hidden from teachers) and to `ACADEMIC_MANAGER_PAGES` |

Line endings: `Student.ts` and `Batch.ts` keep their original mixed CRLF/LF endings; the diffs contain only the added lines.

## 3. Data model

- **Two optional enum fields:** `Student.learnerAgeBand` and `Batch.learnerAgeBand`, where Batch is the class (each student has one `batchId`).
- **No migration:** the fields are absent on existing documents, which resolve as unset.
- **No DOB, numeric age or derived age** is stored.
- **`select: false`:** existing student and batch endpoints, rosters and directories never include the field. Tested on `GET /api/students`.
- **Class scope is Batch, not CourseInstance:** a student belongs to exactly one Batch, so the class value is deterministic. CourseInstance is many-to-many and would make "the class band" ambiguous.

## 4. Resolver precedence and source labels

`resolveTrustedAgeBand(learningSettings, studentBand, classBand)`:

| Order | Condition | Result | `ageBandSource` |
|---|---|---|---|
| 1 | `learningSettings.adultLearners === true` | adult | `school_setting_adult_learners` |
| 2 | Student value is exactly child, teen or adult | that band | `student_age_band` |
| 3 | Class value is exactly child, teen or adult | that band | `class_age_band` |
| 4 | Otherwise | unknown | `no_trusted_learner_age_source` (or `invalid_school_setting` when `adultLearners` was non-boolean and nothing else applies) |

- An invalid student value falls through to the class.
- The student is loaded as `{ id: session.studentId, institutionId: session.institutionId }`; the class as `{ id: student.batchId, institutionId: session.institutionId }`.
- Status is `known` or `unknown`.
- Turn metadata persists `ageBand` and `ageBandSource`. `ageBandStatus` is in the reply only; the schema is unchanged since r3.

## 5. Privacy

The provider receives at most:
- `Learner age band: <band> [known; source: <label>]`;
- the band's register line.

Verified on the actual serialised request:
- no DOB, age, grade, name, student/school/class/course/session IDs or client fields (test 21/22);
- the benchmark leak scan: 0 identifiers in all requests.

## 6. Tests (commands and results)

| Command (from `backend/`) | Result |
|---|---|
| `npx vitest run test/learnerAgeBand.test.ts test/languageTeachingR3.test.ts` | **92/92 passed** |
| Focused regression (17 files: all language-engine tests, tutor stream and fallback, leak guard, tenant isolation ×2, access, staff routing, adult learners, teaching features, learning journey, elie.sprint4) | **287 passed, 1 failed**: `elie.sprint4 › learning loop`, the "direct instruction" assertion that predates r1 (`logs/post_tests_focused.log`) |
| `npx tsc --noEmit` (backend / frontend) | exit 0 / exit 0 |
| `npx vite build` (frontend, to a scratch outDir) | exit 0 |
| Full backend suite, `npx vitest run --maxWorkers=2` | see `logs/post_full_backend_suite.log` and the README |

**Test map (brief items 1–26):**
- **Resolver** (1–9): "resolver precedence" block, plus test 9 on the route.
- **Authorisation and isolation** (10–18): "authorization and isolation" block, plus 17b/18 on the tutor route.
- **Runtime and provider** (19–24): "runtime and provider payload" block.
- **UI** (25): server-side render of the real component:
  - admin selectors with exactly the 4 options;
  - the inherited/unknown display and the precedence text;
  - the AM read-only view with no controls;
  - role routing (hidden from teachers; AM tab).
- **Invalid values and failed writes** (26): 26a/26b.

## 7. Limitations

- **Band boundaries aren't defined.** Which ages count as child or teen is a separate product decision. The UI and code define none, and schools apply their own judgement.
- **No frontend unit-test framework** exists in `frontend/`. UI behaviour is tested by server-side rendering in the backend test suite (an existing repo pattern). There's no browser end-to-end test.
- **Class scope is Batch only.** A per-course-section band was not added.
- **`enara-admin`** (platform staff) can't write bands, following the brief's strict "Workspace Admin only".
