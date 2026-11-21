// DeepSeek match test (owner go 21 Nov 2026): 100 fake tutor turns in every subject through lms-test's real prompt builder and the DeepSeek
// adapter, with the match parts off ("base", as live before) and on ("match"). Scored by fixed rules in code (below); teaching quality is
// read by hand from out/results.json. No secrets: the provider key stays on the server, the maintenance token only goes to lms-test.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const ARMS = (process.env.ARMS || 'base,match').split(',');
mkdirSync('out', { recursive: true });
const turns = JSON.parse(readFileSync(new URL('./turns.json', import.meta.url), 'utf8'));
const CLASS = { CORRECT: 'right', CORRECT_WITH_EQUIVALENT_FORMULATION: 'right', PARTIALLY_CORRECT: 'partial', INCORRECT: 'wrong', NOT_EVALUATED: 'none', AMBIGUOUS: 'none' };
const fold = (s) => s.normalize('NFKC').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()
  .replace(/(?<!\d)[./]|[./](?!\d)/g, ' ').replace(/[^\p{L}\p{N}./ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const arShare = (s) => { const l = s.match(/\p{L}/gu) ?? []; return l.length ? l.filter((c) => /[؀-ۿ]/.test(c)).length / l.length : 0; };
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const TASK = /[?؟]|_{2,}|…|\.\.\.|:\s*$|\b(write|try|complete|correct|answer|choose|find|work out|calculate|solve|say|tell me|read|fill|name|draw|explain|give)\b|اكتب|حاول|أجب|اجب|اختر|احسب|أكمل|اكمل|اذكر|استخرج|جرب|قل/i;
const OOS = /not (in|covered|part of)|isn'?t (in|covered)|doesn'?t cover|don'?t cover|aren'?t in|ليس(ت)? (في|من)|لا (ت|ي)(غطي|تناول|شمل)|مش موجود|غير موجود/i;
function score(t, r) {
  const e = t.expect; const text = r.text ?? ''; const checks = {};
  const v = r.assessment?.verdict; const cls = v ? CLASS[v] ?? 'none' : null;
  checks.marker = Boolean(r.assessment);
  checks.verdict = Boolean(cls && e.verdicts.includes(cls));
  if (e.retry && e.answer) { const a = fold(e.answer); const task = t.turn.history.at(-1)?.content ?? ''; checks.noLeak = !(a.length >= 2 && ` ${fold(text)} `.includes(` ${a} `) && !` ${fold(t.turn.query)} `.includes(` ${a} `) && !` ${fold(task)} `.includes(` ${a} `)); }
  if (e.task) { const tail = text.trim().split('\n').filter((l) => l.trim()).slice(-2).join(' '); checks.task = TASK.test(fold(tail)) || TASK.test(tail); }
  if (!e.english) checks.language = t.lang === 'ar' ? arShare(text) >= 0.3 : arShare(text) < 0.3 || /[a-z]{4}/i.test(text) && t.subject === 'arabic';
  if (t.age === 'u9') checks.length = words(text) <= 45; else if (t.age === 'child') checks.length = words(text) <= 80;
  if (e.cite) checks.cited = r.citations > 0;
  if (e.oos) { checks.saysNotCovered = OOS.test(text); checks.noFakeCitation = r.citations === 0; }
  const rules = Object.entries(checks).filter(([k]) => !['marker', 'verdict'].includes(k));
  return { checks, gradingOk: checks.marker && checks.verdict, rulesPassed: rules.filter(([, x]) => x).length, rulesTotal: rules.length };
}
const results = [];
async function one(arm, t) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await fetch(`${SITE}/api/maintenance/tutor-eval`, { method: 'POST', headers: H, body: JSON.stringify({ arm, turn: t.turn }), signal: AbortSignal.timeout(170_000) }).then((x) => x.json()).catch((e) => ({ ok: false, reason: String(e) }));
    if (r.ok || attempt === 2) { const s = r.ok ? score(t, r) : null; results.push({ arm, id: t.id, group: t.group, subject: t.subject, age: t.age, lang: t.lang, query: t.turn.query, task: t.turn.history.at(-1)?.content ?? null, claude: t.claude ?? null, expect: t.expect, ok: r.ok, reason: r.reason, ms: r.ms, raw: r.raw, text: r.text, assessment: r.assessment, repaired: r.repaired, citations: r.citations, usage: r.usage, ...s }); console.log(arm, t.id, r.ok, r.ms, s ? `${s.gradingOk ? 'G' : 'g'} ${s.rulesPassed}/${s.rulesTotal}` : r.reason); return; }
  }
}
const jobs = ARMS.flatMap((a) => turns.map((t) => () => one(a, t)));
await Promise.all(Array.from({ length: 4 }, async () => { while (jobs.length) await jobs.shift()(); }));
const summary = {};
for (const arm of ARMS) {
  const rs = results.filter((r) => r.arm === arm && r.ok);
  const by = (f) => Object.fromEntries([...new Set(rs.map(f))].map((g) => { const x = rs.filter((r) => f(r) === g); return [g, { n: x.length, grading: x.filter((r) => r.gradingOk).length, rules: `${x.reduce((a, r) => a + r.rulesPassed, 0)}/${x.reduce((a, r) => a + r.rulesTotal, 0)}` }]; }));
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  summary[arm] = { ok: rs.length, failed: results.filter((r) => r.arm === arm && !r.ok).length, marker: rs.filter((r) => r.checks.marker).length, gradingOk: rs.filter((r) => r.gradingOk).length,
    rules: `${rs.reduce((a, r) => a + r.rulesPassed, 0)}/${rs.reduce((a, r) => a + r.rulesTotal, 0)}`, repaired: rs.filter((r) => r.repaired).length,
    msMedian: ms[Math.floor(ms.length / 2)], msP90: ms[Math.floor(ms.length * 0.9)], tokensIn: Math.round(rs.reduce((a, r) => a + (r.usage?.input_tokens ?? 0), 0) / (rs.length || 1)), tokensOut: Math.round(rs.reduce((a, r) => a + (r.usage?.output_tokens ?? 0), 0) / (rs.length || 1)),
    byGroup: by((r) => r.group), byAge: by((r) => r.age), byLang: by((r) => r.lang) };
}
console.log(JSON.stringify(summary, null, 1));
results.sort((a, b) => a.id.localeCompare(b.id) || a.arm.localeCompare(b.arm));
writeFileSync('out/results.json', JSON.stringify({ summary, results }, null, 1));
writeFileSync('out/summary.json', JSON.stringify(summary, null, 1));
