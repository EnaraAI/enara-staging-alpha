// DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BELOW, CONFIG, PlacementBank, PlacementItem, answer, checkStop, clearLevel, nextItem, result, scoreControlled, simulate, startSession, writingTask,
} from '../src/services/assessment/placementEngine';

const bank: PlacementBank = JSON.parse(readFileSync(join(__dirname, '../../data/assessments/placement/placement.json'), 'utf8'));
const right = (i: PlacementItem) => i.correctAnswer as string;
const wrong = () => 'zzz';
const byLevel = (map: Record<string, boolean>) => (i: PlacementItem) => (map[i.level] ? right(i) : wrong());

describe('placement bank', () => {
  it('is DRAFT, starts at A2 and has unique ids', () => {
    expect(bank.status).toBe('DRAFT');
    expect(bank.startLevel).toBe('A2');
    expect(new Set(bank.items.map((i) => i.id)).size).toBe(bank.items.length);
  });
  it('every item has level, reference and grader-format key or rubric', () => {
    for (const i of bank.items as any[]) {
      expect(bank.levels).toContain(i.level);
      expect(i.reference.length).toBeGreaterThan(3);
      if (i.type === 'open-response') {
        const max = i.rubric.criteria.reduce((s: number, c: any) => s + Math.max(...c.levels.map((l: any) => l.points)), 0);
        expect(max).toBe(i.points);
      } else {
        expect(i.acceptedAnswers).toContain(i.correctAnswer);
        if (i.options) expect(i.options).toContain(i.correctAnswer);
      }
    }
  });
  it('has one writing task and controlled items in every skill per level', () => {
    for (const l of bank.levels) {
      expect(bank.items.filter((i) => i.level === l && i.skill === 'writing')).toHaveLength(1);
      for (const s of CONFIG.skillOrder) expect(bank.items.filter((i) => i.level === l && i.skill === s).length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('scoring', () => {
  it('matches accepted answers after normalisation', () => {
    const it3 = bank.items.find((i) => i.id === 'PL-A1-RD-03')!;
    expect(scoreControlled(it3, ' Seven O’clock. ')).toBe(true); // case, spaces, curly apostrophe, final full stop
    expect(scoreControlled(it3, "Seven o'clock.")).toBe(true);
    expect(scoreControlled(it3, '8')).toBe(false);
  });
  it('refuses to score writing deterministically', () => {
    expect(() => scoreControlled(bank.items.find((i) => i.skill === 'writing')!, 'x')).toThrow();
  });
});

describe('adaptive flow (simulated learners)', () => {
  it('starts at A2', () => {
    expect(nextItem(bank, startSession(bank))!.level).toBe('A2');
  });
  it('strong learner: all correct -> A2 high, stops at 10 items', () => {
    const r = simulate(bank, right, (w) => w.points);
    expect(r.overall.level).toBe('A2');
    expect(r.stopReason).toBe('level_clear');
    expect(r.itemsUsed).toBe(10);
    expect(r.overall.label).toBe('high');
    expect(r.skills.writing.level).toBe('A2');
    expect(r.skills.writing.confidence).toBeLessThanOrEqual(CONFIG.writingCap);
  });
  it('A1 learner: A1 right, A2 wrong -> A1, moves down after 5 items', () => {
    const r = simulate(bank, byLevel({ A1: true, A2: false }), () => 0);
    expect(r.overall.level).toBe('A1');
    expect(r.itemsUsed).toBe(10);
    expect(r.overall.confidence).toBe(1);
    for (const s of CONFIG.skillOrder) expect(r.skills[s].level).toBe('A1');
    expect(r.skills.writing.level).toBe(BELOW); // A1 task scored 0
  });
  it('beginner: all wrong -> pre-A1', () => {
    const r = simulate(bank, wrong);
    expect(r.overall.level).toBe(BELOW);
    expect(r.itemsUsed).toBe(15);
    expect(r.skills.writing.level).toBeNull();
  });
  it('uneven profile: grammar weak at A2, reading and vocabulary strong', () => {
    const r = simulate(bank, (i) => (i.level === 'A2' && i.skill === 'grammar' ? wrong() : right(i)));
    expect(r.skills.grammar.level).toBe('A1');
    expect(r.skills.reading.level).toBe('A2');
    expect(r.skills.vocabulary.level).toBe('A2');
  });
  it('borderline learner never exceeds 25 items and is deterministic', () => {
    let k = 0;
    const alt = (i: PlacementItem) => (k++ % 5 < 3 ? right(i) : wrong()); // 60% everywhere
    const r1 = simulate(bank, alt);
    k = 0;
    const r2 = simulate(bank, alt);
    expect(r1).toEqual(r2);
    expect(r1.itemsUsed).toBeLessThanOrEqual(CONFIG.maxItems);
    expect(r1.overall.level).toBe('A2');
  });
  it('step API: blocks, stop check and writing task', () => {
    let s = startSession(bank);
    for (let n = 0; n < 5; n++) { const i = nextItem(bank, s)!; s = answer(bank, s, i.id, wrong()); }
    expect(s.current).toBe('A1');
    expect(checkStop(bank, s).stop).toBe(false);
    expect(clearLevel(bank, s.answers)).toBeNull();
    expect(() => answer(bank, s, s.answers[0].itemId, 'x')).toThrow();
    expect(writingTask(bank, s)!.level).toBe('A1');
    expect(() => result(bank, s, { itemId: 'PL-A1-WR-01', points: 99 })).toThrow();
  });
});
