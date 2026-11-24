import type { LearnerAgeBand } from '../models/learnerAgeBand';
import { isLearnerAgeBand } from '../models/learnerAgeBand';
import type { ParentLinkRole, ParentLinkStatus } from '../models/ParentLearnerLink';

// THE Parents Portal policy: tier, visibility and what each link role may do.
// Every parent endpoint asks this module; nothing else decides access.
//
// User decision (16 Nov 2026), replacing brief rule 1 and SPEC §2/§10 "13+ never":
// once a parent <-> learner link is ACTIVE (signed/accepted), the parent sees
// EVERYTHING for every age: transcripts, audio (if any), safety-alert excerpts.
// Without an active link the parent sees nothing (a pending link shows only its
// own invite). Tiers remain only for wording and for how controls work
// (kid: parent sets; 13plus: parent suggests / co-sets, learner accepts).
// The learner is always told what the parent can see (visibilityNotice).

export type Tier = 'kid' | '13plus';
export type TierSource = 'birth_date' | 'age_band' | 'unknown_default';

export interface TierInput {
  birthDate?: Date | string | null;
  learnerAgeBand?: unknown;
}

export function ageOn(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/**
 * Tier from the learner record. A birth date wins (age < 13 = kid); otherwise
 * the staff-set age band (child = kid, teen/adult = 13plus). With neither, the
 * learner is treated as 13plus: wording and controls then respect the learner's
 * own say (it never changes what the parent can see).
 */
export function tierOf(learner: TierInput, now: Date = new Date()): { tier: Tier; source: TierSource; age?: number } {
  const bd = learner.birthDate ? new Date(learner.birthDate) : null;
  if (bd && !Number.isNaN(bd.getTime())) {
    const age = ageOn(bd, now);
    return { tier: age < 13 ? 'kid' : '13plus', source: 'birth_date', age };
  }
  if (isLearnerAgeBand(learner.learnerAgeBand)) {
    const band: LearnerAgeBand = learner.learnerAgeBand;
    return { tier: band === 'child' ? 'kid' : '13plus', source: 'age_band' };
  }
  return { tier: '13plus', source: 'unknown_default' };
}

export interface Visibility {
  summaries: boolean;
  progress: boolean;
  transcripts: boolean;
  audio: boolean;
  alertExcerpts: boolean;
}

const NOTHING: Visibility = { summaries: false, progress: false, transcripts: false, audio: false, alertExcerpts: false };
const EVERYTHING: Visibility = { summaries: true, progress: true, transcripts: true, audio: true, alertExcerpts: true };

/** What a parent may see through a link. Same for every tier (user decision). */
export function visibilityFor(link: { status: ParentLinkStatus } | null | undefined, _tier?: Tier): Visibility {
  return link?.status === 'active' ? { ...EVERYTHING } : { ...NOTHING };
}

export type ParentAction = 'read' | 'change_controls' | 'share_report' | 'manage_guardians' | 'manage_billing';

const ROLE_ACTIONS: Record<ParentLinkRole, readonly ParentAction[]> = {
  owner: ['read', 'change_controls', 'share_report', 'manage_guardians', 'manage_billing'],
  full: ['read', 'change_controls', 'share_report'],
  view: ['read'],
};

export function canDo(link: { status: ParentLinkStatus; role: ParentLinkRole } | null | undefined, action: ParentAction): boolean {
  if (!link || link.status !== 'active') return false;
  return ROLE_ACTIONS[link.role]?.includes(action) ?? false;
}

export type ControlsMode = 'parent_sets' | 'co_set';
/** How controls work for a tier: kids' parents set them; 13+ parents suggest and the learner accepts. */
export function controlsModeFor(tier: Tier): ControlsMode {
  return tier === 'kid' ? 'parent_sets' : 'co_set';
}

/** Wording keys the frontends use per tier (no data access depends on these). */
export function wordingFor(tier: Tier) {
  return tier === 'kid'
    ? { tierLabel: 'kids', viewNotice: 'kid_full', controlsNote: 'parent_sets', tryThisTone: 'play' }
    : { tierLabel: '13plus', viewNotice: 'teen_full_transparent', controlsNote: 'learner_accepts', tryThisTone: 'encourage' };
}

/**
 * The learner-side "What your parent can see" notice (SPEC §2 consent). Lists
 * everything an active link shows, conversations included.
 */
export function visibilityNotice(tier: Tier, parents: { name: string; role: ParentLinkRole }[]) {
  return {
    tier,
    parents,
    canSee: ['minutes_streak_sessions', 'level_and_skills', 'session_summaries', 'conversations_transcripts', 'audio_if_recorded', 'safety_alerts_with_excerpt', 'assessment_results'],
    controls: controlsModeFor(tier),
    message: {
      en: parents.length
        ? `${parents.map((p) => p.name).join(' and ')} can see your progress, session summaries and your full conversations with ENARA, including safety alerts.${tier === '13plus' ? ' Any setting they change is a suggestion until you accept it.' : ''}`
        : 'No parent is linked to your account.',
      ar: parents.length
        ? `يستطيع ${parents.map((p) => p.name).join(' و')} رؤية تقدّمك وملخصات الجلسات ومحادثاتك كاملة مع إنارة، بما في ذلك تنبيهات الأمان.${tier === '13plus' ? ' أي إعداد يغيّره يبقى اقتراحًا إلى أن توافق عليه.' : ''}`
        : 'لا يوجد ولي أمر مرتبط بحسابك.',
    },
  };
}

export const TRANSCRIPT_RETENTION_DAYS = 90;
/** Transcripts are kept 90 days from the session's start; older ones are summary only. */
export function transcriptExpired(sessionStart: Date, now: Date = new Date()): boolean {
  return now.getTime() - new Date(sessionStart).getTime() > TRANSCRIPT_RETENTION_DAYS * 86_400_000;
}
