import { getConfig } from '../../../config/env';
import { AppError } from '../../../middleware/errorHandler';
import { Invitation } from '../../../models/AccountToken';
import { Institution } from '../../../models/Institution';
import { User } from '../../../models/User';
import { createInvitation, INVITATION_TTL_MS } from '../../../services/accountTokens';
import { generateInstitutionId } from '../../../services/apiKeyService';
import { ALL_FLAGS } from '../../../services/featureFlags';
import { DEFAULT_SCHOOL_TIME_ZONE, isValidTimeZone } from '../../../services/institutionTimeZone';
import {
  LmsAuditLog,
  LmsConnectionCheck,
  LmsGradeSyncJob,
  LmsOnboarding,
  LmsPlatform,
  LmsRegistrationCode,
  MANUAL_SETTINGS,
  type ILmsOnboarding,
  type ILmsPlatform,
  type ILmsRegistrationCode,
  type ManualSettingKey,
} from '../models';
import { writeLmsAudit } from './audit';
import { checkView, platformHost, type CheckView } from './connectionCheck';
import { checkText } from './connectionCheckText';
import { formatSchoolDateTime } from './dueDate';
import { lmsSettings } from './flags';
import { codeState, createRegistrationCode, linkMakesActive, registrationCodeView, registrationUrl, REGISTRATION_CODE_TTL_MS, revokeRegistrationCode } from './registrationCode';
import { updateSeatSettings } from './seats';
import { firstName, lmsEmailsActive, sendLmsEmail } from './lmsEmail';

// Step 2: self-serve school onboarding (docs/lms/SCHOOL_GUIDE.md).
//   - "New school" (ENARA admins): the school, its school-admin invitation
//     (the existing invitation flow), an onboarding row and a Phase 1b
//     registration link made by the ENARA admin (so the connection is active
//     on registration, R1). The link URL is returned once.
//   - The invite: copyable text in English and Arabic (the school's link, its
//     expiry in the school's time zone, the 5-step guide), "Send email"
//     (lms-invite-connect, only when LMS emails are on; never carries the link
//     code, owner decision D5: the school admin signs in to get the link), and
//     "New link" (cancels the old unused link).
//   - The school connection status page (school admins: own school; ENARA
//     admins: any): the checklist, the hand-ticked Moodle settings, the
//     latest automatic check per connection and the "Elapsed since invite"
//     timer (the 15-minute goal).

export const ONBOARDING_GOAL_MS = 15 * 60_000;
export const FEATURE_PRESETS = ['all', 'none'] as const;
export type FeaturePreset = (typeof FEATURE_PRESETS)[number];
export type Lang = 'en' | 'ar';

export function defaultEmailLanguage(country: string): Lang {
  // Owner decision D1: Arabic by default for Egyptian schools.
  return country === 'EG' ? 'ar' : 'en';
}

/** LMS emails are sent only when LMS_EMAILS_ENABLED, REMINDERS_ENABLED and RESEND_API_KEY (or the E2E capture) are all set, and APP_URL for the link (lmsEmail.ts). */
export function lmsEmailsOn(): boolean {
  return lmsEmailsActive();
}

const appUrl = () => (((getConfig() as { appUrl?: string }).appUrl || '').trim().replace(/\/+$/, ''));

// ------------------------------------------------------------ invite text

export interface InviteTexts {
  en: string;
  ar: string;
}

/** The invite (to copy and send, or read on the status page): school-specific link, expiry, the 5 steps. */
export function inviteTexts(input: { schoolName: string; url: string; expiresAt: Date; timeZone: string }): InviteTexts {
  const { schoolName: school, url } = input;
  const expEn = formatSchoolDateTime(input.expiresAt, input.timeZone, 'en');
  const expAr = formatSchoolDateTime(input.expiresAt, input.timeZone, 'ar');
  const en = [
    `Connect ${school}'s Moodle to ENARA`,
    '',
    `This link is for ${school} only. It works once and expires on ${expEn}.`,
    '',
    url,
    '',
    'For the Moodle site administrator: 5 steps, about 15 minutes.',
    '1. Paste the link in Moodle: Site administration › Plugins › Activity modules › External tool › Manage tools. Paste the link in "Tool URL" and click "Add LTI Advantage". If Moodle says there are existing tools for this address, click "Register as a new external tool" (not "Update"). Wait for "ENARA is registered"; the window closes.',
    '2. Click "Activate" on the new ENARA tool card (it says "Pending" until you do).',
    '3. Set the 4 settings Moodle cannot take from the link. On the ENARA card click the gear icon (Edit):',
    '   a. Activate: done in step 2 (the card no longer says Pending).',
    '   b. Privacy › "Accept grades from the tool": Always.',
    '   c. "Tool configuration usage": "Show in activity chooser and as a preconfigured tool".',
    '   d. "Restrict to category" (Moodle 4.3 or later): your school\'s course category, if this Moodle serves more than one school.',
    '   Click "Save changes". Then tick the 4 settings on ENARA\'s connection status page.',
    '4. Add ENARA to a course: in the course, turn editing on, "Add an activity or resource" › ENARA, click "Select content", pick an item, save.',
    '5. Open it once, as a teacher and as a student. ENARA checks the connection by itself and shows each step on its status page.',
    '',
    'Never enrol parents in Moodle courses that contain ENARA activities.',
    'If the internet cannot reach your Moodle (a Moodle inside the school network), your IT team must allow ENARA to reach the Moodle address by name; ENARA has no fixed IP address.',
  ].join('\n');
  const ar = [
    `اربط Moodle في ${school} بإنارة (ENARA)`,
    '',
    `هذا الرابط خاص بـ${school} فقط. يعمل مرة واحدة وينتهي في ${expAr}.`,
    '',
    url,
    '',
    'إلى مسؤول موقع Moodle: 5 خطوات، نحو 15 دقيقة.',
    '1. الصق الرابط في Moodle: Site administration › Plugins › Activity modules › External tool › Manage tools (إدارة الموقع › الإضافات › وحدات الأنشطة › أداة خارجية › إدارة الأدوات). الصق الرابط في "Tool URL" واضغط "Add LTI Advantage". إذا ذكر Moodle وجود أدوات حالية لهذا العنوان فاضغط "Register as a new external tool" (وليس "Update"). انتظر ظهور "ENARA is registered"، ثم تُغلق النافذة.',
    '2. اضغط "Activate" (تفعيل) على بطاقة أداة ENARA الجديدة (تظهر عليها كلمة "Pending" حتى تفعّلها).',
    '3. اضبط الإعدادات الأربعة التي لا يأخذها Moodle من الرابط. على بطاقة ENARA اضغط رمز الترس (Edit):',
    '   أ. التفعيل: تم في الخطوة 2 (لم تعد البطاقة تُظهر Pending).',
    '   ب. Privacy › "Accept grades from the tool" (قبول الدرجات من الأداة): Always (دائمًا).',
    '   ج. "Tool configuration usage": "Show in activity chooser and as a preconfigured tool" (الظهور في قائمة اختيار الأنشطة).',
    '   د. "Restrict to category" (من Moodle 4.3): فئة مقررات مدرستك، إذا كان Moodle هذا يخدم أكثر من مدرسة.',
    '   اضغط "Save changes" (حفظ التغييرات). ثم ضع علامة على الإعدادات الأربعة في صفحة حالة الربط في ENARA.',
    '4. أضف ENARA إلى مقرر: في المقرر شغّل وضع التحرير، ثم "Add an activity or resource" › ENARA، واضغط "Select content"، واختر عنصرًا، ثم احفظ.',
    '5. افتحه مرة واحدة بصفة معلم ثم بصفة طالب. يتحقق ENARA من الربط بنفسه ويعرض كل خطوة في صفحة الحالة.',
    '',
    'لا تسجّل أولياء الأمور أبدًا في مقررات Moodle التي تحتوي على أنشطة ENARA.',
    'إذا كان Moodle غير متاح من الإنترنت (داخل شبكة المدرسة) فعلى فريق تقنية المعلومات السماح لـ ENARA بالوصول إلى عنوان Moodle بالاسم؛ ليس لـ ENARA عنوان IP ثابت.',
  ].join('\n');
  return { en, ar };
}

// ------------------------------------------------------------ helpers

async function schoolOf(institutionId: string) {
  const school = await Institution.findOne({ id: institutionId }).select('id name timeZone emailLanguage country contactName contactEmail').lean();
  if (!school) throw new AppError('School not found', 404, 'INSTITUTION_NOT_FOUND');
  return school;
}

const tzOf = (s: { timeZone?: string }) => (isValidTimeZone(s.timeZone) ? s.timeZone! : DEFAULT_SCHOOL_TIME_ZONE);

/** The school has an LMS connection already (a later school admin link then follows R1 again). */
async function schoolConnected(institutionId: string) {
  return !!(await LmsPlatform.exists({ institutionId, status: { $ne: 'disabled' } }));
}

// ------------------------------------------------------------ new school

export interface NewSchoolInput {
  name: string;
  country: string;
  timeZone: string;
  emailLanguage: Lang;
  seatLimit?: number;
  schoolAdminName: string;
  schoolAdminEmail: string;
  moodleAdminEmail?: string;
  featurePreset: FeaturePreset;
}

export async function createSchool(input: NewSchoolInput, actor: { id: string }) {
  if (await User.exists({ email: input.schoolAdminEmail })) throw new AppError('A user with this email already exists', 409, 'USER_EXISTS');
  const institutionId = generateInstitutionId();
  // The fake Phase 1 test schools have every school feature flag on
  // (maintenance/lmsTestSeed.ts); "all" gives a new school the same, so it
  // works like Test School A/B. "none" leaves every flag off (ENARA switches
  // features on later).
  const features = input.featurePreset === 'all' ? Object.fromEntries(ALL_FLAGS.map((f) => [f, true])) : undefined;
  await Institution.create({
    id: institutionId,
    name: input.name,
    country: input.country,
    timeZone: input.timeZone,
    emailLanguage: input.emailLanguage,
    contactName: input.schoolAdminName,
    contactEmail: input.schoolAdminEmail,
    lmsSystem: 'moodle',
    createdBy: actor.id,
    ...(features ? { features } : {}),
  });
  let invitation;
  let token: string;
  try {
    // The existing invitation flow. Its email goes only when LMS emails are on
    // (on lms-test the ENARA admin copies the invitation link instead).
    ({ invitation, token } = await createInvitation({ institutionId, email: input.schoolAdminEmail, role: 'admin', invitedBy: actor.id, sendMail: lmsEmailsOn() }));
  } catch (error) {
    await Institution.deleteOne({ id: institutionId });
    throw error;
  }
  const onboarding = (
    await LmsOnboarding.create({
      institutionId,
      createdBy: actor.id,
      schoolAdminInvitationId: invitation.id,
      ...(input.moodleAdminEmail && input.moodleAdminEmail !== input.schoolAdminEmail ? { moodleAdminEmail: input.moodleAdminEmail } : {}),
    })
  ).toObject();
  if (typeof input.seatLimit === 'number') await updateSeatSettings(institutionId, { seatLimit: input.seatLimit }, actor.id);
  const { code, row } = await createRegistrationCode({ institutionId, createdBy: actor.id, createdByRole: 'enara-admin', onboardingId: onboarding.id });
  await LmsOnboarding.updateOne({ id: onboarding.id }, { $set: { registrationLinkId: row.id } });
  await writeLmsAudit({ event: 'registration.link_created', outcome: 'ok', institutionId, actor: actor.id, refIds: { registrationId: row.id, createdByRole: 'enara-admin', willBe: 'active', onboardingId: onboarding.id } });
  await writeLmsAudit({
    event: 'onboarding.school_created',
    outcome: 'ok',
    institutionId,
    actor: actor.id,
    refIds: { onboardingId: onboarding.id, invitationId: invitation.id, registrationId: row.id, lang: input.emailLanguage, country: input.country, featurePreset: input.featurePreset, seatLimitSet: typeof input.seatLimit === 'number', moodleAdminSeparate: !!onboarding.moodleAdminEmail },
  });
  const url = registrationUrl(lmsSettings().toolBaseUrl!, code);
  const base = appUrl();
  return {
    institution: { id: institutionId, name: input.name, country: input.country, timeZone: input.timeZone, emailLanguage: input.emailLanguage, features: input.featurePreset },
    onboarding: { id: onboarding.id },
    invitation: { id: invitation.id, expiresAt: invitation.expiresAt, expiresInDays: Math.round(INVITATION_TTL_MS / 86_400_000) },
    // Shown once (the account invitation; only its hash is stored).
    inviteLink: `${base}/accept-invitation?token=${encodeURIComponent(token)}`,
    registrationLink: registrationCodeView(row),
    // Shown once (the Moodle link; only its hash is stored).
    url,
    connectionWillBe: 'active' as const,
    invite: inviteTexts({ schoolName: input.name, url, expiresAt: row.expiresAt, timeZone: input.timeZone }),
    emailAvailable: lmsEmailsOn(),
  };
}

// ------------------------------------------------------------ new link

export async function newOnboardingLink(institutionId: string, actor: { id: string; role: string }) {
  const school = await schoolOf(institutionId);
  const onboarding = await LmsOnboarding.findOne({ institutionId }).lean();
  if (!onboarding) throw new AppError('This school was not set up with "New school"', 404, 'LMS_ONBOARDING_NOT_FOUND');
  // "New link" cancels the old unused link(s) of this onboarding.
  const open = await LmsRegistrationCode.find({ institutionId, onboardingId: onboarding.id, status: 'unused' }).select('id').lean();
  for (const o of open) {
    const revoked = await revokeRegistrationCode({ id: o.id, institutionId }, actor.id);
    if (revoked) await writeLmsAudit({ event: 'registration.link_revoked', outcome: 'ok', institutionId, actor: actor.id, refIds: { registrationId: o.id, reason: 'new_link', onboardingId: onboarding.id } });
  }
  const enara = actor.role === 'enara-admin';
  // A school admin's link for a school ENARA onboarded is pre-approved while the
  // school has no connection yet; after that, R1 applies again (pending).
  const preApprovedBy = !enara && !(await schoolConnected(institutionId)) ? onboarding.createdBy : undefined;
  const { code, row } = await createRegistrationCode({
    institutionId,
    createdBy: actor.id,
    createdByRole: enara ? 'enara-admin' : 'admin',
    onboardingId: onboarding.id,
    ...(preApprovedBy ? { preApprovedBy } : {}),
  });
  await LmsOnboarding.updateOne({ id: onboarding.id }, { $set: { registrationLinkId: row.id } });
  const willBe = linkMakesActive(row, lmsSettings().schoolConnectionsRequireApproval) ? 'active' : 'pending';
  await writeLmsAudit({ event: 'registration.link_created', outcome: 'ok', institutionId, actor: actor.id, refIds: { registrationId: row.id, createdByRole: row.createdByRole, willBe, onboardingId: onboarding.id, replaced: open.length, preApproved: !!preApprovedBy } });
  const url = registrationUrl(lmsSettings().toolBaseUrl!, code);
  return {
    link: registrationCodeView(row),
    url,
    expiresInDays: Math.round(REGISTRATION_CODE_TTL_MS / 86_400_000),
    connectionWillBe: willBe,
    cancelledLinkIds: open.map((o) => o.id),
    invite: inviteTexts({ schoolName: school.name, url, expiresAt: row.expiresAt, timeZone: tzOf(school) }),
  };
}

// ------------------------------------------------------------ invite sent / email

export async function markInviteSent(institutionId: string, via: 'copy' | 'email', actor: string): Promise<ILmsOnboarding> {
  const now = new Date();
  const first = await LmsOnboarding.findOneAndUpdate(
    { institutionId, inviteSentAt: { $exists: false } },
    { $set: { inviteSentAt: now, inviteSentVia: via, inviteSentBy: actor } },
    { new: true },
  ).lean();
  if (first) {
    await writeLmsAudit({ event: 'onboarding.invite_sent', outcome: 'ok', institutionId, actor, refIds: { onboardingId: first.id, via } });
    return first;
  }
  const existing = await LmsOnboarding.findOne({ institutionId }).lean();
  if (!existing) throw new AppError('This school was not set up with "New school"', 404, 'LMS_ONBOARDING_NOT_FOUND');
  return existing;
}

export async function sendInviteEmail(institutionId: string, actor: string) {
  if (!lmsEmailsOn()) throw new AppError('Emails are off on this site. Copy the invite text instead.', 409, 'LMS_EMAILS_OFF');
  const school = await schoolOf(institutionId);
  const onboarding = await LmsOnboarding.findOne({ institutionId }).lean();
  if (!onboarding) throw new AppError('This school was not set up with "New school"', 404, 'LMS_ONBOARDING_NOT_FOUND');
  const link = onboarding.registrationLinkId ? await LmsRegistrationCode.findOne({ id: onboarding.registrationLinkId }).lean() : null;
  if (!link || codeState(link) !== 'unused') throw new AppError('The current Moodle link was used, cancelled or expired. Make a new link first.', 409, 'LMS_ONBOARDING_NO_LINK');
  if (!school.contactEmail) throw new AppError('The school has no school admin email', 409, 'LMS_ONBOARDING_NO_RECIPIENT');
  const lang: Lang = school.emailLanguage === 'ar' ? 'ar' : 'en';
  // Through the one LMS email service (lmsEmail.ts): the test inbox redirect, the subject
  // prefix and the daily cap apply. Every click is its own email (re-send by hand).
  const result = await sendLmsEmail({
    template: 'lms-invite-connect', key: `invite-connect:${onboarding.id}:${(onboarding.emailCount ?? 0) + 1}:${Date.now()}`, lang, institutionId,
    recipients: [{ ref: `contact:${institutionId}`, email: school.contactEmail, name: school.contactName }],
    vars: (r) => ({
      NAME: firstName(r.name),
      SCHOOL_NAME: school.name,
      EXPIRES_ON: formatSchoolDateTime(link.expiresAt, tzOf(school), lang),
      // D5: no bearer secret in the email; the school admin signs in to get the Moodle link.
      ACTION_URL: `${appUrl()}/?page=lms-status`,
      REFERENCE_CODE: onboarding.id,
    }),
  });
  if (result.held) {
    await writeLmsAudit({ event: 'onboarding.invite_emailed', outcome: 'warn', institutionId, actor, code: 'daily_cap', refIds: { onboardingId: onboarding.id, lang } });
    throw new AppError("Today's test email limit is reached, so the email was not sent. Copy the invite text instead.", 429, 'LMS_EMAIL_HELD');
  }
  if (!result.sent && !result.captured) {
    const code = result.codes[0] ?? (result.skipped ? 'no_recipient' : 'failed');
    await writeLmsAudit({ event: 'onboarding.invite_emailed', outcome: 'fail', institutionId, actor, code: code.slice(0, 80), refIds: { onboardingId: onboarding.id, lang } });
    if (code === 'no_recipient') throw new AppError('The school admin email cannot receive email (a reserved test address)', 409, 'LMS_ONBOARDING_NO_RECIPIENT');
    throw new AppError('The email could not be sent. Copy the invite text instead.', 502, 'LMS_EMAIL_FAILED');
  }
  await LmsOnboarding.updateOne({ id: onboarding.id }, { $set: { lastEmailAt: new Date() }, $inc: { emailCount: 1 } });
  await writeLmsAudit({ event: 'onboarding.invite_emailed', outcome: 'ok', institutionId, actor, refIds: { onboardingId: onboarding.id, lang, template: 'lms-invite-connect' } });
  return markInviteSent(institutionId, 'email', actor);
}

// ------------------------------------------------------------ hand-ticked settings

type Bi = { en: string; ar: string };

export const MANUAL_SETTING_TEXT: Record<ManualSettingKey, { label: Bi; how: Bi }> = {
  activated: {
    label: { en: 'Activate', ar: 'التفعيل (Activate)' },
    how: {
      en: 'Site administration › Plugins › Activity modules › External tool › Manage tools: on the ENARA card, click Activate (it no longer says Pending).',
      ar: 'Site administration › Plugins › Activity modules › External tool › Manage tools: اضغط Activate على بطاقة ENARA (لم تعد تُظهر Pending).',
    },
  },
  acceptGradesAlways: {
    label: { en: 'Accept grades from the tool = Always', ar: 'قبول الدرجات من الأداة = Always (دائمًا)' },
    how: {
      en: 'On the ENARA card, click the gear icon. Under Privacy, set "Accept grades from the tool" to "Always". Save changes.',
      ar: 'على بطاقة ENARA اضغط رمز الترس. من قسم Privacy اجعل "Accept grades from the tool" على "Always". احفظ التغييرات.',
    },
  },
  activityChooser: {
    label: { en: 'Show in activity chooser', ar: 'الظهور في قائمة اختيار الأنشطة' },
    how: {
      en: 'On the ENARA card, click the gear icon. Set "Tool configuration usage" to "Show in activity chooser and as a preconfigured tool". Save changes.',
      ar: 'على بطاقة ENARA اضغط رمز الترس. اجعل "Tool configuration usage" على "Show in activity chooser and as a preconfigured tool". احفظ التغييرات.',
    },
  },
  restrictToCategory: {
    label: { en: 'Restrict to category', ar: 'التقييد بفئة المقررات (Restrict to category)' },
    how: {
      en: "Moodle 4.3 or later, when this Moodle serves more than one school: on the ENARA card, click the gear icon, set \"Restrict to category\" to your school's course category, save. Tick it also when it is not needed (one school only).",
      ar: 'من Moodle 4.3، إذا كان Moodle يخدم أكثر من مدرسة: على بطاقة ENARA اضغط رمز الترس، واجعل "Restrict to category" على فئة مقررات مدرستك، ثم احفظ. ضع العلامة أيضًا إذا لم يكن ذلك مطلوبًا (مدرسة واحدة فقط).',
    },
  },
};

export async function setManualSetting(platform: Pick<ILmsPlatform, 'id' | 'institutionId'>, key: ManualSettingKey, checked: boolean, actor: string) {
  const at = new Date();
  await LmsConnectionCheck.updateOne(
    { platformId: platform.id },
    { $set: { [`manualSettings.${key}`]: { checked, by: actor, at } }, $setOnInsert: { institutionId: platform.institutionId, steps: [] } },
    { upsert: true },
  );
  await writeLmsAudit({ event: 'connection.manual_setting', outcome: 'ok', institutionId: platform.institutionId, platformId: platform.id, actor, refIds: { setting: key, checked } });
  return { key, checked, by: actor, at };
}

// ------------------------------------------------------------ status page

export const CHECKLIST = ['invite_sent', 'link_opened', 'registered', 'activated', 'first_teacher_launch', 'first_student_launch', 'roster_ok', 'first_grade_sent'] as const;
export type ChecklistKey = (typeof CHECKLIST)[number];

const CHECKLIST_TEXT: Record<ChecklistKey, { label: Bi; next: Bi }> = {
  invite_sent: {
    label: { en: 'Invite sent', ar: 'أُرسلت الدعوة' },
    next: { en: 'Copy the invite text and send it to the school (or Send email when emails are on).', ar: 'انسخ نص الدعوة وأرسله إلى المدرسة (أو "إرسال بريد" عندما يكون البريد مفعّلًا).' },
  },
  link_opened: {
    label: { en: 'Link opened in Moodle', ar: 'فُتح الرابط في Moodle' },
    next: { en: 'The Moodle site administrator pastes the link in Moodle: Manage tools › Tool URL › Add LTI Advantage.', ar: 'يلصق مسؤول موقع Moodle الرابط في Moodle: Manage tools › Tool URL › Add LTI Advantage.' },
  },
  registered: {
    label: { en: 'Registered', ar: 'تم التسجيل' },
    next: { en: 'Moodle finishes the registration ("ENARA is registered").', ar: 'يُكمل Moodle التسجيل (تظهر رسالة "ENARA is registered").' },
  },
  activated: {
    label: { en: 'Activated in Moodle (first launch seen)', ar: 'فُعّلت الأداة في Moodle (أول فتح)' },
    next: { en: 'Click Activate on the ENARA card in Moodle, add ENARA to a course and open it once.', ar: 'اضغط Activate على بطاقة ENARA في Moodle، وأضف ENARA إلى مقرر وافتحه مرة واحدة.' },
  },
  first_teacher_launch: {
    label: { en: 'First teacher opened ENARA', ar: 'أول معلم فتح ENARA' },
    next: { en: 'A teacher opens the ENARA activity from their Moodle course.', ar: 'يفتح معلم نشاط ENARA من مقرره في Moodle.' },
  },
  first_student_launch: {
    label: { en: 'First student opened ENARA', ar: 'أول طالب فتح ENARA' },
    next: { en: 'A student opens the ENARA activity from the Moodle course.', ar: 'يفتح طالب نشاط ENARA من المقرر في Moodle.' },
  },
  roster_ok: {
    label: { en: 'Class list synced', ar: 'تمت مزامنة قائمة الطلاب' },
    next: { en: "A teacher opens ENARA from the course; ENARA then reads the course's class list.", ar: 'يفتح المعلم ENARA من المقرر، فيقرأ ENARA قائمة طلاب المقرر.' },
  },
  first_grade_sent: {
    label: { en: 'First grade sent to Moodle', ar: 'أُرسلت أول درجة إلى Moodle' },
    next: { en: 'A student finishes a graded ENARA activity; the grade then appears in the Moodle gradebook.', ar: 'يُنهي طالب نشاط ENARA مُقيّمًا، فتظهر الدرجة في سجل درجات Moodle.' },
  },
};

const firstAudit = async (filter: Record<string, unknown>) =>
  (await LmsAuditLog.findOne(filter).sort({ createdAt: 1 }).select('createdAt').lean())?.createdAt ?? null;

/** Why "registered" is not done yet, from the school's current link. */
function registrationBlocker(link: ILmsRegistrationCode | null): { code: string; status: 'waiting' | 'fail' } {
  if (!link) return { code: 'no_link', status: 'fail' };
  const state = codeState(link);
  if (state === 'expired') return { code: 'link_expired', status: 'fail' };
  if (state === 'revoked' || state === 'used') return { code: 'no_link', status: 'fail' };
  if (link.lastErrorCode === 'registration_openid_invalid') return { code: 'registration_could_not_reach', status: 'fail' };
  if (link.lastErrorCode) return { code: 'registration_failed_retry', status: 'fail' };
  return { code: 'link_not_used', status: 'waiting' };
}

export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  at: Date | null;
  label: Bi;
  /** The next step (when not done); for "registered", why it is not done yet. */
  next: Bi | null;
  code?: string;
}

export async function schoolStatus(institutionId: string, now = new Date()) {
  const school = await schoolOf(institutionId);
  const onboarding = await LmsOnboarding.findOne({ institutionId }).lean();
  const links = await LmsRegistrationCode.find({ institutionId }).select('-codeHash -reservationId').sort({ createdAt: -1 }).limit(50).lean();
  const currentLink = onboarding?.registrationLinkId ? links.find((l) => l.id === onboarding.registrationLinkId) ?? null : links[0] ?? null;
  const platforms = await LmsPlatform.find({ institutionId }).sort({ createdAt: 1 }).limit(20).lean();

  const opened = links.map((l) => l.firstOpenedAt ?? l.usedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const registered = platforms[0]?.createdAt ?? null;
  const launch = { institutionId, outcome: { $in: ['ok', 'warn'] } };
  const [activated, teacher, student, roster, grade] = await Promise.all([
    firstAudit({ ...launch, event: { $in: ['lti.launch', 'lti.deep_link'] } }),
    firstAudit({ ...launch, event: 'lti.launch', 'refIds.role': { $in: ['teacher', 'admin'] } }),
    firstAudit({ ...launch, event: 'lti.launch', 'refIds.role': 'student' }),
    firstAudit({ ...launch, event: 'roster.sync' }),
    LmsGradeSyncJob.findOne({ institutionId, status: 'sent' }).sort({ sentAt: 1 }).select('sentAt').lean().then((j) => j?.sentAt ?? null),
  ]);
  const times: Record<ChecklistKey, Date | null> = {
    invite_sent: onboarding?.inviteSentAt ?? null,
    link_opened: opened,
    registered,
    activated,
    first_teacher_launch: teacher,
    first_student_launch: student,
    roster_ok: roster,
    first_grade_sent: grade,
  };
  const checklist: ChecklistItem[] = CHECKLIST.map((key) => {
    const at = times[key];
    const t = CHECKLIST_TEXT[key];
    if (at) return { key, done: true, at, label: t.label, next: null };
    if (key === 'registered') {
      const b = registrationBlocker(currentLink as ILmsRegistrationCode | null);
      const h = checkText('registered', b.status, b.code);
      return { key, done: false, at: null, label: t.label, next: { en: `${h.en.what} ${h.en.fix}`, ar: `${h.ar.what} ${h.ar.fix}` }, code: b.code };
    }
    return { key, done: false, at: null, label: t.label, next: t.next };
  });

  // The 15-minute goal: from the invite (sent, or made) to a working connection
  // (registered, activated, a teacher's and a student's first launch).
  const startedAt = onboarding ? onboarding.inviteSentAt ?? onboarding.createdAt : null;
  const goalTimes = [times.registered, times.activated, times.first_teacher_launch, times.first_student_launch];
  const goalReachedAt = goalTimes.every(Boolean) ? new Date(Math.max(...goalTimes.map((d) => d!.getTime()))) : null;
  const elapsedMs = startedAt ? Math.max(0, (goalReachedAt ?? now).getTime() - startedAt.getTime()) : null;
  const timer = startedAt
    ? { startedAt, startedFrom: onboarding!.inviteSentAt ? 'invite_sent' : 'invite_created', goalMs: ONBOARDING_GOAL_MS, elapsedMs, goalReachedAt, running: !goalReachedAt, goalMet: !!goalReachedAt && elapsedMs! <= ONBOARDING_GOAL_MS }
    : null;

  const checks = platforms.length ? await LmsConnectionCheck.find({ platformId: { $in: platforms.map((p) => p.id) } }).lean() : [];
  const platformViews = platforms.map((p) => {
    const row = checks.find((c) => c.platformId === p.id) ?? null;
    const check: CheckView = checkView(row, p);
    return {
      id: p.id,
      issuer: p.issuer,
      host: platformHost(p) ?? null,
      status: p.status,
      registeredVia: p.registeredVia,
      createdAt: p.createdAt,
      hasPublicKey: !!p.publicJwks,
      check,
      manualSettings: MANUAL_SETTINGS.map((key) => {
        const tick = row?.manualSettings?.[key];
        return { key, checked: !!tick?.checked, at: tick?.at ?? null, by: tick?.by ?? null, label: MANUAL_SETTING_TEXT[key].label, how: MANUAL_SETTING_TEXT[key].how };
      }),
    };
  });

  return {
    institution: { id: school.id, name: school.name, timeZone: tzOf(school), emailLanguage: school.emailLanguage ?? null, country: school.country ?? null },
    onboarding: onboarding
      ? {
          id: onboarding.id,
          createdAt: onboarding.createdAt,
          inviteSentAt: onboarding.inviteSentAt ?? null,
          inviteSentVia: onboarding.inviteSentVia ?? null,
          lastEmailAt: onboarding.lastEmailAt ?? null,
          moodleAdminEmail: onboarding.moodleAdminEmail ?? null,
          schoolAdminInvitation: onboarding.schoolAdminInvitationId
            ? await Invitation.findOne({ id: onboarding.schoolAdminInvitationId }).select('id status expiresAt acceptedAt -_id').lean()
            : null,
        }
      : null,
    currentLink: currentLink ? registrationCodeView(currentLink as ILmsRegistrationCode) : null,
    emailAvailable: lmsEmailsOn(),
    checklist,
    allDone: checklist.every((c) => c.done),
    timer,
    platforms: platformViews,
  };
}

/** ENARA admins: every onboarded school, newest first, with a short summary. */
export async function listOnboardings(filter: { institutionId?: string } = {}) {
  const rows = await LmsOnboarding.find(filter.institutionId ? { institutionId: filter.institutionId } : {}).sort({ createdAt: -1 }).limit(200).lean();
  const ids = rows.map((r) => r.institutionId);
  const [schools, platforms, checks] = await Promise.all([
    Institution.find({ id: { $in: ids } }).select('id name').lean(),
    LmsPlatform.find({ institutionId: { $in: ids } }).select('id institutionId status').lean(),
    LmsConnectionCheck.find({ institutionId: { $in: ids } }).select('institutionId outcome checkedAt').lean(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    institutionId: r.institutionId,
    name: schools.find((s) => s.id === r.institutionId)?.name ?? null,
    createdAt: r.createdAt,
    inviteSentAt: r.inviteSentAt ?? null,
    connections: platforms.filter((p) => p.institutionId === r.institutionId).length,
    lastCheckOutcome: checks.filter((c) => c.institutionId === r.institutionId).sort((a, b) => (b.checkedAt?.getTime() ?? 0) - (a.checkedAt?.getTime() ?? 0))[0]?.outcome ?? null,
  }));
}
