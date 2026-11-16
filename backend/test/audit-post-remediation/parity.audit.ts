import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { afterAll, describe, it } from 'vitest';
import { recorder } from './recorder';

// Independent audit of fixture v2 and evaluator parity. Read-only. No provider call.
const R = recorder('parity.audit.ts');
afterAll(() => R.flush());
const ROOT = path.resolve(__dirname, '../../..');
const V1 = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109T1211-ltb-v1.0-ageband/official/benchmark_cases.jsonl');
const FX = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const J = (v: unknown) => JSON.stringify(v);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<{ build: any; parity: any }> => ({ build: await import('../../benchmarks/ltc-v2/build_fixture_v2.mjs'), parity: await import('../../benchmarks/ltc-v2/validate_parity.mjs') });
const v1lines = readFileSync(V1, 'utf8').trim().split('\n');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v2: any[] = readFileSync(path.join(FX, 'fixture_v2_cases.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ANSWER_KEYS = /acceptedAnswers|targetForms|"answer"|"key"|answerKey/;

describe('fixture v2 and evaluator parity (10+)', () => {
  it('PA-01 v2 passes the parity validator 120/120 (independent re-run)', async () => {
    const { parity } = await load();
    const fails = v2.filter((r) => parity.checkParity(parity.viewsFromV2(r)).length > 0).map((r) => r.id);
    R.check({ id: 'PA-01', area: 'fixture_parity', input: 'fixture_v2_cases.jsonl', expected: '0 failures', actual: `${fails.length} failures`, severityIfFail: 'P1' });
  });
  it('PA-02 the validator reproduces the v1.0 defect (54 unseen-exercise cases)', async () => {
    const { parity } = await load();
    const v1 = v1lines.map((l) => JSON.parse(l));
    const unseen = v1.filter((c) => parity.checkParity(parity.viewsFromV1(c)).some((i: { code: string }) => i.code === 'learner_targets_unseen_exercise')).length;
    R.check({ id: 'PA-02', area: 'fixture_parity', input: 'v1.0 as run', expected: '54', actual: String(unseen), severityIfFail: 'P2' });
  });
  it('PA-03 one-to-one mapping to v1.0 with per-line hashes', () => {
    const v1ById = new Map(v1lines.map((l) => [JSON.parse(l).id, l]));
    const bad = v2.filter((r) => !v1ById.has(r.v1Id) || sha(v1ById.get(r.v1Id)!) !== r.v1Sha256 || r.id !== r.v1Id).map((r) => r.id);
    R.check({ id: 'PA-03', area: 'fixture_parity', input: '120 v2 records vs v1.0 lines', expected: '120 mapped, 0 bad', actual: `${v2.length} records, ${new Set(v2.map((r) => r.v1Id)).size} unique v1 ids, bad=${J(bad)}`, severityIfFail: 'P1' }, v2.length === 120 && new Set(v2.map((r) => r.v1Id)).size === 120 && bad.length === 0);
  });
  it('PA-04 every learner turn declares a target (219 turns)', () => {
    const turns = v2.flatMap((r) => r.learnerScript);
    const missing = turns.filter((t: { target?: string }) => !t.target).length;
    R.check({ id: 'PA-04', area: 'fixture_parity', input: 'learnerScript', expected: '219 turns, 0 missing', actual: `${turns.length} turns, ${missing} missing`, severityIfFail: 'P1' }, turns.length === 219 && missing === 0);
  });
  it('PA-05 no answer keys in tutorView or evaluatorView (120 cases)', () => {
    const bad = v2.filter((r) => ANSWER_KEYS.test(J(r.tutorView)) || ANSWER_KEYS.test(J(r.evaluatorView))).map((r) => r.id);
    R.check({ id: 'PA-05', area: 'fixture_parity', input: 'tutorView + evaluatorView', expected: '[]', actual: J(bad), severityIfFail: 'P0' });
  });
  it('PA-06 evaluatorView.lesson equals tutorView exactly', () => {
    const bad = v2.filter((r) => J(r.evaluatorView.lesson) !== J(r.tutorView)).map((r) => r.id);
    R.check({ id: 'PA-06', area: 'fixture_parity', input: '120 cases', expected: '[]', actual: J(bad), severityIfFail: 'P1' });
  });
  it('PA-07 tutorView items are exactly the delivered items reduced to id + prompt', () => {
    const bad = v2.filter((r) => r.lessonDelivered && J(r.tutorView.spec.items) !== J(r.lessonDelivered.spec.items.map(({ id, prompt }: { id: string; prompt: string }) => ({ id, prompt })))).map((r) => r.id);
    R.check({ id: 'PA-07', area: 'fixture_parity', input: '111 lesson cases', expected: '[]', actual: J(bad), severityIfFail: 'P1' });
  });
  it('PA-08 the 9 T03 revisions are traceable to the original v1.0 turn text', () => {
    const v1ById = new Map(v1lines.map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
    const rev = v2.filter((r) => r.changeLog.some((c: { field: string }) => c.field.startsWith('turns')));
    const ok = rev.every((r) => { const c = r.changeLog.find((x: { field: string }) => x.field === 'turns[1]'); return c.original === v1ById.get(r.id).turns[1] && c.revised === r.learnerScript[1].text && c.originalIntention && c.reason; });
    R.check({ id: 'PA-08', area: 'fixture_parity', input: 'changeLog vs v1.0', expected: '9 revisions, all traceable', actual: `${rev.length} revisions, traceable=${ok}`, severityIfFail: 'P2' }, rev.length === 9 && ok && rev.every((r) => r.caseType.startsWith('T03')));
  });
  it('PA-09 fixture file hash matches its manifest; builder is reproducible', async () => {
    const { build } = await load();
    const man = JSON.parse(readFileSync(path.join(FX, 'fixture_v2_manifest.json'), 'utf8'));
    const fileSha = sha(readFileSync(path.join(FX, 'fixture_v2_cases.jsonl')));
    const rebuilt = v1lines.map((l) => J(build.buildCase(l))).join('\n') + '\n';
    R.check({ id: 'PA-09', area: 'fixture_parity', input: 'manifest + in-memory rebuild', expected: 'file==manifest and rebuild==file', actual: `file==manifest ${fileSha === man.fixtureSha256}; rebuild==file ${sha(rebuilt) === fileSha}`, severityIfFail: 'P2' }, fileSha === man.fixtureSha256 && sha(rebuilt) === fileSha);
  });
  it('PA-10 an evaluator (judge / reviewer) consumes evaluatorView', () => {
    const dirs = [path.join(ROOT, 'backend/benchmarks/ltc-v1'), path.join(ROOT, 'backend/benchmarks/ltc-v2')];
    const files = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).map((f) => path.join(d, f)) : []));
    const consumers = files.filter((f) => /judge|review/i.test(path.basename(f)) && readFileSync(f, 'utf8').includes('evaluatorView'));
    R.check({ id: 'PA-10', area: 'evaluator_integration', input: J(files.map((f) => path.relative(ROOT, f))), expected: '>=1 v2 judge/reviewer consuming evaluatorView', actual: `${consumers.length} consumers`, severityIfFail: 'P1', note: 'open measurement-readiness item: no v2 judge or reviewer exists' }, consumers.length > 0);
  });
  it('PA-11 existing evaluators still pass the full v1 lesson (incl. exercise) to the evaluator', () => {
    const judge = readFileSync(path.join(ROOT, 'backend/benchmarks/ltc-v1/judge.ts'), 'utf8');
    const reviewer = path.join(ROOT, 'docs/benchmarks/language-teaching/20261109T1310-ltb-v1.0-ai-review/work/scripts/blind_review.ts');
    const rv = existsSync(reviewer) ? readFileSync(reviewer, 'utf8') : '';
    const judgeFull = /lesson: c\.lesson/.test(judge);
    const reviewerFull = /lesson: c\.lesson/.test(rv);
    R.measure({ id: 'PA-11', area: 'evaluator_integration', input: 'judge.ts caseView, AI-review blind_review.ts caseView', expected: 'evaluators use evaluatorView', actual: `judge.ts passes c.lesson=${judgeFull}; blind_review.ts passes c.lesson=${reviewerFull}`, pass: !judgeFull && !reviewerFull, severityIfFail: 'P1', note: 'running the frozen v1 judge on fixture v2 records would not even find c.lesson (v2 uses lessonDelivered/evaluatorView); a v2 judge is required' });
  });
  it('PA-12 dry-run artefacts: 72/72 answered lesson items visible, 0 answer/marker/identifier leaks, $0', () => {
    const rows = readFileSync(path.join(FX, 'dry_run/dry_run_results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const rp = rows.flatMap((r) => r.turns.map((t: { runtimeParity: Record<string, unknown> }) => t.runtimeParity));
    const li = rp.filter((p) => String(p.target).startsWith('lesson_item'));
    const att = readFileSync(path.join(FX, 'dry_run/dry_run_attempts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const stats = { turns: rp.length, li: li.length, saw: li.filter((p) => p.tutorSawTarget).length, ans: rp.filter((p) => (p.acceptedAnswersInSystemPrompt as unknown[]).length).length, mark: rp.filter((p) => p.markerInVisibleReply).length, idLeaks: att.reduce((n, a) => n + (a.identifierLeaks ?? 0), 0), cost: att.reduce((n, a) => n + (a.costUsd ?? 0), 0) };
    R.check({ id: 'PA-12', area: 'fixture_parity', input: 'stored dry-run outputs (reproduced separately by CLI)', expected: J({ turns: 219, li: 72, saw: 72, ans: 0, mark: 0, idLeaks: 0, cost: 0 }), actual: J(stats), severityIfFail: 'P1' });
  });
});
