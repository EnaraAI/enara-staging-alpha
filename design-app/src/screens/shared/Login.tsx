import { useState } from 'react';
import { Form } from 'react-aria-components';
import { ShieldCheck } from 'lucide-react';
import { usePreview, useT } from '@/lib/preview';
import { useSession, homeFor } from '@/lib/session';
import { errorText } from '@/lib/api';
import { go, setLang } from '@/App';
import { Logo } from '@/components/shell';
import { Alert, Button, Card, Checkbox, Separator, TextField } from '@/components/ui';

const T = {
  en: {
    welcome: 'Welcome back', sub: 'Sign in to continue learning with ENARA.', email: 'Email', emailPh: 'name@school.edu.eg', password: 'Password',
    remember: 'Keep me signed in on this device', signIn: 'Sign in', signingIn: 'Signing in…', forgot: 'Forgot your password?', or: 'or',
    lms: 'Coming from your school’s Moodle? Open ENARA from your course.', parent: 'Are you a parent?', parentCode: 'Enter your school code',
    side: 'A tutor that teaches one step at a time, in Arabic and English.', sideSub: 'Used by schools across Egypt. Your data stays with your school.', privacy: 'Your school controls your data.',
    missing: 'Enter your email and password.', other: 'العربية',
  },
  ar: {
    welcome: 'مرحبًا بعودتك', sub: 'سجّل الدخول لمتابعة التعلم مع إنارة.', email: 'البريد الإلكتروني', emailPh: 'name@school.edu.eg', password: 'كلمة المرور',
    remember: 'إبقائي مسجّلًا على هذا الجهاز', signIn: 'تسجيل الدخول', signingIn: 'جارٍ تسجيل الدخول…', forgot: 'نسيت كلمة المرور؟', or: 'أو',
    lms: 'هل تأتي من منصة Moodle في مدرستك؟ افتح إنارة من صفحة المقرر.', parent: 'هل أنت ولي أمر؟', parentCode: 'أدخل رمز المدرسة',
    side: 'معلّم يشرح خطوة واحدة في كل مرة، بالعربية والإنجليزية.', sideSub: 'تستخدمه مدارس في أنحاء مصر. بياناتك تبقى لدى مدرستك.', privacy: 'مدرستك هي التي تتحكم في بياناتك.',
    missing: 'أدخل بريدك الإلكتروني وكلمة المرور.', other: 'English',
  },
};

export default function Login() {
  const t = useT(T);
  const { lang } = usePreview();
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError(t.missing); return; }
    setBusy(true); setError(null);
    try { const u = await login(email, password); go(homeFor(u)); }
    catch (e) { setError(errorText(e, lang)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground md:flex">
        <Logo className="h-12 self-start text-primary-foreground" />
        <div className="max-w-md">
          <p className="text-3xl font-extrabold leading-snug">{t.side}</p>
          <p className="mt-3 text-primary-foreground/75">{t.sideSub}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-primary-foreground/75"><ShieldCheck className="size-4" />{t.privacy}</p>
      </div>
      <div className="flex items-center justify-center p-5">
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none md:border md:bg-card md:p-2 md:shadow-sm">
          <Form className="flex flex-col gap-5 p-1 md:p-5" onSubmit={(e) => { e.preventDefault(); void submit(); }} data-testid="login-form">
            <div className="flex items-center justify-between md:justify-end">
              <Logo className="md:hidden" />
              <button type="button" className="text-sm font-semibold text-primary" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} data-testid="lang-toggle">{t.other}</button>
            </div>
            <div><h1 className="text-2xl font-extrabold">{t.welcome}</h1><p className="mt-1 text-sm text-muted-foreground">{t.sub}</p></div>
            {error && <Alert tone="danger" title={error} />}
            <TextField label={t.email} placeholder={t.emailPh} type="email" name="email" autoComplete="username" value={email} onChange={setEmail} data-testid="login-email" />
            <TextField label={t.password} type="password" name="password" autoComplete="current-password" value={password} onChange={setPassword} data-testid="login-password" />
            <Checkbox defaultSelected>{t.remember}</Checkbox>
            <Button type="submit" size="lg" className="w-full" isDisabled={busy} data-testid="login-submit">{busy ? t.signingIn : t.signIn}</Button>
            <a href="#/login" className="text-center text-sm font-semibold text-primary">{t.forgot}</a>
            <div className="flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />{t.or}<Separator className="flex-1" /></div>
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t.lms}</p>
            <p className="text-center text-sm">{t.parent} <a href="#/parent-code" className="font-semibold text-primary" data-testid="to-parent-code">{t.parentCode}</a></p>
          </Form>
        </Card>
      </div>
    </div>
  );
}
