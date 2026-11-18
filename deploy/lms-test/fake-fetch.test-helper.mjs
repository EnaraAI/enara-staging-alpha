// Test helper only (loaded with `node --import`): replaces fetch with a fake
// Vercel API and a fake lms-test.enara.app, driven by FAKE_SCENARIO (JSON) and
// logging every call to FAKE_LOG (method, url, body; never header values).
import { appendFileSync } from 'node:fs';

const s = JSON.parse(process.env.FAKE_SCENARIO || '{}');
const state = {
  project: s.project,
  domains: s.domains ?? [],
  envs: s.envs ?? [],
  deployments: s.deployments ?? {},
  serving: s.serving, // the host lms-test.enara.app answers from
  statusCode: s.statusCode ?? 200,
  run: s.run ?? { ok: true, steps: [] },
  migrate: s.migrate ?? { applied: [], pending: [] },
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = init.headers ?? {};
  appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ method, url: url.toString(), body: init.body ? JSON.parse(init.body) : undefined, auth: !!headers.Authorization })}\n`);
  if (url.host === 'api.vercel.com') {
    const p = url.pathname;
    let m;
    if (method === 'GET' && /^\/v9\/projects\/[^/]+$/.test(p)) return json(200, state.project);
    if (method === 'GET' && /\/domains$/.test(p)) return json(200, { domains: state.domains.map((name) => ({ name })), pagination: {} });
    if (method === 'GET' && /^\/v9\/projects\/[^/]+\/env$/.test(p)) return json(200, { envs: state.envs });
    if (method === 'GET' && (m = /^\/v1\/projects\/[^/]+\/env\/([^/]+)$/.exec(p))) return json(200, state.envs.find((e) => e.id === m[1]) ?? {});
    if (method === 'POST' && /^\/v10\/projects\/[^/]+\/env$/.test(p)) return json(201, { created: JSON.parse(init.body) });
    if (method === 'PATCH' && /^\/v9\/projects\/[^/]+\/env\/[^/]+$/.test(p)) return json(200, {});
    if (method === 'GET' && (m = /^\/v13\/deployments\/([^/]+)$/.exec(p))) {
      const d = state.deployments[decodeURIComponent(m[1])] ?? Object.values(state.deployments).find((x) => x.url === decodeURIComponent(m[1]));
      return d ? json(200, d) : json(404, { error: { code: 'not_found' } });
    }
    if (method === 'POST' && (m = /^\/v10\/projects\/[^/]+\/promote\/([^/]+)$/.exec(p))) {
      const d = state.deployments[decodeURIComponent(m[1])];
      state.project = { ...state.project, targets: { production: { id: d.id, url: d.url } } };
      if (!s.servingStaysAfterPromote) state.serving = d.url;
      return json(201, {});
    }
    if (method === 'GET' && p === '/v6/deployments') return json(200, { deployments: [] });
    return json(404, { error: { code: 'unexpected_call' } });
  }
  if (url.host === 'lms-test.enara.app') {
    if (url.pathname === '/ready') return json(200, { checks: { mongo: 'ok' } });
    if (url.pathname === '/.well-known/jwks.json') return json(200, { keys: [{ kid: 'k' }] });
    if (url.pathname === '/api/maintenance/status') {
      if (state.statusCode !== 200) return json(state.statusCode, { error: 'x' });
      const old = (s.oldBuilds ?? []).includes(state.serving);
      return json(200, old ? { pendingMigrations: [] } : { pendingMigrations: [], deployment: { url: state.serving, id: null } });
    }
    if (url.pathname === '/api/maintenance/migrate') return json(200, state.migrate);
    if (url.pathname === '/api/maintenance/health-check/setup') return json(200, { ok: true, platformId: 'lmsp_1', deploymentId: 'lmsd_1', assessmentId: 'LT-AS-HEALTH-CHECK' });
    if (url.pathname === '/api/maintenance/health-check/run') return json(200, state.run);
  }
  throw new Error(`fake fetch: unexpected host ${url.host}`);
};
