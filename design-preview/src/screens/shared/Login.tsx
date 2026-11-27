import { Mail, ShieldCheck } from 'lucide-react';
import { useT } from '@/lib/preview';
import { Logo } from '@/components/shell';
import { Button, Card, Checkbox, Separator, TextField } from '@/components/ui';

const T = {
  en: {
    welcome: 'Welcome back', sub: 'Sign in to continue learning with ENARA.', email: 'Email', emailPh: 'name@school.edu.eg', password: 'Password',
    remember: 'Keep me signed in on this device', signIn: 'Sign in', forgot: 'Forgot your password?', or: 'or', google: 'Continue with Google',
    lms: 'Coming from your school’s Moodle? Open ENARA from your course.', parent: 'Are you a parent?', parentCode: 'Enter your school code',
    side: 'A tutor that teaches one step at a time, in Arabic and English.', sideSub: 'Used by schools across Egypt. Your data stays with your school.', privacy: 'Your school controls your data.',
  },
  ar: {
    welcome: 'مرحبًا بعودتك', sub: 'سجّل الدخول لمتابعة التعلم مع إنارة.', email: 'البريد الإلكتروني', emailPh: 'name@school.edu.eg', password: 'كلمة المرور',
    remember: 'إبقائي مسجّلًا على هذا الجهاز', signIn: 'تسجيل الدخول', forgot: 'نسيت كلمة المرور؟', or: 'أو', google: 'المتابعة باستخدام Google',
    lms: 'هل تأتي من منصة Moodle في مدرستك؟ افتح إنارة من صفحة المقرر.', parent: 'هل أنت ولي أمر؟', parentCode: 'أدخل رمز المدرسة',
    side: 'معلّم يشرح خطوة واحدة في كل مرة، بالعربية والإنجليزية.', sideSub: 'تستخدمه مدارس في أنحاء مصر. بياناتك تبقى لدى مدرستك.', privacy: 'مدرستك هي التي تتحكم في بياناتك.',
  },
};

export default function Login() {
  const t = useT(T);
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground md:flex">
        <Logo className="text-primary-foreground [&_rect:first-child]:fill-[var(--primary-foreground)] [&_rect:first-child]:opacity-15" />
        <div className="max-w-md">
          <p className="text-3xl font-extrabold leading-snug">{t.side}</p>
          <p className="mt-3 text-primary-foreground/75">{t.sideSub}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-primary-foreground/75"><ShieldCheck className="size-4" />{t.privacy}</p>
      </div>
      <div className="flex items-center justify-center p-5">
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none md:border md:bg-card md:p-2 md:shadow-sm">
          <div className="flex flex-col gap-5 p-1 md:p-5">
            <Logo className="md:hidden" />
            <div><h1 className="text-2xl font-extrabold">{t.welcome}</h1><p className="mt-1 text-sm text-muted-foreground">{t.sub}</p></div>
            <TextField label={t.email} placeholder={t.emailPh} type="email" defaultValue="salma.adel@nvis.edu.eg" />
            <TextField label={t.password} type="password" defaultValue="••••••••••" />
            <div className="flex items-center justify-between gap-2"><Checkbox defaultSelected>{t.remember}</Checkbox></div>
            <Button size="lg" className="w-full">{t.signIn}</Button>
            <a href="#" className="text-center text-sm font-semibold text-primary">{t.forgot}</a>
            <div className="flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />{t.or}<Separator className="flex-1" /></div>
            <Button variant="outline" size="lg" className="w-full"><GoogleMark />{t.google}</Button>
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t.lms}</p>
            <p className="text-center text-sm">{t.parent} <a href="#" className="font-semibold text-primary"><Mail className="hidden" />{t.parentCode}</a></p>
          </div>
        </Card>
      </div>
    </div>
  );
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8Z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4Z" /></svg>
);
