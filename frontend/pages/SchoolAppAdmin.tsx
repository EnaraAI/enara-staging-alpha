import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/apiService';
import { readXlsx, toCsv, writeXlsx } from './schoolApp/xlsx';

// Parents school app (a3): the school admin's screens on the staff Parents page.
//   - Section switches for the school (each needs the site switch too; ENARA only shows school data).
//   - Per section (timetable, attendance, announcements): an Excel template built from the school's own classes, upload of
//     .xlsx or .csv, a preview (new / changed / unchanged / removed / rejected with reasons), confirm, and undo for 24 hours.
//   - Announcements written on the screen, and withdraw.
// Hidden while every SCHOOL_APP_*_ENABLED switch is off (the status call answers 404).
type Lang = 'en' | 'ar';
type Section = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees';
type ImportSection = 'timetable' | 'attendance' | 'announcements' | 'fees';
const SECTIONS: Section[] = ['timetable', 'attendance', 'announcements', 'notifications', 'fees'];
const IMPORTS: ImportSection[] = ['timetable', 'attendance', 'announcements', 'fees'];
interface Status { feesVisibleTo?: 'all' | 'owner'; institutionId: string | null; available: Record<Section, boolean>; sections: Record<Section, boolean>; templates: Partial<Record<ImportSection, { key: string; required: boolean; header: string; headerAr: string | null }[]>> }
interface Roster { groups: { name: string; students: { id: string; name: string; grade: string | null }[] }[]; withoutGroup: { id: string; name: string; grade: string | null }[] }
interface Preview { importId: string; section: ImportSection; counts: Record<string, number>; problems: { row: number; message: string }[] }
interface ImportRow { id: string; section: ImportSection; fileName?: string; status: string; counts?: Record<string, number>; createdAt: string; confirmedAt?: string; canUndo: boolean }
interface Ann { id: string; audience: string; audienceValue: string | null; title: string; body: string; publishAt: string; expiresAt: string | null; withdrawn: boolean }

const TEXT = {
  en: {
    title: 'School app for parents', sub: 'Information the school shares with parents. ENARA only shows it; the school is the source.',
    sections: 'Sections parents see', section: { timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', notifications: 'In-app notifications (absence, lateness, announcements, fee reminders)', fees: 'Fees (display only: the school records payments)' } as Record<string, string>,
    fees: { title: 'Fees and instalments', visibility: 'Who in a family sees fees', all: 'Every linked guardian', owner: 'The main guardian only', filter: { overdue: 'Overdue', due: 'Due', paid: 'Paid', all: 'All' } as Record<string, string>, student: 'Student', plan: 'Plan', no: 'No.', amount: 'Amount (EGP)', due: 'Due date', status: 'Status', markPaid: 'Mark paid', waive: 'Waive', reopen: 'Mark due', receiptRef: 'Receipt no.', none: 'No instalments here.', st: { due: 'Due', overdue: 'Overdue', paid: 'Paid', waived: 'Waived' } as Record<string, string>, totals: (p: string, r: string, o: string) => `Paid ${p} · Remaining ${r} · Overdue ${o} (EGP)`, note: 'ENARA never takes payments. Mark an instalment paid after the school receives the money; parents see it at once.' },
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
    sections: 'الأقسام التي يراها أولياء الأمور', section: { timetable: 'الجدول', attendance: 'الحضور', announcements: 'الإعلانات', notifications: 'الإشعارات داخل التطبيق (الغياب والتأخر والإعلانات وتذكير الأقساط)', fees: 'الرسوم (عرض فقط: المدرسة تسجّل المدفوعات)' } as Record<string, string>,
    fees: { title: 'الرسوم والأقساط', visibility: 'من يرى الرسوم في الأسرة', all: 'كل أولياء الأمور المرتبطين', owner: 'ولي الأمر الأساسي فقط', filter: { overdue: 'متأخر', due: 'مستحق', paid: 'مدفوع', all: 'الكل' } as Record<string, string>, student: 'الطالب', plan: 'الخطة', no: 'رقم', amount: 'المبلغ (جنيه)', due: 'تاريخ الاستحقاق', status: 'الحالة', markPaid: 'تسجيل الدفع', waive: 'إعفاء', reopen: 'إعادة إلى مستحق', receiptRef: 'رقم الإيصال', none: 'لا أقساط هنا.', st: { due: 'مستحق', overdue: 'متأخر', paid: 'مدفوع', waived: 'معفى' } as Record<string, string>, totals: (p: string, r: string, o: string) => `المدفوع ${p} · المتبقي ${r} · المتأخر ${o} (جنيه)`, note: 'إنارة لا تستقبل أي مدفوعات. سجّل دفع القسط بعد أن تستلم المدرسة المبلغ؛ ويظهر لأولياء الأمور فورًا.' },
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

      {IMPORTS.filter((s) => status.templates[s] && status.available[s]).map((s) => <ImportCard key={s} lang={lang} section={s} on={!!status.sections[s]} template={status.templates[s]!} roster={roster} onDone={reloadImports} />)}
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

interface Inst { id: string; studentId: string; studentName: string; planName: string; number: number; amount: number; dueDate: string; status: 'due' | 'overdue' | 'paid' | 'waived'; paidDate: string | null; receiptRef: string | null }
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
                    ) : <button type="button" className={btn} onClick={() => void mark(i, 'due')}>{t.reopen}</button>}
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
