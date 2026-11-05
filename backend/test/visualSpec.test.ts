import { describe, expect, it } from 'vitest';
import { parseVisualSpec, renderVisualSpec } from '../src/services/visualSpec';
import { sanitizeVisualHtml } from '../src/services/avatarVisuals';

const render = (text: string) => {
  const spec = parseVisualSpec(text);
  if (!spec || spec.kind === 'none') throw new Error('no spec');
  return renderVisualSpec(spec, sanitizeVisualHtml);
};

describe('compact visual descriptions', () => {
  it('builds each shape from the description', () => {
    expect(render('{"kind":"table","title":"Plurals","headers":["One","Many"],"rows":[["cat","cats"],["box","boxes"]]}')).toMatch(/<th>One<\/th>.*<td>boxes<\/td>/s);
    expect(render('{"kind":"list","items":[{"term":"hello","detail":"a greeting"}]}')).toContain('<span class="term">hello</span> — a greeting');
    expect(render('{"kind":"steps","items":["Add 3","Divide by 2"]}')).toContain('<ol><li>Add 3</li><li>Divide by 2</li></ol>');
    expect(render('{"kind":"dialogue","lines":[{"speaker":"A","text":"Hi!"},{"speaker":"B","text":"Hello."}]}')).toContain('<span class="who">B</span><span>Hello.</span>');
    expect(render('{"kind":"timeline","items":[{"when":"8:00 a.m.","text":"Breakfast"}]}')).toContain('<span class="when">8:00 a.m.</span>Breakfast');
    expect(render('{"kind":"svg","svg":"<svg viewBox=\\"0 0 10 10\\"><circle r=\\"4\\"/></svg>","caption":"A circle"}')).toContain('<circle r="4"/>');
  });

  it('escapes all text, so a description cannot inject markup', () => {
    const html = render('{"kind":"steps","title":"<img src=x onerror=alert(1)>","items":["<script>alert(1)</script>"]}');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sanitises the one free-form part, the SVG', () => {
    const html = render('{"kind":"svg","svg":"<svg viewBox=\\"0 0 10 10\\" onload=\\"alert(1)\\"><script>x()</script><rect width=\\"5\\"/></svg>"}');
    expect(html).not.toMatch(/onload|<script/);
    expect(html).toContain('<rect width="5"/>');
  });

  it('marks Arabic visuals right-to-left', () => {
    expect(render('{"kind":"steps","rtl":true,"items":["خطوة واحدة"]}')).toContain('dir="rtl"');
  });

  it('reads the description even with text around it, and rejects unusable ones', () => {
    expect(parseVisualSpec('Here you go:\n{"kind":"steps","items":["One"]}\n')).toMatchObject({ kind: 'steps' });
    expect(parseVisualSpec('{"kind":"none"}')).toEqual({ kind: 'none' });
    expect(parseVisualSpec('<div>a page</div>')).toBeNull();
    expect(parseVisualSpec('{"kind":"table","rows":[]}')).toBeNull();
    expect(parseVisualSpec('{"kind":"svg","svg":"not svg"}')).toBeNull();
    expect(parseVisualSpec('{"kind":"poster"}')).toBeNull();
    expect(parseVisualSpec('{broken')).toBeNull();
  });

  it('keeps descriptions short', () => {
    const items = Array.from({ length: 30 }, (_, i) => `"step ${i}"`).join(',');
    const spec = parseVisualSpec(`{"kind":"steps","items":[${items}]}`);
    expect(spec && spec.kind === 'steps' && spec.items.length).toBe(12);
  });
});
