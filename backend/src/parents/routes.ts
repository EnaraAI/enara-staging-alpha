import bcrypt from 'bcryptjs';
import { Router, Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { User } from '../models/User';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import { getConfig } from '../config/env';
import { ensurePlainObject, getOptionalString, normalizeEmail, rejectMongoOperators, validatePassword } from '../utils/validation';
import { sessionUser, signToken } from '../controllers/auth.controller';
import { recordAudit } from '../services/auditTrail';
import { canDo, tierOf, visibilityNotice } from './policy';
import * as svc from './service';
import { confirmCode, previewCode, setGuardianRole, unlink } from './codes';
import { reportSenders, type WeeklySummary } from './reportSender';
import { parentEmailBlocked, parentEmailBlockedBody, parentEmailState } from './emailBlock';
import { parentEmailsEnabled } from '../email/sendParentTemplate';
import { sendWeeklySummary } from './parentEmails';
import { suggestedEmailFor } from './csvInvites';
import { mockPlan } from './mock';
import { authConfig, googleParentSignIn } from './google';
import { recordSignIn } from '../services/signInHistory';
import { parentCodeSignupEnabled, parentEmailSigninEnabled, parentSettingsEnabled } from './flags';
import { mergeWithTicket, startEmailVerification, startSignIn, verifyEmail, verifySignIn } from './emailSignin';
import { createDeviceSession } from './deviceSession';
import { isCodeOnlyEmail, previewStartCode, startWithCode } from './codeSignup';
import { revokeDeviceSession, useDeviceSession } from './deviceSession';
import { recordParentLogin, recordUsage, type Feature, type Screen } from './usage';

// /api/parents/* — the Parents Portal API. Every learner endpoint goes through
// svc.requireLearner (active link + role check, policy.ts). Real-time: each
// request computes from live data.

const router = Router();
const h = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncHandler(fn as never);
const uid = (req: AuthRequest) => req.user!.id;

// ---------------------------------------------------------------------------
// Public: parent sign-up. Always creates role 'parent' (never anything else,
// whatever the body says); no school scope. A parent sees nothing until a
// school-issued code links a learner.
router.post('/register', h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  if (body.role !== undefined && body.role !== 'parent') throw new AppError('Parent sign-up creates parent accounts only', 403, 'PUBLIC_ROLE_NOT_ALLOWED');
  if (body.institutionId !== undefined || body.schoolId !== undefined || body.studentId !== undefined || body.permissions !== undefined) {
    throw new AppError('Parent sign-up cannot assign scope', 403, 'PUBLIC_INSTITUTION_SCOPE_NOT_ALLOWED');
  }
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const name = getOptionalString(body, 'name', { max: 120 }) || email.split('@')[0];
  if (await User.exists({ email })) throw new AppError('User already exists', 409, 'CONFLICT');
  const user = await User.create({ email, password: await bcrypt.hash(password, getConfig().bcryptRounds), role: 'parent', name });
  await ParentProfile.create({ userId: String(user._id), language: body.language === 'ar' ? 'ar' : 'en' });
  await recordAudit('parent_registered', { id: String(user._id), role: 'parent' }, { type: 'user', id: String(user._id) });
  res.status(201).json({ token: signToken(user), user: await sessionUser(user) });
}));

// Public: which sign-in methods the parents screens offer. The Google client
// ID is public by design (the browser needs it to render the button).
router.get('/auth-config', h(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...authConfig(), ...(parentCodeSignupEnabled() ? { codeSignup: true } : {}), ...(parentEmailSigninEnabled() ? { emailSignin: true } : {}) });
}));

// ---------------------------------------------------------------------------
// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED; 404 when off): passwordless sign-in
// with a 6-digit code by email. Public, per-IP limited in app.ts; the answer to
// "start" never says whether an account exists. Codes only in request bodies.
const emailSigninOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (parentEmailSigninEnabled() ? next() : next(new AppError('Route not found', 404, 'NOT_FOUND')));
router.post('/email/sign-in/start', emailSigninOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  res.json(await startSignIn(body.email, { language: body.language }));
}));
// Body { email, code }: signs in and remembers this device.
router.post('/email/sign-in/verify', emailSigninOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const user = await verifySignIn(body.email, body.code);
  await recordSignIn(req, 'success', { userId: String(user._id), role: 'parent' });
  const device = await createDeviceSession(user);
  res.json({ token: signToken(user), user: await sessionUser(user), deviceToken: device.deviceToken });
}));

// ---------------------------------------------------------------------------
// Parents P1 (PARENT_CODE_SIGNUP_ENABLED; 404 when off): code-first entry.
// Public, per-IP limited in app.ts. The code is only ever in the request body.
const codeSignupOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (parentCodeSignupEnabled() ? next() : next(new AppError('Route not found', 404, 'NOT_FOUND')));

router.post('/start/preview', codeSignupOnly, h(async (req, res) => {
  res.json(await previewStartCode(ensurePlainObject(req.body).code));
}));
// Body { code, language? }: a code-only parent account, linked, with this device remembered.
router.post('/start', codeSignupOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { user, link, device } = await startWithCode(body.code, { language: body.language });
  await recordSignIn(req, 'success', { userId: String(user._id), role: 'parent' });
  res.status(201).json({ token: signToken(user), user: await sessionUser(user), deviceToken: device.deviceToken, link });
}));
// Body { deviceToken }: a fresh session token for a remembered device.
router.post('/device/session', codeSignupOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  const user = await useDeviceSession(body.deviceToken);
  await recordParentLogin(String(user._id), new Date(), 'device');
  res.json({ token: signToken(user), user: await sessionUser(user) });
}));

// Public: "Continue with Google". Body { credential: <Google ID token>, language? }.
// Verified server-side; creates or signs in a role 'parent' account only.
router.post('/google', h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { user, created } = await googleParentSignIn(body.credential, { language: body.language });
  await recordSignIn(req, 'success', { email: user.email, userId: String(user._id), role: user.role });
  res.status(created ? 201 : 200).json({ token: signToken(user), user: await sessionUser(user), created });
}));

// ---------------------------------------------------------------------------
// Learner side (role student): "What your parent can see".
router.get('/learner/visibility', authMiddleware, requireRole('student'), h(async (req, res) => {
  const studentId = req.user!.studentId;
  if (!studentId) throw new AppError('Student access required', 403, 'STUDENT_REQUIRED');
  const student = await Student.findOne({ id: studentId }).select('+learnerAgeBand +birthDate id').lean();
  const links = await ParentLearnerLink.find({ studentId, status: 'active' }).lean();
  const users = await User.find({ _id: { $in: links.map((l) => l.parentUserId) } }).select('name').lean();
  const parents = links.map((l) => ({ name: users.find((u) => String(u._id) === l.parentUserId)?.name ?? 'Your parent', role: l.role }));
  const notice = visibilityNotice(tierOf(student ?? {}).tier, parents);
  const unread = links.filter((l) => l.learnerNotifiedAt && !l.learnerNoticeReadAt).map((l) => ({ linkId: l.id, linkedAt: l.learnerNotifiedAt }));
  res.json({ ...notice, notices: unread });
}));
router.post('/learner/visibility/read', authMiddleware, requireRole('student'), h(async (req, res) => {
  await ParentLearnerLink.updateMany({ studentId: req.user!.studentId, learnerNotifiedAt: { $exists: true }, learnerNoticeReadAt: { $exists: false } }, { $set: { learnerNoticeReadAt: new Date() } });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Parent-only from here.
router.use(authMiddleware, requireRole('parent'));

router.post('/link/preview', h(async (req, res) => {
  res.json(await previewCode(uid(req), ensurePlainObject(req.body).code));
}));
router.post('/link/confirm', h(async (req, res) => {
  const r = await confirmCode({ id: uid(req), role: 'parent', email: req.user!.email }, ensurePlainObject(req.body).code);
  const link = await ParentLearnerLink.findOne({ id: r.linkId }).select('institutionId').lean();
  await recordUsage({ parentUserId: uid(req), institutionId: link?.institutionId, studentId: r.studentId, kind: 'feature', name: 'link_child' });
  res.status(201).json(r);
}));
// Parents P2: "Add your email" (6-digit code), and the merge it may offer.
router.post('/email/start', emailSigninOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  res.json(await startEmailVerification({ id: uid(req) }, body.email));
}));
router.post('/email/verify', emailSigninOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  res.json(await verifyEmail({ id: uid(req) }, body.email, body.code));
}));
// Body { ticket } from a verify that offered a merge: this account moves into the one with the email.
// Answers with a session (and a remembered device) for the merged account.
router.post('/email/merge', emailSigninOnly, h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { user, linksMoved, linksDropped } = await mergeWithTicket({ id: uid(req) }, body.ticket);
  const device = await createDeviceSession(user);
  res.json({ token: signToken(user), user: await sessionUser(user), deviceToken: device.deviceToken, linksMoved, linksDropped });
}));
// Sign out on this device (body { deviceToken }); the app then signs out the account too.
router.post('/device/sign-out', h(async (req, res) => {
  const revoked = await revokeDeviceSession(uid(req), ensurePlainObject(req.body ?? {}).deviceToken);
  res.json({ ok: true, revoked });
}));
router.delete('/links/:linkId', h(async (req, res) => {
  await unlink({ id: uid(req), role: 'parent' }, String(req.params.linkId));
  res.json({ ok: true });
}));

router.get('/learners', h(async (req, res) => { res.json(await svc.listLearners(uid(req))); }));

const learner = (action: Parameters<typeof svc.requireLearner>[2] = 'read') => (req: AuthRequest) => svc.requireLearner(uid(req), String(req.params.studentId), action);
// Parents P1 usage events (IDs and dates only; nothing unless PARENT_SETTINGS_ENABLED).
const track = (req: AuthRequest, ctx: svc.LearnerContext, kind: 'screen' | 'feature', name: Screen | Feature) =>
  recordUsage({ parentUserId: uid(req), institutionId: ctx.link.institutionId, studentId: ctx.student.id, kind, name });
const screen = (name: Screen) => async (req: AuthRequest) => {
  const ctx = await learner()(req);
  await track(req, ctx, 'screen', name);
  return ctx;
};

router.get('/learners/:studentId/status', h(async (req, res) => {
  const ctx = await learner()(req);
  res.json({ generatedAt: new Date().toISOString(), status: await svc.weeklyStatus(ctx) });
}));
router.get('/learners/:studentId/home', h(async (req, res) => { res.json(await svc.home(await screen('home')(req))); }));
// ?classId= filters by class; only for a child in several classes (multi-class step 6, Q3).
router.get('/learners/:studentId/progress', h(async (req, res) => { res.json(await svc.progress(await screen('progress')(req), req.query.classId)); }));
router.get('/learners/:studentId/activity', h(async (req, res) => { res.json(await svc.activity(await screen('activity')(req), new Date(), req.query.classId)); }));
router.get('/learners/:studentId/sessions/:sessionId/transcript', h(async (req, res) => {
  const ctx = await learner()(req);
  try {
    res.json(await svc.transcript(ctx, String(req.params.sessionId)));
  } catch (e) {
    const err = e as AppError & { summary?: unknown };
    if (err.code !== 'TRANSCRIPT_EXPIRED') throw e;
    res.status(410).json({ error: { code: err.code, message: err.message, requestId: req.requestId }, message: err.message, summary: err.summary });
  }
}));
router.get('/learners/:studentId/alerts', h(async (req, res) => { res.json(await svc.alerts(await learner()(req))); }));
router.get('/learners/:studentId/report', h(async (req, res) => { res.json({ ...(await svc.weeklyReport(await screen('report')(req))), shareEmail: parentEmailState() }); }));
router.post('/learners/:studentId/report/share', h(async (req, res) => {
  const ctx = await learner('share_report')(req);
  const body = ensurePlainObject(req.body);
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : body.channel === 'email' ? 'email' : null;
  if (!channel) throw new AppError('channel must be email or whatsapp', 400, 'VALIDATION_ERROR');
  // lms-test: "Share this week -> Email" is blocked (emailBlock.ts); WhatsApp (a stub) is not.
  if (channel === 'email' && parentEmailBlocked()) {
    res.status(409).json(parentEmailBlockedBody(req.requestId));
    return;
  }
  if (channel === 'email' && parentEmailsEnabled()) {
    // Parents P4: the approved parent-weekly-summary with this child's section, to the
    // parent's own address, through the email safety path. A double tap within a minute sends once.
    const { cairoDay, weekStartDay } = await import('./time');
    const now = new Date();
    const r = await sendWeeklySummary(uid(req), { key: `share:${ctx.link.id}:${Math.floor(now.getTime() / 60_000)}`, at: now, weekStart: weekStartDay(now), weekEnd: cairoDay(now), only: ctx.student.id, ignorePrefs: true });
    await track(req, ctx, 'feature', 'share_report');
    const ok = r.status === 'sent' || r.status === 'captured' || r.status === 'duplicate';
    res.status(ok ? 200 : r.status === 'no_recipient' ? 409 : 502).json(ok ? { ok: true, channel: 'email' } : { ok: false, channel: 'email', code: r.status === 'no_recipient' ? 'NO_PARENT_EMAIL' : r.code ?? r.status });
    return;
  }
  const r = (await svc.weeklyReport(ctx)).report;
  const parent = await User.findById(uid(req)).select('name email').lean();
  const summary: WeeklySummary = {
    parentName: parent?.name || 'there',
    childName: ctx.firstName,
    lessonsDone: r.lessonsDone,
    outcomesMastered: r.outcomesMastered,
    minutesDone: r.minutesDone,
    goalMinutes: r.goalMinutes,
    practiceTip: r.tryAtHome.text.en,
    statusLine: r.status === 'on_track' ? 'on track' : r.status === 'needs_nudge' ? 'needs a nudge' : 'check this',
  };
  const to = channel === 'email' ? String(parent?.email ?? '') : String(body.to ?? '');
  const result = await reportSenders[channel].send(to, summary);
  await track(req, ctx, 'feature', 'share_report');
  res.status(result.ok ? 200 : 502).json(result);
}));
router.get('/learners/:studentId/controls', h(async (req, res) => { res.json(svc.controlsOf(await screen('controls')(req))); }));
router.put('/learners/:studentId/controls', h(async (req, res) => {
  const ctx = await learner('change_controls')(req);
  const out = await svc.updateControls(ctx, ensurePlainObject(req.body));
  await track(req, ctx, 'feature', 'controls_changed');
  res.json(out);
}));
router.put('/learners/:studentId/guardians/:linkId', h(async (req, res) => {
  await setGuardianRole({ id: uid(req), role: 'parent' }, String(req.params.studentId), String(req.params.linkId), ensurePlainObject(req.body).role);
  await track(req, await learner()(req), 'feature', 'guardian_role');
  res.json({ ok: true });
}));

// Account: learners, guardians, plan placeholder, preferences.
router.get('/account', h(async (req, res) => {
  const learners = await svc.listLearners(uid(req));
  // Only children who passed the read-time check (listLearners): an archived,
  // deleted or departed child's other guardians are not shown either.
  const visible = learners.learners.map((l) => l.studentId);
  const myLinks = await ParentLearnerLink.find({ parentUserId: uid(req), status: 'active', studentId: { $in: visible } }).lean();
  const all = await ParentLearnerLink.find({ studentId: { $in: myLinks.map((l) => l.studentId) }, status: 'active' }).lean();
  const users = await User.find({ _id: { $in: [...new Set(all.map((l) => l.parentUserId))] } }).select('name').lean();
  const guardians = myLinks.map((mine) => ({
    studentId: mine.studentId,
    canManage: canDo(mine, 'manage_guardians'),
    items: all.filter((l) => l.studentId === mine.studentId).map((l) => ({ linkId: l.id, name: users.find((u) => String(u._id) === l.parentUserId)?.name ?? 'Parent', role: l.role, isYou: l.parentUserId === uid(req) })),
  }));
  const profile = await ParentProfile.findOne({ userId: uid(req) }).lean();
  // Parents P1: one 'account' screen event per school of the visible children.
  for (const sid of [...new Set(myLinks.map((l) => l.institutionId).filter(Boolean))]) await recordUsage({ parentUserId: uid(req), institutionId: sid, kind: 'screen', name: 'account' });
  // Parents P1 (PARENT_SETTINGS_ENABLED): no mock plan or price. ENARA Parents is
  // provided free by the school (D1, D2): "Provided by <school>" per school.
  const providedBy = [...new Set(learners.learners.map((l) => l.school).filter((x): x is string => !!x))];
  const plan = parentSettingsEnabled() ? { mock: false as const, kind: 'school' as const, providedBy } : { mock: true as const, ...mockPlan(learners.learners.length) };
  // Parents P1 (code-first): how this account signs in. A code-only account has no email yet.
  const codeOnly = isCodeOnlyEmail(req.user!.email);
  res.json({
    generatedAt: new Date().toISOString(),
    learners: learners.learners,
    pending: learners.pending,
    ended: learners.ended,
    guardians: { mock: false, byLearner: guardians },
    plan,
    signIn: {
      method: codeOnly ? 'code' : profile?.signIn ?? 'password', hasEmail: !codeOnly,
      // Parents P2: the account's own address and whether it was proven; whether email sign-in is on.
      ...(parentEmailSigninEnabled() ? { emailSignin: true, ...(codeOnly ? {} : { email: req.user!.email, emailVerified: !!profile?.emailVerifiedAt }) } : {}),
      // Parents P5: the address a school invited this parent at, offered when they add an email (never a binding).
      ...(codeOnly && parentEmailSigninEnabled() ? await (async () => { const e = await suggestedEmailFor(uid(req)); return e ? { suggestedEmail: e } : {}; })() : {}),
    },
    ...(learners.hiddenBySchool ? { hiddenBySchool: learners.hiddenBySchool } : {}),
    preferences: {
      mock: false, language: profile?.language ?? 'en', alertChannels: profile?.alertChannels ?? ['push', 'whatsapp'], summary: parentEmailsEnabled() ? 'weekly' : 'on_demand',
      // Parents P4: the parent's own on/off for the weekly summary and new results emails (the school's switches apply first).
      ...(parentEmailsEnabled() ? { emails: { weeklySummary: profile?.emailPrefs?.weeklySummary !== false, newResults: profile?.emailPrefs?.newResults !== false } } : {}),
    },
  });
}));
router.put('/account/preferences', h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  const set: Record<string, unknown> = {};
  if (body.language === 'en' || body.language === 'ar') set.language = body.language;
  if (Array.isArray(body.alertChannels)) set.alertChannels = body.alertChannels.filter((c) => c === 'push' || c === 'whatsapp' || c === 'email');
  if (typeof body.weeklySummaryEmail === 'boolean') set['emailPrefs.weeklySummary'] = body.weeklySummaryEmail;
  if (typeof body.newResultsEmail === 'boolean') set['emailPrefs.newResults'] = body.newResultsEmail;
  await ParentProfile.updateOne({ userId: uid(req) }, { $set: set, $setOnInsert: { userId: uid(req) } }, { upsert: true });
  res.json({ ok: true, ...set });
}));

export default router;
