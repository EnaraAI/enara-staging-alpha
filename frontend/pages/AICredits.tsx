
import React, { useState, useMemo, useEffect } from 'react';
import { fetchCreditsReport, CreditsReport } from '../services/apiService';
import { toast } from '../services/toastService';
import { 
  Download, 
  Search, 
  ChevronRight,
  Loader2,
  Building2,
  Calendar,
  MoreVertical,
  AlertTriangle as ShieldAlert
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
  LineChart,
  Line
} from 'recharts';

const ALL_INSTITUTIONS = 'All Institutions';
const NEAR_LIMIT_RATIO = 0.8;
const PALETTE = ['#0056D2', '#0b3d91', '#d97706', '#15803d', '#5b8def', '#64748b'];
const FEATURE_LABELS: Record<string, string> = {
  chat: 'AI Tutor Chat',
  voice: 'Voice Tutor',
  assessment: 'Assessments',
  curriculum: 'Curriculum',
  research: 'Research',
  visualize: 'Visualizations',
  tts: 'Read Aloud',
};

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
}

export const AICredits: React.FC<{ isEnaraAdmin?: boolean }> = ({ isEnaraAdmin }) => {
  const [selectedInstitution, setSelectedInstitution] = useState(ALL_INSTITUTIONS);
  const [selectedView, setSelectedView] = useState<'overview' | 'classes' | 'students' | 'institutions'>(isEnaraAdmin ? 'institutions' : 'overview');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Enara admins get every institution in one report and filter it here.
  const institutionIds = useMemo(
    () => [...new Set((report?.students || []).map(s => s.institutionId).filter(Boolean) as string[])].sort(),
    [report]
  );
  const rows = useMemo(
    () => (report?.students || []).filter(s => selectedInstitution === ALL_INSTITUTIONS || s.institutionId === selectedInstitution),
    [report, selectedInstitution]
  );

  const totalUsage = rows.reduce((sum, r) => sum + r.usage, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  const stats = [
    { label: 'Credits used', value: formatCredits(totalUsage) },
    { label: 'Average per student', value: rows.length ? formatCredits(Math.round(totalUsage / rows.length)) : '0' },
    { label: 'Remaining balance', value: formatCredits(totalRemaining) },
  ];

  const groupUsage = (keyOf: (r: CreditsReport['students'][number]) => string) => {
    const groups = new Map<string, { usage: number; limit: number; students: number }>();
    for (const r of rows) {
      const key = keyOf(r);
      const g = groups.get(key) || { usage: 0, limit: 0, students: 0 };
      g.usage += r.usage;
      g.limit += r.limit;
      g.students += 1;
      groups.set(key, g);
    }
    return [...groups.entries()]
      .map(([name, g], i) => ({ name, ...g, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.usage - a.usage);
  };

  const usageByInstitution = groupUsage(r => r.institutionId || 'Unassigned').map(inst => ({
    ...inst,
    health: inst.limit > 0 && inst.usage >= inst.limit * NEAR_LIMIT_RATIO ? 'Warning' : 'Healthy',
  }));
  const usageByClass = groupUsage(r => r.batchId || 'No batch');

  // Usage by feature and by day comes from settled usage events; with an
  // institution selected those totals still cover everything the admin can see.
  const usageByFeature = (report?.usageByFeature || []).map((f, i) => ({
    name: FEATURE_LABELS[f.feature] || f.feature,
    usage: f.credits,
    events: f.events,
    color: PALETTE[i % PALETTE.length],
  }));
  const maxFeatureUsage = Math.max(1, ...usageByFeature.map(f => f.usage));
  const dailyUsage = (report?.usageByDay || []).map(d => ({ date: d.date.slice(5), usage: d.credits }));

  const query = searchQuery.trim().toLowerCase();
  const highConsumers = rows
    .filter(r => !query || r.name.toLowerCase().includes(query) || r.studentId.toLowerCase().includes(query))
    .slice(0, 20)
    .map(r => ({
      id: r.studentId,
      name: r.name,
      course: r.batchId || '—',
      usage: r.usage,
      limit: r.limit,
      status: r.status === 'blocked' ? 'Blocked' : r.limit > 0 && r.usage >= r.limit * NEAR_LIMIT_RATIO ? 'Warning' : 'Normal',
    }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-600 gap-3">
        <Loader2 className="animate-spin" size={20} /> Loading credit usage…
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto">
          <p className="text-slate-900 font-bold">Could not load credit usage.</p>
          <p className="text-sm text-slate-600 mt-1">{loadError}</p>
          <button onClick={loadReport} className="mt-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10 text-sm">Try again</button>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: typeof selectedView; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'classes', label: 'Classes' },
    ...(isEnaraAdmin ? [{ key: 'institutions' as const, label: 'Institutions' }] : []),
  ];
  const pctOf = (usage: number, limit: number) => (limit > 0 ? Math.round((usage / limit) * 100) : 0);
  const thCls = 'px-5 py-3 font-semibold';
  const cardCls = 'bg-white border border-slate-200 rounded-xl';
  const tooltipStyle = { borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Resource management</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">AI credits</h1>
          <p className="text-slate-600 mt-1 max-w-2xl">Monitor AI credit consumption across institutions, classes and individual students.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEnaraAdmin && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <select
                aria-label="Institution"
                value={selectedInstitution}
                onChange={(e) => setSelectedInstitution(e.target.value)}
                className="pl-9 pr-8 h-10 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 outline-none focus:border-teal-600 appearance-none"
              >
                <option>{ALL_INSTITUTIONS}</option>
                {institutionIds.map(id => <option key={id}>{id}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700">
            <Calendar className="text-slate-500" size={16} />
            Last {report.periodDays} days
          </div>
          <button className="h-10 w-10 flex items-center justify-center bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50" aria-label="Download report" title="Download report">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200" role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={selectedView === t.key}
            onClick={() => setSelectedView(t.key)}
            className={`-mb-px py-3 text-sm font-semibold border-b-2 ${selectedView === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className={`${cardCls} p-5`}>
            <p className="text-sm text-slate-600">{stat.label}</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {selectedView === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 ${cardCls} p-6`}>
            <h2 className="text-lg font-bold text-slate-900">Daily credit usage</h2>
            <p className="text-sm text-slate-600 mb-4">Credits consumed per day across all AI features.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyUsage}>
                  <CartesianGrid vertical={false} stroke="#eef1f6" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="usage" name="Credits" stroke="#0056D2" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${cardCls} p-6`}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Usage by feature</h2>
            <div className="space-y-4">
              {usageByFeature.length === 0 && <p className="text-sm text-slate-600">No AI usage in this period.</p>}
              {usageByFeature.map((course, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between items-end gap-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{course.name}</p>
                      <p className="text-xs text-slate-600">{course.events.toLocaleString()} requests</p>
                    </div>
                    <span className="font-bold text-slate-900">{formatCredits(course.usage)} <span className="text-xs text-slate-600 font-normal">credits</span></span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${(course.usage / maxFeatureUsage) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-6 text-sm text-teal-700 font-semibold hover:underline flex items-center gap-1">
              View detailed breakdown
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {selectedView === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 ${cardCls} overflow-hidden`}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-slate-900">Usage by class</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[480px]">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500 border-t border-slate-100">
                    <th className={thCls}>Class / batch</th>
                    <th className={thCls}>Students</th>
                    <th className={`${thCls} text-right`}>Credits used</th>
                  </tr>
                </thead>
                <tbody>
                  {usageByClass.map((cls, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-5 py-3 font-semibold text-slate-900">{cls.name}</td>
                      <td className="px-5 py-3 text-slate-700">{cls.students}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCredits(cls.usage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={`${cardCls} p-6`}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Highest-consumption batches</h2>
            <div className="divide-y divide-slate-100">
              {usageByClass.length === 0 && <p className="text-sm text-slate-600">No students yet.</p>}
              {usageByClass.slice(0, 3).map((b, i) => (
                <div key={i} className="py-3">
                  <div className="flex justify-between items-center gap-2 text-sm">
                    <p className="font-semibold text-slate-900">{b.name}</p>
                    <span className="text-xs font-bold text-orange-800">{pctOf(b.usage, b.limit)}% of allocation</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{formatCredits(b.usage)} credits used by {b.students} students</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedView === 'institutions' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 ${cardCls} p-6`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Credits by institution</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageByInstitution}>
                    <CartesianGrid vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f5f7fa' }} />
                    <Bar dataKey="usage" name="Credits used" radius={[3, 3, 0, 0]} maxBarSize={48}>
                      {usageByInstitution.map((entry, index) => (
                        <Cell key={`aicredits-cell-${index}`} fill={entry.health === 'Warning' ? '#d97706' : '#0056D2'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${cardCls} p-6`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Quota alerts</h2>
              <div className="space-y-3">
                {usageByInstitution.filter(inst => inst.health === 'Warning').map((inst, i) => (
                  <div key={i} className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-800">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm font-bold">{inst.name}</p>
                      <ShieldAlert size={16} />
                    </div>
                    <p className="text-xs mt-1">Approaching credit limit ({pctOf(inst.usage, inst.limit)}% consumed)</p>
                    <button className="mt-3 border border-orange-300 bg-white text-orange-800 hover:bg-orange-100 font-semibold rounded-md px-3 h-8 text-xs">
                      Increase quota
                    </button>
                  </div>
                ))}
                {usageByInstitution.every(inst => inst.health !== 'Warning') && (
                  <p className="text-sm text-slate-600">No institution is near its credit limit.</p>
                )}
              </div>
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-slate-900">Institution credit reports</h2>
              <p className="text-sm text-slate-600">Credit allocation and consumption per campus.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500 border-t border-slate-100">
                    <th className={thCls}>Institution</th>
                    <th className={thCls}>Students</th>
                    <th className={thCls}>Credits used</th>
                    <th className={thCls}>Allocation</th>
                    <th className={thCls}>Used</th>
                    <th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usageByInstitution.map((inst, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900">{inst.name}</td>
                      <td className="px-5 py-3 text-slate-700">{inst.students.toLocaleString()}</td>
                      <td className="px-5 py-3 font-bold text-slate-900">{formatCredits(inst.usage)}</td>
                      <td className="px-5 py-3 text-slate-700">{formatCredits(inst.limit)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-600" style={{ width: `${Math.min(100, pctOf(inst.usage, inst.limit))}%` }} />
                          </div>
                          <span className="font-semibold text-slate-700">{pctOf(inst.usage, inst.limit)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          inst.health === 'Healthy' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-800'
                        }`}>
                          {inst.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* High consumption users */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Top consumers</h2>
            <p className="text-sm text-slate-600">Students using the most credits relative to their allocation.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              aria-label="Search students"
              placeholder="Search student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-10 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-teal-600"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[760px]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 border-t border-slate-100">
                <th className={thCls}>Student</th>
                <th className={thCls}>Batch</th>
                <th className={thCls}>Credits used</th>
                <th className={thCls}>Allocation</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {highConsumers.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-600">No students match.</td>
                </tr>
              )}
              {highConsumers.map((user, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-teal-700 font-bold text-xs shrink-0">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-600">{user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{user.course}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{user.usage.toLocaleString()}</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${user.status === 'Warning' ? 'bg-amber-600' : 'bg-teal-600'}`} style={{ width: `${Math.min(100, pctOf(user.usage, user.limit))}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{user.limit.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      user.status === 'Blocked' ? 'bg-red-50 text-red-700' : user.status === 'Warning' ? 'bg-orange-50 text-orange-800' : 'bg-green-50 text-green-700'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md" aria-label={`More actions for ${user.name}`}>
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-600">
          Showing up to 20 of {rows.length.toLocaleString()} students
        </div>
      </div>
    </div>
  );
};
