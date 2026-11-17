import crypto from 'crypto';
import { Batch } from '../models/Batch';
import { ClassEnrollment, type EnrollmentScope } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';

// Multi-class step 3: backfill class_enrollments from the old fields
// (Student.batchId -> 'group' rows, CourseInstance.studentIds -> 'class' rows).
//
// planBackfill() only READS and returns a report (IDs and counts, never names
// or emails). applyBackfill() writes the plan: it creates missing rows (marked
// migratedFrom, so undoBackfill() removes exactly them) and reactivates rows
// the old fields say are active. It never ends or deletes a row the old fields
// do not mention: those are reported as conflicts for a human decision.

const LIST_CAP = 200;

interface Want {
  institutionId: string;
  studentId: string;
  scope: EnrollmentScope;
  targetId: string;
  migratedFrom: 'student.batchId' | 'courseInstance.studentIds';
}

type Listed<T> = { count: number; items: T[] };
const listed = <T>(items: T[]): Listed<T> => ({ count: items.length, items: items.slice(0, LIST_CAP) });

export interface BackfillReport {
  scope: { institutionId: string | 'all' };
  totals: {
    students: number;
    studentsWithGroup: number;
    classes: number;
    classMemberEntries: number;
    existingEnrollments: { active: number; inactive: number; removed: number };
  };
  wouldCreate: { group: number; class: number };
  alreadyMatching: { group: number; class: number };
  /** Active group rows for students whose old batchId points at a deleted group: both sides agree. */
  alreadyMatchingDeletedGroup: number;
  wouldReactivate: Listed<{ studentId: string; scope: EnrollmentScope; targetId: string; status: string }>;
  doesNotFit: {
    studentWithoutSchool: Listed<{ studentId: string; groupId?: string }>;
    groupMissing: Listed<{ studentId: string; groupId: string }>;
    groupInOtherSchool: Listed<{ studentId: string; groupId: string }>;
    classWithoutSchool: Listed<{ classId: string; members: number }>;
    classMemberMissing: Listed<{ classId: string; studentId: string }>;
    classMemberInOtherSchool: Listed<{ classId: string; studentId: string }>;
    duplicateClassMember: Listed<{ classId: string; studentId: string }>;
  };
  conflicts: {
    /** Active enrollment rows the old fields do not contain. Never changed by the backfill. */
    activeNotInOldFields: Listed<{ studentId: string; scope: EnrollmentScope; targetId: string }>;
  };
  /** True when nothing would be created or reactivated and there are no conflicts. */
  inSync: boolean;
}

interface Plan {
  report: BackfillReport;
  create: Want[];
  reactivate: { studentId: string; scope: EnrollmentScope; targetId: string }[];
}

const key = (studentId: string, scope: string, targetId: string) => `${studentId}|${scope}|${targetId}`;

async function buildPlan(institutionId?: string): Promise<Plan> {
  const scopeFilter = institutionId ? { institutionId } : {};
  const students = await Student.find(scopeFilter).select('id institutionId batchId').lean();
  const classes = await CourseInstance.find(scopeFilter).select('id institutionId studentIds').lean();
  // Lookups are global (not school-scoped) so cross-school references are detected.
  const allBatches = new Map((await Batch.find({}).select('id institutionId').lean()).map((b) => [b.id, b.institutionId]));
  const memberIds = [...new Set(classes.flatMap((c) => c.studentIds || []))];
  const studentSchool = new Map(
    (await Student.find({ id: { $in: [...new Set([...memberIds, ...students.map((s) => s.id)])] } }).select('id institutionId').lean()).map((s) => [s.id, s.institutionId]),
  );
  const existing = await ClassEnrollment.find(scopeFilter).select('studentId scope targetId status').lean();
  const existingByKey = new Map(existing.map((e) => [key(e.studentId, e.scope, e.targetId), e]));

  const dnf = {
    studentWithoutSchool: [] as { studentId: string; groupId?: string }[],
    groupMissing: [] as { studentId: string; groupId: string }[],
    groupInOtherSchool: [] as { studentId: string; groupId: string }[],
    classWithoutSchool: [] as { classId: string; members: number }[],
    classMemberMissing: [] as { classId: string; studentId: string }[],
    classMemberInOtherSchool: [] as { classId: string; studentId: string }[],
    duplicateClassMember: [] as { classId: string; studentId: string }[],
  };
  const wants: Want[] = [];
  const deletedGroupKeys = new Set<string>();

  for (const s of students) {
    if (!s.institutionId) {
      dnf.studentWithoutSchool.push({ studentId: s.id, ...(s.batchId ? { groupId: s.batchId } : {}) });
      continue;
    }
    if (!s.batchId) continue;
    if (!allBatches.has(s.batchId)) {
      // The group was deleted but the student still points at it (deleting a
      // group never cleared Student.batchId). The backfill doesn't create a row
      // for it, but an active row written by the dual write agrees with the
      // old field, so it is not a conflict (see deletedGroupMatching below).
      dnf.groupMissing.push({ studentId: s.id, groupId: s.batchId });
      deletedGroupKeys.add(key(s.id, 'group', s.batchId));
    }
    else if (allBatches.get(s.batchId) !== s.institutionId) dnf.groupInOtherSchool.push({ studentId: s.id, groupId: s.batchId });
    else wants.push({ institutionId: s.institutionId, studentId: s.id, scope: 'group', targetId: s.batchId, migratedFrom: 'student.batchId' });
  }

  let classMemberEntries = 0;
  for (const c of classes) {
    const ids = c.studentIds || [];
    classMemberEntries += ids.length;
    if (!c.institutionId) {
      if (ids.length) dnf.classWithoutSchool.push({ classId: c.id, members: ids.length });
      continue;
    }
    const seen = new Set<string>();
    for (const sid of ids) {
      if (seen.has(sid)) {
        dnf.duplicateClassMember.push({ classId: c.id, studentId: sid });
        continue;
      }
      seen.add(sid);
      if (!studentSchool.has(sid)) dnf.classMemberMissing.push({ classId: c.id, studentId: sid });
      else if (studentSchool.get(sid) !== c.institutionId) dnf.classMemberInOtherSchool.push({ classId: c.id, studentId: sid });
      else wants.push({ institutionId: c.institutionId, studentId: sid, scope: 'class', targetId: c.id, migratedFrom: 'courseInstance.studentIds' });
    }
  }

  const create: Want[] = [];
  const reactivate: Plan['reactivate'] = [];
  const reactivateListed: BackfillReport['wouldReactivate']['items'] = [];
  const matching = { group: 0, class: 0 };
  const wanted = new Set<string>();
  for (const w of wants) {
    const k = key(w.studentId, w.scope, w.targetId);
    wanted.add(k);
    const e = existingByKey.get(k);
    if (!e) create.push(w);
    else if (e.status === 'active') matching[w.scope] += 1;
    else {
      reactivate.push({ studentId: w.studentId, scope: w.scope, targetId: w.targetId });
      reactivateListed.push({ studentId: w.studentId, scope: w.scope, targetId: w.targetId, status: e.status });
    }
  }
  const deletedGroupMatching = existing.filter((e) => e.status === 'active' && deletedGroupKeys.has(key(e.studentId, e.scope, e.targetId))).length;
  const activeNotInOldFields = existing
    .filter((e) => e.status === 'active' && !wanted.has(key(e.studentId, e.scope, e.targetId)) && !deletedGroupKeys.has(key(e.studentId, e.scope, e.targetId)))
    .map((e) => ({ studentId: e.studentId, scope: e.scope, targetId: e.targetId }));

  const report: BackfillReport = {
    scope: { institutionId: institutionId ?? 'all' },
    totals: {
      students: students.length,
      studentsWithGroup: students.filter((s) => s.batchId).length,
      classes: classes.length,
      classMemberEntries,
      existingEnrollments: {
        active: existing.filter((e) => e.status === 'active').length,
        inactive: existing.filter((e) => e.status === 'inactive').length,
        removed: existing.filter((e) => e.status === 'removed').length,
      },
    },
    wouldCreate: { group: create.filter((w) => w.scope === 'group').length, class: create.filter((w) => w.scope === 'class').length },
    alreadyMatching: matching,
    alreadyMatchingDeletedGroup: deletedGroupMatching,
    wouldReactivate: listed(reactivateListed),
    doesNotFit: {
      studentWithoutSchool: listed(dnf.studentWithoutSchool),
      groupMissing: listed(dnf.groupMissing),
      groupInOtherSchool: listed(dnf.groupInOtherSchool),
      classWithoutSchool: listed(dnf.classWithoutSchool),
      classMemberMissing: listed(dnf.classMemberMissing),
      classMemberInOtherSchool: listed(dnf.classMemberInOtherSchool),
      duplicateClassMember: listed(dnf.duplicateClassMember),
    },
    conflicts: { activeNotInOldFields: listed(activeNotInOldFields) },
    inSync: create.length === 0 && reactivate.length === 0 && activeNotInOldFields.length === 0,
  };
  return { report, create, reactivate };
}

/** Dry run: reads only, writes nothing. */
export async function planBackfill(opts: { institutionId?: string } = {}): Promise<BackfillReport> {
  return (await buildPlan(opts.institutionId)).report;
}

/** Applies the plan. Idempotent: a second run creates and reactivates nothing. */
export async function applyBackfill(opts: { institutionId?: string } = {}): Promise<{ created: number; reactivated: number; report: BackfillReport }> {
  const { report, create, reactivate } = await buildPlan(opts.institutionId);
  const now = new Date();
  let created = 0;
  for (let i = 0; i < create.length; i += 500) {
    const chunk = create.slice(i, i + 500);
    const res = await ClassEnrollment.bulkWrite(
      chunk.map((w) => ({
        updateOne: {
          filter: { studentId: w.studentId, scope: w.scope, targetId: w.targetId },
          update: {
            $setOnInsert: {
              id: `enr_${crypto.randomUUID().replace(/-/g, '')}`,
              institutionId: w.institutionId,
              role: 'learner',
              status: 'active',
              source: 'manual',
              migratedFrom: w.migratedFrom,
              startedAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    created += res.upsertedCount;
  }
  let reactivated = 0;
  for (const r of reactivate) {
    const res = await ClassEnrollment.updateOne(
      { ...r, status: { $ne: 'active' } },
      { $set: { status: 'active', startedAt: now }, $unset: { endedAt: 1, endedBy: 1 } },
    );
    reactivated += res.modifiedCount;
  }
  return { created, reactivated, report };
}

/** Undo: deletes exactly the rows the backfill created (migratedFrom set). */
export async function undoBackfill(opts: { institutionId?: string } = {}): Promise<{ deleted: number }> {
  const res = await ClassEnrollment.deleteMany({ migratedFrom: { $exists: true }, ...(opts.institutionId ? { institutionId: opts.institutionId } : {}) });
  return { deleted: res.deletedCount };
}
