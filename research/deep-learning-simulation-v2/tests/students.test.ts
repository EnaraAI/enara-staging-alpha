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
import { answerItem, stateLine } from '../src/evaluation/assess';
import { blockStart as bs, itemBehaviour as ib } from '../src/students/population';
import { Provider } from '../src/providers/guard';
import { Ledger } from '../src/ledger/ledger';
import { mkdtempSync, readFileSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';
describe('fix: majority sampling, knowledge state, difficulty sensitivity', () => {
  const ex = JSON.parse(readFileSync(path.join(__dirname, '../docs/example_outcome.json'), 'utf8')).outcomes[0];
  const mkProv = (answers: string[]) => { let i = 0; const f = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: `ANSWER: ${answers[i++ % answers.length]}\nCONFIDENCE: 70` }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 })) as unknown as typeof fetch; return new Provider(new Ledger(mkdtempSync(path.join(tmpdir(), 'mj-')), 'r', 5), 'k', null, f, async () => {}); };
  const base = (p: Provider) => ({ provider: p, model: 'claude-haiku-5-5', persona: 'x', student: makePopulation(3, 's')[0], blockId: 'b', item: ex.items.post[0], stage: 'post' as const, memory: '', days: 0, ctx: () => ({ campaign: 'c', studentId: 's', blockId: 'b', role: 'student_assess' }) });
  it('majority of 3: 2 correct of 3 is correct; 1 of 3 is wrong; every sample is a ledger row', async () => { const p1 = mkProv(['drives', 'drives', 'drive']); expect((await answerItem(base(p1))).correct).toBe(true); expect(Ledger.read(p1.ledger.file).length).toBe(3); expect((await answerItem(base(mkProv(['drive', 'drives', 'drive'])))).correct).toBe(false); });
  it('state line states the hidden knowledge, never assessment content', () => { const k = stateLine({ knowsAlready: false, misconception: { description: 'verb never changes', exampleWrong: 'She go' }, difficulty: 3 }, false, 0.5); expect(k).toMatch(/mistaken belief/); expect(stateLine({ knowsAlready: true, misconception: null, difficulty: 2 }, true, 0.8)).toMatch(/KNOW the rule/); });
  it('harder outcomes mean more slips and less prior knowledge (difficulty sensitivity)', () => { const pop = makePopulation(150, 'd'); let e = 0; let h = 0; let ke = 0; let kh = 0; for (const s of pop) { for (let i = 0; i < 20; i += 1) { if (ib(s, 'b', `i${i}`, 'pre', 1).slip) e += 1; if (ib(s, 'b', `i${i}`, 'pre', 5).slip) h += 1; } if (bs(s, 'grammar', 'GR-01', 2, 1).knowsAlready) ke += 1; if (bs(s, 'grammar', 'GR-01', 2, 5).knowsAlready) kh += 1; } expect(e).toBe(0); expect(h).toBeGreaterThan(500); expect(kh).toBeLessThan(ke); });
});
