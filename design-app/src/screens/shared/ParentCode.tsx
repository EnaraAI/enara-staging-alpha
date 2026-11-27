import { ArrowRight, BarChart3, CalendarCheck, Clock, Mail, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { usePreview, useT } from '@/lib/preview';
import { homeFor, useSession } from '@/lib/session';
import { errorText } from '@/lib/api';
import { go, setLang } from '@/App';
import { Logo } from '@/components/shell';
import { Alert, Button, Card, Dir } from '@/components/ui';
import { cn } from '@/lib/utils';

const T = {
  en: {
    side: 'Follow your child’s learning, one calm weekly view.', sideSub: 'Schools share a private code with each family. No new password to remember.',
    privacy: 'Only your child’s school can create a code for you.',
    step: 'Parent access', title: 'Enter your school code', sub: 'Type the 8-character code from the letter or text message your child’s school sent you.',
    codeLabel: 'School code', help: 'Letters and numbers only. Capital or small letters both work.', where: 'Where do I find it?', whereText: 'It is printed on the welcome letter from NVIS and was sent by SMS to the number the school has on file.',
    cont: 'Continue', seeTitle: 'After you join you will see', see: ['Progress in each subject, every week', 'Upcoming assignments and results', 'Notes from your child’s teachers', 'Time spent learning'],
    email: 'Sign in with email instead', noCode: 'No code yet? Ask the school office.',
    checking: 'Checking…', confirmTitle: 'Is this your child?', confirmAt: (l: string, s: string) => `${l} at ${s}`, yes: 'Yes, open ENARA Parents', no: 'No, use another code', opening: 'Opening…', back: 'Sign in with a password', other: 'العربية',
  },
  ar: {
    side: 'تابِع تعلّم طفلك من خلال عرض أسبوعي هادئ.', sideSub: 'تشارك المدرسة رمزًا خاصًا مع كل أسرة، فلا حاجة إلى تذكّر كلمة مرور جديدة.',
    privacy: 'مدرسة طفلك وحدها هي التي تُنشئ لك الرمز.',
    step: 'دخول أولياء الأمور', title: 'أدخل رمز المدرسة', sub: 'اكتب الرمز المكوّن من 8 خانات الوارد في الخطاب أو الرسالة النصية التي أرسلتها مدرسة طفلك.',
    codeLabel: 'رمز المدرسة', help: 'حروف وأرقام فقط، ولا فرق بين الحروف الكبيرة والصغيرة.', where: 'أين أجد الرمز؟', whereText: 'تجده مطبوعًا في خطاب الترحيب من مدرسة وادي النيل الدولية، وقد أُرسل أيضًا برسالة نصية إلى الرقم المسجَّل لدى المدرسة.',
    cont: 'متابعة', seeTitle: 'بعد الانضمام سترى', see: ['تقدّم طفلك في كل مادة أسبوعيًا', 'الواجبات القادمة والنتائج', 'ملاحظات معلّمي طفلك', 'الوقت الذي يقضيه في التعلّم'],
    email: 'تسجيل الدخول بالبريد الإلكتروني بدلًا من ذلك', noCode: 'ليس لديك رمز بعد؟ تواصل مع إدارة المدرسة.',
    checking: 'جارٍ التحقق…', confirmTitle: 'هل هذا طفلك؟', confirmAt: (l: string, s: string) => `${l} في ${s}`, yes: 'نعم، افتح إنارة لأولياء الأمور', no: 'لا، استخدم رمزًا آخر', opening: 'جارٍ الفتح…', back: 'تسجيل الدخول بكلمة المرور', other: 'English',
  },
};


export default function ParentCode() {
  const t = useT(T);
  const { lang } = usePreview();
  const { parentCodePreview, parentCodeStart } = useSession();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ learner: string; school: string | null } | null>(null);
  const CODE = Array.from({ length: 8 }, (_, i) => raw[i] ?? '');
  const onType = (v: string) => { let r = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (r.startsWith('ENR') && r.length > 8) r = r.slice(3); setRaw(r.slice(0, 8)); setError(null); setFound(null); };
  const check = async () => {
    setBusy(true); setError(null);
    try { setFound(await parentCodePreview(`ENR-${raw.slice(0, 4)}-${raw.slice(4)}`)); }
    catch (e) { setError(errorText(e, lang)); }
    finally { setBusy(false); }
  };
  const start = async () => {
    setBusy(true); setError(null);
    try { const u = await parentCodeStart(`ENR-${raw.slice(0, 4)}-${raw.slice(4)}`, lang); go(homeFor(u)); }
    catch (e) { setError(errorText(e, lang)); setBusy(false); }
  };
  const icons = [<BarChart3 key="a" />, <CalendarCheck key="b" />, <MessageSquareText key="c" />, <Clock key="d" />];
  const box = (ch: string, i: number) => (
    <span key={i} className={cn(
      'relative grid h-14 min-w-0 flex-1 place-items-center rounded-lg border-2 bg-card font-mono text-2xl font-bold uppercase md:h-16 md:text-3xl',
      ch ? 'border-input' : 'border-input/70 bg-muted/50',
      i === Math.min(raw.length, 7) && 'border-ring bg-card ring-4 ring-ring/15',
    )}>
      {ch}
      {i === raw.length && !ch && <span aria-hidden className="h-7 w-0.5 animate-pulse rounded-full bg-primary" />}
    </span>
  );
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground md:flex">
        <Logo className="text-primary-foreground [&_rect:first-child]:fill-[var(--primary-foreground)] [&_rect:first-child]:opacity-15" />
        <div className="max-w-md">
          <p className="text-3xl font-extrabold leading-snug">{t.side}</p>
          <p className="mt-3 text-primary-foreground/75">{t.sideSub}</p>
          {/* Small illustration: a phone showing a weekly bar chart */}
          <svg viewBox="0 0 260 120" className="mt-10 w-72" aria-hidden>
            <rect x="0" y="10" width="170" height="100" rx="16" fill="var(--primary-foreground)" opacity=".08" />
            {[38, 62, 48, 80, 70].map((h, i) => <rect key={i} x={20 + i * 28} y={96 - h} width="16" height={h} rx="5" fill={i === 3 ? 'var(--accent)' : 'var(--primary-foreground)'} opacity={i === 3 ? 1 : 0.3} />)}
            <rect x="190" y="0" width="64" height="116" rx="14" fill="var(--primary-foreground)" opacity=".14" />
            <rect x="200" y="16" width="44" height="8" rx="4" fill="var(--accent)" />
            <rect x="200" y="34" width="32" height="6" rx="3" fill="var(--primary-foreground)" opacity=".4" />
            <rect x="200" y="48" width="38" height="6" rx="3" fill="var(--primary-foreground)" opacity=".4" />
            <circle cx="222" cy="86" r="14" fill="none" stroke="var(--primary-foreground)" strokeOpacity=".4" strokeWidth="5" />
            <path d="M222 72a14 14 0 0 1 13 19" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="flex items-center gap-2 text-sm text-primary-foreground/75"><ShieldCheck className="size-4" />{t.privacy}</p>
      </div>

      <div className="flex items-start justify-center p-5 md:items-center md:p-10">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex items-center justify-between"><Logo className="md:hidden" /><button type="button" className="ms-auto text-sm font-semibold text-primary" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t.other}</button></div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{t.step}</p>
            <h1 className="text-2xl font-extrabold md:text-3xl">{t.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.sub}</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" htmlFor="school-code-input">{t.codeLabel}</label>
            <div dir="ltr" className="relative flex items-center gap-2">
              {/* One real input (paste, keyboard, screen readers) laid over the eight boxes. */}
              <input id="school-code-input" data-testid="parent-code-input" value={raw} onChange={(e) => onType(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={14}
                className="absolute inset-0 z-10 w-full cursor-text opacity-0" aria-describedby="school-code-help" onKeyDown={(e) => { if (e.key === 'Enter' && raw.length === 8) void check(); }} />
              <div className="flex flex-1 gap-1.5 md:gap-2">{CODE.slice(0, 4).map((c, i) => box(c, i))}</div>
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="flex flex-1 gap-1.5 md:gap-2">{CODE.slice(4).map((c, i) => box(c, i + 4))}</div>
            </div>
            <p id="school-code-help" className="text-xs text-muted-foreground">{t.help}</p>
          </div>

          {error && <Alert tone="danger" title={error} />}
          {found ? (
            <Card className="flex flex-col gap-3 border-primary p-5" data-testid="parent-code-found">
              <p className="text-sm font-bold">{t.confirmTitle}</p>
              <p className="text-lg font-extrabold">{t.confirmAt(found.learner, found.school ?? '')}</p>
              <Button size="lg" className="w-full" onPress={start} isDisabled={busy} data-testid="parent-code-yes">{busy ? t.opening : t.yes}</Button>
              <Button variant="ghost" onPress={() => { setFound(null); setRaw(''); }}>{t.no}</Button>
            </Card>
          ) : (
            <Button size="lg" className="w-full" isDisabled={raw.length !== 8 || busy} onPress={check} data-testid="parent-code-continue">{busy ? t.checking : t.cont}<Dir><ArrowRight /></Dir></Button>
          )}

          <details className="group rounded-xl bg-muted px-4 py-3 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Smartphone className="size-4 text-muted-foreground" />{t.where}</summary>
            <p className="mt-2 leading-relaxed text-muted-foreground">{t.whereText}</p>
          </details>

          <Card className="p-5">
            <p className="mb-3 text-sm font-bold">{t.seeTitle}</p>
            <ul className="grid gap-2.5">
              {t.see.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-4">{icons[i]}</span>{s}</li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col items-center gap-1.5 text-center text-sm">
            <a href="#/login" className="inline-flex min-h-tap items-center gap-2 font-semibold text-primary"><Mail className="size-4" />{t.back}</a>
            <p className="text-xs text-muted-foreground">{t.noCode}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
