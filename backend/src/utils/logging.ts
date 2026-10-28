type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY_PATTERN =
  /(authorization|password|token|secret|api[-_]?key|cookie|set-cookie|signature|credential)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[REDACTED_DEPTH]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(nested, depth + 1);
  }
  return redacted;
}

function write(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const safeMeta = redact(meta) as Record<string, unknown>;
  const event = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...safeMeta,
  };
  const line = JSON.stringify(event);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const result: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    // Node system errors (ECONNRESET, ETIMEDOUT, ...) and the `pg` driver
    // attach these non-enumerable-by-default fields; without them a log
    // line like "read ECONNRESET" gives no way to tell which host/port it
    // was trying to reach.
    for (const key of ['code', 'errno', 'syscall', 'address', 'port'] as const) {
      const value = (error as unknown as Record<string, unknown>)[key];
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  return { message: String(error) };
}
