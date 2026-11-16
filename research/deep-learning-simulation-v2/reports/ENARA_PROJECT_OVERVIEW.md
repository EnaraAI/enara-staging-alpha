# ENARA tutor evaluation and improvement: what we did, overall

*14 Nov 2026. Branch `claude/codebase-review-kbxqan`. **Everything below is about AI-simulated learners (and, in the last stage, AI-played tutors and AI raters). Nothing here is evidence about real learners.** Owner's ship bar: "I'm not gonna ship it until Enara clearly beats the plain AI tutor."*

## 1. Bottom line

- **The ship bar is not met.** ENARA clearly beats *no teaching* (about +16 points of learning gain, Experiment 3), but in every comparison it has not clearly beaten a plain AI tutor.
- Learning-outcome experiments (Experiments 2 to 5b, AI students): ENARA minus plain tutor was −8, −4 and −4.3 points of gain (Experiments 2, 3, 4; intervals include zero). Experiment 5b, with v2 engine changes: −0.003 [−0.105, +0.097] (196 matched triplets). Not a win, not clearly a loss.
- Transcript-quality studies (AI raters): ENARA is **clearly ahead on making students reason and on not giving answers away**, **clearly behind on explanation clarity**, and **level or slightly behind overall**. Recap used to be a big gap and is now mostly closed.
- ENARA costs about **2.2× the plain tutor per lesson** (Experiment 4: $0.160 vs $0.072 per block).
- The only decisive test left is a **classroom pilot with real learners and teacher review**.

## 2. Timeline

### 2.1 Built the research platform (`research/deep-learning-simulation-v2/`)
- v2.0 engine and a 48-outcome benchmark across six skill areas, sealed hold-out set (16 outcomes), preregistration with SHA-256 locks, append-only provider ledger with budget safe-stop, outgoing leakage scanner, in-process real-ENARA runtime.
- Simulated students: numeric state plus seeded per-item behaviour flags (lapse, guess, slip), forgetting model, explicit hidden-knowledge line in the answer prompt, majority-of-3 answers, blind judge (agreement 94.3%, κ 0.89 in Experiment 4).
- Statistics: matched triplets, two-way student × outcome cluster bootstrap, sign-flip permutation, Holm correction, Hedges g / d_z.
- 75 research tests pass; 163 related backend tests pass (17 files). 5 backend tests fail identically on the base commit (not ours).

### 2.2 Validation campaigns
- Campaign 1 exposed a weak simulator (2-item stages, insensitive answers). Fixed with 4 items per stage, majority-of-3 sampling, hidden state in the answer prompt, difficulty slip; campaign 2 confirmed.
- Scanner false positives (short generic phrases) fixed by requiring ≥6-word matches and rewording two items.

### 2.3 Experiments 2 to 4 (learning outcomes)
| Experiment | Question | Result (gain, simulated students) |
|---|---|---|
| 2 and 3 | Real ENARA (A) vs plain Opus tutor (C), notes, scripted tutor, ablation, no teaching | A − C = −8 and −4 points (n.s.). ENARA vs no teaching ≈ +16 points. |
| 4 (300 matched triplets, hold-out outcomes, $119.43) | Improved ENARA (closing, strategy, coverage prompts) vs current vs plain | B − A +0.033 [−0.044, +0.107]; B − C −0.010 [−0.086, +0.067]; A − C −0.043. **Fixes not recommended on this evidence.** Behaviour changed (recap 7% → 89%) but learning did not. |

### 2.4 Gap analysis and system deep dive
- Gap analysis of Experiment 3 (7 deliverables: metrics, casebook, roadmap, CSVs).
- Deep dive of the tutor code found 12 gaps (G1 to G12). Key ones: the "teach the rule after repeated misses" branch could not fire on wrong answers (G1); production has no closing recap or coverage plan (G2); learner state trusts the model's own grade (G3); no belief tracking (G4); no instruction to hold a correct position (G5); the prompt was never cached (G6, input tokens 2,741 to 4,079 with cache_read = 0); exact-string answer matching (G7).

### 2.5 Engine v2 (production code, all default off)
Switches in `backend/src/services/engineV2.ts`, set with `ENARA_ENGINE_V2="..."`:
| Switch | What it does | In `all`? |
|---|---|---|
| `wrongAnswer` | teach the rule after a recorded wrong attempt (G1 fix) | yes |
| `belief` | tutor names the learner's mistaken idea; repeated ideas trigger hold-the-line + scope rule (G4, G5) | yes |
| `memory` | beliefs, what worked and due reviews persist across sessions; opening review; `GET /tutor/reviews/due` (G11) | yes |
| `cache` | stable instructions first with a cache breakpoint (G6; 36% fewer non-cached input tokens measured) | yes |
| `arbitration` | one order of authority between the 23-method teaching plan and the language engine (G10) | no |
| `keyMatch` | contractions match as full forms (G7, partly) | no |
| `closing` | closing recap, rule-in-own-words ask guaranteed by the engine, once only | no |
| `selfCheck` | hold back credit when the learner's answer has no target form but the tutor said CORRECT (G3) | no |
| `clarity` | when stuck / asking why: rule in one plain sentence, right-vs-wrong contrast, ask to apply | no |
| `hints` | change the form after two same-shape hint questions; explain after the first miss | no |

Also: chat and avatar share one language-turn pipeline; research-only flags `ENARA_RESEARCH_IMPROVE` and `ENARA_RESEARCH_ABLATE` (ignored in production). Docs: `docs/ENARA_ENGINE_V2.md`, `docs/ENARA_TUTOR_CAPABILITIES.md`, `docs/ROADMAP_WORLD_CLASS_TUTOR.md`. Tests: `backend/test/{engineV2,engineV2Closing,researchImproved,researchAblation,avatarLanguageLink}.test.ts`.

### 2.6 Experiments 5b and 5c (v2 engine, evidence seeding)
- Credit ran out mid-run; only complete triplets analysed (196 in 5b, 39 in 5c). Failed-block records and an accidental early retry are preserved and documented.
- 5b: v2 arm vs plain −0.003 [−0.105, +0.097]; improved vs current +0.015 (n.s.). 5c: uninformative (39 triplets).
- Ledger cost gap found and fixed (cached tokens were unpriced); v2 arm costs roughly $0.131 to $0.139 per block vs $0.158 for current ENARA.
- Total recorded provider spend across the project ≈ **$295**. Missing B blocks (≈$28) were not re-run because API credit is exhausted.

### 2.7 Work done without the API (AI agents instead)
All of this uses sub-agents on the user's account. Raters are AI models of the same family as the tutors.
1. **Blind transcript rating of 5b** (48 triplets, 2 raters each): overall A 3.59 / B 3.46 / plain 3.60. ENARA better on reasoning (+0.88) and answer protection (+1.12); worse on recap (−1.2) and clarity (−0.35). v2 did not improve what raters see.
2. **Offline stuck-point replay** (18 cases, real engine prompts): new switches raised recap by +1.61; overall, clarity and helping the student get unstuck moved by +0.1 to +0.2 (n.s.); reasoning dipped −0.56 (borderline).
3. **Agent-run pilot** (6 matched triplets): new switches 3.83 vs plain 3.67 overall (+0.17, n.s.).
4. **Agent-run study, 18 triplets**: current ENARA 2.81, new switches 3.72, plain 3.94 (new − plain −0.22, n.s.; clarity −0.47 clear; reasoning +0.83 and answer protection +0.69 clear; recap level 3.47 vs 3.61).
5. **Fixes check, 18 triplets** (after fixing the recap loop and a spurious clarity trigger and adding `hints`): earlier 3.17 / fixed 3.58 / plain 3.75. Hint progression now level with the plain tutor (−0.11); clarity still behind (−0.44); overall −0.17 (n.s.). The "own words" ask appeared 3+ times in 10 sessions before, 2 after.

## 3. Bugs and mistakes found along the way (disclosed)
- Preregistration hold-out hash typo (corrected before any run, amendment logged).
- Regression-check metrics redefined after seeing a first FAIL (disclosed).
- Accidental `git stash` truncated live run files once (recovered; never stash with live data).
- Retry started in the same step as a failed credit check, producing extra failed records (documented).
- Earlier statement "teach the rule after the second miss" was only true when the learner asks why or for a hint (G1).
- My own `closing` switch repeated the ask every turn from the 5th (fixed); the `clarity` switch fired after every evaluated answer because `errorRecurrence = "unknown"` is truthy (fixed). The 18-triplet results for the new-switches version therefore reflect these bugs.

## 4. What ENARA is good and bad at (consistent across studies)
- **Ahead of the plain tutor:** makes students reason; does not hand over answers; protects its position when pushed (level in most studies).
- **Behind:** explanation clarity (every study); recap/consolidation (largely closed by `closing`); cost (2.2×).
- **Unknown:** whether any of this changes learning in real students; memory across sessions (the one thing a plain tutor cannot match) was not measurable in single-session simulation.

## 5. Limits that apply to all of it
Simulated learners (language models, not validated against real students); six tutor turns per session; few outcomes per area; one replication per student; AI raters (same family, moderate agreement, correlation about 0.6 to 0.75); agent-run studies use one model for both roles inside one context and give the tutor only the language-engine instructions; engine history reconstructed from dialogue; most agent-study intervals uncorrected; no post-test in the agent-run studies.

## 6. Open items
1. API credit is exhausted; missing 5b/5c B blocks (≈$28) not run; a full pre-registered paid comparison of ENARA with `wrongAnswer,closing,selfCheck,clarity,hints` vs the plain tutor would cost about $60 to $120.
2. Clarity is the remaining visible gap. Ideas not yet tried: state each new rule plainly the first time it comes up, shorten the recap, and check whether the Socratic habit itself causes the "never states the rule" complaint.
3. Deep-dive gaps still open: G9 (reading/writing/functional kinds, reading guard exemption), G12 (guard over-removal, streaming leak, hints-only enforcement), student erasure (no pipeline exists), multi-session experiment design.
4. Real classroom pilot with teacher review (`PILOT_PROTOCOL_learning_outcomes.md` exists).
5. Rotate the API key that was shared in chat.

## 7. Where things are
- Reports: `research/deep-learning-simulation-v2/reports/` (`exp4/EXPERIMENT_4_REPORT.md`, `exp4/EXPERIMENT_5B_5C_INTERIM.md`, `exp4/TRANSCRIPT_RATING_5B.md`, `exp4/OFFLINE_STUCK_REPLAY.md`, `exp4/AGENT_SIM_PILOT.md`, `exp4/AGENT_SIM_18.md`, `exp4/AGENT_SIM_FIXES.md`, `ENARA_SYSTEM_DEEP_DIVE.md`, gap-analysis files).
- Raw run data: `research/deep-learning-simulation-v2/runs/` (immutable).
- Code: `research/deep-learning-simulation-v2/src/`, `backend/src/services/` (v2 changes, all default off).
