import { getConfig } from '../config/env';
import { CourseInstance } from '../models/CourseInstance';
import { ReminderLog } from '../models/ReminderLog';
import { Student } from '../models/Student';
import type { IAssignment } from '../models/Assignment';
import { emailLayout, sendEmail } from './emailService';
import { classStudentIds } from './learningAccess';
import { logger } from '../utils/logging';

// Emails for the teaching workflow, sent at most once per student and event
// (ReminderLog). A failed email never changes the assignment or the grade.

async function sendOnce(kind: 'assignment_published' | 'results_released', recipientKey: string, to: string, subject: string, html: string) {
  if (await ReminderLog.exists({ kind, recipientKey })) return false;
  let sent = false;
  try {
    sent = await sendEmail({ to, subject, html });
  } catch (error) {
    logger.warn('teaching_email_failed', { kind, error: String((error as Error).message) });
  }
  await ReminderLog.create({ kind, recipientKey, to, subject, sent });
  return sent;
}

const formatDue = (a: Pick<IAssignment, 'dueAt' | 'timeZone'>) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: a.timeZone || 'UTC' }).format(new Date(a.dueAt));

export async function notifyAssignmentPublished(a: IAssignment) {
  const cls = await CourseInstance.findOne({ id: a.classId }).lean();
  const ids = a.studentIds?.length ? a.studentIds : cls ? await classStudentIds(cls) : [];
  const students = await Student.find({ id: { $in: ids }, institutionId: a.institutionId }).select('id name email').lean();
  let sent = 0;
  for (const s of students) {
    if (!s.email) continue;
    const ok = await sendOnce(
      'assignment_published',
      `${a.id}:${s.id}`,
      s.email,
      `New work: ${a.title}`,
      emailLayout(`New work: ${a.title}`, [`Hi ${s.name || 'there'}, you have new work in ${cls?.courseName ?? 'your class'}.`, `Due ${formatDue(a)} (${a.timeZone}).`], {
        label: 'Open Enara',
        url: getConfig().appUrl,
      }),
    );
    if (ok) sent += 1;
  }
  return { students: students.length, sent };
}

export async function notifyResultsReleased(a: Pick<IAssignment, 'id' | 'title'>, studentId: string, attemptId: string) {
  const s = await Student.findOne({ id: studentId }).select('id name email').lean();
  if (!s?.email) return false;
  return sendOnce(
    'results_released',
    `${attemptId}`,
    s.email,
    `Your results: ${a.title}`,
    emailLayout(`Your results are ready`, [`Hi ${s.name || 'there'}, your results and feedback for ${a.title} are ready.`], {
      label: 'See your feedback',
      url: getConfig().appUrl,
    }),
  );
}
