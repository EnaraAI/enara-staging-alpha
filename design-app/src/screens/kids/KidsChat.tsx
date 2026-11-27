import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Hand, Mic, RotateCcw, Send, Square } from 'lucide-react';
import { usePreview, useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { errorText, get, post } from '@/lib/api';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { cn } from '@/lib/utils';
import { KidAvatar, Owl } from './art';
import { hashQuery, plainText, speak, totalStars, useLatest, useStopSpeechOnLeave } from './data';

const T = {
  en: {
    home: 'Home', listen: 'Listen', tutor: 'Enara',
    hello: 'Say hello to Enara!', helloSay: 'Say hello to Enara! Tap the big button, or talk, or type.', helloText: 'Hello!', sayHello: 'Say hello',
    hearTutor: (s: string) => `Hear Enara: ${s}`, youSaid: (s: string) => `You said: ${s}`,
    talk: 'Tap to talk', stop: 'Tap to stop', listening: 'I am listening…', or: 'or',
    type: 'Type here', send: 'Send', thinking: 'Enara is thinking…',
    pick: 'Tap a word', hearWord: (w: string) => `Hear: ${w}`,
    failed: 'Enara could not answer just now.', retry: 'Try again', micOff: 'The microphone did not work. You can type instead.',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', tutor: 'إنارة',
    hello: 'قل مرحبًا لإنارة!', helloSay: 'قل مرحبًا لإنارة! المس الزر الكبير، أو تكلّم، أو اكتب.', helloText: 'مرحبًا!', sayHello: 'قل مرحبًا',
    hearTutor: (s: string) => `استمع إلى إنارة: ${s}`, youSaid: (s: string) => `قلتَ: ${s}`,
    talk: 'المس وتكلّم', stop: 'المس للإيقاف', listening: 'أنا أستمع…', or: 'أو',
    type: 'اكتب هنا', send: 'أرسل', thinking: 'إنارة تفكّر…',
    pick: 'المس كلمة', hearWord: (w: string) => `استمع: ${w}`,
    failed: 'لم تستطع إنارة الإجابة الآن.', retry: 'حاول مرة أخرى', micOff: 'لم يعمل الميكروفون. يمكنك الكتابة بدلًا من ذلك.',
  },
};

interface Pic { word: string; label: string }
interface Msg { from: 'tutor' | 'child'; text: string; pics?: Pic[] }

/** Picture words the tutor offered (kidsAudioVisual): 2 to 4 short words. The pictures live on the lms front end, so the words are shown.
 *  The word is sent back as the tutor wrote it (as today's kids app does); it is shown with spaces. */
function picWords(meta: any): Pic[] {
  const pics = Array.isArray(meta?.pics) ? meta.pics : [];
  const words: Pic[] = pics
    .map((p: any) => (typeof p?.word === 'string' ? p.word.trim() : ''))
    .filter((w: string) => w && w.length <= 30)
    .map((w: string) => ({ word: w, label: w.replace(/_/g, ' ') }));
  return words.length >= 2 ? words.slice(0, 4) : [];
}

export default function KidsChat() {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();
  useStopSpeechOnLeave();
  const [ctxRoute] = useState(() => { const q = hashQuery(); return { courseId: q.get('course') || undefined, lessonId: q.get('lesson') || undefined }; });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState<{ error: unknown; text: string; spoken?: boolean } | null>(null);
  const [text, setText] = useState('');
  const [micAllowed, setMicAllowed] = useState(false);
  const [listening, setListening] = useState(false);
  const [micProblem, setMicProblem] = useState(false);
  const recognition = useRef<any>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  // Whether this environment lets children use the microphone (same switch as today's kids app). Nothing is sent to the tutor here.
  useEffect(() => {
    get<{ microphone?: boolean }>('/api/me/tutor/speaking').then((s) => { if (live.current) setMicAllowed(s?.microphone === true); }, () => undefined);
  }, []);

  // The tutor answers only when the child sends something (never first).
  const send = useCallback(async (raw: string, opts?: { spoken?: boolean; retry?: boolean }) => {
    const said = raw.trim();
    if (!said || thinking) return;
    if (!opts?.retry) setMessages((m) => [...m, { from: 'child', text: said }]);
    setFailed(null); setThinking(true); setText('');
    try {
      let id = sessionId;
      if (!id) {
        const s = await post<any>('/api/me/tutor/sessions', { courseId: ctxRoute.courseId, lessonId: ctxRoute.courseId ? ctxRoute.lessonId : undefined });
        id = typeof s?.id === 'string' ? s.id : null;
        if (!id) throw new Error('no session');
        if (live.current) setSessionId(id);
      }
      const context = { ...(ctxRoute.courseId ? { courseId: ctxRoute.courseId, lessonId: ctxRoute.lessonId } : {}), ...(opts?.spoken ? { spoken: true } : {}) };
      const r = await post<any>(`/api/me/tutor/sessions/${encodeURIComponent(id)}/messages`, { text: said, ...(Object.keys(context).length ? { context } : {}) });
      const reply = plainText(r?.assistantMessage?.text);
      if (!live.current) return;
      if (!reply) throw new Error('empty reply');
      setMessages((m) => [...m, { from: 'tutor', text: reply, pics: picWords(r?.assistantMessage?.meta) }]);
    } catch (e) {
      if (live.current) setFailed({ error: e, text: said, spoken: opts?.spoken });
    } finally {
      if (live.current) setThinking(false);
    }
  }, [sessionId, thinking, ctxRoute]);
  const sendRef = useLatest(send);

  // Microphone: the browser's speech recognition turns speech into text; only the text is sent (as today's kids app does).
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : undefined;
  const micOn = micAllowed && !!SR;
  useEffect(() => {
    if (!micOn) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e: any) => { const said = String(e?.results?.[0]?.[0]?.transcript || '').trim(); setListening(false); if (said) sendRef.current(said, { spoken: true }); };
    r.onerror = () => { setListening(false); setMicProblem(true); };
    r.onend = () => setListening(false);
    recognition.current = r;
    return () => { try { r.abort(); } catch { /* already stopped */ } recognition.current = null; };
  }, [micOn, SR, sendRef]);
  const toggleMic = () => {
    const r = recognition.current;
    if (!r) return;
    if (listening) { try { r.stop(); } catch { /* ignore */ } setListening(false); return; }
    setMicProblem(false);
    try { r.start(); setListening(true); } catch { setListening(false); setMicProblem(true); }
  };

  const shown = messages.slice(-6);
  const lastTutor = [...messages].reverse().find((m) => m.from === 'tutor');
  const words = !thinking && lastTutor && messages[messages.length - 1] === lastTutor ? lastTutor.pics ?? [] : [];
  const onType = (e: FormEvent) => { e.preventDefault(); void send(text); };

  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} title={t.tutor} stars={totalStars(user)}>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-10">
        {/* Conversation: short bubbles, every tutor bubble can be heard */}
        <ol aria-live="polite" className="flex min-w-0 flex-col gap-4">
          {messages.length === 0 && (
            <TutorBubble text={t.hello} say={t.hearTutor(t.helloSay)} onSay={() => speak(t.helloSay, lang)} current />
          )}
          {shown.map((m, i) => {
            const older = i < shown.length - 2;
            return m.from === 'tutor'
              ? <TutorBubble key={messages.length - shown.length + i} text={m.text} say={t.hearTutor(m.text)} onSay={() => speak(m.text, lang)} current={i === shown.length - 1} earlier={older} />
              : <ChildBubble key={messages.length - shown.length + i} text={m.text} label={t.youSaid(m.text)} earlier={older} />;
          })}
          {thinking && (
            <li role="status" className="flex items-center gap-3">
              <Owl className="size-14 shrink-0 animate-bounce motion-reduce:animate-none" />
              <span className="rounded-3xl border-2 bg-card px-5 py-3 text-xl font-extrabold text-muted-foreground">{t.thinking}</span>
            </li>
          )}
          {failed && (
            <li role="alert" className="flex flex-col items-start gap-3 rounded-3xl bg-destructive-soft p-4">
              <p className="text-[19px] font-bold text-destructive">{t.failed} {errorText(failed.error, lang)}</p>
              <KidButton tone="white" className="text-xl" onPress={() => void send(failed.text, { spoken: failed.spoken, retry: true })}><RotateCcw strokeWidth={3} />{t.retry}</KidButton>
            </li>
          )}
        </ol>

        {/* Answer: the tutor's picture words, or say hello, or talk, or type */}
        <section className="flex min-w-0 flex-col items-center gap-4 rounded-[2rem] border-2 bg-card p-4 md:gap-5 md:p-8">
          {words.length > 0 && (
            <div role="group" aria-label={t.pick} className="grid w-full grid-cols-2 gap-3">
              {words.map((w) => (
                <div key={w.word} className="flex min-w-0 items-center gap-2">
                  <KidButton tone="white" aria-label={w.label} className="h-auto min-w-0 flex-1 px-3 py-2 text-2xl" onPress={() => { speak(w.label, 'en'); void send(w.word); }}>
                    <span lang="en" dir="ltr" className="break-words text-center leading-tight">{w.label}</span>
                  </KidButton>
                  <SpeakButton label={t.hearWord(w.label)} onPress={() => speak(w.label, 'en')} className="hidden sm:grid" />
                </div>
              ))}
            </div>
          )}
          {messages.length === 0 && (
            <KidButton className="w-full text-2xl" isDisabled={thinking} onPress={() => void send(t.helloText)}><Hand strokeWidth={2.5} />{t.sayHello}</KidButton>
          )}
          {micOn && (
            <>
              {(words.length > 0 || messages.length === 0) && <Divider label={t.or} />}
              <KidButton aria-label={listening ? t.stop : t.talk} aria-pressed={listening} isDisabled={thinking} onPress={toggleMic}
                className={cn('size-28 rounded-full p-0 md:size-36 [&_svg]:size-12 md:[&_svg]:size-14', listening && 'ring-8 ring-primary/30')}>
                {listening ? <Square strokeWidth={2.5} className="fill-current" /> : <Mic strokeWidth={2.5} />}
              </KidButton>
              <p className="text-[19px] font-bold text-muted-foreground">{listening ? t.listening : t.talk}</p>
              {micProblem && <p role="alert" className="text-center text-[18px] font-bold text-destructive">{t.micOff}</p>}
            </>
          )}
          <Divider label={t.or} />
          <form onSubmit={onType} className="flex w-full items-center gap-3">
            <input
              value={text} onChange={(e) => setText(e.target.value)} dir="auto" maxLength={500}
              aria-label={t.type} placeholder={t.type}
              className="h-[75px] min-w-0 flex-1 rounded-2xl border-2 bg-background px-4 text-[19px] font-bold outline-none focus-visible:ring-4 focus-visible:ring-ring"
            />
            <KidButton type="submit" tone="sun" aria-label={t.send} isDisabled={thinking || !text.trim()} className="px-0"><Dir><Send /></Dir></KidButton>
          </form>
        </section>
      </div>
    </KidsShell>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-3">
      <span className="h-0.5 flex-1 rounded bg-border" /><span className="text-[18px] font-bold text-muted-foreground">{label}</span><span className="h-0.5 flex-1 rounded bg-border" />
    </div>
  );
}

function TutorBubble({ text, say, onSay, current, earlier, pic }: { text: string; say: string; onSay: () => void; current?: boolean; earlier?: boolean; pic?: ReactNode }) {
  return (
    <li className={cn('relative items-end gap-3 pt-11 md:pt-0', earlier ? 'hidden md:flex' : 'flex')}>
      {/* The tutor owl: a corner badge on phone, beside the bubble on wider screens */}
      <Owl className="absolute top-0 start-3 z-[1] size-12 md:static md:size-16 md:shrink-0" />
      <div className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-3xl border-2 bg-card p-3 ps-4 md:rounded-es-md md:ps-3', current && 'border-primary/40 shadow-[0_6px_0_var(--border)]')}>
        {pic && <span className="grid shrink-0 place-items-center rounded-2xl bg-muted p-1">{pic}</span>}
        <p dir="auto" className="min-w-0 flex-1 whitespace-pre-line break-words text-xl font-extrabold leading-snug md:text-2xl">{text}</p>
        <SpeakButton label={say} onPress={onSay} />
      </div>
    </li>
  );
}

function ChildBubble({ text, label, earlier }: { text: string; label: string; earlier?: boolean }) {
  return (
    <li className={cn('items-center justify-end gap-3', earlier ? 'hidden md:flex' : 'flex')}>
      <span aria-label={label} className="min-w-0 rounded-3xl rounded-ee-md bg-primary px-5 py-3 text-2xl font-extrabold text-primary-foreground">
        <span dir="auto" className="break-words">{text}</span>
      </span>
      <KidAvatar className="size-14 shrink-0" />
    </li>
  );
}
