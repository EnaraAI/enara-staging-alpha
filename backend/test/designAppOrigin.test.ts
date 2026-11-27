import { describe, expect, it } from 'vitest';
import { DESIGN_APP_ORIGIN, withDesignAppOrigin } from '../src/config/env';

// design.enara.app (owner, 27 Nov 2026): one exact origin added to CORS only when LMS_DESIGN_APP_ORIGIN=true.
describe('design app origin switch', () => {
  const base = ['https://lms-test.enara.app'];
  it('adds exactly https://design.enara.app when on', () => {
    expect(withDesignAppOrigin(base, { LMS_DESIGN_APP_ORIGIN: 'true' } as NodeJS.ProcessEnv)).toEqual([...base, 'https://design.enara.app']);
    expect(DESIGN_APP_ORIGIN).toBe('https://design.enara.app');
  });
  it('changes nothing when off, missing or not exactly true', () => {
    for (const v of [undefined, '', 'false', '1', 'yes']) expect(withDesignAppOrigin(base, { LMS_DESIGN_APP_ORIGIN: v } as NodeJS.ProcessEnv)).toEqual(base);
  });
  it('never duplicates', () => {
    expect(withDesignAppOrigin([...base, DESIGN_APP_ORIGIN], { LMS_DESIGN_APP_ORIGIN: 'true' } as NodeJS.ProcessEnv)).toEqual([...base, DESIGN_APP_ORIGIN]);
  });
});
