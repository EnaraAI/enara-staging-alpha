import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUAL_RULES_EXTRA, contentProblems, fixSvgLayout, svgProblems } from '../src/services/visualCheck';

// Owner (22 Nov 2026): "improve the drawings". Fixtures are the real pictures from the avatar test calls.
const SUN = readFileSync(new URL('./fixtures/visual-c03-sun.svg', import.meta.url), 'utf8');
describe('visual check', () => {
  it('the sun picture (c03): a label sitting on a ray or the curve is moved to free space, and nothing overlaps afterwards', () => {
    const before = svgProblems(SUN);
    expect(before).toContain('the label "Warm ground" covers a shape'); // the red dot
    const f = fixSvgLayout(SUN);
    expect(f.moved).toBeGreaterThan(0);
    expect(svgProblems(f.svg).filter((p) => /overlap|line runs through|covers a shape/.test(p))).toEqual([]);
  });
  it('two labels on top of each other: the second moves', () => {
    const svg = '<svg viewBox="0 0 600 360"><text x="100" y="100" font-size="16">Light</text><text x="100" y="102" font-size="16">Heat</text></svg>';
    expect(svgProblems(svg)[0]).toMatch(/overlap/);
    expect(svgProblems(fixSvgLayout(svg).svg)).toEqual([]);
  });
  it('a small shape nobody explained (the red dot) is reported', () => {
    const svg = '<svg viewBox="0 0 600 360"><circle cx="500" cy="300" r="10" fill="#FF7043"/><text x="60" y="60" font-size="16">Sun</text></svg>';
    expect(svgProblems(svg)).toContain('a small circle with no label near it');
  });
  it('a line that adds things not in the conversation (a04: "and I have two brothers")', () => {
    const conversation = 'Student: It is sunny today. Tutor: Great sentence! Now add where: say where it is sunny. Student: It is sunny here today.';
    const lines = ["Start: It's sunny today.", "Add where: It's sunny here today.", "Add more detail: It's sunny here in my town today.", "Now try your own: It's sunny here today, and I have two brothers."];
    const p = contentProblems(lines, conversation);
    expect(p.some((x) => /two brothers/.test(x) && /brothers/.test(x))).toBe(true);
    expect(p.some((x) => /^"Start/.test(x) || /^"Add where/.test(x))).toBe(false); // what was said is fine
  });
  it('the drawing rules: only the conversation, no names from speech, simple labelled pictures', () => {
    expect(VISUAL_RULES_EXTRA).toMatch(/never add new facts/);
    expect(VISUAL_RULES_EXTRA).toMatch(/Never write people's names from the student's message/);
    expect(VISUAL_RULES_EXTRA).toMatch(/never on a line/);
  });
});

describe('visual check: what is not flagged', () => {
  it('steps for a drawing the learner asked for are not "made up"', () => {
    expect(contentProblems(['Draw a base', 'Join the ends'], 'draw a triangle')).toEqual([]);
  });
});
