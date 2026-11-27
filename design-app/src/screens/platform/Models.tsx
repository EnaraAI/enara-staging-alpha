import type { ReactNode } from 'react';
import { Bot, CircleCheck, CircleSlash, Clock, Database, HardDrive, KeyRound, Mail, Mic, RefreshCw, ShieldCheck, Siren, Sparkles, TriangleAlert, Video, XCircle } from 'lucide-react';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';
import { featureLabel, fetchAiUsage, fetchReady, ms, timeShort, useLoad } from './data';
import { get } from '@/lib/api';

/** GET /api/platform/status (enara-admin, switch LMS_DESIGN_PLATFORM_STATUS on lms-test). A part that failed is "unavailable". */
type Maybe<T> = T | 'unavailable';
interface PlatformStatus {
  mishkat: { ar: { configured: boolean; splitOn: boolean }; en: { configured: boolean; splitOn: boolean }; lastScoredAt: Maybe<string | null>; scoredLast24h: Maybe<number> };
  email: { configured: boolean; resendKeyPresent: boolean; emailsEnabled: boolean; lmsEmailsEnabled: boolean; dailyCeiling: number | null; cairoDay: string; today: Maybe<{ sent: number; held: number; failed: number }> };
  models: { tutorProvider: string; tutor?: string; anthropicTutor?: string; deepseekTutor?: string; fallback: string | null; fallbackOn: boolean };
  checkedAt: string;
}
import { ErrorBlock, LoadingBlock, NotAvailable } from './states';

type Tone = 'success' | 'info' | 'outline' | 'danger' | 'warning';
interface Svc { id: string; icon: ReactNode; check?: string; extra?: { label: string; value: string }[]; na?: boolean; note?: string }

const T = {
  en: {
    title: 'Models & Mishkat', sub: (time: string) => `Configuration and reachability from the public readiness check${time ? ` · checked at ${time}` : ''}`, refresh: 'Refresh',
    readyOk: 'All required services are ready', notReady: 'Not ready: a required service is down', notReadyD: (list: string) => `Failing: ${list}. Users may see errors until it is fixed.`,
    name: { mongo: 'Main database', postgres: 'Ingestion database', r2: 'File storage', anthropic: 'Tutor and grading model', fallback: 'Fallback model key', elevenlabs: 'Speech', anam: 'Avatar', spendCap: 'Test spend cap', mishkatAr: 'Mishkat Arabic', mishkatEn: 'Mishkat English', email: 'Email' } as Record<string, string>,
    provider: { mongo: 'MongoDB', postgres: 'Postgres', r2: 'Cloudflare R2', anthropic: 'Anthropic', fallback: 'Anthropic', elevenlabs: 'ElevenLabs', anam: 'Anam', spendCap: 'Staging AI spend limit', mishkatAr: 'ENARA GPU · scoring', mishkatEn: 'ENARA GPU · scoring', email: 'Resend' } as Record<string, string>,
    st: { ok: 'Reachable', accepted: 'Key accepted', configured: 'Configured', set: 'Set', not_configured: 'Not configured', not_set: 'Not set', unavailable: 'Unavailable', rejected: 'Key rejected', error: 'Check failed' } as Record<string, string>,
    required: 'Required', keyCheck: 'Key', fallbackModel: 'Fallback model',
    tutorModel: 'Tutor model', split: 'Split by language', on: 'On', off: 'Off', last: 'Last scored', none: 'None yet', day24: 'Scored, last 24 h', schoolOnly: 'School assessments only. One service serves both languages, so counts are not split by language.',
    sent: 'Sent today', held: 'Held today', failedE: 'Failed today', ceiling: 'Daily limit', lmsEmails: 'LMS emails', statusFailed: 'Platform status could not be loaded.',
    naNote: 'Latency, warm state and version need the planned platform status endpoint.',
    configNote: 'Configured means a key is set; it does not prove the provider answers.',
    activity: 'Model activity, last 24 hours', activityD: 'All schools · from recorded AI calls. Averages, not percentiles.',
    cFeature: 'Feature', cModel: 'Model', cCalls: 'Calls', cErr: 'Errors', cLat: 'Avg time', cFirst: 'First token',
    activityEmpty: 'No AI calls in the last 24 hours.', activityFailed: 'Model activity could not be loaded.',
    qwk: 'Mishkat agreement with teachers', qwkNa: 'Agreement (QWK) between Mishkat and teachers is not reported by the lms-test API yet.',
    incidents: 'Recent incidents', incidentsNa: 'There is no incident record on lms-test yet.',
    failed: 'The readiness check could not be loaded.',
  },
  ar: {
    title: 'النماذج ومشكاة', sub: (time: string) => `الإعداد وإمكانية الوصول من فحص الجاهزية العام${time ? ` · فُحص في ${time}` : ''}`, refresh: 'تحديث',
    readyOk: 'كل الخدمات المطلوبة جاهزة', notReady: 'غير جاهز: خدمة مطلوبة متوقفة', notReadyD: (list: string) => `المتعطّل: ${list}. قد يرى المستخدمون أخطاء حتى يُصلَح.`,
    name: { mongo: 'قاعدة البيانات الرئيسية', postgres: 'قاعدة بيانات الاستيعاب', r2: 'تخزين الملفات', anthropic: 'نموذج المعلّم والتصحيح', fallback: 'مفتاح النموذج الاحتياطي', elevenlabs: 'الكلام', anam: 'الصورة الرمزية', spendCap: 'حدّ إنفاق الاختبار', mishkatAr: 'مشكاة العربية', mishkatEn: 'مشكاة الإنجليزية', email: 'البريد الإلكتروني' } as Record<string, string>,
    provider: { mongo: 'MongoDB', postgres: 'Postgres', r2: 'Cloudflare R2', anthropic: 'Anthropic', fallback: 'Anthropic', elevenlabs: 'ElevenLabs', anam: 'Anam', spendCap: 'حدّ إنفاق الذكاء الاصطناعي في بيئة الاختبار', mishkatAr: 'وحدة GPU لإنارة · تقييم', mishkatEn: 'وحدة GPU لإنارة · تقييم', email: 'Resend' } as Record<string, string>,
    st: { ok: 'يمكن الوصول', accepted: 'المفتاح مقبول', configured: 'مُعَدّ', set: 'مضبوط', not_configured: 'غير مُعَدّ', not_set: 'غير مضبوط', unavailable: 'غير متاح', rejected: 'المفتاح مرفوض', error: 'تعذّر الفحص' } as Record<string, string>,
    required: 'مطلوب', keyCheck: 'المفتاح', fallbackModel: 'النموذج الاحتياطي',
    tutorModel: 'نموذج المعلّم', split: 'الفصل حسب اللغة', on: 'مُفعَّل', off: 'متوقف', last: 'آخر تقييم', none: 'لا يوجد بعد', day24: 'التقييمات، آخر 24 ساعة', schoolOnly: 'تقييمات المدارس فقط. خدمة واحدة تخدم اللغتين، لذا لا تُفصَل الأعداد حسب اللغة.',
    sent: 'المُرسَل اليوم', held: 'المحجوز اليوم', failedE: 'المتعثّر اليوم', ceiling: 'الحد اليومي', lmsEmails: 'رسائل نظام التعلّم', statusFailed: 'تعذّر تحميل حالة المنصة.',
    naNote: 'زمن الاستجابة وحالة الجاهزية والإصدار تحتاج إلى واجهة حالة المنصة المخطط لها.',
    configNote: '«مُعَدّ» يعني أن المفتاح موجود، ولا يثبت أن المزوّد يستجيب.',
    activity: 'نشاط النماذج، آخر 24 ساعة', activityD: 'جميع المدارس · من طلبات الذكاء الاصطناعي المسجّلة. متوسطات لا نِسَب مئوية.',
    cFeature: 'الميزة', cModel: 'النموذج', cCalls: 'الطلبات', cErr: 'الأخطاء', cLat: 'متوسط الزمن', cFirst: 'أول جزء من الرد',
    activityEmpty: 'لا طلبات ذكاء اصطناعي في آخر 24 ساعة.', activityFailed: 'تعذّر تحميل نشاط النماذج.',
    qwk: 'اتفاق مشكاة مع المعلمين', qwkNa: 'لا تعرض واجهة lms-test بعد معامل الاتفاق (QWK) بين مشكاة والمعلمين.',
    incidents: 'أحدث الأعطال', incidentsNa: 'لا يوجد سجل أعطال على lms-test بعد.',
    failed: 'تعذّر تحميل فحص الجاهزية.',
  },
};

function statusOf(v: string | undefined): { tone: Tone; icon: ReactNode } {
  switch (v) {
    case 'ok': case 'accepted': return { tone: 'success', icon: <CircleCheck /> };
    case 'configured': case 'set': return { tone: 'info', icon: <CircleCheck /> };
    case 'unavailable': case 'rejected': return { tone: 'danger', icon: <XCircle /> };
    case 'error': return { tone: 'warning', icon: <TriangleAlert /> };
    default: return { tone: 'outline', icon: <CircleSlash /> };
  }
}
// /ready names its required checks after the dependency (r2Configured, aiTestSpendCap).
const REQUIRED_KEY: Record<string, string> = { mongo: 'mongo', postgres: 'postgres', r2: 'r2Configured', spendCap: 'aiTestSpendCap' };

export default function PlatformModels() {
  const t = useT(T);
  const { lang } = usePreview();
  const ready = useLoad((signal) => fetchReady(signal));
  const activity = useLoad((signal) => fetchAiUsage(1, undefined, signal));
  const status = useLoad((signal) => get<PlatformStatus>('/api/platform/status', signal));
  const reload = () => { ready.reload(); activity.reload(); status.reload(); };
  const actions = <Button variant="outline" size="sm" aria-label={t.refresh} isDisabled={ready.loading} onPress={reload}><RefreshCw /><span className="hidden sm:inline">{t.refresh}</span></Button>;

  let top: ReactNode;
  if (ready.loading && !ready.data) top = <LoadingBlock rows={3} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" />;
  else if (ready.error && !ready.data) top = <ErrorBlock error={ready.error} onRetry={ready.reload} title={t.failed} />;
  else if (ready.data) {
    const c = ready.data.checks;
    const ps = status.data ?? null;
    const required = new Set(ready.data.required);
    const svcs: Svc[] = [
      // With the model fallback switch on, /ready also tests the key (accepted / rejected / error); otherwise only "configured".
      { id: 'anthropic', icon: <Bot />, check: c.anthropicKey ?? c.anthropic, extra: [
        ...(ps?.models.tutor ? [{ label: t.tutorModel, value: `${ps.models.tutor}${ps.models.tutorProvider !== 'anthropic' ? ` (${ps.models.tutorProvider})` : ''}` }] : []),
        ...(ps?.models.fallback ? [{ label: t.fallbackModel, value: `${ps.models.fallback} · ${ps.models.fallbackOn ? t.on : t.off}` }] : []),
        ...(c.anthropicKey && c.anthropic ? [{ label: t.keyCheck, value: t.st[c.anthropic] ?? c.anthropic }] : []),
      ] },
      ...(c.anthropicFallbackKey ? [{ id: 'fallback', icon: <KeyRound />, check: c.anthropicFallbackKey, extra: c.anthropicFallbackModel ? [{ label: t.fallbackModel, value: t.st[c.anthropicFallbackModel] ?? c.anthropicFallbackModel }] : undefined }] : []),
      ...(['ar', 'en'] as const).map((l): Svc => {
        if (!ps) return { id: l === 'ar' ? 'mishkatAr' : 'mishkatEn', icon: <Sparkles />, na: true };
        const m = ps.mishkat;
        const extra = [{ label: t.split, value: m[l].splitOn ? t.on : t.off }];
        if (l === 'ar') extra.push(
          { label: t.last, value: m.lastScoredAt === 'unavailable' ? t.st.unavailable : m.lastScoredAt ? `${new Date(m.lastScoredAt).toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' })} ${timeShort(new Date(m.lastScoredAt), lang)}` : t.none },
          { label: t.day24, value: m.scoredLast24h === 'unavailable' ? t.st.unavailable : num(m.scoredLast24h, lang) },
        );
        return { id: l === 'ar' ? 'mishkatAr' : 'mishkatEn', icon: <Sparkles />, check: m[l].configured ? 'configured' : 'not_configured', extra, note: l === 'ar' ? t.schoolOnly : undefined };
      }),
      { id: 'anam', icon: <Video />, check: c.anam },
      { id: 'elevenlabs', icon: <Mic />, check: c.elevenlabs },
      ps ? { id: 'email', icon: <Mail />, check: ps.email.configured ? 'configured' : 'not_configured', extra: [
        ...(ps.email.today === 'unavailable' ? [{ label: t.sent, value: t.st.unavailable }] : [
          { label: t.sent, value: num(ps.email.today.sent, lang) }, { label: t.held, value: num(ps.email.today.held, lang) }, { label: t.failedE, value: num(ps.email.today.failed, lang) }]),
        ...(ps.email.dailyCeiling != null ? [{ label: t.ceiling, value: num(ps.email.dailyCeiling, lang) }] : []),
        { label: t.lmsEmails, value: ps.email.lmsEmailsEnabled ? t.on : t.off },
      ] } : { id: 'email', icon: <Mail />, na: true },
      { id: 'mongo', icon: <Database />, check: c.mongo },
      { id: 'postgres', icon: <Database />, check: c.postgres },
      { id: 'r2', icon: <HardDrive />, check: c.r2 },
      { id: 'spendCap', icon: <ShieldCheck />, check: c.aiTestSpendCap },
    ].filter((s) => s.na || s.check !== undefined);
    const failing = ready.data.required.filter((k) => {
      const v = k === 'r2Configured' ? c.r2 : k === 'aiTestSpendCap' ? c.aiTestSpendCap : c[k];
      return !(v === 'ok' || v === 'configured' || v === 'set');
    });
    top = (
      <>
        {ready.data.status === 'ready'
          ? <Alert tone="success" icon={<CircleCheck />} title={t.readyOk} />
          : <Alert tone="danger" icon={<TriangleAlert />} title={t.notReady}>{t.notReadyD(failing.length ? failing.join(', ') : '—')}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {svcs.map((s) => {
            const st = statusOf(s.check);
            const isRequired = REQUIRED_KEY[s.id] && required.has(REQUIRED_KEY[s.id]);
            return (
              <Card key={s.id} className={cn('flex flex-col gap-3 p-4', st.tone === 'danger' && 'border-destructive/50', st.tone === 'warning' && 'border-warning/60')}>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary [&_svg]:size-[18px]">{s.icon}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold">{t.name[s.id]}</p><p className="truncate text-xs text-muted-foreground">{t.provider[s.id]}</p></div>
                  {s.na ? <Badge tone="outline"><Clock />{lang === 'ar' ? 'غير متاح بعد' : 'Not available yet'}</Badge>
                    : <Badge tone={st.tone}>{st.icon}{t.st[s.check ?? ''] ?? s.check}</Badge>}
                </div>
                {s.extra?.map((e) => (
                  <dl key={e.label} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs"><dt className="font-semibold text-muted-foreground">{e.label}</dt><dd className="font-semibold">{e.value}</dd></dl>
                ))}
                <div className="mt-auto flex flex-col gap-2">
                  {s.na ? <p className="text-[11px] text-muted-foreground">{status.error ? t.statusFailed : t.naNote}</p> : s.note ? <p className="text-[11px] text-muted-foreground">{s.note}</p> : (s.check === 'configured') ? <p className="text-[11px] text-muted-foreground">{t.configNote}</p> : null}
                  {isRequired && <span className="text-[11px] font-semibold text-muted-foreground">{t.required}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <PlatformShell active="models" title={t.title} subtitle={t.sub(timeShort(ready.at, lang))} actions={actions}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        {top}

        <Card>
          <CardHeader><CardTitle>{t.activity}</CardTitle><CardDescription>{t.activityD}</CardDescription></CardHeader>
          <CardContent>
            {activity.loading && !activity.data ? <LoadingBlock rows={2} />
              : activity.error && !activity.data ? <ErrorBlock error={activity.error} onRetry={activity.reload} title={t.activityFailed} />
              : !activity.data?.rows.length ? <p className="text-sm text-muted-foreground">{t.activityEmpty}</p>
              : <ActivityList rows={activity.data.rows} t={t} lang={lang} />}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{t.qwk}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">{t.qwkNa}</p><NotAvailable /></CardContent>
          </Card>
          <section>
            <SectionTitle>{t.incidents}</SectionTitle>
            <Card className="flex items-start gap-3 p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"><Siren /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-2"><p className="text-sm text-muted-foreground">{t.incidentsNa}</p><NotAvailable /></div>
            </Card>
          </section>
        </div>
      </div>
    </PlatformShell>
  );
}

function ActivityList({ rows, t, lang }: { rows: Awaited<ReturnType<typeof fetchAiUsage>>['rows']; t: (typeof T)['en']; lang: Lang }) {
  const sorted = [...rows].sort((a, b) => b.calls - a.calls).slice(0, 12);
  const errPct = (r: (typeof rows)[number]) => (r.calls ? (r.errors / r.calls) * 100 : 0);
  return (
    <>
      {/* Desktop: a table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="text-muted-foreground">
            <tr>
              {[t.cFeature, t.cModel, t.cCalls, t.cErr, t.cLat, t.cFirst].map((h, i) => (
                <th key={h} scope="col" className={cn('border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide', i >= 2 ? 'text-end' : 'text-start')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.feature}|${r.model}`}>
                <th scope="row" className="border-b px-3 py-2.5 text-start font-semibold">{featureLabel(r.feature, lang)}</th>
                <td className="border-b px-3 py-2.5 font-mono text-xs"><bdi>{r.model || '—'}</bdi></td>
                <td className="border-b px-3 py-2.5 text-end tabular-nums">{num(r.calls, lang)}</td>
                <td className={cn('border-b px-3 py-2.5 text-end tabular-nums', errPct(r) >= 1 && 'font-semibold text-destructive')}>{num(errPct(r), lang, { maximumFractionDigits: 1 })}%</td>
                <td className={cn('border-b px-3 py-2.5 text-end tabular-nums', r.avgLatencyMs > 5000 && 'font-semibold text-destructive')}>{r.avgLatencyMs ? ms(r.avgLatencyMs, lang) : '—'}</td>
                <td className="border-b px-3 py-2.5 text-end tabular-nums">{r.avgFirstTokenMs != null ? ms(r.avgFirstTokenMs, lang) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone: cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {sorted.map((r) => (
          <li key={`${r.feature}|${r.model}`} className="rounded-lg border p-3">
            <p className="text-sm font-semibold">{featureLabel(r.feature, lang)}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground"><bdi>{r.model || '—'}</bdi></p>
            <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2.5">
              <Metric label={t.cCalls} value={num(r.calls, lang)} />
              <Metric label={t.cErr} value={`${num(errPct(r), lang, { maximumFractionDigits: 1 })}%`} bad={errPct(r) >= 1} />
              <Metric label={t.cLat} value={r.avgLatencyMs ? ms(r.avgLatencyMs, lang) : '—'} bad={r.avgLatencyMs > 5000} />
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm font-bold tabular-nums', bad && 'text-destructive')}>{value}</dd>
    </div>
  );
}
