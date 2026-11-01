import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { completeTour, getSessionUser } from '../services/apiService';
import { EnaraMark } from './brand/EnaraLogo';

// Product tour for new accounts, by account level. Each step points at a real
// menu item (data-tour="<page id>"); a step whose item isn't on the page (the
// role doesn't have it, or the school has switched it off) is skipped, and a
// step whose item is hidden (e.g. the phone menu is closed) is shown centred.
// Starts by itself once for new accounts (tourPending from sign-in); anyone
// can replay it from the Tour button in the top bar.

type Step = { target?: string; title: string; body: string };

const WELCOME = (who: string): Step => ({
  title: 'Welcome to ENARA',
  body: `A one-minute look around ${who}. Use Next and Back, or the arrow keys; Esc skips the tour.`,
});
const REPLAY: Step = { target: 'tour-button', title: 'Replay any time', body: 'This button starts the tour again whenever you want a refresher.' };

const STEPS: Record<string, Step[]> = {
  student: [
    WELCOME('your learning space'),
    { target: 'dashboard', title: 'Home', body: 'Your next lesson, what is due soon and your next steps, based on your own work.' },
    { target: 'courses', title: 'My learning', body: 'Your courses and lessons. Every lesson has an AI tutor beside it that explains step by step and adapts to how you learn. You can also talk to it face to face in a live call.' },
    { target: 'progress', title: 'My progress', body: 'How you are doing on each learning objective, worked out from your submitted answers.' },
    { target: 'assignments-student', title: 'Assignments', body: 'Quizzes and work from your teachers, with due dates. While one is open, the tutor gives hints only, not answers.' },
    { target: 'study-plan', title: 'Study plan', body: 'A plan for what to practise next and when.' },
    { target: 'results', title: 'Results', body: 'Your scores and feedback once results are released, with an explanation of anything you missed.' },
    REPLAY,
  ],
  teacher: [
    WELCOME('your teaching workspace'),
    { target: 'teaching', title: 'Teaching dashboard', body: 'Your classes, who needs support and what is due. Open a student to see their learning profile and how the AI tutor is teaching them.' },
    { target: 'curriculum', title: 'Curriculum', body: 'The courses, modules and lessons of your classes.' },
    { target: 'learning-objectives', title: 'Learning objectives', body: 'What students should be able to do. Approved objectives guide the tutor and the insights.' },
    { target: 'assessment-builder', title: 'Assessment Builder', body: 'Write questions, or draft them with AI where your school has it on. Nothing reaches students until you publish it.' },
    { target: 'class-assignments', title: 'Class assignments', body: 'Assign a published assessment to a class: dates, attempts, late work and the tutor mode while it is open.' },
    { target: 'grading', title: 'Grading', body: 'ENARA grades submissions, checks each result and releases it. You can open any one and change the grade.' },
    { target: 'class-insights', title: 'Class insights', body: 'Where each student stands on each objective, common gaps and suggested interventions.' },
    { target: 'lesson-planner', title: 'Lesson planner', body: 'Draft lesson plans, with AI where your school has it on, and keep versions.' },
    { target: 'documents', title: 'Documents', body: 'Upload teaching materials; once checked, the tutor and AI tools can cite them.' },
    { target: 'assistant', title: 'Your assistant', body: 'Ask questions about your classes and the platform at any time.' },
    REPLAY,
  ],
  admin: [
    WELCOME('your school'),
    { target: 'dashboard', title: 'School overview', body: 'Students, activity, scores and what needs attention, from recorded activity.' },
    { target: 'students', title: 'Students', body: 'Your student directory: add students, see their progress and open their profiles.' },
    { target: 'live-avatars', title: 'Live avatar control', body: 'Choose the faces of the live AI tutor for the school and per course.' },
    { target: 'course-intelligence', title: 'Course intelligence', body: 'Per course: completion, tutor questions and what students ask most.' },
    { target: 'school-insights', title: 'School insights', body: 'School-wide learning analytics from recorded evidence.' },
    { target: 'credits', title: 'AI credits', body: 'How much AI your school uses, by feature and over time.' },
    { target: 'usage', title: 'Usage', body: 'Measured AI use per tool, against your plan.' },
    { target: 'teaching', title: 'Teaching tools', body: 'You also have every teacher tool: classes, assessments, grading and lesson planning.' },
    REPLAY,
  ],
  academic_manager: [
    WELCOME('your school insights'),
    { title: 'Read-only by design', body: 'This portal shows school-wide learning analytics: AI usage, credits per course and course health. It never edits content, grades or accounts.' },
    REPLAY,
  ],
  'enara-admin': [
    WELCOME('the ENARA platform'),
    { target: 'dashboard', title: 'Executive overview', body: 'Platform-wide figures across partner institutions. Pages marked "Sample data" are not connected to live records yet.' },
    { target: 'institutions', title: 'Institutions', body: 'Partner schools and their status.' },
    { target: 'live-avatars', title: 'Live avatar control', body: 'Tutor faces and avatar settings for any school.' },
    { target: 'school-insights', title: 'School insights', body: 'Learning analytics for any school.' },
    { target: 'integrations', title: 'Integrations', body: 'Onboard partner institutions and manage their API keys.' },
    { target: 'credit-management', title: 'Credit management', body: 'AI credit allocations and usage across partner institutions.' },
    { target: 'audit', title: 'Audit and compliance', body: 'Platform audit and compliance records.' },
    REPLAY,
  ],
};

const START_EVENT = 'enara:start-tour';
export const startTour = () => window.dispatchEvent(new Event(START_EVENT));

const find = (target?: string) => (target ? (document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null) : null);
const visible = (el: HTMLElement | null) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
};

export const ProductTour: React.FC = () => {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const begin = useCallback(() => {
    const role = getSessionUser()?.role ?? 'student';
    // All the role's steps; which ones show is decided as the tour goes, so a
    // menu item that loads a moment later still gets its step.
    setI(0);
    setSteps(STEPS[role] ?? STEPS.student);
  }, []);

  useEffect(() => {
    window.addEventListener(START_EVENT, begin);
    // New accounts: once, after the page has drawn its menus.
    let t: number | undefined;
    if (getSessionUser()?.tourPending) t = window.setTimeout(begin, 1200);
    return () => { window.removeEventListener(START_EVENT, begin); if (t) window.clearTimeout(t); };
  }, [begin]);

  const step = steps?.[i];
  const place = useCallback(() => {
    const el = find(step?.target);
    if (el && visible(el)) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); setRect(el.getBoundingClientRect()); }
    else setRect(null);
  }, [step]);
  useLayoutEffect(() => { if (step) place(); }, [step, place]);
  useEffect(() => {
    if (!steps) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [steps, place]);
  useEffect(() => { cardRef.current?.focus(); }, [i, steps]);

  const finish = useCallback(() => { setSteps(null); void completeTour(); }, []);
  // A step is available when it has no target or its menu item is on the page.
  const avail = (s: Step) => !s.target || !!find(s.target);
  const next = useCallback(() => {
    if (!steps) return;
    let j = i + 1; while (j < steps.length && !avail(steps[j])) j++;
    if (j >= steps.length) finish(); else setI(j);
  }, [steps, i, finish]);
  const back = useCallback(() => {
    if (!steps) return;
    let j = i - 1; while (j > 0 && !avail(steps[j])) j--;
    setI(Math.max(0, j));
  }, [steps, i]);
  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps, next, back, finish]);

  if (!steps || !step) return null;
  const shown = steps.filter(avail);
  const pos = Math.max(0, shown.indexOf(step));

  // Card beside the highlighted item when there's room, else below it, else centred.
  const W = Math.min(340, window.innerWidth - 32);
  let style: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const pad = 14;
    if (rect.right + pad + W < window.innerWidth - 16) style = { left: rect.right + pad, top: Math.min(Math.max(16, rect.top - 8), window.innerHeight - 260) };
    else if (rect.bottom + 230 < window.innerHeight) style = { left: Math.min(Math.max(16, rect.left), window.innerWidth - W - 16), top: rect.bottom + pad };
    else style = { left: Math.min(Math.max(16, rect.left), window.innerWidth - W - 16), top: Math.max(16, rect.top - 230) };
  }
  const last = !steps.slice(i + 1).some(avail);

  return (
    <div className="fixed inset-0 z-[200]" aria-live="polite">
      {rect ? (
        <div
          className="absolute rounded-lg pointer-events-none transition-all duration-300 motion-reduce:transition-none"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(7,21,48,.55), 0 0 0 3px #0056D2' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#071530]/55" />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute bg-white rounded-2xl shadow-2xl p-5 outline-none"
        style={{ ...style, width: W }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <EnaraMark className="w-6 h-6 text-[#071530]" />
            <span className="text-xs font-semibold text-slate-500">{pos + 1} of {shown.length}</span>
          </div>
          <button onClick={finish} aria-label="Skip the tour" className="p-1 -m-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <h2 id="tour-title" className="mt-3 text-lg font-bold text-slate-900">{step.title}</h2>
        <p className="mt-1 text-sm text-slate-600 leading-relaxed">{step.body}</p>
        <div className="mt-4 h-1 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#0056D2] transition-all duration-300" style={{ width: `${((pos + 1) / shown.length) * 100}%` }} /></div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Skip tour</button>
          <div className="flex gap-2">
            {pos > 0 && <button onClick={back} className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><ArrowLeft size={16} /> Back</button>}
            <button onClick={next} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg bg-[#0056D2] text-white hover:bg-[#0049b3]">{last ? 'Done' : 'Next'} {!last && <ArrowRight size={16} />}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
