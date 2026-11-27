// Assignments (teens and adults), wired to lms-test (Phase 3 teaching workflow; 404 FEATURE_DISABLED when the school has it off):
//   GET  /api/me/assignments                                  the list (#/student/assignment)
//   GET  /api/me/assignments/:id                              one assignment (#/student/assignment?id=…)
//   POST /api/me/assignments/:id/attempts                     start or continue (only when the learner presses it: it can start a timer)
//   PUT  /api/me/assignments/:id/attempts/:attemptId/draft    { answers } save (every 15 s while changed, and on "Save draft")
//   POST /api/me/assignments/:id/attempts/:attemptId/submit   { answers }
//   POST /api/me/tutor/handoff { kind: 'assignment' }          "Get help from the tutor" (opens a chat; no AI call until the learner writes)
// Answers are strings keyed by question id, as today's app sends them: the option text for multiple choice and true/false,
// the option id (or a JSON array of ids) for engine choice items, plain text otherwise.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TextField as AriaTextField, Input } from 'react-aria-components';
import { ArrowRight, CalendarClock, CheckCircle2, Circle, ClipboardList, CloudCheck, FileText, Info, Loader2, MessageCircle, Send, Timer } from 'lucide-react';
import { go } from '@/App';
import { get, post, put } from '@/lib/api';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, Checkbox, Dir, Label, LinkButton, Progress, Radio, RadioGroup, inputClass } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';
import {
  ErrorState, InlineError, PageSkeleton, RichText, StateCard, arr, daysLeftLabel, daysUntil, errMsg, fmtDateTime, fmtTime, getOrOff, isNum, isOff, statusOf,
  tutorHandoff, useHashQuery, useLoad, type AssignmentDetail, type AssignmentItem, type AttemptResult,
} from './common';

const T = {
  en: {
    list: 'Assignments', listSub: 'Work your teachers set', toDo: 'To do', submitted: 'Submitted', closed: 'Missed or closed',
    empty: 'No assignments yet. Work your teachers set will appear here.', off: 'Assignments are not turned on for your school yet.',
    due: 'Due', points: 'Points', time: 'Time limit', attempts: 'Attempts', minutes: (n: string) => `${n} min`, noLimit: 'No time limit',
    usedOf: (u: string, m: string) => `${u} of ${m} used`, extended: 'Extended for you', lateAccepted: (d: string) => `Late work accepted until ${d} and marked late.`,
    instrTitle: 'Instructions', start: 'Start', continue: 'Continue', again: 'Start another attempt', notOpen: (d: string) => `Opens ${d}.`, closedNow: 'This assignment is closed.',
    timerNote: (n: string) => `The ${n}-minute timer starts when you press Start.`,
    spoken: 'This exam is done by talking with an examiner. It is not available in this app yet; open it in the ENARA app.',
    saved: (t: string) => `Saved ${t}`, saving: 'Saving…', notSaved: 'Not saved yet', saveFailed: 'Not saved. We will try again.',
    q: 'Question', mc: 'Multiple choice', tf: 'True or false', short: 'Short answer', essay: 'Writing', other: 'Question', pts: (n: string) => `${n} points`, pt: '1 point',
    answer: 'Your answer', words: 'words', chooseAll: 'Choose all that apply', chooseOne: 'Choose one', true: 'True', false: 'False', number: 'Number (and unit if needed)',
    unsupported: 'This question type is not available in this app yet. Open the assignment in the ENARA app to answer it.',
    marked: 'How this is marked',
    answered: 'answered', of: 'of', saveDraft: 'Save draft', submit: 'Submit', submitHint: 'You can’t change your answers after you submit.',
    overview: 'Questions', notAnswered: 'Not answered yet', done: 'Answered',
    confirmTitle: 'Submit your work?', confirmText: (a: string, n: string) => `${a} of ${n} questions answered. You can’t change answers after submitting.`, keep: 'Keep working', submitNow: 'Submit now',
    sent: 'Submitted. Your work was received.', yourWork: 'Your submissions', viewResult: 'View result',
    processing: { grading: 'ENARA is marking your answers. Your result appears here when it is ready.', with_teacher: 'Your teacher is marking this.', delayed: 'Your result is taking longer than usual. Your teacher has been told; no score has been given yet.' } as Record<string, string>,
    submittedAt: (d: string) => `Submitted ${d}`, late: 'late', timeLeft: 'left', timeUp: 'Time is up. Submitting what you saved.',
    help: 'Get help from the tutor', helpHints: 'Get help from the tutor (hints only)', back: 'All assignments',
  },
  ar: {
    list: 'الواجبات', listSub: 'الأعمال التي يكلّفك بها معلّموك', toDo: 'مطلوب', submitted: 'مُسلَّم', closed: 'فائت أو مغلق',
    empty: 'لا توجد واجبات بعد. ستظهر هنا الأعمال التي يكلّفك بها معلّموك.', off: 'الواجبات غير مفعّلة في مدرستك بعد.',
    due: 'موعد التسليم', points: 'الدرجات', time: 'الوقت المحدد', attempts: 'المحاولات', minutes: (n: string) => `${n} دقيقة`, noLimit: 'بلا وقت محدد',
    usedOf: (u: string, m: string) => `استُخدمت ${u} من ${m}`, extended: 'مُدِّد لك', lateAccepted: (d: string) => `يُقبَل العمل المتأخر حتى ${d} ويُعلَّم بأنه متأخر.`,
    instrTitle: 'التعليمات', start: 'ابدأ', continue: 'تابِع', again: 'ابدأ محاولة أخرى', notOpen: (d: string) => `يُفتح ${d}.`, closedNow: 'هذا الواجب مغلق.',
    timerNote: (n: string) => `يبدأ مؤقّت مدته ${n} دقيقة عند الضغط على «ابدأ».`,
    spoken: 'يُؤدّى هذا الاختبار بالتحدث مع ممتحِن، وهو غير متاح في هذا التطبيق بعد؛ افتحه في تطبيق إنارة.',
    saved: (t: string) => `حُفِظ ${t}`, saving: 'جارٍ الحفظ…', notSaved: 'لم يُحفَظ بعد', saveFailed: 'لم يُحفَظ. سنعيد المحاولة.',
    q: 'السؤال', mc: 'اختيار من متعدد', tf: 'صواب أو خطأ', short: 'إجابة قصيرة', essay: 'كتابة', other: 'سؤال', pts: (n: string) => `${n} درجات`, pt: 'درجة واحدة',
    answer: 'إجابتك', words: 'كلمة', chooseAll: 'اختر كل الإجابات الصحيحة', chooseOne: 'اختر إجابة واحدة', true: 'صواب', false: 'خطأ', number: 'العدد (ووحدته إن لزم)',
    unsupported: 'هذا النوع من الأسئلة غير متاح في هذا التطبيق بعد. افتح الواجب في تطبيق إنارة للإجابة عنه.',
    marked: 'طريقة التصحيح',
    answered: 'تمت الإجابة', of: 'من', saveDraft: 'حفظ المسودة', submit: 'تسليم', submitHint: 'لا يمكنك تعديل إجاباتك بعد التسليم.',
    overview: 'الأسئلة', notAnswered: 'لم تُجَب بعد', done: 'تمت الإجابة',
    confirmTitle: 'هل تريد تسليم عملك؟', confirmText: (a: string, n: string) => `أجبتَ عن ${a} من ${n} أسئلة. لا يمكنك تعديل الإجابات بعد التسليم.`, keep: 'متابعة العمل', submitNow: 'التسليم الآن',
    sent: 'تم التسليم. وصلنا عملك.', yourWork: 'تسليماتك', viewResult: 'عرض النتيجة',
    processing: { grading: 'تصحّح إنارة إجاباتك الآن، وستظهر نتيجتك هنا عندما تجهز.', with_teacher: 'يصحّح معلّمك هذا العمل.', delayed: 'تتأخر نتيجتك أكثر من المعتاد. أُبلغ معلّمك، ولم تُمنح أي درجة بعد.' } as Record<string, string>,
    submittedAt: (d: string) => `سُلِّم ${d}`, late: 'متأخر', timeLeft: 'متبقٍ', timeUp: 'انتهى الوقت. يجري تسليم ما حفظته.',
    help: 'اطلب المساعدة من المعلّم', helpHints: 'اطلب المساعدة من المعلّم (تلميحات فقط)', back: 'كل الواجبات',
  },
};

interface Question {
  id: string; type?: string; text?: string; options?: string[]; points?: number;
  rubric?: { criteria?: { id?: string; title?: string; maxPoints?: number; levels?: { label?: string; points?: number }[] }[] };
  engine?: { type?: string; options?: unknown; language?: string; multi?: boolean; source?: string };
}
interface Work { attempt: { id: string; expiresAt?: string | null; draftAnswers?: Record<string, unknown>; draftSavedAt?: string | null }; questions: Question[]; format?: string }

const SUPPORTED_ENGINE = ['mcq', 'true_false', 'short_answer', 'essay', 'numeric'];
const kindOf = (q: Question, t: typeof T.en) => {
  const k = q.type === 'engine' ? q.engine?.type : q.type;
  if (k === 'multiple-choice' || k === 'mcq') return t.mc;
  if (k === 'true-false' || k === 'true_false') return t.tf;
  if (k === 'short-answer' || k === 'short_answer' || k === 'numeric') return t.short;
  if (k === 'open-response' || k === 'essay') return t.essay;
  return t.other;
};
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const optionClass = 'rounded-xl border px-3 data-[selected]:border-primary data-[selected]:bg-secondary data-[hovered]:bg-muted';

export default function StudentAssignment() {
  const q = useHashQuery();
  const id = q.get('id') ?? '';
  return id ? <AssignmentView key={id} id={id} /> : <AssignmentList />;
}

// ---------------------------------------------------------------- List

function AssignmentList() {
  const t = useT(T);
  const { lang } = usePreview();
  const res = useLoad((signal) => getOrOff<{ assignments?: AssignmentItem[] }>('/api/me/assignments', signal), 'list');
  const list = res.data && !isOff(res.data) ? arr<AssignmentItem>(res.data.assignments) : [];
  const todo = list.filter((a) => a.canSubmit && (a.status === 'not_started' || a.status === 'in_progress')).sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
  const sent = list.filter((a) => !todo.includes(a) && a.status !== 'missing' && a.status !== 'not_started' && a.status !== 'in_progress');
  const closed = list.filter((a) => !todo.includes(a) && !sent.includes(a));
  const nav = useStudentNav({ workBadge: todo.length });
  const group = (title: string, items: AssignmentItem[]) => items.length > 0 && (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((a, i) => {
          const s = statusOf(a.status, lang);
          const days = daysUntil(a.dueAt);
          return (
            <a key={a.id ?? i} href={`#/student/assignment?id=${encodeURIComponent(a.id ?? '')}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="flex h-full flex-col gap-3 p-4 hover:bg-muted/40">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info"><FileText className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="break-words font-bold leading-snug">{a.title}</p>
                    {a.dueAt && <p className="mt-0.5 text-sm text-muted-foreground">{t.due}: {fmtDateTime(a.dueAt, lang)}</p>}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Badge tone={s.tone}>{s.label}{a.late ? ` · ${t.late}` : ''}</Badge>
                  {todo.includes(a) && days !== null && <Badge tone={days <= 2 ? 'warning' : 'neutral'}>{daysLeftLabel(days, lang)}</Badge>}
                  {isNum(a.timeLimitMinutes) && a.timeLimitMinutes > 0 && <Badge tone="neutral"><Timer />{t.minutes(num(a.timeLimitMinutes, lang))}</Badge>}
                </div>
              </Card>
            </a>
          );
        })}
      </div>
    </section>
  );
  return (
    <AppShell nav={nav} active="work" title={t.list} subtitle={t.listSub}>
      {res.loading && !res.data ? <PageSkeleton rows={3} aside={false} /> : res.error ? (
        <div className="mx-auto max-w-xl"><ErrorState error={res.error} onRetry={res.reload} /></div>
      ) : res.data && isOff(res.data) ? (
        <div className="mx-auto max-w-xl"><StateCard tone="muted" icon={<ClipboardList />} title={t.list} text={t.off} /></div>
      ) : list.length === 0 ? (
        <div className="mx-auto max-w-xl"><StateCard icon={<ClipboardList />} title={t.list} text={t.empty} /></div>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{group(t.toDo, todo)}{group(t.submitted, sent)}{group(t.closed, closed)}</div>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------- One assignment

function AssignmentView({ id }: { id: string }) {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const detail = useLoad((signal) => get<AssignmentDetail>(`/api/me/assignments/${encodeURIComponent(id)}`, signal), id);
  const [work, setWork] = useState<Work | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState(false);
  const dirty = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const a = detail.data?.assignment;
  const spoken = a?.format === 'conversation' || a?.format === 'english_conversation';

  const start = async () => {
    setBusy(true); setActionError(null); setFlash(false);
    try {
      const r = await post<Partial<Work>>(`/api/me/assignments/${encodeURIComponent(id)}/attempts`);
      if (!r?.attempt?.id) throw new Error('bad attempt');
      const qs = arr<Question>(r.questions).filter((x) => x && typeof x.id === 'string');
      setWork({ attempt: r.attempt as Work['attempt'], questions: qs, format: r.format });
      setAnswers(Object.fromEntries(Object.entries(r.attempt.draftAnswers ?? {}).map(([k, v]) => [k, String(v ?? '')])));
      setSavedAt(r.attempt.draftSavedAt ?? null);
      dirty.current = false;
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  };

  const save = useCallback(async (force = false) => {
    if (!work || (!dirty.current && !force)) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const r = await put<{ savedAt?: string }>(`/api/me/assignments/${encodeURIComponent(id)}/attempts/${encodeURIComponent(work.attempt.id)}/draft`, { answers: answersRef.current });
      setSavedAt(r?.savedAt ?? new Date().toISOString());
      setSaveState('idle');
    } catch { dirty.current = true; setSaveState('failed'); }
  }, [id, work]);
  useEffect(() => {
    if (!work) return;
    const timer = setInterval(() => void save(), 15_000);
    return () => clearInterval(timer);
  }, [work, save]);

  const submitting = useRef(false);
  const submit = useCallback(async () => {
    if (!work || submitting.current) return;
    submitting.current = true;
    setBusy(true); setConfirm(false); setActionError(null);
    try {
      await post(`/api/me/assignments/${encodeURIComponent(id)}/attempts/${encodeURIComponent(work.attempt.id)}/submit`, { answers: answersRef.current });
      setWork(null); setFlash(true);
      detail.reload();
    } catch (e) { setActionError(e); } finally { submitting.current = false; setBusy(false); }
  }, [id, work, detail]);

  const help = async () => {
    setBusy(true); setActionError(null);
    try { const r = await tutorHandoff('assignment', id); if (r?.sessionId) go(`/student/chat?session=${encodeURIComponent(r.sessionId)}`); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  };

  const setAnswer = (qid: string, v: string) => { dirty.current = true; setAnswers((x) => ({ ...x, [qid]: v })); };
  const qs = work?.questions ?? [];
  const answered = qs.filter((x) => (answers[x.id] ?? '').trim()).length;
  const saveLabel = saveState === 'saving' ? t.saving : saveState === 'failed' ? t.saveFailed : savedAt ? t.saved(fmtTime(savedAt, lang)) : t.notSaved;

  return (
    <AppShell nav={nav} active="work" back title={a?.title || t.list} subtitle={a?.dueAt ? `${t.due}: ${fmtDateTime(a.dueAt, lang)}` : undefined}
      actions={work ? <span className={cn('hidden items-center gap-1.5 text-xs font-semibold sm:flex', saveState === 'failed' ? 'text-destructive' : 'text-success')}><CloudCheck className="size-4" />{saveLabel}</span> : undefined}>
      {detail.loading && !detail.data ? <PageSkeleton rows={3} /> : detail.error || !a ? (
        <div className="mx-auto max-w-xl"><ErrorState error={detail.error} onRetry={detail.reload} /></div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-5">
            <a href="#/student/assignment" className="flex w-fit items-center gap-1 text-sm font-semibold text-primary"><Dir><ArrowRight className="size-4 rotate-180" /></Dir>{t.back}</a>
            <Overview d={detail.data!} working={!!work} busy={busy} onStart={start} onHelp={help} spoken={spoken} />
            {work?.attempt.expiresAt && <div className="sticky top-20 z-[5]"><Countdown until={work.attempt.expiresAt} onEnd={() => void submit()} /></div>}
            {flash && <Alert tone="success" icon={<CheckCircle2 />} title={t.sent} />}
            {actionError != null && <InlineError error={actionError} />}

            {work && qs.map((qq, i) => (
              <QCard key={qq.id} q={qq} n={i + 1}>
                <QuestionInput q={qq} value={answers[qq.id] ?? ''} onChange={(v) => setAnswer(qq.id, v)} lang={lang} />
              </QCard>
            ))}

            {work && (
              <div className="lg:hidden">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg shadow-primary/5">
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold tabular-nums">{num(answered, lang)} {t.of} {num(qs.length, lang)} {t.answered}</p><Progress value={qs.length ? (answered / qs.length) * 100 : 0} size="sm" className="mt-1.5" ariaLabel={t.answered} /><p className={cn('mt-1 text-xs', saveState === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{saveLabel}</p></div>
                  <Button variant="outline" onPress={() => void save(true)} isDisabled={busy}>{t.saveDraft}</Button>
                  <Button onPress={() => setConfirm(true)} isDisabled={busy}><Send className="rtl:-scale-x-100" />{t.submit}</Button>
                </div>
              </div>
            )}

            {!work && arr<AttemptResult>(detail.data?.attempts).length > 0 && (
              <section>
                <SectionTitle>{t.yourWork}</SectionTitle>
                <div className="flex flex-col gap-3">
                  {arr<AttemptResult>(detail.data?.attempts).map((r, i) => <AttemptCard key={r.attemptId ?? i} r={r} assignmentId={id} />)}
                </div>
              </section>
            )}
          </div>

          <aside className="hidden lg:block">
            {work ? (
              <div className="sticky top-24 flex flex-col gap-4">
                <Card className="flex flex-col gap-4 p-5">
                  <div className="flex items-baseline justify-between"><h2 className="font-bold">{t.overview}</h2><span className="text-sm tabular-nums text-muted-foreground">{num(answered, lang)}/{num(qs.length, lang)}</span></div>
                  <Progress value={qs.length ? (answered / qs.length) * 100 : 0} size="sm" ariaLabel={t.answered} />
                  <ol className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
                    {qs.map((qq, i) => {
                      const ok = !!(answers[qq.id] ?? '').trim();
                      return (
                        <li key={qq.id}>
                          <button type="button" onClick={() => document.getElementById(`q-${qq.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                            {ok ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <Circle className="size-5 shrink-0 text-muted-foreground/50" />}
                            <span className="font-semibold">{t.q} {num(i + 1, lang)}</span>
                            <span className="ms-auto text-xs text-muted-foreground">{ok ? t.done : t.notAnswered}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-col gap-2 border-t pt-4">
                    <Button size="lg" className="w-full" onPress={() => setConfirm(true)} isDisabled={busy}><Send className="rtl:-scale-x-100" />{t.submit}</Button>
                    <Button variant="ghost" className="w-full" onPress={() => void save(true)} isDisabled={busy}>{t.saveDraft}</Button>
                    <p className="text-center text-xs text-muted-foreground">{t.submitHint}</p>
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="flex flex-col gap-2 p-5 text-sm">
                <p className="font-bold">{statusOf(detail.data?.status, lang).label}</p>
                {detail.data?.late && <Badge tone="warning" className="w-fit">{t.late}</Badge>}
              </Card>
            )}
          </aside>
        </div>
      )}

      {confirm && work && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <Card className="flex w-full max-w-sm flex-col gap-3 p-5">
            <h2 id="confirm-title" className="text-lg font-bold">{t.confirmTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.confirmText(num(answered, lang), num(qs.length, lang))}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onPress={() => setConfirm(false)} autoFocus>{t.keep}</Button>
              <Button onPress={() => void submit()} isDisabled={busy}><Send className="rtl:-scale-x-100" />{t.submitNow}</Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Overview({ d, working, busy, onStart, onHelp, spoken }: { d: AssignmentDetail; working: boolean; busy: boolean; onStart: () => void; onHelp: () => void; spoken: boolean }) {
  const t = useT(T);
  const { lang } = usePreview();
  const a = d.assignment ?? {};
  const s = statusOf(working ? 'in_progress' : d.status, lang);
  const attempts = arr<AttemptResult>(d.attempts);
  const canAct = !working && !spoken && (d.canStart || !!d.openAttemptId);
  const used = attempts.length;
  return (
    <Card className="flex flex-col gap-5 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info"><FileText className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 dir="auto" className="break-words text-lg font-extrabold leading-snug md:text-xl">{a.title}</h2>{s.label && <Badge tone={s.tone}>{s.label}</Badge>}</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 rounded-lg bg-muted p-3 sm:col-span-1"><dt className="text-xs font-semibold text-muted-foreground">{t.due}</dt><dd className="mt-0.5 flex items-center gap-1.5 text-sm font-bold"><CalendarClock className="size-4 shrink-0 text-warning-foreground" />{fmtDateTime(a.dueAt, lang) || '–'}</dd>{a.originalDueAt && a.dueAt && a.originalDueAt !== a.dueAt && <dd className="text-xs text-success">{t.extended}</dd>}</div>
        <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.points}</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{isNum(a.totalPoints) ? num(a.totalPoints, lang) : '–'}</dd></div>
        <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.time}</dt><dd className="mt-0.5 text-sm font-bold">{isNum(a.timeLimitMinutes) && a.timeLimitMinutes > 0 ? t.minutes(num(a.timeLimitMinutes, lang)) : t.noLimit}</dd></div>
        <div className="col-span-2 rounded-lg bg-muted p-3 sm:col-span-1"><dt className="text-xs font-semibold text-muted-foreground">{t.attempts}</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{isNum(a.maxAttempts) ? t.usedOf(num(used, lang), num(a.maxAttempts, lang)) : '–'}</dd></div>
      </dl>
      {a.instructions && <div><h3 className="mb-1 text-sm font-bold">{t.instrTitle}</h3><RichText text={a.instructions} className="text-sm leading-relaxed text-muted-foreground" /></div>}
      {a.latePolicy === 'accept_late' && a.closesAt && <p className="text-xs text-warning-foreground">{t.lateAccepted(fmtDateTime(a.closesAt, lang))}</p>}
      {spoken && <Alert tone="info" icon={<Info />}>{t.spoken}</Alert>}
      {!working && !spoken && (
        <div className="flex flex-col gap-2">
          {canAct ? (
            <>
              <Button size="lg" className="w-full sm:w-fit" onPress={onStart} isDisabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{d.openAttemptId ? t.continue : attempts.length ? t.again : t.start}<Dir><ArrowRight /></Dir></Button>
              {!d.openAttemptId && isNum(a.timeLimitMinutes) && a.timeLimitMinutes > 0 && <p className="text-xs text-muted-foreground">{t.timerNote(num(a.timeLimitMinutes, lang))}</p>}
            </>
          ) : attempts.length === 0 && <p className="text-sm text-muted-foreground">{d.window?.reason === 'not_open_yet' ? t.notOpen(fmtDateTime(a.opensAt, lang)) : t.closedNow}</p>}
        </div>
      )}
      {a.tutorPolicy !== 'blocked' && !attempts.some((r) => r.released) && (
        <Button variant="ghost" className="w-fit" onPress={onHelp} isDisabled={busy}><MessageCircle />{a.tutorPolicy === 'hints_only' ? t.helpHints : t.help}</Button>
      )}
    </Card>
  );
}

function AttemptCard({ r, assignmentId }: { r: AttemptResult; assignmentId: string }) {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm">
      <p className="text-muted-foreground">{t.submittedAt(fmtDateTime(r.submittedAt, lang))}{r.late ? ` · ${t.late}` : ''}</p>
      {r.released ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-bold tabular-nums">{isNum(r.totalPoints) && isNum(r.maxPoints) ? `${num(r.totalPoints, lang)} / ${num(r.maxPoints, lang)}` : ''}{isNum(r.score) && <span className="ms-2 text-sm font-medium text-muted-foreground">({num(r.score, lang)}%)</span>}</p>
          <LinkButton href={`#/student/results?id=${encodeURIComponent(assignmentId)}&attempt=${encodeURIComponent(r.attemptId ?? '')}`} variant="outline" size="sm">{t.viewResult}<Dir><ArrowRight /></Dir></LinkButton>
        </div>
      ) : <p className="flex items-start gap-2">{r.processing === 'grading' && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}{t.processing[r.processing ?? 'grading'] ?? t.processing.grading}</p>}
    </Card>
  );
}

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const [now, setNow] = useState(Date.now());
  const ended = useRef(false);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  useEffect(() => { if (left === 0 && !ended.current && !Number.isNaN(new Date(until).getTime())) { ended.current = true; end.current(); } }, [left, until]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <Card role="timer" aria-live="off" className={cn('flex items-center gap-2 p-4 text-sm font-bold tabular-nums', left < 120000 && 'text-destructive')}>
      <Timer className="size-5" />{left === 0 ? t.timeUp : <>{num(m, lang)}:{String(s).padStart(2, '0')} <span className="font-medium text-muted-foreground">{t.timeLeft}</span></>}
    </Card>
  );
}

function QCard({ q, n, children }: { q: Question; n: number; children: ReactNode }) {
  const t = useT(T);
  const { lang } = usePreview();
  const showStem = !(q.type === 'engine' && (q.engine?.type === 'fill_blank' || q.engine?.type === 'dropdown'));
  return (
    <Card id={`q-${q.id}`} className="flex scroll-mt-24 flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold"><span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground tabular-nums">{num(n, lang)}</span>{t.q} {num(n, lang)} <span className="font-normal text-muted-foreground">· {kindOf(q, t)}</span></p>
        {isNum(q.points) && <Badge tone="neutral">{q.points === 1 ? t.pt : t.pts(num(q.points, lang))}</Badge>}
      </div>
      {showStem && q.text && <RichText text={q.text} className="text-start text-[15px] font-semibold leading-relaxed" />}
      {children}
      {arr<NonNullable<NonNullable<Question['rubric']>['criteria']>[number]>(q.rubric?.criteria).length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold">{t.marked}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {arr<NonNullable<NonNullable<Question['rubric']>['criteria']>[number]>(q.rubric?.criteria).map((c, i) => (
              <li key={c.id ?? i} dir="auto"><b>{c.title}</b>{isNum(c.maxPoints) ? ` (${num(c.maxPoints, lang)})` : ''}{arr<{ label?: string; points?: number }>(c.levels).length ? `: ${arr<{ label?: string; points?: number }>(c.levels).map((l) => `${l.label ?? ''} ${isNum(l.points) ? num(l.points, lang) : ''}`).join(' · ')}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function QuestionInput({ q, value, onChange, lang }: { q: Question; value: string; onChange: (v: string) => void; lang: Lang }) {
  const t = useT(T);
  const type = q.type === 'engine' ? `engine:${q.engine?.type ?? ''}` : q.type ?? '';
  const textArea = (rows: number, essay: boolean) => (
    <div className="overflow-hidden rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
      <textarea dir="auto" aria-label={t.answer} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className="block w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none" />
      {essay && <div className="flex items-center gap-2 border-t bg-muted/60 px-4 py-2.5"><span className="text-sm font-bold tabular-nums">{num(words(value), lang)} <span className="font-normal text-muted-foreground">{t.words}</span></span></div>}
    </div>
  );

  if (type === 'multiple-choice' || type === 'true-false') {
    const opts = arr<string>(q.options).filter((o) => typeof o === 'string');
    const list = type === 'true-false' && !opts.length ? ['True', 'False'] : opts;
    const label = (o: string) => (type === 'true-false' && !opts.length ? (o === 'True' ? t.true : t.false) : o);
    return (
      <RadioGroup aria-label={q.text || t.answer} value={value || null} onChange={onChange} className="grid gap-2 sm:grid-cols-2">
        {list.map((o) => <Radio key={o} value={o} className={optionClass}><span dir="auto" className="min-w-0 break-words py-2">{label(o)}</span></Radio>)}
      </RadioGroup>
    );
  }
  if (type === 'short-answer') {
    return (
      <AriaTextField value={value} onChange={onChange} className="flex flex-col gap-1.5">
        <Label>{t.answer}</Label>
        <Input dir="auto" className={cn(inputClass, 'text-start text-[15px]')} />
      </AriaTextField>
    );
  }
  if (type === 'open-response') return textArea(8, true);
  if (type.startsWith('engine:')) {
    const e = q.engine ?? {};
    const dir = String(e.language ?? '').startsWith('ar') ? 'rtl' : 'ltr';
    if (!SUPPORTED_ENGINE.includes(e.type ?? '')) return <Alert tone="info" icon={<Info />}>{t.unsupported}</Alert>;
    if (e.type === 'mcq') {
      const opts = arr<{ id?: string; text?: string }>(e.options).filter((o) => o && typeof o.id === 'string');
      if (e.multi) {
        let chosen: string[] = [];
        try { chosen = value ? arr<string>(JSON.parse(value)) : []; } catch { chosen = []; }
        const toggle = (oid: string, on: boolean) => { const next = on ? [...chosen.filter((c) => c !== oid), oid] : chosen.filter((c) => c !== oid); onChange(next.length ? JSON.stringify(next) : ''); };
        return (
          <div dir={dir} className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t.chooseAll}</p>
            {opts.map((o) => <Checkbox key={o.id} isSelected={chosen.includes(o.id!)} onChange={(on) => toggle(o.id!, on)} className={optionClass}><span dir="auto" className="py-2">{o.text}</span></Checkbox>)}
          </div>
        );
      }
      return (
        <div dir={dir} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t.chooseOne}</p>
          <RadioGroup aria-label={q.text || t.answer} value={value || null} onChange={onChange} className="grid gap-2 sm:grid-cols-2">
            {opts.map((o) => <Radio key={o.id} value={o.id!} className={optionClass}><span dir="auto" className="min-w-0 break-words py-2">{o.text}</span></Radio>)}
          </RadioGroup>
        </div>
      );
    }
    if (e.type === 'true_false') {
      return (
        <RadioGroup aria-label={q.text || t.answer} value={value || null} onChange={onChange} className="grid grid-cols-2 gap-2">
          <Radio value="true" className={optionClass}><span className="py-2">{t.true}</span></Radio>
          <Radio value="false" className={optionClass}><span className="py-2">{t.false}</span></Radio>
        </RadioGroup>
      );
    }
    if (e.type === 'numeric') {
      return (
        <AriaTextField value={value} onChange={onChange} className="flex flex-col gap-1.5">
          <Label>{t.number}</Label>
          <Input dir="ltr" inputMode="decimal" className={cn(inputClass, 'max-w-60 text-start text-[15px]')} />
        </AriaTextField>
      );
    }
    return (
      <div dir={dir} className="flex flex-col gap-3">
        {e.source && <blockquote dir="auto" className="whitespace-pre-wrap rounded-lg border-s-4 bg-muted p-3 text-sm">{e.source}</blockquote>}
        {textArea(e.type === 'essay' ? 8 : 3, e.type === 'essay')}
      </div>
    );
  }
  return <Alert tone="info" icon={<Info />}>{t.unsupported}</Alert>;
}
