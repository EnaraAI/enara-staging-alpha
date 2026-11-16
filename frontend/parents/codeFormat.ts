// Parent link code input mask: ENR-XXXX-XXXX (8 characters after the prefix).
// Accepts any case, with or without dashes or spaces; the server normalises
// the same way (backend/src/parents/codes.ts normalizeCode).

export const CODE_CHARS = 8;
export const CODE_PLACEHOLDER = 'ENR-XXXX-XXXX';

export function formatCodeInput(input: string): string {
  const upper = String(input || '').toUpperCase();
  let raw = upper.replace(/[^A-Z0-9]/g, '');
  // Strip the prefix when it was typed or pasted as a prefix ("ENR-…", "ENR …"),
  // or when there are more characters than a code holds.
  if (raw.startsWith('ENR') && (/^\s*ENR[\s-]/.test(upper) || raw.length > CODE_CHARS)) raw = raw.slice(3);
  raw = raw.slice(0, CODE_CHARS);
  if (!raw) return '';
  return `ENR-${raw.slice(0, 4)}${raw.length > 4 ? `-${raw.slice(4)}` : ''}`;
}
