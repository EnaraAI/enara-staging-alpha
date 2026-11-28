// Tests for the autonomy switches, the hourly cron (hold, DeepSeek check, caps, stale tasks) and Undo. fetch is mocked.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const { default: worker } = await import(process.argv[3]);
const sq = new DatabaseSync(':memory:');
sq.exec(fs.readFileSync(process.argv[2], 'utf8'));
const DB = { prepare(sql) { let params = []; const st = {
  bind(...p) { params = p; return st; },
  async first() { return sq.prepare(sql).get(...params) ?? null; },
  async all() { return { results: sq.prepare(sql).all(...params) }; },
  async run() { const r = sq.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; } }; return st; } };
const env = { DB, SITE_PASSWORD: 'test-only-pass-123', SESSION_KEY: 'test-only-session-key', DEEPSEEK_API_KEY: 'ak-test.as-test' };
const call = (path, init = {}) => worker.fetch(new Request('https://site.test' + path, init), env);
let ok = 0, fail = 0; const t = (name, cond) => { if (cond) ok++; else { fail++; console.log('FAIL', name); } };
const f = new FormData(); f.set('password', env.SITE_PASSWORD);
const cookie = (await call('/login', { method: 'POST', body: f, headers: { 'CF-Connecting-IP': '3.3.3.3' } })).headers.get('set-cookie').split(';')[0];
const H = { Cookie: cookie, 'X-Req': '1', 'Content-Type': 'application/json' };
const post = (p, b) => call(p, { method: 'POST', headers: H, body: JSON.stringify(b) });
const DAY = 864e5, ago = d => new Date(Date.now() - d * DAY).toISOString();
const put = (coll, id, data, v = 1) => sq.prepare('INSERT INTO docs VALUES (?,?,?,?,?)').run(coll, id, JSON.stringify(data), v, 'x');
const lead = id => { const r = sq.prepare("SELECT data, version FROM docs WHERE coll='leads' AND id=?").get(id); return { ...JSON.parse(r.data), version: r.version }; };
const setLead = (id, fields) => { const l = lead(id); delete l.version; sq.prepare("UPDATE docs SET data=?, version=version+1 WHERE coll='leads' AND id=?").run(JSON.stringify({ ...l, ...fields }), id); };
const cron = async () => { const ps = []; await worker.scheduled({}, env, { waitUntil: p => ps.push(p) }); await Promise.all(ps); };
let checkReply = { ok: true, problems: [] }, checkCalls = 0;
globalThis.fetch = async (url, o) => { checkCalls++; t('check goes to DeepSeek on Modal', String(url).endsWith('.modal.direct/v1/chat/completions') && JSON.parse(o.body).messages[0].content.includes('Never say')); return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(checkReply) } }] }), { status: 200 }); };
const draft = { subject: 'Re: hello', body: 'Short follow-up.\n\nIf this isn\'t relevant, just reply "no thanks" and I won\'t email again.' };
put('config', 'settings', { paused: false, sendCapPerDay: 50 });
put('leads', 'fu-1', { org: 'Follow School', status: 'drafted', step: 2, email: 'head@fu1.test', emailKind: 'named', score: 4, draft, sentLog: [{ step: 1, at: ago(6) }] });
put('leads', 'fu-2', { org: 'Manual Only', status: 'drafted', step: 2, email: 'head@fu2.test', draft, sentLog: [{ step: 1, at: ago(6), manual: true }] });
put('leads', 'first-1', { org: 'Top School', status: 'drafted', step: 1, email: 'principal@top1.test', emailKind: 'named', score: 5, draft, sentLog: [] });
put('leads', 'first-2', { org: 'Top School 2', status: 'drafted', step: 1, email: 'principal@top2.test', emailKind: 'named', score: 5, draft, sentLog: [] });
put('leads', 'first-low', { org: 'OK School', status: 'drafted', step: 1, email: 'p@ok.test', emailKind: 'named', score: 4, draft, sentLog: [] });
put('leads', 'first-free', { org: 'Free Mail', status: 'drafted', step: 1, email: 'someone@gmail.com', emailKind: 'named', score: 5, draft, sentLog: [] });
put('leads', 'first-office', { org: 'Office', status: 'drafted', step: 1, email: 'info@office.test', emailKind: 'role', score: 5, draft, sentLog: [] });
put('leads', 'first-dnc', { org: 'Blocked', status: 'drafted', step: 1, email: 'head@blocked.test', emailKind: 'named', score: 5, draft, sentLog: [] });
put('dnc', 'e-blocked', { value: 'blocked.test', kind: 'domain' });
put('leads', 'deal-1', { org: 'Quiet Deal', status: 'replied', stage: 'meeting_booked', stageAt: ago(10), sentLog: [] });
put('leads', 'deal-2', { org: 'Fresh Deal', status: 'replied', stage: 'meeting_booked', stageAt: ago(2), sentLog: [] });
put('leads', 'deal-3', { org: 'Planned Deal', status: 'replied', stage: 'demo_done', stageAt: ago(10), nextStep: 'Call', nextStepDue: '2099-01-01', sentLog: [] });

// Switches: sign-in, X-Req, validation; all off by default.
let r = await call('/api/autonomy', { method: 'POST', headers: { 'X-Req': '1' }, body: '{}' }); t('autonomy needs sign-in', r.status === 401);
r = await call('/api/autonomy', { method: 'POST', headers: { Cookie: cookie }, body: '{}' }); t('autonomy needs X-Req', r.status === 400);
r = await call('/api/state', { headers: H }); let j = await r.json();
t('all switches off by default + limits', Object.entries(j.autonomy).filter(([k, v]) => v === true).length === 0 && j.autonomy.holdHours === 12 && j.autonomy.followUpsPerDay === 15 && j.autonomy.firstPerDay === 5 && j.control.checkReady === true);
for (const [n, b] of [['unknown', { sendAll: true }], ['not boolean', { replies: 'yes' }], ['hold 0', { holdHours: 0 }], ['hold 100', { holdHours: 100 }], ['too many first', { firstPerDay: 21 }], ['empty', {}]]) { r = await post('/api/autonomy', { data: b }); t('autonomy ' + n + ' 400', r.status === 400); }
const before = JSON.stringify(sq.prepare("SELECT * FROM docs ORDER BY coll,id").all());
await cron(); t('all off: the cron changes nothing', JSON.stringify(sq.prepare("SELECT * FROM docs ORDER BY coll,id").all()) === before && checkCalls === 0);

// Follow-ups: hold, then the check, then approval after the hold.
r = await post('/api/autonomy', { data: { autoFollowUps: true } }); j = await r.json(); t('switch on', r.status === 200 && j.autonomy.autoFollowUps === true && j.autonomy.autoFirst === false);
await cron();
let L = lead('fu-1'); const hold = (Date.parse(L.autoSendAt) - Date.now()) / 36e5;
t('follow-up scheduled 12h out', L.autoKind === 'followup' && hold > 11.9 && hold <= 12 && L.status === 'drafted');
t('follow-up after a manual contact is not automatic', !lead('fu-2').autoSendAt);
t('first emails not scheduled while that switch is off', !lead('first-1').autoSendAt);
await cron(); L = lead('fu-1'); t('check ran and passed', L.autoCheck && L.autoCheck.ok === true && checkCalls === 1);
await cron(); t('not approved before the hold ends', lead('fu-1').status === 'drafted');
setLead('fu-1', { autoSendAt: ago(0.01) }); await cron(); L = lead('fu-1');
t('approved after the hold', L.status === 'approved' && L.approvedBy === 'auto' && L.autoKind === 'followup');
let act = sq.prepare("SELECT id, data FROM docs WHERE coll='activity' AND json_extract(data,'$.leadId')='fu-1'").all();
t('logged by the agent with undo', act.length === 1 && JSON.parse(act[0].data).by === 'agent' && JSON.parse(act[0].data).undo);

// Undo the automatic approval (within 1 hour), once.
r = await post('/api/activity/' + act[0].id + '/undo', {}); L = lead('fu-1');
t('undo restores review and holds', r.status === 200 && L.status === 'drafted' && L.autoHold === true && !L.approvedBy);
r = await post('/api/activity/' + act[0].id + '/undo', {}); t('second undo 409', r.status === 409);
r = await post('/api/activity/nope-1/undo', {}); t('undo unknown 404', r.status === 404);
await cron(); t('held lead is not rescheduled', !lead('fu-1').autoSendAt || lead('fu-1').status === 'drafted' && lead('fu-1').autoSendAt === null);
r = await post('/api/leads/fu-1', { patch: { autoHold: false }, version: lead('fu-1').version }); t('allow automatic send again', r.status === 200 && lead('fu-1').autoHold === false);

// First emails: only score 5, named person, own-domain email, not on the do-not-contact list; capped per day.
await post('/api/autonomy', { data: { autoFirst: true, firstPerDay: 1 } });
await cron();
t('score-5 named leads scheduled', lead('first-1').autoKind === 'first' && lead('first-2').autoKind === 'first');
t('score 4, free mail, office address and do-not-contact are not', ['first-low', 'first-free', 'first-office', 'first-dnc'].every(id => !lead(id).autoSendAt));
await cron(); await cron();
checkReply = { ok: false, problems: ['Claims a customer'] };
setLead('first-2', { autoCheck: null }); await cron();
t('failed check is stored', lead('first-2').autoCheck.ok === false && lead('first-2').autoCheck.problems[0] === 'Claims a customer');
setLead('first-1', { autoSendAt: ago(0.01) }); setLead('first-2', { autoSendAt: ago(0.01) }); await cron();
t('failed check never approves', lead('first-2').status === 'drafted');
t('passed one approved', lead('first-1').status === 'approved' && lead('first-1').autoKind === 'first');
checkReply = { ok: true, problems: [] }; setLead('first-2', { autoCheck: null }); await cron(); setLead('first-2', { autoSendAt: ago(0.01) }); await cron();
t('daily cap of 1 first email holds', lead('first-2').status === 'drafted');

// Owner edits a waiting draft: its automatic send stops. Moving an approved email back to review also stops it.
await post('/api/autonomy', { data: { firstPerDay: 5 } });
r = await post('/api/leads/first-2', { patch: { draft: { subject: 'Changed', body: 'x' } }, version: lead('first-2').version });
t('editing a waiting draft holds it', r.status === 200 && lead('first-2').autoHold === true);
await cron(); t('held draft not scheduled', !lead('first-2').autoSendAt);
r = await post('/api/leads/first-1', { patch: { status: 'drafted' }, version: lead('first-1').version }); t('back to review holds', lead('first-1').autoHold === true);
r = await post('/api/leads/first-low', { patch: { status: 'approved', draft, approvedAt: ago(0) }, version: lead('first-low').version }); t('owner approval is marked', lead('first-low').approvedBy === 'owner');

// The agent rewrites a draft (new follow-up): the hold starts again and the check runs again.
put('leads', 'fu-3', { org: 'Rewrite', status: 'drafted', step: 2, email: 'h@fu3.test', draft, sentLog: [{ step: 1, at: ago(6) }] });
await cron(); await cron(); setLead('fu-3', { draft: { subject: 'Re: new', body: 'new text' }, autoSendAt: ago(0.01) }); await cron();
L = lead('fu-3'); t('changed draft restarts the hold', L.status === 'drafted' && Date.parse(L.autoSendAt) > Date.now() + 11 * 36e5);

// No DeepSeek key: nothing is approved automatically.
delete env.DEEPSEEK_API_KEY; setLead('fu-3', { autoCheck: null, autoHash: null, autoSendAt: null }); await cron(); await cron(); setLead('fu-3', { autoSendAt: ago(0.01) }); await cron();
t('no key: never approved', lead('fu-3').status === 'drafted' && lead('fu-3').autoCheck.ok === false);
env.DEEPSEEK_API_KEY = 'ak-test.as-test';

// Paused: the cron does nothing.
sq.prepare("UPDATE docs SET data=json_set(data,'$.paused',json('true')) WHERE coll='config' AND id='settings'").run();
const b2 = JSON.stringify(sq.prepare("SELECT * FROM docs WHERE coll='leads' ORDER BY id").all()); await cron();
t('paused: no changes', JSON.stringify(sq.prepare("SELECT * FROM docs WHERE coll='leads' ORDER BY id").all()) === b2);
sq.prepare("UPDATE docs SET data=json_set(data,'$.paused',json('false')) WHERE coll='config' AND id='settings'").run();

// Stale deals: one task after 7 days without a next step, never twice, undo removes it.
await post('/api/autonomy', { data: { staleTasks: true } }); await cron();
const tasks = () => sq.prepare("SELECT id, data FROM docs WHERE coll='tasks'").all().map(x => ({ id: x.id, ...JSON.parse(x.data) }));
t('stale task for the quiet deal only', tasks().length === 1 && tasks()[0].leadId === 'deal-1' && tasks()[0].title.includes('Quiet Deal') && tasks()[0].by === 'agent');
await cron(); t('no duplicate task', tasks().length === 1);
const ta = sq.prepare("SELECT id FROM docs WHERE coll='activity' AND json_extract(data,'$.leadId')='deal-1'").get();
r = await post('/api/activity/' + ta.id + '/undo', {}); t('undo removes the task', r.status === 200 && tasks().length === 0);
sq.prepare("UPDATE docs SET data=json_set(data,'$.at',?) WHERE coll='activity' AND id=?").run(ago(0.1), act[0].id);
put('activity', 'deal-2-1', { leadId: 'deal-2', at: ago(0.1), kind: 'status', text: 'old', by: 'agent', undo: { fields: { status: 'sent' }, expect: { status: 'replied' } } });
r = await post('/api/activity/deal-2-1/undo', {}); t('undo after 1 hour 409', r.status === 409);
put('activity', 'deal-2-2', { leadId: 'deal-2', at: ago(0), kind: 'status', text: 'x', by: 'agent', undo: { fields: { status: 'sent' }, expect: { status: 'not_interested' } } });
r = await post('/api/activity/deal-2-2/undo', {}); t('undo after a later change 409', r.status === 409 && lead('deal-2').status === 'replied');
put('dnc', 'e-x@y.test', { value: 'x@y.test' }); put('activity', 'deal-2-3', { leadId: 'deal-2', at: ago(0), kind: 'status', text: 'no thanks', by: 'agent', undo: { dnc: 'e-x@y.test', fields: { status: 'replied' }, expect: { status: 'replied' } } });
r = await post('/api/activity/deal-2-3/undo', {}); t('undo removes the do-not-contact entry', r.status === 200 && !sq.prepare("SELECT 1 FROM docs WHERE coll='dnc' AND id='e-x@y.test'").get());

// Reply drafts (written by the agent; the owner edits, approves or discards them).
setLead('deal-2', { replyDraft: { subject: 'Re: demo', body: 'Thanks' }, replyStatus: 'drafted' });
r = await post('/api/leads/deal-2', { patch: { replyDraft: { subject: 'Re: demo', body: 'Thanks, Tuesday works.' }, replyStatus: 'approved' }, version: lead('deal-2').version });
L = lead('deal-2'); t('reply approved', r.status === 200 && L.replyStatus === 'approved' && L.replyApprovedAt && L.replyDraft.body.includes('Tuesday'));
r = await post('/api/leads/deal-2', { patch: { replyStatus: 'sent' }, version: lead('deal-2').version }); t('owner cannot mark a reply sent', r.status === 400);
r = await post('/api/leads/deal-2', { patch: { autoHold: 'yes' }, version: lead('deal-2').version }); t('autoHold must be boolean', r.status === 400);

console.log(`passed ${ok}, failed ${fail}`);
if (fail) process.exitCode = 1;
