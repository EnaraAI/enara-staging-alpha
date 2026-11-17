import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import {
  deleteStudentPermanently,
  fetchArchivedBatches,
  fetchArchivedCourseInstances,
  fetchArchivedStudents,
  fetchBatches,
  fetchDeletedStudentAlerts,
  fetchStudentsWithoutActiveGroup,
  restoreBatch,
  restoreCourseInstance,
  restoreStudent,
  updateStudent,
  type DeletedStudentAlert,
  type UnplacedReason,
  type UnplacedStudent,
} from '../services/apiService';
import { toast } from '../services/toastService';

// Multi-class step 6 (archiving). Shown only when the matching backend switch
// is on (fetchArchiveSettings); with both off none of this is rendered.

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error');

const REASONS: Record<UnplacedReason, string> = {
  group_deleted: 'Group was deleted',
  group_archived: 'Group was archived',
  group_in_other_school: 'Group is in another school',
  no_group: 'Never placed in a group',
};

/** Asks the admin to type the confirmation the server requires, then deletes for good. */
export async function confirmAndDeletePermanently(student: { id: string; name?: string }): Promise<boolean> {
  const expected = `DELETE ${student.id}`;
  const typed = window.prompt(
    `Delete ${student.name || student.id} permanently?\n\nThis is for data-deletion requests only. It removes the student, their login, class and group places, parent links, everything they wrote, recordings, transcripts, tutor conversations and learning records. Final scores stay in the school's totals without the student's name. Safety alerts are kept for admins for a limited time. It cannot be undone. To keep the history, archive the student instead.\n\nType ${expected} to confirm.`,
  );
  if (typed === null) return false;
  if (typed.trim() !== expected) {
    toast.error('Not deleted', `The confirmation did not match "${expected}".`);
    return false;
  }
  try {
    await deleteStudentPermanently(student.id);
    toast.success('Student deleted permanently', `${student.name || student.id} and their personal records were removed.`);
    return true;
  } catch (err) {
    toast.error('Could not delete the student', errorMessage(err));
    return false;
  }
}

const Panel: React.FC<{ id: string; title: string; icon: React.ReactNode; description: string; children: React.ReactNode }> = ({ id, title, icon, description, children }) => (
  <section className="bg-white rounded-xl p-6 border border-slate-200 space-y-4" aria-labelledby={id}>
    <div>
      <h2 id={id} className="text-lg font-bold text-slate-900 flex items-center gap-2">{icon}{title}</h2>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
    {children}
  </section>
);

/** "Students without an active group": place each one in a group. Nothing is deleted. */
export const UnplacedStudentsPanel: React.FC<{ refreshKey?: number; onPlaced?: () => void }> = ({ refreshKey, onPlaced }) => {
  const [rows, setRows] = useState<UnplacedStudent[] | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchStudentsWithoutActiveGroup().then((d) => { setRows(d.students); setError(null); }, (e) => setError(errorMessage(e)));
    fetchBatches().then((g) => setGroups((g || []).map((x: any) => ({ id: x.id, name: x.name }))), () => setGroups([]));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const place = async (s: UnplacedStudent) => {
    const batchId = choice[s.studentId];
    if (!batchId) return;
    setBusy(s.studentId);
    try {
      await updateStudent(s.studentId, { batchId });
      toast.success('Student placed', `${s.name} is now in ${groups.find((g) => g.id === batchId)?.name ?? 'the group'}.`);
      setRows((prev) => (prev || []).filter((r) => r.studentId !== s.studentId));
      onPlaced?.();
    } catch (err) {
      toast.error('Could not place the student', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel id="unplaced-title" title={`Students without an active group${rows ? ` (${rows.length})` : ''}`} icon={<UserPlus size={18} />} description="These students are not in any active group, for example because their group was deleted or archived. Choose a group to place them.">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">Every student is in an active group.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.studentId} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                <p className="text-xs text-slate-500 truncate">{s.email} · {REASONS[s.reason]}</p>
              </div>
              <select
                value={choice[s.studentId] ?? ''}
                onChange={(e) => setChoice((prev) => ({ ...prev, [s.studentId]: e.target.value }))}
                className="h-9 px-2 bg-white border border-slate-300 rounded-md text-sm"
                aria-label={`Group for ${s.name}`}
              >
                <option value="">Choose a group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button
                onClick={() => place(s)}
                disabled={!choice[s.studentId] || busy === s.studentId}
                className="h-9 px-3 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50"
              >
                Place
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** Archived students: restore, or delete permanently (data-deletion requests). */
export const ArchivedStudentsPanel: React.FC<{ refreshKey?: number; onRestored?: (student: any) => void }> = ({ refreshKey, onRestored }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { fetchArchivedStudents().then(setRows, (e) => toast.error('Could not load archived students', errorMessage(e))); }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const restore = async (s: any) => {
    setBusy(s.id);
    try {
      const r = await restoreStudent(s.id);
      const skipped = (r?.skipped || []).length;
      toast.success('Student restored', skipped ? `${s.name} can sign in again. ${skipped} group or class no longer exists or is archived, so they were not put back there.` : `${s.name} can sign in again and is back in their group and classes.`);
      setRows((prev) => (prev || []).filter((x) => x.id !== s.id));
      onRestored?.({ ...s, batchId: r?.group ?? undefined, archivedAt: undefined, archive: undefined });
    } catch (err) {
      toast.error('Could not restore the student', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (s: any) => {
    setBusy(s.id);
    if (await confirmAndDeletePermanently(s)) setRows((prev) => (prev || []).filter((x) => x.id !== s.id));
    setBusy(null);
  };

  return (
    <Panel id="archived-students-title" title={`Archived students${rows ? ` (${rows.length})` : ''}`} icon={<Archive size={18} />} description="Archived students cannot sign in and are not in any class or seat count. Their grades, reports and parent links are kept.">
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">No archived students.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                <p className="text-xs text-slate-500 truncate">{s.email}{s.archivedAt ? ` · archived ${new Date(s.archivedAt).toLocaleDateString()}` : ''}</p>
              </div>
              <button onClick={() => restore(s)} disabled={busy === s.id} className="h-9 px-3 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
                <ArchiveRestore size={14} /> Restore
              </button>
              <button onClick={() => remove(s)} disabled={busy === s.id} className="h-9 px-3 rounded-md text-red-600 text-xs font-bold hover:bg-red-50 flex items-center gap-1 disabled:opacity-50">
                <Trash2 size={14} /> Delete permanently
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** Archived groups and classes (history), with restore. */
export const ArchivedGroupsPanel: React.FC<{ refreshKey?: number; onRestored?: () => void }> = ({ refreshKey, onRestored }) => {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [classes, setClasses] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchArchivedBatches().then(setGroups, (e) => toast.error('Could not load archived groups', errorMessage(e)));
    fetchArchivedCourseInstances().then(setClasses, (e) => toast.error('Could not load archived classes', errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const restore = async (kind: 'group' | 'class', row: any) => {
    setBusy(row.id);
    try {
      const r = kind === 'group' ? await restoreBatch(row.id) : await restoreCourseInstance(row.id);
      const back = (r?.returned || []).length;
      const notBack = (r?.notReturned || []).length;
      toast.success(kind === 'group' ? 'Group restored' : 'Class restored', `${back} student${back === 1 ? '' : 's'} put back${notBack ? `; ${notBack} had moved, been archived or been deleted` : ''}.`);
      load();
      onRestored?.();
    } catch (err) {
      toast.error(`Could not restore the ${kind}`, errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const row = (kind: 'group' | 'class', r: any) => (
    <li key={r.id} className="py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{kind === 'group' ? r.name : r.courseName}</p>
        <p className="text-xs text-slate-500">{kind === 'group' ? 'Group' : 'Class'}{r.archivedAt ? ` · archived ${new Date(r.archivedAt).toLocaleDateString()}` : ''}{r.archive?.memberIds ? ` · ${r.archive.memberIds.length} student${r.archive.memberIds.length === 1 ? '' : 's'} at the time` : ''}</p>
      </div>
      <button onClick={() => restore(kind, r)} disabled={busy === r.id} className="h-9 px-3 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
        <ArchiveRestore size={14} /> Restore
      </button>
    </li>
  );
  const total = (groups?.length ?? 0) + (classes?.length ?? 0);
  return (
    <Panel id="archived-groups-title" title={`Archived groups and classes${groups && classes ? ` (${total})` : ''}`} icon={<Archive size={18} />} description="Archived groups and classes are closed. Their history, grades and reports are kept.">
      {groups && classes && total === 0 && <p className="text-sm text-slate-500">Nothing archived.</p>}
      <ul className="divide-y divide-slate-100">
        {(groups || []).map((g) => row('group', g))}
        {(classes || []).map((c) => row('class', c))}
      </ul>
    </Panel>
  );
};

/**
 * PDPL P2: safety alerts kept about permanently deleted students. School and
 * ENARA admins only (the server refuses everyone else); each is removed after
 * the retention period. Rendered only when there is at least one.
 */
export const DeletedStudentAlertsPanel: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const [data, setData] = useState<{ retentionDays: number; alerts: DeletedStudentAlert[] } | null>(null);
  useEffect(() => { fetchDeletedStudentAlerts().then(setData, () => setData(null)); }, [refreshKey]);
  if (!data || data.alerts.length === 0) return null;
  return (
    <Panel id="deleted-student-alerts-title" title={`Safety alerts kept after deletion (${data.alerts.length})`} icon={<ShieldAlert size={18} />} description={`Safety alerts about students who were deleted permanently. Only admins see them. Each is removed ${data.retentionDays} days after it was raised.`}>
      <ul className="divide-y divide-slate-100">
        {data.alerts.map((a) => (
          <li key={a.id} className="py-3 space-y-1">
            <p className="text-sm font-semibold text-slate-900">{a.category.replace(/_/g, ' ')}{a.subtype ? ` · ${a.subtype}` : ''}</p>
            {a.excerpt && <p className="text-sm text-slate-700 break-words">{a.excerpt}</p>}
            <p className="text-xs text-slate-500">Raised {new Date(a.createdAt).toLocaleDateString()} · {a.actionTaken} · removed after {new Date(a.purgeAfter).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
