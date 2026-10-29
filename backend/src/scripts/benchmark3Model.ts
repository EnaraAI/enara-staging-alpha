// P7 three-model benchmark harness (offline tool; never imported by the app).
// Runs ENARA's real AI workflows against claude-haiku-5-5, claude-sonnet-5-5 and
// claude-opus-5-5 on a fixed synthetic dataset, through the real aiGateway and
// usage ledger, in a throwaway in-memory database (no staging/production DB,
// no R2: uploads go to a temp directory). Every model call first reserves its
// worst-case cost in a capped BudgetLedger (hard stop); the P0d school budget
// (15 / 6 / 6) is also enforced by the gateway. Scoring is deterministic.
//
//   npx tsx src/scripts/benchmark3Model.ts --mode mock|live --out <dir> --cap <usd> --authorized-by "<who>"
//
// live mode needs ANTHROPIC_API_KEY in the environment. mock mode points the SDK
// at a local stub (ANTHROPIC_BASE_URL) and costs nothing.
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const MODE = arg('--mode', 'mock') as 'mock' | 'live';
const OUT = path.resolve(arg('--out', 'bench-out')!);
const CAP = Number(arg('--cap', '3'));
const AUTH = arg('--authorized-by', '')!;
const ONLY = arg('--only'); // run one workflow only (e.g. a corrected re-run)
const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];
const INST = 'bench-synthetic-school';
const CUR = 'bench-cur';

// ---------------------------------------------------------------- dataset
const DOC_EN = [
  'Photosynthesis (synthetic teaching notes).',
  'Plants make their own food through photosynthesis. Inside the leaf, chloroplasts contain a green pigment called chlorophyll that absorbs light energy.',
  'The plant takes in carbon dioxide from the air through tiny pores called stomata, and water from the soil through its roots.',
  'Using light energy, the plant turns carbon dioxide and water into glucose, a sugar it uses for energy and growth. Oxygen is released as a by-product.',
  'A common misconception is that plants get their food from the soil. Soil provides water and minerals, but the plant builds its food (glucose) itself from carbon dioxide and water.',
  'Photosynthesis happens mainly in the leaves. Without light, photosynthesis stops.',
].join('\n\n');
const DOC_AR = [
  'دورة الماء في الطبيعة (ملاحظات تعليمية اصطناعية).',
  'تبدأ دورة الماء بالتبخر: تسخّن الشمس مياه البحار والأنهار فيتحول الماء إلى بخار يصعد إلى الجو.',
  'ثم يحدث التكاثف: يبرد بخار الماء في طبقات الجو العليا فيتحول إلى قطرات صغيرة تكوّن السحب.',
  'بعد ذلك يحدث الهطول: عندما تثقل القطرات تسقط على شكل مطر أو ثلج أو برد.',
  'وأخيرًا الجريان السطحي: يجري الماء على سطح الأرض إلى الأنهار والبحار، ويتسرب جزء منه إلى باطن الأرض فيكوّن المياه الجوفية، ثم تتكرر الدورة.',
].join('\n\n');
const EN_TERMS = ['chlorophyll', 'carbon dioxide', 'glucose', 'oxygen', 'light', 'water'];
const AR_TERMS = ['التبخر', 'التكاثف', 'الهطول', 'الجريان'];

interface Case { id: string; workflow: string; role: string; language: 'en' | 'ar'; [k: string]: unknown }
const CASES: Case[] = [
  { id: 'lp-en', workflow: 'lesson_plan', role: 'teacher', language: 'en', lesson: 'L1', title: 'How plants make food', terms: EN_TERMS, duration: 45 },
  { id: 'lp-ar', workflow: 'lesson_plan', role: 'teacher', language: 'ar', lesson: 'L2', title: 'دورة الماء', terms: AR_TERMS, duration: 40 },
  { id: 'as-en', workflow: 'assessment_draft', role: 'teacher', language: 'en', lesson: 'L1', brief: 'Check understanding of photosynthesis inputs and outputs.', counts: { 'multiple-choice': 3, 'true-false': 1, 'short-answer': 1, 'open-response': 0 } },
  { id: 'as-ar', workflow: 'assessment_draft', role: 'teacher', language: 'ar', lesson: 'L2', brief: 'تحقق من فهم مراحل دورة الماء بالترتيب.', counts: { 'multiple-choice': 3, 'true-false': 1, 'short-answer': 1, 'open-response': 0 } },
  { id: 'ch-en-answerable', workflow: 'grounded_chat', role: 'teacher', language: 'en', doc: 'en', question: 'According to my notes, what gas does a plant take in and what does it release during photosynthesis?', expect: ['carbon dioxide', 'oxygen'], answerable: true },
  { id: 'ch-en-unanswerable', workflow: 'grounded_chat', role: 'teacher', language: 'en', doc: 'en', question: 'According to my notes on photosynthesis, in what year did scientists discover how plants make glucose, and which scientist discovered it?', expect: [], answerable: false },
  { id: 'ch-ar-answerable', workflow: 'grounded_chat', role: 'teacher', language: 'ar', doc: 'ar', question: 'حسب الملاحظات، ما المرحلة التي تتكوّن فيها السحب؟', expect: ['التكاثف'], answerable: true },
  { id: 'tu-en-misconception', workflow: 'tutor', role: 'student', language: 'en', query: 'I think plants get their food from the soil, right?', correct: ['carbon dioxide', 'glucose'], mustNot: [] },
  { id: 'tu-ar-question', workflow: 'tutor', role: 'student', language: 'ar', query: 'لماذا تتكوّن السحب في السماء؟', correct: ['تكاثف', 'بخار'], mustNot: [] },
  { id: 'gr-en-strong', workflow: 'rubric_grading', role: 'system', language: 'en', answer: 'Plants use light energy absorbed by chlorophyll to turn carbon dioxide from the air and water from the soil into glucose, which they use for energy. Oxygen is released. So the plant makes its own food; the soil only gives water and minerals.', band: [0.75, 1] },
  { id: 'gr-en-weak', workflow: 'rubric_grading', role: 'system', language: 'en', answer: 'Plants eat dirt from the ground to grow.', band: [0, 0.34] },
  { id: 'gr-ar-medium', workflow: 'rubric_grading', role: 'system', language: 'ar', answer: 'النبات يصنع غذاءه من الماء وضوء الشمس.', band: [0.2, 0.75] },
];
const RUBRIC_Q = {
  id: 'bench-q', type: 'open-response', points: 6, text: 'Explain how a plant makes its own food. Name what it takes in and what it produces.',
  modelAnswer: 'Using light absorbed by chlorophyll, the plant turns carbon dioxide and water into glucose and releases oxygen; food is not taken from the soil.',
  rubric: { criteria: [
    { id: 'inputs', title: 'Inputs', description: 'Names carbon dioxide, water and light as what the plant uses.', maxPoints: 3, levels: [{ id: 'i0', label: 'None', points: 0 }, { id: 'i1', label: 'One input', points: 1 }, { id: 'i2', label: 'Two inputs', points: 2 }, { id: 'i3', label: 'All three', points: 3 }] },
    { id: 'outputs', title: 'Outputs and idea', description: 'Explains that the plant makes glucose (food) itself and releases oxygen.', maxPoints: 3, levels: [{ id: 'o0', label: 'Incorrect', points: 0 }, { id: 'o1', label: 'Partial', points: 1 }, { id: 'o2', label: 'Mostly', points: 2 }, { id: 'o3', label: 'Complete', points: 3 }] },
  ] },
};

// ---------------------------------------------------------------- mock provider
function startMockProvider(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const b = JSON.parse(body || '{}');
        const sys = JSON.stringify(b.system ?? '');
        let text = 'Mock reply. What do you think the plant needs?';
        if (/lesson plan/i.test(sys)) text = JSON.stringify({ title: 'Mock plan', sections: [{ kind: 'sequence', title: 'Start', content: 'Intro', durationMinutes: 10 }, { kind: 'explanation', title: 'Explain', content: 'carbon dioxide', durationMinutes: 20 }, { kind: 'check_for_understanding', title: 'Check', content: 'Q', durationMinutes: 10 }] });
        else if (/questions/.test(sys)) text = JSON.stringify({ title: 'Mock', questions: [{ type: 'true-false', text: 'Plants release oxygen.', correctAnswer: 'True', sourceRefs: [1] }] });
        else if (/criteria|rubric/i.test(sys)) text = '{"criteria":[]}';
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 500, output_tokens: 200 } }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
  });
}

// ---------------------------------------------------------------- helpers
const arabicRatio = (s: string) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[؀-ۿ]/.test(c)).length / letters.length : 0;
};
const has = (s: string, t: string) => s.toLowerCase().includes(t.toLowerCase());
const pct = (checks: Record<string, boolean>) => Math.round((100 * Object.values(checks).filter(Boolean).length) / Math.max(1, Object.keys(checks).length));
function seededShuffle<T>(a: T[], seed: string): T[] {
  const out = [...a];
  let h = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  if (!(CAP > 0) || !AUTH.trim()) throw new Error('--cap and --authorized-by are required');
  fs.mkdirSync(OUT, { recursive: true });
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongoose = (await import('mongoose')).default;
  const mongo = await MongoMemoryServer.create();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-uploads-'));
  let key = process.env.ANTHROPIC_API_KEY ?? '';
  if (MODE === 'mock') {
    const port = await startMockProvider();
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    key = 'mock-key-not-a-secret';
  } else if (!key) throw new Error('live mode needs ANTHROPIC_API_KEY');
  delete process.env.ENARA_STAGING;
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'bench-jwt-secret-32-characters-minimum!', INGEST_HMAC_SECRET: 'bench-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ANTHROPIC_API_KEY: key, AI_PAUSED: 'false', UPLOAD_DIR: uploadDir, SERVE_LOCAL_UPLOADS: 'false',
    R2_ACCOUNT_ID: '', R2_BUCKET: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', AWS_S3_BUCKET: '', ELEVENLABS_API_KEY: '', ANAM_API_KEY: '',
  });
  const env = await import('../config/env');
  env.resetConfigForTests();
  await mongoose.connect(mongo.getUri());

  const { Institution } = await import('../models/Institution');
  const { User } = await import('../models/User');
  const { Curriculum } = await import('../models/Curriculum');
  const { LearningObjective } = await import('../models/LearningObjective');
  const { OrgBudget } = await import('../models/OrgBudget');
  const { UsageLedger } = await import('../models/UsageLedger');
  const { registerDocument, processDocuments } = await import('../services/documents');
  const { generateLessonPlan, generateAssessmentDraft } = await import('../services/educatorAi');
  const { askForJson, setAiCallGuard } = await import('../services/aiJson');
  const { rubricPrompt, validateProposal } = await import('../services/gradingProposals');
  const { askEducatorChat } = await import('../services/educatorChat');
  const { queryDirectTutorModel } = await import('../services/directTutorModel');
  const { runWithCallContext } = await import('../utils/callContext');
  const { createLedger, BudgetLedger } = await import('./benchmarkBudget');
  const { forgetAiBudgetCache } = await import('../services/aiBudget');

  // Synthetic school, users, curriculum, objectives, documents, P0d budget.
  await Institution.create({ id: INST, name: 'Benchmark synthetic school', features: { documents_workspace_enabled: true, educator_chat_enabled: true, teaching_workflow_enabled: true, ai_lesson_planning_enabled: true, ai_assessment_authoring_enabled: true } });
  const teacher = await User.create({ email: 'bench.teacher@synthetic.test', password: 'x', role: 'teacher', name: 'Bench Teacher', status: 'active', institutionId: INST });
  const student = await User.create({ email: 'bench.student@synthetic.test', password: 'x', role: 'student', name: 'Bench Student', status: 'active', institutionId: INST, studentId: 'bench-stu' });
  const cur = await Curriculum.create({ id: CUR, name: 'Science (synthetic)', institutionId: INST, summary: 'Synthetic benchmark course', lastUpdated: '2026-10-29', createdBy: teacher._id.toString(), chapters: [{ id: 'L1', title: 'Photosynthesis', uploads: [] }, { id: 'L2', title: 'دورة الماء', uploads: [] }] });
  const objs = [
    { id: 'obj-ps-1', code: 'PS1', title: 'Describe the inputs and outputs of photosynthesis', lesson: 'L1', language: 'en' },
    { id: 'obj-ps-2', code: 'PS2', title: 'Correct the misconception that plants take food from soil', lesson: 'L1', language: 'en' },
    { id: 'obj-wc-1', code: 'WC1', title: 'ترتيب مراحل دورة الماء: التبخر والتكاثف والهطول والجريان', lesson: 'L2', language: 'ar' },
  ];
  for (const o of objs) await LearningObjective.create({ id: o.id, institutionId: INST, curriculumId: CUR, code: o.code, title: o.title, language: o.language, status: 'approved', lessonIds: [o.lesson] } as never);
  const docIds: Record<string, string> = {};
  for (const [k, text, lesson] of [['en', DOC_EN, 'L1'], ['ar', DOC_AR, 'L2']] as const) {
    const fresh = await Curriculum.findOne({ id: CUR });
    const r = await registerDocument({ curriculum: fresh!, chapterId: lesson, file: { originalname: `${k}-notes.txt`, mimetype: 'text/plain', size: Buffer.byteLength(text), buffer: Buffer.from(text) }, uploadedBy: teacher._id.toString(), attested: true } as never);
    docIds[k] = (r as { id?: string; job?: { id: string } }).job?.id ?? (r as { id: string }).id;
  }
  await processDocuments(CUR);
  await processDocuments(CUR);
  const { CurriculumFileJob, CurriculumChunk } = await import('../models/CurriculumChunk');
  const docState = (await CurriculumFileJob.find({ institutionId: INST }).lean()).map((j: any) => ({ id: j.id, status: j.status, scanStatus: j.scanStatus, chunks: j.chunkCount }));
  process.stdout.write(`documents: ${JSON.stringify(docState)} chunks=${await CurriculumChunk.countDocuments({ institutionId: INST })} docIds=${JSON.stringify(docIds)}\n`);
  const features = ['ai_lesson_plan', 'ai_assessment_draft', 'educator_chat', 'tutor_chat', 'benchmark_rubric_grading'];
  await OrgBudget.create({ institutionId: INST, enforcementEnabled: true, monthlyCapUsd: 15, dailyCapUsd: 6, perUserDailyCapUsd: 6, gradingAllowanceUsd: 3, intendedTools: features.map((f) => `anthropic:${f}`), version: 1 } as never);
  forgetAiBudgetCache(INST);

  // Hard cap: one BudgetLedger for the whole run.
  const ledgerPath = path.join(OUT, `spend-ledger-${MODE}.json`);
  if (!fs.existsSync(ledgerPath)) createLedger(ledgerPath, { name: `p7-3model-${MODE}`, capUsd: CAP, authorizedBy: AUTH });
  const ledger = new BudgetLedger(ledgerPath, `p7-${MODE}`);
  setAiCallGuard(ledger);
  const PRICE: Record<string, [number, number]> = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };
  const published = (m: string, i: number, o: number) => (i * PRICE[m][0] + o * PRICE[m][1]) / 1e6;

  const rows: Record<string, unknown>[] = [];
  const order = CASES.filter((c) => !ONLY || c.workflow === ONLY).flatMap((c) => seededShuffle(MODELS, `p7:${c.id}`).map((m) => ({ c, m })));
  const startedAt = new Date().toISOString();
  for (const { c, m } of order) {
    if (ledger.exhausted) {
      rows.push({ case_id: c.id, workflow: c.workflow, model: m, status: 'NOT RUN', error: 'budget ledger exhausted (hard stop)' });
      continue;
    }
    process.env.ANTHROPIC_TUTOR_MODEL = m;
    env.resetConfigForTests();
    const before = await UsageLedger.countDocuments({});
    const who = c.role === 'student' ? student : teacher;
    const ctx = { institutionId: INST, userId: who._id.toString(), role: who.role, studentId: c.role === 'student' ? 'bench-stu' : undefined, requestId: `p7-${c.id}-${m}` };
    const t0 = performance.now();
    let out: unknown = null;
    let error = '';
    const manualTickets: string[] = [];
    try {
      out = await runWithCallContext(ctx, async () => {
        if (c.workflow === 'lesson_plan') {
          return generateLessonPlan({ institutionId: INST, curriculumId: CUR, lessonId: c.lesson as string, lessonTitle: c.title as string, objectiveIds: objs.filter((o) => o.lesson === c.lesson).map((o) => o.id), durationMinutes: c.duration as number, learnerLevel: 'Grade 6', goals: 'Understand the key ideas and practise them.', preferences: 'Active learning; include support and challenge.', language: c.language });
        }
        if (c.workflow === 'assessment_draft') {
          return generateAssessmentDraft({ institutionId: INST, curriculumId: CUR, courseName: 'Science (synthetic)', lessonId: c.lesson as string, objectiveIds: objs.filter((o) => o.lesson === c.lesson).map((o) => o.id), brief: c.brief as string, language: c.language, difficulty: 'Medium', counts: c.counts as never, allowOpen: false });
        }
        if (c.workflow === 'rubric_grading') {
          const { system, user } = rubricPrompt({ question: RUBRIC_Q as never, answer: c.answer as string });
          // Same user message as production evaluateRubricAnswer (gradingProposals.ts).
          const { value } = await askForJson({ feature: 'benchmark_rubric_grading', institutionId: INST, maxTokens: 3000, system, user: JSON.stringify({ ...user, objectives: [], studentAnswer: `<student_answer>${c.answer as string}</student_answer>` }), validate: (raw) => validateProposal(raw, RUBRIC_Q.rubric.criteria as never, c.answer as string) });
          return value;
        }
        // Chat and tutor call the gateway directly (no aiJson guard): reserve
        // their worst case here first (both possible attempts).
        const promptBytes = 12_000;
        const maxOut = c.workflow === 'grounded_chat' ? 1500 : 4000;
        const attempts = c.workflow === 'grounded_chat' ? 1 : 2;
        for (let i = 0; i < attempts; i++) manualTickets.push(ledger.reserve({ model: m, maxTokens: maxOut, promptBytes }));
        if (c.workflow === 'grounded_chat') {
          const req = { user: { id: teacher._id.toString(), email: teacher.email, role: 'teacher', institutionId: INST }, requestId: ctx.requestId } as never;
          // Both documents selected (see QA finding: a single small document makes
          // retrieval refuse valid questions before any model call).
          return askEducatorChat(req, { uploadIds: [docIds.en, docIds.ar], question: c.question });
        }
        return queryDirectTutorModel({ query: c.query as string, history: [], teachingMethod: 'socratic' as never, mode: 'chat', sourcesPrompt: `Course passages:\n${c.language === 'ar' ? DOC_AR : DOC_EN}` });
      });
    } catch (e) {
      error = `${(e as { code?: string }).code ?? (e as Error).name}: ${(e as Error).message}`.slice(0, 300);
    }
    const ms = Math.round(performance.now() - t0);
    const calls = await UsageLedger.find({}).sort({ _id: 1 }).skip(before).lean();
    const inTok = calls.reduce((n, r) => n + ((r as any).units?.inputTokens ?? 0), 0);
    const outTok = calls.reduce((n, r) => n + ((r as any).units?.outputTokens ?? 0), 0);
    const cacheTok = calls.reduce((n, r) => n + ((r as any).units?.cacheReadTokens ?? 0) + ((r as any).units?.cacheWriteTokens ?? 0), 0);
    const gatewayCost = calls.reduce((n, r) => n + ((r as any).costInternal ?? 0), 0);
    const unpriced = calls.filter((r) => (r as any).costStatus !== 'estimated' && (r as any).costStatus !== 'priced').length;
    const cost = MODE === 'live' ? published(m, inTok, outTok) : 0;
    // Book the real cost of the chat/tutor attempts on the first ticket and
    // release the rest; with no reported usage keep the full reservation.
    manualTickets.forEach((t, i) => ledger.settle(t, calls.length ? (i === 0 ? cost : 0) : null));

    // Deterministic scoring.
    const text = JSON.stringify(out ?? '');
    const checks: Record<string, boolean> = {};
    let schema = Boolean(out) && !error;
    if (c.workflow === 'lesson_plan' && out) {
      const p = out as { sections: { kind: string; durationMinutes?: number; sources: unknown[] }[] };
      const kinds = new Set(p.sections.map((s) => s.kind));
      const minutes = p.sections.reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
      checks.min_5_section_kinds = kinds.size >= 5;
      checks.has_check_for_understanding = kinds.has('check_for_understanding') || kinds.has('formative_checkpoint');
      checks.has_differentiation = kinds.has('differentiation');
      checks.minutes_within_20pct = Math.abs(minutes - (c.duration as number)) <= 0.2 * (c.duration as number);
      checks.cites_given_sources = p.sections.some((s) => s.sources.length > 0);
      checks.key_terms_covered = (c.terms as string[]).filter((t) => has(text, t)).length >= Math.ceil((c.terms as string[]).length * 0.6);
      checks.language = c.language === 'ar' ? arabicRatio(text) > 0.5 : arabicRatio(text) < 0.05;
    }
    if (c.workflow === 'assessment_draft' && out) {
      const a = out as { questions: { type: string; sources: unknown[]; objectiveIds: string[] }[] };
      const wanted = Object.values(c.counts as Record<string, number>).reduce((x, y) => x + y, 0);
      checks.count_matches = a.questions.length === wanted;
      checks.types_match = Object.entries(c.counts as Record<string, number>).every(([t, n]) => a.questions.filter((q) => q.type === t).length === n);
      checks.all_source_linked = a.questions.every((q) => q.sources.length > 0);
      checks.all_objective_linked = a.questions.every((q) => q.objectiveIds.length > 0);
      checks.language = c.language === 'ar' ? arabicRatio(text) > 0.5 : arabicRatio(text) < 0.05;
    }
    if (c.workflow === 'grounded_chat' && out) {
      const r = out as { status: string; answer: string; citations: { uploadId?: string }[] };
      if (c.answerable) {
        checks.answered = r.status === 'answered';
        checks.cites_the_document = r.citations.some((x) => x.uploadId === docIds[c.doc as string]);
        checks.expected_facts = (c.expect as string[]).every((t) => has(r.answer, t));
      } else {
        checks.declines_unsupported = r.status !== 'answered' || /(not (say|mention|include|cover)|does not|doesn't|no information|isn't (in|covered))/i.test(r.answer);
        checks.no_invented_year = !/\b1[6-9]\d\d\b/.test(r.answer);
      }
      checks.language = c.language === 'ar' ? arabicRatio(r.answer) > 0.5 : arabicRatio(r.answer) < 0.05;
    }
    if (c.workflow === 'tutor') {
      const ans = (out as { answer?: string } | null)?.answer ?? '';
      schema = schema && ans.length > 0;
      checks.addresses_correct_idea = (c.correct as string[]).some((t) => has(ans, t));
      checks.ends_with_check_question = /[?؟]\s*$/.test(ans.trim()) || /[?؟]/.test(ans.slice(-200));
      checks.paced_under_220_words = ans.split(/\s+/).filter(Boolean).length <= 220;
      checks.language = c.language === 'ar' ? arabicRatio(ans) > 0.5 : arabicRatio(ans) < 0.05;
    }
    let gradeShare: number | null = null;
    if (c.workflow === 'rubric_grading' && out) {
      const g = out as { criteria: { points: number }[] };
      gradeShare = g.criteria.reduce((n, x) => n + x.points, 0) / 6;
      const [lo, hi] = c.band as number[];
      checks.score_in_expected_band = gradeShare >= lo && gradeShare <= hi;
      checks.feedback_present = has(text, 'feedback');
    }
    const quality = Object.keys(checks).length ? pct(checks) : 0;
    const success = schema && quality >= 70;
    rows.push({
      case_id: c.id, workflow: c.workflow, role_simulated: c.role, language: c.language, model: m, mode: MODE,
      status: error ? 'FAIL' : success ? 'PASS' : 'FAIL', error, schema_pass: schema, quality_score: quality, success,
      checks: Object.entries(checks).map(([k, v]) => `${k}=${v ? 1 : 0}`).join(';'), grade_share: gradeShare,
      provider_attempts: calls.length, retries: Math.max(0, calls.length - 1), input_tokens: inTok, output_tokens: outTok, cache_tokens: cacheTok,
      latency_ms: ms, ttft_ms: null, cost_usd_published_rates: Number(cost.toFixed(6)), cost_usd_gateway_ledger: Number(gatewayCost.toFixed(6)), unpriced_attempts: unpriced,
      request_id: ctx.requestId, at: new Date().toISOString(),
      output_status: (out as { status?: string } | null)?.status ?? null,
      output_excerpt: (typeof (out as { answer?: string } | null)?.answer === 'string' ? (out as { answer: string }).answer : text).slice(0, 600),
    });
    process.stdout.write(`${c.id} ${m} ${rows.at(-1)!.status} q=${quality} ${ms}ms in=${inTok} out=${outTok} $${cost.toFixed(4)} ${error ? `ERR ${error.slice(0, 80)}` : ''}\n`);
  }
  setAiCallGuard(null);
  const datasetHash = createHash('sha256').update(JSON.stringify({ DOC_EN, DOC_AR, CASES, RUBRIC_Q })).digest('hex');
  const finalLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const budgetRows = await OrgBudget.findOne({ institutionId: INST }).lean();
  fs.writeFileSync(path.join(OUT, `results-${MODE}${ONLY ? `-${ONLY}` : ''}.json`), JSON.stringify({ mode: MODE, startedAt, finishedAt: new Date().toISOString(), datasetSha256: datasetHash, models: MODELS, cap: CAP, ledger: finalLedger, gatewayLedgerRows: await UsageLedger.countDocuments({}), p0dPolicy: budgetRows ? { monthly: (budgetRows as any).monthlyCapUsd, daily: (budgetRows as any).dailyCapUsd, perUser: (budgetRows as any).perUserDailyCapUsd } : null, rows }, null, 2));
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((e) => {
  console.error('benchmark failed:', (e as Error).message);
  process.exit(1);
});
