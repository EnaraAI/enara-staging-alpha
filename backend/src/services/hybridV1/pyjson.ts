// Python-compatible JSON for the frozen V6 port. The frozen candidate builds
// its prompt with json.dumps(ensure_ascii=False, sort_keys=True) and reads the
// model reply with json.JSONDecoder().raw_decode, so the port must produce and
// accept exactly the same bytes. Floats keep Python's repr (5.0, not 5).

export class PyFloat {
  constructor(public readonly value: number) {}
}
export const pyFloat = (x: number) => new PyFloat(x);

// Python repr of a float (shortest round-trip, ".0" for integral values).
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return `${x.toFixed(0)}.0`;
  const s = String(x);
  // JS writes 1e-7 / 1e+21; Python writes 1e-07 / 1e+21.
  return s.replace(/e([+-])(\d)$/, 'e$10$2');
}

// json.dumps string escaping with ensure_ascii=False.
export function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (c < 0x20) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

export type PyValue = null | boolean | number | string | PyFloat | PyValue[] | { [k: string]: PyValue };

// json.dumps(obj, ensure_ascii=False, sort_keys=True[, separators]). JS numbers are Python ints; wrap floats in PyFloat.
export function pyDumps(v: PyValue, sep: [string, string] = [', ', ': ']): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('pyDumps: non-integral number must be a PyFloat');
    return String(v);
  }
  if (typeof v === 'string') return pyStr(v);
  if (Array.isArray(v)) return `[${v.map((x) => pyDumps(x, sep)).join(sep[0])}]`;
  const keys = Object.keys(v).sort(); // ASCII keys: code-point order equals Python's
  return `{${keys.map((k) => `${pyStr(k)}${sep[1]}${pyDumps(v[k], sep)}`).join(sep[0])}}`;
}

// ---------------------------------------------------------------- decoding (raw_decode semantics)
export class PyJsonError extends Error {}

// Numbers decode to JS numbers; floats (fraction/exponent/NaN/Infinity) also report their kind through `floats`.
export function pyRawDecode(text: string): { value: unknown; end: number; floats: WeakMap<object, Set<string>> } {
  const floats = new WeakMap<object, Set<string>>();
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const fail = (m: string): never => {
    throw new PyJsonError(`${m} at char ${i}`);
  };
  const markFloat = (holder: object, key: string) => {
    const s = floats.get(holder) ?? new Set<string>();
    s.add(key);
    floats.set(holder, s);
  };
  const parseString = (): string => {
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string');
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === '\\') {
        const e = text[i + 1];
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e in map) {
          out += map[e];
          i += 2;
        } else if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\uXXXX escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else fail('Invalid \\escape');
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) fail('Invalid control character'); // strict=True
      out += ch;
      i++;
    }
  };
  const parseNumber = (): { n: number; isFloat: boolean } => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(i));
    if (!m) fail('Expecting value');
    i += m![0].length;
    return { n: Number(m![0]), isFloat: Boolean(m![2] || m![3]) };
  };
  const parseValue = (holder?: object, key?: string): unknown => {
    const ch = text[i];
    if (ch === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('Expecting property name enclosed in double quotes');
        const k = parseString();
        ws();
        if (text[i] !== ':') fail("Expecting ':' delimiter");
        i++;
        ws();
        obj[k] = parseValue(obj, k);
        ws();
        if (text[i] === '}') {
          i++;
          return obj;
        }
        if (text[i] !== ',') fail("Expecting ',' delimiter");
        i++;
      }
    }
    if (ch === '[') {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        ws();
        arr.push(parseValue(arr, String(arr.length)));
        ws();
        if (text[i] === ']') {
          i++;
          return arr;
        }
        if (text[i] !== ',') fail("Expecting ',' delimiter");
        i++;
      }
    }
    if (ch === '"') return parseString();
    const lit: [string, unknown, boolean][] = [['null', null, false], ['true', true, false], ['false', false, false],
      ['NaN', NaN, true], ['Infinity', Infinity, true], ['-Infinity', -Infinity, true]];
    for (const [w, val, isF] of lit) {
      if (text.startsWith(w, i)) {
        i += w.length;
        if (isF && holder && key !== undefined) markFloat(holder, key);
        return val;
      }
    }
    const { n, isFloat } = parseNumber();
    if (isFloat && holder && key !== undefined) markFloat(holder, key);
    return n;
  };
  const value = parseValue();
  return { value, end: i, floats };
}
