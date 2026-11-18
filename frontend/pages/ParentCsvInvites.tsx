import React, { useCallback, useEffect, useState } from 'react';
import { fetchCsvInvites, previewCsvInvites, resendCsvInvite, revokeCsvInvite, sendCsvInvites, type CsvRow, type CsvRowStatus } from '../services/apiService';

// Parents P5 (PARENT_CSV_INVITES_ENABLED + the school's "CSV invites" setting): the school
// admin's "Invite parents (CSV)". The file is read in the browser and sent as text; it is
// never stored. Preview first (every row marked), nothing is sent until Confirm. Rows with
// the same parent email become ONE email listing each child's first name and code; the
// codes are only in that email. Then the list: status, Resend (a new code), Revoke.

type Lang = 'en' | 'ar';
const TEXT = {
  en: {
    title: 'Invite parents (CSV)',
    help: 'Columns: student_ref, parent_email, parent_name (optional), language (en or ar, optional). student_ref is the ENARA student ID or the Moodle user ID, never an email. Nothing is sent until you confirm.',
    file: 'CSV file', preview: 'Check the file', confirm: (n: number, e: number) => `Send ${e} invitation email${e === 1 ? '' : 's'} (${n} child${n === 1 ? '' : 'ren'})`, cancel: 'Cancel',
    row: 'Row', ref: 'Student', email: 'Parent email', result: 'Check',
    status: { ok: 'OK', bad_email: 'Bad email', unknown_student: 'Unknown student', archived: 'Archived student', duplicate: 'Duplicate row', missing: 'Missing value' } as Record<CsvRowStatus, string>,
    sent: (n: number, e: number) => `${n} invitation${n === 1 ? '' : 's'} sent in ${e} email${e === 1 ? '' : 's'}. The codes are only in the parents' emails.`,
    list: 'Invitations', none: 'No invitations yet.', resend: 'Resend', revoke: 'Revoke', resent: 'A new code was sent; the old one stopped working.', revokedNote: 'Revoked: the code stopped working.',
    inviteStatus: { sent: 'Sent', redeemed: 'Redeemed', expired: 'Expired', revoked: 'Revoked' } as Record<string, string>,
    failed: 'Could not do that. Check the file and try again.', off: 'CSV invitations are not switched on for this school.',
  },
  ar: {
    title: 'دعوة أولياء الأمور (CSV)',
    help: 'الأعمدة: student_ref و parent_email و parent_name (اختياري) و language (en أو ar، اختياري). student_ref هو رقم الطالب في إنارة أو رقم المستخدم في Moodle، وليس بريدًا إلكترونيًا. لن يُرسل شيء قبل التأكيد.',
    file: 'ملف CSV', preview: 'فحص الملف', confirm: (n: number, e: number) => `إرسال ${e} رسالة دعوة (${n} طالب)`, cancel: 'إلغاء',
    row: 'السطر', ref: 'الطالب', email: 'بريد ولي الأمر', result: 'النتيجة',
    status: { ok: 'سليم', bad_email: 'بريد غير صحيح', unknown_student: 'طالب غير معروف', archived: 'طالب مؤرشف', duplicate: 'سطر مكرر', missing: 'قيمة ناقصة' } as Record<CsvRowStatus, string>,
    sent: (n: number, e: number) => `تم إرسال ${n} دعوة في ${e} رسالة. الرموز موجودة فقط في رسائل أولياء الأمور.`,
    list: 'الدعوات', none: 'لا توجد دعوات بعد.', resend: 'إعادة الإرسال', revoke: 'إلغاء', resent: 'أُرسل رمز جديد وتوقف الرمز القديم.', revokedNote: 'تم الإلغاء: توقف الرمز عن العمل.',
    inviteStatus: { sent: 'أُرسلت', redeemed: 'استُخدمت', expired: 'انتهت', revoked: 'أُلغيت' } as Record<string, string>,
    failed: 'تعذّر تنفيذ ذلك. تحقق من الملف وحاول مرة أخرى.', off: 'دعوات CSV غير مفعّلة لهذه المدرسة.',
  },
};

export const ParentCsvInvites: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TEXT[lang];
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: CsvRow[]; counts: Record<CsvRowStatus, number>; emails: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Awaited<ReturnType<typeof fetchCsvInvites>>['invites'] | null>(null);
  const load = useCallback(() => { fetchCsvInvites().then((r) => setList(r.invites)).catch(() => setList([])); }, []);
  useEffect(load, [load]);
  const fail = (e: any) => setNote(e?.code === 'CSV_INVITES_OFF' ? t.off : e?.message && lang === 'en' ? e.message : t.failed);

  const onFile = async (f: File | undefined) => {
    setPreview(null); setNote(null);
    setCsv(f ? await f.text() : null);
  };
  const check = async () => {
    if (!csv) return;
    setBusy(true); setNote(null);
    try { setPreview(await previewCsvInvites(csv)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!csv) return;
    setBusy(true); setNote(null);
    try {
      const r = await sendCsvInvites(csv);
      setNote(t.sent(r.invited, r.emails));
      setPreview(null); setCsv(null);
      load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setNote(null);
    try { await fn(); setNote(done); load(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 pc-noprint" aria-labelledby="pci-title" data-testid="parent-csv-invites">
      <h2 id="pci-title" className="text-lg font-semibold text-slate-900">{t.title}</h2>
      <p className="text-sm text-slate-600">{t.help}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">{t.file} <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="pci-file" /></label>
        <button type="button" disabled={!csv || busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void check()}>{t.preview}</button>
      </div>
      {note && <p className="text-sm text-slate-700" role="status" data-testid="pci-note">{note}</p>}
      {preview && (
        <div className="space-y-3" data-testid="pci-preview">
          <table className="w-full text-sm">
            <thead className="text-slate-500"><tr><th className="py-1 text-start">{t.row}</th><th className="py-1 text-start">{t.ref}</th><th className="py-1 text-start">{t.email}</th><th className="py-1 text-start">{t.result}</th></tr></thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.row} className="border-t border-slate-100" data-testid="pci-row" data-status={r.status}>
                  <td className="py-1">{r.row}</td>
                  <td className="py-1" dir="auto">{r.studentName ?? r.studentRef}</td>
                  <td className="py-1" dir="ltr">{r.email ?? ''}</td>
                  <td className={`py-1 font-semibold ${r.status === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>{t.status[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !preview.counts.ok} className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void confirm()} data-testid="pci-confirm">{t.confirm(preview.counts.ok, preview.emails)}</button>
            <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setPreview(null)}>{t.cancel}</button>
          </div>
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-slate-900">{t.list}</h3>
        {list && !list.length && <p className="text-sm text-slate-500">{t.none}</p>}
        {list && list.length > 0 && (
          <table className="w-full text-sm" data-testid="pci-list">
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="border-t border-slate-100" data-testid="pci-invite" data-status={i.status}>
                  <td className="py-1" dir="auto">{i.studentName ?? '—'}</td>
                  <td className="py-1" dir="ltr">{i.email}</td>
                  <td className="py-1">{t.inviteStatus[i.status] ?? i.status}</td>
                  <td className="py-1 text-end space-x-2">
                    {i.status !== 'redeemed' && i.status !== 'revoked' && <button type="button" disabled={busy} className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => void act(() => resendCsvInvite(i.id), t.resent)}>{t.resend}</button>}
                    {i.status === 'sent' && <button type="button" disabled={busy} className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => void act(() => revokeCsvInvite(i.id), t.revokedNote)}>{t.revoke}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
