import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, AtSign, BookOpen, CircleAlert, Eye, EyeOff, GraduationCap, Info, KeyRound, LayoutDashboard, Link2, Lock, UserRound } from 'lucide-react';
import { clearSession, fetchDemoStatus, fetchParentAuthConfig, googleParentSignIn, login, registerParent, requestPasswordReset, SessionUser, startDemo, type DemoRole } from '../services/apiService';
import { uiRoleFor, UiRole, LoginChoice } from '../services/roleRouting';
import './Login.css';
import { EnaraLogo } from '../components/brand/EnaraLogo';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

// Sign-in "Floating Classroom" (redesign concept B). The sign-in flow is the
// same as before: the backend checks the email and password, and
// roleRouting decides which portal the account may open from the chosen card.

interface LoginProps {
  onLogin: (role: UiRole, user: SessionUser) => void;
  isSharedCourse?: boolean;
  isSharedAssessment?: boolean;
  // Opens on this tab (the Parents tab when the URL is /parents...).
  initialPortal?: LoginChoice;
}

// Parents tab: after sign-in/sign-up the parents area opens the code screen.
export const PARENT_LINK_INTENT_KEY = 'enara_parent_link_intent';

type Lang = 'en' | 'ar';

const PORTALS: LoginChoice[] = ['student', 'admin', 'enara-admin', 'parent'];

const TEXT = {
  en: {
    heroA: 'Learning that ', heroB: 'moves', heroC: ' with you.',
    heroP: 'Lessons, practice and assessment in one place, with an AI tutor that adapts to every step.',
    welcome: 'Welcome back', sub: 'Sign in to continue learning.',
    shared: 'Sign in to open what was shared with you.',
    portal: 'Portal', portals: { student: 'Student', admin: 'School staff', 'enara-admin': 'ENARA team', parent: 'Parents' } as Record<LoginChoice, string>,
    parentSub: 'See how your child is practising, improving and staying safe.',
    parentSignupSub: 'Create your parent account. You will link your child with the code from their school.',
    parentLinkSub: 'Sign in or create a parent account, then enter the code from the school.',
    parentCreate: 'Create a parent account', parentHaveAccount: 'Already have an account? Sign in',
    parentLink: 'Have an invite code? Link your child',
    name: 'Your name', namePh: 'e.g. Mona Hassan', noName: 'Enter your name.',
    newPassword: 'Create a password', newPasswordPh: 'At least 8 characters', shortPassword: 'Use at least 8 characters.',
    createSubmit: 'Create account', creating: 'Creating account…', exists: 'An account with this email already exists. Sign in instead.',
    parentForgotInfo: 'We will email you a link to reset your password.',
    parentManaged: 'Parent accounts see only learners linked with a school code.',
    or: 'or',
    googleFailed: 'Google sign-in did not work. Try again, or use your email and password.',
    googleUnverified: 'Your Google email is not verified. Verify it with Google, or use your email and password.',
    googleNotParent: 'This email belongs to an ENARA school account, so it cannot be a parent account. Sign in on the Student or School staff tab, or use a different Google account.',
    googleMismatch: 'This parent account is linked to a different Google account. Use that Google account, or your email and password.',
    googleUnavailable: 'Google sign-in is not available right now. Use your email and password.',
    email: 'Email', emailPh: 'name@school.edu', badEmail: 'Enter an email like name@school.edu.',
    password: 'Password', passwordPh: 'Your password', noPassword: 'Enter your password.',
    forgot: 'Forgot password?', forgotInfo: "Your school manages ENARA accounts. Ask your school's administrator to reset your password.",
    forgotSent: "If an account exists for that email, we have sent a link to reset the password. It works once, for 30 minutes. No email? Ask your school's administrator.",
    forgotNeedEmail: 'Enter your email above first, then choose Forgot password.',
    show: 'Show password', hide: 'Hide password',
    submit: 'Continue', loading: 'Signing in…',
    managed: 'Your school manages your account.',
    wrong: "That email and password don't match. Check them and try again.",
    unreachable: 'Could not reach the server. Please try again.',
    wrongPortal: (chosen: string, right: string) => `This account can't sign in as ${chosen}. Choose "${right}" instead.`,
    progressLabel: 'Adding fractions', progressNote: 'Practising with your tutor',
    lang: 'Language',
    demoTitle: 'New to Enara? Try the demo', demoSub: 'One click opens your own demo school. No sign-up.',
    demoRoles: { student: 'Student', teacher: 'Teacher', admin: 'School admin' } as Record<DemoRole, string>,
    demoStarting: 'Opening…', demoFailed: 'The demo could not start. Please try again.',
  },
  ar: {
    heroA: 'تعلّم ', heroB: 'بيتحرك', heroC: ' معاك.',
    heroP: 'الدروس والتدريب والتقييم في مكان واحد، مع مدرّس ذكي بيتكيّف مع كل خطوة.',
    welcome: 'أهلاً بيك تاني', sub: 'سجّل دخولك عشان تكمّل تعلّمك.',
    shared: 'سجّل دخولك عشان تفتح اللي اتشارك معاك.',
    portal: 'البوابة', portals: { student: 'طالب', admin: 'فريق المدرسة', 'enara-admin': 'فريق إنارة', parent: 'أولياء الأمور' } as Record<LoginChoice, string>,
    parentSub: 'شوف ابنك بيتدرّب إزاي، وبيتحسّن قد إيه، وإنه في أمان.',
    parentSignupSub: 'اعمل حساب وليّ أمر. هتربط ابنك بالكود اللي من المدرسة.',
    parentLinkSub: 'سجّل دخولك أو اعمل حساب وليّ أمر، وبعدين اكتب الكود اللي من المدرسة.',
    parentCreate: 'اعمل حساب وليّ أمر', parentHaveAccount: 'عندك حساب؟ سجّل دخولك',
    parentLink: 'معاك كود دعوة؟ اربط ابنك',
    name: 'اسمك', namePh: 'مثلاً: منى حسن', noName: 'اكتب اسمك.',
    newPassword: 'اختار كلمة سر', newPasswordPh: '٨ حروف على الأقل', shortPassword: 'استخدم ٨ حروف على الأقل.',
    createSubmit: 'اعمل الحساب', creating: 'جاري عمل الحساب…', exists: 'فيه حساب بالإيميل ده. سجّل دخولك بدل كده.',
    parentForgotInfo: 'هنبعت لك رابط على الإيميل تغيّر بيه كلمة السر.',
    parentManaged: 'حساب وليّ الأمر بيشوف بس الأبناء المربوطين بكود من المدرسة.',
    or: 'أو',
    googleFailed: 'الدخول بجوجل ما نفعش. جرّب تاني، أو استخدم الإيميل وكلمة السر.',
    googleUnverified: 'إيميل جوجل بتاعك مش متأكَّد منه. أكّده عند جوجل، أو استخدم الإيميل وكلمة السر.',
    googleNotParent: 'الإيميل ده تبع حساب مدرسة على إنارة، فمينفعش يبقى حساب وليّ أمر. ادخل من تبويب «طالب» أو «فريق المدرسة»، أو استخدم حساب جوجل تاني.',
    googleMismatch: 'حساب وليّ الأمر ده مربوط بحساب جوجل تاني. استخدم حساب جوجل ده، أو الإيميل وكلمة السر.',
    googleUnavailable: 'الدخول بجوجل مش متاح دلوقتي. استخدم الإيميل وكلمة السر.',
    email: 'الإيميل', emailPh: 'name@school.edu', badEmail: 'اكتب إيميل زي name@school.edu.',
    password: 'كلمة السر', passwordPh: 'كلمة السر بتاعتك', noPassword: 'اكتب كلمة السر.',
    forgot: 'نسيت كلمة السر؟', forgotInfo: 'مدرستك هي اللي بتدير حسابات إنارة. اطلب من مسؤول المدرسة يغيّر لك كلمة السر.',
    forgotSent: 'لو فيه حساب بالإيميل ده، بعتنا لك رابط تغيّر بيه كلمة السر. الرابط يشتغل مرة واحدة لمدة ٣٠ دقيقة. ما وصلكش؟ كلّم مسؤول المدرسة.',
    forgotNeedEmail: 'اكتب إيميلك الأول، وبعدين دوس على نسيت كلمة السر.',
    show: 'إظهار كلمة السر', hide: 'إخفاء كلمة السر',
    submit: 'متابعة', loading: 'جاري تسجيل الدخول…',
    managed: 'مدرستك هي اللي بتدير حسابك.',
    wrong: 'الإيميل وكلمة السر مش متطابقين. راجعهم وجرّب تاني.',
    unreachable: 'مش قادرين نوصل للسيرفر. جرّب تاني.',
    wrongPortal: (chosen: string, right: string) => `الحساب ده مينفعش يدخل كـ«${chosen}». اختار «${right}».`,
    progressLabel: 'جمع الكسور', progressNote: 'بتتدرّب مع المدرّس',
    lang: 'اللغة',
    demoTitle: 'جديد على إنارة؟ جرّب النسخة التجريبية', demoSub: 'بضغطة واحدة تفتح مدرسة تجريبية خاصة بيك. من غير تسجيل.',
    demoRoles: { student: 'طالب', teacher: 'مدرّس', admin: 'مسؤول المدرسة' } as Record<DemoRole, string>,
    demoStarting: 'جاري الفتح…', demoFailed: 'مقدرناش نفتح النسخة التجريبية. جرّب تاني.',
  },
};

// The card an account should use, from its backend role (see roleRouting).
const PORTAL_FOR_ROLE: Record<string, LoginChoice> = {
  student: 'student', teacher: 'admin', academic_manager: 'admin', admin: 'admin', 'enara-admin': 'enara-admin', parent: 'parent',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Login: React.FC<LoginProps> = ({ onLogin, isSharedCourse, isSharedAssessment, initialPortal }) => {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem('enara_parents_lang') === 'ar' && initialPortal === 'parent' ? 'ar' : 'en'; } catch { return 'en'; }
  });
  const [portal, setPortal] = useState<LoginChoice>(initialPortal ?? 'student');
  // Parents tab: sign in, or create a parent account; linkIntent opens the code screen next.
  const [parentMode, setParentMode] = useState<'signin' | 'signup'>('signin');
  const [linkIntent, setLinkIntent] = useState(() => { try { return sessionStorage.getItem(PARENT_LINK_INTENT_KEY) === '1'; } catch { return false; } });
  const [name, setName] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: 'email' | 'password' | 'name'; text: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Parents tab: "Continue with Google", shown only when the server has a Google client ID.
  const [googleCfg, setGoogleCfg] = useState<{ google: boolean; clientId?: string }>({ google: false });
  useEffect(() => {
    if (isSharedCourse || isSharedAssessment) return;
    fetchParentAuthConfig().then((c) => setGoogleCfg(c?.google && c.clientId ? c : { google: false })).catch(() => setGoogleCfg({ google: false }));
  }, [isSharedCourse, isSharedAssessment]);
  // One-click partner demo, shown only while the demo is open.
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState<DemoRole | null>(null);
  useEffect(() => {
    if (isSharedCourse || isSharedAssessment) return;
    fetchDemoStatus().then((s) => setDemoOpen(s.available)).catch(() => setDemoOpen(false));
  }, [isSharedCourse, isSharedAssessment]);
  const tryDemo = async (role: DemoRole) => {
    if (demoBusy) return;
    setDemoBusy(role);
    setAuthError(null);
    try {
      const user = await startDemo(role);
      const ui = uiRoleFor(user.role, role === 'student' ? 'student' : 'admin');
      if (!ui) throw new Error();
      onLogin(ui, user);
    } catch (e: any) {
      setAuthError((lang === 'en' && e?.message) || t.demoFailed);
      setDemoBusy(null);
    }
  };
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

  const choosePortal = (p: LoginChoice) => { setPortal(p); setAuthError(null); setInfo(null); setFieldError(null); };
  // Tabs (WAI-ARIA): arrows move and select, Home/End jump; direction follows the page.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let n = -1;
    if (e.key === fwd) n = (i + 1) % PORTALS.length;
    else if (e.key === back) n = (i - 1 + PORTALS.length) % PORTALS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = PORTALS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    choosePortal(PORTALS[n]);
    tabRefs.current[n]?.focus();
  };
  const isParent = portal === 'parent';
  const signingUp = isParent && parentMode === 'signup';
  const rememberLinkIntent = (on: boolean) => {
    setLinkIntent(on);
    try { if (on) sessionStorage.setItem(PARENT_LINK_INTENT_KEY, '1'); else sessionStorage.removeItem(PARENT_LINK_INTENT_KEY); } catch { /* storage unavailable */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null); setInfo(null); setFieldError(null);
    if (!EMAIL_RE.test(email.trim())) { setFieldError({ field: 'email', text: t.badEmail }); return; }
    if (!password) { setFieldError({ field: 'password', text: t.noPassword }); return; }
    if (signingUp && !name.trim()) { setFieldError({ field: 'name', text: t.noName }); return; }
    if (signingUp && password.length < 8) { setFieldError({ field: 'password', text: t.shortPassword }); return; }
    setIsLoading(true);
    try {
      if (signingUp) {
        try { localStorage.setItem('enara_parents_lang', lang); } catch { /* storage unavailable */ }
        const created = await registerParent(name, email, password, lang);
        onLogin('parent', created);
        return;
      }
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
      setAuthError(err?.status === 401 ? t.wrong : err?.status === 409 && signingUp ? t.exists : (lang === 'en' && err?.message) || t.unreachable);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setAuthError(null); setInfo(null); setFieldError(null);
    setIsLoading(true);
    try {
      try { localStorage.setItem('enara_parents_lang', lang); } catch { /* storage unavailable */ }
      const user = await googleParentSignIn(credential, lang);
      onLogin('parent', user);
    } catch (err: any) {
      const code = err?.code;
      setAuthError(
        code === 'GOOGLE_ACCOUNT_NOT_PARENT' ? t.googleNotParent
          : code === 'GOOGLE_ACCOUNT_MISMATCH' ? t.googleMismatch
          : code === 'GOOGLE_EMAIL_UNVERIFIED' ? t.googleUnverified
          : err?.status === 503 ? t.googleUnavailable
          : err?.status ? t.googleFailed : t.unreachable,
      );
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
          <p>{isSharedCourse || isSharedAssessment ? t.shared : isParent ? (linkIntent ? t.parentLinkSub : signingUp ? t.parentSignupSub : t.parentSub) : t.sub}</p>
        </div>

        <div className="si-seg" role="tablist" aria-label={t.portal} style={{ ['--i' as any]: portalIndex, ['--n' as any]: PORTALS.length }}>
          <span className="thumb" aria-hidden="true" />
          {PORTALS.map((p, i) => (
            <button key={p} type="button" role="tab" id={`si-tab-${p}`} aria-controls="si-panel" aria-selected={portal === p} tabIndex={portal === p ? 0 : -1}
              ref={(el) => { tabRefs.current[i] = el; }} onKeyDown={(e) => onTabKey(e, i)} onClick={() => choosePortal(p)}>{t.portals[p]}</button>
          ))}
        </div>

        <div className="si-panel" id="si-panel" role="tabpanel" aria-labelledby={`si-tab-${portal}`}>

        {authError && (
          <div className="si-alert err" role="alert"><CircleAlert size={18} /><span>{authError}</span></div>
        )}
        {info && (
          <div className="si-alert info" role="status"><Info size={18} /><span>{info}</span></div>
        )}

        {isParent && googleCfg.google && googleCfg.clientId && (
          <GoogleSignInButton clientId={googleCfg.clientId} lang={lang} context={signingUp ? 'signup' : 'signin'} disabled={isLoading} onCredential={handleGoogle} orLabel={t.or} />
        )}

        {signingUp && (
          <div className="si-field">
            <label htmlFor="si-name">{t.name}</label>
            <div className={`si-input${fieldError?.field === 'name' ? ' err' : ''}`}>
              <UserRound size={18} />
              <input id="si-name" type="text" autoComplete="name" placeholder={t.namePh} value={name}
                aria-invalid={fieldError?.field === 'name'} aria-describedby={fieldError?.field === 'name' ? 'si-name-err' : undefined}
                onChange={(e) => { setName(e.target.value); if (fieldError?.field === 'name') setFieldError(null); }} />
            </div>
            {fieldError?.field === 'name' && <p className="si-hint err" id="si-name-err"><CircleAlert size={14} />{fieldError.text}</p>}
          </div>
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
            {signingUp ? t.newPassword : t.password}
            {!signingUp && <button type="button" className="si-link" onClick={() => {
              setAuthError(null);
              if (!EMAIL_RE.test(email.trim())) { setInfo(t.forgotNeedEmail); return; }
              // Always the same answer, whether or not the account exists.
              requestPasswordReset(email.trim()).catch(() => undefined).finally(() => setInfo(t.forgotSent));
            }}>{t.forgot}</button>}
          </label>
          <div className={`si-input${fieldError?.field === 'password' ? ' err' : ''}`}>
            <KeyRound size={18} />
            <input id="si-pass" type={showPassword ? 'text' : 'password'} autoComplete={signingUp ? 'new-password' : 'current-password'} placeholder={signingUp ? t.newPasswordPh : t.passwordPh} value={password}
              aria-invalid={fieldError?.field === 'password'} aria-describedby={fieldError?.field === 'password' ? 'si-pass-err' : undefined}
              onChange={(e) => { setPassword(e.target.value); if (fieldError?.field === 'password') setFieldError(null); }} />
            <button type="button" aria-label={showPassword ? t.hide : t.show} onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fieldError?.field === 'password' && <p className="si-hint err" id="si-pass-err"><CircleAlert size={14} />{fieldError.text}</p>}
        </div>

        <button type="submit" className="si-submit" disabled={isLoading}>
          {isLoading ? <><span className="si-spin" />{signingUp ? t.creating : t.loading}</> : <>{signingUp ? t.createSubmit : t.submit}<ArrowRight size={18} /></>}
        </button>
        {isParent && (
          <div className="si-parent-links">
            <button type="button" className="si-ghost" onClick={() => { setParentMode(signingUp ? 'signin' : 'signup'); setFieldError(null); setAuthError(null); }}>
              <UserRound size={16} />{signingUp ? t.parentHaveAccount : t.parentCreate}
            </button>
            <button type="button" className="si-ghost" aria-pressed={linkIntent} onClick={() => rememberLinkIntent(!linkIntent)}>
              <Link2 size={16} />{t.parentLink}
            </button>
          </div>
        )}
        <p className="si-hint"><Lock size={14} />{isParent ? t.parentManaged : t.managed}</p>
        </div>

        {demoOpen && !isParent && (
          <div className="si-demo" role="group" aria-labelledby="si-demo-title">
            <p className="si-demo-title" id="si-demo-title">{t.demoTitle}</p>
            <p className="si-demo-sub">{t.demoSub}</p>
            <div className="si-demo-roles">
              {(['student', 'teacher', 'admin'] as DemoRole[]).map((r) => (
                <button key={r} type="button" disabled={!!demoBusy} onClick={() => tryDemo(r)}>
                  {r === 'student' ? <GraduationCap size={16} /> : r === 'teacher' ? <BookOpen size={16} /> : <LayoutDashboard size={16} />}
                  {demoBusy === r ? t.demoStarting : t.demoRoles[r]}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
