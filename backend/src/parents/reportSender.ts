import { sendTemplate } from '../email/sendTemplate';
import { logger } from '../utils/logging';

// "Share this week": the parent triggers it (no schedule). One interface, two
// channels: email through the existing 'enara-weekly-progress' template, and a
// WhatsApp stub that only builds the message (no WhatsApp provider yet).

export interface WeeklySummary {
  parentName: string;
  childName: string;
  lessonsDone: number;
  outcomesMastered: number;
  minutesDone: number;
  goalMinutes: number;
  practiceTip: string;
  statusLine: string;
  /** All subjects: the subjects of the week (the message then names them instead of "English"). */
  subjects?: string[];
}

export type ShareResult = { ok: true; channel: 'email' | 'whatsapp'; id?: string; stub?: boolean; preview?: string } | { ok: false; channel: 'email' | 'whatsapp'; code: string };

export interface ReportSender {
  channel: 'email' | 'whatsapp';
  send(to: string, summary: WeeklySummary): Promise<ShareResult>;
}

export const emailReportSender: ReportSender = {
  channel: 'email',
  async send(to, s) {
    const r = await sendTemplate('enara-weekly-progress', to, {
      NAME: s.parentName,
      CHILD_NAME: s.childName,
      LESSONS_DONE: s.lessonsDone,
      OUTCOMES_MASTERED: s.outcomesMastered,
      TIME_SPENT: `${s.minutesDone} of ${s.goalMinutes} min`,
      PRACTICE_TIP: s.practiceTip,
    });
    return r.ok ? { ok: true, channel: 'email', id: r.id } : { ok: false, channel: 'email', code: r.code };
  },
};

export function whatsappText(s: WeeklySummary): string {
  const what = s.subjects ? (s.subjects.length ? ` (${s.subjects.join(', ')})` : '') : ' in English';
  const tip = s.practiceTip ? ` Try this at home: ${s.practiceTip}` : '';
  return `${s.childName}'s week${what}: ${s.statusLine}. ${s.minutesDone} of ${s.goalMinutes} minutes.${tip} Open ENARA Parents: /parents`;
}

export const whatsappStubSender: ReportSender = {
  channel: 'whatsapp',
  async send(_to, s) {
    logger.info('parents.whatsapp_stub', { chars: whatsappText(s).length });
    return { ok: true, channel: 'whatsapp', stub: true, preview: whatsappText(s) };
  },
};

export const reportSenders: Record<'email' | 'whatsapp', ReportSender> = { email: emailReportSender, whatsapp: whatsappStubSender };
