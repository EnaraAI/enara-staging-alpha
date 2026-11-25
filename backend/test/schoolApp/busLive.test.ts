import { afterEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { busLiveSiteOn, DEFAULT_WINDOWS, etaMinutes, inWindow, normalizeBusCode } from '../../src/schoolApp/busLive';

// Live bus map (owner "go" 25 Nov 2026): the pure parts. The routes and the full flow are covered by e2e scenario 42.
const at = (hm: string) => new Date(`2026-11-25T${hm}:00+02:00`); // Cairo (UTC+2 in November)

describe('live bus map', () => {
  afterEach(() => { delete process.env.SCHOOL_APP_BUS_LIVE_ENABLED; });
  it('is off unless SCHOOL_APP_BUS_LIVE_ENABLED is set', () => {
    expect(busLiveSiteOn()).toBe(false);
    process.env.SCHOOL_APP_BUS_LIVE_ENABLED = 'true';
    expect(busLiveSiteOn()).toBe(true);
  });
  it('trips start only inside the school trip hours (Cairo time)', () => {
    expect(inWindow(DEFAULT_WINDOWS, at('06:00'))).toBe(true);
    expect(inWindow(DEFAULT_WINDOWS, at('09:29'))).toBe(true);
    expect(inWindow(DEFAULT_WINDOWS, at('09:30'))).toBe(false);
    expect(inWindow(DEFAULT_WINDOWS, at('11:00'))).toBe(false);
    expect(inWindow(DEFAULT_WINDOWS, at('16:59'))).toBe(true);
    expect(inWindow(DEFAULT_WINDOWS, at('21:00'))).toBe(false);
    expect(inWindow([{ from: '00:00', to: '23:59' }], at('21:00'))).toBe(true);
  });
  it('arrival estimate: about 1.4 × the straight line at town speed, never below a minute', () => {
    const stop = { lat: 30.05, lng: 31.24 };
    expect(etaMinutes({ lat: 30.05, lng: 31.24 }, stop)).toBe(1);
    const twoKm = { lat: 30.05 + 2 / 111.2, lng: 31.24 };
    expect(etaMinutes(twoKm, stop)).toBeGreaterThanOrEqual(8);
    expect(etaMinutes(twoKm, stop)).toBeLessThanOrEqual(9);
    expect(etaMinutes({ ...twoKm, speed: 14 }, stop)).toBeLessThan(etaMinutes(twoKm, stop));
  });
  it('codes: BUS-XXXX-XXXX in any case and spacing; anything else is refused', () => {
    expect(normalizeBusCode('bus-abcd-2345')).toBe('ABCD2345');
    expect(normalizeBusCode(' BUS ABCD 2345 ')).toBe('ABCD2345');
    expect(normalizeBusCode('ABCD2345')).toBe('ABCD2345');
    expect(normalizeBusCode('BUS-ABC')).toBeNull();
    expect(normalizeBusCode({})).toBeNull();
  });
  it('a bus token is not an ENARA session token (different type and audience)', () => {
    const token = jwt.sign({ typ: 'bus-supervisor', sid: 's1', iid: 'i1', v: 0 }, 'k', { audience: 'enara-bus' });
    const p = jwt.verify(token, 'k', { audience: 'enara-bus' }) as { typ: string };
    expect(p.typ).toBe('bus-supervisor');
    expect(() => jwt.verify(token, 'k', { audience: 'enara' })).toThrow();
  });
});
