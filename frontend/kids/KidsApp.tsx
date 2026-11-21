// Enara Kids: the student app for students whose school turned on the kids
// interface (Student.uiMode === 'kids'). Same student APIs as the standard
// pages; the screens come from the Enara Kids Design System (./enaraKids).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './enaraKids.css';
import * as K from './enaraKids';
import type { Lang } from './enaraKids';
import * as api from '../services/apiService';
import { toast } from '../services/toastService';
import { SpeakingExam } from '../components/SpeakingExam';
import { LiveAvatarModal } from '../components/enara/LiveAvatarModal';
import { MicProblemNotice, useMicGate } from '../components/MicCheck';
import { classifySpeechRecognitionError, isInFrame } from '../services/micCheck';
import * as D from './kidsData';
import { TutorText } from '../components/TutorText';
import { stripMarkdownForSpeech } from '../services/speechText';
import { kidsTabForLmsPage, showOldAssessmentsTab } from '../services/roleRouting';

type Tab = 'home' | 'learning' | 'progress' | 'assignments' | 'plan' | 'quizzes' | 'results';
type Route =
  | { tab: 'home' }
  | { tab: 'review' }
  | { tab: 'learning'; courseId?: string; lessonId?: string }
  | { tab: 'progress'; check?: { courseId: string; objectiveIds?: string[]; title: string } }
  | { tab: 'assignments'; id?: string }
  | { tab: 'plan' }
  | { tab: 'quizzes'; id?: string }
  | { tab: 'results' };
type Tutor = { open: boolean; sessionId?: string; prompt?: string; courseId?: string; lessonId?: string };
type Ctx = {
  lang: Lang;
  go: (r: Route) => void;
  askTutor: (t?: Omit<Tutor, 'open'>) => void;
  speak: (text: string) => void;
  T: (en: string, ar: string) => string;
  /** P0 item 6: an LMS student (no older quiz list). */
  lmsStudent: boolean;
};

const LANG_KEY = 'enara_kids_lang';
const LANGS: Lang[] = ['en', 'ar', 'ar-EG'];
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: undefined }));
    fn().then(data => live && setState({ data, loading: false }), error => live && setState({ error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN(x => x + 1) };
}

function Loading({ ctx }: { ctx: Ctx }) {
  return <section className="ek-screen"><K.StateMessage kind="loading" lang={ctx.lang} /></section>;
}
function Failed({ ctx, onRetry, title }: { ctx: Ctx; onRetry: () => void; title?: string }) {
  return <section className="ek-screen"><K.StateMessage kind="error" lang={ctx.lang} title={title} onRetry={onRetry} /></section>;
}

export interface KidsAppProps {
  userName: string;
  tourPending?: boolean;
  sharedAssessmentId?: string | null;
  sharedCourseId?: string | null;
  /** Opened from an LMS activity bound to ENARA work: the assignment to open first (as the standard student app does). */
  lmsAssignmentId?: string | null;
  /** LMS Phase 2b: a launch with a page target (enara_target): the student app page, mapped to its kids tab. */
  lmsPage?: string | null;
  /** P0 item 6: an LMS student; the older quiz list (attempts without an assignment) is not offered. */
  lmsStudent?: boolean;
  onSignOut: () => void;
}

export default function KidsApp({ tourPending, sharedAssessmentId, sharedCourseId, lmsAssignmentId, lmsPage, lmsStudent = false, onSignOut }: KidsAppProps) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null;
      if (saved && LANGS.includes(saved)) return saved;
    } catch { /* storage unavailable */ }
    return navigator.language?.startsWith('ar') ? 'ar' : 'en';
  });
  const [route, setRoute] = useState<Route>(() =>
    lmsAssignmentId ? { tab: 'assignments', id: lmsAssignmentId }
      : lmsPage ? { tab: kidsTabForLmsPage(lmsPage) }
      : sharedAssessmentId ? { tab: 'quizzes', id: sharedAssessmentId } : sharedCourseId ? { tab: 'learning', courseId: sharedCourseId } : { tab: 'home' });
  // A later launch in the same tab (a new LMS activity) opens its assignment too.
  useEffect(() => { if (lmsAssignmentId) setRoute({ tab: 'assignments', id: lmsAssignmentId }); }, [lmsAssignmentId]);
  useEffect(() => { if (lmsPage && !lmsAssignmentId) setRoute({ tab: kidsTabForLmsPage(lmsPage) }); }, [lmsPage, lmsAssignmentId]);
  const [tutor, setTutor] = useState<Tutor>({ open: false });
  const [tourStep, setTourStep] = useState(tourPending ? 1 : 0);
  const [night, setNight] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [flags, setFlags] = useState({ progress: false, assignments: false, plan: false, quizzes: !lmsStudent });
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setNight(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // The same tab rules as the standard student portal.
  useEffect(() => {
    const ok = (p: Promise<unknown>) => p.then(() => true, () => false);
    Promise.all([ok(api.fetchKnowledgeMap()), api.fetchMyAssignments().then(() => true, () => false), ok(api.fetchMyStudyPlan()), lmsStudent ? Promise.resolve([]) : api.fetchMyAssessments().catch(() => [])])
      .then(([progress, assignments, plan, assessments]) =>
        setFlags({
          progress: progress as boolean, assignments: assignments as boolean, plan: plan as boolean,
          quizzes: showOldAssessmentsTab({ assignmentsEnabled: assignments as boolean, oldAssessmentCount: (assessments as unknown[]).length, lmsStudent }),
        }));
  }, [lmsStudent]);

  const go = useCallback((r: Route) => { setRoute(r); mainRef.current?.scrollIntoView({ block: 'start' }); window.scrollTo?.(0, 0); }, []);
  const T = useCallback((en: string, ar: string) => (D.isArabic(lang) ? ar : en), [lang]);
  const speak = useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      // Read aloud the words only: no Markdown symbols or citation markers.
      const u = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text) || text);
      u.lang = lang === 'ar-EG' ? 'ar-EG' : lang === 'ar' ? 'ar-SA' : 'en-GB';
      u.rate = 0.95;
      synth.speak(u);
    } catch { /* speech not available */ }
  }, [lang]);
  const ctx: Ctx = useMemo(() => ({ lang, go, T, speak, lmsStudent, askTutor: t => setTutor({ open: true, ...(t || {}) }) }), [lang, go, T, speak, lmsStudent]);

  const changeLang = () => {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  };

  const tabs: Tab[] = ['home', 'learning', ...(flags.progress ? ['progress' as Tab] : []), ...(flags.assignments ? ['assignments' as Tab] : []),
    ...(flags.plan ? ['plan' as Tab] : []), ...(flags.quizzes ? ['quizzes' as Tab] : []), 'results'];
  const tour = tourSteps(tabs, T);
  const endTour = () => { setTourStep(0); api.completeTour().catch(() => undefined); };

  let screen: React.ReactNode;
  switch (route.tab) {
    case 'home': screen = <Home ctx={ctx} />; break;
    case 'review': screen = <Review ctx={ctx} />; break;
    case 'learning': screen = <Learning ctx={ctx} courseId={route.courseId} lessonId={route.lessonId} />; break;
    case 'progress': screen = route.check ? <Check ctx={ctx} check={route.check} /> : <Skills ctx={ctx} />; break;
    case 'assignments': screen = <Homework ctx={ctx} id={route.id} />; break;
    case 'plan': screen = <Plan ctx={ctx} />; break;
    case 'quizzes': screen = <Quizzes ctx={ctx} id={route.id} shared={!!sharedAssessmentId} onSignOut={onSignOut} />; break;
    case 'results': screen = <Results ctx={ctx} />; break;
  }
  const current: Tab = route.tab === 'review' ? 'home' : route.tab;

  return (
    <div className="ek-root" data-theme={night ? 'night' : 'day'} dir={D.isArabic(lang) ? 'rtl' : 'ltr'} lang={lang === 'ar-EG' ? 'ar' : lang} ref={mainRef}>
      <K.AppShell
        lang={lang}
        current={current}
        tabs={tabs}
        onNavigate={(k: Tab) => go({ tab: k } as Route)}
        onTutor={() => ctx.askTutor()}
        onTour={() => setTourStep(1)}
        onSignOut={onSignOut}
        onLang={changeLang}
        overlay={tourStep > 0 && tour[tourStep - 1] ? (
          <div className="ek-app__overlay">
            <K.TourCard lang={lang} step={tourStep} total={tour.length} title={tour[tourStep - 1].title} body={tour[tourStep - 1].body}
              onNext={() => (tourStep >= tour.length ? endTour() : setTourStep(tourStep + 1))}
              onBack={() => setTourStep(Math.max(1, tourStep - 1))} onSkip={endTour} />
          </div>
        ) : null}
      >
        {screen}
      </K.AppShell>
      {tutor.open && <TutorDrawer ctx={ctx} tutor={tutor} onClose={() => setTutor({ open: false })} />}
    </div>
  );
}

function tourSteps(tabs: Tab[], T: Ctx['T']) {
  const all: Record<string, [string, string, string, string]> = {
    home: ['Home', 'Start here every day: your next lesson, what’s due and your badges.', 'الرئيسية', 'ابدأ من هنا كل يوم: درسك التالي وما عليك وأوسمتك.'],
    learning: ['My learning', 'All your lessons, one step at a time.', 'دروسي', 'كل دروسك، خطوة بخطوة.'],
    progress: ['My skills', 'See how your skills are growing, and what to practise next.', 'مهاراتي', 'شاهد كيف تكبر مهاراتك، وما تتدرّب عليه.'],
    assignments: ['Homework', 'Work from your teachers.', 'واجباتي', 'أعمال من معلّميك.'],
    plan: ['My plan', 'What to do next, one step at a time.', 'خطتي', 'ما عليك فعله، خطوة بخطوة.'],
    quizzes: ['Quizzes', 'Your quizzes are here.', 'اختباراتي', 'اختباراتك هنا.'],
    results: ['My results', 'How your quizzes went.', 'نتائجي', 'كيف كانت اختباراتك.'],
  };
  return [
    { title: T('Welcome to Enara!', 'أهلًا بك في إنارة!'), body: T('Let’s look around. It only takes a minute.', 'لنتجوّل قليلًا. الأمر يستغرق دقيقة.') },
    ...tabs.map(t => ({ title: T(all[t][0], all[t][2]), body: T(all[t][1], all[t][3]) })),
    { title: T('Ask Enara any time', 'اسأل إنارة في أي وقت'), body: T('Press Ask Enara whenever you need help. You can see this tour again from Tour.', 'اضغط «اسأل إنارة» متى احتجت مساعدة. يمكنك رؤية هذه الجولة مرة أخرى من «جولة».') },
  ];
}

// ---------------- Home ----------------
function Home({ ctx }: { ctx: Ctx }) {
  const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const load = useLoad(async () => {
    const [dashboard, courses, results, achievements, assignments, assessments, next] = await Promise.all([
      api.fetchMyDashboard() as Promise<any>,
      soft(api.fetchMyCourses(), [] as any[]),
      soft(api.fetchMyResults(), [] as any[]),
      soft(api.fetchMyAchievements() as Promise<any[]>, [] as any[]),
      soft(api.fetchMyAssignments().then(r => r.assignments), [] as any[]),
      ctx.lmsStudent ? Promise.resolve([] as any[]) : soft(api.fetchMyAssessments(), [] as any[]),
      soft(api.fetchNextSteps().then(r => r.steps), [] as any[]),
    ]);
    const courseId = dashboard?.continueLearning?.courseId || courses.find((c: any) => c.progressPct < 100)?.id || courses[0]?.id;
    const tree = courseId ? await soft(api.fetchMyCourse(courseId) as Promise<any>, null) : null;
    return D.homeData({ dashboard, tree, courses, results, achievements, assignments, assessments, steps: next, lang: ctx.lang });
  }, [ctx.lang]);
  if (load.loading && !load.data) return <K.HomeScreen lang={ctx.lang} state="loading" />;
  if (load.error) return <K.HomeScreen lang={ctx.lang} state="error" onRetry={load.reload} />;
  const data = load.data!;
  return (
    <K.HomeScreen
      lang={ctx.lang}
      data={data}
      onResume={() => data.resume && ctx.go({ tab: 'learning', courseId: data.resume.courseId, lessonId: data.resume.lessonId })}
      onStep={(s: any) => s.kind === 'review' ? ctx.go({ tab: 'review' })
        : s.kind === 'tutor' ? ctx.askTutor({ prompt: s.prompt })
        : ctx.go({ tab: 'learning', courseId: s.courseId, lessonId: s.lessonId })}
      onOpenDue={(x: any) => ctx.go(x.kind === 'quiz' ? { tab: 'quizzes', id: x.id } : { tab: 'assignments', id: x.id })}
      onAllCourses={() => ctx.go({ tab: 'learning' })}
      onAllResults={() => ctx.go({ tab: 'results' })}
      onTutor={() => ctx.askTutor()}
    />
  );
}

function Review({ ctx }: { ctx: Ctx }) {
  const load = useLoad(() => api.fetchDueReviews().then(r => D.reviewQuestions(r.items || [])), []);
  if (load.loading) return <Loading ctx={ctx} />;
  if (load.error) return <Failed ctx={ctx} onRetry={load.reload} />;
  return (
    <K.QuickReviewScreen
      lang={ctx.lang}
      questions={load.data}
      onAnswer={(q: any, v: string) => api.answerReview(q.id, D.reviewAnswer(q, v)).then(D.reviewResult, (e: unknown) => { toast.error(ctx.T('Not checked', 'لم يُتحقّق'), errText(e)); return { correct: false }; })}
      onClose={() => ctx.go({ tab: 'home' })}
    />
  );
}

// ---------------- Learning ----------------
function Learning({ ctx, courseId, lessonId }: { ctx: Ctx; courseId?: string; lessonId?: string }) {
  if (!courseId) return <CourseList ctx={ctx} />;
  return <Course ctx={ctx} courseId={courseId} lessonId={lessonId} />;
}

function CourseList({ ctx }: { ctx: Ctx }) {
  const load = useLoad(() => api.fetchMyCourses(), []);
  const courses = (load.data || []).map((c: any) => ({ ...D.homeData({ courses: [c], lang: ctx.lang }).courses[0] }));
  return (
    <K.CoursesScreen
      lang={ctx.lang}
      state={load.loading ? 'loading' : load.error ? 'error' : undefined}
      onRetry={load.reload}
      courses={courses}
      onOpen={(id: string) => ctx.go({ tab: 'learning', courseId: id })}
    />
  );
}

function Course({ ctx, courseId, lessonId }: { ctx: Ctx; courseId: string; lessonId?: string }) {
  const [tree, setTree] = useState<any>(null);
  const load = useLoad(() => api.fetchMyCourse(courseId) as Promise<any>, [courseId]);
  useEffect(() => { if (load.data) setTree(load.data); }, [load.data]);
  if (!tree && load.loading) return <Loading ctx={ctx} />;
  if (!tree) return <Failed ctx={ctx} onRetry={load.reload} title={ctx.T('We couldn’t open this course.', 'تعذّر فتح هذه المادة.')} />;

  if (!lessonId) {
    return (
      <K.LessonMap
        lang={ctx.lang}
        course={D.courseOutline(tree)}
        subjectColor="blue"
        onBack={() => ctx.go({ tab: 'learning' })}
        onOpen={(id: string) => ctx.go({ tab: 'learning', courseId, lessonId: id })}
      />
    );
  }
  const view = D.lessonView(tree, lessonId);
  if (!view) return <Failed ctx={ctx} onRetry={() => ctx.go({ tab: 'learning', courseId })} title={ctx.T('We couldn’t find this lesson.', 'تعذّر العثور على هذا الدرس.')} />;
  const video = view.videoUrl
    ? (/youtube\.com|youtu\.be|vimeo\.com|player\./.test(view.videoUrl)
      ? <iframe src={view.videoUrl} title={view.lesson.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      : <video src={view.videoUrl} controls playsInline preload="metadata" />)
    : null;
  const next = view.next;
  return (
    <K.LessonScreen
      key={lessonId}
      lang={ctx.lang}
      lesson={view.lesson}
      video={video}
      completed={view.completed}
      onReadAloud={ctx.speak}
      onBack={() => ctx.go({ tab: 'learning', courseId })}
      onAskTutor={() => ctx.askTutor({ courseId, lessonId, prompt: ctx.T(`Can you help me with the lesson “${view.lesson.title}”?`, `هل يمكنك مساعدتي في درس «${view.lesson.title}»؟`) })}
      onComplete={async () => {
        try {
          setTree(await api.completeMyLesson(courseId, lessonId));
        } catch (e) { toast.error(ctx.T('Not saved', 'لم يُحفظ'), errText(e)); }
      }}
      nextLabel={next ? undefined : ctx.T('Back to the course', 'العودة إلى المادة')}
      onNext={() => ctx.go(next ? { tab: 'learning', courseId, lessonId: next.id } : { tab: 'learning', courseId })}
    />
  );
}

// ---------------- Skills and quick check ----------------
function Skills({ ctx }: { ctx: Ctx }) {
  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const load = useLoad(async () => {
    const map = await api.fetchKnowledgeMap();
    const [plan, recs] = await Promise.all([
      api.fetchMyInterventions().then(r => r.interventions).catch(() => []),
      api.fetchRecommendations().then((r: any) => r.recommendations || []).catch(() => []),
    ]);
    return { objectives: map.objectives || [], plan, recs };
  }, []);
  if (load.loading && !load.data) return <K.ProgressScreen lang={ctx.lang} state="loading" />;
  if (load.error) return <K.ProgressScreen lang={ctx.lang} state={api.isFeatureDisabled(load.error) ? 'off' : 'error'} onRetry={load.reload} />;
  const { objectives, plan, recs } = load.data!;
  if (!objectives.length) return <K.ProgressScreen lang={ctx.lang} state="empty" />;
  const skills = D.skillList(objectives, ctx.lang).map(s => ({ ...s, answers: answers[s.id] }));
  const rec = D.firstRecommendation(recs, skills, ctx.lang);

  const practise = async (objective: { id: string; title: string }, interventionId?: string) => {
    try {
      let id = interventionId;
      if (!id) {
        try { id = (await api.createIntervention(objective.id)).id; }
        catch (err) {
          const active = (await api.fetchMyInterventions()).interventions.find((i: any) => i.objectiveId === objective.id && ['assigned', 'in_progress'].includes(i.status));
          if (!active) throw err;
          id = active.id;
        }
      }
      const started = await api.startIntervention(id!);
      ctx.askTutor({ sessionId: started.tutorSessionId ?? undefined, prompt: started.tutorSessionId ? undefined : ctx.T(`I’d like to practise: ${objective.title}.`, `أريد أن أتدرّب على: ${objective.title}.`) });
      load.reload();
    } catch {
      ctx.askTutor({ prompt: ctx.T(`Help me practise ${objective.title}. Ask me one question at a time.`, `ساعدني أتدرّب على ${objective.title}. اسألني سؤالًا واحدًا كل مرة.`) });
    }
  };
  const check = (courseId: string | null | undefined, objectiveIds: string[], title: string) => {
    if (!courseId) { toast.info(ctx.T('Not ready yet', 'ليس جاهزًا بعد'), ctx.T('This skill has no quick check yet.', 'لا يوجد تحقّق سريع لهذه المهارة بعد.')); return; }
    ctx.go({ tab: 'progress', check: { courseId, objectiveIds, title } });
  };

  return (
    <K.ProgressScreen
      lang={ctx.lang}
      skills={skills}
      plan={D.practicePlan(plan)}
      recommendation={rec}
      onRecommendation={(r: any) => r.type === 'reassess' ? check(r.courseId, [r.objectiveId], r.title)
        : r.type === 'review_due' ? ctx.go({ tab: 'review' })
        : r.type === 'learn_next' ? ctx.go({ tab: 'learning' })
        : practise({ id: r.objectiveId, title: r.title })}
      onOpenSkill={(s: any) => api.fetchObjectiveMastery(s.id).then(m => setAnswers(a => ({ ...a, [s.id]: D.skillAnswers(m, ctx.lang) })), () => undefined)}
      onQuickCheck={(s: any) => s && s.id ? check(s.courseId, [s.id], s.title) : undefined}
      onPractise={(s: any) => s && practise({ id: s.id, title: s.title })}
      onPlanPractise={(i: any) => practise({ id: i.objectiveId, title: i.title }, i.id)}
      onPlanPractised={(i: any) => api.completeIntervention(i.id).then(() => load.reload(), (e: unknown) => toast.error(ctx.T('Not saved', 'لم يُحفظ'), errText(e)))}
      onPlanCheck={async (i: any) => { try { await api.reassessIntervention(i.id); } catch { /* the check still runs */ } check(i.courseId, [i.objectiveId], i.title); }}
    />
  );
}

function Check({ ctx, check }: { ctx: Ctx; check: { courseId: string; objectiveIds?: string[]; title: string } }) {
  const [view, setView] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const finish = async (v: any) => {
    try { setReport(D.checkReport(await api.fetchDiagnosticReport(v.id), ctx.lang)); }
    catch (e) { toast.error(ctx.T('No results yet', 'لا نتائج بعد'), errText(e)); }
  };
  const step = async (v: any) => { setView(v); if (v.status !== 'in_progress' || !v.currentQuestion) await finish(v); };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await step(await fn()); } catch (e) { toast.error(ctx.T('Something went wrong', 'حدث خطأ ما'), errText(e)); } finally { setBusy(false); }
  };
  const back = () => ctx.go({ tab: 'progress' });
  const title = ctx.T('Quick check: ', 'تحقّق سريع: ') + check.title;
  if (report) {
    return <K.QuickCheckScreen key="results" lang={ctx.lang} stage="results" check={{ title, results: report.results, answered: report.answered, questions: [] }} reason={report.reason}
      onDone={back} onPractise={(r: any) => ctx.askTutor({ prompt: ctx.T(`Help me practise ${r.title}. Ask me one question at a time.`, `ساعدني أتدرّب على ${r.title}. اسألني سؤالًا واحدًا كل مرة.`) })} />;
  }
  const q = D.checkQuestion(view);
  if (!view || !q) {
    return <K.QuickCheckScreen key="intro" lang={ctx.lang} stage="intro" busy={busy} check={{ title, questions: [], results: [] }} onBack={back}
      onStart={() => run(() => api.startDiagnostic(check.courseId, check.objectiveIds))} />;
  }
  return <K.QuickCheckScreen key={'q' + q.id} lang={ctx.lang} stage="question" busy={busy} question={q} index={view.questionsAnswered || 0} about={view.maxQuestions || 12}
    onAnswer={(qq: any, v: string) => run(() => api.answerDiagnostic(view.id, qq.assessmentId, qq.id, v))}
    onStop={() => run(() => api.completeDiagnostic(view.id))} />;
}

// ---------------- Homework ----------------
function Homework({ ctx, id }: { ctx: Ctx; id?: string }) {
  if (!id) return <HomeworkList ctx={ctx} />;
  return <HomeworkOne ctx={ctx} id={id} />;
}

function HomeworkList({ ctx }: { ctx: Ctx }) {
  const load = useLoad(() => api.fetchMyAssignments().then(r => r.assignments), []);
  if (load.loading) return <Loading ctx={ctx} />;
  if (load.error) return <Failed ctx={ctx} onRetry={load.reload} />;
  return <K.AssignmentsScreen lang={ctx.lang} assignments={D.homeworkList(load.data || [])} onOpen={(aid: string) => ctx.go({ tab: 'assignments', id: aid })} />;
}

function HomeworkOne({ ctx, id }: { ctx: Ctx; id: string }) {
  const load = useLoad(() => api.fetchMyAssignment(id), [id]);
  const [work, setWork] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [poll, setPoll] = useState(0);
  const back = () => ctx.go({ tab: 'assignments' });
  const d = load.data;
  const latest = d?.attempts?.length ? d.attempts[d.attempts.length - 1] : null;

  // While Enara is grading, check again every few seconds.
  useEffect(() => {
    if (!latest || latest.released || latest.processing !== 'grading') return;
    const t = setTimeout(() => { load.reload(); setPoll(p => p + 1); }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.attemptId, latest?.released, latest?.processing, poll]);

  if (!d && load.loading) return <Loading ctx={ctx} />;
  if (!d) return <Failed ctx={ctx} onRetry={load.reload} />;
  const a = D.homeworkDetail(d);
  const handoff = async (kind: 'assignment' | 'result', refId: string) => {
    try { const r = await api.startTutorHandoff(kind, refId); ctx.askTutor({ sessionId: r.sessionId }); }
    catch (e) { toast.error(ctx.T('Enara isn’t available', 'إنارة غير متاحة'), errText(e)); }
  };
  const start = async () => {
    setBusy(true);
    try { setWork(await api.startMyAssignment(id)); }
    catch (e) { toast.error(ctx.T('Can’t start yet', 'لا يمكن البدء الآن'), errText(e)); }
    finally { setBusy(false); }
  };
  const submit = async (answers: Record<string, string>) => {
    setBusy(true);
    try {
      await api.submitMyAssignment(id, work.attempt.id, answers);
      toast.success(ctx.T('Handed in!', 'تم التسليم!'), K.cheer('handedIn', ctx.lang, id));
      setWork(null);
      load.reload();
    } catch (e) {
      toast.error(ctx.T('Not handed in', 'لم يُسلَّم'), errText(e));
    } finally { setBusy(false); }
  };

  if (work) {
    if (work.format === 'english_conversation' && work.speaking) {
      return (
        <section className="ek-screen">
          <K.Button variant="ghost" icon="arrowLeft" onClick={() => setWork(null)}>{ctx.T('Back', 'رجوع')}</K.Button>
          <div className="ek-standard-embed" dir="ltr" lang="en">
            <SpeakingExam assignmentId={id} attempt={{ ...work.attempt, speakingStarted: Boolean(work.speakingAttempt) }} settings={work.speaking} busy={busy} onSubmit={() => submit({})} />
          </div>
        </section>
      );
    }
    if (work.format === 'conversation') {
      return <ConversationExam ctx={ctx} id={id} work={work} busy={busy} onExit={() => setWork(null)} onSubmit={() => submit({})} />;
    }
    return <HomeworkWork ctx={ctx} id={id} title={a.title} work={work} busy={busy} onExit={() => setWork(null)} onSubmit={submit} />;
  }

  if (latest && !latest.released) {
    const who = latest.processing === 'with_teacher' ? 'teacher' : latest.processing === 'delayed' ? 'slow' : 'enara';
    return <K.AssignmentScreen lang={ctx.lang} assignment={a} view="waiting" waiting={who} onBack={back} />;
  }
  const result = latest ? D.homeworkResult(latest) : null;
  if (result && !d.openAttemptId && !d.canStart) {
    const openAppeal = (latest.appeals || []).find((x: any) => x.status === 'open');
    const answered = (latest.appeals || []).filter((x: any) => x.status !== 'open').slice(-1)[0];
    const appealStatus = openAppeal ? ctx.T('Your teacher is looking at it again.', 'معلّمك يراجعه مرة أخرى.')
      : answered ? (answered.response || (answered.status === 'upheld' ? ctx.T('Your teacher agreed and changed it.', 'وافق معلّمك وعدّله.') : ctx.T('Your teacher kept the result.', 'أبقى معلّمك النتيجة كما هي.'))) : undefined;
    return (
      <K.AssignmentScreen lang={ctx.lang} view="results" assignment={{ ...a, result }} onBack={back} appealStatus={appealStatus}
        onTutor={a.help === 'blocked' ? undefined : () => handoff('result', latest.attemptId)}
        onAppeal={async (text: string) => {
          try { await api.appealMyResult(id, latest.attemptId, text); toast.success(ctx.T('Sent', 'أُرسل'), ctx.T('Your teacher will look again.', 'سيراجع معلّمك مرة أخرى.')); load.reload(); }
          catch (e) { toast.error(ctx.T('Not sent', 'لم يُرسل'), errText(e)); }
        }} />
    );
  }
  const status = d.openAttemptId ? 'in_progress' : a.status;
  return (
    <K.AssignmentScreen lang={ctx.lang} view="start" assignment={{ ...a, status }} closed={!d.canStart && !d.openAttemptId} onBack={back}
      onTutor={a.help === 'blocked' ? undefined : () => handoff('assignment', id)}
      onStart={busy ? undefined : start} />
  );
}

function HomeworkWork({ ctx, id, title, work, busy, onExit, onSubmit }: { ctx: Ctx; id: string; title: string; work: any; busy: boolean; onExit: () => void; onSubmit: (a: Record<string, string>) => void }) {
  const questions = useMemo(() => D.homeworkQuestions(work.questions || []), [work]);
  const initial = useMemo(() => Object.fromEntries(Object.entries(work.attempt?.draftAnswers || {}).map(([k, v]) => [k, String(v)])), [work]);
  const answers = useRef<Record<string, string>>(initial);
  const [saved, setSaved] = useState(true);
  const left = useSecondsLeft(work.attempt?.expiresAt);
  const save = useCallback(async () => {
    try { await api.saveMyAssignmentDraft(id, work.attempt.id, answers.current); setSaved(true); } catch { /* try again next time */ }
  }, [id, work]);
  useEffect(() => { const t = setInterval(save, 15000); return () => clearInterval(t); }, [save]);
  const submitted = useRef(false);
  useEffect(() => {
    if (left === 0 && !submitted.current) { submitted.current = true; toast.info(ctx.T('Time is up', 'انتهى الوقت'), ctx.T('We handed in your answers.', 'سلّمنا إجاباتك.')); onSubmit(answers.current); }
  }, [left, onSubmit, ctx]);
  return (
    <K.WorkScreen lang={ctx.lang} mode="assignment" busy={busy} saved={saved}
      work={{ title, subject: '', minutes: work.attempt?.expiresAt ? Math.max(1, Math.round((new Date(work.attempt.expiresAt).getTime() - new Date(work.attempt.startedAt).getTime()) / 60000)) : 0, questions }}
      answers={initial} secondsLeft={left ?? undefined}
      onChange={(a: Record<string, string>) => { answers.current = a; setSaved(false); }}
      onExit={() => { save(); onExit(); }}
      onSubmit={(a: Record<string, string>) => { submitted.current = true; onSubmit(a); }} />
  );
}

function useSecondsLeft(until?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  if (!until) return null;
  return Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
}

function ConversationExam({ ctx, id, work, busy, onExit, onSubmit }: { ctx: Ctx; id: string; work: any; busy: boolean; onExit: () => void; onSubmit: () => void }) {
  const [turns, setTurns] = useState<any[]>(work.attempt?.conversation || []);
  const [state, setState] = useState<any>(work.attempt?.conversationState);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const started = useRef(false);
  const send = useCallback(async (t?: string) => {
    setSending(true);
    if (t) setTurns(x => [...x, { role: 'student', text: t, pending: true }]);
    try {
      const r = await api.converseMyAssignment(id, work.attempt.id, t);
      setTurns(x => [...x.filter(y => !y.pending), ...r.turns]);
      setState(r.state);
      setText('');
    } catch (e) {
      setTurns(x => x.filter(y => !y.pending));
      toast.error(ctx.T('Not sent', 'لم يُرسل'), errText(e));
    } finally { setSending(false); }
  }, [id, work, ctx]);
  useEffect(() => { if (!started.current && !work.attempt?.conversationState) { started.current = true; send(); } }, [send, work]);
  const done = !!state?.done;
  return (
    <section className="ek-screen ek-screen--tutor">
      <header className="ek-tutorhead">
        <K.Button variant="ghost" icon="close" label={ctx.T('Leave', 'خروج')} onClick={onExit} />
        <div><h1 className="ek-tutorhead__title">{ctx.T('Talk with the examiner', 'تحدّث مع الممتحن')}</h1>
          <span className="ek-muted">{ctx.T('Answer in your own words.', 'أجب بكلماتك.')}</span></div>
      </header>
      <div className="ek-chat">
        {turns.map((t, i) => (
          <K.TutorBubble key={i} lang={ctx.lang} from={t.role === 'student' ? 'child' : 'tutor'} name={false}
            onReadAloud={t.role === 'student' ? undefined : () => ctx.speak(t.text)}><span className="ek-chat__text">{t.role === 'student' ? t.text : <TutorText text={t.text} simple />}</span></K.TutorBubble>
        ))}
        {sending && <div className="ek-thinking" role="status"><span className="ek-dots" aria-hidden="true"><i /><i /><i /></span>{ctx.T('The examiner is listening…', 'الممتحن يستمع…')}</div>}
      </div>
      {done
        ? <>
            <K.Cheer moment="checkDone" lang={ctx.lang} seed={id} />
            <div className="ek-screen__actions"><K.Button size="lg" variant="leaf" icon="check" disabled={busy} onClick={onSubmit}>{ctx.T('Hand it in', 'سلّمه')}</K.Button></div>
          </>
        : <K.ChatComposer lang={ctx.lang} value={text} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)} onSend={() => text.trim() && !sending && send(text.trim())}
            placeholder={ctx.T('Type your answer…', 'اكتب إجابتك…')} />}
    </section>
  );
}

// ---------------- My plan ----------------
function Plan({ ctx }: { ctx: Ctx }) {
  const load = useLoad(() => api.fetchMyStudyPlan(), []);
  if (load.loading && !load.data) return <Loading ctx={ctx} />;
  if (load.error) return <Failed ctx={ctx} onRetry={load.reload} />;
  const { items, done } = D.planItems(load.data);
  const set = (x: any, status: 'todo' | 'done' | 'dismissed') =>
    api.setMyStudyItem(x.id, status).catch((e: unknown) => { toast.error(ctx.T('Not saved', 'لم يُحفظ'), errText(e)); load.reload(); });
  return (
    <K.PlanScreen key={String(load.data?.version)} lang={ctx.lang} items={items} done={done}
      onOpen={async (x: any) => {
        if (x.source === 'assignment' && x.assignmentId) return ctx.go({ tab: 'assignments', id: x.assignmentId });
        try { const r = await api.startTutorHandoff('plan_item', x.id); ctx.askTutor({ sessionId: r.sessionId }); }
        catch (e) { toast.error(ctx.T('Enara isn’t available', 'إنارة غير متاحة'), errText(e)); }
      }}
      onDone={(x: any) => set(x, 'done')} onDismiss={(x: any) => set(x, 'dismissed')} onRestore={(x: any) => set(x, 'todo')} />
  );
}

// ---------------- Quizzes ----------------
function Quizzes({ ctx, id, shared, onSignOut }: { ctx: Ctx; id?: string; shared: boolean; onSignOut: () => void }) {
  const load = useLoad(() => api.fetchMyAssessments(), [id]);
  if (load.loading && !load.data) return <Loading ctx={ctx} />;
  if (load.error) return <Failed ctx={ctx} onRetry={load.reload} />;
  const all = load.data || [];
  if (id) {
    const q = all.find((x: any) => x.id === id);
    if (!q) return <section className="ek-screen"><K.StateMessage lang={ctx.lang} icon="pencil" title={ctx.T('This quiz isn’t open', 'هذا الاختبار غير مفتوح')} action={<K.Button onClick={() => ctx.go({ tab: 'quizzes' })}>{ctx.T('Back', 'رجوع')}</K.Button>} /></section>;
    return <QuizTake ctx={ctx} quiz={q} shared={shared} onSignOut={onSignOut} onDone={() => { load.reload(); ctx.go({ tab: shared ? 'quizzes' : 'home' }); }} />;
  }
  return <K.QuizzesScreen lang={ctx.lang} quizzes={D.quizList(all)} onStart={(qid: string) => ctx.go({ tab: 'quizzes', id: qid })} />;
}

function QuizTake({ ctx, quiz, shared, onSignOut, onDone }: { ctx: Ctx; quiz: any; shared: boolean; onSignOut: () => void; onDone: () => void }) {
  const [attempt, setAttempt] = useState<{ id: string; until: string } | null>(null);
  const [questions, setQuestions] = useState<any[]>(quiz.questions || []);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReturnType<typeof D.quizOutcome> | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const answers = useRef<Record<string, string>>({});
  const left = useSecondsLeft(attempt?.until);
  const submitted = useRef(false);
  const submit = useCallback(async (a: Record<string, string>) => {
    if (!attempt || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try { setOutcome(D.quizOutcome(await api.submitAssessmentAttempt(quiz.id, attempt.id, D.quizAnswers(questions, a)))); }
    catch (e) { submitted.current = false; toast.error(ctx.T('Not handed in', 'لم يُسلَّم'), errText(e)); }
    finally { setBusy(false); }
  }, [attempt, quiz.id, questions, ctx]);
  useEffect(() => { if (left === 0 && attempt) { toast.info(ctx.T('Time is up', 'انتهى الوقت'), ctx.T('We handed in your answers.', 'سلّمنا إجاباتك.')); submit(answers.current); } }, [left, attempt, submit, ctx]);

  if (outcome && shared) return <K.AllDoneScreen lang={ctx.lang} onClose={onSignOut} />;
  if (outcome && showAnswers) return <K.AnswerReviewScreen lang={ctx.lang} title={quiz.title} answers={outcome.answers} onBack={() => setShowAnswers(false)} onDone={onDone}
    onTutor={() => ctx.askTutor({ prompt: ctx.T(`Help me understand my answers in “${quiz.title}”.`, `ساعدني أفهم إجاباتي في «${quiz.title}».`) })} />;
  if (outcome) return <K.RewardSheet lang={ctx.lang} score={outcome.score} correct={outcome.correct} total={outcome.total} minutes={outcome.minutes} topics={outcome.topics} seed={quiz.id}
    onReview={() => setShowAnswers(true)} onNext={onDone}
    onTutor={() => ctx.askTutor({ prompt: ctx.T(`Help me practise ${outcome.topics.join(', ')}.`, `ساعدني أتدرّب على ${outcome.topics.join('، ')}.`) })} />;

  return (
    <K.WorkScreen lang={ctx.lang} mode="test" busy={busy} requireAll saved={false}
      work={{ title: quiz.title, subject: quiz.subject, minutes: quiz.duration, instructions: quiz.instructions, questions: D.quizQuestions(questions) }}
      secondsLeft={left ?? undefined}
      onStart={async () => {
        setBusy(true);
        try {
          const r: any = await api.startAssessmentAttempt(quiz.id);
          setQuestions(r.assessment?.questions || questions);
          setAttempt({ id: r.attempt.id, until: new Date(new Date(r.attempt.startedAt || Date.now()).getTime() + (r.assessment?.duration || quiz.duration || 30) * 60000).toISOString() });
        } catch (e) { toast.error(ctx.T('Can’t start this quiz', 'لا يمكن بدء الاختبار'), errText(e)); onDone(); }
        finally { setBusy(false); }
      }}
      onChange={(a: Record<string, string>) => { answers.current = a; }}
      onExit={onDone}
      onSubmit={(a: Record<string, string>) => submit(a)} />
  );
}

// ---------------- Results ----------------
function Results({ ctx }: { ctx: Ctx }) {
  const load = useLoad(() => api.fetchMyResults(), []);
  const [details, setDetails] = useState<Record<string, any>>({});
  if (load.loading && !load.data) return <Loading ctx={ctx} />;
  if (load.error) return <Failed ctx={ctx} onRetry={load.reload} />;
  const raw = load.data || [];
  const results = D.resultList(raw).map(r => ({ ...r, ...(details[r.id] || {}) }));
  return (
    <K.ResultsScreen lang={ctx.lang} results={results} topics={D.resultTopics(raw)}
      onOpen={(rid: string) => {
        if (details[rid]) return;
        setDetails(d => ({ ...d, [rid]: { loading: true } }));
        api.fetchMyResult(rid).then(r => setDetails(d => ({ ...d, [rid]: D.resultDetail(r) })), () => setDetails(d => ({ ...d, [rid]: {} })));
      }}
      onTutor={() => ctx.askTutor({ prompt: ctx.T('Can you help me understand my quiz results?', 'هل يمكنك مساعدتي على فهم نتائج اختباراتي؟') })}
      onPlan={() => ctx.go({ tab: 'plan' })} />
  );
}

// ---------------- Tutor ----------------
function TutorDrawer({ ctx, tutor, onClose }: { ctx: Ctx; tutor: Tutor; onClose: () => void }) {
  const [sessionId, setSessionId] = useState<string | undefined>(tutor.sessionId);
  const [messages, setMessages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [thinking, setThinking] = useState(false);
  const sentPrompt = useRef(false);
  // kidsSpeaking (environment switch, no user setting): the chat microphone and the live call. Audio is never stored: the microphone
  // uses the browser's speech recognition and only the text is sent; the live call keeps only the transcript.
  const [speaking, setSpeaking] = useState<{ microphone: boolean; liveCall: boolean }>({ microphone: false, liveCall: false });
  const [listening, setListening] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const recognition = useRef<any>(null);
  const mic = useMicGate('tutor_voice');
  const micRef = useRef(mic);
  micRef.current = mic;
  useEffect(() => { api.getTutorSpeaking().then(setSpeaking, () => undefined); }, []);

  useEffect(() => {
    api.listTutorSessions().then(s => setSessions(D.chatSessions(s)), () => undefined);
    if (tutor.sessionId) api.getTutorSession(tutor.sessionId).then((s: any) => setMessages(D.chatMessages(s.messages)), () => undefined);
  }, [tutor.sessionId]);

  const send = useCallback(async (text: string) => {
    setMessages(m => [...m, { from: 'child', text }]);
    setThinking(true);
    try {
      let id = sessionId;
      if (!id) {
        const s: any = await api.createTutorSession(tutor.courseId, tutor.lessonId);
        id = s.id;
        setSessionId(id);
      }
      const r: any = await api.sendTutorMessage(id!, text, tutor.courseId ? { courseId: tutor.courseId, lessonId: tutor.lessonId } : undefined);
      setMessages(m => [...m, { from: 'tutor', text: r.assistantMessage?.text || '', ...(r.assistantMessage?.meta?.pics ? { pics: D.kidsPics(r.assistantMessage.meta.pics) } : {}), ...(Array.isArray(r.assistantMessage?.meta?.citations) ? { citations: r.assistantMessage.meta.citations } : {}) }]);
    } catch (e) {
      setMessages(m => [...m, { from: 'tutor', text: ctx.T('Sorry, I couldn’t answer just now. Please try again.', 'عذرًا، لم أستطع الإجابة الآن. حاول مرة أخرى.') }]);
      if (!api.isFeatureDisabled(e)) toast.error(ctx.T('Enara isn’t available', 'إنارة غير متاحة'), errText(e));
    } finally { setThinking(false); }
  }, [sessionId, tutor.courseId, tutor.lessonId, ctx]);

  useEffect(() => {
    if (tutor.prompt && !sentPrompt.current) { sentPrompt.current = true; send(tutor.prompt); }
  }, [tutor.prompt, send]);

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!speaking.microphone) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e: any) => { const t = String(e.results?.[0]?.[0]?.transcript || '').trim(); setListening(false); if (t) sendRef.current(t); };
    r.onerror = (e: any) => { setListening(false); const problem = classifySpeechRecognitionError(String(e.error ?? ''), isInFrame()); if (problem) micRef.current.fail(problem); };
    r.onend = () => setListening(false);
    recognition.current = r;
    return () => { try { r.abort(); } catch { /* already stopped */ } };
  }, [speaking.microphone]);
  const toggleMic = useCallback(async () => {
    const r = recognition.current;
    if (!r) return;
    if (listening) { r.stop(); setListening(false); return; }
    if ((await mic.check()) !== 'ok') return;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [listening, mic]);

  return (
    <div className="ek-drawer" dir={D.isArabic(ctx.lang) ? 'rtl' : 'ltr'}>
      <div className="ek-drawer__scrim" onClick={onClose} />
      <div className="ek-drawer__panel" role="dialog" aria-modal="true" aria-label={ctx.T('Enara, your tutor', 'إنارة، معلّمتك')}>
        <K.TutorScreen lang={ctx.lang} messages={messages} thinking={thinking} sessions={sessions} onSend={send} onClose={onClose}
          renderText={(m: { from: string; text: string; citations?: any[] }) => (m.from === 'tutor' ? <TutorText text={m.text} simple citations={m.citations} /> : m.text)}
          onReadAloud={ctx.speak} onMic={speaking.microphone && recognition.current ? toggleMic : false} listening={listening} onClearAll={false}
          onLive={speaking.liveCall ? () => setLiveOpen(true) : undefined}
          onOpenSession={(sid: string) => { setSessionId(sid); api.getTutorSession(sid).then((s: any) => setMessages(D.chatMessages(s.messages)), () => undefined); }} />
        {mic.problem && <MicProblemNotice problem={mic.problem} feature="tutor_voice" />}
      </div>
      {speaking.liveCall && <LiveAvatarModal isOpen={liveOpen} onClose={() => setLiveOpen(false)} isStudent courseId={tutor.courseId} lessonId={tutor.lessonId} lessonTitle={ctx.T('Talk with Enara', 'تحدّث مع إنارة')} subject="English" />}
    </div>
  );
}
