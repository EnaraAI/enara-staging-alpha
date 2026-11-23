// numeric: a number (or, with accept_equivalent_expression, an expression) with an optional unit.
//   - digits: Western and Arabic-Indic; decimal mark '.', '٫' or (Arabic items, or a lone comma not grouping thousands) ',';
//   - tolerance: tolerance_abs, else tolerance_rel, else a tiny float tolerance;
//   - unit: converted when both units are known (cm vs m, سم vs م ...). Right value, missing unit → half marks (unit_missing);
//     right value, a different unit that does not convert → half marks (unit_wrong);
//   - learner forms: "x = 7", "cm^2" / "cm²"; with no unit in the key, a trailing unit, %, ° or word is ignored;
//   - expressions: equal when mathjs simplify(a - b) is 0, or the two agree at 6 sample points (variables only, no function calls
//     beyond the safe list). Input over 120 characters is not parsed.
import { create, all, type MathNode } from 'mathjs';
import type { ClosedItem, GradeResult } from '../../../schema';
import { westernDigits } from '../../../text/ar';
import { isBlank, single } from './result';

type Numeric = Extract<ClosedItem, { type: 'numeric' }>;

// Learner text is parsed into a tree and checked (symbolsOk) before anything is computed: only numbers, + - * / ^, brackets, the safe
// functions below and plain variables. Nothing is ever run through math.evaluate.
const math = create(all, {});
const parse = math.parse;
const SAFE_FUNCS = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'pi', 'e']);
const MAX_LEN = 120;

/** Arabic and common unit spellings → mathjs unit names. */
const UNIT_ALIASES: Record<string, string> = {
  'سم': 'cm', 'م': 'm', 'مم': 'mm', 'كم': 'km', 'كجم': 'kg', 'كغ': 'kg', 'جم': 'g', 'غ': 'g', 'جرام': 'g', 'لتر': 'l', 'ل': 'l', 'مل': 'ml',
  'ث': 's', 'ثانية': 's', 'د': 'min', 'دقيقة': 'min', 'س': 'h', 'ساعة': 'h', 'نيوتن': 'N', 'جول': 'J', 'وات': 'W', 'فولت': 'V', 'أمبير': 'A', 'امبير': 'A',
  'سم2': 'cm^2', 'م2': 'm^2', 'سم3': 'cm^3', 'م3': 'm^3', 'cm2': 'cm^2', 'm2': 'm^2', 'cm3': 'cm^3', 'm3': 'm^3', 'sec': 's', 'hr': 'h', 'kph': 'km/h', 'كم/س': 'km/h', 'م/ث': 'm/s',
  'litre': 'l', 'liter': 'l', '°c': 'degC', 'c°': 'degC', 'درجة': 'degC', 'ريال': 'riyal', 'جنيه': 'pound_eg',
};
const CURRENCY = new Set(['riyal', 'pound_eg', '$', 'usd', 'egp', 'le', 'sar']);

/** "1,250.5" / "1٬250٫5" / "3,5" (Arabic or lone decimal comma) → "1250.5" / "3.5". */
export function normalizeNumberText(raw: string, lang = 'en'): string {
  let s = westernDigits(raw).trim().replace(/\s+/g, ' ').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  if (/^\-?\d{1,3}(,\d{3})+(\.\d+)?/.test(s)) s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');
  else if (lang.startsWith('ar') || /^\-?\d+,\d{1,2}(?!\d)/.test(s)) s = s.replace(/(\d),(\d)/g, '$1.$2');
  return s;
}

/** Splits "12.5 cm" / "١٢٫٥ سم" into the number text and the unit text. */
export function splitUnit(text: string): { num: string; unit: string | null } {
  const m = /^(.*?[\d)a-z.])\s*([^\d\s()+\-*/^.=]+[0-9]?(?:\/[^\d\s()+\-*/^.=]+)?)$/i.exec(text.trim());
  if (m) return { num: m[1].trim(), unit: m[2].trim() };
  return { num: text.trim(), unit: null };
}

export const unitName = (u: string): string => UNIT_ALIASES[u.toLowerCase()] ?? UNIT_ALIASES[u] ?? u;

/** The value of `amount` expressed in `target` units; null when either is not a known unit or they do not convert. */
export function convert(amount: number, from: string, target: string): number | null {
  const a = unitName(from); const b = unitName(target);
  if (a === b) return amount;
  if (CURRENCY.has(a) || CURRENCY.has(b)) return null;
  try { return math.unit(amount, a).toNumber(b); } catch { return null; }
}

function symbolsOk(node: MathNode): boolean {
  let ok = true;
  node.traverse((n) => {
    if (n.type === 'FunctionNode' && !SAFE_FUNCS.has((n as unknown as { fn: { name: string } }).fn.name)) ok = false;
    if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode' || n.type === 'AccessorNode' || n.type === 'ObjectNode' || n.type === 'BlockNode') ok = false;
  });
  return ok;
}

/** The number a text means (an expression without variables is evaluated); null when it is not a number. */
export function numberOf(text: string): number | null {
  const t = text.trim();
  if (!t || t.length > MAX_LEN) return null;
  if (/^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(t)) return Number(t);
  if (/^[-+]?\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
  try {
    const node = parse(t);
    if (!symbolsOk(node)) return null;
    let vars = false;
    node.traverse((n) => { if (n.type === 'SymbolNode' && !SAFE_FUNCS.has((n as unknown as { name: string }).name)) vars = true; });
    if (vars) return null;
    const v = node.compile().evaluate({});
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** Two expressions are equal: simplify(a - b) is 0, or they agree at 6 sample points. */
export function sameExpression(a: string, b: string): boolean {
  if (!a.trim() || !b.trim() || a.length > MAX_LEN || b.length > MAX_LEN) return false;
  try {
    const na = parse(a); const nb = parse(b);
    if (!symbolsOk(na) || !symbolsOk(nb)) return false;
    const diff = math.simplify(new math.OperatorNode('-', 'subtract', [na, nb]));
    if (diff.type === 'ConstantNode' && Number((diff as unknown as { value: number }).value) === 0) return true;
    const names = new Set<string>();
    for (const n of [na, nb]) n.traverse((x) => { if (x.type === 'SymbolNode' && !SAFE_FUNCS.has((x as unknown as { name: string }).name)) names.add((x as unknown as { name: string }).name); });
    if (names.size > 4) return false;
    const fa = na.compile(); const fb = nb.compile();
    for (let k = 0; k < 6; k++) {
      const scope = Object.fromEntries([...names].map((v, i) => [v, 0.37 + k * 1.13 + i * 0.71]));
      const x = fa.evaluate(scope); const y = fb.evaluate(scope);
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
    }
    return true;
  } catch { return false; }
}

/** How learners write: "x = 7" / "س = ٧" (the answer after the equals sign), "cm^2" / "cm²" / "سم²" (the unit as cm2, سم2). */
export function learnerForm(text: string): string {
  return text
    .replace(/^\s*[A-Za-z\u0621-\u064A]\s*=\s*(?=[-+\d.(])/, '')
    .replace(/([A-Za-z\u0621-\u064A])\s*\^\s*([23])\b/g, '$1$2')
    .replace(/([A-Za-z\u0621-\u064A])\s*([²³])/g, (_m, l: string, p: string) => `${l}${p === '²' ? '2' : '3'}`);
}

const within = (given: number, want: number, key: Numeric['answer_key']): boolean => {
  if (key.tolerance_abs !== undefined) return Math.abs(given - want) <= key.tolerance_abs + 1e-12;
  if (key.tolerance_rel !== undefined) return Math.abs(given - want) <= key.tolerance_rel * Math.abs(want) + 1e-12;
  return Math.abs(given - want) <= 1e-9 * Math.max(1, Math.abs(want));
};

export function gradeNumeric(item: Numeric, answer: unknown, max: number): GradeResult {
  if (isBlank(answer)) return single(max, 'answer', 0, 'empty');
  const key = item.answer_key;
  const rawText = typeof answer === 'object' && answer !== null
    ? `${String((answer as { value?: unknown }).value ?? '')} ${String((answer as { unit?: unknown }).unit ?? '')}`.trim()
    : String(answer);
  const text = learnerForm(normalizeNumberText(rawText, item.language));
  // No unit in the key: a unit, %, ° or a word after the number is ignored ("25%", "65°", "27 students"); with a unit, it is checked.
  const parts = splitUnit(text);
  const { num, unit } = key.unit ? parts : parts.unit && numberOf(parts.num) !== null ? { num: parts.num, unit: null } : { num: text, unit: null };
  const wrong = () => single(max, 'answer', 0, 'wrong', item.error_codes);

  // Expressions (no unit): equal by algebra.
  if (key.accept_equivalent_expression && typeof key.value === 'string' && Number.isNaN(Number(key.value))) {
    if (sameExpression(num, normalizeNumberText(key.value, 'en'))) return single(max, 'answer', 1, num.replace(/\s/g, '') === key.value.replace(/\s/g, '') ? 'correct' : 'equivalent_expression');
    return wrong();
  }
  const want = typeof key.value === 'number' ? key.value : numberOf(normalizeNumberText(key.value, 'en'));
  let given = numberOf(num);
  if (given === null || want === null) return given === null ? single(max, 'answer', 0, 'not_a_number', item.error_codes) : wrong();
  if (key.unit) {
    if (!unit) return within(given, want, key) ? single(max, 'answer', 0.5, 'unit_missing', ['units']) : wrong();
    const converted = convert(given, unit, key.unit);
    if (converted === null) return within(given, want, key) ? single(max, 'answer', 0.5, 'unit_wrong', ['units']) : wrong();
    given = converted;
  }
  return within(given, want, key) ? single(max, 'answer', 1, 'correct') : wrong();
}
