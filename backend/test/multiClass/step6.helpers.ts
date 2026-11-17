import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { vi } from 'vitest';
import { PW, ctx, normalise, setSwitches } from './step5.helpers';

// Multi-class step 6 test helpers, on top of the step 5 fixture (school A with
// every single-class shape, school B for isolation). Step 6 only takes effect
// with dual write on and all seven step 5 features read from enrollments.

export const ALL7 = 'student_app,teacher_rosters,assessments,analytics,profile_context,credits,attendance';
export const BASE = { ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_READ_FROM: ALL7 };

export function multi(on: boolean, extra: Record<string, string | undefined> = {}) {
  setSwitches({ ...BASE, ENROLLMENT_MULTI_CLASS: on ? 'true' : undefined, ...extra });
}

export function allOff() {
  setSwitches({ ENROLLMENT_DUAL_WRITE: undefined, ENROLLMENT_READ_FROM: undefined, ENROLLMENT_MULTI_CLASS: undefined, ENROLLMENT_ATTENDANCE_FIX: undefined });
}

async function clearLimits() {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => {});
}

export async function call(user: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown) {
  await clearLimits();
  let r = request(ctx.app)[method](path).set('Authorization', ctx.tokens[user]);
  if (body !== undefined) r = r.send(body as object);
  const res = await r;
  return { status: res.status, body: res.body };
}

/** Adds a staff/parent user after the fixture started, and logs them in. */
export async function addUser(email: string, role: string, institutionId?: string, extra: Record<string, unknown> = {}) {
  const u = await ctx.M.User.create({ email, password: bcrypt.hashSync(PW, 4), role, name: email.split('@')[0], status: 'active', ...(institutionId ? { institutionId } : {}), ...extra });
  await clearLimits();
  const r = await request(ctx.app).post('/api/auth/login').send({ email, password: PW });
  ctx.tokens[email] = `Bearer ${r.body.token}`;
  return u;
}

/**
 * Runs the calls with step 6 off and then on (dual write and all seven step 5
 * features on in both runs), JSON normalised exactly as in step 5.
 */
export async function multiOffOn(calls: [string, string][], opts: { now?: Date; extra?: Record<string, string | undefined> } = {}) {
  const run = async (on: boolean) => {
    multi(on, opts.extra);
    if (opts.now) vi.useFakeTimers({ toFake: ['Date'], now: opts.now });
    try {
      const out = [];
      for (const [u, p] of calls) {
        const r = await call(u, 'get', p);
        out.push({ u, p, status: r.status, body: normalise(r.body) });
      }
      return out;
    } finally {
      if (opts.now) vi.useRealTimers();
    }
  };
  const off = await run(false);
  const on = await run(true);
  allOff();
  return { off, on };
}
