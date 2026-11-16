// ENARA Phase 1 — Independent blind AI review (ltb-rubric-v1).
// Reads ONLY: benchmark_cases.jsonl, rubric_v1.json, raw_results.jsonl (transcripts + trusted age band).
// Never reads judge_results / case_scores / aggregate / comparison files.
//   npx tsx blind_review.ts --run <official dir> --out <review dir> --key-file <path> --cap 4.75 [--limit N] [--dry] [--conc 4]
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
const BACKEND = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha/backend';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Anthropic = require(path.join(BACKEND, 'node_modules/@anthropic-ai/sdk')).default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { unitPriceUsd } = require(path.join(BACKEND, 'src/services/priceCatalog'));

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const RUN = args.get('run')!; const OUT = args.get('out')!;
const DRY = args.has('dry'); const CAP = Number(args.get('cap') ?? '4.75'); const CONC = Number(args.get('conc') ?? '4');
const MODEL = 'claude-haiku-5-5'; const MAX_TOKENS = 8000; const EFFORT = 'high';
const WORST_CALL_USD = 20000 * 0.1e-6 + MAX_TOKENS * 0.5e-6; // reservation per in-flight call

const rubric = JSON.parse(readFileSync(path.join(RUN, 'rubric_v1.json'), 'utf8'));
const cases = new Map<string, any>(readFileSync(path.join(RUN, 'benchmark_cases.jsonl'), 'utf8').trim().split('\n').map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
let raw: any[] = readFileSync(path.join(RUN, 'raw_results.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (args.has('limit')) raw = raw.slice(0, Number(args.get('limit')));
const only = args.get('only'); if (only) raw = raw.filter((r) => only.split(',').includes(r.caseId));

const DIMS: string[] = rubric.dimensions.map((d: any) => d.id);
const SHAPE = {
  case_id: 'string', review_status: 'REVIEWED | NOT_REVIEWABLE', overall_outcome: 'MEETS | PARTIAL | DOES_NOT_MEET',
  dimension_scores: Object.fromEntries(DIMS.map((d) => [d, 'integer 0-4 (or "n/a" only for scaffolding_adaptation on single-turn cases)'])),
  failure_tags: [{ category: 'one of failureCategories', severity: 'critical | major | minor', turn: 'tutor turn number (1-based)', note: 'short' }],
  critical_issue: { present: 'boolean', description: 'string or null' },
  evidence: [{ turn: 'tutor turn number (1-based)', quote: 'short VERBATIM quote from that tutor reply', supports: 'which score/tag this supports' }],
  what_went_well: ['short strings'], what_should_change: ['short strings'],
  confidence: 'low | medium | high', reviewer_notes: 'string',
};
const system = [
  'You are an independent reviewer of AI language-tutor conversations on an English-as-a-foreign-language platform for schools.',
  'You review ONE case at a time, blind: you see the case definition and the full transcript only. Apply the frozen rubric below exactly; do not invent new criteria.',
  'Assess, from the transcript only:',
  'A. Learner understanding: did the tutor understand the learner\'s actual response, identify misunderstandings, respond appropriately to partial or incorrect answers, and adapt its next step to what the learner demonstrated?',
  'B. Teaching quality: did it follow the intended learning objective, explain accurately, use appropriate examples, avoid unnecessary information and preserve learner participation?',
  'C. Scaffolding: appropriate hints, breaking down difficult tasks, not giving away answers prematurely, gradually transferring responsibility to the learner.',
  'D. Formative assessment: did it meaningfully check understanding, did the check test the intended objective, did it use the learner\'s response to decide the next step?',
  'E. Age and proficiency: language appropriate for the TRUSTED AGE BAND given in the case; complexity appropriate for the CEFR estimate (a provisional estimate); cognitively appropriate explanations; age and language proficiency are NOT interchangeable.',
  'F. Factual correctness: check every English fact, correction, example and grammar statement. Flag misleading simplifications and unsupported claims. A factual error that teaches the learner something wrong is critical; a slip that does not mislead is minor.',
  'G. Learner autonomy: did it let the learner think, avoid excessive assistance and encourage meaningful practice?',
  'Restrictions:',
  '1. A friendly tone alone is not evidence of good pedagogy.',
  '2. A question at the end is not automatically a formative check.',
  '3. Multiple explanation steps are not automatically good scaffolding.',
  '4. Score only what is visible in the transcript; evaluate the actual conversation, not what the tutor appears to intend.',
  '5. Do not infer age from grade, name, avatar or writing style; use only the trusted age band given.',
  '6. Do not penalise verbosity merely because a reply is long; assess its actual effect on comprehension and participation. The case wordLimitPerReply is the case\'s own expectation.',
  '7. Do not penalise concise replies merely for being short.',
  '8. Never infer learning gains, retention, mastery or real student outcomes from synthetic transcripts.',
  '9. If the rubric does not define a threshold clearly for something you need to judge, say so in reviewer_notes (prefix "RUBRIC_AMBIGUITY:") instead of inventing a threshold.',
  'Scoring: score every rubric dimension separately as an integer 0-4 using its anchors; "n/a" only for scaffolding_adaptation and only when the case has a single learner turn. Judge the whole conversation with emphasis on the final tutor turn, against the case expectedBehavior and unacceptableBehavior. Use only the rubric failureCategories as failure_tags.',
  'Every score below 3 and every failure tag must be backed by a short VERBATIM quote from a tutor reply in the evidence list, with its turn number.',
  'If the transcript is missing, empty or unusable, set review_status NOT_REVIEWABLE and explain in reviewer_notes.',
  'overall_outcome: MEETS = no dimension below 2, mean of scored dimensions at least 3.0 and no critical issue; DOES_NOT_MEET = any critical issue or any dimension scored 0; otherwise PARTIAL.',
  'Learner data is synthetic. Do not speculate about the learner\'s identity.',
  '',
  `RUBRIC (${rubric.rubricVersion}):`,
  JSON.stringify({ scale: rubric.scale, dimensions: rubric.dimensions, scoringRules: rubric.scoringRules, failureCategories: rubric.failureCategories, severity: rubric.severity }),
  '',
  'Reply with ONLY one JSON object, no prose and no code fence, in this shape:',
  JSON.stringify(SHAPE),
].join('\n');

const FORBIDDEN = [/qorvath/i, /benchlearner/i, /ltb-stu-/i, /ltb-school-/i, /bench\.invalid/i, /synthetic school/i, /bench admin/i, /ltb-b-\d/i, /ltb-lsn-/i, /ltb-obj-/i, /ltb-cur-/i];
function userPrompt(c: any, r: any) {
  const last = r.turns[r.turns.length - 1]?.languageTurn ?? {};
  const caseView = {
    case_id: c.id, trustedAgeBand: last.ageBand ?? c.cohort, cefrEstimate: c.cefr, situationType: c.caseType,
    learner: { knownLanguages: c.learner.knownLanguages, goal: c.learner.goal, priorEvidence: c.learner.priorEvidence },
    lesson: c.lesson, skill: c.skill, expectedBehavior: c.expectedBehavior, unacceptableBehavior: c.unacceptableBehavior,
    expectedNextMove: c.expectedNextMove, wordLimitPerReply: c.structuredExpectations?.maxWords,
  };
  const transcript = r.turns.map((t: any, i: number) => `LEARNER (turn ${i + 1}): ${t.learner}\nTUTOR (turn ${i + 1}): ${t.reply ?? '[no reply]'}`).join('\n\n');
  return `CASE:\n${JSON.stringify(caseView, null, 1)}\n\nTRANSCRIPT (${r.turns.length} learner turn${r.turns.length === 1 ? '' : 's'}):\n${transcript}`;
}

const cost = (u: any) => (u.input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'input_token') + (u.output_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'output_token')
  + (u.cache_read_input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'cache_read_token') + (u.cache_creation_input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'cache_write_token');
let metered = 0; let reserved = 0; let seq = 0;
const client = DRY ? null : new Anthropic({ apiKey: readFileSync(args.get('key-file')!, 'utf8').trim(), timeout: 180_000, maxRetries: 0 });
const ATT = args.get('attempts') ?? path.join(OUT, 'work', DRY ? 'dry_review_attempts.jsonl' : 'review_attempts.jsonl');
const RES = args.get('res') ?? path.join(OUT, DRY ? 'work/dry_independent_case_reviews.jsonl' : 'independent_case_reviews.jsonl');

async function callOnce(caseId: string, messages: any[]) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (metered + reserved + WORST_CALL_USD > CAP) return { text: null, capped: true };
    const id = `rev-${String(++seq).padStart(4, '0')}`; const t0 = Date.now();
    const rec: any = { id, caseId, attempt, model: MODEL, maxTokens: MAX_TOKENS, effort: EFFORT, startedAt: new Date().toISOString() };
    if (DRY) { appendFileSync(ATT, JSON.stringify({ ...rec, status: 'dry', costUsd: 0 }) + '\n'); return { text: null, capped: false }; }
    reserved += WORST_CALL_USD;
    try {
      const res = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: EFFORT }, system, messages });
      const usd = cost(res.usage); metered += usd;
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, latencyMs: Date.now() - t0, modelServed: res.model, stopReason: res.stop_reason, usage: res.usage, costUsd: Number(usd.toFixed(6)), meteredAfter: Number(metered.toFixed(6)) }) + '\n');
      return { text: res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join(''), capped: false };
    } catch (e: any) {
      appendFileSync(ATT, JSON.stringify({ ...rec, status: e?.status ?? 'network_error', latencyMs: Date.now() - t0, error: e?.name, message: String(e?.message ?? '').slice(0, 200), costUsd: 0 }) + '\n');
      const retryable = !e?.status || e.status === 429 || e.status >= 500;
      if (!retryable || attempt === 2) return { text: null, capped: false };
      await new Promise((r) => setTimeout(r, 5000));
    } finally { reserved -= WORST_CALL_USD; }
  }
  return { text: null, capped: false };
}

function parse(text: string | null, single: boolean) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!['REVIEWED', 'NOT_REVIEWABLE'].includes(j.review_status)) return null;
    if (j.review_status === 'REVIEWED') {
      if (!['MEETS', 'PARTIAL', 'DOES_NOT_MEET'].includes(j.overall_outcome)) return null;
      for (const d of DIMS) {
        const v = j.dimension_scores?.[d];
        const ok = Number.isInteger(v) && v >= 0 && v <= 4 || (v === 'n/a' && d === 'scaffolding_adaptation');
        if (!ok) return null;
        if (v === 'n/a' && !single) j.naViolation = true;
      }
      if (!Array.isArray(j.failure_tags) || !Array.isArray(j.evidence)) return null;
    }
    return j;
  } catch { return null; }
}

async function review(r: any) {
  const c = cases.get(r.caseId);
  if (!c) return { case_id: r.caseId, review_status: 'NOT_REVIEWABLE', reviewer_notes: 'case definition missing', _meta: { reason: 'missing_case' } };
  const up = userPrompt(c, r);
  const leaks = FORBIDDEN.filter((re) => re.test(system) || re.test(up)).map(String);
  if (leaks.length) return { case_id: r.caseId, review_status: 'NOT_REVIEWABLE', reviewer_notes: 'payload privacy scan failed; not sent', _meta: { reason: 'privacy_block', leaks } };
  const messages: any[] = [{ role: 'user', content: up }];
  const single = r.turns.length === 1;
  let out = await callOnce(c.id, messages); let j = parse(out.text, single); let reasks = 0;
  if (!j && out.text) {
    reasks = 1;
    messages.push({ role: 'assistant', content: out.text }, { role: 'user', content: 'That was not valid JSON in the required shape. Reply with only the JSON object.' });
    out = await callOnce(c.id, messages); j = parse(out.text, single);
  }
  const promptSha = createHash('sha256').update(system + '\n---\n' + up).digest('hex');
  if (!j) return { case_id: c.id, review_status: 'NOT_REVIEWABLE', reviewer_notes: out.capped ? 'review budget cap reached before this case' : 'reviewer output unparseable or call failed', _meta: { reason: out.capped ? 'cap' : 'unparseable', reasks, promptSha256: promptSha } };
  j.case_id = c.id;
  // Evidence verification: every quote must appear verbatim (whitespace-normalised) in the cited tutor reply.
  const norm = (s: string) => String(s ?? '').replace(/\s+/g, ' ').replace(/[*_`]/g, '').trim().toLowerCase();
  const ev = (j.evidence ?? []).map((e: any) => {
    const t = r.turns[Number(e.turn) - 1]; const hay = norm(t?.reply ?? '');
    const any = r.turns.some((tt: any) => norm(tt.reply).includes(norm(e.quote)));
    return { ...e, quoteVerified: !!t && hay.includes(norm(e.quote)), quoteFoundInAnyTurn: any };
  });
  j.evidence = ev;
  j._meta = { reviewerModel: MODEL, effort: EFFORT, reasks, promptSha256: promptSha, turns: r.turns.length, trustedAgeBand: r.turns[r.turns.length - 1]?.languageTurn?.ageBand ?? null, label: 'DIFFERENT CLAUDE MODEL, SAME PROVIDER — PARTIALLY INDEPENDENT, NOT CROSS-PROVIDER' };
  return j;
}

(async () => {
  writeFileSync(RES, ''); writeFileSync(ATT, '');
  const results = new Map<string, any>(); let idx = 0; let capHit = false;
  async function worker() {
    while (idx < raw.length) {
      const r = raw[idx++];
      const j = await review(r);
      if (j._meta?.reason === 'cap') capHit = true;
      results.set(r.caseId, j);
      console.log(r.caseId, j.review_status, j.overall_outcome ?? '-', j.dimension_scores ? DIMS.map((d) => j.dimension_scores[d]).join(',') : '', `$${metered.toFixed(4)}`);
    }
  }
  if (!DRY) await Promise.all(Array.from({ length: CONC }, worker));
  else for (const r of raw) { const c = cases.get(r.caseId); const up = userPrompt(c, r); const leaks = FORBIDDEN.filter((re) => re.test(up)).map(String); console.log(r.caseId, up.length, leaks.join('|')); results.set(r.caseId, { case_id: r.caseId, chars: up.length + system.length, leaks }); }
  for (const r of raw) appendFileSync(RES, JSON.stringify(results.get(r.caseId)) + '\n');
  writeFileSync(args.get('status') ?? path.join(OUT, 'work', DRY ? 'dry_review_status.json' : 'review_status.json'), JSON.stringify({ finishedAt: new Date().toISOString(), model: MODEL, effort: EFFORT, meteredUsd: Number(metered.toFixed(6)), calls: seq, capUsd: CAP, capHit, systemPromptSha256: createHash('sha256').update(system).digest('hex'), systemChars: system.length }, null, 2));
  console.log('done', metered.toFixed(4), capHit ? 'CAP HIT' : '');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
