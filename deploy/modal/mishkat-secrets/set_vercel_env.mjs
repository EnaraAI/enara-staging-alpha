// Sets ONE variable on the lms-test Vercel project only (enara-lms-test in the new team). The value comes from the environment and is
// never printed. Refuses any other project. Usage: VAL=... node set_vercel_env.mjs <KEY> <plain|sensitive>
const TEAM = 'team_fHEDYVPWJ218PaXEBwnBMFvk', PROJECT = 'prj_tuRpwEJLz1dEQOj6RSEk2xUpqtIn', NAME = 'enara-lms-test';
const [key, type] = process.argv.slice(2); const value = process.env.VAL; const tok = process.env.VERCEL_TOKEN_NEW;
if (!/^MISHKAT_(TOKEN|ENDPOINT)$/.test(key ?? '') || !['plain', 'sensitive'].includes(type) || !value || !tok) { console.log('usage/inputs missing'); process.exit(1); }
const api = async (p, o = {}) => { const r = await fetch(`https://api.vercel.com${p}${p.includes('?') ? '&' : '?'}teamId=${TEAM}`, { ...o, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const p = await api(`/v9/projects/${PROJECT}`);
if (p.s !== 200 || p.j.name !== NAME) { console.log(`refusing: project is not ${NAME}`); process.exit(1); }
const doms = ((await api(`/v9/projects/${PROJECT}/domains`)).j.domains ?? []).map((d) => d.name);
if (doms.includes('test.enara.app')) { console.log('refusing: test.enara.app is frozen'); process.exit(1); }
const r = await api(`/v10/projects/${PROJECT}/env?upsert=true`, { method: 'POST', body: JSON.stringify({ key, value, type, target: ['production'] }) });
console.log(`${key} (${type}, production) on ${NAME}: ${r.s === 200 || r.s === 201 ? 'set' : `HTTP ${r.s} ${r.j.error?.code ?? ''}`}`);
if (!(r.s === 200 || r.s === 201)) process.exit(1);
