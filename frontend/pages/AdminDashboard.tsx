
import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  AlertCircle, 
  ChevronRight,
  ChevronLeft,
  Search,
  Sparkles,
  Loader2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Student } from '../types';
import { fetchAnalyticsOverview, AnalyticsOverview, ActivityStatus } from '../services/apiService';
import { toast } from '../services/toastService';
import { WeeklySummaryCard } from '../components/proactive/WeeklySummaryCard';

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  onViewStudent: (student: Student) => void;
  onViewDeepAnalytics: (student: Student) => void;
}

const errorMessage = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Unexpected error');
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

type WeeklyMetric = 'activeStudents' | 'lessonsCompleted' | 'assessmentsSubmitted' | 'tutorQuestions';
const WEEKLY_METRICS: Array<{ key: WeeklyMetric; button: string; subtitle: string; unit: string }> = [
  { key: 'activeStudents', button: 'Active', subtitle: 'Students with any recorded activity each week', unit: 'active students' },
  { key: 'lessonsCompleted', button: 'Lessons', subtitle: 'Lessons completed each week', unit: 'lessons completed' },
  { key: 'assessmentsSubmitted', button: 'Assessments', subtitle: 'Assessment attempts submitted each week', unit: 'assessments submitted' },
  { key: 'tutorQuestions', button: 'Questions', subtitle: 'Questions students asked the AI tutor each week', unit: 'tutor questions' },
];

const STATUS_STYLES: Record<ActivityStatus, string> = {
  'excelling': 'bg-emerald-50 text-emerald-700',
  'on track': 'bg-blue-50 text-blue-700',
  'at risk': 'bg-red-50 text-red-700',
  'not started': 'bg-slate-100 text-slate-600',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate, students, onViewStudent, onViewDeepAnalytics }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weeklyMetric, setWeeklyMetric] = useState<WeeklyMetric>('activeStudents');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAnalyticsOverview()
      .then(data => {
        if (cancelled) return;
        setOverview(data);
        setLoadError(null);
      })
      .catch(err => {
        if (cancelled) return;
        const message = errorMessage(err);
        setLoadError(message);
        toast.error('Could not load analytics', message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const totals = overview?.totals;
  const metricsById = new Map((overview?.students ?? []).map(m => [m.id, m]));
  const hasActivity = !!totals && (totals.lessonsCompleted > 0 || totals.assessmentsSubmitted > 0 || totals.tutorQuestions30d > 0 || totals.activeStudents30d > 0);

  const q = searchQuery.trim().toLowerCase();
  const visibleStudents = q
    ? students.filter(s => [s.name, s.email, s.id].some(v => (v || '').toLowerCase().includes(q)))
    : students;

  const activeMetric = WEEKLY_METRICS.find(m => m.key === weeklyMetric)!;
  const chartData = (overview?.weekly ?? []).map(w => ({ name: w.label, value: w[weeklyMetric] }));
  const chartHasData = chartData.some(d => d.value > 0);

  const placeholder = loading ? '…' : '—';
  const stats: Array<{ label: string; value: string; note: string }> = [
    { label: 'Students', value: totals ? totals.students.toLocaleString() : placeholder, note: 'enrolled students' },
    {
      label: 'Active this week',
      value: totals ? totals.activeStudents7d.toLocaleString() : placeholder,
      note: totals && totals.students ? `${Math.round((totals.activeStudents7d / totals.students) * 100)}% of students, any recorded activity` : 'any recorded activity in the last 7 days',
    },
    { label: 'Average score', value: totals ? pct(totals.avgScore) : placeholder, note: 'mean of students\' submitted assessment scores' },
    { label: 'Lesson completion', value: totals ? pct(totals.avgLessonCompletion) : placeholder, note: 'share of available lessons completed' },
    { label: `Tutor questions (${overview?.windowDays ?? 30}d)`, value: totals ? totals.tutorQuestions30d.toLocaleString() : placeholder, note: 'questions students asked the AI tutor' },
  ];

  const perf = overview?.performance;
  const bands = overview?.definitions.scoreBands ?? { excellent: 85, good: 70, average: 50 };
  const scoredStudents = perf ? perf.excellent + perf.good + perf.average + perf.needsHelp : 0;
  const performanceRows = perf ? [
    { label: 'Excellent', range: `${bands.excellent}%+`, count: perf.excellent, color: 'bg-emerald-500' },
    { label: 'Good', range: `${bands.good}–${bands.excellent}%`, count: perf.good, color: 'bg-blue-500' },
    { label: 'Average', range: `${bands.average}–${bands.good}%`, count: perf.average, color: 'bg-amber-500' },
    { label: 'Needs Help', range: `below ${bands.average}%`, count: perf.needsHelp, color: 'bg-red-500' },
  ] : [];
  const risk = overview?.risk;
  const atRiskCount = risk?.atRiskStudents ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => window.history.back()}
            className="mt-1 p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
            title="Go Back"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">School overview</h1>
            <p className="text-slate-600 mt-1">
              {overview
                ? `Computed from recorded activity · updated ${new Date(overview.generatedAt).toLocaleString()}`
                : 'Computed from recorded activity'}
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('students')}
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10 text-sm"
        >
          Add student
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" /> Loading analytics…
        </div>
      )}
      {!loading && loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          Analytics could not be loaded: {loadError}
        </div>
      )}
      {!loading && overview && !hasActivity && (
        <div className="bg-white border border-slate-200 text-slate-600 rounded-xl p-4 text-sm">
          No activity recorded yet. Figures will appear once students complete lessons, submit assessments or ask the tutor questions.
        </div>
      )}

      <WeeklySummaryCard />

      {/* KPI row */}
      <section aria-label="Key figures" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm text-slate-600">{stat.label}</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">{stat.value}</p>
            <p className="text-xs text-slate-600 mt-2">{stat.note}</p>
          </div>
        ))}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 text-orange-800">
          <p className="text-sm">At risk</p>
          <p className="text-3xl font-extrabold mt-1">{risk ? atRiskCount.toLocaleString() : placeholder}</p>
          <p className="text-xs mt-2">students flagged by score, inactivity or overdue work</p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Engagement per week</h2>
              <p className="text-sm text-slate-600">{activeMetric.subtitle}, last 8 weeks</p>
            </div>
            <div className="flex border-b border-slate-200" role="tablist">
              {WEEKLY_METRICS.map(m => (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={weeklyMetric === m.key}
                  onClick={() => setWeeklyMetric(m.key)}
                  className={`px-3 py-2 -mb-px text-sm font-semibold border-b-2 ${
                    weeklyMetric === m.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.button}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full">
            {!chartHasData ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-600 bg-slate-50 rounded-lg">
                {loading ? 'Loading…' : overview ? 'No activity recorded yet' : 'No data available'}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), activeMetric.unit]}
                  labelFormatter={(label: string) => `Week of ${label}`}
                  cursor={{fill: '#f5f7fa'}}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={window.innerWidth < 640 ? 20 : 36}>
                  {chartData.map((entry, index) => (
                    <Cell key={`admin-dash-cell-${index}`} fill={index === chartData.length - 1 ? '#0056D2' : '#bcd3f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-slate-900">Score bands</h2>
          <p className="text-sm text-slate-600 mb-4">Students by average assessment score</p>
          {!perf ? (
            <p className="text-sm text-slate-600">{loading ? 'Loading…' : 'No data available'}</p>
          ) : scoredStudents === 0 ? (
            <p className="text-sm text-slate-600">No assessment scores recorded yet.</p>
          ) : (
          <div className="space-y-4">
            {performanceRows.map((row, i) => {
              const share = Math.round((row.count / scoredStudents) * 100);
              return (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between items-end text-sm">
                  <span className="font-semibold text-slate-700">{row.label} <span className="text-slate-600 font-normal">{row.range}</span></span>
                  <span className="font-bold text-slate-900">{row.count} <span className="text-slate-600 font-normal">· {share}%</span></span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${share}%` }}></div>
                </div>
              </div>
              );
            })}
          </div>
          )}
          {perf && perf.noScores > 0 && (
            <p className="text-xs text-slate-600 mt-4">
              {perf.noScores} {perf.noScores === 1 ? 'student has' : 'students have'} no submitted assessments yet and {perf.noScores === 1 ? 'is' : 'are'} not counted above.
            </p>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="text-orange-700" /> Students at risk
            </h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              {risk ? (
                <>
                  <span className="font-bold text-slate-900">{atRiskCount} {atRiskCount === 1 ? 'student is' : 'students are'}</span> at risk
                  {atRiskCount > 0 && ` (${risk.lowScores} with average score below ${bands.average}%, ${risk.inactive} inactive for ${overview?.definitions.inactiveAfterDays ?? 14}+ days, ${risk.overdue} with overdue assessments)`}.
                  {risk.notStarted > 0 && ` ${risk.notStarted} ${risk.notStarted === 1 ? 'student has' : 'students have'} not started yet.`}
                </>
              ) : (
                loading ? 'Loading…' : 'At-risk figures are unavailable.'
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onNavigate('students')}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-3 h-9 text-sm"
              >
                Review flagged students
              </button>
              <button
                onClick={() => {
                  // Logic to open AI assistant with specific message
                  const event = new CustomEvent('open-ai-assistant', {
                    detail: { message: "Analyze student engagement patterns. Identify who is most engaged and who shows signs of losing momentum based on their recent activity, lesson completion, assessment scores and tutor questions." }
                  });
                  window.dispatchEvent(event);
                }}
                className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold rounded-md px-3 h-9 text-sm flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                Analyze engagement
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Student roster */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">Students</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input type="text" aria-label="Search students" placeholder="Search students..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 h-10 rounded-md border border-slate-300 text-sm focus:border-teal-600 focus:outline-none bg-white" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 border-t border-slate-100">
                <th className="px-5 py-3 font-semibold">Student</th>
                <th className="px-5 py-3 font-semibold">Current module</th>
                <th className="px-5 py-3 font-semibold">Affinity subject</th>
                <th className="px-5 py-3 font-semibold" title="Share of available lessons the student has completed">Lessons</th>
                <th className="px-5 py-3 font-semibold">Avg score</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-600">
                    {students.length === 0 ? 'No students yet.' : 'No students match your search.'}
                  </td>
                </tr>
              )}
              {visibleStudents.map((s) => {
                const m = metricsById.get(s.id);
                return (
                <tr
                  key={s.id}
                  onClick={() => onViewStudent(s)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {s.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                        <p className="text-xs text-slate-600 truncate">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{s.currentModule}</td>
                  <td className="px-5 py-3 text-slate-700">{s.affinitySubject || 'N/A'}</td>
                  <td className="px-5 py-3">
                    {m && m.lessonCompletionRate !== null ? (
                      <div className="flex items-center gap-2" title={`${m.lessonsCompleted} of ${m.lessonsAvailable} lessons`}>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600" style={{ width: `${m.lessonCompletionRate}%` }}></div>
                        </div>
                        <span className="font-semibold text-slate-700">{m.lessonCompletionRate}%</span>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{pct(m?.avgScore)}</td>
                  <td className="px-5 py-3">
                    {m ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[m.status]}`}>
                        {m.status}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDeepAnalytics(s);
                        }}
                        className="p-2 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-md"
                        title="View Deep Analytics"
                        aria-label={`View deep analytics for ${s.name}`}
                      >
                        <TrendingUp size={16} />
                      </button>
                      <button className="p-2 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-md" aria-label={`Open ${s.name}`}>
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
          <p>Showing {visibleStudents.length} of {students.length} students</p>
          <p>Lessons, score and status are computed from recorded activity; "—" means none recorded yet.</p>
        </div>
      </section>
    </div>
  );
};
