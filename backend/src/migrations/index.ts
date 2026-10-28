import { logger } from '../utils/logging';
import { AvatarSession } from '../models/AvatarSession';
import { BudgetCounter, BudgetReservation, OrgBudget } from '../models/OrgBudget';
import { Invitation, PasswordReset } from '../models/AccountToken';
import { CommercialPlan, CurrentToolSpend } from '../models/CommercialPlan';
import { EducatorConversation } from '../models/EducatorConversation';
import { checkPriceCatalogDrift } from '../services/priceCatalogDrift';
import { CurriculumChunk, CurriculumFileJob } from '../models/CurriculumChunk';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { TutorMessage } from '../models/TutorMessage';
import { TutorSession } from '../models/TutorSession';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { MasteryHistory, StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { DiagnosticSession } from '../models/DiagnosticSession';
import { StudentMisconception } from '../models/StudentMisconception';
import { LearningIntervention } from '../models/LearningIntervention';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { deriveIdempotencyKey } from '../services/learningEvents';
import { LessonProgress } from '../models/LessonProgress';
import { PriceCatalogRow } from '../models/PriceCatalog';
import { UsageLedger } from '../models/UsageLedger';
import { PRICE_CATALOG, catalogRows } from '../services/priceCatalog';
import type { Migration } from './runner';

// Inserts events with fixed ids, so re-running adds nothing twice.
async function upsertEvents(events: Record<string, unknown>[]) {
  if (!events.length) return;
  await LearningEvent.bulkWrite(
    events.map((e) => ({
      updateOne: { filter: { id: e.id }, update: { $setOnInsert: { conceptIds: [], ...e } }, upsert: true },
    })),
    { ordered: false },
  );
}

// In order. Never edit or reorder a migration once it has shipped; add a new one.
export const MIGRATIONS: Migration[] = [
  {
    id: '2026-10-24-assessment-attempt-settings',
    description: 'Set attempt limit and answer-reveal defaults on existing assessments',
    up: async () => {
      await Assessment.updateMany({ maxAttempts: { $exists: false } }, { $set: { maxAttempts: 1 } });
      await Assessment.updateMany({ answerReveal: { $exists: false } }, { $set: { answerReveal: 'after-submit' } });
    },
  },
  {
    id: '2026-10-24-one-open-attempt',
    description: 'Mark duplicate open attempts abandoned, then add the one-open-attempt index',
    up: async () => {
      // Keep the newest open attempt of each pair; mark the others abandoned
      // (nothing is deleted). Open attempts hold no answers until submitted.
      const duplicates = await AssessmentAttempt.aggregate<{ ids: string[] }>([
        { $match: { status: 'in-progress' } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: { studentId: '$studentId', assessmentId: '$assessmentId' }, ids: { $push: '$id' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ]);
      const extra = duplicates.flatMap((d) => d.ids.slice(1));
      if (extra.length) {
        await AssessmentAttempt.updateMany({ id: { $in: extra }, status: 'in-progress' }, { $set: { status: 'abandoned' } });
      }
      await AssessmentAttempt.createIndexes();
    },
  },
  {
    id: '2026-10-24-tutor-messages-collection',
    description: 'Copy embedded tutor messages into tutor_messages (embedded copies are kept)',
    up: async () => {
      await TutorMessage.createIndexes();
      const cursor = TutorSession.find({ 'messages.0': { $exists: true } })
        .select('id studentId institutionId messages')
        .lean()
        .cursor();
      for await (const session of cursor) {
        const ops = (session.messages || []).map((m) => ({
          updateOne: {
            filter: { sessionId: session.id, id: m.id },
            update: {
              $setOnInsert: {
                id: m.id,
                sessionId: session.id,
                studentId: session.studentId,
                institutionId: session.institutionId,
                role: m.role,
                text: m.text,
                timestamp: m.timestamp,
                imageUrl: m.imageUrl,
                imagePrompt: m.imagePrompt,
                meta: m.meta,
              },
            },
            upsert: true,
          },
        }));
        if (ops.length) await TutorMessage.bulkWrite(ops, { ordered: false });
        const count = await TutorMessage.countDocuments({ sessionId: session.id });
        await TutorSession.updateOne({ id: session.id }, { $set: { messageCount: count } });
      }
    },
  },
  {
    id: '2026-10-25-backfill-learning-events',
    description: 'Create learning events from past submitted attempts, completed lessons and tutor chats',
    up: async () => {
      await LearningEvent.createIndexes();
      for await (const a of AssessmentAttempt.find({ status: 'submitted' }).lean().cursor()) {
        const at = a.submittedAt || a.startedAt || new Date();
        await upsertEvents([
          ...(a.answers || []).map((g) => ({
            id: `le-bf-${a.id}-${g.questionId}`,
            institutionId: a.institutionId,
            studentId: a.studentId,
            type: 'question_answered',
            source: 'assessment',
            verified: true,
            gradedBy: 'rule',
            subject: a.subject,
            topic: g.topic || a.subject || undefined,
            refs: { assessmentId: a.assessmentId, attemptId: a.id, questionId: g.questionId },
            outcome: { correct: Boolean(g.isCorrect) },
            at,
          })),
          {
            id: `le-bf-${a.id}-submitted`,
            institutionId: a.institutionId,
            studentId: a.studentId,
            type: 'assessment_submitted',
            source: 'assessment',
            verified: true,
            gradedBy: 'rule',
            subject: a.subject,
            refs: { assessmentId: a.assessmentId, attemptId: a.id },
            outcome: { score: a.score },
            ...(typeof a.timeSpentSec === 'number' ? { durationMs: a.timeSpentSec * 1000 } : {}),
            at,
          },
        ]);
      }
      for await (const p of LessonProgress.find({ status: 'completed' }).lean().cursor()) {
        await upsertEvents([
          {
            id: `le-bf-lesson-${p.studentId}-${p.courseId}-${p.lessonId}`,
            institutionId: p.institutionId,
            studentId: p.studentId,
            type: 'lesson_completed',
            source: 'lesson',
            verified: true,
            refs: { courseId: p.courseId, lessonId: p.lessonId },
            at: p.completedAt || new Date(),
          },
        ]);
      }
      for await (const m of TutorMessage.find({}).lean().cursor()) {
        await upsertEvents([
          {
            id: `le-bf-msg-${m.sessionId}-${m.id}`,
            institutionId: m.institutionId,
            studentId: m.studentId,
            type: m.role === 'user' ? 'tutor_question' : 'tutor_reply',
            source: 'tutor_chat',
            verified: m.role === 'user',
            refs: { sessionId: m.sessionId, messageId: m.id },
            at: m.timestamp,
          },
        ]);
      }
    },
  },
  {
    id: '2026-10-25-elie-foundations',
    description: 'Learning objectives and evidence indexes; idempotency keys on existing events (duplicates marked, not deleted)',
    up: async () => {
      await LearningObjective.createIndexes();
      await LearningEvidence.createIndexes();
      await LearningEvent.createIndexes();
      const cursor = LearningEvent.find({ idempotencyKey: { $exists: false }, supersededBy: { $exists: false } })
        .sort({ at: 1, _id: 1 })
        .lean()
        .cursor();
      for await (const e of cursor) {
        const key = deriveIdempotencyKey(e);
        const evidenceEligible = e.verified && (e.type === 'question_answered' || e.type === 'review_answered');
        const processing = { evidence: evidenceEligible ? 'pending' : 'not_applicable', attempts: 0 };
        try {
          await LearningEvent.updateOne(
            { id: e.id },
            {
              $set: {
                ...(key ? { idempotencyKey: key } : {}),
                processing,
                ...(e.recordedAt ? {} : { recordedAt: e.at }),
                ...(Array.isArray(e.objectiveIds) ? {} : { objectiveIds: [] }),
              },
            },
          );
        } catch (error) {
          if ((error as { code?: number }).code !== 11000 || !key) throw error;
          // An earlier event already holds this key: this one is a duplicate.
          const holder = await LearningEvent.findOne({ idempotencyKey: key }).select('id').lean();
          await LearningEvent.updateOne(
            { id: e.id },
            { $set: { supersededBy: holder?.id || 'unknown', processing: { evidence: 'not_applicable', attempts: 0 } } },
          );
        }
      }
    },
  },
  {
    id: '2026-10-25-elie-mastery-indexes',
    description: 'Indexes for mastery state and history',
    up: async () => {
      await StudentObjectiveMastery.createIndexes();
      await MasteryHistory.createIndexes();
    },
  },
  {
    id: '2026-10-25-elie-diagnostics-indexes',
    description: 'Indexes for diagnostic sessions and misconceptions',
    up: async () => {
      await DiagnosticSession.createIndexes();
      await StudentMisconception.createIndexes();
    },
  },
  {
    id: '2026-10-25-elie-pedagogy-indexes',
    description: 'Indexes for interventions, pedagogical decisions and time to understand',
    up: async () => {
      await LearningIntervention.createIndexes();
      await PedagogicalDecision.createIndexes();
      await TimeToUnderstand.createIndexes();
    },
  },
  {
    id: '2026-10-25-elie-retention-indexes',
    description: 'Indexes for objective retention states',
    up: async () => {
      await ObjectiveRetentionState.createIndexes();
    },
  },
  {
    id: '2026-10-25-elie-curriculum-indexes',
    description: 'Indexes for curriculum passages and file processing jobs',
    up: async () => {
      await CurriculumChunk.createIndexes();
      await CurriculumFileJob.createIndexes();
    },
  },
  {
    id: '2026-10-26-phase3-assessment-versions',
    description: 'Phase 3: indexes for assignments and assessment versions; version 1 snapshot of every existing assessment',
    up: async () => {
      const { Assessment, AssessmentVersion } = await import('../models/Assessment');
      const { Assignment } = await import('../models/Assignment');
      const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
      const { questionPoints } = await import('../services/assessmentVersions');
      await AssessmentVersion.createIndexes();
      await Assignment.createIndexes();
      await AssessmentAttempt.createIndexes();
      await Assessment.createIndexes();
      // Existing assessments become version 1 exactly as they are now. Nothing
      // is changed or removed; already-versioned ones are skipped.
      const cursor = Assessment.find({ $or: [{ publishedVersion: { $exists: false } }, { publishedVersion: 0 }], lifecycle: { $ne: 'draft' } }).lean().cursor();
      for await (const a of cursor) {
        await AssessmentVersion.updateOne(
          { assessmentId: a.id, version: 1 },
          {
            $setOnInsert: {
              institutionId: a.institutionId,
              title: a.title,
              subject: a.subject,
              instructions: a.instructions,
              duration: a.duration,
              questions: a.questions,
              totalPoints: (a.questions || []).reduce((n: number, q: any) => n + questionPoints(q), 0),
              publishedBy: 'migration',
              publishedAt: new Date(),
            },
          },
          { upsert: true },
        );
        await Assessment.updateOne({ id: a.id }, { $set: { publishedVersion: 1, lifecycle: a.lifecycle ?? 'published', hasUnpublishedChanges: false } });
      }
    },
  },
  {
    id: '2026-10-28-price-catalog-v1',
    description: 'Create usage_ledger and price_catalog indexes; store price catalogue versions (additive)',
    up: async () => {
      await UsageLedger.createIndexes();
      await PriceCatalogRow.createIndexes();
      // Insert-only: an existing row for a version is never changed.
      for (const v of PRICE_CATALOG) {
        const rows = catalogRows(v.version);
        await PriceCatalogRow.bulkWrite(
          rows.map((r) => ({
            updateOne: { filter: { version: r.version, provider: r.provider, modelName: r.modelName, unit: r.unit }, update: { $setOnInsert: r }, upsert: true },
          })),
          { ordered: false },
        );
      }
      // Stored rows that differ from the code are reported, never overwritten.
      const drift = await checkPriceCatalogDrift();
      if (drift.length) logger.warn('price_catalog_drift', { drift });
    },
  },
  {
    id: '2026-10-29-avatar-session-retention',
    description: 'Avatar sessions: replace the 24 h createdAt TTL with a retentionExpiresAt TTL set after metering',
    up: async () => {
      const collection = AvatarSession.collection;
      const existing = await collection.indexes().catch(() => []);
      // Only the old TTL: key exactly { createdAt: 1 } with expireAfterSeconds.
      for (const index of existing) {
        const keys = Object.keys(index.key);
        if (keys.length === 1 && index.key.createdAt === 1 && index.expireAfterSeconds !== undefined && index.name) {
          await collection.dropIndex(index.name);
        }
      }
      await collection.createIndex({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });
    },
  },
  {
    id: '2026-10-29-p0d-budget-indexes',
    description: 'AI budgets: unique org_budgets.institutionId, counter TTL and reservation lookup indexes (additive)',
    up: async () => {
      // Mongoose builds these in the background at start-up without waiting,
      // so the one P0d relies on (one budget per school) is created here and
      // verified. A duplicate row makes this fail loudly instead of leaving
      // the index missing; the budget code also refuses duplicates.
      await OrgBudget.createIndexes();
      await BudgetCounter.createIndexes();
      await BudgetReservation.createIndexes();
      const unique = (await OrgBudget.collection.indexes()).find((i) => i.key.institutionId === 1 && Object.keys(i.key).length === 1);
      if (!unique?.unique) throw new Error('org_budgets.institutionId unique index missing');
    },
  },
  {
    id: '2026-10-29-p1-account-token-indexes',
    description: 'Invitations and password resets: unique token hashes, expiry TTL (additive)',
    up: async () => {
      // Single use is enforced by atomic claims; the unique hash index keeps a
      // token from ever matching two rows. Built here, not left to Mongoose's
      // background build.
      await Invitation.createIndexes();
      await PasswordReset.createIndexes();
      for (const model of [Invitation, PasswordReset]) {
        const idx = (await model.collection.indexes()).find((i) => i.key.tokenHash === 1);
        if (!idx?.unique) throw new Error(`${model.collection.name}.tokenHash unique index missing`);
      }
    },
  },
  {
    id: '2026-10-29-p2-document-indexes',
    description: 'Documents: passage uploadId and document scan-state indexes (additive)',
    up: async () => {
      // Existing passages keep no uploadId; they are never attributed to a document.
      await CurriculumChunk.createIndexes();
      await CurriculumFileJob.createIndexes();
    },
  },
  {
    id: '2026-10-29-p3-educator-chat-indexes',
    description: 'Educator chat conversations: owner index and retention TTL (additive)',
    up: async () => {
      await EducatorConversation.createIndexes();
    },
  },
  {
    id: '2026-10-29-p5-usage-indexes',
    description: 'Commercial plans, current tool spend, and a usage-ledger index for per-request usage (additive; no rows changed)',
    up: async () => {
      await CommercialPlan.createIndexes();
      await CurrentToolSpend.createIndexes();
      await UsageLedger.createIndexes();
    },
  },
];
