// liveRolePlay for every subject that is not a language course (maths, science, Arabic, social studies; owner correction 27 Nov 2026).
// Language courses run role-play inside the language engine; every other course runs it here, with the same scene bank, steps, guards and
// debrief. The text tutor and the live call both call prepareSubjectRolePlay, add rolePlayLine to the tutor's rules, guard the reply with
// guardSceneReply, store the tag as meta.rolePlay and log code-certain errors with completeSubjectRolePlay.
import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { loadTrustedAgeBand, under9, isLanguageCourse } from './languageTeachingContext';
import { buildRolePlayTurn } from './rolePlayTurn';
import { rolePlayOn, rolePlayTagOf, subjectOf, type RolePlayTag, type RolePlayTurn } from './rolePlay';
import { recordRolePlayError } from './errorsToWorkOn';
import { logger, serializeError } from '../utils/logging';

export type SubjectHistoryItem = { role: 'user' | 'assistant'; content: string; rolePlay?: RolePlayTag; verdict?: string };
/** Stored messages -> what the role-play step reads: the role-play tag (meta.rolePlay) and the reply's grade of the answer before it. */
export function subjectHistoryFrom(earlier: { role: string; text: string; meta?: unknown }[]): SubjectHistoryItem[] {
  return earlier.filter((m) => m.role === 'user' || m.role === 'ai').slice(-12).map((m) => {
    const meta = (m.meta ?? {}) as { rolePlay?: RolePlayTag; practiceTurn?: { assessment?: { verdict?: string } }; languageTurn?: { rolePlay?: RolePlayTag } };
    const tag = meta.rolePlay ?? meta.languageTurn?.rolePlay;
    return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text, ...(tag ? { rolePlay: tag } : {}), ...(meta.practiceTurn?.assessment?.verdict ? { verdict: meta.practiceTurn.assessment.verdict } : {}) };
  });
}
const HELP = /\b(help|explain|i don'?t understand|what does .{1,30} mean)\b|ساعدني|اشرح|لم أفهم|مش فاهم|ما فهمت/i;
const REPEAT = /\b(repeat|again|say (?:it|that) again|pardon)\b|أعد|كرر|مرة أخرى|تاني/i;
const DONT_KNOW = /\b(i don'?t know|no idea|not sure)\b|لا أعرف|لا اعرف|لا أدري|مش عارف|معرفش|ما بعرف/i;

/** This turn's role-play step for a non-language course. Undefined = none (switch off, a language course, no scene for the subject). */
export async function prepareSubjectRolePlay(i: {
  institutionId?: string; studentId?: string; curriculumId?: string; lessonId?: string; sessionSubject?: string; lessonTitle?: string;
  message: string; history: SubjectHistoryItem[]; hintsOnly?: boolean; objectiveCode?: string; opening?: boolean;
}): Promise<RolePlayTurn | undefined> {
  if (!rolePlayOn() || !i.studentId) return undefined;
  try {
    const cur = i.curriculumId ? await Curriculum.findOne({ id: i.curriculumId, ...(i.institutionId ? { institutionId: i.institutionId } : {}) }).select('type name courseName languages level chapters.id chapters.title').lean() : null;
    if (cur && isLanguageCourse(cur.type)) return undefined; // the language engine runs it
    const lessonTitle = cur?.chapters?.find((c: { id?: string }) => c.id === i.lessonId)?.title ?? i.lessonTitle;
    const { subject, lang } = subjectOf({ type: cur?.type, name: cur?.name, courseName: cur?.courseName, languages: cur?.languages, lessonTitle, sessionSubject: i.sessionSubject });
    const institution = i.institutionId ? await Institution.findOne({ id: i.institutionId }).select('learningSettings').lean() : null;
    const band = await loadTrustedAgeBand({ institutionId: i.institutionId, studentId: i.studentId, learningSettings: (institution as { learningSettings?: unknown } | null)?.learningSettings });
    const child = band.status === 'known' && band.band === 'child';
    // The grade the previous reply gave (the learner's last graded answer): an offer comes only right after a right answer.
    const lastAi = [...i.history].reverse().find((h) => h.role === 'assistant');
    const signals = { dontKnow: DONT_KNOW.test(i.message), helpRequest: HELP.test(i.message), repeatRequest: REPEAT.test(i.message), ...(lastAi?.verdict ? { answeringCheck: true, keyVerdict: lastAi.verdict } : {}) };
    const lessonText = [lessonTitle, cur?.courseName || cur?.name].filter(Boolean).join('; ');
    return await buildRolePlayTurn({
      studentId: i.studentId, message: i.message, history: i.history, objectiveCode: i.objectiveCode, lessonText,
      child, ageBand: band.status === 'known' ? band.band : 'unknown', level: cur?.level, under9: under9(band.years),
      subject, lang, signals, blocked: Boolean(i.hintsOnly || i.opening), busy: false,
    });
  } catch (error) {
    logger.warn('roleplay_subject_failed', { error: serializeError(error) });
    return undefined;
  }
}

/** After the reply: the tag stored as meta.rolePlay; a code-certain error (a wrong number, an English-practice pattern) goes to errors to work on. */
export async function completeSubjectRolePlay(rp: RolePlayTurn, o: { institutionId?: string; studentId: string; messageId: string }): Promise<RolePlayTag> {
  if (rp.error?.certain) await recordRolePlayError({ institutionId: o.institutionId, studentId: o.studentId, code: rp.error.code, outcomeId: rp.error.outcome, sceneId: rp.scene, messageId: o.messageId });
  return rolePlayTagOf(rp);
}
