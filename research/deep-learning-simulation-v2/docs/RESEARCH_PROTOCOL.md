# Research protocol (v2.0)

Simulation of AI students. It cannot establish that real students learn; it guides engineering and prioritises a real classroom study.

**Question.** Does the actual ENARA AI tutor produce larger and more durable measured learning in simulated learners than study notes, a generic AI tutor, a scripted human-like tutor, an ablated ENARA, or no teaching?

**Conditions.** A actual ENARA (real route) · B study notes · C generic AI tutor (Opus, minimal prompt + the same lesson spec) · D scripted human-like tutor (deterministic text) · E ENARA with adaptive features ablated (diagnosis, hint ladder, rule teaching, rule check, learner history, transfer check; answer-hiding guards stay on) · F no-teaching control. Exposure is kept comparable (same lesson content, same practice items, same turn budget; notes get the same practice list). Unavoidable differences are recorded per block (`unavoidableDifferences`).

**Design.** Crossed, balanced: each student studies 6 outcomes (one per skill area) each under a different condition (seeded 6×6 Latin-square rotation; block order shuffled). Outcomes are used equally often. Replications are independent runs with independent seeds. Analysis unit = student (paired differences); outcomes are a second cluster factor, so no pseudoreplication.

**Measurement.** Pre-test (2 items) → teaching → immediate post-test (2) → novel-situation transfer (2) → delayed tests (4 items at simulated 1, 7, 30, 30 days). Assessment items are never exposed to the tutor (static leakage validation, outgoing-request scanner, post-hoc transcript scan). The learner's only memory of teaching is a self-written note, subjected to seeded forgetting for delayed tests. Mastery = outcome-specific post and transfer thresholds fixed in the benchmark before any run; one correct answer is never mastery.

**Scoring.** Deterministic key/rubric scoring is authoritative (hedged answers are wrong). A separate blind judge model grades a seeded sample (never sees the condition, accepted-answer list, or the deterministic verdict); agreement/κ are reported and all disagreements are exported for human review. ENARA never grades itself.

**Pre-registration.** `config/preregistration.json` fixes the primary outcome and the confirmatory family before the main experiment; `lock-prereg` records its SHA-256 and the main experiment refuses to start unless the lock matches. Everything else is exploratory and labelled so.

**Failure policy.** Failed or incomplete blocks stay in the raw data and in every report. Unfavourable results are reported in full.
