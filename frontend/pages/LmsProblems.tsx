import React, { useCallback, useEffect, useState } from 'react';
import { fetchLmsProblems, LmsOpenProblem, LmsProblemArea, LmsProblemGroup, LmsProblems as LmsProblemsData } from '../services/apiService';

// LMS Phase 1b: the "Problems" section of LMS connections. Failed or warned
// launches, sign-ins, registrations, grade sends and roster syncs in the last
// 24 hours or 7 days, grouped by Reference code, each with a plain-language
// explanation and fix in English and Arabic (from the server's fixed table).
// IDs and codes only, never names. School admins see their own school; ENARA
// admins see every school (or one, by school ID).
//
// Language: the staff app has no UI language setting, so (like the activity
// picker) Arabic is shown when the browser's language is Arabic, English
// otherwise; the EN / العربية switch changes it for this section.

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Problems',
    intro: 'Launches, sign-ins, registrations, grade sends and roster syncs that failed or gave a warning. IDs and Reference codes only.',
    day: 'Last 24 hours',
    week: 'Last 7 days',
    school: 'School ID (empty: all schools)',
    show: 'Show',
    loading: 'Loading…',
    none: 'No problems in this period.',
    fail: 'Failed',
    warn: 'Warning',
    reference: 'Reference',
    times: (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`,
    lastSeen: 'Last seen',
    what: 'What happened',
    fix: 'What to do',
    connections: 'Connections',
    courses: 'Courses',
    schools: 'Schools',
    more: (n: number) => ` and ${n} more`,
    open: 'Still open now',
    dead: 'Grades the LMS did not accept (ENARA stopped trying)',
    roster: 'Courses whose last roster sync failed',
    openNone: 'Nothing open.',
    area: { launch: 'Opening ENARA', sign_in: 'Sign-in', grades: 'Grades', roster: 'Roster', registration: 'Registration', seats: 'Seats', other: 'Other' } as Record<LmsProblemArea, string>,
  },
  ar: {
    title: 'المشكلات',
    intro: 'عمليات فتح ENARA والدخول والتسجيل وإرسال الدرجات ومزامنة قوائم الطلاب التي فشلت أو صدر عنها تحذير. المعرّفات ورموز المرجع فقط.',
    day: 'آخر 24 ساعة',
    week: 'آخر 7 أيام',
    school: 'معرّف المدرسة (فارغ: جميع المدارس)',
    show: 'عرض',
    loading: 'جارٍ التحميل…',
    none: 'لا توجد مشكلات في هذه الفترة.',
    fail: 'فشل',
    warn: 'تحذير',
    reference: 'رمز المرجع',
    times: (n: number) => `${n} ${n === 1 ? 'مرة' : 'مرات'}`,
    lastSeen: 'آخر ظهور',
    what: 'ما الذي حدث',
    fix: 'ما الذي يجب فعله',
    connections: 'الاتصالات',
    courses: 'المقررات',
    schools: 'المدارس',
    more: (n: number) => ` و${n} غيرها`,
    open: 'ما زال قائمًا الآن',
    dead: 'درجات لم يقبلها نظام إدارة التعلم (توقف ENARA عن المحاولة)',
    roster: 'مقررات فشلت آخر مزامنة لقائمة طلابها',
    openNone: 'لا يوجد شيء قائم.',
    area: { launch: 'فتح ENARA', sign_in: 'الدخول', grades: 'الدرجات', roster: 'قائمة الطلاب', registration: 'التسجيل', seats: 'المقاعد', other: 'أخرى' } as Record<LmsProblemArea, string>,
  },
};

const initialLang = (): Lang => {
  try {
    return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'en';
  }
};

// Western digits in both languages.
const when = (iso: string | null, lang: Lang) => (iso ? new Date(iso).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : undefined) : '—');

const IdList: React.FC<{ label: string; ids: string[]; total: number; t: (typeof T)['en'] }> = ({ label, ids, total, t }) =>
  ids.length ? (
    <p className="text-xs text-slate-500 break-all">
      {label}: <span dir="ltr">{ids.join(', ')}</span>
      {total > ids.length ? t.more(total - ids.length) : ''}
    </p>
  ) : null;

const Help: React.FC<{ g: LmsProblemGroup | LmsOpenProblem; lang: Lang; t: (typeof T)['en'] }> = ({ g, lang, t }) => (
  <dl className="mt-1 text-sm">
    <dt className="sr-only">{t.what}</dt>
    <dd className="text-slate-800">{g.help[lang].what}</dd>
    <dt className="font-semibold text-slate-700 mt-1">{t.fix}</dt>
    <dd className="text-slate-700">{g.help[lang].fix}</dd>
  </dl>
);

export const LmsProblems: React.FC<{ isEnara: boolean; institutionId?: string }> = ({ isEnara, institutionId }) => {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [days, setDays] = useState<1 | 7>(1);
  // Step 2: the school connection status page opens this view for one school.
  const [school, setSchool] = useState(institutionId ?? '');
  const [applied, setApplied] = useState(institutionId ?? '');
  const [data, setData] = useState<LmsProblemsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const t = T[lang];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLmsProblems(days, isEnara && applied ? applied : undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, applied, isEnara]);
  useEffect(() => { void load(); }, [load]);

  const tab = (value: 1 | 7, label: string) => (
    <button type="button" aria-pressed={days === value} onClick={() => setDays(value)}
      className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${days === value ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
      {label}
    </button>
  );

  const openList = (title: string, rows: LmsOpenProblem[]) => (
    <div className="mt-2">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{t.openNone}</p> : (
        <ul className="space-y-2 mt-1">
          {rows.map((o) => (
            <li key={o.code} className="rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{t.reference}: <code className="bg-slate-100 px-1.5 rounded" dir="ltr">{o.code}</code></span>
                <span className="text-slate-600">{t.times(o.count)}</span>
                <span className="text-slate-500 text-xs">{t.lastSeen}: {when(o.lastSeen, lang)}</span>
              </div>
              <Help g={o} lang={lang} t={t} />
              <IdList label={t.connections} ids={o.platformIds} total={o.platformCount} t={t} />
              <IdList label={t.courses} ids={o.contextIds} total={o.contextCount} t={t} />
              {o.institutionIds && <IdList label={t.schools} ids={o.institutionIds} total={o.institutionIds.length} t={t} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="lms-problems" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-slate-900">{t.title}</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Language">
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en" className={`px-2 py-1 text-xs rounded ${lang === 'en' ? 'bg-slate-200 font-bold' : 'text-slate-600'}`}>EN</button>
          <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar" className={`px-2 py-1 text-xs rounded ${lang === 'ar' ? 'bg-slate-200 font-bold' : 'text-slate-600'}`}>العربية</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-1">{t.intro}</p>
      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="flex gap-1" role="group">{tab(1, t.day)}{tab(7, t.week)}</div>
        {isEnara && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(school.trim()); }}>
            <label className="text-xs text-slate-600">{t.school}
              <input dir="ltr" className="block mt-1 border border-slate-200 rounded-lg px-2 py-1 text-sm" value={school} onChange={(e) => setSchool(e.target.value)} />
            </label>
            <button className="px-3 py-1.5 text-sm font-semibold text-teal-700">{t.show}</button>
          </form>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {loading && !data && <p className="mt-3 text-sm text-slate-500">{t.loading}</p>}
      {data && (
        <>
          {data.problems.length === 0 ? <p className="mt-3 text-sm text-slate-500" data-testid="lms-problems-none">{t.none}</p> : (
            <ul className="mt-3 space-y-3">
              {data.problems.map((g) => (
                <li key={`${g.event}|${g.code ?? ''}`} className={`rounded-xl border p-3 ${g.severity === 'fail' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'}`} data-testid="lms-problem">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${g.severity === 'fail' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{g.severity === 'fail' ? t.fail : t.warn}</span>
                    <span className="font-semibold text-slate-900">{t.area[g.area] ?? t.area.other}</span>
                    <span>{t.reference}: <code className="bg-white px-1.5 rounded border border-slate-100" dir="ltr">{g.code ?? '—'}</code></span>
                    <span className="text-slate-700">{t.times(g.count)}</span>
                    <span className="text-slate-500 text-xs">{t.lastSeen}: {when(g.lastSeen, lang)}</span>
                  </div>
                  <Help g={g} lang={lang} t={t} />
                  <IdList label={t.connections} ids={g.platformIds} total={g.platformCount} t={t} />
                  <IdList label={t.courses} ids={g.contextIds} total={g.contextCount} t={t} />
                  {g.institutionIds && <IdList label={t.schools} ids={g.institutionIds} total={g.institutionIds.length} t={t} />}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-sm font-bold text-slate-900">{t.open}</h3>
            {openList(t.dead, data.open.deadGradeJobs)}
            {openList(t.roster, data.open.failedRosterSyncs)}
          </div>
        </>
      )}
    </section>
  );
};
