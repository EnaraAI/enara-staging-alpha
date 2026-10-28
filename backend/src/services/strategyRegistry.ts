// Teaching strategies the tutor can be asked to use. Stable ids; each change
// to a strategy's instructions bumps its version.

export interface TeachingStrategy {
  id: string;
  version: number;
  description: string;
  intendedWhen: string;
  limitations: string;
  promptInstructions: string;
  expectedInteraction: string;
  successCriteria: string;
}

const s = (x: TeachingStrategy) => x;

export const STRATEGIES: TeachingStrategy[] = [
  s({
    id: 'socratic_questioning',
    version: 1,
    description: 'Guide with questions so the student reasons it out.',
    intendedWhen: 'No evidence yet, or the student is close and needs to connect ideas.',
    limitations: 'Slow when a concept is missing entirely.',
    promptInstructions: 'Ask one guiding question at a time. Do not give the answer; build on what the student says.',
    expectedInteraction: 'Short question-answer turns.',
    successCriteria: 'The student states the idea in their own words.',
  }),
  s({
    id: 'direct_instruction',
    version: 1,
    description: 'Explain the idea clearly and briefly, then check.',
    intendedWhen: 'Little understanding shown (emerging).',
    limitations: 'Passive; must be followed by practice.',
    promptInstructions: 'Explain the core idea in a few short steps with one concrete example, then ask one check question.',
    expectedInteraction: 'One explanation, then a check question.',
    successCriteria: 'The student answers the check question correctly.',
  }),
  s({
    id: 'worked_example',
    version: 1,
    description: 'Solve a full example step by step, naming each step.',
    intendedWhen: 'Procedural or calculation errors.',
    limitations: 'Students may copy the pattern without understanding.',
    promptInstructions: 'Work one complete example step by step, naming why each step is done. Then give a similar problem for the student to try.',
    expectedInteraction: 'Example, then a parallel problem.',
    successCriteria: 'The student solves the parallel problem.',
  }),
  s({
    id: 'scaffolding',
    version: 1,
    description: 'Break the task into smaller steps and support each one.',
    intendedWhen: 'Partly understood (developing) but multi-step tasks fail.',
    limitations: 'Support must be removed gradually.',
    promptInstructions: 'Break the problem into small steps. Give the student the first step to do, check it, then the next. Reduce help as they succeed.',
    expectedInteraction: 'Step-by-step turns with decreasing hints.',
    successCriteria: 'The student completes a step without a hint.',
  }),
  s({
    id: 'analogy',
    version: 1,
    description: 'Connect the idea to something familiar.',
    intendedWhen: 'A conceptual misunderstanding is suspected.',
    limitations: 'Analogies break down; say where.',
    promptInstructions: 'Use one everyday analogy to explain the idea, say where the analogy stops working, then ask the student to apply the idea.',
    expectedInteraction: 'Analogy, its limits, an application question.',
    successCriteria: 'The student applies the idea to a new case.',
  }),
  s({
    id: 'visual_explanation',
    version: 1,
    description: 'Explain with a diagram, table or number line.',
    intendedWhen: 'Conceptual confusion where a picture helps (and an analogy did not).',
    limitations: 'Needs a visual-capable surface (live tutor draws; chat describes).',
    promptInstructions: 'Explain using a simple visual (describe a diagram, table or number line clearly), then ask a question about it.',
    expectedInteraction: 'Visual, then a question.',
    successCriteria: 'The student uses the visual to answer.',
  }),
  s({
    id: 'retrieval_practice',
    version: 1,
    description: 'Ask the student to recall without help.',
    intendedWhen: 'Already proficient or mastered: strengthen memory.',
    limitations: 'Frustrating if the idea was never learned.',
    promptInstructions: 'Ask short recall questions one at a time without hints first. Give feedback after each answer.',
    expectedInteraction: 'Rapid questions with feedback.',
    successCriteria: 'Most answers right without hints.',
  }),
  s({
    id: 'error_analysis',
    version: 1,
    description: 'Look at a wrong answer together and find the mistake.',
    intendedWhen: 'A misinterpretation or repeated specific error.',
    limitations: 'Needs a concrete wrong answer to discuss.',
    promptInstructions: 'Show a typical wrong answer for this objective, ask the student to find the mistake, then explain the correct approach.',
    expectedInteraction: 'Wrong example, student diagnosis, correction.',
    successCriteria: 'The student explains why the answer was wrong.',
  }),
  s({
    id: 'guided_practice',
    version: 1,
    description: 'Practice problems with hints available.',
    intendedWhen: 'Developing, after an explanation or worked example.',
    limitations: 'Success with hints is not independent mastery.',
    promptInstructions: 'Give one practice problem at a time. Offer a hint only when asked or after a wrong attempt.',
    expectedInteraction: 'Problem, attempt, hint if needed.',
    successCriteria: 'Correct answers with few hints.',
  }),
  s({
    id: 'independent_practice',
    version: 1,
    description: 'Practice without hints to confirm understanding.',
    intendedWhen: 'Proficient but needs verification.',
    limitations: 'Not a formal assessment.',
    promptInstructions: 'Give practice problems without hints. Only after the student answers, say whether it is right and why.',
    expectedInteraction: 'Problem, answer, feedback.',
    successCriteria: 'Correct answers without help.',
  }),
  s({
    id: 'prerequisite_remediation',
    version: 1,
    description: 'Teach the missing prerequisite first.',
    intendedWhen: 'A prerequisite objective is not secure.',
    limitations: 'Delays the target objective.',
    promptInstructions: 'The student first needs the prerequisite named below. Teach and practise that prerequisite briefly, then connect it back to the target objective.',
    expectedInteraction: 'Prerequisite review, then a bridge to the target.',
    successCriteria: 'The student answers a prerequisite question correctly.',
  }),
];

export const STRATEGY_BY_ID = new Map(STRATEGIES.map((x) => [x.id, x]));
