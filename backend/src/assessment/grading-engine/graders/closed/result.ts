// Shared builder for code-graded results: points per part, rounded to 2 decimals, confidence 1, never flagged, no feedback text.
import type { CriterionResult, GradeResult, ReasonCode } from '../../../schema';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function codeResult(max: number, parts: { code: string; fraction: number; reason: ReasonCode }[], errorCodes: string[] = []): GradeResult {
  const each = parts.length ? max / parts.length : max;
  const criteria: CriterionResult[] = parts.map((p) => ({ code: p.code, points: round2(each * Math.min(1, Math.max(0, p.fraction))), max: round2(each), reason_code: p.reason }));
  // The total is computed from the exact shares (not the rounded parts), so 2 of 3 is 0.67, not 0.66.
  const total = round2(parts.length ? (max * parts.reduce((n, p) => n + Math.min(1, Math.max(0, p.fraction)), 0)) / parts.length : 0);
  return { total: Math.min(max, total), max, criteria, error_codes: [...new Set(errorCodes)], confidence: 1, flagged: false, feedback_text: '', grader: 'code' };
}

/** A whole-item result (one part). */
export const single = (max: number, code: string, fraction: number, reason: ReasonCode, errorCodes: string[] = []): GradeResult =>
  codeResult(max, [{ code, fraction, reason }], errorCodes);

export const isBlank = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
