// LMS Phase 2b: a generic launch target (owner decision D12).
//
// An LMS activity may carry the LTI custom parameter
//
//   enara_target=<page key>
//
// instead of a binding to ENARA work (enara_assessment / enara_assignment;
// both at once refuse the launch, invalid_activity_binding). The launch then
// lands on that page of ENARA for the account's role. The page keys are a
// fixed allowlist (below); each names the app page a student or a staff
// account opens. The rules:
//   - a student only ever gets student pages, staff only staff pages (teacher
//     pages: never a school-admin page; admins sign in to ENARA directly, D10,
//     so no admin page is offered);
//   - an unknown key, or a page the role may not open, lands on that role's
//     home (a student who opens a teacher-only link lands on their own home);
//   - "home" is the course link: a student's dashboard (the launch already
//     made the course's class their current class), a teacher's Teaching
//     Dashboard for the course's class;
//   - Enara Kids students: the app maps the student pages to the kids
//     equivalents (frontend roleRouting.kidsTabForLmsPage), or kids home.
// A page target is never graded: no grade column in the picker (no lineItem),
// and the grade outbox never queues anything for such a link (outbox.ts).

import { lmsFlags } from './flags';

export const TARGET_PARAM = 'enara_target';

export type PageTargetRole = 'student' | 'teacher' | 'admin';

export interface PageTargetDef {
  key: string;
  /** The student app page (standard student portal). Absent: staff only. */
  student?: string;
  /** The staff portal page (teacher and school admin). Absent: student only. */
  staff?: string;
  label: { en: string; ar: string };
  description: { en: string; ar: string };
  /** Phase 8: a no-grade ENARA activity (tutor, live avatar, diagnostic), not a plain page. Behind LMS_NO_GRADE_ACTIVITIES_ENABLED. */
  activity?: LmsActivityKind;
}

/** Phase 8 (activities.ts): the three no-grade activities. */
export type LmsActivityKind = 'tutor' | 'avatar' | 'diagnostic';

export const STUDENT_HOME_PAGE = 'dashboard';
export const STAFF_HOME_PAGE = 'teaching';

/** The allowlist, in the order the picker shows it. */
export const PAGE_TARGETS: readonly PageTargetDef[] = [
  {
    key: 'home',
    student: STUDENT_HOME_PAGE,
    staff: STAFF_HOME_PAGE,
    label: { en: 'ENARA home (course link)', ar: 'الصفحة الرئيسية لإنارة (رابط المقرر)' },
    description: { en: 'One ENARA link for everyone: students open their dashboard, teachers the Teaching Dashboard for this class.', ar: 'رابط واحد لإنارة للجميع: يفتح الطلاب لوحتهم، ويفتح المعلمون لوحة التدريس لهذا الفصل.' },
  },
  // Student pages.
  { key: 'my-learning', student: 'courses', label: { en: 'My learning', ar: 'تعلّمي' }, description: { en: "The student's courses and lessons.", ar: 'مقررات الطالب ودروسه.' } },
  { key: 'my-progress', student: 'progress', label: { en: 'My progress', ar: 'تقدّمي' }, description: { en: "The student's skills and progress.", ar: 'مهارات الطالب وتقدّمه.' } },
  { key: 'my-assignments', student: 'assignments-student', label: { en: 'My assignments', ar: 'واجباتي' }, description: { en: "The student's assignments and due dates.", ar: 'واجبات الطالب ومواعيد تسليمها.' } },
  { key: 'study-plan', student: 'study-plan', label: { en: 'Study plan', ar: 'خطة الدراسة' }, description: { en: "The student's study plan.", ar: 'خطة الدراسة للطالب.' } },
  { key: 'results', student: 'results', label: { en: 'My results', ar: 'نتائجي' }, description: { en: "The student's results.", ar: 'نتائج الطالب.' } },
  // Teacher pages (staff portal; never a school-admin page).
  { key: 'teaching', staff: 'teaching', label: { en: 'Teaching Dashboard', ar: 'لوحة التدريس' }, description: { en: 'The Teaching Dashboard for this class.', ar: 'لوحة التدريس لهذا الفصل.' } },
  { key: 'class-assignments', staff: 'class-assignments', label: { en: 'Class assignments', ar: 'واجبات الفصل' }, description: { en: "This class's assignments.", ar: 'واجبات هذا الفصل.' } },
  { key: 'grading', staff: 'grading', label: { en: 'Grading', ar: 'التصحيح' }, description: { en: 'Answers waiting for review.', ar: 'الإجابات التي تنتظر المراجعة.' } },
  { key: 'class-insights', staff: 'class-insights', label: { en: 'Class insights', ar: 'رؤى الفصل' }, description: { en: "This class's results and insights.", ar: 'نتائج هذا الفصل ورؤاه.' } },
  { key: 'lesson-planner', staff: 'lesson-planner', label: { en: 'Lesson planner', ar: 'مخطط الدروس' }, description: { en: 'Plan lessons with ENARA.', ar: 'خطط الدروس مع إنارة.' } },
  { key: 'assessment-builder', staff: 'assessment-builder', label: { en: 'Assessment builder', ar: 'منشئ التقييمات' }, description: { en: 'Create and edit assessments.', ar: 'أنشئ التقييمات وعدّلها.' } },
  { key: 'curriculum', staff: 'curriculum', label: { en: 'Curriculum', ar: 'المنهج' }, description: { en: "The school's curriculum.", ar: 'منهج المدرسة.' } },
];

// LMS Phase 8 ("more activities, no grade"): three ENARA activities opened
// through the same enara_target door (B1). Each key names one app page; the
// student portal renders the activity there, the staff portal an overview of
// it for the course's class (see activities.ts). Kept off the "ENARA pages"
// picker list: they have picker types of their own (pickerActivities.ts).
// While LMS_NO_GRADE_ACTIVITIES_ENABLED is off, a launch of one of these keys
// lands on the role's home (fallback 'disabled'). Never graded, like every
// page target.
export const ACTIVITY_TARGETS: readonly PageTargetDef[] = [
  {
    key: 'tutor-session',
    activity: 'tutor',
    student: 'activity-tutor',
    staff: 'activity-tutor',
    label: { en: 'AI tutor session', ar: 'جلسة مع المعلم الذكي' },
    description: { en: "A conversation with ENARA's AI tutor (typing or voice). No grade.", ar: 'محادثة مع المعلم الذكي في إنارة (بالكتابة أو بالصوت). بدون درجة.' },
  },
  {
    key: 'live-avatar',
    activity: 'avatar',
    student: 'activity-avatar',
    staff: 'activity-avatar',
    label: { en: 'Live avatar session', ar: 'جلسة مع المعلم المرئي' },
    description: { en: "A live voice call with ENARA's video tutor. Needs the microphone. No grade.", ar: 'مكالمة صوتية مباشرة مع المعلم المرئي في إنارة. تحتاج إلى الميكروفون. بدون درجة.' },
  },
  {
    key: 'diagnostic',
    activity: 'diagnostic',
    student: 'activity-diagnostic',
    staff: 'activity-diagnostic',
    label: { en: 'Diagnostic check', ar: 'اختبار تشخيصي' },
    description: { en: 'A short adaptive check of what the student knows, objective by objective. A report, not a grade.', ar: 'فحص قصير متكيّف لما يعرفه الطالب، هدفاً بعد هدف. تقرير وليس درجة.' },
  },
];

const BY_KEY = new Map([...PAGE_TARGETS, ...ACTIVITY_TARGETS].map((p) => [p.key, p]));

/** The activity target for a kind. */
export const activityTargetDef = (kind: LmsActivityKind): PageTargetDef => ACTIVITY_TARGETS.find((p) => p.activity === kind)!;

export const pageTargetDef = (key: string): PageTargetDef | undefined => BY_KEY.get(key);

/** A page only staff can open (shown as "Teachers only" in the picker). */
export const isTeacherOnly = (p: PageTargetDef) => !p.student && !!p.staff;

/** The raw enara_target the activity asks for (trimmed); null when it names none. */
export function pageTargetRequest(custom: Record<string, string> | undefined): string | null {
  const raw = custom?.[TARGET_PARAM];
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v.slice(0, 60) : null;
}

export interface ResolvedPageTarget {
  /** The allowlisted key that is opened ('home' on a fallback). */
  key: string;
  /** The app page for this role. */
  page: string;
  /** Why the requested key was not opened as asked. */
  fallback?: 'unknown' | 'forbidden' | 'disabled';
  /** Phase 8: the activity this key opens. */
  activity?: LmsActivityKind;
}

/** Where a launch with enara_target lands, for the role the session opens (a student preview is 'student'). */
export function resolvePageTarget(requested: string, role: PageTargetRole): ResolvedPageTarget {
  const def = pageTargetDef(requested.toLowerCase());
  const home = role === 'student' ? STUDENT_HOME_PAGE : STAFF_HOME_PAGE;
  if (!def) return { key: 'home', page: home, fallback: 'unknown' };
  if (def.activity && !lmsFlags().noGradeActivities) return { key: 'home', page: home, fallback: 'disabled' };
  const page = role === 'student' ? def.student : def.staff;
  if (!page) return { key: 'home', page: home, fallback: 'forbidden' };
  return { key: def.key, page, ...(def.activity ? { activity: def.activity } : {}) };
}
