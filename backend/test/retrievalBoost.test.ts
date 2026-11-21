import { afterEach, describe, expect, it } from 'vitest';
import { asksToExplainAgain, parseRewrite, ragReuseOn, ragRewriteOn, retrieveWithRewrite, reusePassages } from '../src/services/retrievalBoost';

// ragRewrite + ragReuse (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN C): keyword retrieval missed cross-language questions; "explain again"
// searched from scratch.
const src = (n: number) => ({ n, chunkId: `c${n}`, text: 't', fileName: 'f.pdf', fileUrl: '', lessonId: 'l', score: 1 });
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('ragRewrite / ragReuse', () => {
  it('named-only switches, off by default', () => {
    expect(ragRewriteOn()).toBe(false);
    expect(ragReuseOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(ragRewriteOn() || ragReuseOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'ragRewrite,ragReuse';
    expect(ragRewriteOn() && ragReuseOn()).toBe(true);
  });

  it('"explain again" in English and Arabic; a long new question is not', () => {
    for (const t of ["I don't understand", 'Can you explain it again?', 'explain differently please', 'مش فاهم', 'اشرحها تاني', 'لم أفهم']) expect(asksToExplainAgain(t)).toBe(true);
    expect(asksToExplainAgain('What is photosynthesis?')).toBe(false);
    expect(asksToExplainAgain(`I don't understand ${'why the moon changes shape and what makes the tides rise and fall each day near the coast of Egypt '.repeat(2)}`)).toBe(false);
  });

  it('the rewrite reply is cleaned to keywords; empty is rejected', () => {
    expect(parseRewrite({ en: 'photosynthesis, plants; light!', ar: 'البناء الضوئي' })).toEqual({ en: 'photosynthesis plants light', ar: 'البناء الضوئي' });
    expect(() => parseRewrite({ en: '', ar: '' })).toThrow();
  });

  it('rewrite runs only when the first search finds nothing and the switch is on; one rewrite, one more search', async () => {
    const calls: string[] = [];
    const search = async (p: { query: string }) => { calls.push(p.query); return p.query.includes('photosynthesis') ? [src(1)] : []; };
    const rewrite = async () => ({ en: 'photosynthesis plants', ar: 'البناء الضوئي' });
    const base = { institutionId: 'i', curriculumId: 'c', query: 'ما هو البناء الضوئي؟' };
    expect(await retrieveWithRewrite(base, { search: search as never, rewrite })).toEqual({ sources: [], rewritten: false });
    process.env.ENARA_ENGINE_V2 = 'ragRewrite';
    calls.length = 0;
    const r = await retrieveWithRewrite(base, { search: search as never, rewrite });
    expect(r.rewritten).toBe(true);
    expect(r.sources.length).toBe(1);
    expect(calls).toEqual(['ما هو البناء الضوئي؟', 'photosynthesis plants البناء الضوئي']);
    calls.length = 0;
    await retrieveWithRewrite({ ...base, query: 'photosynthesis' }, { search: search as never, rewrite });
    expect(calls.length).toBe(1);
    expect(await retrieveWithRewrite(base, { search: search as never, rewrite: async () => { throw new Error('x'); } })).toEqual({ sources: [], rewritten: false });
  });

  it('reuse: switch off or no cited passages gives nothing (no database read)', async () => {
    expect(await reusePassages({ institutionId: 'i', curriculumId: 'c', chunkIds: ['a'] })).toEqual([]);
    process.env.ENARA_ENGINE_V2 = 'ragReuse';
    expect(await reusePassages({ institutionId: 'i', curriculumId: 'c', chunkIds: [] })).toEqual([]);
  });
});
