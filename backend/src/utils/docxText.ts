import { inflateRawSync } from 'zlib';

// Text from a .docx (Office Open XML) file using only Node built-ins: a
// bounded reader for the ZIP container and a small reader for
// word/document.xml (P2). No macros, embedded objects, images or external
// relationships are read or executed; the content is treated as data.
// Word files have no fixed pages, so the text is split into sections at
// headings, labelled "Section N" (with the heading text when there is one).

const MAX_XML_BYTES = 20 * 1024 * 1024; // uncompressed document.xml
const MAX_ENTRIES = 5000;

export class DocxError extends Error {}

function findEntry(zip: Buffer, wanted: string): Buffer {
  // End of central directory: last 22..(22+64K) bytes.
  const minEocd = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= minEocd; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError('Not a valid Word file (no ZIP directory)');
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  if (entries > MAX_ENTRIES) throw new DocxError('Word file has too many parts');
  for (let n = 0; n < entries; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) throw new DocxError('Word file directory is damaged');
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;
    if (flags & 0x1) throw new DocxError('Encrypted Word files are not supported');
    if (size > MAX_XML_BYTES || compressed === 0xffffffff) throw new DocxError('Word document text is too large');
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new DocxError('Word file is damaged');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + compressed);
    if (data.length !== compressed) throw new DocxError('Word file is truncated');
    if (method === 0) return data;
    if (method !== 8) throw new DocxError('Unsupported compression in Word file');
    // maxOutputLength stops a decompression bomb.
    return inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
  }
  throw new DocxError('Not a Word document (word/document.xml missing)');
}

const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'amp') return '&';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });

export interface DocxSection {
  label: string;
  text: string;
}

// Paragraphs in reading order; a heading (Heading1-3, Title) starts a section.
export function docxSections(body: Buffer): DocxSection[] {
  const xml = findEntry(body, 'word/document.xml').toString('utf8');
  const sections: DocxSection[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    if (lines.join('').trim()) {
      const n = sections.length + 1;
      sections.push({ label: heading ? `Section ${n}: ${heading.slice(0, 80)}` : `Section ${n}`, text: lines.join('\n\n') });
    }
    lines = [];
  };
  for (const para of xml.split(/<\/w:p>/)) {
    const start = para.lastIndexOf('<w:p');
    if (start < 0) continue;
    const p = para.slice(start);
    let text = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)) {
      text += m[1] !== undefined ? decode(m[1]) : m[2] === 'tab' ? '\t' : '\n';
    }
    text = text.replace(/[ \t]+/g, ' ').trim();
    if (!text) continue;
    if (/<w:pStyle\s+w:val="(Heading[1-3]|Title)"/.test(p)) {
      flush();
      heading = text;
      lines.push(text);
    } else {
      lines.push(text);
    }
  }
  flush();
  return sections;
}
