import { describe, expect, it } from 'vitest';
import { drawMath, parseMathSpec } from '../src/services/mathVisuals';
import { parseVisualSpec, renderVisualSpec } from '../src/services/visualSpec';

// Maths pictures drawn by code (owner, 22 Nov 2026). The visual sample "7 take away 3" was drawn by the model with the jumps between the
// wrong numbers; now the model gives only the numbers and code draws the picture and works out the answer.
const arcs = (svg: string) => (svg.match(/<path d="M[\d.]+ [\d.]+ Q/g) ?? []).length;
describe('maths pictures by code', () => {
  it('number line: 7 take away 3 is three jumps back from 7, landing on 4, and the result is worked out', () => {
    const m = drawMath(parseMathSpec({ kind: 'numberline', start: 7, change: -3 })!, false);
    expect(arcs(m.svg)).toBe(3);
    expect(m.result).toBe('7 − 3 = 4');
    expect(m.svg).toContain('end 4');
  });
  it('fractions: 2/8 + 3/8 = 5/8; 1/2 + 1/4 = 3/4 (common denominator by code)', () => {
    expect(drawMath(parseMathSpec({ kind: 'fractions', bars: [{ num: 2, den: 8 }, { num: 3, den: 8 }], op: '+' })!, false).result).toBe('2/8 + 3/8 = 5/8');
    expect(drawMath(parseMathSpec({ kind: 'fractions', bars: [{ num: 1, den: 2 }, { num: 1, den: 4 }], op: '+' })!, false).result).toBe('1/2 + 1/4 = 3/4');
    expect(drawMath(parseMathSpec({ kind: 'fractions', bars: [{ num: 2, den: 4 }, { num: 1, den: 4 }], op: '+' })!, false).result).toBe('2/4 + 1/4 = 3/4');
  });
  it('shapes: perimeter and area worked out by code; Arabic gets Arabic digits and words', () => {
    expect(drawMath(parseMathSpec({ kind: 'shape', shape: 'rectangle', width: 7, height: 3, unit: 'cm', show: 'perimeter' })!, false).result).toBe('Perimeter = 7 + 3 + 7 + 3 = 20 cm');
    expect(drawMath(parseMathSpec({ kind: 'shape', shape: 'triangle', base: 6, height: 4, show: 'area' })!, false).result).toBe('Area = ½ × 6 × 4 = 12');
    const ar = drawMath(parseMathSpec({ kind: 'shape', shape: 'rectangle', width: 7, height: 3, unit: 'سم', show: 'perimeter' })!, true);
    expect(ar.result).toBe('المحيط = ٧ + ٣ + ٧ + ٣ = ٢٠ سم');
    expect(ar.svg).toContain('٧ سم');
  });
  it('bad numbers are refused (the model then uses another shape)', () => {
    expect(parseMathSpec({ kind: 'numberline', start: 7, change: 0 })).toBeNull();
    expect(parseMathSpec({ kind: 'fractions', bars: [{ num: 3, den: 0 }] })).toBeNull();
    expect(parseMathSpec({ kind: 'shape', shape: 'triangle', base: 6 })).toBeNull();
  });
  it('through the visual format: the JSON becomes a drawn picture with the worked result', () => {
    const spec = parseVisualSpec('{"kind":"numberline","title":"7 take away 3","start":7,"change":-3,"caption":"Jump back 3."}')!;
    expect(spec.kind).toBe('math');
    const html = renderVisualSpec(spec as never, (s) => s);
    expect(html).toContain('<svg');
    expect(html).toContain('7 − 3 = 4');
    expect(html).toContain('Jump back 3.');
  });
});
