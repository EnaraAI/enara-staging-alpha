import { Activity, ChevronDown, ChevronRight, ClipboardCheck, Download, Flag as FlagIcon, Gauge, MessageCircle, Sparkles, TrendingDown, TrendingUp, TriangleAlert, UserX } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Cell, Column, Dir, Progress, Row, SearchField, Table, TableBody, TableHeader, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CLASS_NAME, LEARNERS, TeacherShell, learner, type Flag, type Learner } from './common';

const T = {
  en: {
    title: 'Grade 9 – B', sub: 'English · 28 learners · Ms Dina Ezzat', switchClass: 'Switch class', export: 'Export',
    kActive: 'Active this week', kActiveHint: '+3 on last week', kMastery: 'Average mastery', kMasteryHint: '+2 points on last week', kGrade: 'Assignments to grade', kGradeHint: '5 need your review', kRisk: 'At-risk learners', kRiskHint: 'Low mastery or inactive',
    learners: 'Learners', search: 'Search learners', all: 'All', flagged: 'Flagged',
    cName: 'Learner', cLevel: 'Level', cActive: 'Last active', cMastery: 'Mastery', cFlag: 'Flag',
    flag: { none: '', risk: 'At risk', inactive: 'Inactive', improving: 'Improving', late: 'Late work' } as Record<Flag, string>,
    showing: (a: number, b: number) => `Showing ${a} of ${b} learners`, viewAll: 'View all',
    attention: 'Needs attention', attentionSub: 'From this week’s activity and results',
    n1: 'Not active for 9 days', n1d: 'Last activity: Unit 4, Lesson 2. Missed 2 assignments.',
    n2: 'Mastery down 8 points', n2d: 'Struggling with past simple of irregular verbs.',
    n3: 'Failed 2 of the last 3 checks', n3d: 'Lowest trait: grammar (2 of 5).',
    n4: '3 assignments handed in late', n4d: 'All three were essays.',
    n5: 'Up 15 points in 2 weeks', n5d: 'Finished every practice set this week.',
    message: 'Message parent', assign: 'Assign practice', view: 'View', praise: 'Send praise',
    skills: 'Class mastery by skill', reading: 'Reading', listening: 'Listening', writing: 'Writing', grammar: 'Grammar', vocab: 'Vocabulary',
  },
  ar: {
    title: 'الصف التاسع – ب', sub: 'اللغة الإنجليزية · 28 طالبًا · أ. دينا عزت', switchClass: 'تبديل الفصل', export: 'تصدير',
    kActive: 'النشطون هذا الأسبوع', kActiveHint: '+3 مقارنة بالأسبوع الماضي', kMastery: 'متوسط الإتقان', kMasteryHint: '+2 نقطة مقارنة بالأسبوع الماضي', kGrade: 'واجبات بانتظار التصحيح', kGradeHint: '5 تحتاج إلى مراجعتك', kRisk: 'طلاب معرّضون للتعثّر', kRiskHint: 'إتقان منخفض أو عدم نشاط',
    learners: 'الطلاب', search: 'ابحث عن طالب', all: 'الكل', flagged: 'عليهم علامة',
    cName: 'الطالب', cLevel: 'المستوى', cActive: 'آخر نشاط', cMastery: 'الإتقان', cFlag: 'العلامة',
    flag: { none: '', risk: 'معرّض للتعثّر', inactive: 'غير نشط', improving: 'يتحسّن', late: 'تأخّر في التسليم' } as Record<Flag, string>,
    showing: (a: number, b: number) => `يُعرض ${a} من ${b} طالبًا`, viewAll: 'عرض الكل',
    attention: 'يحتاج إلى متابعة', attentionSub: 'بناءً على نشاط هذا الأسبوع ونتائجه',
    n1: 'غير نشط منذ 9 أيام', n1d: 'آخر نشاط: الوحدة 4، الدرس 2. فاته واجبان.',
    n2: 'انخفض الإتقان 8 نقاط', n2d: 'يواجه صعوبة في الماضي البسيط للأفعال الشاذة.',
    n3: 'لم ينجح في 2 من آخر 3 اختبارات', n3d: 'أضعف معيار: القواعد (2 من 5).',
    n4: 'سلّمت 3 واجبات متأخرة', n4d: 'جميعها مقالات.',
    n5: 'تحسّنت 15 نقطة في أسبوعين', n5d: 'أنهت جميع مجموعات التدريب هذا الأسبوع.',
    message: 'مراسلة ولي الأمر', assign: 'تعيين تدريب', view: 'عرض', praise: 'إرسال إشادة',
    skills: 'إتقان الفصل حسب المهارة', reading: 'القراءة', listening: 'الاستماع', writing: 'الكتابة', grammar: 'القواعد', vocab: 'المفردات',
  },
};

const FLAG_TONE: Record<Flag, 'danger' | 'warning' | 'success' | 'neutral'> = { none: 'neutral', risk: 'danger', inactive: 'warning', late: 'warning', improving: 'success' };
const FLAG_ICON: Record<Flag, typeof FlagIcon> = { none: FlagIcon, risk: TriangleAlert, inactive: UserX, late: ClipboardCheck, improving: TrendingUp };
const barTone = (m: number) => (m < 55 ? 'danger' : m < 65 ? 'warning' : 'success') as 'danger' | 'warning' | 'success';

function FlagBadge({ f }: { f: Flag }) {
  const t = useT(T);
  if (f === 'none') return <span className="text-muted-foreground" aria-hidden>—</span>;
  const I = FLAG_ICON[f];
  return <Badge tone={FLAG_TONE[f]}><I />{t.flag[f]}</Badge>;
}

export default function ClassOverview() {
  const t = useT(T);
  const { lang } = usePreview();
  const rows = LEARNERS.slice(0, 14);
  const avg = Math.round(LEARNERS.reduce((s, l) => s + l.mastery, 0) / LEARNERS.length);
  const kpis = [
    { label: t.kActive, value: <>{num(24, lang)}<span className="text-base font-semibold text-muted-foreground"> / {num(28, lang)}</span></>, hint: t.kActiveHint, Icon: Activity, tone: 'text-info bg-info-soft', up: true },
    { label: t.kMastery, value: `${num(avg, lang)}%`, hint: t.kMasteryHint, Icon: Gauge, tone: 'text-success bg-success-soft', up: true },
    { label: t.kGrade, value: num(14, lang), hint: t.kGradeHint, Icon: ClipboardCheck, tone: 'text-warning-foreground bg-warning-soft' },
    { label: t.kRisk, value: num(3, lang), hint: t.kRiskHint, Icon: TriangleAlert, tone: 'text-destructive bg-destructive-soft' },
  ];
  const attention: { l: Learner; title: string; detail: string; tone: 'danger' | 'warning' | 'success'; Icon: typeof UserX; action: string }[] = [
    { l: learner('l20'), title: t.n1, detail: t.n1d, tone: 'warning', Icon: UserX, action: t.message },
    { l: learner('l09'), title: t.n2, detail: t.n2d, tone: 'danger', Icon: TrendingDown, action: t.assign },
    { l: learner('l22'), title: t.n3, detail: t.n3d, tone: 'danger', Icon: TriangleAlert, action: t.assign },
    { l: learner('l18'), title: t.n4, detail: t.n4d, tone: 'warning', Icon: ClipboardCheck, action: t.message },
    { l: learner('l13'), title: t.n5, detail: t.n5d, tone: 'success', Icon: Sparkles, action: t.praise },
  ];
  const skills = [[t.reading, 74], [t.listening, 70], [t.writing, 61], [t.grammar, 64], [t.vocab, 72]] as const;

  return (
    <TeacherShell active="classes" title={t.title} subtitle={t.sub}
      actions={<div className="hidden items-center gap-2 md:flex"><Button variant="outline" size="sm"><Download />{t.export}</Button></div>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" aria-label={t.switchClass}>{CLASS_NAME[lang]}<ChevronDown /></Button>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="flex items-start gap-3 p-4">
              <span className={cn('hidden size-9 shrink-0 place-items-center rounded-md sm:grid', k.tone)}><k.Icon className="size-4.5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums leading-none">{k.value}</p>
                <p className={cn('mt-1.5 text-xs', k.up ? 'text-success' : 'text-muted-foreground')}>{k.hint}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <Card className="min-w-0">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <CardTitle>{t.learners} <span className="font-normal text-muted-foreground">({num(28, lang)})</span></CardTitle>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="flex gap-1"><Toggle defaultSelected>{t.all}</Toggle><Toggle>{t.flagged} · {num(5, lang)}</Toggle></div>
                <SearchField aria-label={t.search} placeholder={t.search} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
              </div>
            </CardHeader>

            {/* Phone: stacked cards */}
            <ul className="divide-y border-t md:hidden">
              {rows.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={l[lang]} className="size-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{l[lang]}</p><Badge tone="outline" className="px-1.5">{l.level}</Badge></div>
                    <div className="mt-1.5 flex items-center gap-2"><Progress value={l.mastery} size="sm" tone={barTone(l.mastery)} className="w-24" /><span className="text-xs font-semibold tabular-nums">{num(l.mastery, lang)}%</span><span className="truncate text-xs text-muted-foreground">· {l.active[lang]}</span></div>
                  </div>
                  <FlagBadge f={l.flag} />
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <Table aria-label={t.learners}>
                <TableHeader>
                  <Column isRowHeader className="ps-5">{t.cName}</Column>
                  <Column>{t.cLevel}</Column>
                  <Column>{t.cActive}</Column>
                  <Column className="w-56">{t.cMastery}</Column>
                  <Column className="pe-5">{t.cFlag}</Column>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <Row key={l.id} id={l.id}>
                      <Cell className="ps-5"><span className="flex items-center gap-2.5"><Avatar name={l[lang]} className="size-7 text-[11px]" /><span className="font-medium">{l[lang]}</span></span></Cell>
                      <Cell><Badge tone="outline">{l.level}</Badge></Cell>
                      <Cell className={cn('text-muted-foreground', l.flag === 'inactive' && 'font-semibold text-warning-foreground')}>{l.active[lang]}</Cell>
                      <Cell><span className="flex items-center gap-2.5"><Progress value={l.mastery} size="sm" tone={barTone(l.mastery)} className="w-32" /><span className="w-9 text-xs font-semibold tabular-nums">{num(l.mastery, lang)}%</span></span></Cell>
                      <Cell className="pe-5"><FlagBadge f={l.flag} /></Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground md:border-t-0">
              <span>{t.showing(rows.length, LEARNERS.length)}</span>
              <Button variant="ghost" size="sm">{t.viewAll}</Button>
            </div>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><FlagIcon className="size-4 text-destructive" />{t.attention}</CardTitle><CardDescription>{t.attentionSub}</CardDescription></CardHeader>
              <ul className="divide-y">
                {attention.map((a) => (
                  <li key={a.l.id} className="flex gap-3 px-5 py-3">
                    <Avatar name={a.l[lang]} className="size-8 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.l[lang]}</p>
                      <p className={cn('flex items-center gap-1 text-xs font-semibold', { danger: 'text-destructive', warning: 'text-warning-foreground', success: 'text-success' }[a.tone])}><a.Icon className="size-3.5 shrink-0" />{a.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" variant={a.tone === 'success' ? 'outline' : 'secondary'} className="h-7 px-2.5 text-xs">{a.tone === 'warning' ? <MessageCircle /> : <Sparkles />}{a.action}</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs">{t.view}<Dir><ChevronRight /></Dir></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle>{t.skills}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {skills.map(([s, v]) => (
                  <div key={s} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{s}</span>
                    <Progress value={v} size="sm" tone={barTone(v)} />
                    <span className="text-end text-xs font-semibold tabular-nums">{num(v, lang)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
