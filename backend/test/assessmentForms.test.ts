import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadJson, outcomeFiles } from './helpers/assessmentText';

// Structural checks on every outcome assessment file: parallel forms A/B/C.

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ITEMS_PER_FORM: Record<string, number> = { A1: 9, A2: 9, B1: 7, B2: 7, C1: 5 };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const isTargetForm = (it: any) => typeof it.scoring === 'string' && it.scoring.startsWith('target_form');

describe('assessment forms', () => {
  const ids = new Set<string>();
  for (const f of outcomeFiles()) {
    const name = path.basename(f, '.json');
    const d = loadJson(f);
    const cefr = name.split('-')[2];
    describe(name, () => {
      it('has forms A/B/C of the right size with identical type sequences', () => {
        expect(Object.keys(d.forms).sort()).toEqual(['A', 'B', 'C']);
        const types = (k: string) => d.forms[k].map((i: any) => i.type).join(',');
        for (const k of ['A', 'B', 'C']) expect(d.forms[k].length, k).toBe(ITEMS_PER_FORM[cefr]);
        expect(types('B')).toBe(types('A'));
        expect(types('C')).toBe(types('A'));
      });
      it('prompts are within +/-2 words per slot', () => {
        const bad: string[] = [];
        d.forms.A.forEach((_: any, i: number) => {
          const n = ['A', 'B', 'C'].map((k) => words(d.forms[k][i].prompt));
          if (Math.max(...n) - Math.min(...n) > 2) bad.push(`slot ${i + 1}: ${n.join('/')}`);
        });
        expect(bad).toEqual([]);
      });
      it('every item has answerKey, acceptedAnswers (or rubric), vocabLevel <= CEFR, unique id', () => {
        const bad: string[] = [];
        for (const items of Object.values<any[]>(d.forms)) for (const it of items) {
          if (ids.has(it.id)) bad.push(`${it.id} duplicate id`);
          ids.add(it.id);
          if (typeof it.answerKey !== 'string' || !it.answerKey.trim()) bad.push(`${it.id} answerKey`);
          const acc = Array.isArray(it.acceptedAnswers) && it.acceptedAnswers.some((a: any) => typeof a === 'string' && a.trim());
          if (!acc && !(isTargetForm(it) && it.rubric)) bad.push(`${it.id} acceptedAnswers`);
          if (isTargetForm(it) && !it.rubric) bad.push(`${it.id} rubric`);
          // vocabLevel may be a range such as "A1-A2"; its top level must not exceed the outcome level.
          const v = Math.max(...String(it.vocabLevel).split('-').map((x) => CEFR.indexOf(x.trim())));
          if (!it.vocabLevel || String(it.vocabLevel).split('-').some((x) => !CEFR.includes(x.trim())) || v > CEFR.indexOf(cefr)) bad.push(`${it.id} vocabLevel ${it.vocabLevel}`);
        }
        expect(bad).toEqual([]);
      });
    });
  }
});
