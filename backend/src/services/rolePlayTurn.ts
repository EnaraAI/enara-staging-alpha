// liveRolePlay: this turn's role-play step for any subject (the language engine and the other subjects both call it). Reads the learner's
// interests and recent scenes only when a scene is picked; adds the child flags, today's lesson point and the debrief's bank entry.
import { engineV2 } from './engineV2';
import { logger, serializeError } from '../utils/logging';
import { rolePlayStep, pickScene, debriefEntry, scenesIn, type RolePlayTurn, type StepInput } from './rolePlay';
import { sceneById, type LessonLang } from './roleplayScenes';
import type { SceneSubject } from './subjectRuleBank';

/** The learner's interests (learner profile) and the scenes of their recent sessions (session summaries). Codes and ids only. */
export async function loadRolePlayMemory(studentId: string): Promise<{ interests: string[]; recent: string[] }> {
  try {
    const { LearnerProfile, SessionSummary } = await import('../models/LearnerMemory');
    const [p, sums] = await Promise.all([
      engineV2('learnerProfile') ? LearnerProfile.findOne({ studentId }).select('interests').lean() : null,
      engineV2('sessionMemory') ? SessionSummary.find({ studentId }).sort({ endedAt: -1 }).limit(5).select('roleplayScenes').lean() : [],
    ]);
    return { interests: (p as { interests?: string[] } | null)?.interests ?? [], recent: (sums as { roleplayScenes?: string[] }[]).flatMap((x) => x.roleplayScenes ?? []) };
  } catch {
    return { interests: [], recent: [] };
  }
}

export async function buildRolePlayTurn(i: {
  studentId?: string; message: string; history: StepInput['history']; objectiveCode?: string; lessonText?: string;
  child: boolean; ageBand?: 'child' | 'teen' | 'adult' | 'unknown'; level?: string; under9: boolean;
  subject?: SceneSubject; lang: LessonLang; signals: StepInput['signals']; blocked: boolean; busy: boolean;
}): Promise<RolePlayTurn | undefined> {
  if (!engineV2('liveRolePlay')) return undefined;
  try {
    const step = await rolePlayStep({
      history: i.history, message: i.message, signals: i.signals, blocked: i.blocked || !i.subject, busy: i.busy, lang: i.lang,
      pick: async () => {
        const mem = i.studentId ? await loadRolePlayMemory(i.studentId) : { interests: [], recent: [] };
        return pickScene({ child: i.child, ageBand: i.ageBand, level: i.level, subject: i.subject, lang: i.lang, interests: mem.interests, recent: [...mem.recent, ...scenesIn(i.history)], ask: i.message, objectiveCode: i.objectiveCode, lessonText: i.lessonText, seed: `${i.studentId ?? ''}|${new Date().toISOString().slice(0, 10)}` });
      },
    });
    if (!step) return undefined;
    const scene = sceneById(step.scene);
    const point = (i.lessonText ?? '').split('; ').slice(0, 2).join('; ').slice(0, 160);
    const out: RolePlayTurn = { ...step, subject: scene?.subject ?? i.subject, lang: i.lang, ...(i.child ? { child: true } : {}), ...(i.under9 ? { under9: true } : {}), ...(point && step.phase === 'beat' ? { lessonPoint: point } : {}) };
    if (out.phase === 'debrief' && scene) {
      const e = debriefEntry(scene, out.errs, i.objectiveCode, i.lessonText);
      if (e) out.entryId = e.id;
    }
    return out;
  } catch (error) {
    logger.warn('roleplay_step_failed', { error: serializeError(error) });
    return undefined;
  }
}
