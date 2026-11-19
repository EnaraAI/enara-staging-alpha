# The 23 methods → lesson shape, stage, age, level, rule

**Approved 19 Nov 2026** with one change to S2 (LAD only under 9 or Pre-A1; children 9–12 at A1+ get PPP with child supports).

19 Nov 2026. Tutor track. For approval before any planner code. Agent runs for this step: 0.

Source of today's rules: `pedagogyPolicy.ts` (ped-v2) and `strategyRegistry.ts` on `claude/tutor-teaching`. **★ = new or changed rule** compared with today; everything else keeps today's behaviour.

## Lesson shapes and their stages

| Shape | Stages, in order | Who gets it |
|---|---|---|
| **PPP**: present, practise, produce | Present → Practise → Produce → Check | Default for A1–A2 teens and adults, and for any learner new to the form |
| **TTT**: test, teach, test | Test (3 items) → Teach the gaps → Test again | Teens and adults who already know part of the form |
| **TASK**: task-based | Pre-task (context) → Task (role-play) → Language focus → Repeat task | B1+ teens and adults with a real-life goal |
| **LAD**: listen and do | Listen (story/chant) → Do (tap/drag/say) → Chant again → Check | Children under 9, and Pre-A1 at any age |
| **Review** opener | Recall → back to the lesson's shape | Any learner, session 2 onward or when a review is due |

## Rule that picks the shape (first match wins) ★

| # | Signals | Shape |
|---|---|---|
| S1 | Session ≥ 2 and earlier errors exist, or a review is due | Review opener, then S2–S6 |
| S2a | Level Pre-A1, any age | LAD |
| S2b | Child with a known age under 9 | LAD |
| S2c | Child 9–12, or child of unknown exact age, at A1+ | PPP with child supports on (gamification, narrative, short replies, scaffolding) |
| S3 | Level B1+, mastery ≥ developing, goal set (work, exam, daily life) | TASK |
| S4 | Teen or adult, quick check ≥ 2 of 3 right | TTT |
| S5 | Teen or adult, quick check < 2 of 3 right, or no quick check | PPP |
| S6 | Anything else (age unknown) | PPP |

## The 23 methods

Level gate today (`levelExplicit`): open-ended methods are never the main method below B1. Grade gate (`minGrade`) also kept.

| # | Method | Role | Shape: stage | Age band | Level | Rule that picks it |
|---|---|---|---|---|---|---|
| 1 | Direct Instruction | Main | PPP: Present; TTT: Teach | All | Pre-A1–A2; any level when emerging | Mastery not assessed or emerging, and no diagnosed error |
| 2 | Socratic Method | Main / support | TASK: Language focus | Teen, adult | B1+ | Mastery proficient, discussion-type goal. Never below B1, never under grade 5 |
| 3 | Scaffolded Instruction | Main | PPP: Practise; LAD: Do | All; always on for child ★ | Pre-A1–B1 | Mastery developing; or any child in the Do stage ★ |
| 4 | Mastery Learning | Main / modifier | PPP: Check; TTT: Test again | All | All | Mastery proficient: verify independent success before moving on |
| 5 | Inquiry-Based | Support | TASK: Pre-task | Teen, adult | B1+ | Recall right but use wrong (application gap), B1+ |
| 6 | Problem-Based | Main | TASK: Task | Adult (grade 7+) | B1+ | Mastered, goal work or daily life ★ (today: "applied" subjects only) |
| 7 | Case-Based | Main / support | TASK: Task | Adult (grade 9+) | B2+ ★ | Mastered, goal work or exam |
| 8 | Project-Based | Main | TASK, over several lessons | Teen, adult | B1+ | Teacher-assigned only; never picked automatically ★ |
| 9 | Retrieval Practice | Main / reinforcement | Review opener; TTT: Test | All | All | Session ≥ 2 opening, retention lapsed, or mastered and review due |
| 10 | Spaced Repetition | Reinforcement / system | Between lessons | All | All | Always on: schedules items once answered right |
| 11 | Interleaving | Reinforcement | PPP: Practise (late) | Age 9+ (grade 4+) | A1+ | Form right twice this session and a confusable form exists |
| 12 | Worked Examples | Support / main | PPP: Present; TTT: Teach | All | Pre-A1–B1 | Supports Direct Instruction for novices; main on a form error |
| 13 | Elaborative Interrogation | Support | PPP: Produce | Teen, adult | B1+ ★ (today: any) | Supports Mastery Learning when proficient; may be answered in Arabic ★ |
| 14 | Analogical Reasoning | Main / support | PPP: Present | Teen, adult; child via pictures | All | Conceptual misunderstanding; for ESL, an Arabic-transfer error → English–Arabic contrast ★ |
| 15 | Metacognitive Strategy | Support / main | PPP: Check (reflection) | Teen, adult | A2+ ★ | A confirmed error persists after one change of method |
| 16 | Think-Aloud | Support | PPP: Present (tutor models) | All | All | Form error or misread task |
| 17 | Concept Mapping | Reinforcement | Review; vocabulary word maps | Teen, adult (grade 5+) | B1+ ★ | Mastered with 3+ related objectives secure |
| 18 | Differentiated Instruction | Modifier | All stages | All | All | Always on: reply length and support language from age band and level |
| 19 | Adaptive Pathways | System | Between lessons | All | All | Always on: next objective, or a weak prerequisite first |
| 20 | Formative Assessment & Feedback | Modifier / main | Every answer; TTT: both tests | All | All | Always on: feedback ladder (prompt → clue → correction) |
| 21 | Gamification | Support | LAD: all stages; PPP: Practise for child | Child; light for teen | Pre-A1–A2 | Age band child (stars, stickers, streak in Enara Kids) |
| 22 | Narrative & Contextual | Support | LAD: Listen (story); TASK: Pre-task | Child stories; context for all | Pre-A1–A2 stories; all for context | Age band child, or a vocabulary outcome (word in context) |
| 23 | Bloom's-Guided | Main / modifier | TASK: Language focus; PPP: Produce | Teen, adult | B1+ | Application gap at B1+ |

## The 5 techniques the rules also pick (not in the 23)

| Technique | Shape: stage | Rule |
|---|---|---|
| Prerequisite remediation | Any, before the lesson | A weak prerequisite: teach it first (beats every rule except teacher-assigned) |
| Guided practice | PPP: Practise | Procedural error, after a worked example did not help |
| Independent practice | PPP: Produce; TTT: Test again | Proficient, verifying without help |
| Error analysis | PPP: Practise | Misread task or incomplete reasoning |
| Visual explanation | PPP: Present; LAD: Listen | Conceptual error after an analogy was already tried; pictures for children |

## Order of rules for the main method (unchanged from today, first match wins)

1. Teacher-assigned → 2. Weak prerequisite → 3. Review opener → 4. Retention lapsed → 5. Previous method failed on new evidence → switch → 6. Persistent error → Metacognitive → 7. Error type (conceptual / form / misread) → 8. A1–A2 novice → Direct Instruction → 9. Application gap → Bloom's → 10. By mastery level.

New: the shape is chosen first; a method that has no stage in that shape is skipped and the next rule applies ★.

## Decisions for you

1. Approve the 5 shape rules (S1–S6), mainly the TTT threshold of 2 of 3 right.
2. Approve the ★ changes: Elaborative and Concept Mapping B1+ only; Case-Based B2+; Project-Based teacher-only; scaffolding always on for children.

## Estimates for the next steps

| Step | Agent runs | Notes |
|---|---|---|
| 2. Planner code + all tests | 0 for code and unit tests | Off-parity, coverage, golden traces run as normal tests |
| 2. Simulation no-harm | ~40–60 | First an offline diff of planner2 vs today on the ESL6 learners (0 runs); simulate only learners whose plan changes, in batches of 36 |
| 3. Kids pack | ~150–200 | Estimated in detail before it starts |
