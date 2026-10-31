import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, AtSign, CircleAlert, Eye, EyeOff, Info, KeyRound, Lock } from 'lucide-react';
import { clearSession, login, SessionUser } from '../services/apiService';
import { uiRoleFor, UiRole, LoginChoice } from '../services/roleRouting';
import './Login.css';
import { EnaraLogo } from '../components/brand/EnaraLogo';

// Sign-in "Floating Classroom" (redesign concept B). The sign-in flow is the
// same as before: the backend checks the email and password, and
// roleRouting decides which portal the account may open from the chosen card.

interface LoginProps {
  onLogin: (role: UiRole, user: SessionUser) => void;
  isSharedCourse?: boolean;
  isSharedAssessment?: boolean;
}

type Lang = 'en' | 'ar';

const PORTALS: LoginChoice[] = ['student', 'admin', 'enara-admin'];

const TEXT = {
  en: {
    heroA: 'Learning that ', heroB: 'moves', heroC: ' with you.',
    heroP: 'Lessons, practice and assessment in one place, with an AI tutor that adapts to every step.',
    welcome: 'Welcome back', sub: 'Sign in to continue learning.',
    shared: 'Sign in to open what was shared with you.',
    portal: 'Portal', portals: { student: 'Student', admin: 'School staff', 'enara-admin': 'ENARA team' } as Record<LoginChoice, string>,
    email: 'Email', emailPh: 'name@school.edu', badEmail: 'Enter an email like name@school.edu.',
    password: 'Password', passwordPh: 'Your password', noPassword: 'Enter your password.',
    forgot: 'Forgot password?', forgotInfo: "Your school manages ENARA accounts. Ask your school's administrator to reset your password.",
    show: 'Show password', hide: 'Hide password',
    submit: 'Continue', loading: 'Signing in…',
    managed: 'Your school manages your account.',
    wrong: "That email and password don't match. Check them and try again.",
    unreachable: 'Could not reach the server. Please try again.',
    wrongPortal: (chosen: string, right: string) => `This account can't sign in as ${chosen}. Choose "${right}" instead.`,
    progressLabel: 'Adding fractions', progressNote: 'Practising with your tutor',
    lang: 'Language',
  },
  ar: {
    heroA: 'تعلّم ', heroB: 'بيتحرك', heroC: ' معاك.',
    heroP: 'الدروس والتدريب والتقييم في مكان واحد، مع مدرّس ذكي بيتكيّف مع كل خطوة.',
    welcome: 'أهلاً بيك تاني', sub: 'سجّل دخولك عشان تكمّل تعلّمك.',
    shared: 'سجّل دخولك عشان تفتح اللي اتشارك معاك.',
    portal: 'البوابة', portals: { student: 'طالب', admin: 'فريق المدرسة', 'enara-admin': 'فريق إنارة' } as Record<LoginChoice, string>,
    email: 'الإيميل', emailPh: 'name@school.edu', badEmail: 'اكتب إيميل زي name@school.edu.',
    password: 'كلمة السر', passwordPh: 'كلمة السر بتاعتك', noPassword: 'اكتب كلمة السر.',
    forgot: 'نسيت كلمة السر؟', forgotInfo: 'مدرستك هي اللي بتدير حسابات إنارة. اطلب من مسؤول المدرسة يغيّر لك كلمة السر.',
    show: 'إظهار كلمة السر', hide: 'إخفاء كلمة السر',
    submit: 'متابعة', loading: 'جاري تسجيل الدخول…',
    managed: 'مدرستك هي اللي بتدير حسابك.',
    wrong: 'الإيميل وكلمة السر مش متطابقين. راجعهم وجرّب تاني.',
    unreachable: 'مش قادرين نوصل للسيرفر. جرّب تاني.',
    wrongPortal: (chosen: string, right: string) => `الحساب ده مينفعش يدخل كـ«${chosen}». اختار «${right}».`,
    progressLabel: 'جمع الكسور', progressNote: 'بتتدرّب مع المدرّس',
    lang: 'اللغة',
  },
};

// The card an account should use, from its backend role (see roleRouting).
const PORTAL_FOR_ROLE: Record<string, LoginChoice> = {
  student: 'student', teacher: 'admin', academic_manager: 'admin', admin: 'admin', 'enara-admin': 'enara-admin',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Login: React.FC<LoginProps> = ({ onLogin, isSharedCourse, isSharedAssessment }) => {
  const [lang, setLang] = useState<Lang>('en');
  const [portal, setPortal] = useState<LoginChoice>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: 'email' | 'password'; text: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const t = TEXT[lang];
  const rtl = lang === 'ar';

  // Pointer tilt of the 3D scene; skipped when the user prefers reduced motion.
  useEffect(() => {
    const root = rootRef.current, stage = stageRef.current;
    if (!root || !stage) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const move = (e: PointerEvent) => {
      if (reduced?.matches || e.pointerType === 'touch') return;
      const r = root.getBoundingClientRect();
      stage.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
      stage.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
    };
    const leave = () => { stage.style.setProperty('--px', '0'); stage.style.setProperty('--py', '0'); };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    return () => { root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', leave); };
  }, []);

  const choosePortal = (p: LoginChoice) => { setPortal(p); setAuthError(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null); setInfo(null); setFieldError(null);
    if (!EMAIL_RE.test(email.trim())) { setFieldError({ field: 'email', text: t.badEmail }); return; }
    if (!password) { setFieldError({ field: 'password', text: t.noPassword }); return; }
    setIsLoading(true);
    try {
      const user = await login(email.trim(), password);
      const ui = uiRoleFor(user.role, portal);
      if (!ui) {
        // Wrong portal: forget this session locally only. A server logout
        // would also sign the account out on its other devices.
        clearSession();
        const right = PORTAL_FOR_ROLE[user.role];
        setAuthError(t.wrongPortal(t.portals[portal], right ? t.portals[right] : user.role));
        return;
      }
      onLogin(ui, user);
    } catch (err: any) {
      setAuthError(err?.status === 401 ? t.wrong : (lang === 'en' && err?.message) || t.unreachable);
    } finally {
      setIsLoading(false);
    }
  };

  const portalIndex = PORTALS.indexOf(portal);

  return (
    <div className="enara-signin" ref={rootRef}>
      <div className="si-aura" aria-hidden="true"><i /><i /><i /></div>
      <div className="si-dots" aria-hidden="true" />

      <div className="si-scene">
        <div className="si-stage" ref={stageRef} aria-hidden="true">
          <svg className="si-path" viewBox="0 0 600 560" preserveAspectRatio="none">
            <path d="M70 60 C 220 40, 260 200, 380 140 S 520 260, 470 380 S 260 520, 140 470" fill="none" stroke="var(--brand-300)" strokeWidth="2" />
          </svg>
          <div className="si-obj si-sigma">∑</div>
          <div className="si-obj si-tiles">
            <div><span style={{ width: 120, background: 'var(--brand)' }}>½</span></div>
            <div><span style={{ width: 58, background: 'var(--brand-400)' }}>¼</span><span style={{ width: 58, background: 'var(--brand-400)' }}>¼</span></div>
            <div>{[0, 1, 2].map((i) => <span key={i} style={{ width: 38, background: 'var(--amber)' }}>⅓</span>)}</div>
          </div>
          <div className="si-obj si-book">
            <div className="pg l"><i className="b" /><i /><i /><i style={{ width: '60%' }} /></div>
            <div className="pg r"><i /><i className="b" /><i /><i style={{ width: '40%' }} /></div>
          </div>
          <div className="si-obj si-atom"><span className="orbit" /><span className="orbit" /><span className="orbit" /><span className="e" /><span className="core" /></div>
          <div className="si-obj si-ar">ع</div>
          <div className="si-obj si-progress" dir={rtl ? 'rtl' : 'ltr'}>
            <small>{t.progressLabel}</small>
            <div className="bar"><i /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{t.progressNote}</div>
          </div>
        </div>
        <div className="si-copy" dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
          <h1>{t.heroA}<span>{t.heroB}</span>{t.heroC}</h1>
          <p>{t.heroP}</p>
        </div>
      </div>

      <form className="si-card" onSubmit={handleSubmit} noValidate dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
        <div className="si-top">
          <div className="si-brand"><EnaraLogo className="si-logo" /></div>
          <div className="si-lang" role="group" aria-label={t.lang}>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar">ع</button>
          </div>
        </div>

        <div className="si-head">
          <h2>{t.welcome}</h2>
          <p>{isSharedCourse || isSharedAssessment ? t.shared : t.sub}</p>
        </div>

        <div className="si-seg" role="group" aria-label={t.portal} style={{ ['--i' as any]: portalIndex }}>
          <span className="thumb" />
          {PORTALS.map((p) => (
            <button key={p} type="button" aria-pressed={portal === p} onClick={() => choosePortal(p)}>{t.portals[p]}</button>
          ))}
        </div>

        {authError && (
          <div className="si-alert err" role="alert"><CircleAlert size={18} /><span>{authError}</span></div>
        )}
        {info && (
          <div className="si-alert info" role="status"><Info size={18} /><span>{info}</span></div>
        )}

        <div className="si-field">
          <label htmlFor="si-email">{t.email}</label>
          <div className={`si-input${fieldError?.field === 'email' ? ' err' : ''}`}>
            <AtSign size={18} />
            <input id="si-email" type="email" dir="ltr" autoComplete="username" placeholder={t.emailPh} value={email}
              aria-invalid={fieldError?.field === 'email'} aria-describedby={fieldError?.field === 'email' ? 'si-email-err' : undefined}
              onChange={(e) => { setEmail(e.target.value); if (fieldError?.field === 'email') setFieldError(null); }} />
          </div>
          {fieldError?.field === 'email' && <p className="si-hint err" id="si-email-err"><CircleAlert size={14} />{fieldError.text}</p>}
        </div>

        <div className="si-field">
          <label htmlFor="si-pass">
            {t.password}
            <button type="button" className="si-link" onClick={() => { setAuthError(null); setInfo(t.forgotInfo); }}>{t.forgot}</button>
          </label>
          <div className={`si-input${fieldError?.field === 'password' ? ' err' : ''}`}>
            <KeyRound size={18} />
            <input id="si-pass" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={t.passwordPh} value={password}
              aria-invalid={fieldError?.field === 'password'} aria-describedby={fieldError?.field === 'password' ? 'si-pass-err' : undefined}
              onChange={(e) => { setPassword(e.target.value); if (fieldError?.field === 'password') setFieldError(null); }} />
            <button type="button" aria-label={showPassword ? t.hide : t.show} onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fieldError?.field === 'password' && <p className="si-hint err" id="si-pass-err"><CircleAlert size={14} />{fieldError.text}</p>}
        </div>

        <button type="submit" className="si-submit" disabled={isLoading}>
          {isLoading ? <><span className="si-spin" />{t.loading}</> : <>{t.submit}<ArrowRight size={18} /></>}
        </button>
        <p className="si-hint"><Lock size={14} />{t.managed}</p>
      </form>
    </div>
  );
};
