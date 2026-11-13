import type { Outcome } from '../benchmark/schema';
import type { StudentState } from '../students/population';
import type { Provider, CallCtx } from '../providers/guard';

export interface Turn { learner: string; tutor: string | null; }
export interface TeachingRecord {
  condition: string; blockId: string; turns: Turn[]; materialShown: string | null; // what the learner saw (notes / lesson text)
  exposureWords: number; tutorCalls: number; notes: string; unavoidableDifferences: string[];
}
export interface TeachCtx { student: StudentState; outcome: Outcome; blockId: string; persona: string; provider: Provider; studentModel: string; ctx: (role: string) => CallCtx; maxTurns: number; }
export interface ConditionAdapter { id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; name: string; teach(c: TeachCtx): Promise<TeachingRecord>; }

export const wordCount = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);
export const lessonText = (o: Outcome): string => {
  const s = o.lesson.spec; return `Lesson: ${o.lesson.title}. ${o.lesson.objective}\nObjectives: ${s.objectives.join('; ')}\nSuccess criteria: ${s.successCriteria.join('; ')}\nVocabulary: ${s.vocabulary.join(', ')}\nGrammar: ${s.grammar.join('; ')}\nExamples: ${s.examples.join(' / ')}`;
};
export const practiceList = (o: Outcome): string => o.lesson.spec.items.map((i, k) => `${k + 1}. ${i.prompt}${i.material ? ` (${i.material})` : ''}`).join('\n');

/** Student turn: the simulated learner replies to the tutor, as a haiku-class model with a persona built from numeric state. */
export async function studentReply(c: TeachCtx, transcript: Turn[], opening: boolean): Promise<string> {
  const hist = transcript.map((t) => `YOU: ${t.learner}\nTUTOR: ${t.tutor ?? ''}`).join('\n\n');
  const user = opening ? 'Start the conversation: ask the tutor to help you practise this point.' : `${hist}\n\nWrite your next message to the tutor.`;
  return (await c.provider.chat({ model: c.studentModel, system: c.persona, user, maxTokens: 1500, effort: 'low' }, c.ctx('student'))).text;
}
/** After instruction the learner writes a short note to self: this is its only memory of the lesson. */
export async function writeNote(c: TeachCtx, source: string): Promise<string> {
  const sys = `${c.persona}\n\nWrite a short note to yourself (2-3 lines, as this learner): what is your rule for this point NOW? If nothing convinced you to change your belief, keep your old belief. Do not invent rules you were not taught.`;
  return (await c.provider.chat({ model: c.studentModel, system: sys, user: source, maxTokens: 1500, effort: 'low' }, c.ctx('student'))).text;
}
export const transcriptText = (t: Turn[]): string => t.map((x) => `YOU: ${x.learner}\nTUTOR: ${x.tutor ?? ''}`).join('\n\n');
