import { type ConditionAdapter, type Turn, studentReply, writeNote, transcriptText, wordCount } from './types';
import { EnaraRuntime } from './enaraRuntime';
const cohortOf = (cefr: string): 'child' | 'teen' | 'adult' => (cefr === 'A1' ? 'child' : cefr === 'A2' ? 'teen' : 'adult');

/** A = actual ENARA tutor through the real route. E = same pipeline with research-only ablations (runtime started with ENARA_RESEARCH_ABLATE). */
export function enaraCondition(id: 'A' | 'B' | 'E', runtime: EnaraRuntime, features: string[] = []): ConditionAdapter {
  return { id, name: id === 'A' ? 'actual ENARA tutor' : id === 'B' ? 'improved ENARA (research flag)' : 'ENARA adaptive-teaching ablation', async teach(c) {
    const s = await runtime.openSession(c.outcome, cohortOf(c.outcome.cefr), c.seedEvidence ? c.hidden : undefined); const turns: Turn[] = []; const metas: unknown[] = [];
    for (let t = 0; t < c.maxTurns; t += 1) { const learner = await studentReply(c, turns, t === 0); const r = await s.send(learner); turns.push({ learner, tutor: r.reply }); metas.push(r.meta); }
    const notes = await writeNote(c, `You have just had this lesson with your tutor:\n${transcriptText(turns)}`);
    return { condition: id, blockId: c.blockId, turns, materialShown: null, exposureWords: turns.reduce((n, t) => n + wordCount(t.tutor ?? ''), 0), tutorCalls: turns.length, notes,
      unavoidableDifferences: id === 'E' ? [`ablated features: ${features.join(', ')}; the pipeline is otherwise identical`] : id === 'B' ? [`improved features on: ${features.join(', ')}; guards and pipeline otherwise identical to A`] : ['ENARA adds its own system prompt, guards and learner profile (the thing under test)'] };
  } };
}
