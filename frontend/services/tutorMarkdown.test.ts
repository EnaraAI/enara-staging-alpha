import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  completeStreamingMarkdown as streaming,
  firstStrongDir,
  linkCitations,
  prepareTutorMarkdown,
  prettifyMaths as maths,
  simplifyForKids,
} from './tutorMarkdown.ts';
import { SpeechChunkCleaner, stripMarkdownForSpeech } from './speechText.ts';

// Run with: node --import tsx --test services/tutorMarkdown.test.ts

test('streaming: an open emphasis or code marker is closed once text follows it', () => {
  assert.equal(streaming('Hello **bol'), 'Hello **bol**');
  assert.equal(streaming('Hello **bold*'), 'Hello **bold**');
  assert.equal(streaming('a *it'), 'a *it*');
  assert.equal(streaming('a _it'), 'a _it_');
  assert.equal(streaming('use `code'), 'use `code`');
  assert.equal(streaming('**a** and *b'), '**a** and *b*');
  assert.equal(streaming('***both'), '***both***');
  assert.equal(streaming('first\n\n**x** y **z'), 'first\n\n**x** y **z**');
});

test('streaming: a marker with nothing after it yet is hidden', () => {
  assert.equal(streaming('Hello **'), 'Hello ');
  assert.equal(streaming('Hello *'), 'Hello ');
  assert.equal(streaming('use `'), 'use ');
  assert.equal(streaming('Line\n#'), 'Line\n');
  assert.equal(streaming('Line\n## '), 'Line\n');
  assert.equal(streaming('Line\n- '), 'Line\n');
  assert.equal(streaming('Line\n2.'), 'Line\n');
  assert.equal(streaming('x\n``'), 'x\n');
  assert.equal(streaming('see [1'), 'see ');
  assert.equal(streaming('see [the page](https://exa'), 'see the page');
});

test('streaming: finished text, maths stars and snake_case are left alone; an open code block is closed', () => {
  for (const done of ['Hello **bold** and *it*', '3 * 4 = 12', '3*4', 'snake_case', 'see [1] here', '- one\n- two']) assert.equal(streaming(done), done);
  assert.equal(streaming('```py\nx = 1'), '```py\nx = 1\n```');
  assert.equal(streaming(''), '');
});

test('maths: powers, roots, operators and LaTeX become readable symbols', () => {
  assert.equal(maths('x^2 + y^3 = z^{10}'), 'x² + y³ = z¹⁰');
  assert.equal(maths('(a+b)^2 and 10^-3 and x^n'), '(a+b)² and 10⁻³ and xⁿ');
  assert.equal(maths('sqrt(16) = 4, \\sqrt{x+1}'), '√16 = 4, √(x+1)');
  assert.equal(maths('\\(\\frac{3}{4} \\times 2\\)'), '¾ × 2');
  assert.equal(maths('\\[ a \\le b \\neq c \\pm \\pi \\ge d \\]'), 'a ≤ b ≠ c ± π ≥ d');
  assert.equal(maths('$x^2$ costs $5 and $10'), 'x² costs $5 and $10');
  assert.equal(maths('3 * 4 = 12, 3*4, a * b'), '3 × 4 = 12, 3×4, a × b');
  assert.equal(maths('12 / 4 = 3 and 12 \\div 4'), '12 ÷ 4 = 3 and 12 ÷ 4');
  assert.equal(maths('x_1 + x_2 and 90^\\circ'), 'x₁ + x₂ and 90°');
  assert.equal(maths('\\frac{x+1}{2}'), '(x+1)/2');
});

test('maths: simple fractions are shown as fractions, never dates, URLs, code or file names', () => {
  assert.equal(maths('3/4 and 5/12'), '¾ and ⁵⁄₁₂');
  assert.equal(maths('Due 3/4/2024 or 05/11'), 'Due 3/4/2024 or 05/11');
  assert.equal(maths('https://example.com/1/2?x^2'), 'https://example.com/1/2?x^2');
  assert.equal(maths('see [page](https://a.b/3/4) x^2'), 'see [page](https://a.b/3/4) x²');
  assert.equal(maths('`x^2 + 3/4`'), '`x^2 + 3/4`');
  assert.equal(maths('file_1 snake_case_2 **bold** 2**3'), 'file_1 snake_case_2 **bold** 2**3');
});

test('citations: [1], [1, 2] and Arabic-digit [١] become chip links; real links and code stay', () => {
  assert.equal(linkCitations('Paris [1].'), 'Paris [1](#cite-1).');
  assert.equal(linkCitations('Both [2, 3]'), 'Both [2](#cite-2)[3](#cite-3)');
  assert.equal(linkCitations('باريس [١]'), 'باريس [١](#cite-1)');
  assert.equal(linkCitations('[1](https://x.y) and `[1]`'), '[1](https://x.y) and `[1]`');
});

test('kids: headings become bold lines and list items plain lines', () => {
  assert.equal(simplifyForKids('# Title\n- one\n* two\n1. first\n> quote\n---'), '**Title**\none\ntwo\n1\\. first\nquote\n');
  assert.equal(simplifyForKids('Big cat\n==='), 'Big cat\n');
});

test('direction: the first strong letter decides', () => {
  assert.equal(firstStrongDir('3 تفاحات و 2 apples'), 'rtl');
  assert.equal(firstStrongDir('2 apples و تفاحة'), 'ltr');
  assert.equal(firstStrongDir('3 + 4'), null);
});

test('prepare: streaming, kids, maths and citations together', () => {
  assert.equal(prepareTutorMarkdown('## Steps\n- x^2 [1]\n- **sq', { streaming: true, simple: true }), '**Steps**\nx² [1](#cite-1)\n**sq**');
});

test('speech: Markdown symbols, citations and LaTeX are not spoken; maths becomes words', () => {
  assert.equal(stripMarkdownForSpeech('**Great** job! x^2 + 3*4 = 12 [1]'), 'Great job! x squared + 3 times 4 = 12');
  assert.equal(stripMarkdownForSpeech('# Heading\n- item one\n1. first'), 'Heading\nitem one\nfirst');
  assert.equal(stripMarkdownForSpeech('\\(\\frac{1}{2}\\) and \\sqrt{9} and √16 and 12 ÷ 4'), '1 over 2 and the square root of 9 and the square root of 16 and 12 divided by 4');
  assert.equal(stripMarkdownForSpeech('Use `code` and [a link](https://x.y).'), 'Use code and a link.');
  assert.equal(stripMarkdownForSpeech('5 - 3 = 2 and 90°, y³'), '5 - 3 = 2 and 90 degrees, y cubed');
  assert.equal(stripMarkdownForSpeech('س² + ٣ × ٤ [١]'), 'س تربيع + ٣ ضرب ٤');
  assert.equal(stripMarkdownForSpeech('**'), '');
});

test('speech in pieces: a marker split across pieces is still removed, mid-line dashes stay', () => {
  const cleaner = new SpeechChunkCleaner();
  const pieces = ['Here is **bo', 'ld** text: 5 ', '- 3 = 2\n- it', 'em [1', '] done'];
  const said = pieces.map((p) => cleaner.push(p)).join('') + cleaner.flush();
  assert.equal(said.replace(/\s+/g, ' '), 'Here is bold text: 5 - 3 = 2 item done');
});

test('speech: the browser copy is the same code as the server copy', () => {
  const body = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^(\/\/.*\n)+/, '');
  assert.equal(body('./speechText.ts'), body('../../backend/src/services/speechText.ts'));
});
