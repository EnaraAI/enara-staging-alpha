
import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { fetchAnalyticsOverview, AnalyticsOverview } from '../services/apiService';
import { toast } from '../services/toastService';

const errorMessage = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Unexpected error');
const formatCredits = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

const SHARE_COLORS = ['#0056D2', '#0b3d91', '#d97706', '#15803d', '#5b8def', '#bcd3f7'];
const OTHER_COLOR = '#94a3b8';
const UNATTRIBUTED_COLOR = '#cbd5e1';
const MAX_SHARE_SLICES = 6;

export const InstitutionAnalytics: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        toast.error('Could not load institution analytics', message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const windowDays = overview?.windowDays ?? 30;
  const totals = overview?.totals;
  const courses = overview?.courses ?? [];
  const placeholder = loading ? '…' : '—';
  const hasActivity = !!totals && (totals.lessonsCompleted > 0 || totals.assessmentsSubmitted > 0 || totals.tutorQuestions30d > 0 || totals.creditsUsed30d > 0 || totals.activeStudents30d > 0);

  const creditsPerActive = totals && totals.activeStudents30d > 0 ? totals.creditsUsed30d / totals.activeStudents30d : null;

  // Credits per course (30d), highest first.
  const courseBurn = courses
    .filter(c => c.creditsUsed30d > 0)
    .map(c => ({ name: c.courseName, credits: c.creditsUsed30d }))
    .sort((a, b) => b.credits - a.credits);
  const unattributed = totals?.creditsUnattributed30d ?? 0;

  // Share of credits: top courses, the rest grouped, plus usage not tied to a course.
  const shareData: Array<{ name: string; value: number; color: string }> = courseBurn
    .slice(0, MAX_SHARE_SLICES)
    .map((c, i) => ({ name: c.name, value: c.credits, color: SHARE_COLORS[i % SHARE_COLORS.length] }));
  const otherCourses = courseBurn.slice(MAX_SHARE_SLICES).reduce((sum, c) => sum + c.credits, 0);
  if (otherCourses > 0) shareData.push({ name: `Other courses (${courseBurn.length - MAX_SHARE_SLICES})`, value: otherCourses, color: OTHER_COLOR });
  if (unattributed > 0) shareData.push({ name: 'Not tied to a course', value: unattributed, color: UNATTRIBUTED_COLOR });
  const shareTotal = shareData.reduce((sum, d) => sum + d.value, 0);
  const topShare = shareTotal > 0 && courseBurn.length ? Math.round((courseBurn[0].credits / shareTotal) * 100) : null;

  // Courses ranked by lesson completion (courses with no lessons yet last).
  const ranking = [...courses].sort((a, b) => (b.lessonCompletionRate ?? -1) - (a.lessonCompletionRate ?? -1));

  const kpis: Array<{ label: string; value: string; note: string }> = [
    {
      label: `Credits used (${windowDays}d)`,
      value: totals ? formatCredits(totals.creditsUsed30d) : placeholder,
      note: 'settled AI credit usage across all students'
    },
    {
      label: 'Credits per active student',
      value: creditsPerActive !== null ? formatCredits(creditsPerActive) : placeholder,
      note: totals ? `${totals.activeStudents30d.toLocaleString()} active of ${totals.students.toLocaleString()} enrolled (${windowDays}d)` : `students active in the last ${windowDays} days`
    },
    {
      label: `Tutor questions (${windowDays}d)`,
      value: totals ? totals.tutorQuestions30d.toLocaleString() : placeholder,
      note: 'questions students asked the AI tutor'
    },
    {
      label: 'Lesson completion',
      value: totals ? pct(totals.avgLessonCompletion) : placeholder,
      note: totals ? `${totals.lessonsCompleted.toLocaleString()} lessons completed in total` : 'share of available lessons completed'
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Governance</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Institutional governance</h1>
          <p className="text-slate-600 mt-1">
            AI usage and course health from recorded activity
            {overview && ` · updated ${new Date(overview.generatedAt).toLocaleString()}`}
          </p>
        </div>
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
          No activity recorded yet. Figures will appear once students use the AI tutor, complete lessons or submit assessments.
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm text-slate-600">{kpi.label}</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">{kpi.value}</p>
            <p className="text-xs text-slate-600 mt-2">{kpi.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit Burn Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Credits used per course</h2>
              <p className="text-sm text-slate-600">AI credits used by each course in the last {windowDays} days</p>
            </div>
          </div>
          {courseBurn.length === 0 ? (
            <div className="h-80 w-full flex items-center justify-center text-sm text-slate-600 bg-slate-50 rounded-lg">
              {loading ? 'Loading…' : overview ? 'No credit usage recorded yet' : 'No data available'}
            </div>
          ) : (
            <div className="w-full" style={{ height: Math.max(200, courseBurn.length * 48) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseBurn} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f6" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 12}} width={140} />
                  <Tooltip
                    formatter={(value: number) => [formatCredits(value), 'credits']}
                    cursor={{fill: '#f5f7fa'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Bar dataKey="credits" fill="#0056D2" radius={[0, 3, 3, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {unattributed > 0 && (
            <p className="text-xs text-slate-600 mt-4">
              A further {formatCredits(unattributed)} credits were used outside any course (e.g. general tutor sessions) and are not shown above.
            </p>
          )}
        </div>

        {/* Credit share by course */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900">Credit share by course</h2>
          <p className="text-sm text-slate-600 mb-4">How the last {windowDays} days of credit usage splits</p>
          {shareTotal === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-600 bg-slate-50 rounded-lg">
              {loading ? 'Loading…' : overview ? 'No credit usage recorded yet' : 'No data available'}
            </div>
          ) : (
            <>
              <div className="h-64 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={shareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={shareData.length > 1 ? 2 : 0}
                      dataKey="value"
                    >
                      {shareData.map((entry, index) => (
                        <Cell key={`inst-analytics-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${formatCredits(value)} credits`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                {topShare !== null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-extrabold text-slate-900">{topShare}%</span>
                    <span className="text-xs text-slate-600">Top course</span>
                  </div>
                )}
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {shareData.map((item, i) => (
                  <div key={i} className="flex justify-between items-center gap-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-slate-700 truncate">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 shrink-0">
                      {formatCredits(item.value)} <span className="text-slate-600 font-normal">· {Math.round((item.value / shareTotal) * 100)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Course Engagement & Health Ranking */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900">Course engagement &amp; health</h2>
          <p className="text-sm text-slate-600">Courses ranked by lesson completion.</p>
          <ul className="text-xs text-slate-600 mt-3 space-y-1 list-disc pl-4">
            <li><span className="font-semibold text-slate-700">Lesson completion</span>: share of the course's lessons that its enrolled students have completed.</li>
            <li><span className="font-semibold text-slate-700">Avg score</span>: mean of enrolled students' overall average assessment scores ("—" if none submitted).</li>
            <li><span className="font-semibold text-slate-700">Tutor users ({windowDays}d)</span>: enrolled students who asked the AI tutor at least one question in this course in the last {windowDays} days.</li>
            <li><span className="font-semibold text-slate-700">At risk</span>: enrolled students with {overview?.definitions.atRisk ?? 'average score under 50%, no activity for 14 days, or 2+ overdue assessments'}.</li>
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 border-t border-slate-100">
                <th className="px-5 py-3 font-semibold">Course Name</th>
                <th className="px-5 py-3 font-semibold">Lesson Completion</th>
                <th className="px-5 py-3 font-semibold">Avg Score</th>
                <th className="px-5 py-3 font-semibold">Tutor Users ({windowDays}d)</th>
                <th className="px-5 py-3 font-semibold">Tutor Questions ({windowDays}d)</th>
                <th className="px-5 py-3 font-semibold">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-600">
                    {loading ? 'Loading…' : overview ? 'No courses yet.' : 'No data available.'}
                  </td>
                </tr>
              )}
              {ranking.map((course) => {
                const completion = course.lessonCompletionRate;
                return (
                <tr key={course.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center text-teal-700 font-bold text-xs shrink-0">
                        {course.courseName[0]}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">{course.courseName}</span>
                        <p className="text-xs text-slate-600">{course.students} {course.students === 1 ? 'student' : 'students'} · {course.lessons} {course.lessons === 1 ? 'lesson' : 'lessons'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {completion === null ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600" style={{ width: `${completion}%` }}></div>
                        </div>
                        <span className="font-semibold text-slate-700">{completion}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-700">{pct(course.avgScore)}</td>
                  <td className="px-5 py-3 font-semibold text-slate-700">
                    {course.activeStudents30d} <span className="text-slate-600 font-normal">of {course.students}</span>
                  </td>
                  <td className="px-5 py-3 font-semibold text-slate-700">{course.tutorQuestions30d.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    {course.atRiskStudents > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold bg-red-50 text-red-700">
                        <AlertTriangle size={12} />
                        {course.atRiskStudents} {course.atRiskStudents === 1 ? 'student' : 'students'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold bg-green-50 text-green-700">
                        <TrendingUp size={12} />
                        None
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
