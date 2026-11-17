import React, { useEffect, useState } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import {
  addStudentMembership,
  fetchBatches,
  fetchCourseInstances,
  fetchMultiClassStatus,
  fetchStudentMemberships,
  removeStudentMembership,
  type StudentMemberships,
} from '../services/apiService';
import { toast } from '../services/toastService';

// Multi-class step 6: an admin puts a student in a second (third...) group or
// class and takes them out again. Shown only when the server has multi-class
// turned on (GET /api/multi-class/status). The student's main group is still
// changed on the student's own record.

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error');

/** Whether multi-class is on (false while loading, or when the server says no). */
export function useMultiClass(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchMultiClassStatus()
      .then(r => { if (!cancelled) setOn(!!r?.multiClass); })
      .catch(() => { /* older server or no access: stay off */ });
    return () => { cancelled = true; };
  }, []);
  return on;
}

interface Props {
  student: { id: string; name: string };
  onClose: () => void;
}

export const StudentGroupsPanel: React.FC<Props> = ({ student, onClose }) => {
  const [data, setData] = useState<StudentMemberships | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; courseName: string; batchId?: string }[]>([]);
  const [scope, setScope] = useState<'group' | 'class'>('group');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetchStudentMemberships(student.id)
      .then(setData)
      .catch(err => toast.error('Could not load groups and classes', errorMessage(err)));

  useEffect(() => {
    load();
    fetchBatches().then(list => setGroups((list || []).map((g: any) => ({ id: g.id, name: g.name })))).catch(() => setGroups([]));
    fetchCourseInstances().then(list => setClasses((list || []).map((c: any) => ({ id: c.id, courseName: c.courseName || c.courseId, batchId: c.batchId })))).catch(() => setClasses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const inGroup = new Set((data?.groups || []).map(g => g.id));
  const inClass = new Set((data?.classes || []).map(c => c.id));
  const options = scope === 'group'
    ? groups.filter(g => !inGroup.has(g.id)).map(g => ({ id: g.id, label: g.name }))
    : classes.filter(c => !inClass.has(c.id)).map(c => ({ id: c.id, label: c.courseName }));

  const add = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      await addStudentMembership(student.id, scope, targetId);
      toast.success(scope === 'group' ? 'Added to group' : 'Added to class', `${student.name} was added.`);
      setTargetId('');
      await load();
    } catch (err) {
      toast.error('Could not add', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: 'group' | 'class', id: string, label: string) => {
    if (!window.confirm(`Take ${student.name} out of ${label}? Their past work is kept.`)) return;
    setBusy(true);
    try {
      await removeStudentMembership(student.id, s, id);
      toast.success('Removed', `${student.name} was taken out of ${label}.`);
      await load();
    } catch (err) {
      toast.error('Could not remove', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" role="dialog" aria-modal="true" aria-labelledby="student-groups-title">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="student-groups-title" className="m-0 text-lg font-bold text-slate-900 flex items-center gap-2"><Layers size={18} aria-hidden="true" /> Groups and classes</h2>
            <p className="m-0 text-sm text-slate-600">{student.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close"><X size={18} /></button>
        </div>

        {!data ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">Groups</h3>
              {data.groups.length === 0 && <p className="text-sm text-slate-500">No group yet. Set the main group on the student's record.</p>}
              {data.groups.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-sm font-semibold text-slate-800">
                    {g.name || g.id}
                    {g.primary && <span className="ml-2 text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">Main group</span>}
                  </span>
                  {g.removable && (
                    <button disabled={busy} onClick={() => remove('group', g.id, g.name || g.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50" aria-label={`Remove from ${g.name || g.id}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">Classes</h3>
              {data.classes.length === 0 && <p className="text-sm text-slate-500">Not in any class.</p>}
              {data.classes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-sm text-slate-800">
                    <span className="font-semibold">{c.courseName}</span>
                    <span className="text-slate-500"> · {c.via.includes('group') ? `through ${c.groupName || c.groupId}` : 'added to the class'}</span>
                  </span>
                  {c.removable && (
                    <button disabled={busy} onClick={() => remove('class', c.id, c.courseName)} className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50" aria-label={`Remove from ${c.courseName}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">Add to a group or class</h3>
              <div className="flex flex-wrap gap-2">
                <select value={scope} onChange={e => { setScope(e.target.value as 'group' | 'class'); setTargetId(''); }} className="px-3 py-2 border border-slate-200 rounded-md text-sm" aria-label="Group or class">
                  <option value="group">Group</option>
                  <option value="class">Class</option>
                </select>
                <select value={targetId} onChange={e => setTargetId(e.target.value)} className="flex-1 min-w-[180px] px-3 py-2 border border-slate-200 rounded-md text-sm" aria-label={scope === 'group' ? 'Group to add' : 'Class to add'}>
                  <option value="">{options.length ? `Choose a ${scope}` : `No other ${scope}`}</option>
                  {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button disabled={busy || !targetId} onClick={add} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50">
                  <Plus size={14} aria-hidden="true" /> Add
                </button>
              </div>
              {scope === 'group' && !data.primaryGroupId && <p className="text-xs text-slate-500">Give the student a main group first.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentGroupsPanel;
