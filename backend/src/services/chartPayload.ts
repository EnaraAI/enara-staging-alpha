// Typed, versioned chart payload for educator analytics (chart-v1). The
// backend fills it from deterministic query results; nothing in it is
// executable. validateChart() runs on the server before a chart is returned
// and again in the browser before rendering (frontend/services/chartPayload.ts
// is a copy of this file and must stay identical in behaviour).

export const CHART_VERSION = 'chart-v1';
export const CHART_TYPES = ['bar', 'line', 'stacked_bar', 'donut'] as const;
export const CHART_UNITS = ['percent', 'count', 'score_percent', 'share_percent'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export type ChartUnit = (typeof CHART_UNITS)[number];

export interface ChartSeries {
  name: string;
  values: (number | null)[];
}
export interface ChartPayload {
  version: typeof CHART_VERSION;
  type: ChartType;
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  unit: ChartUnit;
  categories: string[];
  series: ChartSeries[];
  // Population and denominator in words, e.g. "18 graded students of 24".
  denominator: string;
  // line charts: ISO dates of the categories, strictly ascending.
  dates?: string[];
  period: { from: string; to: string };
  direction: 'ltr' | 'rtl';
}

export const CHART_LIMITS = { maxCategories: 24, maxSeries: 4, maxLabel: 80, maxText: 240, maxAbs: 1_000_000, maxBytes: 20_000, donutMax: 6 } as const;
const KEYS = new Set(['version', 'type', 'title', 'description', 'xLabel', 'yLabel', 'unit', 'categories', 'series', 'denominator', 'dates', 'period', 'direction']);

// Plain text only: no markup, no control characters, no script-like schemes.
export function isSafeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[<>`]/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/\b(javascript|data|vbscript)\s*:/i.test(value) &&
    !/\bon[a-z]+\s*=/i.test(value)
  );
}

export function validateChart(input: unknown): { ok: true; chart: ChartPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const p = input as Record<string, unknown>;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, errors: ['not an object'] };
  for (const k of Object.keys(p)) if (!KEYS.has(k)) errors.push(`unknown field ${k}`);
  if (p.version !== CHART_VERSION) errors.push('unsupported version');
  if (!CHART_TYPES.includes(p.type as ChartType)) errors.push('unsupported chart type');
  if (!CHART_UNITS.includes(p.unit as ChartUnit)) errors.push('unsupported unit');
  if (p.direction !== 'ltr' && p.direction !== 'rtl') errors.push('invalid direction');
  for (const k of ['title', 'description', 'denominator'] as const) if (!isSafeText(p[k], CHART_LIMITS.maxText)) errors.push(`unsafe or missing ${k}`);
  for (const k of ['xLabel', 'yLabel'] as const) if (!isSafeText(p[k], CHART_LIMITS.maxLabel)) errors.push(`unsafe or missing ${k}`);
  const period = p.period as Record<string, unknown> | undefined;
  if (!period || typeof period !== 'object' || !isIsoDate(period.from) || !isIsoDate(period.to) || Date.parse(period.from as string) > Date.parse(period.to as string)) errors.push('invalid period');
  const cats = p.categories;
  if (!Array.isArray(cats) || cats.length < 1 || cats.length > CHART_LIMITS.maxCategories) errors.push('category count out of range');
  else {
    if (!cats.every((c) => isSafeText(c, CHART_LIMITS.maxLabel))) errors.push('unsafe category label');
    if (new Set(cats).size !== cats.length) errors.push('duplicate category label');
  }
  const series = p.series;
  const n = Array.isArray(cats) ? cats.length : 0;
  if (!Array.isArray(series) || series.length < 1 || series.length > CHART_LIMITS.maxSeries) errors.push('series count out of range');
  else {
    const names = new Set<string>();
    for (const s of series as ChartSeries[]) {
      if (!s || typeof s !== 'object' || Object.keys(s).some((k) => k !== 'name' && k !== 'values')) { errors.push('invalid series'); continue; }
      if (!isSafeText(s.name, CHART_LIMITS.maxLabel)) errors.push('unsafe series name');
      if (names.has(s.name)) errors.push('duplicate series name');
      names.add(s.name);
      if (!Array.isArray(s.values) || s.values.length !== n) { errors.push('series length does not match categories'); continue; }
      if (!s.values.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= CHART_LIMITS.maxAbs))) errors.push('non-finite or out-of-range value');
    }
  }
  const all = Array.isArray(series) ? (series as ChartSeries[]).flatMap((s) => (Array.isArray(s?.values) ? s.values : [])) : [];
  if (p.type === 'line') {
    const d = p.dates;
    if (!Array.isArray(d) || d.length !== n || !d.every(isIsoDate)) errors.push('line chart needs one ISO date per category');
    else if (d.some((x, i) => i > 0 && Date.parse(x as string) <= Date.parse(d[i - 1] as string))) errors.push('line dates are not strictly ascending');
    if (n < 2) errors.push('line chart needs at least 2 points');
  } else if (p.dates !== undefined) errors.push('dates are only for line charts');
  if (p.type === 'donut') {
    if (!Array.isArray(series) || series.length !== 1) errors.push('donut needs exactly one series');
    if (n < 2 || n > CHART_LIMITS.donutMax) errors.push('donut needs 2-6 categories');
    if (!all.every((v) => typeof v === 'number' && v >= 0) || all.reduce<number>((a, v) => a + (v ?? 0), 0) <= 0) errors.push('donut values must be non-negative and sum above 0');
  }
  if (p.type === 'stacked_bar' && !all.every((v) => typeof v === 'number' && v >= 0)) errors.push('stacked values must be non-negative numbers');
  if (JSON.stringify(p).length > CHART_LIMITS.maxBytes) errors.push('payload too large');
  return errors.length ? { ok: false, errors } : { ok: true, chart: p as unknown as ChartPayload };
}

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(v) && Number.isFinite(Date.parse(v));
}
