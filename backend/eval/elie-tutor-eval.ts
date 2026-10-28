// Runs the ELIE tutor evaluation set against the real tutor prompt path
// (queryDirectTutorModel) with the configured Anthropic key. Costs real
// money (one tutor call per case). Usage: npx tsx eval/elie-tutor-eval.ts
// Only mechanical checks are scored; everything else is saved for a person to
// review. Nothing here is a pass rate for qualities that weren't checked.
import fs from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

type Check = { type: 'arabic' } | { type: 'cites'; n: number } | { type: 'noCitation' } | { type: 'matches'; pattern: string } | { type: 'notMatches'; pattern: string };

function regex(pattern: string) {
  const flags = pattern.startsWith('(?i)') ? 'im' : 'm';
  return new RegExp(pattern.replace(/^\(\?i\)/, ''), flags);
}
function runCheck(check: Check, answer: string) {
  switch (check.type) {
    case 'arabic': {
      const ar = (answer.match(/[؀-ۿ]/g) || []).length;
      const la = (answer.match(/[A-Za-z]/g) || []).length;
      return ar > la;
    }
    case 'cites':
      return answer.includes(`[${check.n}]`);
    case 'noCitation':
      return !/\[\d{1,2}\]/.test(answer);
    case 'matches':
      return regex(check.pattern).test(answer);
    case 'notMatches':
      return !regex(check.pattern).test(answer);
  }
}

async function main() {
  const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'elie-tutor-cases.json'), 'utf8'));
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.LOG_LEVEL = 'error';
  const { resetConfigForTests, getConfig } = await import('../src/config/env');
  resetConfigForTests();
  if (!getConfig().anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  await mongoose.connect(mongo.getUri());
  const { Institution } = await import('../src/models/Institution');
  const { LearningObjective } = await import('../src/models/LearningObjective');
  await Institution.create({ id: 'eval', name: 'Eval', features: { learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true, mastery_tracking_enabled: true } });
  await LearningObjective.create({ id: 'fr', institutionId: 'eval', curriculumId: 'cur', code: 'FR.2', title: 'Add and subtract fractions', status: 'approved', lessonIds: ['L1'] });
  const { buildObjectiveContext } = await import('../src/services/learningContext');
  const { queryDirectTutorModel } = await import('../src/services/directTutorModel');
  const { sourcesPrompt } = await import('../src/services/curriculumRetrieval');

  const curriculum = { courseTitle: 'Grade 6 Mathematics', subject: 'Mathematics', summary: 'Fractions, ratios and simple equations', chapters: [{ id: 'L1', title: 'Fractions' }, { id: 'L2', title: 'Ratios' }], currentLessonId: 'L1', materials: [] };
  const results = [];
  for (const c of set.cases) {
    const pedagogy = c.pedagogy
      ? (await buildObjectiveContext({ institutionId: 'eval', studentId: 'stu', objectiveId: 'fr', teacherStrategyId: c.pedagogy, record: false }))?.prompt
      : undefined;
    const sources = (c.sources || []).map((key: string, i: number) => ({ n: i + 1, chunkId: key, lessonId: 'L1', fileUrl: '', score: 1, ...set.sources[key] }));
    const started = Date.now();
    const reply = await queryDirectTutorModel({
      query: c.query,
      history: [],
      teachingMethod: 'socratic',
      curriculum,
      pedagogy,
      sourcesPrompt: sources.length ? sourcesPrompt(sources) : undefined,
    });
    const answer = reply?.answer ?? '';
    const checks = (c.checks as Check[]).map((check) => ({ check, passed: reply ? runCheck(check, answer) : false }));
    results.push({ id: c.id, category: c.category, language: c.language, model: reply?.version ?? null, ms: Date.now() - started, error: reply ? null : 'no reply', checks, humanReview: c.human, answer });
    console.log(`${c.id}: ${checks.map((x) => `${x.check.type}=${x.passed ? 'pass' : 'FAIL'}`).join(' ') || '(human review only)'}`);
  }
  const out = path.join(__dirname, 'results', `${new Date().toISOString().slice(0, 10)}-${set.version}.json`);
  fs.writeFileSync(out, JSON.stringify({ version: set.version, ranAt: new Date().toISOString(), results }, null, 2));
  const all = results.flatMap((r) => r.checks);
  console.log(`checks passed: ${all.filter((x) => x.passed).length}/${all.length}; written to ${out}`);
  await mongoose.disconnect();
  await mongo.stop();
}
main().catch((e) => { console.error(e); process.exit(1); });
