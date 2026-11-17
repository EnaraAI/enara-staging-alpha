import crypto from 'crypto';
import { AuditEvent } from '../models/AuditEvent';
import { Batch } from '../models/Batch';
import { ClassEnrollment, type EnrollmentScope } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { studentsWithoutActiveGroup, type UnplacedReason } from './archive';

// Multi-class step 3: backfill class_enrollments from the old fields
// (Student.batchId -> 'group' rows, CourseInstance.studentIds -> 'class' rows).
//
// planBackfill() only READS and returns a report (IDs and counts, never names
// or emails). applyBackfill() writes the plan: it creates missing rows (marked
// migratedFrom, so undoBackfill() removes exactly them) and reactivates rows
// the old fields say are active. It never ends or deletes a row the old fields
// do not mention: those are reported as conflicts for a human decision.
//
// Step 6 extras (STEP_6_NOTES.md, "Consistency check"): an active row the old
// fields can't express is NOT a conflict when the multi-class service made it
// (an extra group or class): rows marked extraVia 'multi_class', or, for rows
// written before the marker existed, rows with a 'student_membership_added'
// audit event for the same student, scope and target in the same school.
// Extras are validated (target exists, same school as the student, not
// archived; student exists and is not archived) and reported under
// extraMemberships; an invalid extra makes inSync false.

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
    /** Active enrollment rows the old fields do not contain (and that are not step 6 extras). Never changed by the backfill. */
    activeNotInOldFields: Listed<{ studentId: string; scope: EnrollmentScope; targetId: string }>;
  };
  /**
   * Step 6: active extra memberships made by the multi-class service (extra
   * groups, enrollment-only classes). Valid ones are expected; invalid ones
   * (by reason) make inSync false. legacyUnmarked counts the extras recognised
   * by the audit trail because they predate the extraVia marker.
   */
  extraMemberships: {
    valid: number;
    invalid: Listed<{ studentId: string; scope: EnrollmentScope; targetId: string; reason: ExtraInvalidReason }> & Record<ExtraInvalidReason, number>;
    legacyUnmarked: number;
  };
  /**
   * Step 6 (PLAN §10): active (not archived) students with no active group,
   * by reason (group deleted, group archived, group in another school, never
   * in a group). Information only: it never affects inSync. IDs only.
   */
  studentsWithoutActiveGroup: Listed<{ studentId: string; reason: UnplacedReason; groupId?: string }> & { byReason: Partial<Record<UnplacedReason, number>> };
  /** True when nothing would be created or reactivated, there are no conflicts and no invalid extras. */
  inSync: boolean;
}

interface Plan {
  report: BackfillReport;
  create: Want[];
  reactivate: { studentId: string; scope: EnrollmentScope; targetId: string }[];
}

const key = (studentId: string, scope: string, targetId: string) => `${studentId}|${scope}|${targetId}`;

export const EXTRA_INVALID_REASONS = ['targetMissing', 'studentInactive', 'otherSchool', 'targetArchived'] as const;
export type ExtraInvalidReason = (typeof EXTRA_INVALID_REASONS)[number];
type Row = { studentId: string; scope: EnrollmentScope; targetId: string; institutionId: string; extraVia?: string };

/**
 * Splits active rows the old fields don't contain into step 6 extras and real
 * conflicts, and validates the extras. Reads nothing when there are no rows.
 */
async function classifyNotInOldFields(rows: Row[], batches: Map<string, { institutionId?: string; archivedAt?: Date | null }>) {
  const extras: Row[] = [];
  const conflicts: Row[] = [];
  let legacyUnmarked = 0;
  const unmarked = rows.filter((r) => r.extraVia !== 'multi_class');
  // Rows from before the marker: the multi-class service audits every add
  // (student_membership_added, IDs only). createdBy/source can't tell them
  // apart: the dual write also writes source 'manual' with the acting admin.
  const audited = new Set<string>();
  if (unmarked.length) {
    const events = await AuditEvent.find({ action: 'student_membership_added', targetType: 'student', targetId: { $in: [...new Set(unmarked.map((r) => r.studentId))] } })
      .select('institutionId targetId detail')
      .lean();
    for (const e of events) {
      const d = (e.detail ?? {}) as { scope?: string; targetId?: string };
      if (e.targetId && d.scope && d.targetId) audited.add(`${e.institutionId}|${key(e.targetId, d.scope, d.targetId)}`);
    }
  }
  for (const r of rows) {
    if (r.extraVia === 'multi_class') extras.push(r);
    else if (audited.has(`${r.institutionId}|${key(r.studentId, r.scope, r.targetId)}`)) {
      extras.push(r);
      legacyUnmarked += 1;
    } else conflicts.push(r);
  }

  const invalid: { studentId: string; scope: EnrollmentScope; targetId: string; reason: ExtraInvalidReason }[] = [];
  if (extras.length) {
    const students = new Map(
      (await Student.find({ id: { $in: [...new Set(extras.map((r) => r.studentId))] } }).select('id institutionId archivedAt').lean()).map((s) => [s.id, s]),
    );
    const classIds = [...new Set(extras.filter((r) => r.scope === 'class').map((r) => r.targetId))];
    const classes = new Map(
      (classIds.length ? await CourseInstance.find({ id: { $in: classIds } }).select('id institutionId archivedAt visibility').lean() : []).map((c) => [c.id, c]),
    );
    for (const r of extras) {
      const target = r.scope === 'group' ? batches.get(r.targetId) : classes.get(r.targetId);
      const student = students.get(r.studentId);
      const archived = !!target && (!!target.archivedAt || (r.scope === 'class' && (target as { visibility?: string }).visibility === 'archived'));
      const reason: ExtraInvalidReason | null = !target
        ? 'targetMissing'
        : !student || student.archivedAt
          ? 'studentInactive'
          : target.institutionId !== student.institutionId || r.institutionId !== student.institutionId
            ? 'otherSchool'
            : archived
              ? 'targetArchived'
              : null;
      if (reason) invalid.push({ studentId: r.studentId, scope: r.scope, targetId: r.targetId, reason });
    }
  }
  const byReason = Object.fromEntries(EXTRA_INVALID_REASONS.map((k) => [k, invalid.filter((i) => i.reason === k).length])) as Record<ExtraInvalidReason, number>;
  return {
    conflicts,
    extraMemberships: { valid: extras.length - invalid.length, invalid: { ...listed(invalid), ...byReason }, legacyUnmarked },
  };
}

async function buildPlan(institutionId?: string): Promise<Plan> {
  const scopeFilter = institutionId ? { institutionId } : {};
  const students = await Student.find(scopeFilter).select('id institutionId batchId').lean();
  const classes = await CourseInstance.find(scopeFilter).select('id institutionId studentIds').lean();
  // Lookups are global (not school-scoped) so cross-school references are detected.
  const batchRows = await Batch.find({}).select('id institutionId archivedAt').lean();
  const allBatches = new Map(batchRows.map((b) => [b.id, b.institutionId]));
  const memberIds = [...new Set(classes.flatMap((c) => c.studentIds || []))];
  const studentSchool = new Map(
    (await Student.find({ id: { $in: [...new Set([...memberIds, ...students.map((s) => s.id)])] } }).select('id institutionId').lean()).map((s) => [s.id, s.institutionId]),
  );
  const existing = await ClassEnrollment.find(scopeFilter).select('studentId scope targetId status institutionId extraVia').lean();
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
  const notInOldFields = existing.filter(
    (e) => e.status === 'active' && !wanted.has(key(e.studentId, e.scope, e.targetId)) && !deletedGroupKeys.has(key(e.studentId, e.scope, e.targetId)),
  );
  const { conflicts, extraMemberships } = await classifyNotInOldFields(notInOldFields, new Map(batchRows.map((b) => [b.id, b])));
  const activeNotInOldFields = conflicts.map((e) => ({ studentId: e.studentId, scope: e.scope, targetId: e.targetId }));

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
    extraMemberships,
    studentsWithoutActiveGroup: unplacedReport(await studentsWithoutActiveGroup({ institutionId })),
    inSync: create.length === 0 && reactivate.length === 0 && activeNotInOldFields.length === 0 && extraMemberships.invalid.count === 0,
  };
  return { report, create, reactivate };
}

function unplacedReport(items: Awaited<ReturnType<typeof studentsWithoutActiveGroup>>): BackfillReport['studentsWithoutActiveGroup'] {
  const byReason: Partial<Record<UnplacedReason, number>> = {};
  for (const i of items) byReason[i.reason] = (byReason[i.reason] ?? 0) + 1;
  return { ...listed(items.map((i) => ({ studentId: i.studentId, reason: i.reason, ...(i.groupId ? { groupId: i.groupId } : {}) }))), byReason };
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
