// English CEFR rubric presets for open responses and speaking exams.
// Criteria follow the CEFR's qualitative aspects of language use (range,
// accuracy, fluency, interaction, coherence); descriptors are short
// paraphrases written for grading, one per level. Points: Below A1 = 0,
// A1 = 1 ... C2 = 6, so a criterion's score reads as its CEFR level.
// Teachers can edit or remove anything after inserting it.

export type CefrSkill = 'speaking' | 'writing';

type Level = { id: string; label: string; points: number; description?: string };
type Criterion = { id: string; title: string; description?: string; levels: Level[] };

export const CEFR_BANDS = ['Below A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

// Seven descriptors per criterion, Below A1 first.
const SPEAKING: [string, string, string[]][] = [
  ['Range', 'Vocabulary and structures the student can use.', [
    'Isolated words only, or no usable English.',
    'A few memorised words and phrases about personal details and very familiar things.',
    'Basic sentence patterns and memorised phrases for simple everyday needs.',
    'Enough language to talk about familiar topics such as family, hobbies, work, travel; some circumlocution.',
    'Enough range to give clear descriptions and express viewpoints on most general topics without searching much for words.',
    'Broad range; expresses ideas clearly and appropriately on a wide range of topics without restricting what they want to say.',
    'Great flexibility; conveys finer shades of meaning precisely, with idiomatic and colloquial language.',
  ]],
  ['Accuracy', 'Grammatical control.', [
    'No control of even basic structures.',
    'Limited control of a few simple, memorised structures.',
    'Uses some simple structures correctly but still makes basic mistakes systematically.',
    'Reasonably accurate use of common patterns in familiar, predictable situations.',
    'Relatively high grammatical control; errors do not cause misunderstanding and are often self-corrected.',
    'Consistently high accuracy; errors are rare and hard to spot.',
    'Consistent control of complex language, even while attention is on planning and reacting.',
  ]],
  ['Fluency', 'Ability to keep going and produce stretches of speech.', [
    'Cannot produce connected speech.',
    'Very short, isolated, mainly pre-packaged utterances, with much pausing to search for words.',
    'Makes self understood in very short utterances; pauses, false starts and reformulation are very evident.',
    'Keeps going comprehensibly, though pausing for planning and repair is evident in longer stretches.',
    'Produces stretches of speech at a fairly even pace; few noticeably long pauses.',
    'Speaks fluently and spontaneously, almost effortlessly; only a conceptually difficult subject slows them down.',
    'Speaks at length with a natural, effortless flow; pauses only to think about ideas, not words.',
  ]],
  ['Interaction', 'Taking part in the conversation: answering, asking and keeping it going.', [
    'Cannot respond to simple questions.',
    'Asks and answers simple questions about personal details; communication depends on repetition and rephrasing.',
    'Answers questions and responds to simple statements; can show when they are following but rarely keeps the conversation going alone.',
    'Starts, maintains and closes simple face-to-face conversation on familiar topics; can repeat back to confirm understanding.',
    'Takes turns appropriately, helps the discussion along on familiar ground, and invites others in.',
    'Selects suitable phrases to get the floor or gain time, and relates their contributions skilfully to others\'.',
    'Interacts with ease and skill, picking up and using non-verbal and intonational cues naturally.',
  ]],
  ['Coherence', 'Linking ideas into connected, organised speech.', [
    'No linking of words or ideas.',
    'Links words or groups of words with very basic connectors such as "and" or "then".',
    'Links groups of words with simple connectors such as "and", "but" and "because".',
    'Links a series of shorter, discrete elements into a connected, linear sequence of points.',
    'Uses a limited number of cohesive devices to link utterances into clear, coherent discourse; some "jumpiness" in long contributions.',
    'Produces clear, smoothly flowing, well-structured speech with controlled use of organisational patterns and connectors.',
    'Creates coherent and cohesive discourse with a full, appropriate range of organisational patterns and cohesive devices.',
  ]],
];

const WRITING: [string, string, string[]][] = [
  ['Task and content', 'How fully and clearly the writing does what the task asks.', [
    'Does not address the task.',
    'Writes simple isolated phrases and sentences about themselves and familiar people or places.',
    'Writes a short series of simple phrases and sentences about everyday aspects of their life or the task topic.',
    'Writes straightforward connected text on familiar topics; gives simple reasons, opinions or descriptions.',
    'Writes clear, detailed text; develops an argument or description with reasons and relevant examples.',
    'Writes clear, well-structured text on complex subjects, expanding and supporting points with reasons and examples.',
    'Writes clear, smoothly flowing, complex text in an appropriate and effective style that the reader finds easy to follow.',
  ]],
  ['Range', 'Vocabulary and structures used.', [
    'Isolated words only.',
    'A very basic repertoire of words and simple phrases about personal details.',
    'Basic sentence patterns with memorised phrases and short groups of words.',
    'Enough language to write about familiar topics, with some circumlocution and repetition.',
    'Sufficient range to give clear descriptions and express viewpoints, using some complex sentences.',
    'A broad range of language that lets them express themselves clearly without restricting what they want to say.',
    'A very wide range, including idiomatic expressions, used precisely to convey finer shades of meaning.',
  ]],
  ['Accuracy', 'Grammar, spelling and punctuation.', [
    'No control of basic structures or spelling.',
    'Limited control of a few simple structures; spelling of familiar words is often wrong.',
    'Simple structures used correctly at times, with systematic basic mistakes; meaning is usually clear.',
    'Reasonably accurate in familiar contexts; errors occur but the meaning is clear.',
    'Good grammatical control; occasional slips and non-systematic errors that do not cause misunderstanding.',
    'Consistently high accuracy; errors are rare; layout, paragraphing and punctuation are consistent and helpful.',
    'Consistent grammatical control of complex language; spelling and punctuation are free of errors.',
  ]],
  ['Coherence and cohesion', 'Organisation of the text and linking of ideas.', [
    'No linking of ideas.',
    'Links words or phrases with very basic connectors such as "and" or "then".',
    'Links simple sentences with connectors such as "and", "but" and "because".',
    'Links a series of shorter elements into a connected, linear sequence.',
    'Uses a number of cohesive devices to link sentences into clear, connected text; paragraphs are organised.',
    'Produces clear, well-organised text, using a variety of linking words and organisational patterns effectively.',
    'Creates coherent, cohesive text with a full and appropriate range of organisational patterns and cohesive devices.',
  ]],
];

const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

export function cefrCriteria(skill: CefrSkill): Criterion[] {
  return (skill === 'speaking' ? SPEAKING : WRITING).map(([title, what, descriptors]) => ({
    id: id('cefr'),
    title: `${title} (CEFR)`,
    description: `${what} English CEFR scale: Below A1 = 0 points, A1 = 1, A2 = 2, B1 = 3, B2 = 4, C1 = 5, C2 = 6. Score the level the response shows, not the level the class is studying.`,
    levels: CEFR_BANDS.map((label, points) => ({ id: id('l'), label, points, description: descriptors[points] })),
  }));
}

