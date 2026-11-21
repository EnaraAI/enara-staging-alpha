import { afterEach, describe, expect, it } from 'vitest';
import { lastSessionLine, sessionTopics, summarizeTurns, topicMemoryOn } from '../src/services/learnerMemory';

// topicMemory (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN E): the session summary keeps what the session worked from (cited passages) and how
// many questions the materials did not cover; the "last time" line names them. Code only, from stored citations.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
const t = (m: number) => new Date(Date.UTC(2026, 10, 20, 10, m));
const msgs = [
  { role: 'user', timestamp: t(0) },
  { role: 'ai', timestamp: t(1), meta: { citations: [{ fileName: 'Physics ch3.pdf', page: 12 }, { fileName: 'Physics ch3.pdf', page: 13 }] } },
  { role: 'user', timestamp: t(2) },
  { role: 'ai', timestamp: t(3), meta: { citations: [{ fileName: 'Physics ch3.pdf', page: 12 }], practiceTurn: { assessment: { verdict: 'INCORRECT' }, answeringCheck: true } } },
  { role: 'user', timestamp: t(4) },
  { role: 'ai', timestamp: t(5), meta: { outOfScope: true } },
];

describe('topicMemory', () => {
  it('named-only switch, off by default; off: the summary has no topics', () => {
    expect(topicMemoryOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(topicMemoryOn()).toBe(false);
    expect(summarizeTurns(msgs as never)).not.toHaveProperty('topics');
  });

  it('topics: most cited passages first, at most 3; out-of-scope questions counted', () => {
    expect(sessionTopics(msgs as never)).toEqual({ topics: ['Physics ch3.pdf p.12', 'Physics ch3.pdf p.13'], outOfScope: 1 });
    process.env.ENARA_ENGINE_V2 = 'topicMemory';
    expect(summarizeTurns(msgs as never)).toMatchObject({ topics: ['Physics ch3.pdf p.12', 'Physics ch3.pdf p.13'], outOfScope: 1, wrong: 1 });
  });

  it('the "last time" line names the material and the uncovered questions; never model text', () => {
    const line = lastSessionLine({ endedAt: t(5), right: 0, wrong: 1, stoppedWithOpenItem: false, nextStep: 'reteach', topics: ['Physics ch3.pdf p.12'], outOfScope: 1 } as never, 'Forces and motion', new Date(Date.UTC(2026, 10, 21, 10)));
    expect(line).toContain('"Forces and motion"');
    expect(line).toContain('worked from "Physics ch3.pdf p.12"');
    expect(line).toContain('1 question(s) were not in the course materials');
  });

  it('file names are cleaned (no quotes or angle brackets reach the prompt)', () => {
    const r = sessionTopics([{ role: 'ai', timestamp: t(1), meta: { citations: [{ fileName: 'a"<b>.pdf', page: null }] } }] as never);
    expect(r.topics[0]).toBe('ab.pdf');
  });
});
