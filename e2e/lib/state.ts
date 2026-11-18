import fs from 'fs';
import path from 'path';
import { RUN_DIR } from './env';

// State shared between the scenario files of one run (ids made earlier).
const FILE = path.join(RUN_DIR, 'state.json');

export type State = Record<string, any>;

export function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}
export function saveState(patch: State): State {
  const next = { ...readState(), ...patch };
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

/** Timings for summary.md (seconds, rounded to 0.1). */
export function recordTiming(name: string, ms: number): void {
  const file = path.join(RUN_DIR, 'timings.json');
  let all: Record<string, number> = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first */ }
  all[name] = Math.round(ms / 100) / 10;
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

/** A full-page screenshot for the run report: .run/screenshots/<name>.png (uploaded as e2e-screenshots-<moodle>). */
export async function shot(page: { screenshot(o: { path: string; fullPage: boolean }): Promise<unknown> }, name: string): Promise<void> {
  const dir = path.join(RUN_DIR, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}
