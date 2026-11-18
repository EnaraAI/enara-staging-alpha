import { createHash } from 'crypto';

// LTI platform storage (Phase 1b): the 1EdTech "LTI OIDC Login with LTI Client
// Side postMessages" flow (lti_storage_target, lti.put_data / lti.get_data).
// When the browser blocks ENARA's state cookie inside the LMS frame, the OIDC
// state and nonce are kept in the platform's own page storage instead:
//
//   login  (GET/POST /lti/login with lti_storage_target): a small page puts
//          state_<state> = <state> and nonce_<nonce> = <nonce> into the
//          platform's storage frame, waits for both acknowledgements (or the
//          timeout), then goes on to the platform's auth URL. The state cookie
//          is still set: when the browser keeps it, nothing else is needed.
//   launch (POST /lti/launch, no state cookie came back): the id_token is
//          checked, parked server-side (encrypted, on the state row, 2 min)
//          behind a one-time handle, and a page asks the storage frame for
//          both keys. It form-posts what the storage returned, the state and
//          the handle (never the id_token) to POST /lti/launch/verify, which
//          compares them with the stored hashes and only then signs in.
//
// Messages go only to the origin of the platform's OIDC auth URL (the spec's
// targetOrigin), and only responses from that origin with a message_id we sent
// are read. The script is static (CSP allows it by its SHA-256 hash only);
// the per-request data is a JSON data block, which CSP does not execute.

export const STORAGE_TIMEOUT_MS = 3000;
/** How long a parked id_token waits for the storage check. */
export const STORAGE_HOLD_TTL_MS = 2 * 60_000;

/** The frame name the platform gave, or undefined. "_parent" means the parent window itself. */
export function validStorageTarget(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(v) ? v : undefined;
}

export const storageKeys = (state: string, nonce: string) => ({ stateKey: `state_${state}`, nonceKey: `nonce_${nonce}` });

/**
 * The page's only script. Data comes from #lti-storage-data. In "put" mode it
 * goes on to `next` when done (or on timeout); in "get" mode it fills and
 * submits #lti-storage-form with r = ok | missing | unavailable and, for ok,
 * the two values the storage returned.
 */
export const STORAGE_SCRIPT = `(function () {
  'use strict';
  var d = JSON.parse(document.getElementById('lti-storage-data').textContent);
  var finished = false;
  var pending = {};
  var values = {};
  var left = d.items.length;
  function newId() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    return String(Date.now()) + '-' + String(Math.random()).slice(2);
  }
  function done(outcome) {
    if (finished) return;
    finished = true;
    window.removeEventListener('message', onMessage);
    if (d.mode === 'put') { window.location.replace(d.next); return; }
    var f = document.getElementById('lti-storage-form');
    f.elements.namedItem('r').value = outcome;
    f.elements.namedItem('s').value = outcome === 'ok' ? values[d.items[0].key] : '';
    f.elements.namedItem('n').value = outcome === 'ok' ? values[d.items[1].key] : '';
    f.submit();
  }
  function onMessage(ev) {
    if (ev.origin !== d.origin) return;
    var m = ev.data;
    if (!m || typeof m !== 'object' || m.subject !== d.subject + '.response') return;
    var key = pending[m.message_id];
    if (!key) return;
    delete pending[m.message_id];
    if (m.error) {
      done(d.mode === 'get' && m.error.code === 'key_not_found' ? 'missing' : 'unavailable');
      return;
    }
    if (d.mode === 'get' && (m.key !== key || typeof m.value !== 'string')) { done('missing'); return; }
    values[key] = m.value;
    left -= 1;
    if (left === 0) done('ok');
  }
  var host = window.parent && window.parent !== window ? window.parent : window.opener;
  var target = null;
  try { target = d.target === '_parent' ? host : (host && host.frames[d.target]); } catch (e) { target = null; }
  if (!target) { done('unavailable'); return; }
  window.addEventListener('message', onMessage);
  setTimeout(function () { done('unavailable'); }, d.timeoutMs);
  for (var i = 0; i < d.items.length; i++) {
    var id = newId();
    pending[id] = d.items[i].key;
    var msg = { subject: d.subject, message_id: id, key: d.items[i].key };
    if (d.mode === 'put') msg.value = d.items[i].value;
    try { target.postMessage(msg, d.origin); } catch (e) { done('unavailable'); return; }
  }
})();`;

export const STORAGE_SCRIPT_HASH = `sha256-${createHash('sha256').update(STORAGE_SCRIPT, 'utf8').digest('base64')}`;

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** JSON safe inside a <script type="application/json"> block. */
function jsonBlock(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export interface StoragePutPage {
  mode: 'put';
  target: string;
  origin: string;
  state: string;
  nonce: string;
  /** The platform's auth URL with the OIDC parameters. */
  next: string;
}

export interface StorageGetPage {
  mode: 'get';
  target: string;
  origin: string;
  state: string;
  nonce: string;
  /** The one-time handle of the parked id_token. */
  handle: string;
  /** POST /lti/launch/verify on the tool's base URL. */
  verifyUrl: string;
}

const PAGE_HEAD =
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENARA</title>` +
  `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2937;max-width:560px;margin:48px auto;padding:0 20px}</style></head><body>` +
  `<p>Opening ENARA…</p><noscript><p>Please turn on JavaScript, or open the activity again from your LMS.</p></noscript>`;

export function renderStoragePage(p: StoragePutPage | StorageGetPage, timeoutMs = STORAGE_TIMEOUT_MS): string {
  const { stateKey, nonceKey } = storageKeys(p.state, p.nonce);
  const data =
    p.mode === 'put'
      ? { mode: 'put', subject: 'lti.put_data', target: p.target, origin: p.origin, timeoutMs, next: p.next, items: [{ key: stateKey, value: p.state }, { key: nonceKey, value: p.nonce }] }
      : { mode: 'get', subject: 'lti.get_data', target: p.target, origin: p.origin, timeoutMs, items: [{ key: stateKey }, { key: nonceKey }] };
  const form =
    p.mode === 'get'
      ? `<form id="lti-storage-form" method="post" action="${escapeHtml(p.verifyUrl)}">` +
        `<input type="hidden" name="state" value="${escapeHtml(p.state)}"><input type="hidden" name="h" value="${escapeHtml(p.handle)}">` +
        `<input type="hidden" name="r" value=""><input type="hidden" name="s" value=""><input type="hidden" name="n" value=""></form>`
      : '';
  return `${PAGE_HEAD}${form}<script type="application/json" id="lti-storage-data">${jsonBlock(data)}</script><script>${STORAGE_SCRIPT}</script></body></html>`;
}
