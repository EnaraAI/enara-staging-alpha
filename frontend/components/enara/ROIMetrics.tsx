
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const COURSE_HEALTH = [
  { name: 'Advanced Mathematics', engagement: 92, confidence: 94, struggle: 12, institution: 'Global Tech' },
  { name: 'Intro to Physics', engagement: 84, confidence: 91, struggle: 18, institution: 'Future Skills' },
  { name: 'Business Ethics', engagement: 78, confidence: 82, struggle: 24, institution: 'Elite Learning' },
  { name: 'English Literature', engagement: 95, confidence: 96, struggle: 8, institution: 'Standard Uni' },
  { name: 'Computer Science', engagement: 88, confidence: 85, struggle: 22, institution: 'Cairo Central' },
];

const KPIS = [
  { label: 'Adoption rate', value: '84.2%', note: 'Active / enrolled' },
  { label: 'AI self-service', value: '94.1%', note: 'Handled by AI' },
  { label: 'Teacher hours saved', value: '12,482h', note: 'Across all orgs' },
  { label: 'Avg exam score', value: '+18.5%', note: 'Improvement YoY' },
];

export const ROIMetrics: React.FC = () => {
  const th = 'px-5 py-3 font-semibold';
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-slate-900">ROI &amp; impact</h1>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
        </div>
        <p className="mt-1 text-slate-600">Adoption, time saved and learning outcomes for partner institutions.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm text-slate-600">{k.label}</p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">{k.value}</p>
            <p className="mt-1 text-sm text-slate-600">{k.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Course engagement ranking</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={COURSE_HEALTH} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eef1f6" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} width={140} />
                <Tooltip />
                <Bar dataKey="engagement" fill="#0056D2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">Course health overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-t border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className={th}>Course</th>
                  <th className={`${th} text-right`}>RAG conf.</th>
                  <th className={`${th} text-right`}>Struggle</th>
                </tr>
              </thead>
              <tbody>
                {COURSE_HEALTH.map((course, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{course.name}</p>
                      <p className="text-xs text-slate-600">{course.institution}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${course.confidence < 85 ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{course.confidence}%</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-semibold ${course.struggle > 20 ? 'text-red-700' : 'text-slate-900'}`}>{course.struggle}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
