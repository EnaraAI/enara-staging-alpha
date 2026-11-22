import React from 'react';

// Assessment engine P1b (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §8): the learner's view of a closed item (question type 'engine').
// Phone first; Arabic items read right-to-left; the screen text follows the learner's language (ar | en). The answer goes back as
// JSON text for structured answers (blanks, pairs, order, choices), or plain text, so drafts and submit keep their shape. The server
// never sends the answer key; ordering and matching arrive already shuffled.

export type UiLang = 'ar' | 'en';
type Opt = { id: string; text: string };
export interface EngineQ { id: string; text: string; engine: { type: string; options?: unknown; language: string } }

const T = {
  en: { chooseAll: 'Choose all that apply', chooseOne: 'Choose one', true: 'True', false: 'False', blank: 'Blank', choose: 'Choose…', number: 'Number', unit: 'Unit', up: 'Move up', down: 'Move down', matchWith: 'matches', orderHint: 'Put these in the right order', matchHint: 'Match each item on the start with one on the end', numberHint: 'Write a number (and its unit if needed)' },
  ar: { chooseAll: 'اختر كل الإجابات الصحيحة', chooseOne: 'اختر إجابة واحدة', true: 'صح', false: 'خطأ', blank: 'فراغ', choose: 'اختر…', number: 'العدد', unit: 'الوحدة', up: 'إلى أعلى', down: 'إلى أسفل', matchWith: 'يقابل', orderHint: 'رتّب العناصر بالترتيب الصحيح', matchHint: 'صِل كل عنصر في البداية بما يناسبه في النهاية', numberHint: 'اكتب العدد (ووحدته إن لزم)' },
};

const parse = <V,>(value: string, fallback: V): V => { try { return value ? (JSON.parse(value) as V) : fallback; } catch { return fallback; } };
const emit = (v: unknown, onChange: (s: string) => void) => {
  const empty = v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some((x) => String(x ?? '').trim()));
  onChange(empty ? '' : JSON.stringify(v));
};
const pieces = (stem: string, re: RegExp) => stem.split(re); // even = text, odd = placeholder name

export const EngineQuestion: React.FC<{ q: EngineQ; value: string; onChange: (v: string) => void; lang: UiLang; index: number }> = ({ q, value, onChange, lang, index }) => {
  const t = T[lang];
  const e = q.engine;
  const dir = e.language.startsWith('ar') ? 'rtl' : 'ltr';
  const box = 'border border-slate-200 rounded-lg px-3 py-2 text-sm';
  const label = (s: string) => `${s} (${index + 1})`;

  switch (e.type) {
    case 'mcq': {
      const opts = (e.options as Opt[]) ?? [];
      const isMulti = (e as { multi?: boolean }).multi === true;
      const chosen = isMulti ? parse<string[]>(value, []) : [value];
      return (
        <div className="mt-3 space-y-2" dir={dir} data-testid={`eq-${q.id}`}>
          <p className="text-xs text-slate-500">{isMulti ? t.chooseAll : t.chooseOne}</p>
          {opts.map((o) => (
            <label key={o.id} className={`flex items-center gap-2 ${box} cursor-pointer has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50`}>
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`q-${q.id}`}
                checked={chosen.includes(o.id)}
                onChange={(ev) => isMulti ? emit(ev.target.checked ? [...chosen.filter(Boolean), o.id] : chosen.filter((c) => c !== o.id), onChange) : onChange(o.id)}
              />
              <span dir="auto">{o.text}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'true_false':
      return (
        <div className="mt-3 flex gap-2" dir={dir} data-testid={`eq-${q.id}`} role="radiogroup" aria-label={label(t.chooseOne)}>
          {(['true', 'false'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
              className={`flex-1 min-h-[44px] rounded-lg border text-sm font-semibold ${value === v ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-700'}`}>
              {v === 'true' ? t.true : t.false}
            </button>
          ))}
        </div>
      );
    case 'fill_blank': {
      const v = parse<Record<string, string>>(value, {});
      return (
        <p className="mt-3 text-base leading-10 text-slate-900" dir={dir} data-testid={`eq-${q.id}`}>
          {pieces(q.text, /\{\{(blank_\d+)\}\}/).map((part, i) => i % 2 === 0 ? <span key={i}>{part}</span> : (
            <input key={i} aria-label={label(`${t.blank} ${part.split('_')[1]}`)} data-blank={part} dir="auto"
              className="mx-1 inline-block w-32 border-b-2 border-slate-400 focus:border-teal-600 bg-slate-50 px-2 py-1 text-base outline-none"
              value={v[part] ?? ''} onChange={(ev) => emit({ ...v, [part]: ev.target.value }, onChange)} />
          ))}
        </p>
      );
    }
    case 'dropdown': {
      const v = parse<Record<string, string>>(value, {});
      const opts = (e.options as Record<string, string[]>) ?? {};
      return (
        <p className="mt-3 text-base leading-10 text-slate-900" dir={dir} data-testid={`eq-${q.id}`}>
          {pieces(q.text, /\{\{(drop_\d+)\}\}/).map((part, i) => i % 2 === 0 ? <span key={i}>{part}</span> : (
            <select key={i} aria-label={label(`${t.choose} ${part.split('_')[1]}`)} data-drop={part}
              className="mx-1 border border-slate-300 rounded-md px-2 py-1 text-base bg-white" value={v[part] ?? ''}
              onChange={(ev) => emit({ ...v, [part]: ev.target.value }, onChange)}>
              <option value="">{t.choose}</option>
              {(opts[part] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </p>
      );
    }
    case 'matching': {
      const o = (e.options as { left: Opt[]; right: Opt[] }) ?? { left: [], right: [] };
      const v = parse<Record<string, string>>(value, {});
      return (
        <div className="mt-3 space-y-2" dir={dir} data-testid={`eq-${q.id}`}>
          <p className="text-xs text-slate-500">{t.matchHint}</p>
          {o.left.map((l) => (
            <div key={l.id} className={`flex flex-wrap items-center gap-2 ${box}`}>
              <span className="font-medium min-w-[6rem]" dir="auto">{l.text}</span>
              <span className="text-xs text-slate-400">{t.matchWith}</span>
              <select aria-label={label(l.text)} data-left={l.id} className="flex-1 min-w-[8rem] border border-slate-300 rounded-md px-2 py-2 bg-white" value={v[l.id] ?? ''}
                onChange={(ev) => emit({ ...v, [l.id]: ev.target.value }, onChange)}>
                <option value="">{t.choose}</option>
                {o.right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case 'numeric': {
      const [num, ...rest] = value.split(' ');
      const unit = rest.join(' ');
      const set = (n: string, u: string) => onChange([n.trim(), u.trim()].filter(Boolean).join(' '));
      return (
        <div className="mt-3 flex flex-wrap gap-2 items-center" dir={dir} data-testid={`eq-${q.id}`}>
          <p className="w-full text-xs text-slate-500">{t.numberHint}</p>
          <input aria-label={label(t.number)} inputMode="decimal" dir="ltr" className="w-40 border border-slate-300 rounded-lg px-3 py-2 text-base" value={num ?? ''} onChange={(ev) => set(ev.target.value.replace(/\s+/g, ''), unit)} />
          <input aria-label={label(t.unit)} dir="auto" className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-base" placeholder={t.unit} value={unit} onChange={(ev) => set(num ?? '', ev.target.value)} />
        </div>
      );
    }
    case 'ordering': {
      const opts = (e.options as Opt[]) ?? [];
      const order = parse<string[]>(value, opts.map((x) => x.id)).filter((id) => opts.some((x) => x.id === id));
      for (const x of opts) if (!order.includes(x.id)) order.push(x.id);
      const move = (i: number, d: number) => { const next = [...order]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; emit(next, onChange); };
      return (
        <div className="mt-3 space-y-2" dir={dir} data-testid={`eq-${q.id}`}>
          <p className="text-xs text-slate-500">{t.orderHint}</p>
          <ol className="space-y-2">
            {order.map((id, i) => (
              <li key={id} className={`flex items-center gap-2 ${box}`} data-order-item={id}>
                <span className="w-6 text-center text-slate-500">{i + 1}</span>
                <span className="flex-1" dir="auto">{opts.find((x) => x.id === id)?.text}</span>
                <button type="button" aria-label={label(`${t.up} ${i + 1}`)} className="min-w-[44px] min-h-[44px] rounded border border-slate-300 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={label(`${t.down} ${i + 1}`)} className="min-w-[44px] min-h-[44px] rounded border border-slate-300 disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </div>
      );
    }
    default:
      return null;
  }
};

/** The question line above the item: fill-in-the-blank and drop-down items show their text inside the item instead. */
export const engineShowsStem = (q: EngineQ): boolean => q.engine.type !== 'fill_blank' && q.engine.type !== 'dropdown';
