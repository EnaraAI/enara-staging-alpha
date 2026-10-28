
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

const HEALTH_DATA = [
  { time: '00:00', latency: 380, confidence: 94, requests: 120, users: 4200 },
  { time: '04:00', latency: 350, confidence: 95, requests: 80, users: 2100 },
  { time: '08:00', latency: 420, confidence: 92, requests: 450, users: 12500 },
  { time: '12:00', latency: 480, confidence: 91, requests: 820, users: 24100 },
  { time: '16:00', latency: 450, confidence: 93, requests: 680, users: 18400 },
  { time: '20:00', latency: 410, confidence: 94, requests: 320, users: 9200 },
];

const tick = { fill: '#475569', fontSize: 12 };

export const PlatformHealth: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-slate-900">Platform health</h1>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
        </div>
        <p className="mt-1 text-slate-600">AI answer quality, latency and load across the platform.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Avg RAG confidence</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">93.4%</p>
          <p className="mt-1 text-sm font-semibold text-green-700">Stable</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <p className="text-sm text-orange-800">Out-of-scope rate</p>
          <p className="mt-1 text-3xl font-extrabold text-orange-800">4.2%</p>
          <p className="mt-1 text-sm font-semibold text-orange-800">+0.5% spike</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Avg latency</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">420ms</p>
          <p className="mt-1 text-sm font-semibold text-green-700">-15ms improvement</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Requests / sec</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">820</p>
          <p className="mt-1 text-sm text-slate-600">Peak: 1,240 rps</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Latency &amp; confidence trends</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={HEALTH_DATA}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={tick} />
                <YAxis axisLine={false} tickLine={false} tick={tick} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="latency" name="Latency (ms)" stroke="#0056D2" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="confidence" name="Confidence (%)" stroke="#15803d" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Concurrent users <span className="text-sm font-normal text-slate-600">(peak 24.1k)</span></h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={HEALTH_DATA}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={tick} />
                <YAxis axisLine={false} tickLine={false} tick={tick} />
                <Tooltip />
                <Line type="monotone" dataKey="users" stroke="#0056D2" strokeWidth={2.5} dot={{ r: 3, fill: '#0056D2' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
