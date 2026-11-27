// Results (teens and adults), wired to lms-test:
//   GET /api/me/assignments                         results list (released and in-marking assignments)
//   GET /api/me/assignments/:id                     one assignment's submissions (#/student/results?id=…&attempt=…); scores only once released
//   GET /api/me/results/:attemptId                  the stored answers of a released attempt: who scored each answer
//                                                   (method rule / ai / teacher, Mishkat engine, criteria scoredBy)
//   GET /api/me/results, /api/me/results/:id        quiz results when the school has assignments off (#/student/results?quiz=…)
//   GET /api/learning/students/me/errors-to-work-on errors to practise (404 when the feature is off: section hidden)
//   POST /api/me/tutor/handoff { kind: 'result' }   "Practise with the tutor" (opens a chat; no AI call until the learner writes)
import { useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Bot, Check, Code2, Dumbbell, Loader2, Minus, Sparkles, UserCheck, X } from 'lucide-react';
import { go } from '@/App';
import { ApiError, get } from '@/lib/api';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Badge, Button, Card, Dir, LinkButton, Ring, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';
import {
  ErrorState, InlineError, NotAvailable, PageSkeleton, StateCard, arr, fmtDate, fmtTime, getOrOff, isNum, isOff, sourcesOf, statusOf, str,
  tutorHandoff, useHashQuery, useLoad,
  type AssignmentDetail, type AssignmentItem, type AttemptResult, type QuizResult, type Source, type StoredAnswer,
} from './common';

const T = {
  en: {
    list: 'Results', listSub: 'Your marked work', empty: 'No results yet. They appear here once your work is marked.', open: 'View result',
    quizzes: 'Quiz results', assignments: 'Assignment results',
    score: 'Your score', outOf: 'out of', bands: ['Keep practising', 'Good', 'Very good', 'Excellent'],
    submitted: 'Submitted', returned: 'Returned', classAvg: 'Class average', level: 'Level', late: 'Submitted late',
    src: { rules: 'Scored by rules', mishkat: 'Scored by Mishkat', ai: 'Scored by the AI model', teacher: 'Checked by your teacher' } as Record<Source, string>,
    srcUnknown: 'Who scored it: ', srcNote: 'Each answer shows who marked it. Mishkat is ENARA’s own scoring model.',
    breakdown: 'Question by question', q: 'Question', yours: 'Your answer', right: 'Correct answer', why: 'Why this score', well: 'What went well', work: 'To work on',
    keyHidden: 'Correct answers are shown when the assignment closes, if your teacher allows it.',
    criteria: 'Marking criteria', criteriaSub: (n: string) => `Question ${n}`,
    errors: 'Errors to work on', errorsSub: 'From your tests. Two right answers on your own clear a point.', practise: 'Practise with the tutor', practiseHint: 'One task at a time',
    noErrors: 'Nothing to practise right now.', afterClose: 'after your test closes', rightOf: (n: string) => `${n} of 2 right`, times: 'times',
    notReleased: 'Your result is not ready yet', processing: { grading: 'ENARA is marking your answers. Check back soon.', with_teacher: 'Your teacher is marking this.', delayed: 'Your result is taking longer than usual. Your teacher has been told; no score has been given yet.' } as Record<string, string>,
    noAttempt: 'You have not submitted this assignment yet.', toAssignment: 'Open the assignment', teacherReply: 'Your teacher replied', askedTeacher: 'You asked your teacher to look again.',
    feedback: 'Feedback', pts: 'points',
  },
  ar: {
    list: 'النتائج', listSub: 'أعمالك المصحَّحة', empty: 'لا توجد نتائج بعد. تظهر هنا بعد تصحيح عملك.', open: 'عرض النتيجة',
    quizzes: 'نتائج الاختبارات', assignments: 'نتائج الواجبات',
    score: 'درجتك', outOf: 'من', bands: ['واصل التدرّب', 'جيد', 'جيد جدًا', 'ممتاز'],
    submitted: 'تاريخ التسليم', returned: 'تاريخ الإعلان', classAvg: 'متوسط الفصل', level: 'المستوى', late: 'سُلِّم متأخرًا',
    src: { rules: 'صُحّح وفق القواعد', mishkat: 'قيّمه نموذج مشكاة', ai: 'قيّمه نموذج الذكاء الاصطناعي', teacher: 'راجعه معلّمك' } as Record<Source, string>,
    srcUnknown: 'جهة التصحيح: ', srcNote: 'تُظهر كل إجابة الجهة التي صحّحتها. مشكاة هو نموذج التقييم الخاص بإنارة.',
    breakdown: 'سؤالًا سؤالًا', q: 'السؤال', yours: 'إجابتك', right: 'الإجابة الصحيحة', why: 'سبب هذه الدرجة', well: 'ما أحسنتَ فيه', work: 'ما تحتاج إلى العمل عليه',
    keyHidden: 'تظهر الإجابات الصحيحة عند إغلاق الواجب، إن سمح معلّمك بذلك.',
    criteria: 'معايير التصحيح', criteriaSub: (n: string) => `السؤال ${n}`,
    errors: 'أخطاء تحتاج إلى تدريب', errorsSub: 'من اختباراتك. إجابتان صحيحتان بمفردك تُنهيان النقطة.', practise: 'تدرّب عليها مع المعلّم', practiseHint: 'مهمة واحدة في كل مرة',
    noErrors: 'لا يوجد ما تتدرّب عليه الآن.', afterClose: 'بعد إغلاق اختبارك', rightOf: (n: string) => `${n} من 2 صحيحة`, times: 'مرات',
    notReleased: 'نتيجتك ليست جاهزة بعد', processing: { grading: 'تصحّح إنارة إجاباتك الآن. عُد بعد قليل.', with_teacher: 'يصحّح معلّمك هذا العمل.', delayed: 'تتأخر نتيجتك أكثر من المعتاد. أُبلغ معلّمك، ولم تُمنح أي درجة بعد.' } as Record<string, string>,
    noAttempt: 'لم تسلّم هذا الواجب بعد.', toAssignment: 'فتح الواجب', teacherReply: 'ردّ معلّمك', askedTeacher: 'طلبتَ من معلّمك إعادة النظر.',
    feedback: 'ملاحظات', pts: 'درجة',
  },
};

const srcStyle: Record<Source, { tone: 'neutral' | 'info' | 'success'; icon: ReactNode }> = {
  rules: { tone: 'neutral', icon: <Code2 /> },
  mishkat: { tone: 'info', icon: <Sparkles /> },
  ai: { tone: 'neutral', icon: <Bot /> },
  teacher: { tone: 'success', icon: <UserCheck /> },
};
function SourceBadge({ src }: { src: Source }) {
  const t = useT(T);
  const s = srcStyle[src];
  return <Badge tone={s.tone} className={cn(src === 'ai' && 'border bg-card')}>{s.icon}{t.src[src]}</Badge>;
}

type Verdict = 'right' | 'partial' | 'wrong' | null;
interface Row { key: string; text: string; yours: string; correct?: string; explanation?: string; verdict: Verdict; pts?: number | null; max?: number; feedback?: string; why?: string; well: string[]; work: string[]; sources: Source[]; criteria: { code: string; points?: number; max?: number; scoredBy?: string }[]; appeal?: { status?: string; response?: string | null } }
interface View { title: string; subject?: string; pct: number | null; got?: number; max?: number; submittedAt?: string; releasedAt?: string; late?: boolean; overall?: string; rows: Row[]; keyShown: boolean; sourcesKnown: boolean; attemptId?: string }

function verdictOf(isCorrect: unknown, pts: unknown, max: unknown): Verdict {
  if (typeof isCorrect === 'boolean') return isCorrect ? 'right' : 'wrong';
  if (isNum(pts) && isNum(max) && max > 0) return pts >= max ? 'right' : pts <= 0 ? 'wrong' : 'partial';
  return null;
}
const answerText = (v: unknown) => { const s = str(v); return s; };

function fromAssignment(title: string, r: AttemptResult, stored: QuizResult | null): View {
  const byId = new Map(arr<StoredAnswer>(stored?.answers).map((a) => [a?.questionId, a]));
  const rows: Row[] = arr<NonNullable<AttemptResult['answers']>[number]>(r.answers).map((a, i) => {
    const s = byId.get(a?.questionId);
    const appeal = arr<NonNullable<AttemptResult['appeals']>[number]>(r.appeals).filter((p) => (p?.questionId ?? null) === (a?.questionId ?? null)).pop();
    return {
      key: a?.questionId ?? String(i), text: str(a?.questionText), yours: str(s?.answerText) || answerText(a?.studentAnswer),
      correct: r.answerKeyShown && a?.correctAnswer !== undefined ? str(a.correctAnswer) : undefined, explanation: r.answerKeyShown ? str(a?.explanation) || undefined : undefined,
      verdict: verdictOf(r.answerKeyShown ? a?.isCorrect : undefined, a?.points, a?.maxPoints), pts: a?.points, max: a?.maxPoints,
      feedback: str(a?.feedback) || undefined, why: str(a?.scoreExplanation) || undefined, well: arr<string>(a?.strengths).filter(Boolean), work: arr<string>(a?.improvements).filter(Boolean),
      sources: sourcesOf(s), criteria: arr<{ code?: string; points?: number; max?: number; scoredBy?: string }>(s?.criteria).filter((c) => c?.code).map((c) => ({ code: c.code!, points: c.points, max: c.max, scoredBy: c.scoredBy })),
      appeal: appeal ? { status: appeal.status, response: appeal.response } : undefined,
    };
  });
  const pct = isNum(r.score) ? r.score : isNum(r.totalPoints) && isNum(r.maxPoints) && r.maxPoints > 0 ? Math.round((r.totalPoints / r.maxPoints) * 100) : null;
  return { title, subject: stored?.subject, pct, got: r.totalPoints, max: r.maxPoints, submittedAt: r.submittedAt, releasedAt: r.releasedAt, late: r.late, overall: str(r.overallFeedback) || undefined, rows, keyShown: !!r.answerKeyShown, sourcesKnown: !!stored, attemptId: r.attemptId };
}
function fromQuiz(q: QuizResult): View {
  const rows: Row[] = arr<StoredAnswer>(q.answers).map((a, i) => ({
    key: a?.questionId ?? String(i), text: str(a?.questionText), yours: str(a?.answerText) || answerText(a?.studentAnswer),
    correct: q.answersRevealed && a?.correctAnswer !== undefined ? str(a.correctAnswer) : undefined, explanation: q.answersRevealed ? str(a?.explanation) || undefined : undefined,
    verdict: verdictOf(a?.isCorrect, a?.points, a?.maxPoints), pts: a?.points, max: a?.maxPoints,
    feedback: str(a?.feedback) || str(a?.feedbackText) || undefined, why: str(a?.scoreExplanation) || undefined, well: arr<string>(a?.strengths).filter(Boolean), work: arr<string>(a?.improvements).filter(Boolean),
    sources: sourcesOf(a), criteria: arr<{ code?: string; points?: number; max?: number; scoredBy?: string }>(a?.criteria).filter((c) => c?.code).map((c) => ({ code: c.code!, points: c.points, max: c.max, scoredBy: c.scoredBy })),
  }));
  return { title: str(q.assessmentTitle), subject: q.subject, pct: isNum(q.score) ? q.score : null, submittedAt: q.date, overall: undefined, rows, keyShown: !!q.answersRevealed, sourcesKnown: true, attemptId: q.id };
}

export default function StudentResults() {
  const q = useHashQuery();
  const id = q.get('id') ?? '';
  const attempt = q.get('attempt') ?? '';
  const quiz = q.get('quiz') ?? '';
  if (quiz) return <QuizResultView key={quiz} id={quiz} />;
  if (id) return <AssignmentResultView key={`${id}|${attempt}`} id={id} attempt={attempt} />;
  return <ResultsList />;
}

// ---------------------------------------------------------------- List

const SHOWN = new Set(['released', 'graded', 'awaiting_review', 'grading', 'grading_delayed', 'submitted']);

function ResultsList() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const res = useLoad(async (signal) => {
    const work = await getOrOff<{ assignments?: AssignmentItem[] }>('/api/me/assignments', signal);
    // Schools with assignments off: the quiz results instead.
    const quizzes = isOff(work) ? arr<QuizResult>(await get<QuizResult[]>('/api/me/results', signal)) : [];
    return { assignments: isOff(work) ? [] : arr<AssignmentItem>(work.assignments).filter((a) => SHOWN.has(a.status ?? '')), quizzes };
  }, 'results');
  const d = res.data;
  return (
    <AppShell nav={nav} active="results" title={t.list} subtitle={t.listSub}>
      {res.loading && !d ? <PageSkeleton rows={3} aside={false} /> : res.error || !d ? (
        <div className="mx-auto max-w-xl"><ErrorState error={res.error} onRetry={res.reload} /></div>
      ) : d.assignments.length === 0 && d.quizzes.length === 0 ? (
        <div className="mx-auto max-w-xl"><StateCard icon={<BarChart3 />} title={t.list} text={t.empty} /></div>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          {d.assignments.length > 0 && (
            <section>
              <SectionTitle>{t.assignments}</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {[...d.assignments].sort((a, b) => new Date(b.dueAt ?? 0).getTime() - new Date(a.dueAt ?? 0).getTime()).map((a, i) => {
                  const s = statusOf(a.status, lang);
                  return (
                    <a key={a.id ?? i} href={`#/student/results?id=${encodeURIComponent(a.id ?? '')}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Card className="flex h-full flex-col gap-2 p-4 hover:bg-muted/40">
                        <p dir="auto" className="break-words font-bold leading-snug">{a.title}</p>
                        <div className="mt-auto flex flex-wrap items-center gap-2"><Badge tone={s.tone}>{s.label}</Badge>{a.dueAt && <span className="text-xs text-muted-foreground">{fmtDate(a.dueAt, lang)}</span>}</div>
                      </Card>
                    </a>
                  );
                })}
              </div>
            </section>
          )}
          {d.quizzes.length > 0 && (
            <section>
              <SectionTitle>{t.quizzes}</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {d.quizzes.map((r, i) => (
                  <a key={r.id ?? i} href={`#/student/results?quiz=${encodeURIComponent(r.id ?? '')}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="flex h-full items-center gap-4 p-4 hover:bg-muted/40">
                      <Ring value={isNum(r.score) ? r.score : 0} size={52} stroke={6} tone="var(--success)" ariaLabel={t.score}><span className="text-[11px] tabular-nums">{isNum(r.score) ? `${num(r.score, lang)}%` : '–'}</span></Ring>
                      <div className="min-w-0"><p dir="auto" className="break-words font-bold leading-snug">{r.assessmentTitle}</p><p className="text-xs text-muted-foreground">{[r.subject, fmtDate(r.date, lang)].filter(Boolean).join(' · ')}</p></div>
                    </Card>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------- One result

function AssignmentResultView({ id, attempt }: { id: string; attempt: string }) {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const res = useLoad(async (signal) => {
    const d = await get<AssignmentDetail>(`/api/me/assignments/${encodeURIComponent(id)}`, signal);
    const attempts = arr<AttemptResult>(d?.attempts);
    const r = attempts.find((x) => x?.attemptId === attempt) ?? [...attempts].reverse().find((x) => x?.released) ?? attempts[attempts.length - 1] ?? null;
    // Who scored each answer: only from the stored attempt, and only once the result is released.
    const stored = r?.released && r.attemptId ? await get<QuizResult>(`/api/me/results/${encodeURIComponent(r.attemptId)}`, signal).catch(() => null) : null;
    return { title: d?.assignment?.title ?? '', r, stored };
  }, `${id}|${attempt}`);
  const d = res.data;
  return (
    <AppShell nav={nav} active="results" back title={d?.title || t.list} subtitle={d?.r?.releasedAt ? `${t.returned}: ${fmtDate(d.r.releasedAt, lang)}` : undefined}>
      {res.loading && !d ? <PageSkeleton rows={3} /> : res.error || !d ? (
        <div className="mx-auto max-w-xl"><ErrorState error={res.error} onRetry={res.reload} /></div>
      ) : !d.r ? (
        <div className="mx-auto max-w-xl"><StateCard icon={<BarChart3 />} title={d.title || t.list} text={t.noAttempt} action={<LinkButton href={`#/student/assignment?id=${encodeURIComponent(id)}`}>{t.toAssignment}<Dir><ArrowRight /></Dir></LinkButton>} /></div>
      ) : !d.r.released ? (
        <div className="mx-auto max-w-xl">
          <StateCard icon={d.r.processing === 'grading' ? <Loader2 className="animate-spin" /> : <BarChart3 />} title={t.notReleased}
            text={<>{t.processing[d.r.processing ?? 'grading'] ?? t.processing.grading}{d.r.submittedAt && <span className="mt-1 block text-xs">{t.submitted}: {fmtDate(d.r.submittedAt, lang)} {fmtTime(d.r.submittedAt, lang)}</span>}</>}
            action={<Button variant="outline" onPress={res.reload}>{lang === 'ar' ? 'تحديث' : 'Refresh'}</Button>} />
        </div>
      ) : (
        <ResultBody v={fromAssignment(d.title, d.r, d.stored)} />
      )}
    </AppShell>
  );
}

function QuizResultView({ id }: { id: string }) {
  const t = useT(T);
  const nav = useStudentNav();
  const res = useLoad((signal) => get<QuizResult>(`/api/me/results/${encodeURIComponent(id)}`, signal), id);
  return (
    <AppShell nav={nav} active="results" back title={res.data?.assessmentTitle || t.list} subtitle={res.data?.subject}>
      {res.loading && !res.data ? <PageSkeleton rows={3} /> : res.error || !res.data ? (
        <div className="mx-auto max-w-xl"><ErrorState error={res.error} onRetry={res.reload} /></div>
      ) : <ResultBody v={fromQuiz(res.data)} />}
    </AppShell>
  );
}

const band = (pct: number) => (pct >= 90 ? 3 : pct >= 75 ? 2 : pct >= 50 ? 1 : 0);
const human = (code: string) => code.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function ResultBody({ v }: { v: View }) {
  const t = useT(T);
  const { lang } = usePreview();
  const allSources = [...new Set(v.rows.flatMap((r) => r.sources))];
  const withCriteria = v.rows.map((r, i) => ({ r, n: i + 1 })).filter((x) => x.r.criteria.length > 0);
  const tone = v.pct === null ? 'var(--muted-foreground)' : v.pct >= 50 ? 'var(--success)' : 'var(--warning)';
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Summary */}
      <Card className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8 md:p-7">
        <div className="flex items-center gap-5">
          <Ring value={v.pct ?? 0} size={112} stroke={10} tone={tone} ariaLabel={t.score}>
            <span className="flex flex-col items-center leading-none">
              {isNum(v.got) && isNum(v.max)
                ? <><span className="text-3xl font-extrabold tabular-nums">{num(v.got, lang)}</span><span className="mt-1 text-xs font-semibold text-muted-foreground">{t.outOf} {num(v.max, lang)}</span></>
                : <span className="text-2xl font-extrabold tabular-nums">{v.pct !== null ? `${num(v.pct, lang)}%` : '–'}</span>}
            </span>
          </Ring>
          {v.pct !== null && <div className="min-w-0 md:hidden"><p className="text-xs font-semibold text-muted-foreground">{t.score}</p><p className="text-2xl font-extrabold">{t.bands[band(v.pct)]}</p><p className="text-sm font-semibold tabular-nums text-success">{num(v.pct, lang)}%</p></div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {v.pct !== null && <div className="hidden items-baseline gap-3 md:flex"><p className="text-2xl font-extrabold">{t.bands[band(v.pct)]}</p><p className="font-semibold tabular-nums text-success">{num(v.pct, lang)}%</p></div>}
          {v.overall && <p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{v.overall}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {allSources.length ? allSources.map((s) => <SourceBadge key={s} src={s} />) : <span className="text-xs text-muted-foreground">{t.srcUnknown}<NotAvailable /></span>}
            {v.late && <Badge tone="warning">{t.late}</Badge>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-sm md:w-80 md:shrink-0 md:border-s md:border-t-0 md:ps-8 md:pt-0">
          <div><dt className="text-xs font-semibold text-muted-foreground">{t.submitted}</dt><dd className="font-semibold">{fmtDate(v.submittedAt, lang) || '–'}<span className="block text-xs font-normal text-muted-foreground">{fmtTime(v.submittedAt, lang)}</span></dd></div>
          <div><dt className="text-xs font-semibold text-muted-foreground">{t.returned}</dt><dd className="font-semibold">{v.releasedAt ? <>{fmtDate(v.releasedAt, lang)}<span className="block text-xs font-normal text-muted-foreground">{fmtTime(v.releasedAt, lang)}</span></> : <NotAvailable />}</dd></div>
          <div><dt className="text-xs font-semibold text-muted-foreground">{t.classAvg}</dt><dd><NotAvailable /></dd></div>
          <div><dt className="text-xs font-semibold text-muted-foreground">{t.level}</dt><dd><NotAvailable /></dd></div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Per-question breakdown */}
          <section>
            <SectionTitle>{t.breakdown}</SectionTitle>
            <Card className="divide-y overflow-hidden">
              {v.rows.map((r, i) => (
                <div key={r.key} className="flex gap-3 p-4 md:gap-4 md:p-5">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', r.verdict === 'right' ? 'bg-success-soft text-success' : r.verdict === 'wrong' ? 'bg-destructive-soft text-destructive' : r.verdict === 'partial' ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground')}>
                    {r.verdict === 'right' ? <Check className="size-4" strokeWidth={3} /> : r.verdict === 'wrong' ? <X className="size-4" strokeWidth={3} /> : <Minus className="size-4" strokeWidth={3} />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground">{t.q} {num(i + 1, lang)}</p>
                        <p dir="auto" className="break-words text-start text-sm font-semibold leading-relaxed">{r.text}</p>
                      </div>
                      {isNum(r.max) && <span className={cn('shrink-0 text-sm font-bold tabular-nums', r.verdict === 'wrong' && 'text-destructive')}>{isNum(r.pts) ? num(r.pts, lang) : '–'}/{num(r.max, lang)}</span>}
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <p className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{t.yours}:</span><bdi dir="auto" className={cn('min-w-0 whitespace-pre-wrap break-words', r.verdict === 'wrong' && r.correct && 'text-destructive line-through decoration-destructive/40')}>{r.yours || '–'}</bdi></p>
                      {r.correct && <p className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{t.right}:</span><bdi dir="auto" className="font-semibold text-success">{r.correct}</bdi></p>}
                      {r.explanation && <p dir="auto" className="text-muted-foreground">{r.explanation}</p>}
                      {r.why && <p dir="auto"><span className="text-muted-foreground">{t.why}: </span>{r.why}</p>}
                      {r.well.length > 0 && <p dir="auto" className="text-success"><span className="font-semibold">{t.well}: </span>{r.well.join(' · ')}</p>}
                      {r.work.length > 0 && <p dir="auto" className="text-warning-foreground"><span className="font-semibold">{t.work}: </span>{r.work.join(' · ')}</p>}
                      {r.feedback && <p dir="auto" className="rounded-lg bg-muted p-2.5">{r.feedback}</p>}
                      {r.appeal && <p dir="auto" className="rounded-lg bg-secondary/60 p-2.5 text-xs">{r.appeal.status === 'open' ? t.askedTeacher : <><b>{t.teacherReply}:</b> {r.appeal.response}</>}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">{r.sources.length ? r.sources.map((s) => <SourceBadge key={s} src={s} />) : <span className="text-xs text-muted-foreground">{t.srcUnknown}<NotAvailable /></span>}</div>
                  </div>
                </div>
              ))}
            </Card>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.srcNote}{!v.keyShown && ` ${t.keyHidden}`}</p>
          </section>

          {/* Criteria from the stored grading record */}
          {withCriteria.length > 0 && (
            <section>
              <SectionTitle>{t.criteria}</SectionTitle>
              <div className="flex flex-col gap-4">
                {withCriteria.map(({ r, n }) => (
                  <div key={r.key}>
                    <p className="mb-2 text-sm text-muted-foreground">{t.criteriaSub(num(n, lang))}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {r.criteria.map((c, i) => {
                        const full = isNum(c.points) && isNum(c.max) && c.max > 0 ? c.points / c.max : null;
                        const barTone = full === null ? 'bg-muted-foreground' : full >= 1 ? 'bg-success' : full >= 0.5 ? 'bg-info' : 'bg-warning';
                        const steps = isNum(c.max) && c.max > 0 && c.max <= 6 ? c.max : 0;
                        return (
                          <Card key={`${c.code}-${i}`} className="flex flex-col gap-3 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{human(c.code)}</p>{c.scoredBy === 'mishkat' ? <SourceBadge src="mishkat" /> : c.scoredBy === 'code' ? <SourceBadge src="rules" /> : c.scoredBy === 'model' ? <SourceBadge src="ai" /> : null}</div>
                            <div className="flex items-center gap-3">
                              {steps ? <div className="flex flex-1 gap-1">{Array.from({ length: steps }, (_, k) => <span key={k} className={cn('h-2 flex-1 rounded-full', isNum(c.points) && k < c.points ? barTone : 'bg-muted')} />)}</div> : <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', barTone)} style={{ width: `${(full ?? 0) * 100}%` }} /></div>}
                              <span className="text-xs font-bold tabular-nums text-muted-foreground">{isNum(c.points) ? num(c.points, lang) : '–'}/{isNum(c.max) ? num(c.max, lang) : '–'}</span>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6"><ErrorsToWorkOn attemptId={v.attemptId} lang={lang} /></aside>
      </div>
    </div>
  );
}

interface ErrorRow { id?: string; objective?: { title?: string | null }; error?: string; occurrences?: number; status?: string; rightStreak?: number; waitingForRelease?: boolean }

function ErrorsToWorkOn({ attemptId, lang }: { attemptId?: string; lang: Lang }) {
  const t = useT(T);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const res = useLoad(async (signal) => {
    try { return arr<ErrorRow>((await get<{ errors?: ErrorRow[] }>('/api/learning/students/me/errors-to-work-on', signal))?.errors); }
    catch (e) { if ((e as ApiError)?.status === 404) return null; throw e; } // feature off for this school
  }, 'errors');
  const practise = async () => {
    setBusy(true); setErr(null);
    try {
      if (!attemptId) { go('/student/chat'); return; }
      const r = await tutorHandoff('result', attemptId);
      go(r?.sessionId ? `/student/chat?session=${encodeURIComponent(r.sessionId)}` : '/student/chat');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const open = arr<ErrorRow>(res.data).filter((r) => r?.status === 'open');
  return (
    <section>
      <SectionTitle>{t.errors}</SectionTitle>
      <Card className="flex flex-col gap-4 p-5">
        <p className="-mt-1 text-sm text-muted-foreground">{t.errorsSub}</p>
        {res.loading ? <Skeleton className="h-24 rounded-xl" /> : res.error ? <InlineError error={res.error} onRetry={res.reload} /> : res.data === null ? <NotAvailable /> : open.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noErrors}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.slice(0, 6).map((e, i) => (
              <li key={e.id ?? i} className="flex flex-col gap-1.5 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2"><p dir="auto" className="min-w-0 break-words text-sm font-bold">{e.objective?.title || e.error}</p>{isNum(e.occurrences) && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">× {num(e.occurrences, lang)}</span>}</div>
                {e.objective?.title && e.error && <p dir="auto" className="text-sm text-muted-foreground">{e.error}</p>}
                {e.waitingForRelease ? <span className="text-xs text-muted-foreground">{t.afterClose}</span> : isNum(e.rightStreak) && e.rightStreak > 0 ? <span className="text-xs text-success">{t.rightOf(num(e.rightStreak, lang))}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {err != null && <InlineError error={err} />}
        <Button size="lg" className="w-full" onPress={practise} isDisabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Dumbbell />}{t.practise}<Dir><ArrowRight /></Dir></Button>
        <p className="-mt-2 text-center text-xs text-muted-foreground">{t.practiseHint}</p>
      </Card>
    </section>
  );
}
