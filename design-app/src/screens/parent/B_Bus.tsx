import { BusFront, CalendarDays, Check, Clock3, Home, Info, MapPin, MessageCircle, Phone, School, Sunrise, Sunset, TriangleAlert, UserRound } from 'lucide-react';
import { useT, usePreview } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Separator, Tab, TabList, TabPanel, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ParentShell } from './B_common';

type Stop = { time: string; name: { en: string; ar: string }; mine?: boolean; school?: boolean; done?: boolean };
const MORNING: Stop[] = [
  { time: '06:20', name: { en: 'Korba, Baghdad Street', ar: 'الكوربة، شارع بغداد' }, done: true },
  { time: '06:31', name: { en: 'Merghany Street', ar: 'شارع الميرغني' }, done: true },
  { time: '06:42', name: { en: 'Hegaz Square', ar: 'ميدان الحجاز' }, mine: true, done: true },
  { time: '06:50', name: { en: 'Triumph Square', ar: 'ميدان الإسماعيلية' }, done: true },
  { time: '07:04', name: { en: 'Abbas El Akkad Street', ar: 'شارع عباس العقاد' }, done: true },
  { time: '07:25', name: { en: 'NVIS main gate', ar: 'البوابة الرئيسية للمدرسة' }, school: true, done: true },
];
const AFTERNOON: Stop[] = [
  { time: '14:30', name: { en: 'NVIS main gate', ar: 'البوابة الرئيسية للمدرسة' }, school: true },
  { time: '14:48', name: { en: 'Abbas El Akkad Street', ar: 'شارع عباس العقاد' } },
  { time: '15:02', name: { en: 'Triumph Square', ar: 'ميدان الإسماعيلية' } },
  { time: '15:10', name: { en: 'Hegaz Square', ar: 'ميدان الحجاز' }, mine: true },
  { time: '15:20', name: { en: 'Merghany Street', ar: 'شارع الميرغني' } },
  { time: '15:30', name: { en: 'Korba, Baghdad Street', ar: 'الكوربة، شارع بغداد' } },
];

const T = {
  en: {
    title: 'Bus', sub: 'Bus 7 · Heliopolis route', today: 'Today’s trips', todayDate: 'Thursday 26 Nov 2026',
    morning: 'Morning pickup', afternoon: 'Afternoon drop-off', at: 'at', stop: 'Hegaz Square', boarded: 'Laila boarded at 06:44', scheduled: 'Scheduled',
    delayed: 'About 15 minutes late', expected: 'Expect around 15:25',
    delayTitle: 'About 15 minutes late — traffic on the Corniche', delayBody: 'The afternoon bus left school on time but is held up on the Corniche. Posted by the school at 14:20.',
    route: 'Route stops', yourStop: 'Your stop', school: 'School', morningTab: 'Morning', afternoonTab: 'Afternoon',
    supervisor: 'Bus supervisor', supName: 'Ms Hanan Farouk', supRole: 'On board every trip', call: 'Call supervisor', message: 'Message',
    driver: 'Driver', driverName: 'Mr Sayed Mahmoud', bus: 'Bus', busNo: 'Bus 7 · white, school logo', plate: 'Plate', plateNo: 'ق ل ط 4728',
    notLive: 'Times are the school’s timetable, not live tracking.', notLiveBody: 'ENARA does not track the bus. Notices like delays come from the school.',
    absent: 'Laila will not take the bus?', tell: 'Tell the school', timetable: 'Timetable', from: 'Valid from 1 Sep 2026',
  },
  ar: {
    title: 'الحافلة', sub: 'الحافلة 7 · خط مصر الجديدة', today: 'رحلات اليوم', todayDate: 'الخميس 26 نوفمبر 2026',
    morning: 'رحلة الصباح', afternoon: 'رحلة العودة', at: 'في', stop: 'ميدان الحجاز', boarded: 'صعدت ليلى الحافلة الساعة 06:44', scheduled: 'حسب الجدول',
    delayed: 'تأخير نحو 15 دقيقة', expected: 'الوصول المتوقع نحو 15:25',
    delayTitle: 'تأخير نحو 15 دقيقة بسبب الزحام على الكورنيش', delayBody: 'غادرت حافلة العودة المدرسة في موعدها، لكنها متوقفة في زحام الكورنيش. نشرت المدرسة هذا التنبيه الساعة 14:20.',
    route: 'محطات الخط', yourStop: 'محطتك', school: 'المدرسة', morningTab: 'الصباح', afternoonTab: 'العودة',
    supervisor: 'مشرفة الحافلة', supName: 'أ. حنان فاروق', supRole: 'موجودة في كل رحلة', call: 'الاتصال بالمشرفة', message: 'مراسلة',
    driver: 'السائق', driverName: 'أ. سيد محمود', bus: 'الحافلة', busNo: 'الحافلة 7 · بيضاء وعليها شعار المدرسة', plate: 'اللوحة', plateNo: 'ق ل ط 4728',
    notLive: 'المواعيد هي جدول المدرسة، وليست تتبعًا مباشرًا.', notLiveBody: 'لا تتتبع إنارة موقع الحافلة. تنبيهات التأخير تأتي من المدرسة.',
    absent: 'لن تركب ليلى الحافلة؟', tell: 'أبلغ المدرسة', timetable: 'الجدول', from: 'ساري من 1 سبتمبر 2026',
  },
};

function Timeline({ stops }: { stops: Stop[] }) {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <ol className="flex flex-col">
      {stops.map((s, i) => {
        const first = i === 0, last = i === stops.length - 1;
        const line = (hide: boolean, done?: boolean) => <span aria-hidden className={cn('w-0.5 flex-1', hide ? 'bg-transparent' : done ? 'bg-primary/60' : 'bg-primary/20')} />;
        return (
          <li key={i} className="flex items-stretch gap-3">
            <div className="flex w-8 shrink-0 flex-col items-center">
              {line(first, s.done)}
              <span className={cn('grid shrink-0 place-items-center rounded-full border-2',
                s.mine ? 'size-8 border-accent bg-accent text-accent-foreground shadow' : s.school ? 'size-7 border-primary bg-primary text-primary-foreground' : s.done ? 'size-3.5 border-primary bg-primary' : 'size-3.5 border-primary/50 bg-card')}>
                {s.mine ? <Home className="size-4" /> : s.school ? <School className="size-3.5" /> : null}
              </span>
              {line(last, s.done && stops[i + 1]?.done)}
            </div>
            <div className={cn('my-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5', s.mine && 'bg-accent/20 ring-1 ring-accent')}>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', s.mine ? 'font-extrabold' : 'font-semibold')}>{s.name[lang]}</p>
                {s.mine && <p className="text-xs font-semibold text-accent-foreground">{t.yourStop}</p>}
                {s.school && <p className="text-xs text-muted-foreground">{t.school}</p>}
              </div>
              <span className={cn('tabular-nums', s.mine ? 'text-lg font-extrabold' : 'text-sm text-muted-foreground')}>{s.time}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function BusScreen() {
  const t = useT(T);
  return (
    <ParentShell title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChildChip />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-4" />{t.todayDate}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section>
              <SectionTitle>{t.today}</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted-foreground"><Sunrise className="size-4 shrink-0" />{t.morning}</span>
                    <Badge tone="success"><Check />{t.scheduled}</Badge>
                  </div>
                  <p className="mt-2 text-3xl font-extrabold tabular-nums">06:42</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm"><MapPin className="size-4 text-muted-foreground" />{t.stop}</p>
                  <p className="mt-2 text-xs text-success">{t.boarded}</p>
                </Card>
                <Card className="border-warning/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted-foreground"><Sunset className="size-4 shrink-0" />{t.afternoon}</span>
                    <Badge tone="warning"><Clock3 />{t.delayed}</Badge>
                  </div>
                  <p className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-extrabold tabular-nums text-muted-foreground line-through decoration-2">15:10</span><span dir="ltr" className="text-3xl font-extrabold tabular-nums">~15:25</span></p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm"><MapPin className="size-4 text-muted-foreground" />{t.stop}</p>
                  <p className="mt-2 text-xs text-warning-foreground">{t.expected}</p>
                </Card>
              </div>
            </section>

            <Alert tone="warning" icon={<TriangleAlert />} title={t.delayTitle}>{t.delayBody}</Alert>

            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{t.route}</CardTitle>
                <span className="text-xs text-muted-foreground">{t.timetable} · {t.from}</span>
              </CardHeader>
              <CardContent>
                <Tabs defaultSelectedKey="afternoon">
                  <TabList aria-label={t.route}>
                    <Tab id="morning"><span className="flex items-center gap-1.5"><Sunrise className="size-4" />{t.morningTab}</span></Tab>
                    <Tab id="afternoon"><span className="flex items-center gap-1.5"><Sunset className="size-4" />{t.afternoonTab}</span></Tab>
                  </TabList>
                  <TabPanel id="morning" className="pt-2"><Timeline stops={MORNING} /></TabPanel>
                  <TabPanel id="afternoon" className="pt-2"><Timeline stops={AFTERNOON} /></TabPanel>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.supervisor}</p></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={t.supName.replace(/^(Ms|أ\.)\s/, '')} className="size-14 text-lg" />
                  <div className="min-w-0"><p className="text-lg font-bold leading-tight">{t.supName}</p><p className="text-sm text-muted-foreground">{t.supRole}</p></div>
                </div>
                <Button size="lg" variant="success" className="h-14 w-full text-base"><Phone />{t.call}</Button>
                <Button variant="outline" className="w-full"><MessageCircle />{t.message}</Button>
                <Separator />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><UserRound className="size-4" />{t.driver}</dt><dd className="font-semibold">{t.driverName}</dd>
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><BusFront className="size-4" />{t.bus}</dt><dd className="font-semibold">{t.busNo}</dd>
                  <dt className="ps-5.5 text-muted-foreground">{t.plate}</dt><dd className="font-semibold"><span dir="rtl" lang="ar">{t.plateNo}</span></dd>
                </dl>
              </CardContent>
            </Card>
            <Alert tone="info" icon={<Info />} title={t.notLive}>{t.notLiveBody}</Alert>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
              <p className="text-sm font-semibold">{t.absent}</p>
              <Button variant="outline" size="sm">{t.tell}</Button>
            </Card>
          </aside>
        </div>
      </div>
    </ParentShell>
  );
}
