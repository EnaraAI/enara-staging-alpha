// Teaching methods the tutor can be asked to use (registry v2). Stable ids; each
// change to a method's instructions bumps its version. The 23 methods of the Enara
// AI Tutor Teaching Methods Reference Guide v1.0, plus five ENARA techniques kept
// from registry v1 (guided/independent practice, visual explanation, error
// analysis, prerequisite remediation). Instructions are written from each method's
// principles; the guide's injection prompts are not copied. Ids from v1 never
// change, so historical decisions and interventions keep resolving.

export type MethodRole = 'primary' | 'supporting' | 'reinforcement' | 'modifier' | 'system';
export type MethodKind = 'guide' | 'technique';

export interface TeachingStrategy {
  id: string;
  version: number;
  description: string;
  intendedWhen: string;
  limitations: string;
  promptInstructions: string;
  expectedInteraction: string;
  successCriteria: string;
  // Registry v2 (P21). Optional in the type so v1-shaped callers keep compiling;
  // every registry entry sets them (checked by tests).
  name?: string;
  kind?: MethodKind;
  guideNumber?: number; // 1-23 in the reference guide
  guideMethod?: string; // for techniques: the guide method they belong to
  objective?: string;
  learnerConditions?: string[];
  subjects?: string[];
  requiredSignals?: string[];
  phases?: string[];
  roles?: MethodRole[];
  exitWhen?: string;
  switchWhen?: { signal: SwitchSignal; to: string }[];
  conflictsWith?: string[];
  assessmentRequirements?: string;
  successIndicators?: string[];
  minGrade?: number; // lowest grade the guide recommends (0 = any)
  withholdsAnswer?: boolean; // never gives the final answer while active
  // Its core mechanism reveals solution steps (worked steps, partial answers,
  // re-teaching). Methods whose only answer-giving is an overridable fallback
  // (e.g. elaborative interrogation) are not flagged: under an answer-withholding
  // primary, the primary's rule on answers wins (plan C3/C11).
  givesAnswerLastResort?: boolean;
  noviceSafe?: boolean; // suitable when the learner has no prior knowledge
}

// Learner evidence that can trigger a switch (never a turn count).
export type SwitchSignal =
  | 'no_improvement_after_new_evidence'
  | 'repeated_errors'
  | 'mastery_reached'
  | 'retention_failed'
  | 'application_failed'
  | 'disengaged';

const s = (x: TeachingStrategy) => x;
const ANY = ['any subject'];

export const STRATEGIES: TeachingStrategy[] = [
  // ---------- Part I: foundational ----------
  s({
    id: 'direct_instruction', version: 2, name: 'Direct Instruction', kind: 'guide', guideNumber: 1,
    description: 'Explain explicitly, model, guide, then release (I do, we do, you do).',
    intendedWhen: 'A new concept or procedure with little or no prior knowledge (emerging).',
    limitations: 'Passive if it stops at explanation; must move to practice.',
    promptInstructions: 'Teach one idea at a time. Explain it in short, defined steps; model one complete example aloud; then guide a similar problem one step per turn, checking and correcting each step before moving on; then give one problem to do alone. If the student errs on several guided steps, model a different example before continuing. Do not ask the student to discover what you have not taught yet.',
    expectedInteraction: 'Explanation, modelled example, guided steps, independent problem.',
    successCriteria: 'The student solves an unguided problem of the same type.',
    objective: 'Build a correct first schema for a new skill quickly.',
    learnerConditions: ['no or little prior knowledge', 'mastery not_assessed or emerging'],
    subjects: ['procedural content', 'mathematics', 'grammar', 'lab procedures'],
    requiredSignals: ['mastery status'],
    phases: ['present', 'model', 'guided practice', 'check and correct', 'release'],
    roles: ['primary'],
    exitWhen: 'Independent problem solved correctly.',
    switchWhen: [{ signal: 'mastery_reached', to: 'retrieval_practice' }, { signal: 'no_improvement_after_new_evidence', to: 'worked_example' }],
    conflictsWith: ['inquiry_based', 'problem_based'],
    assessmentRequirements: 'Independent item after release.', successIndicators: ['correct independent answer', 'few corrections in guided steps'],
    minGrade: 0, givesAnswerLastResort: true, noviceSafe: true,
  }),
  s({
    id: 'socratic_questioning', version: 2, name: 'Socratic Method', kind: 'guide', guideNumber: 2,
    description: 'Guide with probing questions so the student reasons it out.',
    intendedWhen: 'The student has the foundations and needs deeper reasoning.',
    limitations: 'Slow or frustrating when a concept is missing entirely.',
    promptInstructions: 'Teach through questions: one question per turn. Start by clarifying what the student means, then probe assumptions, evidence and implications, and ask how someone who disagrees would respond. Do not state the answer or call a reply wrong; ask the question that exposes the flaw. When an answer is right, ask for the reason ("because..."). If the student is stuck or frustrated twice, simplify the question.',
    expectedInteraction: 'Short question-answer turns.',
    successCriteria: 'The student states the full reasoning in their own words.',
    objective: 'Move from recall to justified reasoning.',
    learnerConditions: ['foundational knowledge present', 'developing or proficient'],
    subjects: ['ethics', 'history', 'literature', 'science reasoning', 'economics'],
    requiredSignals: ['mastery status', 'student explanations'],
    phases: ['clarify', 'probe assumptions', 'probe evidence', 'implications', 'perspective'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Student articulates complete correct reasoning unprompted.',
    switchWhen: [{ signal: 'repeated_errors', to: 'scaffolding' }, { signal: 'no_improvement_after_new_evidence', to: 'scaffolding' }],
    conflictsWith: ['direct_instruction', 'worked_example', 'gamification'],
    assessmentRequirements: 'Explanation-type item (open response).', successIndicators: ['justified answers', 'self-corrected reasoning'],
    minGrade: 5, withholdsAnswer: true,
  }),
  s({
    id: 'scaffolding', version: 2, name: 'Scaffolded Instruction', kind: 'guide', guideNumber: 3,
    description: 'Give the minimum support that unblocks, and fade it as competence grows.',
    intendedWhen: 'Partly correct work: the task is just beyond what the student can do alone.',
    limitations: 'Support must be removed deliberately or it becomes a crutch.',
    promptInstructions: 'Let the student try first. Support in increasing order only as needed: a prompt to recall what they know, a strategy hint, a conceptual clue, the first procedural step, a partial answer; a full step only as a last resort, then have them redo it. Correct and complete: remove one level of help next time. Partly right: say what is right and ask for the missing part. Wrong: add the smallest next hint.',
    expectedInteraction: 'Attempts with decreasing hints.',
    successCriteria: 'The student completes a comparable task with less or no help.',
    objective: 'Extend independent capability inside the zone of proximal development.',
    learnerConditions: ['partially correct answers', 'developing'],
    subjects: ['mathematics', 'writing', 'coding', 'languages', 'science reasoning'],
    requiredSignals: ['response correctness', 'assistance level'],
    phases: ['assess', 'support', 'fade'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Comparable task completed without hints.',
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'worked_example' }, { signal: 'mastery_reached', to: 'retrieval_practice' }],
    conflictsWith: ['independent_practice'],
    assessmentRequirements: 'Assistance level recorded on practice evidence.', successIndicators: ['falling assistance level', 'correct unassisted step'],
    minGrade: 0, givesAnswerLastResort: true, noviceSafe: false,
  }),
  s({
    id: 'mastery_learning', version: 1, name: 'Mastery Learning', kind: 'guide', guideNumber: 4,
    description: 'Reach a mastery criterion on an objective before advancing.',
    intendedWhen: 'Sequential content where this objective is a prerequisite for the next.',
    limitations: 'Needs several independent items; slow if the criterion is set too high.',
    promptInstructions: 'Treat the objective as not finished until the student is consistently right on varied problems of it. When errors appear, find the one sub-skill that fails and re-teach only that, in a different way from before; then check with new problems, not repeated ones. Treat isolated slips as careless and only monitor them. Frame correction positively: "You have most of it; let us sharpen one part."',
    expectedInteraction: 'Check, targeted correction, re-check with new items.',
    successCriteria: 'ENARA mastery criterion met (independent evidence, mastery-v1).',
    objective: 'Secure prerequisite objectives before moving on.',
    learnerConditions: ['developing or proficient on a prerequisite objective'],
    subjects: ['mathematics', 'coding', 'science', 'reading', 'languages'],
    requiredSignals: ['mastery status', 'independent evidence', 'error type'],
    phases: ['teach', 'assess', 'diagnose', 'correct', 'reassess'],
    roles: ['primary', 'modifier'],
    exitWhen: 'Mastered status (mastery-v1) with independent evidence.',
    switchWhen: [{ signal: 'mastery_reached', to: 'retrieval_practice' }, { signal: 'no_improvement_after_new_evidence', to: 'worked_example' }],
    conflictsWith: [],
    assessmentRequirements: 'New items each reassessment (distinct itemKeys).', successIndicators: ['mastery status rises', 'distinct independent items correct'],
    minGrade: 0, givesAnswerLastResort: true,
  }),
  // ---------- Part II: active and inquiry-based ----------
  s({
    id: 'inquiry_based', version: 1, name: 'Inquiry-Based Learning', kind: 'guide', guideNumber: 5,
    description: 'Start from a puzzling question; the student hypothesises and tests against evidence.',
    intendedWhen: 'Some baseline knowledge; recall is fine but understanding of why is weak.',
    limitations: 'Unsuitable for novices; needs evidence the tutor can release step by step.',
    promptInstructions: 'Open with a surprising fact or question and ask for a guess. Ask what would have to be true and what they would need to find out. Release one piece of evidence at a time and ask whether it supports or challenges their hypothesis. Let them draw the conclusion and say how confident they are. Do not give the answer before they have tested their idea.',
    expectedInteraction: 'Hypothesis, evidence turns, conclusion.',
    successCriteria: 'The student reaches and justifies the conclusion from evidence.',
    objective: 'Develop explanation and evidence-based reasoning.',
    learnerConditions: ['some prior knowledge', 'not a novice'],
    subjects: ['science', 'history', 'social studies', 'geography', 'economics'],
    requiredSignals: ['mastery status at least developing', 'grade band'],
    phases: ['orientation', 'conceptualisation', 'investigation', 'conclusion', 'discussion'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Evidence-based conclusion stated and connected to prior knowledge.',
    switchWhen: [{ signal: 'repeated_errors', to: 'scaffolding' }],
    conflictsWith: ['direct_instruction', 'worked_example'],
    assessmentRequirements: 'Application or analysis item.', successIndicators: ['hypothesis revised by evidence', 'correct conclusion'],
    minGrade: 4, withholdsAnswer: true,
  }),
  s({
    id: 'problem_based', version: 1, name: 'Problem-Based Learning', kind: 'guide', guideNumber: 6,
    description: 'An authentic, open problem comes first; the student identifies what they need to learn.',
    intendedWhen: 'Older students with foundations who can tolerate ambiguity.',
    limitations: 'Unsuitable for novices; open problems have no single answer to grade.',
    promptInstructions: 'Present a realistic problem in which the student must decide or recommend something, before teaching. Ask what they already know and what they need to know; treat those gaps as the agenda. Facilitate rather than lecture: when stuck, give the smallest directional question. Ask for a proposed solution, then for its strongest objections and assumptions. Do not solve it for them.',
    expectedInteraction: 'Scenario, gap list, guided inquiry, proposal, critique.',
    successCriteria: 'A justified solution that addresses objections.',
    objective: 'Apply knowledge to ill-structured problems; self-directed gap finding.',
    learnerConditions: ['grade 7+', 'at least developing'],
    subjects: ['science', 'medicine', 'engineering', 'business', 'social sciences'],
    requiredSignals: ['grade band', 'mastery status at least developing'],
    phases: ['present problem', 'activate knowledge', 'identify gaps', 'guided inquiry', 'proposal', 'critique'],
    roles: ['primary'],
    exitWhen: 'Solution proposed and defended.',
    switchWhen: [{ signal: 'repeated_errors', to: 'scaffolding' }],
    conflictsWith: ['direct_instruction', 'worked_example'],
    assessmentRequirements: 'Rubric-graded open response.', successIndicators: ['gaps identified', 'objections addressed'],
    minGrade: 7, withholdsAnswer: true,
  }),
  s({
    id: 'case_based', version: 1, name: 'Case-Based Learning', kind: 'guide', guideNumber: 7,
    description: 'Analyse a realistic case: issue, stakeholders, constraints, options, decision.',
    intendedWhen: 'Developing judgment and applying principles to real situations.',
    limitations: 'Needs a suitable invented case; real people and companies are not named.',
    promptInstructions: 'Present a short, realistic, invented case with people, setting and stakes (do not use real companies or people). Ask for the central issue, the stakeholders and what each wants, the constraints and the options with likely consequences. Ask for a decision and the strongest opposing argument before you confirm anything. Then reveal an outcome and ask which principle it shows.',
    expectedInteraction: 'Case, structured analysis, decision, reveal.',
    successCriteria: 'The student names the underlying principle and defends a decision.',
    objective: 'Transfer principles to context-rich situations.',
    learnerConditions: ['grade 9+', 'at least developing'],
    subjects: ['ethics', 'business', 'law', 'history', 'public policy', 'health'],
    requiredSignals: ['grade band'],
    phases: ['case', 'issue', 'constraints', 'options', 'decision', 'reveal'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Decision defended and principle named.',
    switchWhen: [{ signal: 'repeated_errors', to: 'scaffolding' }],
    conflictsWith: ['direct_instruction'],
    assessmentRequirements: 'Evaluation-level open response.', successIndicators: ['principle identified', 'counter-argument handled'],
    minGrade: 9, withholdsAnswer: true,
  }),
  s({
    id: 'project_based', version: 1, name: 'Project-Based Learning', kind: 'guide', guideNumber: 8,
    description: 'Coach a multi-session project: driving question, milestones, critique and revision.',
    intendedWhen: 'A teacher-set project spanning several sessions.',
    limitations: 'The tutor can only coach; it cannot run sustained group work or a public presentation.',
    promptInstructions: 'Act as a project coach and do no part of the project for the student. Help them sharpen an open driving question and plan milestones. At each milestone ask what they found and how it changes the plan. When they share a draft, ask what works, what is weak or missing, and what exactly they will revise; require a revision plan. Ask what they learned and would do differently.',
    expectedInteraction: 'Planning, milestone check-ins, critique, revision plan.',
    successCriteria: 'A revision plan follows each critique.',
    objective: 'Sustained inquiry and application through a product.',
    learnerConditions: ['grade 4+', 'teacher-assigned project'],
    subjects: ['interdisciplinary', 'STEM', 'capstones'],
    requiredSignals: ['teacher assignment'],
    phases: ['driving question', 'planning', 'inquiry', 'critique', 'revision', 'reflection'],
    roles: ['primary'],
    exitWhen: 'Teacher closes the project.',
    switchWhen: [],
    conflictsWith: ['direct_instruction', 'worked_example'],
    assessmentRequirements: 'Rubric-graded product (teacher-set).', successIndicators: ['milestones met', 'revisions made'],
    minGrade: 4, withholdsAnswer: true,
  }),
  // ---------- Part III: cognitive science ----------
  s({
    id: 'retrieval_practice', version: 2, name: 'Retrieval Practice', kind: 'guide', guideNumber: 9,
    description: 'Ask the student to recall before re-explaining.',
    intendedWhen: 'Previously taught content: strengthen and check memory.',
    limitations: 'Frustrating if the idea was never learned.',
    promptInstructions: 'Before re-explaining anything already taught, ask the student to recall it: what they remember, a definition, a step, a short answer. Spread short, low-stakes recall questions through the conversation, conversationally. Right: ask why it is true. Partly right: ask what is missing. Blank or wrong: try a cued version, then give it briefly and ask them to say it back in their own words.',
    expectedInteraction: 'Recall question, answer, feedback, explain-why.',
    successCriteria: 'Correct recall without hints.',
    objective: 'Consolidate long-term memory through effortful recall.',
    learnerConditions: ['content previously taught', 'proficient, mastered or decaying'],
    subjects: ANY,
    requiredSignals: ['previous exposure'],
    phases: ['recall', 'feedback', 'elaborate'],
    roles: ['primary', 'supporting', 'reinforcement'],
    exitWhen: 'Unprompted correct recall of the items reviewed.',
    switchWhen: [{ signal: 'retention_failed', to: 'direct_instruction' }],
    conflictsWith: [],
    assessmentRequirements: 'Retention review items.', successIndicators: ['retention_review evidence correct'],
    minGrade: 0, givesAnswerLastResort: true,
  }),
  s({
    id: 'spaced_repetition', version: 1, name: 'Spaced Repetition', kind: 'guide', guideNumber: 10,
    description: 'Revisit items when they are due, at growing intervals.',
    intendedWhen: 'Items are due for review (ENARA review schedule).',
    limitations: 'Scheduling is done by ENARA (ReviewItem, ret-v1), not by the tutor.',
    promptInstructions: 'Before new content, briefly revisit the items listed as due for review, woven into the conversation rather than announced as a review. Use active recall, not re-reading. If an item keeps failing across reviews, flag it for re-teaching instead of more repetition. Do not review items that are not due.',
    expectedInteraction: 'Short embedded recall of due items.',
    successCriteria: 'Due items recalled correctly.',
    objective: 'Retain learned items over time.',
    learnerConditions: ['review items due'],
    subjects: ['vocabulary', 'facts', 'formulas', 'definitions', 'any high factual load'],
    requiredSignals: ['review due dates (ReviewItem, ObjectiveRetentionState)'],
    phases: ['due-item recall'],
    roles: ['reinforcement', 'system'],
    exitWhen: 'No items due.',
    switchWhen: [{ signal: 'retention_failed', to: 'retrieval_practice' }],
    conflictsWith: [],
    assessmentRequirements: 'Review outcomes recorded (retention_review evidence).', successIndicators: ['review streaks grow'],
    minGrade: 0,
  }),
  s({
    id: 'interleaving', version: 1, name: 'Interleaving', kind: 'guide', guideNumber: 11,
    description: 'Mix problem types; the student names the type before solving.',
    intendedWhen: 'Several related procedures have been learned (at least developing).',
    limitations: 'Harder during practice; not for the first acquisition of a skill.',
    promptInstructions: 'In practice, mix problems from this objective with problems from related objectives the student already knows, in an unpredictable order. Before each problem, ask what type of problem it is and which approach it needs; correct the classification before they calculate. Use more problems from any earlier topic they struggle with.',
    expectedInteraction: 'Mixed problems with a classify-first step.',
    successCriteria: 'Correct classification and solution across mixed types.',
    objective: 'Discriminate between problem types; durable, transferable skill.',
    learnerConditions: ['at least developing on this objective', 'related objectives learned'],
    subjects: ['mathematics', 'grammar', 'science problem sets'],
    requiredSignals: ['mastery of related objectives'],
    phases: ['classify', 'solve'],
    roles: ['reinforcement', 'supporting'],
    exitWhen: 'Mixed set solved with correct classification.',
    switchWhen: [{ signal: 'repeated_errors', to: 'worked_example' }],
    conflictsWith: [],
    assessmentRequirements: 'Mixed-type items (transfer).', successIndicators: ['correct classification', 'transfer items correct'],
    minGrade: 4,
  }),
  s({
    id: 'worked_example', version: 2, name: 'Worked Examples', kind: 'guide', guideNumber: 12,
    description: 'Show a complete narrated solution, then fade to completion problems.',
    intendedWhen: 'Novice on a procedural problem type, or procedural errors.',
    limitations: 'Experts are slowed by full examples; students may copy without understanding.',
    promptInstructions: 'Before asking the student to solve a new problem type, solve one completely, saying at each step what you do and why. Then give the same type with the first step done and ask for the next; then only the setup; then a partly solved problem to finish; then one alone. If the student is not a novice, start from the partly solved problem instead. Show every intermediate step.',
    expectedInteraction: 'Example, example-problem pairs, completion, independent problem.',
    successCriteria: 'The student solves the independent problem.',
    objective: 'Reduce cognitive load while building a procedural schema.',
    learnerConditions: ['novice on the problem type', 'procedural or calculation errors'],
    subjects: ['mathematics', 'physics', 'chemistry', 'coding', 'logic'],
    requiredSignals: ['mastery status', 'error type'],
    phases: ['full example', 'example-problem pair', 'completion', 'independent'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Independent problem solved.',
    switchWhen: [{ signal: 'mastery_reached', to: 'interleaving' }, { signal: 'no_improvement_after_new_evidence', to: 'guided_practice' }],
    conflictsWith: ['socratic_questioning', 'inquiry_based', 'problem_based', 'project_based'],
    assessmentRequirements: 'Independent procedural item.', successIndicators: ['completion problems correct', 'independent item correct'],
    minGrade: 0, givesAnswerLastResort: true, noviceSafe: true,
  }),
  s({
    id: 'elaborative_interrogation', version: 1, name: 'Elaborative Interrogation', kind: 'guide', guideNumber: 13,
    description: 'Ask the student to explain why facts and relationships are true.',
    intendedWhen: 'Some prior knowledge; recall is right but explanations are thin.',
    limitations: 'Not every fact has a causal explanation at the student\'s level.',
    promptInstructions: 'After a correct answer, ask why it is true or what causes it, and then how it connects to something they already know. Go deeper while it helps, not by a fixed count. If they cannot explain, ask what they know about a related process, then give a conceptual clue; explain fully only as a last resort and have them explain it back. For facts with no accessible cause, ask how they connect instead.',
    expectedInteraction: 'Answer, why-question, deeper why, connection.',
    successCriteria: 'The student explains the mechanism in their own words.',
    objective: 'Deeper encoding through self-generated explanation.',
    learnerConditions: ['some prior knowledge', 'proficient or developing'],
    subjects: ['science', 'history', 'social studies', 'biology', 'economics'],
    requiredSignals: ['correct recall'],
    phases: ['why', 'deeper why', 'connect'],
    roles: ['supporting'],
    exitWhen: 'Mechanism explained unprompted.',
    switchWhen: [{ signal: 'repeated_errors', to: 'analogy' }],
    conflictsWith: [],
    assessmentRequirements: 'Explanation item.', successIndicators: ['correct causal explanations'],
    minGrade: 4,
  }),
  s({
    id: 'analogy', version: 2, name: 'Analogical Reasoning', kind: 'guide', guideNumber: 14,
    description: 'Map the new idea onto a familiar one with the same structure, then test its limits.',
    intendedWhen: 'Abstract concepts, or a suspected conceptual misunderstanding.',
    limitations: 'Analogies break down; surface-only analogies mislead.',
    promptInstructions: 'Pick a familiar everyday situation that shares the structure (not just the look) of the idea, and make sure the student understands it first. Map it explicitly: this part is like that part because both do the same thing. Ask the student to extend the analogy to predict something, then ask where the comparison stops working.',
    expectedInteraction: 'Familiar case, mapping, extension, limits.',
    successCriteria: 'The student applies the idea to a new case and names a limit of the analogy.',
    objective: 'Build a schema for abstract content from prior knowledge.',
    learnerConditions: ['abstract or counter-intuitive concept', 'conceptual misconception'],
    subjects: ['science', 'mathematics', 'economics', 'computer science', 'philosophy'],
    requiredSignals: ['misconception category'],
    phases: ['analog', 'map', 'extend', 'limits'],
    roles: ['primary', 'supporting'],
    exitWhen: 'Correct prediction from the analogy and its limit named.',
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'visual_explanation' }],
    conflictsWith: [],
    assessmentRequirements: 'Conceptual application item.', successIndicators: ['misconception resolved'],
    minGrade: 0, noviceSafe: true,
  }),
  // ---------- Part IV: metacognitive and reflective ----------
  s({
    id: 'metacognitive', version: 1, name: 'Metacognitive Strategy Instruction', kind: 'guide', guideNumber: 15,
    description: 'Teach the student to plan, monitor and evaluate their own thinking.',
    intendedWhen: 'Able students who use ineffective strategies, or partial understanding with careless process.',
    limitations: 'Adds turns; needs the student to engage reflectively.',
    promptInstructions: 'Before a task, ask what it is asking and which strategy they will use. Midway, ask whether they are on track and how they know. Afterwards, ask whether the strategy worked and what they would do differently. Judge the process as well as the answer. When you demonstrate, show yourself checking and correcting, so monitoring looks normal.',
    expectedInteraction: 'Plan, monitor and evaluate prompts around a task.',
    successCriteria: 'The student names and adjusts a strategy themselves.',
    objective: 'Self-regulated learning.',
    learnerConditions: ['systematic strategy errors', 'developing'],
    subjects: ANY,
    requiredSignals: ['repeated similar errors'],
    phases: ['plan', 'monitor', 'evaluate'],
    roles: ['supporting', 'primary'],
    exitWhen: 'Self-identified strategy change that works.',
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'think_aloud' }],
    conflictsWith: [],
    assessmentRequirements: 'Any; process evidence is qualitative.', successIndicators: ['fewer repeated errors'],
    minGrade: 4,
  }),
  s({
    id: 'think_aloud', version: 1, name: 'Think-Aloud', kind: 'guide', guideNumber: 16,
    description: 'Make reasoning visible: the tutor narrates expert thinking; the student narrates theirs.',
    intendedWhen: 'Wrong answers from reasoning that looks logical; hidden errors.',
    limitations: 'Slower; relies on the student narrating.',
    promptInstructions: 'When demonstrating, narrate your thinking in the first person, including what you notice, what you consider and where you check yourself. When the student solves, ask them to talk through each step. After an error, ask them to walk through how they got there before correcting, and target the correction at the reasoning step that broke, not just the final answer.',
    expectedInteraction: 'Narrated demonstration; student narration; reasoning-level correction.',
    successCriteria: 'The faulty reasoning step is found and fixed by the student.',
    objective: 'Diagnose and repair reasoning, not only answers.',
    learnerConditions: ['plausible-looking errors', 'misinterpretation'],
    subjects: ['reading comprehension', 'mathematics', 'science reasoning', 'coding'],
    requiredSignals: ['error pattern'],
    phases: ['model thinking', 'student narration', 'reasoning correction'],
    roles: ['supporting'],
    exitWhen: 'Student narrates correct reasoning.',
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'worked_example' }],
    conflictsWith: [],
    assessmentRequirements: 'Open response with working shown.', successIndicators: ['reasoning errors decline'],
    minGrade: 0,
  }),
  s({
    id: 'concept_mapping', version: 1, name: 'Concept Mapping', kind: 'guide', guideNumber: 17,
    description: 'Build an explicit map of how concepts relate, with labelled links.',
    intendedWhen: 'Consolidating a unit of interconnected ideas.',
    limitations: 'Text-only surfaces describe the map in words or an outline.',
    promptInstructions: 'Ask the student to list the key concepts, then pick a central one. For each connection, ask for a precise relationship ("causes", "is a type of", "is needed for"); do not accept "relates to". Ask for cross-links between branches and for concepts that are still unconnected; treat those gaps as what to teach next. Build the map from their answers, not for them.',
    expectedInteraction: 'Concept list, labelled links, cross-links, gaps.',
    successCriteria: 'Specific labels, cross-links and no isolated concepts.',
    objective: 'Integrate knowledge and reveal missing links.',
    learnerConditions: ['several objectives in a unit studied'],
    subjects: ['science', 'social studies', 'history', 'economics'],
    requiredSignals: ['objectives in the unit'],
    phases: ['list', 'hub', 'relations', 'cross-links', 'gaps'],
    roles: ['supporting', 'reinforcement'],
    exitWhen: 'Map complete with cross-links.',
    switchWhen: [],
    conflictsWith: [],
    assessmentRequirements: 'Analysis item across objectives.', successIndicators: ['cross-links identified'],
    minGrade: 5,
  }),
  // ---------- Part V: adaptive and personalised ----------
  s({
    id: 'differentiated_instruction', version: 1, name: 'Differentiated Instruction', kind: 'guide', guideNumber: 18,
    description: 'Adjust complexity, scaffolding and pace to readiness, without labelling the student.',
    intendedWhen: 'Always, as a modifier of the chosen method.',
    limitations: 'Readiness comes from ENARA evidence, which may be thin.',
    promptInstructions: 'Match difficulty and support to the readiness given below, silently. Lower readiness: simpler words, concrete examples, smaller steps, more frequent checks. Higher readiness: fewer scaffolds, harder variants, extension questions, ask them to explain it as if teaching. Recalibrate at once when performance changes. Never tell the student which level they are at.',
    expectedInteraction: 'Same objective at the right challenge level.',
    successCriteria: 'Challenge matches performance (few long error runs or easy streaks).',
    objective: 'Right level of challenge for each learner.',
    learnerConditions: ['any'],
    subjects: ANY,
    requiredSignals: ['mastery status', 'evidence strength'],
    phases: ['calibrate'],
    roles: ['modifier'],
    exitWhen: 'Never (modifier).',
    switchWhen: [],
    conflictsWith: [],
    assessmentRequirements: 'None beyond the primary method.', successIndicators: ['stable productive struggle'],
    minGrade: 0,
  }),
  s({
    id: 'adaptive_pathways', version: 1, name: 'Adaptive Learning Pathways', kind: 'guide', guideNumber: 19,
    description: 'Choose what to teach next from the knowledge model: prerequisites first, decay reviewed.',
    intendedWhen: 'System level: implemented by ENARA\'s orchestrator, pathways and prerequisite graph.',
    limitations: 'Depends on objective tagging and prerequisite links set by teachers.',
    promptInstructions: 'Follow the learning focus below: it was chosen from the student\'s evidence. Do not re-teach what is marked mastered; if errors suggest a missing earlier skill, check that skill first.',
    expectedInteraction: 'Teaching follows the selected objective.',
    successCriteria: 'Next objective chosen within reach; prerequisites secured first.',
    objective: 'Sequence instruction by evidence.',
    learnerConditions: ['any'],
    subjects: ANY,
    requiredSignals: ['mastery per objective', 'prerequisite graph', 'retention state'],
    phases: ['select', 'teach', 'update'],
    roles: ['system'],
    exitWhen: 'Never (system).',
    switchWhen: [],
    conflictsWith: [],
    assessmentRequirements: 'Objective-tagged evidence.', successIndicators: ['mastery progression along prerequisites'],
    minGrade: 0,
  }),
  s({
    id: 'formative_feedback', version: 1, name: 'Formative Assessment & Feedback Loops', kind: 'guide', guideNumber: 20,
    description: 'Treat every answer as evidence; feedback says where the student is and what to do next.',
    intendedWhen: 'Always as the feedback policy; primary when the starting point is unknown.',
    limitations: 'Tutor-chat answers are not graded evidence in ENARA; only assessments are.',
    promptInstructions: 'State the learning goal briefly. After each answer, give specific feedback on the task ("the error is in this step") or the strategy ("this needs X, not Y"), and one concrete next action. Do not say only right or wrong, and never praise or criticise the person. Follow a correct answer with a deeper question. When the starting point is unknown, begin with a few short questions to find it.',
    expectedInteraction: 'Check question, analysis, specific forward feedback.',
    successCriteria: 'The student acts on the feedback and improves on the next attempt.',
    objective: 'Close the gap between current and target performance.',
    learnerConditions: ['any', 'not_assessed'],
    subjects: ANY,
    requiredSignals: ['response correctness'],
    phases: ['goal', 'check', 'feedback', 'adjust'],
    roles: ['primary', 'modifier'],
    exitWhen: 'Starting point established (when primary).',
    switchWhen: [],
    conflictsWith: [],
    assessmentRequirements: 'Diagnostic or formative item.', successIndicators: ['improvement after feedback'],
    minGrade: 0,
  }),
  // ---------- Part VI: engagement and motivation ----------
  s({
    id: 'gamification', version: 1, name: 'Gamification & Game-Based Learning', kind: 'guide', guideNumber: 21,
    description: 'Challenges, streaks and levels, calibrated to keep productive struggle.',
    intendedWhen: 'High-repetition practice, or a disengaged younger learner.',
    limitations: 'Engagement is not learning; mechanics must never replace substance.',
    promptInstructions: 'Frame practice as short missions and acknowledge streaks and level-ups. Raise the challenge after a run of easy successes; lower it a step after repeated failures. Offer optional harder bonus challenges. Reward accuracy and understanding, never speed. Treat errors as useful information, never as punishment.',
    expectedInteraction: 'Mission framing, streaks, calibrated difficulty.',
    successCriteria: 'Sustained correct practice.',
    objective: 'Sustain engagement during practice.',
    learnerConditions: ['disengaged', 'repetitive practice'],
    subjects: ['vocabulary', 'math facts', 'drill practice'],
    requiredSignals: ['engagement signal (inactivity)'],
    phases: ['mission', 'practice', 'level up'],
    roles: ['supporting'],
    exitWhen: 'Practice set completed.',
    switchWhen: [],
    conflictsWith: ['socratic_questioning'],
    assessmentRequirements: 'None beyond practice.', successIndicators: ['return after inactivity', 'practice completed'],
    minGrade: 0,
  }),
  s({
    id: 'narrative_contextual', version: 1, name: 'Narrative-Based & Contextual Learning', kind: 'guide', guideNumber: 22,
    description: 'Embed the idea in a relatable story or real situation that creates the need for it.',
    intendedWhen: 'Abstract content, or a disengaged learner asking why it matters.',
    limitations: 'Scenarios must be culturally relevant and familiar to the student.',
    promptInstructions: 'Start with a short, relatable scenario in which the student needs this idea to solve a problem; make the need clear before teaching. Then teach the idea as the tool for the scenario, return to the scenario to apply it, and finish with a different scenario that needs the same idea. Use settings familiar to the student\'s culture and age.',
    expectedInteraction: 'Scenario, need, teach, apply, transfer.',
    successCriteria: 'The student applies the idea in a new scenario.',
    objective: 'Relevance, motivation and transfer.',
    learnerConditions: ['disengaged', 'abstract content'],
    subjects: ANY,
    requiredSignals: ['engagement signal (inactivity)'],
    phases: ['world', 'need', 'teach', 'return', 'transfer'],
    roles: ['supporting'],
    exitWhen: 'Transfer scenario solved.',
    switchWhen: [],
    conflictsWith: [],
    assessmentRequirements: 'Transfer item.', successIndicators: ['transfer items correct'],
    minGrade: 0, noviceSafe: true,
  }),
  s({
    id: 'blooms_guided', version: 1, name: "Bloom's Taxonomy-Guided Instruction", kind: 'guide', guideNumber: 23,
    description: 'Find the cognitive level the student works at and target the next level up.',
    intendedWhen: 'Recall is fine but application or analysis fails.',
    limitations: 'Needs questions tagged with a cognitive level to diagnose from evidence.',
    promptInstructions: 'Move up the levels: remember, understand, apply, analyse, evaluate, create. Once basics are secure, ask application and then analysis questions; do not stop at recall. If application fails, check understanding (explain it in your own words) rather than re-teaching facts. Do not jump levels: analysis comes before evaluation.',
    expectedInteraction: 'Questions climbing one level at a time.',
    successCriteria: 'Correct answers one level above where the student started.',
    objective: 'Higher-order thinking aligned to objectives.',
    learnerConditions: ['recall correct, application weak'],
    subjects: ANY,
    requiredSignals: ['cognitive level of assessed questions'],
    phases: ['diagnose level', 'target next level'],
    roles: ['primary', 'modifier'],
    exitWhen: 'Target level reached.',
    switchWhen: [{ signal: 'application_failed', to: 'scaffolding' }],
    conflictsWith: [],
    assessmentRequirements: 'Items tagged with cognitiveLevel.', successIndicators: ['higher-level items correct'],
    minGrade: 0,
  }),
  // ---------- ENARA techniques (registry v1 ids, kept) ----------
  s({
    id: 'visual_explanation', version: 1, name: 'Visual explanation', kind: 'technique', guideMethod: 'analogy',
    description: 'Explain with a diagram, table or number line.',
    intendedWhen: 'Conceptual confusion where a picture helps (and an analogy did not).',
    limitations: 'Needs a visual-capable surface (live tutor draws; chat describes).',
    promptInstructions: 'Explain using a simple visual (describe a diagram, table or number line clearly), then ask a question about it.',
    expectedInteraction: 'Visual, then a question.',
    successCriteria: 'The student uses the visual to answer.',
    roles: ['primary', 'supporting'], noviceSafe: true, minGrade: 0, conflictsWith: [],
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'worked_example' }],
  }),
  s({
    id: 'error_analysis', version: 1, name: 'Error analysis', kind: 'technique', guideMethod: 'think_aloud',
    description: 'Look at a wrong answer together and find the mistake.',
    intendedWhen: 'A misinterpretation or repeated specific error.',
    limitations: 'Needs a concrete wrong answer to discuss.',
    promptInstructions: 'Show a typical wrong answer for this objective, ask the student to find the mistake, then explain the correct approach.',
    expectedInteraction: 'Wrong example, student diagnosis, correction.',
    successCriteria: 'The student explains why the answer was wrong.',
    roles: ['primary', 'supporting'], minGrade: 0, conflictsWith: [],
    switchWhen: [{ signal: 'no_improvement_after_new_evidence', to: 'think_aloud' }],
  }),
  s({
    id: 'guided_practice', version: 1, name: 'Guided practice', kind: 'technique', guideMethod: 'direct_instruction',
    description: 'Practice problems with hints available.',
    intendedWhen: 'Developing, after an explanation or worked example.',
    limitations: 'Success with hints is not independent mastery.',
    promptInstructions: 'Give one practice problem at a time. Offer a hint only when asked or after a wrong attempt.',
    expectedInteraction: 'Problem, attempt, hint if needed.',
    successCriteria: 'Correct answers with few hints.',
    roles: ['primary', 'reinforcement'], minGrade: 0, conflictsWith: [], givesAnswerLastResort: true,
    switchWhen: [{ signal: 'mastery_reached', to: 'independent_practice' }],
  }),
  s({
    id: 'independent_practice', version: 1, name: 'Independent practice', kind: 'technique', guideMethod: 'direct_instruction',
    description: 'Practice without hints to confirm understanding.',
    intendedWhen: 'Proficient but needs verification.',
    limitations: 'Not a formal assessment.',
    promptInstructions: 'Give practice problems without hints. Only after the student answers, say whether it is right and why.',
    expectedInteraction: 'Problem, answer, feedback.',
    successCriteria: 'Correct answers without help.',
    roles: ['primary', 'reinforcement'], minGrade: 0, conflictsWith: ['scaffolding'],
    switchWhen: [{ signal: 'repeated_errors', to: 'scaffolding' }],
  }),
  s({
    id: 'prerequisite_remediation', version: 1, name: 'Prerequisite remediation', kind: 'technique', guideMethod: 'adaptive_pathways',
    description: 'Teach the missing prerequisite first.',
    intendedWhen: 'A prerequisite objective is not secure.',
    limitations: 'Delays the target objective.',
    promptInstructions: 'The student first needs the prerequisite named below. Teach and practise that prerequisite briefly, then connect it back to the target objective.',
    expectedInteraction: 'Prerequisite review, then a bridge to the target.',
    successCriteria: 'The student answers a prerequisite question correctly.',
    roles: ['primary'], minGrade: 0, conflictsWith: [], noviceSafe: true,
    switchWhen: [],
  }),
];

export const STRATEGY_BY_ID = new Map(STRATEGIES.map((x) => [x.id, x]));
export const GUIDE_METHODS = STRATEGIES.filter((x) => x.kind === 'guide').sort((a, b) => (a.guideNumber ?? 0) - (b.guideNumber ?? 0));
export const REGISTRY_VERSION = 'reg-v2';

// The legacy tutor TeachingMethod enum (TutorSession.teachingMethod, tutor
// message meta) predates the registry. Its values keep working and resolve here.
export const LEGACY_METHOD_ALIASES: Record<string, string> = {
  socratic: 'socratic_questioning',
  gap_filler: 'scaffolding',
  error_analysis: 'error_analysis',
};

export function resolveMethodId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (STRATEGY_BY_ID.has(id)) return id;
  return LEGACY_METHOD_ALIASES[id];
}

// ---------- Composition ----------
export interface MethodComposition {
  primary: string;
  supporting: string[];
  reinforcement?: string;
  modifiers: string[];
}

const conflicts = (a: string, b: string) =>
  Boolean(STRATEGY_BY_ID.get(a)?.conflictsWith?.includes(b) || STRATEGY_BY_ID.get(b)?.conflictsWith?.includes(a));

// Checks a composition against the guide's rules as resolved in the plan
// (ENARA_ADAPTIVE_TEACHING_AUDIT_AND_PLAN, A2): known ids, roles, at most two
// supporting methods, no declared conflicts, and no answer-withholding primary
// combined with a method that gives answers as a last resort (C3).
export function validateComposition(c: MethodComposition): string[] {
  const problems: string[] = [];
  const all = [c.primary, ...c.supporting, ...(c.reinforcement ? [c.reinforcement] : []), ...c.modifiers];
  for (const id of all) if (!STRATEGY_BY_ID.has(id)) problems.push(`unknown method ${id}`);
  if (problems.length) return problems;
  const has = (id: string, role: MethodRole) => STRATEGY_BY_ID.get(id)!.roles?.includes(role);
  if (!has(c.primary, 'primary')) problems.push(`${c.primary} cannot be primary`);
  if (c.supporting.length > 2) problems.push('at most two supporting methods');
  for (const id of c.supporting) if (!has(id, 'supporting')) problems.push(`${id} cannot be supporting`);
  if (c.reinforcement && !has(c.reinforcement, 'reinforcement')) problems.push(`${c.reinforcement} cannot be reinforcement`);
  for (const id of c.modifiers) if (!has(id, 'modifier') && !has(id, 'system')) problems.push(`${id} cannot be a modifier`);
  if (new Set(all).size !== all.length) problems.push('a method appears twice');
  const active = [c.primary, ...c.supporting, ...(c.reinforcement ? [c.reinforcement] : [])];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) if (conflicts(active[i], active[j])) problems.push(`${active[i]} conflicts with ${active[j]}`);
  if (STRATEGY_BY_ID.get(c.primary)!.withholdsAnswer) {
    for (const id of [...c.supporting, ...(c.reinforcement ? [c.reinforcement] : [])]) {
      if (STRATEGY_BY_ID.get(id)!.givesAnswerLastResort) problems.push(`${c.primary} withholds answers; ${id} gives them as a last resort`);
    }
  }
  return problems;
}
