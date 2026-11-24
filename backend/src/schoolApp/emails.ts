import { getAppUrl } from '../email/links';
import { parentEmailsEnabled } from '../email/sendParentTemplate';
import { Institution } from '../models/Institution';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import { logger, serializeError } from '../utils/logging';
import { parentRecipient, sendParentEmailOnce } from '../parents/parentEmails';

// Parents school app, step a4: an email for each new in-app school notification (absence, lateness, announcement), through the
// same parent email path as every other parent email (PARENT_EMAILS_ENABLED; on lms-test: one captured or test-inbox copy, the daily
// ceiling, never twice per key). Needs the school's notifications section on (checked by the caller) and the parent's own setting:
//   emailPrefs.schoolAttendance     absence and lateness (default on)
//   emailPrefs.schoolAnnouncements  announcements (default on)
//   emailPrefs.schoolFees           fee reminders (step b; default on)
//   emailPrefs.schoolBus            bus delay / cancel notices (step c; default on)
//   emailPrefs.schoolRequests       answers to requests and new consent forms (step d; default on)
// Only parents with a usable address get one (code-only accounts have none). SMS and WhatsApp: later.
export interface NoticeDoc { parentUserId: string; studentId: string; institutionId: string; kind: 'absence' | 'late' | 'announcement' | 'fee_due' | 'bus_notice' | 'request_update' | 'consent'; refId: string; date?: string; title: string; body: string; amount?: number; planName?: string; daysBefore?: number; minutes?: number; busKind?: 'delay' | 'cancel'; direction?: 'morning' | 'afternoon'; routeName?: string; childName?: string; requestStatus?: string; requestType?: string }

const firstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || '';
const dayLabel = (day: string, lang: 'en' | 'ar') => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`));
const MAX_PER_CALL = 1000;

export function headline(kind: NoticeDoc['kind'], lang: 'en' | 'ar', child: string, date: string | undefined, title: string, amount?: number, bus?: { busKind?: 'delay' | 'cancel'; direction?: 'morning' | 'afternoon'; minutes?: number; routeName?: string; requestStatus?: string }): string {
  if (kind === 'announcement') return title.slice(0, 200);
  if (kind === 'consent') return (lang === 'ar' ? `مطلوب ردّك بخصوص ${child}: ${title.replace(/^Consent needed: /, '')}` : `Your answer is needed for ${child}: ${title.replace(/^Consent needed: /, '')}`).slice(0, 200);
  if (kind === 'request_update') {
    const st = bus?.requestStatus ?? '';
    const ar: Record<string, string> = { new: 'جديد', in_progress: 'قيد التنفيذ', done: 'تم', refused: 'مرفوض' };
    const en: Record<string, string> = { new: 'new', in_progress: 'in progress', done: 'done', refused: 'refused' };
    return lang === 'ar' ? `طلبك بخصوص ${child}: ${ar[st] ?? st}` : `Your request about ${child}: ${en[st] ?? st}`;
  }
  if (kind === 'bus_notice') {
    const trip = lang === 'ar' ? (bus?.direction === 'afternoon' ? 'رحلة العودة' : 'رحلة الصباح') : `the ${bus?.direction ?? 'morning'} trip`;
    if (lang === 'ar') return bus?.busKind === 'cancel' ? `الحافلة ${bus?.routeName ?? ''}: أُلغيت ${trip} اليوم` : `الحافلة ${bus?.routeName ?? ''}: ${trip} متأخرة نحو ${bus?.minutes ?? ''} دقيقة`;
    return bus?.busKind === 'cancel' ? `Bus ${bus?.routeName ?? ''}: ${trip} is cancelled today` : `Bus ${bus?.routeName ?? ''}: ${trip} is about ${bus?.minutes ?? ''} minutes late`;
  }
  const d = date ? dayLabel(date, lang) : '';
  if (kind === 'fee_due') return lang === 'ar' ? `قسط رسوم ${child} مستحق يوم ${d}: ${amount ?? ''} جنيه` : `${child}'s fee instalment is due on ${d}: ${amount ?? ''} EGP`;
  if (lang === 'ar') return kind === 'late' ? `تأخّر ${child} يوم ${d}` : `تغيّب ${child} يوم ${d}`;
  return kind === 'late' ? `${child} was late on ${d}` : `${child} was absent on ${d}`;
}

export async function emailSchoolNotices(docs: NoticeDoc[]): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0;
  if (!parentEmailsEnabled() || !docs.length) return { sent, skipped: docs.length };
  try {
    const list = docs.slice(0, MAX_PER_CALL);
    skipped += docs.length - list.length;
    const parents = [...new Set(list.map((d) => d.parentUserId))];
    const profiles = new Map((await ParentProfile.find({ userId: { $in: parents } }).select('userId emailPrefs').lean()).map((p) => [String(p.userId), p.emailPrefs as Record<string, boolean | undefined> | undefined]));
    const names = new Map((await Student.find({ id: { $in: [...new Set(list.map((d) => d.studentId))] } }).select('id name').lean()).map((s) => [s.id, firstName(s.name)]));
    const schools = new Map((await Institution.find({ id: { $in: [...new Set(list.map((d) => d.institutionId))] } }).select('id name').lean()).map((s) => [s.id, s.name ?? '']));
    const recipients = new Map<string, Awaited<ReturnType<typeof parentRecipient>>>();
    for (const d of list) {
      const prefs = profiles.get(d.parentUserId);
      const wanted = d.kind === 'announcement' ? prefs?.schoolAnnouncements !== false : d.kind === 'fee_due' ? prefs?.schoolFees !== false : d.kind === 'bus_notice' ? prefs?.schoolBus !== false : d.kind === 'request_update' || d.kind === 'consent' ? prefs?.schoolRequests !== false : prefs?.schoolAttendance !== false;
      if (!wanted) { skipped++; continue; }
      if (!recipients.has(d.parentUserId)) recipients.set(d.parentUserId, await parentRecipient(d.parentUserId));
      const to = recipients.get(d.parentUserId);
      if (!to) { skipped++; continue; }
      const child = names.get(d.studentId) || (to.lang === 'ar' ? 'طفلك' : 'your child');
      const r = await sendParentEmailOnce({
        key: `school:${d.kind}:${d.refId}:${d.parentUserId}`, template: 'parent-school-notice', to: to.email, lang: to.lang,
        parentUserId: d.parentUserId, studentId: d.studentId, institutionId: d.institutionId,
        vars: {
          NAME: to.name, CHILD_NAME: child, SCHOOL_NAME: schools.get(d.institutionId) || (to.lang === 'ar' ? 'المدرسة' : 'the school'),
          HEADLINE: headline(d.kind, to.lang, child, d.date, d.title, d.amount, d),
          MESSAGE: d.kind === 'announcement' ? (d.body || d.title)
            : d.kind === 'request_update' || d.kind === 'consent' ? (d.body || (to.lang === 'ar' ? 'افتح بوابة أولياء الأمور للتفاصيل.' : 'Open ENARA Parents for the details.'))
            : d.kind === 'bus_notice' ? (d.body || (to.lang === 'ar' ? `يخص ${child}. رسالة من المدرسة.` : `About ${child}. A message from the school.`))
            : d.kind === 'fee_due' ? (to.lang === 'ar' ? `${d.planName ?? ''}. يتم الدفع في المدرسة؛ إنارة تعرض سجل الرسوم كما سجّلته المدرسة فقط.` : `${d.planName ?? ''}. Payment is made at the school; ENARA only shows the school's fee record.`)
            : to.lang === 'ar' ? 'من سجل الحضور في المدرسة.' : "From the school's attendance register.",
          ACTION_URL: `${getAppUrl()}/parents/school`,
        },
      });
      if (r.status === 'captured' || r.status === 'sent') sent++; else skipped++;
    }
  } catch (error) {
    logger.error('school_app_email_failed', { error: serializeError(error) });
  }
  return { sent, skipped };
}
