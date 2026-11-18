import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLmsPickerItems, fetchLmsPickerSession, submitLmsPicker, type LmsPickerItem, type LmsPickerSession } from '../services/apiService';

// LMS Phase 2: the activity picker, shown inside the LMS when a teacher clicks
// "Select content" (LTI Deep Linking). /lms/picker#ps=<one-time secret>.
// The secret is read from the fragment and removed from the address bar. The
// page lists the school's items (each item type is a plug-in on the server),
// lets the teacher pick one or several, and posts ENARA's signed answer back
// to the LMS, which creates the activities. Arabic or English follows the
// teacher's LMS language (launch_presentation.locale).
//
// Phase 2b: page links ("ENARA home (course link)", "ENARA pages") are plug-in
// types too; pages only teachers can open carry a "Teachers only" badge and a
// note on hiding them from students. Assessments and assignments get an
// optional due date (owner decision D13), entered in the school's time zone.

export const onLmsPickerPath = () => window.location.pathname.replace(/\/$/, '') === '/lms/picker';

/** Arabic number agreement: 1, 2, 3–10 (plural), 11+ (singular accusative). */
function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n % 100 >= 3 && n % 100 <= 10 ? few : many}`;
}

const T = {
  en: {
    title: 'Add ENARA activities',
    course: 'Course',
    search: 'Search by title',
    all: 'All',
    type: 'Type',
    subject: 'Subject',
    kind: 'Kind',
    level: 'CEFR level',
    skill: 'Skill',
    allSubjects: 'All subjects',
    allKinds: 'All kinds',
    allLevels: 'All levels',
    allSkills: 'All skills',
    questions: (n: number) => `${n} question${n === 1 ? '' : 's'}`,
    points: (n: number) => `${n} pts`,
    graded: 'Grade column',
    notGraded: 'No grade column',
    // P3: ENARA asks the LMS for a new window and always offers its own new tab.
    newWindow: 'Microphone: new window or tab',
    newWindowHint: 'Uses the microphone. ENARA asks your LMS for a new window and always offers its own "Open in new tab". Moodle 4.3 and later ignore the request.',
    already: 'Already added in this course',
    add: (n: number) => (n ? `Add ${n} activit${n === 1 ? 'y' : 'ies'}` : 'Add'),
    cancel: 'Cancel',
    sending: 'Adding to your course…',
    loading: 'Loading…',
    none: 'No items match these filters.',
    one: 'Your LMS accepts one activity at a time.',
    noSession: 'This picker link is missing its sign-in information. Click "Select content" again in your LMS.',
    expired: 'This picker has expired or was already used. Click "Select content" again in your LMS.',
    failed: 'Something went wrong. Please try again; if it keeps happening, send this reference to ENARA support:',
    teachersOnly: 'Teachers only',
    teachersOnlyNote: "Hide teacher-only links from students in Moodle (or make them 'Available but not shown on course page'). Students who open one land on their own home.",
    due: 'Due (optional)',
    dueHint: (tz: string) => `School time (${tz}). Saved in ENARA and added to the activity description in Moodle.`,
    due_in_past: 'The due date must be in the future.',
    due_too_far: 'The due date must be within 2 years.',
    due_invalid: 'The due date is not valid.',
    noGradeNote: "AI tutor, live avatar and diagnostic activities send no grade. With your LMS's tool setting \"Accept grades from the tool: Always\", Moodle still adds a grade column for each of them; it stays empty, because ENARA never sends a grade to it.",
  },
  ar: {
    title: 'إضافة أنشطة إنارة',
    course: 'المقرر',
    search: 'ابحث بالعنوان',
    all: 'الكل',
    type: 'النوع',
    subject: 'المادة',
    kind: 'الصنف',
    level: 'مستوى CEFR',
    skill: 'المهارة',
    allSubjects: 'كل المواد',
    allKinds: 'كل الأصناف',
    allLevels: 'كل المستويات',
    allSkills: 'كل المهارات',
    questions: (n: number) => arCount(n, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً'),
    points: (n: number) => `${n} درجة`,
    graded: 'عمود درجة',
    notGraded: 'بدون عمود درجة',
    newWindow: 'الميكروفون: نافذة أو علامة تبويب جديدة',
    newWindowHint: 'يستخدم الميكروفون. تطلب إنارة من نظام إدارة التعلم فتحه في نافذة جديدة، وتعرض دائماً خيار الفتح في علامة تبويب جديدة. يتجاهل Moodle 4.3 وما بعده هذا الطلب.',
    already: 'أُضيف سابقاً في هذا المقرر',
    add: (n: number) => (n ? `إضافة ${arCount(n, 'نشاط واحد', 'نشاطين', 'أنشطة', 'نشاطاً')}` : 'إضافة'),
    cancel: 'إلغاء',
    sending: 'جارٍ الإضافة إلى مقررك…',
    loading: 'جارٍ التحميل…',
    none: 'لا توجد عناصر مطابقة لهذه التصفية.',
    one: 'نظام إدارة التعلم لديك يقبل نشاطاً واحداً في كل مرة.',
    noSession: 'رابط الاختيار هذا لا يحتوي على بيانات الدخول. اضغط "اختيار المحتوى" مرة أخرى في نظام إدارة التعلم.',
    expired: 'انتهت صلاحية أداة الاختيار أو استُخدمت من قبل. اضغط "اختيار المحتوى" مرة أخرى في نظام إدارة التعلم.',
    failed: 'حدث خطأ. حاول مرة أخرى، وإذا تكرر أرسل هذا المرجع إلى دعم إنارة:',
    teachersOnly: 'للمعلمين فقط',
    teachersOnlyNote: 'أخفِ الروابط الخاصة بالمعلمين عن الطلاب في Moodle (أو اجعلها «متاحة ولكن غير معروضة في صفحة المقرر»). الطالب الذي يفتح أحدها يصل إلى صفحته الرئيسية.',
    due: 'موعد التسليم (اختياري)',
    dueHint: (tz: string) => `بتوقيت المدرسة (${tz}). يُحفظ في إنارة ويُضاف إلى وصف النشاط في Moodle.`,
    due_in_past: 'يجب أن يكون موعد التسليم في المستقبل.',
    due_too_far: 'يجب أن يكون موعد التسليم خلال سنتين.',
    due_invalid: 'موعد التسليم غير صالح.',
    noGradeNote: 'أنشطة المعلم الذكي والمعلم المرئي والاختبار التشخيصي لا ترسل أي درجة. مع إعداد الأداة في نظام إدارة التعلم «قبول الدرجات من الأداة: دائماً» يضيف Moodle عمود درجة لكل منها، ويبقى فارغاً لأن إنارة لا ترسل إليه أي درجة.',
  },
};

const KIND_LABEL: Record<string, { en: string; ar: string }> = {
  diagnostic: { en: 'Diagnostic', ar: 'تشخيصي' },
  formative: { en: 'Formative', ar: 'تكويني' },
  quiz: { en: 'Quiz', ar: 'اختبار قصير' },
  unit_test: { en: 'Unit test', ar: 'اختبار وحدة' },
  midterm: { en: 'Midterm', ar: 'اختبار منتصف الفصل' },
  final: { en: 'Final', ar: 'اختبار نهائي' },
  teacher_exam: { en: 'Teacher exam', ar: 'اختبار المعلم' },
  standardized: { en: 'Standardized', ar: 'اختبار معياري' },
  retention_check: { en: 'Retention check', ar: 'اختبار احتفاظ' },
  practice: { en: 'Practice', ar: 'تدريب' },
  speaking: { en: 'Speaking', ar: 'محادثة' },
  page: { en: 'Page', ar: 'صفحة' },
  tutor: { en: 'AI tutor', ar: 'المعلم الذكي' },
  avatar: { en: 'Live avatar', ar: 'المعلم المرئي' },
};

const DUE_ERRORS = ['due_in_past', 'due_too_far', 'due_invalid'] as const;
type DueError = (typeof DUE_ERRORS)[number];

/** Posts the signed answer to the LMS (a normal form post, as LTI Deep Linking requires). */
function postToLms(returnUrl: string, jwt: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = returnUrl;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'JWT';
  input.value = jwt;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export const LmsPicker: React.FC = () => {
  const secret = useRef<string | null>(null);
  const [session, setSession] = useState<LmsPickerSession | null>(null);
  const [items, setItems] = useState<LmsPickerItem[] | null>(null);
  const [error, setError] = useState<{ key: 'noSession' | 'expired' | 'failed'; ref?: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Phase 2b: optional due date per picked item (local "YYYY-MM-DDTHH:mm", school time zone).
  const [dues, setDues] = useState<Record<string, string>>({});
  const [dueError, setDueError] = useState<{ key: string; error: DueError } | null>(null);
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState('');
  const [level, setLevel] = useState('');
  const [skill, setSkill] = useState('');

  useEffect(() => {
    if (secret.current !== null) return;
    const s = new URLSearchParams(window.location.hash.slice(1)).get('ps');
    secret.current = s ?? '';
    window.history.replaceState({}, document.title, '/lms/picker');
    if (!s) return void setError({ key: 'noSession' });
    const fail = (e: { status?: number; code?: string; message?: string }) =>
      setError(e.status === 401 || e.status === 410 ? { key: 'expired' } : { key: 'failed', ref: e.code || e.message });
    fetchLmsPickerSession(s)
      .then((sess) => {
        setSession(sess);
        return fetchLmsPickerItems(s).then((r) => setItems(r.items));
      })
      .catch(fail);
  }, []);

  const lang = session?.locale ?? (navigator.language?.startsWith('ar') ? 'ar' : 'en');
  const t = T[lang];
  const key = (i: { type: string; id: string }) => `${i.type}:${i.id}`;
  const titleOf = (i: LmsPickerItem) => (lang === 'ar' && i.ar ? i.ar.title : i.title);
  const takesDue = (i: LmsPickerItem) => !!session?.types.find((x) => x.type === i.type)?.dueDate;

  const language = useMemo(() => (items ?? []).filter((i) => i.language), [items]);
  const options = useMemo(
    () => ({
      subjects: uniq((items ?? []).map((i) => i.subject)),
      kinds: uniq((items ?? []).map((i) => i.kind)),
      levels: uniq(language.map((i) => i.language?.level)),
      skills: uniq(language.flatMap((i) => i.language?.skills ?? [])),
    }),
    [items, language],
  );

  const shown = (items ?? []).filter(
    (i) =>
      (!type || i.type === type) &&
      (!subject || i.subject === subject) &&
      (!kind || i.kind === kind) &&
      (!level || i.language?.level === level) &&
      (!skill || i.language?.skills?.includes(skill)) &&
      (!q.trim() || titleOf(i).toLowerCase().includes(q.trim().toLowerCase())),
  );

  const toggle = (i: LmsPickerItem) => {
    const k = key(i);
    setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : session?.acceptMultiple === false ? [k] : [...cur, k]));
  };

  const send = async (keys: string[]) => {
    if (!secret.current) return;
    setSending(true);
    try {
      const picks = keys.map((k) => {
        const [itemType, ...rest] = k.split(':');
        return { type: itemType, id: rest.join(':'), ...(dues[k] ? { due: dues[k] } : {}) };
      });
      setDueError(null);
      const { returnUrl, jwt } = await submitLmsPicker(secret.current, picks);
      postToLms(returnUrl, jwt);
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string; item?: { type: string; id: string } };
      setSending(false);
      // A due date the server refused: keep the picks and show it next to the item.
      if (err.status === 400 && (DUE_ERRORS as readonly string[]).includes(err.code ?? '')) {
        const bad = err.item ? key(err.item) : keys.find((k) => dues[k]) ?? keys[0];
        setDueError({ key: bad, error: err.code as DueError });
        return;
      }
      setError(err.status === 401 || err.status === 410 ? { key: 'expired' } : { key: 'failed', ref: err.code || err.message });
    }
  };

  const select = (value: string, set: (v: string) => void, all: string, opts: string[], label: (v: string) => string, aria: string) => (
    <select aria-label={aria} value={value} onChange={(e) => set(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
      <option value="">{all}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="min-h-screen bg-slate-50 p-4 sm:p-6 text-slate-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold">{t.title}</h1>
        {session?.courseTitle && (
          <p className="text-sm text-slate-500 mt-1">
            {t.course}: {session.courseTitle}
          </p>
        )}

        {error ? (
          <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700">{t[error.key]}</p>
            {error.ref && <code className="inline-block mt-2 bg-slate-100 px-2 py-1 rounded text-sm">{error.ref}</code>}
          </div>
        ) : !items ? (
          <p className="mt-6 text-slate-500">{t.loading}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]" />
              {session && session.types.length > 1 && select(type, setType, t.all, session.types.map((x) => x.type), (v) => session.types.find((x) => x.type === v)?.label[lang] ?? v, t.type)}
              {options.subjects.length > 1 && select(subject, setSubject, t.allSubjects, options.subjects, (v) => v, t.subject)}
              {options.kinds.length > 1 && select(kind, setKind, t.allKinds, options.kinds, (v) => KIND_LABEL[v]?.[lang] ?? v, t.kind)}
              {/* CEFR level and skill: only when the list has language-course items. */}
              {options.levels.length > 0 && select(level, setLevel, t.allLevels, options.levels, (v) => v, t.level)}
              {options.skills.length > 0 && select(skill, setSkill, t.allSkills, options.skills, (v) => v, t.skill)}
            </div>
            {session?.acceptMultiple === false && <p className="mt-2 text-sm text-slate-500">{t.one}</p>}
            {shown.some((i) => i.teacherOnly) && (
              <p data-testid="picker-teacher-only-note" className="mt-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
                {t.teachersOnlyNote}
              </p>
            )}

            {shown.some((i) => i.activity) && (
              <p data-testid="picker-no-grade-note" className="mt-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2">
                {t.noGradeNote}
              </p>
            )}

            <ul className="mt-4 space-y-2 pb-24">
              {shown.length === 0 && <li className="text-slate-500 text-sm">{t.none}</li>}
              {shown.map((i) => {
                const k = key(i);
                const on = selected.includes(k);
                return (
                  <li key={k}>
                    <label className={`flex gap-3 items-start bg-white border rounded-xl p-4 cursor-pointer ${on ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'}`}>
                      <input type={session?.acceptMultiple === false ? 'radio' : 'checkbox'} name="enara-pick" checked={on} onChange={() => toggle(i)} className="mt-1" />
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{titleOf(i)}</span>
                          {i.alreadyAdded && <span className="text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">{t.already}</span>}
                        </span>
                        <span className="block text-sm text-slate-500 mt-1">
                          {[
                            session?.types.find((x) => x.type === i.type)?.label[lang],
                            i.subject,
                            i.kind ? KIND_LABEL[i.kind]?.[lang] ?? i.kind : undefined,
                            i.language?.level,
                            i.questions ? t.questions(i.questions) : undefined,
                            i.points ? t.points(i.points) : undefined,
                            i.meta,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="flex flex-wrap gap-2 mt-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 border ${i.graded ? 'bg-green-50 text-green-800 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{i.graded ? t.graded : t.notGraded}</span>
                          {i.needsMedia && <span className="rounded-full px-2 py-0.5 border bg-blue-50 text-blue-800 border-blue-200" title={t.newWindowHint}>{t.newWindow}</span>}
                          {i.teacherOnly && <span className="rounded-full px-2 py-0.5 border bg-amber-50 text-amber-900 border-amber-300">{t.teachersOnly}</span>}
                        </span>
                      </span>
                    </label>
                    {on && takesDue(i) && (
                      <div className="mt-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm">
                        <label className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t.due}</span>
                          <input
                            type="datetime-local"
                            dir="ltr"
                            value={dues[k] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDues((cur) => ({ ...cur, [k]: v }));
                              if (dueError?.key === k) setDueError(null);
                            }}
                            className="border border-slate-200 rounded-lg px-2 py-1"
                          />
                        </label>
                        <span className="block text-xs text-slate-500 mt-1">{t.dueHint(session?.timeZone ?? '')}</span>
                        {dueError?.key === k && <span role="alert" className="block text-xs text-red-700 mt-1">{t[dueError.error]}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3">
              <div className="max-w-4xl mx-auto flex gap-2 justify-end">
                <button type="button" disabled={sending} onClick={() => send([])} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-50">
                  {t.cancel}
                </button>
                <button type="button" disabled={sending || selected.length === 0} onClick={() => send(selected)} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-50">
                  {sending ? t.sending : t.add(selected.length)}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
