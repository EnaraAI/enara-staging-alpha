// Retention settings (Egypt PDPL decisions, 2026-11-17; docs/multi-class/ARCHIVE_NOTES.md).
// Read straight from the environment so models can use them for their TTL
// indexes at import time; config/env.ts reads them too, so a bad value stops
// the app at start-up with a clear message.
//
// SAFETY_ALERT_RETENTION_DAYS (P2): how long a safety alert about a
//   permanently deleted student is kept. 730 days (2 years) is a placeholder
//   until legal confirms the period.
// DATA_LOG_RETENTION_DAYS (P5): how long the app's own logs that hold personal
//   data are kept in MongoDB (sign-in history, sent-email log; user links on
//   AI call records). 30 days is a placeholder too.

export const DEFAULT_SAFETY_ALERT_RETENTION_DAYS = 730;
export const DEFAULT_DATA_LOG_RETENTION_DAYS = 30;
const MAX_DAYS = 3650;

function readDays(source: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = source[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw new Error(`${key} must be a whole number of days from 1 to ${MAX_DAYS}`);
  return n;
}

export const safetyAlertRetentionDays = (source: NodeJS.ProcessEnv = process.env) =>
  readDays(source, 'SAFETY_ALERT_RETENTION_DAYS', DEFAULT_SAFETY_ALERT_RETENTION_DAYS);

export const dataLogRetentionDays = (source: NodeJS.ProcessEnv = process.env) =>
  readDays(source, 'DATA_LOG_RETENTION_DAYS', DEFAULT_DATA_LOG_RETENTION_DAYS);
