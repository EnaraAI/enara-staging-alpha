# Phase 2 (ELIE): Security Review

Review of the Learning Intelligence Engine code on `phase2-elie` (Sprint 7). Every "Tested" row names the test that ran; "Reviewed" means read in code, not tested.

## Summary
- No critical issue introduced by Phase 2 was found.
- **One open blocker for a school pilot, from before Phase 2: S1** (account takeover through registration). It exposes everything a student account can see, now including mastery, misconceptions and recommendations. Fixing it needs the owner's approval (it was excluded from Phase 0 on request).
- Fixed in Sprint 7: learning routes were rate-limited only per IP address, so a class on one school network could lock itself out (and one user couldn't be limited individually). They are now limited per verified user.

## Access control
| Area | Rule | Evidence |
|---|---|---|
| Tenant isolation | Every query filters by the caller's school; Enara admins name a school explicitly | Tested: `elie.sprint1`–`sprint7` cross-school cases (objectives, mastery, insights, analytics, retrieval, processing status) |
| Students | Only their own records (`me` or own id); other ids return 404, not 403, so ids can't be probed | Tested: `elie.sprint7` security, `elie.sprint2`, `elie.sprint3` |
| Teachers | Only classes they instruct (`CourseInstance.instructorIds`) and students in them | Tested: `elie.sprint5`, `elie.sprint7` |
| Objective changes | Staff only; teachers only for curricula they teach; approval in prerequisite order; history kept | Tested: `elie.sprint1`, `elie.sprint7`, `elie.e2e` |
| Feature flags | Enara admins only; shadow mode Enara admins only | Tested: `elie.sprint1`, `elie.sprint7` |
| School analytics, shadow comparison | School admins (own school), Enara admins (named school) | Tested: `elie.sprint6`, `elie.sprint7` |

## Data integrity
| Risk | Control | Evidence |
|---|---|---|
| Spoofed events | Browser-reported events can't claim `verified`; AI output never becomes evidence | Tested: `elie.sprint1`, `phase1` |
| Duplicate submissions | Idempotency keys (unique index); diagnostic answers accepted only for the current question, atomically | Tested: `elie.sprint1`, `elie.sprint3`; perf script re-sends 10,000 events with no duplicates |
| Concurrent mastery updates | Unique (student, objective) state; 200 concurrent recomputes left no duplicates | Measured: `perf/elie.perf.ts` |
| Answer-key leakage | Diagnostic questions and reports never include `correctAnswer`; the tutor prompt has an integrity rule | Tested: `elie.sprint3`, `elie.e2e` (every served question checked); evaluated: 3 live cases, see `EVALUATION_RESULTS.md` |
| Query injection | `rejectMongoOperators` on request bodies | Tested: `elie.sprint7` |

## AI and curriculum content
| Risk | Control | Evidence |
|---|---|---|
| Prompt injection in uploaded files | Passages are escaped, wrapped as `<source>` data, with an instruction never to follow text inside them | Tested: `elie.sprint6` (escaping); evaluated: 1 live case, injection ignored |
| Prompt injection from the student | Integrity and role rules in the system prompt | Evaluated: 1 live case, refused |
| Invented citations | Only sources retrieved for that turn and cited by number are attached | Tested: `elie.sprint6` |
| Tutor context leaking other students | Context is built from the session's own student id; only objective codes, counts and the student's own misconceptions | Reviewed: `services/learningContext.ts` |
| AI-generated objectives | Drafts only, need a person to approve; can't overwrite existing codes | Tested: `elie.sprint1` |

## API abuse
- `/api/learning/*`: 240 requests a minute per verified user, counted after authentication, so random tokens are rejected (401) before touching the counter. Tested: `elie.sprint7`.
- Other `/api/*` routes keep the existing 300 a minute per IP. **Note (not changed, outside Phase 2 scope):** quizzes and the tutor share that per-IP budget, so a large class on one school network could hit it. Recommended follow-up: key the general limiter by verified user too.
- Objective extraction (AI): 10 an hour per user, unchanged.

## Privacy and logging
- Logs carry the request id (`X-Request-Id`) and record ids; they don't log tokens, passwords, answers or tutor message text. Reviewed: `utils/logging.ts` callers added in Phase 2.
- Disabling a flag hides features and stops processing but keeps data (flags never delete).
- Passages are derived from school uploads and deleted when the file is removed.
- Not done: a retention period for learning events and evidence. It needs the school data-retention policy, which isn't written yet.

## Open items
| Id | Severity | Item | Remediation |
|---|---|---|---|
| S1 | High, pilot blocker | Registration links a new account to an existing student by email without verification (`auth.controller.ts`) | Require an invite code or email verification before linking; owner approval needed |
| S2 | Medium | General `/api` limiter per IP can throttle a class on one network | Key by verified user for authenticated requests |
| S3 | Low | No data retention period for ELIE records | Apply the school retention policy once defined |
| S4 | Low | Teachers sign in through the admin tile (D10); admin-only pages refuse them correctly, but the navigation shows them | Teacher portal (follow-up) |
