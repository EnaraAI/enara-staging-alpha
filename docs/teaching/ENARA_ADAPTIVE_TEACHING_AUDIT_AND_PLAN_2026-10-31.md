# ENARA Adaptive Teaching Intelligence: audit, extraction and architecture plan (Phases A–B)

| | |
|---|---|
| Date | 2026-10-31 |
| Status | **Plan for approval.** No structural code changes yet. Nothing deployed, committed or pushed; no paid calls |
| Source of truth | *Enara AI Tutor — Teaching Methods Reference Guide* v1.0 (101-page PDF, provided as Markdown conversion), read in full |
| Code audited | `enara-staging-alpha` (backend `backend/src`, frontend `frontend/`) |

---

## Phase A1. The 23 methods: inventory and mapping

Legend for "ENARA today":
- **E** = exists in the strategy registry (`services/strategyRegistry.ts`, 11 strategies, picked by `pedagogyPolicy.selectStrategy`, version `ped-v1`).
- **P** = partial: exists as a system mechanism, but not as a tutor teaching method.
- **M** = missing.

| # | Method (guide) | Core mechanism (principle, not prompt wording) | Guide's selection cue | ENARA today | Proposed role |
|---|---|---|---|---|---|
| 1 | Direct Instruction | Gradual release: present → model → guided → independent; correct before moving on | New concept, no prior knowledge; procedural content | **E** `direct_instruction`. Its phases also exist as `guided_practice` and `independent_practice` | primary |
| 2 | Socratic Method | Learner reasons through probing questions (6 types); answer withheld | Has foundations; needs deeper reasoning | **E** `socratic_questioning`, plus legacy `TeachingMethod 'socratic'` | primary |
| 3 | Scaffolded Instruction | Minimum contingent support; fade on success (6-step ladder) | Partially correct; inside the ZPD | **E** `scaffolding` | primary or supporting |
| 4 | Mastery Learning | Criterion (≥80%) before advancing; diagnose sub-skill → corrective → reassess with new items | Sequential, hierarchical content | **P**: mastery model (`mastery-v1`, thresholds 0.70/0.85) and reassessment exist; not a tutor method | primary plus **policy** (gates advancing) |
| 5 | Inquiry-Based Learning | Phenomenon → hypothesis → incremental evidence → conclusion | Some baseline knowledge; science and social studies | **M** | primary |
| 6 | Problem-Based Learning | Ill-structured problem before teaching; learner names their gaps | Grade 7+; tolerates ambiguity | **M** | primary (multi-turn) |
| 7 | Case-Based Learning | Structured case → issue, constraints, options, decision → reveal | Judgment, applied reasoning, Grade 9+ | **M** | primary |
| 8 | Project-Based Learning | Driving question, milestones, critique-revise cycles, product | Multi-session, interdisciplinary | **M** | primary, coaching only (see limits) |
| 9 | Retrieval Practice | Recall before re-presenting; spread low-stakes recall throughout | Retention of facts and principles | **E** `retrieval_practice` | supporting or reinforcement |
| 10 | Spaced Repetition | Review at increasing intervals; reset on error | High factual load | **P**: `ReviewItem` (1/3/7/14/30 days) and `ObjectiveRetentionState` (`ret-v1`) schedule reviews; not linked to the tutor's choice | reinforcement plus **scheduler** |
| 11 | Interleaving | Mix problem types; learner classifies the type before solving | Several learned procedures | **M** | reinforcement (practice sets) |
| 12 | Worked Examples | Full narrated example → example-problem pairs → completion → independent; fade for experts | Novices; procedural domains | **E** `worked_example` | primary or supporting |
| 13 | Elaborative Interrogation | Learner explains *why*, causally | Some prior knowledge; facts with mechanisms | **M** | supporting |
| 14 | Analogical Reasoning | Familiar source → structural mapping → extend → test where it breaks | Abstract concepts | **E** `analogy` | primary or supporting |
| 15 | Metacognitive Strategy Instruction | Plan, monitor, evaluate one's own thinking | Able learner using ineffective strategies | **M** | supporting |
| 16 | Think-Aloud | Expert reasoning made visible; learner's reasoning as the diagnostic | Wrong answers from logical-seeming reasoning | **M** (`error_analysis` overlaps: "walk me through") | supporting |
| 17 | Concept Mapping | Labelled relations, cross-links, gaps | Consolidating interconnected content | **M** (`visual_explanation` is adjacent) | supporting or reinforcement |
| 18 | Differentiated Instruction | Adjust complexity and scaffold to readiness, silently | Always | **P**: mastery status and the learner snapshot exist; not applied as a modifier | **modifier** on any method |
| 19 | Adaptive Learning Pathways | Knowledge-component state; prerequisites first; decay → review; skip with verification | Always (system level) | **P**: `pathways.ts` (`path-v1`), prerequisite graph, `prerequisite_remediation` | **system policy** (the orchestrator itself) |
| 20 | Formative Assessment & Feedback | Every response is evidence; task, process and self-regulation feedback; never person-level | Always | **P**: diagnostics, evidence pipeline and grading feedback exist; not a tutor feedback rule | **modifier** (feedback policy) |
| 21 | Gamification | Challenges, streaks, levels; flow calibration | Disengaged learner; high-repetition content | **M** | supporting (engagement) |
| 22 | Narrative / Contextual Learning | Story creates the need → teach → return → transfer | Disengaged learner; abstract content | **M** | supporting (engagement) |
| 23 | Bloom's Taxonomy-Guided | Diagnose the cognitive level; target the next level up; never stop at levels 1–2 | Recall OK but application fails | **M**: no cognitive-level field anywhere | **modifier** plus question metadata |

**ENARA strategies not named in the guide** (keep them, as aliases or techniques):
- `visual_explanation`
- `error_analysis`, which overlaps Think-Aloud and Formative
- `prerequisite_remediation`, which is Adaptive Pathways in practice
- `guided_practice` and `independent_practice`, which are phases of Direct Instruction
- legacy `gap_filler`

**Totals:**
- **6 operational** as tutor strategies: 1, 2, 3, 9, 12, 14.
- **5 partial** as system mechanisms: 4, 10, 18, 19, 20.
- **12 missing**: 5, 6, 7, 8, 11, 13, 15, 16, 17, 21, 22, 23.

## Phase A2. Contradictions, rigid rules and overlaps in the guide

These are resolved in the registry design (Phase B), not by copying the injection prompts.

| # | Issue | Where | Resolution |
|---|---|---|---|
| C1 | **"DI" abbreviates both** Direct Instruction and Differentiated Instruction | §1, §18 | Stable IDs: `direct_instruction`, `differentiated_instruction` |
| C2 | Part numbering differs between the table of contents (I, II, III, V, VI, VII) and the body (I–VI) | ToC vs body | Cosmetic. Registry uses the body's grouping |
| C3 | Socratic: "never deliver the answer, even if frustrated". Scaffolded, Elaborative and Retrieval: "full answer as last resort" | §2 vs §3, §13, §9 | Composition rule: an **answer-withholding** primary cannot be combined with a last-resort-answer supporting method unless an explicit exit condition fires. Frustration or repeated failure is a **switching signal** (to Scaffolded), not a reason to withhold indefinitely |
| C4 | Socratic: "never say wrong". Formative: "the specific error is in [step]" | §2 vs §20 | The primary method's feedback style wins. Formative applies as a modifier only through task and process feedback, phrased as questions under Socratic |
| C5 | Worked Examples: "never ask a novice to solve a new problem type first". PBL and IBL: "present the problem before teaching" | §12 vs §5, §6 | PBL and IBL are **ineligible for novices** (mastery `not_assessed` or `emerging` with low evidence). Expertise-reversal rule |
| C6 | Interleaving: "never more than 3 consecutive same-type problems". Mastery and DI: 5–10 problems on one objective | §11 vs §4, §1 | Interleaving only once the objective is at least `developing`. Blocked practice is allowed during initial acquisition (the guide's own "first 5 minutes" exception) |
| C7 | Bloom's: "do not skip levels". Adaptive: "skip KCs after verification" | §23 vs §19 | Different axes: Bloom levels within a KC; skipping across KCs. Both kept |
| C8 | Gamification example: "see how fast you can go". Rule: "do not reward speed" | §21 | The rule wins; the example wording is not used |
| C9 | Spaced Repetition intervals: "days" in the description, "sessions" in the prompt | §10 | Scheduling stays in the existing day-based `ReviewItem` and `ret-v1`. The tutor only *uses* due items |
| C10 | Mastery: "≥ 80%". ENARA `mastery-v1`: proficient 0.70, mastered 0.85 plus 3 independent items | §4 | Keep ENARA's evidence model (stricter, already validated). Document the mapping: the guide's 80% sits between proficient and mastered |
| C11 | Socratic "exactly one question per response" vs Metacognitive's 3–4 planning questions | §2 vs §15 | The primary method's turn format wins; supporting methods contribute *at most one* move per turn |
| C12 | Rigid counts that cannot be verified in a chat turn: "≥30% higher-order questions", "3 levels of why", "assess readiness after 3 exchanges", "20% step errors" | §20, §13, §18, §1 | Treated as guidance in the prompt principles, **not** as enforced or measured rules (they cannot be measured without per-turn grading) |
| C13 | Project-Based Learning needs "sustained inquiry over time" and a "public product to a real audience" | §8 | Tutor role limited to **coaching** (planning, critique, revision prompts). Marked *partially operational by design* |
| C14 | Matrix gaps: Adaptive Pathways, Differentiated (except as a supporting method once), Think-Aloud as primary, Interleaving as primary, Gamification as primary have no situation row | Summary matrix | These are modifiers or supporting methods by design; the matrix is the seed rule set for compositions |
| C15 | "Copy this block directly into the system prompt" | All 23 | Not done. Each method keeps **principles + steps + prohibitions**, written as ≤ ~120-token instructions. Interaction examples (real companies and events, e.g. the BP case) are not used as content |

---

## Phase A3. Capability matrix

| Capability | Existing | Partial | Missing | Recommended action |
|---|---|---|---|---|
| **23 teaching methods** | 6 tutor strategies; 11-strategy registry with versions, intended uses and prompt instructions | 5 as system mechanisms | 12 methods; 2 unrelated method enums (legacy 3-value `TeachingMethod` vs registry) | Extend `strategyRegistry` to all 23 with the required fields (registry v2); map the legacy enum to registry IDs (no schema change) |
| **Method selection** | Deterministic `selectStrategy` (`ped-v1`): teacher override → prerequisite gap → misconception category → mastery status; decisions logged (`PedagogicalDecision`) | Applied only when a tutor session has `objectiveId`; skipped on the orchestrator path and in voice | Composition (primary + supporting + reinforcement); retention, error-type, Bloom-gap, age-level and time inputs | `ped-v2`: composition output, extra deterministic inputs, same decision log (new optional fields) |
| **Method switching** | One fallback step after new evidence (`STRATEGY_CHANGED`) | — | Explicit exit and switching conditions; avoiding methods that already failed; no switching without evidence | Per-method `switchWhen` and `exitWhen` rules; a switch requires a new evidence ID or an explicit in-session signal |
| **Knowledge diagnosis** | Objective-level mastery (`mastery-v1`, evidence-weighted, verification rule); misconception rules (`misc-rules-v1`); adaptive diagnostics (`diag-v1`); prerequisite graph | Concepts not modelled (`conceptIds` always empty); question `difficulty` unused | Cognitive (Bloom) level per question | **Learning objective = the concept/skill unit** (no new Concept entity). Optional `cognitiveLevel` (1–6) on questions; leave unset unless a teacher or authoring sets it (never inferred and stored as fact) |
| **Exam result integration** | Attempts → `question_answered` events → evidence (AI-graded weight 0.8) → mastery → misconceptions, TTU, retention, study-plan replan; per-question `objectiveIds`; grading provenance (`method`, proposals, `modelName`, `promptVersion`) | Per-criterion scores not mapped to the criterion's own objectives | **No assessment kind** (diagnostic, formative, quiz, unit, midterm, final, standardized, retention); no "delayed retention assessment" marker | Optional `assessmentKind` on Assessment (and override on Assignment), default `unspecified`; per-criterion evidence mapping |
| **Learning impact measurement** | `LearningIntervention` baseline and outcome mastery snapshots, `improved` flag; TTU `byStrategy` (explicitly descriptive) | Interventions are teacher-created only; tutor decisions have no outcome window | Pre/post windows per decision, score normalisation, comparability checks, evidence-quality labels | New derived `TeachingEpisode` (recomputable, append-only) plus a `teachingImpact` service; three-tier labelling (observed / associated / insufficient). Causal estimates only with a design (not built; see B6) |
| **Long-term retention** | `ret-v1` objective retention (fixed intervals); per-question `ReviewItem`; `retention_review` evidence type; 60-day recency in mastery | Not linked to the method used before | Retention outcome per episode | Retention window (≥ 7 days after the episode) computed from existing `retention_review` and independent evidence |
| **Teaching effectiveness analytics** | `/analytics/ttu` byStrategy (counts, medians, caveat); `/analytics/outcomes` (counts) | — | Baseline-adjusted, sample-size-gated comparison by method × objective/subject/level/baseline band/misconception | `method-effectiveness` aggregation with minimum-n gates and intervals; "insufficient evidence" as a first-class result |

## Phase A4. Examination data actually available

| Guide-requested evidence | In ENARA? | Notes |
|---|---|---|
| Diagnostic assessments | **Yes**, as `DiagnosticSession` (adaptive, `diag-v1`) | Not an `Assessment` kind |
| Formative, quiz, unit test, midterm, final, teacher exam | **Partly**: all are plain `Assessment`/`Assignment`; **the kind is not recorded** | Needs the optional `assessmentKind`; until then everything is `unspecified` |
| Standardized assessments | **No** | Out of scope until an integration exists |
| Delayed retention assessments | **Partly**: `retention_review` evidence from review items and objective retention | Usable for retention measurement |
| Question → objective | **Yes** (`IQuestion.objectiveIds`, rubric criterion `objectiveIds`) | Coverage depends on authoring; unmapped questions stay unmapped (no inference) |
| Subject / course / lesson | **Yes**, via Assessment `subject`, curriculum, `LearningObjective.courseId`/`lessonIds` | |
| Cognitive complexity | **No** | Optional `cognitiveLevel` |
| Max and student score | **Yes** (`points`, `maxPoints` per answer) | Normalise to a fraction |
| Assessment date | **Yes** (`submittedAt`, release time) | |
| Difficulty | **Partly**: question `difficulty` 1–5 (author-set, uncalibrated) | Used only as a comparability check, never as a calibrated scale |
| Grading provenance | **Yes**: `method` rule/ai/ai_proposal/teacher; proposals with `promptVersion` | Changes in grading method are a comparability flag |

## Phase A5. Learning-impact measurements: what the data supports

| Measure | Supported? | How |
|---|---|---|
| A. Baseline | **Yes** where objective-tagged evidence exists before the episode | Mean normalised score of independent evidence on the objective in a window before the decision, plus the mastery snapshot |
| B. Post-intervention | **Yes** with the same caveat | Independent evidence after the episode (tutor turns are never evidence) |
| C. Improvement | **Yes, as an observed change** | Post − baseline on the 0–1 scale, with comparability flags |
| D. Objective-level (concept) improvement | **Yes**, objective = concept unit | |
| E. Retention | **Yes** where `retention_review` or independent evidence arrives ≥ 7 days later | |
| F. Transfer | **Partly**: "new item" = an `itemKey` the student has not seen before | Comparability flag when item novelty is unknown |
| G. Mastery progression | **Yes** (`MasteryHistory`) | |
| Causal impact | **No** (no comparison design) | Reported as "not estimated" |

---

## Phase B. Architecture: the smallest compatible extension

```
Diagnose ─► Select (ped-v2) ─► Teach (tutor prompt) ─► Assess (existing engine + autonomous grading)
   ▲                                                         │
   └──── Adapt ◄── Update knowledge state (existing) ◄── Measure (TeachingEpisode)
```

### B1. Registry v2 (extends `services/strategyRegistry.ts`)
- All 23 methods use stable IDs, keeping the existing 11 IDs unchanged. New IDs:
  - `mastery_learning`, `inquiry_based`, `problem_based`, `case_based`, `project_based`
  - `spaced_repetition`, `interleaving`, `elaborative_interrogation`
  - `metacognitive`, `think_aloud`, `concept_mapping`
  - `differentiated_instruction`, `adaptive_pathways`, `formative_feedback`
  - `gamification`, `narrative_contextual`, `blooms_guided`
- **Fields:** `id`, `name`, `version`, `objective`, `learnerConditions`, `subjects`/`activities`, `requiredSignals`, `strategy` (principles), `phases`, `roles` (`primary | supporting | reinforcement | modifier | system`), `exitWhen`, `switchWhen`, `conflictsWith`, `assessmentRequirements`, `successIndicators`, `minLevel` (grade band), `withholdsAnswer`, and the existing `promptInstructions`.
- **Existing technique IDs** (`guided_practice`, `independent_practice`, `visual_explanation`, `error_analysis`, `prerequisite_remediation`) stay, tagged `technique`, with a `guideMethod` link (e.g. `guided_practice` → `direct_instruction`).
- **Legacy `TeachingMethod`** (`socratic | gap_filler | error_analysis`) is mapped via an alias table. No schema change.
- **Composition validator:** rejects conflicting pairs (C3–C6, C11) and enforces at most one primary, ≤2 supporting, ≤1 reinforcement, plus modifiers.

### B2. Orchestrator `ped-v2` (extends `services/pedagogyPolicy.ts`; deterministic, **no AI calls**)
- **Inputs:**
  - all of `ped-v1`;
  - retention due/decaying (`ret-v1`);
  - recent independent results and error types (misconception categories, careless vs systematic from evidence patterns);
  - recall-vs-application gap (needs `cognitiveLevel`; otherwise "unknown");
  - methods already tried on this objective and their episode outcomes (to **avoid repeating** a method that did not help; never to rank);
  - grade band (from class or curriculum where known);
  - session time budget (optional).
- **Output (stored on `PedagogicalDecision`, new optional fields):** `primary`, `supporting[]`, `reinforcement`, `modifiers[]`, `targetObjectiveId`, `gap`, `evidenceIds`, `expectedOutcome`, `switchWhen`, `confidence` (`low | medium | high`, rule-based), `limitations[]`.
- **Seed rules** come from the guide's selection matrix. Examples:
  - new objective → DI + Worked Examples (+ Analogy if abstract);
  - partial → Scaffolded + Metacognitive;
  - recall OK, application fails → Bloom-guided + Inquiry;
  - decaying → Retrieval + Spaced;
  - procedural practice at ≥ developing → Mastery + Interleaving;
  - systematic wrong strategy → Metacognitive + Think-Aloud;
  - disengaged → Narrative + Gamification.
- **Switching:** only on a new evidence ID (or a tutor-turn struggle signal, which is recorded as a *signal*, not evidence). Transitions follow `switchWhen`, e.g. DI → guided → retrieval; Socratic → Scaffolded → Worked Example.

### B3. Tutor wiring (extends `learningContext.buildObjectiveContext` and the shared `prepareTutorTurn`)
- Resolve the target objective when the session has none: lesson → approved objectives via `LearningObjective.lessonIds`. If ambiguous, no objective, and the decision records that.
- Render the composition as a short "Teaching plan" block in the existing "Learning focus" prompt. The assessment-integrity rule is unchanged.
- Store `decisionId`, `primary` and `supporting` on `tutor_messages.meta` (optional fields).
- Apply the plan on the direct-model path (chat, stream, voice); the orchestrator path is noted as not plan-aware (external).

### B4. Exam evidence (backward-compatible optional fields only)
- `Assessment.assessmentKind?` and `Assignment.assessmentKind?` (override), enum including `unspecified` (default when absent).
- `IQuestion.cognitiveLevel?` (1–6).
- Per-criterion evidence: rubric criterion scores emit evidence for that criterion's own `objectiveIds`. The weight policy is unchanged. Grading itself is untouched (leak guard, policies, auto-release, exceptions all unchanged).

### B5. Teaching Effectiveness Engine (`services/teachingImpact.ts`; model `TeachingEpisode`)
- **Episode** = (student, objective, decision(s), window). Fields:
  - tenant, class, origin;
  - method composition and version;
  - start and end;
  - baseline evidence IDs and score;
  - post evidence IDs and score;
  - retention evidence IDs and score;
  - transfer flag;
  - mastery before and after;
  - `comparability` flags;
  - `evidenceQuality` (`none | weak | moderate | strong`);
  - `label` (`insufficient_evidence | observed_change | associated_with_intervention`);
  - `limitations[]`.
- **Derived and recomputable** from existing evidence: no destructive migration, append-only history.
- **Comparability flags:**
  - repeated item (same `itemKey`);
  - difficulty difference beyond 1;
  - different assessment kind;
  - grading method changed;
  - gap below 1 day or above 60 days;
  - missing baseline;
  - fewer than 2 items on either side;
  - outside instruction unknown (always present).
- **Labels:**
  - `associated_with_intervention` only with no blocking flags, ≥2 independent items on each side, and post evidence after the decision.
  - Otherwise `observed_change`, or `insufficient_evidence`.
  - `estimated_causal` is **reserved and never emitted** without a design.

### B6. Method effectiveness (aggregation)
- Grouped by method composition × objective, subject, grade band, misconception category and baseline band (low/mid/high).
- Statistic: mean baseline-adjusted change with a bootstrap 90% interval. Shown only when n ≥ 10 episodes from ≥ 5 students; otherwise "insufficient evidence".
- No league tables of methods. Caveat text is always attached.
- **A causal design is out of scope** without approval. An optional randomised holdout (e.g. between two eligible compositions) would need a product and ethics decision.

### B7. Dashboards (extend existing pages and endpoints only)
- **Student:** `KnowledgeMap` gains gaps, an exam trend by objective and next actions. Data comes from the existing mastery, pathway and recommendation services.
- **Teacher:**
  - `ClassInsights` gains exam performance by objective, students needing support, interventions → outcomes with evidence quality, and data coverage.
  - Existing `learningAccess` scoping applies.
- **Academic manager:**
  - The `Outcomes` / `InstitutionAnalytics` read-only aggregates gain trends, objective weaknesses, method-effectiveness evidence with n and intervals, and retention.
  - Permission is the existing `insights:read_school`. No costs are shown.
- **Origin:** all views use the existing `originFilter` / `studentsInView` (live by default; demo labelled).

### B8. Cost and performance
- No new paid calls. Orchestration is deterministic, with database reads reusing the per-request memo.
- Prompt growth: the composition block is capped at roughly 300 extra input tokens per tutor turn. This will be measured offline with the existing token estimator; no live calls.
- Metrics:
  - orchestration latency (local timing);
  - additional tokens per turn (estimate);
  - cost per interaction, per assessment and per measurable intervention, computed from the existing `usage_ledger` (read-only).

### B9. Implementation phases (C1–C6), each with tests

| Phase | Scope | Tests (no AI provider, no mocks of one) |
|---|---|---|
| C1 | Registry v2 (23 methods, aliases, composition validator) | All 23 definitions complete; stable IDs; alias mapping; every conflict pair rejected; prompt length cap |
| C2 | `ped-v2` orchestrator + decision fields + tutor wiring | Scenario tests: beginner, partial knowledge, persistent misconception, advanced, decaying retention, insufficient evidence; transitions; no switch without evidence; legacy path unchanged |
| C3 | Optional `assessmentKind` / `cognitiveLevel`; per-criterion evidence | Backward compatibility (old docs load); mapping only when tagged; grading untouched (existing grading tests still pass) |
| C4 | `TeachingEpisode` + `teachingImpact` | Normalisation; comparable vs non-comparable; missing baseline; repeated items; misleading apparent improvement (easier test); improve-then-fail retention; decline; labels never "causal" |
| C5 | Method-effectiveness aggregation + API (scoped) | Min-n gates; tenant isolation; role matrix (student/teacher/manager/admin); demo/live separation; no cost fields |
| C6 | Dashboard extensions (frontend) | Type check, build, role-scoped rendering |

All scenario data is **synthetic and labelled as such**. No live-provider claims.

### B10. Decisions needed before Phase C

1. **Approve the plan scope** (C1–C6), or a subset. **C1–C4 is the core.**
2. **Approve the backward-compatible schema additions:**
   - optional `assessmentKind` (Assessment/Assignment);
   - optional `cognitiveLevel` (question);
   - optional decision fields;
   - optional tutor-message `meta` fields;
   - the new `teaching_episodes` collection.

   No migration of existing data, no deletions.
3. **Confirm the learning objective is ENARA's concept/skill unit** (no new Concept entity).
4. **Confirm prompts are written from principles** (≤ ~120 tokens per method), not pasted injection blocks.
5. **Whether to plan a randomised holdout later** for causal estimates (not built now).
