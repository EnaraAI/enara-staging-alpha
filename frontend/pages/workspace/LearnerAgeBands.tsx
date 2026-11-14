import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAgeBands, setClassAgeBand, setStudentAgeBand, type AgeBandOverview, type LearnerAgeBandValue } from '../../services/apiService';
import { toast } from '../../services/toastService';

// Learner age bands (Option B). A staff-provided learning-context category,
// not an exact age; the AI tutor uses it to pitch tone, examples and step size.
// Workspace Admins edit it per class and per student; Academic Managers see it
// read-only. No age boundaries are defined here (a separate school decision).

const LABEL: Record<string, string> = { child: 'Child', teen: 'Teen', adult: 'Adult', unknown: 'Unknown' };
const SOURCE: Record<string, string> = {
  school_setting_adult_learners: 'School setting (adult learners)',
  student_age_band: 'Set for this student',
  class_age_band: 'Inherited from class',
  no_trusted_learner_age_source: 'Not set',
  invalid_school_setting: 'Not set',
};
const select = 'rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white';

type Props = {
  data: AgeBandOverview;
  onSetClass?: (id: string, band: LearnerAgeBandValue | null) => void;
  onSetStudent?: (id: string, band: LearnerAgeBandValue | null) => void;
  busy?: boolean;
};

// Presentational view (also rendered server-side in tests). Editing controls
// exist only when the server says this account may edit and handlers are given.
export const LearnerAgeBandsView: React.FC<Props> = ({ data, onSetClass, onSetStudent, busy }) => {
  const editable = data.canEdit && Boolean(onSetClass && onSetStudent);
  const picker = (label: string, value: LearnerAgeBandValue | null, onChange: (v: LearnerAgeBandValue | null) => void) => (
    <select className={select} aria-label={label} value={value ?? ''} disabled={busy} onChange={(e) => onChange((e.target.value || null) as LearnerAgeBandValue | null)}>
      <option value="">Not set</option>
      {data.values.map((v) => <option key={v} value={v}>{LABEL[v]}</option>)}
    </select>
  );
  const className = new Map(data.classes.map((c) => [c.id, c.name]));
  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Learner age bands</h1>
        <p className="text-sm text-slate-600 mt-1">
          A category your school provides for the AI tutor (child, teen or adult), not an exact age. It sets the tutor&apos;s tone, examples and step size; it does not change the level or the lesson.
        </p>
        <p className="text-sm text-slate-600 mt-1">
          Which band applies: the school&apos;s adult-learners setting first, then the student&apos;s own band, then their class&apos;s band. With none of these the tutor treats the age as unknown.
        </p>
        {!editable && <p className="text-sm text-slate-500 mt-1" role="note">Read-only view.</p>}
        {data.adultSchool && <p className="mt-2 text-sm font-semibold text-amber-800" role="note">This school is set to adult learners, so every student is taught as an adult whatever is set below.</p>}
      </header>

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Classes</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Age band per class</caption>
            <thead className="bg-slate-50 text-left"><tr><th scope="col" className="p-3">Class</th><th scope="col" className="p-3">Age band</th></tr></thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{editable ? picker(`Age band for class ${c.name}`, c.ageBand, (v) => onSetClass!(c.id, v)) : (c.ageBand ? LABEL[c.ageBand] : 'Not set')}</td>
                </tr>
              ))}
              {!data.classes.length && <tr><td className="p-3 text-slate-500" colSpan={2}>No classes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Students</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Age band per student: own setting and the band in effect</caption>
            <thead className="bg-slate-50 text-left"><tr><th scope="col" className="p-3">Student</th><th scope="col" className="p-3">Class</th><th scope="col" className="p-3">Own band</th><th scope="col" className="p-3">In effect</th></tr></thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="p-3">{s.name}</td>
                  <td className="p-3">{s.classId ? className.get(s.classId) ?? '—' : '—'}</td>
                  <td className="p-3">{editable ? picker(`Own age band for ${s.name}`, s.ageBand, (v) => onSetStudent!(s.id, v)) : (s.ageBand ? LABEL[s.ageBand] : 'Not set')}</td>
                  <td className="p-3"><span className="font-semibold">{LABEL[s.effective.ageBand]}</span> <span className="text-slate-500">· {SOURCE[s.effective.source] ?? s.effective.source}</span></td>
                </tr>
              ))}
              {!data.students.length && <tr><td className="p-3 text-slate-500" colSpan={4}>No students yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

// Page container: loads from the server; edits go through the API, with the
// existing confirmation pattern when a set value is replaced or cleared.
export const LearnerAgeBands: React.FC = () => {
  const [data, setData] = useState<AgeBandOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchAgeBands().then((d) => { setData(d); setError(null); }).catch((e) => setError(e?.message || 'Could not load age bands'));
  useEffect(() => { load(); }, []);

  const save = async (kind: 'class' | 'student', id: string, current: LearnerAgeBandValue | null, next: LearnerAgeBandValue | null) => {
    if (current === next) return;
    if (current && !window.confirm(next ? `Replace ${LABEL[current]} with ${LABEL[next]}?` : `Clear the ${LABEL[current]} band?`)) return;
    setBusy(true);
    try {
      await (kind === 'class' ? setClassAgeBand(id, next) : setStudentAgeBand(id, next));
      toast.success('Saved', '');
      await load();
    } catch (e) {
      toast.error('Not saved', (e as Error)?.message || '');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="p-8 text-sm text-red-700" role="alert">{error}</div>;
  if (!data) return <div className="p-8"><Loader2 className="animate-spin text-slate-500" aria-label="Loading" /></div>;
  if (!data.canEdit) return <LearnerAgeBandsView data={data} />;
  return (
    <LearnerAgeBandsView
      data={data}
      busy={busy}
      onSetClass={(id, v) => save('class', id, data.classes.find((c) => c.id === id)?.ageBand ?? null, v)}
      onSetStudent={(id, v) => save('student', id, data.students.find((s) => s.id === id)?.ageBand ?? null, v)}
    />
  );
};
