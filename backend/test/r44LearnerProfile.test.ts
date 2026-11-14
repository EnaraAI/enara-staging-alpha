import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { LessonItem } from '../src/services/languageLearningState';
import { applyTurn, summarizeProfile, codesForItem, loadProfileLines, recordProfileTurn } from '../src/services/learnerLanguageProfile';

// r4.4 #2 (rebuilt): a cross-session record of the learner's error TYPES (never their text), with
// spaced review. New collection only; tenant- and learner-scoped.
const s3: LessonItem = { id: 'q1', prompt: 'Correct the verb: "Tom ___ (fix) bikes every Saturday."', acceptedAnswers: ['fixes'], targetForms: ['fixes'] } as LessonItem;
const pro: LessonItem = { id: 'q3', prompt: 'Complete: "This is my aunt. ___ is a nurse."', acceptedAnswers: ['She'], targetForms: ['she'] } as LessonItem;
const vocab: LessonItem = { id: 'v1', prompt: 'Write the word: you drink it. ___', acceptedAnswers: ['milk'], targetForms: ['milk'] } as LessonItem;
const t0 = new Date('2026-11-01T10:00:00Z');

describe('r4.4 #2 persistent learner model (pure logic)', () => {
  it('records recurring error types and schedules spaced review on independent success', () => {
    let e = applyTurn([], { errorCode: 'missing_third_person_s', now: t0 });
    e = applyTurn(e, { errorCode: 'missing_third_person_s', now: t0 });
    expect(e[0]).toMatchObject({ occurrences: 2, independentStreak: 0 });
    expect(summarizeProfile(e, t0).join('\n')).toMatch(/Recurring difficulty: leaving out -s\/-es/);
    e = applyTurn(e, { independentSuccessOn: s3, now: t0 });
    expect(e[0].independentStreak).toBe(1);
    expect((e[0].nextReviewAt!.getTime() - t0.getTime()) / 86_400_000).toBe(3);
  });
  it('ignores unknown codes and items outside the learner\'s history', () => {
    expect(applyTurn([], { errorCode: 'unknown' })).toEqual([]);
    expect(applyTurn([], { independentSuccessOn: s3 })).toEqual([]);
    expect(codesForItem(pro)).toContain('pronoun_gender_swap');
    expect(codesForItem(vocab)).toEqual([]);
  });
  it('the summary holds error-type labels only (no answers, no learner text)', () => {
    const e = applyTurn(applyTurn([], { errorCode: 'pronoun_gender_swap', now: t0 }), { errorCode: 'pronoun_gender_swap', now: t0 });
    const txt = summarizeProfile(e, t0).join('\n');
    expect(txt).not.toMatch(/nurse|aunt|is a/i);
    expect(txt).toMatch(/never tell them about this record/);
  });
  it('a resolved difficulty (two independent successes) is no longer recurring', () => {
    let e = applyTurn(applyTurn([], { errorCode: 'missing_third_person_s', now: t0 }), { errorCode: 'missing_third_person_s', now: t0 });
    e = applyTurn(applyTurn(e, { independentSuccessOn: s3, now: t0 }), { independentSuccessOn: s3, now: t0 });
    expect(summarizeProfile(e, t0).join('\n')).not.toMatch(/Recurring/);
  });
});

describe('r4.4 #2 persistence (real database)', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); }, 120_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
  it('stores error types per learner and tenant, and loads them as prompt lines', async () => {
    await recordProfileTurn('school-a', 'stu-1', { errorCode: 'missing_third_person_s' });
    await recordProfileTurn('school-a', 'stu-1', { errorCode: 'missing_third_person_s' });
    await recordProfileTurn('school-b', 'stu-1', { errorCode: 'pronoun_gender_swap' });
    const a = await loadProfileLines('school-a', 'stu-1');
    expect(a.join('\n')).toMatch(/-s\/-es/);
    expect(a.join('\n')).not.toMatch(/he and she/);
    const other = await loadProfileLines('school-a', 'stu-2');
    expect(other).toEqual([]);
    const docs = await mongoose.connection.collection('learner_language_profiles').find({}).toArray();
    expect(docs).toHaveLength(2); // one per (tenant, learner)
    expect(JSON.stringify(docs)).not.toMatch(/answer|text|prompt/i);
  });
  it('a failure to read or write never breaks a turn', async () => {
    expect(await loadProfileLines(undefined, undefined)).toEqual([]);
    await expect(recordProfileTurn(undefined, undefined, { errorCode: 'missing_third_person_s' })).resolves.toBeUndefined();
  });
});
