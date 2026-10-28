import React, { useEffect, useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import {
  fetchTutorFaces,
  setStudentFaceOptions,
  setTutorFace,
  type TutorFace,
  type TutorFaceChoice,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { FaceGallery } from './FaceGallery';

type Faces = Awaited<ReturnType<typeof fetchTutorFaces>>;
// Which face is being chosen: the school default, or one course's own.
type Target = { courseId?: string; label: string; current: TutorFace | null };

const FaceThumb: React.FC<{ face: TutorFace | null; size?: 'md' | 'lg'; fallbackLabel?: string }> = ({ face, size = 'md', fallbackLabel }) => {
  const box = size === 'lg' ? 'w-24 h-28' : 'w-14 h-16';
  return face?.imageUrl ? (
    <img src={face.imageUrl} alt={`${face.name}, tutor face`} className={`${box} rounded-lg object-cover bg-slate-100 shrink-0`} />
  ) : (
    <div className={`${box} rounded-lg bg-slate-100 text-slate-400 grid place-items-center shrink-0`} aria-label={fallbackLabel || 'No face chosen'}>
      <UserRound size={size === 'lg' ? 32 : 22} />
    </div>
  );
};

// School admins choose the live tutor's face: a default for the school and,
// optionally, a different one per course, plus the faces students may pick for
// themselves. The tutor's voice follows the face (a woman's or a man's voice).
export const TutorFacePicker: React.FC = () => {
  const [data, setData] = useState<Faces | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingOptions, setEditingOptions] = useState(false);

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);

  const load = (school = institutionId) =>
    fetchTutorFaces(school)
      .then(d => { setData(d); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load tutor faces.'));
  useEffect(() => { load(); }, []);
  const switchSchool = (id: string) => {
    setInstitutionId(id);
    setData(null);
    load(id);
  };

  const saveOptions = async (ids: string[]) => {
    setSaving('options');
    try {
      await setStudentFaceOptions(ids, data?.institutionId);
      toast.success('Student choices saved', ids.length ? `Students can choose from ${ids.length} tutors.` : 'Students can choose any tutor.');
      setEditingOptions(false);
      await load();
    } catch (err) {
      toast.error('Could not save the list', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const choose = async (avatar: TutorFaceChoice | null) => {
    if (!target) return;
    setSaving(avatar?.id || 'clear');
    try {
      await setTutorFace(avatar ? avatar.id : null, target.courseId, data?.institutionId);
      toast.success(
        'Tutor face saved',
        avatar
          ? `${target.label} now uses ${avatar.name}${avatar.gender ? ` with a ${avatar.gender === 'woman' ? "woman's" : "man's"} voice` : ''}.`
          : `${target.label} now uses the school default.`,
      );
      setTarget(null);
      await load();
    } catch (err) {
      toast.error('Could not save the tutor face', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(null);
    }
  };

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-700">
        {error}{' '}
        <button onClick={() => load()} className="font-bold text-teal-700 hover:underline">Try again</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-slate-600 text-sm p-6">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading tutor faces…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.institutions && data.institutions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="face-school" className="text-sm font-semibold text-slate-700">School</label>
          <select
            id="face-school"
            value={data.institutionId}
            onChange={e => switchSchool(e.target.value)}
            className="h-10 px-3 rounded-md border border-slate-300 bg-white text-sm min-w-[220px]"
          >
            {data.institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center gap-5">
        <FaceThumb face={data.default} size="lg" fallbackLabel="Platform default face" />
        <div className="flex-1 min-w-[220px]">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-teal-700">School default</p>
          <h3 className="m-0 mt-1 text-lg font-bold text-slate-900">{data.default ? data.default.name : 'Platform default'}</h3>
          <p className="m-0 mt-1 text-sm text-slate-600">
            Students see this face in live tutor calls unless a course has its own. The voice matches the face.
          </p>
        </div>
        <button
          onClick={() => setTarget({ label: 'Your school', current: data.default })}
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10"
        >
          Choose face
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="m-0 text-lg font-bold text-slate-900">Per course</h3>
          <p className="m-0 mt-1 text-sm text-slate-600">Give a course its own tutor, for example a different face for Arabic or Physics.</p>
        </div>
        {data.courses.length === 0 ? (
          <p className="m-0 px-6 py-5 text-sm text-slate-600">No courses yet.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {data.courses.map(c => (
              <li key={c.courseId} className="flex flex-wrap items-center gap-4 px-6 py-4 border-t border-slate-100 first:border-t-0">
                <FaceThumb face={c.face || data.default} />
                <div className="flex-1 min-w-[180px]">
                  <p className="m-0 font-bold text-slate-900">{c.courseName}</p>
                  <p className="m-0 text-sm text-slate-600">
                    {c.face ? c.face.name : `School default${data.default ? ` (${data.default.name})` : ''}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.face && (
                    <button
                      onClick={() => { setTarget({ courseId: c.courseId, label: c.courseName, current: c.face }); }}
                      className="border border-slate-300 bg-white text-slate-700 rounded-md px-3 h-9 text-sm font-semibold hover:bg-slate-50"
                    >
                      Change
                    </button>
                  )}
                  {!c.face && (
                    <button
                      onClick={() => setTarget({ courseId: c.courseId, label: c.courseName, current: null })}
                      className="border border-slate-300 bg-white text-slate-700 rounded-md px-3 h-9 text-sm font-semibold hover:bg-slate-50"
                    >
                      Give its own face
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-lg font-bold text-slate-900">Tutors students can choose</h3>
            <p className="m-0 mt-1 text-sm text-slate-600">
              Students pick their own tutor before a call. Their pick wins over the school and course faces.
            </p>
          </div>
          <button
            onClick={() => setEditingOptions(true)}
            className="border border-slate-300 bg-white text-slate-700 rounded-md px-4 h-10 font-semibold hover:bg-slate-50"
          >
            Edit list
          </button>
        </div>
        {data.studentOptions.length === 0 ? (
          <p className="m-0 text-sm text-slate-700">All {data.avatars.length} faces are offered.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-wrap gap-3">
            {data.studentOptions.map(id => {
              const face = data.avatars.find(a => a.id === id);
              return face ? (
                <li key={id} className="flex flex-col items-center gap-1 w-16">
                  <FaceThumb face={{ avatarId: face.id, name: face.name, imageUrl: face.imageUrl, gender: face.gender }} />
                  <span className="text-xs text-slate-700 text-center leading-tight">{face.name}</span>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </section>

      {editingOptions && (
        <FaceGallery
          title="Tutors students can choose"
          subtitle="Tick the faces to offer. Leave none ticked to offer every face."
          faces={data.avatars}
          mode="multi"
          selectedIds={data.studentOptions}
          busyId={saving}
          onSave={saveOptions}
          onClose={() => setEditingOptions(false)}
        />
      )}

      {target && (
        <FaceGallery
          title="Choose a tutor face"
          subtitle={`For ${target.label}`}
          faces={data.avatars}
          selectedIds={target.current ? [target.current.avatarId] : []}
          busyId={saving}
          onPick={choose}
          onClose={() => setTarget(null)}
          extraAction={target.courseId && target.current ? { label: 'Use school default instead', onClick: () => choose(null) } : undefined}
        />
      )}
    </div>
  );
};
