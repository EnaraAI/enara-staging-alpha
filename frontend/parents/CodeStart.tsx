import React, { useState } from 'react';
import { ArrowRight, CircleAlert, KeyRound, Link2, ShieldAlert, Smartphone, UserRound } from 'lucide-react';
import { previewStartCode, startWithCode, type SessionUser } from '../services/apiService';
import { formatCodeInput } from './codeFormat';

// Parents P1 (PARENT_CODE_SIGNUP_ENABLED), owner decision a): the code-first
// entry on the Parents tab of the sign-in page. The parent types the school's
// link code and gets straight in: no sign-up, password or Google step, and this
// device remembers the session. The code is typed (never read from a URL, D15)
// and only ever sent in a request body. Rendered inside the sign-in card, so
// it uses the card's classes and no <form> of its own.

type Lang = 'en' | 'ar';

export const CODE_START_TEXT = {
  en: {
    title: 'Enter the code from the school',
    body: "Type the parent code your child's school gave you. It looks like ENR-ABCD-EFGH. You don't need a password.",
    haveAccount: 'Already have an account? Sign in with your email first',
    label: 'Parent code', placeholder: 'ENR-XXXX-XXXX',
    secret: "This code is secret. Anyone who has it can see your child's data. Don't share it. The school can unlink a parent at any time.",
    check: 'Continue', checking: 'Checking…',
    previewTitle: 'Is this your child?', previewSchool: (s: string) => `at ${s}`,
    confirm: 'Yes, open ENARA Parents', opening: 'Opening…', back: 'Back',
    device: 'This device will remember you. Later you can add your email to sign in on any device. Without an email, if you lose this device or sign out, ask the school for a new code.',
    invalid: 'Code not valid or expired', off: "Parent access is switched off at this child's school. Ask the school.",
    tooMany: 'Too many tries. Wait 15 minutes and try again.', unreachable: 'Could not reach the server. Please try again.',
  },
  ar: {
    title: 'أدخل الرمز الذي أعطته لك المدرسة',
    body: 'اكتب رمز ولي الأمر الذي أعطته لك مدرسة طفلك. يبدو هكذا: ENR-ABCD-EFGH. لا تحتاج إلى كلمة مرور.',
    haveAccount: 'لديك حساب بالفعل؟ سجّل الدخول ببريدك الإلكتروني أولًا',
    label: 'رمز ولي الأمر', placeholder: 'ENR-XXXX-XXXX',
    secret: 'هذا الرمز سري. أي شخص يحصل عليه يمكنه رؤية بيانات طفلك. لا تشاركه مع أحد. ويمكن للمدرسة إلغاء ربط أي ولي أمر في أي وقت.',
    check: 'متابعة', checking: 'جارٍ التحقق…',
    previewTitle: 'هل هذا طفلك؟', previewSchool: (s: string) => `في ${s}`,
    confirm: 'نعم، افتح بوابة أولياء الأمور', opening: 'جارٍ الفتح…', back: 'رجوع',
    device: 'سيتذكرك هذا الجهاز. يمكنك لاحقًا إضافة بريدك الإلكتروني لتسجيل الدخول من أي جهاز. إذا لم تُضف بريدًا إلكترونيًا وفقدت هذا الجهاز أو سجّلت الخروج، فاطلب رمزًا جديدًا من المدرسة.',
    invalid: 'الرمز غير صحيح أو انتهت صلاحيته', off: 'وصول أولياء الأمور متوقف في مدرسة هذا الطفل. تواصل مع المدرسة.',
    tooMany: 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.', unreachable: 'تعذّر الاتصال بالخادم. حاول مرة أخرى.',
  },
};

/** The secret-code warning (owner decision d), shared by the code screens. */
export const SecretCodeWarning: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <div className={className ?? 'si-alert warn'} role="note" data-testid="secret-code-warning"><ShieldAlert size={18} /><span>{text}</span></div>
);

export const CodeStart: React.FC<{ lang: Lang; onLogin: (user: SessionUser) => void; onSignIn: () => void }> = ({ lang, onLogin, onSignIn }) => {
  const t = CODE_START_TEXT[lang];
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ learner: string; school: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: any) => setError(
    e?.code === 'PARENT_SCHOOL_ACCESS_OFF' ? t.off : e?.status === 429 ? t.tooMany : e?.status === 400 ? t.invalid : e?.status ? t.invalid : t.unreachable,
  );
  const check = async () => {
    setError(null);
    if (code.replace(/[^A-Z0-9]/g, '').length < 11) { setError(t.invalid); return; }
    setBusy(true);
    try { setPreview(await previewStartCode(code)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      try { localStorage.setItem('enara_parents_lang', lang); } catch { /* storage unavailable */ }
      onLogin(await startWithCode(code, lang));
    } catch (e) {
      fail(e);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="si-code" data-testid="parent-code-start">
      <button type="button" className="si-ghost si-ghost--wide" onClick={onSignIn} data-testid="parent-have-account">
        <UserRound size={16} />{t.haveAccount}
      </button>
      <h3 className="si-code-title">{t.title}</h3>
      {error && <div className="si-alert err" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
      {!preview && (
        <>
          <p className="si-code-body">{t.body}</p>
          <div className="si-field">
            <label htmlFor="si-code">{t.label}</label>
            <div className={`si-input${error ? ' err' : ''}`}>
              <KeyRound size={18} />
              <input id="si-code" dir="ltr" inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={24}
                placeholder={t.placeholder} value={code} aria-invalid={!!error}
                onChange={(e) => { setCode(formatCodeInput(e.target.value)); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void check(); } }} />
            </div>
          </div>
          <SecretCodeWarning text={t.secret} />
          <button type="button" className="si-submit" disabled={busy} onClick={() => void check()}>
            {busy ? <><span className="si-spin" />{t.checking}</> : <>{t.check}<ArrowRight size={18} /></>}
          </button>
        </>
      )}
      {preview && (
        <div className="si-code-preview" aria-labelledby="si-code-preview-title">
          <p className="si-code-title" id="si-code-preview-title">{t.previewTitle}</p>
          <p className="si-code-child"><b dir="auto">{preview.learner}</b>{preview.school && <small dir="auto"> {t.previewSchool(preview.school)}</small>}</p>
          <div className="si-alert info" role="note"><Smartphone size={18} /><span>{t.device}</span></div>
          <button type="button" className="si-submit" disabled={busy} onClick={() => void confirm()}>
            {busy ? <><span className="si-spin" />{t.opening}</> : <><Link2 size={18} />{t.confirm}</>}
          </button>
          <button type="button" className="si-ghost si-ghost--wide" disabled={busy} onClick={() => setPreview(null)}>{t.back}</button>
        </div>
      )}
    </div>
  );
};
