import type { ReactNode } from 'react';
import { Bell, Bot, Gauge, Mail, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';
import { featureLabel, fetchAiUsage, fetchBudget, fetchCredits, fetchSchools, pool, usd, useLoad, type AiUsage, type Budget, type School } from './data';
import { EmptyBlock, ErrorBlock, LoadingBlock, NotAvailable } from './states';

/** Schools read one by one for spend and budget (2 requests each; the API allows 300 a minute). */
const MAX_SCHOOLS = 30;

const T = {
  en: {
    title: 'Usage & budgets', sub: (m: string, d: string) => `${m} · month to date (last ${d} days) · estimated provider cost in USD`, refresh: 'Refresh',
    kSpend: 'AI spend this month', kOf: (b: string) => `of ${b} in monthly caps`, kNoCaps: 'No school has a monthly cap', kEstimate: (n: string) => `Estimate · ${n} calls without a price`,
    kForecast: 'Forecast for the month', kForecastHint: 'at the current daily rate', kOver: 'Schools over 80%', kOverHint: (n: string) => `${n} over budget`, kOverNone: 'None over budget', kEmail: 'Emails sent today',
    budgets: 'Spend vs budget by school', budgetsD: 'Estimated AI cost this month against ENARA’s internal monthly cap for each school.',
    over: 'Over budget', warn: 'Over 80%', ok: 'On track', noCap: 'No monthly cap', paused: 'AI paused', notEnforced: 'Cap not enforced', rowFailed: 'Could not be loaded',
    firstN: (n: string, of: string) => `Showing the first ${n} of ${of} schools.`, noSpend: 'No AI spend this month yet.',
    daily: 'Daily AI credits', dailyD: (d: string) => `All schools, last ${d} days · credits (not USD)`, chartLabel: 'Bar chart of AI credits used each day',
    dailyNa: 'Daily credits could not be loaded.', dailyEmpty: 'No AI credits used in this period.',
    drivers: 'Top cost drivers', driversD: 'Share of this month’s estimated AI cost', driversEmpty: 'No AI calls this month yet.', calls: (n: string) => `${n} calls`,
    alerts: 'Alert settings', alertsNa: 'Alerts at 50%, 80% and 100% are recorded by the server for schools with an enforced cap. Who is told and what happens at 100% cannot be read or changed here yet.',
    email: 'Email (Resend)', emailNa: 'Emails sent and the daily ceiling are not reported by the lms-test API yet.',
    failed: 'Usage could not be loaded.',
  },
  ar: {
    title: 'الاستخدام والميزانيات', sub: (m: string, d: string) => `${m} · منذ بداية الشهر (آخر ${d} يومًا) · تكلفة مقدّرة لدى المزوّدين بالدولار الأمريكي`, refresh: 'تحديث',
    kSpend: 'إنفاق الذكاء الاصطناعي هذا الشهر', kOf: (b: string) => `من ${b} حدودًا شهرية`, kNoCaps: 'لا توجد مدرسة بحدّ شهري', kEstimate: (n: string) => `تقدير · ${n} طلبات بلا سعر`,
    kForecast: 'المتوقع لهذا الشهر', kForecastHint: 'بحسب المعدل اليومي الحالي', kOver: 'مدارس تجاوزت 80%', kOverHint: (n: string) => `${n} تجاوزت الميزانية`, kOverNone: 'لا مدرسة تجاوزت الميزانية', kEmail: 'رسائل البريد المرسلة اليوم',
    budgets: 'الإنفاق مقارنة بالميزانية لكل مدرسة', budgetsD: 'التكلفة المقدّرة للذكاء الاصطناعي هذا الشهر مقارنة بالحد الشهري الداخلي لإنارة لكل مدرسة.',
    over: 'تجاوزت الميزانية', warn: 'تجاوزت 80%', ok: 'ضمن الحدود', noCap: 'بلا حد شهري', paused: 'الذكاء الاصطناعي موقوف', notEnforced: 'الحد غير مُطبَّق', rowFailed: 'تعذّر التحميل',
    firstN: (n: string, of: string) => `تُعرض أول ${n} مدرسة من ${of}.`, noSpend: 'لا يوجد إنفاق على الذكاء الاصطناعي هذا الشهر بعد.',
    daily: 'أرصدة الذكاء الاصطناعي اليومية', dailyD: (d: string) => `جميع المدارس، آخر ${d} يومًا · بالأرصدة (لا بالدولار)`, chartLabel: 'مخطط أعمدة لأرصدة الذكاء الاصطناعي المستخدمة كل يوم',
    dailyNa: 'تعذّر تحميل الأرصدة اليومية.', dailyEmpty: 'لم تُستخدم أرصدة في هذه الفترة.',
    drivers: 'أكبر بنود التكلفة', driversD: 'نسبة كل بند من التكلفة المقدّرة لهذا الشهر', driversEmpty: 'لا طلبات ذكاء اصطناعي هذا الشهر بعد.', calls: (n: string) => `${n} طلب`,
    alerts: 'إعدادات التنبيهات', alertsNa: 'يسجّل الخادم التنبيهات عند 50% و80% و100% للمدارس ذات الحد المُطبَّق. لا يمكن هنا بعد قراءة من يُبلَّغ أو ما يحدث عند 100% ولا تغييره.',
    email: 'البريد الإلكتروني (Resend)', emailNa: 'لا تعرض واجهة lms-test بعد عدد الرسائل المرسلة ولا الحد اليومي.',
    failed: 'تعذّر تحميل بيانات الاستخدام.',
  },
};

interface SchoolRow { school: School; usage: AiUsage | null; budget: Budget | null }

export default function PlatformUsage() {
  const t = useT(T);
  const { lang } = usePreview();
  const now = new Date();
  const days = now.getUTCDate(); // month to date, as whole days back from now
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const month = now.toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });

  const main = useLoad(async (signal) => {
    const [schools, total] = await Promise.all([fetchSchools(signal), fetchAiUsage(days, undefined, signal)]);
    const ordered = [...schools].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
    const picked = ordered.slice(0, MAX_SCHOOLS);
    const rows = await pool(picked, 4, async (school): Promise<SchoolRow> => {
      const [usage, budget] = await Promise.all([
        fetchAiUsage(days, school.id, signal).catch(() => null),
        fetchBudget(school.id, signal).catch(() => null),
      ]);
      return { school, usage, budget };
    });
    return { schoolsCount: schools.length, total, rows };
  }, [days]);
  const credits = useLoad((signal) => fetchCredits(signal));

  const reload = () => { main.reload(); credits.reload(); };
  const actions = <Button variant="outline" size="sm" aria-label={t.refresh} onPress={reload}><RefreshCw /><span className="hidden sm:inline">{t.refresh}</span></Button>;

  let body: ReactNode;
  if (main.loading && !main.data) body = <><LoadingBlock rows={1} className="grid grid-cols-2 gap-3 lg:grid-cols-4" /><LoadingBlock rows={4} /></>;
  else if (main.error && !main.data) body = <ErrorBlock error={main.error} onRetry={reload} title={t.failed} />;
  else if (main.data) {
    const { total, rows, schoolsCount } = main.data;
    const spent = total.costUsd ?? 0;
    const capped = rows.filter((r) => r.budget?.monthlyCapUsd != null && r.budget.monthlyCapUsd > 0);
    const capsTotal = capped.reduce((a, r) => a + (r.budget!.monthlyCapUsd ?? 0), 0);
    const pctOf = (r: SchoolRow) => (r.budget?.monthlyCapUsd ? ((r.usage?.costUsd ?? 0) / r.budget.monthlyCapUsd) * 100 : null);
    const over80 = capped.filter((r) => (pctOf(r) ?? 0) >= 80).length;
    const over100 = capped.filter((r) => (pctOf(r) ?? 0) >= 100).length;
    const forecast = days > 0 ? (spent / days) * daysInMonth : spent;
    const budgetRows = rows
      .filter((r) => r.usage == null || (r.usage.costUsd ?? 0) > 0 || r.budget?.monthlyCapUsd != null || r.budget?.paused)
      .sort((a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1) || (b.usage?.costUsd ?? 0) - (a.usage?.costUsd ?? 0));

    // Cost drivers: this month's estimated cost by feature (all models of a feature together).
    const byFeature = new Map<string, { cost: number; calls: number; models: Set<string> }>();
    for (const g of total.rows) {
      const f = byFeature.get(g.feature) ?? { cost: 0, calls: 0, models: new Set<string>() };
      f.cost += g.costUsd ?? 0; f.calls += g.calls; if (g.model) f.models.add(g.model);
      byFeature.set(g.feature, f);
    }
    const drivers = [...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls).slice(0, 5);
    const driversTotal = drivers.reduce((a, [, d]) => a + d.cost, 0);

    body = (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t.kSpend} value={usd(spent, lang)} icon={<Wallet />}
            hint={total.unpricedCalls > 0 ? t.kEstimate(num(total.unpricedCalls, lang)) : capsTotal > 0 ? t.kOf(usd(capsTotal, lang)) : t.kNoCaps}
            bar={capsTotal > 0 ? <Progress value={Math.min(100, (spent / capsTotal) * 100)} size="sm" ariaLabel={t.kSpend} /> : undefined} />
          <Kpi label={t.kForecast} value={usd(forecast, lang)} hint={t.kForecastHint} icon={<TrendingUp />} />
          <Kpi label={t.kOver} value={num(over80, lang)} icon={<Gauge />}
            hint={over100 > 0 ? <span className="font-semibold text-destructive">{t.kOverHint(num(over100, lang))}</span> : capped.length ? t.kOverNone : t.kNoCaps} />
          <Kpi label={t.kEmail} value="—" icon={<Mail />} hint={<NotAvailable />} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card>
            <CardHeader><CardTitle>{t.budgets}</CardTitle><CardDescription>{t.budgetsD}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {budgetRows.length ? budgetRows.map((r) => <BudgetRow key={r.school.id} row={r} pct={pctOf(r)} t={t} lang={lang} />) : <p className="text-sm text-muted-foreground">{t.noSpend}</p>}
              {schoolsCount > MAX_SCHOOLS && <p className="text-xs text-muted-foreground">{t.firstN(num(MAX_SCHOOLS, lang), num(schoolsCount, lang))}</p>}
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
              {!drivers.length && <p className="text-sm text-muted-foreground">{t.driversEmpty}</p>}
              {drivers.map(([feature, d]) => {
                const share = driversTotal > 0 ? (d.cost / driversTotal) * 100 : 0;
                return (
                  <div key={feature} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-primary [&_svg]:size-4"><Bot /></span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{featureLabel(feature, lang)}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{usd(d.cost, lang, d.cost < 10 ? 2 : 0)} <span className="text-xs font-normal text-muted-foreground">{num(share, lang, { maximumFractionDigits: 0 })}%</span></p>
                      </div>
                      <Progress value={share} size="sm" tone="info" ariaLabel={featureLabel(feature, lang)} />
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{t.calls(num(d.calls, lang))}{d.models.size ? <> · <bdi className="font-mono">{[...d.models].join(', ')}</bdi></> : null}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{t.daily}</CardTitle><CardDescription>{t.dailyD(num(credits.data?.periodDays ?? 30, lang))}</CardDescription></CardHeader>
          <CardContent>
            {credits.loading && !credits.data ? <LoadingBlock rows={1} />
              : credits.error && !credits.data ? <ErrorBlock error={credits.error} onRetry={credits.reload} title={t.dailyNa} />
              : !credits.data?.byDay.some((d) => d.credits > 0) ? <p className="text-sm text-muted-foreground">{t.dailyEmpty}</p>
              : (
                <>
                  <div className="md:hidden"><DailyChart lang={lang} label={t.chartLabel} days={credits.data.byDay} W={340} H={190} /></div>
                  <div className="hidden md:block"><DailyChart lang={lang} label={t.chartLabel} days={credits.data.byDay} W={720} H={200} /></div>
                </>
              )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section>
            <SectionTitle>{t.alerts}</SectionTitle>
            <Card className="flex flex-col gap-2 p-4">
              <p className="flex items-start gap-2 text-sm"><Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{t.alertsNa}</p>
              <NotAvailable />
            </Card>
          </section>
          <section>
            <SectionTitle>{t.email}</SectionTitle>
            <Card className="flex flex-col gap-2 p-4">
              <p className="flex items-start gap-2 text-sm"><Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{t.emailNa}</p>
              <NotAvailable />
            </Card>
          </section>
        </div>
      </>
    );
  } else body = <EmptyBlock title={t.noSpend} />;

  return (
    <PlatformShell active="usage" title={t.title} subtitle={t.sub(month, num(days, lang))} actions={actions}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">{body}</div>
    </PlatformShell>
  );
}

function Kpi({ label, value, hint, bar, icon }: { label: string; value: string; hint: ReactNode; bar?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}</div>
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      {bar}
      <div className="text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

/** Bar on a 0–120% scale with tick marks at 50, 80 and 100% so an overspend stays visible. */
function MarkerBar({ pct }: { pct: number }) {
  const scale = 120;
  const tone = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={scale}>
      <div className={cn('absolute inset-y-0 start-0 rounded-full', tone)} style={{ width: `${(Math.min(pct, scale) / scale) * 100}%` }} />
      {[50, 80, 100].map((m) => (
        <span key={m} className={cn('absolute -top-1 -bottom-1 w-0.5 rounded-full', m === 100 ? 'bg-foreground/70' : 'bg-foreground/35')} style={{ insetInlineStart: `calc(${(m / scale) * 100}% - 1px)` }} />
      ))}
    </div>
  );
}

function BudgetRow({ row, pct, t, lang }: { row: SchoolRow; pct: number | null; t: (typeof T)['en']; lang: Lang }) {
  const spent = row.usage?.costUsd ?? 0;
  const cap = row.budget?.monthlyCapUsd ?? null;
  const state = pct == null ? null : pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p dir="auto" className="min-w-0 truncate text-sm font-medium">{row.school.name}</p>
        {row.usage == null ? <span className="shrink-0 text-xs text-destructive">{t.rowFailed}</span> : (
          <p className="shrink-0 text-sm tabular-nums"><span className="font-semibold">{usd(spent, lang, spent < 10 ? 2 : 0)}</span>{cap != null && <span className="text-muted-foreground"> / {usd(cap, lang)}</span>}</p>
        )}
      </div>
      {pct != null && <MarkerBar pct={pct} />}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="flex flex-wrap items-center gap-1.5">
          {state ? <span className={cn('font-semibold', state === 'over' ? 'text-destructive' : state === 'warn' ? 'text-warning-foreground' : 'text-muted-foreground')}>{state === 'over' ? t.over : state === 'warn' ? t.warn : t.ok}</span>
            : <span className="text-muted-foreground">{row.budget == null && row.usage != null ? t.rowFailed : t.noCap}</span>}
          {row.budget?.paused && <Badge tone="danger">{t.paused}</Badge>}
          {cap != null && row.budget && !row.budget.enforced && <Badge tone="outline">{t.notEnforced}</Badge>}
        </span>
        {pct != null && <span className="tabular-nums text-muted-foreground">{num(pct, lang, { maximumFractionDigits: 0 })}%</span>}
      </div>
    </div>
  );
}

function DailyChart({ lang, label, days, W, H }: { lang: Lang; label: string; days: { date: string; credits: number }[]; W: number; H: number }) {
  const padL = 40, padB = 22, padT = 8;
  const peak = Math.max(1, ...days.map((d) => d.credits));
  const step = niceStep(peak / 4);
  const max = step * 4;
  const n = days.length || 1;
  const slot = (W - padL) / n;
  const bw = Math.max(3, slot - (slot > 16 ? 4 : 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const rtl = lang === 'ar';
  // In Arabic the time axis runs from right to left, like the text.
  const xAt = (i: number) => (rtl ? W - padL - (i + 1) * slot : padL + i * slot) + (slot - bw) / 2;
  const axisX = rtl ? W - padL + 6 : padL - 6;
  const dayOf = (iso: string) => Number(iso.slice(8, 10)) || 0;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full text-muted-foreground">
        {[0, 1, 2, 3, 4].map((k) => {
          const g = step * k;
          return (
            <g key={k}>
              <line x1={rtl ? 0 : padL} x2={rtl ? W - padL : W} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
              <text x={axisX} y={y(g) + 3.5} fontSize={10} textAnchor={rtl ? 'start' : 'end'} fill="currentColor">{num(g, lang, { notation: 'compact', maximumFractionDigits: 1 })}</text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const x = xAt(i), top = y(d.credits), h = y(0) - top, r = Math.min(3, bw / 2, Math.max(0, h));
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${num(d.credits, lang)}`}</title>
              <path d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`} fill="var(--chart-1)" opacity={h > 0 ? 1 : 0} />
              {(i === 0 || (i + 1) % 5 === 0 || i === n - 1) && <text x={x + bw / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor">{num(dayOf(d.date), lang)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
