// Grading reliability benchmark. Runs the real automatic grader (the same
// evaluation, consistency check and validation used in production) on a set
// of responses with reference scores, and reports agreement per language.
//
//   npm run benchmark:grading                       (uses ANTHROPIC_API_KEY)
//   npm run benchmark:grading -- --set path.json --out results.json
//
// Uses a throwaway in-memory database; nothing touches real data. Each run
// costs real AI calls (about 2-3 per open response, 1 per short answer).
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { IQuestion } from '../models/Assessment';

type Criterion = NonNullable<IQuestion['rubric']>['criteria'][number];
interface BenchItem { id: string; language: string; question: IQuestion; responses: { id: string; answer: string; reference: Record<string, string> }[] }
interface ShortItem { id: string; language: string; question: string; key: string; answer: string; reference: boolean }
interface BenchSet { version: string; note?: string; referenceScoredBy: string; items: BenchItem[]; shortAnswers: ShortItem[] }

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

// Quadratic weighted kappa on integer scores 0..max.
export function qwk(pairs: [number, number][], max: number) {
  const k = max + 1;
  const O = Array.from({ length: k }, () => Array(k).fill(0));
  for (const [a, b] of pairs) O[a][b] += 1;
  const n = pairs.length;
  if (!n) return null;
  const ra = O.map((r) => r.reduce((s, x) => s + x, 0));
  const rb = O[0].map((_, j) => O.reduce((s, r) => s + r[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = ((i - j) ** 2) / ((k - 1) ** 2 || 1);
      num += w * O[i][j];
      den += w * ((ra[i] * rb[j]) / n);
    }
  }
  return den === 0 ? 1 : 1 - num / den;
}

async function main() {
  const setPath = arg('set') ?? path.join(__dirname, '../../test/fixtures/grading-benchmark.json');
  const set: BenchSet = JSON.parse(readFileSync(setPath, 'utf8'));
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  const { evaluateOpen, evaluateShort, GradingError } = await import('../services/autoGrading');
  const { questionPoints } = await import('../services/assessmentVersions');
  const { getConfig } = await import('../config/env');
  if (!getConfig().anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const attempt = { id: 'bench', institutionId: 'bench', assignmentId: 'bench' } as never;
  const rows: Record<string, unknown>[] = [];
  for (const item of set.items) {
    const q = item.question;
    const max = questionPoints(q);
    for (const r of item.responses) {
      const ref = (q.rubric!.criteria as Criterion[]).map((c) => ({ c, level: c.levels.find((l) => l.id === r.reference[c.id])! }));
      const refTotal = ref.reduce((n, x) => n + x.level.points, 0);
      const started = Date.now();
      try {
        const { chosen, all } = await evaluateOpen(attempt, q, r.answer, [{ id: 'obj', title: q.text }]);
        const perCriterion = ref.map(({ c, level }) => {
          const got = chosen.criteria.find((s) => s.criterionId === c.id)!;
          const gi = c.levels.findIndex((l) => l.id === got.levelId);
          const ri = c.levels.findIndex((l) => l.id === level.id);
          return { criterionId: c.id, reference: level.id, ai: got.levelId, levelDiff: gi - ri };
        });
        rows.push({ kind: 'open', item: item.id, response: r.id, language: item.language, max, reference: refTotal, ai: chosen.points, evaluations: all.map((e) => e.points), perCriterion, ms: Date.now() - started });
      } catch (error) {
        const reason = error instanceof GradingError ? error.reason : 'error';
        rows.push({ kind: 'open', item: item.id, response: r.id, language: item.language, max, reference: refTotal, ai: null, exception: reason, message: String((error as Error).message).slice(0, 200), ms: Date.now() - started });
      }
      process.stdout.write('.');
    }
  }
  for (const s of set.shortAnswers) {
    const q = { id: 'q', type: 'short-answer', text: s.question, correctAnswer: s.key, explanation: '', points: 1 } as IQuestion;
    try {
      const e = await evaluateShort(attempt, q, s.answer);
      rows.push({ kind: 'short', item: s.id, language: s.language, reference: s.reference, ai: (e.points ?? 0) > 0, feedback: e.feedback });
    } catch (error) {
      rows.push({ kind: 'short', item: s.id, language: s.language, reference: s.reference, ai: null, exception: error instanceof GradingError ? error.reason : 'error' });
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const summary: Record<string, unknown> = {};
  for (const lang of [...new Set(rows.map((r) => r.language as string))]) {
    const open = rows.filter((r) => r.kind === 'open' && r.language === lang);
    const graded = open.filter((r) => r.ai !== null) as { ai: number; reference: number; max: number; perCriterion: { levelDiff: number }[] }[];
    const crit = graded.flatMap((r) => r.perCriterion);
    const short = rows.filter((r) => r.kind === 'short' && r.language === lang);
    const shortGraded = short.filter((r) => r.ai !== null);
    summary[lang] = {
      openResponses: open.length,
      exceptions: open.length - graded.length,
      exceptionRate: open.length ? round((open.length - graded.length) / open.length) : null,
      exactTotalAgreement: graded.length ? round(graded.filter((r) => r.ai === r.reference).length / graded.length) : null,
      criterionExactAgreement: crit.length ? round(crit.filter((c) => c.levelDiff === 0).length / crit.length) : null,
      criterionWithinOneLevel: crit.length ? round(crit.filter((c) => Math.abs(c.levelDiff) <= 1).length / crit.length) : null,
      meanAbsoluteErrorShareOfMax: graded.length ? round(graded.reduce((n, r) => n + Math.abs(r.ai - r.reference) / r.max, 0) / graded.length) : null,
      meanSignedErrorShareOfMax: graded.length ? round(graded.reduce((n, r) => n + (r.ai - r.reference) / r.max, 0) / graded.length) : null,
      qwkTotals: graded.length && graded.every((r) => r.max === graded[0].max) ? round(qwk(graded.map((r) => [r.reference, r.ai]), graded[0].max)!) : null,
      shortAnswers: short.length,
      shortAnswerAccuracy: shortGraded.length ? round(shortGraded.filter((r) => r.ai === r.reference).length / shortGraded.length) : null,
      shortAnswerExceptions: short.length - shortGraded.length,
    };
  }
  const out = { set: set.version, referenceScoredBy: set.referenceScoredBy, model: getConfig().anthropicTutorModel, ranAt: new Date().toISOString(), summary, rows };
  const outPath = arg('out');
  if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ set: out.set, referenceScoredBy: out.referenceScoredBy, model: out.model, summary }, null, 2));
  await mongoose.disconnect();
  await mongo.stop();
}

const round = (x: number) => Math.round(x * 1000) / 1000;

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
