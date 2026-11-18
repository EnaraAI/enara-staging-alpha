import React, { useState } from 'react';
import { adoptParentSession } from '../../services/apiService';
import { parentsApi } from '../api';
import { Icon, useP } from '../ui';

// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED), owner decision b): "Add your email
// to get notifications and sign in on any device." The parent types their own
// email, gets a 6-digit code (10 minutes, 5 tries) and types it here. If the
// email already has another parent account, a merge is offered ("This email
// already has an account with another child. Merge them?"); the code was the
// proof, and merging moves this device to that account.
//   prompt: the dismissible card (comes back next time the app opens until an
//           email is added), with the "lost device" warning before skipping;
//   inline: the same flow in Account (add or change the email).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AddEmail: React.FC<{ mode: 'prompt' | 'inline'; onDone: () => void; onDismiss?: () => void; suggested?: string }> = ({ mode, onDone, onDismiss, suggested }) => {
  const { t } = useP();
  const [step, setStep] = useState<'intro' | 'email' | 'code' | 'merge' | 'done'>(mode === 'prompt' ? 'intro' : 'email');
  const [email, setEmail] = useState(suggested ?? '');
  const [code, setCode] = useState('');
  const [merge, setMerge] = useState<{ ticket: string; otherChildren: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: any) => {
    const c = e?.code;
    setError(c === 'EMAIL_CODE_LOCKED' ? t.emailErrLocked : c === 'EMAIL_CODE_TOO_SOON' ? t.emailErrSoon : c === 'EMAIL_CODE_RATE_LIMITED' ? t.emailErrMany
      : c === 'EMAIL_NOT_USABLE' ? t.emailErrUnusable : c === 'EMAIL_NOT_FOR_PARENT' ? t.emailErrStaff : c === 'EMAIL_CODE_NOT_SENT' ? t.emailErrSend : t.emailErrInvalid);
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); } };
  const send = () => {
    if (!EMAIL_RE.test(email.trim())) { setError(t.emailErrBad); return Promise.resolve(); }
    return run(async () => {
      const r = await parentsApi.emailStart(email.trim());
      if (r.alreadyVerified) { setStep('done'); onDone(); return; }
      setCode('');
      setStep('code');
    });
  };
  const verify = () => run(async () => {
    const r = await parentsApi.emailVerify(email.trim(), code);
    if (r.merge) { setMerge(r.merge); setStep('merge'); return; }
    setStep('done');
    setTimeout(onDone, 1500); // the confirmation stays visible a moment
  });
  const doMerge = () => run(async () => {
    const r = await parentsApi.emailMerge(merge!.ticket);
    adoptParentSession(r);
    setStep('done');
    setTimeout(onDone, 1500);
  });
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

  return (
    <section className="pp-card" aria-labelledby="pp-addemail" data-testid={mode === 'prompt' ? 'pp-add-email-prompt' : 'pp-add-email'}>
      <h2 className="pp-h2" id="pp-addemail">{step === 'merge' ? t.mergeTitle : mode === 'prompt' ? t.addEmailPrompt : t.emailTitle}</h2>
      {step === 'intro' && (
        <>
          <p className="pp-sub">{t.addEmailLost}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pp-btn pp-btn--primary" onClick={() => setStep('email')}>{t.addEmail}</button>
            {onDismiss && <button type="button" className="pp-btn" onClick={onDismiss}>{t.notNow}</button>}
          </div>
        </>
      )}
      {step === 'email' && (
        <>
          {mode === 'inline' && <p className="pp-sub">{t.addEmailPrompt}</p>}
          <div className="pp-input">
            <label htmlFor="pp-email">{t.emailLabel}</label>
            <input id="pp-email" type="email" dir="ltr" autoComplete="email" placeholder={t.emailPh} value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} onKeyDown={enter(() => void send())} />
          </div>
          {error && <p className="pp-error" role="alert"><Icon name="alert" />{error}</p>}
          <button type="button" className="pp-btn pp-btn--primary pp-btn--block" disabled={busy} onClick={() => void send()}>{busy ? t.loading : t.sendCode}</button>
          {mode === 'prompt' && onDismiss && <button type="button" className="pp-btn pp-btn--block" onClick={onDismiss}>{t.notNow}</button>}
        </>
      )}
      {step === 'code' && (
        <>
          <p className="pp-sub" role="status">{t.codeSentTo(email.trim())}</p>
          <div className="pp-input">
            <label htmlFor="pp-email-code">{t.codeLabel6}</label>
            <input id="pp-email-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" value={code} onChange={(e) => { setCode(e.target.value.replace(/[^\d ]/g, '')); setError(null); }} onKeyDown={enter(() => void verify())} />
          </div>
          {error && <p className="pp-error" role="alert"><Icon name="alert" />{error}</p>}
          <button type="button" className="pp-btn pp-btn--primary pp-btn--block" disabled={busy} onClick={() => void verify()}>{busy ? t.loading : t.verifyEmail}</button>
          <button type="button" className="pp-btn pp-btn--block" disabled={busy} onClick={() => { setStep('email'); setError(null); }}>{t.changeEmail}</button>
        </>
      )}
      {step === 'merge' && merge && (
        <>
          <p style={{ fontSize: 14 }}>{t.mergeBody(merge.otherChildren.join(', ') || '—')}</p>
          {error && <p className="pp-error" role="alert"><Icon name="alert" />{error}</p>}
          <button type="button" className="pp-btn pp-btn--primary pp-btn--block" disabled={busy} onClick={() => void doMerge()}>{busy ? t.loading : t.merge}</button>
          <button type="button" className="pp-btn pp-btn--block" disabled={busy} onClick={() => { setMerge(null); setStep('email'); }}>{t.cancel}</button>
        </>
      )}
      {step === 'done' && <p className="pp-success" role="status"><Icon name="check" />{merge ? t.merged : t.emailAdded(email.trim())}</p>}
    </section>
  );
};
