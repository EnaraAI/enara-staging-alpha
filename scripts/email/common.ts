import path from 'node:path';

export const RESEND_API = 'https://api.resend.com';
export const TEMPLATES_DIR = path.resolve(__dirname, '../../backend/src/email/templates');

/** Returns the API key or exits; the key value is never printed. */
export function requireApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set. Export it (e.g. from backend/.env) and re-run.');
    process.exit(1);
  }
  return key;
}

export async function resendRequest(key: string, method: string, urlPath: string, body?: unknown): Promise<any> {
  const res = await fetch(`${RESEND_API}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = json?.message ?? text.slice(0, 300);
    throw new Error(`${method} ${urlPath} failed: HTTP ${res.status} ${json?.name ?? ''} ${msg}`.trim());
  }
  return json;
}

export interface TemplateMeta {
  id: string;
  name: string | null;
  subject: string | null;
  from: string | null;
  variables: { key: string; type: 'string' | 'number'; fallback_value: string | number | null }[];
}
