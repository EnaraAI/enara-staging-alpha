import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { expect } from 'vitest';

// Scenario recorder: every scenario logs input, expected, actual and pass/fail to
// the audit directory, then asserts, so failures are both visible and recorded.
export const AUDIT_DIR = path.resolve(__dirname, '../../../docs/benchmarks/language-teaching/20261109-post-remediation-validation/scenarios');

export interface Scenario { id: string; area: string; input: string; expected: string; actual: string; pass: boolean; severityIfFail: 'P0' | 'P1' | 'P2' | 'P3' | 'INFO'; ref: string; note?: string }

export function recorder(file: string) {
  const rows: Scenario[] = [];
  return {
    rows,
    check(s: Omit<Scenario, 'pass' | 'ref'> & { pass?: boolean; ref?: string }, ok?: boolean) {
      const pass = ok ?? s.pass ?? s.expected === s.actual;
      rows.push({ ...s, pass, ref: s.ref ?? `backend/test/audit-post-remediation/${file}` });
      expect(pass, `${s.id}: expected ${s.expected} | actual ${s.actual}`).toBe(true);
    },
    // Records a scenario without failing the run (used for measurement-only items such as telemetry FP/FN rates).
    measure(s: Omit<Scenario, 'ref'> & { ref?: string }) {
      rows.push({ ...s, ref: s.ref ?? `backend/test/audit-post-remediation/${file}` });
    },
    flush() {
      mkdirSync(AUDIT_DIR, { recursive: true });
      writeFileSync(path.join(AUDIT_DIR, `${file.replace(/\.audit\.ts$/, '')}.json`), JSON.stringify(rows, null, 1));
    },
  };
}
