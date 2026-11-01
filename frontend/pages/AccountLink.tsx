import React, { useState } from 'react';
import { CircleAlert, CircleCheck, KeyRound, User } from 'lucide-react';
import { acceptInvitation, confirmPasswordReset } from '../services/apiService';
import { EnaraLogo } from '../components/brand/EnaraLogo';
import './Login.css';

// Pages opened from emailed (or copied) account links (P22):
//   /accept-invitation?token=...  create the account from an invitation
//   /reset-password?token=...     choose a new password
// The token is the proof; it works once and is never stored by the browser.

export type AccountLinkKind = 'invitation' | 'reset';

export function accountLinkFromLocation(): { kind: AccountLinkKind; token: string } | null {
  const kind = window.location.pathname === '/accept-invitation' ? 'invitation' : window.location.pathname === '/reset-password' ? 'reset' : null;
  if (!kind) return null;
  return { kind, token: new URLSearchParams(window.location.search).get('token') ?? '' };
}

const goToSignIn = () => window.location.replace('/');

export const AccountLink: React.FC<{ kind: AccountLinkKind; token: string }> = ({ kind, token }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(token ? null : 'This link is incomplete. Open the link from your email again, or ask your school for a new one.');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const invitation = kind === 'invitation';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirm) return setError('The two passwords are not the same.');
    setBusy(true);
    try {
      if (invitation) await acceptInvitation(token, password, name.trim() || undefined);
      else await confirmPasswordReset(token, password);
      // Drop the token from the address bar and history.
      window.history.replaceState({}, document.title, window.location.pathname);
      setDone(true);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enara-signin">
      <div className="si-aura" aria-hidden="true"><i /><i /><i /></div>
      <form className="si-card" onSubmit={submit} noValidate style={{ margin: '0 auto' }}>
        <div className="si-top"><div className="si-brand"><EnaraLogo className="si-logo" /></div></div>
        <div className="si-head">
          <h2>{invitation ? 'Join your school on ENARA' : 'Choose a new password'}</h2>
          <p>{invitation ? 'Set your name and a password to create your account.' : 'Your new password replaces the old one and signs you out everywhere.'}</p>
        </div>
        {error && <div className="si-alert err" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {done ? (
          <>
            <div className="si-alert info" role="status"><CircleCheck size={18} /><span>{invitation ? 'Your account is ready.' : 'Your password has been changed.'} You can sign in now.</span></div>
            <button type="button" className="si-submit" onClick={goToSignIn}>Go to sign in</button>
          </>
        ) : (
          <>
            {invitation && (
              <div className="si-field">
                <label htmlFor="al-name">Your name</label>
                <div className="si-input"><User size={18} /><input id="al-name" autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
              </div>
            )}
            <div className="si-field">
              <label htmlFor="al-pass">New password</label>
              <div className="si-input"><KeyRound size={18} /><input id="al-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="al-pass-hint" /></div>
              <p className="si-hint" id="al-pass-hint">At least 8 characters.</p>
            </div>
            <div className="si-field">
              <label htmlFor="al-confirm">Type it again</label>
              <div className="si-input"><KeyRound size={18} /><input id="al-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            </div>
            <button type="submit" className="si-submit" disabled={busy || !token}>{busy ? <span className="si-spin" /> : invitation ? 'Create my account' : 'Save new password'}</button>
            <button type="button" className="si-link" onClick={goToSignIn} style={{ marginTop: 12 }}>Back to sign in</button>
          </>
        )}
      </form>
    </div>
  );
};
