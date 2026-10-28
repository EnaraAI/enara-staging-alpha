import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OriginSelector } from '../../components/OriginSelector';
import { fetchUsageBudget, fetchUsageReport, saveCreditLimits, type UsageCredits, type UsageGroup } from '../../services/apiService';
import type { OriginView } from '../../services/roleRouting';
import { toast } from '../../services/toastService';

// P5 Usage (Workspace Admin): your school's AI usage from the usage ledger,
// in operations, units and (with an ENARA plan) credits. No provider costs.
// Unknown and unpriced usage is counted and flagged, never shown as zero.

const RANGES = [{ days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }];
const credits = (c: UsageCredits) => (c.status === 'not_configured' ? 'Not configured' : c.status === 'partial' ? `≥ ${c.value} (${c.unknownOperations} unknown)` : String(c.value));
const BANDS: Record<string, string> = { no_limit: 'No limit set', below_50: 'Under half used', '50_80': 'Over half used', '80_100': 'Over 80% used', reached: 'Limit reached' };

function BudgetPanel() {
  const [b, setB] = useState<any>(null);
  const [limits, setLimits] = useState({ dailyCredits: '', monthlyCredits: '', perUserDailyCredits: '' });
  const load = () => fetchUsageBudget().then((r) => {
    setB(r);
    setLimits({ dailyCredits: r.customerLimits?.dailyCredits ?? '', monthlyCredits: r.customerLimits?.monthlyCredits ?? '', perUserDailyCredits: r.customerLimits?.perUserDailyCredits ?? '' });
  }).catch(() => setB({ error: true }));
  useEffect(() => { load(); }, []);
  if (!b) return null;
  if (b.error) return <p className="text-sm text-slate-600">Budget status is not available.</p>;
  const save = () => {
    const body = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    saveCreditLimits(body).then(() => { toast.success('Saved', 'Alert limits updated. They do not block AI use.'); load(); }).catch((err) => toast.error('Not saved', (err as Error).message));
  };
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h2 className="font-semibold text-slate-900">Budget and limits</h2>
      <p className="text-sm text-slate-700">
        Spending policy: <b>{b.policy === 'enforced' ? 'Enforced by ENARA' : b.policy === 'not_enforced' ? 'Not enforced' : 'Not configured'}</b>
        {b.aiPaused && <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800">AI paused for your school</span>}
      </p>
      {b.windows && <p className="text-sm text-slate-600">Today: {BANDS[b.windows.day]} · This month: {BANDS[b.windows.month]}</p>}
      <p className="text-xs text-slate-500">{b.grading}</p>
      <p className="text-sm text-slate-700">Credits used: today {credits(b.usage.today)} · this month {credits(b.usage.month)}</p>
      {b.maxMonthlyCredits === null ? (
        <p className="text-xs text-slate-500">Your own credit alert limits become available once ENARA sets your credit plan.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Alert limits (credits). They notify only; they never block AI or grading. Maximum {b.maxMonthlyCredits} per month.</p>
          <div className="flex flex-wrap gap-2 items-end">
            {([['dailyCredits', 'Per day'], ['monthlyCredits', 'Per month'], ['perUserDailyCredits', 'Per person per day']] as const).map(([k, l]) => (
              <label key={k} className="text-xs">{l}<input type="number" min={0} max={b.maxMonthlyCredits} className="block w-28 border border-slate-300 rounded px-2 py-1 text-sm" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} /></label>
            ))}
            <button onClick={save} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Save</button>
          </div>
        </div>
      )}
    </section>
  );
}

export const Usage: React.FC = () => {
  const [origin, setOrigin] = useState<OriginView>('live');
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<'feature' | 'user' | 'day'>('feature');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    fetchUsageReport({ from: new Date(Date.now() - days * 86_400_000).toISOString(), groupBy, origin, page }).then(setData).catch((err) => setError((err as Error).message));
  }, [origin, days, groupBy, page]);
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usage</h1>
          <p className="text-sm text-slate-600">Measured AI use in your school. Credits follow your ENARA plan; unknown usage is never counted as zero.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <OriginSelector value={origin} onChange={(v) => { setOrigin(v); setPage(1); }} />
          <select aria-label="Range" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">{RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}</select>
          <select aria-label="Group by" value={groupBy} onChange={(e) => { setGroupBy(e.target.value as never); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="feature">By tool</option><option value="user">By person</option><option value="day">By day</option></select>
        </div>
      </div>
      <BudgetPanel />
      {error ? <p className="text-slate-700">{error}</p> : !data ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : (
        <>
          <div className={`text-sm rounded-lg px-3 py-2 border ${data.coverage.status === 'complete' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            Data coverage: <b>{data.coverage.status === 'complete' ? 'complete' : data.coverage.status === 'no_data' ? 'no usage recorded' : 'incomplete'}</b>{data.coverage.note ? ` — ${data.coverage.note}` : ''}
            {data.originNote && <span className="block text-xs">{data.originNote}</span>}
            {!data.plan.configured && <span className="block text-xs">Credits: Not enough data (ENARA has not set a credit plan for your school).</span>}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[['Operations', data.total.operations], ['Succeeded', data.total.succeeded], ['Failed or refused', data.total.failed + data.total.refused + data.total.cancelled], ['Unpriced / usage unknown', `${data.total.unpriced} / ${data.total.usageUnknown}`], ['Credits', credits(data.total.credits)]].map(([l, v]) => (
              <div key={String(l)} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500">{l}</p><p className="text-xl font-bold text-slate-900 tabular-nums">{v}</p></div>
            ))}
          </div>
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="p-2">{groupBy === 'feature' ? 'Tool' : groupBy === 'user' ? 'Person' : 'Day'}</th><th className="p-2">Operations</th><th className="p-2">Failed</th><th className="p-2">Unpriced</th><th className="p-2">Usage unknown</th><th className="p-2">Tokens</th><th className="p-2">Audio min</th><th className="p-2">Avatar min</th><th className="p-2">Credits</th></tr></thead>
              <tbody>
                {data.groups.items.map((g: UsageGroup) => (
                  <tr key={g.key} className="border-t border-slate-100">
                    <td className="p-2">{g.label}</td><td className="p-2 tabular-nums">{g.operations}</td><td className="p-2 tabular-nums">{g.failed + g.refused + g.cancelled}</td>
                    <td className="p-2 tabular-nums">{g.unpriced}</td><td className="p-2 tabular-nums">{g.usageUnknown}</td><td className="p-2 tabular-nums">{g.units.inputTokens + g.units.outputTokens}</td>
                    <td className="p-2 tabular-nums">{g.units.audioMinutes}</td><td className="p-2 tabular-nums">{g.units.avatarMinutes}</td><td className="p-2 tabular-nums">{credits(g.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.groups.items.length && <p className="p-3 text-sm text-slate-600">No usage in this period.</p>}
          </div>
          {data.groups.total > data.groups.pageSize && (
            <div className="flex justify-end gap-2 text-sm">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 border rounded disabled:opacity-40">Previous</button>
              <button disabled={page * data.groups.pageSize >= data.groups.total} onClick={() => setPage(page + 1)} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Usage;
