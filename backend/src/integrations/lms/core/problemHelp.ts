import { LTI_ERRORS, type LtiErrorCode } from '../adapters/lti13/errors';

// Phase 1b, the Problems view: a plain-language explanation and fix for every
// LMS reference code, in English and Arabic (simple Modern Standard Arabic,
// Western digits). The audit log keeps codes only; this table turns them into
// words for school admins. No text contains personal data.
//
// Lookup (helpFor): the exact code; then "<event area>.<code>" (e.g. an audit
// row with event "registration.*" and code "duplicate_lms" finds
// "registration.duplicate_lms"); then an HTTP family ("score_http_403" ->
// "score_http", with {status}); else a generic text that names the code.

export interface ProblemText {
  what: string;
  fix: string;
}
export interface ProblemHelp {
  known: boolean;
  en: ProblemText;
  ar: ProblemText;
}
type Entry = { en: [string, string]; ar: [string, string] };

const AGAIN_EN = 'The user opens the activity again from the LMS. If many of these come together, send this code to ENARA support.';
const AGAIN_AR = 'يفتح المستخدم النشاط مرة أخرى من نظام إدارة التعلم. إذا تكرر ذلك كثيرًا فأرسل هذا الرمز إلى دعم ENARA.';
const SUPPORT_EN = 'Send this code and the time to ENARA support.';
const SUPPORT_AR = 'أرسل هذا الرمز والوقت إلى دعم ENARA.';
const RETRY_EN = 'ENARA tries again automatically. If it stays, send this code to ENARA support.';
const RETRY_AR = 'يعيد ENARA المحاولة تلقائيًا. إذا استمر ذلك فأرسل هذا الرمز إلى دعم ENARA.';
const NOTHING_EN = 'Nothing to do.';
const NOTHING_AR = 'لا حاجة لأي إجراء.';

/** Every code ENARA's LTI launch can refuse with (errors.ts). Kept complete by a test. */
export const LTI_ERROR_HELP: Record<LtiErrorCode, Entry> = {
  lti_disabled: {
    en: ['The LMS integration is switched off on the ENARA server.', 'Ask ENARA support to switch the LMS integration on.'],
    ar: ['التكامل مع نظام إدارة التعلم متوقف على خادم ENARA.', 'اطلب من دعم ENARA تشغيل التكامل مع نظام إدارة التعلم.'],
  },
  missing_parameters: {
    en: ['The LMS sent a sign-in request without a required field (issuer, login hint or target link).', 'Check the tool\'s "Initiate login URL" in the LMS. If it is right, send this code to ENARA support.'],
    ar: ['أرسل نظام إدارة التعلم طلب دخول ينقصه حقل مطلوب (المُصدِر أو تلميح الدخول أو رابط الهدف).', 'تحقق من رابط بدء الدخول (Initiate login URL) للأداة في نظام إدارة التعلم. إذا كان صحيحًا فأرسل هذا الرمز إلى دعم ENARA.'],
  },
  invalid_target_link_uri: {
    en: ['The LMS asked to open an address that is not part of ENARA.', 'In the LMS tool settings, set the Tool URL to the ENARA launch URL shown on this page.'],
    ar: ['طلب نظام إدارة التعلم فتح عنوان لا ينتمي إلى ENARA.', 'في إعدادات الأداة في نظام إدارة التعلم، اجعل رابط الأداة (Tool URL) هو رابط الإطلاق الظاهر في هذه الصفحة.'],
  },
  unknown_platform: {
    en: ['A sign-in came from an LMS that is not connected to ENARA (unknown Platform ID or Client ID).', 'Add the LMS in LMS connections, or check that the Platform ID and Client ID match the LMS exactly.'],
    ar: ['وصل طلب دخول من نظام إدارة تعلم غير متصل بـ ENARA (معرّف منصة أو معرّف عميل غير معروف).', 'أضف النظام في صفحة اتصالات نظام إدارة التعلم، أو تحقق من تطابق معرّف المنصة ومعرّف العميل تمامًا.'],
  },
  ambiguous_platform: {
    en: ['The same LMS is connected more than once with the same settings, so ENARA cannot tell which connection to use.', 'Switch off the connection you do not need.'],
    ar: ['نظام إدارة التعلم نفسه متصل أكثر من مرة بالإعدادات نفسها، فلا يعرف ENARA أي اتصال يستخدم.', 'أوقف الاتصال الذي لا تحتاج إليه.'],
  },
  platform_pending: {
    en: ['The connection is waiting for approval by ENARA, so launches are refused.', 'An ENARA admin approves it in LMS connections.'],
    ar: ['الاتصال بانتظار موافقة ENARA، لذلك يُرفض فتح الأنشطة.', 'يوافق عليه مسؤول في ENARA من صفحة اتصالات نظام إدارة التعلم.'],
  },
  platform_disabled: {
    en: ['The connection is switched off, so launches are refused.', 'Switch it on again in LMS connections if it is still needed.'],
    ar: ['الاتصال متوقف، لذلك يُرفض فتح الأنشطة.', 'أعد تشغيله من صفحة اتصالات نظام إدارة التعلم إذا كنت ما زلت تحتاج إليه.'],
  },
  platform_misconfigured: {
    en: ['The connection is missing a required address (authentication request URL or public keyset URL).', "Compare the connection's URLs with the LMS's tool details."],
    ar: ['ينقص الاتصال عنوان مطلوب (رابط طلب المصادقة أو رابط المفاتيح العامة).', 'قارن روابط الاتصال بتفاصيل الأداة في نظام إدارة التعلم.'],
  },
  state_missing: {
    en: ['The LMS returned the sign-in without its "state" value.', AGAIN_EN],
    ar: ['أعاد نظام إدارة التعلم عملية الدخول بدون قيمة الحالة (state).', AGAIN_AR],
  },
  state_invalid: {
    en: ['A sign-in link was used twice or arrived after 10 minutes (for example, the back button or a very slow page).', 'Usually nothing to do: the user opens the activity again. Many of these can mean the LMS server clock is wrong.'],
    ar: ['استُخدم رابط الدخول مرتين أو وصل بعد 10 دقائق (مثل زر الرجوع أو صفحة بطيئة جدًا).', 'لا حاجة لأي إجراء عادةً: يفتح المستخدم النشاط مرة أخرى. إذا تكرر كثيرًا فقد تكون ساعة خادم نظام إدارة التعلم غير صحيحة.'],
  },
  state_cookie_mismatch: {
    en: ["The sign-in finished in a different browser from the one that started it. This can be an attempt to sign someone in to another person's account.", AGAIN_EN],
    ar: ['انتهت عملية الدخول في متصفح غير الذي بدأت فيه. قد يكون ذلك محاولة لإدخال شخص إلى حساب شخص آخر.', AGAIN_AR],
  },
  storage_mismatch: {
    en: ["The LMS page storage did not hold this sign-in's values, so the sign-in did not start in this browser. This can be an attempt to sign someone in to another person's account.", AGAIN_EN],
    ar: ['لم تحتوِ ذاكرة صفحة نظام إدارة التعلم على قيم عملية الدخول هذه، أي أن الدخول لم يبدأ في هذا المتصفح. قد يكون ذلك محاولة لإدخال شخص إلى حساب شخص آخر.', AGAIN_AR],
  },
  id_token_missing: {
    en: ['The LMS did not send the sign-in token.', 'Check that the tool is set to LTI 1.3 in the LMS and that its Redirection URI is the ENARA launch URL.'],
    ar: ['لم يرسل نظام إدارة التعلم رمز الدخول.', 'تحقق من ضبط الأداة على LTI 1.3 في نظام إدارة التعلم ومن أن رابط إعادة التوجيه (Redirection URI) هو رابط الإطلاق في ENARA.'],
  },
  invalid_token: {
    en: ['The sign-in token from the LMS could not be read.', SUPPORT_EN],
    ar: ['تعذرت قراءة رمز الدخول القادم من نظام إدارة التعلم.', SUPPORT_AR],
  },
  invalid_signature: {
    en: ["The sign-in token's signature did not match the LMS's public keys.", 'Check the Public keyset URL in the connection. If the LMS has just changed its keys, try again in a few minutes.'],
    ar: ['توقيع رمز الدخول لا يطابق المفاتيح العامة لنظام إدارة التعلم.', 'تحقق من رابط المفاتيح العامة في الاتصال. إذا غيّر النظام مفاتيحه للتو فحاول مرة أخرى بعد دقائق.'],
  },
  unknown_kid: {
    en: ["The sign-in token was signed with a key that the LMS's key list does not include.", 'Check that the Public keyset URL in the connection belongs to this LMS.'],
    ar: ['وُقّع رمز الدخول بمفتاح غير موجود في قائمة مفاتيح نظام إدارة التعلم.', 'تحقق من أن رابط المفاتيح العامة في الاتصال يخص نظام إدارة التعلم هذا.'],
  },
  jwks_unavailable: {
    en: ["ENARA could not download the LMS's public keys.", 'Check that the LMS is online and the Public keyset URL is right. Launches work again when the LMS answers.'],
    ar: ['تعذر على ENARA تنزيل المفاتيح العامة لنظام إدارة التعلم.', 'تحقق من أن النظام يعمل وأن رابط المفاتيح العامة صحيح. يعود فتح الأنشطة للعمل عندما يستجيب النظام.'],
  },
  invalid_alg: {
    en: ['The sign-in token uses a signing method ENARA does not accept (only RS256).', 'Check that the tool is set to LTI 1.3 with RSA keys in the LMS.'],
    ar: ['يستخدم رمز الدخول طريقة توقيع لا يقبلها ENARA (يقبل RS256 فقط).', 'تحقق من ضبط الأداة على LTI 1.3 بمفاتيح RSA في نظام إدارة التعلم.'],
  },
  invalid_iss: {
    en: ["The sign-in token came from a different LMS address than the connection's Platform ID.", 'Make the Platform ID in the connection exactly match the LMS (no extra slash at the end).'],
    ar: ['جاء رمز الدخول من عنوان يختلف عن معرّف المنصة في الاتصال.', 'اجعل معرّف المنصة في الاتصال مطابقًا تمامًا لنظام إدارة التعلم (بدون شرطة زائدة في النهاية).'],
  },
  invalid_aud: {
    en: ['The sign-in token was issued for a different Client ID.', 'Make the Client ID in the connection match the LMS.'],
    ar: ['صدر رمز الدخول لمعرّف عميل مختلف.', 'اجعل معرّف العميل في الاتصال مطابقًا لنظام إدارة التعلم.'],
  },
  invalid_azp: {
    en: ['The sign-in token was meant for another tool (its authorized party does not match).', 'Make the Client ID in the connection match the LMS.'],
    ar: ['رمز الدخول مخصص لأداة أخرى (الطرف المخوَّل غير مطابق).', 'اجعل معرّف العميل في الاتصال مطابقًا لنظام إدارة التعلم.'],
  },
  token_expired: {
    en: ['The sign-in token was too old when it arrived.', 'Usually the user just opens the activity again. Many of these can mean the LMS server clock is wrong.'],
    ar: ['كان رمز الدخول قديمًا عند وصوله.', 'يفتح المستخدم النشاط مرة أخرى عادةً. إذا تكرر كثيرًا فقد تكون ساعة خادم نظام إدارة التعلم غير صحيحة.'],
  },
  missing_iat: {
    en: ['The sign-in token has no time of issue.', 'Send this code to ENARA support; the LMS may need an update.'],
    ar: ['لا يحمل رمز الدخول وقت إصداره.', 'أرسل هذا الرمز إلى دعم ENARA؛ قد يحتاج نظام إدارة التعلم إلى تحديث.'],
  },
  iat_in_future: {
    en: ["The sign-in token's time is in the future: the LMS server clock is ahead.", 'Ask whoever hosts the LMS to correct the server clock.'],
    ar: ['وقت رمز الدخول في المستقبل: ساعة خادم نظام إدارة التعلم متقدمة.', 'اطلب من الجهة التي تستضيف نظام إدارة التعلم تصحيح ساعة الخادم.'],
  },
  nonce_invalid: {
    en: ['A sign-in token was used twice or does not belong to this sign-in.', AGAIN_EN],
    ar: ['استُخدم رمز دخول مرتين أو أنه لا يخص عملية الدخول هذه.', AGAIN_AR],
  },
  invalid_version: {
    en: ['The LMS uses an LTI version other than 1.3.', 'Set the tool to LTI 1.3 in the LMS.'],
    ar: ['يستخدم نظام إدارة التعلم إصدار LTI غير 1.3.', 'اضبط الأداة على LTI 1.3 في نظام إدارة التعلم.'],
  },
  unsupported_message_type: {
    en: ['The LMS sent a kind of request ENARA does not handle (or the activity picker is switched off).', 'Check that "Supports Deep Linking" in the tool settings matches what ENARA has switched on.'],
    ar: ['أرسل نظام إدارة التعلم نوع طلب لا يتعامل معه ENARA (أو أن منتقي الأنشطة متوقف).', 'تحقق من أن خيار دعم الربط العميق (Deep Linking) في إعدادات الأداة يطابق ما فعّله ENARA.'],
  },
  missing_deployment: {
    en: ['The LMS did not say which installation (deployment) of ENARA this is.', SUPPORT_EN],
    ar: ['لم يحدد نظام إدارة التعلم أي تثبيت (deployment) لـ ENARA يُستخدم.', SUPPORT_AR],
  },
  unknown_deployment: {
    en: ['The launch came from a Deployment ID that is not registered for this connection.', 'Add the Deployment ID (from the LMS tool details) to the connection.'],
    ar: ['جاء الطلب من معرّف تثبيت غير مسجل لهذا الاتصال.', 'أضف معرّف التثبيت (من تفاصيل الأداة في نظام إدارة التعلم) إلى الاتصال.'],
  },
  deployment_pending: {
    en: ['The deployment is waiting for approval by ENARA.', 'An ENARA admin approves the deployment in LMS connections.'],
    ar: ['التثبيت بانتظار موافقة ENARA.', 'يوافق مسؤول في ENARA على التثبيت من صفحة اتصالات نظام إدارة التعلم.'],
  },
  anonymous_launch: {
    en: ['The LMS did not say who the user is.', 'In the tool\'s privacy settings, share the user\'s identity (in Moodle: share the launcher\'s name and email "Always").'],
    ar: ['لم يرسل نظام إدارة التعلم هوية المستخدم.', 'في إعدادات الخصوصية للأداة، شارك هوية المستخدم (في Moodle: مشاركة اسم المستخدم وبريده "دائمًا").'],
  },
  missing_roles: {
    en: ["The LMS did not send the user's role in the course.", 'Check that the user is enrolled in the course with a role.'],
    ar: ['لم يرسل نظام إدارة التعلم دور المستخدم في المقرر.', 'تحقق من أن المستخدم مسجل في المقرر بدور محدد.'],
  },
  missing_context: {
    en: ['ENARA was opened from outside a course.', 'Add ENARA as an activity inside a course and open it from there.'],
    ar: ['فُتح ENARA من خارج المقرر.', 'أضف ENARA نشاطًا داخل مقرر وافتحه من هناك.'],
  },
  missing_resource_link: {
    en: ['The LMS did not say which activity was opened.', 'Open ENARA from an activity in the course.'],
    ar: ['لم يحدد نظام إدارة التعلم النشاط الذي فُتح.', 'افتح ENARA من نشاط داخل المقرر.'],
  },
  deep_link_not_allowed: {
    en: ['Someone without a teacher role tried to add ENARA activities.', "Only teachers and admins can use the activity picker. Nothing to do unless a teacher's role is wrong in the LMS."],
    ar: ['حاول شخص ليس له دور معلم إضافة أنشطة ENARA.', 'يستخدم منتقي الأنشطة المعلمون والمسؤولون فقط. لا حاجة لأي إجراء إلا إذا كان دور المعلم خاطئًا في نظام إدارة التعلم.'],
  },
  deep_link_invalid: {
    en: ['The LMS sent an activity-picker request ENARA cannot use (for example, without a return address).', "Check the tool's Deep Linking settings in the LMS."],
    ar: ['أرسل نظام إدارة التعلم طلب منتقي أنشطة لا يستطيع ENARA استخدامه (مثلًا بدون عنوان العودة).', 'تحقق من إعدادات الربط العميق (Deep Linking) للأداة في نظام إدارة التعلم.'],
  },
  picker_session_used: {
    en: ['An activity picker was used twice or after it expired.', 'The teacher clicks "Select content" again in the LMS.'],
    ar: ['استُخدم منتقي الأنشطة مرتين أو بعد انتهاء صلاحيته.', 'ينقر المعلم على "اختيار المحتوى" مرة أخرى في نظام إدارة التعلم.'],
  },
  observer_not_supported: {
    en: ['A parent or mentor opened ENARA from the LMS; this is not available yet.', 'Nothing to do. Parents use the ENARA Parents Portal.'],
    ar: ['فتح ولي أمر أو مرشد ENARA من نظام إدارة التعلم، وهذا غير متاح بعد.', 'لا حاجة لأي إجراء. يستخدم أولياء الأمور بوابة أولياء الأمور في ENARA.'],
  },
  institution_suspended: {
    en: ["The school's ENARA access is suspended.", "Contact ENARA about the school's account."],
    ar: ['وصول المدرسة إلى ENARA معلّق.', 'تواصل مع ENARA بشأن حساب المدرسة.'],
  },
  role_conflict: {
    en: ["The user's ENARA account has a different role from the one the LMS sent.", "Check the person's role in the LMS course and in ENARA, and correct the one that is wrong."],
    ar: ['دور حساب المستخدم في ENARA يختلف عن الدور الذي أرسله نظام إدارة التعلم.', 'تحقق من دور الشخص في مقرر نظام إدارة التعلم وفي ENARA، وصحّح الدور الخاطئ.'],
  },
  student_as_instructor: {
    en: ['A student account was opened with a teacher role.', 'If the person teaches, create a teacher account for them; otherwise correct their role in the LMS course.'],
    ar: ['فُتح حساب طالب بدور معلم.', 'إذا كان الشخص معلمًا فأنشئ له حساب معلم، وإلا فصحّح دوره في مقرر نظام إدارة التعلم.'],
  },
  test_user_not_supported: {
    en: ['An LMS test student opened ENARA. ENARA does not create accounts for test students.', 'Teachers preview the student view with "Switch role to student" instead.'],
    ar: ['فتح طالب تجريبي من نظام إدارة التعلم ENARA، ولا ينشئ ENARA حسابات للطلاب التجريبيين.', 'يعاين المعلمون عرض الطالب باستخدام "تبديل الدور إلى طالب" بدلًا من ذلك.'],
  },
  account_disabled: {
    en: ["The user's ENARA account is switched off.", 'Switch the account on in ENARA if the person should have access.'],
    ar: ['حساب المستخدم في ENARA متوقف.', 'شغّل الحساب في ENARA إذا كان يجب أن يحصل الشخص على الوصول.'],
  },
  account_conflict: {
    en: ['The LMS user is linked to an ENARA account that cannot be used here (for example, at another school).', SUPPORT_EN],
    ar: ['مستخدم نظام إدارة التعلم مرتبط بحساب في ENARA لا يمكن استخدامه هنا (مثلًا في مدرسة أخرى).', SUPPORT_AR],
  },
  seat_limit_reached: {
    en: ['The school has used all its seats, and the hard cap refused a new student.', 'Ask ENARA to raise the seat limit, or to switch the hard cap off.'],
    ar: ['استخدمت المدرسة جميع مقاعدها، ورفض الحد الصارم طالبًا جديدًا.', 'اطلب من ENARA رفع حد المقاعد أو إيقاف الحد الصارم.'],
  },
  identity_suppressed: {
    en: ["This LMS person was permanently deleted at the school's request (data protection), so ENARA does not create them again.", 'Nothing to do. If the deletion was a mistake, an ENARA admin can lift it in the suppression list.'],
    ar: ['حُذف هذا الشخص نهائيًا بطلب من المدرسة (حماية البيانات)، لذلك لا ينشئه ENARA مرة أخرى.', 'لا حاجة لأي إجراء. إذا كان الحذف خطأ، يستطيع مسؤول في ENARA رفعه من قائمة الحظر.'],
  },
  invalid_activity_binding: {
    en: ['The activity points to ENARA work that is unknown, not published, or from another school.', 'The teacher chooses the work again with the activity picker.'],
    ar: ['يشير النشاط إلى عمل في ENARA غير معروف أو غير منشور أو من مدرسة أخرى.', 'يختار المعلم العمل مرة أخرى باستخدام منتقي الأنشطة.'],
  },
  internal_error: {
    en: ["Something failed on ENARA's side.", 'Try again in a minute. If it keeps happening, send this code and the time to ENARA support.'],
    ar: ['حدث خطأ من جهة ENARA.', 'حاول مرة أخرى بعد دقيقة. إذا تكرر ذلك فأرسل هذا الرمز والوقت إلى دعم ENARA.'],
  },
};

/** Grade, roster, session, seat, registration and browser-binding codes. */
export const OTHER_HELP: Record<string, Entry> = {
  // How the launch was tied to the browser (warnings: the launch worked).
  cookieless: {
    en: ["The launch worked, but the browser blocked ENARA's sign-in cookie inside the LMS (common in Safari and private windows). ENARA checked it on the server and allowed it.", 'Nothing to do. These are normal and counted on the connection.'],
    ar: ['نجح فتح النشاط، لكن المتصفح منع ملف تعريف الارتباط (cookie) الخاص بـ ENARA داخل نظام إدارة التعلم (شائع في Safari والنوافذ الخاصة). تحقق ENARA منه على الخادم وسمح به.', 'لا حاجة لأي إجراء. هذا طبيعي ويُحسب في عداد الاتصال.'],
  },
  storage_unavailable: {
    en: ['The LMS offered its page storage for the sign-in, but it did not answer in time. The launch continued without cookies (counted as cookieless).', 'Nothing to do for a few cases. If it happens on every launch, tell ENARA support which LMS and version you use.'],
    ar: ['عرض نظام إدارة التعلم ذاكرة صفحته لعملية الدخول، لكنه لم يستجب في الوقت المحدد. استمر فتح النشاط بدون ملفات تعريف الارتباط (يُحسب بدون cookie).', 'لا حاجة لأي إجراء في حالات قليلة. إذا حدث ذلك مع كل فتح فأخبر دعم ENARA باسم نظام إدارة التعلم وإصداره.'],
  },
  // Signing in after the launch (one-time links, account checks).
  account_unavailable: {
    en: ['The ENARA account for this launch was switched off or moved to another school before sign-in finished.', 'Check the account in ENARA.'],
    ar: ['أُوقف حساب ENARA الخاص بهذا الفتح أو نُقل إلى مدرسة أخرى قبل اكتمال الدخول.', 'تحقق من الحساب في ENARA.'],
  },
  role_not_supported: {
    en: ['An ENARA account of a type that cannot open from an LMS (for example an ENARA admin or an academic manager) is linked to this LMS user.', 'Use a teacher, school admin, student or parent account for LMS launches.'],
    ar: ['حساب من نوع لا يُفتح من نظام إدارة التعلم (مثل مسؤول ENARA أو مدير أكاديمي) مرتبط بمستخدم النظام هذا.', 'استخدم حساب معلم أو مسؤول مدرسة أو طالب أو ولي أمر لفتح ENARA من نظام إدارة التعلم.'],
  },
  lms_role_not_supported: {
    en: ['An ENARA account of a type that cannot open from an LMS (for example an ENARA admin or an academic manager) is linked to this LMS user.', 'Use a teacher, school admin, student or parent account for LMS launches.'],
    ar: ['حساب من نوع لا يُفتح من نظام إدارة التعلم (مثل مسؤول ENARA أو مدير أكاديمي) مرتبط بمستخدم النظام هذا.', 'استخدم حساب معلم أو مسؤول مدرسة أو طالب أو ولي أمر لفتح ENARA من نظام إدارة التعلم.'],
  },
  preview_not_staff: {
    en: ['A "preview as student" session was refused because the account is no longer a teacher or admin.', 'Nothing to do, unless the role change was a mistake.'],
    ar: ['رُفضت جلسة "المعاينة كطالب" لأن الحساب لم يعد حساب معلم أو مسؤول.', 'لا حاجة لأي إجراء، إلا إذا كان تغيير الدور خطأ.'],
  },
  launch_token_invalid: {
    en: ['The one-time sign-in link from the launch could not be read.', AGAIN_EN],
    ar: ['تعذرت قراءة رابط الدخول المؤقت الناتج عن فتح النشاط.', AGAIN_AR],
  },
  launch_token_expired: {
    en: ['The one-time sign-in link was used after 2 minutes.', AGAIN_EN],
    ar: ['استُخدم رابط الدخول المؤقت بعد مرور دقيقتين.', AGAIN_AR],
  },
  launch_token_used: {
    en: ['The one-time sign-in link was used twice (for example, after a page refresh).', AGAIN_EN],
    ar: ['استُخدم رابط الدخول المؤقت مرتين (مثلًا بعد تحديث الصفحة).', AGAIN_AR],
  },
  handoff_code_invalid: {
    en: ['An "Open in new tab" link could not be read.', 'Click "Open in new tab" again.'],
    ar: ['تعذرت قراءة رابط "فتح في علامة تبويب جديدة".', 'انقر على "فتح في علامة تبويب جديدة" مرة أخرى.'],
  },
  handoff_code_expired: {
    en: ['An "Open in new tab" link was used after 60 seconds.', 'Click "Open in new tab" again.'],
    ar: ['استُخدم رابط "فتح في علامة تبويب جديدة" بعد 60 ثانية.', 'انقر على "فتح في علامة تبويب جديدة" مرة أخرى.'],
  },
  handoff_code_used: {
    en: ['An "Open in new tab" link was used twice.', 'Click "Open in new tab" again.'],
    ar: ['استُخدم رابط "فتح في علامة تبويب جديدة" مرتين.', 'انقر على "فتح في علامة تبويب جديدة" مرة أخرى.'],
  },
  // A student's current class after a launch (multi-class).
  no_student: {
    en: ["A student's launch could not select the course's class because the student record was not found.", SUPPORT_EN],
    ar: ['لم يتمكن فتح النشاط من اختيار صف المقرر للطالب لأن سجل الطالب غير موجود.', SUPPORT_AR],
  },
  not_enrolled: {
    en: ["A student opened a course whose ENARA class they are not enrolled in, so their current class did not change.", "Check the student's enrollment, or run a roster sync for the course."],
    ar: ['فتح طالب مقررًا غير مسجل في صفه في ENARA، لذلك لم يتغير صفه الحالي.', 'تحقق من تسجيل الطالب، أو شغّل مزامنة قائمة الطلاب للمقرر.'],
  },
  // Seats.
  over_seat_limit: {
    en: ['The school has more students than its seat limit. Students can still sign in.', 'ENARA will contact you about your plan, or ask ENARA to raise the limit.'],
    ar: ['عدد طلاب المدرسة أكبر من حد المقاعد. ما زال الطلاب يستطيعون الدخول.', 'ستتواصل ENARA معك بشأن خطتك، أو اطلب من ENARA رفع الحد.'],
  },
  // Grades sent to the LMS (AGS).
  not_eligible: {
    en: ['A grade was not sent because the attempt, activity or student no longer match (for example, the attempt was removed or moved).', 'Usually nothing to do. Use "Re-sync grades" if a grade is missing in the LMS.'],
    ar: ['لم تُرسل درجة لأن المحاولة أو النشاط أو الطالب لم تعد متطابقة (مثلًا حُذفت المحاولة أو نُقلت).', 'لا حاجة لأي إجراء عادةً. استخدم "إعادة مزامنة الدرجات" إذا كانت درجة ناقصة في نظام إدارة التعلم.'],
  },
  no_provider: {
    en: ["A grade was not sent because this connection's type cannot send grades.", SUPPORT_EN],
    ar: ['لم تُرسل درجة لأن نوع هذا الاتصال لا يدعم إرسال الدرجات.', SUPPORT_AR],
  },
  platform_not_active: {
    en: ['The connection is pending or switched off, so grades and roster syncs wait.', 'Switch the connection on; the waiting grades are then sent.'],
    ar: ['الاتصال بانتظار الموافقة أو متوقف، لذلك تنتظر الدرجات ومزامنة قوائم الطلاب.', 'شغّل الاتصال، فتُرسل الدرجات المنتظرة بعد ذلك.'],
  },
  lineitem_gone: {
    en: ['The LMS no longer accepts grades for this activity (its grade column was probably deleted).', 'If the activity was deleted in the LMS, archive the ENARA assignment. Otherwise add the activity again.'],
    ar: ['لم يعد نظام إدارة التعلم يقبل درجات هذا النشاط (ربما حُذف عمود الدرجات الخاص به).', 'إذا حُذف النشاط في نظام إدارة التعلم فأرشف واجب ENARA، وإلا فأضف النشاط مرة أخرى.'],
  },
  no_line_item: {
    en: ['The LMS gave no grade column for this activity.', 'In the LMS tool settings, turn on the grade service ("Use this service for grade sync and column management") and set "Accept grades" to "Always".'],
    ar: ['لم يقدم نظام إدارة التعلم عمود درجات لهذا النشاط.', 'في إعدادات الأداة في نظام إدارة التعلم، شغّل خدمة الدرجات ("Use this service for grade sync and column management") واجعل "قبول الدرجات" على "دائمًا".'],
  },
  bad_line_item_url: {
    en: ['The LMS gave a grade column address ENARA cannot use (not https).', SUPPORT_EN],
    ar: ['قدم نظام إدارة التعلم عنوان عمود درجات لا يستطيع ENARA استخدامه (ليس https).', SUPPORT_AR],
  },
  line_item_create_not_allowed: {
    en: ['ENARA needed to create a grade column, but the LMS does not allow it.', 'Turn on "grade sync and column management" for the tool in the LMS.'],
    ar: ['احتاج ENARA إلى إنشاء عمود درجات، لكن نظام إدارة التعلم لا يسمح بذلك.', 'شغّل "مزامنة الدرجات وإدارة الأعمدة" للأداة في نظام إدارة التعلم.'],
  },
  lineitem_create_invalid_response: {
    en: ['The LMS answered the "create grade column" request with something ENARA could not read.', RETRY_EN],
    ar: ['أجاب نظام إدارة التعلم عن طلب "إنشاء عمود درجات" بشيء لم يستطع ENARA قراءته.', RETRY_AR],
  },
  token_invalid_response: {
    en: ["The LMS's service sign-in gave an answer ENARA could not read.", RETRY_EN],
    ar: ['أعطت خدمة الدخول في نظام إدارة التعلم إجابة لم يستطع ENARA قراءتها.', RETRY_AR],
  },
  no_token_url: {
    en: ['The connection has no Access token URL, so ENARA cannot send grades or read the roster.', 'Add the Access token URL from the LMS tool details to the connection (ask ENARA support if you cannot edit it).'],
    ar: ['لا يحتوي الاتصال على رابط رمز الوصول (Access token URL)، لذلك لا يستطيع ENARA إرسال الدرجات أو قراءة قائمة الطلاب.', 'أضف رابط رمز الوصول من تفاصيل الأداة في نظام إدارة التعلم إلى الاتصال (اطلب ذلك من دعم ENARA إذا لم تستطع تعديله).'],
  },
  timeout: {
    en: ['The LMS did not answer within 8 seconds.', 'ENARA tries again automatically. If it keeps happening, check that the LMS is not overloaded.'],
    ar: ['لم يستجب نظام إدارة التعلم خلال 8 ثوانٍ.', 'يعيد ENARA المحاولة تلقائيًا. إذا تكرر ذلك فتحقق من أن نظام إدارة التعلم ليس تحت ضغط كبير.'],
  },
  network: {
    en: ['ENARA could not reach the LMS.', 'Check that the LMS is online. ENARA tries again automatically.'],
    ar: ['تعذر على ENARA الوصول إلى نظام إدارة التعلم.', 'تحقق من أن نظام إدارة التعلم يعمل. يعيد ENARA المحاولة تلقائيًا.'],
  },
  no_result_scope: {
    en: ['The LMS does not let ENARA read grades back, so ENARA cannot see grades changed in the LMS.', 'Turn on the grade service with column management for the tool in the LMS.'],
    ar: ['لا يسمح نظام إدارة التعلم لـ ENARA بقراءة الدرجات، لذلك لا يرى ENARA الدرجات التي تغيرت فيه.', 'شغّل خدمة الدرجات مع إدارة الأعمدة للأداة في نظام إدارة التعلم.'],
  },
  results_invalid_response: {
    en: ["The LMS's grade results could not be read.", RETRY_EN],
    ar: ['تعذرت قراءة نتائج الدرجات من نظام إدارة التعلم.', RETRY_AR],
  },
  // HTTP families ({status} is the LMS's HTTP status code).
  token_http: {
    en: ["The LMS refused ENARA's service sign-in (HTTP {status}).", "Check that the connection's Client ID is right and that the LMS has ENARA's Public keyset URL. 5xx errors are retried automatically."],
    ar: ['رفض نظام إدارة التعلم دخول خدمة ENARA (HTTP {status}).', 'تحقق من صحة معرّف العميل في الاتصال ومن أن نظام إدارة التعلم يملك رابط المفاتيح العامة لـ ENARA. يُعاد إرسال أخطاء 5xx تلقائيًا.'],
  },
  lineitems_http: {
    en: ['The LMS refused to list grade columns (HTTP {status}).', 'Check that the grade service is on for the tool. 5xx errors are retried automatically.'],
    ar: ['رفض نظام إدارة التعلم عرض أعمدة الدرجات (HTTP {status}).', 'تحقق من تشغيل خدمة الدرجات للأداة. يُعاد إرسال أخطاء 5xx تلقائيًا.'],
  },
  lineitem_create_http: {
    en: ['The LMS refused to create a grade column (HTTP {status}).', 'Turn on "grade sync and column management" for the tool. 5xx errors are retried automatically.'],
    ar: ['رفض نظام إدارة التعلم إنشاء عمود درجات (HTTP {status}).', 'شغّل "مزامنة الدرجات وإدارة الأعمدة" للأداة. يُعاد إرسال أخطاء 5xx تلقائيًا.'],
  },
  score_http: {
    en: ['The LMS refused a grade (HTTP {status}).', '5xx and 429 errors are retried automatically. A 403 usually means the tool does not accept grades: set "Accept grades" to "Always".'],
    ar: ['رفض نظام إدارة التعلم درجة (HTTP {status}).', 'يُعاد إرسال أخطاء 5xx و429 تلقائيًا. الخطأ 403 يعني عادةً أن الأداة لا تقبل الدرجات: اجعل "قبول الدرجات" على "دائمًا".'],
  },
  results_http: {
    en: ['The LMS refused to show grade results (HTTP {status}).', 'Turn on the grade service with column management for the tool. 5xx errors are retried automatically.'],
    ar: ['رفض نظام إدارة التعلم عرض نتائج الدرجات (HTTP {status}).', 'شغّل خدمة الدرجات مع إدارة الأعمدة للأداة. يُعاد إرسال أخطاء 5xx تلقائيًا.'],
  },
  memberships_http: {
    en: ['The LMS refused to give the course roster (HTTP {status}).', 'Turn on "Names and Role Provisioning" for the tool and share members\' information. 5xx errors are retried at the next sync.'],
    ar: ['رفض نظام إدارة التعلم إعطاء قائمة طلاب المقرر (HTTP {status}).', 'شغّل خدمة الأسماء والأدوار (Names and Role Provisioning) للأداة وشارك معلومات الأعضاء. تُعاد محاولة أخطاء 5xx في المزامنة التالية.'],
  },
  // Roster sync (NRPS).
  no_memberships_url: {
    en: ['The LMS did not offer the roster service for this course.', 'Turn on "Names and Role Provisioning" for the tool, then a teacher opens the activity once.'],
    ar: ['لم يقدم نظام إدارة التعلم خدمة قائمة الطلاب لهذا المقرر.', 'شغّل خدمة الأسماء والأدوار (Names and Role Provisioning) للأداة، ثم يفتح المعلم النشاط مرة واحدة.'],
  },
  nrps_not_allowed: {
    en: ['The roster service is not allowed for this connection.', 'Turn on "Names and Role Provisioning" for the tool in the LMS.'],
    ar: ['خدمة قائمة الطلاب غير مسموح بها لهذا الاتصال.', 'شغّل خدمة الأسماء والأدوار (Names and Role Provisioning) للأداة في نظام إدارة التعلم.'],
  },
  no_class: {
    en: ['The course has no ENARA class yet, so its roster cannot be synced.', 'A teacher opens the ENARA activity once; this creates the class.'],
    ar: ['ليس للمقرر صف في ENARA بعد، لذلك لا يمكن مزامنة قائمة طلابه.', 'يفتح المعلم نشاط ENARA مرة واحدة، فيُنشأ الصف.'],
  },
  bad_memberships_url: {
    en: ['The LMS gave a roster address ENARA cannot use (not https).', SUPPORT_EN],
    ar: ['قدم نظام إدارة التعلم عنوان قائمة طلاب لا يستطيع ENARA استخدامه (ليس https).', SUPPORT_AR],
  },
  memberships_invalid_response: {
    en: ["The LMS's roster answer could not be read.", 'ENARA tries again at the next sync. If it stays, send this code to ENARA support.'],
    ar: ['تعذرت قراءة قائمة الطلاب التي أرسلها نظام إدارة التعلم.', 'يعيد ENARA المحاولة في المزامنة التالية. إذا استمر ذلك فأرسل هذا الرمز إلى دعم ENARA.'],
  },
  memberships_bad_next_link: {
    en: ["The roster's next-page link was invalid, so ENARA stopped reading it.", SUPPORT_EN],
    ar: ['كان رابط الصفحة التالية في قائمة الطلاب غير صالح، لذلك توقف ENARA عن قراءتها.', SUPPORT_AR],
  },
  memberships_next_other_origin: {
    en: ["The roster's next-page link pointed to another website, so ENARA stopped for safety.", SUPPORT_EN],
    ar: ['أشار رابط الصفحة التالية في قائمة الطلاب إلى موقع آخر، لذلك توقف ENARA حفاظًا على الأمان.', SUPPORT_AR],
  },
  roster_truncated: {
    en: ['The roster was too long to read in one sync, so nobody was removed this time.', 'Nothing to do; the next sync continues.'],
    ar: ['كانت قائمة الطلاب أطول من أن تُقرأ في مزامنة واحدة، لذلك لم يُحذف أحد هذه المرة.', 'لا حاجة لأي إجراء؛ تكمل المزامنة التالية العمل.'],
  },
  empty_roster: {
    en: ['The LMS sent an empty roster for a course that has students, so ENARA removed nobody (for safety).', 'Check that the course still has its students in the LMS.'],
    ar: ['أرسل نظام إدارة التعلم قائمة طلاب فارغة لمقرر فيه طلاب، لذلك لم يحذف ENARA أحدًا (حفاظًا على الأمان).', 'تحقق من أن المقرر ما زال يضم طلابه في نظام إدارة التعلم.'],
  },
  more_next_run: {
    en: ['The roster sync reached its time limit; the rest is done at the next sync.', NOTHING_EN],
    ar: ['وصلت مزامنة قائمة الطلاب إلى حدها الزمني، ويُستكمل الباقي في المزامنة التالية.', NOTHING_AR],
  },
  sync_in_progress: {
    en: ['A roster sync was already running for this course.', NOTHING_EN],
    ar: ['كانت مزامنة قائمة الطلاب جارية بالفعل لهذا المقرر.', NOTHING_AR],
  },
  staff_as_learner: {
    en: ['The roster lists a teacher or admin account as a student in this course.', "Check the person's role in the LMS course."],
    ar: ['تُظهر قائمة الطلاب حساب معلم أو مسؤول بصفته طالبًا في هذا المقرر.', 'تحقق من دور الشخص في مقرر نظام إدارة التعلم.'],
  },
  account_error: {
    en: ["A roster member's ENARA account could not be created or updated.", SUPPORT_EN],
    ar: ['تعذر إنشاء حساب ENARA لأحد أعضاء قائمة الطلاب أو تحديثه.', SUPPORT_AR],
  },
  nrps_unavailable: {
    en: ['ENARA could not ask the LMS roster whether this person is a teacher (used for "preview as student").', 'Turn on "Names and Role Provisioning"; or a teacher opens the activity once as a teacher first.'],
    ar: ['تعذر على ENARA سؤال قائمة نظام إدارة التعلم عما إذا كان هذا الشخص معلمًا (يُستخدم في "المعاينة كطالب").', 'شغّل خدمة الأسماء والأدوار (Names and Role Provisioning)، أو يفتح المعلم النشاط مرة واحدة بصفته معلمًا أولًا.'],
  },
  // Registration (Phase 1b, Dynamic Registration).
  'registration.duplicate_lms': {
    en: ['Already connected: this LMS registered ENARA again for the same school (for example, a retry), so the school now has two connections from the same LMS.', 'Keep the connection you use and switch off the other one in LMS connections. Nothing is replaced automatically.'],
    ar: ['متصل بالفعل: سجّل نظام إدارة التعلم هذا ENARA مرة أخرى للمدرسة نفسها (مثلًا عند إعادة المحاولة)، فأصبح للمدرسة اتصالان من النظام نفسه.', 'احتفظ بالاتصال الذي تستخدمه وأوقف الاتصال الآخر من صفحة اتصالات نظام إدارة التعلم. لا يُستبدل أي شيء تلقائيًا.'],
  },
};

const HTTP_FAMILY = /^(token|lineitems|lineitem_create|score|results|memberships)_http_(\d{3})$/;

const toHelp = (e: Entry, status?: string): ProblemHelp => {
  const fill = (t: string) => (status ? t.replace('{status}', status) : t);
  return { known: true, en: { what: fill(e.en[0]), fix: fill(e.en[1]) }, ar: { what: fill(e.ar[0]), fix: fill(e.ar[1]) } };
};

/** The table entry for a code, or undefined. */
function entryFor(code: string, event?: string): { entry: Entry; status?: string } | undefined {
  const lti = (LTI_ERROR_HELP as Record<string, Entry>)[code];
  if (lti && Object.prototype.hasOwnProperty.call(LTI_ERRORS, code)) return { entry: lti };
  if (Object.prototype.hasOwnProperty.call(OTHER_HELP, code)) return { entry: OTHER_HELP[code] };
  const area = event?.split('.')[0];
  if (area && Object.prototype.hasOwnProperty.call(OTHER_HELP, `${area}.${code}`)) return { entry: OTHER_HELP[`${area}.${code}`] };
  const m = HTTP_FAMILY.exec(code);
  if (m) return { entry: OTHER_HELP[`${m[1]}_http`], status: m[2] };
  return undefined;
}

/** Plain-language help for a reference code; unknown codes get a generic text naming the code. */
export function helpFor(code: string, event?: string): ProblemHelp {
  const found = entryFor(code, event);
  if (found) return toHelp(found.entry, found.status);
  const safe = code.replace(/[^\w.:-]/g, '').slice(0, 80) || 'none';
  return {
    known: false,
    en: { what: `ENARA recorded a problem with the reference code "${safe}".`, fix: 'If it keeps happening, send this code and the time to ENARA support.' },
    ar: { what: `سجّل ENARA مشكلة برمز المرجع "${safe}".`, fix: 'إذا تكرر ذلك فأرسل هذا الرمز والوقت إلى دعم ENARA.' },
  };
}

/** Every code the table knows (tests check both languages for each). */
export function knownProblemCodes(): string[] {
  return [...Object.keys(LTI_ERROR_HELP), ...Object.keys(OTHER_HELP)];
}
