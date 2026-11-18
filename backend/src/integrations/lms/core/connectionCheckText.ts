import type { CheckStatus, CheckStepKey } from '../models/onboarding';

// Step 2: the plain-language result and fix of each connection check step, in
// English and Arabic (simple Modern Standard Arabic, Western digits), for the
// school connection status page and the Problems view. No personal data: the
// only value filled in is the Moodle address ({host}), e.g. moodle.school.eg.
//
// Lookup (checkText): a special code first (moodle_unreachable, link_expired,
// ...), then the step's own text for its status.

export interface CheckText {
  what: string;
  fix: string;
}
export interface CheckHelp {
  en: CheckText;
  ar: CheckText;
}
type Pair = [string, string];
type Entry = { en: Pair; ar: Pair };

const NOTHING_EN = 'Nothing to do.';
const NOTHING_AR = 'لا حاجة لأي إجراء.';

/**
 * S4: ENARA runs on Vercel and has no fixed IP address, so IT must allow
 * ENARA to reach the Moodle address BY NAME (never "allow this IP").
 */
export const ON_PREMISE: Entry = {
  en: [
    "Your Moodle can't be reached from the internet. Students and teachers can still open ENARA (launches go through their browser), but to send grades and sync class lists ENARA must reach {host}.",
    'Ask your IT team to allow ENARA to reach {host} over https from the internet. ENARA has no fixed IP address, so allow the address by name, not by IP. Until then you can connect by hand with Moodle\'s public key pasted into ENARA (LMS connections › "Or by hand", Public key), so launches are checked without ENARA reaching Moodle.',
  ],
  ar: [
    'لا يمكن الوصول إلى Moodle الخاص بكم من الإنترنت. ما زال الطلاب والمعلمون يستطيعون فتح ENARA (لأن الفتح يمر عبر متصفحهم)، لكن لإرسال الدرجات ومزامنة قوائم الطلاب يجب أن يصل ENARA إلى {host}.',
    'اطلب من فريق تقنية المعلومات السماح لـ ENARA بالوصول إلى {host} عبر https من الإنترنت. ليس لـ ENARA عنوان IP ثابت، لذلك اسمحوا بالعنوان بالاسم لا بعنوان IP. وإلى ذلك الحين يمكنكم الربط يدويًا بلصق المفتاح العام لـ Moodle في ENARA (اتصالات نظام إدارة التعلم › "أو يدويًا"، المفتاح العام)، فيُتحقق من الفتح دون أن يصل ENARA إلى Moodle.',
  ],
};

/** Special codes (any step). */
const CODE_TEXT: Record<string, Entry> = {
  moodle_unreachable: ON_PREMISE,
  link_not_used: {
    en: ["The link wasn't used yet.", 'The Moodle site administrator pastes the link in Moodle: Site administration › Plugins › Activity modules › External tool › Manage tools › Tool URL, then Add LTI Advantage.'],
    ar: ['لم يُستخدم الرابط بعد.', 'يلصق مسؤول موقع Moodle الرابط في Moodle: إدارة الموقع › الإضافات › وحدات الأنشطة › أداة خارجية › إدارة الأدوات › Tool URL، ثم Add LTI Advantage.'],
  },
  link_expired: {
    en: ['The link expired before it was used.', 'Make a new link (New link) and send it again.'],
    ar: ['انتهت صلاحية الرابط قبل استخدامه.', 'أنشئ رابطًا جديدًا (رابط جديد) وأرسله مرة أخرى.'],
  },
  no_link: {
    en: ['There is no unused link for this school.', 'Make a new link (New link) and send it to the Moodle site administrator.'],
    ar: ['لا يوجد رابط غير مستخدم لهذه المدرسة.', 'أنشئ رابطًا جديدًا (رابط جديد) وأرسله إلى مسؤول موقع Moodle.'],
  },
  registration_could_not_reach: {
    en: ["Moodle opened the link, but ENARA could not read Moodle's settings address, so the registration did not finish. This usually means the internet cannot reach your Moodle.", 'Ask your IT team to allow ENARA to reach your Moodle address by name over https (ENARA has no fixed IP), then open the same link again. Or connect by hand with Moodle\'s public key (LMS connections › "Or by hand").'],
    ar: ['فتح Moodle الرابط، لكن ENARA لم يستطع قراءة عنوان إعدادات Moodle، فلم يكتمل التسجيل. يعني هذا عادةً أن Moodle غير متاح من الإنترنت.', 'اطلب من فريق تقنية المعلومات السماح لـ ENARA بالوصول إلى عنوان Moodle بالاسم عبر https (ليس لـ ENARA عنوان IP ثابت)، ثم افتح الرابط نفسه مرة أخرى. أو اربط يدويًا بالمفتاح العام لـ Moodle (اتصالات نظام إدارة التعلم › "أو يدويًا").'],
  },
  registration_failed_retry: {
    en: ['Moodle opened the link but the registration failed (see the Reference code). The link still works.', 'Try again from Moodle with the same link. If it fails again, send the Reference code to ENARA support.'],
    ar: ['فتح Moodle الرابط لكن التسجيل فشل (انظر رمز المرجع). ما زال الرابط صالحًا.', 'حاول مرة أخرى من Moodle بالرابط نفسه. إذا فشل مرة أخرى فأرسل رمز المرجع إلى دعم ENARA.'],
  },
  platform_pending: {
    en: ['The connection is registered and waits for approval by ENARA.', 'ENARA approves it in LMS connections. Nothing to do in Moodle.'],
    ar: ['الاتصال مسجل وينتظر موافقة ENARA.', 'يوافق عليه فريق ENARA من صفحة اتصالات نظام إدارة التعلم. لا حاجة لأي إجراء في Moodle.'],
  },
  platform_disabled: {
    en: ['The connection is switched off in ENARA.', 'Switch it on again in LMS connections if it is still needed.'],
    ar: ['الاتصال متوقف في ENARA.', 'شغّله مرة أخرى من صفحة اتصالات نظام إدارة التعلم إذا كان ما زال مطلوبًا.'],
  },
  no_deployment: {
    en: ['The connection has no deployment, so launches would be refused.', 'Make a new link and register again from Moodle, or send this code to ENARA support.'],
    ar: ['ليس للاتصال نشر (deployment)، لذلك سيُرفض فتح الأنشطة.', 'أنشئ رابطًا جديدًا وسجّل مرة أخرى من Moodle، أو أرسل هذا الرمز إلى دعم ENARA.'],
  },
  manual_key: {
    en: ["Launches are checked with the public key pasted into ENARA, so ENARA does not need to reach Moodle's key address.", 'Nothing to do for launches. Grades and class lists still need ENARA to reach Moodle.'],
    ar: ['يُتحقق من الفتح بالمفتاح العام الملصق في ENARA، فلا يحتاج ENARA إلى الوصول إلى عنوان مفاتيح Moodle.', 'لا حاجة لأي إجراء للفتح. ما زالت الدرجات وقوائم الطلاب تحتاج إلى وصول ENARA إلى Moodle.'],
  },
  keyset_invalid: {
    en: ["Moodle's key address answered, but not with keys ENARA can read.", "Check that the connection's Public keyset URL is Moodle's (…/mod/lti/certs.php). If it is, send this code to ENARA support."],
    ar: ['أجاب عنوان مفاتيح Moodle، لكن ليس بمفاتيح يستطيع ENARA قراءتها.', 'تحقق من أن رابط المفاتيح العامة في الاتصال هو رابط Moodle (…/mod/lti/certs.php). إذا كان كذلك فأرسل هذا الرمز إلى دعم ENARA.'],
  },
  no_keyset: {
    en: ['The connection has no Public keyset URL and no pasted public key.', 'Paste Moodle\'s public key into the connection, or register again with a new link.'],
    ar: ['ليس للاتصال رابط مفاتيح عامة ولا مفتاح عام ملصق.', 'الصق المفتاح العام لـ Moodle في الاتصال، أو سجّل مرة أخرى برابط جديد.'],
  },
  no_token_url: {
    en: ['The connection has no Access token URL, so ENARA cannot send grades or read class lists.', 'Register again with a new link, or ask ENARA support to add the Access token URL.'],
    ar: ['لا يحتوي الاتصال على رابط رمز الوصول (Access token URL)، لذلك لا يستطيع ENARA إرسال الدرجات أو قراءة قوائم الطلاب.', 'سجّل مرة أخرى برابط جديد، أو اطلب من دعم ENARA إضافة رابط رمز الوصول.'],
  },
  services_after_activate: {
    en: ['Moodle does not give ENARA access to grades and class lists yet. Moodle gives it once the tool is activated.', 'Click Activate in Moodle and open ENARA once, then click Check again.'],
    ar: ['لا يمنح Moodle إنارة الوصول إلى الدرجات وقوائم الطلاب بعد. يمنحه بعد تفعيل الأداة.', 'اضغط على Activate في Moodle وافتح ENARA مرة واحدة، ثم اضغط على "تحقق مرة أخرى".'],
  },
  roster_off: {
    en: ['Class list sync is switched off on ENARA.', 'Nothing to do for now; ENARA switches it on when it is ready for your school.'],
    ar: ['مزامنة قوائم الطلاب متوقفة في ENARA.', 'لا حاجة لأي إجراء الآن؛ يشغّلها فريق ENARA عندما تكون جاهزة لمدرستكم.'],
  },
  grades_off: {
    en: ['Sending grades is switched off on ENARA.', 'Nothing to do for now; ENARA switches it on when it is ready for your school.'],
    ar: ['إرسال الدرجات متوقف في ENARA.', 'لا حاجة لأي إجراء الآن؛ يشغّله فريق ENARA عندما يكون جاهزًا لمدرستكم.'],
  },
};

/** Each step's text for its status (used when the code has no special text). */
const STEP_TEXT: Record<CheckStepKey, Partial<Record<CheckStatus, Entry>>> = {
  registered: {
    ok: { en: ['Moodle registered ENARA (connection and deployment stored).', NOTHING_EN], ar: ['سجّل Moodle إنارة (حُفظ الاتصال والنشر).', NOTHING_AR] },
    waiting: CODE_TEXT.link_not_used,
    fail: { en: ['The registration is not complete.', 'Make a new link and register again from Moodle.'], ar: ['التسجيل غير مكتمل.', 'أنشئ رابطًا جديدًا وسجّل مرة أخرى من Moodle.'] },
  },
  reachable: {
    ok: { en: ["ENARA can reach Moodle (it read Moodle's public keys).", NOTHING_EN], ar: ['يستطيع ENARA الوصول إلى Moodle (قرأ المفاتيح العامة لـ Moodle).', NOTHING_AR] },
    fail: { en: ["ENARA could not read Moodle's key address (HTTP error).", "Check that Moodle is online and that the connection's Public keyset URL is Moodle's. If it stays, send this code to ENARA support."], ar: ['لم يستطع ENARA قراءة عنوان مفاتيح Moodle (خطأ HTTP).', 'تحقق من أن Moodle يعمل ومن أن رابط المفاتيح العامة في الاتصال هو رابط Moodle. إذا استمر ذلك فأرسل هذا الرمز إلى دعم ENARA.'] },
  },
  services: {
    ok: { en: ['Moodle gives ENARA access to grades and class lists.', NOTHING_EN], ar: ['يمنح Moodle إنارة الوصول إلى الدرجات وقوائم الطلاب.', NOTHING_AR] },
    waiting: CODE_TEXT.services_after_activate,
    fail: {
      en: ["Moodle didn't allow grades and class lists.", 'In Moodle, open the ENARA tool settings (gear icon) and set "IMS LTI Assignment and Grade Services" to "Use this service for grade sync and column management" and "IMS LTI Names and Role Provisioning" to "Use this service to retrieve members\' information as per privacy settings". Save, then click Check again.'],
      ar: ['لم يسمح Moodle بالدرجات وقوائم الطلاب.', 'في Moodle افتح إعدادات أداة ENARA (رمز الترس) واجعل "IMS LTI Assignment and Grade Services" على "Use this service for grade sync and column management" و"IMS LTI Names and Role Provisioning" على "Use this service to retrieve members\' information as per privacy settings". احفظ ثم اضغط على "تحقق مرة أخرى".'],
    },
  },
  activated: {
    ok: { en: ['ENARA was opened from Moodle (the tool is activated).', NOTHING_EN], ar: ['فُتح ENARA من Moodle (الأداة مفعّلة).', NOTHING_AR] },
    waiting: { en: ['Nobody has opened ENARA from Moodle yet.', 'Click Activate in Moodle, add ENARA to a course, then open it once.'], ar: ['لم يفتح أحد ENARA من Moodle بعد.', 'اضغط على Activate في Moodle، وأضف ENARA إلى مقرر، ثم افتحه مرة واحدة.'] },
  },
  roster: {
    ok: { en: ['A class list was read from Moodle.', NOTHING_EN], ar: ['قُرئت قائمة طلاب من Moodle.', NOTHING_AR] },
    waiting: { en: ['No class list was read yet.', 'A teacher opens ENARA from a Moodle course; ENARA then reads its class list.'], ar: ['لم تُقرأ أي قائمة طلاب بعد.', 'يفتح المعلم ENARA من مقرر في Moodle، فيقرأ ENARA قائمة طلابه.'] },
    fail: {
      en: ["Class lists can't be read from Moodle.", 'In Moodle, open the ENARA tool settings and set "IMS LTI Names and Role Provisioning" to "Use this service to retrieve members\' information as per privacy settings". Save, then click Check again.'],
      ar: ['لا يمكن قراءة قوائم الطلاب من Moodle.', 'في Moodle افتح إعدادات أداة ENARA واجعل "IMS LTI Names and Role Provisioning" على "Use this service to retrieve members\' information as per privacy settings". احفظ ثم اضغط على "تحقق مرة أخرى".'],
    },
  },
  grades: {
    ok: { en: ['ENARA can send grades to Moodle.', NOTHING_EN], ar: ['يستطيع ENARA إرسال الدرجات إلى Moodle.', NOTHING_AR] },
    waiting: { en: ['No grade was sent yet, and no course has opened ENARA yet.', 'Add an ENARA activity to a course and open it once; grades follow after a student finishes it.'], ar: ['لم تُرسل أي درجة بعد، ولم يفتح أي مقرر ENARA بعد.', 'أضف نشاط ENARA إلى مقرر وافتحه مرة واحدة؛ تُرسل الدرجات بعد أن يُنهيه طالب.'] },
    fail: {
      en: ["Grades can't be sent to Moodle.", 'In Moodle, open the ENARA tool settings: set "IMS LTI Assignment and Grade Services" to "Use this service for grade sync and column management" and, under Privacy, "Accept grades from the tool" to "Always". Save, then click Check again.'],
      ar: ['لا يمكن إرسال الدرجات إلى Moodle.', 'في Moodle افتح إعدادات أداة ENARA: اجعل "IMS LTI Assignment and Grade Services" على "Use this service for grade sync and column management"، ومن قسم الخصوصية اجعل "Accept grades from the tool" على "Always". احفظ ثم اضغط على "تحقق مرة أخرى".'],
    },
  },
};

const HOST_EN = 'your Moodle address';
const HOST_AR = 'عنوان Moodle الخاص بكم';

const fill = (t: string, host: string) => t.split('{host}').join(host);

/** The text for one step result. */
export function checkText(step: CheckStepKey, status: CheckStatus, code: string, host?: string): CheckHelp {
  const e = CODE_TEXT[code] ?? STEP_TEXT[step][status] ?? STEP_TEXT[step].fail ?? STEP_TEXT[step].waiting!;
  const hostEn = host || HOST_EN;
  const hostAr = host || HOST_AR;
  return { en: { what: fill(e.en[0], hostEn), fix: fill(e.en[1], hostEn) }, ar: { what: fill(e.ar[0], hostAr), fix: fill(e.ar[1], hostAr) } };
}

/** For the Problems view (problemHelp.ts): 'connection.<code>' entries, no host. */
export function connectionProblemEntries(): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const [code, e] of Object.entries(CODE_TEXT)) {
    out[`connection.${code}`] = { en: [fill(e.en[0], HOST_EN), fill(e.en[1], HOST_EN)], ar: [fill(e.ar[0], HOST_AR), fill(e.ar[1], HOST_AR)] };
  }
  // A failed step with a generic code (e.g. token_http_401) is found by its HTTP family in problemHelp.
  return out;
}
