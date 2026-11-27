// Live avatar tutor (teens and adults). What is wired to lms-test:
//   GET /api/me/tutor-face          the tutor's face and name the school (or the learner) chose
//   GET /api/me/courses             the course the call is about (?course=… or the first enrolled course)
//   GET /api/me/tutor/sessions      past live calls (mode 'voice'), only when the learner asks to see them
//   GET /api/me/tutor/sessions/:id  one past call's transcript
// Not connected yet: a live call (POST /api/avatar/session → session_token, then the Anam client through the relay
// rt.enara.app, heartbeat, DELETE /api/avatar/session/:id) needs the Anam JS SDK, which this app does not include
// (today's app uses @anam-ai/js-sdk 4.29.1). "Start session" explains this and makes no call: a session token is a paid
// provider session, so none is created until the SDK is in place. The API gives no "time used today" or daily-limit read.
import { useState } from 'react';
import { Captions, ChevronLeft, Clock, History, Info, MessageCircle, Mic, Video } from 'lucide-react';
import { get } from '@/lib/api';
import { num, usePreview, useT } from '@/lib/preview';
import { SessionMenu } from '@/components/shell';
import { Alert, Badge, Button, Card, Dir, LinkButton, Skeleton, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { InlineError, NotAvailable, arr, fmtDate, fmtTime, mediaUrl, str, useHashQuery, useLoad, type CourseSummary } from './common';

const T = {
  en: {
    back: 'Back', title: 'Live tutor', sub: 'Speaking practice with your tutor', notConnected: 'Not connected',
    tutor: 'ENARA tutor', you: 'You', mute: 'Mute', captions: 'Captions', start: 'Start session',
    notYetTitle: 'The live tutor is not connected in this app yet',
    notYet: 'Live video calls need the tutor’s video service (the Anam video SDK), which is not installed in this app yet. Nothing was started and nothing was charged. You can use the chat tutor now.',
    useChat: 'Use the chat tutor',
    used: 'Time used today', limit: 'Daily limit',
    transcript: 'Past live calls', transcriptNote: 'Calls are saved with your tutor chats so you and your teacher can read them later.',
    showPast: 'Show my past calls', noPast: 'No live calls yet.', messages: (n: string) => `${n} messages`, backToList: 'All past calls',
    tutorWho: 'Tutor', youWho: 'You', tip: 'When the live tutor is connected, speak when the ring turns green. You can interrupt at any time.',
    faceFailed: 'We couldn’t load your tutor’s face.',
  },
  ar: {
    back: 'رجوع', title: 'المعلّم المرئي', sub: 'تدريب على المحادثة مع معلّمك', notConnected: 'غير متصل',
    tutor: 'معلّم إنارة', you: 'أنت', mute: 'كتم الصوت', captions: 'الترجمة النصية', start: 'بدء الجلسة',
    notYetTitle: 'المعلّم المرئي غير متصل في هذا التطبيق بعد',
    notYet: 'تحتاج المكالمات المرئية المباشرة إلى خدمة الفيديو الخاصة بالمعلّم (حزمة Anam للفيديو)، وهي غير مثبّتة في هذا التطبيق بعد. لم تبدأ أي جلسة ولم يُخصم أي رصيد. يمكنك استخدام المحادثة الكتابية مع المعلّم الآن.',
    useChat: 'المحادثة الكتابية مع المعلّم',
    used: 'الوقت المستخدم اليوم', limit: 'الحد اليومي',
    transcript: 'المكالمات السابقة', transcriptNote: 'تُحفَظ المكالمات مع محادثاتك مع المعلّم لتقرأها أنت ومعلّمك لاحقًا.',
    showPast: 'عرض مكالماتي السابقة', noPast: 'لا توجد مكالمات مباشرة بعد.', messages: (n: string) => `${n} رسالة`, backToList: 'كل المكالمات السابقة',
    tutorWho: 'المعلّم', youWho: 'أنت', tip: 'عند اتصال المعلّم المرئي، تحدّث عندما تتحوّل الحلقة إلى اللون الأخضر. يمكنك المقاطعة في أي وقت.',
    faceFailed: 'تعذّر تحميل صورة معلّمك.',
  },
};

interface Face { avatarId?: string; name?: string; imageUrl?: string }
interface PastCall { id?: string; title?: string; mode?: string; messageCount?: number; lastMessageAt?: string; courseId?: string }
interface CallDoc { id?: string; title?: string; messages?: { id?: string; role?: string; text?: string; timestamp?: string }[] }

/** Stylised tutor portrait: shapes and gradients only, no external image. */
function TutorPortrait() {
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <radialGradient id="av-bg" cx="50%" cy="35%" r="80%"><stop offset="0" stopColor="oklch(0.45 0.08 250)" /><stop offset="1" stopColor="oklch(0.24 0.06 263)" /></radialGradient>
        <linearGradient id="av-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="oklch(0.8 0.07 60)" /><stop offset="1" stopColor="oklch(0.72 0.08 55)" /></linearGradient>
        <linearGradient id="av-scarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="oklch(0.7 0.09 190)" /><stop offset="1" stopColor="oklch(0.55 0.09 200)" /></linearGradient>
        <linearGradient id="av-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="oklch(0.92 0.02 90)" /><stop offset="1" stopColor="oklch(0.84 0.03 85)" /></linearGradient>
        <radialGradient id="av-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="oklch(0.82 0.15 78)" stopOpacity=".28" /><stop offset="1" stopColor="oklch(0.82 0.15 78)" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="640" height="400" fill="url(#av-bg)" />
      {/* soft shelves / room hint */}
      <rect x="40" y="70" width="120" height="8" rx="4" fill="white" opacity=".06" />
      <rect x="52" y="40" width="18" height="30" rx="3" fill="white" opacity=".07" />
      <rect x="76" y="48" width="14" height="22" rx="3" fill="white" opacity=".05" />
      <rect x="480" y="96" width="120" height="8" rx="4" fill="white" opacity=".06" />
      <circle cx="560" cy="74" r="20" fill="oklch(0.6 0.12 150)" opacity=".18" />
      <circle cx="320" cy="190" r="190" fill="url(#av-glow)" />
      {/* shoulders */}
      <path d="M140 400c10-74 80-106 180-106s170 32 180 106Z" fill="url(#av-top)" />
      {/* headscarf: covers the head and drapes over the chest */}
      <path d="M320 70c-58 0-86 46-86 102 0 42 12 76 28 100-26 18-48 52-54 128h224c-6-76-28-110-54-128 16-24 28-58 28-100 0-56-28-102-86-102Z" fill="url(#av-scarf)" />
      <path d="M262 272q58 34 116 0" stroke="oklch(0.5 0.09 200)" strokeWidth="3" fill="none" opacity=".5" />
      <path d="M300 330q20 30 18 70M352 318q-10 40 4 82" stroke="oklch(0.5 0.09 200)" strokeWidth="3" fill="none" opacity=".35" strokeLinecap="round" />
      {/* face */}
      <ellipse cx="320" cy="180" rx="54" ry="66" fill="url(#av-skin)" />
      {/* scarf edge framing the forehead */}
      <path d="M264 166c4-44 26-70 56-70s52 26 56 70c-12-30-30-46-56-46s-44 16-56 46Z" fill="oklch(0.64 0.09 192)" />
      {/* brows, eyes, cheeks, mouth (speaking) */}
      <path d="M287 158q12-7 24 0M329 158q12-7 24 0" stroke="oklch(0.33 0.04 50)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="299" cy="174" rx="6" ry="7" fill="oklch(0.25 0.03 260)" />
      <ellipse cx="341" cy="174" rx="6" ry="7" fill="oklch(0.25 0.03 260)" />
      <circle cx="301" cy="172" r="1.8" fill="white" />
      <circle cx="343" cy="172" r="1.8" fill="white" />
      <ellipse cx="288" cy="198" rx="10" ry="6" fill="oklch(0.72 0.12 25)" opacity=".35" />
      <ellipse cx="352" cy="198" rx="10" ry="6" fill="oklch(0.72 0.12 25)" opacity=".35" />
      <path d="M314 186q6 6 12 0" stroke="oklch(0.6 0.08 50)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M304 210q16 16 32 0q-16 6-32 0Z" fill="oklch(0.45 0.12 20)" stroke="oklch(0.45 0.12 20)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M309 212q11 4 22 0" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export default function StudentAvatar() {
  const t = useT(T);
  const { lang } = usePreview();
  const q = useHashQuery();
  const qCourse = q.get('course') ?? '';
  const [explain, setExplain] = useState(false);

  // Cheap reads only: no avatar session, no AI call.
  const ctx = useLoad(async (signal) => {
    const [face, courses] = await Promise.all([
      get<{ current?: Face | null }>('/api/me/tutor-face', signal).then((r) => ({ ok: true as const, face: r?.current ?? null }), (e) => ({ ok: false as const, error: e })),
      get<CourseSummary[]>('/api/me/courses', signal).catch(() => []),
    ]);
    const list = arr<CourseSummary>(courses);
    return { face, course: list.find((c) => c.id === qCourse) ?? list[0] ?? null };
  }, qCourse);

  const face = ctx.data?.face.ok ? ctx.data.face.face : null;
  const img = mediaUrl(face?.imageUrl);
  const tutorName = face?.name || t.tutor;
  const course = ctx.data?.course;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-8">
        <a href={qCourse ? `#/student/chat?course=${encodeURIComponent(qCourse)}` : '#/student'} aria-label={t.back} className="grid size-tap shrink-0 place-items-center rounded-lg hover:bg-muted"><Dir><ChevronLeft className="size-5" /></Dir></a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight md:text-xl">{t.title}</h1>
          <p dir="auto" className="truncate text-xs text-muted-foreground md:text-sm">{[course?.title, t.sub].filter(Boolean).join(' · ')}</p>
        </div>
        <Badge tone="neutral" className="gap-1.5"><span className="size-2 rounded-full bg-muted-foreground" />{t.notConnected}</Badge>
        <SessionMenu compact />
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Video tile: the chosen tutor's face, waiting */}
          <div className="relative h-[420px] overflow-hidden rounded-2xl bg-primary shadow-lg md:aspect-video md:h-auto">
            {ctx.loading && !ctx.data ? <Skeleton className="absolute inset-0 rounded-none" /> : img ? <img src={img} alt={tutorName} className="absolute inset-0 size-full object-cover" /> : <TutorPortrait />}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 md:p-4">
              <span dir="auto" className="flex min-w-0 items-center gap-2 truncate rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <span className="size-2 shrink-0 rounded-full bg-white/60" />{tutorName}
              </span>
            </div>
            <div className="absolute end-3 top-14 flex w-24 flex-col overflow-hidden rounded-xl border-2 border-white/25 bg-[oklch(0.32_0.04_262)] shadow-lg md:end-4 md:top-16 md:w-36">
              <div className="relative grid aspect-[4/5] place-items-center">
                <svg viewBox="0 0 80 100" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
                  <circle cx="40" cy="42" r="16" fill="oklch(0.55 0.04 262)" />
                  <path d="M12 100c2-22 14-34 28-34s26 12 28 34Z" fill="oklch(0.55 0.04 262)" />
                </svg>
              </div>
              <div className="flex items-center justify-between gap-1 bg-black/35 px-2 py-1 text-[10px] font-semibold text-white md:text-xs"><span>{t.you}</span><Mic className="size-3 opacity-60" /></div>
            </div>
            {explain && (
              <div className="absolute inset-x-3 bottom-3 md:inset-x-10 md:bottom-6">
                <p className="mx-auto w-fit max-w-2xl rounded-xl bg-black/70 px-4 py-2.5 text-center text-sm leading-relaxed text-white backdrop-blur md:text-base">{t.notYetTitle}</p>
              </div>
            )}
          </div>
          {ctx.data && !ctx.data.face.ok && <InlineError error={ctx.data.face.error} onRetry={ctx.reload} />}

          {/* Controls: only Start works; the rest wait for a live call */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-2.5 md:p-3">
            <div className="flex items-center gap-2">
              <Toggle isDisabled aria-label={t.mute} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4"><Mic className="!size-5" /><span className="hidden md:inline">{t.mute}</span></Toggle>
              <Toggle isDisabled aria-label={t.captions} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4"><Captions className="!size-5" /><span className="hidden md:inline">{t.captions}</span></Toggle>
            </div>
            <Button className="h-12 rounded-full px-5" onPress={() => setExplain(true)}><Video />{t.start}</Button>
          </div>

          {explain && (
            <Alert tone="info" icon={<Info />} title={t.notYetTitle}>
              <p>{t.notYet}</p>
              <LinkButton href={qCourse ? `#/student/chat?course=${encodeURIComponent(qCourse)}` : '#/student/chat'} variant="outline" size="sm" className="mt-2"><MessageCircle />{t.useChat}</LinkButton>
            </Alert>
          )}
          <p className="text-center text-xs text-muted-foreground">{t.tip}</p>

          {/* Phone: time used */}
          <Card className="flex flex-col gap-2 p-4 lg:hidden">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{t.used}</span><NotAvailable /></div>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{t.limit}</span><NotAvailable /></div>
          </Card>
          <div className="lg:hidden"><PastCalls /></div>
        </div>

        <aside className="hidden flex-col gap-4 lg:flex">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Clock className="size-4 text-muted-foreground" />{t.used}</h2><NotAvailable /></div>
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t.limit}</h2><NotAvailable /></div>
          </Card>
          <PastCalls />
        </aside>
      </main>
    </div>
  );
}

/** Past live calls: loaded only when the learner asks (the list request also wakes the tutor model). */
function PastCalls() {
  const t = useT(T);
  const { lang } = usePreview();
  const [shown, setShown] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(async (signal) => (shown ? arr<PastCall>(await get<PastCall[]>('/api/me/tutor/sessions?limit=50', signal)).filter((s) => s?.mode === 'voice') : []), shown ? 'shown' : 'hidden');
  const call = useLoad(async (signal) => (openId ? await get<CallDoc>(`/api/me/tutor/sessions/${encodeURIComponent(openId)}`, signal) : null), openId ?? '');
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-5">
      <h2 className="flex items-center gap-2 font-bold"><History className="size-4 text-muted-foreground" />{t.transcript}</h2>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">{t.transcriptNote}</p>
      {!shown ? <Button variant="outline" onPress={() => setShown(true)}>{t.showPast}</Button>
        : list.loading ? <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : list.error ? <InlineError error={list.error} onRetry={list.reload} />
        : openId ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setOpenId(null)} className="flex w-fit items-center gap-1 text-sm font-semibold text-primary"><Dir><ChevronLeft className="size-4" /></Dir>{t.backToList}</button>
            {call.loading ? <Skeleton className="h-32" /> : call.error ? <InlineError error={call.error} onRetry={call.reload} /> : (
              <ol className="flex max-h-[60vh] flex-col gap-3.5 overflow-y-auto">
                {arr<NonNullable<CallDoc['messages']>[number]>(call.data?.messages).filter((m) => str(m?.text)).map((m, i) => (
                  <li key={m.id ?? i} className="flex flex-col gap-0.5">
                    <span className={cn('text-xs font-bold', m.role === 'user' ? 'text-muted-foreground' : 'text-primary')}>{m.role === 'user' ? t.youWho : t.tutorWho}{m.timestamp && <span className="font-normal text-muted-foreground"> · {fmtTime(m.timestamp, lang)}</span>}</span>
                    <p dir="auto" className="whitespace-pre-wrap break-words text-start text-sm leading-relaxed">{m.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : arr<PastCall>(list.data).length === 0 ? <p className="text-sm text-muted-foreground">{t.noPast}</p> : (
          <ul className="flex flex-col gap-1">
            {arr<PastCall>(list.data).map((s, i) => (
              <li key={s.id ?? i}>
                <button type="button" onClick={() => s.id && setOpenId(s.id)} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-start hover:bg-muted">
                  <span dir="auto" className="w-full truncate text-sm font-semibold">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{[fmtDate(s.lastMessageAt, lang), typeof s.messageCount === 'number' ? t.messages(num(s.messageCount, lang)) : ''].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
