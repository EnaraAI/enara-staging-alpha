// Maths pictures drawn by code (owner, 22 Nov 2026: "do both"). In the visual samples the model drew "7 take away 3" with the jumps between
// the wrong numbers. For number lines, fraction bars and shapes with measurements the model now only gives the numbers (a small JSON shape);
// code draws the picture to scale and works out the result itself, so the picture and the answer are always right. English or Arabic
// (Arabic digits and words when rtl).

export type NumberLine = { kind: 'numberline'; start: number; change: number };
export type Fractions = { kind: 'fractions'; bars: { num: number; den: number }[]; op?: '+' | '-' };
export type Shape = { kind: 'shape'; shape: 'rectangle' | 'square' | 'triangle' | 'circle'; width?: number; height?: number; base?: number; radius?: number; unit?: string; show?: 'area' | 'perimeter' };
export type MathSpec = NumberLine | Fractions | Shape;

export const MATH_SPEC_FORMAT = `For a number line, fractions or a shape with measurements, ALWAYS use one of these (code draws them exactly; never draw them in svg):
{"kind":"numberline","title":"...","start":7,"change":-3}   (start, then add change: -3 = take away 3)
{"kind":"fractions","title":"...","bars":[{"num":2,"den":8},{"num":3,"den":8}],"op":"+"}   (op "+" or "-" adds the result bar; leave it out to just show the bars)
{"kind":"shape","title":"...","shape":"rectangle","width":7,"height":3,"unit":"cm","show":"perimeter"}   (shape: rectangle, square, triangle (base, height), circle (radius); show: area or perimeter)`;

const num = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };
const int = (v: unknown, lo: number, hi: number): number | undefined => { const n = num(v); return n !== undefined && Number.isInteger(n) && n >= lo && n <= hi ? n : undefined; };

/** The numbers from the model's JSON (null when they are not usable: the caller then falls back to the other shapes). */
export function parseMathSpec(raw: Record<string, unknown>): MathSpec | null {
  switch (raw.kind) {
    case 'numberline': {
      const start = int(raw.start, -50, 100); const change = int(raw.change, -50, 50);
      return start !== undefined && change !== undefined && change !== 0 ? { kind: 'numberline', start, change } : null;
    }
    case 'fractions': {
      const bars = (Array.isArray(raw.bars) ? raw.bars : []).slice(0, 3).map((b) => ({ num: int((b as Record<string, unknown>)?.num, 0, 24), den: int((b as Record<string, unknown>)?.den, 1, 24) }))
        .filter((b): b is { num: number; den: number } => b.num !== undefined && b.den !== undefined && b.num <= b.den * 2);
      const op = raw.op === '+' || raw.op === '-' ? raw.op : undefined;
      return bars.length ? { kind: 'fractions', bars, ...(op && bars.length === 2 ? { op } : {}) } : null;
    }
    case 'shape': {
      const shape = ['rectangle', 'square', 'triangle', 'circle'].includes(String(raw.shape)) ? (raw.shape as Shape['shape']) : null;
      if (!shape) return null;
      const pos = (v: unknown) => { const n = num(v); return n !== undefined && n > 0 && n <= 1000 ? n : undefined; };
      const s: Shape = { kind: 'shape', shape, width: pos(raw.width), height: pos(raw.height), base: pos(raw.base), radius: pos(raw.radius), unit: typeof raw.unit === 'string' ? raw.unit.slice(0, 8) : undefined,
        show: raw.show === 'area' || raw.show === 'perimeter' ? raw.show : undefined };
      if (shape === 'square') s.height = s.width = s.width ?? s.height;
      const ok = shape === 'circle' ? s.radius : shape === 'triangle' ? s.base && s.height : s.width && s.height;
      return ok ? s : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------- drawing
const AR = '٠١٢٣٤٥٦٧٨٩';
const digits = (s: string, rtl: boolean) => (rtl ? s.replace(/\d/g, (d) => AR[Number(d)]).replace(/\./g, '٫') : s);
const fmt = (n: number, rtl: boolean) => digits(String(Math.round(n * 100) / 100), rtl);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BLUE = '#0056D2'; const LIGHT = '#dbe7fb'; const INK = '#0f172a';
const T = (x: number, y: number, s: string, o: { size?: number; color?: string; weight?: number; anchor?: string } = {}) =>
  `<text x="${Math.round(x)}" y="${Math.round(y)}" font-size="${o.size ?? 16}" fill="${o.color ?? INK}" text-anchor="${o.anchor ?? 'middle'}"${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`;
const svg = (h: number, body: string) => `<svg viewBox="0 0 600 ${h}" width="100%" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="${h}" fill="#ffffff"/>${body}</svg>`;
const W = (rtl: boolean, en: string, ar: string) => (rtl ? ar : en);

function numberLine(s: NumberLine, rtl: boolean): { svg: string; result: string } {
  const end = s.start + s.change;
  const lo = Math.min(s.start, end, 0); const hi = Math.max(s.start, end) + 1;
  const span = hi - lo; const step = span <= 20 ? 1 : span <= 50 ? 5 : 10;
  const x0 = 40; const x1 = 560; const X = (v: number) => x0 + ((v - lo) / span) * (x1 - x0); const y = 190;
  let b = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${INK}" stroke-width="2"/>`;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) b += `<line x1="${X(v)}" y1="${y - 8}" x2="${X(v)}" y2="${y + 8}" stroke="${INK}" stroke-width="2"/>${T(X(v), y + 30, fmt(v, rtl))}`;
  // One arc per unit for small changes (count the jumps), else one arc.
  const n = Math.abs(s.change) <= 12 ? Math.abs(s.change) : 1; const d = s.change / n;
  for (let i = 0; i < n; i++) {
    const a = X(s.start + i * d); const c = X(s.start + (i + 1) * d); const h = Math.min(60, 24 + Math.abs(c - a) * 0.35);
    b += `<path d="M${a} ${y - 10} Q${(a + c) / 2} ${y - 10 - h * 2} ${c} ${y - 10}" fill="none" stroke="${BLUE}" stroke-width="3"/>`;
    b += `<path d="M${c} ${y - 10} l${c < a ? 9 : -9} -9 l${c < a ? 3 : -3} 11 z" fill="${BLUE}"/>`;
  }
  b += `<circle cx="${X(s.start)}" cy="${y}" r="7" fill="#ffffff" stroke="${BLUE}" stroke-width="3"/><circle cx="${X(end)}" cy="${y}" r="8" fill="${BLUE}"/>`;
  b += T(X(s.start), y - 92, W(rtl, `start ${fmt(s.start, false)}`, `نبدأ من ${fmt(s.start, true)}`), { color: BLUE, size: 15 });
  b += T(X(end), y + 60, W(rtl, `end ${fmt(end, false)}`, `نصل إلى ${fmt(end, true)}`), { color: BLUE, size: 15, weight: 700 });
  const sign = s.change < 0 ? '−' : '+';
  return { svg: svg(270, b), result: digits(`${s.start} ${sign} ${Math.abs(s.change)} = ${end}`, rtl) };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
function fractions(s: Fractions, rtl: boolean): { svg: string; result: string } {
  const bars = [...s.bars];
  let result = '';
  if (s.op && bars.length === 2) {
    const [a, b] = bars; const den = (a.den * b.den) / gcd(a.den, b.den);
    const n = (s.op === '+' ? 1 : -1) * b.num * (den / b.den) + a.num * (den / a.den);
    if (n >= 0 && n <= den * 2) {
      bars.push({ num: n, den });
      const g = gcd(n, den); const simple = g > 1 && n > 0 ? ` = ${n / g}/${den / g}` : '';
      result = digits(`${a.num}/${a.den} ${s.op === '+' ? '+' : '−'} ${b.num}/${b.den} = ${n}/${den}${simple}`, rtl);
    }
  }
  const rowH = 74; let b = '';
  bars.forEach((f, i) => {
    const y = 28 + i * rowH; const x0 = 140; const w = 400; const whole = Math.max(1, Math.ceil(f.num / f.den));
    for (let k = 0; k < whole; k++) {
      const bx = x0 + k * (w / whole + 6) / 1; const bw = w / whole - (whole > 1 ? 6 : 0); const part = bw / f.den;
      for (let j = 0; j < f.den; j++) b += `<rect x="${bx + j * part}" y="${y}" width="${part}" height="38" fill="${k * f.den + j < f.num ? BLUE : '#ffffff'}" stroke="${BLUE}" stroke-width="2"/>`;
    }
    const label = i === 2 ? `= ${f.num}/${f.den}` : i === 1 && s.op ? `${s.op === '+' ? '+' : '−'} ${f.num}/${f.den}` : `${f.num}/${f.den}`;
    b += T(70, y + 26, digits(label, rtl), { size: 20, weight: 700, color: i === 2 ? BLUE : INK });
  });
  return { svg: svg(28 + bars.length * rowH, b), result };
}

function shape(s: Shape, rtl: boolean): { svg: string; result: string } {
  const u = s.unit ? ` ${s.unit}` : ''; const u2 = s.unit ? ` ${s.unit}²` : ''; const L = (v: number) => digits(`${fmt(v, false)}${u}`, rtl);
  let b = ''; let result = '';
  if (s.shape === 'circle') {
    const r = s.radius!;
    b += `<circle cx="300" cy="150" r="100" fill="${LIGHT}" stroke="${BLUE}" stroke-width="3"/><line x1="300" y1="150" x2="400" y2="150" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 5"/>`;
    b += T(350, 140, `${W(rtl, 'r', 'نق')} = ${L(r)}`, { color: BLUE });
    if (s.show === 'area') result = digits(`${W(rtl, 'Area', 'المساحة')} = π × ${fmt(r, false)}² ≈ ${fmt(Math.PI * r * r, false)}${u2}`, rtl);
    if (s.show === 'perimeter') result = digits(`${W(rtl, 'Circumference', 'المحيط')} = 2 × π × ${fmt(r, false)} ≈ ${fmt(2 * Math.PI * r, false)}${u}`, rtl);
    return { svg: svg(300, b), result };
  }
  const bw = s.shape === 'triangle' ? s.base! : s.width!; const bh = s.height!;
  const k = Math.min(380 / bw, 190 / bh); const w = bw * k; const h = bh * k; const x = 300 - w / 2; const y = 60;
  if (s.shape === 'triangle') {
    const apex = x + w / 2;
    b += `<path d="M${x} ${y + h} L${x + w} ${y + h} L${apex} ${y} Z" fill="${LIGHT}" stroke="${BLUE}" stroke-width="3"/><line x1="${apex}" y1="${y}" x2="${apex}" y2="${y + h}" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 5"/>`;
    b += T(300, y + h + 28, `${W(rtl, 'base', 'القاعدة')} = ${L(bw)}`, { color: BLUE }) + T(apex + 100, y + h / 2, `${W(rtl, 'height', 'الارتفاع')} = ${L(bh)}`, { color: BLUE });
    if (s.show === 'area') result = digits(`${W(rtl, 'Area', 'المساحة')} = ½ × ${fmt(bw, false)} × ${fmt(bh, false)} = ${fmt(bw * bh / 2, false)}${u2}`, rtl);
  } else {
    b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${LIGHT}" stroke="${BLUE}" stroke-width="3"/>`;
    b += T(300, y - 12, L(bw), { color: BLUE }) + T(300, y + h + 28, L(bw), { color: BLUE });
    // Centred labels with a margin: 'start'/'end' flip in right-to-left pages and put a label on the edge.
    b += T(x - 44, y + h / 2 + 5, L(bh), { color: BLUE }) + T(x + w + 44, y + h / 2 + 5, L(bh), { color: BLUE });
    if (s.show === 'area') result = digits(`${W(rtl, 'Area', 'المساحة')} = ${fmt(bw, false)} × ${fmt(bh, false)} = ${fmt(bw * bh, false)}${u2}`, rtl);
    if (s.show === 'perimeter') result = digits(`${W(rtl, 'Perimeter', 'المحيط')} = ${fmt(bw, false)} + ${fmt(bh, false)} + ${fmt(bw, false)} + ${fmt(bh, false)} = ${fmt(2 * (bw + bh), false)}${u}`, rtl);
  }
  return { svg: svg(Math.round(y + h + 50), b), result };
}

/** The picture (an svg) and the result line, both worked out by code. */
export function drawMath(s: MathSpec, rtl: boolean): { svg: string; result: string } {
  return s.kind === 'numberline' ? numberLine(s, rtl) : s.kind === 'fractions' ? fractions(s, rtl) : shape(s, rtl);
}
