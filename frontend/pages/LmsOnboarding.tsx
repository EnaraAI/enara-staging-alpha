import React, { useCallback, useEffect, useState } from 'react';
import {
  createLmsSchool,
  fetchLmsOnboardings,
  LmsNewSchoolResult,
  LmsOnboardingRow,
  markLmsInviteSent,
  sendLmsInviteEmail,
} from '../services/apiService';
import { InviteBox, LmsSchoolStatus } from './LmsSchoolStatus';

// LMS step 2 (ENARA admins): "New school". One form makes the school, its
// school-admin invitation (the existing invitation flow) and a one-URL Moodle
// link made by ENARA (the connection is active on registration). The result is
// the invite screen: the Moodle link and the school admin's account link
// (both shown once), the invite text in English and Arabic with Copy buttons,
// and "Send email" (only when emails are on; off on lms-test). Below, every
// onboarded school with its status page.
//
// data-testid attributes are stable for the end-to-end suite.

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'EG', label: 'Egypt' }, { code: 'SA', label: 'Saudi Arabia' }, { code: 'AE', label: 'United Arab Emirates' }, { code: 'KW', label: 'Kuwait' },
  { code: 'QA', label: 'Qatar' }, { code: 'BH', label: 'Bahrain' }, { code: 'OM', label: 'Oman' }, { code: 'JO', label: 'Jordan' },
  { code: 'LB', label: 'Lebanon' }, { code: 'IQ', label: 'Iraq' }, { code: 'MA', label: 'Morocco' }, { code: 'TN', label: 'Tunisia' },
  { code: 'DZ', label: 'Algeria' }, { code: 'GB', label: 'United Kingdom' }, { code: 'US', label: 'United States' },
];
const TIME_ZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Amman', 'Asia/Beirut', 'Asia/Baghdad', 'Africa/Casablanca', 'Africa/Tunis', 'Africa/Algiers', 'Europe/London', 'UTC'];

const EMPTY = {
  name: '', country: 'EG', timeZone: 'Africa/Cairo', emailLanguage: '' as '' | 'ar' | 'en', seatLimit: '',
  schoolAdminName: '', schoolAdminEmail: '', moodleAdminEmail: '', features: 'all' as 'all' | 'none',
};

export const LmsOnboarding: React.FC = () => {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LmsNewSchoolResult | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [rows, setRows] = useState<LmsOnboardingRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await fetchLmsOnboardings()).onboardings);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // D1: Egyptian schools default to Arabic emails; others to English.
  const defaultLang = form.country === 'EG' ? 'ar' : 'en';
  const lang = form.emailLanguage || defaultLang;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const seat = form.seatLimit.trim();
      const r = await createLmsSchool({
        name: form.name.trim(),
        country: form.country,
        timeZone: form.timeZone,
        emailLanguage: lang,
        ...(seat ? { seatLimit: Number(seat) } : {}),
        schoolAdminName: form.schoolAdminName.trim(),
        schoolAdminEmail: form.schoolAdminEmail.trim(),
        ...(form.moodleAdminEmail.trim() ? { moodleAdminEmail: form.moodleAdminEmail.trim() } : {}),
        features: form.features,
      });
      setResult(r);
      setEmailSent(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm';
  const label = 'block text-sm font-semibold text-slate-700';

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8" data-testid="lms-onboarding-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New school (LMS)</h1>
        <p className="text-slate-500 mt-1">Create a school, invite its admin and make its one-URL Moodle link. The connection is active as soon as Moodle registers.</p>
      </div>
      {error && <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700" data-testid="lms-onboarding-error">{error}</div>}

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4" data-testid="lms-new-school-form">
          <label className={label}>School name
            <input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="lms-new-school-name" />
          </label>
          <label className={label}>Country
            <select className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="lms-new-school-country">
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
            </select>
          </label>
          <label className={label}>Time zone
            <select className={input} value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })} data-testid="lms-new-school-timezone">
              {TIME_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className={label}>Email language
            <select className={input} value={form.emailLanguage} onChange={(e) => setForm({ ...form, emailLanguage: e.target.value as '' | 'ar' | 'en' })} data-testid="lms-new-school-email-language">
              <option value="">Default for the country ({defaultLang === 'ar' ? 'Arabic' : 'English'})</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className={label}>Seat limit (optional)
            <input className={input} inputMode="numeric" pattern="[0-9]*" value={form.seatLimit} onChange={(e) => setForm({ ...form, seatLimit: e.target.value })} data-testid="lms-new-school-seat-limit" />
          </label>
          <label className={label}>School features
            <select className={input} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value as 'all' | 'none' })} data-testid="lms-new-school-features">
              <option value="all">All on (like the test schools)</option>
              <option value="none">All off (switch on later)</option>
            </select>
          </label>
          <label className={label}>School admin name
            <input required className={input} value={form.schoolAdminName} onChange={(e) => setForm({ ...form, schoolAdminName: e.target.value })} data-testid="lms-new-school-admin-name" />
          </label>
          <label className={label}>School admin email
            <input required type="email" className={input} dir="ltr" value={form.schoolAdminEmail} onChange={(e) => setForm({ ...form, schoolAdminEmail: e.target.value })} data-testid="lms-new-school-admin-email" />
          </label>
          <label className={label}>Moodle admin email (optional, may be the same)
            <input type="email" className={input} dir="ltr" value={form.moodleAdminEmail} onChange={(e) => setForm({ ...form, moodleAdminEmail: e.target.value })} data-testid="lms-new-school-moodle-admin-email" />
          </label>
          <div className="sm:col-span-2">
            <button disabled={busy} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm disabled:opacity-60" data-testid="lms-new-school-submit">Create school and invite</button>
          </div>
        </form>
      </section>

      {result && (
        <section className="bg-white rounded-2xl border border-teal-200 p-5" data-testid="lms-new-school-result" data-institution-id={result.institution.id}>
          <h2 className="font-bold text-slate-900">Invite for {result.institution.name}</h2>
          <p className="text-sm text-slate-600 mt-1">
            School ID <code dir="ltr" data-testid="lms-new-school-id">{result.institution.id}</code> · email language {result.institution.emailLanguage === 'ar' ? 'Arabic' : 'English'} · time zone {result.institution.timeZone}
          </p>
          <div className="mt-3 text-sm">
            <span className="font-semibold">School admin account link</span> (shown once; send it to the school admin so they can sign in and follow the status page):
            <code className="block mt-1 bg-slate-100 rounded px-2 py-1 break-all" dir="ltr" data-testid="lms-new-school-account-link">{result.inviteLink}</code>
          </div>
          <InviteBox url={result.url} expiresAt={result.registrationLink.expiresAt} texts={result.invite} emailAvailable={result.emailAvailable} canEmail busy={busy}
            onCopied={() => void markLmsInviteSent(result.institution.id).catch(() => undefined)}
            onSendEmail={() => { setBusy(true); void sendLmsInviteEmail(result.institution.id).then(() => setEmailSent(true)).catch((e) => setError((e as Error).message)).finally(() => setBusy(false)); }} />
          {emailSent && <p className="text-sm text-teal-700 mt-2" data-testid="lms-invite-email-sent">Email sent.</p>}
          <button type="button" className="mt-3 text-sm font-semibold text-teal-700" onClick={() => setOpen(result.institution.id)} data-testid="lms-new-school-open-status">Open the status page</button>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold text-slate-900 mb-3">Onboarded schools</h2>
        {rows.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y divide-slate-100" data-testid="lms-onboarding-list">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-3 text-sm" data-testid="lms-onboarding-row" data-institution-id={r.institutionId}>
                <span className="font-semibold text-slate-900">{r.name ?? r.institutionId}</span>
                <span className="text-xs text-slate-500" dir="ltr">{r.institutionId}</span>
                <span className="text-xs text-slate-500">made {new Date(r.createdAt).toLocaleString()}{r.inviteSentAt ? ` · invite sent ${new Date(r.inviteSentAt).toLocaleString()}` : ' · invite not sent yet'}</span>
                <span className="text-xs text-slate-500">{r.connections} connection{r.connections === 1 ? '' : 's'}{r.lastCheckOutcome ? ` · last check: ${r.lastCheckOutcome}` : ''}</span>
                <button type="button" className="text-sm font-semibold text-teal-700" onClick={() => setOpen(open === r.institutionId ? null : r.institutionId)} data-testid="lms-onboarding-open-status">
                  {open === r.institutionId ? 'Hide status' : 'Status'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <div className="border-t border-slate-200 -mx-4 sm:-mx-8"><LmsSchoolStatus key={open} institutionId={open} isEnara /></div>}
    </div>
  );
};
