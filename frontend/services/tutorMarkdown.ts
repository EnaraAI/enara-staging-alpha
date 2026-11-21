// Tutor replies as learners see them (TutorText): pure text steps that run on
// the model's Markdown before it is rendered. No HTML is produced here; the
// renderer (react-markdown, raw HTML shown as text) builds React elements.
//
//   completeStreamingMarkdown  while a reply streams: no stray ** * _ ` # or
//                              list marker flashes before the formatting appears
//   prettifyMaths              x^2 -> x², \frac{3}{4} -> ¾, 3 * 4 -> 3 × 4 ...
//   linkCitations              [1] / [١] -> a link to #cite-1 (shown as a chip)
//   simplifyForKids            no headings or lists in the children's chat

// ---------------------------------------------------------------- masking

// Code, URLs and link targets are never touched by the text steps.
const PROTECTED = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\]\([^)\s]*\)|\b(?:https?:\/\/|www\.)[^\s<>()[\]]+/g;
const MASK_OPEN = '\uE000';
const MASK_CLOSE = '\uE001';

function withMasked(text: string, fn: (masked: string) => string): string {
  const kept: string[] = [];
  const masked = text.replace(PROTECTED, (m) => `${MASK_OPEN}${String.fromCharCode(0xe100 + kept.push(m) - 1)}${MASK_CLOSE}`);
  const out = fn(masked);
  return out.replace(/\uE000([\uE100-\uF8FF])\uE001/g, (_m, c: string) => kept[c.charCodeAt(0) - 0xe100] ?? '');
}

// ---------------------------------------------------------------- streaming

type Opener = { marker: string; at: number };

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isPunct = (c: string | undefined) => c !== undefined && /[\p{P}\p{S}]/u.test(c);
const isAlnum = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * The reply so far, made safe to render while it is still being written:
 * an emphasis or code marker that is open at the end is closed (so the text
 * shows bold/italic/code at once) or, with nothing after it yet, hidden; an
 * open code block is closed; a heading or list marker alone at the very end,
 * a half-typed link or citation is hidden until the rest arrives.
 */
export function completeStreamingMarkdown(text: string): string {
  if (!text) return '';
  let out = text;

  // An open code block: close it; nothing inside is Markdown.
  const fences = out.match(/^[ \t]{0,3}```/gm)?.length ?? 0;
  if (fences % 2 === 1) return /\n$/.test(out) ? `${out}\`\`\`` : `${out}\n\`\`\``;

  // A fence or marker being typed on the last line, alone: hide it.
  out = out.replace(/(^|\n)[ \t]{0,3}(?:`{1,2}|#{1,6}|[-*+•]|\d{1,3}[.)]|>)[ \t]*$/, '$1');
  // An emphasis or code marker just typed, with nothing after it yet.
  out = out.replace(/(^|\s)[*_`]+$/, '$1');

  // A half-typed link "[text](http..." shows its text; "[12" (a citation) waits.
  out = out.replace(/!?\[([^\]\n]*)\]\([^)\n]*$/, '$1');
  out = out.replace(/\[[0-9\u0660-\u0669\u06F0-\u06F9,، ]{0,8}$/, '');
  out = out.replace(/\[([^\]\n]*)$/, '$1');

  // Inline markers: only the last paragraph can still be open.
  const blank = out.lastIndexOf('\n\n');
  const start = blank < 0 ? 0 : blank + 2;
  const para = out.slice(start);
  const stack: Opener[] = [];
  let inCode: number | null = null;
  for (let i = 0; i < para.length; i++) {
    const c = para[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') {
      let run = 1;
      while (para[i + run] === '`') run++;
      if (inCode === null) inCode = i;
      else inCode = null;
      i += run - 1;
      continue;
    }
    if (inCode !== null) continue;
    if (c !== '*' && c !== '_') continue;
    let run = 1;
    while (para[i + run] === c) run++;
    const prev = para[i - 1];
    const next = para[i + run];
    // 3 * 4, 3*4, snake_case: not emphasis.
    if ((isAlnum(prev) && isAlnum(next)) || (isSpace(prev) && isSpace(next))) { i += run - 1; continue; }
    // Treat *** as ** then *.
    const parts = run >= 3 ? [c + c, c] : [c.repeat(run)];
    for (const marker of parts) {
      const top = stack[stack.length - 1];
      const canClose = !isSpace(prev) && (c === '*' || !isAlnum(next));
      const canOpen = !isSpace(next) && (c === '*' || !isAlnum(prev) || isPunct(prev));
      const match = stack.map((s) => s.marker).lastIndexOf(marker);
      if (canClose && match >= 0 && top) stack.splice(match);
      else if (canOpen) stack.push({ marker, at: i });
    }
    i += run - 1;
  }

  let tail = para;
  if (inCode !== null) {
    const after = tail.slice(inCode).replace(/^`+/, '');
    tail = after.trim() ? `${tail.replace(/\s+$/, '')}\`` : tail.slice(0, inCode).replace(/\s+$/, ' ');
  }
  // Close (or hide) what is still open, innermost first.
  let closers = '';
  for (let k = stack.length - 1; k >= 0; k--) {
    const { marker, at } = stack[k];
    const after = tail.slice(at + marker.length);
    if (!after.trim()) { tail = tail.slice(0, at) + after; continue; }
    tail = tail.replace(/\s+$/, '');
    // "**bold*": the closer is half typed; finish it instead of adding to it.
    if (!closers && marker.length > 1) tail = tail.replace(new RegExp(`([^\\s${marker[0]}])\\${marker[0]}$`), '$1');
    closers += marker;
  }
  return out.slice(0, start) + tail + closers;
}

// ---------------------------------------------------------------- maths

const SUPERSCRIPT: Record<string, string> = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', k: 'ᵏ', m: 'ᵐ', t: 'ᵗ',
};
const SUBSCRIPT: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞', '1/9': '⅑', '1/10': '⅒',
};
const LATEX_SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ',
  mu: 'μ', sigma: 'σ', Sigma: 'Σ', omega: 'ω', infty: '∞', degree: '°', circ: '∘', to: '→', rightarrow: '→',
  Rightarrow: '⇒', leftarrow: '←', cdots: '⋯', ldots: '…', dots: '…', angle: '∠', triangle: '△', perp: '⊥',
  parallel: '∥', propto: '∝', sum: 'Σ', percent: '%', lt: '<', gt: '>',
};

/** "2", "n", "-1", "(x+1)" as Unicode superscript, or null when a character has none. */
export function toSuperscript(s: string): string | null {
  let out = '';
  for (const ch of s.replace(/\s+/g, '')) {
    const sup = SUPERSCRIPT[ch];
    if (!sup) return null;
    out += sup;
  }
  return out || null;
}

const toSubscript = (s: string) => [...s].map((ch) => SUBSCRIPT[ch] ?? ch).join('');

/** A group for after √ or around a fraction part: bare when it is one token. */
const group = (s: string) => {
  const t = s.trim();
  return /^[\p{L}\p{N}.π²³]+$/u.test(t) ? t : `(${t})`;
};

/** n/d as one fraction character, or small ⁿ⁄d; null when it is not a plain fraction. */
export function prettyFraction(n: string, d: string): string | null {
  if (!/^[1-9]\d?$/.test(n) && n !== '0') return null;
  if (!/^[1-9]\d?$/.test(d)) return null;
  return VULGAR[`${n}/${d}`] ?? `${toSuperscript(n)}⁄${toSubscript(d)}`;
}

// $...$ is maths only when it looks like maths (never "$5 and $10").
const INLINE_DOLLAR = /\$(?!\s)([^$\n]{0,119}?[^\s$])\$(?!\d)/g;
const looksMathy = (s: string) => /[\\^_=]|[a-z]\d|\d[a-z]|[+\-*/<>]/i.test(s) && !/^\d+(?:[.,]\d+)?$/.test(s);

function latexToText(s: string): string {
  let t = s;
  t = t.replace(/\\(?:left|right|displaystyle|,|;|!|quad|qquad)(?![a-zA-Z])/g, (m) => (/[,;]|quad/.test(m) ? ' ' : ''));
  t = t.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf)\{([^{}]*)\}/g, '$1');
  t = t.replace(/\^\{?\\circ\}?/g, '°');
  // Fractions and roots, innermost first.
  for (let k = 0; k < 4; k++) {
    const before = t;
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const f = prettyFraction(a.trim(), b.trim());
      return f ?? `${group(a)}/${group(b)}`;
    });
    t = t.replace(/\\sqrt\[([^\]]+)\]\{([^{}]*)\}/g, (_m, n: string, x: string) => `${toSuperscript(n) ?? n}√${group(x)}`);
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, (_m, x: string) => `√${group(x)}`);
    if (t === before) break;
  }
  t = t.replace(/\\sqrt\s*(\w)/g, '√$1');
  t = t.replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, (m, name: string) => LATEX_SYMBOLS[name] ?? m);
  t = t.replace(/\\%/g, '%');
  return t;
}

/** Maths the model writes as plain text or simple LaTeX, made readable. Code and URLs are left alone. */
export function prettifyMaths(text: string): string {
  if (!text) return '';
  return withMasked(text, (s) => {
    let t = s;
    // LaTeX delimiters: \( \) \[ \] $$ $...$ (the maths inside stays).
    t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => latexToText(inner.trim()));
    t = t.replace(INLINE_DOLLAR, (m, inner: string) => (looksMathy(inner) ? latexToText(inner) : m));
    t = t.replace(/\\\(\s?|\s?\\\)/g, '').replace(/\\\[\s?|\s?\\\]/g, '');
    t = latexToText(t);
    // sqrt(x) -> √x
    t = t.replace(/\bsqrt\s*\(([^()\n]{1,40})\)/gi, (_m, x: string) => `√${group(x)}`);
    // Powers: x^2, x^{10}, (a+b)^2, 10^-3, x^n.
    // (No lookbehind in these patterns: older Safari cannot parse it, and the whole app would fail to load.)
    t = t.replace(/([\p{L}\p{N})\]}π])\^\{([^{}\n]{1,12})\}/gu, (_m, b: string, p: string) => b + (toSuperscript(p) ?? `^(${p})`));
    t = t.replace(/([\p{L}\p{N})\]}π])\^(\(([^()\n]{1,10})\)|[-−]?\d{1,4}|[a-z](?![a-z]))/giu, (m, b: string, p: string, inner?: string) => {
      const sup = toSuperscript(inner ?? p);
      return sup ? b + sup : m;
    });
    // Subscripts on a single-letter name: x_1, a_{12}.
    t = t.replace(/(^|[^\p{L}\p{N}_])([a-zA-Z])_\{?(\d{1,2})\}?(?![\p{L}\p{N}_])/gu, (_m, b: string, v: string, d: string) => b + v + toSubscript(d));
    // Operators between numbers: 3 * 4, 3*4 -> ×; 12 / 4 -> ÷ (only with spaces).
    t = t.replace(/([\p{N})²³])([ \t]*)\*(?!\*)([ \t]*)(?=[\p{N}(√])/gu, (_m, b: string, s1: string, s2: string) => b + (s1 || s2 ? ' × ' : '×'));
    t = t.replace(/([\p{L}\p{N})²³])[ \t]+\*[ \t]+(?=[\p{L}\p{N}(√])/gu, '$1 × ');
    t = t.replace(/([\p{N})])[ \t]+\/[ \t]+(?=[\p{N}(])/gu, '$1 ÷ ');
    // Plain fractions 3/4 (never dates 3/4/2024, never 05/11, never inside a number or word).
    t = t.replace(/(^|[^\p{L}\p{N}/.,:\uE000-\uF8FF])(\d{1,2})\/(\d{1,2})(?![\p{L}\p{N}/]|[.,]\d)/gu, (m, b: string, n: string, d: string) => {
      const f = prettyFraction(n, d);
      return f ? b + f : m;
    });
    return t;
  });
}

// ---------------------------------------------------------------- citations

const CITATION = /(^|[^\\\]])\[([0-9\u0660-\u0669\u06F0-\u06F9]{1,2}(?:\s*[,،]\s*[0-9\u0660-\u0669\u06F0-\u06F9]{1,2})*)\](?![(:[])/g;
const westernNumber = (digits: string) => Number(digits.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf)));

/** [1], [1, 2], [١]: each number becomes a link to #cite-n, which TutorText shows as a small chip. */
export function linkCitations(text: string): string {
  if (!text) return '';
  return withMasked(text, (s) => s.replace(CITATION, (_m, before: string, list: string) => before +
    list.split(/\s*[,،]\s*/).map((d) => `[${d}](#cite-${westernNumber(d)})`).join('')));
}

// ---------------------------------------------------------------- children

/** The children's chat: headings become bold lines, list items plain lines, no quotes or rules. */
export function simplifyForKids(text: string): string {
  if (!text) return '';
  return withMasked(text, (s) => s
    .split('\n')
    .map((line) => {
      const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) return `**${heading[1].replace(/\*\*/g, '')}**`;
      if (/^\s*(?:[-*_=]\s*){3,}$/.test(line)) return '';
      let l = line.replace(/^\s*>\s?/, '');
      l = l.replace(/^\s*[-*+•]\s+/, '');
      l = l.replace(/^\s*(\d{1,3})([.)])\s+/, (_m, n: string, p: string) => `${n}\\${p} `);
      return l.replace(/^\s+/, '');
    })
    .join('\n'));
}

// ---------------------------------------------------------------- direction

/** 'rtl' when the first strong letter is Arabic/Hebrew, 'ltr' for a Latin one, null with none. */
export function firstStrongDir(text: string): 'rtl' | 'ltr' | null {
  const m = /[\p{L}]/u.exec(text || '');
  if (!m) return null;
  return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]) ? 'rtl' : 'ltr';
}

/** Everything TutorText runs before rendering, in order. */
export function prepareTutorMarkdown(text: string, opts: { streaming?: boolean; simple?: boolean } = {}): string {
  let t = text || '';
  if (opts.streaming) t = completeStreamingMarkdown(t);
  if (opts.simple) t = simplifyForKids(t);
  t = prettifyMaths(t);
  t = linkCitations(t);
  return t;
}
