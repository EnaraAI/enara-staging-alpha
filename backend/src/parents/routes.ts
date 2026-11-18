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
import { mockPlan } from './mock';
import { authConfig, googleParentSignIn } from './google';
import { recordSignIn } from '../services/signInHistory';

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
  res.json(authConfig());
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
  res.status(201).json(await confirmCode({ id: uid(req), role: 'parent', email: req.user!.email }, ensurePlainObject(req.body).code));
}));
router.delete('/links/:linkId', h(async (req, res) => {
  await unlink({ id: uid(req), role: 'parent' }, String(req.params.linkId));
  res.json({ ok: true });
}));

router.get('/learners', h(async (req, res) => { res.json(await svc.listLearners(uid(req))); }));

const learner = (action: Parameters<typeof svc.requireLearner>[2] = 'read') => (req: AuthRequest) => svc.requireLearner(uid(req), String(req.params.studentId), action);

router.get('/learners/:studentId/status', h(async (req, res) => {
  const ctx = await learner()(req);
  res.json({ generatedAt: new Date().toISOString(), status: await svc.weeklyStatus(ctx) });
}));
router.get('/learners/:studentId/home', h(async (req, res) => { res.json(await svc.home(await learner()(req))); }));
// ?classId= filters by class; only for a child in several classes (multi-class step 6, Q3).
router.get('/learners/:studentId/progress', h(async (req, res) => { res.json(await svc.progress(await learner()(req), req.query.classId)); }));
router.get('/learners/:studentId/activity', h(async (req, res) => { res.json(await svc.activity(await learner()(req), new Date(), req.query.classId)); }));
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
router.get('/learners/:studentId/report', h(async (req, res) => { res.json({ ...(await svc.weeklyReport(await learner()(req))), shareEmail: parentEmailState() }); }));
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
  res.status(result.ok ? 200 : 502).json(result);
}));
router.get('/learners/:studentId/controls', h(async (req, res) => { res.json(svc.controlsOf(await learner()(req))); }));
router.put('/learners/:studentId/controls', h(async (req, res) => {
  const ctx = await learner('change_controls')(req);
  res.json(await svc.updateControls(ctx, ensurePlainObject(req.body)));
}));
router.put('/learners/:studentId/guardians/:linkId', h(async (req, res) => {
  await setGuardianRole({ id: uid(req), role: 'parent' }, String(req.params.studentId), String(req.params.linkId), ensurePlainObject(req.body).role);
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
  res.json({
    generatedAt: new Date().toISOString(),
    learners: learners.learners,
    pending: learners.pending,
    ended: learners.ended,
    guardians: { mock: false, byLearner: guardians },
    plan: { mock: true, ...mockPlan(learners.learners.length) },
    preferences: { mock: false, language: profile?.language ?? 'en', alertChannels: profile?.alertChannels ?? ['push', 'whatsapp'], summary: 'on_demand' },
  });
}));
router.put('/account/preferences', h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  const set: Record<string, unknown> = {};
  if (body.language === 'en' || body.language === 'ar') set.language = body.language;
  if (Array.isArray(body.alertChannels)) set.alertChannels = body.alertChannels.filter((c) => c === 'push' || c === 'whatsapp' || c === 'email');
  await ParentProfile.updateOne({ userId: uid(req) }, { $set: set, $setOnInsert: { userId: uid(req) } }, { upsert: true });
  res.json({ ok: true, ...set });
}));

export default router;
