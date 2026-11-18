import React, { useState } from 'react';
import { ArrowRight, AtSign, CircleAlert, Info, KeyRound, Link2 } from 'lucide-react';
import { parentEmailSignInStart, parentEmailSignInVerify, type SessionUser } from '../services/apiService';

// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED): passwordless sign-in on the Parents
// tab. The parent types their email, gets a 6-digit code by email (10 minutes,
// 5 tries) and types it here. No password. The answer never says whether an
// account exists. Signing in remembers this device. Rendered inside the sign-in
// card (its classes, no <form> of its own).

type Lang = 'en' | 'ar';
export const EMAIL_SIGNIN_TEXT = {
  en: {
    title: 'Sign in with your email', body: 'We will email you a 6-digit code. No password needed.',
    email: 'Email', emailPh: 'name@example.com', send: 'Email me a code', sending: 'Sending…',
    sent: (e: string) => `If ${e} has an ENARA Parents account, a 6-digit code is on its way. It expires in 10 minutes.`,
    code: '6-digit code', codePh: '123 456', verify: 'Sign in', verifying: 'Signing in…', resend: 'Send a new code', changeEmail: 'Use another email',
    password: 'Sign in with a password instead', haveCode: 'New here? I have a code from the school',
    badEmail: 'Enter an email like name@example.com.', invalid: 'That code is not right or has expired.', locked: 'Too many tries. Ask for a new code.',
    soon: 'Wait a minute before asking for a new code.', many: 'Too many codes for this email. Try again in an hour.', unusable: 'Use an email address you can receive mail at.', unreachable: 'Could not reach the server. Please try again.',
  },
  ar: {
    title: 'سجّل الدخول ببريدك الإلكتروني', body: 'سنرسل إليك رمزًا من 6 أرقام. لا حاجة إلى كلمة مرور.',
    email: 'البريد الإلكتروني', emailPh: 'name@example.com', send: 'أرسل إليّ رمزًا', sending: 'جارٍ الإرسال…',
    sent: (e: string) => `إذا كان لـ ${e} حساب في بوابة أولياء الأمور، فسيصلك رمز من 6 أرقام. تنتهي صلاحيته خلال 10 دقائق.`,
    code: 'الرمز المكوّن من 6 أرقام', codePh: '123 456', verify: 'تسجيل الدخول', verifying: 'جارٍ تسجيل الدخول…', resend: 'أرسل رمزًا جديدًا', changeEmail: 'استخدم بريدًا آخر',
    password: 'سجّل الدخول بكلمة مرور بدلًا من ذلك', haveCode: 'جديد هنا؟ عندي رمز من المدرسة',
    badEmail: 'أدخل بريدًا إلكترونيًا مثل name@example.com.', invalid: 'الرمز غير صحيح أو انتهت صلاحيته.', locked: 'محاولات كثيرة. اطلب رمزًا جديدًا.',
    soon: 'انتظر دقيقة قبل طلب رمز جديد.', many: 'طلبات كثيرة لهذا البريد. حاول مرة أخرى بعد ساعة.', unusable: 'استخدم بريدًا إلكترونيًا يمكنك استقبال الرسائل عليه.', unreachable: 'تعذّر الاتصال بالخادم. حاول مرة أخرى.',
  },
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One message for the code errors (shared with the portal's "Add your email"). */
export function emailCodeError(t: (typeof EMAIL_SIGNIN_TEXT)['en'], e: any): string {
  const c = e?.code;
  if (c === 'EMAIL_CODE_LOCKED') return t.locked;
  if (c === 'EMAIL_CODE_TOO_SOON') return t.soon;
  if (c === 'EMAIL_CODE_RATE_LIMITED' || e?.status === 429) return t.many;
  if (c === 'EMAIL_NOT_USABLE') return t.unusable;
  if (e?.status === 400) return t.invalid;
  return e?.status ? t.invalid : t.unreachable;
}

export const EmailSignIn: React.FC<{ lang: Lang; onLogin: (user: SessionUser) => void; onPassword: () => void; onCode?: () => void }> = ({ lang, onLogin, onPassword, onCode }) => {
  const t = EMAIL_SIGNIN_TEXT[lang];
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) { setError(t.badEmail); return; }
    setBusy(true);
    try { await parentEmailSignInStart(email, lang); setSentTo(email.trim()); setCode(''); } catch (e) { setError(emailCodeError(t, e)); } finally { setBusy(false); }
  };
  const verify = async () => {
    setError(null);
    if (code.replace(/\D/g, '').length !== 6) { setError(t.invalid); return; }
    setBusy(true);
    try {
      try { localStorage.setItem('enara_parents_lang', lang); } catch { /* storage unavailable */ }
      onLogin(await parentEmailSignInVerify(sentTo!, code));
    } catch (e) { setError(emailCodeError(t, e)); } finally { setBusy(false); }
  };
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

  return (
    <div className="si-code" data-testid="parent-email-signin">
      <h3 className="si-code-title">{t.title}</h3>
      {error && <div className="si-alert err" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
      {!sentTo ? (
        <>
          <p className="si-code-body">{t.body}</p>
          <div className="si-field">
            <label htmlFor="si-signin-email">{t.email}</label>
            <div className="si-input"><AtSign size={18} />
              <input id="si-signin-email" type="email" dir="ltr" autoComplete="email" placeholder={t.emailPh} value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} onKeyDown={enter(() => void send())} />
            </div>
          </div>
          <button type="button" className="si-submit" disabled={busy} onClick={() => void send()}>{busy ? <><span className="si-spin" />{t.sending}</> : <>{t.send}<ArrowRight size={18} /></>}</button>
        </>
      ) : (
        <>
          <div className="si-alert info" role="status"><Info size={18} /><span>{t.sent(sentTo)}</span></div>
          <div className="si-field">
            <label htmlFor="si-signin-code">{t.code}</label>
            <div className="si-input"><KeyRound size={18} />
              <input id="si-signin-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder={t.codePh} value={code} onChange={(e) => { setCode(e.target.value.replace(/[^\d ]/g, '')); setError(null); }} onKeyDown={enter(() => void verify())} />
            </div>
          </div>
          <button type="button" className="si-submit" disabled={busy} onClick={() => void verify()}>{busy ? <><span className="si-spin" />{t.verifying}</> : <>{t.verify}<ArrowRight size={18} /></>}</button>
          <div className="si-parent-links">
            <button type="button" className="si-ghost" disabled={busy} onClick={() => void send()}>{t.resend}</button>
            <button type="button" className="si-ghost" disabled={busy} onClick={() => { setSentTo(null); setError(null); }}>{t.changeEmail}</button>
          </div>
        </>
      )}
      <div className="si-parent-links">
        <button type="button" className="si-ghost" onClick={onPassword} data-testid="parent-password-signin">{t.password}</button>
        {onCode && <button type="button" className="si-ghost" onClick={onCode}><Link2 size={16} />{t.haveCode}</button>}
      </div>
    </div>
  );
};
