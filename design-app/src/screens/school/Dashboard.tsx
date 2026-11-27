import { BellRing, Bot, Bus, CalendarCheck, CalendarDays, ChevronRight, ClipboardCheck, FilePenLine, FileSpreadsheet, Inbox, Megaphone, Receipt, RefreshCw, UserCheck, Users, Link2, Upload, Plus } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dir, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell } from './SchoolShell';

const T = {
  en: {
    title: 'Dashboard', sub: 'Thursday 26 November 2026 · Term 1, week 11', newAnn: 'New announcement',
    kLearners: 'Learners active this week', kLearnersHint: 'of 1,482 enrolled', kParents: 'Parents linked', kParentsHint: '1,214 of 1,482 families', kAtt: 'Attendance today', kAttHint: '57 absent · 22 late', kReq: 'Open requests', kReqHint: '4 new since Sunday', kReqWarn: '2 waiting over 48 h',
    up: '+6% on last week',
    sections: 'Parents app sections', sectionsDesc: 'What parents see in the app today', manage: 'Manage', on: 'On', off: 'Off', setup: 'Needs data',
    s: { timetable: 'Timetable', announcements: 'Announcements', attendance: 'Attendance', notifications: 'Notifications', fees: 'Fees', bus: 'Bus', requests: 'Requests', consent: 'Consent forms', chat: 'Chat assistant' },
    imports: 'Recent imports', viewAll: 'View all',
    imp: [
      { file: 'attendance_week11.xlsx', section: 'Attendance', when: 'Today, 08:40', rows: '1,476 rows', status: 'done' },
      { file: 'Moodle sync', section: 'Classes and learners', when: 'Today, 06:00', rows: '38 changes', status: 'done' },
      { file: 'fees_term1_instalment2.xlsx', section: 'Fees', when: 'Yesterday, 14:12', rows: '3 rejected', status: 'warn' },
      { file: 'bus_routes_nov.xlsx', section: 'Bus', when: '23 Nov, 10:05', rows: '412 rows', status: 'done' },
    ],
    stDone: 'Imported', stWarn: 'Check rows',
    alerts: 'Alerts',
    a1t: 'Fee reminder batch sent', a1: '418 guardians received the second-instalment reminder at 09:00. 6 emails bounced.',
    a2t: 'Moodle sync ran at 06:00', a2: '38 changes applied (12 new learners, 26 class moves). Next run tonight at 06:00.',
    a3t: '3 fee rows were rejected', a3: 'Unknown learner ID in rows 14, 208 and 377. Fix the file and import again.',
    quick: 'Quick actions',
    q: ['Import a file', 'Write an announcement', 'Answer requests', 'Invite parents'],
  },
  ar: {
    title: 'لوحة المتابعة', sub: 'الخميس 26 نوفمبر 2026 · الفصل الدراسي الأول، الأسبوع 11', newAnn: 'إعلان جديد',
    kLearners: 'الطلاب النشطون هذا الأسبوع', kLearnersHint: 'من أصل 1,482 طالبًا مسجّلًا', kParents: 'أولياء الأمور المرتبطون', kParentsHint: '1,214 أسرة من أصل 1,482', kAtt: 'الحضور اليوم', kAttHint: '57 غائبًا · 22 متأخرًا', kReq: 'الطلبات المفتوحة', kReqHint: '4 طلبات جديدة منذ الأحد', kReqWarn: 'طلبان ينتظران أكثر من 48 ساعة',
    up: '+6% عن الأسبوع الماضي',
    sections: 'أقسام تطبيق أولياء الأمور', sectionsDesc: 'ما يراه أولياء الأمور في التطبيق اليوم', manage: 'إدارة', on: 'مفعّل', off: 'متوقف', setup: 'يحتاج إلى بيانات',
    s: { timetable: 'الجدول الدراسي', announcements: 'الإعلانات', attendance: 'الحضور', notifications: 'الإشعارات', fees: 'الرسوم', bus: 'الحافلة', requests: 'الطلبات', consent: 'نماذج الموافقة', chat: 'المساعد الذكي' },
    imports: 'أحدث عمليات الاستيراد', viewAll: 'عرض الكل',
    imp: [
      { file: 'attendance_week11.xlsx', section: 'الحضور', when: 'اليوم، 08:40', rows: '1,476 صفًا', status: 'done' },
      { file: 'مزامنة Moodle', section: 'الفصول والطلاب', when: 'اليوم، 06:00', rows: '38 تغييرًا', status: 'done' },
      { file: 'fees_term1_instalment2.xlsx', section: 'الرسوم', when: 'أمس، 14:12', rows: '3 صفوف مرفوضة', status: 'warn' },
      { file: 'bus_routes_nov.xlsx', section: 'الحافلة', when: '23 نوفمبر، 10:05', rows: '412 صفًا', status: 'done' },
    ],
    stDone: 'تم الاستيراد', stWarn: 'راجع الصفوف',
    alerts: 'التنبيهات',
    a1t: 'أُرسلت دفعة تذكير بالرسوم', a1: 'تلقّى 418 وليّ أمر تذكيرًا بالقسط الثاني في الساعة 09:00. ارتدّت 6 رسائل بريد إلكتروني.',
    a2t: 'تمّت مزامنة Moodle في الساعة 06:00', a2: 'طُبّق 38 تغييرًا (12 طالبًا جديدًا و26 نقلًا بين الفصول). المزامنة القادمة الليلة في الساعة 06:00.',
    a3t: 'رُفضت 3 صفوف من ملف الرسوم', a3: 'رقم الطالب غير معروف في الصفوف 14 و208 و377. صحّح الملف ثم أعد الاستيراد.',
    quick: 'إجراءات سريعة',
    q: ['استيراد ملف', 'كتابة إعلان', 'الرد على الطلبات', 'دعوة أولياء الأمور'],
  },
};

type SKey = keyof typeof T.en.s;
const SECTIONS: { key: SKey; icon: React.ReactNode; state: 'on' | 'off' | 'setup' }[] = [
  { key: 'timetable', icon: <CalendarDays />, state: 'on' },
  { key: 'announcements', icon: <Megaphone />, state: 'on' },
  { key: 'attendance', icon: <CalendarCheck />, state: 'on' },
  { key: 'notifications', icon: <BellRing />, state: 'on' },
  { key: 'fees', icon: <Receipt />, state: 'on' },
  { key: 'bus', icon: <Bus />, state: 'setup' },
  { key: 'requests', icon: <Inbox />, state: 'on' },
  { key: 'consent', icon: <FilePenLine />, state: 'off' },
  { key: 'chat', icon: <Bot />, state: 'on' },
];

export default function SchoolDashboard() {
  const t = useT(T);
  const { lang } = usePreview();
  const kpis = [
    { label: t.kLearners, value: num(1306, lang), hint: t.kLearnersHint, icon: <Users />, extra: <span className="text-xs font-semibold text-success">{t.up}</span> },
    { label: t.kParents, value: `${num(82, lang)}%`, hint: t.kParentsHint, icon: <Link2 />, extra: <Progress value={82} size="sm" tone="info" /> },
    { label: t.kAtt, value: `${num(94.6, lang)}%`, hint: t.kAttHint, icon: <UserCheck />, extra: <Progress value={94.6} size="sm" tone="success" /> },
    { label: t.kReq, value: num(6, lang), hint: t.kReqHint, icon: <Inbox />, extra: <Badge tone="warning" className="w-fit whitespace-normal">{t.kReqWarn}</Badge> },
  ];
  const quick = [<Upload key="u" />, <Megaphone key="m" />, <Inbox key="i" />, <Plus key="p" />];
  return (
    <SchoolShell active="dashboard" title={t.title} subtitle={t.sub} actions={<Button size="sm" aria-label={t.newAnn}><Plus /><span className="hidden sm:inline">{t.newAnn}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <Card key={i} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{k.label}</span>
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-4">{k.icon}</span>
              </div>
              <span className="text-2xl font-bold tabular-nums leading-none">{k.value}</span>
              {k.extra}<span className="text-xs text-muted-foreground">{k.hint}</span>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="flex flex-col gap-1"><CardTitle>{t.sections}</CardTitle><CardDescription>{t.sectionsDesc}</CardDescription></div>
              <Button variant="outline" size="sm">{t.manage}<Dir><ChevronRight /></Dir></Button>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SECTIONS.map((s) => (
                  <li key={s.key} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', s.state === 'on' ? 'bg-success-soft text-success' : s.state === 'setup' ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground')}>{s.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.s[s.key]}</span>
                    <Badge tone={s.state === 'on' ? 'success' : s.state === 'setup' ? 'warning' : 'neutral'}>{s.state === 'on' ? t.on : s.state === 'setup' ? t.setup : t.off}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.quick}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {t.q.map((q, i) => (
                <Button key={q} variant={i === 0 ? 'default' : 'outline'} className="h-auto min-h-tap justify-start whitespace-normal py-2 text-start">{quick[i]}<span className="flex-1">{q}</span></Button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <section className="min-w-0 lg:col-span-3">
            <SectionTitle action={<a href="#" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{t.viewAll}<Dir><ChevronRight className="size-4" /></Dir></a>}>{t.imports}</SectionTitle>
            <Card className="divide-y">
              {t.imp.map((r) => (
                <div key={r.file} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">{r.file.endsWith('.xlsx') ? <FileSpreadsheet /> : <RefreshCw />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold"><bdi>{r.file}</bdi></p>
                    <p className="truncate text-xs text-muted-foreground">{r.section} · {r.when} · <span className="tabular-nums">{r.rows}</span></p>
                  </div>
                  <Badge tone={r.status === 'done' ? 'success' : 'warning'}>{r.status === 'done' ? t.stDone : t.stWarn}</Badge>
                </div>
              ))}
            </Card>
          </section>
          <section className="min-w-0 lg:col-span-2">
            <SectionTitle>{t.alerts}</SectionTitle>
            <div className="flex flex-col gap-2.5">
              <Alert tone="success" icon={<Receipt />} title={t.a1t}>{t.a1}</Alert>
              <Alert tone="info" icon={<RefreshCw />} title={t.a2t}>{t.a2}</Alert>
              <Alert tone="warning" icon={<ClipboardCheck />} title={t.a3t}>{t.a3}</Alert>
            </div>
          </section>
        </div>
      </div>
    </SchoolShell>
  );
}
