import { Router, type Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { AppError, asyncHandler } from '../../../middleware/errorHandler';
import { DEFAULT_SCHOOL_TIME_ZONE, isValidTimeZone } from '../../../services/institutionTimeZone';
import { ensurePlainObject, getOptionalId, getOptionalString, getRequiredString, normalizeEmail, rejectMongoOperators } from '../../../utils/validation';
import { CHECK_MIN_INTERVAL_MS, runConnectionCheck } from '../core/connectionCheck';
import {
  createSchool,
  defaultEmailLanguage,
  FEATURE_PRESETS,
  listOnboardings,
  markInviteSent,
  newOnboardingLink,
  schoolStatus,
  sendInviteEmail,
  setManualSetting,
  type FeaturePreset,
  type Lang,
} from '../core/onboarding';
import { LmsConnectionCheck, LmsPlatform, MANUAL_SETTINGS, type ManualSettingKey } from '../models';

// Step 2, self-serve school onboarding (/api/lms/onboarding/*). Mounted on the
// LMS admin router after authMiddleware + requireAdmin, so it is the app's
// normal 404 while LMS_LTI_ENABLED is off, 401 signed out, and 403 for
// teachers, academic managers and students (S5: teachers never see it).
//   ENARA admins only:  POST /onboarding/schools   "New school"
//                       POST /onboarding/:id/send-email   lms-invite-connect (only when LMS emails are on)
//   ENARA admins (any school) and school admins (own school; another school: 404):
//                       GET  /onboarding                  onboarded schools (school admin: own)
//                       GET  /onboarding/:id/status       the school connection status page
//                       POST /onboarding/:id/new-link     a new Moodle link; the old unused one is cancelled
//                       POST /onboarding/:id/invite-sent  the invite text was copied (starts the timer)
//                       POST /onboarding/:id/check        "Check again"
//                       PUT  /onboarding/:id/manual-settings   tick / untick a hand setting (who and when are recorded)

export const onboardingRouter = Router();

const isEnara = (req: AuthRequest) => req.user?.role === 'enara-admin';

/** The school the request acts on: any for ENARA admins; a school admin's own only (else 404, nothing revealed). */
function schoolParam(req: AuthRequest): string {
  const id = String(req.params.institutionId ?? '').slice(0, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');
  if (isEnara(req)) return id;
  if (req.user!.role !== 'admin' || req.user!.institutionId !== id) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');
  return id;
}

const COUNTRY = /^[A-Z]{2}$/;

onboardingRouter.post(
  '/onboarding/schools',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can create a school', 403, 'FORBIDDEN');
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);
    const name = getRequiredString(body, 'name', { max: 160 });
    const country = getRequiredString(body, 'country', { max: 2 }).toUpperCase();
    if (!COUNTRY.test(country)) throw new AppError('country must be a 2-letter country code (e.g. EG)', 400, 'VALIDATION_ERROR');
    const timeZone = getOptionalString(body, 'timeZone', { max: 60 }) ?? DEFAULT_SCHOOL_TIME_ZONE;
    if (!isValidTimeZone(timeZone)) throw new AppError('timeZone must be an IANA time zone (e.g. Africa/Cairo)', 400, 'VALIDATION_ERROR');
    const rawLang = body.emailLanguage;
    if (rawLang !== undefined && rawLang !== null && rawLang !== '' && rawLang !== 'ar' && rawLang !== 'en') throw new AppError("emailLanguage must be 'ar' or 'en'", 400, 'VALIDATION_ERROR');
    const emailLanguage: Lang = rawLang === 'ar' || rawLang === 'en' ? rawLang : defaultEmailLanguage(country);
    let seatLimit: number | undefined;
    if (body.seatLimit !== undefined && body.seatLimit !== null && body.seatLimit !== '') {
      if (typeof body.seatLimit !== 'number' || !Number.isInteger(body.seatLimit) || body.seatLimit < 0 || body.seatLimit > 1_000_000) throw new AppError('seatLimit must be a whole number', 400, 'VALIDATION_ERROR');
      seatLimit = body.seatLimit;
    }
    const schoolAdminName = getRequiredString(body, 'schoolAdminName', { max: 120 });
    const schoolAdminEmail = normalizeEmail(body.schoolAdminEmail);
    const moodleAdminEmail = body.moodleAdminEmail === undefined || body.moodleAdminEmail === null || body.moodleAdminEmail === '' ? undefined : normalizeEmail(body.moodleAdminEmail);
    const preset = body.features === undefined || body.features === null || body.features === '' ? 'all' : body.features;
    if (!(FEATURE_PRESETS as readonly unknown[]).includes(preset)) throw new AppError("features must be 'all' or 'none'", 400, 'VALIDATION_ERROR');
    const out = await createSchool(
      { name, country, timeZone, emailLanguage, seatLimit, schoolAdminName, schoolAdminEmail, moodleAdminEmail, featurePreset: preset as FeaturePreset },
      { id: req.user!.id },
    );
    res.status(201).json(out);
  }),
);

onboardingRouter.get(
  '/onboarding',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (isEnara(req)) {
      const requested = typeof req.query.institutionId === 'string' && req.query.institutionId ? req.query.institutionId.slice(0, 128) : undefined;
      return void res.json({ onboardings: await listOnboardings({ institutionId: requested }) });
    }
    if (!req.user!.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
    res.json({ onboardings: await listOnboardings({ institutionId: req.user!.institutionId }) });
  }),
);

onboardingRouter.get(
  '/onboarding/:institutionId/status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await schoolStatus(schoolParam(req)));
  }),
);

onboardingRouter.post(
  '/onboarding/:institutionId/new-link',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const institutionId = schoolParam(req);
    res.status(201).json(await newOnboardingLink(institutionId, { id: req.user!.id, role: req.user!.role }));
  }),
);

onboardingRouter.post(
  '/onboarding/:institutionId/invite-sent',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const institutionId = schoolParam(req);
    const o = await markInviteSent(institutionId, 'copy', req.user!.id);
    res.json({ inviteSentAt: o.inviteSentAt ?? null, inviteSentVia: o.inviteSentVia ?? null });
  }),
);

onboardingRouter.post(
  '/onboarding/:institutionId/send-email',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isEnara(req)) throw new AppError('Only ENARA admins can send the invite email', 403, 'FORBIDDEN');
    const institutionId = schoolParam(req);
    const o = await sendInviteEmail(institutionId, req.user!.id);
    res.json({ sent: true, inviteSentAt: o.inviteSentAt ?? null });
  }),
);

onboardingRouter.post(
  '/onboarding/:institutionId/check',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const institutionId = schoolParam(req);
    const body = ensurePlainObject(req.body ?? {});
    const platformId = getOptionalId(body, 'platformId');
    const platforms = await LmsPlatform.find({ institutionId, status: { $ne: 'disabled' }, ...(platformId ? { id: platformId } : {}) }).select('id').sort({ createdAt: -1 }).limit(3).lean();
    if (platformId && !platforms.length) throw new AppError('LMS connection not found', 404, 'LMS_PLATFORM_NOT_FOUND');
    const recent = await LmsConnectionCheck.find({ platformId: { $in: platforms.map((p) => p.id) }, checkedAt: { $gt: new Date(Date.now() - CHECK_MIN_INTERVAL_MS) } }).select('platformId').lean();
    let ran = 0;
    for (const p of platforms) {
      if (recent.some((r) => r.platformId === p.id)) continue;
      await runConnectionCheck(p.id, { trigger: 'manual', actor: req.user!.id });
      ran++;
    }
    res.json({ checked: ran, skippedRecent: platforms.length - ran, status: await schoolStatus(institutionId) });
  }),
);

onboardingRouter.put(
  '/onboarding/:institutionId/manual-settings',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const institutionId = schoolParam(req);
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);
    const platformId = getRequiredString(body, 'platformId', { max: 128 });
    const key = body.key;
    if (!(MANUAL_SETTINGS as readonly unknown[]).includes(key)) throw new AppError(`key must be one of: ${MANUAL_SETTINGS.join(', ')}`, 400, 'VALIDATION_ERROR');
    if (typeof body.checked !== 'boolean') throw new AppError('checked must be true or false', 400, 'VALIDATION_ERROR');
    const p = await LmsPlatform.findOne({ id: platformId, institutionId }).select('id institutionId').lean();
    if (!p) throw new AppError('LMS connection not found', 404, 'LMS_PLATFORM_NOT_FOUND');
    res.json({ setting: await setManualSetting(p, key as ManualSettingKey, body.checked, req.user!.id) });
  }),
);
