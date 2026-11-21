import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IDS, parseAvatarIds } from '../src/maintenance/avatarUsageReport';

// The avatar cost and latency test reads numbers through a maintenance route (test database and maintenance token only).
describe('avatar usage report (maintenance, read only)', () => {
  const id = (n: number) => `av-${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
  it('accepts 1 to 30 avatar call ids and nothing else', () => {
    expect(parseAvatarIds(`${id(1)},${id(2)}`)).toEqual([id(1), id(2)]);
    expect(parseAvatarIds('')).toBeNull();
    expect(parseAvatarIds('av-1')).toBeNull();
    expect(parseAvatarIds(`${id(1)},$where`)).toBeNull();
    expect(parseAvatarIds(Array.from({ length: MAX_IDS + 1 }, (_, i) => id(i)).join(','))).toBeNull();
  });
  it('reads only (no writes) and returns no text fields', () => {
    const src = readFileSync(join(__dirname, '../src/maintenance/avatarUsageReport.ts'), 'utf8');
    expect(src).not.toMatch(/\.(updateOne|updateMany|insertMany|create|deleteOne|deleteMany|save)\(/);
    expect(src).not.toMatch(/select\([^)]*\b(messages|text|content|email|name)\b/);
  });
});
