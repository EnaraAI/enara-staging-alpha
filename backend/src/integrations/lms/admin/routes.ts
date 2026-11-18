import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { sessionUser, signToken } from '../../../controllers/auth.controller';
import { authMiddleware, isInstitutionSuspended, requireAdmin, type AuthRequest } from '../../../middleware/auth.middleware';
import { AppError, asyncHandler } from '../../../middleware/errorHandler';
import { Assignment } from '../../../models/Assignment';
import { CourseInstance } from '../../../models/CourseInstance';
import { Institution } from '../../../models/Institution';
import { User } from '../../../models/User';
import { selectLaunchClass } from '../../../services/multiClass';
import { MongoRateLimitStore } from '../../../services/mongoRateLimitStore';
import { logger, serializeError } from '../../../utils/logging';
import { ensurePlainObject, getOptionalBoolean, getOptionalId, rejectMongoOperators } from '../../../utils/validation';
import { isAcceptableKeysetUrl } from '../adapters/lti13/jwks';
import { writeLmsAudit } from '../core/audit';
import { anyLmsFlagSet, lmsFlags, lmsSettings } from '../core/flags';
import { runInBackground, triggerOn } from '../core/drain';
import { consumeHandoffCode, HANDOFF_CODE_TTL_SECONDS, HandoffCodeError, mintHandoffCode } from '../core/handoffCode';
import { consumeLaunchToken, LaunchTokenError } from '../core/launchToken';
import { createRegistrationCode, registrationCodeView, registrationUrl, REGISTRATION_CODE_TTL_MS, revokeRegistrationCode } from '../core/registrationCode';
import { micCounts, parseMicTelemetry, recordMicTelemetry } from '../core/micTelemetry';
import { flaggedActivities } from '../core/activityHealth';
import { drainGradeJobs, gradeStats, passbackOn, resyncGrades, retryDead } from '../core/outbox';
import { contextRosterViews, manualSyncTooSoon, notStartedStudents, rosterOn, syncContextRoster } from '../core/roster';
import { seatView, updateSeatSettings } from '../core/seats';
import { liftSuppression, listSuppressions } from '../core/suppression';
import { LmsContext, LmsDeployment, LmsOrgSettings, LmsPlatform, LmsRegistrationCode, LmsResourceLink, LmsUser, type ILmsContext, type ILmsDeployment, type ILmsHandoffCode, type ILmsPlatform } from '../models';
import { isKnownVendor, listPresets } from '../presets';
import { requireLti } from '../routes';
import { problemsRouter } from './problemsRoutes';

// /api/lms (Phase 1a). Inert (the app's normal 404) unless LMS_LTI_ENABLED is
// on and the LMS config is valid.
//   Public:   POST /launch/exchange   one-time launch token -> ENARA session
//             POST /launch/handoff/exchange   one-time "Open in new tab" code -> ENARA session
//   Signed in: POST /launch/handoff   "Open in new tab" (LMS accounts only): a 60 s one-time code
//             POST /telemetry/mic     mic check outcome / new tab opened (daily counts per school)
//   Admins:   GET /telemetry/mic      those counts (ENARA admins: every school; school admins: their own)
//   Admins:   status, platforms (manual "Add LMS"), deployments, seats
//   Grades (Phase 3, also needs LMS_GRADE_PASSBACK_ENABLED): outbox counts and
//             last error per platform, "Re-sync grades", "Retry dead jobs"
//   Roster (Phase 4, also needs LMS_ROSTER_SYNC_ENABLED): per course sync
//             status, not-started students, "Sync roster now"
//   Suppression list (Priority 0, PDPL; ENARA admins only): list per school,
//             lift one row
//   Registration links (Phase 1b): the one-URL "Connect Moodle" link (LTI
//             Dynamic Registration): create (the URL is shown once), list
//             (never the code), revoke
// School admins see and change only their own school. A school admin's new
// connection is 'pending' until an ENARA admin approves it
// (LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL, default on). ENARA admins see and
// manage every school, and alone set seat limits.

// LMS_LTI_ENABLED is set but the LMS config has a problem (so the LMS is off),
// for example LMS_TOOL_BASE_URL and APP_URL on different hosts: GET /status
// answers ENARA admins with the problem (variable names only), so the LMS
// connections page can show it. Other signed-in users get the normal 404, as
// does every other case (the full status below answers when the LMS is on).
export const lmsConfigProblemRouter = Router();
lmsConfigProblemRouter.get(
  '/status',
  (_req: Request, _res: Response, next: NextFunction) => {
    const f = lmsFlags();
    if (f.lti || !f.problem || !anyLmsFlagSet()) return next('router');
    next();
  },
  authMiddleware,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'enara-admin') return next('router');
    res.json({ enabled: false, problem: lmsFlags().problem });
  },
);

export const lmsAdminRouter = Router();
lmsAdminRouter.use(requireLti);

const isEnara = (req: AuthRequest) => req.user?.role === 'enara-admin';

function toolUrls() {
  const base = lmsSettings().toolBaseUrl!;
  return {
    toolUrl: base,
    loginUrl: `${base}/lti/login`,
    launchUrl: `${base}/lti/launch`,
    redirectUris: [`${base}/lti/launch`],
    jwksUrl: `${base}/.well-known/jwks.json`,
  };
}

function platformView(p: ILmsPlatform, deployments: ILmsDeployment[]) {
  return {
    id: p.id,
    institutionId: p.institutionId,
    provider: p.provider,
    vendor: p.vendor,
    issuer: p.issuer,
    clientId: p.clientId,
    authLoginUrl: p.authLoginUrl ?? null,
    authTokenUrl: p.authTokenUrl ?? null,
    keysetUrl: p.keysetUrl ?? null,
    status: p.status,
    registeredVia: p.registeredVia,
    createdAt: p.createdAt,
    approvedAt: p.approvedAt ?? null,
    launchCount: p.launchCount ?? 0,
    cookielessLaunchCount: p.cookielessLaunchCount ?? 0,
    storageLaunchCount: p.storageLaunchCount ?? 0,
    lastLaunchAt: p.lastLaunchAt ?? null,
    deployments: deployments.filter((d) => d.platformId === p.id).map((d) => ({ id: d.id, deploymentId: d.deploymentId, status: d.status })),
  };
}

async function viewOne(p: ILmsPlatform) {
  return platformView(p, await LmsDeployment.find({ platformId: p.id }).lean());
}

/** A platform the caller may manage, or 404 (never reveals another school's rows). */
async function ownPlatform(req: AuthRequest, id: string): Promise<ILmsPlatform> {
  const filter = isEnara(req) ? { id } : { id, institutionId: req.user!.institutionId ?? '__none__' };
  const p = await LmsPlatform.findOne(filter).lean();
  if (!p) throw new AppError('LMS connection not found', 404, 'LMS_PLATFORM_NOT_FOUND');
  return p;
}

function url(body: Record<string, unknown>, field: string, required: boolean): string | undefined {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
    return undefined;
  }
  if (typeof raw !== 'string' || raw.length > 500 || !isAcceptableKeysetUrl(raw.trim())) throw new AppError(`${field} must be an https URL`, 400, 'VALIDATION_ERROR');
  return raw.trim();
}

function text(body: Record<string, unknown>, field: string, max: number): string {
  const raw = body[field];
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > max) throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
  return raw.trim();
}

function deploymentIds(body: Record<string, unknown>): string[] {
  const raw = body.deploymentIds;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  const ids = [...new Set(list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))];
  if (!ids.length) throw new AppError('At least one deployment ID is required', 400, 'VALIDATION_ERROR');
  if (ids.length > 20 || ids.some((d) => d.length > 200)) throw new AppError('deploymentIds is invalid', 400, 'VALIDATION_ERROR');
  return ids;
}

function roleForToken(role: string): 'student' | 'teacher' | 'admin' | undefined {
  return role === 'student' || role === 'teacher' || role === 'admin' ? role : undefined;
}

// ------------------------------------------------------------ sessions

/** ENARA account roles a launch may open (P0 item 1); anything else: LMS_ROLE_NOT_SUPPORTED. */
export const LAUNCH_ACCOUNT_ROLES: ReadonlySet<string> = new Set(['student', 'teacher', 'admin', 'parent']);

/** Selects the launch's class as current; audited with IDs only. A failure never blocks the launch. */
async function selectCurrentClassForLaunch(row: { institutionId: string; platformId?: string; lmsUserId?: string; contextId?: string; enaraClassId?: string }, studentId: string) {
  try {
    const outcome = await selectLaunchClass(studentId, row.enaraClassId!, row.institutionId);
    if (outcome === 'off' || outcome === 'single_class' || outcome === 'unchanged') return;
    await writeLmsAudit({
      event: 'lms.current_class',
      outcome: outcome === 'selected' ? 'ok' : 'warn',
      institutionId: row.institutionId,
      platformId: row.platformId,
      actor: row.lmsUserId,
      code: outcome,
      refIds: { studentId, enaraClassId: row.enaraClassId, contextId: row.contextId },
    });
  } catch (error) {
    logger.warn('lms_current_class_failed', { institutionId: row.institutionId, enaraClassId: row.enaraClassId, error: serializeError(error) });
  }
}

/** What a one-time LTI launch token or "Open in new tab" code opens (the row's own fields). */
interface SessionGrant {
  purpose: 'launch' | 'handoff';
  institutionId: string;
  enaraUserId: string;
  enaraRole: 'student' | 'teacher' | 'admin';
  preview?: boolean;
  platformId?: string;
  lmsUserId?: string;
  contextId?: string;
  enaraClassId?: string;
  resourceLinkId?: string;
  targetAssignmentId?: string;
  targetPage?: string;
  presentation?: 'iframe' | 'window';
  cookieless: boolean;
}

type LoadedUser = Parameters<typeof sessionUser>[0];

/** The checks every LMS sign-in shares (account, school, role, preview), then a normal ENARA session. */
async function openLmsSession(row: SessionGrant, res: Response, user: LoadedUser | null, auditRefIds: Record<string, unknown> = {}) {
  if (!user || user.status !== 'active' || user.institutionId !== row.institutionId) {
    await writeLmsAudit({ event: 'lms.session', outcome: 'fail', institutionId: row.institutionId, platformId: row.platformId, code: 'account_unavailable', refIds: { purpose: row.purpose, ...auditRefIds } });
    throw new AppError('Your ENARA account is not available. Ask your school administrator.', 403, 'LMS_ACCOUNT_UNAVAILABLE');
  }
  if (await isInstitutionSuspended(row.institutionId)) throw new AppError("Your school's ENARA access is suspended.", 403, 'INSTITUTION_SUSPENDED');
  // P0 item 1: only these ENARA accounts open from an LMS (student app, staff
  // portal, Parents Portal). Any other role (ENARA admin, academic manager,
  // an unknown one) gets no session, and never the admin portal.
  if (!LAUNCH_ACCOUNT_ROLES.has(user.role)) {
    await writeLmsAudit({ event: 'lms.session', outcome: 'fail', institutionId: row.institutionId, platformId: row.platformId, actor: row.lmsUserId, code: 'role_not_supported', refIds: { purpose: row.purpose, ...auditRefIds } });
    throw new AppError('ENARA does not open this kind of account from your LMS. Ask your school administrator.', 403, 'LMS_ROLE_NOT_SUPPORTED');
  }
  // A student preview is only for a staff account (its role may have changed since the launch).
  const preview = row.preview === true;
  if (preview && user.role !== 'teacher' && user.role !== 'admin') {
    await writeLmsAudit({ event: 'lms.session', outcome: 'fail', institutionId: row.institutionId, platformId: row.platformId, code: 'preview_not_staff', refIds: { purpose: row.purpose, ...auditRefIds } });
    throw new AppError('Your ENARA account is not available. Ask your school administrator.', 403, 'LMS_ACCOUNT_UNAVAILABLE');
  }
  // P0 item 5: a student's launch from an LMS course makes that course's
  // ENARA class their current class (multi-class only; see selectLaunchClass).
  if (!preview && row.purpose === 'launch' && user.role === 'student' && user.studentId && row.enaraClassId) {
    await selectCurrentClassForLaunch(row, user.studentId);
  }
  await writeLmsAudit({
    event: 'lms.session',
    outcome: 'ok',
    institutionId: row.institutionId,
    platformId: row.platformId,
    actor: row.lmsUserId,
    refIds: { purpose: row.purpose, contextId: row.contextId, enaraClassId: row.enaraClassId, cookieless: row.cookieless, preview, ...auditRefIds },
  });
  // Phase 3: the ENARA work the activity is bound to (the landing page opens it).
  // An archived assignment is not opened (students cannot see it). A handoff
  // with no assignment reopens the page the student was on.
  const assignmentOpen = row.targetAssignmentId && (await Assignment.exists({ id: row.targetAssignmentId, institutionId: row.institutionId, state: { $ne: 'archived' } }));
  const target = assignmentOpen ? { kind: 'assignment', assignmentId: row.targetAssignmentId } : row.targetPage ? { kind: 'page', page: row.targetPage } : null;
  res.json({
    token: signToken(user, { preview }),
    user: await sessionUser(user),
    launch: {
      purpose: row.purpose,
      role: row.enaraRole,
      classId: row.enaraClassId ?? null,
      resourceLinkId: row.resourceLinkId ?? null,
      presentation: row.presentation ?? 'iframe',
      cookieless: row.cookieless,
      preview,
      target,
    },
  });
}

lmsAdminRouter.post(
  '/launch/exchange',
  asyncHandler(async (req, res: Response) => {
    const body = ensurePlainObject(req.body ?? {});
    let row;
    try {
      row = await consumeLaunchToken(body.token);
    } catch (error) {
      if (error instanceof LaunchTokenError) {
        await writeLmsAudit({ event: 'lms.session', outcome: 'fail', code: error.code });
        throw new AppError('This sign-in link is no longer valid. Open the activity again from your LMS.', error.code === 'launch_token_invalid' ? 400 : 410, error.code.toUpperCase());
      }
      throw error;
    }
    await openLmsSession(row, res, await User.findById(row.enaraUserId));
  }),
);

// ------------------------------------------------- "Open in new tab" handoff
//
// Mic / new tab, item 2. A signed-in LMS session (inside the LMS frame) asks
// for a one-time code; the new tab lands on /lms/launch#hc=<code> and trades
// it once for its own session (POST /launch/handoff/exchange). The code lives
// 60 seconds, is stored only as a hash, and is bound to the account, the
// school, the LMS link and activity, the target and the issuing session.
// Minting is limited per account, the exchange per network address.

export const HANDOFF_MINT_PER_MINUTE = 10;
export const HANDOFF_EXCHANGE_PER_MINUTE = 30;
const PAGE_KEY = /^[a-z][a-z0-9-]{0,39}$/;

const limited = (text: string) => ({ error: { code: 'RATE_LIMITED', message: text }, message: text });
const handoffMintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: HANDOFF_MINT_PER_MINUTE,
  store: new MongoRateLimitStore('lms-handoff-mint'),
  passOnStoreError: true,
  keyGenerator: (req) => `inst:${(req as AuthRequest).user?.institutionId ?? 'none'}:user:${(req as AuthRequest).user?.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: limited('Too many new tabs. Wait a moment and try again.'),
});
const handoffExchangeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: HANDOFF_EXCHANGE_PER_MINUTE,
  store: new MongoRateLimitStore('lms-handoff-exchange'),
  passOnStoreError: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: limited('Too many sign-in attempts. Wait a moment and try again.'),
});

const targetNotFound = () => new AppError('That activity is not available. Open it again from your LMS.', 404, 'LMS_HANDOFF_TARGET_NOT_FOUND');

lmsAdminRouter.post(
  '/launch/handoff',
  authMiddleware,
  handoffMintLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    // Parents never come from an LMS: only student, teacher and school admin accounts.
    const role = roleForToken(user.role);
    const account = role && user.institutionId ? await User.findById(user.id).select('tokenVersion role').lean() : null;
    if (!role || !account) throw new AppError('Only accounts that came from an LMS can do this', 403, 'LMS_ACCOUNT_REQUIRED');
    const institutionId = user.institutionId!;
    const body = ensurePlainObject(req.body ?? {});
    const requestedClass = getOptionalId(body, 'classId');
    const requestedAssignment = getOptionalId(body, 'assignmentId');
    const requestedLink = getOptionalId(body, 'resourceLinkId');
    const rawPage = body.page;
    if (rawPage !== undefined && rawPage !== null && (typeof rawPage !== 'string' || !PAGE_KEY.test(rawPage))) throw new AppError('page is invalid', 400, 'VALIDATION_ERROR');
    const targetPage = typeof rawPage === 'string' ? rawPage : undefined;

    // The LMS activity, when given: it must be this school's, on a platform this account came from.
    let platformId: string | undefined;
    let contextId: string | undefined;
    let resourceLinkId: string | undefined;
    let targetAssignmentId: string | undefined;
    if (requestedLink) {
      const rl = await LmsResourceLink.findOne({ id: requestedLink, institutionId }).select('id contextId enaraActivityId').lean();
      const ctx = rl ? await LmsContext.findOne({ id: rl.contextId, institutionId }).select('id platformId').lean() : null;
      if (!rl || !ctx) throw targetNotFound();
      if (requestedAssignment && rl.enaraActivityId && requestedAssignment !== rl.enaraActivityId) {
        throw new AppError('That assignment is not the one this LMS activity opens.', 400, 'LMS_HANDOFF_TARGET_MISMATCH');
      }
      platformId = ctx.platformId;
      contextId = ctx.id;
      resourceLinkId = rl.id;
      targetAssignmentId = rl.enaraActivityId ?? requestedAssignment;
    } else {
      targetAssignmentId = requestedAssignment;
    }
    const link = await LmsUser.findOne({ enaraUserId: user.id, institutionId, ...(platformId ? { platformId } : {}) }).select('id platformId').lean();
    if (!link) {
      if (platformId) throw targetNotFound();
      throw new AppError('Only accounts that came from an LMS can do this', 403, 'LMS_ACCOUNT_REQUIRED');
    }
    if (targetAssignmentId && !(await Assignment.exists({ id: targetAssignmentId, institutionId }))) throw targetNotFound();
    // Informational only (the landing page): kept only when it is a class of this school.
    const enaraClassId = requestedClass && (await CourseInstance.exists({ id: requestedClass, institutionId })) ? requestedClass : undefined;
    // A preview stays a preview in the new tab.
    const preview = user.preview === true;
    const minted = await mintHandoffCode({
      institutionId,
      enaraUserId: user.id,
      enaraRole: preview ? 'student' : role,
      accountRole: account.role,
      sessionVersion: account.tokenVersion ?? 0,
      ...(preview ? { preview: true } : {}),
      platformId: link.platformId,
      lmsUserId: link.id,
      contextId,
      enaraClassId,
      resourceLinkId,
      targetAssignmentId,
      targetPage: targetAssignmentId ? undefined : targetPage,
    });
    await writeLmsAudit({
      event: 'lms.handoff',
      outcome: 'ok',
      institutionId,
      platformId: link.platformId,
      actor: link.id,
      refIds: { handoffId: minted.id, enaraUserId: user.id, resourceLinkId, assignmentId: targetAssignmentId, enaraClassId, page: targetAssignmentId ? undefined : targetPage, preview },
    });
    res.json({ url: `${lmsSettings().toolBaseUrl}/lms/launch#hc=${minted.code}`, expiresIn: HANDOFF_CODE_TTL_SECONDS });
  }),
);

const handoffRefused = async (row: ILmsHandoffCode, code: string, status: number, errorCode: string, message: string) => {
  await writeLmsAudit({ event: 'lms.session', outcome: 'fail', institutionId: row.institutionId, platformId: row.platformId, actor: row.lmsUserId, code, refIds: { purpose: 'handoff', handoffId: row.id } });
  return new AppError(message, status, errorCode);
};

lmsAdminRouter.post(
  '/launch/handoff/exchange',
  handoffExchangeLimiter,
  asyncHandler(async (req, res: Response) => {
    const body = ensurePlainObject(req.body ?? {});
    let row: ILmsHandoffCode;
    try {
      row = await consumeHandoffCode(body.code);
    } catch (error) {
      if (error instanceof HandoffCodeError) {
        await writeLmsAudit({ event: 'lms.session', outcome: 'fail', code: error.code, refIds: { purpose: 'handoff' } });
        throw new AppError('This link has expired. Go back to the LMS tab and choose "Open in new tab" again.', error.code === 'handoff_code_invalid' ? 400 : 410, error.code.toUpperCase());
      }
      throw error;
    }
    const user = await User.findById(row.enaraUserId);
    // Bound to the issuing session: a sign-out (or password reset) since the code was made refuses it.
    if (user && (user.tokenVersion ?? 0) !== row.sessionVersion) {
      throw await handoffRefused(row, 'session_changed', 403, 'LMS_HANDOFF_SESSION_ENDED', 'You signed out since this link was made. Open the activity again from your LMS.');
    }
    // Bound to the account as it was: a role change since then refuses it (never a wider portal).
    if (user && (user.role !== row.accountRole || !roleForToken(user.role))) {
      throw await handoffRefused(row, 'role_changed', 403, 'LMS_ACCOUNT_UNAVAILABLE', 'Your ENARA account is not available. Ask your school administrator.');
    }
    // Bound to the LMS link it came from (same account, school and platform).
    if (!(await LmsUser.exists({ id: row.lmsUserId, enaraUserId: row.enaraUserId, institutionId: row.institutionId, platformId: row.platformId }))) {
      throw await handoffRefused(row, 'lms_link_changed', 403, 'LMS_ACCOUNT_UNAVAILABLE', 'Your ENARA account is not available. Ask your school administrator.');
    }
    // Bound to the target: the activity must still open the same assignment, in the same school.
    if (row.resourceLinkId) {
      const rl = await LmsResourceLink.findOne({ id: row.resourceLinkId, institutionId: row.institutionId }).select('contextId enaraActivityId').lean();
      const ctx = rl ? await LmsContext.exists({ id: rl.contextId, institutionId: row.institutionId, platformId: row.platformId }) : null;
      if (!rl || !ctx || (row.targetAssignmentId && rl.enaraActivityId && rl.enaraActivityId !== row.targetAssignmentId)) {
        throw await handoffRefused(row, 'target_changed', 409, 'LMS_HANDOFF_TARGET_CHANGED', 'This activity changed since the link was made. Open it again from your LMS.');
      }
    }
    if (row.targetAssignmentId && !(await Assignment.exists({ id: row.targetAssignmentId, institutionId: row.institutionId }))) {
      throw await handoffRefused(row, 'target_changed', 409, 'LMS_HANDOFF_TARGET_CHANGED', 'This activity changed since the link was made. Open it again from your LMS.');
    }
    await openLmsSession(
      { ...row, purpose: 'handoff', presentation: 'window', cookieless: false },
      res,
      user,
      { handoffId: row.id, resourceLinkId: row.resourceLinkId, assignmentId: row.targetAssignmentId },
    );
  }),
);

// ------------------------------------------------------- mic telemetry
//
// Mic / new tab, item 6. Any signed-in account of a school reports one mic
// check outcome or "new tab opened"; only daily counts per school, browser
// family, frame and feature are kept (no user, no name, no user-agent).
// ENARA admins read every school's counts; a school admin reads their own.

export const MIC_TELEMETRY_PER_MINUTE = 30;
const micTelemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: MIC_TELEMETRY_PER_MINUTE,
  store: new MongoRateLimitStore('lms-mic-telemetry'),
  passOnStoreError: true,
  keyGenerator: (req) => `inst:${(req as AuthRequest).user?.institutionId ?? 'none'}:user:${(req as AuthRequest).user?.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: limited('Too many events'),
});

lmsAdminRouter.post(
  '/telemetry/mic',
  authMiddleware,
  micTelemetryLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = parseMicTelemetry(req.body);
    const institutionId = req.user!.institutionId;
    if (institutionId) await recordMicTelemetry(institutionId, event);
    res.status(204).end();
  }),
);

lmsAdminRouter.get(
  '/telemetry/mic',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req) && req.user!.role !== 'admin') throw new AppError('Admin access required', 403, 'ADMIN_REQUIRED');
    const requested = typeof req.query.institutionId === 'string' && req.query.institutionId ? req.query.institutionId.slice(0, 200) : undefined;
    const institutionId = isEnara(req) ? requested : req.user!.institutionId ?? '__none__';
    const rawDays = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
    const days = Number.isFinite(rawDays) && rawDays >= 1 ? rawDays : 30;
    res.json(await micCounts({ institutionId, days }));
  }),
);


// --------------------------------------------------------------- roster
//
// Phase 4. The app's normal 404 unless LMS_ROSTER_SYNC_ENABLED is on too.
// Per LMS course (lms_contexts): last sync, counts, last error code, the
// students not started yet, and "Sync roster now". School admins: their own
// school; ENARA admins: every school; a teacher: only a course whose ENARA
// class they teach. Anyone else: 403; another school's course: 404.

const rosterRouter = Router();
rosterRouter.use((_req: Request, _res: Response, next: NextFunction) => (rosterOn() ? next() : next('router')));
rosterRouter.use(authMiddleware, (req: AuthRequest, res: Response, next: NextFunction) => {
  if (['admin', 'enara-admin', 'teacher'].includes(req.user?.role ?? '')) return next();
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not allowed' }, message: 'Not allowed' });
});

/** A course the caller may see and sync, or 404 (never reveals another school's rows or another teacher's course). */
async function ownContext(req: AuthRequest, id: string): Promise<ILmsContext> {
  const user = req.user!;
  const context = await LmsContext.findOne(isEnara(req) ? { id } : { id, institutionId: user.institutionId ?? '__none__' }).lean();
  if (!context) throw new AppError('LMS course not found', 404, 'LMS_CONTEXT_NOT_FOUND');
  if (user.role === 'teacher') {
    const teaches = context.enaraClassId && (await CourseInstance.exists({ id: context.enaraClassId, institutionId: context.institutionId, instructorIds: user.id }));
    if (!teaches) throw new AppError('LMS course not found', 404, 'LMS_CONTEXT_NOT_FOUND');
  }
  return context;
}

rosterRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req) && req.user!.role !== 'admin') throw new AppError('Admin access required', 403, 'ADMIN_REQUIRED');
    const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
    const filter: Record<string, unknown> = isEnara(req) ? (requested ? { institutionId: requested } : {}) : { institutionId: req.user!.institutionId ?? '__none__' };
    if (typeof req.query.platformId === 'string') filter.platformId = req.query.platformId;
    const contexts = await LmsContext.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
    res.json({ contexts: await contextRosterViews(contexts) });
  }),
);

rosterRouter.get(
  '/:id/roster',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const context = await ownContext(req, String(req.params.id));
    const [view] = await contextRosterViews([context]);
    res.json({ context: view, notStarted: await notStartedStudents(context) });
  }),
);

rosterRouter.post(
  '/:id/roster/sync',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const context = await ownContext(req, String(req.params.id));
    if (manualSyncTooSoon(context)) throw new AppError('A sync just ran for this course. Try again in a minute.', 429, 'LMS_ROSTER_SYNC_TOO_SOON');
    const outcome = await syncContextRoster(context.id, { trigger: 'manual', actor: req.user!.id });
    if (outcome.status === 'busy') throw new AppError('A sync is already running for this course.', 409, 'LMS_ROSTER_SYNC_BUSY');
    const [view] = await contextRosterViews([(await LmsContext.findOne({ id: context.id }).lean())!]);
    res.json({ outcome, context: view });
  }),
);

// Mounted on /contexts only (and before the grade and admin routers, whose
// admin-only checks would otherwise stop teachers).
lmsAdminRouter.use('/contexts', rosterRouter);

// --------------------------------------------------------------- grades
//
// Phase 3. The app's normal 404 unless LMS_GRADE_PASSBACK_ENABLED is on too.
// School admins: their own school's platforms. ENARA admins: every school.

const gradesRouter = Router();
gradesRouter.use((_req: Request, _res: Response, next: NextFunction) => (passbackOn() ? next() : next('router')));
gradesRouter.use(authMiddleware, requireAdmin);

gradesRouter.get(
  '/grades',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
    const filter = isEnara(req) ? (requested ? { institutionId: requested } : {}) : { institutionId: req.user!.institutionId ?? '__none__' };
    const platforms = await LmsPlatform.find(filter).select('id').sort({ createdAt: -1 }).limit(200).lean();
    const stats = await gradeStats(platforms.map((p) => p.id));
    // Phase 3 follow-up: bound activities that may have been deleted in the LMS (404/410 for the line item, or 30 days without a launch or a result).
    const now = new Date();
    const withActivities = await Promise.all(stats.map(async (s) => ({ ...s, activitiesMayBeDeleted: await flaggedActivities(s.platformId, now) })));
    res.json({ enabled: true, platforms: withActivities });
  }),
);

/** After an admin action: send what was queued, in the background (plan §5 a). */
function drainSoon(platformId: string) {
  if (triggerOn('inline')) runInBackground('admin_drain', () => drainGradeJobs({ filter: { platformId }, limit: 20, trigger: 'admin' }));
}

gradesRouter.post(
  '/platforms/:id/grades/resync',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const p = await ownPlatform(req, String(req.params.id));
    const body = ensurePlainObject(req.body ?? {});
    const resourceLinkId = getOptionalId(body, 'resourceLinkId');
    // Grade ledger (inert unless GRADE_LEDGER_ENABLED): first look for grades changed in the LMS, so the
    // re-sync never overwrites them (those cells are held until a teacher decides). Bounded.
    const { gradeLedgerOn } = await import('../../../services/gradeLedger');
    const lmsCheck = gradeLedgerOn()
      ? await (await import('../core/lmsResults')).checkLmsResults(resourceLinkId ? { resourceLinkId, institutionId: p.institutionId } : { platformId: p.id, institutionId: p.institutionId }, { limit: 100, budgetMs: 15_000 })
      : undefined;
    const out = await resyncGrades({ platformId: p.id, institutionId: p.institutionId, resourceLinkId }, req.user!.id);
    drainSoon(p.id);
    res.json({ links: out.links, students: out.students, outcomes: out.outcomes, queued: out.jobIds.length, ...(lmsCheck ? { lmsCheck } : {}) });
  }),
);

gradesRouter.post(
  '/platforms/:id/grades/retry-dead',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const p = await ownPlatform(req, String(req.params.id));
    const retried = await retryDead({ platformId: p.id, institutionId: p.institutionId }, req.user!.id);
    drainSoon(p.id);
    res.json({ retried });
  }),
);

lmsAdminRouter.use(gradesRouter);

// Phase 1b: the Problems view (failures and warnings by reference code; admins).
lmsAdminRouter.use(problemsRouter);


// ---------------------------------------------------------------- admin

lmsAdminRouter.use(authMiddleware, requireAdmin);

lmsAdminRouter.get(
  '/status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json({
      enabled: true,
      requireApproval: !isEnara(req) && lmsSettings().schoolConnectionsRequireApproval,
      tool: toolUrls(),
      presets: listPresets().map((p) => ({ id: p.id, label: p.label, registration: p.registration })),
    });
  }),
);

lmsAdminRouter.get(
  '/platforms',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
    const filter = isEnara(req) ? (requested ? { institutionId: requested } : {}) : { institutionId: req.user!.institutionId ?? '__none__' };
    const platforms = await LmsPlatform.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const deployments = platforms.length ? await LmsDeployment.find({ platformId: { $in: platforms.map((p) => p.id) } }).lean() : [];
    res.json({ platforms: platforms.map((p) => platformView(p, deployments)) });
  }),
);

lmsAdminRouter.post(
  '/platforms',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);
    const enara = isEnara(req);
    let institutionId: string;
    if (enara) {
      const requested = getOptionalId(body, 'institutionId');
      if (!requested) throw new AppError('institutionId is required', 400, 'VALIDATION_ERROR');
      institutionId = requested;
    } else {
      if (!req.user!.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
      const requested = getOptionalId(body, 'institutionId');
      if (requested && requested !== req.user!.institutionId) throw new AppError('Cannot write outside your institution', 403, 'TENANT_SCOPE_VIOLATION');
      institutionId = req.user!.institutionId;
    }
    if (!(await Institution.exists({ id: institutionId }))) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');

    const vendor = body.vendor === undefined ? 'generic' : body.vendor;
    if (!isKnownVendor(vendor)) throw new AppError('Unknown LMS type', 400, 'VALIDATION_ERROR');
    const issuer = url(body, 'issuer', true)!;
    const clientId = text(body, 'clientId', 200);
    const authLoginUrl = url(body, 'authLoginUrl', true);
    const keysetUrl = url(body, 'keysetUrl', true);
    const authTokenUrl = url(body, 'authTokenUrl', false);
    const deployments = deploymentIds(body);

    const status = enara || !lmsSettings().schoolConnectionsRequireApproval ? 'active' : 'pending';
    let platform: ILmsPlatform;
    try {
      const created = await LmsPlatform.create({
        institutionId,
        provider: 'lti13',
        vendor,
        issuer,
        clientId,
        authLoginUrl,
        authTokenUrl,
        keysetUrl,
        status,
        registeredVia: 'manual',
        createdBy: req.user!.id,
        ...(status === 'active' ? { approvedBy: req.user!.id, approvedAt: new Date() } : {}),
      });
      platform = created.toObject();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new AppError('This LMS (issuer and client ID) is already connected', 409, 'LMS_PLATFORM_EXISTS');
      throw error;
    }
    await LmsDeployment.insertMany(
      deployments.map((deploymentId) => ({ platformId: platform.id, deploymentId, institutionId, status, createdBy: req.user!.id, ...(status === 'active' ? { approvedBy: req.user!.id } : {}) })),
    );
    await writeLmsAudit({ event: 'platform.registered', outcome: 'ok', institutionId, platformId: platform.id, actor: req.user!.id, refIds: { vendor, via: 'manual', status, deployments: deployments.length } });
    res.status(201).json({ platform: await viewOne(platform) });
  }),
);

lmsAdminRouter.post(
  '/platforms/:id/approve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can approve an LMS connection', 403, 'FORBIDDEN');
    // Also switches a disabled connection back on.
    const p = await ownPlatform(req, String(req.params.id));
    await LmsPlatform.updateOne({ id: p.id }, { $set: { status: 'active', approvedBy: req.user!.id, approvedAt: new Date() } });
    await LmsDeployment.updateMany({ platformId: p.id, status: 'pending' }, { $set: { status: 'active', approvedBy: req.user!.id } });
    await writeLmsAudit({ event: 'platform.approved', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor: req.user!.id });
    res.json({ platform: await viewOne((await LmsPlatform.findOne({ id: p.id }).lean())!) });
  }),
);

lmsAdminRouter.post(
  '/platforms/:id/disable',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const p = await ownPlatform(req, String(req.params.id));
    await LmsPlatform.updateOne({ id: p.id }, { $set: { status: 'disabled' } });
    await writeLmsAudit({ event: 'platform.disabled', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor: req.user!.id });
    res.json({ platform: await viewOne((await LmsPlatform.findOne({ id: p.id }).lean())!) });
  }),
);

lmsAdminRouter.post(
  '/platforms/:id/deployments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const p = await ownPlatform(req, String(req.params.id));
    if (p.status === 'disabled') throw new AppError('This connection is switched off', 409, 'LMS_PLATFORM_DISABLED');
    const body = ensurePlainObject(req.body);
    const deploymentId = text(body, 'deploymentId', 200);
    // A school admin's new deployment waits for approval like a new connection.
    const trusted = isEnara(req) || !lmsSettings().schoolConnectionsRequireApproval;
    const status = trusted && p.status === 'active' ? 'active' : 'pending';
    try {
      await LmsDeployment.create({ platformId: p.id, deploymentId, institutionId: p.institutionId, status, createdBy: req.user!.id, ...(status === 'active' ? { approvedBy: req.user!.id } : {}) });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new AppError('This deployment ID is already registered', 409, 'LMS_DEPLOYMENT_EXISTS');
      throw error;
    }
    await writeLmsAudit({ event: 'deployment.registered', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor: req.user!.id, refIds: { status } });
    res.status(201).json({ platform: await viewOne(p) });
  }),
);

lmsAdminRouter.post(
  '/deployments/:id/approve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can approve a deployment', 403, 'FORBIDDEN');
    const d = await LmsDeployment.findOne({ id: String(req.params.id) }).lean();
    if (!d) throw new AppError('Deployment not found', 404, 'LMS_DEPLOYMENT_NOT_FOUND');
    await LmsDeployment.updateOne({ id: d.id }, { $set: { status: 'active', approvedBy: req.user!.id } });
    await writeLmsAudit({ event: 'deployment.approved', outcome: 'ok', institutionId: d.institutionId, platformId: d.platformId, actor: req.user!.id, refIds: { deploymentId: d.id } });
    const p = (await LmsPlatform.findOne({ id: d.platformId }).lean())!;
    res.json({ platform: await viewOne(p) });
  }),
);

// ------------------------------------------- registration links (Phase 1b)
//
// "Connect Moodle (one URL)". POST makes a link for ONE school and returns its
// URL once (only the code's SHA-256 is stored); it works once and expires
// after 7 days (R2). An ENARA admin's link (any school, institutionId
// required) makes an active connection; a school admin's link (own school
// only) a pending one, while LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL is on (R1).

async function linkSchool(req: AuthRequest, body: Record<string, unknown>): Promise<string> {
  if (isEnara(req)) {
    const requested = getOptionalId(body, 'institutionId');
    if (!requested) throw new AppError('institutionId is required', 400, 'VALIDATION_ERROR');
    return requested;
  }
  if (!req.user!.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  const requested = getOptionalId(body, 'institutionId');
  if (requested && requested !== req.user!.institutionId) throw new AppError('Cannot write outside your institution', 403, 'TENANT_SCOPE_VIOLATION');
  return req.user!.institutionId;
}

lmsAdminRouter.post(
  '/registration-links',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = ensurePlainObject(req.body ?? {});
    rejectMongoOperators(body);
    const institutionId = await linkSchool(req, body);
    if (!(await Institution.exists({ id: institutionId }))) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');
    const createdByRole = isEnara(req) ? 'enara-admin' : 'admin';
    const { code, row } = await createRegistrationCode({ institutionId, createdBy: req.user!.id, createdByRole });
    const willBe = createdByRole === 'enara-admin' || !lmsSettings().schoolConnectionsRequireApproval ? 'active' : 'pending';
    await writeLmsAudit({ event: 'registration.link_created', outcome: 'ok', institutionId, actor: req.user!.id, refIds: { registrationId: row.id, createdByRole, willBe } });
    res.status(201).json({
      link: registrationCodeView(row),
      // Shown once: never stored or listed again.
      url: registrationUrl(lmsSettings().toolBaseUrl!, code),
      expiresInDays: Math.round(REGISTRATION_CODE_TTL_MS / 86_400_000),
      connectionWillBe: willBe,
    });
  }),
);

lmsAdminRouter.get(
  '/registration-links',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const requested = typeof req.query.institutionId === 'string' && req.query.institutionId ? req.query.institutionId.slice(0, 200) : undefined;
    const filter = isEnara(req) ? (requested ? { institutionId: requested } : {}) : { institutionId: req.user!.institutionId ?? '__none__' };
    const rows = await LmsRegistrationCode.find(filter).select('-codeHash -reservationId').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ links: rows.map(registrationCodeView) });
  }),
);

lmsAdminRouter.post(
  '/registration-links/:id/revoke',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id).slice(0, 200);
    const scope = isEnara(req) ? { id } : { id, institutionId: req.user!.institutionId ?? '__none__' };
    const existing = await LmsRegistrationCode.findOne(scope).select('-codeHash -reservationId').lean();
    if (!existing) throw new AppError('Link not found', 404, 'LMS_REGISTRATION_LINK_NOT_FOUND');
    const revoked = await revokeRegistrationCode(scope, req.user!.id);
    if (!revoked) throw new AppError('This link was already used or cancelled', 409, 'LMS_REGISTRATION_LINK_NOT_UNUSED');
    await writeLmsAudit({ event: 'registration.link_revoked', outcome: 'ok', institutionId: revoked.institutionId, actor: req.user!.id, refIds: { registrationId: revoked.id } });
    res.json({ link: registrationCodeView(revoked) });
  }),
);

// ---------------------------------------------------------------- seats

lmsAdminRouter.get(
  '/seats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (isEnara(req)) {
      const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
      if (requested) return void res.json({ seats: await seatView(requested) });
      // ENARA admins: every school flagged for billing or over its limit.
      const flagged = await LmsOrgSettings.find({ $or: [{ overLimit: true }, { billingFlaggedAt: { $exists: true } }] }).limit(200).lean();
      return void res.json({ flagged: await Promise.all(flagged.map((f) => seatView(f.institutionId))) });
    }
    if (!req.user!.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
    res.json({ seats: await seatView(req.user!.institutionId) });
  }),
);

lmsAdminRouter.put(
  '/seats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can change seat limits', 403, 'FORBIDDEN');
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);
    const institutionId = getOptionalId(body, 'institutionId');
    if (!institutionId) throw new AppError('institutionId is required', 400, 'VALIDATION_ERROR');
    if (!(await Institution.exists({ id: institutionId }))) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');
    let seatLimit: number | null | undefined;
    if (body.seatLimit === null) seatLimit = null;
    else if (body.seatLimit !== undefined) {
      if (typeof body.seatLimit !== 'number' || !Number.isInteger(body.seatLimit) || body.seatLimit < 0 || body.seatLimit > 1_000_000) {
        throw new AppError('seatLimit must be a whole number', 400, 'VALIDATION_ERROR');
      }
      seatLimit = body.seatLimit;
    }
    const hardCap = getOptionalBoolean(body, 'hardCap');
    const clearBillingFlag = getOptionalBoolean(body, 'clearBillingFlag');
    res.json({ seats: await updateSeatSettings(institutionId, { seatLimit, hardCap, clearBillingFlag }, req.user!.id) });
  }),
);

// ---------------------------------------------------- suppression list
//
// Priority 0 (PDPL). ENARA admins only: the LMS identities of permanently
// deleted students (counts and IDs per school; never a hash, name or LMS id),
// and "lift" (the identity may be created again by a sync or a launch).

lmsAdminRouter.get(
  '/suppressions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can see the LMS suppression list', 403, 'FORBIDDEN');
    const institutionId = typeof req.query.institutionId === 'string' && req.query.institutionId ? req.query.institutionId.slice(0, 200) : undefined;
    const platformId = typeof req.query.platformId === 'string' && req.query.platformId ? req.query.platformId.slice(0, 200) : undefined;
    const includeLifted = req.query.includeLifted === 'true' || req.query.includeLifted === '1';
    res.json(await listSuppressions({ institutionId, platformId, includeLifted }));
  }),
);

lmsAdminRouter.post(
  '/suppressions/:id/lift',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can lift an LMS suppression', 403, 'FORBIDDEN');
    const out = await liftSuppression(String(req.params.id).slice(0, 200), req.user!.id);
    if (!out.ok && out.reason === 'not_found') throw new AppError('Suppression not found', 404, 'LMS_SUPPRESSION_NOT_FOUND');
    if (!out.ok) throw new AppError('This suppression was already lifted', 409, 'LMS_SUPPRESSION_ALREADY_LIFTED');
    res.json({ suppression: out.suppression });
  }),
);
