import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, downloadFile } from '../services/apiService';
import { readXlsx, toCsv, writeXlsx } from './schoolApp/xlsx';

// Parents school app (a3): the school admin's screens on the staff Parents page.
//   - Section switches for the school (each needs the site switch too; ENARA only shows school data).
//   - Per section (timetable, attendance, announcements): an Excel template built from the school's own classes, upload of
//     .xlsx or .csv, a preview (new / changed / unchanged / removed / rejected with reasons), confirm, and undo for 24 hours.
//   - Announcements written on the screen, and withdraw.
// Hidden while every SCHOOL_APP_*_ENABLED switch is off (the status call answers 404).
type Lang = 'en' | 'ar';
type Section = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees' | 'buses' | 'requests' | 'consents' | 'chat';
type ImportSection = 'timetable' | 'attendance' | 'announcements' | 'fees' | 'bus_routes' | 'bus_assignments';
const SECTION_OF: Record<ImportSection, Section> = { timetable: 'timetable', attendance: 'attendance', announcements: 'announcements', fees: 'fees', bus_routes: 'buses', bus_assignments: 'buses' };
const SECTIONS: Section[] = ['timetable', 'attendance', 'announcements', 'notifications', 'fees', 'buses', 'requests', 'consents', 'chat'];
const IMPORTS: ImportSection[] = ['timetable', 'attendance', 'announcements', 'fees', 'bus_routes', 'bus_assignments'];
interface Status { feesVisibleTo?: 'all' | 'owner'; institutionId: string | null; available: Record<Section, boolean>; sections: Record<Section, boolean>; templates: Partial<Record<ImportSection, { key: string; required: boolean; header: string; headerAr: string | null }[]>> }
interface Roster { groups: { name: string; students: { id: string; name: string; grade: string | null }[] }[]; withoutGroup: { id: string; name: string; grade: string | null }[] }
interface Preview { importId: string; section: ImportSection; counts: Record<string, number>; problems: { row: number; message: string }[] }
interface ImportRow { id: string; section: ImportSection; fileName?: string; status: string; counts?: Record<string, number>; createdAt: string; confirmedAt?: string; canUndo: boolean }
interface Ann { id: string; audience: string; audienceValue: string | null; title: string; body: string; publishAt: string; expiresAt: string | null; withdrawn: boolean }

const TEXT = {
  en: {
    title: 'School app for parents', sub: 'Information the school shares with parents. ENARA only shows it; the school is the source.',
    sections: 'Sections parents see', section: { timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', notifications: 'In-app notifications (absence, lateness, announcements, fee reminders)', fees: 'Fees (display only: the school records payments)', buses: 'Buses (stop times; no live tracking)', requests: 'Requests from parents', consents: 'Consent forms (tap-to-sign record)', chat: 'Assistant for parents (answers only from the sections above; never acts on money or records)', bus_routes: 'Bus routes and stops', bus_assignments: 'Bus: each child’s route and stop' } as Record<string, string>,
    moodle: { title: 'Moodle connector', help: 'Announcements from each linked course’s Announcements forum, and attendance from the Moodle Attendance plugin when you use it, come in automatically every day. Timetables stay with the Excel file. In Moodle, create a web service with only these functions and paste its token here:', token: 'Web service token', save: 'Save and check', saved: 'Token saved.', on: 'Bring Moodle data in every day', run: 'Sync now', lastRun: (a: string, n1: number, n2: number) => `Last sync ${a}: ${n1} new announcements, ${n2} attendance records`, check: (ok: boolean, code: string, att: boolean) => (ok ? `Connected. Attendance plugin: ${att ? 'found' : 'not found'}.` : `Not connected (${code}).`), none: 'No Moodle connection for this school yet.' },
    req: { title: 'Requests from parents', filter: { new: 'New', in_progress: 'In progress', done: 'Done', refused: 'Refused', all: 'All' } as Record<string, string>, type: { certificate: 'Enrolment certificate', early_leave: 'Early leave', teacher_meeting: 'Meeting with a teacher', other: 'Other' } as Record<string, string>, reply: 'Reply to the parent', setStatus: 'Set status', save: 'Save', none: 'No requests here.', refusedNeedsReply: 'Write the reason before refusing.' },
    cons: { title: 'Consent forms', newForm: 'New consent form', formTitle: 'Title', body: 'Text parents read before answering', deadline: 'Answer by', audience: 'For', publish: 'Publish', published: 'Published; parents are notified.', list: 'Forms', open: 'Open', signed: 'answers', pending: 'pending', export: 'Export CSV', withdraw: 'Withdraw', withdrawn: 'Withdrawn', student: 'Student', klass: 'Class', answer: 'Answer', at: 'Answered at', notAnswered: 'Not answered', changedText: '(answered an older text)', none: 'No forms yet.' },
    bus: { title: 'Buses today', phones: 'Supervisors agreed to share their phone numbers with parents', route: 'Route', kind: 'Notice', delay: 'Delay', cancel: 'Cancelled', direction: 'Trip', morning: 'Morning', afternoon: 'Afternoon', minutes: 'Minutes late', message: 'Message (optional)', send: 'Send to parents', sent: (n: string) => `Sent to the parents of ${n} children.`, routes: 'Routes', stops: 'stops', students: 'children', noRoutes: 'Import the routes sheet first.', today: 'Notices today', withdraw: 'Withdraw', withdrawn: 'Withdrawn', none: 'No notices today.' },
    fees: { title: 'Fees and instalments', visibility: 'Who in a family sees fees', all: 'Every linked guardian', owner: 'The main guardian only', filter: { overdue: 'Overdue', due: 'Due', paid: 'Paid', all: 'All' } as Record<string, string>, student: 'Student', plan: 'Plan', no: 'No.', amount: 'Amount (EGP)', due: 'Due date', status: 'Status', markPaid: 'Mark paid', waive: 'Waive', reopen: 'Mark due', receiptRef: 'Receipt no.', attach: 'Attach receipt', view: 'Receipt', attachHelp: 'PDF, PNG or JPEG, up to 700 KB.', tooBig: 'The file is larger than 700 KB.', none: 'No instalments here.', st: { due: 'Due', overdue: 'Overdue', paid: 'Paid', waived: 'Waived' } as Record<string, string>, totals: (p: string, r: string, o: string) => `Paid ${p} · Remaining ${r} · Overdue ${o} (EGP)`, note: 'ENARA never takes payments. Mark an instalment paid after the school receives the money; parents see it at once.' },
    notOnSite: 'not available yet', save: 'Save', saved: 'Saved.', failed: 'Could not save. Try again.',
    upload: 'Upload a file', template: 'Excel template', templateCsv: 'CSV template', fileHelp: 'Excel (.xlsx) or CSV. The first sheet is read; the first row is the column names (English or Arabic).',
    preview: 'Preview', counts: { new: 'New', changed: 'Changed', unchanged: 'Unchanged', removed: 'Removed', rejected: 'Rejected', total: 'Rows' } as Record<string, string>,
    problems: 'Rows not imported', row: 'Row', reason: 'Reason', confirm: 'Import', cancel: 'Cancel', imported: 'Imported.', removedNote: 'A timetable file replaces the whole week of each class in it.',
    log: 'Import log', undo: 'Undo', undone: 'Undone.', undoHelp: 'Undo is possible for 24 hours.', status: { preview: 'Preview only', confirmed: 'Imported', undone: 'Undone', expired: 'Expired' } as Record<string, string>,
    noImports: 'No imports yet.', off: 'Turn this section on above to import.',
    compose: 'New announcement', audience: 'To', aud: { school: 'Whole school', grade: 'A grade', group: 'A class', student: 'One student (ID)' } as Record<string, string>,
    value: 'Grade, class or student ID', annTitle: 'Title', body: 'Text', publish: 'Publish on (optional)', expires: 'Until (optional)', publishNow: 'Publish',
    published: 'Published.', withdraw: 'Withdraw', withdrawn: 'Withdrawn', list: 'Announcements', none: 'None yet.', readError: 'Could not read this file.',
    sheetRoster: 'Classes and students', rosterCols: ['Class', 'Student ID', 'Student name', 'Grade'],
  },
  ar: {
    title: 'تطبيق المدرسة لأولياء الأمور', sub: 'معلومات تشاركها المدرسة مع أولياء الأمور. إنارة تعرضها فقط؛ والمدرسة هي المصدر.',
    sections: 'الأقسام التي يراها أولياء الأمور', section: { timetable: 'الجدول', attendance: 'الحضور', announcements: 'الإعلانات', notifications: 'الإشعارات داخل التطبيق (الغياب والتأخر والإعلانات وتذكير الأقساط)', fees: 'الرسوم (عرض فقط: المدرسة تسجّل المدفوعات)', buses: 'الحافلات (مواعيد المحطات؛ دون تتبع مباشر)', requests: 'طلبات أولياء الأمور', consents: 'نماذج الموافقة (سجل توقيع بالنقر)', chat: 'مساعد لأولياء الأمور (يجيب من الأقسام أعلاه فقط؛ لا يتصرف في المال أو السجلات)', bus_routes: 'خطوط الحافلات ومحطاتها', bus_assignments: 'الحافلات: خط كل طفل ومحطته' } as Record<string, string>,
    moodle: { title: 'ربط Moodle', help: 'تصل تلقائيًا كل يوم إعلانات منتدى الإعلانات في كل مقرر مرتبط، والحضور من إضافة الحضور في Moodle إن كنتم تستخدمونها. أما الجداول فتبقى بملف Excel. أنشئوا في Moodle خدمة ويب بهذه الدوال فقط والصقوا رمزها هنا:', token: 'رمز خدمة الويب', save: 'حفظ وفحص', saved: 'حُفظ الرمز.', on: 'جلب بيانات Moodle يوميًا', run: 'مزامنة الآن', lastRun: (a: string, n1: number, n2: number) => `آخر مزامنة ${a}: ${n1} إعلانات جديدة، ${n2} سجلات حضور`, check: (ok: boolean, code: string, att: boolean) => (ok ? `متصل. إضافة الحضور: ${att ? 'موجودة' : 'غير موجودة'}.` : `غير متصل (${code}).`), none: 'لا يوجد ربط Moodle لهذه المدرسة بعد.' },
    req: { title: 'طلبات أولياء الأمور', filter: { new: 'جديد', in_progress: 'قيد التنفيذ', done: 'تم', refused: 'مرفوض', all: 'الكل' } as Record<string, string>, type: { certificate: 'شهادة قيد', early_leave: 'انصراف مبكر', teacher_meeting: 'مقابلة معلم', other: 'أخرى' } as Record<string, string>, reply: 'الرد على ولي الأمر', setStatus: 'تغيير الحالة', save: 'حفظ', none: 'لا طلبات هنا.', refusedNeedsReply: 'اكتب السبب قبل الرفض.' },
    cons: { title: 'نماذج الموافقة', newForm: 'نموذج موافقة جديد', formTitle: 'العنوان', body: 'النص الذي يقرؤه ولي الأمر قبل الإجابة', deadline: 'الرد قبل', audience: 'إلى', publish: 'نشر', published: 'نُشر؛ وأُخطر أولياء الأمور.', list: 'النماذج', open: 'فتح', signed: 'إجابات', pending: 'بانتظار الرد', export: 'تصدير CSV', withdraw: 'سحب', withdrawn: 'مسحوب', student: 'الطالب', klass: 'الفصل', answer: 'الإجابة', at: 'وقت الإجابة', notAnswered: 'لم يُجب', changedText: '(أجاب على نص أقدم)', none: 'لا نماذج بعد.' },
    bus: { title: 'الحافلات اليوم', phones: 'وافق المشرفون على مشاركة أرقام هواتفهم مع أولياء الأمور', route: 'الخط', kind: 'الإشعار', delay: 'تأخير', cancel: 'إلغاء', direction: 'الرحلة', morning: 'الذهاب', afternoon: 'العودة', minutes: 'دقائق التأخير', message: 'رسالة (اختيارية)', send: 'إرسال إلى أولياء الأمور', sent: (n: string) => `أُرسل إلى أولياء أمور ${n} من الأطفال.`, routes: 'الخطوط', stops: 'محطات', students: 'أطفال', noRoutes: 'استورد كشف الخطوط أولًا.', today: 'إشعارات اليوم', withdraw: 'سحب', withdrawn: 'مسحوب', none: 'لا إشعارات اليوم.' },
    fees: { title: 'الرسوم والأقساط', visibility: 'من يرى الرسوم في الأسرة', all: 'كل أولياء الأمور المرتبطين', owner: 'ولي الأمر الأساسي فقط', filter: { overdue: 'متأخر', due: 'مستحق', paid: 'مدفوع', all: 'الكل' } as Record<string, string>, student: 'الطالب', plan: 'الخطة', no: 'رقم', amount: 'المبلغ (جنيه)', due: 'تاريخ الاستحقاق', status: 'الحالة', markPaid: 'تسجيل الدفع', waive: 'إعفاء', reopen: 'إعادة إلى مستحق', receiptRef: 'رقم الإيصال', attach: 'إرفاق الإيصال', view: 'الإيصال', attachHelp: 'PDF أو PNG أو JPEG، حتى 700 كيلوبايت.', tooBig: 'الملف أكبر من 700 كيلوبايت.', none: 'لا أقساط هنا.', st: { due: 'مستحق', overdue: 'متأخر', paid: 'مدفوع', waived: 'معفى' } as Record<string, string>, totals: (p: string, r: string, o: string) => `المدفوع ${p} · المتبقي ${r} · المتأخر ${o} (جنيه)`, note: 'إنارة لا تستقبل أي مدفوعات. سجّل دفع القسط بعد أن تستلم المدرسة المبلغ؛ ويظهر لأولياء الأمور فورًا.' },
    notOnSite: 'غير متاح بعد', save: 'حفظ', saved: 'تم الحفظ.', failed: 'تعذّر الحفظ. حاول مرة أخرى.',
    upload: 'رفع ملف', template: 'قالب Excel', templateCsv: 'قالب CSV', fileHelp: 'ملف Excel (‎.xlsx) أو CSV. تُقرأ الورقة الأولى؛ والصف الأول أسماء الأعمدة (بالعربية أو الإنجليزية).',
    preview: 'معاينة', counts: { new: 'جديد', changed: 'معدَّل', unchanged: 'دون تغيير', removed: 'محذوف', rejected: 'مرفوض', total: 'الصفوف' } as Record<string, string>,
    problems: 'صفوف لم تُستورد', row: 'الصف', reason: 'السبب', confirm: 'استيراد', cancel: 'إلغاء', imported: 'تم الاستيراد.', removedNote: 'ملف الجدول يستبدل أسبوع كل فصل وارد فيه بالكامل.',
    log: 'سجل الاستيراد', undo: 'تراجع', undone: 'تم التراجع.', undoHelp: 'يمكن التراجع خلال 24 ساعة.', status: { preview: 'معاينة فقط', confirmed: 'مستورد', undone: 'تم التراجع عنه', expired: 'منتهي' } as Record<string, string>,
    noImports: 'لا عمليات استيراد بعد.', off: 'فعّل هذا القسم أعلاه للاستيراد.',
    compose: 'إعلان جديد', audience: 'إلى', aud: { school: 'كل المدرسة', grade: 'صف دراسي', group: 'فصل', student: 'طالب واحد (الرقم)' } as Record<string, string>,
    value: 'الصف أو الفصل أو رقم الطالب', annTitle: 'العنوان', body: 'النص', publish: 'النشر في (اختياري)', expires: 'حتى (اختياري)', publishNow: 'نشر',
    published: 'تم النشر.', withdraw: 'سحب', withdrawn: 'مسحوب', list: 'الإعلانات', none: 'لا يوجد بعد.', readError: 'تعذّرت قراءة هذا الملف.',
    sheetRoster: 'الفصول والطلاب', rosterCols: ['الفصل', 'رقم الطالب', 'اسم الطالب', 'الصف'],
  },
};

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const primary = 'rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50';
const errText = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback;
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Example rows for a template, from the school's own classes and students, so a filled-in template imports as it is.
function exampleRows(section: ImportSection, roster: Roster | null): Record<string, string>[] {
  const g = roster?.groups.find((x) => x.students.length) ?? roster?.groups[0];
  const s = g?.students[0] ?? roster?.withoutGroup[0];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (section === 'timetable') return g ? [{ class: g.name, day: 'Sunday', period: '1', start: '08:00', end: '08:45', subject: 'Mathematics', teacher: '', room: '' }, { class: g.name, day: 'Sunday', period: '2', start: '08:50', end: '09:35', subject: 'English', teacher: '', room: '' }] : [];
  if (section === 'attendance') return s ? [{ date: today, student: s.id, status: 'present', period: '', note: '' }] : [];
  if (section === 'bus_routes') return [{ route: 'Route 1', bus_number: '12', supervisor: '', supervisor_phone: '', driver: '', stop: 'First stop', stop_order: '1', morning: '06:45', afternoon: '14:30', map_link: '' }, { route: 'Route 1', bus_number: '12', supervisor: '', supervisor_phone: '', driver: '', stop: 'Second stop', stop_order: '2', morning: '07:00', afternoon: '14:15', map_link: '' }];
  if (section === 'bus_assignments') return s ? [{ student: s.id, student_name: s.name, route: 'Route 1', stop: 'First stop', direction: 'both', valid_from: '', valid_to: '' }] : [];
  if (section === 'fees') return s ? [1, 2, 3].map((i) => ({ student: s.id, student_name: s.name, plan: 'Tuition 2026-2027', academic_year: '2026-2027', number: String(i), amount: '15000', due_date: ['2026-09-15', '2026-12-15', '2027-03-15'][i - 1], status: i === 1 ? 'paid' : 'due', paid_date: i === 1 ? '2026-09-10' : '', receipt_ref: i === 1 ? 'R-1001' : '', note: '' })) : [];
  return [{ audience: 'school', audience_value: '', title: 'Example', body: 'Text of the announcement', publish: today, expires: '' }];
}

export const SchoolAppAdmin: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TEXT[lang];
  const [status, setStatus] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);
  const [draft, setDraft] = useState<Record<Section, boolean> | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const s = await apiRequest<Status>('GET', '/api/school-app/status');
      if (!s.institutionId) { setHidden(true); return; }
      setStatus(s); setDraft(s.sections);
      apiRequest<Roster>('GET', '/api/school-app/roster').then(setRoster).catch(() => setRoster(null));
      apiRequest<{ imports: ImportRow[] }>('GET', '/api/school-app/imports').then((r) => setImports(r.imports)).catch(() => setImports([]));
    } catch { setHidden(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (hidden || !status || !draft) return null;

  const saveSections = async () => {
    setNote(null);
    try { const r = await apiRequest<{ sections: Record<Section, boolean> }>('PUT', '/api/school-app/sections', draft); setStatus({ ...status, sections: r.sections }); setDraft(r.sections); setNote(t.saved); }
    catch (e) { setNote(errText(e, t.failed)); }
  };
  const reloadImports = () => apiRequest<{ imports: ImportRow[] }>('GET', '/api/school-app/imports').then((r) => setImports(r.imports)).catch(() => undefined);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5" aria-labelledby="sa-title" data-testid="school-app-admin">
      <div>
        <h2 id="sa-title" className="text-lg font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-600">{t.sub}</p>
      </div>

      <fieldset className="space-y-2" data-testid="sa-sections">
        <legend className="text-sm font-semibold text-slate-800">{t.sections}</legend>
        {SECTIONS.map((s) => (
          <label key={s} className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={!!draft[s]} disabled={!status.available[s]} onChange={(e) => setDraft({ ...draft, [s]: e.target.checked })} data-testid={`sa-section-${s}`} />
            <span>{t.section[s]}{!status.available[s] ? ` (${t.notOnSite})` : ''}</span>
          </label>
        ))}
        <button type="button" className={primary} onClick={saveSections} data-testid="sa-save-sections">{t.save}</button>
        {note && <p className="text-sm text-slate-600" role="status">{note}</p>}
      </fieldset>

      {IMPORTS.filter((s) => status.templates[s] && status.available[SECTION_OF[s]]).map((s) => <ImportCard key={s} lang={lang} section={s} on={!!status.sections[SECTION_OF[s]]} template={status.templates[s]!} roster={roster} onDone={reloadImports} />)}
      <MoodleAdmin lang={lang} />
      {status.sections.requests && <RequestsAdmin lang={lang} />}
      {status.sections.consents && <ConsentsAdmin lang={lang} roster={roster} />}
      {status.sections.buses && <BusesAdmin lang={lang} />}
      {status.sections.fees && <FeesAdmin lang={lang} visibleTo={status.feesVisibleTo ?? 'all'} />}

      <div className="space-y-2" data-testid="sa-log">
        <h3 className="text-base font-semibold text-slate-900">{t.log}</h3>
        <p className="text-xs text-slate-500">{t.undoHelp}</p>
        {imports.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {imports.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100" data-testid="sa-log-row" data-section={r.section} data-status={r.status}>
                    <td className="py-2 pe-3">{t.section[r.section] ?? r.section}</td>
                    <td className="py-2 pe-3" dir="auto">{r.fileName || '—'}</td>
                    <td className="py-2 pe-3">{t.status[r.status] ?? r.status}</td>
                    <td className="py-2 pe-3 text-slate-500">{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(r.confirmedAt || r.createdAt))}</td>
                    <td className="py-2">{r.canUndo && <button type="button" className={btn} data-testid="sa-undo" onClick={async () => { try { await apiRequest('POST', `/api/school-app/imports/${encodeURIComponent(r.id)}/undo`, {}); setNote(t.undone); } catch (e) { setNote(errText(e, t.failed)); } void reloadImports(); }}>{t.undo}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">{t.noImports}</p>}
      </div>

      {status.sections.announcements && <Announcements lang={lang} roster={roster} />}
    </section>
  );
};

const ImportCard: React.FC<{ lang: Lang; section: ImportSection; on: boolean; template: NonNullable<Status['templates'][ImportSection]>; roster: Roster | null; onDone: () => void }> = ({ lang, section, on, template, roster, onDone }) => {
  const t = TEXT[lang];
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const headers = template.map((c) => (lang === 'ar' && c.headerAr) || c.header);
  const rows = () => [headers, ...exampleRows(section, roster).map((r) => template.map((c) => r[c.key] ?? ''))];
  const rosterSheet = () => [t.rosterCols, ...(roster?.groups ?? []).flatMap((g) => g.students.map((s) => [g.name, s.id, s.name, s.grade ?? ''])), ...(roster?.withoutGroup ?? []).map((s) => ['', s.id, s.name, s.grade ?? ''])];
  const onFile = async (f: File) => {
    setMsg(null); setPreview(null); setBusy(true);
    try {
      let csv: string;
      if (/\.xlsx$/i.test(f.name)) { try { csv = toCsv(await readXlsx(await f.arrayBuffer())); } catch { throw new Error(t.readError); } }
      else csv = await f.text();
      setPreview(await apiRequest<Preview>('POST', '/api/school-app/imports/preview', { section, csv: csv.replace(/^﻿/, ''), fileName: f.name }));
    } catch (e) { setMsg(errText(e, t.readError)); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try { await apiRequest('POST', `/api/school-app/imports/${encodeURIComponent(preview.importId)}/confirm`, {}); setPreview(null); setMsg(t.imported); onDone(); }
    catch (e) { setMsg(errText(e, t.failed)); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid={`sa-import-${section}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{t.section[section]}</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} data-testid={`sa-template-${section}`} onClick={() => download(`${section}.xlsx`, writeXlsx([{ name: t.section[section].slice(0, 31), rows: rows(), rtl: lang === 'ar' }, { name: t.sheetRoster, rows: rosterSheet(), rtl: lang === 'ar' }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>{t.template}</button>
          <button type="button" className={btn} onClick={() => download(`${section}.csv`, `﻿${toCsv(rows())}`, 'text/csv;charset=utf-8')}>{t.templateCsv}</button>
        </div>
      </div>
      {!on ? <p className="text-sm text-slate-500">{t.off}</p> : (
        <>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">{t.upload}</span>
            <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-1 block w-full text-sm" disabled={busy} data-testid={`sa-file-${section}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <span className="text-xs text-slate-500">{t.fileHelp}</span>
          </label>
          {preview && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid={`sa-preview-${section}`}>
              <p className="text-sm font-semibold">{t.preview}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                {Object.entries(preview.counts).map(([k, v]) => <span key={k} className="rounded-full bg-white border border-slate-200 px-2 py-1" data-testid={`sa-count-${k}`}>{t.counts[k] ?? k}: <b>{v}</b></span>)}
              </div>
              {section === 'timetable' && <p className="text-xs text-slate-500">{t.removedNote}</p>}
              {preview.problems.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="text-sm font-medium text-red-700">{t.problems}</p>
                  <table className="w-full text-sm"><thead><tr><th className="text-start pe-3">{t.row}</th><th className="text-start">{t.reason}</th></tr></thead>
                    <tbody>{preview.problems.map((p, i) => <tr key={i} data-testid="sa-problem"><td className="pe-3">{p.row}</td><td dir="auto">{p.message}</td></tr>)}</tbody></table>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" className={primary} onClick={confirm} disabled={busy || preview.counts.total === preview.counts.rejected} data-testid={`sa-confirm-${section}`}>{t.confirm}</button>
                <button type="button" className={btn} onClick={() => setPreview(null)}>{t.cancel}</button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-sm text-slate-700" role="status" data-testid={`sa-msg-${section}`}>{msg}</p>}
    </div>
  );
};

const Announcements: React.FC<{ lang: Lang; roster: Roster | null }> = ({ lang, roster }) => {
  const t = TEXT[lang];
  const [list, setList] = useState<Ann[]>([]);
  const [f, setF] = useState({ audience: 'school', audienceValue: '', title: '', body: '', publish: '', expires: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<{ announcements: Ann[] }>('GET', '/api/school-app/announcements').then((r) => setList(r.announcements)).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load]);
  const options = f.audience === 'group' ? (roster?.groups ?? []).map((g) => g.name) : f.audience === 'grade' ? [...new Set((roster?.groups ?? []).flatMap((g) => g.students.map((s) => s.grade).filter(Boolean) as string[]))] : [];
  const publish = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await apiRequest('POST', '/api/school-app/announcements', f); setMsg(t.published); setF({ ...f, title: '', body: '' }); void load(); }
    catch (err) { setMsg(errText(err, t.failed)); }
  };
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="space-y-3" data-testid="sa-announcements">
      <form className="rounded-lg border border-slate-200 p-4 space-y-3" onSubmit={publish}>
        <h3 className="text-base font-semibold text-slate-900">{t.compose}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{t.audience}
            <select className={field} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value, audienceValue: '' })} data-testid="sa-ann-audience">
              {Object.entries(t.aud).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {f.audience !== 'school' && (
            <label className="text-sm">{t.value}
              <input className={field} list="sa-ann-values" value={f.audienceValue} onChange={(e) => setF({ ...f, audienceValue: e.target.value })} required data-testid="sa-ann-value" />
              <datalist id="sa-ann-values">{options.map((o) => <option key={o} value={o} />)}</datalist>
            </label>
          )}
        </div>
        <label className="block text-sm">{t.annTitle}<input className={field} dir="auto" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} data-testid="sa-ann-title" /></label>
        <label className="block text-sm">{t.body}<textarea className={field} dir="auto" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required maxLength={4000} data-testid="sa-ann-body" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{t.publish}<input type="date" className={field} value={f.publish} onChange={(e) => setF({ ...f, publish: e.target.value })} /></label>
          <label className="text-sm">{t.expires}<input type="date" className={field} value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></label>
        </div>
        <button type="submit" className={primary} data-testid="sa-ann-publish">{t.publishNow}</button>
        {msg && <p className="text-sm text-slate-700" role="status" data-testid="sa-ann-msg">{msg}</p>}
      </form>
      <h3 className="text-base font-semibold text-slate-900">{t.list}</h3>
      {list.length ? list.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2" data-testid="sa-ann-row">
          <div>
            <p className="text-sm font-semibold" dir="auto">{a.title}</p>
            <p className="text-xs text-slate-500">{t.aud[a.audience] ?? a.audience}{a.audienceValue ? `: ${a.audienceValue}` : ''} · {a.publishAt.slice(0, 10)}{a.expiresAt ? ` → ${a.expiresAt.slice(0, 10)}` : ''}</p>
          </div>
          {a.withdrawn ? <span className="text-xs text-slate-500">{t.withdrawn}</span> : <button type="button" className={btn} data-testid="sa-ann-withdraw" onClick={async () => { try { await apiRequest('POST', `/api/school-app/announcements/${encodeURIComponent(a.id)}/withdraw`, {}); void load(); } catch (e) { setMsg(errText(e, t.failed)); } }}>{t.withdraw}</button>}
        </div>
      )) : <p className="text-sm text-slate-500">{t.none}</p>}
    </div>
  );
};

interface Inst { id: string; studentId: string; studentName: string; planName: string; number: number; amount: number; dueDate: string; status: 'due' | 'overdue' | 'paid' | 'waived'; paidDate: string | null; receiptRef: string | null; hasReceipt?: boolean }
/** Step (b): the school's fee list, "mark paid" (with the receipt number), and who in a family sees fees. ENARA never takes payments. */
const FeesAdmin: React.FC<{ lang: Lang; visibleTo: 'all' | 'owner' }> = ({ lang, visibleTo }) => {
  const t = TEXT[lang].fees;
  const [filter, setFilter] = useState<'overdue' | 'due' | 'paid' | 'all'>('overdue');
  const [data, setData] = useState<{ totals: { paid: number; remaining: number; overdue: number }; instalments: Inst[] } | null>(null);
  const [vis, setVis] = useState(visibleTo);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<{ totals: { paid: number; remaining: number; overdue: number }; instalments: Inst[] }>('GET', `/api/school-app/fees${filter === 'all' ? '' : `?status=${filter}`}`).then(setData).catch(() => setData(null)), [filter]);
  useEffect(() => { void load(); }, [load]);
  const mark = async (i: Inst, status: 'paid' | 'waived' | 'due') => {
    setMsg(null);
    try { await apiRequest('POST', `/api/school-app/fees/instalments/${encodeURIComponent(i.id)}/mark`, { status, receiptRef: refs[i.id] }); void load(); }
    catch (e) { setMsg(errText(e, TEXT[lang].failed)); }
  };
  const attach = async (i: Inst, f: File) => {
    setMsg(null);
    if (f.size > 700 * 1024) { setMsg(t.tooBig); return; }
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));
    try { await apiRequest('POST', `/api/school-app/fees/instalments/${encodeURIComponent(i.id)}/receipt`, { contentType: f.type, dataBase64: btoa(bin) }); void load(); }
    catch (e) { setMsg(errText(e, TEXT[lang].failed)); }
  };
  const saveVis = async (v: 'all' | 'owner') => { setVis(v); try { await apiRequest('PUT', '/api/school-app/fees/visibility', { feesVisibleTo: v }); setMsg(TEXT[lang].saved); } catch (e) { setMsg(errText(e, TEXT[lang].failed)); } };
  const fmt = (a: number) => a.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid="sa-fees">
      <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
      <p className="text-xs text-slate-500">{t.note}</p>
      <label className="flex flex-wrap items-center gap-3 text-sm">{t.visibility}
        <select className="rounded border border-slate-300 px-2 py-1" value={vis} onChange={(e) => void saveVis(e.target.value as 'all' | 'owner')} data-testid="sa-fees-visibility">
          <option value="all">{t.all}</option><option value="owner">{t.owner}</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2" role="group">
        {(['overdue', 'due', 'paid', 'all'] as const).map((f) => <button key={f} type="button" className={filter === f ? primary : btn} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`sa-fees-filter-${f}`}>{t.filter[f]}</button>)}
      </div>
      {data && <p className="text-sm text-slate-700" data-testid="sa-fees-totals">{t.totals(fmt(data.totals.paid), fmt(data.totals.remaining), fmt(data.totals.overdue))}</p>}
      {data && (data.instalments.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500"><tr>{[t.student, t.plan, t.no, t.amount, t.due, t.status, ''].map((h, i) => <th key={i} className="py-2 pe-3 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {data.instalments.map((i) => (
                <tr key={i.id} className="border-t border-slate-100" data-testid="sa-fee-row" data-status={i.status}>
                  <td className="py-2 pe-3" dir="auto">{i.studentName}</td>
                  <td className="py-2 pe-3" dir="auto">{i.planName}</td>
                  <td className="py-2 pe-3">{i.number}</td>
                  <td className="py-2 pe-3">{fmt(i.amount)}</td>
                  <td className="py-2 pe-3">{i.dueDate}</td>
                  <td className="py-2 pe-3">{t.st[i.status]}{i.paidDate ? ` · ${i.paidDate}` : ''}{i.receiptRef ? ` · ${i.receiptRef}` : ''}</td>
                  <td className="py-2">
                    {(i.status === 'due' || i.status === 'overdue') ? (
                      <div className="flex flex-wrap gap-2">
                        <input aria-label={t.receiptRef} placeholder={t.receiptRef} className="w-28 rounded border border-slate-300 px-2 py-1" value={refs[i.id] ?? ''} onChange={(e) => setRefs({ ...refs, [i.id]: e.target.value })} data-testid="sa-fee-ref" />
                        <button type="button" className={primary} onClick={() => void mark(i, 'paid')} data-testid="sa-fee-paid">{t.markPaid}</button>
                        <button type="button" className={btn} onClick={() => void mark(i, 'waived')}>{t.waive}</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className={btn} onClick={() => void mark(i, 'due')}>{t.reopen}</button>
                        {i.status === 'paid' && (
                          <label className={`${btn} cursor-pointer`} title={t.attachHelp}>{t.attach}
                            <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" data-testid="sa-fee-receipt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(i, f); e.target.value = ''; }} />
                          </label>
                        )}
                        {i.hasReceipt && <button type="button" className={btn} onClick={() => void downloadFile(`/api/school-app/fees/instalments/${encodeURIComponent(i.id)}/receipt`, 'receipt')} data-testid="sa-fee-receipt-view">{t.view}</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-500">{t.none}</p>)}
      {msg && <p className="text-sm text-slate-700" role="status">{msg}</p>}
    </div>
  );
};

interface BusAdminData { busPhonesShared: boolean; routes: { routeKey: string; routeName: string; busNumber: string | null; supervisor: string | null; stops: number; students: number }[]; noticesToday: { id: string; routeKey: string; kind: 'delay' | 'cancel'; direction: 'morning' | 'afternoon'; minutes: number | null; message: string | null; withdrawn: boolean; at: string }[] }
/** Step (c): today's bus notices (delay / cancel) to parents of children on that trip, and the phone-sharing setting. */
const BusesAdmin: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TEXT[lang].bus;
  const [data, setData] = useState<BusAdminData | null>(null);
  const [f, setF] = useState({ route: '', kind: 'delay', direction: 'morning', minutes: '15', message: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<BusAdminData>('GET', '/api/school-app/buses').then((d) => { setData(d); setF((x) => ({ ...x, route: x.route || d.routes[0]?.routeName || '' })); }).catch(() => setData(null)), []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { const r = await apiRequest<{ students: number }>('POST', '/api/school-app/buses/notices', { route: f.route, kind: f.kind, direction: f.direction, minutes: f.kind === 'delay' ? Number(f.minutes) : undefined, message: f.message }); setMsg(t.sent(String(r.students))); setF({ ...f, message: '' }); void load(); }
    catch (err) { setMsg(errText(err, TEXT[lang].failed)); }
  };
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid="sa-buses">
      <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={data.busPhonesShared} onChange={async (e) => { try { await apiRequest('PUT', '/api/school-app/buses/phones', { busPhonesShared: e.target.checked }); void load(); } catch (err) { setMsg(errText(err, TEXT[lang].failed)); } }} data-testid="sa-bus-phones" />
        <span>{t.phones}</span>
      </label>
      {!data.routes.length ? <p className="text-sm text-slate-500">{t.noRoutes}</p> : (
        <>
          <p className="text-sm text-slate-700">{t.routes}: {data.routes.map((r) => `${r.routeName}${r.busNumber ? ` (${r.busNumber})` : ''}: ${r.stops} ${t.stops}, ${r.students} ${t.students}`).join(' · ')}</p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={send}>
            <label className="text-sm">{t.route}<select className={field} value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} data-testid="sa-bus-route">{data.routes.map((r) => <option key={r.routeKey} value={r.routeName}>{r.routeName}</option>)}</select></label>
            <label className="text-sm">{t.direction}<select className={field} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} data-testid="sa-bus-direction"><option value="morning">{t.morning}</option><option value="afternoon">{t.afternoon}</option></select></label>
            <label className="text-sm">{t.kind}<select className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} data-testid="sa-bus-kind"><option value="delay">{t.delay}</option><option value="cancel">{t.cancel}</option></select></label>
            {f.kind === 'delay' && <label className="text-sm">{t.minutes}<input type="number" min={1} max={600} className={field} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} required data-testid="sa-bus-minutes" /></label>}
            <label className="text-sm sm:col-span-2">{t.message}<input className={field} dir="auto" maxLength={300} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="sa-bus-message" /></label>
            <div className="sm:col-span-2"><button type="submit" className={primary} data-testid="sa-bus-send">{t.send}</button></div>
          </form>
        </>
      )}
      {msg && <p className="text-sm text-slate-700" role="status" data-testid="sa-bus-msg">{msg}</p>}
      <h4 className="text-sm font-semibold text-slate-800">{t.today}</h4>
      {data.noticesToday.length ? data.noticesToday.map((nt) => (
        <div key={nt.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm" data-testid="sa-bus-notice">
          <span>{data.routes.find((r) => r.routeKey === nt.routeKey)?.routeName ?? nt.routeKey} · {t[nt.direction]} · {nt.kind === 'cancel' ? t.cancel : `${t.delay} ${nt.minutes}`}{nt.message ? ` · ${nt.message}` : ''}</span>
          {nt.withdrawn ? <span className="text-xs text-slate-500">{t.withdrawn}</span> : <button type="button" className={btn} onClick={async () => { await apiRequest('POST', `/api/school-app/buses/notices/${encodeURIComponent(nt.id)}/withdraw`, {}).catch(() => undefined); void load(); }}>{t.withdraw}</button>}
        </div>
      )) : <p className="text-sm text-slate-500">{t.none}</p>}
    </div>
  );
};

interface ReqRow { id: string; type: string; details: string; preferredDate: string | null; status: 'new' | 'in_progress' | 'done' | 'refused'; reply: string | null; createdAt: string; studentName: string; via: string }
/** Step (d): the requests inbox. The school sets the status and replies; the parent is notified. */
const RequestsAdmin: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TEXT[lang].req;
  const [filter, setFilter] = useState<'new' | 'in_progress' | 'done' | 'refused' | 'all'>('new');
  const [data, setData] = useState<{ counts: Record<string, number>; requests: ReqRow[] } | null>(null);
  const [edit, setEdit] = useState<Record<string, { status: string; reply: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<{ counts: Record<string, number>; requests: ReqRow[] }>('GET', `/api/school-app/requests${filter === 'all' ? '' : `?status=${filter}`}`).then(setData).catch(() => setData(null)), [filter]);
  useEffect(() => { void load(); }, [load]);
  const save = async (r: ReqRow) => {
    const e = edit[r.id] ?? { status: r.status, reply: r.reply ?? '' };
    if (e.status === 'refused' && !e.reply.trim()) { setMsg(t.refusedNeedsReply); return; }
    setMsg(null);
    try { await apiRequest('POST', `/api/school-app/requests/${encodeURIComponent(r.id)}`, { status: e.status, reply: e.reply }); void load(); }
    catch (err) { setMsg(errText(err, TEXT[lang].failed)); }
  };
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid="sa-requests">
      <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
      <div className="flex flex-wrap gap-2" role="group">
        {(['new', 'in_progress', 'done', 'refused', 'all'] as const).map((f) => <button key={f} type="button" className={filter === f ? primary : btn} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`sa-req-filter-${f}`}>{t.filter[f]}{f !== 'all' && data ? ` (${data.counts[f] ?? 0})` : ''}</button>)}
      </div>
      {data && (data.requests.length ? data.requests.map((r) => {
        const e = edit[r.id] ?? { status: r.status, reply: r.reply ?? '' };
        return (
          <div key={r.id} className="space-y-2 border-t border-slate-100 pt-3" data-testid="sa-request">
            <p className="text-sm"><b dir="auto">{r.studentName}</b> · {t.type[r.type] ?? r.type} · <span className="text-slate-500">{r.createdAt.slice(0, 10)}{r.preferredDate ? ` → ${r.preferredDate}` : ''}</span></p>
            <p className="text-sm whitespace-pre-wrap" dir="auto">{r.details}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t.setStatus} className="rounded border border-slate-300 px-2 py-1 text-sm" value={e.status} onChange={(x) => setEdit({ ...edit, [r.id]: { ...e, status: x.target.value } })} data-testid="sa-req-status">
                {(['new', 'in_progress', 'done', 'refused'] as const).map((s) => <option key={s} value={s}>{t.filter[s]}</option>)}
              </select>
              <input aria-label={t.reply} placeholder={t.reply} dir="auto" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={e.reply} onChange={(x) => setEdit({ ...edit, [r.id]: { ...e, reply: x.target.value } })} data-testid="sa-req-reply" />
              <button type="button" className={primary} onClick={() => void save(r)} data-testid="sa-req-save">{t.save}</button>
            </div>
          </div>
        );
      }) : <p className="text-sm text-slate-500">{t.none}</p>)}
      {msg && <p className="text-sm text-slate-700" role="status">{msg}</p>}
    </div>
  );
};

interface FormRow { id: string; title: string; deadline: string; withdrawn: boolean; audience: string; audienceValue: string | null; options: { key: string; label: string }[] }
interface Dash { form: FormRow; counts: Record<string, number>; rows: { studentId: string; studentName: string; className: string; choice: string | null; at: string | null; sameText: boolean | null }[] }
/** Step (d): consent forms: publish, see who answered, export, withdraw. */
const ConsentsAdmin: React.FC<{ lang: Lang; roster: Roster | null }> = ({ lang, roster }) => {
  const t = TEXT[lang].cons;
  const aud = TEXT[lang].aud;
  const [forms, setForms] = useState<FormRow[]>([]);
  const [dash, setDash] = useState<Dash | null>(null);
  const [f, setF] = useState({ title: '', body: '', deadline: '', audience: 'school', audienceValue: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<{ forms: FormRow[] }>('GET', '/api/school-app/consents').then((r) => setForms(r.forms)).catch(() => setForms([])), []);
  useEffect(() => { void load(); }, [load]);
  const openDash = async (id: string) => { try { setDash(await apiRequest<Dash>('GET', `/api/school-app/consents/${encodeURIComponent(id)}`)); } catch (e) { setMsg(errText(e, TEXT[lang].failed)); } };
  const publish = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await apiRequest('POST', '/api/school-app/consents', f); setMsg(t.published); setF({ ...f, title: '', body: '' }); void load(); }
    catch (err) { setMsg(errText(err, TEXT[lang].failed)); }
  };
  const field = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const groups = (roster?.groups ?? []).map((g) => g.name);
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid="sa-consents">
      <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
      <form className="space-y-3" onSubmit={publish}>
        <p className="text-sm font-semibold text-slate-800">{t.newForm}</p>
        <label className="block text-sm">{t.formTitle}<input className={field} dir="auto" required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="sa-cons-title" /></label>
        <label className="block text-sm">{t.body}<textarea className={field} dir="auto" rows={4} required maxLength={6000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="sa-cons-body" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">{t.audience}<select className={field} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value, audienceValue: '' })} data-testid="sa-cons-audience">{Object.entries(aud).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.audience !== 'school' && <label className="text-sm">&nbsp;<input className={field} list="sa-cons-values" required value={f.audienceValue} onChange={(e) => setF({ ...f, audienceValue: e.target.value })} data-testid="sa-cons-value" /><datalist id="sa-cons-values">{(f.audience === 'group' ? groups : []).map((g) => <option key={g} value={g} />)}</datalist></label>}
          <label className="text-sm">{t.deadline}<input type="date" className={field} required value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} data-testid="sa-cons-deadline" /></label>
        </div>
        <button type="submit" className={primary} data-testid="sa-cons-publish">{t.publish}</button>
      </form>
      {msg && <p className="text-sm text-slate-700" role="status" data-testid="sa-cons-msg">{msg}</p>}
      <p className="text-sm font-semibold text-slate-800">{t.list}</p>
      {forms.length ? forms.map((x) => (
        <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm" data-testid="sa-cons-row">
          <span><b dir="auto">{x.title}</b> · {aud[x.audience] ?? x.audience}{x.audienceValue ? `: ${x.audienceValue}` : ''} · {t.deadline} {x.deadline}{x.withdrawn ? ` · ${t.withdrawn}` : ''}</span>
          <span className="flex gap-2">
            <button type="button" className={btn} onClick={() => void openDash(x.id)} data-testid="sa-cons-open">{t.open}</button>
            <button type="button" className={btn} onClick={() => void downloadFile(`/api/school-app/consents/${encodeURIComponent(x.id)}/export`, 'consent.csv')}>{t.export}</button>
            {!x.withdrawn && <button type="button" className={btn} onClick={async () => { await apiRequest('POST', `/api/school-app/consents/${encodeURIComponent(x.id)}/withdraw`, {}).catch(() => undefined); void load(); }}>{t.withdraw}</button>}
          </span>
        </div>
      )) : <p className="text-sm text-slate-500">{t.none}</p>}
      {dash && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid="sa-cons-dash">
          <p className="text-sm font-semibold" dir="auto">{dash.form.title}</p>
          <p className="text-sm" data-testid="sa-cons-counts">{dash.form.options.map((o) => `${o.label}: ${dash.counts[o.key] ?? 0}`).join(' · ')} · {t.pending}: {dash.counts.pending}</p>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-slate-500"><tr>{[t.student, t.klass, t.answer, t.at].map((h) => <th key={h} className="py-1 pe-3 text-start">{h}</th>)}</tr></thead>
            <tbody>{dash.rows.map((r) => <tr key={r.studentId} className="border-t border-slate-100"><td className="py-1 pe-3" dir="auto">{r.studentName}</td><td className="py-1 pe-3" dir="auto">{r.className}</td><td className="py-1 pe-3">{r.choice ? dash.form.options.find((o) => o.key === r.choice)?.label ?? r.choice : t.notAnswered}{r.sameText === false ? ` ${t.changedText}` : ''}</td><td className="py-1">{r.at ? new Date(r.at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour12: true }) : ''}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
};

interface MoodleConn { platformId: string; site: string; hasToken: boolean; enabled: boolean; lastCheck: { at: string; ok: boolean; code: string; attendance: boolean } | null; lastRun: { at: string; code: string; announcements: number; attendance: number } | null; functions: string[] }
/** The Moodle connector: a read-only token per connection (write-only), the school's on/off and "Sync now". Hidden when the site switch is off. */
const MoodleAdmin: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TEXT[lang].moodle;
  const [data, setData] = useState<{ switchOn: boolean; connections: MoodleConn[] } | null>(null);
  const [tok, setTok] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<{ switchOn: boolean; connections: MoodleConn[] }>('GET', '/api/school-app/moodle').then(setData).catch(() => setData(null)), []);
  useEffect(() => { void load(); }, [load]);
  if (!data?.switchOn) return null;
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg(ok); void load(); } catch (e) { setMsg(errText(e, TEXT[lang].failed)); } };
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour12: true, dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3" data-testid="sa-moodle">
      <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
      <p className="text-xs text-slate-600">{t.help}</p>
      {data.connections[0] && <p className="text-xs font-mono text-slate-500" dir="ltr">{data.connections[0].functions.join(', ')}</p>}
      {!data.connections.length ? <p className="text-sm text-slate-500">{t.none}</p> : data.connections.map((c) => (
        <div key={c.platformId} className="space-y-2 border-t border-slate-100 pt-2" data-testid="sa-moodle-conn">
          <p className="text-sm font-medium" dir="ltr">{c.site}</p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="off" aria-label={t.token} placeholder={c.hasToken ? '••••••••' : t.token} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm" value={tok[c.platformId] ?? ''} onChange={(e) => setTok({ ...tok, [c.platformId]: e.target.value })} />
            <button type="button" className={btn} disabled={!tok[c.platformId]} onClick={() => void act(async () => { await apiRequest('PUT', `/api/school-app/moodle/${encodeURIComponent(c.platformId)}/token`, { token: tok[c.platformId] }); setTok({ ...tok, [c.platformId]: '' }); }, t.saved)}>{t.save}</button>
          </div>
          {c.lastCheck && <p className="text-sm text-slate-700">{t.check(c.lastCheck.ok, c.lastCheck.code, c.lastCheck.attendance)}</p>}
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={c.enabled} disabled={!c.hasToken} onChange={(e) => void act(() => apiRequest('PUT', `/api/school-app/moodle/${encodeURIComponent(c.platformId)}`, { enabled: e.target.checked }))} />{t.on}</label>
          <button type="button" className={primary} disabled={!c.hasToken} onClick={() => void act(() => apiRequest('POST', `/api/school-app/moodle/${encodeURIComponent(c.platformId)}/run`, {}))}>{t.run}</button>
          {c.lastRun && <p className="text-sm text-slate-700">{t.lastRun(when(c.lastRun.at), c.lastRun.announcements, c.lastRun.attendance)}{c.lastRun.code !== 'ok' ? ` (${c.lastRun.code})` : ''}</p>}
        </div>
      ))}
      {msg && <p className="text-sm text-slate-700" role="status">{msg}</p>}
    </div>
  );
};
