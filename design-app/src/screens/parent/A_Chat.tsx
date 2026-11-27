import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BookOpenCheck, Bus, CalendarCheck, CalendarDays, CircleCheck, ClipboardList, Database, FileCheck2, Info, Megaphone, Receipt, RefreshCw, SendHorizontal, Sparkles } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { usePreview, useT, type Lang } from '@/lib/preview';
import { Avatar, Button, Card, Dir, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, ParentShell } from './A_shared';
import { ChildGate } from './B_common';
import { childName, ep, ErrorState, fmtStamp, friendly, isOff, OffState, optional, useChildren, useLoad, type ChatReply, type LearnerChip, type RequestItem, type RequestType, type SchoolOverview, type SchoolSection } from './data';

const T = {
  en: {
    title: 'Ask about school', sub: (s: string) => (s ? `Answers come from ${s} records` : 'Answers come from your school’s records'), bot: 'ENARA', source: 'Source', updated: (d: string) => `updated ${d}`,
    hello: (n: string) => `Ask me about ${n}’s school: fees, attendance, the bus, the timetable or announcements. I answer from the school’s records only.`,
    reqTitle: 'Open a request to the office', confirm: 'Send request', sending: 'Sending…', notNow: 'Not now',
    sent: 'Request sent. The school office will reply on ENARA.', dismissed: 'No request was sent.', reqErr: 'The request could not be sent.',
    rt: { certificate: 'Certificate', early_leave: 'Early leave', teacher_meeting: 'Meeting with a teacher', other: 'Request to the office' } as Record<RequestType, string>,
    disclaimer: 'ENARA answers from your school’s records and can make mistakes. For decisions, please check with the school office.',
    placeholder: 'Ask about fees, attendance, the bus…', send: 'Send', retry: 'Try again', thinking: 'ENARA is looking at the records…',
    suggest: { fees: 'When is the next fee due?', buses: 'What time is the bus today?', attendance: 'How was attendance this month?', timetable: 'What classes are tomorrow?', announcements: 'Any new announcements?' } as Partial<Record<SchoolSection, string>>,
    topics: 'I can help with', topicList: { fees: 'Fees and fee records', attendance: 'Attendance', buses: 'Bus and pickup', timetable: 'Timetable', announcements: 'Announcements', requests: 'Requests to the office', consents: 'Consent forms' } as Partial<Record<SchoolSection, string>>,
    src: { fees: 'Fee record', buses: 'Bus routes', timetable: 'Timetable', attendance: 'Attendance register', announcements: 'Announcements', consents: 'Consent forms', requests: 'Requests', results: 'Results', analytics: 'Learning records' } as Record<string, string>,
    me: 'You',
  },
  ar: {
    title: 'اسأل عن المدرسة', sub: (s: string) => (s ? `الإجابات من سجلات ${s}` : 'الإجابات من سجلات مدرستك'), bot: 'إنارة', source: 'المصدر', updated: (d: string) => `حُدِّث في ${d}`,
    hello: (n: string) => `اسألني عن مدرسة ${n}: الرسوم أو الحضور أو الحافلة أو الجدول أو الإعلانات. أجيب من سجلات المدرسة فقط.`,
    reqTitle: 'فتح طلب لدى مكتب المدرسة', confirm: 'إرسال الطلب', sending: 'جارٍ الإرسال…', notNow: 'ليس الآن',
    sent: 'أُرسل الطلب. سيردّ مكتب المدرسة على إنارة.', dismissed: 'لم يُرسَل أي طلب.', reqErr: 'تعذّر إرسال الطلب.',
    rt: { certificate: 'شهادة', early_leave: 'انصراف مبكر', teacher_meeting: 'لقاء مع معلّم', other: 'طلب إلى المكتب' } as Record<RequestType, string>,
    disclaimer: 'تجيب إنارة من سجلات مدرستك وقد تخطئ. قبل اتخاذ أي قرار، يُرجى التأكد من مكتب المدرسة.',
    placeholder: 'اسأل عن الرسوم أو الحضور أو الحافلة…', send: 'إرسال', retry: 'حاول مرة أخرى', thinking: 'تراجع إنارة السجلات…',
    suggest: { fees: 'متى يستحق القسط التالي؟', buses: 'ما موعد الحافلة اليوم؟', attendance: 'كيف كان الحضور هذا الشهر؟', timetable: 'ما حصص الغد؟', announcements: 'هل توجد إعلانات جديدة؟' } as Partial<Record<SchoolSection, string>>,
    topics: 'يمكنني المساعدة في', topicList: { fees: 'الرسوم وسجلاتها', attendance: 'الحضور والغياب', buses: 'الحافلة والانصراف', timetable: 'الجدول الدراسي', announcements: 'الإعلانات', requests: 'الطلبات إلى المكتب', consents: 'نماذج الموافقة' } as Partial<Record<SchoolSection, string>>,
    src: { fees: 'سجل الرسوم', buses: 'خطوط الحافلات', timetable: 'الجدول الدراسي', attendance: 'سجل الحضور', announcements: 'الإعلانات', consents: 'نماذج الموافقة', requests: 'الطلبات', results: 'النتائج', analytics: 'سجلات التعلّم' } as Record<string, string>,
    me: 'أنت',
  },
};
type TT = (typeof T)['en'];
const TOPIC_ICON: Partial<Record<SchoolSection, ReactNode>> = { fees: <Receipt />, attendance: <CalendarCheck />, buses: <Bus />, timetable: <CalendarDays />, announcements: <Megaphone />, requests: <ClipboardList />, consents: <BookOpenCheck /> };

type OfferState = 'open' | 'sending' | 'sent' | 'dismissed' | 'error';
type Msg =
  | { id: number; from: 'me'; text: string }
  | { id: number; from: 'bot'; reply: ChatReply; offer: OfferState; offerErr?: string; request?: RequestItem }
  | { id: number; from: 'err'; question: string; message: string };

export default function ParentChat() {
  const t = useT(T);
  const kids = useChildren();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(false);
  const sendRef = useRef<(q: string) => void>(() => {});
  const submit = (e: FormEvent) => { e.preventDefault(); const q = input.trim(); if (q && !busy) { sendRef.current(q); setInput(''); } };
  const bar = kids.child && available ? (
    <form className="mx-auto flex max-w-6xl flex-col gap-1.5" onSubmit={submit}>
      <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5 shadow-sm">
        <input aria-label={t.placeholder} placeholder={t.placeholder} value={input} maxLength={500} onChange={(e) => setInput(e.target.value)} data-testid="chat-input"
          className="min-h-tap min-w-0 flex-1 bg-transparent ps-2 text-sm outline-none placeholder:text-muted-foreground" />
        <Button type="submit" size="icon" aria-label={t.send} isDisabled={busy || !input.trim()}><Dir><SendHorizontal /></Dir></Button>
      </div>
      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{t.disclaimer}</p>
    </form>
  ) : undefined;
  return (
    <ParentShell active="chat" title={t.title} subtitle={t.sub(kids.child?.school ?? '')} bottomBar={bar}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ChildGate kids={kids}>
          {(child) => (<><ChildSwitcher kids={kids} /><ChatBody key={child.studentId} child={child} sendRef={sendRef} setBusy={setBusy} setAvailable={setAvailable} /></>)}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

function ChatBody({ child, sendRef, setBusy, setAvailable }: { child: LearnerChip; sendRef: { current: (q: string) => void }; setBusy: (b: boolean) => void; setAvailable: (b: boolean) => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const id = child.studentId;
  const ov = useLoad((signal) => optional(get<SchoolOverview>(ep.overview(id), signal)), [id]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [off, setOff] = useState(false);
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const on = ov.data?.sections ?? {};

  const ask = async (q: string) => {
    if (pending) return;
    const mine: Msg = { id: ++seq.current, from: 'me', text: q };
    setMsgs((m) => [...m, mine]); setPending(true); setBusy(true);
    try {
      const reply = await post<ChatReply>(ep.chat(id), { message: q });
      setMsgs((m) => [...m, { id: ++seq.current, from: 'bot', reply: reply ?? {}, offer: reply?.offerRequest ? 'open' : 'dismissed' }]);
    } catch (e) {
      if (isOff(e)) setOff(true);
      else setMsgs((m) => [...m, { id: ++seq.current, from: 'err', question: q, message: friendly(e, lang) }]);
    } finally { setPending(false); setBusy(false); }
  };
  const usable = !ov.loading && !ov.error && !off && !!on.chat;
  sendRef.current = (q) => { if (usable) void ask(q); };
  useEffect(() => { setAvailable(usable); }, [usable, setAvailable]);
  useEffect(() => () => { sendRef.current = () => {}; setBusy(false); setAvailable(false); }, [sendRef, setBusy, setAvailable]);
  useEffect(() => { if (msgs.length || pending) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs.length, pending]);

  const confirm = async (msgId: number, offer: { type: RequestType; details: string }) => {
    setMsgs((m) => m.map((x) => (x.id === msgId && x.from === 'bot' ? { ...x, offer: 'sending', offerErr: undefined } : x)));
    try {
      const r = await post<RequestItem>(ep.chatRequest(id), { type: offer.type, details: offer.details, confirmed: true });
      setMsgs((m) => m.map((x) => (x.id === msgId && x.from === 'bot' ? { ...x, offer: 'sent', request: r ?? {} } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === msgId && x.from === 'bot' ? { ...x, offer: 'error', offerErr: friendly(e, lang) } : x)));
    }
  };
  const dismiss = (msgId: number) => setMsgs((m) => m.map((x) => (x.id === msgId && x.from === 'bot' ? { ...x, offer: 'dismissed' } : x)));

  if (ov.loading) return <div className="flex flex-col gap-5" aria-busy="true" data-testid="parent-loading"><Skeleton className="h-20 w-3/4 rounded-2xl" /><Skeleton className="ms-auto h-12 w-1/2 rounded-2xl" /></div>;
  if (ov.error) return <ErrorState error={ov.error} onRetry={ov.reload} />;
  if (off || !ov.data || !on.chat) return <OffState />;

  const topics = (Object.keys(t.topicList) as SchoolSection[]).filter((k) => on[k]);
  const suggestions = (Object.keys(t.suggest) as SchoolSection[]).filter((k) => on[k]).map((k) => t.suggest[k]!).slice(0, 3);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_17rem]">
      <div className="flex min-w-0 flex-col gap-5" aria-live="polite">
        <Bot name={t.bot}><p>{t.hello(childName(child))}</p></Bot>
        {msgs.map((m) => m.from === 'me' ? <Me key={m.id}>{m.text}</Me>
          : m.from === 'err' ? (
            <Bot key={m.id} name={t.bot}>
              <p role="alert" className="text-destructive">{m.message}</p>
              <Button variant="outline" size="sm" className="mt-2" isDisabled={pending} onPress={() => { setMsgs((x) => x.filter((y) => y.id !== m.id)); void ask(m.question); }}><RefreshCw />{t.retry}</Button>
            </Bot>
          ) : <Answer key={m.id} m={m} t={t} lang={lang} onConfirm={confirm} onDismiss={dismiss} />)}
        {pending && <Bot name={t.bot}><p className="text-muted-foreground">{t.thinking}</p><Skeleton className="mt-2 h-3 w-40" /></Bot>}
        {!msgs.length && !pending && suggestions.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {suggestions.map((s) => <Button key={s} variant="outline" className="shrink-0 rounded-full" onPress={() => void ask(s)}>{s}</Button>)}
          </div>
        )}
        <div ref={end} />
      </div>

      <aside className="hidden flex-col gap-4 lg:flex">
        {topics.length > 0 && (
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4 text-accent-foreground" />{t.topics}</p>
            <ul className="flex flex-col gap-1">
              {topics.map((k) => <li key={k} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm [&_svg]:size-4 [&_svg]:text-primary">{TOPIC_ICON[k]}{t.topicList[k]}</li>)}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}

function Answer({ m, t, lang, onConfirm, onDismiss }: { m: Extract<Msg, { from: 'bot' }>; t: TT; lang: Lang; onConfirm: (id: number, o: { type: RequestType; details: string }) => void; onDismiss: (id: number) => void }) {
  const r = m.reply;
  const offer = r.offerRequest;
  const sources = (r.sources ?? []).filter((s) => s?.source);
  return (
    <Bot name={t.bot}>
      <p className="whitespace-pre-line" dir="auto">{r.answer}</p>
      {sources.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {sources.map((s, i) => <Source key={i} label={t.source}>{t.src[s.source!] ?? s.source}{s.updatedAt ? `${lang === 'ar' ? '،' : ','} ${t.updated(fmtStamp(s.updatedAt, lang, { day: 'numeric', month: 'short' }))}` : ''}</Source>)}
        </div>
      )}
      {offer && m.offer !== 'dismissed' && (
        <div className="mt-3 rounded-lg border-2 border-primary/20 bg-background p-4" data-testid="chat-offer">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">{m.offer === 'sent' ? <CircleCheck className="size-5 text-success" /> : <FileCheck2 className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">{t.reqTitle}</p>
              <p className="font-bold">{t.rt[offer.type] ?? offer.type}</p>
              {offer.details && <p className="mt-1 text-sm text-muted-foreground" dir="auto">{offer.details}</p>}
            </div>
          </div>
          {m.offer === 'sent' ? <p role="status" className="mt-3 text-sm font-semibold text-success">{t.sent}</p> : (
            <>
              {m.offer === 'error' && <p role="alert" className="mt-3 text-sm text-destructive">{t.reqErr} {m.offerErr}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button isDisabled={m.offer === 'sending'} onPress={() => onConfirm(m.id, offer)} data-testid="chat-offer-confirm">{m.offer === 'sending' ? t.sending : t.confirm}</Button>
                <Button variant="ghost" isDisabled={m.offer === 'sending'} onPress={() => onDismiss(m.id)}>{t.notNow}</Button>
              </div>
            </>
          )}
        </div>
      )}
      {offer && m.offer === 'dismissed' && <p className="mt-2 text-xs text-muted-foreground">{t.dismissed}</p>}
    </Bot>
  );
}

function Me({ children }: { children: ReactNode }) {
  const t = useT(T);
  const { user } = useSession();
  return (
    <div className="flex items-end justify-end gap-2">
      <p dir="auto" className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-ee-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground md:max-w-[70%]">{children}</p>
      <Avatar name={user?.name || t.me} className="hidden size-8 text-xs sm:grid" />
    </div>
  );
}

function Bot({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
      <div className={cn('min-w-0 max-w-[92%] break-words rounded-2xl rounded-ss-sm border bg-card px-4 py-3 text-sm leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.04)] md:max-w-[80%]')}>
        <p className="mb-1 text-xs font-bold text-muted-foreground">{name}</p>
        {children}
      </div>
    </div>
  );
}

function Source({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      <Database className="size-3.5 shrink-0" /><span><span className="font-semibold">{label}:</span> {children}</span>
    </p>
  );
}
