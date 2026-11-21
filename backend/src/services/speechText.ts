// What the tutor's voice says: the reply without Markdown symbols, citation
// markers or LaTeX, with simple maths turned into words. Used on the SPOKEN
// path only (the avatar's sentences); the written reply keeps its Markdown,
// which the browser renders. frontend/services/speechText.ts is the same code
// for speech the browser starts itself (Anam's stream, read-aloud).

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

type Words = Record<'times' | 'dividedBy' | 'over' | 'squared' | 'cubed' | 'power' | 'root' | 'plusMinus' | 'le' | 'ge' | 'ne' | 'approx' | 'pi' | 'degrees', string>;

const EN: Words = {
  times: 'times', dividedBy: 'divided by', over: 'over', squared: 'squared', cubed: 'cubed', power: 'to the power of',
  root: 'the square root of', plusMinus: 'plus or minus', le: 'is less than or equal to', ge: 'is greater than or equal to',
  ne: 'is not equal to', approx: 'is about', pi: 'pi', degrees: 'degrees',
};
const AR: Words = {
  times: 'ضرب', dividedBy: 'على', over: 'على', squared: 'تربيع', cubed: 'تكعيب', power: 'أس',
  root: 'الجذر التربيعي لـ', plusMinus: 'زائد أو ناقص', le: 'أصغر من أو يساوي', ge: 'أكبر من أو يساوي',
  ne: 'لا يساوي', approx: 'تقريبًا', pi: 'باي', degrees: 'درجة',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', 'ⁿ': 'n' };
const CITATION = /\s?\[\^?[0-9\u0660-\u0669\u06F0-\u06F9]{1,2}(?:\s*[,،]\s*[0-9\u0660-\u0669\u06F0-\u06F9]{1,2})*\](?!\()/g;
const INLINE_DOLLAR = /\$(?!\s)([^$\n]{0,119}?[^\s$])\$(?!\d)/g;
const looksMathy = (s: string) => /[\\^_=]|[a-z]\d|\d[a-z]|[+\-*/<>]/i.test(s) && !/^\d+(?:[.,]\d+)?$/.test(s);

function power(p: string, w: Words): string {
  const v = p.replace(/[{}()\s]/g, '');
  if (v === '2') return ` ${w.squared}`;
  if (v === '3') return ` ${w.cubed}`;
  return ` ${w.power} ${v}`;
}

/**
 * The reply as words to speak. `keepEdges` keeps leading/trailing spaces (for
 * text spoken in pieces as it streams); otherwise the result is trimmed.
 */
export function stripMarkdownForSpeech(text: string, opts: { keepEdges?: boolean } = {}): string {
  if (!text) return '';
  const w = ARABIC.test(text) ? AR : EN;
  let t = text;

  // Code: the words stay, the fences and backticks go.
  t = t.replace(/^[ \t]*```[^\n]*$/gm, '').replace(/`+/g, '');
  // Pictures and links: their words only. Citation markers: nothing.
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(CITATION, '');
  t = t.replace(/\bhttps?:\/\/\S+/g, '');

  // LaTeX and maths.
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, '$1').replace(INLINE_DOLLAR, (m, inner: string) => (looksMathy(inner) ? inner : m));
  t = t.replace(/\\[()[\]]/g, ' ');
  t = t.replace(/\\(?:left|right|displaystyle)(?![a-zA-Z])/g, '');
  t = t.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf)\{([^{}]*)\}/g, '$1');
  t = t.replace(/\^\{?\\circ\}?|°/g, ` ${w.degrees}`);
  for (let k = 0; k < 4; k++) {
    const before = t;
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => `${a.trim()} ${w.over} ${b.trim()}`);
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, (_m, x: string) => `${w.root} ${x.trim()}`);
    if (t === before) break;
  }
  t = t.replace(/\bsqrt\s*\(([^()\n]{1,40})\)/gi, (_m, x: string) => `${w.root} ${x.trim()}`);
  t = t.replace(/√\s*\(([^()\n]{1,40})\)/g, (_m, x: string) => ` ${w.root} ${x.trim()}`).replace(/√\s*/g, ` ${w.root} `);
  t = t.replace(/\^\{([^{}\n]{1,12})\}|\^(\([^()\n]{1,10}\)|[-−]?\d{1,4}|[a-z](?![a-z]))/gi, (_m, a?: string, b?: string) => power(a ?? b ?? '', w));
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+/g, (m) => power([...m].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join(''), w));
  // (No lookbehind anywhere here: older Safari cannot parse it.)
  t = t.replace(/([\p{N})])[ \t]*\*(?!\*)[ \t]*(?=[\p{N}(])/gu, `$1 ${w.times} `);
  t = t.replace(/([\p{L}\p{N})])[ \t]+\*[ \t]+(?=[\p{L}\p{N}(])/gu, `$1 ${w.times} `);
  t = t.replace(/([\p{N})])[ \t]+\/[ \t]+(?=[\p{N}(])/gu, `$1 ${w.dividedBy} `);
  t = t.replace(/\\times(?![a-zA-Z])|\\cdot(?![a-zA-Z])|[×·]/g, ` ${w.times} `);
  t = t.replace(/\\div(?![a-zA-Z])|÷/g, ` ${w.dividedBy} `);
  t = t.replace(/\\pm(?![a-zA-Z])|±/g, ` ${w.plusMinus} `);
  t = t.replace(/\\leq?(?![a-zA-Z])|≤/g, ` ${w.le} `);
  t = t.replace(/\\geq?(?![a-zA-Z])|≥/g, ` ${w.ge} `);
  t = t.replace(/\\neq?(?![a-zA-Z])|≠/g, ` ${w.ne} `);
  t = t.replace(/\\approx(?![a-zA-Z])|≈/g, ` ${w.approx} `);
  t = t.replace(/\\pi(?![a-zA-Z])|π/g, ` ${w.pi} `);
  t = t.replace(/⁄/g, '/');
  t = t.replace(/\\([a-zA-Z]+)/g, '$1').replace(/[{}\\]/g, ' ');

  // Block markers at the start of a line: headings, quotes, rules, list markers.
  t = t.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');
  t = t.replace(/^[ \t]*(?:[-*_=][ \t]*){3,}$/gm, '');
  t = t.replace(/^[ \t]*[-*+•][ \t]+/gm, '');
  t = t.replace(/^[ \t]*\d{1,3}[.)][ \t]+/gm, '');

  // Emphasis and other leftover symbols.
  t = t.replace(/\*+|~~|(^|[^\p{L}\p{N}_])_+|_+(?![\p{L}\p{N}_])/gu, (_m, before?: string) => before ?? '');
  t = t.replace(/(^|\s)#(?=\s|$)/g, '$1').replace(/\|/g, ', ');

  t = t.replace(/[ \t]+([,.;:!?؟،])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n');
  return opts.keepEdges ? t : t.trim();
}

/**
 * Speech that streams in pieces (Anam's talk stream): holds back the last,
 * possibly half-written word, and cleans whole words only, so a marker split
 * across two pieces is still removed.
 */
export class SpeechChunkCleaner {
  private pending = '';
  private lineStart = true;

  push(chunk: string): string {
    this.pending += chunk;
    const cut = Math.max(this.pending.lastIndexOf(' '), this.pending.lastIndexOf('\n'));
    if (cut < 0) return '';
    const ready = this.pending.slice(0, cut + 1);
    this.pending = this.pending.slice(cut + 1);
    return this.clean(ready);
  }

  flush(): string {
    const rest = this.pending;
    this.pending = '';
    return rest ? this.clean(rest) : '';
  }

  // A piece from the middle of a line must not be read as a line start ("5 - 3": no list marker).
  private clean(piece: string): string {
    const midLine = !this.lineStart;
    this.lineStart = /\n\s*$/.test(piece);
    const out = stripMarkdownForSpeech(midLine ? `\u2063${piece}` : piece, { keepEdges: true });
    return midLine ? out.replace(/^\u2063/, '') : out;
  }
}
