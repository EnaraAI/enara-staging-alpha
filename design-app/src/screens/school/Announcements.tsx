import * as React from 'react';
import { CalendarClock, CalendarX2, Eye, Megaphone, Send, Users, Undo2, Smartphone, School, Info, TriangleAlert, CircleCheck, Loader2, Ban } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { errorText, post } from '@/lib/api';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Radio, RadioGroup, Select, Skeleton, Tab, TabList, Tabs, inputClass } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell, ROUTE } from './SchoolShell';
import { EmptyState, ErrorState, ListSkeleton, cairoToday, fmtDate, isDate, rosterStudents, useApi, useParentsSchool, useScope, type Ann, type Roster, type Status } from './data';

type Aud = 'school' | 'grade' | 'group' | 'student';
type State = 'pub' | 'sch' | 'exp' | 'wd';

const T = {
  en: {
    title: 'Announcements', sub: 'Parents see announcements in the app.', newAnn: 'New announcement',
    compose: 'New announcement', composeD: 'Parents see it in the app on the publish date.',
    audience: 'Who should see it?', aSchool: 'Whole school', aGrade: 'A grade', aClass: 'A class', aLearner: 'One learner',
    grade: 'Grade', klass: 'Class', learner: 'Learner ID', learnerPh: 'The learner’s ENARA ID', learnerFound: (n: string) => `Learner: ${n}`, learnerMissing: 'No learner with this ID in your school.',
    noGrades: 'No grades in your class list yet.', noClasses: 'No classes in your school yet.', pick: 'Choose…',
    reach: (n: string) => `${n} learners`, guardians: 'Guardian count: not available yet',
    tTitle: 'Title', tBody: 'Message', bilingual: 'Separate Arabic and English versions are not available yet. Parents see the text exactly as you write it; you can write both languages in the message.',
    publish: 'Publish on', publishHint: 'Empty: publish now', expiry: 'Hide after', expiryHint: 'Empty: keep showing',
    nOn: 'Parents get a notification when it is published now.', nSched: 'A scheduled announcement appears on its date without a notification.', nOff: 'Notifications are off for your school: parents see it in the app without a notification.',
    secOff: 'The Announcements section is off for your school. Turn it on in Parents app to publish.', turnOn: 'Open Parents app',
    publishNow: 'Publish', schedule: 'Schedule', need: 'Write a title and a message.', needValue: 'Choose who should see it.', badDates: 'The hide-after date must be on or after the publish date.',
    sure: (n: string) => `Publish to the parents of ${n} learners?`, sureSched: (n: string, d: string) => `Schedule for the parents of ${n} learners on ${d}?`, sureD: 'Parents see it in the app. You can withdraw it later, but notifications already sent stay sent.', yes: 'Yes, publish', yesSched: 'Yes, schedule', back: 'Back',
    published: 'Published.', scheduled: 'Scheduled.',
    preview: 'How parents see it', previewD: 'Parent app', when: (d: string) => d, now: 'Now', phTitle: 'Your title', phBody: 'Your message appears here.',
    list: 'All announcements', all: 'All', tPub: 'Published', tSch: 'Scheduled', tExp: 'Expired', tWd: 'Withdrawn',
    withdraw: 'Withdraw', withdrawSure: 'Withdraw?', withdrawYes: 'Yes, withdraw', withdrawn: 'Withdrawn', from: 'from', moodle: 'Moodle', none: 'No announcements here', noneD: 'Announcements you publish, and those that come from Moodle, show here.',
    readNA: 'Read rate: not available yet',
  },
  ar: {
    title: 'الإعلانات', sub: 'يرى أولياء الأمور الإعلانات في التطبيق.', newAnn: 'إعلان جديد',
    compose: 'إعلان جديد', composeD: 'يظهر لأولياء الأمور في التطبيق في تاريخ النشر.',
    audience: 'لمن يظهر الإعلان؟', aSchool: 'المدرسة كلها', aGrade: 'صف دراسي', aClass: 'فصل', aLearner: 'طالب واحد',
    grade: 'الصف', klass: 'الفصل', learner: 'رقم الطالب', learnerPh: 'رقم الطالب في إنارة', learnerFound: (n: string) => `الطالب: ${n}`, learnerMissing: 'لا يوجد طالب بهذا الرقم في مدرستك.',
    noGrades: 'لا توجد صفوف في قائمة الفصول بعد.', noClasses: 'لا توجد فصول في مدرستك بعد.', pick: 'اختر…',
    reach: (n: string) => `${n} طالبًا`, guardians: 'عدد أولياء الأمور: غير متاح بعد',
    tTitle: 'العنوان', tBody: 'نص الرسالة', bilingual: 'نسختا العربية والإنجليزية المنفصلتان غير متاحتين بعد. يرى وليّ الأمر النص كما تكتبه تمامًا، ويمكنك كتابة اللغتين في الرسالة.',
    publish: 'تاريخ النشر', publishHint: 'فارغ: النشر الآن', expiry: 'الإخفاء بعد', expiryHint: 'فارغ: يبقى ظاهرًا',
    nOn: 'يصل إشعار إلى أولياء الأمور عند النشر الآن.', nSched: 'يظهر الإعلان المجدول في تاريخه دون إشعار.', nOff: 'الإشعارات متوقفة في مدرستك: يرى أولياء الأمور الإعلان في التطبيق دون إشعار.',
    secOff: 'قسم الإعلانات متوقف في مدرستك. فعّله من صفحة تطبيق أولياء الأمور لتتمكن من النشر.', turnOn: 'فتح تطبيق أولياء الأمور',
    publishNow: 'نشر', schedule: 'جدولة', need: 'اكتب العنوان ونص الرسالة.', needValue: 'حدّد لمن يظهر الإعلان.', badDates: 'يجب أن يكون تاريخ الإخفاء في يوم النشر أو بعده.',
    sure: (n: string) => `هل تريد النشر لأولياء أمور ${n} طالبًا؟`, sureSched: (n: string, d: string) => `هل تريد الجدولة لأولياء أمور ${n} طالبًا في ${d}؟`, sureD: 'يرى أولياء الأمور الإعلان في التطبيق. يمكنك سحبه لاحقًا، لكن الإشعارات المرسلة لا تُسترجع.', yes: 'نعم، انشر', yesSched: 'نعم، جدوِل', back: 'رجوع',
    published: 'تم النشر.', scheduled: 'تمت الجدولة.',
    preview: 'كيف يراه وليّ الأمر', previewD: 'تطبيق أولياء الأمور', when: (d: string) => d, now: 'الآن', phTitle: 'عنوان الإعلان', phBody: 'يظهر نص رسالتك هنا.',
    list: 'جميع الإعلانات', all: 'الكل', tPub: 'منشورة', tSch: 'مجدولة', tExp: 'منتهية', tWd: 'مسحوبة',
    withdraw: 'سحب', withdrawSure: 'سحب الإعلان؟', withdrawYes: 'نعم، اسحب', withdrawn: 'مسحوب', from: 'من', moodle: 'Moodle', none: 'لا إعلانات هنا', noneD: 'تظهر هنا الإعلانات التي تنشرها والإعلانات الواردة من Moodle.',
    readNA: 'نسبة القراءة: غير متاحة بعد',
  },
};

const stateOf = (a: Ann, now = Date.now()): State => (a?.withdrawn ? 'wd' : isDate(a?.publishAt) && new Date(a.publishAt).getTime() > now ? 'sch' : isDate(a?.expiresAt) && new Date(a.expiresAt).getTime() < now ? 'exp' : 'pub');
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Data: GET /api/school-app/status, /roster, /announcements. Writes (only after "Yes, publish"): POST /api/school-app/announcements
// { audience, audienceValue, title, body, publish, expires } (dates YYYY-MM-DD); POST /announcements/:id/withdraw (after "Yes, withdraw").
export default function SchoolAnnouncements() {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const nb = (n: number) => num(n, lang);
  const status = useApi<Status>(scope.path('/api/school-app/status'));
  const ok = !!status.data?.institutionId;
  const roster = useApi<Roster>(ok ? scope.path('/api/school-app/roster') : null);
  const list = useApi<{ announcements?: Ann[] }>(ok ? scope.path('/api/school-app/announcements') : null);
  const school = useParentsSchool().school;

  const [aud, setAud] = React.useState<Aud>('school');
  const [value, setValue] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [publish, setPublish] = React.useState('');
  const [expires, setExpires] = React.useState('');
  const [sure, setSure] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [tab, setTab] = React.useState<'all' | State>('all');
  const [askWd, setAskWd] = React.useState<string | null>(null);
  const [wdBusy, setWdBusy] = React.useState<string | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  const sectionOn = !!status.data?.sections?.announcements;
  const notifyOn = !!status.data?.sections?.notifications;
  const students = rosterStudents(roster.data);
  const grades = [...new Set(students.map((s) => s?.grade).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const classes = (roster.data?.groups ?? []).map((g) => g?.name).filter((n): n is string => !!n);
  const learner = aud === 'student' && value.trim() ? students.find((s) => norm(s?.id) === norm(value)) : undefined;
  const reach = aud === 'school' ? students.length : aud === 'grade' ? students.filter((s) => value && norm(s?.grade) === norm(value)).length
    : aud === 'group' ? (roster.data?.groups ?? []).find((g) => g?.name === value)?.students?.length ?? 0 : learner ? 1 : 0;
  const today = cairoToday();
  const scheduled = !!publish && publish > today;
  const audLabel = (a: Ann | { audience?: string; audienceValue?: string | null }) => {
    const v = a?.audienceValue ?? '';
    if (a?.audience === 'school') return t.aSchool;
    if (a?.audience === 'grade') return `${t.grade} ${v}`;
    if (a?.audience === 'group') return `${t.klass} ${v}`;
    if (a?.audience === 'student') return students.find((s) => s?.id === v)?.name || v;
    return v || String(a?.audience ?? '');
  };

  const ask = () => {
    setMsg(null);
    if (!title.trim() || !body.trim()) { setMsg({ tone: 'danger', text: t.need }); return; }
    if (aud !== 'school' && !value.trim()) { setMsg({ tone: 'danger', text: t.needValue }); return; }
    if (publish && expires && expires < publish) { setMsg({ tone: 'danger', text: t.badDates }); return; }
    setSure(true);
  };
  const send = async () => {
    setBusy(true);
    try {
      await post(scope.path('/api/school-app/announcements'), scope.body({ audience: aud, audienceValue: aud === 'school' ? '' : value.trim(), title: title.trim(), body: body.trim(), publish, expires }));
      setMsg({ tone: 'success', text: scheduled ? t.scheduled : t.published });
      setTitle(''); setBody(''); setPublish(''); setExpires(''); setSure(false);
      list.reload();
    } catch (e) { setSure(false); setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setBusy(false); }
  };
  const withdraw = async (id: string) => {
    setWdBusy(id);
    try { await post(scope.path(`/api/school-app/announcements/${encodeURIComponent(id)}/withdraw`), {}); list.reload(); }
    catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setWdBusy(null); setAskWd(null); }
  };

  const items = (list.data?.announcements ?? []).map((a) => ({ a, s: stateOf(a) }));
  const counts = { pub: 0, sch: 0, exp: 0, wd: 0 } as Record<State, number>;
  for (const x of items) counts[x.s]++;
  const shown = tab === 'all' ? items : items.filter((x) => x.s === tab);
  const dates = (a: Ann) => `${fmtDate(a?.publishAt, lang)}${isDate(a?.expiresAt) ? ` – ${fmtDate(a.expiresAt, lang)}` : ''}`;
  const field = 'flex flex-col gap-1.5';

  return (
    <SchoolShell active="announcements" title={t.title} subtitle={t.sub}
      actions={<Button size="sm" aria-label={t.newAnn} isDisabled={!sectionOn} onPress={() => titleRef.current?.focus()}><Megaphone /><span className="hidden sm:inline">{t.newAnn}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : !status.loading && !ok ? <ErrorState error={{ status: 400 }} /> : null}

        {status.loading && !status.data ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><Skeleton className="h-[480px] w-full" /><Skeleton className="hidden h-[480px] w-full lg:block" /></div>
        ) : ok ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="min-w-0">
              <CardHeader><CardTitle>{t.compose}</CardTitle><CardDescription>{t.composeD}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-5">
                {!sectionOn && <Alert tone="warning" icon={<TriangleAlert />}>{t.secOff} <a className="font-semibold text-primary underline underline-offset-2" href={scope.href(ROUTE.parents)}>{t.turnOn}</a></Alert>}
                <fieldset disabled={!sectionOn || busy} className="flex min-w-0 flex-col gap-5 disabled:opacity-60">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-semibold">{t.audience}</span>
                    <RadioGroup aria-label={t.audience} value={aud} onChange={(v) => { setAud(v as Aud); setValue(''); setSure(false); }} isDisabled={!sectionOn || busy} orientation="horizontal" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {([['school', t.aSchool], ['grade', t.aGrade], ['group', t.aClass], ['student', t.aLearner]] as const).map(([v, l]) => (
                        <Radio key={v} value={v} className="rounded-lg border px-3 data-[selected]:border-primary data-[selected]:bg-secondary">{l}</Radio>
                      ))}
                    </RadioGroup>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      {aud === 'grade' && (grades.length ? <Select aria-label={t.grade} label={t.grade} placeholder={t.pick} items={grades.map((g) => ({ id: g, name: g }))} selectedKey={value || null} onSelectionChange={(k) => { setValue(k ? String(k) : ''); setSure(false); }} className="sm:w-56" /> : <p className="text-xs text-muted-foreground">{roster.loading ? '…' : t.noGrades}</p>)}
                      {aud === 'group' && (classes.length ? <Select aria-label={t.klass} label={t.klass} placeholder={t.pick} items={classes.map((c) => ({ id: c, name: c }))} selectedKey={value || null} onSelectionChange={(k) => { setValue(k ? String(k) : ''); setSure(false); }} className="sm:w-56" /> : <p className="text-xs text-muted-foreground">{roster.loading ? '…' : t.noClasses}</p>)}
                      {aud === 'student' && (
                        <label className={cn(field, 'sm:w-56')}>
                          <span className="text-sm font-semibold">{t.learner}</span>
                          <input className={inputClass} dir="ltr" value={value} placeholder={t.learnerPh} onChange={(e) => { setValue(e.target.value); setSure(false); }} />
                        </label>
                      )}
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 pb-2 text-xs text-muted-foreground"><Users className="size-3.5" />{roster.loading && !roster.data ? '…' : t.reach(nb(reach))}<span className="opacity-80">· {t.guardians}</span></span>
                    </div>
                    {aud === 'student' && value.trim() && roster.data && <p className={cn('text-xs', learner ? 'text-muted-foreground' : 'text-destructive')}>{learner ? t.learnerFound(learner.name ?? learner.id ?? '') : t.learnerMissing}</p>}
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border p-3">
                    <label className={field}><span className="text-sm font-semibold">{t.tTitle}</span><input ref={titleRef} className={inputClass} dir="auto" maxLength={160} value={title} onChange={(e) => { setTitle(e.target.value); setSure(false); }} data-testid="ann-title" /></label>
                    <label className={field}><span className="text-sm font-semibold">{t.tBody}</span><textarea className={cn(inputClass, 'h-36 py-2')} dir="auto" maxLength={4000} value={body} onChange={(e) => { setBody(e.target.value); setSure(false); }} data-testid="ann-body" /></label>
                    <p className="flex gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{t.bilingual}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={field}><span className="text-sm font-semibold">{t.publish}</span><input type="date" className={inputClass} min={today} value={publish} onChange={(e) => { setPublish(e.target.value); setSure(false); }} /><span className="text-xs text-muted-foreground">{t.publishHint}</span></label>
                    <label className={field}><span className="text-sm font-semibold">{t.expiry}</span><input type="date" className={inputClass} min={publish || today} value={expires} onChange={(e) => { setExpires(e.target.value); setSure(false); }} /><span className="text-xs text-muted-foreground">{t.expiryHint}</span></label>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5 shrink-0" />{!notifyOn ? t.nOff : scheduled ? t.nSched : t.nOn}</p>
                </fieldset>

                {msg && <Alert tone={msg.tone} icon={msg.tone === 'success' ? <CircleCheck /> : <TriangleAlert />}>{msg.text}</Alert>}
                {sure ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-primary bg-secondary p-3" role="alertdialog" aria-label={scheduled ? t.sureSched(nb(reach), fmtDate(publish, lang, true)) : t.sure(nb(reach))} data-testid="publish-confirm">
                    <div><p className="text-sm font-bold">{scheduled ? t.sureSched(nb(reach), fmtDate(publish, lang, true)) : t.sure(nb(reach))}</p><p className="text-xs text-muted-foreground">{t.sureD}</p></div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" isDisabled={busy} onPress={() => setSure(false)}>{t.back}</Button>
                      <Button isDisabled={busy} onPress={() => void send()} data-testid="publish-yes">{busy ? <Loader2 className="animate-spin" /> : scheduled ? <CalendarClock /> : <Send className="rtl:-scale-x-100" />}{scheduled ? t.yesSched : t.yes}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button isDisabled={!sectionOn || busy} onPress={ask} data-testid="publish">{scheduled ? <CalendarClock /> : <Send className="rtl:-scale-x-100" />}{scheduled ? t.schedule : t.publishNow}</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex min-w-0 flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Eye className="size-4" />{t.preview}</p>
              <p className="text-xs text-muted-foreground">{t.previewD}</p>
              <div className="mx-auto mt-1 w-full max-w-[300px] rounded-[2rem] border-[6px] border-foreground/85 bg-background p-3 shadow-lg">
                <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/20" />
                <div className="flex items-center gap-2 px-1 pb-2"><Smartphone className="size-4 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground">{t.title}</span></div>
                <div className="rounded-2xl bg-card p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><School className="size-4" /></span>
                    <div className="min-w-0"><p className="truncate text-xs font-bold">{[school?.name, aud !== 'school' && value ? audLabel({ audience: aud, audienceValue: value }) : aud === 'school' ? t.aSchool : ''].filter(Boolean).join(' · ')}</p><p className="text-[11px] text-muted-foreground">{publish ? fmtDate(publish, lang, true) : t.now}</p></div>
                  </div>
                  <p className={cn('mb-1.5 break-words text-[15px] font-bold leading-snug', !title && 'text-muted-foreground')} dir="auto">{title || t.phTitle}</p>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground" dir="auto">{body || t.phBody}</p>
                </div>
                <div className="mt-2 h-12 rounded-2xl bg-card/60" />
              </div>
            </div>
          </div>
        ) : null}

        <section>
          <SectionTitle>{t.list}</SectionTitle>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k) as 'all' | State)}>
            <TabList aria-label={t.list} className="max-w-full overflow-x-auto">
              <Tab id="all">{t.all}</Tab>
              <Tab id="pub">{t.tPub} <span className="text-muted-foreground tabular-nums">{nb(counts.pub)}</span></Tab>
              <Tab id="sch">{t.tSch} <span className="text-muted-foreground tabular-nums">{nb(counts.sch)}</span></Tab>
              <Tab id="exp">{t.tExp} <span className="text-muted-foreground tabular-nums">{nb(counts.exp)}</span></Tab>
              <Tab id="wd">{t.tWd} <span className="text-muted-foreground tabular-nums">{nb(counts.wd)}</span></Tab>
            </TabList>
          </Tabs>
          {(status.loading || list.loading) && !list.data ? <ListSkeleton rows={4} className="mt-3" /> : list.error ? <ErrorState className="mt-3" error={list.error} onRetry={list.reload} /> : !ok ? null : shown.length === 0 ? (
            <Card className="mt-3"><EmptyState icon={<Megaphone />} title={t.none}>{t.noneD}</EmptyState></Card>
          ) : (
            <Card className="mt-3 divide-y">
              {shown.map(({ a, s }, i) => {
                const id = a?.id;
                return (
                  <div key={id ?? i} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4" data-testid="ann-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={s === 'pub' ? 'success' : s === 'sch' ? 'info' : 'neutral'}>{s === 'pub' ? <Send className="rtl:-scale-x-100" /> : s === 'sch' ? <CalendarClock /> : s === 'exp' ? <CalendarX2 /> : <Ban />}{s === 'pub' ? t.tPub : s === 'sch' ? t.tSch : s === 'exp' ? t.tExp : t.withdrawn}</Badge>
                        {a?.source === 'connector' && <Badge tone="outline">{t.moodle}</Badge>}
                        <p className="min-w-0 break-words text-sm font-semibold" dir="auto">{a?.title || '—'}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground"><Users className="me-1 inline size-3.5 align-[-2px]" /><bdi>{audLabel(a)}</bdi> · <span className="tabular-nums">{dates(a)}</span></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:w-72 md:justify-end">
                      {s === 'sch' ? <span className="flex-1 text-[11px] text-muted-foreground md:text-end">{t.from} {fmtDate(a?.publishAt, lang)}</span> : <span className="flex-1 text-[11px] text-muted-foreground md:text-end">{s === 'pub' ? t.readNA : ''}</span>}
                      {(s === 'pub' || s === 'sch') && id && (askWd === id ? (
                        <span className="inline-flex items-center gap-2">
                          <Button variant="destructive" size="sm" isDisabled={wdBusy === id} onPress={() => void withdraw(id)}>{wdBusy === id ? <Loader2 className="animate-spin" /> : <Undo2 />}{t.withdrawYes}</Button>
                          <Button variant="ghost" size="sm" onPress={() => setAskWd(null)}>{t.back}</Button>
                        </span>
                      ) : <Button variant="outline" size="sm" className="text-destructive" onPress={() => setAskWd(id)}><Undo2 />{t.withdraw}</Button>)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      </div>
    </SchoolShell>
  );
}
