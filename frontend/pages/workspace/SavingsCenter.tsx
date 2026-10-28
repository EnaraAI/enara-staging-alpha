import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { addCurrentTool, fetchCurrentTools, fetchSavings, fetchUsagePlan, removeCurrentTool, simulateUsage } from '../../services/apiService';
import { toast } from '../../services/toastService';

// P5 AI Savings Center (Workspace Admin): compares what the school pays for
// other AI tools (entered here) with its ENARA commercial price. Estimates
// only, and "Not enough data" whenever an input is missing or not comparable.
// No prices, rates or exchange rates are invented in the browser.

const field = 'border border-slate-300 rounded px-2 py-1 text-sm';

function Result({ r }: { r: any }) {
  if (!r) return null;
  if (r.result === 'Not enough data') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
        <p className="font-semibold">Not enough data</p>
        <ul className="list-disc ml-5 text-xs mt-1">{(r.missing ?? []).map((m: string) => <li key={m}>Missing: {m}</li>)}</ul>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm space-y-1">
      <p className="text-xs font-semibold text-amber-800">{r.label}</p>
      <p>Current tools: <b>{r.currentMonthlySpend} {r.currency}</b> per month (entered by your school)</p>
      <p>ENARA price: <b>{r.enaraMonthlyPrice} {r.currency}</b> per month for {r.usageCredits} credits</p>
      <p>Estimated difference: <b>{r.grossMonthlySavings} {r.currency}</b> per month</p>
    </div>
  );
}

function Assumptions({ a }: { a: Record<string, unknown> | undefined }) {
  if (!a) return null;
  return <details className="text-xs text-slate-600"><summary className="cursor-pointer">Assumptions</summary><pre className="whitespace-pre-wrap bg-slate-50 p-2 rounded">{JSON.stringify(a, null, 2)}</pre></details>;
}

export const SavingsCenter: React.FC = () => {
  const [plan, setPlan] = useState<any>(null);
  const [tools, setTools] = useState<any[] | null>(null);
  const [savings, setSavings] = useState<any>(null);
  const [form, setForm] = useState({ toolName: '', provider: '', plan: '', seats: '', amount: '', currency: '', period: 'monthly', reference: '', replacedByEnara: true });
  const [sim, setSim] = useState<{ students: string; staff: string; q: Record<string, string> }>({ students: '', staff: '', q: {} });
  const [simResult, setSimResult] = useState<any>(null);
  const load = () => {
    fetchUsagePlan().then(setPlan).catch(() => setPlan({ configured: false }));
    fetchCurrentTools().then((r) => setTools(r.items)).catch(() => setTools([]));
    fetchSavings().then(setSavings).catch(() => setSavings(null));
  };
  useEffect(load, []);
  const add = () => {
    addCurrentTool({ ...form, seats: form.seats ? Number(form.seats) : undefined, amount: Number(form.amount), provider: form.provider || undefined, plan: form.plan || undefined, reference: form.reference || undefined })
      .then(() => { setForm({ ...form, toolName: '', provider: '', plan: '', seats: '', amount: '', reference: '' }); load(); })
      .catch((err) => toast.error('Not saved', (err as Error).message));
  };
  const simulate = () => {
    const quantities = Object.fromEntries(Object.entries(sim.q).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    simulateUsage({ students: sim.students ? Number(sim.students) : undefined, staff: sim.staff ? Number(sim.staff) : undefined, quantities }).then(setSimResult).catch((err) => toast.error('Not simulated', (err as Error).message));
  };
  if (!plan || tools === null) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Savings Center</h1>
        <p className="text-sm text-slate-600">Compare what you pay for AI tools today with your ENARA price. Results are estimates until checked against actual usage and contract terms.</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
        <h2 className="font-semibold text-slate-900">Your ENARA price</h2>
        {!plan.configured ? <p className="text-sm text-slate-600">Not enough data: ENARA has not set a price for your school yet.</p> : (
          <>
            <p className="text-sm text-slate-700">{plan.status === 'contracted' ? 'Contracted' : 'Proposed'} · {plan.basePrice} {plan.currency} per month{plan.seatPrice !== null ? ` + ${plan.seatPrice} ${plan.currency} per ${plan.seatBasis === 'students' ? 'student' : 'staff member'}` : ''} · {plan.includedCredits} credits included{plan.overagePricePerCredit !== null ? ` · ${plan.overagePricePerCredit} ${plan.currency} per extra credit` : ' · extra credits not priced'}</p>
            <ul className="text-xs text-slate-600">{plan.creditRates.map((r: any) => <li key={r.feature}>{r.label}: {r.credits} credit(s) per {r.unit.replace(/_/g, ' ')}</li>)}</ul>
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold text-slate-900">AI tools you pay for now</h2>
        <p className="text-xs text-slate-500">Entered by your school. Only tools marked "ENARA replaces it" count in the comparison. Amounts in different currencies are not converted.</p>
        {!tools.length && <p className="text-sm text-slate-600">No tools entered yet.</p>}
        <ul className="space-y-1">
          {tools.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 text-sm border-t border-slate-100 pt-1">
              <span>{t.toolName}{t.provider ? ` (${t.provider})` : ''}{t.plan ? ` · ${t.plan}` : ''}{t.seats ? ` · ${t.seats} seats` : ''} · {t.amount} {t.currency} per {t.period === 'annual' ? 'year' : 'month'}{t.replacedByEnara ? '' : ' · kept'}</span>
              <button aria-label={`Remove ${t.toolName}`} onClick={() => window.confirm(`Remove ${t.toolName}?`) && removeCurrentTool(t.id).then(load)} className="text-slate-400 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 items-end">
          <input className={field} placeholder="Tool" value={form.toolName} onChange={(e) => setForm({ ...form, toolName: e.target.value })} />
          <input className={field} placeholder="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          <input className={field} placeholder="Plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
          <input className={`${field} w-20`} type="number" min={0} placeholder="Seats" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          <input className={`${field} w-28`} type="number" min={0} placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className={`${field} w-20 uppercase`} maxLength={3} placeholder="EGP" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          <select className={field} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}><option value="monthly">per month</option><option value="annual">per year</option></select>
          <input className={field} placeholder="Reference (optional)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" checked={form.replacedByEnara} onChange={(e) => setForm({ ...form, replacedByEnara: e.target.checked })} /> ENARA replaces it</label>
          <button disabled={!form.toolName || form.amount === '' || form.currency.length !== 3} onClick={add} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">Add</button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold text-slate-900">Estimate from your measured usage (last 30 days, live data)</h2>
        <Result r={savings} />
        <Assumptions a={savings?.assumptions} />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold text-slate-900">Scale simulator</h2>
        <p className="text-xs text-slate-500">A projection from your own assumptions. It never uses measured usage or ENARA's internal costs.</p>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">Students<input type="number" min={0} className={`${field} block w-24`} value={sim.students} onChange={(e) => setSim({ ...sim, students: e.target.value })} /></label>
          <label className="text-xs">Staff<input type="number" min={0} className={`${field} block w-24`} value={sim.staff} onChange={(e) => setSim({ ...sim, staff: e.target.value })} /></label>
          {(plan.configured ? plan.creditRates : [{ feature: 'educator_chat', label: 'AI Chat', unit: 'operation' }, { feature: 'ai_lesson_plan', label: 'Lesson plans', unit: 'operation' }, { feature: 'speaking_exam_stt', label: 'Speaking exam minutes', unit: 'minute' }]).map((r: any) => (
            <label key={r.feature} className="text-xs">{r.label} per month ({r.unit.replace(/_/g, ' ')}s)<input type="number" min={0} className={`${field} block w-32`} value={sim.q[r.feature] ?? ''} onChange={(e) => setSim({ ...sim, q: { ...sim.q, [r.feature]: e.target.value } })} /></label>
          ))}
        </div>
        <button onClick={simulate} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Project</button>
        {simResult && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-800">{simResult.label}</p>
            <p className="text-sm">Projected credits: <b>{simResult.credits ?? 'Not enough data'}</b></p>
            {'value' in simResult.enaraPrice ? <p className="text-sm">Projected ENARA price: <b>{simResult.enaraPrice.value} {simResult.enaraPrice.currency}</b> per month</p> : <Result r={simResult.enaraPrice} />}
            <Result r={simResult.savings} />
            <Assumptions a={simResult.assumptions} />
          </div>
        )}
      </section>
    </div>
  );
};

export default SavingsCenter;
