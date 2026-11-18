import React, { useEffect, useState } from 'react';
import { Bot, ClipboardCheck, Loader2, Mic, Video } from 'lucide-react';
import { fetchLmsActivity, isLmsPreview, lmsNewTabTarget, type LmsActivityKind, type LmsActivityStatus } from '../services/apiService';
import { MicProblemNotice, SafariFrameHint, useMicGate } from '../components/MicCheck';
import { LiveAvatarModal } from '../components/enara/LiveAvatarModal';
import type { MicFeature } from '../services/micCheck';
import { Diagnostic } from './Diagnostic';

// LMS Phase 8 ("more activities, no grade"): the page an LMS activity opens
// for the AI tutor session, the live avatar session or the diagnostic check
// (backend core/pageTargets.ts ACTIVITY_TARGETS, core/activities.ts).
//
// Student (LmsActivityStudent): what the activity is, "No grade", whether it
// can start on this ENARA site (else a clear English and Arabic message with a
// reference code: no crash, nothing started), the microphone check for the
// tutor and the avatar (the Priority 0 mic flow: "Open in a new tab" when the
// LMS frame blocks the mic; the new tab reopens this page), then Start: the
// normal AI tutor chat, the live avatar call, or the diagnostic.
// Staff (LmsActivityOverview): the same status, and what the course's class
// did with the activity in the last 7 days. Nothing is sent to the LMS gradebook.

export const ACTIVITY_PAGE: Record<LmsActivityKind, string> = { tutor: 'activity-tutor', avatar: 'activity-avatar', diagnostic: 'activity-diagnostic' };

const TEXT: Record<LmsActivityKind, { en: string; ar: string; introEn: string; introAr: string; startEn: string; startAr: string }> = {
  tutor: {
    en: 'AI tutor session',
    ar: 'جلسة مع المعلم الذكي',
    introEn: "Talk with ENARA's AI tutor about this course. You can type, or use the microphone.",
    introAr: 'تحدث مع المعلم الذكي في إنارة عن هذا المقرر. يمكنك الكتابة أو استخدام الميكروفون.',
    startEn: 'Start tutor session',
    startAr: 'ابدأ الجلسة',
  },
  avatar: {
    en: 'Live avatar session',
    ar: 'جلسة مع المعلم المرئي',
    introEn: "A live voice call with ENARA's video tutor. You need a microphone.",
    introAr: 'مكالمة صوتية مباشرة مع المعلم المرئي في إنارة. تحتاج إلى ميكروفون.',
    startEn: 'Start live session',
    startAr: 'ابدأ المكالمة',
  },
  diagnostic: {
    en: 'Diagnostic check',
    ar: 'اختبار تشخيصي',
    introEn: 'A short check of what you already know, one question at a time. You get a report, not a grade.',
    introAr: 'فحص قصير لما تعرفه، سؤالاً بعد سؤال. تحصل على تقرير وليس على درجة.',
    startEn: 'Start',
    startAr: 'ابدأ',
  },
};

/** Why the activity cannot start, as the student reads it (English, Arabic). */
export function studentProblemText(kind: LmsActivityKind, code: string | null): { en: string; ar: string } {
  switch (code) {
    case 'activity_provider_not_configured':
      return kind === 'avatar'
        ? { en: 'The live avatar is not set up on this ENARA site yet, so this session cannot start. Please try again later, or ask your teacher.', ar: 'لم يُجهَّز المعلم المرئي على موقع إنارة هذا بعد، لذلك لا يمكن بدء هذه الجلسة. حاول مرة أخرى لاحقاً أو اسأل معلمك.' }
        : { en: 'The AI tutor is not set up on this ENARA site yet, so this session cannot start. Please try again later, or ask your teacher.', ar: 'لم يُجهَّز المعلم الذكي على موقع إنارة هذا بعد، لذلك لا يمكن بدء هذه الجلسة. حاول مرة أخرى لاحقاً أو اسأل معلمك.' };
    case 'activity_ai_paused':
      return { en: 'AI features are paused right now, so this session cannot start. Please try again later.', ar: 'ميزات الذكاء الاصطناعي متوقفة مؤقتاً الآن، لذلك لا يمكن بدء هذه الجلسة. حاول مرة أخرى لاحقاً.' };
    case 'activity_feature_off':
      return { en: 'Diagnostic checks are not switched on for your school yet. Ask your teacher.', ar: 'الاختبارات التشخيصية غير مفعّلة لمدرستك بعد. اسأل معلمك.' };
    case 'activity_no_class':
      return { en: "ENARA could not find this course's class for you. Open the activity again from your course.", ar: 'لم تجد إنارة فصل هذا المقرر لك. افتح النشاط مرة أخرى من مقررك.' };
    case 'activity_no_objectives':
      return { en: 'This class has no learning objectives to check yet, so the diagnostic cannot start. Ask your teacher.', ar: 'لا توجد لهذا الفصل أهداف تعلم لاختبارها بعد، لذلك لا يمكن بدء الاختبار التشخيصي. اسأل معلمك.' };
    default:
      return { en: 'This activity cannot start right now. Please try again later.', ar: 'لا يمكن بدء هذا النشاط الآن. حاول مرة أخرى لاحقاً.' };
  }
}

/** The same reason, as the teacher reads it (what students see, and what to do). */
export function teacherProblemText(kind: LmsActivityKind, code: string | null): { en: string; ar: string } {
  switch (code) {
    case 'activity_provider_not_configured':
      return { en: `Not set up on this ENARA site yet: the ${kind === 'avatar' ? 'live avatar' : 'AI tutor'} service is not configured. Students who open it see a message asking them to try later. Hide the activity until ENARA support sets it up.`, ar: `غير مُجهَّز على موقع إنارة هذا بعد: خدمة ${kind === 'avatar' ? 'المعلم المرئي' : 'المعلم الذكي'} غير مُعدّة. يرى الطلاب الذين يفتحونه رسالة تطلب منهم المحاولة لاحقاً. أخفِ النشاط حتى يجهّزه دعم إنارة.` };
    case 'activity_ai_paused':
      return { en: 'AI features are paused (for this ENARA site or your school), so students cannot start it now.', ar: 'ميزات الذكاء الاصطناعي متوقفة مؤقتاً (لموقع إنارة هذا أو لمدرستك)، لذلك لا يستطيع الطلاب بدءه الآن.' };
    case 'activity_feature_off':
      return { en: "Diagnostics are switched off for your school. Ask ENARA support to switch on learning intelligence and diagnostics.", ar: 'الاختبارات التشخيصية متوقفة لمدرستك. اطلب من دعم إنارة تشغيل ذكاء التعلم والاختبارات التشخيصية.' };
    case 'activity_no_objectives':
    case 'activity_no_class':
      return { en: "This class has no curriculum with approved learning objectives yet, so there is nothing to check. Link the class to a curriculum in ENARA and approve its objectives.", ar: 'ليس لهذا الفصل منهج بأهداف تعلم معتمدة بعد، فلا يوجد ما يُختبر. اربط الفصل بمنهج في إنارة واعتمد أهدافه.' };
    default:
      return studentProblemText(kind, code);
  }
}

const ICON: Record<LmsActivityKind, React.ReactNode> = {
  tutor: <Bot size={22} aria-hidden="true" />,
  avatar: <Video size={22} aria-hidden="true" />,
  diagnostic: <ClipboardCheck size={22} aria-hidden="true" />,
};
const MIC_FEATURE: Record<LmsActivityKind, MicFeature | null> = { tutor: 'tutor_voice', avatar: 'avatar', diagnostic: null };

const NoGradeBadge: React.FC = () => (
  <span data-testid="lms-activity-no-grade" className="rounded-full px-2 py-0.5 border bg-slate-50 text-slate-700 border-slate-200 text-xs font-semibold">
    No grade · <span lang="ar">بدون درجة</span>
  </span>
);

function useActivityStatus(kind: LmsActivityKind, classId: string | null | undefined) {
  const [status, setStatus] = useState<LmsActivityStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setFailed(null);
    fetchLmsActivity(kind, classId)
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((e: Error & { code?: string }) => { if (!cancelled) setFailed((e.code || 'activity_status_failed').toLowerCase()); });
    return () => { cancelled = true; };
  }, [kind, classId]);
  return { status, failed };
}

const Heading: React.FC<{ kind: LmsActivityKind }> = ({ kind }) => (
  <div className="flex items-start gap-3">
    <span className="w-11 h-11 shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">{ICON[kind]}</span>
    <div className="min-w-0">
      <h1 className="m-0 text-2xl font-extrabold text-slate-900">{TEXT[kind].en}</h1>
      <p dir="rtl" lang="ar" className="m-0 text-slate-600 font-semibold">{TEXT[kind].ar}</p>
    </div>
  </div>
);

const Problem: React.FC<{ text: { en: string; ar: string }; code: string; testId: string }> = ({ text, code, testId }) => (
  <div role="alert" data-testid={testId} className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-4 text-sm space-y-2">
    <p className="m-0">{text.en}</p>
    <p className="m-0" dir="rtl" lang="ar">{text.ar}</p>
    <p className="m-0 text-xs text-amber-800">
      Reference code: <code data-testid="lms-activity-code">{code}</code>
    </p>
  </div>
);

/** The microphone step (tutor and avatar): a check on click; "Open in a new tab" when the LMS frame blocks it. */
const MicStep: React.FC<{ kind: LmsActivityKind; feature: MicFeature }> = ({ kind, feature }) => {
  const mic = useMicGate(feature, { showOnLoad: true });
  const [result, setResult] = useState<'checking' | 'ok' | 'problem' | null>(null);
  const target = () => lmsNewTabTarget({ page: ACTIVITY_PAGE[kind] });
  const check = async () => {
    setResult('checking');
    const status = await mic.check();
    setResult(status === 'ok' ? 'ok' : 'problem');
  };
  return (
    <section className="space-y-2" aria-label="Microphone">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={check} disabled={result === 'checking'} className="h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Mic size={16} aria-hidden="true" /> Test microphone · <span lang="ar">اختبر الميكروفون</span>
        </button>
        {result && (
          <span data-testid="lms-activity-mic-result" className="text-sm font-semibold">
            {result === 'checking' ? 'Checking…' : result === 'ok' ? 'Microphone works · الميكروفون يعمل' : 'Not working · لا يعمل'}
          </span>
        )}
      </div>
      {mic.problem && <MicProblemNotice problem={mic.problem} feature={feature} arabic target={target} />}
      <SafariFrameHint feature={feature} target={target} />
    </section>
  );
};

export const LmsActivityStudent: React.FC<{
  kind: LmsActivityKind;
  classId: string | null;
  /** Opens ENARA's AI tutor chat (the app's tutor panel). */
  onOpenTutor: () => void;
  onAskTutor?: (prompt: string, sessionId?: string) => void;
}> = ({ kind, classId, onOpenTutor, onAskTutor }) => {
  const { status, failed } = useActivityStatus(kind, classId);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const feature = MIC_FEATURE[kind];
  const t = TEXT[kind];

  if (kind === 'diagnostic' && diagnosticOpen && status?.ready && classId) {
    return <Diagnostic courseId={classId} title={t.en} onClose={() => setDiagnosticOpen(false)} onAskTutor={onAskTutor} />;
  }

  const start = () => {
    if (kind === 'tutor') onOpenTutor();
    else if (kind === 'avatar') setAvatarOpen(true);
    else setDiagnosticOpen(true);
  };

  return (
    <div data-testid={`lms-activity-${kind}`} className="max-w-3xl mx-auto space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <Heading kind={kind} />
        <div className="flex flex-wrap gap-2">
          <NoGradeBadge />
          {feature && (
            <span className="rounded-full px-2 py-0.5 border bg-blue-50 text-blue-800 border-blue-200 text-xs font-semibold">
              Microphone · <span lang="ar">الميكروفون</span>
            </span>
          )}
        </div>
        <p className="m-0 text-slate-700">{t.introEn}</p>
        <p className="m-0 text-slate-700" dir="rtl" lang="ar">{t.introAr}</p>
        {isLmsPreview() && <p className="m-0 text-sm text-amber-800">Preview: you see what a student sees. Nothing is saved.</p>}

        {!status && !failed && (
          <p className="m-0 text-slate-500 inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking… · جارٍ التحقق…</p>
        )}
        {failed && <Problem text={studentProblemText(kind, null)} code={failed} testId="lms-activity-unavailable" />}
        {status && !status.ready && <Problem text={studentProblemText(kind, status.code)} code={status.code ?? 'activity_unavailable'} testId="lms-activity-unavailable" />}

        {feature && <MicStep kind={kind} feature={feature} />}

        {status?.ready && (
          <button type="button" data-testid="lms-activity-start" onClick={start} className="h-11 px-5 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold">
            {t.startEn} · <span lang="ar">{t.startAr}</span>
          </button>
        )}
      </section>
      {kind === 'avatar' && (
        <LiveAvatarModal
          isOpen={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          lessonTitle={t.en}
          subject="Academic"
          courseId={classId ?? undefined}
          isStudent
          newTabPage={ACTIVITY_PAGE.avatar}
        />
      )}
    </div>
  );
};

export const LmsActivityOverview: React.FC<{ kind: LmsActivityKind; classId: string | null }> = ({ kind, classId }) => {
  const { status, failed } = useActivityStatus(kind, classId);
  const o = status?.overview;
  return (
    <div data-testid={`lms-activity-overview-${kind}`} className="max-w-3xl mx-auto space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <Heading kind={kind} />
        <div className="flex flex-wrap gap-2"><NoGradeBadge /></div>
        <p className="m-0 text-slate-700">
          {TEXT[kind].introEn} This activity sends no grade to your LMS. If your LMS shows a grade column for it, ENARA never fills it.
        </p>
        <p className="m-0 text-slate-700" dir="rtl" lang="ar">
          {TEXT[kind].introAr} لا يرسل هذا النشاط أي درجة إلى نظام إدارة التعلم. إذا ظهر له عمود درجة في نظام إدارة التعلم فإن إنارة لا تملؤه أبداً.
        </p>
        {!status && !failed && <p className="m-0 text-slate-500">Checking… · جارٍ التحقق…</p>}
        {failed && <Problem text={studentProblemText(kind, null)} code={failed} testId="lms-activity-unavailable" />}
        {status && (status.ready ? (
          <p data-testid="lms-activity-ready" className="m-0 text-emerald-800 font-semibold">Ready: students can start it. · <span lang="ar">جاهز: يستطيع الطلاب بدءه.</span></p>
        ) : (
          <Problem text={teacherProblemText(kind, status.code)} code={status.code ?? 'activity_unavailable'} testId="lms-activity-unavailable" />
        ))}
        {o && (
          <dl data-testid="lms-activity-class-counts" className="grid grid-cols-2 sm:grid-cols-4 gap-3 m-0">
            {[
              ['Students in the class', 'طلاب الفصل', o.students],
              [`Started (last ${o.days} days)`, `بدؤوا (آخر ${o.days} أيام)`, o.studentsStarted],
              [kind === 'diagnostic' ? 'Checks started' : kind === 'avatar' ? 'Live calls' : 'Tutor chats', kind === 'diagnostic' ? 'اختبارات بدأت' : kind === 'avatar' ? 'مكالمات مباشرة' : 'محادثات', o.sessions],
              ...(o.completed !== undefined ? [['Checks finished', 'اختبارات انتهت', o.completed] as const] : []),
            ].map(([en, ar, n]) => (
              <div key={String(en)} className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">{en} · <span lang="ar">{ar}</span></dt>
                <dd className="m-0 text-xl font-extrabold text-slate-900">{n}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-sm text-slate-500">
          To see what students see, use "Switch role to Student" in your LMS course. · <span lang="ar">لترى ما يراه الطلاب، استخدم «التبديل إلى دور طالب» في مقرر نظام إدارة التعلم.</span>
        </p>
      </section>
    </div>
  );
};
