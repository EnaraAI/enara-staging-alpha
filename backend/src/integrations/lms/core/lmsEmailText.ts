// LMS emails: the code-owned sentences (never free text) that fill REASON,
// FIX, CAUSE, PROBLEM, ITEM, BY_ROLE, KEY_STATE and TOP_REASON, in English and
// Arabic (simple Modern Standard Arabic, Western digits; plan
// LMS_EMAIL_TEMPLATES_PLAN.md section 5). ‹…› marks a Latin token that the
// Arabic email wraps in <span dir="ltr"> (lmsEmail.ts, owned()). No text
// contains personal data; {lms} and {id} are filled with a connection name or
// an ID.

export type Lang = 'en' | 'ar';
export type Bi = Record<Lang, string>;
type Pair = { reason: Bi; fix: Bi };

/** 4c: why an ENARA admin did not approve a connection (owner decision D6: a fixed list, no free text). */
export const REJECT_REASONS: Record<string, Pair> = {
  values_mismatch: {
    reason: { en: "The Platform ID or Client ID doesn't match the Moodle site.", ar: 'معرّف المنصة أو معرّف العميل لا يطابق موقع Moodle.' },
    fix: { en: "Copy them again from the tool's configuration details in Moodle.", ar: 'انسخهما مرة أخرى من تفاصيل إعداد الأداة في Moodle.' },
  },
  already_connected: {
    reason: { en: 'This Moodle site is already connected to another school on Enara.', ar: 'موقع Moodle هذا مرتبط بالفعل بمدرسة أخرى على إنارة.' },
    fix: { en: 'Contact Enara support.', ar: 'تواصل مع دعم إنارة.' },
  },
  school_not_confirmed: {
    reason: { en: "We couldn't confirm that this Moodle site belongs to your school.", ar: 'تعذّر التأكد من أن موقع Moodle هذا تابع لمدرستك.' },
    fix: { en: "Reply through your Enara contact with the site's address.", ar: 'أرسل عنوان الموقع عبر ممثل إنارة لديكم.' },
  },
};
export const REJECT_REASON_CODES = Object.keys(REJECT_REASONS);

const NRPS: Pair = {
  reason: { en: 'The class list service is off for the Enara tool in Moodle.', ar: 'خدمة قوائم الأسماء والأدوار متوقفة لأداة إنارة في Moodle.' },
  fix: {
    en: 'In the tool settings, set "IMS LTI Names and Role Provisioning" to use the service, then have a teacher open the activity once.',
    ar: 'في إعدادات الأداة فعّل خدمة ‹IMS LTI Names and Role Provisioning›، ثم اطلب من معلم فتح النشاط مرة واحدة.',
  },
};
const NETWORK: Pair = {
  reason: { en: "Moodle didn't answer in time.", ar: 'لم يستجب Moodle في الوقت المحدد.' },
  fix: { en: 'Enara tries again tonight. If it keeps happening, check that the Moodle site is online and reachable from the internet.', ar: 'ستعيد إنارة المحاولة الليلة. إذا تكرر ذلك فتأكد من أن موقع Moodle يعمل ويمكن الوصول إليه من الإنترنت.' },
};
const KEY_TOKEN: Pair = {
  reason: { en: "Moodle didn't accept Enara's key.", ar: 'لم يقبل Moodle مفتاح إنارة.' },
  fix: {
    en: 'In the tool settings in Moodle, set Public key type to "Keyset URL" and use Enara\'s keyset address from the LMS connections page; don\'t paste a fixed key.',
    ar: 'في إعدادات الأداة في Moodle اجعل نوع المفتاح العام ‹Keyset URL› واستخدم عنوان مفاتيح إنارة من صفحة ربط نظام التعلّم، ولا تلصق مفتاحًا ثابتًا.',
  },
};

/** 7: the key problem codes (launch: jwks_unavailable, unknown_kid, invalid_signature; services: token_http_400/401). */
export const KEY_PROBLEM_TEXT: Record<string, Pair> = {
  jwks_unavailable: {
    reason: { en: "Enara couldn't reach Moodle's public keyset address.", ar: 'تعذّر على إنارة الوصول إلى عنوان المفاتيح العامة في Moodle.' },
    fix: {
      en: 'Check that the Moodle site is online and that its keyset address (ending in /mod/lti/certs.php) opens from the internet.',
      ar: 'تأكد من أن موقع Moodle يعمل وأن عنوان المفاتيح (المنتهي بـ ‹/mod/lti/certs.php›) يُفتح من الإنترنت.',
    },
  },
  unknown_kid: {
    reason: { en: "Moodle signed sign-ins with a key Enara doesn't recognise, often after the site moved or its keys changed.", ar: 'وقّع Moodle طلبات الدخول بمفتاح لا تعرفه إنارة، وغالبًا ما يحدث ذلك بعد نقل الموقع أو تغيير مفاتيحه.' },
    fix: { en: "Make sure the Public keyset URL saved in Enara is Moodle's current one.", ar: 'تأكد من أن عنوان المفاتيح العامة المحفوظ في إنارة هو العنوان الحالي في Moodle.' },
  },
  token_http_400: KEY_TOKEN,
  token_http_401: KEY_TOKEN,
};
KEY_PROBLEM_TEXT.invalid_signature = KEY_PROBLEM_TEXT.unknown_kid;
export const KEY_PROBLEM_CODES = Object.keys(KEY_PROBLEM_TEXT);

/** 9: why a class list sync failed (table 5 codes plus no_class, timeout/network, internal_error). */
export function rosterFailText(code: string): Pair {
  if (code === 'nrps_not_allowed' || code === 'no_memberships_url' || /^memberships_http_/.test(code)) return NRPS;
  if (code === 'no_class') {
    return {
      reason: { en: 'The Enara class for this course is missing; a teacher should open the activity once.', ar: 'صف إنارة الخاص بهذا المقرر غير موجود؛ يجب أن يفتح المعلم النشاط مرة واحدة.' },
      fix: { en: 'Ask a teacher of the course to open the Enara activity once from Moodle.', ar: 'اطلب من أحد معلمي المقرر فتح نشاط إنارة مرة واحدة من Moodle.' },
    };
  }
  if (code === 'timeout' || code === 'network' || /_timeout$|_network$/.test(code)) return NETWORK;
  if (KEY_PROBLEM_TEXT[code]) return KEY_PROBLEM_TEXT[code];
  if (code === 'platform_not_active') {
    return {
      reason: { en: 'The connection is switched off.', ar: 'الربط متوقف.' },
      fix: { en: 'Switch the connection back on, or contact Enara support.', ar: 'أعد تشغيل الربط، أو تواصل مع دعم إنارة.' },
    };
  }
  return {
    reason: { en: "Something went wrong on our side; we'll retry tonight.", ar: 'حدث خطأ من جهتنا، وسنعيد المحاولة الليلة.' },
    fix: { en: 'Nothing to do now. If it keeps happening, send the reference below to Enara support.', ar: 'لا حاجة لأي إجراء الآن. إذا تكرر ذلك فأرسل الرقم المرجعي أدناه إلى دعم إنارة.' },
  };
}

/** 8: the most common reason grades were not sent (short). */
export function gradeFailReason(code: string): Bi {
  if (code === 'lineitem_gone' || /_http_(404|410)$/.test(code)) return { en: 'The activity may have been deleted in Moodle', ar: 'ربما حُذف النشاط في Moodle' };
  if (/_http_40[13]$/.test(code)) return { en: 'Moodle refused access', ar: 'رفض Moodle الوصول' };
  if (/timeout|network/.test(code)) return { en: "Moodle didn't answer in time", ar: 'لم يستجب Moodle في الوقت المحدد' };
  if (code === 'platform_not_active') return { en: 'The connection is switched off', ar: 'الربط متوقف' };
  return { en: `Moodle refused the grade (${code})`, ar: `رفض Moodle الدرجة (‹${code}›)` };
}

/** E6: why removals were skipped. */
export const REMOVALS_SKIPPED_REASON: Record<string, Bi> = {
  roster_truncated: { en: 'The list was too long to read at once; Enara continues at the next sync.', ar: 'كانت القائمة أطول من أن تُقرأ دفعة واحدة، وستتابع إنارة في المزامنة القادمة.' },
  empty_roster: { en: 'Moodle returned no active students. If the course really has none, you can ignore this.', ar: 'لم يُرجع Moodle أي طالب نشط. إذا كان المقرر خاليًا فعلًا، يمكنك تجاهل هذه الرسالة.' },
};

/** 4a / E3: what is waiting for approval. */
export function pendingItem(kind: 'connection' | 'deployment', lang: Lang, value: string): string {
  if (kind === 'connection') return lang === 'ar' ? `طلب ربط ‹${value}›` : `the connection for ${value}`;
  return lang === 'ar' ? `تثبيتًا جديدًا في Moodle (رقم التثبيت ‹${value}›)` : `a new Moodle installation (Deployment ID ${value})`;
}

/** 19 (ops, English only). */
export const OPS_APPROVAL_ITEM = {
  connection: 'new connection added by a school admin',
  deployment: 'new deployment added by a school admin',
  autoDeployment: 'deployment created automatically at a launch',
} as const;

/** 6 and 18: who did it (role only, never a name). */
export function byRole(role: 'enara' | 'school' | 'system', lang: Lang): string {
  if (role === 'enara') return lang === 'ar' ? 'أحد مسؤولي إنارة' : 'an Enara administrator';
  if (role === 'school') return lang === 'ar' ? 'أحد مسؤولي المدرسة' : 'a school administrator';
  return lang === 'ar' ? 'إنارة تلقائيًا' : 'Enara automatically';
}

/** 12a/12b/12c (not wired yet): what the request covers. */
export function scopeText(kind: 'school' | 'course', lang: Lang, name: string): string {
  if (kind === 'school') return lang === 'ar' ? `المدرسة بالكامل، ${name}` : `the whole school, ${name}`;
  return lang === 'ar' ? `المقرر «${name}»` : `the course "${name}"`;
}

/** One entry per course: its title for one course, "3 courses" / "3 مقررات" for more (Arabic plural rules, Western digits). */
export function courseLabel(titles: (string | undefined)[], lang: Lang): string {
  const n = titles.length;
  if (n <= 1) return titles[0]?.trim() || (lang === 'ar' ? 'مقررك' : 'your course');
  if (lang === 'en') return `${n} courses`;
  switch (new Intl.PluralRules('ar').select(n)) {
    case 'two': return 'مقرران';
    case 'few': return `${n} مقررات`;
    case 'many': return `${n} مقررًا`;
    default: return `${n} مقرر`;
  }
}
