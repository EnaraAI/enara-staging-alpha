// Live calls reach the video and speech services through Enara's relay
// (rt.enara.app), so the browser only talks to Enara addresses. If the relay
// doesn't answer, calls connect to the services directly, as before.
//
// Testing overrides: ?relay=off or ?relay=<url> on the page, or
// localStorage 'enara.relay' set to 'off' or a URL.

const DEFAULT_RELAY = (import.meta.env?.VITE_RELAY_URL as string | undefined) ?? 'https://rt.enara.app';
// A first connection to the relay (DNS, TLS) can take over a second.
const CHECK_TIMEOUT_MS = 3000;
const REMEMBER_MS = 60_000;

let last: { base: string; ok: boolean; at: number } | null = null;
let pending: Promise<string | null> | null = null;

function configuredBase(): string | null {
  let override: string | null = null;
  try {
    override = new URLSearchParams(globalThis.location?.search || '').get('relay') || globalThis.localStorage?.getItem('enara.relay') || null;
  } catch {
    override = null;
  }
  if (override === 'off') return null;
  const base = override || DEFAULT_RELAY;
  return base ? base.replace(/\/$/, '') : null;
}

// The relay's base URL when it is reachable, else null (connect directly).
export function relayBase(): Promise<string | null> {
  const base = configuredBase();
  if (!base) return Promise.resolve(null);
  if (last && last.base === base && Date.now() - last.at < REMEMBER_MS) return Promise.resolve(last.ok ? base : null);
  if (pending) return pending;
  pending = (async () => {
    let ok = false;
    try {
      const res = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      ok = res.ok;
    } catch {
      ok = false;
    }
    last = { base, ok, at: Date.now() };
    pending = null;
    return ok ? base : null;
  })();
  return pending;
}

// A connection through the relay failed: use the services directly for a while.
export function markRelayDown(): void {
  const base = configuredBase();
  if (base) last = { base, ok: false, at: Date.now() };
}

export const relayWsBase = (base: string) => base.replace(/^http/, 'ws');
