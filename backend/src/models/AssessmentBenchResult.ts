import { Schema, model } from 'mongoose';

// Assessment bench (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7): one graded bench answer of one run, and the run itself. Bench data is
// written for the bench (fake learners); nothing here is a real learner's work. Kept for comparisons between runs.
const row = new Schema(
  {
    runId: { type: String, required: true },
    answerId: { type: String, required: true },
    itemId: String, domain: String, lang: String, type: String, band: String,
    gold: { type: Schema.Types.Mixed }, goldTotal: Number,
    model: { type: Schema.Types.Mixed, default: null }, modelTotal: { type: Number, default: null },
    flagged: Boolean, flagReasons: [String], confidence: Number, latencyMs: Number, errorCodes: [String], goldErrorCodes: [String],
    error: { type: String, default: null }, modelName: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'assessment_bench_results' },
);
row.index({ runId: 1, answerId: 1 }, { unique: true });
export const AssessmentBenchResult = model('AssessmentBenchResult', row);

const run = new Schema(
  {
    runId: { type: String, required: true, unique: true },
    startedAt: { type: Date, default: Date.now },
    capUsd: Number, sets: [String], note: String,
    finishedAt: Date, summary: { type: Schema.Types.Mixed }, failures: [String],
  },
  { collection: 'assessment_bench_runs' },
);
export const AssessmentBenchRun = model('AssessmentBenchRun', run);
