
import React from 'react';
import { SampleBadge } from '../components/SampleBadge';
import { 
  ChevronLeft, 
  Mail, 
  GraduationCap, 
  TrendingUp, 
  TrendingDown,
  Clock, 
  Award, 
  MessageSquare, 
  FileText, 
  Calendar,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  XCircle,
  BarChart3,
  Search,
  Filter,
  X,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Zap,
  BookOpen,
  Target,
  Loader2,
  Activity
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Student, ExamResult } from '../types';
import { getStudent, fetchStudentAnalytics, StudentAnalytics, RiskFlag } from '../services/apiService';
import { toast } from '../services/toastService';

interface StudentProfileProps {
  student: Student;
  onBack: () => void;
  onViewDeepAnalytics?: () => void;
}

const formatPct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);
const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—');

const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  low_scores: 'Average score below 50%',
  inactive: 'No activity in the last 14 days',
  overdue: '2 or more assessments overdue',
};

export const StudentProfile: React.FC<StudentProfileProps> = ({ student: initialStudent, onBack, onViewDeepAnalytics }) => {
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
  const [analyticsLoading, setAnalyticsLoading] = React.useState(true);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setAnalyticsError(null);
    setAnalyticsLoading(true);
    fetchStudentAnalytics(initialStudent.id)
      .then(data => { if (!cancelled) setAnalytics(data); })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setAnalyticsError(message);
        toast.error('Could not load student analytics', message);
      })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [initialStudent.id, reloadKey]);

  const [isAllExamsModalOpen, setIsAllExamsModalOpen] = React.useState(false);
  const [selectedExam, setSelectedExam] = React.useState<ExamResult | null>(null);
  const [isLearningStyleModalOpen, setIsLearningStyleModalOpen] = React.useState(false);

  const summary = analytics?.summary;

  // Submitted attempts in chronological order (only those with a score).
  const scoreHistoryData = React.useMemo(
    () => (analytics?.scoreHistory || [])
      .filter(h => h.score !== null)
      .map((h, i) => ({
        key: i,
        date: h.date ? new Date(h.date).toLocaleDateString() : '—',
        title: h.title,
        score: h.score as number,
      })),
    [analytics]
  );
  const scoreChange = scoreHistoryData.length >= 2
    ? Math.round(scoreHistoryData[scoreHistoryData.length - 1].score - scoreHistoryData[0].score)
    : null;

  const tutorUsageData = analytics?.tutorUsage || [];
  const tutorQuestionsTotal = tutorUsageData.reduce((sum, t) => sum + t.questions, 0);

  const activityData = analytics?.activity || [];
  const activityTotal = activityData.reduce((sum, d) => sum + d.lessons + d.assessments + d.questions, 0);
  const busiestDay = activityTotal > 0
    ? activityData.reduce((best, d) => (d.lessons + d.assessments + d.questions > best.lessons + best.assessments + best.questions ? d : best))
    : null;

  const topicData = analytics?.topics || [];
  const weakestTopics = [...topicData].sort((a, b) => a.correctRate - b.correctRate).slice(0, 4);
  const subjectData = analytics?.subjects || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excelling': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'on track': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'at risk': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const scoreColor = (value: number) => (value >= 80 ? 'text-emerald-600' : value >= 50 ? 'text-amber-600' : 'text-rose-600');
  const scoreBarColor = (value: number) => (value >= 80 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-rose-500');

  const panelPlaceholder = (emptyText: string) => {
    if (analyticsLoading) {
      return (
        <div className="py-12 flex items-center justify-center gap-2 text-slate-600 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading analytics…
        </div>
      );
    }
    if (analyticsError) {
      return (
        <div className="py-12 text-center text-rose-500 text-sm">
          Analytics unavailable.
        </div>
      );
    }
    return <div className="py-12 text-center text-slate-600 text-sm">{emptyText}</div>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              aria-label="Back to students"
              className="mt-1 h-10 w-10 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Students</p>
              <h1 className="text-3xl font-extrabold text-slate-900">Student profile</h1>
              <p className="text-slate-600 mt-1">Scores, activity and tutor usage recorded for this student.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onViewDeepAnalytics && (
              <button
                onClick={onViewDeepAnalytics}
                className="h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <Sparkles size={16} />
                Deep Analytics
              </button>
            )}
            <button className="h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">
              Export Report
            </button>
            <button className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
              Message Student
            </button>
          </div>
        </div>

        {analyticsError && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-sm font-medium">Could not load analytics for {student.name}: {analyticsError}</p>
            </div>
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="h-10 px-4 rounded-md bg-white border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Section: Info Card & Quick Stats */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Info Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-200 flex flex-col md:flex-row gap-8 items-center md:items-start"
          >
            <div className="w-20 h-20 rounded-full bg-teal-600 flex items-center justify-center text-white text-2xl font-bold  shrink-0">
              {student.avatar}
            </div>
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                  <h2 className="text-2xl font-extrabold text-slate-900">{student.name}</h2>
                  {summary ? (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border  ${getStatusColor(summary.status)}`}>
                      {summary.status}
                    </span>
                  ) : analyticsLoading ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold border  bg-slate-50 text-slate-400 border-slate-100 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      Status
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Mail size={16} />
                    <span className="text-sm">{student.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <GraduationCap size={16} />
                    <span className="text-sm">{student.grade}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-sm">Last active: {summary ? formatDate(summary.lastActiveAt) : '—'}</span>
                  </div>
                  {student.adaptiveProfile?.preferredLearningStyle && (
                    <button 
                      onClick={() => setIsLearningStyleModalOpen(true)}
                      title="Profile note — not measured from activity"
                      className="flex items-center gap-1.5 hover:bg-purple-50 px-2 py-1 rounded-lg transition-all group"
                    >
                      <Sparkles size={16} className="text-purple-500 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-bold text-purple-700 border-b border-purple-200 border-dashed group-hover:border-purple-500">
                        {student.adaptiveProfile.preferredLearningStyle} Learner (profile note)
                      </span>
                      <SampleBadge />
                    </button>
                  )}
                </div>
                {summary && summary.riskFlags.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3">
                    {summary.riskFlags.map(flag => (
                      <span key={flag} className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[11px] font-bold text-rose-700 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {RISK_FLAG_LABELS[flag]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Avg Score</p>
                  <p className="text-2xl font-extrabold text-slate-900">{summary ? formatPct(summary.avgScore) : '—'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{summary ? `${summary.attemptsSubmitted} submitted` : '\u00a0'}</p>
                </div>
                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Lessons Done</p>
                  <p className="text-2xl font-extrabold text-slate-900">{summary ? formatPct(summary.lessonCompletionRate) : '—'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{summary ? `${summary.lessonsCompleted} of ${summary.lessonsAvailable}` : '\u00a0'}</p>
                </div>
                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Tutor Qs (30d)</p>
                  <p className="text-2xl font-extrabold text-slate-900">{summary ? summary.tutorQuestions30d : '—'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{summary ? `${summary.creditsUsed30d} credits used` : '\u00a0'}</p>
                </div>
                <div className="p-4 rounded-lg bg-white border border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Overdue</p>
                  <p className={`text-2xl font-extrabold ${summary && summary.overdueAssessments > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{summary ? summary.overdueAssessments : '—'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{summary ? 'assessments' : '\u00a0'}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Performance Overview */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl p-6 border border-slate-200"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp size={18} className="text-teal-600" />
                Score History
              </h3>
              {scoreHistoryData.length > 0 && (
                <span className="text-sm text-slate-600">Last {scoreHistoryData.length} attempt{scoreHistoryData.length === 1 ? '' : 's'}</span>
              )}
            </div>
            {scoreHistoryData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scoreHistoryData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="key" hide />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as { title?: string; date?: string } | undefined;
                        return p ? `${p.title} • ${p.date}` : '';
                      }}
                      formatter={(value) => [`${value}%`, 'Score']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#0056D2" 
                      strokeWidth={2}
                      fill="#bcd3f7"
                      fillOpacity={0.25} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center">
                {panelPlaceholder('No submitted assessments yet.')}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-600">Change, first to latest</span>
              {scoreChange === null ? (
                <span className="text-slate-400 font-bold">—</span>
              ) : (
                <span className={`font-bold flex items-center gap-1 ${scoreChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {scoreChange >= 0 ? <ArrowUpRight size={16} /> : <TrendingDown size={16} />}
                  {scoreChange > 0 ? '+' : ''}{scoreChange} pts
                </span>
              )}
            </div>
          </motion.div>
        </div>

        {/* Middle Section: Subject Performance & AI Tutor Analytics */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Subject Performance */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-200"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Award size={18} className="text-teal-600" />
                Performance by Subject
              </h3>
              <span className="text-xs text-slate-600">Submitted assessments</span>
            </div>
            {subjectData.length > 0 ? (
              <div className="space-y-6">
                {subjectData.map((subject, idx) => (
                  <div key={subject.subject} className="space-y-2 p-4 rounded-lg border border-transparent hover:bg-slate-50 hover:border-slate-100 transition-all">
                    <div className="flex justify-between items-end">
                      <div>
                        <h4 className="font-bold text-slate-900">{subject.subject}</h4>
                        <p className="text-xs text-slate-600">
                          {subject.attempts} attempt{subject.attempts === 1 ? '' : 's'} • Correct answers: {formatPct(subject.correctRate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${subject.avgScore === null ? 'text-slate-400' : scoreColor(subject.avgScore)}`}>{formatPct(subject.avgScore)}</span>
                        <p className="text-xs text-slate-600">Avg Score</p>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${subject.avgScore ?? 0}%` }}
                        transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                        className="h-full bg-teal-600 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              panelPlaceholder('No submitted assessments yet.')
            )}
          </motion.div>

          {/* AI Tutor Analytics */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl p-6 border border-slate-200"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Brain size={18} className="text-teal-600" />
                AI Tutor Engagement
              </h3>
            </div>
            {tutorUsageData.length > 0 ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tutorUsageData} layout="vertical">
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis dataKey="label" type="category" axisLine={false} tickLine={false} width={90} style={{ fontSize: '12px', fontWeight: 'bold' }} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                        formatter={(value) => [value, 'Questions']}
                      />
                      <Bar dataKey="questions" radius={[0, 4, 4, 0]} barSize={20}>
                        {tutorUsageData.map((entry, index) => (
                          <Cell key={`profile-tutor-cell-${index}`} fill={index === 0 ? '#0056D2' : '#bcd3f7'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 border border-teal-100">
                    <div className="flex items-center gap-3">
                      <MessageSquare size={16} className="text-teal-600" />
                      <span className="text-xs font-bold text-teal-900">Total Questions</span>
                    </div>
                    <span className="text-sm font-bold text-teal-900">{tutorQuestionsTotal}</span>
                  </div>
                  <p className="text-xs text-slate-600 text-center">
                    Most active in {tutorUsageData[0].label}
                  </p>
                </div>
              </>
            ) : (
              panelPlaceholder('No questions asked to the AI tutor yet.')
            )}
          </motion.div>
        </div>

        {/* Bottom Section: Exam Results & Activity / Topic Analytics */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Exam Results */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl p-6 border border-slate-200"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-teal-600" />
                Recent Exam Results
              </h3>
              <button 
                onClick={() => setIsAllExamsModalOpen(true)}
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                View All
              </button>
            </div>
            <div className="space-y-4">
              {student.pastResults?.slice(0, 3).map((result, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setSelectedExam(result)}
                  className="flex items-center justify-between p-4 rounded-lg bg-white border border-slate-200 group hover:bg-slate-50 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${result.score >= 85 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      {result.score >= 85 ? <CheckCircle2 size={24} /> : <BarChart3 size={24} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{result.assessmentTitle}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Calendar size={12} />
                        {new Date(result.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${result.score >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {result.score}%
                    </span>
                    <p className="text-xs text-slate-600">Result</p>
                  </div>
                </div>
              ))}
              {(!student.pastResults || student.pastResults.length === 0) && (
                <div className="py-12 text-center text-slate-600 text-sm">
                  No recent exam results found.
                </div>
              )}
            </div>
          </motion.div>

          {/* Activity & Topic Analytics */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl p-6 border border-slate-200"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Activity size={18} className="text-teal-600" />
                Activity & Topic Accuracy
              </h3>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-8">
              {/* Topic accuracy */}
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-700">Topic Accuracy</p>
                {topicData.length > 0 ? (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {topicData.slice(0, 6).map(t => (
                      <div key={t.topic}>
                        <div className="flex justify-between items-center mb-1 gap-2">
                          <span className="text-xs font-bold text-slate-700 truncate" title={t.topic}>{t.topic}</span>
                          <span className={`text-xs font-extrabold ${scoreColor(t.correctRate)}`}>{Math.round(t.correctRate)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${scoreBarColor(t.correctRate)}`} style={{ width: `${t.correctRate}%` }} />
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{t.answers} answer{t.answers === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  panelPlaceholder('No answered questions yet.')
                )}
              </div>

              {/* Last 14 days activity */}
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-700">Last 14 Days</p>
                {activityData.length > 0 ? (
                  <>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityData}>
                          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={1} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                          <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                            labelFormatter={(_, payload) => {
                              const p = payload?.[0]?.payload as { date?: string; label?: string } | undefined;
                              return p ? `${p.label} ${p.date}` : '';
                            }}
                          />
                          <Bar dataKey="lessons" name="Lessons" stackId="a" fill="#0056D2" />
                          <Bar dataKey="assessments" name="Assessments" stackId="a" fill="#0b3d91" />
                          <Bar dataKey="questions" name="Tutor questions" stackId="a" fill="#bcd3f7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { name: 'Lessons', color: '#0056D2' },
                        { name: 'Assessments', color: '#0b3d91' },
                        { name: 'Tutor Qs', color: '#bcd3f7' },
                      ].map(s => (
                        <div key={s.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-xs text-slate-600">{s.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-600 mb-1">Busiest Day</p>
                      <p className="text-sm font-bold text-slate-900">
                        {busiestDay ? `${busiestDay.label} ${busiestDay.date} • ${busiestDay.lessons + busiestDay.assessments + busiestDay.questions} actions` : 'No activity in 14 days'}
                      </p>
                    </div>
                  </>
                ) : (
                  panelPlaceholder('No recorded activity.')
                )}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="text-sm font-bold text-slate-700 mb-4">Weakest Topics</p>
              {weakestTopics.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {weakestTopics.map(t => (
                    <span key={t.topic} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-600">
                      {t.topic} <span className={scoreColor(t.correctRate)}>{Math.round(t.correctRate)}%</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">{analyticsLoading ? 'Loading…' : '—'}</p>
              )}
            </div>
          </motion.div>
        </div>

      {/* Modals */}
      <AnimatePresence>
        {isLearningStyleModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLearningStyleModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Brain size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Learning Profile Notes</h2>
                    <p className="text-sm text-slate-600">Profile notes for {student.name} — not measured from recorded activity</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLearningStyleModalOpen(false)}
                  aria-label="Close" className="p-2 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-8">
                {/* Primary Style Card */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-purple-900 relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <Zap size={20} className="text-purple-700" />
                      <span className="text-sm font-bold">Noted Learning Style</span>
                      <SampleBadge />
                    </div>
                    <h3 className="text-3xl font-extrabold mb-2">{student.adaptiveProfile?.preferredLearningStyle} Learner</h3>
                    <p className="text-purple-900 leading-relaxed">
                      {student.name}'s profile notes a preference for {student.adaptiveProfile?.preferredLearningStyle?.toLowerCase()} learning, 
                      i.e. concepts presented through 
                      {student.adaptiveProfile?.preferredLearningStyle === 'Visual' ? ' diagrams, charts, and spatial relationships.' : 
                       student.adaptiveProfile?.preferredLearningStyle === 'Auditory' ? ' verbal explanations, discussions, and rhythmic patterns.' : 
                       ' hands-on activities, movement, and physical interaction.'}
                    </p>
                  </div>
                  
                </div>

                {/* Behavioral Traits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Target size={18} className="text-purple-600" />
                      Noted Strengths
                    </h4>
                    <ul className="space-y-3">
                      {student.adaptiveProfile?.strengths?.map((s, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100">
                    <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <AlertCircle size={18} className="text-amber-600" />
                      Noted Growth Areas
                    </h4>
                    <ul className="space-y-3">
                      {student.adaptiveProfile?.weaknesses?.map((w, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* AI Recommendations */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles size={18} className="text-purple-600" />
                    Suggested Teaching Approach
                  </h4>
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg border border-purple-100 bg-purple-50/30 flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white border border-purple-100 flex items-center justify-center shrink-0">
                        <BookOpen size={20} className="text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Content Delivery</p>
                        <p className="text-xs text-slate-600 mt-1">
                          Prioritize {student.adaptiveProfile?.preferredLearningStyle === 'Visual' ? 'infographics and mind maps' : 
                                     student.adaptiveProfile?.preferredLearningStyle === 'Auditory' ? 'audio summaries and podcasts' : 
                                     'interactive simulations'} for new concepts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAllExamsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAllExamsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">All Exam Results</h2>
                  <p className="text-sm text-slate-600">Full assessment history for {student.name}</p>
                </div>
                <button 
                  onClick={() => setIsAllExamsModalOpen(false)}
                  aria-label="Close" className="p-2 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search assessments..."
                      className="w-full pl-12 pr-4 py-3 rounded-lg bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all font-medium"
                    />
                  </div>
                  <button className="px-6 py-3 rounded-lg border border-slate-200 text-slate-600 font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
                    <Filter size={18} />
                    Filter
                  </button>
                </div>

                <div className="grid gap-4">
                  {student.pastResults?.map((result, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => {
                        setSelectedExam(result);
                        setIsAllExamsModalOpen(false);
                      }}
                      className="flex items-center justify-between p-6 rounded-xl bg-white border border-slate-200 group hover:bg-slate-50 hover:border-teal-100 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${result.score >= 85 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          {result.score >= 85 ? <CheckCircle2 size={28} /> : <BarChart3 size={28} />}
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-slate-900">{result.assessmentTitle}</h4>
                          <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={14} />
                              {new Date(result.date).toLocaleDateString()}
                            </span>
                            {result.answers.length > 0 && (
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={14} />
                                {result.answers.filter(a => a.isCorrect).length}/{result.answers.length} correct
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <span className={`text-2xl font-extrabold ${result.score >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {result.score}%
                          </span>
                          <p className="text-xs text-slate-600">Score</p>
                        </div>
                        <ChevronRight size={20} className="text-slate-300 group-hover:text-teal-500 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {selectedExam && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedExam(null)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedExam.score >= 85 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    {selectedExam.score >= 85 ? <CheckCircle2 size={24} /> : <BarChart3 size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{selectedExam.assessmentTitle}</h2>
                    <p className="text-sm text-slate-600">{new Date(selectedExam.date).toLocaleDateString()} • Detailed Review</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedExam(null)}
                  aria-label="Close" className="p-2 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-8">
                {/* Score Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-sm text-slate-600 mb-1">Final Score</p>
                    <p className={`text-3xl font-extrabold ${selectedExam.score >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>{selectedExam.score}%</p>
                  </div>
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-sm text-slate-600 mb-1">Correct</p>
                    <p className="text-3xl font-extrabold text-slate-900">
                      {selectedExam.answers.length > 0
                        ? `${selectedExam.answers.filter(a => a.isCorrect).length}/${selectedExam.answers.length}`
                        : '—'}
                    </p>
                  </div>
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-sm text-slate-600 mb-1">Submitted</p>
                    <p className="text-xl font-extrabold text-slate-900 pt-2">{new Date(selectedExam.date).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Topic Performance Breakdown */}
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 size={18} className="text-teal-600" />
                    Topic Performance Breakdown
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(
                      selectedExam.answers.reduce((acc, ans) => {
                        const topic = ans.topic || 'General';
                        if (!acc[topic]) acc[topic] = { correct: 0, total: 0 };
                        acc[topic].total += 1;
                        if (ans.isCorrect) acc[topic].correct += 1;
                        return acc;
                      }, {} as Record<string, { correct: number; total: number }>)
                    ).map(([topic, stats]: [string, { correct: number, total: number }]) => {
                      const percentage = Math.round((stats.correct / stats.total) * 100);
                      return (
                        <div key={topic} className="p-4 rounded-lg bg-white border border-slate-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-700">{topic}</span>
                            <span className={`text-xs font-extrabold ${percentage >= 80 ? 'text-emerald-600' : percentage >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {percentage}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${percentage >= 80 ? 'bg-emerald-500' : percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                              style={{ width: `${percentage}%` }} 
                            />
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {stats.correct} / {stats.total} Correct
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Question Review */}
                <div className="space-y-6">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Search size={18} className="text-teal-600" />
                    Question-by-Question Analysis
                  </h3>
                  
                  {selectedExam.answers.length > 0 ? (
                    selectedExam.answers.map((answer, i) => (
                      <div key={i} className={`p-6 rounded-xl border ${answer.isCorrect ? 'bg-emerald-50/30 border-emerald-100' : 'bg-rose-50/30 border-rose-100'}`}>
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex gap-4">
                            <span className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                              {i + 1}
                            </span>
                            <div>
                              <p className="font-bold text-slate-900">{answer.questionText}</p>
                              {answer.topic && (
                                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                                  {answer.topic}
                                </span>
                              )}
                            </div>
                          </div>
                          {answer.isCorrect ? (
                            <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
                          ) : (
                            <XCircle className="text-rose-500 shrink-0" size={20} />
                          )}
                        </div>
                        
                        <div className="grid sm:grid-cols-2 gap-4 ml-12">
                          <div className="space-y-1">
                            <p className="text-xs text-slate-600">Student's Answer</p>
                            <p className={`text-sm font-bold ${answer.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>{answer.studentAnswer}</p>
                          </div>
                          {!answer.isCorrect && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-600">Correct Answer</p>
                              <p className="text-sm font-bold text-emerald-700">{answer.correctAnswer}</p>
                            </div>
                          )}
                        </div>

                        {answer.explanation && (
                          <div className="mt-4 ml-12 p-4 rounded-lg bg-white/50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
                            <div className="flex items-center gap-2 mb-1 text-teal-700 font-bold text-xs">
                              <Brain size={12} />
                              AI Explanation
                            </div>
                            {answer.explanation}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <AlertCircle className="mx-auto text-slate-300 mb-3" size={40} />
                      <p className="text-slate-600 font-medium">Detailed question data is not available for this legacy assessment.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
