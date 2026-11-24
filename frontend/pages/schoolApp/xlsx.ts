// A small .xlsx reader and writer for the school app imports, with no library: an .xlsx file is a zip of XML parts.
//   readXlsx(bytes)  → the first sheet as rows of text (dates as YYYY-MM-DD, times as HH:MM), ready to send as CSV.
//   writeXlsx(sheets) → a workbook (stored, not compressed) for the templates.
// Compressed parts are inflated with the browser's DecompressionStream('deflate-raw').

const td = new TextDecoder();
const te = new TextEncoder();

type Entry = { name: string; method: number; compSize: number; offset: number };
function entries(b: Uint8Array): Entry[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not an Excel (.xlsx) file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged .xlsx file');
    const method = v.getUint16(p + 10, true), compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    out.push({ name: td.decode(b.subarray(p + 46, p + 46 + nameLen)), method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
async function part(b: Uint8Array, list: Entry[], name: string): Promise<string | null> {
  const e = list.find((x) => x.name === name);
  if (!e) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = b.subarray(start, start + e.compSize);
  if (e.method === 0) return td.decode(raw);
  if (e.method === 8) return td.decode(await inflate(raw));
  throw new Error('Unsupported .xlsx compression');
}

const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const pad = (n: number) => String(n).padStart(2, '0');
// Excel serial dates (1900 system): day 25569 is 1970-01-01.
function serialToText(x: number, kind: 'date' | 'time' | 'datetime'): string {
  const ms = Math.round((x - 25569) * 86_400_000);
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return kind === 'date' || (kind === 'datetime' && time === '00:00') ? date : kind === 'time' ? time : `${date} ${time}`;
}
function dateKinds(styles: string | null): ('date' | 'time' | 'datetime' | null)[] {
  if (!styles) return [];
  const doc = new DOMParser().parseFromString(styles, 'application/xml');
  const custom = new Map<number, string>();
  doc.querySelectorAll('numFmts numFmt').forEach((f) => custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || ''));
  const kindOf = (id: number): 'date' | 'time' | 'datetime' | null => {
    if ((id >= 14 && id <= 17) || id === 30) return 'date';
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return 'time';
    if (id === 22) return 'datetime';
    const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase();
    if (!code) return null;
    const d = /[dy]/.test(code) || /m{3,}/.test(code), t = /h|s/.test(code);
    return d && t ? 'datetime' : d ? 'date' : t ? 'time' : /m/.test(code) && !/[#0]/.test(code) ? 'date' : null;
  };
  return Array.from(doc.querySelectorAll('cellXfs > xf')).map((xf) => kindOf(Number(xf.getAttribute('numFmtId') || 0)));
}

/** The first worksheet of an .xlsx file as rows of text. */
export async function readXlsx(bytes: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const list = entries(b);
  const wb = await part(b, list, 'xl/workbook.xml');
  const rels = await part(b, list, 'xl/_rels/workbook.xml.rels');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (wb && rels) {
    const first = new DOMParser().parseFromString(wb, 'application/xml').querySelector('sheets > sheet');
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = Array.from(new DOMParser().parseFromString(rels, 'application/xml').querySelectorAll('Relationship')).find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, '/');
  }
  const sheet = await part(b, list, sheetPath);
  if (!sheet) throw new Error('The workbook has no sheet');
  const ssXml = await part(b, list, 'xl/sharedStrings.xml');
  const shared = ssXml ? Array.from(new DOMParser().parseFromString(ssXml, 'application/xml').querySelectorAll('sst > si')).map((si) => Array.from(si.querySelectorAll('t')).map((t) => t.textContent ?? '').join('')) : [];
  const kinds = dateKinds(await part(b, list, 'xl/styles.xml'));
  const doc = new DOMParser().parseFromString(sheet, 'application/xml');
  const rows: string[][] = [];
  doc.querySelectorAll('sheetData > row').forEach((r) => {
    const out: string[] = [];
    r.querySelectorAll('c').forEach((c, i) => {
      const ref = c.getAttribute('r');
      const col = ref ? colIndex(ref) : i;
      const type = c.getAttribute('t');
      const v = c.querySelector('v')?.textContent ?? '';
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = Array.from(c.querySelectorAll('is t')).map((t) => t.textContent ?? '').join('');
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') text = v;
      else if (v !== '') {
        const k = kinds[Number(c.getAttribute('s') || 0)];
        text = k ? serialToText(Number(v), k) : String(Number(v));
      }
      while (out.length < col) out.push('');
      out[col] = text.trim();
    });
    if (out.some((x) => x !== '')) rows.push(out);
  });
  return rows;
}

/** Rows to CSV text (what the import endpoint takes). */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

// --- writer -------------------------------------------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const name = te.encode(f.name); const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cSize = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** A workbook with one or more sheets of text cells (the first row bold), for the import templates. */
export function writeXlsx(sheets: { name: string; rows: string[][]; rtl?: boolean }[]): Uint8Array {
  const sheetXml = (s: { rows: string[][]; rtl?: boolean }) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${s.rtl ? ' rightToLeft="1"' : ''}/></sheetViews><cols><col min="1" max="${Math.max(1, ...s.rows.map((r) => r.length))}" width="20" customWidth="1"/></cols><sheetData>${s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(c)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = [
    { name: '[Content_Types].xml', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/></cellXfs></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: sheetXml(s) })),
  ];
  return zip(files.map((f) => ({ name: f.name, data: te.encode(f.xml) })));
}
