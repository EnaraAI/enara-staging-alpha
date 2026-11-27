// Tutor chat (teens and adults), wired to lms-test. Context is chosen like today's app: the course in ?course= (else the
// first enrolled course), the lesson in ?lesson= only when the learner picked one, or an existing chat in ?session=.
//   GET  /api/me/courses, GET /api/me/courses/:id         course and lesson context (no AI call)
//   GET  /api/me/tutor/sessions/:id                      an existing chat (e.g. from "Practise with the tutor")
//   POST /api/me/tutor/sessions {courseId, lessonId}     only when the learner sends the first message
//   POST /api/me/tutor/sessions/:id/messages/stream {text, context}
//        server-sent events, one `data: <json>` per event: user · token {delta} · replace {text} · done {assistantMessage} · error {code, message}
//        Stop aborts the request; the server stops generating when the connection closes.
//   POST /api/me/tutor/visualize {lessonTitle, lessonText, courseId, prompt?}   a diagram (sanitised HTML/SVG), as in lms-test's
//        "Visualize" button. Shown in a sandboxed iframe (no scripts). Also used when the learner types a drawing request
//        ("draw …", "ارسم …"), with their words as the prompt.
// Hints: the tutor recognises a hint request in the learner's words ("hint" / "تلميح") and gives the next step of its hint ladder.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpenText, CheckCircle2, Circle, ImageIcon, Lightbulb, Maximize2, MessageCirclePlus, RotateCcw, SendHorizontal, Square, Video, X } from 'lucide-react';
import { go } from '@/App';
import { ApiError, get, post, stream } from '@/lib/api';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell } from '@/components/shell';
import { Badge, Button, Card, Dir, LinkButton, Progress, Select, Separator, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';
import { ErrorState, RichText, arr, errMsg, fmtTime, isAbort, isNum, str, useHashQuery, useLoad, type CourseSummary, type CourseTree, type Lesson } from './common';

const T = {
  en: {
    title: 'Your tutor', general: 'General help', wholeCourse: 'Whole course', voice: 'Talk instead', newChat: 'New chat',
    course: 'Course', lesson: 'Lesson',
    introTitle: 'Ask your tutor', intro: (c: string) => (c ? `Ask anything about ${c}. Your tutor gives one task at a time and helps you find the answer yourself.` : 'Ask anything you are learning. Your tutor gives one task at a time and helps you find the answer yourself.'),
    writing: 'Tutor is writing…', stop: 'Stop', stopped: 'You stopped this reply.',
    placeholder: 'Type your message…', send: 'Send', hint: 'Hint', hintAsk: 'Can I have a hint, please?', hintAsked: 'You asked for a hint',
    footnote: 'The tutor gives one task at a time. Ask for a hint whenever you need one.',
    lessons: 'Lessons in this course', noLessons: 'This course has no lessons yet.', progress: 'Your progress',
    lessonsDone: (d: string, n: string) => `${d} of ${n} lessons done`, hintsUsed: 'Hints asked in this chat',
    tryAgain: 'Put my message back', done: 'done',
    draw: 'Draw it', drawAsk: 'Can you draw the main idea of this lesson for me?', drawing: 'Drawing…', drawn: 'Here is a drawing of the idea. Ask me about any part of it!',
    drawFailed: 'I couldn’t make the drawing right now. Please try again in a moment.', drawTitle: 'Lesson drawing', large: 'View large', close: 'Close',
  },
  ar: {
    title: 'معلّمك', general: 'مساعدة عامة', wholeCourse: 'المقرر كله', voice: 'تحدّث بدلًا من الكتابة', newChat: 'محادثة جديدة',
    course: 'المقرر', lesson: 'الدرس',
    introTitle: 'اسأل معلّمك', intro: (c: string) => (c ? `اسأل عن أي شيء في ${c}. يقدّم معلّمك مهمة واحدة في كل مرة ويساعدك على الوصول إلى الإجابة بنفسك.` : 'اسأل عن أي شيء تتعلّمه. يقدّم معلّمك مهمة واحدة في كل مرة ويساعدك على الوصول إلى الإجابة بنفسك.'),
    writing: 'المعلّم يكتب…', stop: 'إيقاف', stopped: 'أوقفتَ هذا الرد.',
    placeholder: 'اكتب رسالتك…', send: 'إرسال', hint: 'تلميح', hintAsk: 'أريد تلميحًا من فضلك.', hintAsked: 'طلبتَ تلميحًا',
    footnote: 'يقدّم المعلّم مهمة واحدة في كل مرة. اطلب تلميحًا متى احتجت إليه.',
    lessons: 'دروس هذا المقرر', noLessons: 'لا توجد دروس في هذا المقرر بعد.', progress: 'تقدّمك',
    lessonsDone: (d: string, n: string) => `اكتمل ${d} من ${n} دروس`, hintsUsed: 'التلميحات المطلوبة في هذه المحادثة',
    tryAgain: 'إعادة رسالتي إلى مربع الكتابة', done: 'مكتمل',
    draw: 'ارسمها لي', drawAsk: 'هل يمكنك أن ترسم لي الفكرة الرئيسية لهذا الدرس؟', drawing: 'جارٍ الرسم…', drawn: 'هذا رسم يوضّح الفكرة. اسألني عن أي جزء منه!',
    drawFailed: 'تعذّر إعداد الرسم الآن. حاول مرة أخرى بعد قليل.', drawTitle: 'رسم الدرس', large: 'عرض بحجم أكبر', close: 'إغلاق',
  },
};

interface Msg { id: string; role: 'user' | 'ai'; text: string; at?: string; streaming?: boolean; stopped?: boolean; error?: string; retryText?: string; hint?: boolean; visualHtml?: string; drawing?: boolean }
/** A typed request for a drawing (English or Arabic), sent to the diagram generator instead of the chat. */
const DRAW_ASK = /^\s*(please\s+|can you\s+|could you\s+)*(draw|sketch|illustrate)\b|\b(draw|sketch)\s+(me|a|an|the|it|this)\b|(show me|make)\s+(a|an)\s+(picture|diagram|drawing|chart)\b|ارسم|ارسمي|ترسم|رسمًا|رسما|رسم توضيحي|رسمة|مخطط توضيحي|صورة توضيحية/i;
interface SessionDoc { id?: string; courseId?: string; lessonId?: string; lessonTitle?: string; title?: string; messages?: { id?: string; role?: string; text?: string; timestamp?: string }[] }

const toMsg = (m: NonNullable<SessionDoc['messages']>[number], i: number): Msg => ({ id: str(m?.id) || `m${i}`, role: m?.role === 'user' ? 'user' : 'ai', text: str(m?.text), at: str(m?.timestamp) });
let seq = 0;
const localId = () => `local-${Date.now()}-${++seq}`;

function TutorMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-primary', className)}>
      <svg viewBox="0 0 24 24" className="size-4"><path d="M12 3c3.3 0 6 2.6 6 5.8 0 2-1 3.5-2.3 4.5-.7.6-1 1.2-1 2V16H9.3v-.7c0-.8-.4-1.4-1-2C7 12.3 6 10.8 6 8.8 6 5.6 8.7 3 12 3Z" fill="var(--accent)" /><rect x="9.5" y="17.6" width="5" height="1.8" rx=".9" fill="var(--primary-foreground)" /></svg>
    </span>
  );
}
function TutorMsg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <TutorMark className="mt-0.5" />
      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-2 rounded-2xl rounded-ss-md border bg-card px-4 py-3 text-[15px] leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.04)]', className)}>{children}</div>
    </div>
  );
}
function LearnerMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-3 text-[15px] leading-relaxed text-primary-foreground">{children}</div>
    </div>
  );
}

export default function StudentChat() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const q = useHashQuery();
  const qCourse = q.get('course') ?? '';
  const qLesson = q.get('lesson') ?? '';
  const qSession = q.get('session') ?? '';

  // Context only (no AI call): the learner's courses, the chosen course's lessons, and an existing chat when one is named.
  const ctx = useLoad(async (signal) => {
    const session = qSession ? await get<SessionDoc>(`/api/me/tutor/sessions/${encodeURIComponent(qSession)}`, signal) : null;
    const courses = arr<CourseSummary>(await get<CourseSummary[]>('/api/me/courses', signal).catch(() => []));
    const courseId = qCourse || session?.courseId || courses[0]?.id || '';
    const tree = courseId ? await get<CourseTree>(`/api/me/courses/${encodeURIComponent(courseId)}`, signal).catch(() => null) : null;
    return { session, courses, courseId, lessonId: qLesson || session?.lessonId || '', tree };
  }, `${qCourse}|${qLesson}|${qSession}`);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // A new context starts a new chat (or shows the chat that was opened).
  useEffect(() => {
    abortRef.current?.abort();
    setMessages(arr<NonNullable<SessionDoc['messages']>[number]>(ctx.data?.session?.messages).map(toMsg));
    setSessionId(ctx.data?.session?.id ?? null);
  }, [ctx.data]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest words in view while the reply streams, unless the learner scrolled up to read.
  const nearBottom = useRef(true);
  useEffect(() => {
    const on = () => { nearBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240; };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { if (nearBottom.current) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const data = ctx.data;
  const lessons: Lesson[] = arr<NonNullable<CourseTree['modules']>[number]>(data?.tree?.modules).flatMap((m) => arr<Lesson>(m?.lessons));
  const course = data?.courses.find((c) => c.id === data?.courseId);
  const courseTitle = data?.tree?.title || course?.title || '';
  const subject = data?.tree?.subject || course?.subject || '';
  const lesson = lessons.find((l) => l.id === data?.lessonId);
  const lessonTitle = lesson?.title || data?.session?.lessonTitle || '';
  const progressPct = isNum(data?.tree?.progressPct) ? data!.tree!.progressPct! : isNum(course?.progressPct) ? course!.progressPct! : null;
  const doneCount = lessons.filter((l) => l.status === 'completed').length;
  const hintsAsked = messages.filter((m) => m.hint).length;
  const hasTutorReply = messages.some((m) => m.role === 'ai' && m.text && !m.streaming);

  const patch = (id: string, p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m)));

  async function send(raw: string, hint = false) {
    const body = raw.trim();
    if (!body || busy) return;
    if (!hint && DRAW_ASK.test(body)) { setText(''); return draw(body); }
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    if (!hint) setText('');
    const userId = localId();
    const replyId = localId();
    setMessages((ms) => [...ms, { id: userId, role: 'user', text: body, hint, at: new Date().toISOString() }, { id: replyId, role: 'ai', text: '', streaming: true }]);
    try {
      let sid = sessionId;
      if (!sid) {
        // The chat is created only now, when the learner sends something.
        const s = await post<SessionDoc>('/api/me/tutor/sessions', { courseId: data?.courseId || undefined, lessonId: data?.lessonId || undefined });
        sid = s?.id ?? null;
        if (!sid) throw new ApiError('no session', 503, 'TUTOR_STREAM_FAILED');
        setSessionId(sid);
        const greeting = arr<NonNullable<SessionDoc['messages']>[number]>(s?.messages).map(toMsg);
        if (greeting.length) setMessages((ms) => { const i = ms.findIndex((m) => m.id === userId); return [...ms.slice(0, i), ...greeting, ...ms.slice(i)]; });
      }
      let finished = false;
      let failure: { code?: string; message?: string } | null = null;
      await stream(`/api/me/tutor/sessions/${encodeURIComponent(sid)}/messages/stream`, {
        text: body,
        context: { courseId: data?.courseId || undefined, lessonId: data?.lessonId || undefined, subject: subject || undefined, lessonTitle: lessonTitle || undefined },
      }, (ev) => {
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'token' && typeof ev.delta === 'string') patch(replyId, (m) => ({ text: m.text + ev.delta }));
        else if (ev.type === 'replace') patch(replyId, { text: str(ev.text) });
        else if (ev.type === 'done') {
          finished = true;
          const final = str(ev.assistantMessage?.text);
          patch(replyId, (m) => ({ text: final || m.text, streaming: false, at: str(ev.assistantMessage?.timestamp) || new Date().toISOString(), id: str(ev.assistantMessage?.id) || m.id }));
        } else if (ev.type === 'error') failure = { code: str(ev.code), message: str(ev.message) };
      }, ctl.signal);
      if (failure) throw new ApiError((failure as { message?: string }).message || 'failed', 503, (failure as { code?: string }).code || 'TUTOR_STREAM_FAILED');
      if (!finished) throw new ApiError('interrupted', 503, 'TUTOR_STREAM_INTERRUPTED');
    } catch (e) {
      if (isAbort(e) || ctl.signal.aborted) patch(replyId, { streaming: false, stopped: true });
      else patch(replyId, { streaming: false, error: errMsg(e, lang), retryText: hint ? undefined : body });
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setBusy(false);
    }
  }
  /** A diagram for the lesson (or for the learner's own words), drawn by the server like lms-test's Visualize button. */
  async function draw(prompt?: string) {
    if (busy) return;
    setBusy(true);
    const replyId = localId();
    setMessages((ms) => [...ms, { id: localId(), role: 'user', text: prompt || t.drawAsk, at: new Date().toISOString() }, { id: replyId, role: 'ai', text: '', drawing: true }]);
    try {
      const r = await post<{ html?: string }>('/api/me/tutor/visualize', {
        lessonTitle: lessonTitle || courseTitle || undefined,
        lessonText: lesson?.description || undefined,
        courseId: data?.courseId || undefined,
        prompt: prompt || undefined,
      });
      if (!r?.html) throw new ApiError('no visual', 503, 'VISUAL_UNAVAILABLE');
      patch(replyId, { text: t.drawn, visualHtml: r.html, drawing: false, at: new Date().toISOString() });
    } catch (e) {
      const status = (e as ApiError)?.status;
      patch(replyId, { drawing: false, error: status && status < 500 ? errMsg(e, lang) : t.drawFailed, retryText: prompt });
    } finally { setBusy(false); }
  }
  const stop = () => abortRef.current?.abort();
  const [large, setLarge] = useState<string | null>(null);
  const newChat = () => { if (busy) return; setMessages([]); setSessionId(null); };
  const contextHref = (lessonId?: string) => `/student/chat${data?.courseId ? `?course=${encodeURIComponent(data.courseId)}${lessonId ? `&lesson=${encodeURIComponent(lessonId)}` : ''}` : ''}`;

  const composer = (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <form className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-lg shadow-primary/5" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <Button variant="outline" size="sm" isDisabled={busy || !hasTutorReply} onPress={() => void send(t.hintAsk, true)} aria-label={t.hint}
            className="mb-1 shrink-0 rounded-full border-accent bg-accent/15 text-accent-foreground data-[hovered]:bg-accent/25"><Lightbulb /><span className="hidden sm:inline">{t.hint}</span></Button>
          <Button variant="outline" size="sm" isDisabled={busy || ctx.loading || (!lessonTitle && !courseTitle)} onPress={() => void draw()} aria-label={t.draw} data-testid="chat-draw"
            className="mb-1 shrink-0 rounded-full"><ImageIcon /><span className="hidden sm:inline">{t.draw}</span></Button>
          <textarea rows={1} value={text} placeholder={t.placeholder} aria-label={t.placeholder} dir="auto"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }}
            className="max-h-40 min-h-tap min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground" />
          {busy
            ? <Button size="icon" variant="outline" aria-label={t.stop} onPress={stop} className="shrink-0 rounded-xl"><Square className="fill-current" /></Button>
            : <Button size="icon" type="submit" aria-label={t.send} isDisabled={!text.trim() || ctx.loading} className="shrink-0 rounded-xl"><Dir><SendHorizontal /></Dir></Button>}
        </form>
        <p className="mt-2 hidden text-center text-xs text-muted-foreground md:block">{t.footnote}</p>
      </div>
    </div>
  );

  return (
    <AppShell
      nav={nav} active="tutor" back title={lessonTitle || courseTitle || t.title} subtitle={[subject, courseTitle && lessonTitle ? courseTitle : ''].filter(Boolean).join(' · ') || undefined}
      actions={<LinkButton href={`#/student/avatar${data?.courseId ? `?course=${encodeURIComponent(data.courseId)}` : ''}`} variant="outline" size="sm" className="rounded-full"><Video /><span className="hidden sm:inline">{t.voice}</span></LinkButton>}
      bottomBar={ctx.error ? undefined : composer}
    >
      {ctx.loading && !ctx.data ? (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" aria-busy="true">
          <div className="flex flex-col gap-4"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-24 w-3/4 rounded-2xl" /><Skeleton className="ms-auto h-14 w-1/2 rounded-2xl" /></div>
          <Skeleton className="hidden h-72 rounded-xl lg:block" />
        </div>
      ) : ctx.error || !data ? (
        <div className="mx-auto max-w-xl"><ErrorState error={ctx.error} onRetry={ctx.reload} /></div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col">
            {/* Lesson context */}
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info"><BookOpenText className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate text-xs font-semibold text-muted-foreground">{courseTitle || t.general}</p>
                <p dir="auto" className="truncate font-bold">{lessonTitle || (courseTitle ? t.wholeCourse : t.general)}</p>
              </div>
              {progressPct !== null && <div className="hidden w-32 shrink-0 flex-col gap-1 sm:flex"><span className="text-end text-xs font-semibold text-muted-foreground">{num(progressPct, lang)}% {t.done}</span><Progress value={progressPct} size="sm" ariaLabel={t.progress} /></div>}
              {messages.length > 0 && <Button variant="ghost" size="sm" onPress={newChat} isDisabled={busy}><MessageCirclePlus />{t.newChat}</Button>}
              {data.courses.length > 1 && (
                <Select aria-label={t.course} className="w-full sm:w-56" items={data.courses.filter((c) => c.id).map((c) => ({ id: c.id!, name: c.title || c.subject || c.id! }))}
                  selectedKey={data.courseId || null} onSelectionChange={(k) => { if (k && k !== data.courseId) go(`/student/chat?course=${encodeURIComponent(String(k))}`); }} />
              )}
            </div>

            {messages.length === 0 && (
              <Card className="flex items-start gap-3 p-4 text-sm leading-relaxed">
                <TutorMark />
                <div className="min-w-0"><p className="font-bold">{t.introTitle}</p><p dir="auto" className="text-muted-foreground">{t.intro(lessonTitle || courseTitle)}</p></div>
              </Card>
            )}

            <div className="flex flex-col gap-4" aria-live="polite">
              {messages.map((m) => m.role === 'user' ? (
                m.hint ? (
                  <div key={m.id} className="flex justify-end">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-accent bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent-foreground"><Lightbulb className="size-3.5" />{t.hintAsked}</span>
                  </div>
                ) : <LearnerMsg key={m.id}><RichText text={m.text} className="text-start" /></LearnerMsg>
              ) : (
                <TutorMsg key={m.id}>
                  {m.text ? <RichText text={m.text} /> : m.streaming || m.drawing ? null : !m.error && !m.stopped ? <span className="text-muted-foreground">…</span> : null}
                  {m.streaming && m.text && <span aria-hidden className="-mt-2 inline-block h-[1.1em] w-[3px] animate-pulse rounded-sm bg-primary" />}
                  {m.streaming && (
                    <div className={cn('flex items-center justify-between gap-3', m.text && 'mt-1 border-t pt-2.5')}>
                      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                        {t.writing}
                      </span>
                      <Button variant="outline" size="sm" className="rounded-full" onPress={stop}><Square className="fill-current" />{t.stop}</Button>
                    </div>
                  )}
                  {m.drawing && <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ImageIcon className="size-4 animate-pulse" />{t.drawing}</span>}
                  {m.visualHtml && (
                    <div className="overflow-hidden rounded-xl border bg-white">
                      <iframe srcDoc={m.visualHtml} sandbox="" title={t.drawTitle} className="h-[380px] w-full border-0" />
                      <div className="flex justify-end border-t bg-card p-1.5"><Button variant="ghost" size="sm" onPress={() => setLarge(m.visualHtml!)}><Maximize2 />{t.large}</Button></div>
                    </div>
                  )}
                  {m.stopped && <p className="text-xs font-semibold text-muted-foreground">{t.stopped}</p>}
                  {m.error && (
                    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-destructive-soft p-2.5 text-sm text-destructive">
                      <span>{m.error}</span>
                      {m.retryText && <Button size="sm" variant="outline" onPress={() => setText(m.retryText!)}><RotateCcw />{t.tryAgain}</Button>}
                    </div>
                  )}
                  {!m.streaming && m.at && <span className="text-[11px] text-muted-foreground">{fmtTime(m.at, lang)}</span>}
                </TutorMsg>
              ))}
            </div>
            <div ref={endRef} className="h-2" />
          </div>

          {/* Desktop side panel: real lessons and progress of the chosen course */}
          <aside className="hidden flex-col gap-4 lg:flex">
            {data.tree && (
              <Card className="p-5">
                <h2 className="mb-3 font-bold">{t.lessons}</h2>
                {lessons.length === 0 ? <p className="text-sm text-muted-foreground">{t.noLessons}</p> : (
                  <ol className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
                    {lessons.map((l, i) => {
                      const now = l.id === data.lessonId;
                      return (
                        <li key={l.id ?? i}>
                          <a href={`#${contextHref(l.id)}`} aria-current={now ? 'true' : undefined} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted', now && 'bg-secondary font-semibold')}>
                            {l.status === 'completed' ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : l.status === 'active' ? <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-primary"><span className="size-2 rounded-full bg-primary" /></span> : <Circle className="size-5 shrink-0 text-muted-foreground/50" />}
                            <span dir="auto" className={cn('min-w-0 flex-1 truncate', l.status === 'completed' && 'text-muted-foreground')}>{l.title}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            )}
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="font-bold">{t.progress}</h2>
              {progressPct !== null && <Progress value={progressPct} label={lessons.length ? t.lessonsDone(num(doneCount, lang), num(lessons.length, lang)) : `${num(progressPct, lang)}%`} />}
              <Separator />
              <div className="rounded-lg bg-muted p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">{t.hintsUsed}</p><p className="mt-1 flex items-center gap-1.5 font-bold"><Lightbulb className="size-4 text-muted-foreground" />{num(hintsAsked, lang)}</p></div>
              {lesson?.status === 'completed' && <Badge tone="success" className="w-fit"><CheckCircle2 />{t.lesson}: {t.done}</Badge>}
            </Card>
          </aside>
        </div>
      )}
      {large && (
        <div role="dialog" aria-modal="true" aria-label={t.drawTitle} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-8" onClick={() => setLarge(null)} onKeyDown={(e) => { if (e.key === 'Escape') setLarge(null); }}>
          <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2"><p className="text-sm font-bold">{t.drawTitle}</p><Button variant="ghost" size="icon" aria-label={t.close} onPress={() => setLarge(null)} autoFocus><X /></Button></div>
            <iframe srcDoc={large} sandbox="" title={t.drawTitle} className="w-full flex-1 border-0 bg-white" />
          </div>
        </div>
      )}
    </AppShell>
  );
}
