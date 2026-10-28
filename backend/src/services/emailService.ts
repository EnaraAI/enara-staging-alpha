import { getConfig } from '../config/env';
import { logger } from '../utils/logging';

// Sends through Resend's HTTP API. Returns false (and sends nothing) unless
// emails are enabled; with a test recipient set, every email goes there instead
// and says who it was meant for.
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const { email } = getConfig();
  if (!email.enabled || !email.resendApiKey || !email.from) return false;

  const to = email.testRecipient || params.to;
  const html = email.testRecipient
    ? `<p style="font:13px system-ui;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:8px">Test copy: this email was for ${escapeHtml(params.to)}.</p>${params.html}`
    : params.html;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: email.from, to: [to], subject: params.subject, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    logger.warn('email_send_failed', { status: res.status });
    return false;
  }
  return true;
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
