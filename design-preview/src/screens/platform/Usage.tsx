import { Bell, Bot, ClipboardCheck, Gauge, Mail, Sparkles, TrendingUp, Video } from 'lucide-react';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Progress, Select, Switch, TextField } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';

/** US dollars with Latin digits; in Arabic the amount is isolated (LRI...PDI) so "$" stays in front of the number. */
const usd = (n: number, lang: Lang, digits = 0) => {
  const v = `$${num(n, lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return lang === 'ar' ? `\u2066${v}\u2069` : v;
};

const BUDGETS = [
  { en: 'Misr Future Academy', ar: 'أكاديمية مصر المستقبل', spent: 936, budget: 900 },
  { en: 'Nile Valley International School', ar: 'مدرسة وادي النيل الدولية', spent: 742, budget: 900 },
  { en: 'Heliopolis British School', ar: 'مدرسة مصر الجديدة البريطانية', spent: 655, budget: 1000 },
  { en: 'Alexandria Language School', ar: 'مدرسة الإسكندرية للغات', spent: 318, budget: 600 },
  { en: 'Red Sea STEM School', ar: 'مدرسة البحر الأحمر للعلوم والتكنولوجيا', spent: 104, budget: 250 },
  { en: 'Sunrise Montessori', ar: 'مدرسة شروق مونتيسوري', spent: 61, budget: 250 },
];
// Daily AI spend, 1–27 November (USD). Fridays and Saturdays are quiet.
const DAILY = [96, 128, 141, 136, 152, 61, 44, 139, 147, 158, 151, 166, 70, 49, 162, 171, 168, 175, 181, 76, 52, 172, 184, 190, 178, 196, 88];
const PACE = 5600 / 30;

const T = {
  en: {
    title: 'Usage & budgets', sub: 'November 2026 · month to date (1–27 Nov) · all amounts in USD',
    kSpend: 'AI spend this month', kOf: (b: string) => `of ${b} total budget`, kForecast: 'Forecast for November', kForecastHint: 'at the current daily rate', kOver: 'Schools over 80%', kOverHint: '1 over budget', kEmail: 'Emails sent today',
    budgets: 'Spend vs budget by school', budgetsD: 'Alerts go out at 50%, 80% and 100% of each school’s monthly AI budget.',
    over: 'Over budget', warn: 'Over 80%', ok: 'On track',
    daily: 'Daily AI spend', dailyD: 'All schools, 1–27 November', pace: 'Budget pace', paceV: (v: string) => `${v} per day`, day: 'Nov',
    drivers: 'Top cost drivers', driversD: 'Share of this month’s AI spend',
    d: [
      { name: 'Tutor chat (DeepSeek)', v: 1544, icon: 'bot' },
      { name: 'Grading model', v: 812, icon: 'grade' },
      { name: 'Avatar minutes (Anam)', v: 698, icon: 'video', note: '1,820 min' },
      { name: 'Mishkat scoring (GPU)', v: 358, icon: 'mishkat', note: 'own model' },
    ],
    alerts: 'Alert settings', alertsD: 'Who is told, and what happens at each level.',
    at: (p: number) => `At ${p}%`, a50: 'Email the school admin', a80: 'Email the school admin and ENARA support', a100: 'At 100%',
    a100Items: [{ id: 'notify', name: 'Notify only' }, { id: 'slow', name: 'Use the cheaper tutor model' }, { id: 'pause', name: 'Pause avatar minutes' }],
    recipients: 'ENARA recipients', recipientsV: 'support@enara.app, mariam.shawky@enara.app', daily2: 'Send me a daily summary at 08:00',
    email: 'Email (Resend)', emailD: 'Today, against the daily ceiling', sent: 'sent', ceiling: (c: string) => `Daily ceiling ${c}`, resets: 'Resets at 00:00 Cairo time',
    emailNote: 'Fee reminders from NVIS (418) and absence alerts (1,120) are today’s largest senders.',
    emailWarn: 'At this pace the ceiling is reached around 19:30. Non-urgent emails will wait until tomorrow.',
    chartLabel: 'Bar chart of daily AI spend in November',
  },
  ar: {
    title: 'الاستخدام والميزانيات', sub: 'نوفمبر 2026 · منذ بداية الشهر (1–27 نوفمبر) · جميع المبالغ بالدولار الأمريكي',
    kSpend: 'إنفاق الذكاء الاصطناعي هذا الشهر', kOf: (b: string) => `من ميزانية إجمالية قدرها ${b}`, kForecast: 'المتوقع لشهر نوفمبر', kForecastHint: 'بحسب المعدل اليومي الحالي', kOver: 'مدارس تجاوزت 80%', kOverHint: 'مدرسة واحدة تجاوزت الميزانية', kEmail: 'رسائل البريد المرسلة اليوم',
    budgets: 'الإنفاق مقارنة بالميزانية لكل مدرسة', budgetsD: 'تُرسَل التنبيهات عند بلوغ 50% و80% و100% من ميزانية الذكاء الاصطناعي الشهرية لكل مدرسة.',
    over: 'تجاوزت الميزانية', warn: 'تجاوزت 80%', ok: 'ضمن الحدود',
    daily: 'الإنفاق اليومي على الذكاء الاصطناعي', dailyD: 'جميع المدارس، 1–27 نوفمبر', pace: 'معدل الميزانية', paceV: (v: string) => `${v} يوميًا`, day: 'نوفمبر',
    drivers: 'أكبر بنود التكلفة', driversD: 'نسبة كل بند من إنفاق هذا الشهر',
    d: [
      { name: 'محادثة المعلّم الذكي (DeepSeek)', v: 1544, icon: 'bot' },
      { name: 'نموذج التصحيح', v: 812, icon: 'grade' },
      { name: 'دقائق الصورة الرمزية (Anam)', v: 698, icon: 'video', note: '1,820 دقيقة' },
      { name: 'تقييم مشكاة (GPU)', v: 358, icon: 'mishkat', note: 'نموذجنا الخاص' },
    ],
    alerts: 'إعدادات التنبيهات', alertsD: 'من يُبلَّغ، وماذا يحدث عند كل مستوى.',
    at: (p: number) => `عند ${p}%`, a50: 'إرسال بريد إلى مدير المدرسة', a80: 'إرسال بريد إلى مدير المدرسة ودعم إنارة', a100: 'عند 100%',
    a100Items: [{ id: 'notify', name: 'التنبيه فقط' }, { id: 'slow', name: 'استخدام نموذج معلّم أقل تكلفة' }, { id: 'pause', name: 'إيقاف دقائق الصورة الرمزية' }],
    recipients: 'المستلمون في إنارة', recipientsV: 'support@enara.app, mariam.shawky@enara.app', daily2: 'أرسل إليّ ملخصًا يوميًا في الساعة 08:00',
    email: 'البريد الإلكتروني (Resend)', emailD: 'اليوم، مقارنة بالحد اليومي', sent: 'رسالة مرسلة', ceiling: (c: string) => `الحد اليومي ${c}`, resets: 'يُعاد ضبطه في الساعة 00:00 بتوقيت القاهرة',
    emailNote: 'تذكيرات الرسوم من مدرسة وادي النيل (418) وتنبيهات الغياب (1,120) هي أكبر مصادر الإرسال اليوم.',
    emailWarn: 'بهذا المعدل يُبلغ الحد اليومي نحو الساعة 19:30، وستنتظر الرسائل غير العاجلة حتى الغد.',
    chartLabel: 'مخطط أعمدة للإنفاق اليومي على الذكاء الاصطناعي في نوفمبر',
  },
};

const ICONS: Record<string, React.ReactNode> = { bot: <Bot />, grade: <ClipboardCheck />, video: <Video />, mishkat: <Sparkles /> };

export default function PlatformUsage() {
  const t = useT(T);
  const { lang } = usePreview();
  const spent = DAILY.reduce((a, b) => a + b, 0);
  const totalBudget = 5600;
  const driversTotal = t.d.reduce((a, b) => a + b.v, 0);
  return (
    <PlatformShell active="usage" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t.kSpend} value={usd(spent, lang)} hint={t.kOf(usd(totalBudget, lang))} bar={<Progress value={(spent / totalBudget) * 100} size="sm" />} />
          <Kpi label={t.kForecast} value={usd(4590, lang)} hint={t.kForecastHint} icon={<TrendingUp />} />
          <Kpi label={t.kOver} value={num(2, lang)} hint={<span className="font-semibold text-destructive">{t.kOverHint}</span>} icon={<Gauge />} />
          <Kpi label={t.kEmail} value={num(2140, lang)} hint={t.ceiling(num(3000, lang))} bar={<Progress value={71} size="sm" tone="warning" />} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card>
            <CardHeader><CardTitle>{t.budgets}</CardTitle><CardDescription>{t.budgetsD}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {BUDGETS.map((b) => <BudgetRow key={b.en} name={b[lang]} spent={b.spent} budget={b.budget} t={t} lang={lang} />)}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-foreground/40" />50% · 80% · 100%</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />{t.ok}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />{t.warn}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />{t.over}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.drivers}</CardTitle><CardDescription>{t.driversD}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {t.d.map((d) => {
                const share = (d.v / driversTotal) * 100;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-primary [&_svg]:size-4">{ICONS[d.icon]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{d.name}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{usd(d.v, lang)} <span className="text-xs font-normal text-muted-foreground">{num(share, lang, { maximumFractionDigits: 0 })}%</span></p>
                      </div>
                      <Progress value={share} size="sm" tone="info" />
                      {d.note && <p className="mt-1 text-[11px] text-muted-foreground">{d.note}</p>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1"><CardTitle>{t.daily}</CardTitle><CardDescription>{t.dailyD}</CardDescription></div>
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><span className="w-5 border-t-2 border-dashed border-warning" />{t.pace} · {t.paceV(usd(PACE, lang))}</span>
          </CardHeader>
          <CardContent>
            <div className="md:hidden"><DailyChart lang={lang} label={t.chartLabel} day={t.day} W={340} H={190} /></div>
            <div className="hidden md:block"><DailyChart lang={lang} label={t.chartLabel} day={t.day} W={720} H={200} /></div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section>
            <SectionTitle>{t.alerts}</SectionTitle>
            <Card className="flex flex-col gap-1 p-4">
              <p className="mb-1 text-xs text-muted-foreground">{t.alertsD}</p>
              <Switch defaultSelected><span className="flex flex-col"><span className="font-semibold">{t.at(50)}</span><span className="text-xs text-muted-foreground">{t.a50}</span></span></Switch>
              <Switch defaultSelected><span className="flex flex-col"><span className="font-semibold">{t.at(80)}</span><span className="text-xs text-muted-foreground">{t.a80}</span></span></Switch>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Switch defaultSelected className="sm:flex-1"><span className="font-semibold">{t.a100}</span></Switch>
                <Select aria-label={t.a100} items={t.a100Items} defaultSelectedKey="slow" className="sm:w-64" />
              </div>
              <div className="mt-2 flex flex-col gap-2 border-t pt-3">
                <TextField label={t.recipients} defaultValue={t.recipientsV} />
                <Checkbox defaultSelected><Bell className="size-3.5 text-muted-foreground" />{t.daily2}</Checkbox>
              </div>
            </Card>
          </section>
          <section>
            <SectionTitle>{t.email}</SectionTitle>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-xs text-muted-foreground">{t.emailD}</p>
              <div className="flex items-end gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><Mail className="size-5" /></span>
                <p className="text-3xl font-bold tabular-nums leading-none">{num(2140, lang)}<span className="ms-1.5 text-sm font-normal text-muted-foreground">/ {num(3000, lang)} {t.sent}</span></p>
                <Badge tone="warning" className="ms-auto">71%</Badge>
              </div>
              <MarkerBar pct={71} />
              <p className="text-xs text-muted-foreground">{t.resets}</p>
              <p className="text-sm">{t.emailNote}</p>
              <Alert tone="warning" icon={<Mail />}>{t.emailWarn}</Alert>
            </Card>
          </section>
        </div>
      </div>
    </PlatformShell>
  );
}

function Kpi({ label, value, hint, bar, icon }: { label: string; value: string; hint: React.ReactNode; bar?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}</div>
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      {bar}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Card>
  );
}

/** Bar on a 0–120% scale with tick marks at 50, 80 and 100% so an overspend stays visible. */
function MarkerBar({ pct }: { pct: number }) {
  const scale = 120;
  const tone = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={scale}>
      <div className={cn('absolute inset-y-0 start-0 rounded-full', tone)} style={{ width: `${(Math.min(pct, scale) / scale) * 100}%` }} />
      {[50, 80, 100].map((m) => (
        <span key={m} className={cn('absolute -top-1 -bottom-1 w-0.5 rounded-full', m === 100 ? 'bg-foreground/70' : 'bg-foreground/35')} style={{ insetInlineStart: `calc(${(m / scale) * 100}% - 1px)` }} />
      ))}
    </div>
  );
}

function BudgetRow({ name, spent, budget, t, lang }: { name: string; spent: number; budget: number; t: (typeof T)['en']; lang: Lang }) {
  const pct = (spent / budget) * 100;
  const state = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{name}</p>
        <p className="shrink-0 text-sm tabular-nums"><span className="font-semibold">{usd(spent, lang)}</span><span className="text-muted-foreground"> / {usd(budget, lang)}</span></p>
      </div>
      <MarkerBar pct={pct} />
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn('font-semibold', state === 'over' ? 'text-destructive' : state === 'warn' ? 'text-warning-foreground' : 'text-muted-foreground')}>{state === 'over' ? t.over : state === 'warn' ? t.warn : t.ok}</span>
        <span className="tabular-nums text-muted-foreground">{num(pct, lang, { maximumFractionDigits: 0 })}%</span>
      </div>
    </div>
  );
}

function DailyChart({ lang, label, day, W, H }: { lang: Lang; label: string; day: string; W: number; H: number }) {
  const padL = 36, padB = 22, padT = 8;
  const max = 225;
  const n = DAILY.length;
  const slot = (W - padL) / n;
  const bw = Math.max(4, slot - (slot > 16 ? 4 : 3));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const rtl = lang === 'ar';
  // In Arabic the time axis runs from right to left, like the text.
  const xAt = (i: number) => (rtl ? W - padL - (i + 1) * slot : padL + i * slot) + (slot - bw) / 2;
  const axisX = rtl ? W - padL + 6 : padL - 6;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full text-muted-foreground">
        {[0, 50, 100, 150, 200].map((g) => (
          <g key={g}>
            <line x1={rtl ? 0 : padL} x2={rtl ? W - padL : W} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={axisX} y={y(g) + 3.5} fontSize={10} textAnchor={rtl ? 'start' : 'end'} fill="currentColor">{`$${num(g, lang)}`}</text>
          </g>
        ))}
        {DAILY.map((v, i) => {
          const x = xAt(i), top = y(v), h = y(0) - top, r = Math.min(3, bw / 2);
          return (
            <g key={i}>
              <title>{`${num(i + 1, lang)} ${day}: ${usd(v, lang)}`}</title>
              <path d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`} fill="var(--chart-1)" opacity={h > 0 ? 1 : 0} />
              {(i === 0 || (i + 1) % 5 === 0 || i === n - 1) && <text x={x + bw / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor">{num(i + 1, lang)}</text>}
            </g>
          );
        })}
        <line x1={rtl ? 0 : padL} x2={rtl ? W - padL : W} y1={y(PACE)} y2={y(PACE)} stroke="var(--warning)" strokeWidth={2} strokeDasharray="5 4" />
      </svg>
    </div>
  );
}
