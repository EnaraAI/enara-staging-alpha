import { getConfig } from '../config/env';
import { providerCall } from '../email/provider';
import { guardOutgoing } from '../email/testInbox';
import { logger } from '../utils/logging';

// Sends through Resend's HTTP API. Returns false (and sends nothing) unless
// emails are enabled; with a test recipient set, every email goes there instead
// and says who it was meant for. On a staging deployment (ENARA_STAGING, e.g.
// lms-test) the shared test inbox rules apply instead (email/testInbox.ts:
// test inbox only, subject prefix, shared daily cap, capture; refused without
// a test inbox).
export function isEmailConfigured(): boolean {
  const { email } = getConfig();
  return email.enabled && !!email.resendApiKey && !!email.from;
}

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const { email } = getConfig();
  if (!isEmailConfigured()) return false;
  // Demo and test accounts use reserved .test addresses: never send to them
  // (and a test inbox shouldn't fill up with demo-session reminders).
  if (/\.test$/i.test(params.to.trim())) return false;

  const guard = await guardOutgoing({ kind: 'legacy', alias: 'legacy-email', to: [params.to], subject: params.subject, html: params.html });
  if (guard && !guard.send) return guard.result.ok;
  if (guard?.redirected) {
    const result = await post(email.resendApiKey!, email.from!, String(guard.to), guard.subject, guard.html);
    await guard.record(result);
    return result.ok;
  }

  const to = email.testRecipient || params.to;
  const html = email.testRecipient
    ? `<p style="font:13px system-ui;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:8px">Test copy: this email was for ${escapeHtml(params.to)}.</p>${params.html}`
    : params.html;
  return (await post(email.resendApiKey!, email.from!, to, params.subject, html)).ok;
}

// Paced and quota-aware (email/provider.ts): a 429 / quota refusal is a
// failure (one alert a day), never a throw.
function post(apiKey: string, from: string, to: string, subject: string, html: string) {
  return providerCall('legacy', 'legacy-email', async () => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn('email_send_failed', { status: res.status });
      const body = (await res.json().catch(() => null)) as { name?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.slice(0, 60) : '';
      return { ok: false as const, code: name || `http_${res.status}`, message: `HTTP ${res.status}` };
    }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true as const, id: typeof body?.id === 'string' ? body.id : 'sent' };
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function emailLayout(title: string, paragraphs: string[], button?: { label: string; url: string }): string {
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1f1f1f">` +
    `<p style="font-size:13px;font-weight:700;color:#0056D2;letter-spacing:.04em;text-transform:uppercase">Enara</p>` +
    `<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>` +
    paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px" dir="auto">${escapeHtml(p)}</p>`).join('') +
    (button
      ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="background:#0056D2;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;display:inline-block">${escapeHtml(button.label)}</a></p>`
      : '') +
    `</div>`
  );
}
