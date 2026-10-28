import { createHash, randomUUID } from 'crypto';
import { Assessment } from '../models/Assessment';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { isFeatureEnabled } from './featureFlags';

// Rule-based misconception detection (misc-rules-v1). Deterministic; AI
// classification of ambiguous answers is not part of this version.
//
// A. Tagged distractor: the student chose wrong options that a teacher tagged
//    with the same misconception on 2+ different questions for the objective.
//    Confidence 0.35 per question, at most 0.9. One slip is not enough.
// B. Prerequisite gap: the student is emerging/developing on an objective with
//    2+ independent answers, and emerging on a direct prerequisite with 2+
//    independent answers. Confidence 0.5.
// A suspected finding is resolved by the system when later independent evidence
// brings the objective to proficient or mastered. Teacher decisions (confirmed,
// dismissed, resolved) are never overwritten by the rules.
export const MISCONCEPTION_DETECTION_VERSION = 'misc-rules-v1';
const MET = new Set(['proficient', 'mastered']);

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

async function upsertSuspected(params: {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  ruleKey: string;
  category: string;
  description: string;
  confidence: number;
  supportingEvidenceIds: string[];
}) {
  const existing = await StudentMisconception.findOne({ studentId: params.studentId, ruleKey: params.ruleKey });
  if (existing) {
    if (existing.status !== 'suspected') return;
    existing.supportingEvidenceIds = params.supportingEvidenceIds;
    existing.confidence = params.confidence;
    await existing.save();
    return;
  }
  const now = new Date();
  await StudentMisconception.create({
    id: `mis-${randomUUID()}`,
    ...params,
    status: 'suspected',
    source: 'rule',
    detectedAt: now,
    detectionVersion: MISCONCEPTION_DETECTION_VERSION,
    statusHistory: [{ at: now, to: 'suspected', note: params.ruleKey.split(':')[0] }],
  }).catch((error) => {
    if ((error as { code?: number }).code !== 11000) throw error;
  });
}

export async function detectMisconceptions(studentId: string, objectiveIds: string[], institutionId?: string) {
  if (!objectiveIds.length || !(await isFeatureEnabled(institutionId, 'misconception_detection_enabled'))) return;

  // Rule A: tagged distractors.
  const answers = await LearningEvent.find({
    studentId,
    type: 'question_answered',
    verified: true,
    'outcome.correct': false,
    objectiveIds: { $in: objectiveIds },
    supersededBy: { $exists: false },
  })
    .select('id refs outcome objectiveIds')
    .lean();
  const assessmentIds = [...new Set(answers.map((a) => a.refs?.assessmentId).filter(Boolean))] as string[];
  const assessments = await Assessment.find({ id: { $in: assessmentIds } }).select('id questions.id questions.distractors').lean();
  const distractorOf = new Map<string, { option: string; category: string; description: string }[]>();
  for (const a of assessments) for (const q of a.questions) if (q.distractors?.length) distractorOf.set(`${a.id}::${q.id}`, q.distractors);

  const groups = new Map<string, { objectiveId: string; category: string; description: string; questions: Set<string>; eventIds: string[] }>();
  for (const e of answers) {
    const tags = distractorOf.get(`${e.refs?.assessmentId}::${e.refs?.questionId}`) || [];
    const hit = tags.find((d) => d.option.trim().toLowerCase() === String(e.outcome?.answer ?? '').trim().toLowerCase());
    if (!hit) continue;
    for (const objectiveId of e.objectiveIds.filter((o) => objectiveIds.includes(o))) {
      const k = `${objectiveId}|${hit.category}|${hit.description.toLowerCase()}`;
      const g = groups.get(k) ?? { objectiveId, category: hit.category, description: hit.description, questions: new Set<string>(), eventIds: [] };
      g.questions.add(`${e.refs?.assessmentId}::${e.refs?.questionId}`);
      g.eventIds.push(e.id);
      groups.set(k, g);
    }
  }
  for (const g of groups.values()) {
    if (g.questions.size < 2) continue;
    const evidence = await LearningEvidence.find({ studentId, objectiveId: g.objectiveId, sourceEventId: { $in: g.eventIds } }).select('id').lean();
    await upsertSuspected({
      institutionId,
      studentId,
      objectiveId: g.objectiveId,
      ruleKey: `distractor:${g.objectiveId}:${hash(g.category + g.description.toLowerCase())}`,
      category: g.category,
      description: g.description,
      confidence: Math.min(0.9, 0.35 * g.questions.size),
      supportingEvidenceIds: evidence.map((x) => x.id),
    });
  }

  // Rule B: prerequisite gap.
  const objectives = await LearningObjective.find({ id: { $in: objectiveIds }, status: 'approved' }).select('id title prerequisiteObjectiveIds').lean();
  const prereqIds = [...new Set(objectives.flatMap((o) => o.prerequisiteObjectiveIds))];
  const states = await StudentObjectiveMastery.find({ studentId, objectiveId: { $in: [...objectiveIds, ...prereqIds] } }).lean();
  const stateOf = new Map(states.map((s) => [s.objectiveId, s]));
  const titles = new Map(
    (await LearningObjective.find({ id: { $in: prereqIds } }).select('id title').lean()).map((o) => [o.id, o.title]),
  );
  const weak = (id: string, statuses: string[]) => {
    const s = stateOf.get(id);
    return !!s && statuses.includes(s.masteryStatus) && s.independentEvidenceCount >= 2;
  };
  for (const o of objectives) {
    if (!weak(o.id, ['emerging', 'developing'])) continue;
    for (const pre of o.prerequisiteObjectiveIds) {
      if (!weak(pre, ['emerging'])) continue;
      const evidence = await LearningEvidence.find({
        studentId,
        objectiveId: { $in: [o.id, pre] },
        result: 'incorrect',
        invalidatedAt: { $exists: false },
      }).select('id').lean();
      await upsertSuspected({
        institutionId,
        studentId,
        objectiveId: o.id,
        ruleKey: `prereq:${o.id}:${pre}`,
        category: 'prerequisite_gap',
        description: `Difficulty with "${o.title}" may come from not yet securing "${titles.get(pre) ?? pre}".`,
        confidence: 0.5,
        supportingEvidenceIds: evidence.map((x) => x.id),
      });
    }
  }

  // Resolution by later evidence.
  const open = await StudentMisconception.find({ studentId, objectiveId: { $in: objectiveIds }, status: 'suspected' });
  for (const m of open) {
    const s = stateOf.get(m.objectiveId) ?? (await StudentObjectiveMastery.findOne({ studentId, objectiveId: m.objectiveId }).lean());
    if (!s || !MET.has(s.masteryStatus) || !s.lastEvidenceAt || s.lastEvidenceAt <= m.detectedAt) continue;
    m.status = 'resolved';
    m.resolvedAt = new Date();
    m.statusHistory.push({ at: new Date(), from: 'suspected', to: 'resolved', note: `later evidence: ${s.masteryStatus}` });
    await m.save();
  }
}
