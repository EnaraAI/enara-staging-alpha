import { Bot, CircleCheck, ClipboardCheck, Flame, Mail, RefreshCw, Siren, Snowflake, Sparkles, TriangleAlert, Video, Clock } from 'lucide-react';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';

type St = 'ok' | 'degraded' | 'cold';
interface Svc { id: string; icon: React.ReactNode; status: St; p50: number; p95: number; err: number; version: string; check: number; warm?: boolean; unit?: 'ms' | 's' }

const SVCS: Svc[] = [
  { id: 'tutor', icon: <Bot />, status: 'ok', p50: 820, p95: 2100, err: 0.2, version: 'deepseek-chat · prompt v14', check: 1 },
  { id: 'grading', icon: <ClipboardCheck />, status: 'degraded', p50: 2900, p95: 11400, err: 2.8, version: 'grader-2026.11 · rubric v6', check: 1 },
  { id: 'mishkatAr', icon: <Sparkles />, status: 'ok', p50: 140, p95: 310, err: 0.0, version: 'mishkat-ar 1.4.2', check: 2, warm: true },
  { id: 'mishkatEn', icon: <Sparkles />, status: 'cold', p50: 160, p95: 38200, err: 0.1, version: 'mishkat-en 1.3.0', check: 2, warm: false },
  { id: 'avatar', icon: <Video />, status: 'ok', p50: 640, p95: 1250, err: 0.4, version: 'Anam · persona v3', check: 1 },
  { id: 'email', icon: <Mail />, status: 'ok', p50: 310, p95: 720, err: 0.3, version: 'Resend API · 2 domains', check: 5 },
];

const T = {
  en: {
    title: 'Models & Mishkat', sub: 'Live status of every AI and messaging service · checked every minute', refresh: 'Refresh',
    banner: 'The grading model is slow', bannerD: 'Teachers see marks 10–15 s later than usual. Answers are queued, none are lost. Incident INC-214 is open.',
    name: { tutor: 'Tutor model', grading: 'Grading model', mishkatAr: 'Mishkat Arabic', mishkatEn: 'Mishkat English', avatar: 'Avatar', email: 'Email' } as Record<string, string>,
    provider: { tutor: 'DeepSeek', grading: 'Hosted LLM', mishkatAr: 'ENARA GPU · scoring', mishkatEn: 'ENARA GPU · scoring', avatar: 'Anam', email: 'Resend' } as Record<string, string>,
    st: { ok: 'Operational', degraded: 'Degraded', cold: 'Cold start' } as Record<St, string>,
    warm: 'Warm', coldL: 'Cold', warmUp: 'Warm up now', coldNote: 'GPU scaled down at 02:00. First request takes about 38 s.',
    p50: 'p50', p95: 'p95', err: 'Errors', check: (m: number) => `Checked ${m} min ago`, version: 'Version',
    qwk: 'Mishkat agreement with teachers', qwkD: 'Quadratic weighted kappa (QWK) on answers marked by both Mishkat and a teacher, last 30 days. Target 0.80.',
    target: 'Target', samples: (n: string) => `${n} double-marked answers`,
    q: [
      { name: 'Arabic · writing', v: 0.86, n: 1240 },
      { name: 'Arabic · short answers', v: 0.89, n: 2015 },
      { name: 'English · writing', v: 0.82, n: 980 },
      { name: 'English · short answers', v: 0.84, n: 1530 },
      { name: 'Science · explanations (Arabic)', v: 0.77, n: 412 },
    ],
    below: 'Below target: teachers review every mark in this area',
    incidents: 'Recent incidents',
    inc: [
      { id: 'INC-214', title: 'Grading model responding slowly', svc: 'Grading model', when: 'Today, 10:20 · ongoing', sev: 'degraded', open: true },
      { id: 'INC-213', title: 'Mishkat English cold start after GPU scale-down', svc: 'Mishkat English', when: 'Today, 07:05 · 6 min', sev: 'minor', open: false },
      { id: 'INC-211', title: 'Bounce spike from one school email domain', svc: 'Email (Resend)', when: '22 Nov · 2 h 10 min', sev: 'minor', open: false },
      { id: 'INC-209', title: 'Tutor API timeouts from DeepSeek', svc: 'Tutor model', when: '18 Nov · 34 min', sev: 'major', open: false },
    ],
    open: 'Open', resolved: 'Resolved', sev: { degraded: 'Degraded', minor: 'Minor', major: 'Major' } as Record<string, string>,
  },
  ar: {
    title: 'النماذج ومشكاة', sub: 'الحالة المباشرة لكل خدمات الذكاء الاصطناعي والمراسلة · يُفحص كل دقيقة', refresh: 'تحديث',
    banner: 'نموذج التصحيح بطيء', bannerD: 'تظهر الدرجات للمعلمين متأخرة 10 إلى 15 ثانية عن المعتاد. الإجابات في قائمة الانتظار ولم يُفقد منها شيء. البلاغ INC-214 مفتوح.',
    name: { tutor: 'نموذج المعلّم', grading: 'نموذج التصحيح', mishkatAr: 'مشكاة العربية', mishkatEn: 'مشكاة الإنجليزية', avatar: 'الصورة الرمزية', email: 'البريد الإلكتروني' } as Record<string, string>,
    provider: { tutor: 'DeepSeek', grading: 'نموذج لغوي مستضاف', mishkatAr: 'وحدة GPU لإنارة · تقييم', mishkatEn: 'وحدة GPU لإنارة · تقييم', avatar: 'Anam', email: 'Resend' } as Record<string, string>,
    st: { ok: 'يعمل', degraded: 'أداء منخفض', cold: 'بدء بارد' } as Record<St, string>,
    warm: 'جاهز', coldL: 'بارد', warmUp: 'تسخين الآن', coldNote: 'أُوقفت وحدة GPU في الساعة 02:00. يستغرق أول طلب نحو 38 ثانية.',
    p50: 'p50', p95: 'p95', err: 'الأخطاء', check: (m: number) => (m === 1 ? 'فُحص منذ دقيقة' : m === 2 ? 'فُحص منذ دقيقتين' : `فُحص منذ ${m} دقائق`), version: 'الإصدار',
    qwk: 'اتفاق مشكاة مع المعلمين', qwkD: 'معامل كابا الموزون تربيعيًا (QWK) على الإجابات التي صحّحها كلٌّ من مشكاة والمعلم، آخر 30 يومًا. الهدف 0.80.',
    target: 'الهدف', samples: (n: string) => `${n} إجابة مصحّحة مرتين`,
    q: [
      { name: 'العربية · الكتابة', v: 0.86, n: 1240 },
      { name: 'العربية · الإجابات القصيرة', v: 0.89, n: 2015 },
      { name: 'الإنجليزية · الكتابة', v: 0.82, n: 980 },
      { name: 'الإنجليزية · الإجابات القصيرة', v: 0.84, n: 1530 },
      { name: 'العلوم · التفسير (بالعربية)', v: 0.77, n: 412 },
    ],
    below: 'دون الهدف: يراجع المعلمون كل درجة في هذا المجال',
    incidents: 'أحدث الأعطال',
    inc: [
      { id: 'INC-214', title: 'بطء استجابة نموذج التصحيح', svc: 'نموذج التصحيح', when: 'اليوم، 10:20 · مستمر', sev: 'degraded', open: true },
      { id: 'INC-213', title: 'بدء بارد لمشكاة الإنجليزية بعد إيقاف وحدة GPU', svc: 'مشكاة الإنجليزية', when: 'اليوم، 07:05 · 6 دقائق', sev: 'minor', open: false },
      { id: 'INC-211', title: 'ارتفاع الرسائل المرتدة من نطاق بريد إحدى المدارس', svc: 'البريد الإلكتروني (Resend)', when: '22 نوفمبر · ساعتان و10 دقائق', sev: 'minor', open: false },
      { id: 'INC-209', title: 'انتهاء مهلة طلبات نموذج المعلّم لدى DeepSeek', svc: 'نموذج المعلّم', when: '18 نوفمبر · 34 دقيقة', sev: 'major', open: false },
    ],
    open: 'مفتوح', resolved: 'تم الحل', sev: { degraded: 'أداء منخفض', minor: 'بسيط', major: 'كبير' } as Record<string, string>,
  },
};

const ms = (v: number, lang: Lang) =>
  lang === 'ar'
    ? `${num(v / 1000, lang, { maximumFractionDigits: v >= 1000 ? 1 : 2 })} ث`
    : v >= 1000 ? `${num(v / 1000, lang, { maximumFractionDigits: 1 })} s` : `${num(v, lang)} ms`;
const ST_TONE: Record<St, 'success' | 'warning' | 'info'> = { ok: 'success', degraded: 'warning', cold: 'info' };
const ST_ICON: Record<St, React.ReactNode> = { ok: <CircleCheck />, degraded: <TriangleAlert />, cold: <Snowflake /> };

export default function PlatformModels() {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <PlatformShell active="models" title={t.title} subtitle={t.sub} actions={<Button variant="outline" size="sm" aria-label={t.refresh}><RefreshCw /><span className="hidden sm:inline">{t.refresh}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Alert tone="warning" icon={<TriangleAlert />} title={t.banner}>{t.bannerD}</Alert>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SVCS.map((s) => (
            <Card key={s.id} className={cn('flex flex-col gap-3 p-4', s.status === 'degraded' && 'border-warning/60')}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary [&_svg]:size-[18px]">{s.icon}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">{t.name[s.id]}</p><p className="truncate text-xs text-muted-foreground">{t.provider[s.id]}</p></div>
                <Badge tone={ST_TONE[s.status]}>{ST_ICON[s.status]}{t.st[s.status]}</Badge>
              </div>
              {s.warm !== undefined && (
                <div className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs', s.warm ? 'bg-success-soft' : 'bg-info-soft')}>
                  {s.warm ? <Flame className="size-3.5 text-success" /> : <Snowflake className="size-3.5 text-info" />}
                  <span className="font-semibold">{s.warm ? t.warm : t.coldL}</span>
                  {!s.warm && <span className="min-w-0 flex-1 text-muted-foreground">{t.coldNote}</span>}
                </div>
              )}
              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2.5">
                <Metric label={t.p50} value={ms(s.p50, lang)} />
                <Metric label={t.p95} value={ms(s.p95, lang)} bad={s.p95 > 5000} />
                <Metric label={t.err} value={`${num(s.err, lang, { minimumFractionDigits: 1 })}%`} bad={s.err >= 1} />
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="size-3" />{t.check(s.check)}</span>
                <span className="min-w-0 truncate font-mono"><bdi>{s.version}</bdi></span>
              </div>
              {s.warm === false && <Button variant="outline" size="sm"><Flame />{t.warmUp}</Button>}
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{t.qwk}</CardTitle><CardDescription>{t.qwkD}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {t.q.map((q) => {
                const below = q.v < 0.8;
                return (
                  <div key={q.name} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{q.name}</p>
                      <p className={cn('shrink-0 text-sm font-bold tabular-nums', below && 'text-destructive')}>{num(q.v, lang, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted">
                      <div className={cn('absolute inset-y-0 start-0 rounded-full', below ? 'bg-warning' : 'bg-success')} style={{ width: `${q.v * 100}%` }} />
                      <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/70" style={{ insetInlineStart: 'calc(80% - 1px)' }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t.samples(num(q.n, lang))}{below && <span className="font-semibold text-warning-foreground"> · {t.below}</span>}</p>
                  </div>
                );
              })}
              <p className="flex items-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground"><span className="h-3 w-0.5 rounded-full bg-foreground/70" />{t.target} {num(0.8, lang, { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>

          <section>
            <SectionTitle>{t.incidents}</SectionTitle>
            <Card className="divide-y">
              {t.inc.map((i) => (
                <div key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', i.open ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground')}>{i.open ? <Siren /> : <CircleCheck />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.title}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-mono">{i.id}</span> · {i.svc} · {i.when}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={i.open ? 'warning' : 'success'}>{i.open ? t.open : t.resolved}</Badge>
                    <span className={cn('text-[11px] font-semibold', i.sev === 'major' ? 'text-destructive' : 'text-muted-foreground')}>{t.sev[i.sev]}</span>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </div>
      </div>
    </PlatformShell>
  );
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm font-bold tabular-nums', bad && 'text-destructive')}>{value}</dd>
    </div>
  );
}
