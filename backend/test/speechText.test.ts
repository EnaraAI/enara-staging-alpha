import { describe, expect, it } from 'vitest';
import { SpeechChunkCleaner, stripMarkdownForSpeech } from '../src/services/speechText';

// The avatar speaks words only: the written reply keeps its Markdown (the
// browser renders it), the spoken sentences never read out symbols.
describe('stripMarkdownForSpeech', () => {
  it('drops Markdown symbols: bold, italics, headings, list markers, code, links', () => {
    expect(stripMarkdownForSpeech('**Great** job, *well* done!')).toBe('Great job, well done!');
    expect(stripMarkdownForSpeech('## Steps\n- first\n* second\n1. third\n> note')).toBe('Steps\nfirst\nsecond\nthird\nnote');
    expect(stripMarkdownForSpeech('Type `print(x)` or see [the lesson](https://example.com/l).')).toBe('Type print(x) or see the lesson.');
    expect(stripMarkdownForSpeech('**')).toBe('');
    expect(stripMarkdownForSpeech('snake_case stays')).toBe('snake_case stays');
  });

  it('drops citation markers, Western and Arabic digits', () => {
    expect(stripMarkdownForSpeech('Plants need light [1] and water [2, 3].')).toBe('Plants need light and water.');
    expect(stripMarkdownForSpeech('النباتات تحتاج الضوء [١].')).toBe('النباتات تحتاج الضوء.');
  });

  it('turns maths and simple LaTeX into words', () => {
    expect(stripMarkdownForSpeech('x^2 + y^3 = 3*4')).toBe('x squared + y cubed = 3 times 4');
    expect(stripMarkdownForSpeech('\\(\\frac{1}{2} \\times 6\\) and \\sqrt{9}')).toBe('1 over 2 times 6 and the square root of 9');
    expect(stripMarkdownForSpeech('12 ÷ 4 = 3, 2 × 5, x² and √16, 2^{10}')).toBe('12 divided by 4 = 3, 2 times 5, x squared and the square root of 16, 2 to the power of 10');
    expect(stripMarkdownForSpeech('a \\le b, c \\neq d, \\pm 1, \\pi r^2, 90°')).toBe('a is less than or equal to b, c is not equal to d, plus or minus 1, pi r squared, 90 degrees');
    expect(stripMarkdownForSpeech('5 - 3 = 2')).toBe('5 - 3 = 2');
  });

  it('speaks Arabic maths words in an Arabic reply', () => {
    expect(stripMarkdownForSpeech('س² + ٣ × ٤ [١]')).toBe('س تربيع + ٣ ضرب ٤');
  });

  it('leaves plain sentences exactly as they were', () => {
    for (const s of ['First sentence here.', 'وده التاني.', 'What is 7 plus 5?']) expect(stripMarkdownForSpeech(s)).toBe(s);
  });
});

describe('SpeechChunkCleaner', () => {
  it('removes markers split across streamed pieces, keeps a mid-line dash', () => {
    const c = new SpeechChunkCleaner();
    const said = ['Here is **bo', 'ld** text: 5 ', '- 3 = 2\n- it', 'em [1', '] done'].map((p) => c.push(p)).join('') + c.flush();
    expect(said.replace(/\s+/g, ' ')).toBe('Here is bold text: 5 - 3 = 2 item done');
  });
});
