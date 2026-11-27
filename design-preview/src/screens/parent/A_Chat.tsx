import type { ReactNode } from 'react';
import { BookOpenCheck, Bus, CalendarCheck, ClipboardList, Database, FileCheck2, Info, Mic, Receipt, SendHorizontal, Sparkles } from 'lucide-react';
import { egp, usePreview, useT } from '@/lib/preview';
import { AppShell } from '@/components/shell';
import { Avatar, Button, Card, Dir } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useParentNav } from './A_shared';

const T = {
  en: {
    title: 'Ask about school', sub: 'Answers come from NVIS records', bot: 'ENARA', me: 'Mona Hassan', source: 'Source',
    q1: 'When is Laila’s next fee payment, and how much is it?',
    a1: (amt: string) => `Laila’s Term 2 instalment is ${amt}, due on 15 December. Payment is made at the school’s finance office (Sunday to Thursday, 08:00–14:00). ENARA shows the record only; it does not take payments.`,
    s1: 'Fee record, updated 24 Nov',
    q2: 'Why does it say Yassin was absent on 9 November?',
    a2: 'Yassin was recorded absent for the whole day on Monday 9 November. No excuse note is on file. If he was ill, you can send a note to his class teacher, Ms Heba Adel, and the record will be updated.',
    s2: 'Attendance register, updated 9 Nov',
    q3: 'I need an enrolment certificate for Omar for a visa application.',
    a3: 'I can’t issue certificates myself, but I can send a request to the school office for you.',
    reqTitle: 'Open a request to the office', req: 'Enrolment certificate for Omar Hassan, Grade 9', reqNote: 'Usually ready within 3 working days. The office will reply here and tell you when to collect it.',
    confirm: 'Send request', notNow: 'Not now',
    disclaimer: 'ENARA answers from your school’s records and can make mistakes. For decisions, please check with the school office.',
    placeholder: 'Ask about fees, attendance, the bus…', send: 'Send', voice: 'Speak your question',
    suggest: ['Bus times tomorrow', 'Laila’s report card', 'School holidays'],
    topics: 'I can help with', topicList: ['Fees and fee records', 'Attendance', 'Bus and pickup', 'Grades and reports', 'Requests to the office'],
    privacy: 'Only you and the school office can see this conversation.',
  },
  ar: {
    title: 'اسأل عن المدرسة', sub: 'الإجابات من سجلات مدرسة وادي النيل الدولية', bot: 'إنارة', me: 'منى حسن', source: 'المصدر',
    q1: 'متى موعد الدفعة القادمة من رسوم ليلى، وكم قيمتها؟',
    a1: (amt: string) => `قسط الفصل الثاني لليلى ${amt}، ويستحق في 15 ديسمبر. يتم الدفع في مكتب الحسابات بالمدرسة (من الأحد إلى الخميس، 08:00–14:00). تعرض إنارة السجل فقط ولا تستقبل المدفوعات.`,
    s1: 'سجل الرسوم، حُدِّث في 24 نوفمبر',
    q2: 'لماذا سُجِّل ياسين غائبًا يوم 9 نوفمبر؟',
    a2: 'سُجِّل ياسين غائبًا طوال يوم الإثنين 9 نوفمبر، ولا يوجد عذر مسجَّل. إن كان مريضًا فيمكنكِ إرسال عذر إلى معلّمة فصله أ. هبة عادل، وسيُحدَّث السجل.',
    s2: 'سجل الحضور، حُدِّث في 9 نوفمبر',
    q3: 'أحتاج إلى شهادة قيد لعمر من أجل طلب تأشيرة.',
    a3: 'لا أستطيع إصدار الشهادات بنفسي، لكن يمكنني إرسال طلب إلى مكتب المدرسة نيابةً عنكِ.',
    reqTitle: 'فتح طلب لدى مكتب المدرسة', req: 'شهادة قيد لعمر حسن، الصف 9', reqNote: 'تجهز عادةً خلال 3 أيام عمل. سيردّ المكتب هنا ويخبركِ بموعد الاستلام.',
    confirm: 'إرسال الطلب', notNow: 'ليس الآن',
    disclaimer: 'تجيب إنارة من سجلات مدرستك وقد تخطئ. قبل اتخاذ أي قرار، يُرجى التأكد من مكتب المدرسة.',
    placeholder: 'اسأل عن الرسوم أو الحضور أو الحافلة…', send: 'إرسال', voice: 'اطرح سؤالك بصوتك',
    suggest: ['مواعيد الحافلة غدًا', 'شهادة ليلى', 'العطلات المدرسية'],
    topics: 'يمكنني المساعدة في', topicList: ['الرسوم وسجلاتها', 'الحضور والغياب', 'الحافلة والانصراف', 'الدرجات والتقارير', 'الطلبات إلى المكتب'],
    privacy: 'لا يرى هذه المحادثة إلا أنتِ ومكتب المدرسة.',
  },
};

export default function ParentChat() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useParentNav();
  const topicIcons = [<Receipt />, <CalendarCheck />, <Bus />, <BookOpenCheck />, <ClipboardList />];
  return (
    <AppShell nav={nav} active="chat" title={t.title} subtitle={t.sub}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1fr_17rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Me>{t.q1}</Me>
          <Bot name={t.bot}>
            <p>{t.a1(egp(18500, lang))}</p>
            <Source label={t.source}>{t.s1}</Source>
          </Bot>
          <Me>{t.q2}</Me>
          <Bot name={t.bot}>
            <p>{t.a2}</p>
            <Source label={t.source}>{t.s2}</Source>
          </Bot>
          <Me>{t.q3}</Me>
          <Bot name={t.bot}>
            <p>{t.a3}</p>
            <div className="mt-3 rounded-lg border-2 border-primary/20 bg-background p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><FileCheck2 className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">{t.reqTitle}</p>
                  <p className="font-bold">{t.req}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.reqNote}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button>{t.confirm}</Button>
                <Button variant="ghost">{t.notNow}</Button>
              </div>
            </div>
          </Bot>

          {/* Input bar (in the app it stays pinned above the phone tab bar; shown in place in this static preview) */}
          <div className="mt-2 flex flex-col gap-2">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              {t.suggest.map((s) => <Button key={s} variant="outline" className="shrink-0 rounded-full">{s}</Button>)}
            </div>
            <form className="flex items-center gap-2 rounded-xl border bg-card p-1.5 shadow-sm" onSubmit={(e) => e.preventDefault()}>
              <Button variant="ghost" size="icon" aria-label={t.voice}><Mic /></Button>
              <input aria-label={t.placeholder} placeholder={t.placeholder} className="min-h-tap min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <Button size="icon" aria-label={t.send}><Dir><SendHorizontal /></Dir></Button>
            </form>
            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{t.disclaimer}</p>
          </div>
        </div>

        <aside className="hidden flex-col gap-4 lg:flex">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4 text-accent-foreground" />{t.topics}</p>
            <ul className="flex flex-col gap-1">
              {t.topicList.map((x, i) => <li key={x} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm [&_svg]:size-4 [&_svg]:text-primary">{topicIcons[i]}{x}</li>)}
            </ul>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">{t.privacy}</p>
        </aside>
      </div>
    </AppShell>
  );
}

function Me({ children }: { children: ReactNode }) {
  const t = useT(T);
  return (
    <div className="flex items-end justify-end gap-2">
      <p className="max-w-[85%] rounded-2xl rounded-ee-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground md:max-w-[70%]">{children}</p>
      <Avatar name={t.me} className="hidden size-8 text-xs sm:grid" />
    </div>
  );
}

function Bot({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
      <div className={cn('min-w-0 max-w-[92%] rounded-2xl rounded-ss-sm border bg-card px-4 py-3 text-sm leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.04)] md:max-w-[80%]')}>
        <p className="mb-1 text-xs font-bold text-muted-foreground">{name}</p>
        {children}
      </div>
    </div>
  );
}

function Source({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      <Database className="size-3.5 shrink-0" /><span><span className="font-semibold">{label}:</span> {children}</span>
    </p>
  );
}
