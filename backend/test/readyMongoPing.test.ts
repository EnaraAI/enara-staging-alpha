import { describe, expect, it } from 'vitest';
import { mongoReachable } from '../src/app';

// /ready's database check (24 Nov 2026): an open connection answers at once; a reopening one is decided by one ping (2 s limit).
describe('mongoReachable', () => {
  const conn = (readyState: number, ping?: () => Promise<unknown>) => ({ readyState, db: ping ? { admin: () => ({ ping }) } : undefined });
  it('open connection: true, no ping', async () => {
    let pinged = false;
    expect(await mongoReachable(conn(1, async () => { pinged = true; }))).toBe(true);
    expect(pinged).toBe(false);
  });
  it('reopening (connecting or disconnected) but the ping answers: true', async () => {
    expect(await mongoReachable(conn(2, async () => ({ ok: 1 })))).toBe(true);
    expect(await mongoReachable(conn(0, async () => ({ ok: 1 })))).toBe(true);
  });
  it('ping fails or is too slow: false; never connected: false', async () => {
    expect(await mongoReachable(conn(0, async () => { throw new Error('down'); }))).toBe(false);
    expect(await mongoReachable(conn(2, () => new Promise((r) => setTimeout(r, 500))), 50)).toBe(false);
    expect(await mongoReachable(conn(0))).toBe(false);
  });
});
