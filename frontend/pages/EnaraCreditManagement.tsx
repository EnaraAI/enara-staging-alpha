import React, { useState, useMemo, useEffect } from 'react';
import { fetchCreditsReport, CreditsReport } from '../services/apiService';
import { toast } from '../services/toastService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  ArrowUpRight, 
  History,
  AlertTriangle as ShieldAlert,
  CheckCircle2,
  Clock,
  X,
  TrendingUp,
  Building2,
  BarChart3,
  Info,
  ShieldCheck,
  Lock,
  Unlock,
  Settings2,
  Sparkles,
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
  AreaChart,
  Area
} from 'recharts';

const CRITICAL_REMAINING_RATIO = 0.1;
const WARNING_USED_RATIO = 0.8;
const NOT_AVAILABLE = 'Changing institution credit allocations needs a backend endpoint that does not exist yet. Nothing was changed.';

const StatCard = ({ label, value, trend, tooltip, warn }: any) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative rounded-xl border p-5 ${warn ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-1.5">
        <p className={`text-sm ${warn ? 'text-orange-800' : 'text-slate-600'}`}>{label}</p>
        <Info size={13} className={warn ? 'text-orange-700' : 'text-slate-500'} aria-label={tooltip} />
      </div>
      <p className={`mt-1 text-3xl font-extrabold ${warn ? 'text-orange-800' : 'text-slate-900'}`}>{value}</p>
      <p className={`mt-1 text-sm ${warn ? 'text-orange-800' : 'text-slate-600'}`}>{trend}</p>

      {isHovered && (
        <div className="absolute bottom-full left-5 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-md w-60 z-30 leading-relaxed">
          {tooltip}
        </div>
      )}
    </div>
  );
};

export const EnaraCreditManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Critical' | 'Warning' | 'Healthy'>('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [newMonthlyLimit, setNewMonthlyLimit] = useState('');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const generateAIReport = async (partner: any) => {
    setIsGeneratingReport(true);
    setSelectedPartner(partner);
    try {
      const prompt = `
        Analyze the AI credit consumption for the following institution and provide a professional, concise executive report.
        
        Institution: ${partner.name}
        Total Credits Allocated: ${partner.total}
        Credits Used: ${partner.used}
        Remaining Credits: ${partner.remaining}
        Monthly Limit: ${partner.monthlyLimit}
        Status: ${partner.status}
        Students: ${partner.studentCount}
        Is Blocked: ${partner.isBlocked ? 'Yes' : 'No'}
        
        Include:
        1. A summary of current usage logic.
        2. A view on how close they are to running out of credits.
        3. Recommendation for top-up or limit adjustment.
        
        Format as Markdown.
      `;

      let textResult = `### Enara Credit Analytics Report: ${partner.name}\n\n` +
        `**Status:** ${partner.status} | **Students:** ${partner.studentCount}\n\n` +
        `#### 1. Allocation & Usage Summary\n` +
        `- **Total Allocated:** ${partner.total.toLocaleString()} credits\n` +
        `- **Used to Date:** ${partner.used.toLocaleString()} credits (${partner.total > 0 ? Math.round((partner.used / partner.total) * 100) : 0}% consumed)\n` +
        `- **Remaining Balance:** ${partner.remaining.toLocaleString()} credits\n` +
        `- **Monthly Limit:** ${partner.monthlyLimit.toLocaleString()} credits\n\n` +
        `#### 2. Risk\n` +
        `${partner.status === 'Critical' ? 'Less than 10% of the allocation remains.' : partner.status === 'Warning' ? 'More than 80% of the allocation is used.' : 'Usage is within the allocation.'}\n\n` +
        `#### 3. Strategic Recommendations\n` +
        `${partner.remaining < 50000 ? '- **Urgent Action:** Recommend initiating a top-up of at least 250,000 credits to prevent service disruption.' : '- **Stable Balance:** Current allocation is sufficient for current consumption levels.'}\n` +
        `- Review monthly consumption limits prior to next billing cycle.`;

      try {
        const res = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.text) textResult = data.text;
        }
      } catch (e) {
        // Fallback report
      }

      setAiReport(textResult);
    } catch (error) {
      console.error("AI Report Error:", error);
      setAiReport("Failed to generate AI report. Please check API configuration.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const [report, setReport] = useState<CreditsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadReport = () => {
    setIsLoading(true);
    setLoadError(null);
    fetchCreditsReport()
      .then(setReport)
      .catch((err: any) => {
        setLoadError(err.message || 'Could not load credit usage.');
        toast.error('Could not load credit usage', err.message);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(loadReport, []);

  // One row per institution, summed from its students' credit balances.
  const partners = useMemo(() => {
    const groups = new Map<string, CreditsReport['students']>();
    for (const student of report?.students || []) {
      const key = student.institutionId || 'Unassigned';
      groups.set(key, [...(groups.get(key) || []), student]);
    }
    return [...groups.entries()].map(([institutionId, students]) => {
      const total = students.reduce((sum, st) => sum + st.limit, 0);
      const used = students.reduce((sum, st) => sum + st.usage, 0);
      const remaining = Math.max(0, total - used);
      const status = total > 0 && remaining < total * CRITICAL_REMAINING_RATIO
        ? 'Critical'
        : total > 0 && used >= total * WARNING_USED_RATIO ? 'Warning' : 'Healthy';
      return {
        id: institutionId,
        name: institutionId,
        total,
        used,
        remaining,
        status,
        studentCount: students.length,
        monthlyLimit: total,
        isBlocked: students.length > 0 && students.every(st => st.status === 'blocked'),
      };
    });
  }, [report]);

  const totalAllocated = partners.reduce((sum, p) => sum + p.total, 0);
  const criticalCount = partners.filter(p => p.status === 'Critical').length;
  const avgUtilization = partners.length
    ? Math.round(partners.reduce((sum, p) => sum + (p.total > 0 ? p.used / p.total : 0), 0) / partners.length * 100)
    : 0;
  const consumptionHistory = (report?.usageByDay || []).map(d => ({ month: d.date.slice(5), usage: d.credits }));

  const filteredData = useMemo(() => {
    let data = partners.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterStatus === 'All' || p.status === filterStatus;
      return matchesSearch && matchesFilter;
    });

    if (sortConfig) {
      data.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [partners, searchQuery, filterStatus, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('All');
    setSortConfig(null);
  };

  const handleTopUp = (partner: any) => {
    setSelectedPartner(partner);
    setShowTopUpModal(true);
  };

  const handleManageLimit = (partner: any) => {
    setSelectedPartner(partner);
    setNewMonthlyLimit(partner.monthlyLimit.toString());
    setShowLimitModal(true);
  };

  const handleToggleBlock = (partner: any) => {
    const action = partner.isBlocked ? 'unblock' : 'block';
    if (confirm(`Are you sure you want to ${action} access for ${partner.name}?`)) {
      toast.info('Not available yet', NOT_AVAILABLE);
    }
  };

  const confirmTopUp = () => {
    setShowConfirmDialog(true);
  };

  const handleFinalConfirm = () => {
    toast.info('Not available yet', NOT_AVAILABLE);
    setShowConfirmDialog(false);
    setShowTopUpModal(false);
    setTopUpAmount('');
  };

  const saveMonthlyLimit = () => {
    toast.info('Not available yet', NOT_AVAILABLE);
    setShowLimitModal(false);
  };

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-600 text-sm font-semibold">Loading credit usage…</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-slate-900 font-bold">Could not load credit usage.</p>
        <p className="text-sm text-slate-600">{loadError}</p>
        <button onClick={loadReport} className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold">Try again</button>
      </div>
    );
  }

  const sortMark = (key: string) => sortConfig?.key === key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : '';
  const btnPrimary = 'inline-flex items-center justify-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-md text-sm font-semibold';
  const inputCls = 'w-full h-10 px-3 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';

  return (
    <div className="min-h-full bg-[#f5f7fa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara executive</p>
            <h1 className="text-3xl font-extrabold text-slate-900">AI credits</h1>
            <p className="text-slate-600 mt-1">Credit allocations and usage across partner institutions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnSecondary}>
              <Download size={16} />
              Export report
            </button>
            <button className={btnPrimary}>
              <Plus size={16} />
              Bulk allocation
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total allocated"
            value={totalAllocated.toLocaleString()}
            trend={`Across ${partners.length} institution${partners.length === 1 ? '' : 's'}`}
            tooltip="Sum of every student's AI credit limit across all institutions."
          />
          <StatCard
            label="Near-end institutions"
            value={String(criticalCount)}
            trend={criticalCount ? 'Immediate action required' : 'None right now'}
            warn={criticalCount > 0}
            tooltip="Institutions with less than 10% credits remaining, requiring immediate top-up."
          />
          <StatCard
            label="Avg. utilization"
            value={`${avgUtilization}%`}
            trend="Current balances"
            tooltip="The average rate of credit consumption across all active partner accounts."
          />
        </div>

        {/* Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900">Daily consumption</h2>
          <p className="text-sm text-slate-600 mb-4">Daily credit usage across all institutions, last 30 days.</p>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consumptionHistory}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#52525b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#52525b' }} width={48} />
                <Tooltip cursor={{ fill: '#f5f7fa' }} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none', fontSize: 12 }} />
                <Bar dataKey="usage" name="Credits" fill="#0056D2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Main Management Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 pt-5 pb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Institution allocations</h2>
              <p className="text-sm text-slate-600">Manage limits and top-ups for each institution.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  aria-label="Search institution"
                  placeholder="Search institution..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
              {(searchQuery || filterStatus !== 'All' || sortConfig) && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-teal-700 font-semibold hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          <div className="px-6 flex gap-5 border-b border-slate-200 overflow-x-auto" role="tablist">
            {['All', 'Critical', 'Warning', 'Healthy'].map((status) => (
              <button
                key={status}
                role="tab"
                aria-selected={filterStatus === status}
                onClick={() => setFilterStatus(status as any)}
                className={`-mb-px pb-2.5 text-sm font-semibold whitespace-nowrap border-b-2 ${filterStatus === status ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-semibold">
                    <button onClick={() => handleSort('name')} className="uppercase tracking-wide hover:text-slate-800">Institution{sortMark('name')}</button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleSort('remaining')} className="uppercase tracking-wide hover:text-slate-800">Remaining{sortMark('remaining')}</button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleSort('monthlyLimit')} className="uppercase tracking-wide hover:text-slate-800">Monthly limit{sortMark('monthlyLimit')}</button>
                  </th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length > 0 ? (
                  filteredData.map((partner) => (
                    <tr key={partner.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                          {partner.isBlocked && <Lock size={14} className="text-rose-700" aria-label="Blocked" />}
                          {partner.name}
                        </p>
                        <p className="text-xs text-slate-600">{partner.studentCount} students</p>
                      </td>
                      <td className={`px-4 py-3.5 font-bold ${partner.status === 'Critical' ? 'text-rose-700' : 'text-slate-900'}`}>
                        {partner.remaining.toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-700">{partner.monthlyLimit.toLocaleString()}</span>
                          <button
                            onClick={() => handleManageLimit(partner)}
                            aria-label={`Edit monthly limit for ${partner.name}`}
                            title="Edit monthly limit"
                            className="p-1 text-slate-500 hover:text-teal-700 rounded"
                          >
                            <Settings2 size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                          partner.isBlocked ? 'bg-rose-50 text-rose-700' :
                          partner.status === 'Healthy' ? 'bg-green-50 text-green-700' :
                          partner.status === 'Warning' ? 'bg-amber-50 text-amber-800' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {partner.isBlocked ? 'Blocked' : partner.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleBlock(partner)}
                            className={`p-2 rounded-md ${partner.isBlocked ? 'text-green-700 hover:bg-green-50' : 'text-rose-700 hover:bg-rose-50'}`}
                            title={partner.isBlocked ? 'Unblock Access' : 'Block Access'}
                            aria-label={partner.isBlocked ? `Unblock ${partner.name}` : `Block ${partner.name}`}
                          >
                            {partner.isBlocked ? <Unlock size={16} /> : <Lock size={16} />}
                          </button>
                          <button
                            onClick={async () => {
                              setSelectedPartner(partner);
                              await generateAIReport(partner);
                            }}
                            className="p-2 text-teal-700 hover:bg-slate-100 rounded-md"
                            title="Generate AI Report"
                            aria-label={`Generate AI report for ${partner.name}`}
                          >
                            <Sparkles size={16} />
                          </button>
                          <button
                            onClick={() => handleTopUp(partner)}
                            className="ml-1 h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-md"
                          >
                            Top up
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-slate-100">
                    <td colSpan={5} className="px-6 py-14 text-center">
                      <p className="text-slate-900 font-bold">No institutions found</p>
                      <p className="text-slate-600 text-sm mt-1">Try adjusting your search or filters.</p>
                      <button onClick={clearFilters} className="mt-3 text-sm text-teal-700 font-semibold hover:underline">
                        Clear filters
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

        {/* AI Report Modal */}
        <AnimatePresence>
          {aiReport && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setAiReport(null)}
                className="absolute inset-0 bg-slate-900/50"
              />
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                role="dialog"
                aria-modal="true"
                className="relative bg-white w-full max-w-2xl rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Consumption analysis</h2>
                    <p className="text-sm text-slate-600">{selectedPartner?.name}</p>
                  </div>
                  <button
                    onClick={() => setAiReport(null)}
                    aria-label="Close"
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                  <div className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                    {aiReport}
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
                  <button onClick={() => setAiReport(null)} className={btnSecondary}>
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Loading Overlay for AI */}
        <AnimatePresence>
          {isGeneratingReport && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40"
              />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                role="status"
                className="relative bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 max-w-sm"
              >
                <Loader2 size={24} className="text-teal-700 animate-spin shrink-0" />
                <div>
                  <h3 className="font-bold text-slate-900">Generating report</h3>
                  <p className="text-sm text-slate-600">
                    Analyzing consumption for {selectedPartner?.name}...
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Top Up Modal */}
      <AnimatePresence>
        {showTopUpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTopUpModal(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Top up credits</h3>
                  <p className="text-sm text-slate-600">
                    Allocate additional AI credits to <span className="font-semibold text-slate-900">{selectedPartner?.name}</span>.
                  </p>
                </div>
                <button onClick={() => setShowTopUpModal(false)} aria-label="Close" className="p-2 text-slate-600 hover:bg-slate-100 rounded-md">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="credit-topup" className="block text-sm font-semibold text-slate-700 mb-1">Credit amount</label>
                  <input
                    id="credit-topup"
                    type="number"
                    placeholder="e.g. 50000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2 p-3 bg-amber-50 rounded-md border border-amber-200">
                  <ShieldAlert className="text-amber-700 shrink-0" size={16} />
                  <p className="text-sm text-amber-800">
                    This action will immediately update the institution's available balance. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={() => setShowTopUpModal(false)} className={btnSecondary}>
                  Cancel
                </button>
                <button onClick={confirmTopUp} disabled={!topUpAmount} className={btnPrimary}>
                  Confirm allocation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmDialog(false)}
              className="absolute inset-0 bg-slate-900/40"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role="alertdialog"
              aria-modal="true"
              className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Confirm top-up</h3>
                <p className="text-sm text-slate-600">
                  You are about to add <span className="font-bold text-slate-900">{parseInt(topUpAmount).toLocaleString()}</span> credits to <span className="font-bold text-slate-900">{selectedPartner?.name}</span>.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={() => setShowConfirmDialog(false)} className={btnSecondary}>
                  Go back
                </button>
                <button onClick={handleFinalConfirm} className={btnPrimary}>
                  Yes, process
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Monthly Limit Modal */}
      <AnimatePresence>
        {showLimitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLimitModal(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Monthly limit</h3>
                  <p className="text-sm text-slate-600">
                    Set the maximum AI credits <span className="font-semibold text-slate-900">{selectedPartner?.name}</span> can consume per month.
                  </p>
                </div>
                <button onClick={() => setShowLimitModal(false)} aria-label="Close" className="p-2 text-slate-600 hover:bg-slate-100 rounded-md">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="credit-limit" className="block text-sm font-semibold text-slate-700 mb-1">Monthly credit limit</label>
                  <input
                    id="credit-limit"
                    type="number"
                    placeholder="e.g. 100000"
                    value={newMonthlyLimit}
                    onChange={(e) => setNewMonthlyLimit(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2 p-3 bg-blue-50 rounded-md border border-blue-200">
                  <Info className="text-blue-700 shrink-0" size={16} />
                  <p className="text-sm text-blue-900">
                    Once this limit is reached, the institution's AI features will be automatically paused until the next billing cycle or manual override.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={() => setShowLimitModal(false)} className={btnSecondary}>
                  Cancel
                </button>
                <button onClick={saveMonthlyLimit} className={btnPrimary}>
                  Save changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EnaraCreditManagement;
