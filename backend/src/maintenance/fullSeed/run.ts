// Full seed: write, remove and count (lms-test only; reached only through the maintenance router's guards: test cluster + token).
// Every document is cast and validated by its Mongoose model, then written raw (replaceOne + upsert on a fixed _id), so a re-run
// updates instead of duplicating and the backdated createdAt / submittedAt / at / day fields stay as planned. Each one is listed in
// the hidden seed_registry collection (never read by any screen); remove deletes exactly what the registry lists, then the registry rows.
import bcrypt from 'bcryptjs';
import mongoose, { type Model } from 'mongoose';
import { Institution } from '../../models/Institution';
import { User } from '../../models/User';
import { Student } from '../../models/Student';
import { Batch } from '../../models/Batch';
import { Curriculum } from '../../models/Curriculum';
import { CourseInstance } from '../../models/CourseInstance';
import { ClassEnrollment } from '../../models/ClassEnrollment';
import { LearningObjective } from '../../models/LearningObjective';
import { ParentProfile } from '../../models/ParentProfile';
import { ParentLearnerLink } from '../../models/ParentLearnerLink';
import { ParentLinkCode } from '../../models/ParentLinkCode';
import { Invitation } from '../../models/AccountToken';
import { LmsOnboarding } from '../../integrations/lms/models/onboarding';
import { Assessment, AssessmentVersion } from '../../models/Assessment';
import { Assignment } from '../../models/Assignment';
import { AssessmentAttempt } from '../../models/AssessmentAttempt';
import { GradeLedgerEntry } from '../../models/GradeLedger';
import { LessonProgress } from '../../models/LessonProgress';
import { ErrorToWorkOn } from '../../models/ErrorToWorkOn';
import { LearnerProfile, SessionSummary, StudyHabitDaily } from '../../models/LearnerMemory';
import { ReviewItem } from '../../models/ReviewItem';
import { StudentObjectiveMastery } from '../../models/StudentObjectiveMastery';
import { TutorSession } from '../../models/TutorSession';
import { TutorMessage } from '../../models/TutorMessage';
import { AvatarSession } from '../../models/AvatarSession';
import { LearningEvent } from '../../models/LearningEvent';
import { UsageLedger } from '../../models/UsageLedger';
import { ParentEmailSend } from '../../models/ParentEmailSend';
import { ReminderLog } from '../../models/ReminderLog';
import { ALL_FLAGS, forgetFeatureFlags } from '../../services/featureFlags';
import { CURRENT_PRICE_VERSION } from '../../services/priceCatalog';
import { buildPlan, PRICE_VERSION_SLOT, SEED_BATCH, type ModelName, type SeedUser } from './plan';

export const REGISTRY = 'seed_registry';
const MODELS: Record<ModelName, Model<any>> = {
  Institution, User, Student, Batch, Curriculum, CourseInstance, ClassEnrollment, LearningObjective, ParentProfile, ParentLearnerLink, ParentLinkCode,
  Invitation, LmsOnboarding, Assessment, AssessmentVersion, Assignment, AssessmentAttempt, GradeLedgerEntry, LessonProgress, ErrorToWorkOn, SessionSummary,
  LearnerProfile, StudyHabitDaily, ReviewItem, StudentObjectiveMastery, TutorSession, TutorMessage, AvatarSession, LearningEvent, UsageLedger, ParentEmailSend, ReminderLog,
};

export class SeedRefused extends Error {}

/** The password check, before anything is written. The value is never returned, logged or stored (only its bcrypt hash). */
export function seedPassword(env: NodeJS.ProcessEnv = process.env): string {
  const p = env.SEED_USER_PASSWORD;
  if (typeof p !== 'string' || !p.trim()) throw new SeedRefused('SEED_USER_PASSWORD is not set on the server; nothing was created');
  // Owner (22 Nov 2026): one shared password for every account, admins included, chosen by the owner; at least 8 characters.
  if (p.length < 8) throw new SeedRefused('SEED_USER_PASSWORD is shorter than 8 characters; nothing was created');
  return p;
}

export interface RunResult { batch: string; counts: Record<string, number>; total: number; users: Omit<SeedUser, 'key' | 'userId'>[] }

/** Casts and validates every planned document (no writes). Returns rows grouped by collection, or the list of problems. */
export function preparePlan(now: Date, hash: string) {
  const plan = buildPlan(now);
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, true]));
  const byCollection = new Map<string, { model: Model<any>; rows: Record<string, any>[] }>();
  const problems: string[] = [];
  for (const p of plan.docs) {
    const model = MODELS[p.model];
    const doc: Record<string, unknown> = { ...p.doc };
    if (p.model === 'User') doc.password = hash;
    if (p.model === 'Institution') doc.features = features;
    if (doc.priceCatalogVersion === PRICE_VERSION_SLOT) doc.priceCatalogVersion = CURRENT_PRICE_VERSION;
    const m = new model(doc);
    const err = m.validateSync();
    if (err) { problems.push(`${p.model} ${p.key}: ${Object.values(err.errors).map((e) => (e as Error).message).join('; ')}`); continue; }
    const row = m.toObject({ depopulate: true, versionKey: false }) as Record<string, any>;
    for (const k of ['createdAt', 'updatedAt'] as const) { if (doc[k] instanceof Date) row[k] = doc[k]; else if (!(k in doc)) delete row[k]; }
    const coll = model.collection.collectionName;
    if (!byCollection.has(coll)) byCollection.set(coll, { model, rows: [] });
    byCollection.get(coll)!.rows.push(row);
  }
  return { plan, byCollection, problems };
}

export async function runFullSeed(now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<RunResult> {
  const hash = await bcrypt.hash(seedPassword(env), 10);
  const { plan, byCollection, problems } = preparePlan(now, hash);
  if (problems.length) throw new SeedRefused(`The plan has ${problems.length} invalid documents; nothing was written. First: ${problems.slice(0, 5).join(' | ')}`);
  const registry = mongoose.connection.collection(REGISTRY);
  const counts: Record<string, number> = {};
  for (const [coll, { model, rows }] of byCollection) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      // Registry first, so a run cut off half way can still be removed.
      await registry.bulkWrite(
        chunk.map((r) => ({ updateOne: { filter: { _id: `${coll}:${String(r._id)}` as any }, update: { $setOnInsert: { collection: coll, ref: r._id, batch: SEED_BATCH, createdAt: new Date() } }, upsert: true } })),
        { ordered: false },
      );
      await model.collection.bulkWrite(chunk.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } })), { ordered: false });
    }
    counts[coll] = rows.length;
  }
  for (const d of plan.docs) if (d.model === 'Institution') forgetFeatureFlags(String(d.doc.id));
  return { batch: SEED_BATCH, counts, total: plan.docs.length, users: plan.users.map(({ key: _k, userId: _u, ...u }) => u) };
}

export async function removeFullSeed(): Promise<{ batch: string; deleted: Record<string, number>; registryRowsDeleted: number }> {
  const registry = mongoose.connection.collection(REGISTRY);
  const rows = await registry.find({ batch: SEED_BATCH }, { projection: { collection: 1, ref: 1 } }).toArray();
  const grouped = new Map<string, unknown[]>();
  for (const r of rows) { const c = String(r.collection); if (!grouped.has(c)) grouped.set(c, []); grouped.get(c)!.push(r.ref); }
  const deleted: Record<string, number> = {};
  // Raw driver deletes. This also removes the seed's own grade_ledger rows (append-only in the app; owner-approved for lms-test).
  for (const [c, ids] of grouped) {
    let n = 0;
    for (let i = 0; i < ids.length; i += 1000) n += (await mongoose.connection.collection(c).deleteMany({ _id: { $in: ids.slice(i, i + 1000) } } as any)).deletedCount;
    deleted[c] = n;
  }
  const reg = await registry.deleteMany({ batch: SEED_BATCH });
  if (grouped.has(Institution.collection.collectionName)) forgetFeatureFlags(); // clears the flag cache
  return { batch: SEED_BATCH, deleted, registryRowsDeleted: reg.deletedCount };
}

export async function fullSeedStatus(): Promise<{ batch: string; counts: Record<string, number>; total: number }> {
  const out = await mongoose.connection
    .collection(REGISTRY)
    .aggregate<{ _id: string; n: number }>([{ $match: { batch: SEED_BATCH } }, { $group: { _id: '$collection', n: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    .toArray();
  return { batch: SEED_BATCH, counts: Object.fromEntries(out.map((r) => [r._id, r.n])), total: out.reduce((a, r) => a + r.n, 0) };
}
