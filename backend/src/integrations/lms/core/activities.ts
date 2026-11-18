import { getConfig } from '../../../config/env';
import { AiControl, OrgBudget } from '../../../models/OrgBudget';
import { CourseInstance } from '../../../models/CourseInstance';
import { DiagnosticSession } from '../../../models/DiagnosticSession';
import { LearningObjective } from '../../../models/LearningObjective';
import { TutorSession } from '../../../models/TutorSession';
import { isDirectTutorModelConfigured } from '../../../services/directTutorModel';
import { isFeatureEnabled } from '../../../services/featureFlags';
import { classStudentIds } from '../../../services/learningAccess';
import { getEnrolledInstances } from '../../../services/studentCourseService';
import { logger, serializeError } from '../../../utils/logging';
import type { LmsActivityKind } from './pageTargets';

// LMS Phase 8 ("more activities, no grade"): is an activity ready to start on
// this ENARA site, for this school and class, and what has the class done with
// it? Read-only. The answers are codes (problemHelp.ts explains each in EN/AR):
//
//   activity_provider_not_configured  the AI tutor or the live avatar has no
//                                     provider on this server (lms-test today:
//                                     anthropic, elevenlabs and anam are not set)
//   activity_ai_paused                AI is paused (server switch AI_PAUSED, the
//                                     global AI control, or the school's budget)
//   activity_feature_off              the school's diagnostics features are off
//   activity_no_class                 the launch has no ENARA class for this student
//   activity_no_objectives            the class has no curriculum with approved
//                                     learning objectives (an LMS-made class has none)
//
// Never calls an AI provider: readiness only reads configuration and records.

export const ACTIVITY_KINDS: readonly LmsActivityKind[] = ['tutor', 'avatar', 'diagnostic'];
export const isActivityKind = (v: unknown): v is LmsActivityKind => typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);

export type ActivityProblem =
  | 'activity_provider_not_configured'
  | 'activity_ai_paused'
  | 'activity_feature_off'
  | 'activity_no_class'
  | 'activity_no_objectives';
export const ACTIVITY_PROBLEMS: readonly ActivityProblem[] = ['activity_provider_not_configured', 'activity_ai_paused', 'activity_feature_off', 'activity_no_class', 'activity_no_objectives'];

/** Uses the microphone (the student page runs the mic check and offers "Open in a new tab"). */
export const ACTIVITY_NEEDS_MIC: Record<LmsActivityKind, boolean> = { tutor: true, avatar: true, diagnostic: false };

export interface ActivityReadiness {
  ready: boolean;
  code?: ActivityProblem;
}

/** The tutor answers through the direct model (ANTHROPIC_API_KEY) or, for a set default course, the orchestrator. */
function tutorProviderConfigured(): boolean {
  const c = getConfig();
  return isDirectTutorModelConfigured() || Boolean(c.enaraOrchestratorUrl && c.enaraApiKey && c.enaraDefaultCourseId);
}

/** The live avatar needs Anam (the face and voice) and the direct tutor model (the answers). */
function avatarProviderConfigured(): boolean {
  return Boolean(getConfig().anam) && isDirectTutorModelConfigured();
}

/** AI paused for this school: the server switch, the global control or the school's budget. Unknown counts as not paused (the AI call itself still checks). */
async function aiPaused(institutionId: string): Promise<boolean> {
  if (getConfig().aiPaused) return true;
  try {
    const [global, school] = await Promise.all([AiControl.findById('global').select('aiPaused').lean(), OrgBudget.findOne({ institutionId }).select('aiPaused').lean()]);
    return global?.aiPaused === true || school?.aiPaused === true;
  } catch (error) {
    logger.warn('lms_activity_pause_read_failed', { error: serializeError(error) });
    return false;
  }
}

async function diagnosticsOn(institutionId: string): Promise<boolean> {
  return (await isFeatureEnabled(institutionId, 'learning_intelligence_enabled')) && (await isFeatureEnabled(institutionId, 'diagnostics_enabled'));
}

/** The class has a curriculum with at least one approved learning objective (what a diagnostic asks about). */
async function classHasObjectives(institutionId: string, curriculumId: string | undefined): Promise<boolean> {
  if (!curriculumId) return false;
  return !!(await LearningObjective.exists({ institutionId, curriculumId, status: 'approved' }));
}

export interface ReadinessInput {
  kind: LmsActivityKind;
  institutionId: string;
  /** A student: the class must be one of theirs. Staff: already checked by the caller (loadClassForStaff). */
  studentId?: string;
  classId?: string;
  /** Staff: the class row when the caller loaded it. */
  staffClass?: { id: string; curriculumId?: string };
}

export async function activityReadiness(input: ReadinessInput): Promise<ActivityReadiness> {
  const { kind, institutionId } = input;
  if (kind === 'tutor' || kind === 'avatar') {
    if (!(kind === 'tutor' ? tutorProviderConfigured() : avatarProviderConfigured())) return { ready: false, code: 'activity_provider_not_configured' };
    if (await aiPaused(institutionId)) return { ready: false, code: 'activity_ai_paused' };
    return { ready: true };
  }
  if (!(await diagnosticsOn(institutionId))) return { ready: false, code: 'activity_feature_off' };
  let curriculumId: string | undefined;
  if (input.studentId) {
    const instance = input.classId ? (await getEnrolledInstances(input.studentId)).find((c) => c.id === input.classId && c.institutionId === institutionId) : undefined;
    if (!instance) return { ready: false, code: 'activity_no_class' };
    curriculumId = instance.curriculumId ?? undefined;
  } else if (input.staffClass) {
    curriculumId = input.staffClass.curriculumId;
  } else {
    return { ready: false, code: 'activity_no_class' };
  }
  if (!(await classHasObjectives(institutionId, curriculumId))) return { ready: false, code: 'activity_no_objectives' };
  return { ready: true };
}

export const OVERVIEW_DAYS = 7;

export interface ActivityOverview {
  classId: string;
  className: string | null;
  students: number;
  days: number;
  /** Students of the class who started this activity in the window. */
  studentsStarted: number;
  /** Tutor chats, live calls or diagnostics started in the window. */
  sessions: number;
  /** Diagnostics only: finished in the window. */
  completed?: number;
}

/** What the course's class did with this activity in the last 7 days (this school's records only; counts, no names). */
export async function activityOverview(kind: LmsActivityKind, cls: { id: string; institutionId: string; courseName?: string; studentIds?: string[]; batchId?: string }, now = new Date()): Promise<ActivityOverview> {
  const since = new Date(now.getTime() - OVERVIEW_DAYS * 86_400_000);
  const ids = (await classStudentIds(cls)) as string[];
  const base = { classId: cls.id, className: cls.courseName ?? null, students: ids.length, days: OVERVIEW_DAYS };
  if (!ids.length) return { ...base, studentsStarted: 0, sessions: 0, ...(kind === 'diagnostic' ? { completed: 0 } : {}) };
  if (kind === 'diagnostic') {
    const rows = await DiagnosticSession.find({ institutionId: cls.institutionId, courseId: cls.id, studentId: { $in: ids }, startedAt: { $gte: since } }).select('studentId status').lean();
    return { ...base, studentsStarted: new Set(rows.map((r) => r.studentId)).size, sessions: rows.length, completed: rows.filter((r) => r.status === 'completed').length };
  }
  const rows = await TutorSession.find({ institutionId: cls.institutionId, studentId: { $in: ids }, mode: kind === 'avatar' ? 'voice' : 'chat', createdAt: { $gte: since } }).select('studentId').lean();
  return { ...base, studentsStarted: new Set(rows.map((r) => r.studentId)).size, sessions: rows.length };
}

/** The class (school-scoped) for a staff overview. */
export async function schoolClass(institutionId: string, classId: string) {
  return CourseInstance.findOne({ id: classId, institutionId }).lean();
}
