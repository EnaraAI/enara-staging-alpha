import { AppError } from '../middleware/errorHandler';
import { Batch } from '../models/Batch';
import { Student } from '../models/Student';
import { recordAudit } from '../services/auditTrail';
import { parseCsv } from '../parents/csvInvites';
import { SchoolAnnouncement, SchoolBusAssignment, SchoolBusRoute, SchoolDailyAttendance, SchoolImport, SchoolInstalment, SchoolTimetableEntry, type Source } from './models';
import { COLUMNS, MAX_ROWS, SECTION_OF, checkRow, mapHeaders, norm, type ImportSection } from './importSpec';
import { sectionOn, newId } from './sections';
import { notifyAbsences, notifyAnnouncements } from './notifications';

// Parents school app: import with preview, confirm and undo (24 h). Excel/CSV is the first source; a connector to a school system
// (the client's LMS for timetable, attendance and announcements; another system for fees and buses) calls ingest() with the same
// row objects and gets the same checks and the same writes, with source.kind = 'connector'.
type Actor = { id: string; role: string; institutionId?: string };
const UNDO_MS = 24 * 3600_000;
export const IMPORT_SECTIONS: ImportSection[] = ['timetable', 'attendance', 'announcements', 'fees', 'bus_routes', 'bus_assignments'];
const isImportSection = (x: unknown): x is ImportSection => typeof x === 'string' && (IMPORT_SECTIONS as string[]).includes(x);

function scopeOf(actor: Actor, institutionId?: string): string {
  const id = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  if (actor.role !== 'enara-admin' && actor.role !== 'admin') throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
}

/** Rows from CSV text (first row = headers), with header problems. */
export function rowsFromCsv(section: ImportSection, text: string): { rows: Record<string, string>[]; missing: string[] } {
  const grid = parseCsv(text.replace(/^﻿/, ''));
  if (!grid.length) return { rows: [], missing: COLUMNS[section].filter((c) => c.required).map((c) => c.key) };
  const { map, missing } = mapHeaders(section, grid[0]);
  const rows = grid.slice(1).map((cells) => { const r: Record<string, string> = {}; map.forEach((k, i) => { if (k) r[k] = (cells[i] ?? '').trim(); }); return r; });
  return { rows, missing };
}

/** Field checks + database matching (students, classes). Never writes. */
async function resolve(section: ImportSection, institutionId: string, raw: Record<string, string>[]) {
  const problems: { row: number; message: string }[] = []; const good: Record<string, string>[] = [];
  const students = await Student.find({ institutionId }).select('id email name grade batchId').lean();
  const byId = new Map(students.map((s) => [norm(s.id), s])), byEmail = new Map(students.filter((s) => s.email).map((s) => [norm(s.email), s]));
  const byName = new Map<string, typeof students>(); for (const s of students) { const k = norm(s.name); byName.set(k, [...(byName.get(k) ?? []), s]); }
  const groups = await Batch.find({ institutionId, archivedAt: { $exists: false } }).select('id name').lean();
  const groupByKey = new Map(groups.map((g) => [norm(g.name), g]));
  const busRoutes = new Map<string, { routeKey: string; routeName: string; stops: { name: string }[] }>(section === 'bus_assignments' ? (await SchoolBusRoute.find({ institutionId }).lean()).map((r) => [r.routeKey, r]) : []);
  const findStudent = (v: string) => byId.get(norm(v)) ?? byEmail.get(norm(v)) ?? ((byName.get(norm(v)) ?? []).length === 1 ? byName.get(norm(v))![0] : undefined);
  raw.forEach((r, i) => {
    const line = i + 2; // row 1 = headers
    const c = checkRow(section, r);
    if (!c.row) { problems.push({ row: line, message: c.problems.join('; ') }); return; }
    const row = c.row;
    if (section === 'timetable') {
      const g = groupByKey.get(norm(row.class));
      if (!g) { problems.push({ row: line, message: `class "${row.class}" is not a class of this school in ENARA` }); return; }
      row.groupKey = norm(g.name); row.groupName = g.name;
    } else if (section === 'bus_assignments') {
      const s = findStudent(row.student);
      if (!s) { problems.push({ row: line, message: `student "${row.student}" not found in this school` }); return; }
      row.studentId = s.id;
      const route = busRoutes.get(norm(row.route));
      if (!route) { problems.push({ row: line, message: `route "${row.route}" is not a route of this school (import the routes sheet first)` }); return; }
      const stop = route.stops.find((x) => norm(x.name) === norm(row.stop));
      if (!stop) { problems.push({ row: line, message: `stop "${row.stop}" is not on route "${route.routeName}"` }); return; }
      row.routeKey = route.routeKey; row.stop = stop.name;
    } else if (section === 'attendance' || section === 'fees') {
      const s = findStudent(row.student);
      if (!s) { problems.push({ row: line, message: (byName.get(norm(row.student)) ?? []).length > 1 ? `two students are called "${row.student}"; use the student ID` : `student "${row.student}" not found in this school` }); return; }
      row.studentId = s.id;
    } else if (section === 'announcements') {
      if (row.audience === 'group') { const g = groupByKey.get(norm(row.audience_value)); if (!g) { problems.push({ row: line, message: `class "${row.audience_value}" is not a class of this school` }); return; } row.audience_value = g.name; }
      if (row.audience === 'student') { const s = findStudent(row.audience_value); if (!s) { problems.push({ row: line, message: `student "${row.audience_value}" not found in this school` }); return; } row.audience_value = s.id; }
      if (row.audience === 'grade' && !students.some((s) => norm(s.grade) === norm(row.audience_value))) { problems.push({ row: line, message: `no student of this school is in grade "${row.audience_value}"` }); return; }
    }
    good.push(row);
  });
  return { good, problems };
}

/** Counts of what a confirm would do: new, changed, unchanged (and for the timetable, rows it would remove). */
async function diff(section: ImportSection, institutionId: string, rows: Record<string, string>[]) {
  const counts: Record<string, number> = { new: 0, changed: 0, unchanged: 0, removed: 0 };
  if (section === 'announcements') { counts.new = rows.length; return counts; }
  if (section === 'bus_routes') {
    const keys = [...new Set(rows.map((r) => norm(r.route)))];
    const existing = new Set((await SchoolBusRoute.find({ institutionId, routeKey: { $in: keys } }).select('routeKey').lean()).map((r) => r.routeKey));
    for (const k of keys) { if (existing.has(k)) counts.changed++; else counts.new++; }
    return counts;
  }
  if (section === 'bus_assignments') {
    const existing = new Set((await SchoolBusAssignment.find({ institutionId, studentId: { $in: [...new Set(rows.map((r) => r.studentId))] } }).select('studentId direction').lean()).map((a) => `${a.studentId}|${a.direction}`));
    for (const r of rows) { if (existing.has(`${r.studentId}|${r.direction}`)) counts.changed++; else counts.new++; }
    return counts;
  }
  if (section === 'fees') {
    const existing = await SchoolInstalment.find({ institutionId, studentId: { $in: [...new Set(rows.map((r) => r.studentId))] } }).lean();
    const ex = new Map(existing.map((e) => [`${e.studentId}|${e.planKey}|${e.number}`, e]));
    for (const r of rows) {
      const e = ex.get(`${r.studentId}|${norm(r.plan)}|${r.number}`);
      if (!e) counts.new++; else if (e.amount === Number(r.amount) && e.dueDate === r.due_date && e.status === r.status && (e.paidDate ?? '') === (r.paid_date ?? '') && (e.receiptRef ?? '') === (r.receipt_ref ?? '')) counts.unchanged++; else counts.changed++;
    }
    return counts;
  }
  if (section === 'timetable') {
    const keys = [...new Set(rows.map((r) => r.groupKey))];
    const existing = await SchoolTimetableEntry.find({ institutionId, groupKey: { $in: keys } }).lean();
    const ex = new Map(existing.map((e) => [`${e.groupKey}|${e.day}|${e.period}`, e]));
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.groupKey}|${r.day}|${r.period}`; seen.add(k); const e = ex.get(k);
      if (!e) counts.new++; else if (e.start === r.start && e.end === r.end && e.subject === r.subject && (e.teacher ?? '') === (r.teacher ?? '') && (e.room ?? '') === (r.room ?? '')) counts.unchanged++; else counts.changed++;
    }
    counts.removed = existing.filter((e) => !seen.has(`${e.groupKey}|${e.day}|${e.period}`)).length;
    return counts;
  }
  const existing = await SchoolDailyAttendance.find({ institutionId, studentId: { $in: [...new Set(rows.map((r) => r.studentId))] }, date: { $in: [...new Set(rows.map((r) => r.date))] } }).lean();
  const ex = new Map(existing.map((e) => [`${e.studentId}|${e.date}|${e.period ?? ''}`, e]));
  for (const r of rows) { const e = ex.get(`${r.studentId}|${r.date}|${r.period ?? ''}`); if (!e) counts.new++; else if (e.status === r.status && (e.note ?? '') === (r.note ?? '')) counts.unchanged++; else counts.changed++; }
  return counts;
}

/** Step 1: check and preview. Nothing is written except the preview itself. */
export async function previewImport(actor: Actor, body: { section?: unknown; csv?: unknown; fileName?: unknown; institutionId?: unknown }) {
  const institutionId = scopeOf(actor, typeof body.institutionId === 'string' ? body.institutionId : undefined);
  if (!isImportSection(body.section)) throw new AppError('section must be timetable, attendance, announcements, fees, bus_routes or bus_assignments', 400, 'VALIDATION_ERROR');
  if (!(await sectionOn(institutionId, SECTION_OF[body.section]))) throw new AppError(`The ${SECTION_OF[body.section]} section is off for this school`, 409, 'SECTION_OFF');
  if (typeof body.csv !== 'string' || !body.csv.trim()) throw new AppError('Upload a CSV file (Excel: Save as CSV UTF-8)', 400, 'VALIDATION_ERROR');
  if (body.csv.length > 3_000_000) throw new AppError('File too large (max 3 MB)', 413, 'TOO_LARGE');
  const { rows, missing } = rowsFromCsv(body.section, body.csv);
  if (missing.length) throw new AppError(`Missing columns: ${missing.join(', ')}`, 400, 'MISSING_COLUMNS');
  if (rows.length > MAX_ROWS) throw new AppError(`Too many rows (max ${MAX_ROWS})`, 413, 'TOO_MANY_ROWS');
  const { good, problems } = await resolve(body.section, institutionId, rows);
  const counts = { ...(await diff(body.section, institutionId, good)), rejected: problems.length, total: rows.length };
  const imp = await SchoolImport.create({ id: newId('simp'), institutionId, section: body.section, fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : undefined,
    status: 'preview', rows: good, counts, problems: problems.slice(0, 500), createdBy: actor.id });
  return { importId: imp.id, section: body.section, counts, problems: problems.slice(0, 200), sample: good.slice(0, 20) };
}

/** Step 2: confirm a preview (only the good rows are written). */
export async function confirmImport(actor: Actor, importId: string) {
  const imp = await SchoolImport.findOne({ id: importId });
  if (!imp || imp.institutionId !== scopeOf(actor, imp?.institutionId)) throw new AppError('Import not found', 404, 'NOT_FOUND');
  if (imp.status !== 'preview') throw new AppError(`This import is already ${imp.status}`, 409, 'CONFLICT');
  if (Date.now() - new Date(imp.get('createdAt')).getTime() > UNDO_MS) { imp.status = 'expired'; await imp.save(); throw new AppError('This preview has expired; upload the file again', 409, 'EXPIRED'); }
  const section = imp.section as ImportSection;
  const written = await write(section, imp.institutionId, imp.rows, { kind: 'import', ref: imp.id, at: new Date() });
  imp.status = 'confirmed'; imp.confirmedBy = actor.id; imp.confirmedAt = new Date(); imp.written = written; imp.markModified('written');
  await imp.save();
  await recordAudit('school_app_import_confirmed', actor, { institutionId: imp.institutionId, type: 'school_import', id: imp.id }, { section, rows: imp.rows.length, counts: imp.counts });
  return { importId: imp.id, section, written: { inserted: written.inserted.length, replaced: written.replaced.length } };
}

/** Undo a confirmed import within 24 h: remove what it inserted and put back what it replaced or removed. */
export async function undoImport(actor: Actor, importId: string) {
  const imp = await SchoolImport.findOne({ id: importId });
  if (!imp || imp.institutionId !== scopeOf(actor, imp?.institutionId)) throw new AppError('Import not found', 404, 'NOT_FOUND');
  if (imp.status !== 'confirmed') throw new AppError('Only a confirmed import can be undone', 409, 'CONFLICT');
  if (!imp.confirmedAt || Date.now() - imp.confirmedAt.getTime() > UNDO_MS) throw new AppError('Undo is possible for 24 hours only', 409, 'EXPIRED');
  const M = modelOf(imp.section as ImportSection) as unknown as { deleteMany: (q: object) => Promise<unknown>; replaceOne: (q: object, d: object, o: object) => Promise<unknown> };
  await M.deleteMany({ id: { $in: imp.written?.inserted ?? [] }, institutionId: imp.institutionId });
  for (const prev of imp.written?.replaced ?? []) { const { _id, __v, ...doc } = prev as Record<string, unknown>; void _id; void __v; await M.replaceOne({ id: doc.id, institutionId: imp.institutionId }, doc, { upsert: true }); }
  imp.status = 'undone'; imp.undoneAt = new Date(); await imp.save();
  await recordAudit('school_app_import_undone', actor, { institutionId: imp.institutionId, type: 'school_import', id: imp.id }, { section: imp.section });
  return { importId: imp.id, status: 'undone' };
}

export async function listImports(actor: Actor, institutionId?: string) {
  const id = scopeOf(actor, institutionId);
  const rows = await SchoolImport.find({ institutionId: id }).sort({ createdAt: -1 }).limit(50).select('id section fileName status counts createdAt confirmedAt undoneAt').lean();
  return { imports: rows.map((r) => ({ ...r, canUndo: r.status === 'confirmed' && !!r.confirmedAt && Date.now() - new Date(r.confirmedAt).getTime() < UNDO_MS })) };
}

/** Connector entry point (no preview): same checks, same writes, source.kind = 'connector'. Returns what it wrote and the problems. */
export async function ingest(section: ImportSection, institutionId: string, raw: Record<string, string>[], connectorRef: string) {
  if (!(await sectionOn(institutionId, SECTION_OF[section]))) throw new AppError(`The ${SECTION_OF[section]} section is off for this school`, 409, 'SECTION_OFF');
  const { good, problems } = await resolve(section, institutionId, raw);
  const written = await write(section, institutionId, good, { kind: 'connector', ref: connectorRef, at: new Date() });
  return { inserted: written.inserted.length, replaced: written.replaced.length, problems };
}

function modelOf(section: ImportSection) {
  return section === 'timetable' ? SchoolTimetableEntry : section === 'attendance' ? SchoolDailyAttendance : section === 'fees' ? SchoolInstalment : section === 'bus_routes' ? SchoolBusRoute : section === 'bus_assignments' ? SchoolBusAssignment : SchoolAnnouncement;
}

/** The one write path for imports and connectors. Returns inserted ids and the previous versions of replaced or removed rows. */
async function write(section: ImportSection, institutionId: string, rowsIn: Record<string, string>[], source: Source) {
  let rows = rowsIn;
  const inserted: string[] = []; const replaced: Record<string, unknown>[] = [];
  if (section === 'timetable') {
    // A timetable file replaces the whole week of each class it contains.
    const keys = [...new Set(rows.map((r) => r.groupKey))];
    const old = await SchoolTimetableEntry.find({ institutionId, groupKey: { $in: keys } }).lean();
    replaced.push(...(old as unknown as Record<string, unknown>[]));
    await SchoolTimetableEntry.deleteMany({ institutionId, groupKey: { $in: keys } });
    const docs = rows.map((r) => ({ id: newId('stt'), institutionId, groupName: r.groupName, groupKey: r.groupKey, day: Number(r.day), period: Number(r.period), start: r.start, end: r.end, subject: r.subject, teacher: r.teacher || undefined, room: r.room || undefined, source }));
    // last row wins for a repeated class/day/period
    const uniq = new Map(docs.map((d) => [`${d.groupKey}|${d.day}|${d.period}`, d]));
    await SchoolTimetableEntry.insertMany([...uniq.values()]);
    inserted.push(...[...uniq.values()].map((d) => d.id));
  } else if (section === 'attendance') {
    const newAbsences: { studentId: string; date: string; status: string; id: string }[] = [];
    for (const r of rows) {
      const key = { institutionId, studentId: r.studentId, date: r.date, period: r.period ? Number(r.period) : undefined };
      const old = await SchoolDailyAttendance.findOne({ ...key, period: key.period ?? { $exists: false } }).lean();
      const doc = { ...key, status: r.status, note: r.note || undefined, source };
      if (old) {
        if (old.status === r.status && (old.note ?? '') === (r.note ?? '')) continue;
        replaced.push(old as unknown as Record<string, unknown>);
        await SchoolDailyAttendance.replaceOne({ id: old.id }, { ...doc, id: old.id });
        if ((r.status === 'absent' || r.status === 'late') && old.status !== r.status) newAbsences.push({ studentId: r.studentId, date: r.date, status: r.status, id: old.id });
      } else {
        const id = newId('sat'); await SchoolDailyAttendance.create({ ...doc, id }); inserted.push(id);
        if (r.status === 'absent' || r.status === 'late') newAbsences.push({ studentId: r.studentId, date: r.date, status: r.status, id });
      }
    }
    await notifyAbsences(institutionId, newAbsences);
  } else if (section === 'bus_routes') {
    // A routes file replaces each route it contains (all its stops); other routes stay.
    const byRoute = new Map<string, Record<string, string>[]>();
    for (const r of rows) byRoute.set(norm(r.route), [...(byRoute.get(norm(r.route)) ?? []), r]);
    for (const [routeKey, list] of byRoute) {
      const first = (k: string) => list.find((r) => r[k])?.[k] || undefined;
      const stops = list.map((r, i) => ({ name: r.stop, morning: r.morning || undefined, afternoon: r.afternoon || undefined, mapLink: r.map_link || undefined, order: r.stop_order ? Number(r.stop_order) : i + 1 }))
        .sort((a, b) => a.order - b.order).filter((s, i, all) => all.findIndex((x) => norm(x.name) === norm(s.name)) === i);
      const doc = { institutionId, routeKey, routeName: list[0].route, busNumber: first('bus_number'), supervisorName: first('supervisor'), supervisorPhone: first('supervisor_phone'), driverName: first('driver'), stops, source };
      const old = await SchoolBusRoute.findOne({ institutionId, routeKey }).lean();
      if (old) { replaced.push(old as unknown as Record<string, unknown>); await SchoolBusRoute.replaceOne({ id: old.id }, { ...doc, id: old.id }); }
      else { const id = newId('sbr'); await SchoolBusRoute.create({ ...doc, id }); inserted.push(id); }
    }
  } else if (section === 'bus_assignments') {
    // One assignment per child and direction; "both" replaces the child's morning and afternoon rows.
    for (const r of rows) {
      const dirs = r.direction === 'both' ? ['both', 'morning', 'afternoon'] : [r.direction, 'both'];
      const olds = await SchoolBusAssignment.find({ institutionId, studentId: r.studentId, direction: { $in: dirs } }).lean();
      replaced.push(...(olds as unknown as Record<string, unknown>[]));
      await SchoolBusAssignment.deleteMany({ id: { $in: olds.map((o) => o.id) } });
      const id = newId('sba');
      await SchoolBusAssignment.create({ id, institutionId, studentId: r.studentId, routeKey: r.routeKey, stopName: r.stop, direction: r.direction, validFrom: r.valid_from || undefined, validTo: r.valid_to || undefined, source });
      inserted.push(id);
    }
  } else if (section === 'fees') {
    // Upsert per student, plan and instalment number. An instalment not in the file is left as it is.
    for (const r of rows) {
      const key = { institutionId, studentId: r.studentId, planKey: norm(r.plan), number: Number(r.number) };
      const old = await SchoolInstalment.findOne(key).lean();
      const doc = { ...key, planName: r.plan, academicYear: r.academic_year || undefined, amount: Number(r.amount), currency: 'EGP', dueDate: r.due_date, status: r.status,
        paidDate: r.status === 'paid' ? r.paid_date : undefined, receiptRef: r.receipt_ref || undefined, note: r.note || undefined, source };
      if (old) {
        if (old.amount === doc.amount && old.dueDate === doc.dueDate && old.status === doc.status && (old.paidDate ?? '') === (doc.paidDate ?? '') && (old.receiptRef ?? '') === (doc.receiptRef ?? '') && (old.note ?? '') === (doc.note ?? '') && old.planName === doc.planName) continue;
        replaced.push(old as unknown as Record<string, unknown>);
        await SchoolInstalment.replaceOne({ id: old.id }, { ...doc, id: old.id, receiptKey: old.receiptKey, reminders: old.dueDate === doc.dueDate ? old.reminders : undefined });
      } else {
        const id = newId('sin'); await SchoolInstalment.create({ ...doc, id }); inserted.push(id);
      }
    }
  } else {
    // A connector's post seen before (same external id) updates that announcement; it is not inserted or notified again.
    const known = new Map((await SchoolAnnouncement.find({ institutionId, externalId: { $in: rows.map((r) => r.external_id).filter(Boolean) } }).lean()).map((a) => [a.externalId!, a]));
    for (const r of rows.filter((x) => x.external_id && known.has(x.external_id))) {
      const old = known.get(r.external_id)!;
      if (old.title === r.title && old.body === r.body) continue;
      replaced.push(old as unknown as Record<string, unknown>);
      await SchoolAnnouncement.updateOne({ id: old.id }, { $set: { title: r.title, body: r.body, source } });
    }
    rows = rows.filter((x) => !(x.external_id && known.has(x.external_id)));
    const docs = rows.map((r) => ({ id: newId('san'), institutionId, audience: r.audience, audienceValue: r.audience === 'school' ? undefined : r.audience_value, audienceKey: r.audience === 'school' ? undefined : norm(r.audience_value),
      title: r.title, body: r.body, lang: 'both' as const, ...(r.external_id ? { externalId: r.external_id } : {}), publishAt: r.publish ? new Date(`${r.publish}T05:00:00Z`) : new Date(), expiresAt: r.expires ? new Date(`${r.expires}T21:59:59Z`) : undefined, source }));
    if (docs.length) await SchoolAnnouncement.insertMany(docs);
    inserted.push(...docs.map((d) => d.id));
    await notifyAnnouncements(institutionId, docs.filter((d) => d.publishAt.getTime() <= Date.now()).map((d) => d.id));
  }
  return { inserted, replaced };
}
