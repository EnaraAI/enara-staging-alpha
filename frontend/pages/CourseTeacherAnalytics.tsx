
import React from 'react';
import {
  Users,
  MessageSquare,
  Clock,
  AlertCircle,
  TrendingUp,
  Search,
  ChevronRight,
  Zap,
  Activity,
  BrainCircuit,
  Sparkles,
  Target,
  Lightbulb,
  FileText,
  RefreshCw,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

import { generateLessonPlan } from '../services/geminiService';
import {
  fetchCourseInstances,
  fetchStudents,
  fetchCourseAnalytics,
  fetchAnalyticsOverview,
  CourseAnalytics,
  AnalyticsOverview,
  ActivityStatus,
  RiskFlag,
} from '../services/apiService';
import { toast } from '../services/toastService';
import { CourseInstance, Student } from '../types';

type CourseStudentRow = CourseAnalytics['students'][number];

const STATUS_BADGES: Record<ActivityStatus, { badge: string; className: string }> = {
  excelling: { badge: 'Excelling', className: 'bg-green-50 text-green-800' },
  'on track': { badge: 'On Track', className: 'bg-blue-50 text-blue-800' },
  'at risk': { badge: 'At Risk', className: 'bg-red-50 text-red-700' },
  'not started': { badge: 'Not Started', className: 'bg-slate-100 text-slate-700' },
};

const RISK_FLAG_LABELS: Record<RiskFlag, { short: string; long: string }> = {
  low_scores: { short: 'Low scores', long: 'Average assessment score is below 50%.' },
  inactive: { short: 'Inactive', long: 'No recorded activity in the last 14 days.' },
  overdue: { short: 'Overdue', long: 'Two or more assessments are past due without a submission.' },
};

const INSIGHT_STYLES: Record<CourseAnalytics['insights'][number]['type'], { icon: React.ElementType; label: string; className: string }> = {
  positive: { icon: Sparkles, label: 'Going well', className: 'bg-green-50 border-green-200 text-green-900' },
  warning: { icon: AlertCircle, label: 'Insight', className: 'bg-orange-50 border-orange-200 text-orange-900' },
  action: { icon: Lightbulb, label: 'Suggested action', className: 'bg-blue-50 border-blue-200 text-blue-900' },
};

const TOOLTIP_STYLE = { borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '13px' };
const AXIS_TICK = { fill: '#475569', fontSize: 12 };

/** Formats a possibly-missing number; null/undefined becomes an em dash. */
const fmt = (value: number | null | undefined, suffix = '') => (value == null ? '—' : `${value}${suffix}`);

const formatLastActive = (iso: string | null) => {
  if (!iso) return 'Never';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const initials = (name: string) => name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 3).toUpperCase();

const EmptyState: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'h-64' }) => (
  <div className={`${className} w-full flex items-center justify-center text-center px-6 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-sm text-slate-600`}>
    {children}
  </div>
);

export const CourseTeacherAnalytics: React.FC<{ onViewStudent?: (student: Student) => void }> = ({ onViewStudent }) => {
  const [courseInstances, setCourseInstances] = React.useState<CourseInstance[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedInstanceId, setSelectedInstanceId] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'classes' | 'students' | 'compare'>('classes');
  const [selectedCompareIds, setSelectedCompareIds] = React.useState<string[]>([]);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [studentSearch, setStudentSearch] = React.useState('');

  const [analytics, setAnalytics] = React.useState<CourseAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [analyticsReload, setAnalyticsReload] = React.useState(0);

  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [overviewReload, setOverviewReload] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const fail = (what: string) => (err: unknown) => {
      if (!cancelled) toast.error(`Could not load ${what}`, err instanceof Error ? err.message : 'Unexpected error');
    };
    Promise.all([
      fetchCourseInstances().then(list => {
        if (cancelled) return;
        setCourseInstances(list);
        if (list.length > 0) {
          setSelectedInstanceId(list[0].id);
          setSelectedCompareIds([list[0].id]);
        }
      }).catch(fail('course instances')),
      fetchStudents().then(list => { if (!cancelled) setStudents(list); }).catch(fail('students')),
    ]).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Per-course analytics, refetched whenever the selected course changes.
  React.useEffect(() => {
    if (!selectedInstanceId) return;
    let cancelled = false;
    setAnalytics(null);
    setAnalyticsError(null);
    setAnalyticsLoading(true);
    fetchCourseAnalytics(selectedInstanceId)
      .then(data => { if (!cancelled) setAnalytics(data); })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setAnalyticsError(message);
        toast.error('Could not load course analytics', message);
      })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedInstanceId, analyticsReload]);

  // Institution-wide summary, used for the side-by-side course comparison.
  React.useEffect(() => {
    let cancelled = false;
    setOverviewError(null);
    setOverviewLoading(true);
    fetchAnalyticsOverview()
      .then(data => { if (!cancelled) setOverview(data); })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setOverviewError(message);
        toast.error('Could not load course comparison', message);
      })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [overviewReload]);

  const instance: CourseInstance = courseInstances.find(i => i.id === selectedInstanceId) || courseInstances[0] || {
    id: '', courseId: '', courseName: '', academicYear: '', batchId: '', studentIds: []
  };

  const studentsById = React.useMemo(() => new Map(students.map(st => [st.id, st])), [students]);
  const courseStudents: CourseStudentRow[] = analytics?.students ?? [];
  const searchTerm = studentSearch.trim().toLowerCase();
  const matrixStudents = searchTerm
    ? courseStudents.filter(s => s.name.toLowerCase().includes(searchTerm) || s.id.toLowerCase().includes(searchTerm))
    : courseStudents;
  const selectedStudent = courseStudents.find(s => s.id === selectedStudentId) || null;
  const selectedStudentRecord = selectedStudent ? studentsById.get(selectedStudent.id) : undefined;

  const windowDays = analytics?.windowDays ?? overview?.windowDays ?? 30;
  const avgChapterCompletion = analytics && analytics.chapters.length
    ? Math.round(analytics.chapters.reduce((sum, ch) => sum + ch.completionRate, 0) / analytics.chapters.length)
    : null;
  const atRiskCount = courseStudents.filter(s => s.status === 'at risk').length;
  const notStartedCount = courseStudents.filter(s => s.status === 'not started').length;
  const hasWeekdayActivity = !!analytics?.engagementByWeekday.some(d => d.sessions > 0);
  const hasWeeklyScores = !!analytics?.weeklyScores.some(w => w.avgScore != null);
  const topicsByRate = analytics ? [...analytics.topics].sort((a, b) => b.correctRate - a.correctRate) : [];

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showLessonPlanForm, setShowLessonPlanForm] = React.useState(false);
  const [showLessonPlan, setShowLessonPlan] = React.useState(false);
  const [activePlan, setActivePlan] = React.useState<any>(null);

  // Form State
  const [gapDetails, setGapDetails] = React.useState('');
  const [learningOutcomes, setLearningOutcomes] = React.useState('');

  const handleGenerateLessonPlan = async () => {
    if (!gapDetails || !learningOutcomes) return;

    setIsGenerating(true);
    try {
      const plan = await generateLessonPlan({
        courseName: instance.courseName,
        gaps: gapDetails,
        outcomes: learningOutcomes
      });

      // Map icons for steps since LLM doesn't return them
      const stepsWithIcons = plan.steps.map((step: any, i: number) => ({
        ...step,
        icon: i === 0 ? Zap : i === 1 ? Target : Users
      }));

      setActivePlan({ ...plan, steps: stepsWithIcons });
      setShowLessonPlanForm(false);
      setShowLessonPlan(true);
    } catch (error) {
      console.error("Failed to generate lesson plan:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const openLessonDesignerWithGaps = () => {
    if (!analytics) return;
    const gaps = analytics.mostAsked
      .map(q => `- ${q.lessonTitle ? `${q.lessonTitle}: ` : ''}"${q.text}" (asked ${q.count} times)`)
      .join('\n');
    const weakTopics = [...analytics.topics]
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 3)
      .map(t => `- ${t.topic}: ${t.correctRate}% correct (${t.answers} answers)`)
      .join('\n');
    const performanceInsights = analytics.insights
      .filter(i => i.type === 'warning' || i.type === 'action')
      .map(i => `- ${i.text}`)
      .join('\n');

    setGapDetails([
      gaps && `MOST ASKED TUTOR QUESTIONS (last ${analytics.windowDays} days):\n${gaps}`,
      weakTopics && `WEAKEST TOPICS:\n${weakTopics}`,
      performanceInsights && `INSIGHTS:\n${performanceInsights}`,
    ].filter(Boolean).join('\n\n'));
    const weakest = [...analytics.topics].sort((a, b) => a.correctRate - b.correctRate)[0];
    setLearningOutcomes(
      weakest
        ? `- Improve accuracy on "${weakest.topic}" (currently ${weakest.correctRate}% correct)\n- Address the most frequently asked tutor questions`
        : '- Address the most frequently asked tutor questions'
    );
    setShowLessonPlanForm(true);
  };

  const toggleCompareId = (id: string) => {
    setSelectedCompareIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const comparisonData = (overview?.courses ?? [])
    .filter(c => selectedCompareIds.includes(c.id))
    .map(c => ({ ...c, name: c.courseName }));

  if (isLoading || courseInstances.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center gap-3 text-slate-600 text-sm font-semibold">
          {isLoading ? (
            <>
              <Activity size={18} className="animate-spin text-teal-600" />
              Loading course instances...
            </>
          ) : (
            'No course instances yet. Create one in Course Management to see course intelligence.'
          )}
        </div>
      </div>
    );
  }

  const analyticsStatus = (analyticsLoading || (!analytics && !analyticsError)) ? (
    <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center gap-3 text-slate-600 text-sm font-semibold">
      <Activity size={18} className="animate-spin text-teal-600" />
      Loading analytics for {instance.courseName}...
    </div>
  ) : analyticsError ? (
    <div className="bg-white rounded-xl border border-red-200 p-10 flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex items-center gap-2 text-red-700 text-sm font-bold">
        <AlertCircle size={18} />
        Could not load analytics for {instance.courseName}
      </div>
      <p className="text-sm text-slate-600">{analyticsError}</p>
      <button
        onClick={() => setAnalyticsReload(n => n + 1)}
        className="h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-bold hover:bg-slate-50 flex items-center gap-2"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  ) : null;

  const labelCls = 'block text-sm font-bold text-slate-700 mb-1.5';
  const textareaCls = 'w-full h-32 p-3 rounded-md bg-white border border-slate-300 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 outline-none resize-none';
  const cardCls = 'bg-white border border-slate-200 rounded-xl p-6';
  const tooltipStyle = TOOLTIP_STYLE;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6 relative">
      {/* Lesson Plan Generation Form Modal */}
      <AnimatePresence>
        {showLessonPlanForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLessonPlanForm(false)}
              className="fixed inset-0 bg-slate-900/50 z-[60]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="lesson-plan-form-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[90vh] bg-white rounded-xl border border-slate-200 shadow-xl z-[70] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-teal-700 flex items-center gap-1.5">
                    <BrainCircuit size={14} />
                    AI lesson designer
                  </p>
                  <h2 id="lesson-plan-form-title" className="text-xl font-extrabold text-slate-900 mt-1">Generate lesson plan</h2>
                  <p className="text-sm text-slate-600 mt-1">Design targeted interventions based on batch performance.</p>
                </div>
                <button
                  onClick={() => setShowLessonPlanForm(false)}
                  aria-label="Close"
                  className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                <div>
                  <label htmlFor="lp-gaps" className={labelCls}>Knowledge gaps</label>
                  <textarea
                    id="lp-gaps"
                    value={gapDetails}
                    onChange={(e) => setGapDetails(e.target.value)}
                    placeholder="e.g., Students are struggling to distinguish between factoring methods and the quadratic formula in complex cases."
                    className={textareaCls}
                  />
                </div>

                <div>
                  <label htmlFor="lp-outcomes" className={labelCls}>Desired learning outcomes</label>
                  <textarea
                    id="lp-outcomes"
                    value={learningOutcomes}
                    onChange={(e) => setLearningOutcomes(e.target.value)}
                    placeholder="e.g., Mastery of complex root identification and 90% resolution rate in the upcoming formative quiz."
                    className={textareaCls}
                  />
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex gap-3">
                  <Sparkles size={18} className="text-teal-700 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700">
                    AI drafts the plan from the gaps and outcomes above. Use "Draft a lesson plan for these gaps" to pre-fill them from this course's tutor questions and topic accuracy.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setShowLessonPlanForm(false)}
                  className="h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateLessonPlan}
                  disabled={isGenerating || !gapDetails || !learningOutcomes}
                  className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <Activity size={18} className="animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  {isGenerating ? 'Synthesizing...' : 'Generate plan'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Lesson Plan Result Modal */}
      <AnimatePresence>
        {showLessonPlan && activePlan && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLessonPlan(false)}
              className="fixed inset-0 bg-slate-900/50 z-[60]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="lesson-plan-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[90vh] bg-white rounded-xl border border-slate-200 shadow-xl z-[70] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-teal-700 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    Template remediation plan (not AI)
                  </p>
                  <h2 id="lesson-plan-title" className="text-xl font-extrabold text-slate-900 mt-1">{activePlan.title}</h2>
                  <p className="text-sm text-slate-600 mt-1">Targeting knowledge gaps in {activePlan.focus}</p>
                </div>
                <button
                  onClick={() => setShowLessonPlan(false)}
                  aria-label="Close"
                  className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <section>
                  <h3 className="text-base font-bold text-slate-900 mb-2">Focus area and strategy</h3>
                  <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    {activePlan.expectedOutcome}
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-bold text-slate-900 mb-3">Intervention steps</h3>
                  <ol className="space-y-4">
                    {activePlan.steps.map((step: any, i: number) => (
                      <li key={i} className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-teal-700 flex items-center justify-center shrink-0">
                          {step.icon ? <step.icon size={18} /> : <Zap size={18} />}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{step.title}</h4>
                          <p className="text-sm text-slate-600 mt-0.5">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600">Expected lift</p>
                    <p className="text-2xl font-extrabold text-slate-900">{activePlan.expectedOutcome.includes('%') ? activePlan.expectedOutcome.match(/\d+%/)[0] : '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600">Timeline</p>
                    <p className="text-2xl font-extrabold text-slate-900">{activePlan.duration}</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setShowLessonPlan(false)}
                  className="h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md font-bold hover:bg-slate-50"
                >
                  Save as draft
                </button>
                <button className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold">
                  Deploy plan
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Student Detail Side Panel */}
      <AnimatePresence>
        {selectedStudent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudentId(null)}
              className="fixed inset-0 bg-slate-900/40 z-40"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-panel-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-slate-200 shadow-xl z-50 overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 id="student-panel-title" className="text-xl font-extrabold text-slate-900">Student activity</h2>
                  <button
                    onClick={() => setSelectedStudentId(null)}
                    aria-label="Close student panel"
                    className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                  >
                    <X size={22} />
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl border border-slate-200">
                  <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center text-white text-lg font-bold">
                    {initials(selectedStudent.name)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedStudent.name}</h3>
                    <p className="text-sm text-slate-600">{instance.courseName} · {instance.academicYear}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <section>
                    <h4 className="text-base font-bold text-slate-900 mb-3">In this course</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-600">Lessons completed</p>
                        <p className="text-2xl font-extrabold text-slate-900">{fmt(selectedStudent.lessonCompletionRate, '%')}</p>
                      </div>
                      <div className="p-4 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-600">Avg assessment score</p>
                        <p className="text-2xl font-extrabold text-slate-900">{fmt(selectedStudent.courseAvgScore, '%')}</p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-base font-bold text-slate-900 mb-3">Activity</h4>
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {[
                        { label: `Tutor questions (${windowDays}d)`, value: String(selectedStudent.tutorQuestions30d), icon: MessageSquare },
                        { label: 'Last active', value: formatLastActive(selectedStudent.lastActiveAt), icon: Clock },
                        { label: 'Status', value: STATUS_BADGES[selectedStudent.status]?.badge ?? selectedStudent.status, icon: Activity },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <item.icon size={16} className="text-slate-500" />
                            <span className="text-sm text-slate-700">{item.label}</span>
                          </div>
                          <span className="text-sm font-bold text-slate-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-base font-bold text-slate-900 mb-3">Risk flags</h4>
                    {selectedStudent.riskFlags.length === 0 ? (
                      <p className="text-sm text-slate-600 p-4 rounded-lg border border-slate-200">No risk flags.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedStudent.riskFlags.map(flag => (
                          <div key={flag} className="p-3 rounded-lg bg-orange-50 border border-orange-200 flex gap-3">
                            <AlertCircle size={18} className="text-orange-700 shrink-0 mt-0.5" />
                            <p className="text-sm text-orange-900">
                              <span className="font-bold">{RISK_FLAG_LABELS[flag]?.short ?? flag}.</span> {RISK_FLAG_LABELS[flag]?.long}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        if (selectedStudentRecord) onViewStudent?.(selectedStudentRecord);
                      }}
                      disabled={!selectedStudentRecord || !onViewStudent}
                      title={!selectedStudentRecord ? 'Student record not available' : undefined}
                      className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <TrendingUp size={18} />
                      View full student analytics
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Page header */}
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="min-w-0">
          <p className="text-sm font-bold text-teal-700 uppercase">Course intelligence</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">
            {viewMode === 'compare' ? 'Compare courses' : instance.courseName}
          </h1>
          <p className="text-slate-600 mt-1">
            {viewMode === 'compare'
              ? `Side-by-side figures for the course instances you select, last ${windowDays} days.`
              : `${instance.academicYear ? `${instance.academicYear} · ` : ''}Assessments, lesson completion and AI tutor activity, last ${windowDays} days.`}
          </p>
        </div>

        {viewMode !== 'compare' && (
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Course
            <select
              value={selectedInstanceId}
              onChange={(e) => { setSelectedInstanceId(e.target.value); setSelectedStudentId(null); }}
              className="h-11 min-w-[260px] max-w-full border border-slate-300 rounded-md px-3 bg-white text-base text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            >
              {courseInstances.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.courseName} ({inst.academicYear})</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto" role="tablist">
        {([
          ['classes', 'Course view'],
          ['students', 'Student matrix'],
          ['compare', 'Compare'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            role="tab"
            aria-selected={viewMode === mode}
            onClick={() => setViewMode(mode)}
            className={`-mb-px py-3 border-b-2 text-sm font-bold whitespace-nowrap ${
              viewMode === mode ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'compare' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600 mr-1">Course instances:</span>
          {courseInstances.map(inst => {
            const on = selectedCompareIds.includes(inst.id);
            return (
              <button
                key={inst.id}
                onClick={() => toggleCompareId(inst.id)}
                aria-pressed={on}
                className={`px-3 h-9 rounded-full text-sm font-bold border ${
                  on ? 'bg-blue-50 border-teal-600 text-teal-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {inst.courseName}
              </button>
            );
          })}
        </div>
      )}

      {viewMode !== 'compare' && analyticsStatus}

      {viewMode === 'compare' && (
        <div className="space-y-6">
          {overviewLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center gap-3 text-slate-600 text-sm font-semibold">
              <Activity size={18} className="animate-spin text-teal-600" />
              Loading course comparison...
            </div>
          ) : overviewError ? (
            <div className="bg-white rounded-xl border border-red-200 p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex items-center gap-2 text-red-700 text-sm font-bold">
                <AlertCircle size={18} />
                Could not load course comparison
              </div>
              <p className="text-sm text-slate-600">{overviewError}</p>
              <button
                onClick={() => setOverviewReload(n => n + 1)}
                className="h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-bold hover:bg-slate-50 flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Try again
              </button>
            </div>
          ) : comparisonData.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
              Select one or more course instances above to compare them.
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Performance benchmarking</h2>
              <p className="text-sm text-slate-600 mb-4">Avg student score vs. lesson completion</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData}>
                    <CartesianGrid vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={AXIS_TICK} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={AXIS_TICK} />
                    <Tooltip cursor={{ fill: '#f5f7fa' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="avgScore" name="Avg Score (%)" fill="#0056D2" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lessonCompletionRate" name="Lesson Completion (%)" fill="#bcd3f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Tutor activity</h2>
              <p className="text-sm text-slate-600 mb-4">Questions asked vs. students asking, last {windowDays} days</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData}>
                    <CartesianGrid vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={AXIS_TICK} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_TICK} />
                    <Tooltip cursor={{ fill: '#f5f7fa' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="tutorQuestions30d" name="Tutor Questions" fill="#0056D2" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="activeStudents30d" name="Students Asking" fill="#bcd3f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Comparative metrics</h2>
              <p className="text-sm text-slate-600">Side-by-side figures per course instance</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[820px]">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 font-bold">Course</th>
                    <th className="px-6 py-3 font-bold">Students</th>
                    <th className="px-6 py-3 font-bold">Avg score</th>
                    <th className="px-6 py-3 font-bold">Lesson completion</th>
                    <th className="px-6 py-3 font-bold">Tutor questions ({windowDays}d)</th>
                    <th className="px-6 py-3 font-bold">AI credits ({windowDays}d)</th>
                    <th className="px-6 py-3 font-bold">At risk</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map(c => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{c.courseName}</p>
                        <p className="text-xs text-slate-600">{c.lessons} lessons</p>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{c.students}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{fmt(c.avgScore, '%')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[#eef1f6] rounded">
                            <div className="h-2 bg-teal-600 rounded" style={{ width: `${c.lessonCompletionRate ?? 0}%` }} />
                          </div>
                          <span className="font-bold text-slate-900">{fmt(c.lessonCompletionRate, '%')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {c.tutorQuestions30d}
                        <span className="text-xs text-slate-600 ml-2">{c.activeStudents30d} students</span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{c.creditsUsed30d}</td>
                      <td className="px-6 py-4">
                        <span className={c.atRiskStudents > 0 ? 'font-bold text-red-700' : 'text-slate-700'}>{c.atRiskStudents}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 py-3 text-xs text-slate-600 border-t border-slate-100">
              Avg score is the mean of enrolled students' overall assessment averages. At risk: average score below 50%, no activity for 14 days, or 2+ overdue assessments.
            </p>
          </section>
          </>
          )}
        </div>
      )}

      {viewMode === 'classes' && analytics && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Questions per tutor session', value: fmt(analytics.stats.avgQuestionsPerSession), note: `${analytics.stats.sessions30d} sessions, ${analytics.stats.questions30d} questions` },
              { label: 'Replies using course material', value: fmt(analytics.stats.groundedReplyRate, '%'), note: 'Tutor replies that found matching material' },
              { label: 'Repeated questions', value: fmt(analytics.stats.repeatQuestionRate, '%'), note: 'Same wording asked more than once' },
              { label: 'Avg session length', value: analytics.stats.avgSessionMinutes == null ? '—' : `${analytics.stats.avgSessionMinutes} min`, note: 'First to last message' },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm text-slate-600">{stat.label}</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-1">{stat.value}</p>
                <p className="text-xs text-slate-600 mt-1">{stat.note} · last {windowDays}d</p>
              </div>
            ))}
          </div>

          {/* Main two-column */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className={`${cardCls} flex flex-col gap-4`}>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Chapter completion</h2>
                <p className="text-sm text-slate-600">Share of enrolled students who completed each chapter</p>
              </div>
              {analytics.chapters.length === 0 ? (
                <EmptyState className="h-32">This course has no curriculum chapters.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {analytics.chapters.map(ch => (
                    <div key={ch.chapterId} className="space-y-1.5">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-800">{ch.title}</span>
                        <span className="shrink-0">
                          <strong className="text-slate-900">{ch.completionRate}%</strong>
                          <span className="text-xs text-slate-600 ml-1.5">{ch.completedStudents}/{analytics.course.students}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-[#eef1f6] rounded">
                        <div className="h-2 bg-teal-600 rounded" style={{ width: `${ch.completionRate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2">
                <h2 className="text-lg font-bold text-slate-900">Topic accuracy</h2>
                <p className="text-sm text-slate-600">Share of assessment answers marked correct, per topic</p>
              </div>
              {topicsByRate.length === 0 ? (
                <EmptyState className="h-24">No answered assessment questions yet.</EmptyState>
              ) : (
                <div>
                  {topicsByRate.map((t, i) => (
                    <div key={t.topic} className={`flex justify-between gap-3 py-2 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                      <span className="text-slate-800">{t.topic}</span>
                      <span className="shrink-0">
                        <strong className={t.correctRate >= 70 ? 'text-green-700' : t.correctRate < 50 ? 'text-red-700' : 'text-slate-900'}>{t.correctRate}%</strong>
                        <span className="text-xs text-slate-600 ml-1.5">{t.answers} answers</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`${cardCls} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Most asked tutor questions</h2>
                <span className="text-sm text-slate-600">Last {windowDays} days</span>
              </div>
              {analytics.mostAsked.length === 0 ? (
                <EmptyState className="h-32">Students have not asked the tutor any questions in this course recently.</EmptyState>
              ) : (
                analytics.mostAsked.map((q, i) => (
                  <div key={i} className="p-3.5 border border-slate-200 rounded-lg">
                    <p className="font-bold text-slate-900">"{q.text}"</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Asked {q.count} {q.count === 1 ? 'time' : 'times'}{q.lessonTitle ? ` · ${q.lessonTitle}` : ''}
                    </p>
                  </div>
                ))
              )}

              {analytics.insights.map((insight, i) => {
                const style = INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.action;
                const Icon = style.icon;
                return (
                  <div key={`insight-${i}`} className={`p-3.5 rounded-lg border ${style.className}`}>
                    <p className="font-bold flex items-center gap-1.5"><Icon size={16} />{style.label}</p>
                    <p className="mt-1 text-sm">{insight.text}</p>
                  </div>
                );
              })}
              {analytics.insights.length === 0 && (
                <p className="text-sm text-slate-600">
                  No insights yet. They appear once students submit assessments, complete lessons or ask the tutor questions.
                </p>
              )}

              <div className="flex flex-wrap gap-3 mt-1">
                <button
                  onClick={openLessonDesignerWithGaps}
                  className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center gap-2"
                >
                  <FileText size={16} />
                  Draft a lesson plan for these gaps
                </button>
                <button
                  onClick={() => {
                    const event = new CustomEvent('open-ai-assistant', {
                      detail: { message: "Analyze student engagement patterns for " + instance.courseName + ". Look at streaks, study time, and TTU to identify trends, highly engaged students, and potential issues/burnout." }
                    });
                    window.dispatchEvent(event);
                  }}
                  className="h-11 px-4 border border-slate-300 bg-white text-slate-700 rounded-md font-bold hover:bg-slate-50 flex items-center gap-2"
                >
                  <TrendingUp size={16} />
                  Analyze engagement patterns
                </button>
              </div>
            </section>
          </div>

          {/* Course snapshot */}
          <section className={cardCls}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">Course snapshot</h2>
              <p className="text-sm text-slate-600">Enrolment and activity in the last {windowDays} days</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Students', value: analytics.course.students },
                { label: 'At risk', value: atRiskCount, warn: atRiskCount > 0 },
                { label: 'Not started', value: notStartedCount },
                { label: 'Tutor questions', value: analytics.stats.questions30d },
                { label: 'Tutor sessions', value: analytics.stats.sessions30d },
                { label: 'Assessments', value: analytics.course.assessments },
              ].map(item => (
                <div key={item.label} className={`rounded-lg p-3 border ${item.warn ? 'bg-orange-50 border-orange-200 text-orange-800' : 'border-slate-200 text-slate-900'}`}>
                  <p className={`text-sm ${item.warn ? '' : 'text-slate-600'}`}>{item.label}</p>
                  <p className="text-2xl font-extrabold">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Avg lesson completion</span>
                <strong className="text-slate-900">{fmt(avgChapterCompletion, '%')}</strong>
              </div>
              <div className="h-2 bg-[#eef1f6] rounded">
                <div className="h-2 bg-teal-600 rounded" style={{ width: `${avgChapterCompletion ?? 0}%` }} />
              </div>
            </div>
          </section>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Tutor activity by weekday</h2>
              <p className="text-sm text-slate-600 mb-4">Sessions and questions, last {windowDays} days (UTC)</p>
              {hasWeekdayActivity ? (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.engagementByWeekday}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={AXIS_TICK} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_TICK} />
                      <Tooltip
                        cursor={{ fill: '#f5f7fa' }}
                        contentStyle={tooltipStyle}
                        formatter={(value: any, name: any, item: any) => {
                          const row = item?.payload;
                          if (name === 'Sessions' && row) return [`${value} (avg ${row.avgDepth} questions, ${row.avgMinutes} min)`, name];
                          return [value, name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="sessions" name="Sessions" fill="#0056D2" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="questions" name="Questions" fill="#bcd3f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No tutor sessions in the last {windowDays} days.</EmptyState>
              )}
            </section>

            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Questions before the last due date</h2>
              <p className="text-sm text-slate-600 mb-4">
                {analytics.preExam
                  ? <>Tutor questions in the 48h before "{analytics.preExam.assessmentTitle}" (due {analytics.preExam.dueDate})</>
                  : 'Tutor questions in the 48h before the most recent assessment due date'}
              </p>
              {analytics.preExam ? (
                analytics.preExam.buckets.some(b => b.questions > 0) ? (
                  <>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.preExam.buckets}>
                          <CartesianGrid vertical={false} stroke="#eef1f6" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_TICK} />
                          <Tooltip cursor={{ fill: '#f5f7fa' }} contentStyle={tooltipStyle} />
                          <Bar dataKey="questions" name="Questions" fill="#d97706" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {analytics.preExam.buckets.filter(b => b.topQuestion).map(b => (
                        <div key={b.label} className="flex gap-3 text-sm">
                          <span className="font-bold text-slate-600 w-16 shrink-0">{b.label}</span>
                          <span className="text-slate-800 truncate" title={b.topQuestion || undefined}>"{b.topQuestion}"</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState>No tutor questions in the 48 hours before this due date.</EmptyState>
                )
              ) : (
                <EmptyState>No assessment in this course has a due date that has passed yet.</EmptyState>
              )}
            </section>

            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Weekly assessment scores</h2>
              <p className="text-sm text-slate-600 mb-4">Average score of attempts submitted each week</p>
              {hasWeeklyScores ? (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.weeklyScores}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={AXIS_TICK} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: any, _name: any, item: any) => [
                          value == null ? '—' : `${value}% (${item?.payload?.attempts ?? 0} attempts)`,
                          'Avg Score',
                        ]}
                      />
                      <Line type="monotone" dataKey="avgScore" name="Avg Score" stroke="#0056D2" strokeWidth={2.5} dot={{ r: 4, fill: '#0056D2', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No scored assessment attempts in the last six weeks.</EmptyState>
              )}
            </section>
          </div>
        </div>
      )}

      {viewMode === 'students' && analytics && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex flex-wrap justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Student performance</h2>
              <p className="text-sm text-slate-600">Lessons, scores and tutor use in {instance.courseName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-green-50 text-green-800">
                Excelling: {courseStudents.filter(s => s.status === 'excelling').length}
              </span>
              <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-red-50 text-red-700">
                At risk: {atRiskCount}
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  aria-label="Search students"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search students..."
                  className="pl-9 pr-3 h-10 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 w-56"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-bold">Student</th>
                  <th className="px-6 py-3 font-bold">Lessons completed</th>
                  <th className="px-6 py-3 font-bold">Avg score</th>
                  <th className="px-6 py-3 font-bold">Tutor questions ({windowDays}d)</th>
                  <th className="px-6 py-3 font-bold">Last active</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  <th className="px-6 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {matrixStudents.length === 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-600">
                      {courseStudents.length === 0 ? 'No students are enrolled in this course instance.' : 'No students match your search.'}
                    </td>
                  </tr>
                )}
                {matrixStudents.map(s => {
                  const record = studentsById.get(s.id);
                  const badge = STATUS_BADGES[s.status] ?? { badge: s.status, className: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-50 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {record?.avatar || initials(s.name)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{s.name}</p>
                            <p className="text-xs text-slate-600">ID: {s.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[#eef1f6] rounded">
                            <div className="h-2 bg-teal-600 rounded" style={{ width: `${s.lessonCompletionRate ?? 0}%` }} />
                          </div>
                          <span className="font-bold text-slate-900">{fmt(s.lessonCompletionRate, '%')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={s.courseAvgScore != null && s.courseAvgScore < 50 ? 'font-bold text-red-700' : 'text-slate-800'}>
                          {fmt(s.courseAvgScore, '%')}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-800">{s.tutorQuestions30d}</td>
                      <td className="px-6 py-3 text-slate-800">{formatLastActive(s.lastActiveAt)}</td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>
                          {badge.badge}
                        </span>
                        {s.riskFlags.length > 0 && (
                          <p className="text-xs text-red-700 mt-1.5">
                            {s.riskFlags.map(f => RISK_FLAG_LABELS[f]?.short ?? f).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => setSelectedStudentId(s.id)}
                          aria-label={`Inspect ${s.name}`}
                          className="inline-flex items-center gap-1 text-teal-700 font-semibold hover:underline"
                        >
                          Inspect
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-xs text-slate-600 border-t border-slate-100">
            Avg score covers this course's assessments. Status and risk flags use all of a student's activity: at risk means an average score below 50%, no activity for 14 days, or 2+ overdue assessments.
          </p>
        </section>
      )}
    </div>
  );
};
