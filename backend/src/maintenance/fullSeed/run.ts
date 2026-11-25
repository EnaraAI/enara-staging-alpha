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
import { ParentNotification, SchoolAnnouncement, SchoolBusAssignment, SchoolBusNotice, SchoolBusRoute, SchoolConsent, SchoolConsentForm, SchoolRequest, SchoolDailyAttendance, SchoolImport, SchoolInstalment, SchoolTimetableEntry } from '../../schoolApp/models';
import { ReminderLog } from '../../models/ReminderLog';
import { BusHome } from '../../schoolApp/busHomes';
import { BusLiveSettings } from '../../schoolApp/busLive';
import { ALL_FLAGS, forgetFeatureFlags } from '../../services/featureFlags';
import { CURRENT_PRICE_VERSION } from '../../services/priceCatalog';
import { buildPlan, PRICE_VERSION_SLOT, SEED_BATCH, type ModelName, type SeedUser } from './plan';
import { SCHOOLS } from './content';
import { schoolAppSeeded, SCHOOL_APP_SECTIONS_ON } from './schoolApp';

export const REGISTRY = 'seed_registry';
const MODELS: Record<ModelName, Model<any>> = {
  Institution, User, Student, Batch, Curriculum, CourseInstance, ClassEnrollment, LearningObjective, ParentProfile, ParentLearnerLink, ParentLinkCode,
  Invitation, LmsOnboarding, Assessment, AssessmentVersion, Assignment, AssessmentAttempt, GradeLedgerEntry, LessonProgress, ErrorToWorkOn, SessionSummary,
  LearnerProfile, StudyHabitDaily, ReviewItem, StudentObjectiveMastery, TutorSession, TutorMessage, AvatarSession, LearningEvent, UsageLedger, ParentEmailSend, ReminderLog,
  SchoolTimetableEntry, SchoolDailyAttendance, SchoolAnnouncement, SchoolImport, ParentNotification, SchoolInstalment, SchoolBusRoute, SchoolBusAssignment, SchoolBusNotice, SchoolRequest, SchoolConsentForm, SchoolConsent,
  BusHome, BusLiveSettings,
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
export function preparePlan(now: Date, hash: string, only?: readonly ModelName[], built?: ReturnType<typeof buildPlan>) {
  const full = built ?? buildPlan(now);
  const plan = only ? { ...full, docs: full.docs.filter((d) => only.includes(d.model)) } : full;
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

/** Parents school app (a5): writes only the school app part of the plan (no users, no passwords touched) and turns the sections on for
 * the seeded schools with parent access. Same registry, so the full-seed remove clears it. For a database that already has the full seed. */
export const SCHOOL_APP_MODELS: readonly ModelName[] = ['SchoolTimetableEntry', 'SchoolDailyAttendance', 'SchoolAnnouncement', 'SchoolImport', 'ParentNotification', 'SchoolInstalment', 'SchoolBusRoute', 'SchoolBusAssignment', 'SchoolBusNotice', 'SchoolRequest', 'SchoolConsentForm', 'SchoolConsent'];
export async function runSchoolAppSeed(now = new Date()): Promise<{ batch: string; counts: Record<string, number>; schools: string[] }> {
  const seeded = await Institution.find({ id: { $in: SCHOOLS.filter(schoolAppSeeded).map((s) => s.id) } }).select('id').lean();
  if (seeded.length !== SCHOOLS.filter(schoolAppSeeded).length) throw new SeedRefused('Run the full seed first: the seeded schools are not all here; nothing was written');
  const { byCollection, problems } = preparePlan(now, '-', SCHOOL_APP_MODELS);
  if (problems.length) throw new SeedRefused(`The plan has ${problems.length} invalid documents; nothing was written. First: ${problems.slice(0, 5).join(' | ')}`);
  const registry = mongoose.connection.collection(REGISTRY);
  const counts: Record<string, number> = {};
  for (const [coll, { model, rows }] of byCollection) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await registry.bulkWrite(chunk.map((r) => ({ updateOne: { filter: { _id: `${coll}:${String(r._id)}` as any }, update: { $setOnInsert: { collection: coll, ref: r._id, batch: SEED_BATCH, createdAt: new Date() } }, upsert: true } })), { ordered: false });
      await model.collection.bulkWrite(chunk.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } })), { ordered: false });
    }
    counts[coll] = rows.length;
  }
  const ids = seeded.map((s) => s.id);
  await Institution.updateMany({ id: { $in: ids } }, { $set: { 'schoolApp.sections': SCHOOL_APP_SECTIONS_ON, 'schoolApp.updatedAt': now, 'schoolApp.updatedBy': 'full-seed' } });
  return { batch: SEED_BATCH, counts, schools: ids };
}

export async function removeFullSeed(batch: string = SEED_BATCH): Promise<{ batch: string; deleted: Record<string, number>; registryRowsDeleted: number }> {
  const registry = mongoose.connection.collection(REGISTRY);
  const rows = await registry.find({ batch }, { projection: { collection: 1, ref: 1 } }).toArray();
  const grouped = new Map<string, unknown[]>();
  for (const r of rows) { const c = String(r.collection); if (!grouped.has(c)) grouped.set(c, []); grouped.get(c)!.push(r.ref); }
  const deleted: Record<string, number> = {};
  // Raw driver deletes. This also removes the seed's own grade_ledger rows (append-only in the app; owner-approved for lms-test).
  for (const [c, ids] of grouped) {
    let n = 0;
    for (let i = 0; i < ids.length; i += 1000) n += (await mongoose.connection.collection(c).deleteMany({ _id: { $in: ids.slice(i, i + 1000) } } as any)).deletedCount;
    deleted[c] = n;
  }
  const reg = await registry.deleteMany({ batch });
  if (grouped.has(Institution.collection.collectionName)) forgetFeatureFlags(); // clears the flag cache
  return { batch, deleted, registryRowsDeleted: reg.deletedCount };
}

export async function fullSeedStatus(batch: string = SEED_BATCH): Promise<{ batch: string; counts: Record<string, number>; total: number }> {
  const out = await mongoose.connection
    .collection(REGISTRY)
    .aggregate<{ _id: string; n: number }>([{ $match: { batch } }, { $group: { _id: '$collection', n: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    .toArray();
  return { batch, counts: Object.fromEntries(out.map((r) => [r._id, r.n])), total: out.reduce((a, r) => a + r.n, 0) };
}

/** The family account (familyPlan.ts): its own batch, so it is removed on its own. The password is the one the owner sets for the
 *  family's parent (at least 8 characters); it is never returned, logged or stored (only its bcrypt hash). */
export async function runFamilySeed(password: string, now = new Date()): Promise<{ batch: string; counts: Record<string, number>; total: number; parentEmail: string; children: string[] }> {
  if (typeof password !== 'string' || password.length < 8) throw new SeedRefused('password (at least 8 characters) is required; nothing was created');
  const { buildFamilyPlan, FAMILY_BATCH, FAMILY_PARENT_EMAIL } = await import('./familyPlan');
  const hash = await bcrypt.hash(password, 10);
  const built = buildFamilyPlan(now);
  const { byCollection, problems } = preparePlan(now, hash, undefined, built);
  if (problems.length) throw new SeedRefused(`The plan has ${problems.length} invalid documents; nothing was written. First: ${problems.slice(0, 5).join(' | ')}`);
  const registry = mongoose.connection.collection(REGISTRY);
  const counts: Record<string, number> = {};
  for (const [coll, { model, rows }] of byCollection) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await registry.bulkWrite(chunk.map((r) => ({ updateOne: { filter: { _id: `${coll}:${String(r._id)}` as any }, update: { $setOnInsert: { collection: coll, ref: r._id, batch: FAMILY_BATCH, createdAt: new Date() } }, upsert: true } })), { ordered: false });
      await model.collection.bulkWrite(chunk.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } })), { ordered: false });
    }
    counts[coll] = rows.length;
  }
  for (const d of built.docs) if (d.model === 'Institution') forgetFeatureFlags(String(d.doc.id));
  const kids = built.docs.filter((d) => d.model === 'Student' && String(d.doc.name).endsWith(' Hassan') && ['Youssef', 'Laila', 'Omar'].includes(String(d.doc.name).split(' ')[0])).map((d) => `${d.doc.name} (${d.doc.grade})`);
  return { batch: FAMILY_BATCH, counts, total: built.docs.length, parentEmail: FAMILY_PARENT_EMAIL, children: kids };
}
