import * as React from 'react';
import { ArrowRight, CircleCheck, CloudUpload, Download, FileSpreadsheet, Info, RefreshCw, Undo2, X, Ban, CircleMinus, CirclePlus, PencilLine, Equal, TriangleAlert, Loader2, ChevronRight } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { errorText, post, del } from '@/lib/api';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Cell, Column, Dir, Row, Select, Skeleton, Table, TableBody, TableHeader, Tab, TabList, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell, ROUTE } from './SchoolShell';
import { readXlsx, toCsv, writeXlsx } from './xlsx';
import { EmptyState, ErrorState, IMPORT_SECTIONS, ListSkeleton, SECTION_OF, cairoToday, download, fmtWhen, hoursSince, n0, parseCsvText, useApi, useScope, type ImportRow, type ImportSection, type Moodle, type Roster, type Status, type TemplateCol } from './data';

// POST /api/school-app/imports/preview answers one of these (backend/src/schoolApp/importer.ts previewImport, askMapping: true).
interface Preview { importId?: string; section?: ImportSection; counts?: Record<string, number>; problems?: { row?: number; message?: string }[] }
interface NeedsMapping { needsMapping: true; headers?: string[]; map?: (string | null)[]; missing?: string[]; columns?: { key: string; required?: boolean }[] }
interface FileInfo { name: string; csv: string; grid: string[][]; at: string }
const IGNORE = '__ignore';
const MAX_CSV = 3_000_000; // the server refuses larger CSV text (413)

const T = {
  en: {
    title: 'Imports', sub: 'Bring data in from Excel or Moodle. Every import can be undone for 24 hours.',
    excel: 'Excel file', moodle: 'Moodle connector',
    section: 'Section', template: (s: string) => `Download the ${s} template`, step1: '1. Choose a section and upload',
    sec: { timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', fees: 'Fees', bus_routes: 'Bus routes and stops', bus_assignments: 'Bus: each child’s route and stop' } as Record<ImportSection, string>,
    noSections: 'No import is available yet', noSectionsD: 'The sections that take a file (timetable, attendance, announcements, fees, buses) are not switched on for this site yet.',
    off: (s: string) => `The ${s} section is off for your school. Turn it on in Parents app first.`, turnOn: 'Open Parents app',
    drop: 'Drop an Excel file here', dropOr: 'or', browse: 'choose a file', dropHint: '.xlsx or .csv · first sheet is read · first row must be the column names (English or Arabic)',
    meta: (r: string, c: string, at: string) => `${r} rows · ${c} columns · read at ${at}`, replace: 'Replace', reading: 'Reading the file…',
    readError: 'Could not read this file. Save it as .xlsx or CSV UTF-8 and try again.', tooBig: 'This file is too large. Split it into files under 3 MB.',
    step2: '2. Check the preview', step2d: 'Nothing changes until you confirm.', waiting: 'Upload a file to see what will change.',
    cNew: 'New', cChanged: 'Changed', cSame: 'Unchanged', cRemoved: 'Removed', cRejected: 'Rejected',
    rejected: 'Rejected rows', rejectedD: 'These rows will be skipped. Fix them in the file and import again.', rRow: 'Row', more: (n: string) => `and ${n} more`,
    removedNote: 'A timetable file replaces the whole week of each class in it.',
    map: 'Match your columns', mapD: 'Some column names in your file are not ours. Tell us which ENARA field each column holds.',
    field: { class: 'Class', day: 'Day', period: 'Period', start: 'Start time', end: 'End time', subject: 'Subject', teacher: 'Teacher', room: 'Room', date: 'Date', student: 'Student ID', status: 'Status', note: 'Note',
      audience: 'Audience', audience_value: 'Grade, class or student', title: 'Title', body: 'Message', publish: 'Publish date', expires: 'Expiry date', student_name: 'Student name', plan: 'Fee plan', academic_year: 'Academic year',
      number: 'Instalment number', amount: 'Amount (EGP)', due_date: 'Due date', paid_date: 'Paid date', receipt_ref: 'Receipt number', route: 'Route', bus_number: 'Bus number', supervisor: 'Supervisor', supervisor_phone: 'Supervisor phone',
      driver: 'Driver', stop: 'Stop', stop_order: 'Stop order', morning: 'Morning time', afternoon: 'Afternoon time', map_link: 'Map link', direction: 'Direction', valid_from: 'Valid from', valid_to: 'Valid to' } as Record<string, string>,
    yours: 'Your column', ours: 'ENARA field', sample: 'e.g.', ignore: 'Do not import', stillMissing: 'Still missing:', again: 'Preview with these columns',
    remember: (s: string) => `We remember this matching for your next ${s} file once you import.`,
    saved: (n: string, s: string) => `Your own column names for ${s} are remembered (${n}).`, forget: 'Forget them', forgotten: 'Forgotten.',
    confirm: (n: string) => `Import ${n} rows`, cancel: 'Cancel', confirmNote: (r: string) => `${r} rejected rows will be skipped. You can undo this import for 24 hours.`, confirmNoteNone: 'You can undo this import for 24 hours.',
    notifyAtt: 'Absent and late rows send a notification to guardians when Notifications is on.', notifyAnn: 'Announcements published today send a notification to parents when Notifications is on.',
    sure: (n: string, s: string) => `Import ${n} rows into ${s} now?`, sureD: 'Parents see the new data in the app at once.', yes: 'Yes, import', back: 'Back',
    imported: (a: string, b: string) => `Imported: ${a} new, ${b} replaced.`, nothing: 'No row can be imported. Fix the file and upload it again.',
    log: 'Import log', lFile: 'File', lSection: 'Section', lResult: 'Result', lWhen: 'When', lAction: 'Undo', noLog: 'No imports yet', noLogD: 'Every import you confirm shows here and can be undone for 24 hours.',
    undo: 'Undo', undoSure: 'Undo this import?', undoYes: 'Yes, undo', undoLeft: (h: string) => `${h} h left`, expired: 'Undo window closed', undone: 'Undone', previewOnly: 'Preview only', previewExpired: 'Preview expired', didUndo: 'The import was undone.',
    res: { new: (n: string) => `${n} new`, changed: (n: string) => `${n} changed`, removed: (n: string) => `${n} removed`, rejected: (n: string) => `${n} rejected` },
    mOff: 'The Moodle connector is not switched on for this site yet.', mNone: 'No Moodle connection for this school yet.', mOn: 'Brings data in every day', mPaused: 'Paused', mNoToken: 'No token saved',
    mRun: (at: string, a: string, b: string) => `Last sync ${at}: ${a} announcements, ${b} attendance records`, mNever: 'Not synced yet', mManage: 'Token and “Sync now”: not available on this screen yet.',
  },
  ar: {
    title: 'الاستيراد', sub: 'أدخل البيانات من Excel أو Moodle. يمكن التراجع عن أي استيراد خلال 24 ساعة.',
    excel: 'ملف Excel', moodle: 'موصل Moodle',
    section: 'القسم', template: (s: string) => `تنزيل قالب ${s}`, step1: '1. اختر القسم ثم ارفع الملف',
    sec: { timetable: 'الجدول الدراسي', attendance: 'الحضور', announcements: 'الإعلانات', fees: 'الرسوم', bus_routes: 'خطوط الحافلات ومحطاتها', bus_assignments: 'الحافلات: خط كل طالب ومحطته' } as Record<ImportSection, string>,
    noSections: 'لا يتوفر استيراد بعد', noSectionsD: 'الأقسام التي تُستورد من ملف (الجدول والحضور والإعلانات والرسوم والحافلات) غير مفعّلة على هذا الموقع بعد.',
    off: (s: string) => `قسم ${s} متوقف في مدرستك. فعّله أولًا من صفحة تطبيق أولياء الأمور.`, turnOn: 'فتح تطبيق أولياء الأمور',
    drop: 'أفلت ملف Excel هنا', dropOr: 'أو', browse: 'اختر ملفًا', dropHint: 'بصيغة ‎.xlsx أو ‎.csv · تُقرأ الورقة الأولى · يجب أن يحتوي الصف الأول على أسماء الأعمدة (بالعربية أو الإنجليزية)',
    meta: (r: string, c: string, at: string) => `${r} صفًا · ${c} أعمدة · قُرئ في ${at}`, replace: 'استبدال', reading: 'جارٍ قراءة الملف…',
    readError: 'تعذّرت قراءة هذا الملف. احفظه بصيغة ‎.xlsx أو CSV UTF-8 ثم حاول مرة أخرى.', tooBig: 'الملف كبير جدًا. قسّمه إلى ملفات أصغر من 3 ميغابايت.',
    step2: '2. راجع المعاينة', step2d: 'لن يتغيّر شيء قبل أن تؤكّد.', waiting: 'ارفع ملفًا لترى ما سيتغيّر.',
    cNew: 'جديد', cChanged: 'معدَّل', cSame: 'دون تغيير', cRemoved: 'محذوف', cRejected: 'مرفوض',
    rejected: 'الصفوف المرفوضة', rejectedD: 'ستُتخطّى هذه الصفوف. صحّحها في الملف ثم أعد الاستيراد.', rRow: 'الصف', more: (n: string) => `و${n} صفوف أخرى`,
    removedNote: 'ملف الجدول يستبدل أسبوع كل فصل وارد فيه بالكامل.',
    map: 'طابِق أعمدتك', mapD: 'بعض أسماء الأعمدة في ملفك تختلف عن أسمائنا. حدّد حقل إنارة الذي يقابل كل عمود.',
    field: { class: 'الفصل', day: 'اليوم', period: 'الحصة', start: 'وقت البداية', end: 'وقت النهاية', subject: 'المادة', teacher: 'المعلّم', room: 'القاعة', date: 'التاريخ', student: 'رقم الطالب', status: 'الحالة', note: 'ملاحظة',
      audience: 'الجمهور', audience_value: 'الصف أو الفصل أو الطالب', title: 'العنوان', body: 'نص الرسالة', publish: 'تاريخ النشر', expires: 'تاريخ الانتهاء', student_name: 'اسم الطالب', plan: 'خطة الرسوم', academic_year: 'العام الدراسي',
      number: 'رقم القسط', amount: 'المبلغ (ج.م)', due_date: 'تاريخ الاستحقاق', paid_date: 'تاريخ السداد', receipt_ref: 'رقم الإيصال', route: 'خط السير', bus_number: 'رقم الحافلة', supervisor: 'المشرف', supervisor_phone: 'هاتف المشرف',
      driver: 'السائق', stop: 'المحطة', stop_order: 'ترتيب المحطة', morning: 'موعد الصباح', afternoon: 'موعد العودة', map_link: 'رابط الخريطة', direction: 'الاتجاه', valid_from: 'ساري من', valid_to: 'ساري حتى' } as Record<string, string>,
    yours: 'عمودك', ours: 'حقل إنارة', sample: 'مثال:', ignore: 'لا تستورد', stillMissing: 'ما زال ناقصًا:', again: 'معاينة بهذه الأعمدة',
    remember: (s: string) => `سنتذكّر هذه المطابقة في ملف ${s} القادم بعد أن تؤكّد الاستيراد.`,
    saved: (n: string, s: string) => `أسماء أعمدتك الخاصة بقسم ${s} محفوظة (${n}).`, forget: 'احذفها', forgotten: 'حُذفت.',
    confirm: (n: string) => `استيراد ${n} صفًا`, cancel: 'إلغاء', confirmNote: (r: string) => `ستُتخطّى ${r} صفوف مرفوضة. يمكنك التراجع عن هذا الاستيراد خلال 24 ساعة.`, confirmNoteNone: 'يمكنك التراجع عن هذا الاستيراد خلال 24 ساعة.',
    notifyAtt: 'صفوف الغياب والتأخر تُرسل إشعارًا إلى أولياء الأمور عندما يكون قسم الإشعارات مفعّلًا.', notifyAnn: 'الإعلانات المنشورة اليوم تُرسل إشعارًا إلى أولياء الأمور عندما يكون قسم الإشعارات مفعّلًا.',
    sure: (n: string, s: string) => `هل تريد استيراد ${n} صفًا إلى قسم ${s} الآن؟`, sureD: 'يرى أولياء الأمور البيانات الجديدة في التطبيق فورًا.', yes: 'نعم، استورد', back: 'رجوع',
    imported: (a: string, b: string) => `تم الاستيراد: ${a} جديدة، و${b} مستبدلة.`, nothing: 'لا يوجد صف صالح للاستيراد. صحّح الملف ثم ارفعه مرة أخرى.',
    log: 'سجل الاستيراد', lFile: 'الملف', lSection: 'القسم', lResult: 'النتيجة', lWhen: 'الوقت', lAction: 'التراجع', noLog: 'لا عمليات استيراد بعد', noLogD: 'تظهر هنا كل عملية استيراد تؤكّدها، ويمكن التراجع عنها خلال 24 ساعة.',
    undo: 'تراجع', undoSure: 'هل تريد التراجع عن هذا الاستيراد؟', undoYes: 'نعم، تراجع', undoLeft: (h: string) => `متبقٍّ ${h} ساعة`, expired: 'انتهت مهلة التراجع', undone: 'تم التراجع', previewOnly: 'معاينة فقط', previewExpired: 'انتهت المعاينة', didUndo: 'تم التراجع عن الاستيراد.',
    res: { new: (n: string) => `${n} جديدة`, changed: (n: string) => `${n} معدَّلة`, removed: (n: string) => `${n} محذوفة`, rejected: (n: string) => `${n} مرفوضة` },
    mOff: 'موصل Moodle غير مفعّل على هذا الموقع بعد.', mNone: 'لا يوجد ربط Moodle لهذه المدرسة بعد.', mOn: 'يجلب البيانات كل يوم', mPaused: 'متوقف مؤقتًا', mNoToken: 'لم يُحفظ رمز',
    mRun: (at: string, a: string, b: string) => `آخر مزامنة ${at}: ${a} إعلانات، و${b} سجلات حضور`, mNever: 'لم تتم المزامنة بعد', mManage: 'الرمز وزر «مزامنة الآن»: غير متاحين في هذه الشاشة بعد.',
  },
};

// Example rows for a template, from the school's own classes and students (same as the lms-test admin page).
function exampleRows(section: ImportSection, roster: Roster | undefined): Record<string, string>[] {
  const g = roster?.groups?.find((x) => (x?.students?.length ?? 0) > 0) ?? roster?.groups?.[0];
  const s = g?.students?.[0] ?? roster?.withoutGroup?.[0];
  const today = cairoToday();
  if (section === 'timetable') return g?.name ? [{ class: g.name, day: 'Sunday', period: '1', start: '08:00', end: '08:45', subject: 'Mathematics', teacher: '', room: '' }, { class: g.name, day: 'Sunday', period: '2', start: '08:50', end: '09:35', subject: 'English', teacher: '', room: '' }] : [];
  if (section === 'attendance') return s?.id ? [{ date: today, student: s.id, status: 'present', period: '', note: '' }] : [];
  if (section === 'bus_routes') return [{ route: 'Route 1', bus_number: '12', supervisor: '', supervisor_phone: '', driver: '', stop: 'First stop', stop_order: '1', morning: '06:45', afternoon: '14:30', map_link: '' }, { route: 'Route 1', bus_number: '12', supervisor: '', supervisor_phone: '', driver: '', stop: 'Second stop', stop_order: '2', morning: '07:00', afternoon: '14:15', map_link: '' }];
  if (section === 'bus_assignments') return s?.id ? [{ student: s.id, student_name: s.name ?? '', route: 'Route 1', stop: 'First stop', direction: 'both', valid_from: '', valid_to: '' }] : [];
  if (section === 'fees') return s?.id ? [1, 2, 3].map((i) => ({ student: s.id!, student_name: s.name ?? '', plan: 'Tuition 2026-2027', academic_year: '2026-2027', number: String(i), amount: '15000', due_date: ['2026-09-15', '2026-12-15', '2027-03-15'][i - 1], status: i === 1 ? 'paid' : 'due', paid_date: i === 1 ? '2026-09-10' : '', receipt_ref: i === 1 ? 'R-1001' : '', note: '' })) : [];
  return [{ audience: 'school', audience_value: '', title: 'Example', body: 'Text of the announcement', publish: today, expires: '' }];
}

// Data: GET /api/school-app/status, /roster, /imports, /imports/mappings, /moodle. Writes (only on a click): POST /imports/preview
// (askMapping: true; writes a preview record only), POST /imports/:id/confirm (after a second "Yes, import"), POST /imports/:id/undo,
// DELETE /imports/mappings/:section.
export default function SchoolImports() {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const nb = (n: number) => num(n, lang);
  const status = useApi<Status>(scope.path('/api/school-app/status'));
  const ok = !!status.data?.institutionId;
  const roster = useApi<Roster>(ok ? scope.path('/api/school-app/roster') : null);
  const log = useApi<{ imports?: ImportRow[] }>(ok ? scope.path('/api/school-app/imports') : null);
  const mappings = useApi<{ mappings?: { section?: string; map?: Record<string, string> }[] }>(ok ? scope.path('/api/school-app/imports/mappings') : null);
  const [tab, setTab] = React.useState<'excel' | 'moodle'>('excel');
  const moodle = useApi<Moodle>(ok && tab === 'moodle' ? scope.path('/api/school-app/moodle') : null);

  const available = status.data?.available ?? {};
  const on = status.data?.sections ?? {};
  const choices = IMPORT_SECTIONS.filter((s) => status.data?.templates?.[s] && available[SECTION_OF[s]]);
  const [picked, setPicked] = React.useState<ImportSection | null>(null);
  const section: ImportSection | null = picked && choices.includes(picked) ? picked : choices.find((s) => on[SECTION_OF[s]]) ?? choices[0] ?? null;
  const sectionOn = !!(section && on[SECTION_OF[section]]);
  const template: TemplateCol[] = (section && status.data?.templates?.[section]) || [];
  const colName = (key: string) => { const c = template.find((x) => x?.key === key); return t.field[key] ?? (c ? (lang === 'ar' && c.headerAr) || c.header || key : key); };

  const [file, setFile] = React.useState<FileInfo | null>(null);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [match, setMatch] = React.useState<(NeedsMapping & { choice: string[] }) | null>(null);
  const [sure, setSure] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [undoAsk, setUndoAsk] = React.useState<string | null>(null);
  const [undoing, setUndoing] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const reset = () => { setFile(null); setPreview(null); setMatch(null); setSure(false); };
  const choose = (s: ImportSection) => { setPicked(s); reset(); setMsg(null); };

  const runPreview = async (f: FileInfo, mapping?: Record<string, string>) => {
    if (!section) return;
    setBusy(true); setMsg(null); setSure(false);
    try {
      const r = await post<Preview | NeedsMapping>(scope.path('/api/school-app/imports/preview'), scope.body({ section, csv: f.csv, fileName: f.name, askMapping: true, ...(mapping ? { mapping } : {}) }));
      if (r && typeof r === 'object' && 'needsMapping' in r && r.needsMapping) {
        setPreview(null);
        setMatch({ ...r, choice: (r.headers ?? []).map((_, i) => r.map?.[i] || IGNORE) });
      } else { setMatch(null); setPreview((r as Preview) ?? null); }
    } catch (e) { setPreview(null); setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f || !section || !sectionOn) return;
    reset(); setMsg(null); setReading(true);
    try {
      let grid: string[][]; let csv: string;
      if (/\.xlsx$/i.test(f.name)) { grid = await readXlsx(await f.arrayBuffer()); csv = toCsv(grid); }
      else if (/\.csv$/i.test(f.name) || f.type === 'text/csv') { csv = (await f.text()).replace(/^﻿/, ''); grid = parseCsvText(csv); }
      else throw new Error('type');
      if (csv.length > MAX_CSV) { setMsg({ tone: 'danger', text: t.tooBig }); return; }
      if (!grid.length) throw new Error('empty');
      const info = { name: f.name, csv, grid, at: fmtWhen(new Date().toISOString(), lang, true) };
      setFile(info);
      await runPreview(info);
    } catch { setMsg({ tone: 'danger', text: t.readError }); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  };

  const importable = preview ? Math.max(0, n0(preview.counts?.total) - n0(preview.counts?.rejected)) : 0;
  const confirm = async () => {
    if (!preview?.importId) return;
    setBusy(true);
    try {
      const r = await post<{ written?: { inserted?: number; replaced?: number } }>(scope.path(`/api/school-app/imports/${encodeURIComponent(preview.importId)}/confirm`), {});
      reset();
      setMsg({ tone: 'success', text: t.imported(nb(n0(r?.written?.inserted)), nb(n0(r?.written?.replaced))) });
      log.reload(); mappings.reload();
    } catch (e) { setSure(false); setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setBusy(false); }
  };
  const undo = async (id: string) => {
    setUndoing(id); setMsg(null);
    try { await post(scope.path(`/api/school-app/imports/${encodeURIComponent(id)}/undo`), {}); setMsg({ tone: 'success', text: t.didUndo }); }
    catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setUndoing(null); setUndoAsk(null); log.reload(); }
  };
  const savedMap = section ? mappings.data?.mappings?.find((m) => m?.section === section)?.map : undefined;
  const savedCount = savedMap ? Object.keys(savedMap).length : 0;
  const forget = async () => {
    if (!section) return;
    try { await del(scope.path(`/api/school-app/imports/mappings/${encodeURIComponent(section)}`)); setMsg({ tone: 'info', text: t.forgotten }); mappings.reload(); }
    catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); }
  };
  const downloadTemplate = () => {
    if (!section || !template.length) return;
    const headers = template.map((c) => (lang === 'ar' && c.headerAr) || c.header || c.key);
    const rows = [headers, ...exampleRows(section, roster.data).map((r) => template.map((c) => r[c.key] ?? ''))];
    const rosterRows = [lang === 'ar' ? ['الفصل', 'رقم الطالب', 'اسم الطالب', 'الصف'] : ['Class', 'Student ID', 'Student name', 'Grade'],
      ...(roster.data?.groups ?? []).flatMap((g) => (g?.students ?? []).map((s) => [g?.name ?? '', s?.id ?? '', s?.name ?? '', s?.grade ?? ''])),
      ...(roster.data?.withoutGroup ?? []).map((s) => ['', s?.id ?? '', s?.name ?? '', s?.grade ?? ''])];
    download(`${section}.xlsx`, writeXlsx([{ name: t.sec[section].slice(0, 31), rows, rtl: lang === 'ar' }, { name: lang === 'ar' ? 'الفصول والطلاب' : 'Classes and students', rows: rosterRows, rtl: lang === 'ar' }]) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const counts = [
    { k: 'new', label: t.cNew, icon: <CirclePlus />, cls: 'bg-success-soft text-success' },
    { k: 'changed', label: t.cChanged, icon: <PencilLine />, cls: 'bg-info-soft text-info' },
    { k: 'unchanged', label: t.cSame, icon: <Equal />, cls: 'bg-muted text-muted-foreground' },
    { k: 'removed', label: t.cRemoved, icon: <CircleMinus />, cls: 'bg-muted text-muted-foreground' },
    { k: 'rejected', label: t.cRejected, icon: <Ban />, cls: 'bg-destructive-soft text-destructive' },
  ];
  const missingLeft = match ? (match.columns ?? []).filter((c) => c.required && !match.choice.includes(c.key)).map((c) => colName(c.key)) : [];
  const result = (r: ImportRow) => {
    const c = r?.counts ?? {}; const parts: string[] = [];
    if (n0(c.new)) parts.push(t.res.new(nb(n0(c.new)))); if (n0(c.changed)) parts.push(t.res.changed(nb(n0(c.changed))));
    if (n0(c.removed)) parts.push(t.res.removed(nb(n0(c.removed)))); if (n0(c.rejected)) parts.push(t.res.rejected(nb(n0(c.rejected))));
    return parts.join(' · ') || '—';
  };
  const UndoCell = ({ r }: { r: ImportRow }) => {
    const id = r?.id;
    if (r?.status === 'confirmed' && r?.canUndo && id) {
      if (undoAsk === id) return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold">{t.undoSure}</span>
          <Button variant="destructive" size="sm" isDisabled={undoing === id} onPress={() => void undo(id)}>{undoing === id ? <Loader2 className="animate-spin" /> : <Undo2 />}{t.undoYes}</Button>
          <Button variant="ghost" size="sm" onPress={() => setUndoAsk(null)}>{t.back}</Button>
        </span>
      );
      return <span className="inline-flex items-center gap-2"><Button variant="outline" size="sm" onPress={() => setUndoAsk(id)} data-testid="undo"><Undo2 />{t.undo}</Button><span className="text-xs text-muted-foreground tabular-nums">{t.undoLeft(nb(Math.max(1, Math.ceil(24 - hoursSince(r?.confirmedAt)))))}</span></span>;
    }
    if (r?.status === 'undone') return <Badge tone="neutral">{t.undone}</Badge>;
    if (r?.status === 'preview') return <span className="text-xs text-muted-foreground">{t.previewOnly}</span>;
    if (r?.status === 'expired') return <span className="text-xs text-muted-foreground">{t.previewExpired}</span>;
    return <span className="text-xs text-muted-foreground">{t.expired}</span>;
  };
  const rows = log.data?.imports ?? [];
  const fileLabel = (r: ImportRow) => r?.fileName || (r?.section ? t.sec[r.section] ?? r.section : '—');

  return (
    <SchoolShell active="imports" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k === 'moodle' ? 'moodle' : 'excel')}>
          <TabList aria-label={t.title}>
            <Tab id="excel"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4" />{t.excel}</span></Tab>
            <Tab id="moodle"><span className="inline-flex items-center gap-1.5"><RefreshCw className="size-4" />{t.moodle}</span></Tab>
          </TabList>
        </Tabs>

        {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : !status.loading && !ok ? <ErrorState error={{ status: 400 }} /> : null}

        {tab === 'moodle' ? (
          <Card>
            <CardHeader><CardTitle>{t.moodle}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {moodle.loading && !moodle.data ? <Skeleton className="h-16 w-full" /> : moodle.error ? <ErrorState error={moodle.error} onRetry={moodle.reload} /> : moodle.data?.switchOn === false ? (
                <Alert tone="info" icon={<Info />}>{t.mOff}</Alert>
              ) : (moodle.data?.connections ?? []).length === 0 ? (
                <EmptyState icon={<RefreshCw />} title={t.mNone} />
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {(moodle.data?.connections ?? []).map((c, i) => (
                    <li key={c?.platformId ?? i} className="flex flex-col gap-1 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 truncate text-sm font-semibold"><bdi>{c?.site || c?.vendor || 'Moodle'}</bdi></p>
                        <Badge tone={c?.enabled && c?.hasToken ? 'success' : 'neutral'}>{!c?.hasToken ? t.mNoToken : c?.enabled ? t.mOn : t.mPaused}</Badge></div>
                      <p className="text-xs text-muted-foreground">{c?.lastRun?.at ? t.mRun(fmtWhen(c.lastRun.at, lang, true), nb(n0(c.lastRun.announcements)), nb(n0(c.lastRun.attendance))) : t.mNever}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t.mManage}</p>
            </CardContent>
          </Card>
        ) : status.loading && !status.data ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
        ) : ok && choices.length === 0 ? (
          <Card><EmptyState icon={<FileSpreadsheet />} title={t.noSections}>{t.noSectionsD}</EmptyState></Card>
        ) : ok && section ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Step 1 */}
            <Card className="min-w-0 lg:self-start">
              <CardHeader><CardTitle>{t.step1}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select aria-label={t.section} label={t.section} items={choices.map((s) => ({ id: s, name: t.sec[s] }))} selectedKey={section} onSelectionChange={(k) => { if (k) choose(String(k) as ImportSection); }} />
                <button type="button" onClick={downloadTemplate} className="inline-flex w-fit items-center gap-1.5 text-start text-sm font-semibold text-primary"><Download className="size-4 shrink-0" />{t.template(t.sec[section])}</button>
                {!sectionOn ? (
                  <Alert tone="warning" icon={<TriangleAlert />}>
                    {t.off(t.sec[section])} <a className="font-semibold text-primary underline underline-offset-2" href={scope.href(ROUTE.parents)}>{t.turnOn}</a>
                  </Alert>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
                    className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/50 px-4 py-6 text-center focus-within:ring-2 focus-within:ring-ring', (reading || busy) && 'pointer-events-none opacity-60')}
                    data-testid="dropzone">
                    <span className="grid size-10 place-items-center rounded-full bg-card text-primary shadow-sm">{reading ? <Loader2 className="size-5 animate-spin" /> : <CloudUpload className="size-5" />}</span>
                    <p className="text-sm font-semibold">{reading ? t.reading : <>{t.drop} <span className="font-normal text-muted-foreground">{t.dropOr}</span> <span className="text-primary underline underline-offset-2">{t.browse}</span></>}</p>
                    <p className="text-xs text-muted-foreground">{t.dropHint}</p>
                    <input ref={input} type="file" className="sr-only" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading || busy} onChange={(e) => void onFile(e.target.files?.[0])} data-testid="file-input" />
                  </label>
                )}
                {file && (
                  <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-success-soft text-success"><FileSpreadsheet className="size-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold"><bdi>{file.name}</bdi></p><p className="truncate text-xs text-muted-foreground">{t.meta(nb(Math.max(0, file.grid.length - 1)), nb(file.grid[0]?.length ?? 0), file.at)}</p></div>
                    <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => input.current?.click()}>{t.replace}</Button>
                  </div>
                )}
                {savedCount > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="saved-mapping">{t.saved(nb(savedCount), t.sec[section])} <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => void forget()}>{t.forget}</button></p>
                )}
              </CardContent>
            </Card>

            {/* Step 2 */}
            <Card className="min-w-0">
              <CardHeader><CardTitle>{t.step2}</CardTitle><CardDescription>{t.step2d}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-5">
                {msg && <Alert tone={msg.tone} icon={msg.tone === 'success' ? <CircleCheck /> : msg.tone === 'danger' ? <TriangleAlert /> : <Info />}>{msg.text}</Alert>}
                {busy && !preview && !match ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /></div> : null}

                {match && (
                  <div data-testid="mapping">
                    <p className="text-sm font-bold">{t.map}</p>
                    <p className="mb-3 text-xs text-muted-foreground">{t.mapD}</p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.yours}</span><span />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.ours}</span>
                      {(match.headers ?? []).map((h, i) => (
                        <MapRow key={i} col={h || '—'} sample={file?.grid?.[1]?.[i] ? `${t.sample} ${file.grid[1][i]}` : ''} value={match.choice[i] ?? IGNORE} label={`${t.ours}: ${h}`}
                          items={[{ id: IGNORE, name: t.ignore }, ...(match.columns ?? []).map((c) => ({ id: c.key, name: `${colName(c.key)}${c.required ? ' *' : ''}` }))]}
                          onChange={(v) => setMatch({ ...match, choice: match.choice.map((c, j) => (j === i ? v : c)) })} />
                      ))}
                    </div>
                    {missingLeft.length > 0 && <p className="mt-2 text-xs font-semibold text-destructive">{t.stillMissing} {missingLeft.join(lang === 'ar' ? '، ' : ', ')}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">{t.remember(t.sec[section])}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button isDisabled={busy || missingLeft.length > 0 || !file} onPress={() => file && void runPreview(file, Object.fromEntries((match.headers ?? []).map((h, i) => [h, match.choice[i] === IGNORE ? '' : match.choice[i] ?? ''])))}>{busy ? <Loader2 className="animate-spin" /> : <ChevronRight className="rtl:-scale-x-100" />}{t.again}</Button>
                      <Button variant="outline" onPress={reset}><X />{t.cancel}</Button>
                    </div>
                  </div>
                )}

                {preview && (
                  <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="preview-counts">
                      {counts.map((c) => (
                        <div key={c.k} className={cn('flex min-w-0 flex-col gap-1 rounded-lg px-3 py-2', c.cls)}>
                          <span className="flex items-center gap-1 truncate text-xs font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0">{c.icon}{c.label}</span>
                          <span className="text-xl font-bold tabular-nums text-foreground">{nb(n0(preview.counts?.[c.k]))}</span>
                        </div>
                      ))}
                    </div>
                    {section === 'timetable' && <p className="-mt-3 text-xs text-muted-foreground">{t.removedNote}</p>}

                    {(preview.problems ?? []).length > 0 && (
                      <div>
                        <p className="text-sm font-bold">{t.rejected}</p>
                        <p className="mb-2 text-xs text-muted-foreground">{t.rejectedD}</p>
                        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                          {(preview.problems ?? []).slice(0, 50).map((p, i) => (
                            <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm" data-testid="problem">
                              <span className="shrink-0 rounded bg-destructive-soft px-1.5 py-0.5 text-xs font-bold text-destructive tabular-nums">{t.rRow} {nb(n0(p?.row))}</span>
                              <p className="min-w-0 flex-1 break-words" dir="auto">{p?.message ?? ''}</p>
                            </li>
                          ))}
                        </ul>
                        {n0(preview.counts?.rejected) > 50 && <p className="mt-1 text-xs text-muted-foreground">{t.more(nb(n0(preview.counts?.rejected) - 50))}</p>}
                      </div>
                    )}

                    {importable === 0 ? <Alert tone="warning" icon={<TriangleAlert />}>{t.nothing}</Alert> : null}
                    {(section === 'attendance' || section === 'announcements') && importable > 0 && <Alert tone="info" icon={<Info />}>{section === 'attendance' ? t.notifyAtt : t.notifyAnn}</Alert>}

                    {sure ? (
                      <div className="flex flex-col gap-3 rounded-lg border border-primary bg-secondary p-3" role="alertdialog" aria-label={t.sure(nb(importable), t.sec[section])} data-testid="confirm-step">
                        <div><p className="text-sm font-bold">{t.sure(nb(importable), t.sec[section])}</p><p className="text-xs text-muted-foreground">{t.sureD}</p></div>
                        <div className="flex flex-wrap gap-2">
                          <Button isDisabled={busy} onPress={() => void confirm()} data-testid="confirm-yes">{busy ? <Loader2 className="animate-spin" /> : <CircleCheck />}{t.yes}</Button>
                          <Button variant="outline" isDisabled={busy} onPress={() => setSure(false)}>{t.back}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
                        <p className="flex-1 text-xs text-muted-foreground">{n0(preview.counts?.rejected) ? t.confirmNote(nb(n0(preview.counts?.rejected))) : t.confirmNoteNone}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 sm:flex-none" onPress={reset}><X />{t.cancel}</Button>
                          <Button className="flex-1 sm:flex-none" isDisabled={busy || importable === 0 || !preview.importId} onPress={() => setSure(true)} data-testid="confirm">{<CircleCheck />}{t.confirm(nb(importable))}</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!preview && !match && !busy && <EmptyState icon={<FileSpreadsheet />} title={t.waiting} />}
              </CardContent>
            </Card>
          </div>
        ) : null}

        <section>
          <SectionTitle>{t.log}</SectionTitle>
          {(status.loading || log.loading) && !log.data ? <ListSkeleton rows={4} /> : log.error ? <ErrorState error={log.error} onRetry={log.reload} /> : !ok ? null : rows.length === 0 ? (
            <Card><EmptyState icon={<FileSpreadsheet />} title={t.noLog}>{t.noLogD}</EmptyState></Card>
          ) : (
            <>
              <Card className="hidden overflow-x-auto md:block">
                <Table aria-label={t.log}>
                  <TableHeader>
                    <Column isRowHeader>{t.lFile}</Column><Column>{t.lSection}</Column><Column>{t.lResult}</Column><Column>{t.lWhen}</Column><Column>{t.lAction}</Column>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <Row key={r?.id ?? i} id={r?.id ?? `row-${i}`}>
                        <Cell><span className="inline-flex max-w-64 items-center gap-2 font-medium"><FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" /><bdi className="truncate">{fileLabel(r)}</bdi></span></Cell>
                        <Cell>{r?.section ? t.sec[r.section] ?? r.section : '—'}</Cell>
                        <Cell className="tabular-nums text-muted-foreground">{result(r)}</Cell>
                        <Cell className="whitespace-nowrap text-muted-foreground">{fmtWhen(r?.confirmedAt ?? r?.createdAt, lang)}</Cell>
                        <Cell><UndoCell r={r} /></Cell>
                      </Row>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map((r, i) => (
                  <li key={r?.id ?? i}>
                    <Card className="flex flex-col gap-2 p-3" data-testid="log-row">
                      <div className="flex items-start gap-2">
                        <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold"><bdi>{fileLabel(r)}</bdi></p><p className="text-xs text-muted-foreground">{r?.section ? t.sec[r.section] ?? r.section : ''} · {fmtWhen(r?.confirmedAt ?? r?.createdAt, lang)}</p></div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm tabular-nums">{result(r)}</span><UndoCell r={r} /></div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </SchoolShell>
  );
}

function MapRow({ col, sample, value, items, label, onChange }: { col: string; sample: string; value: string; items: { id: string; name: string }[]; label: string; onChange: (v: string) => void }) {
  return (
    <>
      <div className="min-w-0 rounded-lg border bg-muted/50 px-3 py-1.5">
        <p className="truncate text-sm font-semibold"><bdi>{col}</bdi></p>
        {sample && <p className="truncate text-xs text-muted-foreground"><bdi>{sample}</bdi></p>}
      </div>
      <Dir><ArrowRight className="size-4 text-muted-foreground" /></Dir>
      <Select aria-label={label} items={items} selectedKey={value} onSelectionChange={(k) => onChange(k ? String(k) : IGNORE)} className={cn('min-w-0', value === IGNORE && '[&_button]:text-muted-foreground')} />
    </>
  );
}
