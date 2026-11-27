// Grading queue, wired to lms-test:
//   GET  /api/assignments/classes                              class filter
//   GET  /api/grading/queue[?classId=]                         submissions, most urgent first, with counts
//   GET  /api/grading/attempts/:id                             one submission: questions, answers, scorer, evaluations
//   PUT  /api/grading/attempts/:id/answers/:questionId         accept the AI proposal ({acceptProposal:true}) or score by hand (override)
//   POST /api/grading/attempts/:id/correct                     change a final / released grade (reason required)
//   PUT  /api/grading/attempts/:id/feedback                    overall feedback
//   POST /api/grading/attempts/:id/finalize                    accept the scores (released unless the assignment releases by hand)
//   POST /api/grading/attempts/:id/release                     release a finalized result
// Every write runs only on an explicit click.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Clock3, FileText, MessageSquareWarning, Pencil, Send, Undo2, X } from 'lucide-react';
import { useT, usePreview, num, type Lang } from '@/lib/preview';
import { errorText, get, post, put } from '@/lib/api';
import { Alert, Avatar, Badge, Button, Card, Dir, Progress, Select, Separator, Skeleton, Tab, TabList, Tabs, TextField } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ClassPicker, EmptyPanel, ErrorPanel, SkeletonRows, SourceBadge, TeacherShell, arr, fmtDateTime, numOr, obj, setQuery, str,
  useLoad, useQueryParam, useSelectedClass, useTeacherClasses, type Source,
} from './common';

const T = {
  en: {
    title: 'Grading', sub: (n: number) => `${n} ${n === 1 ? 'submission needs' : 'submissions need'} you`, allClasses: 'All classes',
    tAll: 'All', tReview: 'Needs review', tAppeals: 'Review requests', tDone: 'Released',
    status: {
      grading_exception: 'Grader stopped', grading_failed: 'Grading, will retry', grading_in_progress: 'Grading', grading_queued: 'Waiting to grade', grading_pending: 'Grading',
      needs_review: 'Grade by hand', graded_draft: 'Scored, not final', finalized: 'Final, not released', released: 'Released',
    } as Record<string, string>,
    conf: 'Confidence', suggested: 'Suggested', final: 'Final', review: 'Review', late: 'Late', requests: (n: number) => (n === 1 ? '1 review request' : `${n} review requests`),
    autoGraded: (n: number) => (n === 1 ? '1 answer graded automatically' : `${n} answers graded automatically`), toReview: (n: number) => (n === 1 ? '1 answer to check' : `${n} answers to check`),
    empty: 'Nothing to grade', emptyBody: 'Submissions appear here when learners hand in work.', emptyTab: 'Nothing in this list',
    open: 'Open submission', pick: 'Choose a submission to review it here.', back: 'Back to the queue', submitted: 'Submitted', prev: 'Previous', next: 'Next', of: (a: number, b: number) => `${a} of ${b}`,
    learnerAnswer: 'Learner’s answer', key: 'Answer key', modelAnswer: 'Model answer (teachers only)', points: 'Points', criteria: 'Criteria',
    noSource: 'Not scored yet', acceptedByTeacher: 'Accepted by the teacher', aiView: 'How the AI model graded this', evidence: 'Evidence', why: 'Why',
    flagged: 'Needs your check', flags: {
      low_confidence: 'the grader was not sure', runs_disagree: 'two grading runs disagreed', near_pass_mark: 'close to the pass mark', model_unavailable: 'the grader was not available',
      model_error: 'a grading run failed', integrity: 'the answer may contain instructions to the grader', graders_disagree: 'Mishkat and the model disagree',
    } as Record<string, string>,
    confWord: { low: 'Low', medium: 'Medium', high: 'High' } as Record<string, string>,
    acceptAi: 'Accept suggested score', override: 'Override', correct: 'Correct this grade', cancel: 'Cancel',
    yourScore: 'Your score', reason: 'Reason for the change', reasonReq: 'Reason for the correction (required, kept in the history)', reasonPh: 'For example: grammar errors do not block meaning',
    reasonCode: 'Why the model’s score was changed', codes: { too_strict: 'The grader was too strict', too_lenient: 'The grader was too lenient', wrong_criterion: 'Scored against the wrong criterion', rubric_unclear: 'The rubric is unclear here' } as Record<string, string>,
    chooseLevel: 'Choose a level', feedbackAnswer: 'Feedback to the learner on this answer', saveOverride: 'Save override', saveCorrection: 'Save correction',
    feedback: 'Overall feedback to the learner', saveFeedback: 'Save feedback',
    finalize: 'Accept and finalize', finalizeQ: 'Finalize these scores? Unless the assignment releases results by hand, the learner sees them now.', confirm: 'Yes, finalize', release: 'Release to the learner',
    grading: 'ENARA is still grading this submission. You can act on it when grading finishes.', stopped: 'The grader stopped and gave no grade. Score the answers by hand below, then finalize.',
    appeals: 'Review requests from the learner', aboutAll: 'About the whole result', appealsNote: 'Answering review requests is in the full ENARA grading page for now.',
    saved: 'Saved', done: 'Done', total: 'Total',
  },
  ar: {
    title: 'التصحيح', sub: (n: number) => (n === 1 ? 'تسليم واحد يحتاج إليك' : n === 2 ? 'تسليمان يحتاجان إليك' : n >= 3 && n <= 10 ? `${n} تسليمات تحتاج إليك` : `${n} تسليمًا يحتاج إليك`), allClasses: 'كل الفصول',
    tAll: 'الكل', tReview: 'تحتاج مراجعة', tAppeals: 'طلبات المراجعة', tDone: 'المنشورة',
    status: {
      grading_exception: 'توقّف المصحّح', grading_failed: 'قيد التصحيح، ستُعاد المحاولة', grading_in_progress: 'قيد التصحيح', grading_queued: 'بانتظار التصحيح', grading_pending: 'قيد التصحيح',
      needs_review: 'يُصحَّح يدويًا', graded_draft: 'مصحَّح وغير نهائي', finalized: 'نهائي وغير منشور', released: 'منشور',
    } as Record<string, string>,
    conf: 'الثقة', suggested: 'الدرجة المقترحة', final: 'النهائية', review: 'مراجعة', late: 'متأخر', requests: (n: number) => (n === 1 ? 'طلب مراجعة واحد' : n === 2 ? 'طلبا مراجعة' : `${n} طلبات مراجعة`),
    autoGraded: (n: number) => (n === 1 ? 'إجابة واحدة صُحّحت تلقائيًا' : n === 2 ? 'إجابتان صُحّحتا تلقائيًا' : `${n} إجابات صُحّحت تلقائيًا`), toReview: (n: number) => (n === 1 ? 'إجابة واحدة للتحقق' : n === 2 ? 'إجابتان للتحقق' : `${n} إجابات للتحقق`),
    empty: 'لا شيء للتصحيح', emptyBody: 'تظهر التسليمات هنا عندما يسلّم الطلاب أعمالهم.', emptyTab: 'لا شيء في هذه القائمة',
    open: 'التسليم المفتوح', pick: 'اختر تسليمًا لمراجعته هنا.', back: 'العودة إلى القائمة', submitted: 'سُلّم في', prev: 'السابق', next: 'التالي', of: (a: number, b: number) => `${a} من ${b}`,
    learnerAnswer: 'إجابة الطالب', key: 'مفتاح الإجابة', modelAnswer: 'الإجابة النموذجية (للمعلمين فقط)', points: 'الدرجات', criteria: 'المعايير',
    noSource: 'لم يُصحَّح بعد', acceptedByTeacher: 'اعتمدها المعلم', aiView: 'كيف صحّح نموذج الذكاء الاصطناعي هذه الإجابة', evidence: 'الشواهد', why: 'السبب',
    flagged: 'تحتاج إلى تحققك', flags: {
      low_confidence: 'لم يكن المصحّح متأكدًا', runs_disagree: 'اختلفت جولتا التصحيح', near_pass_mark: 'قريبة من درجة النجاح', model_unavailable: 'لم يكن المصحّح متاحًا',
      model_error: 'فشلت إحدى جولات التصحيح', integrity: 'قد تحتوي الإجابة على تعليمات موجّهة إلى المصحّح', graders_disagree: 'يختلف مِشكاة والنموذج',
    } as Record<string, string>,
    confWord: { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة' } as Record<string, string>,
    acceptAi: 'اعتماد الدرجة المقترحة', override: 'تعديل', correct: 'تصحيح هذه الدرجة', cancel: 'إلغاء',
    yourScore: 'درجتك', reason: 'سبب التعديل', reasonReq: 'سبب التصحيح (مطلوب، ويُحفظ في السجل)', reasonPh: 'مثال: الأخطاء النحوية لا تعيق فهم المعنى',
    reasonCode: 'سبب تغيير درجة النموذج', codes: { too_strict: 'كان المصحّح متشددًا', too_lenient: 'كان المصحّح متساهلًا', wrong_criterion: 'صُحّحت وفق معيار خاطئ', rubric_unclear: 'معيار التقييم غير واضح هنا' } as Record<string, string>,
    chooseLevel: 'اختر مستوى', feedbackAnswer: 'ملاحظات للطالب على هذه الإجابة', saveOverride: 'حفظ التعديل', saveCorrection: 'حفظ التصحيح',
    feedback: 'ملاحظات عامة للطالب', saveFeedback: 'حفظ الملاحظات',
    finalize: 'اعتماد الدرجات وجعلها نهائية', finalizeQ: 'هل تجعل هذه الدرجات نهائية؟ ما لم يكن نشر النتائج يدويًا في هذا الواجب، سيراها الطالب الآن.', confirm: 'نعم، اجعلها نهائية', release: 'نشر النتيجة للطالب',
    grading: 'ما زالت إنارة تصحّح هذا التسليم. يمكنك العمل عليه عند انتهاء التصحيح.', stopped: 'توقّف المصحّح ولم يضع درجة. صحّح الإجابات يدويًا أدناه ثم اجعلها نهائية.',
    appeals: 'طلبات المراجعة من الطالب', aboutAll: 'عن النتيجة كاملة', appealsNote: 'الرد على طلبات المراجعة متاح حاليًا في صفحة التصحيح الكاملة في إنارة.',
    saved: 'تم الحفظ', done: 'تم', total: 'المجموع',
  },
};

type TabId = 'all' | 'review' | 'appeals' | 'done';
const REVIEW = new Set(['grading_exception', 'needs_review', 'graded_draft']);
const BY_HAND = REVIEW;
const STATUS_TONE: Record<string, 'danger' | 'warning' | 'success' | 'neutral' | 'info'> = { grading_exception: 'danger', needs_review: 'warning', graded_draft: 'warning', finalized: 'info', released: 'success' };

interface QItem { attemptId: string; assignmentTitle: string; studentName: string; submittedAt: string; late: boolean; gradingStatus: string; score: number | null; totalPoints: number | null; maxPoints: number | null; gradedByAi: number; answersToReview: number; openAppeals: number }
function toItem(x: unknown): QItem {
  const o = obj(x);
  return {
    attemptId: str(o.attemptId), assignmentTitle: str(o.assignmentTitle), studentName: str(o.studentName), submittedAt: str(o.submittedAt), late: o.late === true,
    gradingStatus: str(o.gradingStatus), score: numOr(o.score), totalPoints: numOr(o.totalPoints), maxPoints: numOr(o.maxPoints),
    gradedByAi: numOr(o.gradedByAi) ?? 0, answersToReview: numOr(o.answersToReview) ?? 0, openAppeals: numOr(o.openAppeals) ?? 0,
  };
}
const inTab = (i: QItem, tab: TabId) => tab === 'all' || (tab === 'review' && REVIEW.has(i.gradingStatus)) || (tab === 'appeals' && i.openAppeals > 0) || (tab === 'done' && i.gradingStatus === 'released');

/** Who set this answer's score, from the fields the grader stores on the answer. */
function sourceOf(a: Record<string, any>): Source | null {
  const crit = arr(a.criteria).map(obj);
  if (a.method === 'teacher' || a.teacherOverride || a.grader === 'teacher') return 'teacher';
  if (str(a.engine) || crit.some((c) => c.scoredBy === 'mishkat')) return 'mishkat';
  if (a.method === 'rule') return 'rules';
  if (a.grader === 'code' && crit.length && crit.every((c) => c.scoredBy === 'code')) return 'rules';
  if (a.method === 'ai' || a.method === 'ai_proposal') return 'model';
  return null;
}

function Confidence({ v }: { v: number | string | null }) {
  const t = useT(T);
  const { lang } = usePreview();
  if (v === null) return null;
  if (typeof v === 'string') {
    const tone = v === 'high' ? 'success' : v === 'medium' ? 'warning' : 'danger';
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{t.conf} <Badge tone={tone}>{t.confWord[v] ?? v}</Badge></span>;
  }
  const pct = Math.round(v * 100);
  const tone = pct >= 85 ? 'success' : pct >= 70 ? 'warning' : 'danger';
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t.conf}>
      {t.conf}
      <Progress value={pct} size="sm" tone={tone} className="w-12" ariaLabel={`${t.conf} ${pct}%`} />
      <span className={cn('font-semibold tabular-nums text-foreground', tone === 'danger' && 'text-destructive')}>{num(pct, lang)}%</span>
    </span>
  );
}

function ScoreLine({ i }: { i: QItem }) {
  const t = useT(T);
  const { lang } = usePreview();
  const final = i.gradingStatus === 'finalized' || i.gradingStatus === 'released';
  if (i.totalPoints !== null && i.maxPoints !== null) {
    return (
      <p className="me-auto text-sm">
        <span className="text-xs text-muted-foreground">{final ? t.final : t.suggested} </span>
        <span className="font-bold tabular-nums">{num(i.totalPoints, lang)}/{num(i.maxPoints, lang)}</span>
        {final && i.score !== null && <span className="text-xs text-muted-foreground"> ({num(Math.round(i.score), lang)}%)</span>}
      </p>
    );
  }
  return <p className="me-auto text-xs text-muted-foreground">—</p>;
}

// ------------------------------------------------------------------ one answer
function AnswerCard({ item, attemptId, mode, onChanged, lang }: { item: Record<string, any>; attemptId: string; mode: 'score' | 'correct' | 'view'; onChanged: () => void; lang: Lang }) {
  const t = useT(T);
  const q = obj(item.question);
  const a = obj(item.answer);
  const ev = obj(item.aiProposal);
  const src = sourceOf(a);
  const isOpen = q.type === 'open-response' || (q.type === 'engine' && arr(obj(q.rubric).criteria).length > 0);
  const rubric = arr(obj(q.rubric).criteria).map(obj);
  const modelScored = q.type === 'engine' && str(a.grader).startsWith('model:');
  const canAccept = mode === 'score' && ev.status === 'proposed' && !!str(a.proposalId) && a.method !== 'teacher' && a.method !== 'ai_proposal';
  const conf: number | string | null = numOr(a.confidence) !== null && a.grader !== 'none' ? numOr(a.confidence) : typeof ev.confidence === 'string' ? ev.confidence : null;

  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState(a.points == null ? '' : String(a.points));
  const [levels, setLevels] = useState<Record<string, string>>(() => Object.fromEntries(arr(a.criterionScores).map(obj).map((c) => [str(c.criterionId), str(c.levelId)])));
  const [feedback, setFeedback] = useState(str(a.feedback));
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); setEditing(false); setReason(''); onChanged(); } catch (e) { setErr(errorText(e, lang)); } finally { setBusy(false); }
  };
  const save = () => {
    const score = isOpen && rubric.length ? { criterionScores: Object.entries(levels).filter(([, v]) => v).map(([criterionId, levelId]) => ({ criterionId, levelId })) } : { points: Number(points) };
    const body = { ...score, ...(feedback.trim() ? { feedback: feedback.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}), ...(reasonCode ? { reasonCode } : {}) };
    return run(() => (mode === 'correct'
      ? post(`/api/grading/attempts/${encodeURIComponent(attemptId)}/correct`, { questionId: str(q.id), ...body })
      : put(`/api/grading/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(str(q.id))}`, body)));
  };
  const accept = () => run(() => put(`/api/grading/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(str(q.id))}`, { acceptProposal: true }));
  const answerText = str(item.answerText) || str(a.answerText) || str(a.studentAnswer);
  const keyText = q.type === 'engine' ? str(item.keyText) : q.type !== 'open-response' ? str(q.correctAnswer) : '';
  const canSave = !busy && (isOpen && rubric.length ? rubric.every((c) => levels[str(c.id)]) : points.trim() !== '' && Number.isFinite(Number(points))) && (mode !== 'correct' || reason.trim().length > 0);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold" dir="auto">{str(q.text)}</p>
        <span className="shrink-0 text-sm font-bold tabular-nums">{a.points == null ? '–' : num(Number(a.points), lang)}<span className="font-normal text-muted-foreground"> / {num(numOr(a.maxPoints) ?? numOr(q.points) ?? 0, lang)}</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {src ? <SourceBadge source={src} /> : <Badge tone="neutral">{t.noSource}</Badge>}
        {a.method === 'ai_proposal' && <Badge tone="success"><Check />{t.acceptedByTeacher}</Badge>}
        {src !== 'teacher' && <Confidence v={conf} />}
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.learnerAnswer}</p>
        <p className="max-w-[72ch] whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-start text-[13.5px] leading-relaxed" dir="auto">{answerText || '—'}</p>
        {keyText && <p className="mt-1.5 text-xs text-muted-foreground">{t.key}: <b dir="auto" className="text-foreground">{keyText}</b></p>}
        {str(q.modelAnswer) && <p className="mt-1 text-xs text-muted-foreground" dir="auto">{t.modelAnswer}: {str(q.modelAnswer)}</p>}
      </div>
      {a.flagged === true && (
        <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{t.flagged}: {arr(a.flagReasons).map((r) => t.flags[str(r)] ?? str(r).replace(/_/g, ' ')).join(' · ')}
        </p>
      )}
      {arr(a.criteria).length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {arr(a.criteria).map(obj).map((c) => {
            const title = str(obj(rubric.find((r) => str(r.id) === str(c.code))).title) || str(c.code);
            const by: Source | null = c.scoredBy === 'mishkat' ? 'mishkat' : c.scoredBy === 'model' ? 'model' : c.scoredBy === 'code' ? 'rules' : null;
            return (
              <li key={str(c.code)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 font-semibold" dir="auto">{title}</span>
                <span className="flex items-center gap-2">{by && <SourceBadge source={by} />}<span className="tabular-nums">{num(numOr(c.points) ?? 0, lang)} / {num(numOr(c.max) ?? 0, lang)}</span></span>
              </li>
            );
          })}
        </ul>
      )}
      {a.method === 'ai' && ev.status === 'proposed' && arr(ev.criteria).length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-chart-4/30 bg-muted/30 p-3 text-sm">
          <p className="text-xs font-semibold">{t.aiView}</p>
          {arr(ev.criteria).map(obj).map((c) => {
            const crit = obj(rubric.find((r) => str(r.id) === str(c.criterionId)));
            const level = obj(arr(crit.levels).map(obj).find((l) => str(l.id) === str(c.levelId)));
            return <p key={str(c.criterionId)} dir="auto"><b>{str(crit.title) || str(c.criterionId)}:</b> {str(level.label)} ({num(numOr(c.points) ?? 0, lang)}). <span className="text-muted-foreground">{str(c.rationale)}</span></p>;
          })}
          {str(a.scoreExplanation) && <p className="text-muted-foreground" dir="auto">{t.why}: {str(a.scoreExplanation)}</p>}
        </div>
      )}
      {str(a.feedback) && !editing && <p className="text-sm" dir="auto"><span className="text-muted-foreground">{t.feedbackAnswer}: </span>{str(a.feedback)}</p>}

      {mode !== 'view' && !editing && (
        <div className="flex flex-wrap gap-2">
          {canAccept && <Button size="sm" isDisabled={busy} onPress={accept}><Check />{t.acceptAi}</Button>}
          <Button size="sm" variant="outline" onPress={() => setEditing(true)}><Pencil />{mode === 'correct' ? t.correct : t.override}</Button>
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-3 border-t pt-3">
          {isOpen && rubric.length ? rubric.map((c) => (
            <Select key={str(c.id)} label={str(c.title) || str(c.id)} placeholder={t.chooseLevel}
              items={arr(c.levels).map(obj).map((l) => ({ id: str(l.id), name: `${str(l.label)} (${num(numOr(l.points) ?? 0, lang)})` }))}
              selectedKey={levels[str(c.id)] || null} onSelectionChange={(k) => setLevels((s) => ({ ...s, [str(c.id)]: k == null ? '' : String(k) }))} />
          )) : (
            <TextField label={`${t.yourScore} (0–${num(numOr(a.maxPoints) ?? 100, lang)})`} type="number" inputMode="decimal" value={points} onChange={setPoints} className="max-w-48" />
          )}
          {modelScored && mode === 'score' && (
            <Select label={t.reasonCode} placeholder={t.reasonCode} items={Object.entries(t.codes).map(([id, name]) => ({ id, name }))} selectedKey={reasonCode} onSelectionChange={(k) => setReasonCode(k == null ? null : String(k))} />
          )}
          <TextField label={mode === 'correct' ? t.reasonReq : t.reason} placeholder={t.reasonPh} value={reason} onChange={setReason} />
          <TextField label={t.feedbackAnswer} multiline value={feedback} onChange={setFeedback} />
          {err && <Alert tone="danger" icon={<AlertTriangle />}>{err}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => { setEditing(false); setErr(null); }}><Undo2 />{t.cancel}</Button>
            <Button size="sm" isDisabled={!canSave} onPress={save}><Check />{mode === 'correct' ? t.saveCorrection : t.saveOverride}</Button>
          </div>
        </div>
      )}
      {!editing && err && <Alert tone="danger" icon={<AlertTriangle />}>{err}</Alert>}
    </li>
  );
}

// ------------------------------------------------------------------ the open submission
function Submission({ attemptId, position, onPrev, onNext, onClose, onChanged }: { attemptId: string; position: { at: number; of: number } | null; onPrev?: () => void; onNext?: () => void; onClose: () => void; onChanged: () => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const sub = useLoad(async (signal) => obj(await get(`/api/grading/attempts/${encodeURIComponent(attemptId)}`, signal)), [attemptId]);
  const d = sub.data;
  const at = obj(d?.attempt);
  const st = str(at.gradingStatus);
  const final = st === 'finalized' || st === 'released';
  const byHand = BY_HAND.has(st);
  const mode: 'score' | 'correct' | 'view' = final ? 'correct' : byHand ? 'score' : 'view';
  const [overall, setOverall] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => { setOverall(str(at.overallFeedback)); setConfirm(false); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMsg(null); }, [attemptId]);

  const changed = () => { sub.reload(); onChanged(); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); setConfirm(false); changed(); } catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); } finally { setBusy(false); }
  };
  const base = `/api/grading/attempts/${encodeURIComponent(attemptId)}`;
  const name = str(obj(d?.student).name);
  const items = arr(d?.items).map(obj);
  const appeals = arr(at.appeals).map(obj).filter((p) => p.status === 'open');

  return (
    <Card className="lg:sticky lg:top-20">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-5">
        <Button variant="ghost" size="sm" className="lg:hidden" onPress={onClose} aria-label={t.back}><Dir><ArrowLeft /></Dir></Button>
        {d ? <Avatar name={name || '?'} className="size-10" /> : <Skeleton className="size-10 rounded-full" />}
        <div className="min-w-0 flex-1">
          {d ? <p className="truncate font-bold">{name}</p> : <Skeleton className="h-4 w-32" />}
          {d && <p className="text-xs text-muted-foreground"><bdi>{str(obj(d.assignment).title)}</bdi> · {t.submitted} {fmtDateTime(at.submittedAt, lang)}{at.late === true ? ` · ${t.late}` : ''}</p>}
        </div>
        {position && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label={t.prev} isDisabled={!onPrev} onPress={onPrev}><Dir><ChevronRight className="rotate-180" /></Dir></Button>
            <span className="text-xs tabular-nums text-muted-foreground">{t.of(position.at, position.of)}</span>
            <Button variant="ghost" size="sm" aria-label={t.next} isDisabled={!onNext} onPress={onNext}><Dir><ChevronRight /></Dir></Button>
          </div>
        )}
      </div>

      {sub.loading && !d ? <div className="p-5"><SkeletonRows rows={4} /></div> : sub.error ? <div className="p-5"><ErrorPanel error={sub.error} onRetry={sub.reload} /></div> : d && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div>
              <p className="text-xs text-muted-foreground">{final ? t.final : t.suggested}</p>
              <p className="text-2xl font-bold tabular-nums">{numOr(at.totalPoints) === null ? '–' : num(Number(at.totalPoints), lang)}<span className="text-base text-muted-foreground"> / {num(numOr(at.maxPoints) ?? 0, lang)}</span></p>
            </div>
            <Badge tone={STATUS_TONE[st] ?? 'neutral'}>{t.status[st] ?? st.replace(/_/g, ' ')}</Badge>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            {st === 'grading_exception' && <Alert tone="danger" icon={<AlertTriangle />}>{t.stopped}</Alert>}
            {mode === 'view' && <Alert tone="info" icon={<Clock3 />}>{t.grading}</Alert>}
            {appeals.length > 0 && (
              <Alert tone="warning" icon={<MessageSquareWarning />} title={t.appeals}>
                <ul className="flex flex-col gap-1">{appeals.map((p) => <li key={str(p.id)} dir="auto">{str(p.questionId) ? <b dir="auto">{str(obj(obj(items.find((i) => str(obj(i.question).id) === str(p.questionId))).question).text) || str(p.questionId)}: </b> : <b>{t.aboutAll}: </b>}{str(p.message)}</li>)}</ul>
                <p className="mt-1 text-xs">{t.appealsNote}</p>
              </Alert>
            )}
            <ul className="flex flex-col gap-3">
              {items.map((it, i) => <AnswerCard key={`${str(obj(it.question).id) || i}-${str(obj(it.answer).points)}-${st}`} item={it} attemptId={attemptId} mode={mode} onChanged={changed} lang={lang} />)}
            </ul>
          </div>
          {byHand && (
            <>
              <Separator />
              <div className="flex flex-col gap-2 p-4 sm:p-5">
                <TextField label={t.feedback} multiline value={overall} onChange={setOverall} className="[&_textarea]:min-h-24" />
                <Button size="sm" variant="outline" className="self-start" isDisabled={busy} onPress={() => act(() => put(`${base}/feedback`, { overallFeedback: overall }), t.saved)}>{t.saveFeedback}</Button>
              </div>
            </>
          )}
          {msg && <div className="px-4 pb-3 sm:px-5"><Alert tone={msg.tone} icon={msg.tone === 'success' ? <Check /> : <AlertTriangle />}>{msg.text}</Alert></div>}
          {(byHand || st === 'finalized') && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
              {byHand && !confirm && <Button isDisabled={busy} onPress={() => setConfirm(true)}><Check />{t.finalize}</Button>}
              {byHand && confirm && (
                <>
                  <p className="me-auto text-sm">{t.finalizeQ}</p>
                  <Button variant="ghost" onPress={() => setConfirm(false)}><X />{t.cancel}</Button>
                  <Button isDisabled={busy} onPress={() => act(() => post(`${base}/finalize`), t.done)}><Check />{t.confirm}</Button>
                </>
              )}
              {st === 'finalized' && <Button variant="success" isDisabled={busy} onPress={() => act(() => post(`${base}/release`), t.done)}><Send />{t.release}</Button>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ page
export default function Grading() {
  const t = useT(T);
  const { lang } = usePreview();
  const classes = useTeacherClasses();
  const classParam = useQueryParam('class');
  const cls = useSelectedClass(classes.data);
  const classId = classParam && cls?.id === classParam ? cls.id : null;
  const openId = useQueryParam('attempt');
  const [tab, setTab] = useState<TabId>('all');

  const queue = useLoad(async (signal) => {
    const r = obj(await get(`/api/grading/queue${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`, signal));
    return { items: arr(r.items).map(toItem).filter((i) => i.attemptId), openAppeals: numOr(r.openAppeals) ?? 0 };
  }, [classId]);
  const all = useMemo(() => queue.data?.items ?? [], [queue.data]);
  const list = all.filter((i) => inTab(i, tab));
  const needs = all.filter((i) => REVIEW.has(i.gradingStatus)).length;
  const counts: Record<TabId, number> = { all: all.length, review: needs, appeals: all.filter((i) => i.openAppeals > 0).length, done: all.filter((i) => i.gradingStatus === 'released').length };

  const open = (id: string | null) => setQuery('/teacher/grading', { attempt: id });
  const idx = openId ? list.findIndex((i) => i.attemptId === openId) : -1;

  return (
    <TeacherShell active="grading" title={t.title} subtitle={queue.data ? t.sub(needs) : undefined} badges={queue.data && needs ? { grading: num(needs, lang) } : undefined}>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Queue (on phone, hidden while a submission is open) */}
        <section className={cn('flex min-w-0 flex-col gap-3', openId && 'hidden lg:flex')}>
          {classes.data && classes.data.length > 1 && <ClassPicker classes={classes.data} value={classId} path="/teacher/grading" allLabel={t.allClasses} className="sm:w-full" />}
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k) as TabId)}>
            <TabList aria-label={t.title} className="w-full overflow-x-auto [&>*]:shrink-0">
              {(['all', 'review', 'appeals', 'done'] as TabId[]).map((k) => (
                <Tab key={k} id={k} className="px-2.5">{{ all: t.tAll, review: t.tReview, appeals: t.tAppeals, done: t.tDone }[k]} {queue.data && <span className="text-muted-foreground">{num(counts[k], lang)}</span>}</Tab>
              ))}
            </TabList>
          </Tabs>
          {queue.loading && !queue.data ? (
            <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Card key={i} className="p-3.5"><SkeletonRows rows={1} /><Skeleton className="mt-3 h-5 w-2/3" /></Card>)}</div>
          ) : queue.error ? (
            <ErrorPanel error={queue.error} onRetry={queue.reload} />
          ) : !all.length ? (
            <EmptyPanel icon={<FileText />} title={t.empty} body={t.emptyBody} />
          ) : !list.length ? (
            <EmptyPanel title={t.emptyTab} />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((s) => {
                const sel = s.attemptId === openId;
                return (
                  <li key={s.attemptId}>
                    <Card className={cn('p-3.5', sel && 'border-primary ring-1 ring-primary lg:bg-secondary/60')}>
                      <div className="flex items-start gap-3">
                        <Avatar name={s.studentName || '?'} className="size-8 text-[11px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{s.studentName || '—'}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(s.submittedAt, lang)}</span>
                          </div>
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><FileText className="size-3.5 shrink-0" /><bdi className="truncate">{s.assignmentTitle || '—'}</bdi></p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone={STATUS_TONE[s.gradingStatus] ?? 'neutral'}>{t.status[s.gradingStatus] ?? s.gradingStatus.replace(/_/g, ' ')}</Badge>
                            {s.late && <Badge tone="warning">{t.late}</Badge>}
                            {s.openAppeals > 0 && <Badge tone="warning"><MessageSquareWarning />{t.requests(s.openAppeals)}</Badge>}
                          </div>
                          {(s.gradedByAi > 0 || s.answersToReview > 0) && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">{[s.gradedByAi > 0 ? t.autoGraded(s.gradedByAi) : '', s.answersToReview > 0 ? t.toReview(s.answersToReview) : ''].filter(Boolean).join(' · ')}</p>
                          )}
                          <div className="mt-2.5 flex items-center gap-2">
                            <ScoreLine i={s} />
                            <Button size="sm" variant={sel ? 'secondary' : 'outline'} className="h-7 px-2.5 text-xs" onPress={() => open(s.attemptId)}>{t.review}</Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Open submission: side panel on desktop, full page on phone */}
        <section aria-label={t.open} className={cn('min-w-0', !openId && 'hidden lg:block')}>
          {openId ? (
            <Submission key={openId} attemptId={openId} position={idx >= 0 ? { at: idx + 1, of: list.length } : null}
              onPrev={idx > 0 ? () => open(list[idx - 1].attemptId) : undefined} onNext={idx >= 0 && idx < list.length - 1 ? () => open(list[idx + 1].attemptId) : undefined}
              onClose={() => open(null)} onChanged={queue.reload} />
          ) : (
            <EmptyPanel icon={<FileText />} title={t.open} body={t.pick} className="lg:sticky lg:top-20" />
          )}
        </section>
      </div>
    </TeacherShell>
  );
}

