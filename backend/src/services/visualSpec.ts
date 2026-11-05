// Compact visual descriptions for the live avatar's panel and the chat tutor.
// The model describes the visual in a few hundred tokens of JSON instead of
// writing a whole HTML page (about 2,000 tokens, 8-9 s); the page is built
// here from fixed, escaped templates.

export type VisualSpec =
  | { kind: 'none' }
  | ({ title?: string; note?: string; rtl?: boolean } & (
      | { kind: 'table'; headers: string[]; rows: string[][] }
      | { kind: 'list'; items: { term: string; detail?: string }[] }
      | { kind: 'steps'; items: string[] }
      | { kind: 'dialogue'; lines: { speaker: string; text: string }[] }
      | { kind: 'timeline'; items: { when: string; text: string }[] }
      | { kind: 'svg'; svg: string; caption?: string }
    ));

export const VISUAL_SPEC_FORMAT = `Reply with ONLY one JSON object, no Markdown fences, in one of these shapes:
{"kind":"table","title":"...","headers":["...","..."],"rows":[["...","..."]]}
{"kind":"list","title":"...","items":[{"term":"...","detail":"..."}]}   (vocabulary, key points; detail is optional)
{"kind":"steps","title":"...","items":["...","..."]}   (worked steps, instructions)
{"kind":"dialogue","title":"...","lines":[{"speaker":"A","text":"..."}]}
{"kind":"timeline","title":"...","items":[{"when":"...","text":"..."}]}
{"kind":"svg","title":"...","svg":"<svg viewBox=\\"0 0 600 360\\" width=\\"100%\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>","caption":"..."}   (only for a real picture: shapes, a number line, a graph, a bar model)
Every shape may add "note" (one short line under it) and "rtl":true when it is in Arabic.
Pick the simplest shape that explains it; keep it short: at most 8 rows, items or lines, each under about 12 words.
For svg: shapes only plus at most 8 labels of at most 4 words, font-size 14 to 18, labels at least 14px from each other and from lines, 24px margin inside the viewBox, white background, blue #0056D2 accents.`;

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const str = (value: unknown, max = 300) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const arr = <T>(value: unknown, max = 12): T[] => (Array.isArray(value) ? (value.slice(0, max) as T[]) : []);

// Parses the model's reply; null when it isn't a usable description.
export function parseVisualSpec(text: string): VisualSpec | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const base = { title: str(raw.title, 120) || undefined, note: str(raw.note, 240) || undefined, rtl: raw.rtl === true };
  switch (raw.kind) {
    case 'none':
      return { kind: 'none' };
    case 'table': {
      const headers = arr<unknown>(raw.headers, 6).map((h) => str(h, 80));
      const rows = arr<unknown>(raw.rows, 10).map((r) => arr<unknown>(r, 6).map((c) => str(c, 160)));
      return rows.length ? { ...base, kind: 'table', headers, rows } : null;
    }
    case 'list': {
      const items = arr<Record<string, unknown>>(raw.items).map((i) => ({ term: str(i?.term ?? i, 120), detail: str(i?.detail, 200) || undefined })).filter((i) => i.term);
      return items.length ? { ...base, kind: 'list', items } : null;
    }
    case 'steps': {
      const items = arr<unknown>(raw.items).map((i) => str(i, 240)).filter(Boolean);
      return items.length ? { ...base, kind: 'steps', items } : null;
    }
    case 'dialogue': {
      const lines = arr<Record<string, unknown>>(raw.lines).map((l) => ({ speaker: str(l?.speaker, 40), text: str(l?.text, 240) })).filter((l) => l.text);
      return lines.length ? { ...base, kind: 'dialogue', lines } : null;
    }
    case 'timeline': {
      const items = arr<Record<string, unknown>>(raw.items).map((i) => ({ when: str(i?.when, 60), text: str(i?.text, 200) })).filter((i) => i.text);
      return items.length ? { ...base, kind: 'timeline', items } : null;
    }
    case 'svg': {
      const svg = str(raw.svg, 30_000);
      return /^<svg\b[\s\S]*<\/svg>$/i.test(svg) ? { ...base, kind: 'svg', svg, caption: str(raw.caption, 200) || undefined } : null;
    }
    default:
      return null;
  }
}

const STYLE = `<style>
*{box-sizing:border-box;max-width:100%}
body,.v{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:#fff}
.v{padding:20px 22px;font-size:17px;line-height:1.5}
h2{margin:0 0 14px;font-size:21px;color:#0056D2}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #dbe4f3;padding:9px 12px;text-align:start;vertical-align:top}
th{background:#eef4ff;color:#0b3d91}
ol,ul{margin:0;padding-inline-start:24px}
li{margin:0 0 10px}
.term{font-weight:600;color:#0b3d91}
.line{display:flex;gap:12px;margin:0 0 10px;align-items:baseline}
.who{flex:0 0 auto;min-width:64px;font-weight:600;color:#0056D2}
.tl{border-inline-start:3px solid #0056D2;padding-inline-start:16px}
.tl div{margin:0 0 12px}
.when{font-weight:600;color:#0b3d91;display:block}
.note{margin:14px 0 0;color:#475569;font-size:15px}
svg{width:100%;height:auto;display:block}
</style>`;

// Builds the panel's HTML from a description. All text is escaped; the SVG is
// sanitised by the caller with the same filter as model-written pages.
export function renderVisualSpec(spec: Exclude<VisualSpec, { kind: 'none' }>, sanitizeSvg: (svg: string) => string): string {
  const parts: string[] = [];
  if (spec.title) parts.push(`<h2>${esc(spec.title)}</h2>`);
  switch (spec.kind) {
    case 'table':
      parts.push(
        '<table>' +
          (spec.headers.some(Boolean) ? `<thead><tr>${spec.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : '') +
          `<tbody>${spec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      break;
    case 'list':
      parts.push(`<ul>${spec.items.map((i) => `<li><span class="term">${esc(i.term)}</span>${i.detail ? ` — ${esc(i.detail)}` : ''}</li>`).join('')}</ul>`);
      break;
    case 'steps':
      parts.push(`<ol>${spec.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`);
      break;
    case 'dialogue':
      parts.push(spec.lines.map((l) => `<div class="line"><span class="who">${esc(l.speaker)}</span><span>${esc(l.text)}</span></div>`).join(''));
      break;
    case 'timeline':
      parts.push(`<div class="tl">${spec.items.map((i) => `<div>${i.when ? `<span class="when">${esc(i.when)}</span>` : ''}${esc(i.text)}</div>`).join('')}</div>`);
      break;
    case 'svg':
      parts.push(sanitizeSvg(spec.svg));
      if (spec.caption) parts.push(`<p class="note">${esc(spec.caption)}</p>`);
      break;
  }
  if (spec.note) parts.push(`<p class="note">${esc(spec.note)}</p>`);
  return `${STYLE}<div class="v"${spec.rtl ? ' dir="rtl"' : ''}>${parts.join('')}</div>`;
}
