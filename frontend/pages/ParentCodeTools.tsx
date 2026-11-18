import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer, ShieldAlert } from 'lucide-react';
import { fetchCodeClasses, printClassCodes, revokeClassCodes, saveSchoolParentSettings, getSessionUser, type ParentCodeSheet, type ParentsAdminStatus } from '../services/apiService';

// Parents P2 (PARENT_CODE_TOOLS_ENABLED) on the staff Parents page:
//   - school admin: the school's code settings (expiry 1-60 days, "teachers may issue codes");
//   - school admin, ENARA admin's school, or an allowed teacher (own classes only):
//     "Print parent codes" per class. The sheet (student, class, code, expiry) is shown
//     ONCE, printable, with a CSV download made in the browser; the codes are never in a
//     URL. A reprint makes new codes and the earlier unused ones stop working: the page
//     says so first ("Codes already printed for this class will stop working.").
//   - "Revoke this class's codes".
// The sheet carries the secret-code warning and "Never enrol parents in Moodle courses
// with ENARA activities." in English and Arabic. No QR code.

type Lang = 'en' | 'ar';
const TEXT = {
  en: {
    settings: 'Parent code settings', ttl: 'Codes last (days, 1–60)', teachers: 'Teachers may issue codes for their own classes', save: 'Save', saved: 'Saved.', saveFailed: 'Could not save. Check the values and try again.',
    sheets: 'Class code sheets', sheetsHelp: 'One new code per active student. The codes are shown once: print them or download the CSV now.',
    cls: 'Class', students: 'Students', active: 'Unused codes', print: 'Print parent codes', revoke: "Revoke this class's codes", none: 'No classes.',
    reprintWarn: 'Codes already printed for this class will stop working. Make new codes?', revokeWarn: "Every unused code of this class will stop working. Revoke them?", revoked: (n: number) => `${n} codes revoked.`,
    failed: 'Could not do that. Try again.', off: "Parent access is switched off at this school, so no codes can be issued.",
    sheetTitle: (c: string) => `Parent codes · ${c}`, student: 'Student', code: 'Code', expires: 'Expires', printNow: 'Print', csv: 'Download CSV', close: 'Close',
    howTo: 'Parents open ENARA Parents (enara.app/parents) and type the code. No password needed. One code per child.',
  },
  ar: {
    settings: 'إعدادات رموز أولياء الأمور', ttl: 'مدة صلاحية الرموز (أيام، 1–60)', teachers: 'يمكن للمعلمين إصدار رموز لفصولهم', save: 'حفظ', saved: 'تم الحفظ.', saveFailed: 'تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى.',
    sheets: 'أوراق رموز الفصول', sheetsHelp: 'رمز جديد لكل طالب نشط. تظهر الرموز مرة واحدة فقط: اطبعها أو نزّل ملف CSV الآن.',
    cls: 'الفصل', students: 'الطلاب', active: 'رموز غير مستخدمة', print: 'طباعة رموز أولياء الأمور', revoke: 'إلغاء رموز هذا الفصل', none: 'لا توجد فصول.',
    reprintWarn: 'الرموز المطبوعة سابقًا لهذا الفصل ستتوقف عن العمل. هل تريد إنشاء رموز جديدة؟', revokeWarn: 'ستتوقف كل الرموز غير المستخدمة لهذا الفصل عن العمل. هل تريد إلغاءها؟', revoked: (n: number) => `تم إلغاء ${n} رمزًا.`,
    failed: 'تعذّر تنفيذ ذلك. حاول مرة أخرى.', off: 'وصول أولياء الأمور متوقف في هذه المدرسة، لذا لا يمكن إصدار رموز.',
    sheetTitle: (c: string) => `رموز أولياء الأمور · ${c}`, student: 'الطالب', code: 'الرمز', expires: 'تنتهي في', printNow: 'طباعة', csv: 'تنزيل CSV', close: 'إغلاق',
    howTo: 'يفتح ولي الأمر بوابة أولياء الأمور (enara.app/parents) ويكتب الرمز. لا حاجة إلى كلمة مرور. رمز واحد لكل طفل.',
  },
};
// Owner decision d) and the school guide; always both languages on the printed sheet.
export const SHEET_SECRET = {
  en: "This code is secret. Anyone who has it can see your child's data. Don't share it. The school can unlink a parent at any time.",
  ar: 'هذا الرمز سري. أي شخص يحصل عليه يمكنه رؤية بيانات طفلك. لا تشاركه مع أحد. ويمكن للمدرسة إلغاء ربط أي ولي أمر في أي وقت.',
};
export const SHEET_NO_MOODLE = {
  en: 'Never enrol parents in Moodle courses with ENARA activities.',
  ar: 'لا تسجّل أولياء الأمور أبدًا في مقررات Moodle التي تحتوي على أنشطة إنارة.',
};

const day = (iso: string, lang: Lang) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
const csvCell = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

const PRINT_CSS = '@media print { body * { visibility: hidden !important; } .pc-sheet, .pc-sheet * { visibility: visible !important; } .pc-sheet { position: absolute; inset: 0; padding: 24px; } .pc-noprint { display: none !important; } }';

export const ParentCodeTools: React.FC<{ lang: Lang; status: ParentsAdminStatus }> = ({ lang, status }) => {
  const t = TEXT[lang];
  const [classes, setClasses] = useState<{ id: string; name: string; students: number; activeCodes: number }[] | null>(null);
  const [sheet, setSheet] = useState<ParentCodeSheet | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ttl, setTtl] = useState(String(status.settings?.codeTtlDays ?? 7));
  const [teachers, setTeachers] = useState(!!status.settings?.teachersMayIssueCodes);
  const load = useCallback(() => { fetchCodeClasses().then((r) => setClasses(r.classes)).catch(() => setClasses([])); }, []);
  useEffect(load, [load]);

  const fail = (e: any) => setNote(e?.code === 'PARENT_SCHOOL_ACCESS_OFF' ? t.off : t.failed);
  const saveSettings = async () => {
    setNote(null);
    const school = getSessionUser()?.institutionId;
    if (!school) return;
    try { await saveSchoolParentSettings(school, { codeTtlDays: Number(ttl), teachersMayIssueCodes: teachers }); setNote(t.saved); } catch { setNote(t.saveFailed); }
  };
  const print = async (c: { id: string; activeCodes: number }) => {
    if (c.activeCodes > 0 && !window.confirm(t.reprintWarn)) return;
    setBusy(true); setNote(null);
    try { setSheet(await printClassCodes(c.id)); load(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const revoke = async (c: { id: string }) => {
    if (!window.confirm(t.revokeWarn)) return;
    setBusy(true); setNote(null);
    try { const r = await revokeClassCodes(c.id); setNote(t.revoked(r.revoked)); load(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const downloadCsv = () => {
    if (!sheet) return;
    const lines = [['student', 'class', 'code', 'expires'].join(','), ...sheet.rows.map((r) => [r.studentName, sheet.class.name, r.code, sheet.expiresAt.slice(0, 10)].map(csvCell).join(','))];
    const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; // a blob: URL; the codes are in the file, never in an address
    a.download = `parent-codes-${sheet.class.name.replace(/[^\w-]+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6" data-testid="parent-code-tools">
      <style>{PRINT_CSS}</style>
      {status.canChangeSettings && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 pc-noprint" aria-labelledby="pc-settings">
          <h2 id="pc-settings" className="text-lg font-semibold text-slate-900">{t.settings}</h2>
          <label className="flex items-center gap-3 text-sm">{t.ttl}
            <input type="number" min={1} max={60} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-20 rounded border border-slate-300 px-2 py-1" data-testid="pc-ttl" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={teachers} onChange={(e) => setTeachers(e.target.checked)} data-testid="pc-teachers" />{t.teachers}</label>
          <button type="button" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void saveSettings()} data-testid="pc-save">{t.save}</button>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 pc-noprint" aria-labelledby="pc-classes">
        <h2 id="pc-classes" className="text-lg font-semibold text-slate-900">{t.sheets}</h2>
        <p className="text-sm text-slate-600">{t.sheetsHelp}</p>
        {note && <p className="text-sm text-slate-700" role="status" data-testid="pc-note">{note}</p>}
        {classes && !classes.length && <p className="text-sm text-slate-500">{t.none}</p>}
        {classes && classes.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-slate-500"><tr><th className="py-2 text-start">{t.cls}</th><th className="py-2 text-start">{t.students}</th><th className="py-2 text-start">{t.active}</th><th /></tr></thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100" data-testid={`pc-class-${c.id}`}>
                  <td className="py-2" dir="auto">{c.name}</td>
                  <td className="py-2">{c.students}</td>
                  <td className="py-2" data-testid="pc-active">{c.activeCodes}</td>
                  <td className="py-2 text-end space-x-2">
                    <button type="button" disabled={busy || !c.students} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void print(c)}>{t.print}</button>
                    <button type="button" disabled={busy || !c.activeCodes} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => void revoke(c)}>{t.revoke}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {sheet && (
        <section className="pc-sheet rounded-xl border border-slate-300 bg-white p-6 space-y-4" aria-labelledby="pc-sheet-title" data-testid="pc-sheet">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="pc-sheet-title" className="text-xl font-bold text-slate-900" dir="auto">{t.sheetTitle(sheet.class.name)}</h2>
              <p className="text-sm text-slate-600" dir="auto">{sheet.school}</p>
            </div>
            <div className="flex gap-2 pc-noprint">
              <button type="button" className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => window.print()}><Printer size={16} />{t.printNow}</button>
              <button type="button" className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold" onClick={downloadCsv} data-testid="pc-csv"><Download size={16} />{t.csv}</button>
              <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setSheet(null)}>{t.close}</button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1" role="note" data-testid="pc-secret">
            <p className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 flex-none" /><span lang="en" dir="ltr">{SHEET_SECRET.en}</span></p>
            <p lang="ar" dir="rtl">{SHEET_SECRET.ar}</p>
          </div>
          <p className="text-sm text-slate-700">{t.howTo}</p>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="text-slate-500"><th className="py-2 text-start">{t.student}</th><th className="py-2 text-start">{t.cls}</th><th className="py-2 text-start">{t.code}</th><th className="py-2 text-start">{t.expires}</th></tr></thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.codeId} className="border-t border-slate-200" data-testid="pc-row">
                  <td className="py-2" dir="auto">{r.studentName}</td>
                  <td className="py-2" dir="auto">{sheet.class.name}</td>
                  <td className="py-2 font-mono font-bold tracking-wider" dir="ltr" data-testid="pc-code">{r.code}</td>
                  <td className="py-2">{day(sheet.expiresAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-slate-600 space-y-1" data-testid="pc-no-moodle">
            <p lang="en" dir="ltr">{SHEET_NO_MOODLE.en}</p>
            <p lang="ar" dir="rtl">{SHEET_NO_MOODLE.ar}</p>
          </div>
        </section>
      )}
    </div>
  );
};
