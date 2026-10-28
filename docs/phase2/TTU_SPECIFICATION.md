# Time to Understand (ttu-v1)

Code: `services/timeToUnderstand.ts`; collection `time_to_understand`.

## Definition
The **active instructional time** between a documented learning gap on an objective and the next **independent demonstration of understanding**. Elapsed calendar time is recorded separately.

- **Gap**: mastery status becomes emerging or developing on independent evidence. Opens one episode per student and objective (at the time of that evidence).
- **Verified**: a later correct answer that is independent (assessment, diagnostic or spaced review; no assistance) and the status reaches proficient or mastered. Assisted success never verifies.
- **Active instruction time** (recomputed from events each time, so nothing is counted twice):
  - tutor turns in chats targeting the objective: the first turn counts 30 s; each gap between turns counts up to 5 min (longer gaps are treated as a pause);
  - visible time on lessons linked to the objective (the browser stops counting when the tab is hidden), at most 60 min per view.
  - Not counted: assessment and diagnostic time (measurement, not instruction), background tabs, untargeted chats.
- **Abandoned**: no new evidence for 60 days (daily job). Kept, never deleted.

## Analytics (`GET /api/learning/analytics/ttu`)
Counts of verified, in-progress and abandoned episodes; for verified ones the 25th/50th/75th percentile of active minutes and median elapsed days; and per strategy used. In-progress and abandoned episodes are reported separately (censored), never as zero or infinite. Times should be compared within an objective, not across objectives of different size. Strategy rows describe what was used, not what caused understanding. Teachers see students in their classes; admins their school.
