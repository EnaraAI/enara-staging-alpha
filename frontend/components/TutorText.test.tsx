import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorText } from './TutorText.tsx';

// Run with: node --import tsx --test components/TutorText.test.tsx

const html = (props: React.ComponentProps<typeof TutorText>) => renderToStaticMarkup(<TutorText {...props} />);
const visible = (markup: string) => markup.replace(/<[^>]+>/g, '');

test('bold, italics, lists, line breaks and inline code render as elements, not symbols', () => {
  const out = html({ text: '**Well done!** Try *this*:\n- one\n- two\n\nLine one\nLine two and `x + 1`' });
  assert.match(out, /<strong[^>]*>Well done!<\/strong>/);
  assert.match(out, /<em[^>]*>this<\/em>/);
  assert.match(out, /<ul[^>]*>[\s\S]*<li[^>]*>one<\/li>[\s\S]*<li[^>]*>two<\/li>/);
  assert.match(out, /Line one<br\/>\s*Line two/);
  assert.match(out, /<code[^>]*>x \+ 1<\/code>/);
  assert.doesNotMatch(visible(out), /\*|`/);
});

test('model HTML is shown as text, never run; unsafe links are plain text; http(s) links open safely', () => {
  const out = html({ text: 'Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [good](https://example.com/a)' });
  assert.doesNotMatch(out, /<script|<img/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(out, /javascript:/);
  assert.match(out, /<span>bad<\/span>/);
  assert.match(out, /<a href="https:\/\/example.com\/a" target="_blank" rel="noopener noreferrer"[^>]*>good<\/a>/);
});

test('Arabic: every block takes its own direction (dir=auto), an Arabic list is right to left', () => {
  const out = html({ text: 'الجواب هو 12 apples.\n\n- أولًا 3/4\n- ثانيًا x^2' });
  assert.match(out, /<p dir="auto"[^>]*>الجواب هو 12 apples.<\/p>/);
  assert.match(out, /<ul dir="rtl"/);
  assert.match(out, /<li dir="auto"[^>]*>أولًا ¾<\/li>/);
  assert.match(out, /ثانيًا x²/);
});

test('maths in a reply is readable', () => {
  const out = visible(html({ text: 'So \\(\\frac{1}{2} \\times 6 = 3\\) and x^2 = 9, so x = sqrt(9).' }));
  assert.equal(out, 'So ½ × 6 = 3 and x² = 9, so x = √9.');
});

test('citations: a small chip with the source name; a plain chip when the reply has no metadata', () => {
  const out = html({ text: 'Plants need light [1] and water [٢].', citations: [{ n: 1, fileName: 'Biology.pdf', page: 4 }] });
  assert.match(out, /<sup title="Biology.pdf, page 4" aria-label="Source: Biology.pdf, page 4"[^>]*data-testid="tutor-cite">1<\/sup>/);
  assert.match(out, /<sup title="Source 2"[^>]*>٢<\/sup>/);
  assert.doesNotMatch(visible(out), /\[|\]/);
});

test('streaming: no stars or backticks flash before the formatting appears', () => {
  for (const partial of ['**Wel', '**Well do', 'Use `co', 'Use `', 'Steps:\n- ', 'Steps:\n#', 'Hi *']) {
    assert.doesNotMatch(visible(html({ text: partial, streaming: true })), /[*`#]/, partial);
  }
  assert.match(html({ text: '**Wel', streaming: true }), /<strong[^>]*>Wel<\/strong>/);
});

test('kids (simple): no lists or headings, list items are plain lines, headings plain bold', () => {
  const out = html({ text: '# Animals\n- cat\n- dog\n1. first\n\n## Next', simple: true });
  assert.doesNotMatch(out, /<(ul|ol|li|h\d)\b/);
  assert.match(out, /<strong[^>]*>Animals<\/strong><br\/>\s*cat<br\/>\s*dog<br\/>\s*1. first/);
  assert.match(out, /<strong[^>]*>Next<\/strong>/);
});
