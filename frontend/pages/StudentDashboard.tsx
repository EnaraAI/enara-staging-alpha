import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, Bot, Clock, Play, RotateCw, Trophy } from 'lucide-react';
import { Assessment, Student, Course } from '../types';
import {
  fetchMyDashboard,
  fetchMyCourse,
  fetchMyCourses,
  fetchMyResults,
  fetchMyAchievements,
} from '../services/apiService';
import { toast } from '../services/toastService';
import { NextStepsCard } from '../components/proactive/NextStepsCard';

interface StudentDashboardProps {
  onStartAssessment: (id: string) => void;
  onNavigate: (page: string) => void;
  onOpenCourse?: (courseId: string) => void;
  onAskTutor?: (message: string) => void;
  assessments: Assessment[];
}

// GET /api/me/dashboard
interface DashboardActivity { title: string; type: 'quiz' | 'lesson'; score?: number; date?: string }
interface UpcomingAssessment {
  id: string; title: string; subject?: string; status: string; dueDate?: string; duration?: number;
  questions?: unknown[]; questionsCount?: number;
}
interface DashboardData {
  student: Partial<Student> & { name: string };
  courses: { id: string; title: string; subject: string; progressPct: number }[];
  recentActivity: DashboardActivity[];
  upcomingAssessments?: UpcomingAssessment[];
  continueLearning: { courseId: string; lessonId: string; title: string; subject?: string; progressPct: number } | null;
}
// GET /api/me/courses
interface CourseSummary {
  id: string; title: string; subject: string; progressPct: number;
  lessonsCount: number; completedLessons: number; academicYear?: string;
}
// GET /api/me/results
interface ResultItem { id: string; assessmentId: string; assessmentTitle: string; subject?: string; score?: number; date?: string }
// GET /api/me/achievements
interface Achievement { id: string; title: string; unlocked: boolean }

const TILE_COLORS = ['bg-[#0b3d91]', 'bg-[#134e4a]', 'bg-[#5b21b6]', 'bg-[#9a3412]', 'bg-[#1e3a8a]', 'bg-[#3f3f46]'];
const SUBJECT_GLYPH: Record<string, string> = {
  math: 'x²', mathematics: 'x²', algebra: 'x²', physics: 'F=ma', chemistry: 'H₂O', biology: 'DNA',
  english: 'Aa', arabic: 'ع', history: 'Hx', science: 'Sci', 'computer science': '</>', geography: 'Geo',
};
const glyphFor = (subject: string, title: string) => {
  const s = (subject || '').toLowerCase();
  const hit = Object.keys(SUBJECT_GLYPH).find(k => s.includes(k));
  if (hit) return SUBJECT_GLYPH[hit];
  return (title || subject || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
};
const tileColor = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
};
const formatDate = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const scoreColor = (score: number) => (score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-rose-700');
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white border border-[#e5e7eb] rounded-xl ${className}`}>{children}</div>
);

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartAssessment, onNavigate, onOpenCourse, onAskTutor, assessments }) => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [resumeTree, setResumeTree] = useState<(Course & { progressPct?: number }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openCourse = (courseId?: string) => {
    if (courseId && onOpenCourse) onOpenCourse(courseId);
    else onNavigate('courses');
  };

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [data, courseList, resultList, achievementList] = await Promise.all([
        fetchMyDashboard() as Promise<DashboardData>,
        (fetchMyCourses() as Promise<CourseSummary[]>).catch(() => null),
        (fetchMyResults() as Promise<ResultItem[]>).catch(() => [] as ResultItem[]),
        (fetchMyAchievements() as Promise<Achievement[]>).catch(() => [] as Achievement[]),
      ]);
      setDashboard(data);
      setCourses(
        Array.isArray(courseList)
          ? courseList
          : (data.courses || []).map(c => ({ ...c, lessonsCount: 0, completedLessons: 0 }))
      );
      setResults(Array.isArray(resultList) ? resultList : []);
      setAchievements(Array.isArray(achievementList) ? achievementList : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load your dashboard.';
      setLoadError(message);
      toast.error('Dashboard unavailable', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Resume course: the dashboard's continueLearning course, else the first incomplete course.
  const resumeCourseId =
    dashboard?.continueLearning?.courseId ||
    courses.find(c => c.progressPct < 100)?.id ||
    courses[0]?.id ||
    null;

  useEffect(() => {
    if (!resumeCourseId) { setResumeTree(null); return; }
    let cancelled = false;
    (fetchMyCourse(resumeCourseId) as Promise<Course & { progressPct?: number }>)
      .then(tree => { if (!cancelled) setResumeTree(tree); })
      .catch(err => {
        if (!cancelled) toast.error('Course unavailable', err instanceof Error ? err.message : 'Could not load this course.');
      });
    return () => { cancelled = true; };
  }, [resumeCourseId]);

  const resumeSummary = courses.find(c => c.id === resumeCourseId);
  const resumeLessons = resumeTree?.modules.flatMap(m => m.lessons || []) || [];
  const resumeIdx = resumeLessons.findIndex(l => l.status === 'active');
  const resumeLesson = resumeIdx >= 0 ? resumeLessons[resumeIdx] : undefined;
  const resumeProgress = resumeTree?.progressPct ?? resumeSummary?.progressPct ?? dashboard?.continueLearning?.progressPct ?? 0;
  const resumeTitle = resumeTree?.title || resumeSummary?.title || '';
  const resumeSubject = resumeTree?.subject || resumeSummary?.subject || '';

  // Due soon: open assessments first (startable), then upcoming ones.
  const dueSoon = useMemo(() => {
    const byId = new Map<string, UpcomingAssessment>();
    for (const a of dashboard?.upcomingAssessments || []) byId.set(a.id, a);
    for (const a of assessments || []) byId.set(a.id, { ...byId.get(a.id), ...a });
    const rank = (s: string) => (s === 'active' || s === 'in-progress' ? 0 : s === 'upcoming' || s === 'pending' ? 1 : 2);
    return [...byId.values()]
      .filter(a => rank(a.status) < 2)
      .sort((a, b) => rank(a.status) - rank(b.status) || new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
      .slice(0, 3);
  }, [dashboard, assessments]);

  // Your week: submitted assessments (all results) + tutor sessions (from recent activity) per day, last 7 days.
  const week = useMemo(() => {
    const days: { key: string; label: string; count: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), count: 0 });
    }
    const bump = (date?: string) => {
      if (!date) return;
      const d = new Date(date);
      if (isNaN(d.getTime())) return;
      const slot = days.find(x => x.key === dayKey(d));
      if (slot) slot.count += 1;
    };
    results.forEach(r => bump(r.date));
    (dashboard?.recentActivity || []).filter(a => a.type === 'lesson').forEach(a => bump(a.date));
    return days;
  }, [results, dashboard]);
  const weekMax = Math.max(...week.map(d => d.count), 0);
  const weekTotal = week.reduce((s, d) => s + d.count, 0);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Loading your dashboard">
        <div className="flex flex-wrap gap-6">
          <div className="flex-[2_1_560px] h-56 rounded-xl bg-slate-100" />
          <div className="flex-[1_1_300px] h-56 rounded-xl bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map(i => <div key={i} className="h-52 rounded-xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (loadError || !dashboard) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <AlertCircle size={28} className="text-rose-600" aria-hidden="true" />
        <p className="text-base font-bold text-slate-900">We couldn't load your dashboard.</p>
        {loadError && <p className="text-sm text-slate-600">{loadError}</p>}
        <button onClick={load} className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700">
          <RotateCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  const firstName = dashboard.student?.name?.split(' ')[0] || 'there';

  return (
    <div className="flex flex-col gap-9 text-[#1f1f1f]">
      {/* Hero + Due soon */}
      <section className="flex flex-wrap gap-6 items-stretch">
        <div className="flex-[2_1_560px] min-w-0 bg-teal-50 rounded-xl p-5 sm:p-8 flex flex-col gap-3.5">
          <p className="m-0 text-sm font-bold text-teal-600 uppercase tracking-wider">Welcome back, {firstName}</p>
          <h1 className="m-0 text-2xl sm:text-[34px] leading-tight font-extrabold">Pick up where you left off</h1>

          {resumeCourseId ? (
            <div className="flex flex-wrap sm:flex-nowrap gap-4 sm:gap-5 items-center bg-white rounded-[10px] p-4 border border-[#dbe5f4]">
              <div
                aria-hidden="true"
                className={`w-[120px] h-[76px] shrink-0 rounded-lg grid place-items-center text-white text-2xl font-extrabold ${tileColor(resumeSubject || resumeTitle)}`}
              >
                {glyphFor(resumeSubject, resumeTitle)}
              </div>
              <div className="flex-1 min-w-[180px] flex flex-col gap-1.5">
                <span className="text-[13px] text-zinc-600">
                  {resumeTitle}
                  {resumeLesson && resumeLessons.length > 0 && <> · Lesson {resumeIdx + 1} of {resumeLessons.length}</>}
                </span>
                <strong className="text-lg leading-snug">
                  {resumeLesson?.title || (resumeProgress >= 100 ? 'Course complete' : resumeTree ? 'No lessons yet' : 'Loading lesson...')}
                </strong>
                <div className="h-1.5 bg-[#e4e9f2] rounded-full" role="progressbar" aria-valuenow={resumeProgress} aria-valuemin={0} aria-valuemax={100} aria-label={`${resumeTitle} progress`}>
                  <div className="h-1.5 bg-teal-600 rounded-full" style={{ width: `${resumeProgress}%` }} />
                </div>
                <span className="text-[13px] text-zinc-600">{resumeProgress}% complete</span>
              </div>
              <button
                onClick={() => openCourse(resumeCourseId)}
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-md font-bold"
              >
                <Play size={16} aria-hidden="true" /> Resume
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-[10px] p-5 border border-[#dbe5f4] flex flex-col gap-2">
              <strong className="text-lg">You're not enrolled in any courses yet</strong>
              <span className="text-sm text-zinc-600">When your school adds you to a course, it will show up here so you can start learning.</span>
            </div>
          )}
        </div>

        <aside className="flex-[1_1_300px] min-w-0 border border-[#e5e7eb] rounded-xl p-6 flex flex-col gap-3.5 bg-white">
          <h2 className="m-0 text-lg font-bold">Due soon</h2>
          {dueSoon.length === 0 && <p className="text-sm text-zinc-600">Nothing due right now. Nice work.</p>}
          {dueSoon.map(a => {
            const open = a.status === 'active' || a.status === 'in-progress';
            const qCount = a.questionsCount ?? (Array.isArray(a.questions) ? a.questions.length : undefined);
            const meta = [a.subject, qCount ? `${qCount} questions` : null, a.duration ? `${a.duration} min` : null].filter(Boolean).join(' · ');
            const due = formatDate(a.dueDate);
            return (
              <div key={a.id} className={`flex flex-col gap-1 p-3.5 rounded-lg border ${open ? 'bg-orange-50 border-orange-200' : 'border-[#e5e7eb]'}`}>
                <strong>{a.title}</strong>
                {meta && <span className="text-sm text-zinc-600">{meta}</span>}
                {open ? (
                  <>
                    {due && <span className="text-sm text-zinc-600 inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" /> Due {due}</span>}
                    <button
                      onClick={() => onStartAssessment(a.id)}
                      className="self-start mt-1.5 inline-flex items-center gap-1 font-bold text-teal-700 hover:text-teal-800 hover:underline"
                    >
                      Start assessment <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-zinc-600">{due ? `Opens ${due}` : 'Not open yet'}</span>
                )}
              </div>
            );
          })}
        </aside>
      </section>

      <NextStepsCard onAskTutor={onAskTutor} onOpenCourse={id => openCourse(id)} />

      {/* My courses */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-baseline">
          <h2 className="m-0 text-2xl font-bold">My courses</h2>
          <button onClick={() => onNavigate('courses')} className="font-semibold text-teal-700 hover:underline">View all</button>
        </div>
        {courses.length === 0 ? (
          <Card className="p-6 flex items-center gap-3 text-zinc-600">
            <BookOpen size={20} aria-hidden="true" /> No courses yet. Your enrolled courses will appear here.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => openCourse(c.id)}
                className="text-left border border-[#e5e7eb] rounded-[10px] overflow-hidden bg-white hover:shadow-md hover:border-teal-200 transition"
              >
                <div aria-hidden="true" className={`h-[130px] grid place-items-center text-white text-[34px] font-extrabold ${tileColor(c.subject || c.title)}`}>
                  {glyphFor(c.subject, c.title)}
                </div>
                <div className="p-4 flex flex-col gap-1.5">
                  <span className="text-[13px] text-zinc-600">{[c.subject, c.academicYear].filter(Boolean).join(' · ')}</span>
                  <strong className="text-[17px] leading-snug">{c.title}</strong>
                  <span className="text-sm text-zinc-700">
                    {c.lessonsCount > 0 ? `${c.completedLessons} of ${c.lessonsCount} lessons · ` : ''}{c.progressPct}%
                  </span>
                </div>
              </button>
            ))}
            <button
              onClick={() => openCourse(resumeCourseId || courses[0]?.id)}
              className="text-left border border-dashed border-[#c7cdd6] rounded-[10px] p-5 flex flex-col justify-center gap-2 bg-[#fafafa] hover:bg-white transition"
            >
              <Bot size={22} className="text-teal-600" aria-hidden="true" />
              <strong className="text-[17px]">Ask your AI tutor</strong>
              <span className="text-sm text-zinc-700">Stuck on a step? Get a hint grounded in your course material.</span>
              <span className="font-bold text-teal-700 inline-flex items-center gap-1">Open tutor <ArrowRight size={14} aria-hidden="true" /></span>
            </button>
          </div>
        )}
      </section>

      {/* Results + week */}
      <section className="flex flex-wrap gap-6">
        <Card className="flex-[1_1_380px] min-w-0 p-6 flex flex-col gap-3">
          <h2 className="m-0 text-lg font-bold">Recent results</h2>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-600">No results yet. Finished assessments will show up here.</p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {results.slice(0, 5).map((r, i, arr) => (
                <li key={r.id} className={`flex justify-between gap-3 py-2.5 ${i < arr.length - 1 ? 'border-b border-[#f1f1f1]' : ''}`}>
                  <span className="min-w-0 truncate">
                    {r.assessmentTitle}
                    {formatDate(r.date) && <span className="text-sm text-zinc-600"> · {formatDate(r.date)}</span>}
                  </span>
                  {typeof r.score === 'number'
                    ? <strong className={scoreColor(r.score)}>{Math.round(r.score)}%</strong>
                    : <span className="text-sm text-zinc-600">Pending</span>}
                </li>
              ))}
            </ul>
          )}
          {results.length > 0 && (
            <button onClick={() => onNavigate('results')} className="self-start font-semibold text-teal-700 hover:underline">See all results</button>
          )}
        </Card>

        <Card className="flex-[1_1_380px] min-w-0 p-6 flex flex-col gap-3">
          <h2 className="m-0 text-lg font-bold">Your week</h2>
          {weekTotal === 0 ? (
            <p className="text-sm text-zinc-600">No assessments or tutor sessions in the last 7 days.</p>
          ) : (
            <div className="flex gap-2.5 items-end h-[110px]" role="img" aria-label={`Activity in the last 7 days: ${week.map(d => d.count).join(', ')}`}>
              {week.map((d, i) => (
                <div key={d.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    title={`${d.count} activit${d.count === 1 ? 'y' : 'ies'}`}
                    className={`w-full rounded ${i === week.length - 1 ? 'bg-teal-600' : 'bg-[#dbe5f4]'}`}
                    style={{ height: `${weekMax ? Math.max((d.count / weekMax) * 85, d.count ? 8 : 3) : 3}%` }}
                  />
                  <span className="text-xs text-zinc-600">{d.label}</span>
                </div>
              ))}
            </div>
          )}
          <span className="text-sm text-zinc-700">Assessments and tutor sessions per day</span>
        </Card>
      </section>

      {achievements.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-lg font-bold">Badges</h2>
          <div className="flex flex-wrap gap-3">
            {achievements.map(a => (
              <div
                key={a.id}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${a.unlocked ? 'border-teal-200 bg-teal-50 text-slate-900 font-semibold' : 'border-[#e5e7eb] text-zinc-600'}`}
              >
                <Trophy size={16} className={a.unlocked ? 'text-teal-700' : 'text-zinc-400'} aria-hidden="true" />
                {a.title}
                <span className="sr-only">{a.unlocked ? '(unlocked)' : '(locked)'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StudentDashboard;
