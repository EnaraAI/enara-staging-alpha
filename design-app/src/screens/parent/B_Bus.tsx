import { BusFront, CalendarDays, Check, Clock3, Home, Info, MapPin, Phone, School, Sunrise, Sunset, TriangleAlert, UserRound, XCircle } from 'lucide-react';
import { get } from '@/lib/api';
import { useT, usePreview, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Separator, Skeleton, Tab, TabList, TabPanel, Tabs, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ChildGate, ParentShell, SchoolTabs } from './B_common';
import { addMinutes, sentence, CalmState, childName, ep, ErrorState, fmtDay, fmtStamp, isOff, OffState, useChildren, useLoad, type BusNotice, type BusResp, type BusTrip, type Children, type LearnerChip } from './data';

const T = {
  en: {
    title: 'Bus', sub: 'Stops and times from the school', today: 'Today’s trips',
    morning: 'Morning pickup', afternoon: 'Afternoon drop-off', scheduled: 'Scheduled', cancelled: 'Cancelled', noTime: 'No time set', map: 'Open map',
    delayed: (m: number | null | undefined) => (m ? `About ${m} minutes late` : 'Delayed'), expected: (x: string) => `Expect around ${x}`,
    delayTitle: (dir: string, m: number | null | undefined) => `${dir}: ${m ? `about ${m} minutes late` : 'delayed'} today`, cancelTitle: (dir: string) => `${dir}: cancelled today`, posted: (at: string) => `Posted by the school at ${at}.`,
    route: 'Route stops', yourStop: 'Your stop', school: 'School', morningTab: 'Morning', afternoonTab: 'Afternoon', updated: (d: string) => `Updated by the school on ${d}`,
    supervisor: 'Bus supervisor', call: 'Call supervisor', noPhone: 'The school does not share the supervisor’s phone number.', noSupervisor: 'The school has not named a supervisor for this route.',
    driver: 'Driver', bus: 'Bus', routeName: 'Route',
    notLive: 'Times are the school’s timetable, not live tracking.', notLiveBody: 'Notices like delays come from the school.',
    absent: (n: string) => `${n} will not take the bus?`, tell: 'Tell the school',
    none: 'No bus for this child', noneBody: (n: string) => `The school has not assigned a bus route to ${n}.`, noStops: 'The school has not added the stops for this trip.',
  },
  ar: {
    title: 'الحافلة', sub: 'المحطات والمواعيد من المدرسة', today: 'رحلات اليوم',
    morning: 'رحلة الصباح', afternoon: 'رحلة العودة', scheduled: 'حسب الجدول', cancelled: 'أُلغيت', noTime: 'لم يُحدَّد موعد', map: 'فتح الخريطة',
    delayed: (m: number | null | undefined) => (m ? `تأخير نحو ${m} دقيقة` : 'متأخرة'), expected: (x: string) => `الوصول المتوقع نحو ${x}`,
    delayTitle: (dir: string, m: number | null | undefined) => `${dir}: ${m ? `تأخير نحو ${m} دقيقة` : 'تأخير'} اليوم`, cancelTitle: (dir: string) => `${dir}: أُلغيت اليوم`, posted: (at: string) => `نشرت المدرسة هذا التنبيه الساعة ${at}.`,
    route: 'محطات الخط', yourStop: 'محطتك', school: 'المدرسة', morningTab: 'الصباح', afternoonTab: 'العودة', updated: (d: string) => `حدّثته المدرسة في ${d}`,
    supervisor: 'مشرف الحافلة', call: 'الاتصال بالمشرف', noPhone: 'لا تشارك المدرسة رقم هاتف المشرف.', noSupervisor: 'لم تحدّد المدرسة مشرفًا لهذا الخط.',
    driver: 'السائق', bus: 'الحافلة', routeName: 'الخط',
    notLive: 'المواعيد هي جدول المدرسة، وليست تتبعًا مباشرًا.', notLiveBody: 'تنبيهات التأخير تأتي من المدرسة.',
    absent: (n: string) => `لن يركب ${n} الحافلة؟`, tell: 'أبلغ المدرسة',
    none: 'لا توجد حافلة لهذا الابن أو الابنة', noneBody: (n: string) => `لم تخصّص المدرسة خط حافلة لـ${n}.`, noStops: 'لم تُضف المدرسة محطات هذه الرحلة بعد.',
  },
};
type TT = (typeof T)['en'];

export default function BusScreen() {
  const t = useT(T);
  const kids = useChildren();
  return (
    <ParentShell active="school" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ChildGate kids={kids}>
          {(child) => <BusBody key={child.studentId} child={child} kids={kids} />}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

function BusBody({ child, kids }: { child: LearnerChip; kids: Children }) {
  const t = useT(T);
  const { lang } = usePreview();
  const q = useLoad((signal) => get<BusResp>(ep.bus(child.studentId), signal), [child.studentId]);
  const trips = (q.data?.trips ?? []).filter((x): x is BusTrip => !!x && (x.direction === 'morning' || x.direction === 'afternoon'));
  const name = childName(child);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildChip kids={kids} />
        {q.data?.today && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-4" />{fmtDay(q.data.today, lang, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</p>}
      </div>
      <SchoolTabs active="bus" />
      {q.loading ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]" aria-busy="true" data-testid="parent-loading">
          <div className="flex flex-col gap-5"><div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div><Skeleton className="h-72 rounded-xl" /></div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : isOff(q.error) ? <OffState />
        : q.error || !q.data ? <ErrorState error={q.error} onRetry={q.reload} />
        : !trips.length ? <CalmState icon={<BusFront />} title={t.none} body={t.noneBody(name)} />
        : <BusView data={q.data} trips={trips} name={name} t={t} lang={lang} />}
    </>
  );
}

function noticeOf(trip: BusTrip | undefined): BusNotice | undefined { return trip?.notices?.[0]; }

function BusView({ data, trips, name, t, lang }: { data: BusResp; trips: BusTrip[]; name: string; t: TT; lang: Lang }) {
  const notices = trips.flatMap((tr) => (tr.notices ?? []).map((n) => ({ n, dir: tr.direction === 'morning' ? t.morningTab : t.afternoonTab })));
  const crew = trips.filter((tr, i) => trips.findIndex((x) => x.route === tr.route && x.supervisor === tr.supervisor && x.supervisorPhone === tr.supervisorPhone) === i);
  const updated = data.source?.updatedAt ? fmtStamp(data.source.updatedAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const first = trips.find((x) => x.notices?.length)?.direction ?? trips[0]?.direction ?? 'morning';
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section>
          <SectionTitle>{t.today}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['morning', 'afternoon'] as const).map((dir) => {
              const trip = trips.find((x) => x.direction === dir);
              if (!trip) return null;
              const n = noticeOf(trip);
              const later = n?.kind === 'delay' ? addMinutes(trip.time, n.minutes) : null;
              return (
                <Card key={dir} className={cn('p-4', n?.kind === 'delay' && 'border-warning/50', n?.kind === 'cancel' && 'border-destructive/40')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted-foreground">{dir === 'morning' ? <Sunrise className="size-4 shrink-0" /> : <Sunset className="size-4 shrink-0" />}{t[dir]}</span>
                    {n?.kind === 'cancel' ? <Badge tone="danger"><XCircle />{t.cancelled}</Badge> : n ? <Badge tone="warning"><Clock3 />{t.delayed(n.minutes)}</Badge> : <Badge tone="success"><Check />{t.scheduled}</Badge>}
                  </div>
                  {trip.time ? (
                    <p className="mt-2 flex flex-wrap items-baseline gap-2" dir="ltr">
                      <span className={cn('text-3xl font-extrabold tabular-nums', (later || n?.kind === 'cancel') && 'text-muted-foreground line-through decoration-2')}>{trip.time}</span>
                      {later && <span className="text-3xl font-extrabold tabular-nums">~{later}</span>}
                    </p>
                  ) : <p className="mt-2 text-sm text-muted-foreground">{t.noTime}</p>}
                  {trip.stop && <p className="mt-1 flex items-center gap-1.5 text-sm"><MapPin className="size-4 shrink-0 text-muted-foreground" />{trip.stop}</p>}
                  {trip.mapLink && /^https?:\/\//i.test(trip.mapLink) && <a href={trip.mapLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-tap items-center text-sm font-semibold text-primary">{t.map}</a>}
                  {later && <p className="mt-2 text-xs text-warning-foreground">{t.expected(later)}</p>}
                </Card>
              );
            })}
          </div>
        </section>

        {notices.map(({ n, dir }, i) => (
          <Alert key={i} tone={n.kind === 'cancel' ? 'danger' : 'warning'} icon={<TriangleAlert />} title={n.kind === 'cancel' ? t.cancelTitle(dir) : t.delayTitle(dir, n.minutes)}>
            {[sentence(n.message), n.at ? t.posted(fmtStamp(n.at, lang, { hour: '2-digit', minute: '2-digit' })) : ''].filter(Boolean).join(' ')}
          </Alert>
        ))}

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t.route}</CardTitle>
            {updated && <span className="text-xs text-muted-foreground">{t.updated(updated)}</span>}
          </CardHeader>
          <CardContent>
            <Tabs defaultSelectedKey={first}>
              <TabList aria-label={t.route}>
                {trips.map((tr) => (
                  <Tab key={tr.direction} id={tr.direction}><span className="flex items-center gap-1.5">{tr.direction === 'morning' ? <Sunrise className="size-4" /> : <Sunset className="size-4" />}{tr.direction === 'morning' ? t.morningTab : t.afternoonTab}</span></Tab>
                ))}
              </TabList>
              {trips.map((tr) => <TabPanel key={tr.direction} id={tr.direction} className="pt-2"><Timeline trip={tr} t={t} /></TabPanel>)}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        {crew.map((tr, i) => (
          <Card key={i}>
            <CardHeader><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.supervisor}</p></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {tr.supervisor ? (
                <div className="flex items-center gap-3">
                  <Avatar name={tr.supervisor} className="size-14 text-lg" />
                  <p className="min-w-0 text-lg font-bold leading-tight">{tr.supervisor}</p>
                </div>
              ) : <p className="text-sm text-muted-foreground">{t.noSupervisor}</p>}
              {tr.supervisorPhone
                ? <a href={`tel:${tr.supervisorPhone.replace(/[^\d+]/g, '')}`} className={cn(buttonVariants({ variant: 'success', size: 'lg' }), 'h-14 w-full text-base')} data-testid="bus-call"><Phone />{t.call}</a>
                : tr.supervisor ? <p className="text-xs text-muted-foreground">{t.noPhone}</p> : null}
              {(tr.driver || tr.busNumber || tr.route) && (
                <>
                  <Separator />
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    {tr.route && <><dt className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-4" />{t.routeName}</dt><dd className="min-w-0 font-semibold">{tr.route}</dd></>}
                    {tr.driver && <><dt className="flex items-center gap-1.5 text-muted-foreground"><UserRound className="size-4" />{t.driver}</dt><dd className="min-w-0 font-semibold">{tr.driver}</dd></>}
                    {tr.busNumber && <><dt className="flex items-center gap-1.5 text-muted-foreground"><BusFront className="size-4" />{t.bus}</dt><dd className="min-w-0 font-semibold">{tr.busNumber}</dd></>}
                  </dl>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        <Alert tone="info" icon={<Info />} title={t.notLive}>{t.notLiveBody}</Alert>
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="text-sm font-semibold">{t.absent(name)}</p>
          <a href="#/parent/chat" className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t.tell}</a>
        </Card>
      </aside>
    </div>
  );
}

function Timeline({ trip, t }: { trip: BusTrip; t: TT }) {
  const stops = (trip.stops ?? []).filter((s) => s?.name);
  if (!stops.length) return <p className="py-3 text-sm text-muted-foreground">{t.noStops}</p>;
  return (
    <ol className="flex flex-col">
      {stops.map((s, i) => {
        const first = i === 0, last = i === stops.length - 1;
        // The school end of the route: first stop in the afternoon, last in the morning (by the route's own order).
        const school = trip.direction === 'afternoon' ? first : last;
        const line = (hide: boolean) => <span aria-hidden className={cn('w-0.5 flex-1', hide ? 'bg-transparent' : 'bg-primary/30')} />;
        return (
          <li key={i} className="flex items-stretch gap-3">
            <div className="flex w-8 shrink-0 flex-col items-center">
              {line(first)}
              <span className={cn('grid shrink-0 place-items-center rounded-full border-2',
                s.mine ? 'size-8 border-accent bg-accent text-accent-foreground shadow' : 'size-3.5 border-primary/60 bg-card')}>
                {s.mine ? <Home className="size-4" /> : null}
              </span>
              {line(last)}
            </div>
            <div className={cn('my-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5', s.mine && 'bg-accent/20 ring-1 ring-accent')}>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', s.mine ? 'font-extrabold' : 'font-semibold')}>{s.name}</p>
                {s.mine && <p className="text-xs font-semibold text-accent-foreground">{t.yourStop}</p>}
                {!s.mine && school && /school|gate|مدرس|بوابة/i.test(s.name ?? '') && <p className="flex items-center gap-1 text-xs text-muted-foreground"><School className="size-3" />{t.school}</p>}
              </div>
              <span dir="ltr" className={cn('tabular-nums', s.mine ? 'text-lg font-extrabold' : 'text-sm text-muted-foreground')}>{s.time ?? '—'}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
