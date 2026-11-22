import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/services/aiGateway', () => ({ meteredMessage: vi.fn() }));
import { cleanModelHtml } from '../src/services/avatarVisuals';

// The plants sample (22 Nov): the page began with the model's own sentence, which the learner would have seen.
describe('cleanModelHtml', () => {
  it('drops the sentence before a ```html fence and the fence itself', () => {
    const t = 'Here is a clear HTML/SVG visual aid that explains what a plant needs. ```html\n<div class="v"><h2>What do plants need?</h2></div>\n```';
    expect(cleanModelHtml(t)).toBe('<div class="v"><h2>What do plants need?</h2></div>');
  });
  it('drops text before the first tag when there is no fence; leaves a clean page alone', () => {
    expect(cleanModelHtml('Sure! <div>x</div>')).toBe('<div>x</div>');
    expect(cleanModelHtml('<div>x</div>')).toBe('<div>x</div>');
  });
});
