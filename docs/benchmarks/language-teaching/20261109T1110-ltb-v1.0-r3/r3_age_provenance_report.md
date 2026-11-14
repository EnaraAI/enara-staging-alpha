# r3 age-provenance report

**Verdict:**
- **Adult: trusted provenance verified.** `CODE-VERIFIED`, `TEST-VERIFIED`, `LIVE-PROVIDER-VERIFIED`.
- **Child and teen: `BLOCKED`.** No trusted runtime source exists; they resolve to `unknown` on every turn.
- **Age adaptation for children and teens is NOT claimed.**

## 1. Data path traced (code)

| Step | Where | What happens |
|---|---|---|
| Identity | `auth.middleware` → `req.user.studentId` | Comes from the verified JWT only |
| Session | `tutor.controller.prepareTutorTurn` | `TutorSession.findOne({id, studentId})`, so the session must be owned by the authenticated student. Its `institutionId` is server-set |
| Course | `studentCourseService.buildCourseTree(studentId, courseId)` | Enrolment check: a course the student isn't enrolled in throws, and no context is built |
| Engine entry | `buildLanguageTeachingContext({institutionId: session.institutionId, …})` | No grade, age, or client field related to age is passed |
| Age resolution | `Institution.findOne({id: institutionId}).select('learningSettings')` → **`resolveTrustedAgeBand(learningSettings)`** | The only path by which an age band reaches the engine |
| Prompt | `renderLanguageContextPrompt` | Adds `Learner age band: <band> [known; source]` only for a known band, plus the band's register line. Never DOB, age or grade |
| Evidence | `meta.languageTurn.ageBand`, `ageBandSource` (persisted), `ageBandStatus` (in the reply only) | A non-identifying category |

## 2. Why adult is known and child/teen are not

| Candidate source | Exists? | Trusted / authorised for this purpose? | Decision |
|---|---|---|---|
| `Institution.learningSettings.adultLearners` (boolean, staff-set through the existing learning-settings admin route) | yes | **Yes.** Its documented policy (`models/Institution.ts`): "Adult education school: every student is taught as an adult … whatever the grade on their profile." It is already used by ped-v2 (`isAdultSchool`, `ADULT_GRADE_LEVEL = 18`) | **Used:** `true` gives `adult` (known) |
| Learner DOB / age / age band (`Student`, `User`, `Batch`, `CourseInstance`, `Curriculum`) | **no** | — | Can't be used |
| `Student.grade` (free text, staff-managed) | yes | ENARA *does* derive stage from it elsewhere: ped-v2 `gradeLevel` (≤ 8 means younger-learner methods) and `teachingImpact` bands K-5 / 6-8 / 9-12. **But the r3 brief forbids inferring an age band from grade** | **Not used.** The r1/r2 code path `grade → 'school'` was removed (it was never wired at runtime) |
| CEFR level, writing style, names, avatar, benchmark cohort labels, client request fields | — | Forbidden | **Never used.** Covered by tests |
| A new staff-set `learnerAgeBand` field (class or school level) | no | Would need a product, consent and permission decision, plus schema and admin-UI changes | **Not added.** Reported as the blocker |

## 3. Trust model and safety rules (implemented)

- **One resolver.** `resolveTrustedAgeBand()` is the only producer of a band, and nothing in it can produce `child` or `teen` today.
- **Strict typing.** Only the boolean `true` gives `adult`. A non-boolean value (`'true'`, `1`) gives `unknown` with source `invalid_school_setting`. A missing or `false` setting gives `unknown` with source `no_trusted_learner_age_source`.
- **`unknown` never inherits `adult`.** It applies the age-neutral policy, which is unchanged since r1 (conservative length; plain, respectful register).
- **Tenant scope.** The institution is read by the owner-checked session's `institutionId`, so client-supplied `institutionId`, `ageBand`, `age`, `dob` or `learnerAgeBand` are ignored.
- **Minimum data to the provider.** At most the coarse band word and its source label. No DOB, exact age, grade, names or ids.

## 4. Tests (`backend/test/languageTeachingR3.test.ts`; `TEST-VERIFIED`, SDK mocked)

| Requirement | Test |
|---|---|
| A trusted band reaches the engine | `provenance: adult school → adult (known, school setting); others → unknown with the explicit source` (route) |
| Missing, malformed, label-like or conflicting values give `unknown` | `missing, false, malformed or label-like settings resolve to unknown` (8 cases) |
| child/teen can't be produced | `no input can produce child or teen` |
| Grade is never used; `unknown` doesn't inherit `adult` | `grade never reaches the age band; unknown never inherits adult` |
| Client age is ignored | `client-supplied age, band or another school id cannot change the band` (route) |
| Tenant scope | `a student cannot use another school's (adult) course to obtain its context` (route: refused, nothing built) |
| Provider payload | `coarse band only; no DOB, exact age, grade, names or ids` (route) |
| Age × CEFR independence | 7 matrix tests at engine level (**`MOCK-ONLY`** for child and teen: the band is injected as resolver output) |

## 5. Live provenance counts (every turn, by benchmark cohort)

**Official r3 run (219 turns):**

| Cohort | Band reaching the engine | Source | Turns |
|---|---|---|---|
| adult | adult | `school_setting_adult_learners` | 73 |
| child | unknown | `no_trusted_learner_age_source` | 73 |
| teen | unknown | `no_trusted_learner_age_source` | 73 |

**For comparison, r2:**

| Cohort | Band | Source | Turns |
|---|---|---|---|
| adult | adult | `school_setting_adult_learners` | 73 |
| child | unknown | `not_collected` | 73 |
| teen | unknown | `not_collected` | 73 |

**Stability repetition 1:**

| Cohort | Band | Source | Turns |
|---|---|---|---|
| adult | adult | `school_setting_adult_learners` | 25 |
| child | unknown | `no_trusted_learner_age_source` | 25 |
| teen | unknown | `no_trusted_learner_age_source` | 22 |

The r2 → r3 change is the source label only (`not_collected` became the explicit `no_trusted_learner_age_source`). **The requirement for a valid age-adaptation claim — child and teen reaching the engine from a trusted source on every turn — is not met: 0/146 child and teen turns.**

## 6. Age policy that exists but is inactive (ready for a trusted source)

The engine holds a band × CEFR policy (`LENGTH`, `AGE_REGISTER`) for child, teen, adult and unknown. The axes and invariants, test-verified at engine level:

**Differs by age (CEFR held constant):**
- the register line: tone, example contexts, steps per turn, independence expected;
- length: child ≤ unknown < teen < adult.

**Differs by CEFR (age held constant):**
- the level line: sentence complexity, scaffolding, elaboration;
- length increases with level.

**Identical across ages:**
- teaching moves for the same signals;
- lesson facts and objectives;
- the CEFR target;
- feedback policy (hint-first, retry rules);
- safety rules.

**Child safety:** the child register adds "one instruction at a time … nothing adult or frightening". The teen and adult registers say "never childish".

## 7. What is needed to unblock (product decision)

1. **Decide the source.**
   - Option (a), lowest effort: approve ENARA's existing grade-to-stage policy (the ped-v2 `gradeLevel` / K-5 / 6-8 / 9-12 bands) as an age-band source for the language engine. This needs an explicit decision, because grade isn't age and the brief currently forbids it.
   - Option (b): add a coarse, staff-set `learnerAgeBand` (child / teen / adult) at class or learner level, through an existing admin route, with tenant-scoped access.
2. **Define the band boundaries and who may set or see them.** No numeric thresholds are invented here.
3. **Extend the resolver with an explicit precedence order:**
   1. the adult-school setting, which overrides everything;
   2. the trusted learner or class band;
   3. otherwise `unknown`.

   Then re-run the frozen benchmark with fixtures created through that same server-side contract.
