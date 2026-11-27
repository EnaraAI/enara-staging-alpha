import { Captions, ChevronLeft, Clock, Mic, PhoneOff, Settings2, Volume2 } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { Badge, Button, Card, Dir, Progress, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';

const T = {
  en: {
    back: 'Back', title: 'Speaking practice: Travel', sub: 'English · B1 · Live tutor', live: 'Live',
    tutor: 'ENARA tutor', speaking: 'Speaking', listening: 'Listening', you: 'You', micOn: 'Mic on',
    capLead: 'That sounds lovely. Now tell me one thing:', capNow: 'what did you enjoy most', capTail: 'about Alexandria?',
    mute: 'Mute', captions: 'Captions', sound: 'Sound', settings: 'Settings', end: 'End session',
    used: 'Time used today', usedOf: '12 of 30 min', left: '18 minutes left today',
    transcript: 'Transcript', transcriptNote: 'Saved to this lesson so you and your teacher can read it later.',
    lines: [
      { who: 'tutor', at: '4:20 pm', text: 'Hello Salma! Today we will practise talking about a trip. Where did you go last summer?' },
      { who: 'you', at: '4:21 pm', text: 'I went to Alexandria with my family for one week.' },
      { who: 'tutor', at: '4:21 pm', text: 'Great sentence. One small thing: we say “for a week” or “for one week”. Both are fine! How did you travel there?' },
      { who: 'you', at: '4:22 pm', text: 'We travelled by train. It was very comfortable and fast.' },
    ],
    nowLine: 'That sounds lovely. Now tell me one thing: what did you enjoy most about Alexandria?',
    tutorWho: 'Tutor', youWho: 'You',
    tip: 'Speak when the ring turns green. You can interrupt at any time.',
  },
  ar: {
    back: 'رجوع', title: 'تدريب على المحادثة: السفر', sub: 'اللغة الإنجليزية · B1 · معلّم مباشر', live: 'مباشر',
    tutor: 'معلّم إنارة', speaking: 'يتحدث', listening: 'يستمع', you: 'أنتِ', micOn: 'الميكروفون يعمل',
    capLead: 'That sounds lovely. Now tell me one thing:', capNow: 'what did you enjoy most', capTail: 'about Alexandria?',
    mute: 'كتم الصوت', captions: 'الترجمة النصية', sound: 'الصوت', settings: 'الإعدادات', end: 'إنهاء الجلسة',
    used: 'الوقت المستخدم اليوم', usedOf: '12 من 30 دقيقة', left: 'بقيت 18 دقيقة اليوم',
    transcript: 'نص المحادثة', transcriptNote: 'يُحفَظ مع هذا الدرس لتقرئيه أنتِ ومعلّمتك لاحقًا.',
    lines: [
      { who: 'tutor', at: '4:20 م', text: 'Hello Salma! Today we will practise talking about a trip. Where did you go last summer?' },
      { who: 'you', at: '4:21 م', text: 'I went to Alexandria with my family for one week.' },
      { who: 'tutor', at: '4:21 م', text: 'Great sentence. One small thing: we say “for a week” or “for one week”. Both are fine! How did you travel there?' },
      { who: 'you', at: '4:22 م', text: 'We travelled by train. It was very comfortable and fast.' },
    ],
    nowLine: 'That sounds lovely. Now tell me one thing: what did you enjoy most about Alexandria?',
    tutorWho: 'المعلّم', youWho: 'أنتِ',
    tip: 'تحدّثي عندما تتحوّل الحلقة إلى اللون الأخضر. يمكنك المقاطعة في أي وقت.',
  },
};

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

function Wave({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-3.5 items-end gap-[3px]', className)} aria-hidden>
      {[60, 100, 45, 85, 55].map((h, i) => <span key={i} className="w-[3px] animate-pulse rounded-full bg-current" style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }} />)}
    </span>
  );
}

export default function StudentAvatar() {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-8">
        <a href="#" aria-label={t.back} className="grid size-tap shrink-0 place-items-center rounded-lg hover:bg-muted"><Dir><ChevronLeft className="size-5" /></Dir></a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight md:text-xl">{t.title}</h1>
          <p className="truncate text-xs text-muted-foreground md:text-sm">{t.sub}</p>
        </div>
        <Badge tone="danger" className="gap-1.5"><span className="size-2 animate-pulse rounded-full bg-destructive" />{t.live}</Badge>
        <span className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold tabular-nums md:flex"><Clock className="size-4 text-muted-foreground" />12:40</span>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Video tile */}
          <div className="relative h-[480px] overflow-hidden rounded-2xl bg-primary shadow-lg md:h-auto md:aspect-video">
            <TutorPortrait />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 md:p-4">
              <span className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" /><span className="relative size-2 rounded-full bg-success" /></span>
                {t.tutor}
              </span>
              <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground shadow"><Wave />{t.speaking}</span>
            </div>

            {/* Self view */}
            <div className="absolute end-3 top-14 flex w-24 flex-col overflow-hidden rounded-xl border-2 border-white/25 bg-[oklch(0.32_0.04_262)] shadow-lg md:end-4 md:top-16 md:w-36">
              <div className="relative grid aspect-[4/5] place-items-center">
                <svg viewBox="0 0 80 100" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
                  <circle cx="40" cy="42" r="16" fill="oklch(0.55 0.04 262)" />
                  <path d="M12 100c2-22 14-34 28-34s26 12 28 34Z" fill="oklch(0.55 0.04 262)" />
                </svg>
              </div>
              <div className="flex items-center justify-between gap-1 bg-black/35 px-2 py-1 text-[10px] font-semibold text-white md:text-xs">
                <span>{t.you}</span><span className="flex items-center gap-1 text-success"><Mic className="size-3" /></span>
              </div>
            </div>

            {/* Live captions */}
            <div className="absolute inset-x-3 bottom-3 md:inset-x-10 md:bottom-6">
              <p dir="ltr" className="mx-auto w-fit max-w-2xl rounded-xl bg-black/65 px-4 py-2.5 text-center text-[15px] leading-relaxed text-white/75 backdrop-blur md:text-lg">
                {t.capLead} <span className="text-white">{t.capNow}</span> <span className="text-white/40">{t.capTail}</span>
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-2.5 md:p-3">
            <div className="flex items-center gap-2">
              <Toggle aria-label={t.mute} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4"><Mic className="!size-5" /><span className="hidden md:inline">{t.mute}</span></Toggle>
              <Toggle defaultSelected aria-label={t.captions} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4"><Captions className="!size-5" /><span className="hidden md:inline">{t.captions}</span></Toggle>
              <Button variant="ghost" aria-label={t.sound} className="hidden size-12 rounded-full px-0 sm:inline-flex"><Volume2 className="!size-5" /></Button>
              <Button variant="ghost" aria-label={t.settings} className="hidden size-12 rounded-full px-0 sm:inline-flex"><Settings2 className="!size-5" /></Button>
            </div>
            <div className="hidden items-center gap-2 text-sm font-semibold text-success md:flex"><span className="grid size-7 place-items-center rounded-full bg-success-soft"><Mic className="size-3.5" /></span>{t.micOn}</div>
            <Button variant="destructive" className="h-12 rounded-full px-5"><PhoneOff />{t.end}</Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">{t.tip}</p>

          {/* Phone: time used */}
          <Card className="flex flex-col gap-2 p-4 lg:hidden">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold">{t.used}</span><span className="tabular-nums text-muted-foreground">{t.usedOf}</span></div>
            <Progress value={40} tone="success" />
          </Card>
        </div>

        {/* Desktop: time and transcript */}
        <aside className="hidden flex-col gap-4 lg:flex">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between"><h2 className="font-bold">{t.used}</h2><span className="text-sm tabular-nums text-muted-foreground">{t.usedOf}</span></div>
            <Progress value={40} tone="success" size="md" />
            <p className="text-xs text-muted-foreground">{t.left}</p>
          </Card>
          <Card className="flex min-h-0 flex-1 flex-col p-5">
            <h2 className="font-bold">{t.transcript}</h2>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">{t.transcriptNote}</p>
            <ol className="flex flex-col gap-3.5">
              {t.lines.map((l, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className={cn('text-xs font-bold', l.who === 'tutor' ? 'text-primary' : 'text-muted-foreground')}>{l.who === 'tutor' ? t.tutorWho : t.youWho} <span className="font-normal text-muted-foreground">· {l.at}</span></span>
                  <p dir="ltr" className="text-start text-sm leading-relaxed">{l.text}</p>
                </li>
              ))}
              <li className="flex flex-col gap-0.5 rounded-lg bg-accent/10 p-2.5 -mx-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-primary">{t.tutorWho}<Wave className="text-accent-foreground" /></span>
                <p dir="ltr" className="text-start text-sm leading-relaxed">{t.nowLine}</p>
              </li>
            </ol>
          </Card>
        </aside>
      </main>
    </div>
  );
}
