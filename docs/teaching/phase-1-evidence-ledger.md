# Phase 1 Evidence Ledger: Language Teaching Context Engine

Date: 2026-11-07. Scope: the design decisions in `docs/architecture/language-teaching-context-engine.md`.

## How sources were checked

- **Bibliographic check.** Every source below was checked against its DOI registry record (`https://api.crossref.org/works/<DOI>`) for title, authors, year, venue, volume and pages.
- **Abstracts.** Abstracts were read from Crossref or OpenAlex (`https://api.openalex.org/works/doi:<DOI>`), and for one source the publisher page. Full texts were not read, except Kestin et al. (2025).
- **Effect sizes.** An effect size appears only where it was read in an abstract or in the text that was fetched.
- **Sources not cited for claims:**
  - The Council of Europe site (coe.int) returned HTTP 403. The CEFR Companion Volume is therefore cited only as a framework name, never for a quoted claim.
  - Keck et al. (2006), Russell & Spada (2006), Hu & Nation (2000) and Webb (2007): their bibliographic details were verified, but their findings could not be read.
  - Mackey & Goo (2007) could not be found in Crossref.
- **Evidence gaps:**
  - No verified source studies learners of Modern Standard Arabic.
  - No verified randomised trial tests an LLM tutor for second-language (L2) learning.
  - Most general learning-science evidence comes from STEM subjects or general schooling.

## Important caution

Every source below supports a general claim about learning or teaching. None of them shows that ENARA's implementation improves learning. Every decision below needs its own validation measure. The paid evaluation planned in Step E is a small check of model behaviour, not a test of educational efficacy.

## Sources (verified)

| Key | Citation | DOI / stable URL | Type | Population / context |
|---|---|---|---|---|
| ZIEGLER_2016 | Ziegler, N. (2016). Synchronous computer-mediated communication and interaction: A meta-analysis. *Studies in Second Language Acquisition*, 38(3), 553–586. | 10.1017/S027226311500025X | Meta-analysis (14 studies) | Text or voice chat vs face-to-face interaction between human L2 learners |
| LYSTER_SAITO_2010 | Lyster, R., & Saito, K. (2010). Oral feedback in classroom SLA: A meta-analysis. *SSLA*, 32(2), 265–302. | 10.1017/S0272263109990520 | Meta-analysis (15 studies, N = 827) | Oral feedback in classrooms |
| LI_2010 | Li, S. (2010). The effectiveness of corrective feedback in SLA: A meta-analysis. *Language Learning*, 60(2), 309–365. | 10.1111/j.1467-9922.2010.00561.x | Meta-analysis (33 studies) | Lab and classroom, mostly oral or interactional |
| AMMAR_SPADA_2006 | Ammar, A., & Spada, N. (2006). One size fits all? Recasts, prompts, and L2 learning. *SSLA*, 28(4), 543–574. | 10.1017/S0272263106060268 | Quasi-experimental | 64 grade-6 French-L1 learners of English |
| LYSTER_SAITO_SATO_2013 | Lyster, R., Saito, K., & Sato, M. (2013). Oral corrective feedback in second language classrooms. *Language Teaching*, 46(1), 1–40. | 10.1017/S0261444812000365 | Narrative review | Classroom oral corrective feedback |
| KANG_HAN_2015 | Kang, E., & Han, Z. (2015). The efficacy of written corrective feedback in improving L2 written accuracy: A meta-analysis. *Modern Language Journal*, 99(1), 1–18. | 10.1111/modl.12189 | Meta-analysis (21 studies) | Written feedback on L2 writing |
| BROWN_LIU_NOROUZIAN_2023 | Brown, D., Liu, Q., & Norouzian, R. (2023). Effectiveness of written corrective feedback in developing L2 accuracy: A Bayesian meta-analysis. *Language Teaching Research*, 30(3), 1357–1389. | 10.1177/13621688221147374 | Bayesian meta-analysis (52 studies) | Written feedback on L2 writing |
| NORRIS_ORTEGA_2000 | Norris, J. M., & Ortega, L. (2000). Effectiveness of L2 instruction: A research synthesis and quantitative meta-analysis. *Language Learning*, 50(3), 417–528. | 10.1111/0023-8333.00136 | Meta-analysis (49 samples) | L2 instruction studies, 1980–1998 |
| SPADA_TOMITA_2010 | Spada, N., & Tomita, Y. (2010). Interactions between type of instruction and type of language feature: A meta-analysis. *Language Learning*, 60(2), 263–308. | 10.1111/j.1467-9922.2010.00562.x | Meta-analysis (41 studies) | English grammar |
| GOO_ETAL_2015 | Goo, J., Granena, G., Yilmaz, Y., & Novella, M. (2015). Implicit and explicit instruction in L2 learning: Norris & Ortega (2000) revisited and updated. In P. Rebuschat (Ed.), *Implicit and Explicit Learning of Languages* (pp. 443–482). Benjamins. | 10.1075/sibil.48.18goo | Meta-analysis (34 studies) | Studies comparing explicit and implicit instruction |
| KANG_SOK_HAN_2019 | Kang, E. Y., Sok, S., & Han, Z. (2019). Thirty-five years of ISLA on form-focused instruction: A meta-analysis. *Language Teaching Research*, 23(4), 428–453. | 10.1177/1362168818776671 | Meta-analysis (54 studies) | Instructed second-language acquisition (ISLA) studies from six journals |
| LAUFER_RAVENHORST_2010 | Laufer, B., & Ravenhorst-Kalovski, G. C. (2010). Lexical threshold revisited: Lexical text coverage, learners' vocabulary size and reading comprehension. *Reading in a Foreign Language*, 22(1), 15–30. | https://hdl.handle.net/10125/66648 (Crossref DOI 10.64152/10125/66648) | Correlational | L2 reading |
| SCHMITT_JIANG_GRABE_2011 | Schmitt, N., Jiang, X., & Grabe, W. (2011). The percentage of words known in a text and reading comprehension. *Modern Language Journal*, 95(1), 26–43. | 10.1111/j.1540-4781.2011.01146.x | Correlational (N = 661) | L2 reading, 8 countries |
| HALL_COOK_2012 | Hall, G., & Cook, G. (2012). Own-language use in language teaching and learning. *Language Teaching*, 45(3), 271–308. | 10.1017/S0261444812000067 | Narrative review | Classroom own-language use |
| HT2007 | Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research*, 77(1), 81–112. | 10.3102/003465430298487 | Conceptual review | General schooling |
| WZH2020 | Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback revisited: A meta-analysis of educational feedback research. *Frontiers in Psychology*, 10, 3087. | 10.3389/fpsyg.2019.03087 | Meta-analysis (435 studies) | General education |
| KD1996 | Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance. *Psychological Bulletin*, 119(2), 254–284. | 10.1037/0033-2909.119.2.254 | Meta-analysis (607 effect sizes) | Performance broadly |
| SHUTE2008 | Shute, V. J. (2008). Focus on formative feedback. *Review of Educational Research*, 78(1), 153–189. | 10.3102/0034654307313795 | Narrative review | Feedback, including computer-based |
| KN2011 | Kingston, N., & Nash, B. (2011). Formative assessment: A meta-analysis and a call for research. *Educational Measurement: Issues and Practice*, 30(4), 28–37. | 10.1111/j.1745-3992.2011.00220.x | Meta-analysis (13 usable studies) | K-12 |
| BRIGGS2012 | Briggs, D. C., Ruiz-Primo, M. A., Furtak, E., Shepard, L., & Yin, Y. (2012). Meta-analytic methodology and inferences about the efficacy of formative assessment. *EM:IP*, 31(4), 13–17. | 10.1111/j.1745-3992.2012.00251.x | Methodological commentary | Critique of KN2011 |
| VDP2010 | van de Pol, J., Volman, M., & Beishuizen, J. (2010). Scaffolding in teacher–student interaction: A decade of research. *Educational Psychology Review*, 22(3), 271–296. | 10.1007/s10648-010-9127-6 | Systematic review | Teacher–student interaction |
| BELLAND2017 | Belland, B. R., Walker, A. E., Kim, N. J., & Lefler, M. (2017). Synthesizing results from empirical research on computer-based scaffolding in STEM education. *Review of Educational Research*, 87(2), 309–344. | 10.3102/0034654316670999 | Meta-analysis (144 studies) | STEM, primary school to adult |
| KSC2006 | Kirschner, P. A., Sweller, J., & Clark, R. E. (2006). Why minimal guidance during instruction does not work. *Educational Psychologist*, 41(2), 75–86. | 10.1207/s15326985ep4102_1 | Argumentative review | Novice learners |
| ALFIERI2011 | Alfieri, L., Brooks, P. J., Aldrich, N. J., & Tenenbaum, H. R. (2011). Does discovery-based instruction enhance learning? *Journal of Educational Psychology*, 103(1), 1–18. | 10.1037/a0021017 | Two meta-analyses (164 studies) | Mixed domains |
| KALYUGA2007 | Kalyuga, S. (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Educational Psychology Review*, 19(4), 509–539. | 10.1007/s10648-007-9054-3 | Review | Cognitive-load studies |
| SVMP2019 | Sweller, J., van Merriënboer, J. J. G., & Paas, F. (2019). Cognitive architecture and instructional design: 20 years later. *Educational Psychology Review*, 31(2), 261–292. | 10.1007/s10648-019-09465-5 | Theoretical review | General |
| ATKINSON2000 | Atkinson, R. K., Derry, S. J., Renkl, A., & Wortham, D. (2000). Learning from examples. *Review of Educational Research*, 70(2), 181–214. | 10.3102/00346543070002181 | Review | Mainly maths and science |
| ALEVEN2003 | Aleven, V., Stahl, E., Schworm, S., Fischer, F., & Wallace, R. (2003). Help seeking and help design in interactive learning environments. *Review of Educational Research*, 73(3), 277–320. | 10.3102/00346543073003277 | Review | Interactive learning environments |
| VANLEHN2011 | VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4), 197–221. | 10.1080/00461520.2011.611369 | Review of experiments | Mostly STEM |
| KULIK_FLETCHER2016 | Kulik, J. A., & Fletcher, J. D. (2016). Effectiveness of intelligent tutoring systems: A meta-analytic review. *Review of Educational Research*, 86(1), 42–78. | 10.3102/0034654315581420 | Meta-analysis (50 evaluations) | Mixed subjects |
| BASTANI2025 | Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *PNAS*, 122(26), e2422633122. | 10.1073/pnas.2422633122 | Field experiment | About 1,000 high-school maths students |
| KESTIN2025 | Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting. *Scientific Reports*, 15, 17458. | 10.1038/s41598-025-97652-6 | RCT (N = 194) | Undergraduate physics |
| ROSS1998 | Ross, S. (1998). Self-assessment in second language testing: A meta-analysis and analysis of experiential factors. *Language Testing*, 15(1), 1–20. | 10.1177/026553229801500101 | Meta-analysis | L2 learners |
| LI_ZHANG2021 | Li, M., & Zhang, X. (2021). A meta-analysis of self-assessment and language performance in language testing and assessment. *Language Testing*, 38(2), 189–218. | 10.1177/0265532220932481 | Meta-analysis (67 studies) | L2 learners |
| DEYGERS2018 | Deygers, B., Zeidler, B., Vilcu, D., & Carlsen, C. H. (2018). One framework to unite them all? Use of the CEFR in European university entrance policies. *Language Assessment Quarterly*, 15(1), 3–15. | 10.1080/15434303.2016.1261350 | Qualitative study (30 respondents) | University entrance policies |
| KIM_WEBB2022 | Kim, S. K., & Webb, S. (2022). The effects of spaced practice on second language learning: A meta-analysis. *Language Learning*, 72(1), 269–319. | 10.1111/lang.12479 | Meta-analysis (48 experiments) | L2 learners, mostly vocabulary |
| UCHIHARA2019 | Uchihara, T., Webb, S., & Yanagisawa, A. (2019). The effects of repetition on incidental vocabulary learning: A meta-analysis of correlational studies. *Language Learning*, 69(3), 559–599. | 10.1111/lang.12343 | Meta-analysis (26 studies) | L2 incidental vocabulary learning |

## Decisions

Decisions run from LTC-D1 to LTC-D13. Each entry gives the decision, the claim it rests on, its sources and status, the strength and limits of the evidence, how far the evidence applies, what ENARA does, and how to validate it. The status labels follow the spec: `evidence_supported`, `mixed_evidence`, `experimental`.

### LTC-D1 — Proficiency is a labelled prior, never an invented fact

- **Claim:** Self-reported L2 proficiency correlates only moderately with measured performance. Its validity varies with how criteria are given and how experienced the learner is. CEFR level labels are often used as fixed standards without validated assessment behind them.
- **Sources:** LI_ZHANG2021 (overall r = .466), ROSS1998, DEYGERS2018.
- **Strength and limits:** Meta-analytic for self-assessment. DEYGERS2018 is qualitative and about university admissions, not tutoring. The CEFR Companion Volume could not be read.
- **Applicability:** Direct for self-assessment. Indirect for CEFR use.
- **ENARA decision:**
  - Proficiency carries a status: `known`, `inferred`, `not_assessed` or `unknown`, with its source and date.
  - A course's target level (for example "A2") is recorded as `inferred: course level`, never `known`.
  - No ENARA source currently yields `known`, because there is no validated placement result.
  - The tutor is told the level is an estimate and to adjust from the learner's actual replies.
- **Validation:**
  - Unit tests check each status.
  - The Step E rubric checks that the tutor never states the learner "is" at a level.
- **Status:** `evidence_supported`. This rates the caution only; it does not mean the level estimate is accurate.

### LTC-D2 — Level-appropriate tutor language

- **Claim:** L2 reading comprehension rises roughly linearly with the share of words the reader knows. Coverage around 95–98% is the commonly proposed target, and there is no sharp threshold.
- **Sources:** SCHMITT_JIANG_GRABE_2011, LAUFER_RAVENHORST_2010.
- **Strength and limits:** Correlational. Reading of longer texts, not short chat turns. No source checks whether an LLM can hit a coverage target.
- **Applicability:** Partial.
- **ENARA decision:** Learners at a beginner or unknown level get:
  - short sentences and high-frequency words;
  - at most a few new words per reply, each with a short gloss.

  Advanced learners are not given beginner simplification.
- **Validation:**
  - The Step E rubric item "level appropriateness".
  - A later measure: new-word density per reply against a lesson word list.
- **Status:** `experimental` for chat. The principle is grounded; it has not been shown to work in this medium.

### LTC-D3 — Direct explanation stays available; novices get more guidance, advanced learners less

- **Claims:**
  - Explicit L2 instruction has generally beaten implicit instruction (NORRIS_ORTEGA_2000, SPADA_TOMITA_2010, GOO_ETAL_2015). KANG_SOK_HAN_2019 finds only a minor difference.
  - Unassisted discovery is worse than explicit instruction, while assisted discovery helps (ALFIERI2011).
  - Novices need more guidance (KSC2006).
  - Techniques that help novices can lose effect with more expert learners (KALYUGA2007).
  - Worked examples matter most early in skill development (ATKINSON2000).
- **Strength and limits:** Meta-analytic, but the size of the explicit advantage is contested. The general learning-science evidence is mostly STEM.
- **Applicability:** Partial.
- **ENARA decision:**
  - The move `short_explanation` is always allowed when the learner asks for an explanation, or when a beginner meets a new item.
  - The tutor must not insist on questioning when the learner is confused or asks for a direct answer.
  - For advanced or proficient learners, the move `fade_support` (fewer scaffolds, harder variants) applies.
- **Validation:**
  - Step E cases: a beginner asking "what does X mean?" gets an explanation, not a string of questions; an advanced learner does not get a beginner explanation.
- **Status:** `evidence_supported` for keeping explicit explanation available. `mixed_evidence` for its relative size.

### LTC-D4 — Specific corrective feedback, with a chance to self-correct

- **Claims:**
  - Corrective feedback has significant, durable effects (LI_2010, LYSTER_SAITO_2010).
  - Written corrective feedback improves accuracy (KANG_HAN_2015, BROWN_LIU_NOROUZIAN_2023).
  - Prompts, which push the learner to self-correct, beat recasts in classroom oral studies (LYSTER_SAITO_2010). In one study they helped low-proficiency learners more (AMMAR_SPADA_2006).
  - Feedback focused on the task works; feedback that draws attention to the self can hurt (KD1996, HT2007, SHUTE2008).
- **Strength and limits:**
  - Oral and classroom evidence dominates. AMMAR_SPADA_2006 is one study of children.
  - Implicit feedback effects were better maintained over time in LI_2010.
  - BROWN_LIU_NOROUZIAN_2023 found feedback types similar in writing.
- **Applicability:** Partial. A text chat is not essay writing and not oral classroom interaction.
- **ENARA decision:** When the learner is answering the tutor's check question, the move `corrective_feedback_retry` applies:
  - say specifically what is right or wrong;
  - for beginner or unknown levels, first prompt the learner to fix the error and give one retry before modelling the correct form;
  - for advanced learners, a brief reformulation is acceptable;
  - never praise or criticise the person.
- **Validation:**
  - The Step E rubric item "misconception handling".
  - Later: the retry success rate in tutor turns.
- **Status:**
  - `evidence_supported` for giving specific corrective feedback.
  - `experimental` for mapping prompts versus recasts to proficiency level in chat.

### LTC-D5 — Check understanding after new input

- **Claim:** Formative checking and feedback can improve learning, but meta-analytic estimates are modest (around .20, larger in English language arts at .32) and methodologically disputed.
- **Sources:** KN2011, BRIGGS2012, SHUTE2008.
- **Applicability:** Partial.
- **ENARA decision:** The move `comprehension_check` adds one short, focused question or task after a new explanation. It is skipped for greetings and for direct factual answers to an advanced learner. The existing proactive-teaching rule already asks for this; the new move ties the check to the lesson's objective.
- **Validation:** Rubric item "response clarity", and whether a check question appears when the case expects one.
- **Status:** `mixed_evidence`.

### LTC-D6 — Do not give answers away by default in practice; scaffold contingently

- **Claims:**
  - Unguarded generative-AI access raised practice scores but lowered later unassisted performance; the guardrails largely removed the harm (BASTANI2025, maths).
  - Learners often misuse help facilities (ALEVEN2003).
  - Scaffolding should be contingent on the learner and faded (VDP2010). The meta-analytic effect did not differ by fading, though (BELLAND2017).
  - A tutor designed on pedagogical principles outperformed active learning in one RCT (KESTIN2025, physics).
- **Applicability:**
  - BASTANI2025 applies directly as a design warning.
  - KESTIN2025 applies partially; no L2 evidence exists.
- **ENARA decision:**
  - During guided practice, the move `scaffold_hint` gives a hint that fits the last reply, not the answer.
  - When the learner explicitly asks for the answer outside an assessment, the tutor may give it together with the reasoning and then one similar practice item.
  - Assessment-integrity and "hints only" rules still take precedence.
- **Validation:** Step E case: "guided practice — answer not revealed prematurely".
- **Status:** `evidence_supported` for the guardrail; the evidence is from other domains. `mixed_evidence` for fading.

### LTC-D7 — Reteach more simply after repeated confusion

- **Claim:** Instruction that fits the learner's prior knowledge reduces load (KALYUGA2007; SVMP2019, which is theory). Help must be contingent on the learner's state (VDP2010).
- **Applicability:** Partial.
- **ENARA decision:** Two or more confusion signals in the learner's last three messages (for example "I don't understand", "مش فاهم", or a bare "?") trigger `reteach_simpler`:
  - a smaller step and a concrete example;
  - an L1 gloss allowed at beginner level.
- **Validation:** Unit tests on the signal detection. A Step E case.
- **Status:** `experimental`. The signal heuristics are ENARA's own and are not validated.

### LTC-D8 — Brief first-language support for beginners

- **Claim:** The "monolingual assumption" is increasingly questioned, and principled own-language use has theoretical support.
- **Source:** HALL_COOK_2012.
- **Limits:** A narrative review. It does not show learning gains from using the first language.
- **ENARA decision:** When the target language is English, the level is beginner or unknown, and the learner writes in Arabic script, the move `l1_support` applies:
  - a brief gloss or clarification in the learner's language is allowed;
  - then the tutor returns to the target language.

  The learner's language is recorded as `inferred: learner messages`, never as `known`.
- **Validation:** A Step E case. Later, teacher review.
- **Status:** `experimental`.

### LTC-D9 — Be honest about modality

- **Claim:** Text and voice chat interaction (SCMC) and face-to-face interaction both supported L2 development. SCMC had a small, non-significant edge on productive and written measures; face-to-face on receptive and oral measures.
- **Source:** ZIEGLER_2016.
- **ENARA decision:**
  - Text-chat turns are recorded as skill `written_interaction`.
  - The tutor is told not to present a text exchange as listening or speaking practice.
  - Speaking assessment stays out of scope.
- **Validation:** Unit test on the recorded skill. Rubric check that the tutor does not claim speaking practice.
- **Status:** `evidence_supported`, for the narrow claim that text interaction is a legitimate L2 practice setting.

### LTC-D10 — Retrieval and spacing are not changed in this phase

- **Claim:** Spacing has a medium-to-large effect in L2 learning, and equal and expanding schedules were equivalent (KIM_WEBB2022). Repetition relates to incidental vocabulary gains (UCHIHARA2019).
- **ENARA decision:** No change. ENARA already has spaced review (`ReviewItem`) and the existing `retrieval_practice` and `spaced_repetition` methods. Lesson vocabulary lists added in this phase make later per-word exposure tracking possible.
- **Status:** Reference only. Proposed for a later phase.

### LTC-D11 — Tutor-turn observations are evidence, not mastery

- **Claim:** Effect estimates for intelligent tutoring systems depend heavily on the measure. They are much larger on locally developed tests than on standardized tests (KULIK_FLETCHER2016).
- **ENARA decision:**
  - Each language turn stores a minimal record: lesson, objective if any, skill, moves delivered, whether support was requested, confusion signals, and the suggested next step.
  - The record has provenance `deterministic_turn_signals`, confidence `low`, and an explicit `masteryClaim: false`.
  - It never updates `StudentObjectiveMastery`. Existing grading and mastery semantics are unchanged.
- **Validation:** Unit test that no mastery document changes after a tutor turn.
- **Status:** `experimental`, in the sense that its usefulness is untested.

### LTC-D12 — No direct identifiers in provider payloads

- **Basis:** A product and privacy requirement from the Phase 1 spec, not a research claim.
- **ENARA decision:** The learner snapshot sent to the model no longer includes the student's name, and the voice opening no longer greets the student by name.
- **Validation:** A test that the prompt contains no student name, email or ID.
- **Status:** Requirement.

### LTC-D13 — Establish what the learner wants to do

- **Basis:** A product requirement from the Phase 1 spec ("establish what the learner is trying to achieve"), not a research claim.
- **ENARA decision:** The move `clarify_goal` asks one short question when:
  - the learner's message is vague, such as a bare greeting; or
  - it is their first message and no lesson is known.

  It is not used when the message already states the goal.
- **Validation:** Unit tests. Step E case "vague greeting".
- **Status:** Requirement.

## Mixed or contested evidence the design must not overstate

- **Explicit vs implicit:** the size of the explicit-instruction advantage is contested (KANG_SOK_HAN_2019 against NORRIS_ORTEGA_2000), and implicit feedback effects were better maintained in LI_2010.
- **Formative assessment:** the effect size is uncertain (KN2011, BRIGGS2012).
- **Fading:** fading is central to how scaffolding is defined (VDP2010), but the computer-based meta-analysis found no effect difference by fading (BELLAND2017).
- **Feedback can backfire:** more than a third of feedback interventions in KD1996 lowered performance.
- **LLM tutors:** one positive RCT (KESTIN2025, physics) and one harmful unguarded condition (BASTANI2025, maths). Neither covers L2.
- **Age:** younger learners benefited more from corrective feedback (LYSTER_SAITO_2010). Results from children may not transfer to adults, and the reverse is also true.
