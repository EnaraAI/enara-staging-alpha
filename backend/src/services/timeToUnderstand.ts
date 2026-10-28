import { randomUUID } from 'crypto';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { TutorSession } from '../models/TutorSession';
import type { MasteryResult } from './masteryModel';

// Time to Understand (ttu-v1). See docs/phase2/TTU_SPECIFICATION.md.
// - An episode opens when an objective's status becomes emerging/developing on
//   independent evidence (a documented gap).
// - It is verified when a later independent answer (assessment, diagnostic or
//   review, no assistance) is correct and the status reaches proficient/mastered.
// - Active instruction time is recomputed from events each time (never added
//   up incrementally, so nothing is double-counted):
//   * tutor turns in chats targeting the objective: each gap between turns
//     counts up to 5 minutes (longer gaps are a pause); the first turn counts 30 s;
//   * visible time on lessons linked to the objective, at most 60 min per view.
//   Assessment and diagnostic time is measurement, not instruction: not counted.
// - Episodes with no new evidence for 60 days become 'abandoned' (kept).

export const TTU_VERSION = 'ttu-v1';
const TURN_CAP_S = 300;
const FIRST_TURN_S = 30;
const LESSON_CAP_MS = 60 * 60 * 1000;
const ABANDON_AFTER_DAYS = 60;
const GAP = new Set(['emerging', 'developing']);
const MET = new Set(['proficient', 'mastered']);
const INDEPENDENT = ['independent_assessment', 'diagnostic', 'retention_review'];

export async function activeInstructionSeconds(studentId: string, objectiveId: string, from: Date, to: Date) {
  const sessions = await TutorSession.find({ studentId, objectiveId }).select('id').lean();
  let seconds = 0;
  if (sessions.length) {
    const turns = await LearningEvent.find({
      studentId,
      type: { $in: ['tutor_question', 'tutor_reply'] },
      'refs.sessionId': { $in: sessions.map((s) => s.id) },
      at: { $gte: from, $lte: to },
    })
      .select('refs.sessionId at')
      .sort({ at: 1 })
      .lean();
    const bySession = new Map<string, Date[]>();
    for (const t of turns) {
      const list = bySession.get(t.refs!.sessionId!) ?? [];
      list.push(t.at);
      bySession.set(t.refs!.sessionId!, list);
    }
    for (const times of bySession.values()) {
      seconds += FIRST_TURN_S;
      for (let i = 1; i < times.length; i += 1) seconds += Math.min(TURN_CAP_S, (times[i].getTime() - times[i - 1].getTime()) / 1000);
    }
  }
  const objective = await LearningObjective.findOne({ id: objectiveId }).select('lessonIds').lean();
  if (objective?.lessonIds.length) {
    const views = await LearningEvent.find({
      studentId,
      type: 'lesson_viewed',
      'refs.lessonId': { $in: objective.lessonIds },
      at: { $gte: from, $lte: to },
    })
      .select('durationMs')
      .lean();
    for (const v of views) seconds += Math.min(LESSON_CAP_MS, v.durationMs ?? 0) / 1000;
  }
  return Math.round(seconds);
}

async function refreshEpisode(episodeId: string, until: Date) {
  const e = await TimeToUnderstand.findOne({ id: episodeId });
  if (!e) return;
  const [seconds, interventions, decisions] = await Promise.all([
    activeInstructionSeconds(e.studentId, e.objectiveId, e.gapDetectedAt, until),
    LearningIntervention.find({ studentId: e.studentId, objectiveId: e.objectiveId, createdAt: { $gte: e.gapDetectedAt, $lte: until } }).select('id').lean(),
    PedagogicalDecision.find({ studentId: e.studentId, objectiveId: e.objectiveId, at: { $gte: e.gapDetectedAt, $lte: until } }).select('strategyId').lean(),
  ]);
  e.activeInstructionSeconds = seconds;
  e.interventionIds = interventions.map((i) => i.id);
  e.strategiesUsed = [...new Set(decisions.map((d) => d.strategyId))];
  e.lastComputedAt = new Date();
  await e.save();
}

// Called after each mastery recomputation.
export async function updateTimeToUnderstand(studentId: string, objectiveId: string, result: MasteryResult, institutionId?: string) {
  const open = await TimeToUnderstand.findOne({ studentId, objectiveId, status: 'in_progress' });
  if (!open) {
    if (!GAP.has(result.masteryStatus) || result.independentEvidenceCount === 0 || !result.lastEvidenceAt) return;
    const gapEvidence = await LearningEvidence.findOne({ studentId, objectiveId, result: 'incorrect', invalidatedAt: { $exists: false } })
      .sort({ occurredAt: -1 })
      .select('id')
      .lean();
    await TimeToUnderstand.create({
      id: `ttu-${randomUUID()}`,
      institutionId,
      studentId,
      objectiveId,
      gapDetectedAt: result.lastEvidenceAt,
      gapEvidenceId: gapEvidence?.id,
      status: 'in_progress',
      measurementVersion: TTU_VERSION,
      lastComputedAt: new Date(),
    }).catch((error) => {
      if ((error as { code?: number }).code !== 11000) throw error;
    });
    return;
  }
  if (!MET.has(result.masteryStatus)) return;
  const proof = await LearningEvidence.findOne({
    studentId,
    objectiveId,
    evidenceType: { $in: INDEPENDENT },
    assistanceLevel: 'none',
    result: 'correct',
    occurredAt: { $gt: open.gapDetectedAt },
    invalidatedAt: { $exists: false },
  })
    .sort({ occurredAt: -1 })
    .lean();
  if (!proof) return;
  open.status = 'verified';
  open.understandingVerifiedAt = proof.occurredAt;
  open.reassessmentEvidenceId = proof.id;
  open.elapsedSeconds = Math.round((proof.occurredAt.getTime() - open.gapDetectedAt.getTime()) / 1000);
  await open.save();
  await refreshEpisode(open.id, proof.occurredAt);
}

// Daily: refresh open episodes' time and mark long-idle ones abandoned.
export async function maintainTimeToUnderstand(now = new Date()) {
  const open = await TimeToUnderstand.find({ status: 'in_progress' }).limit(5000);
  let abandoned = 0;
  for (const e of open) {
    const latest = await LearningEvidence.findOne({ studentId: e.studentId, objectiveId: e.objectiveId }).sort({ occurredAt: -1 }).select('occurredAt').lean();
    const last = latest?.occurredAt ?? e.gapDetectedAt;
    if (now.getTime() - last.getTime() > ABANDON_AFTER_DAYS * 86_400_000) {
      e.status = 'abandoned';
      await e.save();
      abandoned += 1;
    } else {
      await refreshEpisode(e.id, now);
    }
  }
  return { open: open.length, abandoned };
}
