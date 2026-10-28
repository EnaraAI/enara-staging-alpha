
import React from 'react';
import { Clock } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const FINANCIAL_DATA = [
  { name: 'Global Tech', used: 358000, remaining: 842000, depletion: '2026-11-12', costPerStudent: 9.88, costPerQuestion: 0.12 },
  { name: 'Future Skills', used: 376000, remaining: 124000, depletion: '2026-05-15', costPerStudent: 11.42, costPerQuestion: 0.15 },
  { name: 'Elite Learning', used: 350000, remaining: 450000, depletion: '2026-08-20', costPerStudent: 10.55, costPerQuestion: 0.14 },
  { name: 'Standard Uni', used: 188000, remaining: 12000, depletion: '2026-04-15', costPerStudent: 14.20, costPerQuestion: 0.22 },
];

const COURSE_BURN = [
  { name: 'Adv Math', burn: 124000 },
  { name: 'Physics', burn: 98000 },
  { name: 'CS', burn: 85000 },
  { name: 'English', burn: 42000 },
  { name: 'Ethics', burn: 31000 },
];

const tick = { fill: '#475569', fontSize: 12 };

export const Financials: React.FC = () => {
  const totalUsed = FINANCIAL_DATA.reduce((acc, curr) => acc + curr.used, 0);
  const totalRemaining = FINANCIAL_DATA.reduce((acc, curr) => acc + curr.remaining, 0);

  const pieData = [
    { name: 'Used', value: totalUsed },
    { name: 'Remaining', value: totalRemaining },
  ];

  const th = 'px-5 py-3 font-semibold';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-slate-900">Financials</h1>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
        </div>
        <p className="mt-1 text-slate-600">Unit costs, credit usage and projected depletion per institution.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Cost per student / mo</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">$10.82</p>
          <p className="mt-1 text-sm font-semibold text-green-700">-2.4% efficiency</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Cost per resolved question</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">$0.14</p>
          <p className="mt-1 text-sm font-semibold text-green-700">Stable</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Total credits used</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{(totalUsed / 1000000).toFixed(2)}M</p>
          <p className="mt-1 text-sm text-slate-600">Across all orgs</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <p className="text-sm text-orange-800">Total credits remaining</p>
          <p className="mt-1 text-3xl font-extrabold text-orange-800">{(totalRemaining / 1000000).toFixed(2)}M</p>
          <p className="mt-1 text-sm font-semibold text-orange-800">4 orgs low balance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Credit distribution</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell key="financials-cell-used" fill="#0056D2" />
                  <Cell key="financials-cell-remaining" fill="#bcd3f7" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-6 mt-4 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ background: '#0056D2' }} />
              Used ({(totalUsed / (totalUsed + totalRemaining) * 100).toFixed(1)}%)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ background: '#bcd3f7' }} />
              Remaining ({(totalRemaining / (totalUsed + totalRemaining) * 100).toFixed(1)}%)
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Credits burned per course</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={COURSE_BURN}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} />
                <YAxis axisLine={false} tickLine={false} tick={tick} />
                <Tooltip />
                <Bar dataKey="burn" fill="#0056D2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Projections per institution</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-t border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className={th}>Institution</th>
                <th className={th}>Cost / student</th>
                <th className={th}>Cost / question</th>
                <th className={th}>Credits used</th>
                <th className={th}>Projected depletion</th>
              </tr>
            </thead>
            <tbody>
              {FINANCIAL_DATA.map((data, i) => {
                const pct = (data.used / (data.used + data.remaining)) * 100;
                return (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-5 py-3 font-semibold text-slate-900">{data.name}</td>
                    <td className="px-5 py-3 text-slate-700">${data.costPerStudent.toFixed(2)}</td>
                    <td className="px-5 py-3 text-slate-700">${data.costPerQuestion.toFixed(2)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600">{Math.round(pct)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold whitespace-nowrap">
                        <Clock size={14} aria-hidden="true" /> {data.depletion}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
