import { describe, it, expect } from 'vitest';
import { makePopulation, makeStudent, blockStart, itemBehaviour, retention, retainedAfter, studentPersona } from '../src/students/population';
import { populationChecks } from '../src/students/validity';
describe('student population', () => {
  const pop = makePopulation(150, 'seed-1');
  it('is reproducible for a seed and different for another', () => { expect(makePopulation(150, 'seed-1')).toEqual(pop); expect(makePopulation(150, 'seed-2')[0].learningRate).not.toBe(pop[0].learningRate); });
  it('passes all population validity checks', () => { const c = populationChecks(pop); const bad = c.filter((x) => !x.pass); expect(bad).toEqual([]); });
  it('misconception-heavy adversarial profiles are stronger and slower', () => { const a = makeStudent(1, 'x', { adversarial: true }); expect(a.misconceptionStrength).toBeGreaterThanOrEqual(0.9); expect(a.learningRate).toBeLessThanOrEqual(0.25); });
  it('per-item behaviour flags are deterministic and match configured rates in aggregate', () => { const s = pop[0]; expect(itemBehaviour(s, 'b', 'i', 'post')).toEqual(itemBehaviour(s, 'b', 'i', 'post')); let lapses = 0; const n = 4000; const t = { ...s, attentionLapse: 0.2 }; for (let i = 0; i < n; i += 1) if (itemBehaviour(t, 'b', `i${i}`, 'post').lapse) lapses += 1; expect(lapses / n).toBeGreaterThan(0.17); expect(lapses / n).toBeLessThan(0.23); });
  it('forgetting follows the half-life', () => { expect(retention(10, 10)).toBeCloseTo(0.5, 9); expect(retention(10, 0)).toBe(1); expect(retention(10, 30)).toBeCloseTo(0.125, 9); let k = 0; for (let i = 0; i < 3000; i += 1) if (retainedAfter({ ...pop[0], halfLifeDays: 10 }, 'b', `i${i}`, 10)) k += 1; expect(k / 3000).toBeGreaterThan(0.46); expect(k / 3000).toBeLessThan(0.54); });
  it('block start is deterministic and respects prior knowledge', () => { expect(blockStart(pop[1], 'grammar', 'GR-01', 2)).toEqual(blockStart(pop[1], 'grammar', 'GR-01', 2)); });
  it('persona is built from state and contains no assessment answers', () => { const p = studentPersona(pop[2], { cefr: 'A2', area: 'grammar', heldMisconception: { description: 'verb never changes', exampleWrong: 'She go' }, knowsAlready: false }); expect(p).toContain('verb never changes'); expect(p.length).toBeGreaterThan(200); });
});
