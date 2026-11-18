import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { lmsFlags } from '../integrations/lms/core/flags';
import { drainGradeJobs, enqueueForLink, passbackOn } from '../integrations/lms/core/outbox';
import { rosterOn, syncContextRoster } from '../integrations/lms/core/roster';
import { LmsContext, LmsDeployment, LmsGradeSyncJob, LmsPlatform, LmsResourceLink, LmsUser } from '../integrations/lms/models';
import { HEALTH, MockLmsScore, ensureMockIndexes, ensureMockKey, mockUrls, toolBase } from './mockLms';

// Deploy health check for lms-test.enara.app (docs/lms/CONTINUOUS_DELIVERY.md).
//
// setupHealthCheck(): idempotently registers the built-in mock LMS
// (mockLms.ts) as an active LTI 1.3 platform of the fake school LT-SCHOOL-A,
// with its deployment, and a fake published assessment the mock's activity is
// bound to (custom parameter enara_assessment). The LMS course, ENARA class,
// resource link and assignment are made by the first launch, as for any LMS.
//
// runHealthCheck(): the whole LTI round trip over HTTP against the app's own
// public URLs (so Vercel's routing and headers are exercised): /ready, the
// tool JWKS, the mock JWKS, a teacher launch (binds the activity), the
// student's /lti/login -> mock auth -> /lti/launch (303 to /lms/launch#lt=)
// -> /api/lms/launch/exchange, NRPS (when roster sync is on), one submitted
// attempt (or a re-send of the last result), a drain of the student's grade
// jobs, and the score received by the mock. Returns IDs and codes only, never names, emails or tokens.
//
// Everything is fake and isolated: the mock platform (issuer
// <tool>/api/maintenance/mock-lms, client health-check-mock-lms), the two
// mock users (health-teacher-1, health-student-1), the course health-course-1
// and the assessment LT-AS-HEALTH-CHECK, all in LT-SCHOOL-A. Nothing is ever
// deleted: a run adds one attempt while the fake student has attempts left (an
// assignment allows at most 10), then re-sends the last result instead (forced
// re-sync). The only update is keeping the fake assignment's due date ahead.

export interface HealthStep {
  name: string;
  ok: boolean;
  ms: number;
  code?: string;
}
export interface HealthRunResult {
  ok: boolean;
  steps: HealthStep[];
  ids: Record<string, string>;
}
export interface HealthRunOptions {
  /** The maintenance Authorization header (sent to the mock's sign-in endpoint). */
  authorization: string;
  /** Public origin to call (default LMS_TOOL_BASE_URL). Tests point it at a local server. */
  baseUrl?: string;
  /** fetch to use (default global fetch). */
  fetchImpl?: typeof fetch;
  /** Overall time budget (default 45 s, inside Vercel's 60 s function limit). */
  budgetMs?: number;
  /** How long to wait for the score at the mock (default 15 s). */
  scoreWaitMs?: number;
}

const HEALTH_QUESTION = { id: 'q1', type: 'multiple-choice', text: 'Health check: what is 2 + 2?', options: ['3', '4', '5'], correctAnswer: '4', explanation: '', points: 1, source: 'manual' };
const CALL_TIMEOUT_MS = 15_000;

class StepFailure extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

// ------------------------------------------------------------------- setup

export interface HealthSetupResult {
  ok: boolean;
  code?: string;
  name: string;
  institutionId: string;
  platformId?: string;
  deploymentId?: string;
  assessmentId?: string;
  contextId: string;
  resourceLinkId: string;
  created: { platform: boolean; deployment: boolean; assessment: boolean };
}

export async function setupHealthCheck(): Promise<HealthSetupResult> {
  const base = toolBase();
  const out: HealthSetupResult = {
    ok: false,
    name: HEALTH.platformName,
    institutionId: HEALTH.institutionId,
    contextId: HEALTH.contextId,
    resourceLinkId: HEALTH.resourceLinkId,
    created: { platform: false, deployment: false, assessment: false },
  };
  if (!lmsFlags().lti || !base) return { ...out, code: 'lti_not_enabled' };
  if (!(await Institution.exists({ id: HEALTH.institutionId }))) return { ...out, code: 'school_missing_run_seed_first' };
  await ensureMockIndexes();
  await ensureMockKey();

  // The fake assessment (published once; later setups leave it as it is).
  if (!(await Assessment.exists({ id: HEALTH.assessmentId }))) {
    const doc = await Assessment.create({
      id: HEALTH.assessmentId, title: 'Health check quiz (fake)', subject: 'Maths', institutionId: HEALTH.institutionId, assessmentKind: 'quiz',
      difficulty: 'Easy', duration: 5, status: 'active', lifecycle: 'draft', maxAttempts: 10, answerReveal: 'after-submit',
      questions: [HEALTH_QUESTION], origin: 'live', instructions: 'Fake item used only by the deploy health check.',
    });
    const { publishAssessment } = await import('../services/assessmentVersions');
    await publishAssessment(doc, HEALTH.createdBy);
    out.created.assessment = true;
  }
  out.assessmentId = HEALTH.assessmentId;

  // The mock platform: one row per (issuer, client_id). URLs follow the tool's current origin.
  const u = mockUrls(base);
  const now = new Date();
  let platform = await LmsPlatform.findOne({ issuer: u.issuer, clientId: HEALTH.clientId }).lean();
  if (platform && platform.institutionId !== HEALTH.institutionId) return { ...out, code: 'platform_belongs_to_another_school' };
  if (!platform) {
    try {
      platform = (
        await LmsPlatform.create({
          institutionId: HEALTH.institutionId, provider: 'lti13', vendor: 'generic', issuer: u.issuer, clientId: HEALTH.clientId,
          authLoginUrl: u.authLoginUrl, authTokenUrl: u.tokenUrl, keysetUrl: u.keysetUrl, status: 'active', registeredVia: 'manual',
          createdBy: HEALTH.createdBy, approvedBy: HEALTH.createdBy, approvedAt: now,
        })
      ).toObject();
      out.created.platform = true;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      platform = await LmsPlatform.findOne({ issuer: u.issuer, clientId: HEALTH.clientId }).lean();
    }
  } else {
    await LmsPlatform.updateOne({ id: platform.id }, { $set: { status: 'active', authLoginUrl: u.authLoginUrl, authTokenUrl: u.tokenUrl, keysetUrl: u.keysetUrl } });
  }
  if (!platform) return { ...out, code: 'platform_not_created' };
  out.platformId = platform.id;

  const depFilter = { platformId: platform.id, deploymentId: HEALTH.deploymentId };
  out.created.deployment = !(await LmsDeployment.exists(depFilter));
  await LmsDeployment.updateOne(
    depFilter,
    { $set: { status: 'active' }, $setOnInsert: { institutionId: HEALTH.institutionId, createdBy: HEALTH.createdBy, approvedBy: HEALTH.createdBy } },
    { upsert: true },
  ).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });
  out.deploymentId = (await LmsDeployment.findOne(depFilter).lean())?.id;
  return { ...out, ok: true };
}

// --------------------------------------------------------------------- run

interface Http {
  base: string;
  fetch: typeof fetch;
}

async function call(http: Http, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await http.fetch(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new StepFailure(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
}

async function json(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') throw new StepFailure('not_json');
  return body as Record<string, unknown>;
}

const expectStatus = (res: Response, status: number) => {
  if (res.status !== status) throw new StepFailure(`http_${res.status}`);
};

/** The state cookie set by /lti/login (name=value only). */
function stateCookie(res: Response): string | undefined {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const all = h.getSetCookie ? h.getSetCookie() : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*lti_st_)/);
  return all.map((c) => c.split(';')[0].trim()).find((c) => c.startsWith('lti_st_'));
}

/** login -> mock auth -> launch -> exchange for one mock user, each part its own step (names prefixed for the teacher). */
async function launchAs(http: Http, authorization: string, sub: string, step: <T>(name: string, fn: (note: (code: string) => void) => Promise<T>) => Promise<T>, prefix = '') {
  const u = mockUrls(http.base);
  const login = await step(`${prefix}lti_login`, async () => {
    const q = new URLSearchParams({ iss: u.issuer, login_hint: sub, target_link_uri: `${http.base}/lti/launch`, client_id: HEALTH.clientId, lti_deployment_id: HEALTH.deploymentId });
    const res = await call(http, `${http.base}/lti/login?${q}`);
    expectStatus(res, 302);
    const location = res.headers.get('location');
    if (!location || !location.startsWith(`${u.authLoginUrl}?`)) throw new StepFailure('unexpected_redirect');
    return { location, cookie: stateCookie(res) };
  });
  const auth = await step(`${prefix}mock_auth`, async () => {
    const res = await call(http, login.location, { headers: { Authorization: authorization, Accept: 'application/json' } });
    expectStatus(res, 200);
    const body = await json(res);
    if (typeof body.id_token !== 'string' || typeof body.state !== 'string') throw new StepFailure('no_id_token');
    return { idToken: body.id_token, state: body.state };
  });
  const lt = await step(`${prefix}lti_launch`, async () => {
    const res = await call(http, `${http.base}/lti/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(login.cookie ? { Cookie: login.cookie } : {}) },
      body: new URLSearchParams({ id_token: auth.idToken, state: auth.state }).toString(),
    });
    if (res.status !== 303) {
      const text = await res.text().catch(() => '');
      const ref = /<code>([a-z_]{1,60})<\/code>/.exec(text)?.[1];
      throw new StepFailure(ref ? `http_${res.status}_${ref}` : `http_${res.status}`);
    }
    const location = res.headers.get('location') ?? '';
    if (!location.startsWith(`${http.base}/lms/launch#`)) throw new StepFailure('unexpected_redirect');
    const token = new URLSearchParams(location.slice(location.indexOf('#') + 1)).get('lt');
    if (!token) throw new StepFailure('no_launch_token');
    return token;
  });
  return step(`${prefix}launch_exchange`, async () => {
    const res = await call(http, `${http.base}/api/lms/launch/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: lt }) });
    expectStatus(res, 200);
    const body = await json(res);
    const launch = (body.launch ?? {}) as { target?: { assignmentId?: string }; classId?: string };
    if (typeof body.token !== 'string') throw new StepFailure('no_session');
    return { session: `Bearer ${body.token}`, assignmentId: launch.target?.assignmentId, classId: launch.classId };
  });
}

export async function runHealthCheck(opts: HealthRunOptions): Promise<HealthRunResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const until = (ms: number) => Math.min(Date.now() + ms, started + budget);
  const steps: HealthStep[] = [];
  const ids: Record<string, string> = {};
  const base = (opts.baseUrl ?? toolBase())?.replace(/\/+$/, '');
  const http: Http = { base: base ?? '', fetch: opts.fetchImpl ?? fetch };

  let failed = false;
  const step = async <T>(name: string, fn: (note: (code: string) => void) => Promise<T>): Promise<T> => {
    if (failed) throw new StepFailure('skipped');
    const t = Date.now();
    let code: string | undefined;
    try {
      if (t - started > budget) throw new StepFailure('time_budget');
      const v = await fn((c) => {
        code = c;
      });
      steps.push({ name, ok: true, ms: Date.now() - t, ...(code ? { code } : {}) });
      return v;
    } catch (error) {
      failed = true;
      const failCode = error instanceof StepFailure ? error.code : `error_${(error as { name?: string })?.name ?? 'unknown'}`.slice(0, 60);
      steps.push({ name, ok: false, ms: Date.now() - t, code: failCode });
      throw new StepFailure('skipped');
    }
  };

  try {
    const platform = await step('setup_present', async () => {
      if (!base) throw new StepFailure('lti_not_enabled');
      if (!lmsFlags().lti) throw new StepFailure('lti_not_enabled');
      const p = await LmsPlatform.findOne({ issuer: mockUrls(base).issuer, clientId: HEALTH.clientId }).lean();
      if (!p) throw new StepFailure('not_set_up');
      if (p.status !== 'active') throw new StepFailure('platform_not_active');
      ids.platformId = p.id;
      return p;
    });

    await step('ready', async () => {
      const res = await call(http, `${base}/ready`);
      const body = await json(res);
      if ((body.checks as { mongo?: string } | undefined)?.mongo !== 'ok') throw new StepFailure('mongo_not_ok');
    });
    await step('tool_jwks', async () => {
      const res = await call(http, `${base}/.well-known/jwks.json`);
      expectStatus(res, 200);
      const keys = (await json(res)).keys;
      if (!Array.isArray(keys) || !keys.length) throw new StepFailure('no_keys');
    });
    await step('mock_jwks', async () => {
      const res = await call(http, mockUrls(base!).keysetUrl);
      expectStatus(res, 200);
      const keys = (await json(res)).keys;
      if (!Array.isArray(keys) || !keys.length) throw new StepFailure('no_keys');
    });

    // The teacher's launch binds the activity (and starts a roster sync when that is on).
    await launchAs(http, opts.authorization, HEALTH.teacherSub, step, 'teacher_');
    const student = await launchAs(http, opts.authorization, HEALTH.studentSub, step);
    if (!student.assignmentId) {
      await step('activity_bound', async () => {
        throw new StepFailure('no_assignment_target');
      });
    }
    ids.assignmentId = student.assignmentId!;

    const lmsStudent = await step('lms_records', async () => {
      const context = await LmsContext.findOne({ platformId: platform.id, externalContextId: HEALTH.contextId }).lean();
      const link = context ? await LmsResourceLink.findOne({ contextId: context.id, externalResourceLinkId: HEALTH.resourceLinkId }).lean() : null;
      const lmsUser = await LmsUser.findOne({ platformId: platform.id, externalUserId: HEALTH.studentSub }).lean();
      if (!context || !link || !lmsUser?.enaraUserId) throw new StepFailure('records_missing');
      if (link.enaraActivityId !== student.assignmentId) throw new StepFailure('binding_mismatch');
      ids.contextId = context.id;
      ids.resourceLinkId = link.id;
      ids.lmsUserId = lmsUser.id;
      const user = await User.findById(lmsUser.enaraUserId).select('studentId institutionId').lean();
      if (!user?.studentId || user.institutionId !== HEALTH.institutionId) throw new StepFailure('student_missing');
      return { lmsUserId: lmsUser.id, studentId: user.studentId, contextId: context.id };
    });

    if (rosterOn()) {
      await step('nrps_roster', async () => {
        for (let i = 0; i < 5; i++) {
          const r = await syncContextRoster(lmsStudent.contextId, { trigger: 'manual', actor: HEALTH.createdBy, budgetMs: 15_000 });
          if (r.status === 'ok' || r.status === 'partial') {
            if (r.members < 2) throw new StepFailure('members_missing');
            return;
          }
          if (r.status !== 'busy') throw new StepFailure(r.code ?? r.status);
          await new Promise((res) => setTimeout(res, 1000)); // the teacher launch's own sync holds the lease
        }
        throw new StepFailure('sync_busy');
      });
    }

    await step('keep_assignment_open', async () => {
      // The first launch gives the fake assignment a one-year due date; keep it in the future.
      const soon = new Date(Date.now() + 30 * 86_400_000);
      await Assignment.updateOne({ id: student.assignmentId, institutionId: HEALTH.institutionId, dueAt: { $lt: soon } }, { $set: { dueAt: new Date(Date.now() + 365 * 86_400_000) } });
    });

    // A new attempt while the fake student has attempts left (an assignment allows at most 10).
    // After that, the last result is sent again (a forced re-sync): attempts are
    // never deleted (the grade ledger is append-only; only PDPL erasure deletes attempts).
    const submittedAt = new Date();
    const fresh = await step('submit_attempt', async (note) => {
      const asg = await Assignment.findOne({ id: student.assignmentId, institutionId: HEALTH.institutionId }).select('maxAttempts').lean();
      const used = await AssessmentAttempt.countDocuments({ assignmentId: student.assignmentId, studentId: lmsStudent.studentId, institutionId: HEALTH.institutionId, status: 'submitted' });
      if (asg && used >= asg.maxAttempts) {
        note('attempts_used_resend_last');
        return false;
      }
      const headers = { Authorization: student.session, 'Content-Type': 'application/json' };
      const s = await call(http, `${base}/api/me/assignments/${encodeURIComponent(student.assignmentId!)}/attempts`, { method: 'POST', headers, body: '{}' });
      expectStatus(s, 201);
      const attemptId = ((await json(s)).attempt as { id?: string } | undefined)?.id;
      if (!attemptId) throw new StepFailure('no_attempt');
      ids.attemptId = attemptId;
      const r = await call(http, `${base}/api/me/assignments/${encodeURIComponent(student.assignmentId!)}/attempts/${encodeURIComponent(attemptId)}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ answers: { [HEALTH_QUESTION.id]: HEALTH_QUESTION.correctAnswer } }),
      });
      expectStatus(r, 200);
      return true;
    });

    await step('grade_send', async () => {
      if (!passbackOn()) throw new StepFailure('grade_passback_off');
      let jobId: string | undefined;
      if (!fresh) {
        const link = await LmsResourceLink.findOne({ id: ids.resourceLinkId, institutionId: HEALTH.institutionId }).lean();
        if (!link) throw new StepFailure('records_missing');
        const r = await enqueueForLink(link, lmsStudent.studentId, 'health_check', { force: true });
        if (!r.jobId) throw new StepFailure(`not_queued_${r.outcome}`);
        jobId = r.jobId;
      }
      // A new attempt queued its job (it may already be sent inline, on another instance); send what is due.
      const deadline = until(10_000);
      for (;;) {
        const job = jobId
          ? await LmsGradeSyncJob.findOne({ id: jobId }).lean()
          : await LmsGradeSyncJob.findOne({ platformId: platform.id, enaraAttemptId: ids.attemptId }).sort({ createdAt: -1 }).lean();
        if (job) {
          ids.jobId = job.id;
          if (job.status === 'sent') return;
          if (job.status === 'dead') throw new StepFailure(`job_dead_${(job.lastError ?? 'unknown').slice(0, 40)}`);
          await drainGradeJobs({ filter: { lmsUserId: lmsStudent.lmsUserId, platformId: platform.id }, limit: 5, budgetMs: 10_000, trigger: 'health_check' });
          const after = await LmsGradeSyncJob.findOne({ id: job.id }).lean();
          if (after?.status === 'sent') return;
          if (after?.status === 'dead') throw new StepFailure(`job_dead_${(after.lastError ?? 'unknown').slice(0, 40)}`);
        }
        if (Date.now() > deadline) throw new StepFailure(job ? `job_${job.status}` : 'no_job');
        await new Promise((res) => setTimeout(res, 500));
      }
    });

    await step('grade_received', async () => {
      const deadline = until(opts.scoreWaitMs ?? 15_000);
      for (;;) {
        const score = await MockLmsScore.findOne({ userId: HEALTH.studentSub, receivedAt: { $gte: new Date(submittedAt.getTime() - 1000) } }).sort({ receivedAt: -1 }).lean();
        if (score) {
          if (score.gradingProgress !== 'FullyGraded' || score.scoreGiven !== score.scoreMaximum) throw new StepFailure('unexpected_score');
          return;
        }
        if (Date.now() > deadline) throw new StepFailure('no_score_at_mock');
        await new Promise((res) => setTimeout(res, 500));
      }
    });
  } catch (error) {
    if (!(error instanceof StepFailure)) throw error;
  }
  return { ok: !failed && steps.every((s) => s.ok), steps, ids };
}
