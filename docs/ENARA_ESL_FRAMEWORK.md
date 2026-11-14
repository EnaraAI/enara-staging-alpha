# Research framework for ENARA: teaching English to Arabic-speaking (Egyptian) learners

*Written 14 Nov 2026. Documents only; no production code was changed. Companion files: `ENARA_ESL_GAP_AUDIT.md` (where ENARA stands) and `ENARA_ESL_ROADMAP.md` (what to change, and the summary for the owner).*

## How to read this document

- **Every citation is marked VERIFY.** It was written from memory, not looked up. Authors, years and venues are ones I believe exist, but a human must check each one before anyone relies on it. No page numbers are given. **No effect sizes are given**: where a finding is described, only its direction is stated, and that too needs checking.
- **Evidence strength** has three levels:
  - **strong**: several independent syntheses or meta-analyses point the same way;
  - **moderate**: a body of studies or a meta-analysis exists, but with known limits (short studies, lab or classroom settings that differ from an AI tutor, outcome measures that favour one approach);
  - **contested**: researchers disagree about the claim, its size, or its mechanism.
- Almost all of this research was done with human teachers, in classrooms or labs, mostly with adults or university students, mostly in spoken interaction. **None of it tests an AI tutor with Egyptian school learners.** "What it implies for an AI tutor" is therefore my reasoning from the research, not a finding. Where a point is my inference, it says so.
- ENARA's own studies (`research/deep-learning-simulation-v2/`) use AI-simulated learners. They are not evidence about real learners and are not used as such here.

---

## 1. Nation's four strands

**Core claim.** A balanced language course gives roughly equal time to four kinds of activity: (1) **meaning-focused input** (listening and reading to understand, with mostly known language), (2) **meaning-focused output** (speaking and writing to communicate), (3) **language-focused learning** (deliberate study of words, grammar, spelling, pronunciation), (4) **fluency development** (getting faster and smoother with language already known: easy, repeated, time-pressured use). Nation's rule of thumb is about a quarter of course time for each. A course that is mostly the third strand teaches *about* the language and builds little ability to use it.

**Evidence strength.** *Moderate as a design principle; the equal split is a guideline, not a tested optimum.* Support comes from separate lines of evidence for each strand (input and reading, output, form-focused instruction, fluency training) and from expert consensus. I know of no study that tests "25/25/25/25" against other splits.

**Key sources (all VERIFY).**
- Nation, 2007, "The four strands", *Innovation in Language Learning and Teaching*.
- Nation & Newton, 2009, *Teaching ESL/EFL Listening and Speaking* (Routledge).
- Nation, 2013, *Learning Vocabulary in Another Language*, 2nd edition (Cambridge University Press).
- Fluency practice: Arevart & Nation, 1991, "Fluency improvement in a second language", *RELC Journal*; De Jong & Perfetti, 2011, "Fluency training in the ESL classroom", *Language Learning*.
- Extensive reading: Day & Bamford, 1998, *Extensive Reading in the Second Language Classroom* (Cambridge University Press); Nakanishi, 2015, a meta-analysis of extensive reading, *TESOL Quarterly*.

**Implication for an AI tutor.** (My inference.) A chat tutor that works through teacher-written grammar items is a strand-3 machine. It can also do strand 2 (the learner writes or says something and gets feedback). It can supply strand 1 if it can deliver graded, interesting text or audio. Strand 4 needs *easy* material repeated at speed, which is the opposite of the "one careful step, then a hint" rhythm of a tutoring chat; it needs its own activity type (timed, repeated, low-error). The tutor should know which strand each turn serves and should log the split.

---

## 2. Explicit vs implicit grammar instruction, and the expertise reversal effect

**Core claim.** Telling learners the rule (explicit instruction) generally produces larger and more durable gains on grammar tests than leaving them to infer it (implicit instruction), at least for the kinds of tests used in most studies. Separately, the **expertise reversal effect** from cognitive-load research says that detailed guidance helps novices but becomes redundant or harmful for more expert learners, so guidance should be *faded* as knowledge grows. Together these imply: **explain for novices, question more as learners advance.**

**Evidence strength.**
- *Explicit generally beats implicit for L2 grammar:* **moderate to strong.** Meta-analyses agree on direction. Known limits: many outcome measures (gap-fills, grammaticality judgments) favour explicit knowledge; implicit-instruction studies are usually short; learners are often adults or university students.
- *Expertise reversal:* **moderate** (well replicated in cognitive-load research in general, much less tested in L2 grammar).
- *"Discovery/inquiry is as good as direct teaching":* **contested**; the general education literature suggests unguided discovery is weak, while *guided* discovery can do well.

**Key sources (all VERIFY).**
- Norris & Ortega, 2000, "Effectiveness of L2 instruction: a research synthesis and quantitative meta-analysis", *Language Learning*.
- Spada & Tomita, 2010, "Interactions between type of instruction and type of language feature: a meta-analysis", *Language Learning*.
- Goo, Granena, Yilmaz & Novella, 2015, on implicit and explicit instruction and L2 knowledge types (a chapter in Rebuschat, ed., *Implicit and Explicit Learning of Languages*).
- Kalyuga, Ayres, Chandler & Sweller, 2003, "The expertise reversal effect", *Educational Psychologist*.
- Kirschner, Sweller & Clark, 2006, "Why minimal guidance during instruction does not work", *Educational Psychologist*; Hmelo-Silver, Duncan & Chinn, 2007, a published reply in the same journal (the dispute is the point).
- Mayer, 2004, "Should there be a three-strikes rule against pure discovery learning?", *American Psychologist*; Alfieri, Brooks, Aldrich & Tenenbaum, 2011, a meta-analysis of discovery learning, *Journal of Educational Psychology*.

**Implication for an AI tutor.** (Inference.) For a learner at A1 to A2, or a learner whose record shows the point is not yet known, the tutor should state the rule briefly *before* the first try, show one worked example, then ask the learner to apply it. As the learner shows control, the tutor should shift to questions, error-spotting and "why". An engine rule that withholds the rule from everyone until after a failed first try matches the "guided discovery" end of the spectrum, which is the better-supported choice only for learners who already have something to discover from.

---

## 3. Corrective feedback: prompts, recasts, explicit correction, and level

**Core claim.** Correcting learners' errors helps learning compared with no correction. The *form* of correction matters:
- **Recast**: the tutor says the corrected version back, without comment. Common, gentle, easy to miss: a learner may not notice that it is a correction.
- **Prompt** (elicitation, clarification request, repetition of the error, metalinguistic clue): the tutor pushes the learner to produce the correct form themselves.
- **Explicit correction**: the tutor says what was wrong and gives the right form, often with a short reason.

Overall, studies find all three help, with **prompts and explicit correction usually doing better than recasts**, and feedback effects tending to last. Prompts require that the learner *can* self-correct; for a learner who does not yet know the form, a prompt can only produce another guess.

**Evidence strength.** *Moderate.* Correction works: fairly strong across meta-analyses. Prompts at least as good as recasts: moderate, with disagreement about measures and settings. *Differences by proficiency*: **contested and thin**, with some findings that prompts help lower-proficiency learners more and others that explicit information is needed when there is no prior knowledge. Written correction in L2 writing was long disputed (Truscott vs. Ferris); recent syntheses lean towards it helping, especially when focused on a few forms.

**Key sources (all VERIFY).**
- Lyster & Ranta, 1997, "Corrective feedback and learner uptake", *Studies in Second Language Acquisition* (recasts were the most frequent move and led to the least uptake of repair; note that "uptake" is not the same as learning).
- Lyster & Saito, 2010, "Oral feedback in classroom SLA: a meta-analysis", *Studies in Second Language Acquisition*.
- Li, 2010, "The effectiveness of corrective feedback in SLA: a meta-analysis", *Language Learning*.
- Ammar & Spada, 2006, "One size fits all? Recasts, prompts, and L2 learning", *Studies in Second Language Acquisition* (includes a proficiency comparison).
- Lyster, Saito & Sato, 2013, "Oral corrective feedback in second language classrooms", *Language Teaching*.
- Mackey & Goo, 2007, "Interaction research in SLA: a meta-analysis and research synthesis" (in Mackey, ed., *Conversational Interaction in Second Language Acquisition*).
- Written feedback: Truscott, 1996, "The case against grammar correction in L2 writing classes", *Language Learning*; Bitchener, 2008, "Evidence in support of written corrective feedback", *Journal of Second Language Writing* (about English articles); Kang & Han, 2015, a meta-analysis of written corrective feedback, *Modern Language Journal*.

**Implication for an AI tutor.** (Inference.) (a) Always correct; never leave an error unmarked. (b) Prefer prompts when the learner has the knowledge and slipped; use **explicit correction with a short reason** when the error shows the knowledge is missing (repeated same error, or no relevant form in the answer). (c) A recast alone is the weakest option in text chat, where the learner may skim past it; if used, make it visible and ask the learner to say or write it. (d) The correction level should be tied to the *evidence about this learner and this form*, not only to a broad level label. (e) Because written feedback in a chat is read, not heard, the research on oral recasts transfers only loosely.

---

## 4. Skill acquisition theory (DeKeyser)

**Core claim.** Learning a language skill follows the same path as other skills: first **declarative knowledge** (knowing the rule), then **proceduralization** (using the rule in practice, slowly, with effort), then **automatization** (fast, accurate, effortless use) through a great deal of **practice that matches how the skill will be used** (transfer-appropriate practice). Practice is specific to the skill: learning to *understand* a form does not automatically make a learner *produce* it quickly.

**Evidence strength.** *Moderate.* The general theory of skill learning is well supported; L2-specific tests exist but are fewer and often short. The claim that practice effects are skill-specific (comprehension practice does not fully transfer to production) has support. The claim that all explicit knowledge becomes automatic through practice is **contested**, as is the role of implicit learning alongside it.

**Key sources (all VERIFY).**
- DeKeyser, 2007, *Practice in a Second Language: Perspectives from Applied Linguistics and Cognitive Psychology* (Cambridge University Press).
- DeKeyser, 2015, "Skill acquisition theory", in VanPatten & Williams (eds.), *Theories in Second Language Acquisition*, 2nd edition.
- Anderson, 1982, "Acquisition of cognitive skill", *Psychological Review* (the general cognitive theory behind it).
- Suzuki & DeKeyser, 2017, on the relation between explicit knowledge and automatization, *Language Learning*.

**Implication for an AI tutor.** (Inference.) Each target form needs a *sequence*: a short statement of the rule, then guided production with decreasing support, then repeated, faster, less-supported production in new contexts, spread over days. A single successful answer is not evidence of automatization. ENARA's "never call one correct answer mastery" rule is consistent with this; what is missing is a deliberate path to the later stages.

---

## 5. Task-based language teaching and focus on form

**Core claim.** Learners develop language by using it to do meaningful tasks (book a room, solve a problem). Attention to form is brought in *during* meaningful work (**focus on form**: brief, reactive or planned attention to a form that arises in the task), as opposed to a series of isolated form exercises (**focus on forms**). Long's argument is that pure meaning-only work leaves learners with persistent gaps, and pure forms-only work leaves them unable to use what they studied.

**Evidence strength.** *Moderate for focus on form being at least as good as focus on forms, contested for full task-based syllabuses.* Meta-analytic support for form-focused instruction exists, but studies of whole task-based programmes, especially with beginners, children and in exam-driven settings, are limited; critics question its fit with large classes and low proficiency, and supporters say the objections often describe misunderstandings of the approach.

**Key sources (all VERIFY).**
- Long, 1991, "Focus on form: a design feature in language teaching methodology" (in de Bot, Ginsberg & Kramsch, eds., *Foreign Language Research in Cross-Cultural Perspective*); Long, 2015, *Second Language Acquisition and Task-Based Language Teaching* (Wiley-Blackwell).
- Ellis, 2003, *Task-Based Language Learning and Teaching* (Oxford University Press); Ellis, 2009, "Task-based language teaching: sorting out the misunderstandings", *International Journal of Applied Linguistics*; Ellis & Shintani, 2014, *Exploring Language Pedagogy through Second Language Acquisition Research* (Routledge).
- Skehan, 1998, *A Cognitive Approach to Language Learning* (Oxford University Press).
- Samuda & Bygate, 2008, *Tasks in Second Language Learning* (Palgrave Macmillan).

**Implication for an AI tutor.** (Inference.) A chat tutor can run short tasks (describe your day, write a message to a friend, give directions) and respond to form problems that appear in the learner's own sentences, which is exactly where its feedback matters most. Tasks should *follow* a rule-and-practice step for novices and may *lead* for stronger learners. ENARA's "unprompted sentence" handling (it already evaluates a learner's own sentence) is a base for this.

---

## 6. Comprehensible input, interaction and pushed output

**Core claim.**
- **Input** (Krashen): learners acquire language by understanding messages slightly above their current level ("i+1"). Understanding is *necessary*; most researchers think it is **not sufficient**.
- **Interaction** (Long): input becomes more useful when learners negotiate meaning: they ask for clarification, the partner rephrases, and attention is drawn to form.
- **Pushed output** (Swain): producing language, especially when the learner must be precise, makes them notice gaps between what they want to say and what they can say, and test hypotheses.

**Evidence strength.** *Input is necessary: strong. Krashen's strong claims (input alone is enough; learned knowledge never becomes acquired): contested and largely rejected.* Interaction benefits: *moderate* (meta-analysis supports it). Pushed output: *moderate*; the noticing function has support, while the claim that output is *needed* for acquisition is contested.

**Key sources (all VERIFY).**
- Krashen, 1982, *Principles and Practice in Second Language Acquisition*; Krashen, 1985, *The Input Hypothesis: Issues and Implications*; Krashen, 1998, "Comprehensible output?", *System* (a critique of the output idea).
- Long, 1983, "Native speaker/non-native speaker conversation and the negotiation of comprehensible input", *Applied Linguistics*; Long, 1996, "The role of the linguistic environment in second language acquisition" (in Ritchie & Bhatia, eds., *Handbook of Second Language Acquisition*).
- Swain, 1985, "Communicative competence: some roles of comprehensible input and comprehensible output in its development" (in Gass & Madden, eds., *Input in Second Language Acquisition*); Swain, 1995, "Three functions of output in second language learning" (in Cook & Seidlhofer, eds., *Principle and Practice in Applied Linguistics*).
- Mackey & Goo, 2007 (see section 3); Izumi, 2003, "Comprehension and production processes in second language learning", *Applied Linguistics*.

**Implication for an AI tutor.** (Inference.) A chat tutor is an interaction partner and can negotiate meaning ("do you mean ...?"), which is a plus. It must also *supply* graded input, since a learner who only answers the tutor's questions reads very little. "Push" the learner to produce a full sentence rather than a single word, and ask them to try again when the first attempt is vague. The existing `comprehensible_model` move (short sentences, common words, two or three new items per reply) is an input-quality rule worth keeping.

---

## 7. Vocabulary: frequency, spaced retrieval, depth of processing

**Core claim.**
1. **Frequency**: learn the most frequent words first; a few thousand word families cover most of everyday text, and the return on each new word falls as you go down the list.
2. **Spaced retrieval**: remembering a word is strengthened by *trying to recall it* (testing effect), and recall practice **spread out over time** beats the same amount of practice crammed together (spacing effect).
3. **Depth of processing / involvement**: words processed for meaning, with a need to use them (evaluate, combine, produce) are retained better than words seen only superficially.
Also, words are not learned in one meeting: many encounters are needed, and receptive and productive knowledge develop separately.

**Evidence strength.** *Spacing and the testing effect: strong (general cognitive psychology, well replicated), moderate in L2 vocabulary specifically. Frequency-based selection: strong as a principle, moderate on exact word-list sizes. Depth of processing / involvement load: moderate, with disputes about how exactly to define "depth".*

**Key sources (all VERIFY).**
- Nation, 2001, *Learning Vocabulary in Another Language* (first edition) and 2013 (second edition); Nation, 2006, "How large a vocabulary is needed for reading and listening?", *Canadian Modern Language Review*.
- Schmitt, 2008, "Review article: instructed second language vocabulary learning", *Language Teaching Research*; Webb & Nation, 2017, *How Vocabulary Is Learned* (Oxford University Press).
- Cepeda, Pashler, Vul, Wixted & Rohrer, 2006, "Distributed practice in verbal recall tasks: a review and quantitative synthesis", *Psychological Bulletin*.
- Roediger & Karpicke, 2006, "Test-enhanced learning", *Psychological Science*.
- Craik & Lockhart, 1972, "Levels of processing", *Journal of Verbal Learning and Verbal Behavior*; Laufer & Hulstijn, 2001, "Incidental vocabulary acquisition in a second language: the construct of task-induced involvement", *Applied Linguistics*.

**Implication for an AI tutor.** (Inference.) Word selection should come from a frequency-graded list tied to the learner's level, not only from whatever a teacher's lesson contains. Each word should return after expanding gaps (days, not minutes), each time as a *recall* attempt, not as re-reading. Practice should ask for meaning-based use (write a sentence, choose and explain), not copying. A tutor that is available daily on a phone is well placed to run this.

---

## 8. CEFR levels and can-do descriptors

**Core claim.** The Common European Framework of Reference (A1, A2, B1, B2, C1, C2) describes what learners *can do* at each level ("can introduce themselves and answer simple questions", "can write a short, simple postcard"), by skill. It is a common yardstick for course design, assessment and reporting to learners, teachers and parents.

**Evidence strength.** *Strong as a widely adopted standard; contested as a scientific model of how learners progress.* Critics point out that the descriptors were built from teacher judgments, that levels are not equal steps, that it is vague on grammar and vocabulary content, and that it is not tied to a specific language. Supporters note it is a *framework*, not a syllabus. It is a sensible reporting scale and a poor sequencing tool on its own.

**Key sources (all VERIFY).**
- Council of Europe, 2001, *Common European Framework of Reference for Languages: Learning, Teaching, Assessment* (Cambridge University Press); Council of Europe, 2020, *CEFR Companion Volume*.
- North, 2014, *The CEFR in Practice* (Cambridge University Press).
- Fulcher, 2004, "Deluded by artifices? The Common European Framework and harmonization", *Language Assessment Quarterly*; Alderson, 2007, "The CEFR and the need for more research", *Modern Language Journal*.
- English Profile: Hawkins & Filipović, 2012, *Criterial Features in L2 English: Specifying the Reference Levels of the CEFR* (Cambridge University Press).

**Implication for an AI tutor.** (Inference.) Tag every lesson objective and every assessed item with a CEFR level and skill, report progress as can-do statements the learner and parent can read, and use the level to choose explicitness, reply length and task type. Do not treat a level as a fixed property: a learner can be B1 in reading and A2 in writing, and can be A1 on one grammar form and B1 on another.

---

## 9. L1 transfer for Arabic speakers (Egyptian learners in particular)

**Core claim.** Learners carry their first language into English. Where Arabic and English differ, learners tend to make *predictable* errors. The usually cited list for Arabic speakers (taken from descriptive works, not from a single controlled study) includes:
- **Articles.** Arabic has a definite article but no indefinite article, and its use differs from English (for example with generic nouns and some abstract nouns): omission of *a/an*, and wrong use or omission of *the*.
- **Copula omission.** Present-tense equational sentences in Arabic have no verb "to be", so learners may write "She teacher" or "The weather very hot".
- **Word order and sentence structure.** Verb-subject order in some Arabic sentences; adjective placed after the noun; added pronouns inside relative clauses ("the man that I saw him"); run-on sentences joined with "and".
- **Verb forms.** No present-perfect equivalent; different aspect system; tense and agreement errors.
- **Phonology.** Arabic has no /p/ (so /p/ and /b/ merge: "bark/park"), fewer vowel contrasts than English (so vowels such as /ɪ/ and /e/ may merge), and consonant clusters are broken with an inserted vowel ("sprint" as "siprint"). In Egyptian colloquial Arabic, /θ/ and /ð/ (as in *think* and *this*) are commonly replaced by /s, t/ and /z, d/ (verify for Egyptian specifically).
- **Spelling and reading.** Arabic is written right to left, in a script where short vowels are usually not written; learners may attend to consonants and under-use vowels when reading and spelling English, and may confuse look-alike letters.

Two cautions. (1) **Contrast alone is a weak predictor**: many errors that look like transfer also appear in learners of other languages (they are developmental), and some predicted errors do not occur. Treat the list as a set of hypotheses to check against the learner's actual errors. (2) The list describes Arabic speakers in general; Egyptian learners add the Egyptian colloquial/Modern Standard Arabic split and Egypt-specific schooling, which should be checked with local teachers.

**Evidence strength.** *Moderate for the existence of L1 influence (strong in general, descriptive for Arabic specifically); contested for how far it can be predicted.* Much of the Arabic-specific material is descriptive error analysis and teacher-oriented reference, not experiments.

**Key sources (all VERIFY).**
- Odlin, 1989, *Language Transfer* (Cambridge University Press).
- Swan & Smith, 2001, *Learner English: A Teacher's Guide to Interference and Other Problems*, 2nd edition (Cambridge University Press), chapter on Arabic speakers.
- Kharma & Hajjaj, 1989, *Errors in English among Arabic Speakers: Analysis and Remedy* (Longman).
- Thompson-Panos & Thomas-Ruzic, 1983, "The least you should know about Arabic: implications for the ESL writing instructor", *TESOL Quarterly*.
- Randall & Meara, 1988, "How Arabs read Roman letters", *Reading in a Foreign Language*; Ryan & Meara, 1991, "The case of invisible vowels: Arabic speakers reading English words", *Reading in a Foreign Language*.
- Flege, 1995, "Second language speech learning: theory, findings, and problems" (in Strange, ed., *Speech Perception and Linguistic Experience*); Best & Tyler, 2007, "Nonnative and second-language speech perception" (in Bohn & Munro, eds., *Language Experience in Second Language Speech Learning*).
- Articles specifically: Ionin, Ko & Wexler, 2004, "Article semantics in L2 acquisition: the role of specificity", *Language Acquisition*; Bitchener, 2008 (section 3, written feedback on articles).
- On how far errors are transfer vs. developmental: Dulay & Burt, 1974, "Natural sequences in child second language acquisition", *Language Learning*; Corder, 1967, "The significance of learners' errors", *International Review of Applied Linguistics*.
- Using the learner's first language in teaching (relevant to a "no Arabic" rule): Cook, 2001, "Using the first language in the classroom", *Canadian Modern Language Review*; Hall & Cook, 2012, "Own-language use in language teaching and learning", *Language Teaching*.

**Implication for an AI tutor.** (Inference.) Keep a **library of expected errors** for Arabic speakers, each with: the sign (what the wrong sentence looks like), a plain explanation of *why* (in the learner's terms), a short contrast, and a practice set. Use it to **anticipate**, not to assume: check each against what the learner actually writes. Judicious use of Arabic for explanation at A1, especially for abstract rules and the reason for an error, has support in the own-language-use literature (mixed, moderately positive); a rule of "never any Arabic" is a design choice that goes beyond the evidence. Pronunciation errors need audio, so they are out of reach of a text-only chat.

---

## 10. Developmental sequences and teachability (Pienemann)

**Core claim.** Learners acquire certain structures in a **fixed order** (for example, in English: simple word order and plural -s before questions with inverted word order, and third-person -s late), regardless of the first language. **Processability Theory** and the **teachability hypothesis** say that instruction on a structure helps only when the learner is ready, that is, when the previous stage in the sequence is in place; teaching a structure two stages ahead is largely wasted. Sequences are fixed, but the *order in which a learner is taught* can still be varied, and instruction may speed progress through them.

**Evidence strength.** *Moderate for the existence of developmental orders (morpheme-order studies, meta-analytic support, with disagreement about causes); contested for the strong teachability claim*, whose tests are small and whose predictions critics say are too restrictive. The weaker reading (don't expect learners to master late-acquired forms early; recycle them over time) is widely accepted.

**Key sources (all VERIFY).**
- Pienemann, 1984, "Psychological constraints on the teachability of languages", *Studies in Second Language Acquisition*; Pienemann, 1998, *Language Processing and Second Language Development: Processability Theory* (John Benjamins).
- Spada & Lightbown, 1999, "Instruction, first language influence, and developmental readiness in second language acquisition", *Modern Language Journal*.
- Dulay & Burt, 1974 (see section 9); Goldschneider & DeKeyser, 2001, "Explaining the natural order of L2 morpheme acquisition in English: a meta-analysis of multiple determinants", *Language Learning*.

**Implication for an AI tutor.** (Inference.) Third-person -s, articles and the present perfect are late and persistent for most learners, so ENARA's focus on them is reasonable, and learners will keep making these errors for a long time. The tutor should expect *slow, uneven* progress on them, revisit them across weeks, and avoid concluding mastery from a short session. It should not push a form far beyond the learner's current stage without a prerequisite check; ENARA's prerequisite-remediation technique is aligned with this.

---

## Cross-cutting points that matter most for ENARA

1. **Strongest, most actionable evidence:** explicit instruction for novices (2), correction in some form that makes the learner process it (3), spaced retrieval (7). All three are cheap to implement in software.
2. **Mixed evidence, so treat as design bets and test them:** prompts versus explicit correction at A1 (3), the equal four-strand split (1), full task-based design for beginners (5), predicted L1 errors (9), strong teachability claims (10).
3. **Not testable in a text chat:** pronunciation, listening fluency without audio, real conversation speed.
4. **Everything here is about real human learners.** ENARA's AI-student studies cannot confirm or refute any of it. The decisive evidence is still a real-learner pilot.
