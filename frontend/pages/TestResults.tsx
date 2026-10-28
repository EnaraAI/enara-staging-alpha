
import React, { useState, useEffect } from 'react';
import { SampleBadge } from '../components/SampleBadge';
import { 
  CheckCircle2, 
  ChevronRight, 
  FileText, 
  Brain, 
  Clock, 
  Trophy,
  ArrowRight,
  X,
  Sparkles,
  MessageSquare,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { ExamResult, NextBestAction } from '../types';
import { generateStudyPlan } from '../services/geminiService';
import { fetchMyResults, fetchMyResult, fetchMyCourses, fetchMyRecommendations } from '../services/apiService';
import { toast } from '../services/toastService';

interface TestResultsProps {
  completedIds?: Set<string>;
  onAskTutor: (context: string) => void;
}

// GET /api/me/results item
interface ResultRecord extends ExamResult {
  id: string;
  subject?: string;
  timeSpentSec?: number;
}

interface TopicStat { topic: string; correct: number; total: number; score: number }

const SUBJECT_COLORS = ['#0056D2', '#8b5cf6', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#64748b'];

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const formatDate = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDuration = (sec?: number) => {
  if (typeof sec !== 'number' || !isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

const topicStats = (answers: ResultRecord['answers'], fallbackTopic: string): TopicStat[] => {
  const stats: Record<string, { correct: number; total: number }> = {};
  for (const a of answers || []) {
    // Hidden until the answer key is released (isCorrect is left out).
    if (typeof a.isCorrect !== 'boolean') continue;
    const topic = a.topic || fallbackTopic;
    if (!stats[topic]) stats[topic] = { correct: 0, total: 0 };
    stats[topic].total += 1;
    if (a.isCorrect) stats[topic].correct += 1;
  }
  return Object.entries(stats).map(([topic, s]) => ({
    topic,
    correct: s.correct,
    total: s.total,
    score: s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100),
  }));
};

// Strongest / weakest topic within one result, derived from its graded answers.
const strengthAndWeakness = (r: ResultRecord) => {
  const stats = topicStats(r.answers, r.subject || 'General').sort((a, b) => b.score - a.score);
  const strength = stats.find(s => s.correct > 0)?.topic || '—';
  const weakest = [...stats].reverse().find(s => s.correct < s.total);
  return { strength, weakness: weakest?.topic || 'None' };
};

const topicStatus = (score: number) =>
  score >= 90 ? 'Mastered' : score >= 80 ? 'Proficient' : score >= 70 ? 'Review Needed' : 'Struggling';

export const TestResults: React.FC<TestResultsProps> = ({ onAskTutor }) => {
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'analytics'>('list');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [studyPlan, setStudyPlan] = useState<any | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const [results, setResults] = useState<ResultRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myCourses, setMyCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [nextBestActions, setNextBestActions] = useState<NextBestAction[]>([]);

  const loadResults = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [list, courses, recs] = await Promise.all([
        fetchMyResults(),
        fetchMyCourses().catch(() => []),
        (fetchMyRecommendations() as Promise<{ nextBestActions?: NextBestAction[] }>).catch(() => ({ nextBestActions: [] as NextBestAction[] })),
      ]);
      setResults(Array.isArray(list) ? list : []);
      setMyCourses(Array.isArray(courses) ? courses : []);
      setNextBestActions(recs?.nextBestActions || []);
    } catch (err) {
      const message = errorMessage(err, 'Could not load your results.');
      setLoadError(message);
      toast.error('Results unavailable', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  const subjectThemes: Record<string, { bg: string, text: string, border: string, dot: string }> = {
    'Mathematics': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', dot: 'bg-emerald-500' },
    'Biology': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', dot: 'bg-purple-500' },
    'Chemistry': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', dot: 'bg-amber-500' },
    'Physics': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100', dot: 'bg-rose-500' },
    'General': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-100', dot: 'bg-slate-500' },
  };

  const handleGenerateStudyPlan = async () => {
    setIsGeneratingPlan(true);
    try {
      const plan = await generateStudyPlan(myCourses, { historicalData, topicBreakdown });
      setStudyPlan(plan);
      setShowPlanModal(true);
    } catch (error) {
      console.error("Failed to generate study plan:", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Historical performance by subject: one chart point per submitted result, oldest first.
  const chronological = [...results].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const historicalData = chronological.map(r => ({
    date: formatDate(r.date),
    [r.subject || 'General']: r.score,
  }));

  const subjects = [...new Set(chronological.map(r => r.subject || 'General'))].map((key, i) => ({
    key,
    color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
  }));

  // Topic breakdown across every graded answer.
  const topicBreakdown = topicStats(results.flatMap(r => (r.answers || []).map(a => ({ ...a, topic: a.topic || r.subject }))), 'General')
    .sort((a, b) => b.score - a.score)
    .map(t => {
      const status = topicStatus(t.score);
      return {
        topic: t.topic,
        score: t.score,
        status,
        explanation: `You answered ${t.correct} of ${t.total} question${t.total === 1 ? '' : 's'} on this topic correctly.`,
        recommendation: status === 'Mastered' || status === 'Proficient'
          ? 'Keep practising to maintain this level.'
          : `Review ${t.topic} with the AI Tutor before your next assessment.`,
      };
    });


  const displayResults = results.map(r => ({
    ...r,
    title: r.assessmentTitle,
    subject: r.subject || 'General',
    date: formatDate(r.date),
    timeSpent: formatDuration(r.timeSpentSec),
    ...strengthAndWeakness(r),
  }));

  const handleExplain = async (result: (typeof displayResults)[number]) => {
    setSelectedResult(result);
    setIsExplaining(true);
    try {
      const fresh = (await fetchMyResult(result.id)) as ResultRecord;
      setSelectedResult({
        ...result,
        ...fresh,
        title: fresh.assessmentTitle,
        subject: fresh.subject || 'General',
        date: formatDate(fresh.date),
        timeSpent: formatDuration(fresh.timeSpentSec),
        ...strengthAndWeakness(fresh),
      });
    } catch (err) {
      toast.error('Could not refresh result', errorMessage(err, 'Showing the saved copy instead.'));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Test Results</h2>
          <p className="text-slate-500 mt-1">Review your performance and get AI-powered insights.</p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-xl self-start">
          <button 
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            History
          </button>
          <button 
            onClick={() => setViewMode('analytics')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'analytics' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Analytics
          </button>
        </div>
      </div>

      {viewMode === 'analytics' ? (
        <div className="space-y-8">
          {/* Historical Performance Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Historical Performance</h3>
                <p className="text-sm text-slate-500">Track your progress across different subjects.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    <option value="All">All Subjects</option>
                    {subjects.map(s => (
                      <option key={s.key} value={s.key}>{s.key}</option>
                    ))}
                  </select>
                  <TrendingUp size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold' }} />
                  {subjects.filter(s => selectedSubject === 'All' || s.key === selectedSubject).map(subject => (
                    <Line 
                      key={subject.key}
                      type="monotone" 
                      dataKey={subject.key} 
                      stroke={subject.color} 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: subject.color, strokeWidth: 2, stroke: '#fff' }} 
                      activeDot={{ r: 6 }} 
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Topic Breakdown */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-slate-900">Topic-Level Breakdown</h3>
                <BarChart3 size={20} className="text-teal-600" />
              </div>
              <div className="space-y-8 flex-1">
                {topicBreakdown.length === 0 && (
                  <p className="text-xs text-slate-400">No graded answers yet.</p>
                )}
                {topicBreakdown.map((item, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-700">{item.topic}</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${
                        item.status === 'Mastered' ? 'text-emerald-600' : 
                        item.status === 'Proficient' ? 'text-blue-600' : 
                        item.status === 'Review Needed' ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {item.status} ({item.score}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.score}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className={`h-full ${
                          item.score >= 90 ? 'bg-emerald-500' : 
                          item.score >= 80 ? 'bg-blue-500' : 
                          item.score >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                        }`} 
                      />
                    </div>
                    {/* AI Explanation sub-card */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-2 hidden group-hover:block animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-start gap-2 mb-2">
                        <Sparkles size={12} className="text-teal-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-slate-600 leading-relaxed font-medium italic">
                          {item.explanation}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-200/50 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                        <p className="text-[9px] font-bold text-teal-700 uppercase tracking-wider">Plan: {item.recommendation}</p>
                      </div>
                    </div>
                    {/* Compact version for non-hover */}
                    <p className="text-[10px] text-slate-400 line-clamp-1 group-hover:hidden transition-all">
                      {item.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Recommendations */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Brain size={140} />
              </div>
              <div className="relative z-10 flex-1">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles size={20} className="text-teal-400" />
                    Recommendations
                  </h3>
                  {nextBestActions.length > 0 && <SampleBadge dark />}
                </div>

                <div className="space-y-6">
                  {nextBestActions.length === 0 && (
                    <p className="text-xs text-white/60 italic">No recommendations yet. They will appear here as your teachers and the Enara engine review your progress.</p>
                  )}
                  {nextBestActions.slice(0, 3).map((action) => {
                    const tone = action.priority === 'High'
                      ? { border: 'border-rose-500/30', dot: 'bg-rose-500 shadow-rose-500/20', title: 'text-rose-400 group-hover:text-rose-300', badge: 'bg-rose-500/20 text-rose-400' }
                      : action.priority === 'Medium'
                        ? { border: 'border-blue-500/30', dot: 'bg-blue-500 shadow-blue-500/20', title: 'text-blue-400 group-hover:text-blue-300', badge: 'bg-blue-500/20 text-blue-400' }
                        : { border: 'border-emerald-500/30', dot: 'bg-emerald-500 shadow-emerald-500/20', title: 'text-emerald-400 group-hover:text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-400' };
                    return (
                      <div key={action.id} className={`relative pl-6 border-l-2 ${tone.border}`}>
                        <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full flex items-center justify-center shadow-lg ${tone.dot}`}>
                          <Sparkles size={10} className="text-white" />
                        </div>
                        <div className="p-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md hover:bg-white/10 transition-all cursor-default group">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className={`font-bold text-sm transition-colors ${tone.title}`}>{action.title}</h4>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${tone.badge}`}>{action.priority} Impact</span>
                          </div>
                          <p className="text-xs text-white/60 leading-relaxed italic">
                            {action.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 pt-6 border-t border-white/10">
                  <button 
                    onClick={handleGenerateStudyPlan}
                    disabled={isGeneratingPlan}
                    className="w-full py-4 bg-teal-500 text-white rounded-2xl font-bold text-sm hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingPlan ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating Plan...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Generate Personalized Study Plan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {isLoading && (
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 text-center text-sm text-slate-500">
              Loading your results...
            </div>
          )}
          {!isLoading && loadError && (
            <div className="bg-rose-50 rounded-[2rem] p-8 border border-rose-100 text-center">
              <p className="text-sm font-bold text-rose-800">We couldn't load your results.</p>
              <p className="text-xs text-rose-600 mt-1">{loadError}</p>
              <button onClick={loadResults} className="mt-4 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">
                Try again
              </button>
            </div>
          )}
          {!isLoading && !loadError && displayResults.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 text-center">
              <FileText size={28} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No results yet.</p>
              <p className="text-xs text-slate-400 mt-1">Complete an assessment and your results will appear here.</p>
            </div>
          )}
          {displayResults.map((result, idx) => (
            <motion.div 
              key={result.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                    result.score >= 90 ? 'bg-emerald-50 text-emerald-600' : 
                    result.score >= 80 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    <span className="text-xl sm:text-2xl font-black">{result.score}%</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-md">
                        {result.subject}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <Clock size={12} /> {result.date}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                      {result.title}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-xs text-slate-500 font-medium">Strength: {result.strength}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span className="text-xs text-slate-500 font-medium">Focus Area: {result.weakness}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleExplain(result)}
                    className="flex-1 sm:flex-none px-6 py-3 bg-teal-50 text-teal-700 rounded-xl font-bold text-sm hover:bg-teal-100 transition-all flex items-center justify-center gap-2 border border-teal-100"
                  >
                    <Sparkles size={18} />
                    Explanation
                  </button>
                  <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Explanation Modal */}
      <AnimatePresence>
        {isExplaining && selectedResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExplaining(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-900/20">
                    <Brain size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">AI Performance Insights</h2>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">{selectedResult.title}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsExplaining(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar">
                {/* Summary Section */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Score</p>
                    <p className="text-2xl font-black text-emerald-900">{selectedResult.score}%</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Time Spent</p>
                    <p className="text-2xl font-black text-blue-900">{selectedResult.timeSpent}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-1">Mastery</p>
                    <p className="text-2xl font-black text-purple-900">
                      {selectedResult.score >= 85 ? 'High' : selectedResult.score >= 70 ? 'Medium' : 'Low'}
                    </p>
                  </div>
                </div>

                {/* Detailed Explanation */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-slate-900">
                    <MessageSquare size={20} className="text-teal-600" />
                    <h3 className="font-bold">AI Feedback & Explanations</h3>
                  </div>

                  <div className="space-y-4">
                    {selectedResult.strength !== '—' && (
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 relative">
                      <div className="absolute -left-2 top-6 w-4 h-4 bg-slate-50 border-l border-t border-slate-100 rotate-[-45deg]" />
                      <p className="text-sm text-slate-700 leading-relaxed">
                        Excellent work on the <span className="font-bold text-teal-700">{selectedResult.strength}</span> section. You demonstrated a deep understanding of the core concepts, particularly in how you approached the multi-step problems.
                      </p>
                    </div>
                    )}

                    {selectedResult.weakness !== 'None' && (
                    <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100 relative">
                      <div className="absolute -left-2 top-6 w-4 h-4 bg-amber-50 border-l border-t border-amber-100 rotate-[-45deg]" />
                      <p className="text-sm text-amber-900 leading-relaxed">
                        Your weakest topic in this attempt was <span className="font-bold text-amber-700">{selectedResult.weakness}</span>. Review it with the AI Tutor.
                      </p>
                    </div>
                    )}
                  </div>
                </div>

                {/* Question Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">Key Question Explanations</h4>
                  <div className="space-y-3">
                    {(selectedResult as any).answersRevealed === false && (
                      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        Correct answers and explanations are shown when the assessment closes or once you have used all your attempts.
                      </p>
                    )}
                    {(selectedResult as any).answersRevealed !== false && (selectedResult.answers || []).length === 0 && (
                      <p className="text-xs text-slate-400">No question details were recorded for this attempt.</p>
                    )}
                    {(selectedResult as any).answersRevealed !== false && (selectedResult.answers || []).map((a: ResultRecord['answers'][number]) => ({
                      q: a.questionText,
                      status: a.isCorrect ? 'correct' : 'incorrect',
                      explanation: a.explanation || (a.isCorrect ? 'Correct.' : `Correct answer: ${a.correctAnswer}`),
                    })).map((item: { q: string; status: string; explanation: string }, i: number) => (
                      <div key={i} className="p-4 rounded-xl border border-slate-100 bg-white">
                        <div className="flex items-start gap-3 mb-2">
                          <div className={`mt-1 shrink-0 ${item.status === 'correct' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            <CheckCircle2 size={16} />
                          </div>
                          <p className="text-sm font-bold text-slate-800">{item.q}</p>
                        </div>
                        <p className="text-xs text-slate-500 ml-7 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <span className="font-bold text-teal-600 block mb-1">Explanation:</span>
                          {item.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4">
                <button 
                  onClick={() => setIsExplaining(false)}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  Got it, thanks!
                </button>
                <button 
                  onClick={() => {
                    const ctx = `I have some questions about my performance in "${selectedResult.title}". I scored ${selectedResult.score}%. My strengths were ${selectedResult.strength} but I need help with ${selectedResult.weakness}. Can you help me understand how to improve?`;
                    onAskTutor(ctx);
                    setIsExplaining(false);
                  }}
                  className="flex-1 py-4 bg-white text-teal-700 border border-teal-200 rounded-2xl font-bold hover:bg-teal-50 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} />
                  Ask AI Tutor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Study Plan Modal */}
      <AnimatePresence>
        {showPlanModal && studyPlan && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPlanModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-teal-50/30">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-3xl bg-teal-600 text-white flex items-center justify-center shadow-xl shadow-teal-900/20">
                    <Calendar size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{studyPlan.title}</h2>
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-teal-600" />
                      <p className="text-sm font-bold text-teal-700 tracking-tight">{studyPlan.objective}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div id="study-plan-report" className="flex-1 overflow-y-auto p-10 no-scrollbar bg-white">
                <div className="max-w-3xl mx-auto space-y-20">
                  <div className="border-b-4 border-slate-900 pb-8">
                    <h1 className="text-4xl font-black text-slate-900 mb-4">Official Study Roadmap</h1>
                    <p className="text-lg text-slate-600 font-medium">{studyPlan.objective}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {myCourses.map(course => (
                        <span key={course.id} className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded-lg border border-slate-200">
                          {course.title}
                        </span>
                      ))}
                    </div>
                  </div>

                  {studyPlan.weeklySchedule.map((week: any, wIdx: number) => (
                    <motion.div 
                      key={wIdx}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: wIdx * 0.2 }}
                      className="space-y-10"
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-[2rem] bg-slate-900 text-white flex flex-col items-center justify-center shrink-0 shadow-2xl shadow-slate-900/20">
                          <span className="text-[10px] font-black uppercase opacity-60">Week</span>
                          <span className="text-3xl font-black">{week.week}</span>
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-slate-900 mb-1">{week.focus}</h3>
                          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Primary Objective • Phase {wIdx + 1}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 pl-6 border-l-4 border-slate-100">
                        {week.tasks.map((task: any, tIdx: number) => {
                          const theme = subjectThemes[task.subject as keyof typeof subjectThemes] || subjectThemes.General;
                          return (
                            <motion.div 
                              key={tIdx}
                              className="relative"
                            >
                              <div className="absolute -left-[30px] top-6 w-2 h-2 rounded-full bg-slate-300" />
                              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200/60 hover:bg-white hover:shadow-xl hover:border-teal-100 transition-all group">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                  <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 ${theme.bg} ${theme.text} text-[10px] font-black uppercase tracking-widest rounded-xl border ${theme.border}`}>
                                      {task.day}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{task.subject}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] bg-white px-3 py-1 rounded-full border border-slate-100">
                                    <Clock size={12} className="text-teal-500" />
                                    {task.estimatedTime} Allocated
                                  </div>
                                </div>
                                <h4 className="text-lg font-black text-slate-900 mb-3 group-hover:text-teal-600 transition-colors">
                                  {task.topic}
                                </h4>
                                <p className="text-slate-600 leading-relaxed font-semibold text-sm">
                                  {task.description}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ))}

                  {/* Strategic Insights */}
                  <div className="bg-slate-50 rounded-[3rem] p-12 border-2 border-slate-900 relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xl shadow-slate-900/20">
                          <Sparkles size={28} />
                        </div>
                        <div>
                          <h3 className="text-3xl font-black text-slate-900">Enara Smart Tips</h3>
                          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Cognitive Mastery Framework</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {studyPlan.tips.map((tip: string, i: number) => (
                          <div key={i} className="flex items-start gap-5 p-6 bg-white rounded-[2rem] border border-slate-200 group hover:border-slate-900 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center shrink-0 font-black text-xs border border-slate-200">
                              {i + 1}
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-bold">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-20 pb-10 text-center border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-4">Template study plan built from your quiz topics, not written by AI</p>
                    <div className="w-12 h-1 bg-slate-100 mx-auto rounded-full" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
