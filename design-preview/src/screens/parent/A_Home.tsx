import { Bell, BookOpen, Bus, CalendarCheck, CalendarDays, ChevronRight, Clock, FileText, Lightbulb, Megaphone, MessageSquare, Phone, Receipt, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { egp, num, usePreview, useT } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dir, Separator } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, useParentNav } from './A_shared';

const T = {
  en: {
    title: 'Good morning, Mona', sub: 'Nile Valley International School', notif: 'Notifications',
    today: 'Laila today', attendance: 'Attendance', present: 'Present', arrived: 'Arrived at 07:31',
    bus: 'Bus', route: 'Route 1 Heliopolis · Hegaz Square', morning: 'Morning', afternoon: 'Afternoon', boarded: 'Boarded',
    late: 'About 15 minutes late today', lateSub: 'The afternoon bus is expected at 15:25.', supervisor: 'Supervisor: Ms Mona Samy', call: 'Call',
    next: 'Next class', nextClass: 'Science', nextWhere: 'Ms Rania Fawzy · Lab 2', at: '11:20',
    week: 'This week’s learning', minutes: 'Minutes', lessons: 'Lessons', outcomes: 'New skills', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    rec: 'Laila is doing well with fractions; 10 minutes on decimals this weekend would help her most.', minLabel: 'minutes',
    alerts: 'Alerts', fee: 'Term 2 fees due on 15 December', feeBody: (a: string) => `${a} for Laila. Payment is made at the school.`, feeLink: 'View fee record',
    ann: 'New announcement', annBody: 'Winter concert on Thursday 11 December, 10:00. Grades 4 to 6 perform.', annLink: 'Read',
    links: 'Quick links', l: ['Attendance', 'Bus', 'Fees', 'Report cards', 'Message a teacher', 'School calendar'],
    seeAll: 'See progress', updated: 'Updated 5 minutes ago',
  },
  ar: {
    title: 'صباح الخير يا منى', sub: 'مدرسة وادي النيل الدولية', notif: 'الإشعارات',
    today: 'ليلى اليوم', attendance: 'الحضور', present: 'حاضرة', arrived: 'وصلت الساعة 07:31',
    bus: 'الحافلة', route: 'الخط 1 مصر الجديدة · ميدان الحجاز', morning: 'الصباح', afternoon: 'بعد الظهر', boarded: 'صعدت',
    late: 'تأخير نحو 15 دقيقة اليوم', lateSub: 'يُتوقَّع وصول حافلة العودة الساعة 15:25.', supervisor: 'المشرفة: أ. منى سامي', call: 'اتصال',
    next: 'الحصة التالية', nextClass: 'العلوم', nextWhere: 'أ. رانيا فوزي · المختبر 2', at: '11:20',
    week: 'تعلّم هذا الأسبوع', minutes: 'الدقائق', lessons: 'الدروس', outcomes: 'مهارات جديدة', days: ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
    rec: 'تتقدّم ليلى جيدًا في الكسور، وعشر دقائق على الأعداد العشرية في عطلة نهاية الأسبوع ستفيدها أكثر من غيرها.', minLabel: 'دقيقة',
    alerts: 'تنبيهات', fee: 'رسوم الفصل الثاني مستحقة في 15 ديسمبر', feeBody: (a: string) => `${a} عن ليلى. يتم الدفع في المدرسة.`, feeLink: 'عرض سجل الرسوم',
    ann: 'إعلان جديد', annBody: 'حفل الشتاء يوم الخميس 11 ديسمبر الساعة 10:00، بمشاركة الصفوف من 4 إلى 6.', annLink: 'اقرأ',
    links: 'روابط سريعة', l: ['الحضور', 'الحافلة', 'الرسوم', 'الشهادات', 'مراسلة معلّم', 'تقويم المدرسة'],
    seeAll: 'عرض التقدّم', updated: 'آخر تحديث قبل 5 دقائق',
  },
};

const week = [32, 25, 41, 18, 29, 0, 0];

export default function ParentHome() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useParentNav();
  const max = Math.max(...week);
  const linkIcons = [<CalendarCheck />, <Bus />, <Receipt />, <FileText />, <MessageSquare />, <CalendarDays />];
  return (
    <AppShell nav={nav} active="home" title={t.title} subtitle={t.sub}
      actions={<a href="#" aria-label={t.notif} className="relative grid size-tap place-items-center rounded-full hover:bg-muted"><Bell className="size-5" /><span className="absolute end-2 top-2 size-2 rounded-full bg-destructive" /></a>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ChildSwitcher selected="laila" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Today at school */}
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">{t.today}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Tile icon={<CalendarCheck />} label={t.attendance} tone="success">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="success">{t.present}</Badge><span className="text-sm text-muted-foreground">{t.arrived}</span></div>
                </Tile>
                <Tile icon={<BookOpen />} label={t.next} tone="info">
                  <p className="font-bold">{t.nextClass} <span className="font-semibold text-muted-foreground tabular-nums">· {t.at}</span></p>
                  <p className="text-sm text-muted-foreground">{t.nextWhere}</p>
                </Tile>
                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:col-span-2">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning-foreground [&_svg]:size-5"><Bus /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-muted-foreground">{t.bus}</p>
                      <p className="font-bold">{t.route}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">{t.morning}</p><p className="font-bold tabular-nums">06:42 <span className="ms-1 text-xs font-semibold text-success">{t.boarded}</span></p></div>
                    <div className="rounded-md bg-warning-soft px-3 py-2"><p className="text-xs text-warning-foreground/80">{t.afternoon}</p><p className="font-bold tabular-nums"><s className="font-semibold text-muted-foreground">15:10</s> <span className="ms-1">15:25</span></p></div>
                  </div>
                  <Alert tone="warning" icon={<TriangleAlert />} title={t.late}>{t.lateSub}</Alert>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{t.supervisor}</p>
                    <Button variant="outline" size="default"><Phone />{t.call}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* This week's learning */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg">{t.week}</CardTitle>
                <a href="#" className="inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-primary">{t.seeAll}<Dir><ChevronRight className="size-4" /></Dir></a>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-3">
                  {[[t.minutes, 145], [t.lessons, 6], [t.outcomes, 3]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-muted px-3 py-3"><p className="text-xs font-semibold text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{num(v as number, lang)}</p></div>
                  ))}
                </div>
                <div className="flex items-end gap-2" aria-hidden>
                  {week.map((m, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${t.days[i]}: ${m} ${t.minLabel}`}>
                      <div className="flex h-[4.5rem] w-full items-end"><div className={cn('w-full rounded-t-[4px]', m ? 'bg-chart-1' : 'bg-muted')} style={{ height: m ? `${(m / max) * 100}%` : 4 }} /></div>
                      <span className="text-[11px] text-muted-foreground">{t.days[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 rounded-lg bg-info-soft p-3 text-sm"><Lightbulb className="mt-0.5 size-5 shrink-0 text-info" /><p>{t.rec}</p></div>
              </CardContent>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {/* Alerts */}
            <section>
              <SectionTitle>{t.alerts}</SectionTitle>
              <div className="flex flex-col gap-3">
                <Card className="flex gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning-foreground"><Receipt className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">{t.fee}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t.feeBody(egp(18500, lang))}</p>
                    <a href="#" className="mt-1 inline-flex min-h-tap items-center text-sm font-semibold text-primary">{t.feeLink}</a>
                  </div>
                </Card>
                <Card className="flex gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info"><Megaphone className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="font-bold">{t.ann}</p><span className="size-2 rounded-full bg-destructive" /></div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t.annBody}</p>
                    <a href="#" className="mt-1 inline-flex min-h-tap items-center text-sm font-semibold text-primary">{t.annLink}</a>
                  </div>
                </Card>
              </div>
            </section>

            {/* Quick links */}
            <section>
              <SectionTitle>{t.links}</SectionTitle>
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-2">
                {t.l.map((label, i) => (
                  <a key={label} href="#" className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-center text-sm font-semibold hover:bg-muted [&_svg]:size-6 [&_svg]:text-primary">
                    {linkIcons[i]}<span className="leading-tight">{label}</span>
                  </a>
                ))}
              </div>
            </section>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3.5" />{t.updated}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Tile({ icon, label, tone, children }: { icon: ReactNode; label: string; tone: 'success' | 'info'; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5', tone === 'success' ? 'bg-success-soft text-success' : 'bg-info-soft text-info')}>{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-muted-foreground">{label}</p>{children}</div>
    </div>
  );
}
