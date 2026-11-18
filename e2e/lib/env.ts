import fs from 'fs';
import path from 'path';

// Hosts and the per-run secrets (e2e/.env, written by scripts/gen-env.sh).
export const E2E_DIR = path.resolve(__dirname, '..');
export const RUN_DIR = path.join(E2E_DIR, '.run');

function readDotEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const dot = readDotEnv(path.join(E2E_DIR, '.env'));
const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? dot[k] ?? d;
  if (v === undefined) throw new Error(`${k} is not set (run scripts/gen-env.sh)`);
  return v;
};

export const MOODLE_HOST = env('MOODLE_HOST', 'moodle.school.test');
export const ENARA_HOST = env('ENARA_HOST', 'enara.tool.test');
export const MOODLE = `https://${MOODLE_HOST}`;
export const ENARA = `https://${ENARA_HOST}`;
export const secrets = {
  get maintenanceToken() { return env('MAINTENANCE_TOKEN'); },
  get enaraPassword() { return env('E2E_ENARA_PASSWORD'); },
  get moodlePassword() { return env('E2E_MOODLE_PASSWORD'); },
};
export const MOODLE_BRANCH = process.env.MOODLE_BRANCH ?? 'local';
