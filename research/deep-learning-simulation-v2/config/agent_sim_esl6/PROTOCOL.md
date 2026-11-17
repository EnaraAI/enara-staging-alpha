# SIMULATION ONLY

# ESL stage 6: confirmatory protocol (pre-registration, DRAFT)

This file must be committed before any ESL6 tutor reply is written. Nothing below may change after the first tutor reply is applied; any departure goes in `config/agent_sim_esl6/DEVIATIONS.md`. No real learners take part, and no API is called. Tutors, judges, raters, scorers and fidelity checkers are agents, with at most 3 running at a time. The binding user decisions 1–7 of `DECISIONS_FOR_PROTOCOL.md` (SHA-256 `6bba106b…b932e7`) are copied into the sections named in brackets: scoring (1, section 7), grader guard (2, section 10), ENARA arm with graderV2 (3, section 2), model path not used (4, section 7), 30 outcomes (5, section 5), forgetting check failed (6, section 12), sample size n = 180 at ~65% power (7, section 4).

## 1. The one claim

On new explicit-first (A1/A2) learners, each taught one of 30 A1–A2 form outcomes, ENARA with `levelExplicit` plus the ESL5 bundle after the ESL5 instruction fixes, with graderV2 ON (arm **LE**), beats the strong plain baseline of ESL4/ESL5 (**P+**, arm **PP**) on the **delayed** outcome assessment (form given 7 simulated days after session 2), in percent of points.

## 2. Arms (exact configuration)

### PP = P+ (unchanged from ESL4 and ESL5)
- **Prompt:** exactly `config/agent_sim_esl4/PPLUS_PROMPT.txt`, SHA-256 `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472` (the hash cited in ESL5 PROTOCOL §2; re-checked 2026-11-16). The ESL6 runner refuses to run if the hash differs.
- **Appended data:** `Learner level: <A1|A2|B2> (CEFR)`, the lesson data of the learner's outcome (title, objective, objectives, success criteria, vocabulary, grammar, examples, practice exercises) and the conversation so far, exactly as in ESL4/ESL5.
- **Excluded:** no engine, moves, switches, record or reply guards. `ENARA_ENGINE_V2=""`. Replies stored as written.

### LE = A0+LE+esl5 (after the ESL5 instruction fixes), graderV2 ON
- **Env:** `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,graderV2"`. This is the ESL5 LE string with `graderV2` appended (DECISIONS 3). `esl5` turns on `liveError`, `releaseAfterTwo`, `reviewOpen`, `fadeKnown`, `ownSentence`; `graderV2` is named-only (not turned on by `all`) and affects the in-lesson key (`evaluateAgainstKey` → `matchKeyV2`, fixes 1, 3, 5) and the selfCheck hold-back (`docs/GRADER_FIXES.md`). `shortRecap` is not used.
- **Engine version:** the engine as committed after the ESL5 instruction fixes (`docs/ESL5_INSTRUCTION_FIXES.md`): fixes 1–3 and the conflict scan (last fix commit `fd478f4a116a9a562076aa7cad97cdee32f52b45`) plus the levelExplicit closing-turn follow-up `8a4adb94397057912f238f6939f7adf3c34a9a76`. The frozen tree is the repository HEAD at the commit of this file, currently `d0c3c21a9ad374270c9e30e5cdd88de7b212f311`, which also contains the graderV2 commits up to `43fc12ab97d70843359f7a928d45065e5a7c45f5` (word-target items never sent to the model meaning check). File hashes are in section 3.
- **Changed from ESL5 (consequences of the fixes):** the tutor prompt now asks for the hidden `[[assess ...]]` marker and no runner line forbids it (fix 1). The ESL6 runner strips and parses the marker with the production parser (`stripAssessmentMarkers` → `finalizeLanguageTurn`) instead of the ESL5 stand-in (a). Stand-in (b) (lesson id constant `lsn`) is kept.
- **Teaching plan, prompt build, reply guards, record:** as ESL5 PROTOCOL §2 (`detectTurnSignals`, `selectLanguageMoves`, `esl5Adjust`, `ruleFirstDecision`, `researchSignals`, `renderLanguageContextPrompt`, `applyReplyGuards`, `completeLanguageTurn` without institution/student ids; record `{ entries, liveErrors, knownPoints }` carried from session 1 to session 2).
- **What the engine sees:** only the learner's messages, the lesson data, the course level, objective record status and ENARA's own stored record; never the simulator state, belief labels, strengths, seeds or the assessment answers. `promptcheck` (as ESL5) is run before every round's tutor cells; any LE finding stops the run. The check list adds the outcome ids' belief texts from LEARNING_RULES §1b and the assessment item prompts/keys.

## 3. Frozen components (SHA-256 at the time of writing; re-hashed and confirmed by `init`)

| File | SHA-256 |
|---|---|
| `backend/src/services/engineV2.ts` | `b79ee7c6197e837b96e645f9d0b04793d6db560dd040726427bad53fba639b3b` |
| `backend/src/services/languageTeachingContext.ts` | `1464523f4f16b03518939896589b560472833f9d3aedb93f4d21297109886630` |
| `backend/src/services/languageTurnPipeline.ts` | `234cdbdf841eef92e700f82df0420bd60c07328c0636eadb2fc917cd8c97660b` |
| `backend/src/services/languageLearningState.ts` | `9172958ea93ebf9718af3daeba1b3d99765c4bf8225faa7e6955a7fc2b9d066b` |
| `backend/src/services/learnerLanguageProfile.ts` | `78e783f1d129339aa84e45fc6d49a3a2090ff09fe4f103793fb21ad936f56ec4` |
| `backend/src/services/strandLog.ts` | `0e45c79426e1b6321f8f40f282d4d502f86accb0e338882bd8f21fff88a05553` |
| `backend/src/services/pedagogyPolicy.ts` | `fd0cad88cd51aa5ff5f80432d93ae1187221a4f106011a20803de0744ba7efbf` |
| `backend/src/services/learningContext.ts` | `556c1ad4fa083732b41dc633d4c0363e971c29f19c15a51220235e9e1e87ca6c` |
| `backend/src/models/LearnerLanguageProfile.ts` | `fbab9ad58f4d4a76d04bea2320dbf2a87c67f5f08c309519866045d7704dd01a` |
| `backend/src/services/graderV2.ts` | `56e09319a644601616e805673842b9816111a335d03b63da714ff01615e17645` (round-8 fix, DECISIONS 12) |
| `backend/src/services/grading.ts` | `dc0080001018d3cf7fae39b0a3919fa4e1ddd4a115136543ca1f586d234e601c` |
| `backend/src/services/assessmentSecurity.ts` | `56c79bda5764d5e4b9aa201c38ec723cf6780bbd2a4add7c246007a4cfd2f477` |
| `data/assessments/outcomes/*.json` (33 files, concatenated in name order) | `bf78f551a5292cd88632794618922bebf4f02efe372ece6d945a78a3be4383e4` |
| `docs/SCORING_RUBRIC.md` | `947b603294bc47f12cad7ed28c567ee2372712d167dc70ce185dc7e0e1172008` |
| `src/offline/learnerSim.ts` (session simulator, unchanged since ESL4) | `711c8334b6323dc9e72a5617072edf3b9fc808499080ca52f1d62aa78f71ebd4` |
| `src/offline/eslFixtures.ts` | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |
| `config/agent_sim_esl6/LEARNING_RULES.md` | `c705d576da041c9ba012c105b4f6237f682a549a8c36089a6f33bdf31ddf8c4c` |
| `config/agent_sim_esl6/F1_PARAMS.json` (F1 v2) | `f75f568059c95cb5b5fb6aa63bb318ce594533852eaa8831c212411d4ee1d584` |
| `config/agent_sim_esl6/DECISIONS_FOR_PROTOCOL.md` | `6bba106b5e271b6139719baa132bbc92937c6e9457d5d06205acab8356b932e7` |
| `config/agent_sim_esl6/POWER.json` | `c55f59ce922b82a61d3439f0081d3e6fe2696ffda910ebc620f62b0050496b57` |
| `src/offline/esl6_power.py` | `0ec99a73e53f1c8d515dddc919d3309b028e6536b62f690abc5e5f9d776fd78f` |
| `reports/exp4/agent_sim_esl6/validation/JUDGE_TASK_ESL6.md` (validated judge task) | `b081773d1538b35b13b88a3ca4c8020998cc967bb007af7e1a1cfbb634cd604a` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `config/agent_sim_esl4/PPLUS_PROMPT.txt` | `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472` |
| `config/agent_sim_esl4/RATER_INSTRUCTIONS.md` (reused unchanged) | `77b8c0e6040b4bf5d8b3fb60ed23ea4e1d1ffc4f127f1cb52bf4346e9b1c69a8` |
| `config/agent_sim_esl4/FIDELITY_INSTRUCTIONS.md` (reused unchanged) | `f4c0b7aa1e98e96ceb1ab16d00c381b50ae1e06215e457b6f3b6784b7fdd53e3` |
| `src/offline/esl6Study.ts` (runner) | `f95136c212130a1bbcc7a883a24ae25402f78a12e770eb9d16c4d598ea0a83e7` |
| `src/offline/esl6_analyze.py` (analysis and decision rule, sections 8–11) | `c65c41a681c3097af1ba9c45aee756cd94bab59064266a76a68850d0527ddd70` |
| `src/offline/esl6Fixtures.ts` (lessons of the 30 outcomes) | `bda973481e314b0532557296e78dbd0679a0688f42ff8aa7b70a6f7189fa1cb7` |
| `src/offline/esl6_forget.py` (F1 v2 and event rules, called by the runner) | `8cf37577da5cdb5d574a63cb2e8db6e0504a4814b039134292335072a2a960c1` |
| `src/offline/esl6_outcomes.py` (belief texts of the 30 outcomes, called by the runner) | `3a39d975457fc30c83f4b7e57c8816b06a0868648f9c72faade83da6fc92d34d` |
| `config/agent_sim_esl6/ITEM_BELIEF_MAP.json` | `0777abaf88d5e952b0d1a184b254a6c698fa839f578337a49fff95aabaa751d7` |
| `config/agent_sim_esl6/WRONG_ANSWERS.json` | `79a5d9bd40ab9e193c9a86ae6fb69e44e3e8db4c88837e9674f1fb31f283a81e` |
| `src/offline/esl6_answers_build.py` (authoring record of the two files above) | `1556e486d243e3609153a86a25bb2ba2f63de56788dd91efaad98659a72c69cc` |
| `config/agent_sim_esl6/tasks/TUTOR_TASK.md` | `d4db4f170c18e2000384c10384793a60e5dc06396067ba6a75ace5b52d843a8c` |
| `config/agent_sim_esl6/tasks/JUDGE_TASK.md` | `9fd641436798a9444ead874b9e68c60e9d1ed0ea93cbd88fe97f58ac1d6e5fd0` |
| `config/agent_sim_esl6/tasks/RATE_TASK.md` | `f3b7aff3a6d468bc85d88b9399404d951e0e021f21f7d3dbfd11425ece656da3` |
| `config/agent_sim_esl6/tasks/FID_TASK.md` | `0fa3b6532e2ba55fc70db8825f6d3d8deec466a071ba780456562b0fef4a743d` |
| `config/agent_sim_esl6/tasks/RECHECK_TASK.md` | `1cca3b82f9078e45e4fb0994037ca745671c6580f887a97b53fbd0dd2878bc79` |

**Written for this protocol (hashed in the table above; `init` re-hashes every row and refuses to run on any difference, `esl6Study.ts hashcheck`):** the runner `src/offline/esl6Study.ts` (commands hashcheck, answercheck, overlap, init, tprompts, promptcheck, tapply, status, jprep, japply, f1, assess, post, tags, agreeprep, agreescore, recheckprep, recheckscore, rateprep, fidprep; dry-run helpers refused outside a folder holding a `DRY_RUN` file), the analysis `src/offline/esl6_analyze.py`, `ITEM_BELIEF_MAP.json` and `WRONG_ANSWERS.json` (section 7), the lessons `src/offline/esl6Fixtures.ts` (section 5a) and `config/agent_sim_esl6/tasks/{TUTOR,JUDGE,RATE,FID,RECHECK}_TASK.md`. The grader recheck task is named `RECHECK_TASK.md` (earlier drafts said `SCORE_TASK.md`). JUDGE_TASK is `JUDGE_TASK_ESL6.md` with only the batch paths changed; the diff: title "validation" → "study"; the provenance line; the JDIR sentence (validation `judgeA`/`judgeB`/`noise_run1`/`noise_run2` → study `judge` and `agree`, with batch id examples); the independence line "Never read the other judge's folder or output, or any earlier validation round" → "Never read the other folder (judge / agree), any other batch's output, or any validation file". The runner does not import `learnerSim.ts` (it runs its own CLI on import, including `agreeprep`/`agreescore` branches); the four helpers it needs (sha, rand, judge batch writer and reader) are copied with the same formulas.

**Judge validation:** `reports/exp4/agent_sim_esl6/validation/VALIDATION.md`: scripted order d > c > b ≈ a (pass, both judges); agreement 97.1% mixed set, 98.6% session 2 (pass); forgetting check **FAIL** (section 12).

## 4. Sample size (DECISIONS 7, superseded by DECISIONS 14: n = 270)

`config/agent_sim_esl6/POWER.json`, script `src/offline/esl6_power.py`.

- **SD source:** the ESL5 per-learner paired differences LE − P+ (explicit-first, mean of 2 replications, n = 108, from `reports/exp4/agent_sim_esl5/POST.json`): **SD 0.3072** (mean 0.1516). (The ESL5 POWER.json value 0.2127 came from ESL4; the realised ESL5 spread is larger.)
- **Why it is a proxy, and why it is inflated:** it is the same pair of arms, the same agent tutors and judges, the same learner bands and the same averaging over 2 replications, on a 0–1 proportion-correct scale like percent of points. It differs in three ways: ESL6 adds a 7-day forgetting step (more spread), a 12-point form instead of 4 controlled items (less rounding spread), and 30 outcomes instead of 3 (unknown). Because the delayed score adds variance that ESL5 did not have, the SD is **inflated** with the ESL6 noise result (`NOISE_RESULT.json`, delayed score, same tutor judged twice, 30 learners): SD of run2 − run1 = 0.219, per-run judging SD σ = 0.219/√2 = 0.1549. For a per-learner arm difference of 2-replication means the added variance is 2 × σ²/2 = σ². **SD used = √(0.3072² + 0.1549²) = 0.344.** This double-counts part of the judging noise already in the ESL5 SD, so it is conservative.
- **Power** (two-sided sign-flip, α 0.05, effect +0.06; simulation: 2,000 studies per n, diffs = 0.06 + 0.344 × resampled standardised ESL5 diffs, Monte Carlo sign-flip 2,000 draws, seed 6):

| n | Normal approx. | Simulated (SD 0.344) | Simulated (uninflated SD 0.307) |
|---|---|---|---|
| 120 (minimum) | 0.480 | 0.463 | 0.565 |
| 150 | 0.570 | 0.538 | 0.660 |
| **180 (chosen, largest multiple of 30 ≤ 200)** | **0.648** | **0.653** | **0.767** |
| 200 (maximum) | 0.694 | 0.692 | 0.809 |

- **DECISIONS 14 (user, 2026-11-17: "n = 270"), after the primary outcome was narrowed to 4 gap-fill/choice items (DECISIONS 11):** conservative power (`POWER_C.json`, `src/offline/esl6_power_c.py`, SD scaled by √(6/4) to 0.4213) at +0.06: n = 180: 0.478; 240: 0.6125; **270: 0.653 (chosen)**; 300: 0.717. The table below is the original 6-item analysis, kept for the record.
- **Result (original 6-item analysis): 80% power at +0.06 is NOT reachable inside 120–200.** The normal approximation needs n = 259 (270 as a multiple of 30) with the inflated SD, about 205 without inflation.
- **Decision (DECISIONS 7, user: "n = 180, ~65% power"):** **n = 180** explicit-first learners (6 per outcome), the largest permitted multiple of 30, target effect +0.06 unchanged. **Power ≈ 0.65 with the inflated SD 0.344 (simulated 0.653, normal approximation 0.648); ≈ 0.77 with the uninflated ESL5 SD 0.307 (simulated 0.767).** The report must state the low power. (`POWER.json` is frozen as computed; its `status` field still reads "PENDING USER DECISION" and is superseded by DECISIONS 7.)

## 5. Learners

**Scope:** 30 outcomes (DECISIONS 5). The 3 A1–A2 form outcomes with no `l1ErrorTypes` (EN-F-A1-GR-possessive-adjectives, EN-F-A1-VO-common-adjectives, EN-F-A2-VO-make-do) have no wrong belief to simulate and are **out of scope by design** (decided before any session; not a post-hoc exclusion). Types: 19 GR, 10 VO, 1 FN.

**270 NEW explicit-first learners, ids 700–969** (DECISIONS 14), 9 per outcome, ids in blocks of 9 in outcome-id order. Each learner is assigned **one** outcome (its target form, LEARNING_RULES §1b row; starting strengths by band, §1). **Band rule (CEFR allows):** an A1 outcome gets 3 A1 and 6 A2 learners; an A2 outcome gets 9 A2 learners (an A1 learner is not given an A2 outcome). Totals: 42 A1, 228 A2. **Block of 9:** positions 0–5 are the original block of 6 unchanged; positions 6–8 (added for n = 270) are A2, statuses not_assessed / emerging / emerging, primary belief W2 / W1 / W1 (2-belief outcomes), one per form sequence; so each form sequence is used 3 times per outcome. Objective status: `not_assessed` for the first 3 of each block of 6, `emerging` for the rest (both explicit-first, as ESL5). Primary wrong belief: for 2-belief outcomes, W1 primary for positions 1, 2, 4 and W2 for 3, 5, 6 of each block (balanced 3/3 per outcome); 1-belief outcomes: W1.

| Outcome | Type | Learner ids | Bands | Form sequence (pre/imm/delayed) by id |
|---|---|---|---|---|
| EN-F-A1-GR-article-a-an | GR | 700–708 | A1: 700–702; A2: 703–708 | 700 A/B/C, 701 B/C/A, 702 C/A/B, 703 A/B/C, 704 B/C/A, 705 C/A/B, 706 A/B/C, 707 B/C/A, 708 C/A/B |
| EN-F-A1-GR-article-the | GR | 709–717 | A1: 709–711; A2: 712–717 | 709 A/B/C, 710 B/C/A, 711 C/A/B, 712 A/B/C, 713 B/C/A, 714 C/A/B, 715 A/B/C, 716 B/C/A, 717 C/A/B |
| EN-F-A1-GR-can-ability | GR | 718–726 | A1: 718–720; A2: 721–726 | 718 A/B/C, 719 B/C/A, 720 C/A/B, 721 A/B/C, 722 B/C/A, 723 C/A/B, 724 A/B/C, 725 B/C/A, 726 C/A/B |
| EN-F-A1-GR-capitals-full-stops | GR | 727–735 | A1: 727–729; A2: 730–735 | 727 A/B/C, 728 B/C/A, 729 C/A/B, 730 A/B/C, 731 B/C/A, 732 C/A/B, 733 A/B/C, 734 B/C/A, 735 C/A/B |
| EN-F-A1-GR-copula-be | GR | 736–744 | A1: 736–738; A2: 739–744 | 736 A/B/C, 737 B/C/A, 738 C/A/B, 739 A/B/C, 740 B/C/A, 741 C/A/B, 742 A/B/C, 743 B/C/A, 744 C/A/B |
| EN-F-A1-GR-prepositions-time | GR | 745–753 | A1: 745–747; A2: 748–753 | 745 A/B/C, 746 B/C/A, 747 C/A/B, 748 A/B/C, 749 B/C/A, 750 C/A/B, 751 A/B/C, 752 B/C/A, 753 C/A/B |
| EN-F-A1-GR-there-is-are | GR | 754–762 | A1: 754–756; A2: 757–762 | 754 A/B/C, 755 B/C/A, 756 C/A/B, 757 A/B/C, 758 B/C/A, 759 C/A/B, 760 A/B/C, 761 B/C/A, 762 C/A/B |
| EN-F-A1-GR-word-order-svo | GR | 763–771 | A1: 763–765; A2: 766–771 | 763 A/B/C, 764 B/C/A, 765 C/A/B, 766 A/B/C, 767 B/C/A, 768 C/A/B, 769 A/B/C, 770 B/C/A, 771 C/A/B |
| EN-F-A1-VO-classroom-objects | VO | 772–780 | A1: 772–774; A2: 775–780 | 772 A/B/C, 773 B/C/A, 774 C/A/B, 775 A/B/C, 776 B/C/A, 777 C/A/B, 778 A/B/C, 779 B/C/A, 780 C/A/B |
| EN-F-A1-VO-days-months | VO | 781–789 | A1: 781–783; A2: 784–789 | 781 A/B/C, 782 B/C/A, 783 C/A/B, 784 A/B/C, 785 B/C/A, 786 C/A/B, 787 A/B/C, 788 B/C/A, 789 C/A/B |
| EN-F-A1-VO-family | VO | 790–798 | A1: 790–792; A2: 793–798 | 790 A/B/C, 791 B/C/A, 792 C/A/B, 793 A/B/C, 794 B/C/A, 795 C/A/B, 796 A/B/C, 797 B/C/A, 798 C/A/B |
| EN-F-A1-VO-food-drink | VO | 799–807 | A1: 799–801; A2: 802–807 | 799 A/B/C, 800 B/C/A, 801 C/A/B, 802 A/B/C, 803 B/C/A, 804 C/A/B, 805 A/B/C, 806 B/C/A, 807 C/A/B |
| EN-F-A1-VO-home-rooms | VO | 808–816 | A1: 808–810; A2: 811–816 | 808 A/B/C, 809 B/C/A, 810 C/A/B, 811 A/B/C, 812 B/C/A, 813 C/A/B, 814 A/B/C, 815 B/C/A, 816 C/A/B |
| EN-F-A1-VO-numbers-time | VO | 817–825 | A1: 817–819; A2: 820–825 | 817 A/B/C, 818 B/C/A, 819 C/A/B, 820 A/B/C, 821 B/C/A, 822 C/A/B, 823 A/B/C, 824 B/C/A, 825 C/A/B |
| EN-F-A2-FN-polite-requests | FN | 826–834 | A2: all 9 | 826 A/B/C, 827 B/C/A, 828 C/A/B, 829 A/B/C, 830 B/C/A, 831 C/A/B, 832 A/B/C, 833 B/C/A, 834 C/A/B |
| EN-F-A2-GR-comparatives | GR | 835–843 | A2: all 9 | 835 A/B/C, 836 B/C/A, 837 C/A/B, 838 A/B/C, 839 B/C/A, 840 C/A/B, 841 A/B/C, 842 B/C/A, 843 C/A/B |
| EN-F-A2-GR-conjunctions | GR | 844–852 | A2: all 9 | 844 A/B/C, 845 B/C/A, 846 C/A/B, 847 A/B/C, 848 B/C/A, 849 C/A/B, 850 A/B/C, 851 B/C/A, 852 C/A/B |
| EN-F-A2-GR-frequency-adverbs | GR | 853–861 | A2: all 9 | 853 A/B/C, 854 B/C/A, 855 C/A/B, 856 A/B/C, 857 B/C/A, 858 C/A/B, 859 A/B/C, 860 B/C/A, 861 C/A/B |
| EN-F-A2-GR-going-to | GR | 862–870 | A2: all 9 | 862 A/B/C, 863 B/C/A, 864 C/A/B, 865 A/B/C, 866 B/C/A, 867 C/A/B, 868 A/B/C, 869 B/C/A, 870 C/A/B |
| EN-F-A2-GR-much-many | GR | 871–879 | A2: all 9 | 871 A/B/C, 872 B/C/A, 873 C/A/B, 874 A/B/C, 875 B/C/A, 876 C/A/B, 877 A/B/C, 878 B/C/A, 879 C/A/B |
| EN-F-A2-GR-past-questions-did | GR | 880–888 | A2: all 9 | 880 A/B/C, 881 B/C/A, 882 C/A/B, 883 A/B/C, 884 B/C/A, 885 C/A/B, 886 A/B/C, 887 B/C/A, 888 C/A/B |
| EN-F-A2-GR-past-simple-irregular | GR | 889–897 | A2: all 9 | 889 A/B/C, 890 B/C/A, 891 C/A/B, 892 A/B/C, 893 B/C/A, 894 C/A/B, 895 A/B/C, 896 B/C/A, 897 C/A/B |
| EN-F-A2-GR-past-simple-regular | GR | 898–906 | A2: all 9 | 898 A/B/C, 899 B/C/A, 900 C/A/B, 901 A/B/C, 902 B/C/A, 903 C/A/B, 904 A/B/C, 905 B/C/A, 906 C/A/B |
| EN-F-A2-GR-present-continuous | GR | 907–915 | A2: all 9 | 907 A/B/C, 908 B/C/A, 909 C/A/B, 910 A/B/C, 911 B/C/A, 912 C/A/B, 913 A/B/C, 914 B/C/A, 915 C/A/B |
| EN-F-A2-GR-some-any | GR | 916–924 | A2: all 9 | 916 A/B/C, 917 B/C/A, 918 C/A/B, 919 A/B/C, 920 B/C/A, 921 C/A/B, 922 A/B/C, 923 B/C/A, 924 C/A/B |
| EN-F-A2-GR-third-person-s | GR | 925–933 | A2: all 9 | 925 A/B/C, 926 B/C/A, 927 C/A/B, 928 A/B/C, 929 B/C/A, 930 C/A/B, 931 A/B/C, 932 B/C/A, 933 C/A/B |
| EN-F-A2-VO-appearance | VO | 934–942 | A2: all 9 | 934 A/B/C, 935 B/C/A, 936 C/A/B, 937 A/B/C, 938 B/C/A, 939 C/A/B, 940 A/B/C, 941 B/C/A, 942 C/A/B |
| EN-F-A2-VO-clothes-shopping | VO | 943–951 | A2: all 9 | 943 A/B/C, 944 B/C/A, 945 C/A/B, 946 A/B/C, 947 B/C/A, 948 C/A/B, 949 A/B/C, 950 B/C/A, 951 C/A/B |
| EN-F-A2-VO-jobs-workplaces | VO | 952–960 | A2: all 9 | 952 A/B/C, 953 B/C/A, 954 C/A/B, 955 A/B/C, 956 B/C/A, 957 C/A/B, 958 A/B/C, 959 B/C/A, 960 C/A/B |
| EN-F-A2-VO-weather | VO | 961–969 | A2: all 9 | 961 A/B/C, 962 B/C/A, 963 C/A/B, 964 A/B/C, 965 B/C/A, 966 C/A/B, 967 A/B/C, 968 B/C/A, 969 C/A/B |

**12 NEW B2 learners, ids 980–991** (no-harm check), one each on 12 outcomes spread over the list (every 5th outcome starting at the 1st and at the 3rd: 9 GR, 3 VO). B2 start W1 = W2 = 0, C = 3; F1 does not decay B2 (floor 3).

| B2 learner id | Outcome | Form sequence |
|---|---|---|
| 980 | EN-F-A1-GR-article-a-an | A/B/C |
| 981 | EN-F-A1-GR-can-ability | B/C/A |
| 982 | EN-F-A1-GR-prepositions-time | C/A/B |
| 983 | EN-F-A1-GR-word-order-svo | A/B/C |
| 984 | EN-F-A1-VO-family | B/C/A |
| 985 | EN-F-A1-VO-home-rooms | C/A/B |
| 986 | EN-F-A2-GR-comparatives | A/B/C |
| 987 | EN-F-A2-GR-frequency-adverbs | B/C/A |
| 988 | EN-F-A2-GR-past-questions-did | C/A/B |
| 989 | EN-F-A2-GR-past-simple-regular | A/B/C |
| 990 | EN-F-A2-GR-third-person-s | B/C/A |
| 991 | EN-F-A2-VO-clothes-shopping | C/A/B |

**Seeds:** `esl6|L<id>|rep<1|2>`. All case, agreement, rater, recheck, rotation and fidelity hashes are salted with `esl6`.

**Overlap check** (`esl6Study.ts overlap`, run and enforced by `init`; result `reports/exp4/agent_sim_esl6/OVERLAP_CHECK.json`): scans every file under `reports/exp4` (ESL1–ESL5 data and the ESL5 and ESL6 validations), `config/agent_sim_esl1..esl6`, the fixtures, simulator and validation scripts, and the code-defined id ranges (ESL1 0–17, ESL2 0–35, ESL3 100–159, ESL3 validation 200–211, ESL4 300–407, ESL5 500–619, ESL5 validation 0–11). Pass requires: 0 learner-id clashes with 700–891; 0 seed clashes; no prior seed beginning `esl6|`; the ESL6 validation learners (ids `n00`–`n29` and validation case ids) disjoint from the study ids. Any clash stops `init`. Also reported (descriptive, not a pass criterion): lesson practice items whose sentence equals a bank item of the same outcome (dry run: 2, `EN-F-A2-GR-third-person-s-A-3` = ESL1 thirdS lesson item "The baby ___ (cry) at night." and `EN-F-A2-VO-jobs-workplaces-A-3` "A pilot works at an ___."; both arms see the lesson, so the pair is unaffected; see section 12).

**5a. Lessons** (`src/offline/esl6Fixtures.ts`, `LESSONS6`): one lesson per outcome from its `lessonIds` in `data/outcomes/outcomes.json` (inventory ids: `docs/LEARNING_OUTCOMES.md` PART 8). Rule fixed before `init`: the three section-1 forms keep the ESL1 lesson used unchanged in ESL2–ESL5 (`eslFixtures.ts`, imported); every other outcome takes the **first listed lessonId that has practice items** (ESL1 lessons skipped), else the first listed. Lesson data are copied verbatim from the source named per lesson; the LTB benchmark cases keep their two items as `exercise`/`nextItem`, turned into items. Three outcomes (past-simple-regular, past-questions-did, some-any) have only the LO-experiment lesson, which has no practice items, and are taught with the lesson data alone. The P+ prompt and the LE engine get the same lesson.

## 6. Design

- **2 sessions × 5 turns = 10 rounds.** Session 2 is a **new chat 2 simulated days** after session 1 (LEARNING_RULES §7). Knowledge state and ENARA's record carry over; the tutor conversation does not (new chat for both arms; P+ gets only the lesson data and the new conversation).
- **F1 v2** (`F1_PARAMS.json`, LEARNING_RULES §6) runs for 2 days between sessions and for **7 days** after session 2 before the delayed test; never inside a session. Retrieval counts come from the judge's `retrieval` field (§5b).
- **2 replications;** every learner gets both arms in both replications: 282 × 2 × 2 = **1,128 sessions per round**, 11,280 tutor turns.
- **Cells:** `<arm><rep><k>`, k = learner id mod 6 → 24 cells per round of 32 sessions, one tutor agent per cell writing every reply itself (scripted/templated/grouped replies kept as `PARTIAL_*` and redone).
- **Judges:** blind, the ESL6 judge task (section 3) with ESL2 `JUDGE_INSTRUCTIONS.md` and ESL6 `LEARNING_RULES.md`; input = knowledge state, previous tutor turn, learner message, production fact, tutor turn (no arm). Batches of 36 (about 22 per round). Reading only, no scripts or helper files.
- **No session is dropped;** failed work is kept as `PARTIAL_*` and rerun. The analysis refuses to decide on incomplete data.

## 7. Measurement: the outcome assessment bank

- **Forms:** each outcome's bank file has forms A, B, C (9 items, same types and sub-rules per position; 6 exact items × 1 point + 3 free/transfer items × 0/1/2 = **12 points per form**, checked for all 99 forms).
- **Times:** pre-test before session 1 (starting state); immediate post-test at the end of session 2 (no F1); delayed post-test after 7 days of F1. Assessments never update the state and are not retrieval attempts.
- **Rotation (Latin square over A/B/C):** three sequences pre/immediate/delayed = **A/B/C, B/C/A, C/A/B**, assigned by position in the learner's block (position mod 3; tables in section 5). Each outcome: each sequence twice; A1 outcomes: each sequence once per band; each form appears equally often at each time. A learner keeps the same sequence in both arms and both replications, so the paired arm difference compares the same form.
- **Which belief an item probes:** `ITEM_BELIEF_MAP.json` lists, for every item of the 30 outcomes × 3 forms, the wrong beliefs Wk (and their Ck) that could change its answer, by LEARNING_RULES §4a (ESL6 scope line): an item probes Wk if Wk's error (§1b row) could occur in it. Error-correction items probe the Wk whose error the prompt shows (from the item's `l1ErrorType`, matched to the §1b error type of the row) and any other Wk that could occur in the corrected sentence; free/transfer items probe every Wk of the row whose error can show in an answer to the prompt (where the prompt fixes a frame that cannot show it, e.g. an I-subject for "-s after can", or a key with no attributive adjective for adj–noun order, that Wk is not probed). Options that exclude Wk's error exclude Wk, as in §4a ("a or an" and "am, is or are" options exclude omission; choosing among given spellings excludes a spelling belief); a choice item answered by letter gets Wk's option letter. Every item has a one-line reason in the map (`note`). Items with an error type outside the row (e.g. copula item 6 `be_agreement_plural` → W2 "is with every subject"; a type with no §1b counterpart) are mapped by meaning; an item that probes no seeded Wk is listed as `none` and is answered from the key (it cannot differ between arms; count reported). The map is written by one agent from the bank and the rules only, before `init`, with no access to any session (authoring record `src/offline/esl6_answers_build.py`). **Counts:** 810 items; 173 probe `none`; 753 wrong strings.
- **How the answer string is produced (deterministic, no agent):** for each item, each probed Wk fires independently with the LEARNING_RULES §2 probability for its rounded strength, raised to the §2a graded Ck floor (0.4 × max(0, 1 − Ck/2)) for answers after at least one F1 interval (immediate and delayed; not the pre-test). Dice: `sha256(seed | 'assess-' + <pre|imm|del> | item id | Wk)` → uniform [0,1); the first firing belief in W1, W2 order decides the error.
  - **No belief fires:** the answer is the item key: `answerKey` (with a leading "e.g. " removed); for a key with alternatives ("I am single. / I am married.") the first alternative. Where `answerKey` is not an answer but a description of one ("classroom noun", "day name", "tall/short", "waiter + workplace") or a frame with "..." ("I can speak ..."), the map gives an authored key: one sentence that answers the prompt with an accepted word (`keySource: "authored"`, 72 items: VO items 7–8 whose key is a description (56), the "..." frame keys (8: can-ability 9, copula B/C-9, irregular-past 9), the article-the item-8 keys without the leading "..." (3), food-drink item-8 "drink noun" (3), plus 2 items whose bank key could not show the belief to the grader: numbers-time B-7 "half" → "five", frequency-adverbs C-7 "have" → "drink"). The answer string is `ITEM_BELIEF_MAP.json[item].key`.
  - **Wk fires:** the answer is `WRONG_ANSWERS.json[item id][Wk]`, a fixed string showing Wk's error pattern (§1b) applied to the key: for error correction, the prompt sentence unchanged when the item's error is Wk's error, else the key with Wk's error applied; for gap/choice items the option or form Wk would produce (e.g. copula W1: empty gap; W2: "is"); for free/transfer items the key sentence with Wk's error applied in the target form only. Written once by one agent before `init`, from the bank, the §1b error examples and the rubric, blind to arm.
  - **Pre-init checks (`esl6Study.ts answercheck`, must pass; `init` refuses to run otherwise):** every key string scores full points under the grader of this section; every wrong string scores less than full on the item it belongs to (free/transfer: 0 or 1); no wrong string equals a key. Failures are fixed in the files before `init`.
  - **Grader-blind wrong strings (reported, not counted as failures):** 15 items where the deterministic grader gives full points to the faithful wrong string and no faithful string scores lower: conjunctions items 7–9 (all forms; the conjunction rule accepts any clause-joining and/but/because, so "and" for because/but is not detected) and appearance/clothes-shopping item 7 (all forms; the vocabulary rubric scores the words, not their order). The belief still fires there and the answer is the faithful string (`graderBlind` in both files); it scores like the key, so these items cannot differ between a learner with and without the belief.
  - **Answercheck result (2026-11-17, round-8 grader, DECISIONS 12):** 810 keys and 753 wrong strings checked; **0 failures**, 15 grader-blind (above). (The 2026-11-16 failure on `EN-F-A2-GR-third-person-s-C-9` no longer occurs: the round-7 fix scores the bank key in full.)
- **Scoring (DECISIONS 1):** ENARA's deterministic grader path, **graderV2 ON** (`ENARA_ENGINE_V2=graderV2`), **model path OFF** (DECISIONS 4: not validated, not used anywhere): exact items via `matchKeyV2`, free/transfer items via `scoreTargetForm`; a `null` from the scorer (no rule fits) scores 0 and is counted and reported. The scorer gets only item id and answer string (no arm, learner or time). **Score = percent of points per form** (points / 12).

## 8. Primary hypothesis (the only confirmatory test)

**(LE) − (PP) on the delayed-form score on the PRIMARY items (percent of points), explicit-first learners (n = 270, DECISIONS 14), each learner's two replications averaged.**
- **Primary items (DECISIONS 8 and 11):** the gap-fill and choice items of the form (positions 1–4: gap_fill, controlled_gap_fill, multiple_choice, controlled_choice), **4 points per form** (3 on the 6 forms whose position 3 or 4 is a rewrite item). Reason: on these types the grader agreed 39/41 = 95.1% on a fresh independent answer set (round 8) and 132/134 pooled over rounds 5–8; on error correction it did not (27/33 in round 8).
- **Test:** two-sided paired sign-flip. Exact over all 2^n sign patterns by convolution if every difference lies on a common grid (4- or 3-point forms averaged over 2 replications); otherwise Monte Carlo with **100,000** draws, **seed 6**. α = 0.05.
- **Interval:** 95% percentile bootstrap, **10,000** resamples, **seed 7**.

## 9. Secondary outcomes (descriptive only, no claims)

- **whole-form delayed score (12 points)** and **error-correction + rewrite items** (positions 5–6 and the rewrite items), each with the grader's round-8 agreement on those types stated next to it (error correction 27/33);
- immediate post-test score (LE − PP, 95% bootstrap CI);
- **mastery rate** on the delayed form: rubric criterion, ≥ 80% of points AND ≥ 3 of items 1–4 correct; share per arm, per-learner mean of replications;
- by outcome type (GR / VO / FN) and by outcome (30 rows, mean diff with 95% bootstrap CI; n = 6 per outcome, so wide);
- free-production score (items 7–9 only, delayed and immediate);
- forgetting immediate → delayed (per arm and difference);
- pre-test score (balance check) and gains;
- per-round W1+W2 trajectory; stuck runs (ESL5 definition); answer releases (genuine / premature / already solved / not lesson items, ESL5 recount method), answers given after ≥ 2 failed attempts; session-2 turn types (ESL5 list);
- grader `null` count; items with probe `none`;
- one blind rating pass (replication 1, ESL4 `RATER_INSTRUCTIONS.md` unchanged);
- each replication separately;
- **B2 no-harm:** every B2 learner ends session 2 with W1 = W2 = 0, and delayed score ≥ pre-test score, in both arms and replications.

## 10. Guards (all must pass)

1. **Two asks:** final LE replies with two asks (`hasTwoAsks`, folded closings excepted) ≤ **2%** of LE turns (raw count also reported).
2. **Early leaks:** LE ≤ PP, ESL5 definition (completed answer of a lesson item the learner has not solved with < 2 genuine failed attempts this session; releases and answers after ≥ 2 attempts counted separately). The genuine-attempt count is reconstructed from transcripts as in `esl5_leak_recount.py`, not from the engine counter.
3. **Answer protection:** mean blind `answer_protection` LE ≥ PP.
4. **Judge agreement:** in-study blind second judging of a stable 20% (`rand('esl6-agree', caseId) < 0.2`) in rounds 3 (session 1) and 8 (session 2); agreement ≥ **85% overall AND ≥ 85% in session 2**, no missing cases.
5. **Grader recheck (DECISIONS 2):** a 10% sample of all scored assessment answers (all times, arms, learners, items), drawn with `rand('esl6-recheck', answerId) < 0.1` (fixed seed string). **3 independent agent scorers**, rubric (`docs/SCORING_RUBRIC.md`) and item only, blind to arm, learner, time and grader score; reference = majority (median for 0/1/2 if all differ). Target (DECISIONS 9 and 11): **≥ 95% exact agreement** grader vs reference on the **primary item types** (gap-fill and choice). Exact agreement on all exact items and QWK on free/transfer items are **reported, not guards**. Batches: `esl6Study.ts recheckprep` (40 answers per batch, own order per scorer, item + rubric fields + answer only); scored by `recheckscore` → `GRADER_RECHECK.json` (reference: majority, median if all three differ; exact agreement on exact items; quadratic-weighted kappa on 0/1/2 items); task `tasks/RECHECK_TASK.md`.

## 11. Decision rule (fixed now)

**CONFIRMED** only if all hold: p < 0.05; 95% CI lower bound > 0; all five guards pass; data complete (270 + 12 learners, both arms, both replications, 10 judged rounds, 3 forms scored each). Otherwise **NOT CONFIRMED**. No secondary outcome, subgroup, outcome, replication or other analysis will be presented as confirming the claim. B2 no-harm is reported next to the decision.

## 12. Limits and known issues (stated before any session)

1. **Forgetting check FAILED** (DECISIONS 6) in validation rounds 1 (F1 v1) and 2 (F1 v2) on the counted full-teaching design: 7-day (b) − (a) = 0.000, a ceiling effect (full teaching removes every wrong belief). Light-teaching sensitivity: 0.366 vs 0.595, immediate +0.031. The report must state that the forgetting model shows no recall benefit when teaching is complete and that this check did not pass.
2. 30, not 33, outcomes (section 5).
3. Grader validated only against agent scorers, no human raters. Fresh round 8: **all controlled items 89.3% (fail)**, primary item types 95.1% (39/41, one miss from failing), free QWK 0.891. The primary outcome was narrowed to the passing types after seeing this result (DECISIONS 11).
4. Model grader path NOT VALIDATED and not used.
5. Simulation only: hand-written learning rules, agent tutors, agent judges, agent scorers; nothing is evidence about real students.
6. The ESL5 instruction fixes and graderV2 were designed after seeing earlier rules and ESL5 results.
7. No human review of the assessments (bank status DRAFT); item-belief map and wrong answers are agent-written.
8. Underpowered: with 4 primary items the conservative estimate is about **0.653 power at n = 270** (POWER_C.json; 0.48 at the earlier n = 180); the report must state the power.
9. Per-learner judging noise on the delayed score is large (mean |diff| 0.149, NOISE_RESULT).
10. Few learners per outcome (6); per-outcome results are descriptive only.
11. Assessment answers are deterministic strings per belief (`WRONG_ANSWERS.json`), agent-written; 15 of them are grader-blind (section 7) (section 7).
12. Lessons are research fixtures of uneven fit: 3 outcomes have no practice items, several lessons are only loosely about the outcome (e.g. family: "This is my … He/She is …"; days-months shares the in/on/at lesson); 2 lesson items equal bank items (section 5).
13. B2 no-harm uses "delayed ≥ pre-test"; with W = 0 an item still errs with probability 0.05 per probed belief on different forms, so a B2 learner can fail it by chance (seen in the dry run with scripted replies).

## 13. Run plan

All commands from `backend/`, `S=../research/deep-learning-simulation-v2/src/offline/esl6Study.ts`, `D=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl6`.

0. DECISIONS 7 made (n = 180), superseded by DECISIONS 14 (n = 270). Files of section 3 written and hashed; `answercheck` must pass (passes: 0 failures, section 7); commit this protocol with all hashes. No session before that commit. A dry run with scripted replies and scripted judges (no agents) was run in a scratch folder (`DRY_RUN` marker) through every step below.
1. `npx tsx $S init $D` (hash checks, overlap check, 768 sessions); `assess $D pre` (pre-test, scored).
2. Rounds 1–5 (session 1): per round `promptcheck` → 24 tutor cells (`tprompts` → answers → `tapply`, "applied 32 of 32") → `status` → `jprep r` → judges → `japply r`; round 3 also `agreeprep 3` + second judges.
3. `f1 $D 2` (2 days). Rounds 6–10 (session 2, new chat), same steps; round 8 `agreeprep 8`.
4. `assess $D imm`; `f1 $D 7`; `assess $D del`.
5. `recheckprep $D` → 3 scorer agents (`tasks/RECHECK_TASK.md`) → `recheckscore $D`; `agreescore`; `tags $D` (TAGS.json, STUCK.json, leak recount); `post $D` (POST.json); `rateprep $D` → raters (`tasks/RATE_TASK.md`); `fidprep $D` → fidelity checkers (`tasks/FID_TASK.md`).
6. `python3 src/offline/esl6_analyze.py reports/exp4/agent_sim_esl6` → `ANALYSIS.json`; report `reports/exp4/AGENT_SIM_ESL6.md`.
7. **Usage limit:** stop cleanly at the end of the current cell or batch; write `reports/exp4/agent_sim_esl6/RESUME.md` (rounds complete, partial files and how to check them against the batch .md, exact next steps, deviations so far) and commit; resume from RESUME.md, never from memory.
