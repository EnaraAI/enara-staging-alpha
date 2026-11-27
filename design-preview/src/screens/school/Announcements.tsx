import { CalendarClock, CalendarX2, Eye, Megaphone, Send, Users, Undo2, Save, Smartphone, School } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Radio, RadioGroup, Select, Switch, Tab, TabList, Tabs, TextField } from '@/components/ui';
import { SchoolShell } from './SchoolShell';

const T = {
  en: {
    title: 'Announcements', sub: 'Write once in Arabic and English. Parents read it in their own language.', newAnn: 'New announcement',
    compose: 'New announcement', composeD: 'Parents see it in the app and get a notification.',
    audience: 'Who should see it?', aSchool: 'Whole school', aGrade: 'A grade', aClass: 'A class', aLearner: 'One learner',
    grade: 'Grade', grades: [{ id: 'g6', name: 'Grade 6' }, { id: 'g7', name: 'Grade 7' }, { id: 'g8', name: 'Grade 8' }], reach: '214 learners · 361 guardians',
    en: 'English', ar: 'Arabic', tTitle: 'Title', tBody: 'Message',
    enTitle: 'Grade 7 science trip to the Grand Egyptian Museum', enBody: 'On Thursday 10 December, Grade 7 will visit the Grand Egyptian Museum. Buses leave school at 08:00 and return by 14:30. Please sign the consent form in the app by Sunday 6 December.',
    arTitle: 'رحلة علمية للصف السابع إلى المتحف المصري الكبير', arBody: 'يزور طلاب الصف السابع المتحف المصري الكبير يوم الخميس 10 ديسمبر. تغادر الحافلات المدرسة في الساعة 08:00 وتعود قبل الساعة 14:30. يُرجى توقيع نموذج الموافقة في التطبيق قبل يوم الأحد 6 ديسمبر.',
    publish: 'Publish on', publishV: 'Sun 29 Nov 2026, 07:30', expiry: 'Hide after', expiryV: 'Fri 11 Dec 2026', notify: 'Send a notification when it is published',
    draft: 'Save draft', schedule: 'Schedule',
    preview: 'How parents see it', previewD: 'Parent app, in the parent’s language', from: 'NVIS · Grade 7', when: 'Sunday 07:30', consent: 'Sign the consent form',
    list: 'All announcements', tPub: 'Published', tSch: 'Scheduled', tExp: 'Expired',
    read: (n: number) => `Read by ${n}%`, withdraw: 'Withdraw', withdrawn: 'Withdrawn', until: 'until', from2: 'from',
    items: [
      { title: 'School closes early on Wednesday for staff training', aud: 'Whole school', dates: '24 Nov – 26 Nov', state: 'pub', read: 81 },
      { title: 'Grade 9 mock exams timetable', aud: 'Grade 9', dates: '22 Nov – 18 Dec', state: 'pub', read: 64 },
      { title: 'Second fee instalment is due on 15 December', aud: 'Whole school', dates: '30 Nov – 15 Dec', state: 'sch', read: 0 },
      { title: '7B swimming lesson moved to Tuesday', aud: 'Class 7B', dates: '1 Dec – 2 Dec', state: 'sch', read: 0 },
      { title: 'Book week: bring your favourite story', aud: 'Grades 1–3', dates: '9 Nov – 13 Nov', state: 'exp', read: 92 },
    ],
  },
  ar: {
    title: 'الإعلانات', sub: 'اكتب الإعلان مرة واحدة بالعربية والإنجليزية، ويقرؤه وليّ الأمر بلغته.', newAnn: 'إعلان جديد',
    compose: 'إعلان جديد', composeD: 'يظهر لأولياء الأمور في التطبيق مع إشعار.',
    audience: 'لمن يظهر الإعلان؟', aSchool: 'المدرسة كلها', aGrade: 'صف دراسي', aClass: 'فصل', aLearner: 'طالب واحد',
    grade: 'الصف', grades: [{ id: 'g6', name: 'الصف السادس' }, { id: 'g7', name: 'الصف السابع' }, { id: 'g8', name: 'الصف الثامن' }], reach: '214 طالبًا · 361 وليّ أمر',
    en: 'الإنجليزية', ar: 'العربية', tTitle: 'العنوان', tBody: 'نص الرسالة',
    enTitle: 'Grade 7 science trip to the Grand Egyptian Museum', enBody: 'On Thursday 10 December, Grade 7 will visit the Grand Egyptian Museum. Buses leave school at 08:00 and return by 14:30. Please sign the consent form in the app by Sunday 6 December.',
    arTitle: 'رحلة علمية للصف السابع إلى المتحف المصري الكبير', arBody: 'يزور طلاب الصف السابع المتحف المصري الكبير يوم الخميس 10 ديسمبر. تغادر الحافلات المدرسة في الساعة 08:00 وتعود قبل الساعة 14:30. يُرجى توقيع نموذج الموافقة في التطبيق قبل يوم الأحد 6 ديسمبر.',
    publish: 'تاريخ النشر', publishV: 'الأحد 29 نوفمبر 2026، 07:30', expiry: 'الإخفاء بعد', expiryV: 'الجمعة 11 ديسمبر 2026', notify: 'إرسال إشعار عند النشر',
    draft: 'حفظ مسودة', schedule: 'جدولة',
    preview: 'كيف يراه وليّ الأمر', previewD: 'تطبيق أولياء الأمور، بلغة وليّ الأمر', from: 'مدرسة وادي النيل · الصف السابع', when: 'الأحد 07:30', consent: 'وقّع نموذج الموافقة',
    list: 'جميع الإعلانات', tPub: 'منشورة', tSch: 'مجدولة', tExp: 'منتهية',
    read: (n: number) => `قرأه ${n}%`, withdraw: 'سحب', withdrawn: 'مسحوب', until: 'حتى', from2: 'من',
    items: [
      { title: 'انصراف مبكر يوم الأربعاء بسبب تدريب المعلمين', aud: 'المدرسة كلها', dates: '24 نوفمبر – 26 نوفمبر', state: 'pub', read: 81 },
      { title: 'جدول الامتحانات التجريبية للصف التاسع', aud: 'الصف التاسع', dates: '22 نوفمبر – 18 ديسمبر', state: 'pub', read: 64 },
      { title: 'موعد استحقاق القسط الثاني من الرسوم 15 ديسمبر', aud: 'المدرسة كلها', dates: '30 نوفمبر – 15 ديسمبر', state: 'sch', read: 0 },
      { title: 'نقل حصة السباحة لفصل 7B إلى يوم الثلاثاء', aud: 'فصل 7B', dates: '1 ديسمبر – 2 ديسمبر', state: 'sch', read: 0 },
      { title: 'أسبوع الكتاب: أحضِر قصتك المفضلة', aud: 'الصفوف 1–3', dates: '9 نوفمبر – 13 نوفمبر', state: 'exp', read: 92 },
    ],
  },
};

export default function SchoolAnnouncements() {
  const t = useT(T);
  const { lang } = usePreview();
  const counts = { pub: 2, sch: 2, exp: 14 };
  return (
    <SchoolShell active="announcements" title={t.title} subtitle={t.sub} actions={<Button size="sm" aria-label={t.newAnn}><Megaphone /><span className="hidden sm:inline">{t.newAnn}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader><CardTitle>{t.compose}</CardTitle><CardDescription>{t.composeD}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{t.audience}</span>
                <RadioGroup aria-label={t.audience} defaultValue="grade" orientation="horizontal" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[['school', t.aSchool], ['grade', t.aGrade], ['class', t.aClass], ['learner', t.aLearner]].map(([v, l]) => (
                    <Radio key={v} value={v} className="rounded-lg border px-3 data-[selected]:border-primary data-[selected]:bg-secondary">{l}</Radio>
                  ))}
                </RadioGroup>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Select aria-label={t.grade} label={t.grade} items={t.grades} defaultSelectedKey="g7" className="sm:w-56" />
                  <span className="inline-flex items-center gap-1.5 pb-2 text-xs text-muted-foreground"><Users className="size-3.5" />{t.reach}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <fieldset dir="rtl" className="flex flex-col gap-3 rounded-lg border p-3">
                  <legend className="px-1 text-xs font-bold text-muted-foreground">{t.ar}</legend>
                  <TextField aria-label={`${t.tTitle} (${t.ar})`} label="العنوان" defaultValue={t.arTitle} />
                  <TextField aria-label={`${t.tBody} (${t.ar})`} label="نص الرسالة" defaultValue={t.arBody} multiline className="[&_textarea]:min-h-36" />
                </fieldset>
                <fieldset dir="ltr" className="flex flex-col gap-3 rounded-lg border p-3">
                  <legend className="px-1 text-xs font-bold text-muted-foreground">{t.en}</legend>
                  <TextField aria-label={`${t.tTitle} (${t.en})`} label="Title" defaultValue={t.enTitle} />
                  <TextField aria-label={`${t.tBody} (${t.en})`} label="Message" defaultValue={t.enBody} multiline className="[&_textarea]:min-h-36" />
                </fieldset>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label={t.publish} defaultValue={t.publishV} />
                <TextField label={t.expiry} defaultValue={t.expiryV} />
              </div>
              <Switch defaultSelected>{t.notify}</Switch>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button variant="outline"><Save />{t.draft}</Button>
                <Button><CalendarClock />{t.schedule}</Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold"><Eye className="size-4" />{t.preview}</p>
            <p className="text-xs text-muted-foreground">{t.previewD}</p>
            <div className="mx-auto mt-1 w-full max-w-[300px] rounded-[2rem] border-[6px] border-foreground/85 bg-background p-3 shadow-lg">
              <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/20" />
              <div className="flex items-center gap-2 px-1 pb-2"><Smartphone className="size-4 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground">{t.title}</span></div>
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><School className="size-4" /></span>
                  <div className="min-w-0"><p className="truncate text-xs font-bold">{t.from}</p><p className="text-[11px] text-muted-foreground">{t.when}</p></div>
                </div>
                <p className="mb-1.5 text-[15px] font-bold leading-snug">{lang === 'ar' ? t.arTitle : t.enTitle}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{lang === 'ar' ? t.arBody : t.enBody}</p>
                <span className="mt-3 flex h-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">{t.consent}</span>
              </div>
              <div className="mt-2 h-12 rounded-2xl bg-card/60" />
            </div>
          </div>
        </div>

        <section>
          <SectionTitle>{t.list}</SectionTitle>
          <Tabs defaultSelectedKey="all">
            <TabList aria-label={t.list} className="max-w-full overflow-x-auto">
              <Tab id="all">{lang === 'ar' ? 'الكل' : 'All'}</Tab>
              <Tab id="pub">{t.tPub} <span className="text-muted-foreground tabular-nums">{num(counts.pub, lang)}</span></Tab>
              <Tab id="sch">{t.tSch} <span className="text-muted-foreground tabular-nums">{num(counts.sch, lang)}</span></Tab>
              <Tab id="exp">{t.tExp} <span className="text-muted-foreground tabular-nums">{num(counts.exp, lang)}</span></Tab>
            </TabList>
          </Tabs>
          <Card className="mt-3 divide-y">
            {t.items.map((a) => (
              <div key={a.title} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.state === 'pub' ? 'success' : a.state === 'sch' ? 'info' : 'neutral'}>{a.state === 'pub' ? <Send /> : a.state === 'sch' ? <CalendarClock /> : <CalendarX2 />}{a.state === 'pub' ? t.tPub : a.state === 'sch' ? t.tSch : t.tExp}</Badge>
                    <p className="text-sm font-semibold">{a.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground"><Users className="me-1 inline size-3.5 align-[-2px]" />{a.aud} · <span className="tabular-nums">{a.dates}</span></p>
                </div>
                <div className="flex items-center gap-3 md:w-72 md:justify-end">
                  {a.state !== 'sch' ? (
                    <div className="flex-1 md:max-w-36"><Progress value={a.read} size="sm" tone={a.state === 'pub' ? 'success' : 'info'} label={t.read(a.read)} className="[&_span]:font-medium [&_span]:text-muted-foreground" /></div>
                  ) : <span className="flex-1 text-[11px] text-muted-foreground md:text-end">{t.from2} {a.dates.split(' – ')[0]}</span>}
                  {a.state !== 'exp' && <Button variant="outline" size="sm" className="text-destructive"><Undo2 />{t.withdraw}</Button>}
                </div>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </SchoolShell>
  );
}
