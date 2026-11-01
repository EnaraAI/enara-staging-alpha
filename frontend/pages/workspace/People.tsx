import React, { useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import {
  createWorkspaceInvitation, fetchWorkspaceInvitations, fetchWorkspaceUsers, getSessionUser, revokeWorkspaceInvitation, setWorkspaceUserStatus,
  type WorkspaceInvitation, type WorkspaceUser,
} from '../../services/apiService';
import { toast } from '../../services/toastService';

// People (Workspace Admin, P22): the school's accounts and invitations.
// Invite by email (the link is shown once, to copy if email is not set up),
// revoke open invitations, and disable or re-enable accounts. A disabled
// account cannot sign in and is signed out everywhere at once.

const ROLES: Record<string, string> = { teacher: 'Teacher', academic_manager: 'Academic Manager', student: 'Student', admin: 'School admin' };
const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

export const People: React.FC = () => {
  const [users, setUsers] = useState<WorkspaceUser[] | null>(null);
  const [invites, setInvites] = useState<WorkspaceInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('teacher');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = getSessionUser();

  const load = () => {
    fetchWorkspaceUsers().then((r) => setUsers(r.users)).catch(() => setUsers([]));
    fetchWorkspaceInvitations().then((r) => setInvites(r.invitations)).catch(() => setInvites([]));
  };
  useEffect(load, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createWorkspaceInvitation(email.trim(), role);
      setLink(r.inviteLink);
      setEmail('');
      toast.success('Invitation created', 'Send the link to the person if they do not receive an email.');
      load();
    } catch (err) {
      toast.error('Not invited', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (u: WorkspaceUser) => {
    const next = u.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(`Disable ${u.email}? They will be signed out and cannot sign in until you enable the account again.`)) return;
    try {
      await setWorkspaceUserStatus(u.id, next);
      toast.success(next === 'disabled' ? 'Account disabled' : 'Account enabled', u.email);
      load();
    } catch (err) {
      toast.error('Not changed', (err as Error).message);
    }
  };

  const revoke = async (i: WorkspaceInvitation) => {
    try {
      await revokeWorkspaceInvitation(i.id);
      load();
    } catch (err) {
      toast.error('Not revoked', (err as Error).message);
    }
  };

  const open = invites.filter((i) => i.status === 'pending' && !i.expired);
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">People</h1>
        <p className="text-sm text-slate-600">Invite teachers, academic managers and students, and disable accounts that should no longer have access.</p>
      </div>

      <form onSubmit={invite} className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end">
        <label className="block text-sm">Email<input type="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" /></label>
        <label className="block text-sm">Role<select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
          {['teacher', 'academic_manager', 'student'].map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
        </select></label>
        <button type="submit" disabled={busy || !email.trim()} className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">Invite</button>
        {link && (
          <div className="sm:col-span-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-800">Invitation link (shown once, works once, expires in 7 days)</p>
            <div className="mt-1 flex gap-2 items-center">
              <code className="flex-1 truncate text-xs">{link}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Copied', ''))} className="p-1.5 rounded-md hover:bg-slate-200" aria-label="Copy the invitation link"><Copy size={16} /></button>
            </div>
          </div>
        )}
      </form>

      {open.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Open invitations</h2>
          <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
            {open.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{i.email} · {ROLES[i.role] ?? i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                <button onClick={() => revoke(i)} className="text-red-700 font-semibold">Revoke</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Accounts</h2>
        {!users ? <Loader2 className="animate-spin text-slate-500" aria-label="Loading" /> : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Accounts in your school</caption>
              <thead className="bg-slate-50 text-left"><tr><th scope="col" className="p-3">Name</th><th scope="col" className="p-3">Email</th><th scope="col" className="p-3">Role</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const self = u.email === me?.email;
                  const locked = self || (u.role === 'admin' && me?.role !== 'enara-admin');
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="p-3">{u.name || '—'}</td>
                      <td className="p-3">{u.email}</td>
                      <td className="p-3">{ROLES[u.role] ?? u.role}</td>
                      <td className="p-3">{u.status === 'active' ? <span className="text-emerald-700 font-semibold">Active</span> : <span className="text-slate-500 font-semibold">Disabled</span>}</td>
                      <td className="p-3 text-right">{!locked && <button onClick={() => changeStatus(u)} className={u.status === 'active' ? 'text-red-700 font-semibold' : 'text-indigo-700 font-semibold'}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
