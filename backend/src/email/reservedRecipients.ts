// P0 item 4: addresses on reserved domains are never emailed (sendTemplate
// refuses them with code 'reserved_recipient'). Reserved: the special-use
// top-level domains .test, .example, .invalid and .localhost (RFC 2606/6761),
// the example second-level domains example.com/.net/.org, and the LMS
// placeholder domain lms.enara.test (LMS student accounts, never emailed).
// Each also covers every subdomain. An address with no usable domain is
// refused the same way.

export const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost'] as const;
export const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org', 'lms.enara.test'] as const;

/** The domain of "a@b.c" or "Name <a@b.c>", lower case, without a trailing dot. Null when there is none. */
export function recipientDomain(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  const angle = /<([^<>]*)>\s*$/.exec(address);
  const addr = (angle ? angle[1] : address).trim();
  const at = addr.lastIndexOf('@');
  if (at < 1) return null;
  const domain = addr.slice(at + 1).trim().toLowerCase().replace(/\.+$/, '');
  return domain && !/\s/.test(domain) ? domain : null;
}

export function isReservedDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.+$/, '');
  const tld = d.slice(d.lastIndexOf('.') + 1);
  if ((RESERVED_TLDS as readonly string[]).includes(tld)) return true;
  return RESERVED_DOMAINS.some((r) => d === r || d.endsWith(`.${r}`));
}

/** True when the address must not be emailed (reserved domain, or no domain at all). */
export function isReservedRecipient(address: unknown): boolean {
  const domain = recipientDomain(address);
  return !domain || isReservedDomain(domain);
}
