import { describe, it, expect } from 'vitest';
import { assignMatched } from '../src/design/assignment';
import { drawHoldout } from '../src/design/holdout';
import { itemBehaviour, makePopulation, blockStart } from '../src/students/population';
import { AREAS } from '../src/benchmark/schema';
const byArea = Object.fromEntries(AREAS.map((a, i) => [a, Array.from({ length: 8 }, (_, k) => `${'GRVORDWRFNLS'.slice(i * 2, i * 2 + 2)}-0${k + 1}`)])) as any;
const students = Array.from({ length: 20 }, (_, i) => `S${String(i + 1).padStart(3, '0')}`);
describe('Experiment 4 matched design', () => {
  const blocks = assignMatched({ seed: 'x', replication: 1, students, outcomesByArea: byArea, conditions: ['A', 'B', 'C'] });
  it('runs every unit under every condition, with unique block ids and one condition-independent seed key per unit', () => {
    expect(blocks.length).toBe(20 * 6 * 3); expect(new Set(blocks.map((b) => b.blockId)).size).toBe(blocks.length);
    const units = new Map<string, Set<string>>(); for (const b of blocks) (units.get(b.seedKey) ?? units.set(b.seedKey, new Set()).get(b.seedKey)!).add(b.condition);
    expect(units.size).toBe(120); for (const c of units.values()) expect([...c].sort()).toEqual(['A', 'B', 'C']);
  });
  it('each student-replication has one outcome per area and is reproducible', () => {
    for (const s of students.slice(0, 3)) expect(new Set(blocks.filter((b) => b.studentId === s).map((b) => b.area)).size).toBe(6);
    expect(assignMatched({ seed: 'x', replication: 1, students, outcomesByArea: byArea, conditions: ['A', 'B', 'C'] })).toEqual(blocks);
    expect(assignMatched({ seed: 'y', replication: 1, students, outcomesByArea: byArea, conditions: ['A', 'B', 'C'] })).not.toEqual(blocks);
  });
  it('hidden learner state and behaviour flags are identical across the three conditions of a unit', () => {
    const pop = makePopulation(5, 'p'); const s = pop[0]; const u = blocks.find((b) => b.studentId === s.id)!;
    const flags = (key: string) => ['i1', 'i2', 'i3'].map((i) => itemBehaviour(s, key, i, 'post', 3));
    expect(flags(u.seedKey)).toEqual(flags(u.seedKey)); expect(blockStart(s, u.area, u.outcomeId, 2, 3)).toEqual(blockStart(s, u.area, u.outcomeId, 2, 3));
  });
  it('hold-out draw is seeded, stratified, excludes read outcomes and does not overlap development', () => {
    const d = drawHoldout({ seed: 's', outcomesByArea: byArea, excluded: ['GR-01', 'VO-02'], perArea: { grammar: 3, vocabulary: 2, reading: 3, writing: 2, functional: 3, listening: 3 } });
    expect(d.holdout.length).toBe(16); expect(d.holdout).not.toContain('GR-01'); expect(d.holdout.some((o) => d.development.includes(o))).toBe(false); expect(d.holdout.length + d.development.length).toBe(48);
    expect(drawHoldout({ seed: 's', outcomesByArea: byArea, excluded: ['GR-01', 'VO-02'], perArea: { grammar: 3, vocabulary: 2, reading: 3, writing: 2, functional: 3, listening: 3 } }).sha256).toBe(d.sha256);
  });
});

import { conditionC } from '../src/conditions/simple';
import { Provider } from '../src/providers/guard';
import { Ledger } from '../src/ledger/ledger';
import { mkdtempSync, readFileSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';
describe('evidence seeding: the plain tutor gets the same record as text, only when seeding is on', () => {
  const ex = JSON.parse(readFileSync(path.join(__dirname, '../docs/example_outcome.json'), 'utf8')).outcomes[0];
  const run = async (seed: boolean) => {
    const systems: string[] = []; const f = (async (_u: string, init: { body: string }) => { const b = JSON.parse(init.body); systems.push(String(b.system)); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ANSWER: x' }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }); }) as unknown as typeof fetch;
    const p = new Provider(new Ledger(mkdtempSync(path.join(tmpdir(), 'es-')), 'r', 5), 'k', null, f, async () => {});
    const stu = makePopulation(2, 's')[0];
    await conditionC.teach({ student: stu, outcome: ex, blockId: 'b', persona: 'p', provider: p, studentModel: 'claude-haiku-5-5', ctx: (role) => ({ campaign: 'c', studentId: 's', blockId: 'b', role }), maxTurns: 1, seedEvidence: seed, hidden: { knowsAlready: false, misconception: 'The verb is the same for every person' } });
    return systems.find((x) => x.includes('You are a friendly English tutor')) ?? '';
  };
  it('record present when on, absent when off; never contains assessment prompts', async () => {
    const on = await run(true); const off = await run(false);
    expect(on).toContain("Student record from the school's system"); expect(on).toContain('still emerging'); expect(on).toContain('The verb is the same for every person'); expect(off).not.toContain('Student record');
    for (const it of [...ex.items.post, ...ex.items.transfer]) expect(on).not.toContain(it.prompt);
  });
});
