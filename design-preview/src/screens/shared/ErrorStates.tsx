import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft, CloudOff, Home, Lock, RefreshCw, WifiOff, X } from 'lucide-react';
import { useT } from '@/lib/preview';
import { Logo } from '@/components/shell';
import { Alert, Badge, Button, Card, Dir, TextField } from '@/components/ui';

const T = {
  en: {
    title: 'Error states', sub: 'When something goes wrong we say what happened, that nothing is lost, and what to do next.',
    offlineTag: 'Offline banner', offlineTitle: 'You’re offline.', offlineText: 'Your answers are saved on this device and will send when you’re back online.', offlineRetry: 'Try now',
    loadTag: 'Couldn’t load', loadTitle: 'We couldn’t load your results', loadText: 'This is usually a weak connection. Your work is safe.', retry: 'Try again', code: 'Reference: RES-503 · 4:32 pm',
    nfTag: 'Page not found', nfTitle: 'We can’t find this page', nfText: 'The link may be old, or the page has moved.', home: 'Go to my home',
    denyTag: 'Permission denied', denyTitle: 'This page is for teachers', denyText: 'If you think you should see it, ask your school’s ENARA admin.', back: 'Back',
    formTag: 'Form validation', formSummary: 'Please fix 2 things before you continue.', email: 'Email', emailErr: 'Enter an email like name@school.edu.eg', password: 'Password', passErr: 'Use at least 8 characters.', name: 'Full name', nameVal: 'Salma Adel', save: 'Save changes',
    toastTag: 'Toast', toastTitle: 'Your answer didn’t send', toastText: 'We’ll try again in 10 seconds.', toastAction: 'Send now', close: 'Close',
    okTitle: 'Saved', okText: 'Your essay is saved.',
  },
  ar: {
    title: 'حالات الخطأ', sub: 'عندما يحدث خطأ نوضّح ما جرى، ونطمئن المستخدم بأن شيئًا لم يُفقَد، ونرشده إلى الخطوة التالية.',
    offlineTag: 'شريط عدم الاتصال', offlineTitle: 'أنت غير متصل بالإنترنت.', offlineText: 'إجاباتك محفوظة على هذا الجهاز، وستُرسَل عند عودة الاتصال.', offlineRetry: 'المحاولة الآن',
    loadTag: 'تعذّر التحميل', loadTitle: 'تعذّر تحميل نتائجك', loadText: 'يحدث هذا غالبًا بسبب ضعف الاتصال. عملك في أمان.', retry: 'إعادة المحاولة', code: 'المرجع: RES-503 · 4:32 م',
    nfTag: 'الصفحة غير موجودة', nfTitle: 'لم نعثر على هذه الصفحة', nfText: 'قد يكون الرابط قديمًا، أو نُقلت الصفحة إلى مكان آخر.', home: 'الذهاب إلى صفحتي الرئيسية',
    denyTag: 'لا تملك صلاحية', denyTitle: 'هذه الصفحة مخصّصة للمعلّمين', denyText: 'إذا كنت ترى أنه ينبغي لك الوصول إليها، فتواصل مع مسؤول إنارة في مدرستك.', back: 'رجوع',
    formTag: 'التحقق من النموذج', formSummary: 'يُرجى تصحيح أمرين قبل المتابعة.', email: 'البريد الإلكتروني', emailErr: 'أدخل بريدًا إلكترونيًا مثل name@school.edu.eg', password: 'كلمة المرور', passErr: 'استخدم 8 خانات على الأقل.', name: 'الاسم الكامل', nameVal: 'سلمى عادل', save: 'حفظ التغييرات',
    toastTag: 'إشعار منبثق', toastTitle: 'لم تُرسَل إجابتك', toastText: 'سنعيد المحاولة بعد 10 ثوانٍ.', toastAction: 'الإرسال الآن', close: 'إغلاق',
    okTitle: 'تم الحفظ', okText: 'حُفِظ مقالك.',
  },
};

const Tag = ({ children }: { children: ReactNode }) => <Badge tone="neutral" className="w-fit">{children}</Badge>;

const Illo404 = () => (
  <svg viewBox="0 0 220 110" className="h-24 w-auto" aria-hidden direction="ltr">
    <ellipse cx="110" cy="100" rx="80" ry="7" fill="var(--muted)" />
    <text x="62" y="80" textAnchor="middle" fontSize="68" fontWeight="800" fill="var(--secondary)" stroke="var(--input)" strokeWidth="2" fontFamily="var(--font-latin)">4</text>
    <text x="158" y="80" textAnchor="middle" fontSize="68" fontWeight="800" fill="var(--secondary)" stroke="var(--input)" strokeWidth="2" fontFamily="var(--font-latin)">4</text>
    <path d="M124 72l16 16" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
    <circle cx="110" cy="56" r="22" fill="var(--card)" stroke="var(--primary)" strokeWidth="6" />
    <path d="M101 50q5-6 12-4" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  </svg>
);

export default function ErrorStates() {
  const t = useT(T);
  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 md:gap-8">
        <header className="flex flex-col gap-3">
          <Logo />
          <div><h1 className="text-2xl font-extrabold md:text-3xl">{t.title}</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{t.sub}</p></div>
        </header>

        {/* Offline banner, shown inside a small page frame */}
        <section className="flex flex-col gap-2">
          <Tag>{t.offlineTag}</Tag>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-4 py-3"><Logo compact /><span className="h-2.5 w-28 rounded-full bg-muted" /><span className="ms-auto size-7 rounded-full bg-muted" /></div>
            <div role="status" className="flex flex-col gap-3 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
              <span className="flex flex-1 items-start gap-3 text-sm">
                <WifiOff className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
                <span><strong className="font-bold">{t.offlineTitle}</strong> <span className="text-foreground/80">{t.offlineText}</span></span>
              </span>
              <Button variant="outline" size="sm" className="self-start sm:self-auto"><RefreshCw />{t.offlineRetry}</Button>
            </div>
            <div className="flex flex-col gap-2.5 p-4 opacity-60"><span className="h-3 w-2/3 rounded-full bg-muted" /><span className="h-3 w-1/2 rounded-full bg-muted" /><span className="h-3 w-3/5 rounded-full bg-muted" /></div>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Couldn't load */}
          <section className="flex flex-col gap-2">
            <Tag>{t.loadTag}</Tag>
            <Card className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-info-soft text-info"><CloudOff className="size-7" /></span>
              <h2 className="text-lg font-bold">{t.loadTitle}</h2>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t.loadText}</p>
              <Button className="mt-1"><RefreshCw />{t.retry}</Button>
              <p className="text-xs text-muted-foreground">{t.code}</p>
            </Card>
          </section>

          {/* 404 */}
          <section className="flex flex-col gap-2">
            <Tag>{t.nfTag}</Tag>
            <Card className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <Illo404 />
              <h2 className="text-lg font-bold">{t.nfTitle}</h2>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t.nfText}</p>
              <Button variant="outline" className="mt-1"><Home />{t.home}</Button>
            </Card>
          </section>

          {/* Permission denied */}
          <section className="flex flex-col gap-2">
            <Tag>{t.denyTag}</Tag>
            <Card className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Lock className="size-7" /></span>
              <h2 className="text-lg font-bold">{t.denyTitle}</h2>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t.denyText}</p>
              <Button variant="outline" className="mt-1"><Dir><ArrowLeft /></Dir>{t.back}</Button>
            </Card>
          </section>

          {/* Form validation */}
          <section className="flex flex-col gap-2">
            <Tag>{t.formTag}</Tag>
            <Card className="flex flex-1 flex-col gap-4 p-5 md:p-6">
              <Alert tone="danger" icon={<AlertCircle />} title={t.formSummary} />
              <TextField label={t.name} defaultValue={t.nameVal} />
              <TextField label={t.email} defaultValue="salma.adel@nvis" isInvalid error={t.emailErr} />
              <TextField label={t.password} type="password" defaultValue="nile12" isInvalid error={t.passErr} />
              <Button className="w-full sm:w-fit">{t.save}</Button>
            </Card>
          </section>
        </div>

        {/* Toasts */}
        <section className="flex flex-col gap-2">
          <Tag>{t.toastTag}</Tag>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/40 p-4 md:flex-row md:items-start md:justify-center md:gap-5 md:p-8">
            <div role="alert" className="flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-xl shadow-primary/10">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive-soft text-destructive"><AlertCircle className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t.toastTitle}</p>
                <p className="text-sm text-muted-foreground">{t.toastText}</p>
                <Button variant="link" size="sm" className="mt-1 h-auto p-0">{t.toastAction}</Button>
              </div>
              <Button variant="ghost" size="icon" aria-label={t.close} className="-me-2 -mt-2 size-9"><X className="size-4" /></Button>
            </div>
            <div role="status" className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-foreground p-3 ps-4 text-sm text-background shadow-xl">
              <span className="size-2 shrink-0 rounded-full bg-success" />
              <span className="flex-1"><strong>{t.okTitle}.</strong> {t.okText}</span>
              <Button variant="ghost" size="icon" aria-label={t.close} className="size-8 text-background/70 data-[hovered]:bg-background/10"><X className="size-4" /></Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
