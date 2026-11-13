import { describe, it, expect, afterEach } from 'vitest';
import { researchAblated } from '../src/services/languageTeachingContext';
const saved = { a: process.env.ENARA_RESEARCH_ABLATE, n: process.env.NODE_ENV };
afterEach(() => { if (saved.a === undefined) delete process.env.ENARA_RESEARCH_ABLATE; else process.env.ENARA_RESEARCH_ABLATE = saved.a; process.env.NODE_ENV = saved.n; });
describe('research ablation hook', () => {
  it('is OFF by default', () => { delete process.env.ENARA_RESEARCH_ABLATE; for (const f of ['diagnosis', 'hint_ladder', 'teach_rule', 'rule_check', 'learner_history', 'transfer_check']) expect(researchAblated(f)).toBe(false); });
  it('ablates only the named features outside production', () => { process.env.NODE_ENV = 'test'; process.env.ENARA_RESEARCH_ABLATE = 'diagnosis, hint_ladder'; expect(researchAblated('diagnosis')).toBe(true); expect(researchAblated('hint_ladder')).toBe(true); expect(researchAblated('teach_rule')).toBe(false); });
  it('is ignored in production', () => { process.env.NODE_ENV = 'production'; process.env.ENARA_RESEARCH_ABLATE = 'diagnosis'; expect(researchAblated('diagnosis')).toBe(false); });
});
