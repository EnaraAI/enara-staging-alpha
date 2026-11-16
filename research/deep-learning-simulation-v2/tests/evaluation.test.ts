import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';
import { parseAnswer, forget, mastery, frac, dimensions, type BlockScores, type ItemResult } from '../src/evaluation/assess';
import { agreement, leakageScan, disagreementSample } from '../src/evaluation/judge';
import { makeStudent } from '../src/students/population';
import { scoreItem, isHedged } from '../src/benchmark/scoring';
import type { Outcome } from '../src/benchmark/schema';
const ex: Outcome = JSON.parse(readFileSync(path.join(__dirname, '../docs/example_outcome.json'), 'utf8')).outcomes[0];
const R = (correct: boolean, stage: any = 'post', mid: string | null = null): ItemResult => ({ itemId: 'i', stage, days: 0, answer: 'a', confidence: 50, correct, scoreDetail: '', lapse: false, guess: false, memoryChars: 0, misconceptionId: mid });
describe('deterministic scoring and mastery', () => {
  it('parses ANSWER/CONFIDENCE and tolerates free text', () => { expect(parseAnswer('ANSWER: plays\nCONFIDENCE: 80')).toEqual({ answer: 'plays', confidence: 80 }); expect(parseAnswer('plays').answer).toBe('plays'); expect(parseAnswer('ANSWER: x\nCONFIDENCE: 250').confidence).toBe(100); });
  it('hedged answers are wrong; whole-phrase match only', () => { const it = ex.items.post[0]; expect(scoreItem('drives', it).correct).toBe(true); expect(scoreItem('drive or drives', it).correct).toBe(false); expect(scoreItem('undrives', it).correct).toBe(false); expect(isHedged('a or b')).toBe(true); });
  it('every example answer in the shipped example scores as declared', () => { for (const it of [...ex.items.pre, ...ex.items.post, ...ex.items.transfer, ...ex.items.delayed]) { for (const r of it.right) expect(scoreItem(r, it).correct).toBe(true); for (const w of it.wrong) expect(scoreItem(w, it).correct).toBe(false); } });
  it('no mastery from a single correct answer: needs post and transfer thresholds', () => { const s: BlockScores = { pre: [], post: [R(true), R(false)], transfer: [R(true), R(false)], delayed: [], prereq: null }; expect(mastery(ex, s).mastered).toBe(false); s.post = [R(true), R(true)]; expect(mastery(ex, s).mastered).toBe(true); s.transfer = [R(false), R(false)]; expect(mastery(ex, s).mastered).toBe(false); });
  it('dimensions are computed from recorded results', () => { const s: BlockScores = { pre: [R(false, 'pre', 'GR-01-M1'), R(false, 'pre')], post: [R(true, 'post', 'GR-01-M1'), R(true)], transfer: [R(true), R(false)], delayed: [R(true), R(false), R(false), R(false)], prereq: null }; const d = dimensions(ex, s, 6); expect(d.acquisition).toBe(1); expect(d.transfer).toBe(0.5); expect(d.retention).toBe(0.25); expect(d.misconceptionRecovery).toBe(1); });
});
describe('forgetting', () => {
  it('is deterministic, keeps everything at day 0 and loses more over time', () => { const s = { ...makeStudent(1, 'x'), halfLifeDays: 7 }; const note = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.'; expect(forget(s, 'b', note, 0)).toBe(note); expect(forget(s, 'b', note, 7)).toBe(forget(s, 'b', note, 7)); let a = 0; let b = 0; for (let k = 0; k < 60; k += 1) { const t = { ...s, seed: k }; a += forget(t, 'b', note, 7).length; b += forget(t, 'b', note, 60).length; } expect(b).toBeLessThan(a); });
});
describe('independent evaluation', () => {
  it('agreement and kappa, and disagreements are listed for human audit', () => { const recs = [true, true, false, false, true, false].map((d, i) => ({ blockId: 'b', itemId: `i${i}`, answer: 'x', deterministic: d, judge: i === 5 ? true : d, agree: i !== 5 })); const a = agreement(recs); expect(a.rawAgreement).toBeCloseTo(5 / 6); expect(a.kappa).toBeLessThan(1); expect(disagreementSample(recs).length).toBe(1); });
  it('leakage scan flags assessment phrases in tutor text and ignores clean text', () => { const ph = [ex.items.post[0].prompt]; expect(leakageScan([{ where: 'tutor', text: 'Please correct the verb: my father drive to work. write the correct verb.' }], ph).length).toBe(1); expect(leakageScan([{ where: 'tutor', text: 'Remember: he, she, it takes -s.' }], ph).length).toBe(0); });
  it('frac handles empty', () => { expect(frac([])).toBeNaN(); });
});
