
import React from 'react';
import { SampleBadge } from '../components/SampleBadge';
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  BookOpen,
  MessageSquare,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Zap,
  Activity,
  BarChart3,
  CheckCircle2,
  Loader2,
  FileText,
  StickyNote
} from 'lucide-react';
import { Student } from '../types';
import { getStudent, fetchStudentAnalytics, StudentAnalytics, StudentActivityMetrics, RiskFlag, TopicAccuracy } from '../services/apiService';
import { toast } from '../services/toastService';

const formatPct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);
const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—');

const STATUS_STYLES: Record<string, string> = {
  excelling: 'bg-green-50 text-green-800',
  'on track': 'bg-blue-50 text-blue-800',
  'at risk': 'bg-red-50 text-red-800',
  'not started': 'bg-slate-100 text-slate-700',
};

/** Plain-language explanation of each backend risk flag, using the student's own numbers. */
const explainRiskFlag = (flag: RiskFlag, s: StudentActivityMetrics) => {
  switch (flag) {
    case 'low_scores':
      return `Average score is ${formatPct(s.avgScore)}, below the 50% threshold.`;
    case 'inactive':
      return s.lastActiveAt
        ? `No recorded activity in the last 14 days (last active ${formatDate(s.lastActiveAt)}).`
        : 'No recorded activity in the last 14 days.';
    case 'overdue':
      return `${s.overdueAssessments} assessments are past their due date without a submission.`;
  }
};

const topicLabel = (rate: number) => (rate >= 80 ? 'Strong' : rate >= 50 ? 'Developing' : 'Needs work');
const topicBar = (rate: number) => (rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500');
const topicBadge = (rate: number) => (rate >= 80 ? 'bg-green-50 text-green-800' : rate >= 50 ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800');

export const StudentDeepAnalytics: React.FC<{ student: Student; onBack?: () => void }> = ({ student: initialStudent, onBack }) => {
  const [student, setStudent] = React.useState<Student>(initialStudent);

  // Refresh the selected student so the profile reflects the latest backend data.
  React.useEffect(() => {
    let cancelled = false;
    setStudent(initialStudent);
    getStudent(initialStudent.id)
      .then(fresh => { if (!cancelled && fresh) setStudent(fresh as Student); })
      .catch(err => { if (!cancelled) toast.error('Could not refresh student', err instanceof Error ? err.message : 'Unexpected error'); });
    return () => { cancelled = true; };
  }, [initialStudent]);

  // Analytics computed by the backend from recorded activity.
  const [analytics, setAnalytics] = React.useState<StudentAnalytics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setError(null);
    setLoading(true);
    fetchStudentAnalytics(initialStudent.id)
      .then(data => { if (!cancelled) setAnalytics(data); })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setError(message);
        toast.error('Could not load student analytics', message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialStudent.id, reloadKey]);

  const summary = analytics?.summary;
  const topics = analytics?.topics || [];
  // Same rule the backend uses for course insights: only rank topics with at least 3 answers.
  const rankable = topics.filter(t => t.answers >= 3);
  const rankedTopics = rankable.length > 0 ? rankable : topics;
  const strongest: TopicAccuracy | undefined = [...rankedTopics].sort((a, b) => b.correctRate - a.correctRate)[0];
  const weakest: TopicAccuracy | undefined = rankedTopics.length > 1
    ? [...rankedTopics].sort((a, b) => a.correctRate - b.correctRate)[0]
    : undefined;

  const activity = analytics?.activity || [];
  const activeDays = activity.filter(d => d.lessons + d.assessments + d.questions > 0).length;
  const recentTotals = activity.reduce(
    (acc, d) => ({ lessons: acc.lessons + d.lessons, assessments: acc.assessments + d.assessments, questions: acc.questions + d.questions }),
    { lessons: 0, assessments: 0, questions: 0 }
  );

  const scored = (analytics?.scoreHistory || []).filter(h => h.score !== null);
  const latest = scored.length > 0 ? scored[scored.length - 1] : undefined;
  const scoreChange = scored.length >= 2 ? Math.round((scored[scored.length - 1].score as number) - (scored[0].score as number)) : null;

  const profile = student.learningEngineProfile;
  const adaptive = student.adaptiveProfile;
  const hasProfileNotes = Boolean(
    profile?.executiveSummary || adaptive?.preferredLearningStyle || adaptive?.strengths?.length || adaptive?.weaknesses?.length
  );

  const summarySentence = (s: StudentActivityMetrics) => {
    if (s.status === 'not started') return `${student.name} has no recorded activity yet — no submitted assessments, completed lessons or tutor questions.`;
    const parts: string[] = [];
    parts.push(
      s.attemptsSubmitted > 0
        ? `submitted ${s.attemptsSubmitted} assessment${s.attemptsSubmitted === 1 ? '' : 's'} averaging ${formatPct(s.avgScore)}`
        : 'not submitted any assessments'
    );
    parts.push(
      s.lessonsAvailable > 0
        ? `completed ${s.lessonsCompleted} of ${s.lessonsAvailable} available lessons`
        : `completed ${s.lessonsCompleted} lesson${s.lessonsCompleted === 1 ? '' : 's'}`
    );
    parts.push(`asked the AI tutor ${s.tutorQuestions30d} question${s.tutorQuestions30d === 1 ? '' : 's'} in the last 30 days`);
    return `${student.name} has ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to student profile"
              className="mt-1 h-10 w-10 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="rotate-180" size={20} />
            </button>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Student analytics</p>
            <h1 className="text-3xl font-extrabold text-slate-900">Deep analytics</h1>
            <p className="text-slate-600 mt-1">
              Measured from recorded activity for {student.name} • {student.id}
              {analytics && <> • updated {new Date(analytics.generatedAt).toLocaleString()}</>}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-16 rounded-xl border border-slate-200 flex items-center justify-center gap-3 text-slate-600">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-medium">Loading analytics…</span>
        </div>
      ) : error || !summary ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-400">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Could not load analytics</h2>
          <p className="text-slate-600 max-w-md mx-auto text-sm">{error || 'No analytics were returned for this student.'}</p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="mt-6 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Measured Summary Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                  <Zap size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Recorded activity summary</h2>
                </div>
              </div>
              <p className="text-lg leading-relaxed text-slate-700">
                {summarySentence(summary)}
              </p>
              <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Status</p>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[summary.status] || STATUS_STYLES['not started']}`}>{summary.status}</span>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Last active</p>
                  <span className="text-lg font-extrabold text-slate-900">{formatDate(summary.lastActiveAt)}</span>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">AI credits (30d)</p>
                  <span className="text-lg font-extrabold text-slate-900">{summary.creditsUsed30d}</span>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Latest score</p>
                  <span className="text-lg font-extrabold text-slate-900">
                    {latest ? formatPct(latest.score) : '—'}
                    {scoreChange !== null && (
                      <span className={`ml-2 text-xs font-bold ${scoreChange >= 0 ? 'text-green-700' : 'text-rose-700'}`}>
                        {scoreChange > 0 ? '+' : ''}{scoreChange} pts since first
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* Topic strengths & gaps */}
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-6">Strongest & Weakest Topic</h3>
                {strongest ? (
                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center text-xs gap-2">
                        <span className="font-bold text-slate-600 flex items-center gap-1.5 truncate">
                          <TrendingUp size={14} className="text-emerald-500 shrink-0" />
                          <span className="truncate" title={strongest.topic}>{strongest.topic}</span>
                        </span>
                        <span className="font-extrabold text-slate-900">{formatPct(strongest.correctRate)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                        <div className={`h-full ${topicBar(strongest.correctRate)}`} style={{ width: `${strongest.correctRate}%` }} />
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{strongest.answers} answers</p>
                    </div>
                    {weakest && weakest.topic !== strongest.topic && (
                      <div>
                        <div className="flex justify-between items-center text-xs gap-2">
                          <span className="font-bold text-slate-600 flex items-center gap-1.5 truncate">
                            <TrendingDown size={14} className="text-rose-500 shrink-0" />
                            <span className="truncate" title={weakest.topic}>{weakest.topic}</span>
                          </span>
                          <span className="font-extrabold text-slate-900">{formatPct(weakest.correctRate)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                          <div className={`h-full ${topicBar(weakest.correctRate)}`} style={{ width: `${weakest.correctRate}%` }} />
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{weakest.answers} answers</p>
                      </div>
                    )}
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Share of correct answers per topic across submitted assessments{rankable.length > 0 ? ' (topics with 3+ answers).' : '.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 py-6 text-center">No answered assessment questions yet.</p>
                )}
              </div>

              {/* Lessons & recent activity */}
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-6">Lessons & Recent Activity</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600">Lesson Completion</span>
                    <span className="font-extrabold text-slate-900">
                      {formatPct(summary.lessonCompletionRate)}
                      <span className="text-slate-600 font-bold ml-1">({summary.lessonsCompleted}/{summary.lessonsAvailable})</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500" style={{ width: `${summary.lessonCompletionRate ?? 0}%` }} />
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1">
                    <span className="font-bold text-slate-600">Active Days (last 14)</span>
                    <span className="font-extrabold text-slate-900">{activeDays} / {activity.length}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0b3d91]" style={{ width: `${activity.length ? (activeDays / activity.length) * 100 : 0}%` }} />
                  </div>
                </div>
                {activity.length > 0 && (
                  <div className="h-24 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activity}>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} interval={1} style={{ fontSize: '9px', fontWeight: 'bold' }} />
                        <Tooltip
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '12px' }}
                          labelFormatter={(_, payload) => {
                            const p = payload?.[0]?.payload as { date?: string; label?: string } | undefined;
                            return p ? `${p.label} ${p.date}` : '';
                          }}
                        />
                        <Bar dataKey="lessons" name="Lessons" stackId="a" fill="#0056D2" />
                        <Bar dataKey="assessments" name="Assessments" stackId="a" fill="#0b3d91" />
                        <Bar dataKey="questions" name="Tutor questions" stackId="a" fill="#bcd3f7" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <BookOpen size={14} className="mx-auto text-teal-600 mb-1" />
                    <p className="text-sm font-extrabold text-slate-900">{recentTotals.lessons}</p>
                    <p className="text-xs text-slate-600">Lessons</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <FileText size={14} className="mx-auto text-indigo-600 mb-1" />
                    <p className="text-sm font-extrabold text-slate-900">{recentTotals.assessments}</p>
                    <p className="text-xs text-slate-600">Assessments</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <MessageSquare size={14} className="mx-auto text-slate-600 mb-1" />
                    <p className="text-sm font-extrabold text-slate-900">{recentTotals.questions}</p>
                    <p className="text-xs text-slate-600">Tutor Qs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Topic accuracy table */}
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-slate-900">Topic Accuracy</h3>
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <BarChart3 size={12} /> Submitted assessments
                </span>
              </div>
              {topics.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-600 text-xs uppercase tracking-wide">
                        <th className="pb-3">Topic</th>
                        <th className="pb-3 text-center">Correct Answers</th>
                        <th className="pb-3 text-center">Answers</th>
                        <th className="pb-3 text-right">Level</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr]:border-t [&>tr]:border-slate-100">
                      {topics.map(row => (
                        <tr key={row.topic} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 font-bold text-slate-900 text-sm">{row.topic}</td>
                          <td className="py-3">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${topicBar(row.correctRate)}`} style={{ width: `${row.correctRate}%` }} />
                              </div>
                              <span className="text-xs font-extrabold text-slate-700">{formatPct(row.correctRate)}</span>
                            </div>
                          </td>
                          <td className="py-3 text-center text-xs font-semibold text-slate-600">{row.answers}</td>
                          <td className="py-3 text-right">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${topicBadge(row.correctRate)}`}>
                              {topicLabel(row.correctRate)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600 py-6 text-center">No answered assessment questions yet.</p>
              )}
            </div>
          </div>

          {/* Sidebar: Risk & Profile Notes */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <AlertCircle size={18} className={summary.riskFlags.length > 0 ? 'text-rose-600' : 'text-emerald-600'} />
                Risk Check
              </h3>
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <div className="text-center flex-1">
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">{formatPct(summary.avgScore)}</p>
                    <p className="text-sm text-slate-600 mt-2">Avg Score</p>
                  </div>
                  <div className="w-px h-12 bg-slate-200" />
                  <div className="text-center flex-1">
                    <p className={`text-3xl font-extrabold leading-none ${summary.overdueAssessments > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{summary.overdueAssessments}</p>
                    <p className="text-sm text-slate-600 mt-2">Overdue</p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-600 mb-2">
                    {summary.riskFlags.length > 0 ? 'Why this student is flagged' : 'Risk Flags'}
                  </p>
                  {summary.riskFlags.length > 0 ? (
                    <ul className="space-y-2">
                      {summary.riskFlags.map(flag => (
                        <li key={flag} className="flex items-start gap-2 text-xs font-medium text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                          {explainRiskFlag(flag, summary)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      {summary.status === 'not started' ? (
                        <><Clock size={14} className="text-slate-400" /> No recorded activity yet, so no risk flags apply.</>
                      ) : (
                        <><CheckCircle2 size={14} className="text-emerald-500" /> No risk flags.</>
                      )}
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Flagged at risk when the average score is below 50%, there is no activity for 14 days, or 2+ assessments are overdue.
                </p>
              </div>
            </div>

            {hasProfileNotes && (
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <StickyNote size={18} className="text-teal-600" />
                  Profile Notes
                  <SampleBadge />
                </h3>
                <p className="text-sm text-slate-600 mb-6">Sample notes from seed data — not measured from activity</p>
                <div className="space-y-6">
                  {adaptive?.preferredLearningStyle && (
                    <div>
                      <p className="text-sm text-slate-600 mb-2">Learning Style</p>
                      <p className="text-sm font-bold text-teal-900">{adaptive.preferredLearningStyle}</p>
                    </div>
                  )}
                  {profile?.executiveSummary && (
                    <div>
                      <p className="text-sm text-slate-600 mb-2">Notes</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{profile.executiveSummary}</p>
                    </div>
                  )}
                  {(adaptive?.strengths?.length || adaptive?.weaknesses?.length) ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600 mb-3 text-center">Strengths</p>
                        <div className="space-y-2">
                          {adaptive?.strengths?.map((s, i) => (
                            <div key={i} className="p-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold text-center border border-emerald-100">
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-3 text-center">Gaps</p>
                        <div className="space-y-2">
                          {adaptive?.weaknesses?.map((w, i) => (
                            <div key={i} className="p-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold text-center border border-rose-100">
                              {w}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {summary.status !== 'not started' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Activity size={18} className="text-indigo-600" />
                  AI Tutor Usage
                </h3>
                {analytics.tutorUsage.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.tutorUsage.map(t => (
                      <div key={t.label} className="flex justify-between items-center p-3 rounded-lg bg-white border border-slate-200 gap-2">
                        <span className="text-xs font-bold text-slate-700 truncate" title={t.label}>{t.label}</span>
                        <span className="text-sm font-extrabold text-slate-900">{t.questions}</span>
                      </div>
                    ))}
                    <p className="text-xs text-slate-600 text-center pt-1">Questions per course</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 text-center">No questions asked to the AI tutor yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
