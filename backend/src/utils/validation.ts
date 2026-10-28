import { AppError } from '../middleware/errorHandler';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ensurePlainObject(value: unknown, field = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`${field} must be an object`, 400, 'VALIDATION_ERROR');
  }
  return value as Record<string, unknown>;
}

export function getRequiredString(
  source: Record<string, unknown>,
  field: string,
  options: { max?: number; trim?: boolean } = {}
): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
  }
  const normalized = options.trim === false ? value : value.trim();
  if (!normalized) {
    throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
  }
  if (options.max && normalized.length > options.max) {
    throw new AppError(`${field} is too long`, 400, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function getOptionalString(
  source: Record<string, unknown>,
  field: string,
  options: { max?: number; trim?: boolean } = {}
): string | undefined {
  const value = source[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(`${field} must be a string`, 400, 'VALIDATION_ERROR');
  }
  const normalized = options.trim === false ? value : value.trim();
  if (!normalized) return undefined;
  if (options.max && normalized.length > options.max) {
    throw new AppError(`${field} is too long`, 400, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function getRequiredId(source: Record<string, unknown>, field: string): string {
  const value = getRequiredString(source, field, { max: 128 });
  if (!ID_PATTERN.test(value)) {
    throw new AppError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function getOptionalId(source: Record<string, unknown>, field: string): string | undefined {
  const value = getOptionalString(source, field, { max: 128 });
  if (value !== undefined && !ID_PATTERN.test(value)) {
    throw new AppError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
  }
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new AppError('Invalid email address', 400, 'VALIDATION_ERROR');
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
  }
  if (value.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }
  if (value.length > 1024) {
    throw new AppError('Password is too long', 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function getOptionalNumber(
  source: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {}
): number | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new AppError(`${field} must be a number`, 400, 'VALIDATION_ERROR');
  }
  if (options.min !== undefined && value < options.min) {
    throw new AppError(`${field} must be >= ${options.min}`, 400, 'VALIDATION_ERROR');
  }
  if (options.max !== undefined && value > options.max) {
    throw new AppError(`${field} must be <= ${options.max}`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function getOptionalBoolean(
  source: Record<string, unknown>,
  field: string
): boolean | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    if (/^(true|1|yes)$/i.test(raw)) return true;
    if (/^(false|0|no)$/i.test(raw)) return false;
  }
  throw new AppError(`${field} must be a boolean`, 400, 'VALIDATION_ERROR');
}

export function getOptionalStringArray(
  source: Record<string, unknown>,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {}
): string[] | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new AppError(`${field} must be an array`, 400, 'VALIDATION_ERROR');
  }
  const maxItems = options.maxItems ?? 100;
  if (raw.length > maxItems) {
    throw new AppError(`${field} contains too many items`, 400, 'VALIDATION_ERROR');
  }
  return raw.map((item) => {
    if (typeof item !== 'string') {
      throw new AppError(`${field} values must be strings`, 400, 'VALIDATION_ERROR');
    }
    const normalized = item.trim();
    if (!normalized || normalized.length > (options.maxLength ?? 256)) {
      throw new AppError(`${field} contains an invalid value`, 400, 'VALIDATION_ERROR');
    }
    return normalized;
  });
}

export function getPagination(query: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(query.page || 1)) || 1);
  const requestedLimit = Math.floor(Number(query.limit || query.pageSize || 50)) || 50;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rejectMongoOperators(value: unknown, path = 'body'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectMongoOperators(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      throw new AppError(`Invalid field ${path}.${key}`, 400, 'VALIDATION_ERROR');
    }
    rejectMongoOperators(nested, `${path}.${key}`);
  }
}

export function pickAllowed<T extends readonly string[]>(
  source: Record<string, unknown>,
  allowed: T
): Partial<Record<T[number], unknown>> {
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked as Partial<Record<T[number], unknown>>;
}
