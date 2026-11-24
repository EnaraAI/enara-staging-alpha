import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { Student } from '../models/Student';
import { Batch } from '../models/Batch';
import { logger, serializeError } from '../utils/logging';
import { ParentNotification, SchoolAnnouncement } from './models';
import { sectionOn, newId } from './sections';
import { announcementIsFor } from './audience';
import { norm } from './importSpec';
import { emailSchoolNotices, type NoticeDoc } from './emails';

// Parents school app (a): in-app notifications. Created only when the school's "notifications" section is on, for parents with an
// ACTIVE link to the child. Never fails an import (errors are logged). Step a4: each new notification is also emailed (emails.ts: the parent's own setting; never twice).
async function activeParents(studentIds: string[]) {
  if (!studentIds.length) return new Map<string, string[]>();
  const links = await ParentLearnerLink.find({ studentId: { $in: studentIds }, status: 'active' }).select('parentUserId studentId').lean();
  const m = new Map<string, string[]>(); for (const l of links) m.set(l.studentId, [...(m.get(l.studentId) ?? []), l.parentUserId]);
  return m;
}
async function insertQuietly(docs: Record<string, unknown>[]) {
  if (!docs.length) return;
  try { await ParentNotification.insertMany(docs, { ordered: false }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; } // duplicates = already notified
}

export async function notifyAbsences(institutionId: string, rows: { studentId: string; date: string; status: string; id: string }[]) {
  try {
    if (!rows.length || !(await sectionOn(institutionId, 'notifications'))) return;
    const parents = await activeParents([...new Set(rows.map((r) => r.studentId))]);
    const names = new Map((await Student.find({ id: { $in: [...parents.keys()] } }).select('id name').lean()).map((s) => [s.id, String(s.name || '').split(/\s+/)[0]]));
    const docs = rows.flatMap((r) => (parents.get(r.studentId) ?? []).map((p) => ({
      id: newId('pn'), parentUserId: p, studentId: r.studentId, institutionId, kind: r.status === 'late' ? 'late' : 'absence', refId: `${r.id}:${r.status}`, date: r.date,
      title: r.status === 'late' ? `${names.get(r.studentId) ?? 'Your child'} was late on ${r.date}` : `${names.get(r.studentId) ?? 'Your child'} was absent on ${r.date}`,
      body: 'From the school attendance register.',
    })));
    await insertQuietly(docs);
    await emailSchoolNotices(docs as unknown as NoticeDoc[]);
  } catch (error) { logger.error('school_app_notify_absences_failed', { error: serializeError(error) }); }
}

export async function notifyAnnouncements(institutionId: string, announcementIds: string[]) {
  try {
    if (!announcementIds.length || !(await sectionOn(institutionId, 'notifications'))) return;
    const anns = await SchoolAnnouncement.find({ id: { $in: announcementIds }, institutionId }).lean();
    const students = await Student.find({ institutionId, archivedAt: { $exists: false } }).select('id grade batchId').lean();
    const groups = new Map((await Batch.find({ institutionId }).select('id name').lean()).map((g) => [g.id, norm(g.name)]));
    const parents = await activeParents(students.map((s) => s.id));
    const docs: Record<string, unknown>[] = [];
    for (const a of anns) for (const s of students) {
      if (!announcementIsFor(a, { id: s.id, grade: s.grade || undefined, groupKey: s.batchId ? groups.get(s.batchId) : undefined })) continue;
      for (const p of parents.get(s.id) ?? []) docs.push({ id: newId('pn'), parentUserId: p, studentId: s.id, institutionId, kind: 'announcement', refId: `${a.id}:${s.id}`, title: a.title, body: a.body.slice(0, 280) });
    }
    await insertQuietly(docs);
    await emailSchoolNotices(docs as unknown as NoticeDoc[]);
  } catch (error) { logger.error('school_app_notify_announcements_failed', { error: serializeError(error) }); }
}
