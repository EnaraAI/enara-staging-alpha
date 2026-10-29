import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { validateChart, type ChartPayload } from '../services/chartPayload';

// Class analytics report in AI Chat (analytics-v1). Everything shown comes
// from the server's computed result: plain text only (React escapes it; no
// HTML is ever injected), a data table for every report, and a chart only when
// its payload passes the same strict validator the server uses. The table is
// the accessible fallback: it is always rendered, so the report still reads
// without the chart (screen readers, narrow screens, chart errors).

export interface StudentProfileData { id: string; name: string; grade: string | null; className: string | null; courses: string[] }

export interface AnalyticsReportData {
  version: string;
  status: 'answered' | 'needs_clarification' | 'unsupported';
  intent: string | null;
  language: 'en' | 'ar';
  summary: string;
  period?: { from: string; to: string; days: number; defaulted: boolean };
  scope?: { classes: { id: string; name: string }[]; students: number; role: string };
  filters: string[];
  metrics: { key: string; label: string; value: number | null; unit: string; definition: string; n: number }[];
  table?: { columns: { key: string; label: string }[]; rows: Record<string, string | number | null>[]; truncated: boolean; totalRows: number };
  chart?: unknown;
  chartNote?: string;
  // P10: the student of a student report, and students to choose from.
  student?: StudentProfileData;
  candidates?: StudentProfileData[];
  sources: string[];
  caveats: string[];
  suggestions: string[];
  generatedAt: string;
}

// Dark, high-contrast series colours; values are also printed as labels, so
// meaning never depends on colour alone.
const COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c'];
const L = {
  en: { grade: 'Grade', klass: 'Class', courses: 'Courses', notRecorded: 'Not recorded', none: 'None in your scope', choose: 'Choose a student', period: 'Period', scope: 'Scope', classes: 'class(es)', students: 'student(s)', metrics: 'Key figures', n: 'n', table: 'Data', truncated: (s: number, t: number) => `Showing ${s} of ${t} rows.`, sources: 'Sources', caveats: 'Notes', suggestions: 'Suggestions', generated: 'Generated', chartUnavailable: 'The chart could not be shown; the table has the same data.', empty: 'No rows.', denominator: 'Based on' },
  ar: { grade: 'الصف الدراسي', klass: 'الفصل', courses: 'المقررات', notRecorded: 'غير مسجل', none: 'لا يوجد ضمن نطاقك', choose: 'اختر طالبًا', period: 'الفترة', scope: 'النطاق', classes: 'فصل', students: 'طالب', metrics: 'أرقام رئيسية', n: 'العدد', table: 'البيانات', truncated: (s: number, t: number) => `عرض ${s} من ${t} صفًا.`, sources: 'المصادر', caveats: 'ملاحظات', suggestions: 'اقتراحات', generated: 'وقت الإنشاء', chartUnavailable: 'تعذر عرض الرسم البياني؛ الجدول يعرض البيانات نفسها.', empty: 'لا توجد صفوف.', denominator: 'استنادًا إلى' },
};

const fmt = (v: number | string | null | undefined, unit?: string) =>
  v === null || v === undefined ? '—' : typeof v === 'number' && (unit === 'percent' || unit === 'score_percent' || unit === 'share_percent') ? `${v}%` : String(v);
const day = (iso: string) => iso.slice(0, 10);
const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

class ChartBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ChartView({ chart, width }: { chart: ChartPayload; width?: number }) {
  const rows = chart.categories.map((c, i) => Object.fromEntries([['category', c], ...chart.series.map((s) => [s.name, s.values[i]])]));
  const rtl = chart.direction === 'rtl';
  const unitFmt = (v: unknown) => fmt(v as number, chart.unit);
  // Tilt category labels when there are many or any is long, so they never overlap.
  const tilt = chart.categories.length > 4 || chart.categories.some((c) => c.length > 12);
  const axis = (
    // Line charts get end padding so the first and last points, their value
    // labels and their category ticks are not clipped by the plot edge.
    <XAxis dataKey="category" reversed={rtl} interval={0} padding={chart.type === 'line' ? { left: 30, right: 30 } : undefined} angle={tilt ? -25 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 80 : 30} tickFormatter={(v: string) => short(v)} label={{ value: chart.xLabel, position: 'insideBottom', offset: -2 }} />
  );
  const y = <YAxis orientation={rtl ? 'right' : 'left'} tickFormatter={unitFmt} label={{ value: chart.yLabel, angle: -90, position: rtl ? 'insideRight' : 'insideLeft' }} />;
  const body =
    chart.type === 'line' ? (
      <LineChart data={rows} margin={{ top: 16, right: 24, bottom: 16, left: tilt ? 110 : 24 }}>
        <CartesianGrid strokeDasharray="3 3" />{axis}{y}<Tooltip formatter={unitFmt} />{chart.series.length > 1 && <Legend />}
        {chart.series.map((s, i) => <Line key={s.name} type="linear" dataKey={s.name} stroke={COLORS[i]} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false}><LabelList dataKey={s.name} position="top" formatter={unitFmt} /></Line>)}
      </LineChart>
    ) : chart.type === 'donut' ? (
      <PieChart>
        <Pie data={chart.categories.map((c, i) => ({ name: c, value: chart.series[0].values[i] ?? 0 }))} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" isAnimationActive={false} label={({ name, value }) => `${short(String(name), 16)}: ${unitFmt(value)}`}>
          {chart.categories.map((c, i) => <Cell key={c} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={unitFmt} /><Legend />
      </PieChart>
    ) : (
      <BarChart data={rows} margin={{ top: 16, right: 24, bottom: 16, left: tilt ? 110 : 24 }}>
        <CartesianGrid strokeDasharray="3 3" />{axis}{y}<Tooltip formatter={unitFmt} />{chart.series.length > 1 && <Legend />}
        {chart.series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i]} stackId={chart.type === 'stacked_bar' ? 'stack' : undefined} isAnimationActive={false}><LabelList dataKey={s.name} position={chart.type === 'stacked_bar' ? 'center' : 'top'} formatter={unitFmt} fill={chart.type === 'stacked_bar' ? '#ffffff' : '#0f172a'} /></Bar>)}
      </BarChart>
    );
  return (
    // Charts are drawn left-to-right with the x-axis reversed for Arabic, so
    // the first category sits on the right; text around them follows `dir`.
    <div dir="ltr" style={{ width: '100%', height: 300 }}>
      {width ? React.cloneElement(body, { width, height: 300 }) : <ResponsiveContainer width="100%" height="100%">{body}</ResponsiveContainer>}
    </div>
  );
}

function ProfileLine({ p, t }: { p: StudentProfileData; t: (typeof L)['en'] }) {
  return (
    <span dir="auto">
      <span className="font-semibold">{p.name}</span>
      {' · '}{t.grade}: {p.grade ?? t.notRecorded}{' · '}{t.klass}: {p.className ?? t.notRecorded}{' · '}{t.courses}: {p.courses.length ? p.courses.join(', ') : t.none}
    </span>
  );
}

export function AnalyticsReport({ report, chartWidth, onPickStudent }: { report: AnalyticsReportData; chartWidth?: number; onPickStudent?: (id: string) => void }) {
  const t = L[report.language === 'ar' ? 'ar' : 'en'];
  const checked = report.chart === undefined ? null : validateChart(report.chart);
  const chart = checked && checked.ok ? checked.chart : null;
  const tableId = `analytics-table-${report.generatedAt.replace(/[^0-9]/g, '')}`;
  return (
    <div dir={report.language === 'ar' ? 'rtl' : 'ltr'} className="space-y-3 text-sm" data-testid="analytics-report">
      <p className="whitespace-pre-wrap">{report.summary}</p>
      {report.student && <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 p-2"><ProfileLine p={report.student} t={t} /></p>}
      {report.candidates && report.candidates.length > 0 && (
        <section aria-label={t.choose}>
          <ul className="space-y-1">
            {report.candidates.map((c) => (
              <li key={c.id}>
                {onPickStudent ? (
                  <button type="button" onClick={() => onPickStudent(c.id)} className="text-start w-full rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-50 focus:outline focus:outline-2 focus:outline-indigo-600"><ProfileLine p={c} t={t} /></button>
                ) : (
                  <ProfileLine p={c} t={t} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(report.period || report.scope) && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {report.period && <div><dt className="inline font-semibold">{t.period}: </dt><dd className="inline">{day(report.period.from)} → {day(report.period.to)} ({report.period.days})</dd></div>}
          {report.scope && <div><dt className="inline font-semibold">{t.scope}: </dt><dd className="inline">{report.scope.classes.length} {t.classes} · {report.scope.students} {t.students}{report.scope.classes.length <= 3 ? ` (${report.scope.classes.map((c) => c.name).join(', ')})` : ''}</dd></div>}
        </dl>
      )}
      {report.metrics.length > 0 && (
        <section aria-label={t.metrics}>
          <ul className="grid sm:grid-cols-3 gap-2">
            {report.metrics.map((m) => (
              <li key={m.key} className="rounded-lg border border-slate-200 p-2">
                <p className="text-xs text-slate-600">{m.label}</p>
                <p className="text-lg font-semibold text-slate-900">{fmt(m.value, m.unit)}</p>
                <p className="text-[11px] text-slate-500">{t.n} = {m.n}. {m.definition}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {chart && (
        <figure className="rounded-lg border border-slate-200 p-2" aria-describedby={tableId}>
          <figcaption className="text-sm font-semibold text-slate-800">{chart.title}</figcaption>
          <p className="text-xs text-slate-600">{chart.description} {t.denominator}: {chart.denominator}. {t.period}: {day(chart.period.from)} → {day(chart.period.to)}.</p>
          <ChartBoundary fallback={<p role="note" className="text-xs text-amber-800">{t.chartUnavailable}</p>}>
            <div role="img" aria-label={`${chart.title}. ${chart.description}`}>
              <ChartView chart={chart} width={chartWidth} />
            </div>
          </ChartBoundary>
        </figure>
      )}
      {checked && !checked.ok && <p role="note" className="text-xs text-amber-800">{t.chartUnavailable}</p>}
      {report.chartNote && <p role="note" className="text-xs text-slate-600">{report.chartNote}</p>}
      {report.table && (
        <div className="overflow-x-auto">
          <table id={tableId} className="min-w-full text-xs border border-slate-200">
            <caption className="text-start font-semibold text-slate-800 p-1">{chart?.title ?? t.table}</caption>
            <thead className="bg-slate-50">
              <tr>{report.table.columns.map((c) => <th key={c.key} scope="col" className="p-1.5 text-start">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {report.table.rows.length === 0 && <tr><td colSpan={report.table.columns.length} className="p-1.5 text-slate-500">{t.empty}</td></tr>}
              {report.table.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">{report.table!.columns.map((c) => <td key={c.key} className="p-1.5" dir="auto">{fmt(r[c.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {report.table.truncated && <p className="text-xs text-slate-500 mt-1">{t.truncated(report.table.rows.length, report.table.totalRows)}</p>}
        </div>
      )}
      {report.caveats.length > 0 && <section><h3 className="text-xs font-semibold text-slate-700">{t.caveats}</h3><ul className="list-disc ps-5 text-xs text-slate-600">{report.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
      {report.suggestions.length > 0 && <section><h3 className="text-xs font-semibold text-slate-700">{t.suggestions}</h3><ul className="list-disc ps-5 text-xs text-slate-600">{report.suggestions.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
      {report.sources.length > 0 && <section><h3 className="text-xs font-semibold text-slate-700">{t.sources}</h3><ul className="list-disc ps-5 text-[11px] text-slate-500">{report.sources.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
      <p className="text-[11px] text-slate-400">{t.generated}: {report.generatedAt.replace('T', ' ').slice(0, 16)} UTC</p>
    </div>
  );
}
