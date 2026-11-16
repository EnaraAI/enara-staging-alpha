# SIMULATION ONLY

# ESL stage 6: confirmatory protocol (pre-registration, DRAFT until the open decision in section 4 is made)

This file must be committed before any ESL6 tutor reply is written. Nothing below may change after the first tutor reply is applied; any departure goes in `config/agent_sim_esl6/DEVIATIONS.md`. No real learners take part, and no API is called. Tutors, judges, raters, scorers and fidelity checkers are agents, with at most 3 running at a time. The binding user decisions 1–6 of `DECISIONS_FOR_PROTOCOL.md` (SHA-256 `54059e4f…61ad3`) are copied into the sections named in brackets: scoring (1, section 7), grader guard (2, section 10), ENARA arm with graderV2 (3, section 2), model path not used (4, section 7), 30 outcomes (5, section 5), forgetting check failed (6, section 12).

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
| `backend/src/services/graderV2.ts` | `a1f574dc800ce603aaec5e333a29d419d213b506db75e5dd610a394f01b71360` |
| `backend/src/services/grading.ts` | `dc0080001018d3cf7fae39b0a3919fa4e1ddd4a115136543ca1f586d234e601c` |
| `backend/src/services/assessmentSecurity.ts` | `56c79bda5764d5e4b9aa201c38ec723cf6780bbd2a4add7c246007a4cfd2f477` |
| `data/assessments/outcomes/*.json` (33 files, concatenated in name order) | `bf78f551a5292cd88632794618922bebf4f02efe372ece6d945a78a3be4383e4` |
| `docs/SCORING_RUBRIC.md` | `947b603294bc47f12cad7ed28c567ee2372712d167dc70ce185dc7e0e1172008` |
| `src/offline/learnerSim.ts` (session simulator, unchanged since ESL4) | `711c8334b6323dc9e72a5617072edf3b9fc808499080ca52f1d62aa78f71ebd4` |
| `src/offline/eslFixtures.ts` | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |
| `config/agent_sim_esl6/LEARNING_RULES.md` | `c705d576da041c9ba012c105b4f6237f682a549a8c36089a6f33bdf31ddf8c4c` |
| `config/agent_sim_esl6/F1_PARAMS.json` (F1 v2) | `f75f568059c95cb5b5fb6aa63bb318ce594533852eaa8831c212411d4ee1d584` |
| `config/agent_sim_esl6/DECISIONS_FOR_PROTOCOL.md` | `54059e4fe2aed14c34156372ecb845d040536f0260bcb4396e6d4b8549261ad3` |
| `config/agent_sim_esl6/POWER.json` | `c55f59ce922b82a61d3439f0081d3e6fe2696ffda910ebc620f62b0050496b57` |
| `src/offline/esl6_power.py` | `0ec99a73e53f1c8d515dddc919d3309b028e6536b62f690abc5e5f9d776fd78f` |
| `reports/exp4/agent_sim_esl6/validation/JUDGE_TASK_ESL6.md` (validated judge task) | `b081773d1538b35b13b88a3ca4c8020998cc967bb007af7e1a1cfbb634cd604a` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `config/agent_sim_esl4/PPLUS_PROMPT.txt` | `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472` |
| `config/agent_sim_esl4/RATER_INSTRUCTIONS.md` (reused unchanged) | `77b8c0e6040b4bf5d8b3fb60ed23ea4e1d1ffc4f127f1cb52bf4346e9b1c69a8` |

**Not yet written (must be written to this protocol, hashed and added to this table in the same commit, before `init`):** `src/offline/esl6Study.ts` (runner: init, overlap, promptcheck, tprompts, tapply, jprep, japply, f1, assess, agreeprep, agreescore, recheckprep, tags), `src/offline/esl6_analyze.py` (analysis and decision rule of sections 8–11), `config/agent_sim_esl6/ITEM_BELIEF_MAP.json` and `config/agent_sim_esl6/WRONG_ANSWERS.json` (section 7), the ESL6 lessons for the 30 outcomes (from each outcome's `lessonIds`; `eslFixtures.ts` has only the three ESL2–5 forms), and `config/agent_sim_esl6/tasks/{TUTOR,JUDGE,RATE,FID,SCORE}_TASK.md`. JUDGE_TASK is `JUDGE_TASK_ESL6.md` with only the batch paths changed (diff listed in the commit). If any of these cannot be written without changing a rule above, that is a protocol change, made and committed before `init`.

**Judge validation:** `reports/exp4/agent_sim_esl6/validation/VALIDATION.md`: scripted order d > c > b ≈ a (pass, both judges); agreement 97.1% mixed set, 98.6% session 2 (pass); forgetting check **FAIL** (section 12).

## 4. Sample size (OPEN USER DECISION)

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

- **Result: 80% power at +0.06 is NOT reachable inside 120–200.** The normal approximation needs n = 259 (270 as a multiple of 30) with the inflated SD, about 205 without inflation. The protocol is written with **n = 180** (6 learners per outcome), the largest permitted multiple of 30, with **~65% power** (77% if the ESL5 SD is taken uninflated). **This needs a user decision before commit:** (a) accept n = 180 at ~65% power; (b) raise the maximum to 270 (9 per outcome); or (c) change the target effect (80% at n = 180 needs about +0.072). Until decided, this file is a DRAFT and `init` must not run.

## 5. Learners

**Scope:** 30 outcomes (DECISIONS 5). The 3 A1–A2 form outcomes with no `l1ErrorTypes` (EN-F-A1-GR-possessive-adjectives, EN-F-A1-VO-common-adjectives, EN-F-A2-VO-make-do) have no wrong belief to simulate and are **out of scope by design** (decided before any session; not a post-hoc exclusion). Types: 19 GR, 10 VO, 1 FN.

**180 NEW explicit-first learners, ids 700–879**, 6 per outcome, ids in blocks of 6 in outcome-id order. Each learner is assigned **one** outcome (its target form, LEARNING_RULES §1b row; starting strengths by band, §1). **Band rule (CEFR allows):** an A1 outcome gets 3 A1 and 3 A2 learners; an A2 outcome gets 6 A2 learners (an A1 learner is not given an A2 outcome). Totals: 42 A1, 138 A2. Objective status: `not_assessed` for the first 3 of each block of 6, `emerging` for the rest (both explicit-first, as ESL5). Primary wrong belief: for 2-belief outcomes, W1 primary for positions 1, 2, 4 and W2 for 3, 5, 6 of each block (balanced 3/3 per outcome); 1-belief outcomes: W1.

| Outcome | Type | Learner ids | Bands | Form sequence (pre/imm/delayed) by id |
|---|---|---|---|---|
| EN-F-A1-GR-article-a-an | GR | 700–705 | A1: 700–702; A2: 703–705 | 700 A/B/C, 701 B/C/A, 702 C/A/B, 703 A/B/C, 704 B/C/A, 705 C/A/B |
| EN-F-A1-GR-article-the | GR | 706–711 | A1: 706–708; A2: 709–711 | 706 A/B/C, 707 B/C/A, 708 C/A/B, 709 A/B/C, 710 B/C/A, 711 C/A/B |
| EN-F-A1-GR-can-ability | GR | 712–717 | A1: 712–714; A2: 715–717 | 712 A/B/C, 713 B/C/A, 714 C/A/B, 715 A/B/C, 716 B/C/A, 717 C/A/B |
| EN-F-A1-GR-capitals-full-stops | GR | 718–723 | A1: 718–720; A2: 721–723 | 718 A/B/C, 719 B/C/A, 720 C/A/B, 721 A/B/C, 722 B/C/A, 723 C/A/B |
| EN-F-A1-GR-copula-be | GR | 724–729 | A1: 724–726; A2: 727–729 | 724 A/B/C, 725 B/C/A, 726 C/A/B, 727 A/B/C, 728 B/C/A, 729 C/A/B |
| EN-F-A1-GR-prepositions-time | GR | 730–735 | A1: 730–732; A2: 733–735 | 730 A/B/C, 731 B/C/A, 732 C/A/B, 733 A/B/C, 734 B/C/A, 735 C/A/B |
| EN-F-A1-GR-there-is-are | GR | 736–741 | A1: 736–738; A2: 739–741 | 736 A/B/C, 737 B/C/A, 738 C/A/B, 739 A/B/C, 740 B/C/A, 741 C/A/B |
| EN-F-A1-GR-word-order-svo | GR | 742–747 | A1: 742–744; A2: 745–747 | 742 A/B/C, 743 B/C/A, 744 C/A/B, 745 A/B/C, 746 B/C/A, 747 C/A/B |
| EN-F-A1-VO-classroom-objects | VO | 748–753 | A1: 748–750; A2: 751–753 | 748 A/B/C, 749 B/C/A, 750 C/A/B, 751 A/B/C, 752 B/C/A, 753 C/A/B |
| EN-F-A1-VO-days-months | VO | 754–759 | A1: 754–756; A2: 757–759 | 754 A/B/C, 755 B/C/A, 756 C/A/B, 757 A/B/C, 758 B/C/A, 759 C/A/B |
| EN-F-A1-VO-family | VO | 760–765 | A1: 760–762; A2: 763–765 | 760 A/B/C, 761 B/C/A, 762 C/A/B, 763 A/B/C, 764 B/C/A, 765 C/A/B |
| EN-F-A1-VO-food-drink | VO | 766–771 | A1: 766–768; A2: 769–771 | 766 A/B/C, 767 B/C/A, 768 C/A/B, 769 A/B/C, 770 B/C/A, 771 C/A/B |
| EN-F-A1-VO-home-rooms | VO | 772–777 | A1: 772–774; A2: 775–777 | 772 A/B/C, 773 B/C/A, 774 C/A/B, 775 A/B/C, 776 B/C/A, 777 C/A/B |
| EN-F-A1-VO-numbers-time | VO | 778–783 | A1: 778–780; A2: 781–783 | 778 A/B/C, 779 B/C/A, 780 C/A/B, 781 A/B/C, 782 B/C/A, 783 C/A/B |
| EN-F-A2-FN-polite-requests | FN | 784–789 | A2: all 6 | 784 A/B/C, 785 B/C/A, 786 C/A/B, 787 A/B/C, 788 B/C/A, 789 C/A/B |
| EN-F-A2-GR-comparatives | GR | 790–795 | A2: all 6 | 790 A/B/C, 791 B/C/A, 792 C/A/B, 793 A/B/C, 794 B/C/A, 795 C/A/B |
| EN-F-A2-GR-conjunctions | GR | 796–801 | A2: all 6 | 796 A/B/C, 797 B/C/A, 798 C/A/B, 799 A/B/C, 800 B/C/A, 801 C/A/B |
| EN-F-A2-GR-frequency-adverbs | GR | 802–807 | A2: all 6 | 802 A/B/C, 803 B/C/A, 804 C/A/B, 805 A/B/C, 806 B/C/A, 807 C/A/B |
| EN-F-A2-GR-going-to | GR | 808–813 | A2: all 6 | 808 A/B/C, 809 B/C/A, 810 C/A/B, 811 A/B/C, 812 B/C/A, 813 C/A/B |
| EN-F-A2-GR-much-many | GR | 814–819 | A2: all 6 | 814 A/B/C, 815 B/C/A, 816 C/A/B, 817 A/B/C, 818 B/C/A, 819 C/A/B |
| EN-F-A2-GR-past-questions-did | GR | 820–825 | A2: all 6 | 820 A/B/C, 821 B/C/A, 822 C/A/B, 823 A/B/C, 824 B/C/A, 825 C/A/B |
| EN-F-A2-GR-past-simple-irregular | GR | 826–831 | A2: all 6 | 826 A/B/C, 827 B/C/A, 828 C/A/B, 829 A/B/C, 830 B/C/A, 831 C/A/B |
| EN-F-A2-GR-past-simple-regular | GR | 832–837 | A2: all 6 | 832 A/B/C, 833 B/C/A, 834 C/A/B, 835 A/B/C, 836 B/C/A, 837 C/A/B |
| EN-F-A2-GR-present-continuous | GR | 838–843 | A2: all 6 | 838 A/B/C, 839 B/C/A, 840 C/A/B, 841 A/B/C, 842 B/C/A, 843 C/A/B |
| EN-F-A2-GR-some-any | GR | 844–849 | A2: all 6 | 844 A/B/C, 845 B/C/A, 846 C/A/B, 847 A/B/C, 848 B/C/A, 849 C/A/B |
| EN-F-A2-GR-third-person-s | GR | 850–855 | A2: all 6 | 850 A/B/C, 851 B/C/A, 852 C/A/B, 853 A/B/C, 854 B/C/A, 855 C/A/B |
| EN-F-A2-VO-appearance | VO | 856–861 | A2: all 6 | 856 A/B/C, 857 B/C/A, 858 C/A/B, 859 A/B/C, 860 B/C/A, 861 C/A/B |
| EN-F-A2-VO-clothes-shopping | VO | 862–867 | A2: all 6 | 862 A/B/C, 863 B/C/A, 864 C/A/B, 865 A/B/C, 866 B/C/A, 867 C/A/B |
| EN-F-A2-VO-jobs-workplaces | VO | 868–873 | A2: all 6 | 868 A/B/C, 869 B/C/A, 870 C/A/B, 871 A/B/C, 872 B/C/A, 873 C/A/B |
| EN-F-A2-VO-weather | VO | 874–879 | A2: all 6 | 874 A/B/C, 875 B/C/A, 876 C/A/B, 877 A/B/C, 878 B/C/A, 879 C/A/B |

**12 NEW B2 learners, ids 880–891** (no-harm check), one each on 12 outcomes spread over the list (every 5th outcome starting at the 1st and at the 3rd: 9 GR, 3 VO). B2 start W1 = W2 = 0, C = 3; F1 does not decay B2 (floor 3).

| B2 learner id | Outcome | Form sequence |
|---|---|---|
| 880 | EN-F-A1-GR-article-a-an | A/B/C |
| 881 | EN-F-A1-GR-can-ability | B/C/A |
| 882 | EN-F-A1-GR-prepositions-time | C/A/B |
| 883 | EN-F-A1-GR-word-order-svo | A/B/C |
| 884 | EN-F-A1-VO-family | B/C/A |
| 885 | EN-F-A1-VO-home-rooms | C/A/B |
| 886 | EN-F-A2-GR-comparatives | A/B/C |
| 887 | EN-F-A2-GR-frequency-adverbs | B/C/A |
| 888 | EN-F-A2-GR-past-questions-did | C/A/B |
| 889 | EN-F-A2-GR-past-simple-regular | A/B/C |
| 890 | EN-F-A2-GR-third-person-s | B/C/A |
| 891 | EN-F-A2-VO-clothes-shopping | C/A/B |

**Seeds:** `esl6|L<id>|rep<1|2>`. All case, agreement, rater, recheck, rotation and fidelity hashes are salted with `esl6`.

**Overlap check** (`esl6Study.ts overlap`, run and enforced by `init`; result `reports/exp4/agent_sim_esl6/OVERLAP_CHECK.json`): scans every file under `reports/exp4` (ESL1–ESL5 data and the ESL5 and ESL6 validations), `config/agent_sim_esl1..esl6`, the fixtures, simulator and validation scripts, and the code-defined id ranges (ESL1 0–17, ESL2 0–35, ESL3 100–159, ESL3 validation 200–211, ESL4 300–407, ESL5 500–619, ESL5 validation 0–11). Pass requires: 0 learner-id clashes with 700–891; 0 seed clashes; no prior seed beginning `esl6|`; the ESL6 validation learners (ids `n00`–`n29` and validation case ids) disjoint from the study ids. Any clash stops `init`.

## 6. Design

- **2 sessions × 5 turns = 10 rounds.** Session 2 is a **new chat 2 simulated days** after session 1 (LEARNING_RULES §7). Knowledge state and ENARA's record carry over; the tutor conversation does not (new chat for both arms; P+ gets only the lesson data and the new conversation).
- **F1 v2** (`F1_PARAMS.json`, LEARNING_RULES §6) runs for 2 days between sessions and for **7 days** after session 2 before the delayed test; never inside a session. Retrieval counts come from the judge's `retrieval` field (§5b).
- **2 replications;** every learner gets both arms in both replications: 192 × 2 × 2 = **768 sessions per round**, 7,680 tutor turns.
- **Cells:** `<arm><rep><k>`, k = learner id mod 6 → 24 cells per round of 32 sessions, one tutor agent per cell writing every reply itself (scripted/templated/grouped replies kept as `PARTIAL_*` and redone).
- **Judges:** blind, the ESL6 judge task (section 3) with ESL2 `JUDGE_INSTRUCTIONS.md` and ESL6 `LEARNING_RULES.md`; input = knowledge state, previous tutor turn, learner message, production fact, tutor turn (no arm). Batches of 36 (about 22 per round). Reading only, no scripts or helper files.
- **No session is dropped;** failed work is kept as `PARTIAL_*` and rerun. The analysis refuses to decide on incomplete data.

## 7. Measurement: the outcome assessment bank

- **Forms:** each outcome's bank file has forms A, B, C (9 items, same types and sub-rules per position; 6 exact items × 1 point + 3 free/transfer items × 0/1/2 = **12 points per form**, checked for all 99 forms).
- **Times:** pre-test before session 1 (starting state); immediate post-test at the end of session 2 (no F1); delayed post-test after 7 days of F1. Assessments never update the state and are not retrieval attempts.
- **Rotation (Latin square over A/B/C):** three sequences pre/immediate/delayed = **A/B/C, B/C/A, C/A/B**, assigned by position in the learner's block (position mod 3; tables in section 5). Each outcome: each sequence twice; A1 outcomes: each sequence once per band; each form appears equally often at each time. A learner keeps the same sequence in both arms and both replications, so the paired arm difference compares the same form.
- **Which belief an item probes:** `ITEM_BELIEF_MAP.json` lists, for every item of the 30 outcomes × 3 forms, the wrong beliefs Wk (and their Ck) that could change its answer, by LEARNING_RULES §4a (ESL6 scope line): an item probes Wk if Wk's error (§1b row) could occur in it. Error-correction items probe the Wk whose error the prompt shows (from the item's `l1ErrorType`, matched to the §1b error type of the row) and any other Wk that could occur in the corrected sentence; free/transfer items probe every Wk of the row. Items with an error type outside the row (e.g. copula item 6 `be_agreement_plural` → W2 "is with every subject"; a type with no §1b counterpart) are mapped by meaning; an item that probes no seeded Wk is listed as `none` and is answered from the key (it cannot differ between arms; count reported). The map is written by one agent from the bank and the rules only, before `init`, with no access to any session.
- **How the answer string is produced (deterministic, no agent):** for each item, each probed Wk fires independently with the LEARNING_RULES §2 probability for its rounded strength, raised to the §2a graded Ck floor (0.4 × max(0, 1 − Ck/2)) for answers after at least one F1 interval (immediate and delayed; not the pre-test). Dice: `sha256(seed | 'assess-' + <pre|imm|del> | item id | Wk)` → uniform [0,1); the first firing belief in W1, W2 order decides the error.
  - **No belief fires:** the answer is the item key: `answerKey` (with a leading "e.g. " removed); for a key with alternatives ("I am single. / I am married.") the first alternative.
  - **Wk fires:** the answer is `WRONG_ANSWERS.json[item id][Wk]`, a fixed string showing Wk's error pattern (§1b) applied to the key: for error correction, the prompt sentence unchanged when the item's error is Wk's error, else the key with Wk's error applied; for gap/choice items the option or form Wk would produce (e.g. copula W1: empty gap; W2: "is"); for free/transfer items the key sentence with Wk's error applied in the target form only. Written once by one agent before `init`, from the bank, the §1b error examples and the rubric, blind to arm.
  - **Pre-init checks (`esl6Study.ts answercheck`, must pass):** every key string scores full points under the grader of this section; every wrong string scores less than full on the item it belongs to (free/transfer: 0 or 1); no wrong string equals a key. Failures are fixed in the files before `init`.
- **Scoring (DECISIONS 1):** ENARA's deterministic grader path, **graderV2 ON** (`ENARA_ENGINE_V2=graderV2`), **model path OFF** (DECISIONS 4: not validated, not used anywhere): exact items via `matchKeyV2`, free/transfer items via `scoreTargetForm`; a `null` from the scorer (no rule fits) scores 0 and is counted and reported. The scorer gets only item id and answer string (no arm, learner or time). **Score = percent of points per form** (points / 12).

## 8. Primary hypothesis (the only confirmatory test)

**(LE) − (PP) on the delayed-form score (percent of points), explicit-first learners (n = 180), each learner's two replications averaged.**
- **Test:** two-sided paired sign-flip. Exact over all 2^n sign patterns by convolution if every difference lies on the 1/24 grid (12-point forms averaged over 2 replications give multiples of 1/24 per arm, so the difference is too); otherwise Monte Carlo with **100,000** draws, **seed 6**. α = 0.05.
- **Interval:** 95% percentile bootstrap, **10,000** resamples, **seed 7**.

## 9. Secondary outcomes (descriptive only, no claims)

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
5. **Grader recheck (DECISIONS 2):** a 10% sample of all scored assessment answers (all times, arms, learners, items), drawn with `rand('esl6-recheck', answerId) < 0.1` (fixed seed string). **3 independent agent scorers**, rubric (`docs/SCORING_RUBRIC.md`) and item only, blind to arm, learner, time and grader score; reference = majority (median for 0/1/2 if all differ). Targets: **≥ 95% exact agreement** grader vs reference on exact items AND **QWK ≥ 0.80** on free/transfer items. Missing either = failed guard.

## 11. Decision rule (fixed now)

**CONFIRMED** only if all hold: p < 0.05; 95% CI lower bound > 0; all five guards pass; data complete (180 + 12 learners, both arms, both replications, 10 judged rounds, 3 forms scored each). Otherwise **NOT CONFIRMED**. No secondary outcome, subgroup, outcome, replication or other analysis will be presented as confirming the claim. B2 no-harm is reported next to the decision.

## 12. Limits and known issues (stated before any session)

1. **Forgetting check FAILED** (DECISIONS 6) in validation rounds 1 (F1 v1) and 2 (F1 v2) on the counted full-teaching design: 7-day (b) − (a) = 0.000, a ceiling effect (full teaching removes every wrong belief). Light-teaching sensitivity: 0.366 vs 0.595, immediate +0.031. The report must state that the forgetting model shows no recall benefit when teaching is complete and that this check did not pass.
2. 30, not 33, outcomes (section 5).
3. Grader validated only against agent scorers (round 5: 96.0% exact, 72/75, one miss from failing; QWK 0.914; scorers unanimous, shared bias likely); no human raters.
4. Model grader path NOT VALIDATED and not used.
5. Simulation only: hand-written learning rules, agent tutors, agent judges, agent scorers; nothing is evidence about real students.
6. The ESL5 instruction fixes and graderV2 were designed after seeing earlier rules and ESL5 results.
7. No human review of the assessments (bank status DRAFT); item-belief map and wrong answers are agent-written.
8. Underpowered at n = 180 for +0.06 (section 4), unless the user decides otherwise.
9. Per-learner judging noise on the delayed score is large (mean |diff| 0.149, NOISE_RESULT).
10. Few learners per outcome (6); per-outcome results are descriptive only.

## 13. Run plan

All commands from `backend/`, `S=../research/deep-learning-simulation-v2/src/offline/esl6Study.ts`, `D=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl6`.

0. User decision on section 4; write the files of section 3 "not yet written"; `answercheck`; commit this protocol with all hashes. No session before that commit.
1. `npx tsx $S init $D` (hash checks, overlap check, 768 sessions); `assess $D pre` (pre-test, scored).
2. Rounds 1–5 (session 1): per round `promptcheck` → 24 tutor cells (`tprompts` → answers → `tapply`, "applied 32 of 32") → `status` → `jprep r` → judges → `japply r`; round 3 also `agreeprep 3` + second judges.
3. `f1 $D 2` (2 days). Rounds 6–10 (session 2, new chat), same steps; round 8 `agreeprep 8`.
4. `assess $D imm`; `f1 $D 7`; `assess $D del`.
5. `recheckprep $D` → 3 scorer agents (`tasks/SCORE_TASK.md`); `agreescore`; `tags` (STUCK.json, leak recount); `rateprep` → raters; `fidprep` → fidelity checkers.
6. `python3 src/offline/esl6_analyze.py reports/exp4/agent_sim_esl6` → `ANALYSIS.json`; report `reports/exp4/AGENT_SIM_ESL6.md`.
7. **Usage limit:** stop cleanly at the end of the current cell or batch; write `reports/exp4/agent_sim_esl6/RESUME.md` (rounds complete, partial files and how to check them against the batch .md, exact next steps, deviations so far) and commit; resume from RESUME.md, never from memory.
