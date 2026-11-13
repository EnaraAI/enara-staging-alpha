// ENARA LTB v1.0 — scorer. Applies the frozen deterministic checks
// (scoring_spec_v1.json) and combines them with the judge's provisional scores.
// Writes case_scores.csv and aggregate_results.json. No network.
//   node benchmarks/ltc-v1/score.mjs [--dir DIR] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const DIR = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : path.resolve(here, '../../../docs/benchmarks/language-teaching/20261109T-ltb-v1.0');
const DRY = argv.includes('--dry');
const f = (n) => path.join(DIR, n);
const jsonl = (n) => (existsSync(f(n)) ? readFileSync(f(n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const cases = new Map(jsonl('benchmark_cases.jsonl').map((c) => [c.id, c]));
const raw = jsonl(DRY ? 'dry_run_results.jsonl' : 'raw_results.jsonl');
const attempts = jsonl(DRY ? 'dry_run_attempts.jsonl' : 'provider_attempts.jsonl').filter((a) => a.kind === 'provider_attempt');
const judged = jsonl(DRY ? 'dry_judge_results.jsonl' : 'judge_results.jsonl');
const rubric = JSON.parse(readFileSync(f('rubric_v1.json'), 'utf8'));
const DIMS = rubric.dimensions.map((d) => d.id);

const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const MASTERY = [/\d+\s?%/, /\bmaster(ed|y)\b/i, /\byou are now (at )?[ABC][12]\b/i, /\byour level is [ABC][12]\b/i, /\byou have (fully )?learned\b/i];

function checks(c, r) {
  const se = c.structuredExpectations;
  const turns = r.turns;
  const last = turns.at(-1) ?? {};
  const atts = attempts.filter((a) => a.caseId === c.id);
  const tutorAtts = atts.filter((a) => a.maxTokens === 4000);
  const out = {};
  out.reply_received = turns.length === c.turns.length && turns.every((t) => t.httpStatus === 200 && (t.reply ?? '').trim() && (t.tutorAttempt ?? []).some((a) => a.status === 200));
  out.no_direct_identifiers_in_payload = atts.length > 0 && atts.every((a) => a.identifierLeaks === 0);
  out.language_context_block_present = tutorAtts.length > 0 && tutorAtts.every((a) => a.hasLtcBlock);
  out.expected_move_any = se.movesAny.length ? (last.languageTurn?.moves ?? []).some((m) => se.movesAny.includes(m)) : null;
  out.no_mastery_or_percentage_claim = !turns.some((t) => MASTERY.some((re) => re.test(t.reply ?? '')));
  out.within_word_limit = turns.every((t) => words(t.reply) <= se.maxWords);
  out.no_full_answer_before_attempt = se.noFullAnswer ? !(se.answerKey && norm(last.reply).includes(norm(se.answerKey))) : null;
  if (se.offTopic) {
    const titleWords = norm(c.lesson?.title).split(' ').filter((w) => w.length >= 4);
    const reply = norm(last.reply);
    const mentions = reply.includes('english') || titleWords.some((w) => reply.includes(w));
    const didTask = /maths/.test(c.turns[0]) ? /\b62\b/.test(last.reply ?? '') : words(last.reply) > 120;
    out.off_topic_redirect = mentions && words(last.reply) <= se.maxWords && !didTask;
  } else out.off_topic_redirect = null;
  out.clarifying_question = se.clarifyGoal ? (last.reply ?? '').includes('?') : null;
  return out;
}

const judgeFor = (id) => judged.find((j) => j.caseId === id && j.pass === 1);

function outcome(det, j) {
  const detFail = Object.values(det).some((v) => v === false);
  if (det.reply_received === false || det.no_direct_identifiers_in_payload === false) return 'does_not_meet';
  if (!j?.result) return 'unscored';
  const vals = DIMS.map((d) => j.result.scores[d]).filter((v) => v !== 'n/a');
  const critical = (j.result.failures ?? []).some((x) => x.severity === 'critical');
  if (critical || vals.some((v) => v === 0)) return 'does_not_meet';
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!detFail && vals.every((v) => v >= 2) && mean >= 3) return 'meets_expectations';
  return 'partially_meets';
}

const rows = [];
for (const r of raw) {
  const c = cases.get(r.caseId);
  const det = checks(c, r);
  const j = judgeFor(r.caseId);
  const vals = j?.result ? DIMS.map((d) => j.result.scores[d]) : DIMS.map(() => null);
  const num = vals.filter((v) => typeof v === 'number');
  const caseAtts = attempts.filter((a) => a.caseId === r.caseId);
  rows.push({
    caseId: r.caseId, cohort: c.cohort, cefr: c.cefr, caseType: c.caseType, turns: r.turns.length,
    ...Object.fromEntries(Object.entries(det).map(([k, v]) => [`chk_${k}`, v === null ? 'n/a' : v ? 'pass' : 'fail'])),
    ...Object.fromEntries(DIMS.map((d, i) => [`judge_${d}`, vals[i] ?? ''])),
    judge_mean: num.length ? Number((num.reduce((a, b) => a + b, 0) / num.length).toFixed(2)) : '',
    failures: (j?.result?.failures ?? []).map((x) => `${x.severity}:${x.category}`).join(';'),
    finalMoves: (r.turns.at(-1)?.languageTurn?.moves ?? []).join('+'),
    maxReplyWords: Math.max(0, ...r.turns.map((t) => words(t.reply))),
    tutorCostUsd: Number(caseAtts.reduce((a, x) => a + (x.costUsd ?? 0), 0).toFixed(6)),
    outcome: outcome(det, j),
  });
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const header = Object.keys(rows[0] ?? { caseId: '' });
writeFileSync(f(DRY ? 'dry_case_scores.csv' : 'case_scores.csv'), [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n');

// ---------------------------------------------------------- aggregates ----
const stats = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  const dist = Object.fromEntries([0, 1, 2, 3, 4].map((k) => [k, v.filter((x) => x === k).length]));
  return { n: v.length, mean: Number(mean.toFixed(2)), median: med, dist };
};
const groupBy = (key) => {
  const g = {};
  for (const r of rows) (g[r[key]] ??= []).push(r);
  return Object.fromEntries(Object.entries(g).map(([k, rs]) => [k, {
    cases: rs.length,
    dims: Object.fromEntries(DIMS.map((d) => [d, stats(rs.map((r) => r[`judge_${d}`]))])),
    outcomes: rs.reduce((o, r) => ({ ...o, [r.outcome]: (o[r.outcome] ?? 0) + 1 }), {}),
  }]));
};
const checkNames = Object.keys(rows[0] ?? {}).filter((k) => k.startsWith('chk_'));
const checkRates = Object.fromEntries(checkNames.map((k) => {
  const app = rows.filter((r) => r[k] !== 'n/a');
  const pass = app.filter((r) => r[k] === 'pass').length;
  return [k.slice(4), { applicable: app.length, pass, rate: app.length ? Number((pass / app.length).toFixed(3)) : null, failedCases: app.filter((r) => r[k] === 'fail').map((r) => r.caseId) }];
}));
const failCounts = {};
for (const r of rows) for (const x of r.failures ? r.failures.split(';') : []) failCounts[x] = (failCounts[x] ?? 0) + 1;

// Judge self-consistency on the repeated subset.
const consistency = Object.fromEntries(DIMS.map((d) => {
  let n = 0, exact = 0, within1 = 0;
  for (const a of judged.filter((j) => j.pass === 2 && j.result)) {
    const b = judged.find((j) => j.caseId === a.caseId && j.pass === 1 && j.result);
    if (!b) continue;
    const x = a.result.scores[d], y = b.result.scores[d];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    n += 1; if (x === y) exact += 1; if (Math.abs(x - y) <= 1) within1 += 1;
  }
  return [d, { pairs: n, exact, within1 }];
}));

const agg = {
  benchmarkVersion: 'ltb-v1.0', rubricVersion: rubric.rubricVersion, scoringSpec: 'ltb-scoring-v1', generatedAt: new Date().toISOString(),
  label: 'Pedagogical dimension scores are automated provisional scores from an LLM judge; deterministic checks are automatic.',
  casesRun: rows.length, casesJudged: rows.filter((r) => r.judge_mean !== '').length,
  outcomes: rows.reduce((o, r) => ({ ...o, [r.outcome]: (o[r.outcome] ?? 0) + 1 }), {}),
  overall: Object.fromEntries(DIMS.map((d) => [d, stats(rows.map((r) => r[`judge_${d}`]))])),
  deterministicChecks: checkRates,
  byCohort: groupBy('cohort'), byCefr: groupBy('cefr'), byCaseType: groupBy('caseType'),
  failureCategoryCounts: Object.fromEntries(Object.entries(failCounts).sort((a, b) => b[1] - a[1])),
  judgeSelfConsistency: consistency,
  judgeUnparseable: judged.filter((j) => j.pass === 1 && !j.result).map((j) => j.caseId),
};
writeFileSync(f(DRY ? 'dry_aggregate_results.json' : 'aggregate_results.json'), JSON.stringify(agg, null, 2));
console.log(JSON.stringify({ casesRun: agg.casesRun, casesJudged: agg.casesJudged, outcomes: agg.outcomes, checks: Object.fromEntries(Object.entries(checkRates).map(([k, v]) => [k, `${v.pass}/${v.applicable}`])) }));
