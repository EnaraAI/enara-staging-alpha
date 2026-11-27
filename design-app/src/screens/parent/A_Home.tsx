import { BookOpen, Bus, CalendarCheck, ChevronRight, Clock, GraduationCap, Lightbulb, Megaphone, MessageSquare, Phone, Receipt, TriangleAlert, Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { get } from '@/lib/api';
import { useSession } from '@/lib/session';
import { egp, num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Dir, Skeleton, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, ParentShell } from './A_shared';
import { ChildGate } from './B_common';
import {
  addMinutes, bi, sentence, cairoHHMM, cairoHour, cairoToday, childName, ep, ErrorState, fmtDay, fmtStamp, NotYet, optional, PageSkeleton, useChildren, useLoad,
  type AnnouncementsResp, type AttendanceStatus, type BusResp, type BusTrip, type HomeResp, type LearnerChip, type NotificationsResp, type SchoolOverview, type SubjectsResp, type TimetableResp, type WeeklyStatus,
} from './data';

type Reason = WeeklyStatus['reason'];
const T = {
  en: {
    greet: (h: number, name: string) => `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${name ? `, ${name}` : ''}`,
    today: (n: string) => `${n} today`, attendance: 'Attendance', notRecorded: 'Not recorded yet',
    st: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' } as Record<AttendanceStatus, string>,
    bus: 'Bus', morning: 'Morning', afternoon: 'Afternoon', noTime: 'No time set', cancelled: 'Cancelled',
    lateBy: (m: number | null | undefined) => (m ? `About ${m} minutes late today` : 'The bus is delayed today'), cancelTitle: 'Trip cancelled today', posted: (at: string) => `Posted by the school at ${at}.`,
    supervisor: (n: string) => `Supervisor: ${n}`, call: 'Call', busNo: (n: string) => `Bus ${n}`,
    next: 'Next class', nowClass: 'Now', noMore: 'No more classes today', noClasses: 'No classes on the timetable today',
    schoolOff: 'The school has not turned on school information on ENARA yet.', schoolErr: 'School information could not be loaded.', retry: 'Try again',
    week: 'This week’s learning', minutes: 'Minutes', sessions: 'Sessions', streak: 'Day streak', goal: (g: string) => `Weekly goal: ${g} minutes`, minLabel: 'minutes',
    seeAll: 'See progress', help: 'How you can help',
    alerts: 'Alerts', feeNext: (d: string) => `Next fee due on ${d}`, feeOverdue: (n: number) => (n === 1 ? 'One instalment is overdue' : `${n} instalments are overdue`), feeBody: (a: string) => `${a}. Payment is made at the school.`, feeLink: 'View fee record',
    ann: 'Latest announcement', unread: 'Unread from the school', nothing: 'Nothing needs your attention right now.',
    links: 'Quick links', l: { attendance: 'Attendance', bus: 'Bus', fees: 'Fees', progress: 'Progress', chat: 'Ask the school' },
    updated: (t: string) => `Updated at ${t}`,
    reason: (r: Reason, n: (x: number) => string): string => {
      const p = (r?.params ?? {}) as Record<string, number | string>; const name = String(p.name ?? '');
      switch (r?.code) {
        case 'on_pace': case 'behind_pace': return `${name} has done ${n(+p.minutesDone || 0)} of ${n(+p.goalMinutes || 0)} minutes, with ${n(+p.daysLeft || 0)} days left.`;
        case 'goal_reached': return `${name} reached the goal: ${n(+p.minutesDone || 0)} of ${n(+p.goalMinutes || 0)} minutes.`;
        case 'missed_days': return `${name} has done ${n(+p.minutesDone || 0)} of ${n(+p.goalMinutes || 0)} minutes and missed the last ${n(+p.missedDays || 0)} days.`;
        case 'safety_alert': return 'ENARA noticed something in a conversation this week. Please check with your child.';
        case 'score_drop': return `The latest result dropped from ${n(+p.from || 0)}% to ${n(+p.to || 0)}%.`;
        default: return '';
      }
    },
  },
  ar: {
    greet: (h: number, name: string) => `${h < 12 ? 'صباح الخير' : 'مساء الخير'}${name ? ` يا ${name}` : ''}`,
    today: (n: string) => `${n} اليوم`, attendance: 'الحضور', notRecorded: 'لم يُسجَّل بعد',
    st: { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'غياب بعذر' } as Record<AttendanceStatus, string>,
    bus: 'الحافلة', morning: 'الصباح', afternoon: 'بعد الظهر', noTime: 'لم يُحدَّد موعد', cancelled: 'أُلغيت',
    lateBy: (m: number | null | undefined) => (m ? `تأخير نحو ${m} دقيقة اليوم` : 'الحافلة متأخرة اليوم'), cancelTitle: 'أُلغيت الرحلة اليوم', posted: (at: string) => `نشرت المدرسة هذا التنبيه الساعة ${at}.`,
    supervisor: (n: string) => `المشرف: ${n}`, call: 'اتصال', busNo: (n: string) => `الحافلة ${n}`,
    next: 'الحصة التالية', nowClass: 'الآن', noMore: 'لا حصص أخرى اليوم', noClasses: 'لا حصص في الجدول اليوم',
    schoolOff: 'لم تفعّل المدرسة معلوماتها المدرسية على إنارة بعد.', schoolErr: 'تعذّر تحميل معلومات المدرسة.', retry: 'حاول مرة أخرى',
    week: 'تعلّم هذا الأسبوع', minutes: 'الدقائق', sessions: 'الجلسات', streak: 'أيام متتالية', goal: (g: string) => `الهدف الأسبوعي: ${g} دقيقة`, minLabel: 'دقيقة',
    seeAll: 'عرض التقدّم', help: 'كيف يمكنك المساعدة',
    alerts: 'تنبيهات', feeNext: (d: string) => `القسط التالي مستحق في ${d}`, feeOverdue: (n: number) => (n === 1 ? 'يوجد قسط متأخر السداد' : `يوجد ${n} أقساط متأخرة السداد`), feeBody: (a: string) => `${a}. يتم الدفع في المدرسة.`, feeLink: 'عرض سجل الرسوم',
    ann: 'أحدث إعلان', unread: 'رسائل غير مقروءة من المدرسة', nothing: 'لا شيء يحتاج إلى انتباهك الآن.',
    links: 'روابط سريعة', l: { attendance: 'الحضور', bus: 'الحافلة', fees: 'الرسوم', progress: 'التقدّم', chat: 'اسأل المدرسة' },
    updated: (t: string) => `آخر تحديث الساعة ${t}`,
    reason: (r: Reason, n: (x: number) => string): string => {
      const p = (r?.params ?? {}) as Record<string, number | string>; const name = String(p.name ?? '');
      switch (r?.code) {
        case 'on_pace': case 'behind_pace': return `أنجز ${name} ${n(+p.minutesDone || 0)} من ${n(+p.goalMinutes || 0)} دقيقة، وبقي ${n(+p.daysLeft || 0)} أيام.`;
        case 'goal_reached': return `بلغ ${name} الهدف: ${n(+p.minutesDone || 0)} من ${n(+p.goalMinutes || 0)} دقيقة.`;
        case 'missed_days': return `أنجز ${name} ${n(+p.minutesDone || 0)} من ${n(+p.goalMinutes || 0)} دقيقة ولم يتدرّب في آخر ${n(+p.missedDays || 0)} أيام.`;
        case 'safety_alert': return 'لاحظت إنارة أمرًا في محادثة هذا الأسبوع. يُرجى التحدّث مع ابنك أو ابنتك.';
        case 'score_drop': return `انخفضت آخر نتيجة من ${n(+p.from || 0)}٪ إلى ${n(+p.to || 0)}٪.`;
        default: return '';
      }
    },
  },
};
type TT = (typeof T)['en'];
const ATT_TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = { present: 'success', absent: 'danger', late: 'warning', excused: 'info' };

interface SchoolBundle { ov: SchoolOverview | null; bus: BusResp | null; tt: TimetableResp | null; ann: AnnouncementsResp | null }
const soft = <T,>(p: Promise<T | null>) => p.catch(() => null);

export default function ParentHome() {
  const t = useT(T);
  const { user } = useSession();
  const kids = useChildren();
  const first = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  return (
    <ParentShell active="home" title={t.greet(cairoHour(), first)} subtitle={kids.child?.school ?? undefined}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ChildGate kids={kids} skeleton={<PageSkeleton cards={2} />}>
          {(child) => (<><ChildSwitcher kids={kids} always /><HomeBody key={child.studentId} child={child} /></>)}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

function HomeBody({ child }: { child: LearnerChip }) {
  const t = useT(T);
  const { lang } = usePreview();
  const id = child.studentId;
  const name = childName(child);
  const learning = useLoad(async (signal) => {
    const [home, subjects] = await Promise.all([get<HomeResp>(ep.home(id), signal), soft(optional(get<SubjectsResp>(ep.subjects(id), signal)))]);
    return { home, subjects };
  }, [id]);
  const school = useLoad<SchoolBundle>(async (signal) => {
    const ov = await optional(get<SchoolOverview>(ep.overview(id), signal));
    const on = ov?.sections ?? {};
    const [bus, tt, ann] = await Promise.all([
      on.buses ? soft(optional(get<BusResp>(ep.bus(id), signal))) : null,
      on.timetable ? soft(optional(get<TimetableResp>(ep.timetable(id), signal))) : null,
      on.announcements ? soft(optional(get<AnnouncementsResp>(ep.announcements(id), signal))) : null,
    ]);
    return { ov, bus, tt, ann };
  }, [id]);
  const notes = useLoad((signal) => soft(optional(get<NotificationsResp>(ep.notifications, signal))), []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Today at school */}
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">{t.today(name)}</CardTitle></CardHeader>
          <CardContent>
            {school.loading ? <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-32 sm:col-span-2" /></div>
              : school.error ? <ErrorState error={school.error} onRetry={school.reload} className="shadow-none" />
              : <Today b={school.data!} t={t} lang={lang} />}
          </CardContent>
        </Card>

        {/* This week's learning */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-lg">{t.week}</CardTitle>
            <a href="#/parent/progress" className="inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-primary">{t.seeAll}<Dir><ChevronRight className="size-4" /></Dir></a>
          </CardHeader>
          <CardContent>
            {learning.loading ? <div className="flex flex-col gap-4"><div className="grid grid-cols-3 gap-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div><Skeleton className="h-20" /></div>
              : learning.error ? <ErrorState error={learning.error} onRetry={learning.reload} className="shadow-none" />
              : <Week status={learning.data?.home?.status} subjects={learning.data?.subjects ?? null} t={t} lang={lang} />}
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <section>
          <SectionTitle>{t.alerts}</SectionTitle>
          {school.loading || notes.loading ? <div className="flex flex-col gap-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
            : <Alerts ov={school.data?.ov ?? null} ann={school.data?.ann ?? null} notes={notes.data ?? null} childId={id} t={t} lang={lang} />}
        </section>

        <section>
          <SectionTitle>{t.links}</SectionTitle>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-2">
            {([
              ['#/parent/attendance', t.l.attendance, <CalendarCheck />], ['#/parent/bus', t.l.bus, <Bus />], ['#/parent/fees', t.l.fees, <Receipt />],
              ['#/parent/progress', t.l.progress, <GraduationCap />], ['#/parent/chat', t.l.chat, <MessageSquare />],
            ] as [string, string, ReactNode][]).map(([href, label, icon]) => (
              <a key={href} href={href} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-center text-sm font-semibold hover:bg-muted [&_svg]:size-6 [&_svg]:text-primary">
                {icon}<span className="leading-tight">{label}</span>
              </a>
            ))}
          </div>
        </section>
        {learning.data?.home?.generatedAt && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3.5" />{t.updated(fmtStamp(learning.data.home.generatedAt, lang, { hour: '2-digit', minute: '2-digit' }))}</p>}
      </div>
    </div>
  );
}

function Today({ b, t, lang }: { b: SchoolBundle; t: TT; lang: Lang }) {
  const ov = b.ov;
  const on = ov?.sections ?? {};
  if (!ov || !Object.values(on).some(Boolean)) return <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{t.schoolOff}</p>;
  const now = cairoHHMM();
  const classes = (ov.todayClasses ?? []).filter((c) => c?.start);
  const current = classes.find((c) => (c.start ?? '') <= now && now < (c.end ?? ''));
  const nextC = current ?? classes.find((c) => (c.start ?? '') > now);
  const weekday = new Date(`${ov.today ?? cairoToday()}T12:00:00Z`).getUTCDay();
  const detail = nextC ? b.tt?.days?.find((d) => d.day === weekday)?.periods?.find((p) => p.period === nextC.period && p.start === nextC.start) : undefined;
  const trips = (b.bus?.trips ?? []).filter((x): x is BusTrip => !!x);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {on.attendance && (
        <Tile icon={<CalendarCheck />} label={t.attendance} tone="success">
          {ov.attendanceToday ? <Badge tone={ATT_TONE[ov.attendanceToday] ?? 'info'}>{t.st[ov.attendanceToday] ?? ov.attendanceToday}</Badge> : <p className="text-sm text-muted-foreground">{t.notRecorded}</p>}
        </Tile>
      )}
      {on.timetable && (
        <Tile icon={<BookOpen />} label={t.next} tone="info">
          {nextC ? (
            <>
              <p className="font-bold">{nextC.subject} <span className="font-semibold text-muted-foreground tabular-nums">· {current ? t.nowClass : <span dir="ltr">{nextC.start}</span>}</span></p>
              {(detail?.teacher || detail?.room) && <p className="text-sm text-muted-foreground">{[detail.teacher, detail.room].filter(Boolean).join(' · ')}</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">{classes.length ? t.noMore : t.noClasses}</p>}
        </Tile>
      )}
      {on.buses && trips.length > 0 && <BusBlock trips={trips} t={t} lang={lang} />}
    </div>
  );
}

function BusBlock({ trips, t, lang }: { trips: BusTrip[]; t: TT; lang: Lang }) {
  const withNotice = trips.find((x) => x.notices?.length);
  const notice = withNotice?.notices?.[0];
  const main = withNotice ?? trips[0];
  const phone = trips.find((x) => x.supervisorPhone)?.supervisorPhone ?? null;
  const supervisor = main?.supervisor ?? trips.find((x) => x.supervisor)?.supervisor ?? null;
  const title = [main?.route, main?.stop].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning-foreground [&_svg]:size-5"><Bus /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">{t.bus}{main?.busNumber ? ` · ${t.busNo(main.busNumber)}` : ''}</p>
          <p className="font-bold">{title}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {(['morning', 'afternoon'] as const).map((dir) => {
          const trip = trips.find((x) => x.direction === dir);
          if (!trip) return <div key={dir} className="rounded-md bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">{t[dir]}</p><p className="text-muted-foreground">—</p></div>;
          const n = trip.notices?.[0];
          const later = n?.kind === 'delay' ? addMinutes(trip.time, n.minutes) : null;
          return (
            <div key={dir} className={cn('rounded-md px-3 py-2', n ? 'bg-warning-soft' : 'bg-muted')}>
              <p className={cn('text-xs', n ? 'text-warning-foreground/80' : 'text-muted-foreground')}>{t[dir]}</p>
              {n?.kind === 'cancel' ? <p className="font-bold">{trip.time && <s className="me-1 font-semibold text-muted-foreground" dir="ltr">{trip.time}</s>}{t.cancelled}</p>
                : later ? <p className="font-bold tabular-nums" dir="ltr"><s className="font-semibold text-muted-foreground">{trip.time}</s> <span className="ms-1">~{later}</span></p>
                : <p className="font-bold tabular-nums" dir="ltr">{trip.time ?? <span className="font-normal text-muted-foreground">{t.noTime}</span>}</p>}
            </div>
          );
        })}
      </div>
      {notice && (
        <Alert tone="warning" icon={<TriangleAlert />} title={notice.kind === 'cancel' ? t.cancelTitle : t.lateBy(notice.minutes)}>
          {[sentence(notice.message), notice.at ? t.posted(fmtStamp(notice.at, lang, { hour: '2-digit', minute: '2-digit' })) : ''].filter(Boolean).join(' ')}
        </Alert>
      )}
      {supervisor && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t.supervisor(supervisor)}</p>
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={buttonVariants({ variant: 'outline' })}><Phone />{t.call}</a>}
        </div>
      )}
    </div>
  );
}

function Week({ status, subjects, t, lang }: { status: WeeklyStatus | undefined; subjects: SubjectsResp | null; t: TT; lang: Lang }) {
  const n = (x: number) => num(x, lang);
  const days = status?.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.minutes ?? 0));
  const reason = t.reason(status?.reason, n);
  const rec = (subjects?.subjects ?? []).map((s) => s.top).find((r) => r?.do);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        {([[t.minutes, status?.minutesDone], [t.sessions, status?.sessions], [t.streak, status?.streak]] as [string, number | undefined][]).map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted px-3 py-3"><p className="truncate text-xs font-semibold text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{typeof v === 'number' ? n(v) : '—'}</p></div>
        ))}
      </div>
      {days.length > 0 && (
        <div>
          <div className="flex items-end gap-2" aria-hidden>
            {days.map((d) => {
              const m = d.minutes ?? 0;
              const label = fmtDay(d.day, lang, { weekday: 'short' });
              return (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${label}: ${n(m)} ${t.minLabel}`}>
                  <div className="flex h-[4.5rem] w-full items-end"><div className={cn('w-full rounded-t-[4px]', m ? (d.isToday ? 'bg-primary' : 'bg-chart-1') : 'bg-muted')} style={{ height: m ? `${(m / max) * 100}%` : 4 }} /></div>
                  <span className={cn('max-w-full truncate text-[11px] text-muted-foreground', d.isToday && 'font-bold text-foreground')}>{label}</span>
                </div>
              );
            })}
          </div>
          <table className="sr-only"><tbody>{days.map((d) => <tr key={d.day}><td>{fmtDay(d.day, lang, { weekday: 'long' })}</td><td>{n(d.minutes ?? 0)} {t.minLabel}</td></tr>)}</tbody></table>
          {typeof status?.goalMinutes === 'number' && <p className="mt-2 text-xs text-muted-foreground">{t.goal(n(status.goalMinutes))}</p>}
        </div>
      )}
      {(reason || rec) && (
        <div className="flex gap-3 rounded-lg bg-info-soft p-3 text-sm">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" />
          <div className="flex min-w-0 flex-col gap-1">
            {reason && <p>{reason}</p>}
            {rec?.do && <p><span className="font-bold">{t.help}: </span>{bi(rec.do, lang)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Alerts({ ov, ann, notes, childId, t, lang }: { ov: SchoolOverview | null; ann: AnnouncementsResp | null; notes: NotificationsResp | null; childId: string; t: TT; lang: Lang }) {
  const fees = ov?.sections?.fees ? ov.fees : undefined;
  const overdue = fees?.overdueCount ?? 0;
  const next = fees?.next;
  const latest = ann?.announcements?.[0];
  const unread = (notes?.notifications ?? []).filter((x) => x && !x.read && (!x.studentId || x.studentId === childId)).slice(0, 3);
  const items: ReactNode[] = [];
  if (fees && (overdue > 0 || next)) {
    items.push(
      <AlertCard key="fee" icon={<Receipt className="size-5" />} tone={overdue ? 'danger' : 'warning'} title={overdue ? t.feeOverdue(overdue) : t.feeNext(fmtDay(next?.dueDate, lang))}
        body={typeof next?.amount === 'number' ? t.feeBody(egp(next.amount, lang)) : undefined} link={['#/parent/fees', t.feeLink]} />,
    );
  }
  if (latest) {
    const title = (lang === 'ar' && latest.titleAr) || latest.title || '';
    const body = (lang === 'ar' && latest.bodyAr) || latest.body || '';
    items.push(<AlertCard key="ann" icon={<Megaphone className="size-5" />} tone="info" title={t.ann} sub={fmtStamp(latest.publishAt, lang, { day: 'numeric', month: 'short' })} body={<><span className="font-semibold text-foreground">{title}</span>{body ? ` · ${body}` : ''}</>} />);
  }
  if (unread.length) {
    items.push(
      <Card key="notes" className="flex gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Bell className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p className="font-bold">{t.unread}</p><span className="size-2 rounded-full bg-destructive" /></div>
          <ul className="mt-1 flex flex-col gap-2">
            {unread.map((x) => (
              <li key={x.id} className="text-sm"><p className="font-semibold">{x.title}</p>{x.body && <p className="line-clamp-2 text-muted-foreground">{x.body}</p>}{x.createdAt && <p className="text-xs text-muted-foreground">{fmtStamp(x.createdAt, lang)}</p>}</li>
            ))}
          </ul>
        </div>
      </Card>,
    );
  }
  if (!items.length) return <Card className="p-4"><NotYet className="text-sm">{t.nothing}</NotYet></Card>;
  return <div className="flex flex-col gap-3">{items}</div>;
}

function AlertCard({ icon, tone, title, sub, body, link }: { icon: ReactNode; tone: 'warning' | 'danger' | 'info'; title: string; sub?: string; body?: ReactNode; link?: [string, string] }) {
  const toneCls = { warning: 'bg-warning-soft text-warning-foreground', danger: 'bg-destructive-soft text-destructive', info: 'bg-info-soft text-info' }[tone];
  return (
    <Card className="flex gap-3 p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', toneCls)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {body && <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{body}</p>}
        {link && <a href={link[0]} className="mt-1 inline-flex min-h-tap items-center text-sm font-semibold text-primary">{link[1]}</a>}
      </div>
    </Card>
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
