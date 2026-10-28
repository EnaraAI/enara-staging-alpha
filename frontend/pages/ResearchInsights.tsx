
import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Activity,
  ArrowUpRight,
  ChevronRight,
  Search,
  Sparkles,
  FileText,
  Lightbulb,
  Clock,
  AlertTriangle as ShieldAlert,
  Compass,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Batch, Student } from '../types';
import {
  fetchBatches,
  fetchStudents,
  fetchAnalyticsOverview,
  fetchStudentAnalytics,
  AnalyticsOverview,
  StudentAnalytics,
  StudentActivityMetrics,
  RiskFlag,
  ActivityStatus,
} from '../services/apiService';
import { toast } from '../services/toastService';
import { generateInterventionPlan } from '../services/geminiService';

// ---- Formatting helpers (null → "—") ----
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString());
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

const formatLastActive = (iso: string | null) => {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';

const scoreColor = (v: number | null) =>
  v === null ? 'text-slate-600' : v >= 85 ? 'text-green-700' : v >= 70 ? 'text-blue-700' : v >= 50 ? 'text-amber-700' : 'text-red-700';

const FLAG_LABELS: Record<RiskFlag, string> = {
  low_scores: 'Low scores',
  inactive: 'Inactive 14d+',
  overdue: 'Overdue work',
};

const STATUS_STYLES: Record<ActivityStatus, string> = {
  'excelling': 'bg-green-50 text-green-800',
  'on track': 'bg-blue-50 text-blue-800',
  'at risk': 'bg-red-50 text-red-700',
  'not started': 'bg-slate-100 text-slate-700',
};

/** Batch-level aggregates computed from the per-student metrics of the overview. */
interface BatchStats {
  batchId: string;
  name: string;
  students: number;
  avgScore: number | null;
  activeRate: number | null;
  atRisk: number;
  atRiskRate: number | null;
  notStarted: number;
  lessonCompletion: number | null;
  lessonsCompleted: number;
  assessmentsSubmitted: number;
  tutorQuestions30d: number;
  overdueAssessments: number;
  flagCounts: Record<RiskFlag, number>;
  members: StudentActivityMetrics[];
}

export const ResearchInsights: React.FC = () => {
  const [viewMode, setViewMode] = React.useState<'classes' | 'students'>('classes');
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [batchFilter, setBatchFilter] = React.useState('All Batches');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [studentAnalytics, setStudentAnalytics] = React.useState<StudentAnalytics | null>(null);
  const [studentAnalyticsLoading, setStudentAnalyticsLoading] = React.useState(false);
  const [studentAnalyticsError, setStudentAnalyticsError] = React.useState<string | null>(null);
  const [compareBatch1, setCompareBatch1] = React.useState('');
  const [compareBatch2, setCompareBatch2] = React.useState('');
  const [selectedSubject, setSelectedSubject] = React.useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = React.useState(false);
  const [showInterventionModal, setShowInterventionModal] = React.useState(false);
  const [interventionPlan, setInterventionPlan] = React.useState<any>(null);

  React.useEffect(() => {
    let cancelled = false;
    const fail = (what: string) => (err: unknown) => {
      if (!cancelled) toast.error(`Could not load ${what}`, err instanceof Error ? err.message : 'Unexpected error');
    };
    Promise.all([
      fetchAnalyticsOverview().then(data => { if (!cancelled) { setOverview(data); setOverviewError(null); } }).catch(err => {
        if (cancelled) return;
        setOverviewError(err instanceof Error ? err.message : 'Unexpected error');
        fail('analytics')(err);
      }),
      fetchStudents().then(list => { if (!cancelled) setStudents(list); }).catch(fail('students')),
      fetchBatches().then(list => { if (!cancelled) setBatches(list); }).catch(fail('batches')),
    ]).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Per-student analytics for the selected student.
  React.useEffect(() => {
    if (!selectedStudentId) {
      setStudentAnalytics(null);
      setStudentAnalyticsError(null);
      return;
    }
    let cancelled = false;
    setStudentAnalytics(null);
    setStudentAnalyticsError(null);
    setStudentAnalyticsLoading(true);
    fetchStudentAnalytics(selectedStudentId)
      .then(data => {
        if (cancelled) return;
        setStudentAnalytics(data);
        setSelectedSubject(data.subjects[0]?.subject || null);
      })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unexpected error';
        setStudentAnalyticsError(message);
        toast.error('Could not load student analytics', message);
      })
      .finally(() => { if (!cancelled) setStudentAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedStudentId]);

  const metrics = overview?.students || [];
  const studentRecord = React.useCallback((id: string) => students.find(s => s.id === id), [students]);
  const avatarFor = (m: { id: string; name: string }) => studentRecord(m.id)?.avatar || initials(m.name);
  const batchName = React.useCallback(
    (id?: string) => (id ? batches.find(b => b.id === id)?.name || id : 'Unassigned'),
    [batches]
  );

  // Batch aggregates: backend per-batch figures plus sums over member metrics.
  const batchStats = React.useMemo<BatchStats[]>(() => {
    const ids = new Set<string>([...batches.map(b => b.id), ...(overview?.batches || []).map(b => b.batchId)]);
    return [...ids].map(batchId => {
      const members = metrics.filter(m => m.batchId === batchId);
      const fromApi = overview?.batches.find(b => b.batchId === batchId);
      const atRisk = members.filter(m => m.status === 'at risk').length;
      const flagCounts: Record<RiskFlag, number> = { low_scores: 0, inactive: 0, overdue: 0 };
      members.forEach(m => m.riskFlags.forEach(f => { flagCounts[f]++; }));
      return {
        batchId,
        name: batchName(batchId),
        students: members.length,
        avgScore: fromApi ? fromApi.avgScore : round1(mean(members.map(m => m.avgScore).filter((v): v is number => v !== null))),
        activeRate: fromApi ? fromApi.activeRate : null,
        atRisk: fromApi ? fromApi.atRiskStudents : atRisk,
        atRiskRate: members.length ? Math.round((atRisk / members.length) * 100) : null,
        notStarted: members.filter(m => m.status === 'not started').length,
        lessonCompletion: (() => {
          const v = mean(members.map(m => m.lessonCompletionRate).filter((x): x is number => x !== null));
          return v === null ? null : Math.round(v);
        })(),
        lessonsCompleted: members.reduce((s, m) => s + m.lessonsCompleted, 0),
        assessmentsSubmitted: members.reduce((s, m) => s + m.attemptsSubmitted, 0),
        tutorQuestions30d: members.reduce((s, m) => s + m.tutorQuestions30d, 0),
        overdueAssessments: members.reduce((s, m) => s + m.overdueAssessments, 0),
        flagCounts,
        members,
      };
    });
  }, [batches, overview, metrics, batchName]);

  // Default the cohort comparison to the first two batches once data is in.
  React.useEffect(() => {
    if (!compareBatch1 && batchStats[0]) setCompareBatch1(batchStats[0].batchId);
    if (!compareBatch2 && batchStats[1]) setCompareBatch2(batchStats[1].batchId);
  }, [batchStats, compareBatch1, compareBatch2]);

  const topPerformers = React.useMemo(
    () => metrics.filter(m => m.status === 'excelling').sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)),
    [metrics]
  );
  const atRiskStudents = React.useMemo(
    () => metrics.filter(m => m.status === 'at risk').sort((a, b) => b.riskFlags.length - a.riskFlags.length || (a.avgScore ?? 101) - (b.avgScore ?? 101)),
    [metrics]
  );

  // Batch with the most at-risk students: the target for the cohort intervention plan.
  const interventionBatch = React.useMemo(
    () => [...batchStats].filter(b => b.atRisk > 0).sort((a, b) => b.atRisk - a.atRisk)[0] || null,
    [batchStats]
  );
  const bestBatch = React.useMemo(
    () => [...batchStats].filter(b => b.avgScore !== null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))[0] || null,
    [batchStats]
  );

  const describeFlags = (counts: Record<RiskFlag, number>) =>
    (Object.keys(counts) as RiskFlag[])
      .filter(f => counts[f] > 0)
      .map(f => `${counts[f]} with ${FLAG_LABELS[f].toLowerCase()}`)
      .join(', ');

  const openPlan = async (params: { batchName: string; issue: string; studentCount: number }) => {
    setIsGeneratingPlan(true);
    try {
      const plan = await generateInterventionPlan(params);
      setInterventionPlan(plan);
      setShowInterventionModal(true);
    } catch (error) {
      console.error("Failed to generate intervention plan:", error);
      toast.error('Could not generate intervention plan', error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleFetchIntervention = () => {
    if (!interventionBatch) return;
    openPlan({
      batchName: interventionBatch.name,
      issue: `${interventionBatch.atRisk} of ${interventionBatch.students} students at risk (${describeFlags(interventionBatch.flagCounts) || 'no flags recorded'}). Batch average score ${pct(interventionBatch.avgScore)}, ${pct(interventionBatch.activeRate)} active in the last ${overview?.windowDays ?? 30} days.`,
      studentCount: interventionBatch.atRisk,
    });
  };

  const selectStudent = (id: string) => {
    setViewMode('students');
    setSelectedStudentId(id);
  };

  const selectedMetrics = selectedStudentId
    ? studentAnalytics?.summary || metrics.find(m => m.id === selectedStudentId) || null
    : null;

  const filteredMetrics = metrics.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (s.name || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q);
    const matchesBatch = batchFilter === 'All Batches' || s.batchId === batchFilter;
    return matchesSearch && matchesBatch;
  });

  const totals = overview?.totals;
  const risk = overview?.risk;
  const loadingValue = isLoading ? '…' : '—';

  const riskRows = risk ? [
    { name: 'Low scores (avg < 50%)', value: risk.lowScores, color: 'bg-red-600' },
    { name: 'Inactive 14+ days', value: risk.inactive, color: 'bg-amber-600' },
    { name: 'Overdue assessments', value: risk.overdue, color: 'bg-teal-600' },
    { name: 'Not started', value: risk.notStarted, color: 'bg-slate-400' },
  ] : [];

  const cohort1 = batchStats.find(b => b.batchId === compareBatch1) || null;
  const cohort2 = batchStats.find(b => b.batchId === compareBatch2) || null;
  const cohortMetrics: Array<{ metric: string; key: keyof BatchStats; higherIsBetter: boolean }> = [
    { metric: 'Avg Score', key: 'avgScore', higherIsBetter: true },
    { metric: 'Active (30d)', key: 'activeRate', higherIsBetter: true },
    { metric: 'Lesson Completion', key: 'lessonCompletion', higherIsBetter: true },
    { metric: 'At Risk', key: 'atRiskRate', higherIsBetter: false },
  ];
  const cohortChart = cohort1 && cohort2 ? cohortMetrics.map(m => ({
    metric: m.metric,
    batch1: cohort1[m.key] as number | null,
    batch2: cohort2[m.key] as number | null,
  })) : [];
  const cohortGap = (() => {
    if (!cohort1 || !cohort2 || cohort1.batchId === cohort2.batchId) return null;
    const gaps = cohortMetrics
      .map(m => {
        const a = cohort1[m.key] as number | null;
        const b = cohort2[m.key] as number | null;
        if (a === null || b === null) return null;
        return { ...m, a, b, diff: Math.abs(a - b) };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null && g.diff > 0)
      .sort((x, y) => y.diff - x.diff);
    return gaps[0] || null;
  })();

  const windowDays = overview?.windowDays ?? 30;
  const cardCls = 'bg-white border border-slate-200 rounded-xl p-6';
  const tooltipStyle = { borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none', fontSize: '13px' };
  const axisTick = { fill: '#475569', fontSize: 12 };
  const selectCls = 'h-10 px-3 bg-white border border-slate-300 rounded-md text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';
  const statRow = (label: React.ReactNode, value: React.ReactNode, valueCls = 'text-slate-900') => (
    <div className="flex justify-between items-center gap-3 py-2 border-t border-slate-100 first:border-t-0">
      <span className="text-sm text-slate-700">{label}</span>
      <span className={`text-sm font-bold ${valueCls}`}>{value}</span>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
          <p className="text-sm font-bold text-teal-700 uppercase">Research</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Research and advanced insights</h1>
          <p className="text-slate-600 mt-1">Computed from submitted assessments, completed lessons and AI tutor activity.</p>
        </div>
        {overview && (
          <span className="text-sm text-slate-600 flex items-center gap-1.5">
            <Clock size={14} />
            Updated {new Date(overview.generatedAt).toLocaleString()} · {overview.windowDays}-day window
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6" role="tablist">
        <button
          role="tab"
          aria-selected={viewMode === 'classes'}
          onClick={() => setViewMode('classes')}
          className={`-mb-px py-3 border-b-2 text-sm font-bold ${viewMode === 'classes' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Classes
        </button>
        <button
          role="tab"
          aria-selected={viewMode === 'students'}
          onClick={() => {
            setViewMode('students');
            setSelectedStudentId(null);
          }}
          className={`-mb-px py-3 border-b-2 text-sm font-bold ${viewMode === 'students' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          Students
        </button>
      </div>

      {overviewError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle size={16} />
          Analytics could not be loaded: {overviewError}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Students', value: totals ? num(totals.students) : loadingValue, note: totals ? `${totals.activeStudents7d} active in 7 days` : '' },
          { label: 'Avg score', value: totals ? pct(totals.avgScore) : loadingValue, note: totals ? `${num(totals.assessmentsSubmitted)} attempts` : '' },
          { label: 'Lesson completion', value: totals ? pct(totals.avgLessonCompletion) : loadingValue, note: totals ? `${num(totals.lessonsCompleted)} lessons` : '' },
          { label: 'At-risk students', value: risk ? num(risk.atRiskStudents) : loadingValue, note: risk ? `${risk.notStarted} not started` : '', warn: !!risk && risk.atRiskStudents > 0 },
          { label: `Tutor questions (${windowDays}d)`, value: totals ? num(totals.tutorQuestions30d) : loadingValue, note: totals ? `${num(totals.creditsUsed30d)} credits` : '' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl p-5 border ${kpi.warn ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-slate-200 text-slate-900'}`}>
            <p className={`text-sm ${kpi.warn ? '' : 'text-slate-600'}`}>{kpi.label}</p>
            <p className="text-3xl font-extrabold mt-1">{kpi.value}</p>
            {kpi.note && <p className={`text-xs mt-1 ${kpi.warn ? '' : 'text-slate-600'}`}>{kpi.note}</p>}
          </div>
        ))}
      </div>

      {/* Top performers / at risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className={`${cardCls} flex flex-col gap-4`}>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Top performers</h2>
            <p className="text-sm text-slate-600">Students averaging 85%+ on submitted assessments and not flagged at risk.</p>
          </div>
          <div className="space-y-2">
            {isLoading && <p className="text-sm text-slate-600">Loading...</p>}
            {!isLoading && topPerformers.length === 0 && (
              <p className="text-sm text-slate-600">No students averaging 85% or more yet.</p>
            )}
            {topPerformers.slice(0, 5).map((student, i) => (
              <button
                key={student.id}
                onClick={() => selectStudent(student.id)}
                className="w-full text-left flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-green-50 text-green-800 flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{student.name}</p>
                    <p className="text-sm text-slate-600">{batchName(student.batchId)} · {student.attemptsSubmitted} attempts</p>
                  </div>
                </div>
                <span className="font-bold text-green-700 shrink-0">{pct(student.avgScore)}</span>
              </button>
            ))}
            {topPerformers.length > 5 && (
              <p className="text-sm text-slate-600">+{topPerformers.length - 5} more excelling students</p>
            )}
          </div>
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-900">
            <p className="font-bold flex items-center gap-1.5"><Sparkles size={16} />How to stretch top performers</p>
            <ul className="mt-2 space-y-1.5 text-sm list-disc pl-5">
              <li><strong>Stretch problems:</strong> Introduce non-linear problem sets that go beyond standard curriculum boundaries.</li>
              <li><strong>Open inquiry:</strong> Shift towards open-ended research tasks to build independent learning habits.</li>
              <li><strong>Peer mentoring:</strong> Pair them with classmates in collaborative units to reinforce their own understanding.</li>
            </ul>
          </div>
        </section>

        <section className={`${cardCls} flex flex-col gap-4`}>
          <div>
            <h2 className="text-lg font-bold text-slate-900">At-risk students</h2>
            <p className="text-sm text-slate-600">Average under 50%, no activity for 14 days, or 2+ overdue assessments.</p>
          </div>
          <div className="space-y-2">
            {isLoading && <p className="text-sm text-slate-600">Loading...</p>}
            {!isLoading && atRiskStudents.length === 0 && (
              <p className="text-sm text-slate-600">No students are currently flagged as at risk.</p>
            )}
            {atRiskStudents.slice(0, 5).map((student) => (
              <button
                key={student.id}
                onClick={() => selectStudent(student.id)}
                className="w-full text-left flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-red-50 text-red-700 flex items-center justify-center text-xs font-bold shrink-0">{avatarFor(student)}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{student.name}</p>
                    <p className="text-sm text-red-700">
                      {student.riskFlags.map(f => f === 'overdue' ? `${student.overdueAssessments} overdue` : FLAG_LABELS[f]).join(' · ') || 'At risk'}
                      <span className="text-slate-600"> · Last active: {formatLastActive(student.lastActiveAt)}</span>
                    </p>
                  </div>
                </div>
                <span className="font-bold text-red-700 shrink-0">{pct(student.avgScore)}</span>
              </button>
            ))}
            {atRiskStudents.length > 5 && (
              <p className="text-sm text-slate-600">+{atRiskStudents.length - 5} more at-risk students</p>
            )}
          </div>
          <div className="p-4 rounded-lg bg-orange-50 border border-orange-200 text-orange-900">
            <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={16} />Recovery paths</p>
            <ul className="mt-2 space-y-1.5 text-sm list-disc pl-5">
              <li><strong>Low scores:</strong> Break work into smaller steps with frequent feedback to rebuild confidence.</li>
              <li><strong>Inactive:</strong> Reach out directly and set a short, specific goal to re-engage with lessons or the AI tutor.</li>
              <li><strong>Overdue work:</strong> Agree a catch-up plan and consider moving the student into a higher-support group.</li>
            </ul>
          </div>
        </section>
      </div>

      {viewMode === 'classes' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className={`lg:col-span-2 ${cardCls}`}>
              <h2 className="text-lg font-bold text-slate-900">Batch performance</h2>
              <p className="text-sm text-slate-600 mb-4">Average score and share of students active in the last {windowDays} days.</p>
              <div className="h-72">
                {batchStats.filter(b => b.students > 0).length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-600">
                    {isLoading ? 'Loading...' : 'No batch activity recorded yet.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={batchStats.filter(b => b.students > 0).map(b => ({
                      name: b.name,
                      score: b.avgScore,
                      engagement: b.activeRate,
                    }))}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} domain={[0, 100]} />
                      <Tooltip
                        cursor={{ fill: '#f5f7fa' }}
                        contentStyle={tooltipStyle}
                        formatter={(value: any, name: any) => [value === null || value === undefined ? '—' : `${value}%`, name]}
                      />
                      <Bar dataKey="score" fill="#0056D2" radius={[4, 4, 0, 0]} name="Avg Score" />
                      <Bar dataKey="engagement" fill="#bcd3f7" radius={[4, 4, 0, 0]} name={`Active (${windowDays}d)`} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className={`${cardCls} flex flex-col gap-3`}>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Lightbulb size={18} className="text-teal-700" />
                Cohort insights
              </h2>
              {!bestBatch && !interventionBatch && (
                <p className="text-sm text-slate-600">
                  {isLoading ? 'Loading...' : 'Not enough recorded activity to compare batches yet.'}
                </p>
              )}
              {bestBatch && (
                <div className="p-3.5 rounded-lg bg-green-50 border border-green-200 text-green-900">
                  <p className="font-bold">{bestBatch.name}: highest average</p>
                  <p className="text-sm mt-1">
                    Averages {pct(bestBatch.avgScore)} across {bestBatch.assessmentsSubmitted} submitted assessments, with {pct(bestBatch.activeRate)} of its {bestBatch.students} students active in the last {windowDays} days.
                  </p>
                </div>
              )}
              {interventionBatch && (
                <div className="p-3.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-900">
                  <p className="font-bold">{interventionBatch.name}: needs intervention</p>
                  <p className="text-sm mt-1">
                    {interventionBatch.atRisk} of {interventionBatch.students} students are at risk{describeFlags(interventionBatch.flagCounts) ? ` (${describeFlags(interventionBatch.flagCounts)})` : ''}.
                  </p>
                </div>
              )}
              {interventionBatch && (
                <button
                  onClick={handleFetchIntervention}
                  disabled={isGeneratingPlan}
                  className="self-start h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingPlan ? <Activity size={16} className="animate-spin" /> : <Compass size={16} />}
                  {isGeneratingPlan ? 'Strategizing...' : 'View intervention plan'}
                </button>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className={`lg:col-span-2 ${cardCls}`}>
              <h2 className="text-lg font-bold text-slate-900">Subject performance</h2>
              <p className="text-sm text-slate-600 mb-4">Average assessment score and share of correct answers per subject.</p>
              <div className="h-72">
                {!overview || overview.subjects.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-600">
                    {isLoading ? 'Loading...' : 'No submitted assessments yet.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.subjects.map(s => ({ subject: s.subject, score: s.avgScore, correct: s.correctRate, attempts: s.attempts }))}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} domain={[0, 100]} />
                      <Tooltip
                        cursor={{ fill: '#f5f7fa' }}
                        contentStyle={tooltipStyle}
                        formatter={(value: any, name: any) => [value === null || value === undefined ? '—' : `${value}%`, name]}
                        labelFormatter={(label: any) => {
                          const s = overview.subjects.find(x => x.subject === label);
                          return s ? `${label} • ${s.attempts} attempts • ${s.students} students` : label;
                        }}
                      />
                      <Bar dataKey="score" fill="#0056D2" radius={[4, 4, 0, 0]} name="Avg Score" />
                      <Bar dataKey="correct" fill="#bcd3f7" radius={[4, 4, 0, 0]} name="Correct Answers" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className={cardCls}>
              <h2 className="text-lg font-bold text-slate-900">Risk factors</h2>
              <p className="text-sm text-slate-600 mb-4">
                {risk ? `${risk.atRiskStudents} of ${totals?.students ?? 0} students at risk. A student can have several flags.` : isLoading ? 'Loading...' : 'No data.'}
              </p>
              <div className="space-y-4">
                {riskRows.map(row => {
                  const total = totals?.students || 0;
                  const share = total ? Math.round((row.value / total) * 100) : 0;
                  return (
                    <div key={row.name} className="space-y-1.5">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-slate-800">{row.name}</span>
                        <span><strong className="text-slate-900">{row.value}</strong> <span className="text-slate-600">({share}%)</span></span>
                      </div>
                      <div className="h-2 bg-[#eef1f6] rounded">
                        <div className={`h-2 rounded ${row.color}`} style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Batches */}
          <section className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {selectedBatch ? batchName(selectedBatch) : 'Batches'}
              </h2>
              {selectedBatch && (
                <button
                  onClick={() => setSelectedBatch(null)}
                  className="text-sm font-semibold text-teal-700 hover:underline flex items-center gap-1"
                >
                  <ChevronRight size={16} className="rotate-180" />
                  Back to all batches
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {!selectedBatch ? (
                <motion.div
                  key="matrix"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                >
                  {!isLoading && batchStats.length === 0 && (
                    <p className="text-sm text-slate-600 col-span-full">No batches yet.</p>
                  )}
                  {batchStats.map((stats) => {
                    const batch = batches.find(b => b.id === stats.batchId);
                    return (
                      <button
                        key={stats.batchId}
                        onClick={() => setSelectedBatch(stats.batchId)}
                        className="p-4 rounded-lg border border-slate-200 bg-white hover:border-teal-600 text-left"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-slate-900">{stats.name}</p>
                          {batch?.academicYear && (
                            <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-800 shrink-0">
                              {batch.academicYear}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mb-3">{stats.students} students{batch?.groupId ? ` · ${batch.groupId}` : ''}</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-700">Avg score</span>
                            <strong className="text-slate-900">{pct(stats.avgScore)}</strong>
                          </div>
                          <div className="h-2 bg-[#eef1f6] rounded">
                            <div className="h-2 bg-teal-600 rounded" style={{ width: `${stats.avgScore ?? 0}%` }} />
                          </div>
                          <div className="flex justify-between pt-1">
                            <span className="text-slate-700">Active ({windowDays}d)</span>
                            <strong className="text-slate-900">{pct(stats.activeRate)}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-700">At risk</span>
                            <strong className={stats.atRisk > 0 ? 'text-red-700' : 'text-slate-900'}>{stats.atRisk}</strong>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              ) : (() => {
                const stats = batchStats.find(b => b.batchId === selectedBatch);
                const ranked = (stats?.members || []).filter(m => m.avgScore !== null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
                return (
                  <motion.div
                    key="batch-details"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-5"
                  >
                    <div className="lg:col-span-2 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Students', value: stats?.students ?? 0 },
                          { label: 'Avg score', value: pct(stats?.avgScore) },
                          { label: `Active (${windowDays}d)`, value: pct(stats?.activeRate) },
                          { label: 'Lesson completion', value: pct(stats?.lessonCompletion) },
                        ].map(item => (
                          <div key={item.label} className="p-3 rounded-lg border border-slate-200">
                            <p className="text-sm text-slate-600">{item.label}</p>
                            <p className="text-2xl font-extrabold text-slate-900">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border border-slate-200">
                          <h3 className="font-bold text-slate-900 mb-1">Recorded activity</h3>
                          {statRow('Lessons completed', num(stats?.lessonsCompleted))}
                          {statRow('Assessments submitted', num(stats?.assessmentsSubmitted))}
                          {statRow(`Tutor questions (${windowDays}d)`, num(stats?.tutorQuestions30d))}
                        </div>
                        <div className="p-4 rounded-lg border border-slate-200">
                          <h3 className="font-bold text-slate-900 mb-1">Risk signals</h3>
                          {statRow('At-risk students', stats?.atRisk ?? 0, (stats?.atRisk ?? 0) > 0 ? 'text-red-700' : 'text-slate-900')}
                          {statRow('Overdue assessments', num(stats?.overdueAssessments))}
                          {statRow('Not started', stats?.notStarted ?? 0)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-bold text-slate-900">Top performers</h3>
                      {ranked.length === 0 && (
                        <p className="text-sm text-slate-600">No submitted assessments in this batch yet.</p>
                      )}
                      {ranked.slice(0, 3).map(student => (
                        <button
                          key={student.id}
                          onClick={() => selectStudent(student.id)}
                          className="w-full text-left flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-blue-50 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">
                              {avatarFor(student)}
                            </span>
                            <span className="text-sm font-bold text-slate-900 truncate">{student.name}</span>
                          </span>
                          <span className={`text-sm font-bold ${scoreColor(student.avgScore)}`}>{pct(student.avgScore)}</span>
                        </button>
                      ))}

                      {stats && stats.atRisk > 0 ? (
                        <div className="p-3.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-900">
                          <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={16} />Batch alert</p>
                          <p className="text-sm mt-1">
                            {stats.atRisk} student{stats.atRisk === 1 ? ' is' : 's are'} at risk in this batch{describeFlags(stats.flagCounts) ? ` (${describeFlags(stats.flagCounts)})` : ''}.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-lg bg-green-50 border border-green-200 text-green-900">
                          <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={16} />No alerts</p>
                          <p className="text-sm mt-1">No students in this batch are currently flagged as at risk.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!selectedStudentId || !selectedMetrics ? (
              <motion.section
                key="student-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="px-6 pt-6 pb-4 flex flex-wrap justify-between items-start gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Students</h2>
                    <p className="text-sm text-slate-600">Scores, status and recorded activity for every student.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input
                        type="text"
                        aria-label="Search students"
                        placeholder="Search students..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-3 h-10 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 w-full sm:w-64"
                      />
                    </div>
                    <select
                      aria-label="Filter by batch"
                      value={batchFilter}
                      onChange={(e) => setBatchFilter(e.target.value)}
                      className={selectCls}
                    >
                      <option>All Batches</option>
                      {batchStats.map(b => (
                        <option key={b.batchId} value={b.batchId}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[820px]">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-6 py-3 font-bold">Student</th>
                        <th className="px-6 py-3 font-bold">Batch / class</th>
                        <th className="px-6 py-3 font-bold">Avg score</th>
                        <th className="px-6 py-3 font-bold">Status</th>
                        <th className="px-6 py-3 font-bold">Activity</th>
                        <th className="px-6 py-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(isLoading || filteredMetrics.length === 0) && (
                        <tr className="border-t border-slate-100">
                          <td colSpan={6} className="px-6 py-10 text-center text-slate-600">
                            {isLoading ? 'Loading students...' : overviewError ? 'Analytics unavailable.' : metrics.length === 0 ? 'No students yet.' : 'No students match your filters.'}
                          </td>
                        </tr>
                      )}
                      {!isLoading && filteredMetrics.map((student) => {
                        const batch = batches.find(b => b.id === student.batchId);
                        return (
                          <tr key={student.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-50 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {avatarFor(student)}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{student.name}</p>
                                  <p className="text-xs text-slate-600">{student.email || student.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <p className="text-slate-800">{batchName(student.batchId)}</p>
                              <p className="text-xs text-slate-600">{batch?.academicYear || '—'}</p>
                            </td>
                            <td className="px-6 py-3">
                              <span className={`font-bold ${scoreColor(student.avgScore)}`}>{pct(student.avgScore)}</span>
                            </td>
                            <td className="px-6 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[student.status]}`}>
                                {student.status}
                              </span>
                              {student.riskFlags.length > 0 && (
                                <p className="text-xs text-red-700 mt-1.5">
                                  {student.riskFlags.map(f => FLAG_LABELS[f]).join(' · ')}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-3 text-slate-700">
                              <p>{student.lessonsCompleted}/{student.lessonsAvailable} lessons · {student.attemptsSubmitted} attempts</p>
                              <p className="text-xs text-slate-600">{student.tutorQuestions30d} tutor questions · Active: {formatLastActive(student.lastActiveAt)}</p>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <button
                                onClick={() => setSelectedStudentId(student.id)}
                                aria-label={`View analytics for ${student.name}`}
                                className="inline-flex items-center gap-1 text-teal-700 font-semibold hover:underline"
                              >
                                View
                                <ArrowUpRight size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            ) : (() => {
              const sa = studentAnalytics;
              const subject = sa?.subjects.find(s => s.subject === selectedSubject) || null;
              const weakTopics = (sa?.topics || []).filter(t => t.correctRate < 60).sort((a, b) => a.correctRate - b.correctRate);
              const weakSubjects = (sa?.subjects || []).filter(s => s.avgScore !== null && s.avgScore < 70).sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0));
              const scoreHistory = (sa?.scoreHistory || []).filter(h => h.score !== null).map((h, i) => ({
                idx: i + 1,
                label: h.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `#${i + 1}`,
                title: h.title,
                subject: h.subject,
                score: h.score,
              }));
              const activityTotal = (sa?.activity || []).reduce((s, d) => s + d.lessons + d.assessments + d.questions, 0);
              const focusItems = [
                ...selectedMetrics.riskFlags.map(f => f === 'overdue'
                  ? `${selectedMetrics.overdueAssessments} overdue assessment${selectedMetrics.overdueAssessments === 1 ? '' : 's'}`
                  : f === 'inactive' ? `No activity since ${formatLastActive(selectedMetrics.lastActiveAt).toLowerCase()}` : `Average score ${pct(selectedMetrics.avgScore)}`),
                ...weakSubjects.slice(0, 2).map(s => `${s.subject}: average ${pct(s.avgScore)} over ${s.attempts} attempts`),
                ...weakTopics.slice(0, 2).map(t => `${t.topic}: ${t.correctRate}% correct (${t.answers} answers)`),
              ];
              return (
              <motion.div
                key="student-intelligence"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedStudentId(null)}
                    className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back to students
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[selectedMetrics.status]}`}>
                    {selectedMetrics.status === 'at risk' ? 'Intervention required' : selectedMetrics.status}
                  </span>
                </div>

                {studentAnalyticsError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Detailed analytics could not be loaded: {studentAnalyticsError}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Left column */}
                  <div className="space-y-5">
                    <section className={cardCls}>
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-teal-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
                          {avatarFor(selectedMetrics)}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-extrabold text-slate-900">{selectedMetrics.name}</h2>
                          <p className="text-sm text-slate-600 truncate">{selectedMetrics.email || selectedMetrics.id}</p>
                          <p className="text-sm text-slate-700 mt-0.5">{batchName(selectedMetrics.batchId)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-5">
                        <div className="p-3 rounded-lg border border-slate-200">
                          <p className="text-sm text-slate-600">Avg score</p>
                          <p className={`text-2xl font-extrabold ${scoreColor(selectedMetrics.avgScore)}`}>{pct(selectedMetrics.avgScore)}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200">
                          <p className="text-sm text-slate-600">Lessons</p>
                          <p className="text-2xl font-extrabold text-slate-900">{pct(selectedMetrics.lessonCompletionRate)}</p>
                        </div>
                      </div>

                      <div className="pt-5 mt-5 border-t border-slate-100">
                        <h3 className="font-bold text-slate-900 mb-2">Subject detail</h3>
                        {studentAnalyticsLoading && <p className="text-sm text-slate-600">Loading...</p>}
                        {!studentAnalyticsLoading && sa && sa.subjects.length === 0 && (
                          <p className="text-sm text-slate-600">No submitted assessments yet.</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {(sa?.subjects || []).map((s) => (
                            <button
                              key={s.subject}
                              onClick={() => setSelectedSubject(s.subject)}
                              aria-pressed={selectedSubject === s.subject}
                              className={`px-3 h-9 rounded-full text-sm font-bold border ${
                                selectedSubject === s.subject
                                  ? 'bg-blue-50 border-teal-600 text-teal-700'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {s.subject}
                            </button>
                          ))}
                        </div>
                        {subject && (
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {[
                              { label: 'Score', value: pct(subject.avgScore) },
                              { label: 'Correct', value: pct(subject.correctRate) },
                              { label: 'Attempts', value: subject.attempts },
                            ].map(item => (
                              <div key={item.label} className="p-2.5 rounded-lg border border-slate-200 text-center">
                                <p className="text-xs text-slate-600">{item.label}</p>
                                <p className="text-lg font-extrabold text-slate-900">{item.value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    <section className={cardCls}>
                      <h3 className="text-lg font-bold text-slate-900 mb-2">Topic accuracy</h3>
                      <p className="text-sm text-slate-600 mb-3">All subjects</p>
                      {studentAnalyticsLoading ? (
                        <p className="text-sm text-slate-600">Loading...</p>
                      ) : !sa || sa.topics.length === 0 ? (
                        <p className="text-sm text-slate-600">No answered questions with topics yet.</p>
                      ) : (
                        <div>
                          {sa.topics.map((t, i) => (
                            <div key={t.topic} className={`flex justify-between gap-3 py-2 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                              <span className="text-sm text-slate-800">{t.topic}</span>
                              <span className="text-sm shrink-0">
                                <strong className={t.correctRate >= 70 ? 'text-green-700' : t.correctRate < 50 ? 'text-red-700' : 'text-slate-900'}>{t.correctRate}%</strong>
                                <span className="text-xs text-slate-600 ml-1.5">{t.answers} answers</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>

                  {/* Right column */}
                  <div className="lg:col-span-2 space-y-5">
                    <section className={cardCls}>
                      <h3 className="text-lg font-bold text-slate-900 mb-3">AI tutor usage</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          {statRow(`Questions (${windowDays}d)`, selectedMetrics.tutorQuestions30d)}
                          {statRow(`AI credits (${windowDays}d)`, num(selectedMetrics.creditsUsed30d))}
                          <p className="text-sm font-bold text-slate-900 mt-3 mb-1">Questions by course</p>
                          {studentAnalyticsLoading ? (
                            <p className="text-sm text-slate-600">Loading...</p>
                          ) : !sa || sa.tutorUsage.length === 0 ? (
                            <p className="text-sm text-slate-600">No questions asked yet.</p>
                          ) : (
                            <div>
                              {sa.tutorUsage.slice(0, 5).map(u => (
                                <div key={u.label}>{statRow(<span className="truncate">{u.label}</span>, u.questions)}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 mb-2">Struggling topics (under 60% correct)</p>
                          {studentAnalyticsLoading ? (
                            <p className="text-sm text-slate-600">Loading...</p>
                          ) : weakTopics.length === 0 ? (
                            <p className="text-sm text-slate-600">No struggling topics recorded.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {weakTopics.map(t => (
                                <span key={t.topic} className="rounded-full px-2.5 py-1 text-xs font-bold bg-red-50 text-red-700">
                                  {t.topic} · {t.correctRate}%
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className={cardCls}>
                      <h3 className="text-lg font-bold text-slate-900 mb-3">Assessments and activity</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>
                          {statRow('Assessments submitted', selectedMetrics.attemptsSubmitted)}
                          {statRow('Overdue assessments', selectedMetrics.overdueAssessments, selectedMetrics.overdueAssessments > 0 ? 'text-red-700' : 'text-slate-900')}
                          {statRow('Subjects assessed', sa ? sa.subjects.length : '—')}
                        </div>
                        <div>
                          {statRow('Lessons completed', `${selectedMetrics.lessonsCompleted} / ${selectedMetrics.lessonsAvailable}`)}
                          {statRow('Last active', formatLastActive(selectedMetrics.lastActiveAt))}
                          {statRow('Actions (last 14 days)', sa ? activityTotal : '—')}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                        <div>
                          <h4 className="font-bold text-slate-900 mb-2">Score history</h4>
                          <div className="h-48">
                            {studentAnalyticsLoading ? (
                              <p className="text-sm text-slate-600">Loading...</p>
                            ) : scoreHistory.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-sm text-slate-600 rounded-lg border border-dashed border-slate-300">No scored attempts yet.</div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={scoreHistory}>
                                  <CartesianGrid vertical={false} stroke="#eef1f6" />
                                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} />
                                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={axisTick} width={30} />
                                  <Tooltip
                                    contentStyle={tooltipStyle}
                                    formatter={(value: any) => [`${value}%`, 'Score']}
                                    labelFormatter={(_: any, payload: any) => {
                                      const p = payload?.[0]?.payload;
                                      return p ? `${p.title} (${p.subject}) • ${p.label}` : '';
                                    }}
                                  />
                                  <Line type="monotone" dataKey="score" stroke="#0056D2" strokeWidth={2} dot={{ r: 3, fill: '#0056D2', strokeWidth: 0 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-bold text-slate-900 mb-2">Daily activity (14 days)</h4>
                          <div className="h-48">
                            {studentAnalyticsLoading ? (
                              <p className="text-sm text-slate-600">Loading...</p>
                            ) : !sa || activityTotal === 0 ? (
                              <div className="h-full flex items-center justify-center text-sm text-slate-600 rounded-lg border border-dashed border-slate-300">No activity in the last 14 days.</div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sa.activity}>
                                  <CartesianGrid vertical={false} stroke="#eef1f6" />
                                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} />
                                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axisTick} width={26} />
                                  <Tooltip
                                    cursor={{ fill: '#f5f7fa' }}
                                    contentStyle={tooltipStyle}
                                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.date || ''}
                                  />
                                  <Bar dataKey="lessons" stackId="a" fill="#0b3d91" name="Lessons" />
                                  <Bar dataKey="assessments" stackId="a" fill="#0056D2" name="Assessments" />
                                  <Bar dataKey="questions" stackId="a" fill="#d97706" name="Tutor Questions" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className={cardCls}>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Lightbulb size={18} className="text-teal-700" />
                        Template support plan (not AI)
                      </h3>
                      <p className="text-sm text-slate-600 mt-1 mb-3">Focus areas from recorded activity</p>
                      {focusItems.length === 0 ? (
                        <p className="text-sm text-slate-600 mb-4">
                          {studentAnalyticsLoading ? 'Loading...' : 'No risk flags, weak subjects or weak topics recorded for this student.'}
                        </p>
                      ) : (
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                          {focusItems.map((item, i) => (
                            <li key={i} className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-900">
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        onClick={() => openPlan({
                          batchName: selectedMetrics.name,
                          issue: focusItems.length ? focusItems.join('; ') : `Status: ${selectedMetrics.status}, average score ${pct(selectedMetrics.avgScore)}`,
                          studentCount: 1,
                        })}
                        disabled={isGeneratingPlan}
                        className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center gap-2 disabled:opacity-50"
                      >
                        {isGeneratingPlan ? <Activity size={16} className="animate-spin" /> : <Compass size={16} />}
                        {isGeneratingPlan ? 'Strategizing...' : 'Generate support plan'}
                      </button>
                    </section>
                  </div>
                </div>
              </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Cohort comparison */}
          <section className={cardCls}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Cohort comparison</h2>
                <p className="text-sm text-slate-600">Batch-level comparison of scores, activity, lesson completion and risk.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Batch 1
                  <select value={compareBatch1} onChange={(e) => setCompareBatch1(e.target.value)} className={selectCls}>
                    {batchStats.map(b => (
                      <option key={b.batchId} value={b.batchId}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Batch 2
                  <select value={compareBatch2} onChange={(e) => setCompareBatch2(e.target.value)} className={selectCls}>
                    {batchStats.map(b => (
                      <option key={b.batchId} value={b.batchId}>{b.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {batchStats.length < 2 || !cohort1 || !cohort2 ? (
              <p className="text-sm text-slate-600">{isLoading ? 'Loading...' : 'At least two batches are needed for a comparison.'}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cohortChart}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="metric" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} domain={[0, 100]} />
                      <Tooltip
                        cursor={{ fill: '#f5f7fa' }}
                        contentStyle={tooltipStyle}
                        formatter={(value: any, name: any) => [value === null || value === undefined ? '—' : `${value}%`, name]}
                      />
                      <Bar dataKey="batch1" fill="#0056D2" radius={[4, 4, 0, 0]} name={cohort1.name} />
                      <Bar dataKey="batch2" fill="#bcd3f7" radius={[4, 4, 0, 0]} name={cohort2.name} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle size={16} />
                      {cohortGap ? 'Largest gap between batches' : 'Batch comparison'}
                    </p>
                    <p className="text-sm mt-1">
                      {cohort1.batchId === cohort2.batchId
                        ? 'Select two different batches to compare.'
                        : cohortGap
                          ? (() => {
                              const firstBetter = cohortGap.higherIsBetter ? cohortGap.a > cohortGap.b : cohortGap.a < cohortGap.b;
                              const ahead = firstBetter ? cohort1 : cohort2;
                              const behind = firstBetter ? cohort2 : cohort1;
                              return (
                                <>
                                  <strong>{cohortGap.metric}</strong>: {cohort1.name} {cohortGap.a}% vs {cohort2.name} {cohortGap.b}% — a {Math.round(cohortGap.diff * 10) / 10}-point gap in favour of {ahead.name}. {behind.name} is the batch to review first on this measure.
                                </>
                              );
                            })()
                          : 'No measurable difference between these batches yet (or not enough recorded activity).'}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3 font-bold">Metric</th>
                          <th className="py-2 pr-3 font-bold">{cohort1.name}</th>
                          <th className="py-2 font-bold">{cohort2.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Students', a: num(cohort1.students), b: num(cohort2.students) },
                          { label: `Tutor questions / student (${windowDays}d)`, a: cohort1.students ? (Math.round((cohort1.tutorQuestions30d / cohort1.students) * 10) / 10).toString() : '—', b: cohort2.students ? (Math.round((cohort2.tutorQuestions30d / cohort2.students) * 10) / 10).toString() : '—' },
                          { label: 'Assessments submitted', a: num(cohort1.assessmentsSubmitted), b: num(cohort2.assessmentsSubmitted) },
                          { label: 'Not started', a: num(cohort1.notStarted), b: num(cohort2.notStarted) },
                        ].map(row => (
                          <tr key={row.label} className="border-t border-slate-100">
                            <td className="py-2 pr-3 text-slate-700">{row.label}</td>
                            <td className="py-2 pr-3 font-bold text-slate-900">{row.a}</td>
                            <td className="py-2 font-bold text-slate-900">{row.b}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Intervention Plan Modal */}
      <AnimatePresence>
        {showInterventionModal && interventionPlan && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInterventionModal(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="intervention-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-teal-700 flex items-center gap-1.5">
                    <ShieldAlert size={14} />
                    Template intervention plan (not AI)
                  </p>
                  <h2 id="intervention-title" className="text-xl font-extrabold text-slate-900 mt-1">{interventionPlan.title}</h2>
                  <p className="text-sm text-slate-600 mt-1">{interventionPlan.objective}</p>
                </div>
                <button
                  onClick={() => setShowInterventionModal(false)}
                  aria-label="Close"
                  className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <section>
                  <h3 className="text-base font-bold text-slate-900 mb-2">Risk analysis</h3>
                  <p className="text-sm text-slate-700">{interventionPlan.riskAnalysis}</p>
                </section>

                <section>
                  <h3 className="text-base font-bold text-slate-900 mb-3">Remedial action steps</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(interventionPlan.remedialSteps || []).map((step: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-lg border border-slate-200">
                        <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-800">{step.targetGroup}</span>
                        <h4 className="font-bold text-slate-900 mt-2">{step.title}</h4>
                        <p className="text-sm text-slate-600 mt-1">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-base font-bold text-slate-900 mb-2">Long-term monitoring</h3>
                  <p className="text-sm text-slate-700">{interventionPlan.monitoringStrategy}</p>
                </section>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setShowInterventionModal(false)}
                  className="h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md font-bold hover:bg-slate-50"
                >
                  Close
                </button>
                <button className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold flex items-center gap-2">
                  <FileText size={18} />
                  Export plan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
