
import React from 'react';
import { ArrowUpRight } from 'lucide-react';
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
  Cell
} from 'recharts';

const GROWTH_DATA = [
  { name: 'Sep', mrr: 280000, arr: 3360000, students: 900000, growth: 5.2 },
  { name: 'Oct', mrr: 310000, arr: 3720000, students: 950000, growth: 10.7 },
  { name: 'Nov', mrr: 340000, arr: 4080000, students: 1020000, growth: 9.6 },
  { name: 'Dec', mrr: 320000, arr: 3840000, students: 1050000, growth: -5.8 },
  { name: 'Jan', mrr: 380000, arr: 4560000, students: 1120000, growth: 18.7 },
  { name: 'Feb', mrr: 400000, arr: 4800000, students: 1180000, growth: 5.2 },
  { name: 'Mar', mrr: 420000, arr: 5040000, students: 1200000, growth: 5.0 },
];

const KPIS = [
  { label: 'MRR', value: '$420,000', delta: '+12.4%' },
  { label: 'ARR', value: '$5.04M', delta: '+15.2%' },
  { label: 'Active students', value: '842,000', delta: '+8.1%' },
  { label: 'Credit consumption', value: '2.4M / mo', delta: '+24%' },
];

const tick = { fill: '#475569', fontSize: 12 };

export const RevenueGrowth: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-slate-900">Revenue &amp; growth</h1>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
        </div>
        <p className="mt-1 text-slate-600">Recurring revenue, student growth and month-over-month trends.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm text-slate-600">{k.label}</p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">{k.value}</p>
            <p className="mt-1 text-sm font-semibold text-green-700 flex items-center gap-1">
              <ArrowUpRight size={14} aria-hidden="true" /> {k.delta}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">MRR growth trend</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={GROWTH_DATA}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} />
                <YAxis axisLine={false} tickLine={false} tick={tick} />
                <Tooltip />
                <Line type="monotone" dataKey="mrr" stroke="#0056D2" strokeWidth={2.5} dot={{ r: 3, fill: '#0056D2' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Month-over-month growth (%)</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={GROWTH_DATA}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} />
                <YAxis axisLine={false} tickLine={false} tick={tick} />
                <Tooltip />
                <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
                  {GROWTH_DATA.map((entry, index) => (
                    <Cell key={`rev-growth-cell-${index}`} fill={entry.growth > 0 ? '#0056D2' : '#d97706'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
