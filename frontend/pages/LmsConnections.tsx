import React, { useCallback, useEffect, useState } from 'react';
import {
  addLmsDeployment,
  approveLmsDeployment,
  approveLmsPlatform,
  createLmsPlatform,
  disableLmsPlatform,
  fetchLmsPlatforms,
  fetchLmsSeats,
  fetchLmsStatus,
  getSessionUser,
  LmsPlatformView,
  LmsSeats,
  LmsStatus,
  updateLmsSeats,
} from '../services/apiService';

// "LMS connections" (Phase 1a): register an LMS by hand (LTI 1.3), see its
// status, deployments and launches, and the school's seats. A school admin's
// new connection waits for an ENARA admin's approval. ENARA admins see every
// school, approve connections and set seat limits.

const EMPTY = { vendor: 'moodle', issuer: '', clientId: '', authLoginUrl: '', authTokenUrl: '', keysetUrl: '', deploymentIds: '', institutionId: '' };

const Copy: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1.5">
    <span className="text-sm text-slate-500 sm:w-44 shrink-0">{label}</span>
    <code className="text-sm bg-slate-100 rounded px-2 py-1 break-all flex-1">{value}</code>
    <button className="text-sm text-teal-700 font-semibold" onClick={() => navigator.clipboard?.writeText(value)}>Copy</button>
  </div>
);

const STATUS_STYLE: Record<string, string> = { active: 'bg-teal-50 text-teal-700', pending: 'bg-amber-50 text-amber-700', disabled: 'bg-slate-100 text-slate-500' };

export const LmsConnections: React.FC = () => {
  const isEnara = getSessionUser()?.role === 'enara-admin';
  const [status, setStatus] = useState<LmsStatus | null>(null);
  const [platforms, setPlatforms] = useState<LmsPlatformView[]>([]);
  const [seats, setSeats] = useState<LmsSeats | null>(null);
  const [flagged, setFlagged] = useState<LmsSeats[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [seatForm, setSeatForm] = useState({ institutionId: '', seatLimit: '', hardCap: false });

  const load = useCallback(async () => {
    try {
      const [s, p, seat] = await Promise.all([fetchLmsStatus(), fetchLmsPlatforms(), fetchLmsSeats()]);
      setStatus(s);
      setPlatforms(p.platforms);
      setSeats(seat.seats ?? null);
      setFlagged(seat.flagged ?? []);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      vendor: form.vendor,
      issuer: form.issuer.trim(),
      clientId: form.clientId.trim(),
      authLoginUrl: form.authLoginUrl.trim(),
      keysetUrl: form.keysetUrl.trim(),
      deploymentIds: form.deploymentIds.split(/[\s,]+/).filter(Boolean),
      ...(form.authTokenUrl.trim() ? { authTokenUrl: form.authTokenUrl.trim() } : {}),
      ...(isEnara ? { institutionId: form.institutionId.trim() } : {}),
    };
    void act(async () => {
      await createLmsPlatform(body);
      setForm(EMPTY);
    }, status?.requireApproval ? 'Saved. ENARA will review and approve this connection.' : 'Connected.');
  };

  const field = (key: keyof typeof EMPTY, label: string, placeholder: string, help?: string) => (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
      {help && <span className="text-xs text-slate-500">{help}</span>}
    </label>
  );

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">LMS connections</h1>
        <p className="text-slate-500 mt-1">Connect your school's LMS (Moodle or any LTI 1.3 platform) so teachers and students open ENARA from their courses.</p>
      </div>

      {message && <div className={`rounded-lg px-4 py-3 text-sm ${message.ok ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'}`}>{message.text}</div>}

      {seats && (
        <section className={`rounded-2xl border p-5 ${seats.overLimit ? 'border-amber-300 bg-amber-50' : 'border-slate-100 bg-white'}`}>
          <h2 className="font-bold text-slate-900">Seats</h2>
          <p className="text-sm text-slate-600 mt-1">
            {seats.seatsUsed} students{seats.seatLimit !== null ? ` of ${seats.seatLimit} seats` : ''} ({seats.lmsStudents} from your LMS). One seat per student, however many courses they are in.
          </p>
          {seats.overLimit && <p className="text-sm text-amber-800 mt-2 font-semibold">Your school is over its seat limit. Students can still sign in; ENARA will contact you about your plan.</p>}
        </section>
      )}

      {status && (
        <section className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-bold text-slate-900 mb-1">1. Enter these in your LMS</h2>
          <p className="text-sm text-slate-500 mb-3">In Moodle: Site administration › Plugins › Activity modules › External tool › Manage tools › configure a tool manually, LTI version 1.3, public key type "Keyset URL".</p>
          <Copy label="Tool URL" value={status.tool.launchUrl} />
          <Copy label="Initiate login URL" value={status.tool.loginUrl} />
          <Copy label="Redirection URI(s)" value={status.tool.redirectUris.join('\n')} />
          <Copy label="Public keyset URL" value={status.tool.jwksUrl} />
        </section>
      )}

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold text-slate-900 mb-1">2. Add your LMS here</h2>
        <p className="text-sm text-slate-500 mb-4">Copy these from your LMS's tool details (in Moodle: the "View configuration details" icon next to the tool).</p>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">LMS type</span>
            <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}>
              {(status?.presets ?? [{ id: 'moodle', label: 'Moodle' }, { id: 'generic', label: 'Other LTI 1.3 platform' }]).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {isEnara && field('institutionId', 'School ID', 'institution id')}
          {field('issuer', 'Platform ID (issuer)', 'https://yourschool.moodlecloud.com', 'Exactly as the LMS shows it.')}
          {field('clientId', 'Client ID', 'e.g. a1B2c3D4e5')}
          {field('deploymentIds', 'Deployment ID(s)', 'e.g. 1', 'Separate several with commas.')}
          {field('authLoginUrl', 'Authentication request URL', 'https://…/mod/lti/auth.php')}
          {field('keysetUrl', 'Public keyset URL', 'https://…/mod/lti/certs.php')}
          {field('authTokenUrl', 'Access token URL (optional)', 'https://…/mod/lti/token.php')}
          <div className="sm:col-span-2">
            <button disabled={busy} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm disabled:opacity-60">Add LMS</button>
            {status?.requireApproval && <span className="ml-3 text-sm text-slate-500">New connections are checked by ENARA before they work.</span>}
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold text-slate-900 mb-3">Connected LMSs</h2>
        {platforms.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        <div className="space-y-4">
          {platforms.map((p) => (
            <div key={p.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 break-all">{p.issuer}</span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                <span className="text-xs text-slate-500">{p.vendor} · client {p.clientId}{isEnara ? ` · school ${p.institutionId}` : ''}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {p.launchCount} launches ({p.cookielessLaunchCount} without cookies){p.lastLaunchAt ? ` · last ${new Date(p.lastLaunchAt).toLocaleString()}` : ''}
              </p>
              <p className="text-sm text-slate-600">
                Deployments:{' '}
                {p.deployments.map((d) => (
                  <span key={d.id} className="mr-3">
                    {d.deploymentId} <span className="text-xs text-slate-500">({d.status})</span>
                    {isEnara && d.status === 'pending' && p.status === 'active' && (
                      <button className="ml-1 text-xs text-teal-700 font-semibold" onClick={() => act(() => approveLmsDeployment(d.id), 'Deployment approved.')}>approve</button>
                    )}
                  </span>
                ))}
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                {isEnara && p.status !== 'active' && (
                  <button disabled={busy} className="text-sm font-semibold text-teal-700" onClick={() => act(() => approveLmsPlatform(p.id), 'Connection approved.')}>
                    {p.status === 'pending' ? 'Approve' : 'Switch on again'}
                  </button>
                )}
                {p.status !== 'disabled' && (
                  <button disabled={busy} className="text-sm font-semibold text-red-700" onClick={() => window.confirm('Switch off this LMS connection? Launches from it will stop.') && act(() => disableLmsPlatform(p.id), 'Connection switched off.')}>
                    Switch off
                  </button>
                )}
                {p.status !== 'disabled' && (
                  <button disabled={busy} className="text-sm font-semibold text-slate-700" onClick={() => { const d = window.prompt('New deployment ID'); if (d) void act(() => addLmsDeployment(p.id, d), 'Deployment added.'); }}>
                    Add deployment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isEnara && (
        <section className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-bold text-slate-900 mb-3">Seat limits (ENARA admins)</h2>
          {flagged.length > 0 && (
            <ul className="text-sm text-amber-800 mb-4 list-disc pl-5">
              {flagged.map((f) => (
                <li key={f.institutionId}>School {f.institutionId}: {f.seatsUsed} students, limit {f.seatLimit ?? 'none'}{f.billingFlaggedAt ? ' · flagged for billing' : ''}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">School ID<input className="block mt-1 border border-slate-200 rounded-lg px-3 py-2" value={seatForm.institutionId} onChange={(e) => setSeatForm({ ...seatForm, institutionId: e.target.value })} /></label>
            <label className="text-sm">Seat limit (empty = none)<input className="block mt-1 border border-slate-200 rounded-lg px-3 py-2 w-32" value={seatForm.seatLimit} onChange={(e) => setSeatForm({ ...seatForm, seatLimit: e.target.value })} /></label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={seatForm.hardCap} onChange={(e) => setSeatForm({ ...seatForm, hardCap: e.target.checked })} />Hard cap</label>
            <button disabled={busy || !seatForm.institutionId} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-60"
              onClick={() => act(() => updateLmsSeats({ institutionId: seatForm.institutionId.trim(), seatLimit: seatForm.seatLimit.trim() ? Number(seatForm.seatLimit) : null, hardCap: seatForm.hardCap }), 'Seat settings saved.')}>
              Save
            </button>
            <button disabled={busy || !seatForm.institutionId} className="text-sm font-semibold text-slate-700"
              onClick={() => act(() => updateLmsSeats({ institutionId: seatForm.institutionId.trim(), clearBillingFlag: true }), 'Billing flag cleared.')}>
              Clear billing flag
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
