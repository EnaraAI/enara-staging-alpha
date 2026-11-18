import React, { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchParentsAdminSchools, setSchoolParentAccess, type ParentAccess, type ParentsAdminStatus, type ParentsSchoolRow } from '../services/apiService';
import { ParentCodeTools } from './ParentCodeTools';
import { ParentSchoolSettings } from './ParentSchoolSettings';
import { LangSwitch, initialLang, type Lang } from './LmsSchoolStatus';

// Parents P1 (PARENT_SETTINGS_ENABLED): the "Parents" page.
//   ENARA admin: every school's parent access (Off / Free; D1, the paid option is
//                not built, D2) and parent usage across all schools.
//   School admin: the "Parents" card for their own school (parents linked,
//                active in the last 7 and 30 days, most-used screens) and the
//                access setting, read-only.
// Usage is counts only (IDs and dates are all that is recorded).

const TEXT = {
  en: {
    title: 'Parents', subTeacher: 'Parent link codes for your classes.', subEnara: 'Parent access for each school, and how parents use ENARA Parents (all schools).', subSchool: 'How parents at your school use ENARA Parents.',
    school: 'School', access: 'Parent access', linked: 'Parents linked', active7: 'Active, last 7 days', active30: 'Active, last 30 days', top: 'Most-used screens (30 days)',
    off: 'Off', free: 'Free', none: '—', loading: 'Loading…', failed: 'Could not load the parent numbers. Try again.', retry: 'Try again', saved: 'Saved.', saveFailed: 'Could not save. Try again.',
    readOnly: 'Set by the ENARA team. Contact ENARA to change it.',
    offHelp: "Off: this school's children disappear from their parents' portal (links are kept). Free: parents see their children, free of charge.",
    card: 'Parents', views: (n: number) => `${n} views`,
    screens: { home: 'Home', progress: 'Progress', activity: 'Activity', controls: 'Controls', report: 'Weekly report', account: 'Account' } as Record<string, string>,
  },
  ar: {
    title: 'أولياء الأمور', subTeacher: 'رموز ربط أولياء الأمور لفصولك.', subEnara: 'وصول أولياء الأمور في كل مدرسة، وكيف يستخدم أولياء الأمور البوابة (كل المدارس).', subSchool: 'كيف يستخدم أولياء الأمور في مدرستك بوابة أولياء الأمور.',
    school: 'المدرسة', access: 'وصول أولياء الأمور', linked: 'أولياء أمور مرتبطون', active7: 'نشطون آخر 7 أيام', active30: 'نشطون آخر 30 يومًا', top: 'أكثر الشاشات استخدامًا (30 يومًا)',
    off: 'متوقف', free: 'مجاني', none: '—', loading: 'جارٍ التحميل…', failed: 'تعذّر تحميل الأرقام. حاول مرة أخرى.', retry: 'حاول مرة أخرى', saved: 'تم الحفظ.', saveFailed: 'تعذّر الحفظ. حاول مرة أخرى.',
    readOnly: 'يحدده فريق إنارة. تواصل مع إنارة لتغييره.',
    offHelp: 'متوقف: يختفي أبناء هذه المدرسة من بوابة أولياء أمورهم (مع بقاء الربط). مجاني: يرى أولياء الأمور أبناءهم مجانًا.',
    card: 'أولياء الأمور', views: (n: number) => `${n} مشاهدة`,
    screens: { home: 'الرئيسية', progress: 'التقدّم', activity: 'النشاط', controls: 'الإعدادات', report: 'التقرير الأسبوعي', account: 'الحساب' } as Record<string, string>,
  },
};

const Stat: React.FC<{ label: string; value: number; testId: string }> = ({ label, value, testId }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-2xl font-bold text-slate-900" data-testid={testId}>{value}</div>
  </div>
);

export const ParentsAdmin: React.FC<{ status?: ParentsAdminStatus }> = ({ status }) => {
  const showUsage = status?.usage !== false;
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = TEXT[lang];
  const [data, setData] = useState<{ canChangeAccess: boolean; schools: ParentsSchoolRow[] } | null>(null);
  const [error, setError] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!showUsage) return;
    setError(false);
    fetchParentsAdminSchools().then(setData).catch(() => setError(true));
  }, [showUsage]);
  useEffect(load, [load]);

  const change = async (id: string, access: ParentAccess) => {
    setNote(null);
    try {
      await setSchoolParentAccess(id, access);
      setNote(t.saved);
      load();
    } catch {
      setNote(t.saveFailed);
    }
  };
  const topLine = (s: ParentsSchoolRow) => (s.usage.topScreens.length ? s.usage.topScreens.map((x) => `${t.screens[x.screen] ?? x.screen} (${x.views})`).join(', ') : t.none);

  return (
    <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-testid="parents-admin">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Users size={22} />{t.title}</h1>
          <p className="text-slate-600 mt-1">{!showUsage ? t.subTeacher : data?.canChangeAccess ? t.subEnara : t.subSchool}</p>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{t.failed} <button type="button" className="underline" onClick={load}>{t.retry}</button></div>}
      {showUsage && !data && !error && <p className="text-slate-500">{t.loading}</p>}
      {/* Parents P2: code settings and class code sheets. */}
      {status?.canChangeSettings && <ParentSchoolSettings lang={lang} status={status} />}
      {status?.codeTools && <ParentCodeTools lang={lang} status={status} />}
      {note && <p className="text-sm text-slate-600" role="status">{note}</p>}

      {data && !data.canChangeAccess && data.schools.map((s) => (
        <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4" aria-labelledby={`pc-${s.id}`} data-testid="parents-card">
          <div className="flex items-center justify-between gap-3">
            <h2 id={`pc-${s.id}`} className="text-lg font-semibold text-slate-900">{t.card} · <span dir="auto">{s.name}</span></h2>
            <span className={`text-xs font-semibold rounded-full px-2 py-1 ${s.access === 'off' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`} data-testid="parents-card-access">{t.access}: {s.access === 'off' ? t.off : t.free}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label={t.linked} value={s.usage.linkedParents} testId="parents-card-linked" />
            <Stat label={t.active7} value={s.usage.active7} testId="parents-card-active7" />
            <Stat label={t.active30} value={s.usage.active30} testId="parents-card-active30" />
          </div>
          <div>
            <div className="text-xs text-slate-500">{t.top}</div>
            <ul className="mt-1 text-sm text-slate-800" data-testid="parents-card-top">
              {s.usage.topScreens.length ? s.usage.topScreens.map((x) => <li key={x.screen}>{t.screens[x.screen] ?? x.screen}: {t.views(x.views)}</li>) : <li>{t.none}</li>}
            </ul>
          </div>
          <p className="text-xs text-slate-500">{t.readOnly}</p>
        </section>
      ))}

      {data && data.canChangeAccess && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <p className="text-xs text-slate-500 px-4 pt-3">{t.offHelp}</p>
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-start">
              <tr>
                {[t.school, t.access, t.linked, t.active7, t.active30, t.top].map((h) => <th key={h} className="px-4 py-3 font-semibold text-start">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.schools.map((s) => (
                <tr key={s.id} className="border-t border-slate-100" data-testid={`parents-school-${s.id}`}>
                  <td className="px-4 py-3" dir="auto">{s.name}</td>
                  <td className="px-4 py-3">
                    <select aria-label={`${t.access}: ${s.name}`} className="rounded border border-slate-300 px-2 py-1" value={s.access} onChange={(e) => change(s.id, e.target.value as ParentAccess)} data-testid={`parents-access-${s.id}`}>
                      <option value="free">{t.free}</option>
                      <option value="off">{t.off}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3" data-testid={`parents-linked-${s.id}`}>{s.usage.linkedParents}</td>
                  <td className="px-4 py-3">{s.usage.active7}</td>
                  <td className="px-4 py-3">{s.usage.active30}</td>
                  <td className="px-4 py-3">{topLine(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
