import { randomUUID } from 'crypto';
import { UsageLedger, type IUsageLedger } from '../models/UsageLedger';
import { logger } from '../utils/logging';

// Appends one usage row. Idempotent on operationKey: a repeated write (a
// retried request, a replayed job) with the same billing data returns the
// existing row and adds nothing. The same key with different billing data is
// a conflict: it is logged and thrown, never accepted silently.
// Not wired to any call site yet (P0b).
export type LedgerInput = Omit<Partial<IUsageLedger>, 'id' | 'createdAt'> &
  Pick<IUsageLedger, 'operationKey' | 'feature' | 'provider' | 'modelName' | 'status' | 'priceCatalogVersion' | 'costStatus'>;

// Fields that decide what is billed and to whom. Request metadata (requestId,
// role, errorCode) may differ between retries.
const BILLING_FIELDS = [
  'institutionId', 'userId', 'studentId', 'feature', 'refs', 'provider', 'modelName', 'units', 'attempt', 'status',
  'priceCatalogVersion', 'currency', 'costInternal', 'costStatus', 'billedUnits', 'unitsBasis', 'origin',
] as const;
// Schema defaults, so an omitted field equals its stored default.
const DEFAULTS: Record<string, unknown> = { attempt: 1, currency: 'USD', costInternal: null, origin: 'live', units: {} };

// Stable form for comparison: drops undefined/empty values and sorts keys.
function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || value instanceof Date) return value instanceof Date ? value.toISOString() : value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = normalize(obj[k]);
    if (v !== null) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function billingDifferences(entry: LedgerInput, existing: Record<string, unknown>): string[] {
  return BILLING_FIELDS.filter((f) => {
    const a = normalize(entry[f] ?? DEFAULTS[f]);
    const b = normalize(existing[f] ?? DEFAULTS[f]);
    return JSON.stringify(a) !== JSON.stringify(b);
  });
}

export class UsageLedgerConflictError extends Error {
  readonly code = 'USAGE_LEDGER_CONFLICT';
  constructor(readonly operationKey: string, readonly fields: string[], readonly existingId: string) {
    super(`usage_ledger operationKey ${operationKey} reused with different ${fields.join(', ')}`);
    this.name = 'UsageLedgerConflictError';
  }
}

export async function appendUsage(entry: LedgerInput): Promise<{ row: IUsageLedger; created: boolean }> {
  if (!entry.operationKey?.trim()) throw new Error('operationKey is required');
  try {
    const row = await UsageLedger.create({ ...entry, id: `ul-${randomUUID()}` });
    return { row, created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const row = await UsageLedger.findOne({ operationKey: entry.operationKey });
    if (!row) throw error;
    const fields = billingDifferences(entry, row.toObject() as unknown as Record<string, unknown>);
    if (fields.length) {
      logger.error('usage_ledger_conflict', { operationKey: entry.operationKey, existingId: row.id, fields });
      throw new UsageLedgerConflictError(entry.operationKey, fields, row.id);
    }
    return { row, created: false };
  }
}
