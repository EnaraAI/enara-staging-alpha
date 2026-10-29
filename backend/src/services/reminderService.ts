import Anthropic from '@anthropic-ai/sdk';
import { trackAiCall } from './aiCalls';
import { getConfig } from '../config/env';
import { ReminderLog } from '../models/ReminderLog';
import { Student } from '../models/Student';
import { logger } from '../utils/logging';
import { emailLayout, isEmailConfigured, sendEmail } from './emailService';
import { buildLearnerSnapshot, describeSnapshot, LearnerSnapshot } from './learnerSnapshot';
import { buildNextSteps } from './nextStepsService';

// Reminder emails for students who have gone quiet or have review questions
// piling up, at most once every few days, written from their own progress.

const INACTIVE_DAYS = 3;
const REVIEWS_DUE = 3;
const QUIET_DAYS = 3;
const MAX_PER_RUN = 200;

export interface ReminderPlan {
  studentId: string;
  name: string;
  to: string;
  reason: string;
  subject: string;
  paragraphs: string[];
}

let client: Anthropic | undefined;

async function writeReminder(s: LearnerSnapshot, reason: string): Promise<{ subject: string; paragraphs: string[] }> {
  const step = buildNextSteps(s)[0];
  const fallback = {
    subject: step ? `${s.firstName}, your next step: ${step.title}` : `${s.firstName}, your tutor is ready when you are`,
    paragraphs: [
      `Hi ${s.firstName},`,
      step ? `${step.title}. ${step.detail}` : 'Pick up where you left off whenever you have a few minutes.',
    ],
  };
  const config = getConfig();
  if (!config.anthropicApiKey) return fallback;
  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 15_000, maxRetries: 0 });
  try {
    const response = await trackAiCall('reminder_email', config.anthropicVoiceModel, () => client!.messages.create({
      model: config.anthropicVoiceModel,
      max_tokens: 600,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content:
            `${describeSnapshot(s)}\nWhy we're writing: ${reason}\n` +
            (step ? `Best next step: ${step.title} (${step.detail})\n` : '') +
            `\nWrite a short reminder email from their AI tutor to ${s.firstName}, a school student. ` +
            'Warm, specific to their progress, no guilt-tripping, no emoji, 2 or 3 short paragraphs, under 80 words. ' +
            'Reply as JSON only: {"subject": "...", "paragraphs": ["...", "..."]}',
        },
      ],
    }));
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (typeof json.subject === 'string' && Array.isArray(json.paragraphs) && json.paragraphs.length) {
      return { subject: json.subject.slice(0, 120), paragraphs: json.paragraphs.map(String).slice(0, 4) };
    }
  } catch (error) {
    logger.warn('reminder_write_failed', { message: (error as Error).message });
  }
  return fallback;
}

// Who would get a reminder right now, and what it says.
export async function planReminders(scope: Record<string, unknown>): Promise<ReminderPlan[]> {
  const students = await Student.find(scope).select('id name email').limit(MAX_PER_RUN).lean();
  const since = new Date(Date.now() - QUIET_DAYS * 24 * 60 * 60 * 1000);
  const recent = new Set(
    (await ReminderLog.find({ kind: 'student_reminder', createdAt: { $gte: since }, sent: true }).select('recipientKey').lean()).map(
      (r) => r.recipientKey,
    ),
  );

  const plans: ReminderPlan[] = [];
  for (const student of students) {
    if (!student.email || recent.has(student.id)) continue;
    let snapshot: LearnerSnapshot;
    try {
      snapshot = await buildLearnerSnapshot(student.id);
    } catch {
      continue;
    }
    if (!snapshot.courses.length) continue;
    const inactive = snapshot.daysInactive === undefined || snapshot.daysInactive >= INACTIVE_DAYS;
    const reviews = snapshot.reviewsDue >= REVIEWS_DUE;
    if (!inactive && !reviews) continue;
    const reason = [
      inactive
        ? snapshot.daysInactive === undefined
          ? "hasn't started yet"
          : `inactive for ${snapshot.daysInactive} days`
        : '',
      reviews ? `${snapshot.reviewsDue} review questions due` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const message = await writeReminder(snapshot, reason);
    plans.push({ studentId: student.id, name: student.name, to: student.email, reason, ...message });
  }
  return plans;
}

export async function sendReminders(scope: Record<string, unknown>) {
  // Without email nothing can be delivered: don't spend AI calls writing it.
  if (!isEmailConfigured()) return { planned: 0, sent: 0, skipped: 'email_disabled' as const };
  const plans = await planReminders(scope);
  const appUrl = getConfig().appUrl;
  let sent = 0;
  for (const plan of plans) {
    const ok = await sendEmail({
      to: plan.to,
      subject: plan.subject,
      html: emailLayout(plan.subject, plan.paragraphs, { label: 'Open Enara', url: appUrl }),
    });
    if (ok) sent += 1;
    await ReminderLog.create({ kind: 'student_reminder', recipientKey: plan.studentId, to: plan.to, subject: plan.subject, sent: ok });
  }
  return { planned: plans.length, sent };
}
