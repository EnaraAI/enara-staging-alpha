// DeepSeek check and comparison on lms-test (owner, 21 Nov 2026): GET /api/maintenance/llm-check, then each of the 20 past tutor turns
// (fake learners, research prompts) through POST /api/maintenance/llm-compare. Results go to out/results.json (no secrets: the provider
// key stays on the server; the maintenance token is only sent to lms-test).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
mkdirSync('out', { recursive: true });
const check = await (await fetch(`${SITE}/api/maintenance/llm-check`, { headers: H, signal: AbortSignal.timeout(300_000) })).json();
console.log('CHECK', JSON.stringify({ ...check, models: undefined, modelIds: (check.models ?? []).map((m) => m.id) }));
const turns = JSON.parse(readFileSync(new URL('./turns.json', import.meta.url), 'utf8'));
// Run 3: test a short rule reminder for DeepSeek (marker first, answer the last message, length) before building it: B = at the end of
// the prompt, C = as the system message.
const REMIND = 'Rules for this reply, most important first:\n1. Your reply MUST start with the hidden line [[assess verdict=... relevance=... next=...]] in exactly the format described above. Never leave it out.\n2. Reply to the STUDENT\'s LAST message in the conversation: judge that answer first (right, partly right or wrong; a spelling slip is an error), then give exactly ONE task.\n3. Keep to the length limits for this learner. No stories, lists or worked examples unless the instructions above ask for one now.';
const results = [];
// Run 4: the real request shape (instructions as the system prompt, the conversation as real turns). D = as is; E = the reminder at the
// end of the system prompt.
const shape = (t) => {
  const [sys, conv = ''] = t.prompt.split('CONVERSATION SO FAR:');
  const msgs = [];
  for (const line of conv.replace(/\n*Write the tutor's next reply only\.\s*$/, '').trim().split('\n')) {
    const m = line.match(/^(STUDENT|TUTOR): ?(.*)$/);
    if (m) msgs.push({ role: m[1] === 'STUDENT' ? 'user' : 'assistant', content: m[2] });
    else if (msgs.length) msgs[msgs.length - 1].content += `\n${line}`;
  }
  return { system: sys.trim(), messages: msgs };
};
// Run 5 (after #66): the real request shape; the adapter now adds the reminder itself.
const arms = { F: (t) => shape(t) };
for (const [arm, mk] of Object.entries(arms)) for (const t of turns) {
  const r = await fetch(`${SITE}/api/maintenance/llm-compare`, { method: 'POST', headers: H, body: JSON.stringify({ ...mk(t), max_tokens: 900 }), signal: AbortSignal.timeout(120_000) }).then((x) => x.json()).catch((e) => ({ ok: false, reason: String(e) }));
  results.push({ arm, id: t.id, ageGroup: t.ageGroup, kind: t.kind, learner: t.learner, claude: t.claude, deepseek: r.text ?? null, ms: r.ms, usage: r.usage, stop: r.stop, ok: r.ok, reason: r.reason });
  console.log('TURN', arm, t.id, r.ok, r.ms, JSON.stringify(r.usage ?? {}));
}
writeFileSync('out/results.json', JSON.stringify({ check, results }, null, 1));
