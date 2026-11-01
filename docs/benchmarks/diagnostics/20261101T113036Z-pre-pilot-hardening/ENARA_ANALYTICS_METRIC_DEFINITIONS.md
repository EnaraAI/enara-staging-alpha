# ENARA — Analytics Metric Definitions (canonical)

**Source of truth:** `backend/src/services/scoreMetrics.ts`, used by `analyticsService` (school dashboard, course analytics, assistant aggregates) and `educatorAnalytics` (Educator Chat reports, tables, charts).

## Score

| Item | Definition |
|---|---|
| Counted attempt | `status: 'submitted'`, a finite `score`, and for assignment work `gradingStatus` ∈ {`finalized`, `released`}. Older self-paced attempts (no assignment) count with no grading state or a final one. |
| Excluded | Drafts / in-progress, `grading_queued`, `grading_in_progress`, `grading_failed`, `needs_review`, `graded_draft`, `grading_exception`, and any attempt without a score. |
| Deduplication | The latest counted attempt per student and piece of work (assignment, or the assessment for self-paced work). Ties go to the later id. |
| Window | Assignment work: the assignment is published or closed and **due** within the window, never in the future. Self-paced work: submitted within the window. Default 90 days (`SCORE_WINDOW_DAYS`). Educator Chat accepts explicit periods up to 365 days. |
| Missing work | **Never a zero.** It is excluded from averages and reported as a submission rate and a missing count. |
| Average score | The mean of counted scores. A student's average is the mean of their counted work; a school or class average is the mean of student averages (dashboard) or the mean over pairs (Educator Chat, stated in each report's definition). |

## Other metrics

| Metric | Definition | Source |
|---|---|---|
| Submission rate | Submitted (assignment, student) pairs ÷ all due pairs for the authorised roster | `educatorAnalytics.loadPairs` |
| Missing | Due date plus extension passed and nothing submitted | `assignments.studentStatus` |
| Roster | Current class membership (`studentIds` or batch) ∩ the assignment's student list | `learningAccess` |
| Weak objective (gap) | `masteryStatus` ∈ {emerging, developing} ÷ assessed, within the caller's school | `educatorAnalytics` learning_gap_summary |
| Mastery | mastery-v1 (60-day half-life; thresholds 0.85 / 0.70 / 0.50) | `masteryModel` |

Every report carries period, scope (classes, student count), definitions, sample sizes (`n`) and caveats. The chart, the table and the summary come from **one backend result**. Equality is TEST-VERIFIED by the journey test step 11.

## Known gaps

- **No withdrawn/inactive status (R-12).** "Withdrawn" means "not on the current roster"; it is not inferred from inactivity.
  - Proposed additive field: `Student.enrolmentStatus` (`active` | `withdrawn`, `withdrawnAt`).
  - Backfill: all existing students `active`.
  - Not written, not run.
- **Topic accuracy** on the dashboard still uses every submitted answer (an answer-level metric, not a score), and is labelled as such.
- **Legacy credits** (`StudentCredit`) and plan credits (`CommercialPlan`) coexist (R-25).
