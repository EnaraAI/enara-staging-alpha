import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let ReviewItem: typeof import('../src/models/ReviewItem').ReviewItem;
let reviews: typeof import('../src/services/reviewService');
const realFetch = globalThis.fetch;
const resendFetch = vi.fn();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
    JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999',
    ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
    CRON_SECRET: 'cron-secret',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  ({ ReviewItem } = await import('../src/models/ReviewItem'));
  reviews = await import('../src/services/reviewService');
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
    String(url).startsWith('https://api.resend.com/') ? resendFetch(url, init) : realFetch(url, init)) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  resendFetch.mockResolvedValue(new Response('{"id":"e1"}', { status: 200 }));
  await ReviewItem.deleteMany({});
});

async function studentToken(studentId: string) {
  const { User } = await import('../src/models/User');
  const { Student } = await import('../src/models/Student');
  await Student.create({ id: studentId, name: 'Sara Ahmed', email: `${studentId}@example.com`, grade: '10' });
  const user = await User.create({ email: `${studentId}@example.com`, password: 'x', role: 'student', name: 'Sara', studentId });
  return `Bearer ${signAccessToken({ id: user._id.toString(), email: user.email, role: 'student', studentId })}`;
}

const wrongAnswer = (id: string, topic: string) => ({
  questionId: id,
  questionText: `Question ${id}`,
  topic,
  studentAnswer: 'x',
  correctAnswer: 1,
  isCorrect: false,
  explanation: 'Because.',
});

describe('spaced review', () => {
  it('queues missed quiz questions once and spaces them out as they are answered right', async () => {
    const input = {
      studentId: 'S1',
      assessmentId: 'quiz1',
      answers: [wrongAnswer('q1', 'Fractions'), { ...wrongAnswer('q2', 'Fractions'), isCorrect: true }],
      options: { q1: ['1/3', '1/2', '2/3'] },
    };
    expect(await reviews.queueQuizMistakes(input)).toBe(1);
    await reviews.queueQuizMistakes(input);
    expect(await ReviewItem.countDocuments({ studentId: 'S1' })).toBe(1);

    // Due tomorrow, so not yet; make it due now to answer it.
    expect(await reviews.listDueReviews('S1')).toHaveLength(0);
    await ReviewItem.updateMany({}, { dueAt: new Date(Date.now() - 1000) });
    const [item] = await reviews.listDueReviews('S1');
    expect(item).toMatchObject({ topic: 'Fractions', options: ['1/3', '1/2', '2/3'] });

    // Answer stored as option index 1 = "1/2"; text or index both count.
    expect(await reviews.answerReview('S1', item.id, '1/2')).toMatchObject({ correct: true, nextInDays: 3 });
    expect(await reviews.answerReview('S1', item.id, 0)).toMatchObject({ correct: false, answer: '1/2', nextInDays: 1 });
    for (const expected of [3, 7, 14, 30]) {
      expect((await reviews.answerReview('S1', item.id, 1))!.nextInDays).toBe(expected);
    }
    // Fifth right in a row retires it.
    expect(await reviews.answerReview('S1', item.id, 1)).toMatchObject({ correct: true, nextInDays: null });
    expect(await reviews.answerReview('S1', item.id, 1)).toBeNull();
  });
});

describe('student endpoints', () => {
  it('lists due reviews, answers them, and puts them first in next steps', async () => {
    const auth = await studentToken('S2');
    await reviews.queueQuizMistakes({ studentId: 'S2', assessmentId: 'quiz1', answers: [wrongAnswer('q1', 'Algebra')], options: {} });
    await ReviewItem.updateMany({}, { dueAt: new Date(Date.now() - 1000) });

    const due = await request(app).get('/api/me/reviews').set('Authorization', auth);
    expect(due.body.items).toHaveLength(1);
    const steps = await request(app).get('/api/me/next-steps').set('Authorization', auth);
    expect(steps.status).toBe(200);
    expect(steps.body.steps[0]).toMatchObject({ kind: 'review', count: 1 });
    expect(steps.body.note).toContain('Sara');

    const answer = await request(app)
      .post(`/api/me/reviews/${due.body.items[0].id}/answer`)
      .set('Authorization', auth)
      .send({ answer: '1' });
    expect(answer.body).toMatchObject({ correct: true });
    expect((await request(app).get('/api/me/reviews').set('Authorization', auth)).body.items).toHaveLength(0);
  });
});

describe('scheduled emails', () => {
  it('refuses the daily job without the cron secret', async () => {
    expect((await request(app).get('/api/cron/daily')).status).toBe(401);
    expect((await request(app).get('/api/cron/daily').set('Authorization', 'Bearer wrong')).status).toBe(401);
    const ok = await request(app).get('/api/cron/daily').set('Authorization', 'Bearer cron-secret');
    expect(ok.status).toBe(200);
  });

  it('sends nothing unless enabled, and redirects everything to the test inbox', async () => {
    const env = await import('../src/config/env');
    const { sendEmail } = await import('../src/services/emailService');
    expect(await sendEmail({ to: 'kid@example.com', subject: 'Hi', html: '<p>x</p>' })).toBe(false);
    expect(resendFetch).not.toHaveBeenCalled();

    Object.assign(process.env, {
      RESEND_API_KEY: 're_test',
      REMINDER_FROM: 'Enara <tutor@example.org>',
      REMINDERS_ENABLED: 'true',
      REMINDER_TEST_RECIPIENT: 'me@example.org',
    });
    env.resetConfigForTests();
    try {
      expect(await sendEmail({ to: 'kid@example.com', subject: 'Hi', html: '<p>x</p>' })).toBe(true);
      const body = JSON.parse(resendFetch.mock.calls[0][1].body);
      expect(body.to).toEqual(['me@example.org']);
      expect(body.html).toContain('this email was for kid@example.com');
    } finally {
      for (const k of ['RESEND_API_KEY', 'REMINDER_FROM', 'REMINDERS_ENABLED', 'REMINDER_TEST_RECIPIENT']) delete process.env[k];
      env.resetConfigForTests();
    }
  });
});
