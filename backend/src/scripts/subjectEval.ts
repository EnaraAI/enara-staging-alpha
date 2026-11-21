// Subject test set (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item F, ARCHITECTURE.md §15 "quality is measured, not assumed"): fixed, fake
// course passages and student questions for maths, science and Arabic (eval/subjects/*.json). It loads them into a THROWAWAY database
// (localhost only: CI's Mongo service container) as a fake school, runs the tutor's real retrieval on every question, and scores:
//   hit@3 for covered questions (same language as the material, and cross-language), and "found nothing" for not-covered ones.
// With ENARA_ENGINE_V2 including ragRewrite and an ANTHROPIC_API_KEY, the rewrite step runs too (metered); without a key, the keyword
// baseline is measured. Prints one JSON summary line (SUMMARY {...}) and a Markdown table; no secrets, no student data.
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

type Passage = { id: string; fileName: string; page?: number; lessonId: string; text: string };
type Question = { id: string; lang: string; q: string; expect: string[]; kind: 'covered' | 'not_covered' };
type Set = { subject: string; materialLanguage: string; passages: Passage[]; questions: Question[] };

const SCHOOL = 'EVAL-SCHOOL-FAKE';
const DIR = join(__dirname, '../../eval/subjects');

export function loadSets(dir = DIR): Set[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Set);
}
export type Row = { subject: string; group: 'same_language' | 'cross_language' | 'not_covered'; ok: boolean; rewritten: boolean };
export function groupOf(s: Set, q: Question): Row['group'] {
  return q.kind === 'not_covered' ? 'not_covered' : q.lang === s.materialLanguage ? 'same_language' : 'cross_language';
}
export function score(rows: Row[]) {
  const out: Record<string, Record<string, { n: number; ok: number; rate: number }>> = {};
  for (const r of rows) {
    const g = ((out[r.subject] ??= {})[r.group] ??= { n: 0, ok: 0, rate: 0 });
    g.n += 1; if (r.ok) g.ok += 1; g.rate = Math.round((g.ok / g.n) * 1000) / 10;
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI ?? '';
  if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)) throw new Error('subjectEval runs only against a local throwaway database (mongodb://localhost/...)');
  await mongoose.connect(uri);
  const { CurriculumChunk } = await import('../models/CurriculumChunk');
  const { retrieveWithRewrite } = await import('../services/retrievalBoost');
  const sets = loadSets();
  const rows: Row[] = [];
  for (const s of sets) {
    const curriculumId = `eval-${s.subject}`;
    await CurriculumChunk.deleteMany({ institutionId: SCHOOL, curriculumId });
    await CurriculumChunk.insertMany(s.passages.map((p, i) => ({
      id: `${curriculumId}-${p.id}`, institutionId: SCHOOL, curriculumId, lessonId: p.lessonId, fileUrl: `eval://${p.fileName}`, fileName: p.fileName,
      ...(p.page !== undefined ? { page: p.page } : {}), chunkIndex: i, text: p.text, contentHash: createHash('sha256').update(p.text).digest('hex'), extractionVersion: 'eval',
    })));
    for (const q of s.questions) {
      const r = await retrieveWithRewrite({ institutionId: SCHOOL, curriculumId, query: q.q }).catch(() => ({ sources: [], rewritten: false }));
      const top = r.sources.slice(0, 3).map((x) => x.chunkId.replace(`${curriculumId}-`, ''));
      const ok = q.kind === 'not_covered' ? r.sources.length === 0 : q.expect.some((e) => top.includes(e));
      rows.push({ subject: s.subject, group: groupOf(s, q), ok, rewritten: r.rewritten });
    }
  }
  const summary = score(rows);
  const rewrites = rows.filter((r) => r.rewritten).length;
  console.log(`SUMMARY ${JSON.stringify({ questions: rows.length, rewrites, engine: process.env.ENARA_ENGINE_V2 ?? '', summary })}`);
  const md = ['| Subject | Same language hit@3 | Cross-language hit@3 | Not covered: nothing found |', '|---|---|---|---|',
    ...Object.entries(summary).map(([s, g]) => `| ${s} | ${fmt(g.same_language)} | ${fmt(g.cross_language)} | ${fmt(g.not_covered)} |`),
    '', `Questions: ${rows.length}. Query rewrites used: ${rewrites}.`].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Subject test set (retrieval)\n\n${md}\n`);
  await mongoose.disconnect();
}
const fmt = (g?: { n: number; ok: number; rate: number }) => (g ? `${g.ok}/${g.n} (${g.rate}%)` : '-');

if (require.main === module) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
