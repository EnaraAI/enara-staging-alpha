import React, { useState } from 'react';
import { getSessionUser, saveSchoolParentSettings, type ParentsAdminStatus } from '../services/apiService';

// The school admin's parent settings on the staff Parents page (audited on the server):
//   P2 (PARENT_CODE_TOOLS_ENABLED): how long codes last (1-60 days) and whether teachers
//      may issue codes for their own classes (D3, default no);
//   P3 (PARENT_GRADES_AFTER_REVIEW_ENABLED): "Show results to parents: immediately /
//      after the teacher releases them" (default after release, D7). A result that an
//      assignment releases automatically counts as released.
type Lang = 'en' | 'ar';
const TEXT = {
  en: {
    title: 'Parent settings', ttl: 'Codes last (days, 1–60)', teachers: 'Teachers may issue codes for their own classes',
    results: 'Show results to parents', immediately: 'Immediately', afterRelease: 'After the teacher releases them',
    resultsHelp: 'Until a result is released, parents see "Waiting for the teacher" and no score. A result that an assignment releases automatically counts as released.',
    save: 'Save', saved: 'Saved.', failed: 'Could not save. Check the values and try again.',
  },
  ar: {
    title: 'إعدادات أولياء الأمور', ttl: 'مدة صلاحية الرموز (أيام، 1–60)', teachers: 'يمكن للمعلمين إصدار رموز لفصولهم',
    results: 'عرض النتائج لأولياء الأمور', immediately: 'فورًا', afterRelease: 'بعد أن يعتمدها المعلم',
    resultsHelp: 'إلى أن تُعتمد النتيجة يرى ولي الأمر «بانتظار المعلم» دون درجة. النتيجة التي يعتمدها الواجب تلقائيًا تُعد معتمدة.',
    save: 'حفظ', saved: 'تم الحفظ.', failed: 'تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى.',
  },
};

export const ParentSchoolSettings: React.FC<{ lang: Lang; status: ParentsAdminStatus }> = ({ lang, status }) => {
  const t = TEXT[lang];
  const codes = status.settingsAvailable?.codes !== false;
  const results = !!status.settingsAvailable?.results;
  const [ttl, setTtl] = useState(String(status.settings?.codeTtlDays ?? 7));
  const [teachers, setTeachers] = useState(!!status.settings?.teachersMayIssueCodes);
  const [show, setShow] = useState<'immediately' | 'after_release'>(status.settings?.showResults ?? 'after_release');
  const [note, setNote] = useState<string | null>(null);
  const save = async () => {
    setNote(null);
    const school = getSessionUser()?.institutionId;
    if (!school) return;
    try {
      await saveSchoolParentSettings(school, { ...(codes ? { codeTtlDays: Number(ttl), teachersMayIssueCodes: teachers } : {}), ...(results ? { showResults: show } : {}) });
      setNote(t.saved);
    } catch {
      setNote(t.failed);
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 pc-noprint" aria-labelledby="ps-settings" data-testid="parent-school-settings">
      <h2 id="ps-settings" className="text-lg font-semibold text-slate-900">{t.title}</h2>
      {codes && (
        <>
          <label className="flex items-center gap-3 text-sm">{t.ttl}
            <input type="number" min={1} max={60} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-20 rounded border border-slate-300 px-2 py-1" data-testid="pc-ttl" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={teachers} onChange={(e) => setTeachers(e.target.checked)} data-testid="pc-teachers" />{t.teachers}</label>
        </>
      )}
      {results && (
        <fieldset className="space-y-1 text-sm" data-testid="ps-results">
          <legend className="font-medium text-slate-800">{t.results}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="ps-results" checked={show === 'after_release'} onChange={() => setShow('after_release')} data-testid="ps-results-after" />{t.afterRelease}</label>
          <label className="flex items-center gap-2"><input type="radio" name="ps-results" checked={show === 'immediately'} onChange={() => setShow('immediately')} data-testid="ps-results-now" />{t.immediately}</label>
          <p className="text-xs text-slate-500">{t.resultsHelp}</p>
        </fieldset>
      )}
      <button type="button" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void save()} data-testid="pc-save">{t.save}</button>
      {note && <p className="text-sm text-slate-700" role="status" data-testid="ps-note">{note}</p>}
    </section>
  );
};
