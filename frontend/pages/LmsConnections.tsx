import React, { useCallback, useEffect, useState } from 'react';
import {
  addLmsDeployment,
  approveLmsDeployment,
  approveLmsPlatform,
  createLmsPlatform,
  createLmsRegistrationLink,
  disableLmsPlatform,
  fetchLmsContextRoster,
  fetchLmsContexts,
  fetchLmsGrades,
  fetchLmsPlatforms,
  fetchLmsRegistrationLinks,
  fetchLmsSeats,
  fetchLmsStatus,
  getSessionUser,
  LmsContextView,
  LmsGradeStats,
  LmsNotStarted,
  LmsPlatformView,
  LmsRegistrationLink,
  LmsSeats,
  LmsStatus,
  resyncLmsGrades,
  revokeLmsRegistrationLink,
  retryLmsDeadGrades,
  syncLmsRoster,
  updateLmsSeats,
} from '../services/apiService';
import { LmsProblems } from './LmsProblems';

// "LMS connections" (Phase 1a): register an LMS by hand (LTI 1.3), see its
// status, deployments and launches, and the school's seats. A school admin's
// new connection waits for an ENARA admin's approval. ENARA admins see every
// school, approve connections and set seat limits.
// Phase 3: when grade passback is switched on, each connection also shows its
// grade outbox (waiting, sent, failed, the last error code) with "Re-sync
// grades" and "Retry failed".
// Phase 4: when roster sync is switched on, each connection lists its LMS
// courses: last roster sync, counts, the last error code, "Sync roster now",
// and the students the LMS lists who have not opened ENARA yet ("not started",
// shown separately from seats: they take no seat until their first launch).
// Phase 1b: "Connect Moodle (one URL)": a one-time link (7 days) the Moodle
// admin pastes into Moodle (LTI Dynamic Registration). The URL is shown once;
// the list shows each link's status, and an unused link can be cancelled.

const EMPTY = { vendor: 'moodle', issuer: '', clientId: '', authLoginUrl: '', authTokenUrl: '', keysetUrl: '', publicKey: '', deploymentIds: '', institutionId: '' };

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
  // null: grade passback is off (the API answers 404).
  const [grades, setGrades] = useState<Record<string, LmsGradeStats> | null>(null);
  // null: roster sync is off (the API answers 404).
  const [contexts, setContexts] = useState<LmsContextView[] | null>(null);
  const [notStarted, setNotStarted] = useState<Record<string, LmsNotStarted[]>>({});

  // Phase 1b: one-URL registration links.
  const [links, setLinks] = useState<LmsRegistrationLink[]>([]);
  const [linkSchool, setLinkSchool] = useState('');
  const [newLink, setNewLink] = useState<{ url: string; expiresAt: string; willBe: 'active' | 'pending' } | null>(null);

  // The LMS is switched on but its configuration has a problem (ENARA admins only; variable names only).
  const [configProblem, setConfigProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const first = await fetchLmsStatus();
      if (first.enabled === false && 'problem' in first) {
        setConfigProblem(first.problem);
        return;
      }
      setConfigProblem(null);
      const [p, seat, g, c, l] = await Promise.all([fetchLmsPlatforms(), fetchLmsSeats(), fetchLmsGrades().catch(() => null), fetchLmsContexts().catch(() => null), fetchLmsRegistrationLinks().catch(() => null)]);
      setLinks(l ? l.links : []);
      const s = first as LmsStatus;
      setContexts(c ? c.contexts : null);
      setStatus(s);
      setPlatforms(p.platforms);
      setSeats(seat.seats ?? null);
      setFlagged(seat.flagged ?? []);
      setGrades(g ? Object.fromEntries(g.platforms.map((x) => [x.platformId, x])) : null);
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
      ...(form.keysetUrl.trim() ? { keysetUrl: form.keysetUrl.trim() } : {}),
      // Step 2: a Moodle the internet cannot reach: its public key instead of (or as well as) the keyset URL.
      ...(form.publicKey.trim() ? { publicKey: form.publicKey.trim() } : {}),
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

  if (configProblem) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-slate-900">LMS connections</h1>
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700" data-testid="lms-config-problem">
          The LMS integration is switched on but stays off because of a configuration problem: {configProblem}. Fix the server settings and redeploy.
        </div>
      </div>
    );
  }
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
          {typeof seats.notStarted === 'number' && (
            <p className="text-sm text-slate-600" data-testid="lms-not-started-seats">
              Not started: {seats.notStarted} (in your LMS courses but have not opened ENARA yet; not counted as seats until their first launch).
            </p>
          )}
          {seats.overLimit && <p className="text-sm text-amber-800 mt-2 font-semibold">Your school is over its seat limit. Students can still sign in; ENARA will contact you about your plan.</p>}
        </section>
      )}

      {status && (
        <section className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="lms-connect-moodle">
          <h2 className="font-bold text-slate-900 mb-1">Connect Moodle (one URL)</h2>
          <p className="text-sm text-slate-500 mb-3">
            The easiest way: make a link, and the Moodle site administrator pastes it into Moodle. Moodle and ENARA exchange everything else.
            Each link is for {isEnara ? 'one school' : 'your school'}, works once, and expires after 7 days.
            {status.requireApproval && ' ENARA checks the new connection before teachers and students can use it.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {isEnara && (
              <label className="text-sm">School ID
                <input className="block mt-1 border border-slate-200 rounded-lg px-3 py-2" value={linkSchool} placeholder="institution id" onChange={(e) => setLinkSchool(e.target.value)} />
              </label>
            )}
            <button disabled={busy || (isEnara && !linkSchool.trim())} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm disabled:opacity-60"
              onClick={() => act(async () => {
                const r = await createLmsRegistrationLink(isEnara ? linkSchool.trim() : undefined);
                setNewLink({ url: r.url, expiresAt: r.link.expiresAt, willBe: r.connectionWillBe });
              }, 'Link created. Copy it now: it is shown only once.')}>
              Create Moodle link
            </button>
          </div>
          {newLink && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4" data-testid="lms-registration-link">
              <Copy label="Moodle link" value={newLink.url} />
              <p className="text-xs text-slate-500">Shown only once. Works once, until {new Date(newLink.expiresAt).toLocaleString()}. The connection will be {newLink.willBe === 'active' ? 'active straight away' : 'pending until ENARA approves it'}.</p>
              <ol className="mt-3 list-decimal pl-5 text-sm text-slate-700 space-y-1">
                <li>Send the link to the Moodle site administrator.</li>
                <li>In Moodle: <b>Site administration › Plugins › Activity modules › External tool › Manage tools</b>.</li>
                <li>Paste the link in <b>Tool URL</b> and click <b>Add LTI Advantage</b>.</li>
                <li>If Moodle says there are existing tools for this address, click <b>Register as a new external tool</b> (not "Update").</li>
                <li>When the window says <b>"ENARA is registered"</b>, it closes. On the new ENARA tool card, click <b>Activate</b>.</li>
                <li>Then set the few settings Moodle cannot take from the link: on the ENARA tool card click the edit (gear) icon, set <b>Tool configuration usage</b> to <b>"Show in activity chooser and as a preconfigured tool"</b> and, under <b>Privacy</b>, <b>Accept grades from the tool</b> to <b>Always</b>; click <b>Save changes</b>. (See the ENARA guide for Moodle, "School admin: after connecting".)</li>
              </ol>
            </div>
          )}
          {links.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Links</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                {links.slice(0, 10).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${l.status === 'used' ? 'bg-teal-50 text-teal-700' : l.status === 'unused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{l.status}</span>
                    <span>made {new Date(l.createdAt).toLocaleString()}{isEnara ? ` · school ${l.institutionId}` : ''}</span>
                    {l.status === 'unused' && <span className="text-xs text-slate-500">expires {new Date(l.expiresAt).toLocaleDateString()}</span>}
                    {l.usedAt && <span className="text-xs text-slate-500">used {new Date(l.usedAt).toLocaleString()}</span>}
                    {l.lastErrorCode && l.status === 'unused' && <span className="text-xs text-red-700">last try failed: <code>{l.lastErrorCode}</code></span>}
                    {l.status === 'unused' && (
                      <button disabled={busy} className="text-xs font-semibold text-red-700" onClick={() => window.confirm('Cancel this link? It will stop working.') && act(() => revokeLmsRegistrationLink(l.id), 'Link cancelled.')}>
                        Cancel link
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {status && (
        <section className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-bold text-slate-900 mb-1">Or by hand — 1. Enter these in your LMS</h2>
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
          {field('keysetUrl', 'Public keyset URL', 'https://…/mod/lti/certs.php', 'Or leave empty and paste the public key below.')}
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Public key (only for a Moodle the internet cannot reach)</span>
            <textarea rows={3} dir="ltr" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" value={form.publicKey}
              placeholder={'-----BEGIN PUBLIC KEY----- … or {"keys":[…]} from …/mod/lti/certs.php'} onChange={(e) => setForm({ ...form, publicKey: e.target.value })} data-testid="lms-manual-public-key" />
            <span className="text-xs text-slate-500">ENARA then checks launches with this key and never needs to reach Moodle's key address. Grades and class lists still need ENARA to reach Moodle (your IT team allows the Moodle address by name; ENARA has no fixed IP).</span>
          </label>
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
                <span className="text-xs text-slate-500">{p.vendor} · client {p.clientId}{p.registeredVia === 'dynamic' ? ' · connected with a link' : ''}{p.hasPublicKey ? ' · pasted public key' : ''}{isEnara ? ` · school ${p.institutionId}` : ''}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {p.launchCount} launches ({p.cookielessLaunchCount} without cookies{p.storageLaunchCount ? `, ${p.storageLaunchCount} through the LMS page storage` : ''}){p.lastLaunchAt ? ` · last ${new Date(p.lastLaunchAt).toLocaleString()}` : ''}
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
              {grades?.[p.id] && (() => {
                const g = grades[p.id];
                return (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="lms-grade-sync">
                    <span className="font-semibold">Grades to the LMS:</span> {g.pending + g.processing} waiting · {g.sent} sent ·{' '}
                    <span className={g.dead ? 'text-red-700 font-semibold' : ''}>{g.dead} failed</span>
                    {g.lastSentAt ? ` · last sent ${new Date(g.lastSentAt).toLocaleString()}` : ''}
                    {g.lastErrorCode && <> · last error <code className="bg-white px-1 rounded">{g.lastErrorCode}</code>{g.lastErrorAt ? ` (${new Date(g.lastErrorAt).toLocaleString()})` : ''}</>}
                    {!!g.activitiesMayBeDeleted?.length && (
                      <div className="mt-1 text-amber-800" data-testid="lms-activities-may-be-deleted">
                        <span className="font-semibold">LMS activity may have been deleted ({g.activitiesMayBeDeleted.length}):</span>{' '}
                        {g.activitiesMayBeDeleted.slice(0, 5).map((a) => `${a.activityTitle || a.assignmentId} (${a.reason === 'lineitem_gone' ? 'the LMS no longer accepts its grades' : '30 days without a launch or a result'})`).join('; ')}
                        {g.activitiesMayBeDeleted.length > 5 ? '; …' : ''}. Archive the assignment in Class assignments if the activity is gone.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1">
                      <button disabled={busy} className="text-sm font-semibold text-teal-700"
                        onClick={() => act(async () => { const r = await resyncLmsGrades(p.id); return r; }, 'Grades queued again; they are sent in the background.')}>
                        Re-sync grades
                      </button>
                      {g.dead > 0 && (
                        <button disabled={busy} className="text-sm font-semibold text-teal-700" onClick={() => act(() => retryLmsDeadGrades(p.id), 'Failed grades will be sent again.')}>
                          Retry failed ({g.dead})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
              {contexts && (
                <div className="mt-3 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700" data-testid="lms-roster">
                  <span className="font-semibold">Courses and rosters</span>
                  {contexts.filter((c) => c.platformId === p.id).length === 0 && <p className="text-slate-500">No course has opened ENARA yet.</p>}
                  {contexts.filter((c) => c.platformId === p.id).map((c) => (
                    <div key={c.id} className="py-2 border-t border-slate-100 first:border-t-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{c.title || c.label || c.id}</span>
                        <span className="text-xs text-slate-500">
                          {c.students.active} active · {c.students.notStarted} not started · {c.students.inactive} left
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {!c.rosterAvailable ? 'The LMS did not offer its roster service (Names and Role Provisioning) for this course.' : c.lastRosterSyncAt ? `Last roster sync ${new Date(c.lastRosterSyncAt).toLocaleString()}` : 'Roster not synced yet.'}
                        {c.sync?.outcome && ` · ${c.sync.outcome}${c.sync.trigger ? ` (${c.sync.trigger})` : ''}: ${c.sync.added ?? 0} added, ${c.sync.reactivated ?? 0} back, ${c.sync.removed ?? 0} removed, ${c.sync.unchanged ?? 0} unchanged`}
                        {(c.sync?.conflicts ?? 0) > 0 && ` · ${c.sync!.conflicts} role conflicts`}
                        {(c.sync?.deferred ?? 0) > 0 && ` · ${c.sync!.deferred} more next run`}
                        {(c.sync?.suppressed ?? 0) > 0 && ` · ${c.sync!.suppressed} skipped (permanently deleted at the school's request)`}
                        {c.sync?.lastErrorCode && <> · last error <code className="bg-slate-50 px-1 rounded">{c.sync.lastErrorCode}</code>{c.sync.lastErrorAt ? ` (${new Date(c.sync.lastErrorAt).toLocaleString()})` : ''}</>}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {c.rosterAvailable && (
                          <button disabled={busy} className="text-sm font-semibold text-teal-700"
                            onClick={() => act(async () => {
                              const r = await syncLmsRoster(c.id);
                              if (r.outcome.status === 'failed') throw new Error(`Roster sync failed (${r.outcome.code ?? 'error'}).`);
                            }, 'Roster synced.')}>
                            Sync roster now
                          </button>
                        )}
                        {c.students.notStarted > 0 && (
                          <button className="text-sm font-semibold text-slate-700"
                            onClick={() => notStarted[c.id] ? setNotStarted((m) => { const n = { ...m }; delete n[c.id]; return n; }) : void fetchLmsContextRoster(c.id).then((r) => setNotStarted((m) => ({ ...m, [c.id]: r.notStarted }))).catch((e) => setMessage({ ok: false, text: (e as Error).message }))}>
                            {notStarted[c.id] ? 'Hide not started' : `Show not started (${c.students.notStarted})`}
                          </button>
                        )}
                      </div>
                      {notStarted[c.id] && (
                        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600" data-testid="lms-not-started-list">
                          {notStarted[c.id].map((n) => <li key={n.lmsUserId}>{n.name ?? n.lmsUserId} <span className="text-slate-400">· listed since {new Date(n.listedSince).toLocaleDateString()}</span></li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

      {/* Phase 1b: failures and warnings by Reference code, with explanations in English and Arabic. */}
      {status && <LmsProblems isEnara={isEnara} />}

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
