import { BellRing, Bot, Bus, CalendarCheck, CalendarDays, FilePenLine, Inbox, Info, Link2, Megaphone, Phone, Receipt, RotateCcw, Save } from 'lucide-react';
import { useT } from '@/lib/preview';
import { Alert, Badge, Button, Card, Radio, RadioGroup, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell } from './SchoolShell';

type Key = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees' | 'bus' | 'requests' | 'consent' | 'chat';

const T = {
  en: {
    title: 'Parents app', sub: 'Choose which sections parents see. Turn a section off and it disappears from the app.',
    note: 'Changes reach parents the next time they open the app. Data stays in ENARA when a section is off, so you can turn it back on at any time.',
    on: 'On', off: 'Off', uses: 'Uses data from', needs: 'Needs', source: 'Data comes from',
    name: { timetable: 'Timetable', announcements: 'Announcements', attendance: 'Attendance', notifications: 'Notifications', fees: 'Fees', bus: 'Bus', requests: 'Requests', consent: 'Consent forms', chat: 'Chat assistant' } as Record<Key, string>,
    desc: {
      timetable: 'Each child’s weekly timetable, with room changes and cover lessons.',
      announcements: 'School, grade and class announcements in Arabic and English.',
      attendance: 'Daily attendance and late arrivals. Absences send an alert to guardians.',
      notifications: 'Push and email alerts for absences, announcements, fees and replies.',
      fees: 'Instalments, amounts due and payment status for each child.',
      bus: 'Route, stop, pick-up times and the bus supervisor.',
      requests: 'Parents ask for certificates, early leave or a meeting, and follow the reply.',
      consent: 'Parents sign trip and activity forms in the app.',
      chat: 'Answers parents’ everyday questions in Arabic or English, using only what the school shares in the other sections.',
    } as Record<Key, string>,
    srcExcel: 'Excel import', srcMoodle: 'Moodle connector', srcEnara: 'ENARA',
    feesWho: 'Who can see fees?', feesAll: 'All linked guardians', feesMain: 'Main guardian only', feesMainD: 'Recommended when parents are separated.',
    busPhones: 'Share bus supervisor phone numbers with parents', busPhonesD: 'Parents can call the supervisor during the morning and afternoon trip only.',
    consentNeeds: 'Turning this on also needs Notifications, so parents know a form is waiting.',
    chatOff: 'Off sections are not used', chatD: 'The assistant never invents answers. If it does not know, it sends the parent to Requests.',
    unsaved: '2 unsaved changes', discard: 'Discard', save: 'Save changes',
  },
  ar: {
    title: 'تطبيق أولياء الأمور', sub: 'اختر الأقسام التي يراها أولياء الأمور. إذا أوقفت قسمًا اختفى من التطبيق.',
    note: 'تصل التغييرات إلى أولياء الأمور عند فتحهم التطبيق في المرة القادمة. تبقى البيانات محفوظة في إنارة عند إيقاف القسم، فيمكنك إعادة تفعيله في أي وقت.',
    on: 'مفعّل', off: 'متوقف', uses: 'يستخدم بيانات', needs: 'يحتاج إلى', source: 'مصدر البيانات',
    name: { timetable: 'الجدول الدراسي', announcements: 'الإعلانات', attendance: 'الحضور', notifications: 'الإشعارات', fees: 'الرسوم', bus: 'الحافلة', requests: 'الطلبات', consent: 'نماذج الموافقة', chat: 'المساعد الذكي' } as Record<Key, string>,
    desc: {
      timetable: 'الجدول الأسبوعي لكل طالب، مع تغييرات القاعات والحصص البديلة.',
      announcements: 'إعلانات المدرسة والصف والفصل بالعربية والإنجليزية.',
      attendance: 'الحضور اليومي والتأخر. يُرسَل تنبيه إلى وليّ الأمر عند الغياب.',
      notifications: 'تنبيهات فورية وبريد إلكتروني للغياب والإعلانات والرسوم والردود.',
      fees: 'الأقساط والمبالغ المستحقة وحالة السداد لكل طالب.',
      bus: 'خط السير والمحطة ومواعيد الصعود ومشرف الحافلة.',
      requests: 'يطلب وليّ الأمر شهادة أو انصرافًا مبكرًا أو لقاءً، ويتابع الرد.',
      consent: 'يوقّع وليّ الأمر نماذج الرحلات والأنشطة من التطبيق.',
      chat: 'يجيب عن أسئلة أولياء الأمور اليومية بالعربية أو الإنجليزية، معتمدًا فقط على ما تشاركه المدرسة في الأقسام الأخرى.',
    } as Record<Key, string>,
    srcExcel: 'استيراد Excel', srcMoodle: 'موصل Moodle', srcEnara: 'إنارة',
    feesWho: 'من يمكنه رؤية الرسوم؟', feesAll: 'جميع أولياء الأمور المرتبطين', feesMain: 'وليّ الأمر الرئيسي فقط', feesMainD: 'يُنصح به عند انفصال الوالدين.',
    busPhones: 'مشاركة أرقام هواتف مشرفي الحافلات مع أولياء الأمور', busPhonesD: 'يمكن لوليّ الأمر الاتصال بالمشرف أثناء رحلتي الصباح والظهيرة فقط.',
    consentNeeds: 'يحتاج تفعيل هذا القسم أيضًا إلى قسم الإشعارات، ليعرف وليّ الأمر أن نموذجًا بانتظاره.',
    chatOff: 'لا تُستخدم الأقسام المتوقفة', chatD: 'لا يختلق المساعد إجابات. إذا لم يعرف الإجابة يوجّه وليّ الأمر إلى قسم الطلبات.',
    unsaved: 'تغييران غير محفوظين', discard: 'تجاهل', save: 'حفظ التغييرات',
  },
};

const ROWS: { key: Key; icon: React.ReactNode; on: boolean; src: 'excel' | 'moodle' | 'enara'; changed?: boolean }[] = [
  { key: 'timetable', icon: <CalendarDays />, on: true, src: 'moodle' },
  { key: 'announcements', icon: <Megaphone />, on: true, src: 'enara' },
  { key: 'attendance', icon: <CalendarCheck />, on: true, src: 'excel' },
  { key: 'notifications', icon: <BellRing />, on: true, src: 'enara' },
  { key: 'fees', icon: <Receipt />, on: true, src: 'excel', changed: true },
  { key: 'bus', icon: <Bus />, on: true, src: 'excel', changed: true },
  { key: 'requests', icon: <Inbox />, on: true, src: 'enara' },
  { key: 'consent', icon: <FilePenLine />, on: false, src: 'enara' },
  { key: 'chat', icon: <Bot />, on: true, src: 'enara' },
];
const CHAT_USES: Key[] = ['timetable', 'announcements', 'attendance', 'fees', 'bus', 'consent'];

export default function SchoolSections() {
  const t = useT(T);
  const srcName = { excel: t.srcExcel, moodle: t.srcMoodle, enara: t.srcEnara };
  const isOn = (k: Key) => ROWS.find((r) => r.key === k)!.on;
  return (
    <SchoolShell active="parents" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Alert tone="info" icon={<Info />}>{t.note}</Alert>
        <div className="sticky top-16 z-[5] flex items-center gap-2 rounded-xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <span className="size-2 shrink-0 rounded-full bg-warning" />
          <p className="min-w-0 flex-1 text-sm font-semibold leading-tight">{t.unsaved}</p>
          <Button variant="ghost" size="sm"><RotateCcw />{t.discard}</Button>
          <Button size="sm"><Save />{t.save}</Button>
        </div>
        <Card className="divide-y">
          {ROWS.map((r) => (
            <div key={r.key} className={cn('flex flex-col gap-3 px-4 py-4', r.changed && 'bg-warning-soft/40')}>
              <div className="flex items-start gap-3">
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]', r.on ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground')}>{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-bold">{t.name[r.key]}</h3>
                    <span className="text-[11px] text-muted-foreground">{t.source}: {srcName[r.src]}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.desc[r.key]}</p>
                </div>
                <Switch defaultSelected={r.on} aria-label={t.name[r.key]} className="shrink-0">
                  <span className="hidden w-14 text-xs font-semibold text-muted-foreground sm:inline">{r.on ? t.on : t.off}</span>
                </Switch>
              </div>

              {r.key === 'fees' && (
                <div className="sm:ms-12 rounded-lg border bg-card p-3">
                  <RadioGroup aria-label={t.feesWho} defaultValue="main" className="gap-0">
                    <span className="text-xs font-bold">{t.feesWho}</span>
                    <Radio value="all">{t.feesAll}</Radio>
                    <Radio value="main"><span>{t.feesMain} <span className="text-xs text-muted-foreground">· {t.feesMainD}</span></span></Radio>
                  </RadioGroup>
                </div>
              )}
              {r.key === 'bus' && (
                <div className="sm:ms-12 flex items-start gap-3 rounded-lg border bg-card p-3">
                  <Phone className="mt-2.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="pt-2 text-sm font-semibold">{t.busPhones}</p><p className="text-xs text-muted-foreground">{t.busPhonesD}</p></div>
                  <Switch defaultSelected aria-label={t.busPhones} className="shrink-0" />
                </div>
              )}
              {r.key === 'consent' && (
                <p className="sm:ms-12 flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="size-3.5 shrink-0" />{t.needs}: <Badge tone="success">{t.name.notifications} · {t.on}</Badge></p>
              )}
              {r.key === 'chat' && (
                <div className="sm:ms-12 flex flex-col gap-2 rounded-lg border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold"><Link2 className="size-3.5" />{t.uses}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CHAT_USES.map((k) => <Badge key={k} tone={isOn(k) ? 'info' : 'neutral'} className={cn(!isOn(k) && 'line-through')}>{t.name[k]}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.chatOff}. {t.chatD}</p>
                </div>
              )}
            </div>
          ))}
        </Card>
      </div>
    </SchoolShell>
  );
}
