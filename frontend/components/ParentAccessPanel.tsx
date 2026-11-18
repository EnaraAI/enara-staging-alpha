import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Link2, Trash2, UserMinus } from 'lucide-react';
import { createParentCode, fetchParentCodes, removeParentLink, revokeParentCode, type ParentCodeList } from '../services/apiService';

// Why a parent link ended (backend PARENT_LINK_END_REASONS).
const ENDED_LABEL: Record<string, string> = {
  archived: 'student archived',
  deleted: 'student deleted',
  left_school: 'left the school',
  lms_left_all_classes: 'left all LMS classes',
  unlinked_by_school: 'unlinked by the school',
  unlinked_by_parent: 'unlinked by the parent',
};

// School admin: "Parent access" on a student's profile (Parents Portal).
// Create a one-time parent link code (shown once), list/revoke active codes,
// see and remove linked parents. The server enforces school scope.
export const ParentAccessPanel: React.FC<{ studentId: string; studentName: string }> = ({ studentId, studentName }) => {
  const [data, setData] = useState<ParentCodeList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ code: string; expiresAt: string; emailed?: { ok: boolean; reason?: string } } | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetchParentCodes(studentId).then((d) => { setData(d); setError(null); }, (e) => setError(e?.message || 'Could not load parent access.'));
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  // lms-test: "Send code by email" is blocked until a later step; a code without email still works.
  const emailBlocked = data?.parentEmail?.blocked === true;
  const emailBlockedNote = data?.parentEmail?.message?.en || 'Parent emails are switched on in a later step.';
  const create = async () => {
    setBusy(true); setCopied(false);
    try {
      const r = await createParentCode(studentId, emailBlocked ? undefined : email.trim() || undefined);
      setFresh(r); setEmail(''); load();
    } catch (e: any) {
      if (e?.code === 'PARENT_EMAIL_BLOCKED_STAGING') { setError(e?.message || emailBlockedNote); load(); }
      else setError(e?.message || 'Could not create a code.');
    } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh.code); setCopied(true); } catch { setCopied(false); }
  };
  const first = studentName.split(/\s+/)[0];

  return (
    <section className="bg-white rounded-xl p-6 border border-slate-200 space-y-4" aria-labelledby="parent-access-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="parent-access-title" className="text-lg font-bold text-slate-900 flex items-center gap-2"><Link2 size={18} />Parent access</h2>
          <p className="text-sm text-slate-600">A parent who redeems a code sees {first}'s progress, sessions and full conversations. {first} is told a parent is linked.</p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md p-3">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="sr-only" htmlFor="parent-code-email">Parent email (optional)</label>
        <input id="parent-code-email" type="email" placeholder={emailBlocked ? 'Sending the code by email is off' : 'Parent email (optional, sends the code)'} value={emailBlocked ? '' : email} onChange={(e) => setEmail(e.target.value)}
          disabled={emailBlocked} aria-describedby={emailBlocked ? 'parent-code-email-off' : undefined} data-testid="parent-code-email"
          className="h-11 flex-1 min-w-0 rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
        <button type="button" onClick={create} disabled={busy} className="h-11 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          <KeyRound size={16} />Create parent link code
        </button>
      </div>
      {emailBlocked && <p id="parent-code-email-off" className="text-xs text-slate-600" role="note" data-testid="parent-code-email-blocked">{emailBlockedNote} Give the code to the parent yourself.</p>}

      {fresh && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2" role="status">
          <p className="text-sm text-amber-900 font-semibold">Shown once. Give it to the parent; it works one time, for 7 days.</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="text-2xl font-bold tracking-widest text-slate-900" dir="ltr">{fresh.code}</code>
            <button type="button" onClick={copy} className="h-11 px-3 rounded-md border border-slate-300 bg-white text-sm font-bold inline-flex items-center gap-2">
              {copied ? <><Check size={16} />Copied</> : <><Copy size={16} />Copy</>}
            </button>
          </div>
          <p className="text-xs text-slate-600">Expires {new Date(fresh.expiresAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' })} (Cairo).
            {fresh.emailed && (fresh.emailed.ok ? ' Emailed to the parent.' : ` Email not sent (${fresh.emailed.reason}).`)}</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-2">Active codes</h3>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : data.codes.length === 0 ? <p className="text-sm text-slate-500">No active codes.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span><code dir="ltr">…{c.hint}</code> · expires {new Date(c.expiresAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo' })}</span>
                <button type="button" onClick={() => revokeParentCode(studentId, c.id).then(load, (e) => setError(e?.message))} className="h-11 px-3 rounded-md border border-slate-300 text-slate-700 inline-flex items-center gap-1.5 font-semibold">
                  <Trash2 size={14} />Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-2">Linked parents</h3>
        {!data ? null : data.links.filter((l) => l.status !== 'ended').length === 0 ? <p className="text-sm text-slate-500">No parent is linked.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.links.filter((l) => l.status !== 'ended').map((l) => (
              <li key={l.linkId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{l.parentName}</span>{l.parentEmail ? ` · ${l.parentEmail}` : ''} · {l.role === 'owner' ? 'Owner' : l.role === 'full' ? 'Full access' : 'View only'}
                  {l.consent === 'pending' && <span className="ml-2 text-amber-700">(parental consent pending)</span>}
                </span>
                <button type="button" onClick={() => { if (window.confirm(`Remove ${l.parentName}'s access to ${first}?`)) removeParentLink(studentId, l.linkId).then(load, (e) => setError(e?.message)); }}
                  className="h-11 px-3 rounded-md border border-rose-200 text-rose-700 inline-flex items-center gap-1.5 font-semibold">
                  <UserMinus size={14} />Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Ended links are kept for history (owner decision D8); a new code relinks. */}
        {data && data.links.some((l) => l.status === 'ended') && (
          <>
            <h4 className="text-xs font-bold text-slate-600 mt-3 mb-1">Access ended</h4>
            <ul className="divide-y divide-slate-100">
              {data.links.filter((l) => l.status === 'ended').map((l) => (
                <li key={l.linkId} className="py-2 text-sm text-slate-500">
                  <span className="font-semibold">{l.parentName}</span>{l.endedAt ? ` · ended ${new Date(l.endedAt).toLocaleDateString()}` : ''}{l.endReason ? ` · ${ENDED_LABEL[l.endReason] ?? l.endReason}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
};
