import * as React from 'react';
import { BellRing, Bot, Bus, CalendarCheck, CalendarDays, FilePenLine, Inbox, Info, Link2, Megaphone, Phone, Receipt, RotateCcw, Save, CircleCheck, TriangleAlert, Loader2 } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { errorText, put } from '@/lib/api';
import { Alert, Badge, Button, Card, Radio, RadioGroup, Skeleton, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell } from './SchoolShell';
import { ErrorState, NotYet, SECTIONS, useApi, useScope, type Buses, type Section, type Status } from './data';

type Src = 'excel' | 'excelMoodle' | 'enaraMoodle' | 'enara';
const SRC: Record<Section, Src> = { timetable: 'excel', announcements: 'enaraMoodle', attendance: 'excelMoodle', notifications: 'enara', fees: 'excel', buses: 'excel', requests: 'enara', consents: 'enara', chat: 'enara' };
const ICON: Record<Section, React.ReactNode> = { timetable: <CalendarDays />, announcements: <Megaphone />, attendance: <CalendarCheck />, notifications: <BellRing />, fees: <Receipt />, buses: <Bus />, requests: <Inbox />, consents: <FilePenLine />, chat: <Bot /> };
const CHAT_USES: Section[] = ['timetable', 'announcements', 'attendance', 'fees', 'buses', 'consents'];

const T = {
  en: {
    title: 'Parents app', sub: 'Choose which sections parents see. Turn a section off and it disappears from the app.',
    note: 'Changes reach parents the next time they open the app. Data stays in ENARA when a section is off, so you can turn it back on at any time.',
    on: 'On', off: 'Off', notSite: 'Not available yet', uses: 'Uses data from', needs: 'Needs', source: 'Data comes from',
    name: { timetable: 'Timetable', announcements: 'Announcements', attendance: 'Attendance', notifications: 'Notifications', fees: 'Fees', buses: 'Bus', requests: 'Requests', consents: 'Consent forms', chat: 'Chat assistant' } as Record<Section, string>,
    desc: {
      timetable: 'Each class’s weekly timetable, from the timetable file.',
      announcements: 'School, grade, class and learner announcements.',
      attendance: 'Daily attendance and late arrivals. Absences send an alert to guardians when Notifications is on.',
      notifications: 'In-app alerts for absences, announcements, fee reminders and replies (and email when the parent and school allow it).',
      fees: 'Instalments, amounts due and payment status for each child. ENARA never takes payments.',
      buses: 'Route, stop and times, and the school’s delay or cancel notices for today.',
      requests: 'Parents ask for certificates, early leave or a meeting, and follow the reply.',
      consents: 'Parents sign trip and activity forms in the app.',
      chat: 'Answers parents’ everyday questions in Arabic or English, using only what the school shares in the other sections.',
    } as Record<Section, string>,
    src: { excel: 'Excel import', excelMoodle: 'Excel import or Moodle', enaraMoodle: 'ENARA or Moodle', enara: 'ENARA' } as Record<Src, string>,
    feesWho: 'Who can see fees?', feesAll: 'All linked guardians', feesMain: 'Main guardian only', feesMainD: 'Recommended when parents are separated.',
    busPhones: 'Share bus supervisor phone numbers with parents', busPhonesD: 'Only when the supervisors agreed to share them.',
    chatOff: 'Off sections are not used', chatD: 'The assistant never invents answers. If it does not know, it sends the parent to Requests.',
    unsaved: (n: string) => (n === '1' ? '1 unsaved change' : `${n} unsaved changes`), discard: 'Discard', save: 'Save changes', saved: 'Saved. Parents see the change the next time they open the app.',
  },
  ar: {
    title: 'تطبيق أولياء الأمور', sub: 'اختر الأقسام التي يراها أولياء الأمور. إذا أوقفت قسمًا اختفى من التطبيق.',
    note: 'تصل التغييرات إلى أولياء الأمور عند فتحهم التطبيق في المرة القادمة. تبقى البيانات محفوظة في إنارة عند إيقاف القسم، فيمكنك إعادة تفعيله في أي وقت.',
    on: 'مفعّل', off: 'متوقف', notSite: 'غير متاح بعد', uses: 'يستخدم بيانات', needs: 'يحتاج إلى', source: 'مصدر البيانات',
    name: { timetable: 'الجدول الدراسي', announcements: 'الإعلانات', attendance: 'الحضور', notifications: 'الإشعارات', fees: 'الرسوم', buses: 'الحافلة', requests: 'الطلبات', consents: 'نماذج الموافقة', chat: 'المساعد الذكي' } as Record<Section, string>,
    desc: {
      timetable: 'الجدول الأسبوعي لكل فصل، من ملف الجدول.',
      announcements: 'إعلانات المدرسة والصف والفصل والطالب.',
      attendance: 'الحضور اليومي والتأخر. يُرسَل تنبيه إلى وليّ الأمر عند الغياب إذا كان قسم الإشعارات مفعّلًا.',
      notifications: 'تنبيهات داخل التطبيق للغياب والإعلانات وتذكير الأقساط والردود (وبريد إلكتروني إذا سمح وليّ الأمر والمدرسة).',
      fees: 'الأقساط والمبالغ المستحقة وحالة السداد لكل طالب. لا تستقبل إنارة أي مدفوعات.',
      buses: 'خط السير والمحطة والمواعيد، وإشعارات المدرسة بالتأخير أو الإلغاء لليوم.',
      requests: 'يطلب وليّ الأمر شهادة أو انصرافًا مبكرًا أو لقاءً، ويتابع الرد.',
      consents: 'يوقّع وليّ الأمر نماذج الرحلات والأنشطة من التطبيق.',
      chat: 'يجيب عن أسئلة أولياء الأمور اليومية بالعربية أو الإنجليزية، معتمدًا فقط على ما تشاركه المدرسة في الأقسام الأخرى.',
    } as Record<Section, string>,
    src: { excel: 'استيراد Excel', excelMoodle: 'استيراد Excel أو Moodle', enaraMoodle: 'إنارة أو Moodle', enara: 'إنارة' } as Record<Src, string>,
    feesWho: 'من يمكنه رؤية الرسوم؟', feesAll: 'جميع أولياء الأمور المرتبطين', feesMain: 'وليّ الأمر الرئيسي فقط', feesMainD: 'يُنصح به عند انفصال الوالدين.',
    busPhones: 'مشاركة أرقام هواتف مشرفي الحافلات مع أولياء الأمور', busPhonesD: 'فقط إذا وافق المشرفون على مشاركتها.',
    chatOff: 'لا تُستخدم الأقسام المتوقفة', chatD: 'لا يختلق المساعد إجابات. إذا لم يعرف الإجابة يوجّه وليّ الأمر إلى قسم الطلبات.',
    unsaved: (n: string) => (n === '1' ? 'تغيير واحد غير محفوظ' : n === '2' ? 'تغييران غير محفوظين' : `${n} تغييرات غير محفوظة`), discard: 'تجاهل', save: 'حفظ التغييرات', saved: 'تم الحفظ. يرى أولياء الأمور التغيير عند فتح التطبيق في المرة القادمة.',
  },
};

// Data: GET /api/school-app/status (available, sections, feesVisibleTo), GET /api/school-app/buses (busPhonesShared).
// Writes (only on "Save changes"): PUT /api/school-app/sections (changed keys only), PUT /fees/visibility, PUT /buses/phones.
export default function SchoolSections() {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const status = useApi<Status>(scope.path('/api/school-app/status'));
  const ok = !!status.data?.institutionId;
  const buses = useApi<Buses>(ok ? scope.path('/api/school-app/buses') : null);

  const base = React.useMemo(() => Object.fromEntries(SECTIONS.map((s) => [s, !!status.data?.sections?.[s]])) as Record<Section, boolean>, [status.data]);
  const baseFees: 'all' | 'owner' = status.data?.feesVisibleTo === 'owner' ? 'owner' : 'all';
  const basePhones = typeof buses.data?.busPhonesShared === 'boolean' ? buses.data.busPhonesShared : null;
  const [draft, setDraft] = React.useState<Partial<Record<Section, boolean>>>({});
  const [fees, setFees] = React.useState<'all' | 'owner' | null>(null);
  const [phones, setPhones] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const isOn = (s: Section) => draft[s] ?? base[s];
  const changedSections = SECTIONS.filter((s) => draft[s] !== undefined && draft[s] !== base[s]);
  const feesChanged = fees !== null && fees !== baseFees;
  const phonesChanged = phones !== null && basePhones !== null && phones !== basePhones;
  const dirty = changedSections.length + (feesChanged ? 1 : 0) + (phonesChanged ? 1 : 0);
  const discard = () => { setDraft({}); setFees(null); setPhones(null); setMsg(null); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      let next: Status = { ...(status.data ?? {}) };
      if (changedSections.length) {
        const r = await put<{ sections?: Status['sections'] }>(scope.path('/api/school-app/sections'), scope.body(Object.fromEntries(changedSections.map((s) => [s, !!draft[s]]))));
        next = { ...next, sections: r?.sections ?? { ...next.sections, ...Object.fromEntries(changedSections.map((s) => [s, !!draft[s]])) } };
        status.set(next); setDraft({});
      }
      if (feesChanged && fees) {
        const r = await put<{ feesVisibleTo?: 'all' | 'owner' }>(scope.path('/api/school-app/fees/visibility'), scope.body({ feesVisibleTo: fees }));
        next = { ...next, feesVisibleTo: r?.feesVisibleTo ?? fees };
        status.set(next); setFees(null);
      }
      if (phonesChanged && phones !== null) {
        const r = await put<{ busPhonesShared?: boolean }>(scope.path('/api/school-app/buses/phones'), scope.body({ busPhonesShared: phones }));
        buses.set({ ...(buses.data ?? {}), busPhonesShared: typeof r?.busPhonesShared === 'boolean' ? r.busPhonesShared : phones }); setPhones(null);
      }
      setMsg({ tone: 'success', text: t.saved });
    } catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setBusy(false); }
  };

  return (
    <SchoolShell active="parents" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Alert tone="info" icon={<Info />}>{t.note}</Alert>
        {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : !status.loading && !ok ? <ErrorState error={{ status: 400 }} /> : null}
        {msg && <Alert tone={msg.tone} icon={msg.tone === 'success' ? <CircleCheck /> : <TriangleAlert />}>{msg.text}</Alert>}
        {dirty > 0 && (
          <div className="sticky top-16 z-[5] flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur" data-testid="unsaved-bar">
            <span className="size-2 shrink-0 rounded-full bg-warning" />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-tight">{t.unsaved(num(dirty, lang))}</p>
            <Button variant="ghost" size="sm" isDisabled={busy} onPress={discard}><RotateCcw />{t.discard}</Button>
            <Button size="sm" isDisabled={busy} onPress={() => void save()} data-testid="save">{busy ? <Loader2 className="animate-spin" /> : <Save />}{t.save}</Button>
          </div>
        )}
        {status.loading && !status.data ? (
          <Card className="divide-y" aria-busy="true">{SECTIONS.map((s) => <div key={s} className="flex items-start gap-3 px-4 py-4"><Skeleton className="size-9 shrink-0" /><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div><Skeleton className="h-6 w-11" /></div>)}</Card>
        ) : ok ? (
          <Card className="divide-y">
            {SECTIONS.map((s) => {
              const avail = !!status.data?.available?.[s];
              const on = isOn(s);
              const changed = draft[s] !== undefined && draft[s] !== base[s];
              return (
                <div key={s} className={cn('flex flex-col gap-3 px-4 py-4', changed && 'bg-warning-soft/40')} data-testid={`section-row-${s}`}>
                  <div className="flex items-start gap-3">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]', on ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground')}>{ICON[s]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-sm font-bold">{t.name[s]}</h3>
                        <span className="text-[11px] text-muted-foreground">{t.source}: {t.src[SRC[s]]}</span>
                        {!avail && <Badge tone="warning">{t.notSite}</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t.desc[s]}</p>
                    </div>
                    <Switch isSelected={on} isDisabled={busy || (!avail && !on)} onChange={(v) => { setDraft((d) => ({ ...d, [s]: v })); setMsg(null); }} aria-label={t.name[s]} className="shrink-0">
                      <span className="hidden w-14 text-xs font-semibold text-muted-foreground sm:inline">{on ? t.on : t.off}</span>
                    </Switch>
                  </div>

                  {s === 'fees' && avail && (
                    <div className={cn('rounded-lg border bg-card p-3 sm:ms-12', feesChanged && 'border-warning')}>
                      <RadioGroup aria-label={t.feesWho} value={fees ?? baseFees} onChange={(v) => { setFees(v === 'owner' ? 'owner' : 'all'); setMsg(null); }} isDisabled={busy} className="gap-0">
                        <span className="text-xs font-bold">{t.feesWho}</span>
                        <Radio value="all">{t.feesAll}</Radio>
                        <Radio value="owner"><span>{t.feesMain} <span className="text-xs text-muted-foreground">· {t.feesMainD}</span></span></Radio>
                      </RadioGroup>
                    </div>
                  )}
                  {s === 'buses' && avail && (
                    <div className={cn('flex items-start gap-3 rounded-lg border bg-card p-3 sm:ms-12', phonesChanged && 'border-warning')}>
                      <Phone className="mt-2.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1"><p className="pt-2 text-sm font-semibold">{t.busPhones}</p><p className="text-xs text-muted-foreground">{t.busPhonesD}</p></div>
                      {buses.loading && !buses.data ? <Skeleton className="mt-2 h-6 w-11" /> : basePhones === null ? <NotYet className="pt-2" /> : (
                        <Switch isSelected={phones ?? basePhones} isDisabled={busy} onChange={(v) => { setPhones(v); setMsg(null); }} aria-label={t.busPhones} className="shrink-0" />
                      )}
                    </div>
                  )}
                  {s === 'consents' && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:ms-12"><Link2 className="size-3.5 shrink-0" />{t.needs}: <Badge tone={isOn('notifications') ? 'success' : 'neutral'}>{t.name.notifications} · {isOn('notifications') ? t.on : t.off}</Badge></p>
                  )}
                  {s === 'chat' && (
                    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:ms-12">
                      <p className="flex items-center gap-1.5 text-xs font-bold"><Link2 className="size-3.5" />{t.uses}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {CHAT_USES.map((k) => <Badge key={k} tone={isOn(k) ? 'info' : 'neutral'} className={cn(!isOn(k) && 'line-through')}>{t.name[k]}</Badge>)}
                      </div>
                      <p className="text-xs text-muted-foreground">{t.chatOff}. {t.chatD}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        ) : null}
      </div>
    </SchoolShell>
  );
}
