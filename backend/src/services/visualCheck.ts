// Visual check (owner, 22 Nov 2026: "improve the drawings"). The avatar's screen pictures from the test calls had labels on top of each other
// or on lines (the sun picture), a small shape nobody explained (a red dot), an abstract scene (the zoo) and a line that added something
// the learner never said ("and I have two brothers"). Code now checks every drawing before it is shown:
// - fixSvgLayout: moves a label that overlaps another label or sits on a line to the nearest free place (estimated text boxes);
// - svgProblems: what is still wrong after that (overlap, a label outside the picture, a small shape with no label near it);
// - contentProblems: a line of the visual that brings in words found nowhere in the conversation.
// A drawing with problems gets one redo with the reasons (avatarVisuals.ts); if the redo still has problems, a clean text card is shown.

type Box = { x0: number; y0: number; x1: number; y1: number };
type Txt = { start: number; end: number; attrs: string; text: string; x: number; y: number; fs: number; anchor: string };
const num = (attrs: string, name: string): number | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']?(-?[\\d.]+)`, 'i').exec(attrs);
  return m ? Number(m[1]) : undefined;
};
const fontSize = (attrs: string): number => {
  const a = num(attrs, 'font-size'); if (a) return a;
  const m = /font-size\s*:\s*([\d.]+)/i.exec(attrs); return m ? Number(m[1]) : 16;
};
function viewBox(svg: string): { w: number; h: number } {
  const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 600, h: 360 };
}
function texts(svg: string): Txt[] {
  const out: Txt[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const attrs = m[1]; const x = num(attrs, 'x'); const y = num(attrs, 'y');
    if (x === undefined || y === undefined) continue;
    const anchor = (/text-anchor\s*[=:]\s*["']?(start|middle|end)/i.exec(attrs)?.[1] ?? 'start').toLowerCase();
    out.push({ start: m.index!, end: m.index! + m[0].length, attrs, text: m[2].replace(/<[^>]+>/g, '').trim(), x, y, fs: fontSize(attrs), anchor });
  }
  return out;
}
const boxOf = (t: { text: string; x: number; y: number; fs: number; anchor: string }): Box => {
  const w = Math.max(1, [...t.text].length) * t.fs * 0.56; const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { x0, y0: t.y - t.fs * 0.85, x1: x0 + w, y1: t.y + t.fs * 0.25 };
};
const pad = (b: Box, p: number): Box => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
type Seg = [number, number, number, number];
function lines(svg: string): Seg[] {
  const out: Seg[] = [];
  for (const m of svg.matchAll(/<line\b([^>]*)\/?>/gi)) {
    const a = m[1]; const v = ['x1', 'y1', 'x2', 'y2'].map((n) => num(a, n));
    if (v.every((x) => x !== undefined)) out.push(v as Seg);
  }
  // Box outlines (not the background) are lines too: a label must not sit on a box edge.
  const vb = viewBox(svg);
  for (const m of svg.matchAll(/<rect\b([^>]*)\/?>/gi)) {
    const a = m[1]; const w = num(a, 'width'); const h = num(a, 'height'); const x = num(a, 'x') ?? 0; const y = num(a, 'y') ?? 0;
    if (w === undefined || h === undefined || w * h >= vb.w * vb.h * 0.8 || w <= 30 || h <= 30) continue;
    out.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
  }
  // Paths and polylines, roughly: straight pieces through their points (a curve's control point included), enough to see a label on a curve.
  for (const m of svg.matchAll(/<(?:path\b[^>]*\bd|polyline\b[^>]*\bpoints)\s*=\s*["']([^"']+)["']/gi)) {
    const n = (m[1].match(/-?[\d.]+/g) ?? []).map(Number);
    for (let i = 0; i + 3 < n.length; i += 2) out.push([n[i], n[i + 1], n[i + 2], n[i + 3]]);
  }
  return out;
}
const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
const segsCross = (a: Seg, b: Seg) => ccw(a[0], a[1], b[0], b[1], b[2], b[3]) !== ccw(a[2], a[3], b[0], b[1], b[2], b[3]) && ccw(a[0], a[1], a[2], a[3], b[0], b[1]) !== ccw(a[0], a[1], a[2], a[3], b[2], b[3]);
function segHitsBox(s: Seg, b: Box): boolean {
  const inside = (x: number, y: number) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  if (inside(s[0], s[1]) || inside(s[2], s[3])) return true;
  const edges: Seg[] = [[b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0]];
  return edges.some((e) => segsCross(s, e));
}
type Shape = { cx: number; cy: number; size: number; kind: string };
function smallShapes(svg: string, vb: { w: number; h: number }): Shape[] {
  const out: Shape[] = [];
  for (const m of svg.matchAll(/<circle\b([^>]*)\/?>/gi)) { const a = m[1]; const r = num(a, 'r'); const cx = num(a, 'cx'); const cy = num(a, 'cy'); if (r !== undefined && cx !== undefined && cy !== undefined && r <= 22) out.push({ cx, cy, size: r, kind: 'circle' }); }
  for (const m of svg.matchAll(/<rect\b([^>]*)\/?>/gi)) {
    const a = m[1]; const w = num(a, 'width'); const h = num(a, 'height'); const x = num(a, 'x') ?? 0; const y = num(a, 'y') ?? 0;
    if (w !== undefined && h !== undefined && w <= 30 && h <= 30 && w * h < vb.w * vb.h * 0.5) out.push({ cx: x + w / 2, cy: y + h / 2, size: Math.max(w, h) / 2, kind: 'rect' });
  }
  return out;
}
const setX = (attrs: string, x: number) => attrs.replace(/((?:^|\s)x\s*=\s*["']?)-?[\d.]+/, `$1${Math.round(x)}`);
const setY = (attrs: string, y: number) => (/(?:^|\s)y\s*=/.test(attrs) ? attrs.replace(/((?:^|\s)y\s*=\s*["']?)-?[\d.]+/, `$1${Math.round(y)}`) : `${attrs} y="${Math.round(y)}"`);

/** Moves labels that overlap another label or sit on a line to the nearest free place (up or down, within the picture). */
export function fixSvgLayout(svg: string): { svg: string; moved: number } {
  const vb = viewBox(svg); const segs = lines(svg); const ts = texts(svg);
  const dots: Box[] = smallShapes(svg, vb).map((d) => ({ x0: d.cx - d.size, y0: d.cy - d.size, x1: d.cx + d.size, y1: d.cy + d.size }));
  const placed: Box[] = [...dots]; let moved = 0; const dxOf = new Map<number, number>(); const newY = new Map<number, number>();
  for (const t of ts) {
    const free = (y: number) => { const b = pad(boxOf({ ...t, y }), 5); return b.y0 >= 0 && b.y1 <= vb.h && !placed.some((p) => hit(p, b)) && !segs.some((s) => segHitsBox(s, b)); };
    let y = t.y;
    if (!free(y)) {
      const step = Math.ceil(t.fs * 0.6);
      const freeAt = (dx: number, y: number) => { const b = pad(boxOf({ ...t, x: t.x + dx, y }), 5); return b.x0 >= 0 && b.x1 <= vb.w && b.y0 >= 0 && b.y1 <= vb.h && !placed.some((p) => hit(p, b)) && !segs.some((s) => segHitsBox(s, b)); };
      /* at most about 2.5 label heights up or down, or a little sideways, so the label stays next to what it names */
      const tries: [number, number][] = [];
      for (let k = 1; k <= 4; k++) tries.push([0, k * step], [0, -k * step]);
      for (const dx of [-24, 24, -48, 48]) for (const dy of [0, step, -step]) tries.push([dx, dy]);
      const ok = tries.find(([dx, dy]) => freeAt(dx, t.y + dy));
      if (ok) { y = t.y + ok[1]; dxOf.set(t.start, ok[0]); }
      if (y !== t.y || dxOf.get(t.start)) { moved += 1; newY.set(t.start, y); }
    }
    placed.push(pad(boxOf({ ...t, x: t.x + (dxOf.get(t.start) ?? 0), y }), 3));
  }
  if (!moved) return { svg, moved };
  let out = ''; let last = 0;
  for (const t of ts) {
    if (!newY.has(t.start)) continue;
    out += svg.slice(last, t.start) + svg.slice(t.start, t.end).replace(t.attrs, setX(setY(t.attrs, newY.get(t.start)!), t.x + (dxOf.get(t.start) ?? 0))); last = t.end;
  }
  return { svg: out + svg.slice(last), moved };
}

/** What is still wrong with a drawing (empty: fine). */
export function svgProblems(svg: string): string[] {
  const vb = viewBox(svg); const ts = texts(svg); const segs = lines(svg); const out: string[] = [];
  const boxes = ts.map((t) => boxOf(t));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) out.push(`the labels "${ts[i].text}" and "${ts[j].text}" overlap`);
  const dots = smallShapes(svg, vb).map((d) => ({ x0: d.cx - d.size, y0: d.cy - d.size, x1: d.cx + d.size, y1: d.cy + d.size }));
  ts.forEach((t, i) => { const b = boxes[i]; if (dots.some((d) => hit(d, b))) out.push(`the label "${t.text}" covers a shape`); if (b.x0 < 0 || b.x1 > vb.w || b.y0 < 0 || b.y1 > vb.h) out.push(`the label "${t.text}" goes outside the picture`); if (segs.some((s) => segHitsBox(s, pad(b, 2)))) out.push(`a line runs through the label "${t.text}"`); });
  for (const s of smallShapes(svg, vb)) {
    const near = boxes.some((b) => { const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2; return Math.hypot(cx - s.cx, cy - s.cy) <= s.size + 60; });
    if (!near) out.push(`a small ${s.kind} with no label near it`);
  }
  return [...new Set(out)].slice(0, 6);
}

const STOP = new Set('the a an and or but to of in on at for with from by is are was were be been am it its this that these those you your yours me my mine we our us they them their he she him her his hers i do does did have has had can will would should could not no yes so then than too very just also only now here there what when where why how who which say said write try again next first second third step start add more detail details idea ideas own full smoother connect connector starter reason reasons because one two three four five six seven eight nine ten use make like good great nice right wrong sentence word words question answer full simple own example picture screen'.split(' '));
const content = (s: string) => (s.toLowerCase().normalize('NFKC').match(/[\p{L}]{4,}/gu) ?? []).filter((w) => !STOP.has(w));
const FIRST_PERSON = /\b(i|my|me|we|our|i'm|i've)\b|أنا|عندي|لدي|لديّ/i;
/** Lines in the learner's voice (I, my, we) that bring in a word found nowhere in the conversation (a made-up fact or sentence), apart from
 * instruction words. Steps for a drawing the learner asked for ("Draw a base") are not checked. */
export function contentProblems(lines: string[], conversation: string): string[] {
  const seen = new Set(content(conversation).map((w) => w.replace(/(s|es|ed|ing)$/, '')));
  const out: string[] = [];
  for (const line of lines) {
    if (!FIRST_PERSON.test(line)) continue; // only a sentence in the learner's voice can put words in their mouth
    const fresh = content(line).filter((w) => !seen.has(w.replace(/(s|es|ed|ing)$/, '')));
    if (fresh.length >= 1) out.push(`"${line.slice(0, 80)}" adds things not in the conversation (${fresh.slice(0, 4).join(', ')})`);
  }
  return out.slice(0, 4);
}

export const VISUAL_RULES_EXTRA = [
  'Use only what was said in the conversation: never add new facts, people or sentences of your own.',
  'Never write people\'s names from the student\'s message (speech-to-text often mishears them); write "my friend", "my sister" and so on.',
  'Prefer table, list, steps or dialogue. Use svg only for a concrete picture (where things are, a shape, a number line, a bar model), with',
  'at most 5 objects, each one labelled once, the label in clear space above or below its object and never on a line; no decoration',
  '(no dots, stars or lines that mean nothing).',
].join(' ');
