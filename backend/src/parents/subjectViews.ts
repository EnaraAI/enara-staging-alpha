// Parents: the subject endpoints (PARENT_ALL_SUBJECTS_ENABLED; docs/parents/ALL_SUBJECTS_PLAN.md).
//   GET /learners/:id/subjects            the subjects with activity (the chips), "All subjects" overview cards with the top suggestion
//   GET /learners/:id/subjects/:key       one subject: progress, level, released results, points to practise, sessions, next, suggestions
import { AppError } from '../middleware/errorHandler';
import { envelope, levelCard, loadSessions, type LearnerContext } from './service';
import { loadChild, subjectDetail, subjectsWithActivity, subjectOf, type ChildData } from './subjects';
import { recommendationsFor } from './recommendations';
import { weekStartDay } from './time';

const DAY = 86_400_000;

export async function childData(ctx: LearnerContext, now = new Date()): Promise<ChildData> {
  const sessions = await loadSessions(ctx.student.id, new Date(now.getTime() - 60 * DAY));
  return loadChild(ctx.student, sessions, { now, institutionId: ctx.link.institutionId ?? ctx.student.institutionId });
}

const recCtx = (ctx: LearnerContext, now: Date) => ({ studentId: ctx.student.id, name: ctx.firstName, tier: ctx.tier, institutionId: ctx.link.institutionId, weekStart: weekStartDay(now), now });

/** English keeps its CEFR level when it is built from real evidence. */
async function englishLevel(ctx: LearnerContext) {
  const l = await levelCard(ctx);
  if (l.mock) return null;
  return { cefr: l.cefr, label: l.label, subLevel: l.subLevel, subLevelPct: l.subLevelPct, next: l.next, nextLabel: l.nextLabel };
}

export async function subjectsOverview(ctx: LearnerContext, now = new Date()) {
  const d = await childData(ctx, now);
  const list = subjectsWithActivity(d);
  const cefr = list.some((s) => s.english) ? await englishLevel(ctx) : null;
  const cards = await Promise.all(list.map(async (s) => {
    const x = subjectDetail(d, s.key);
    const recs = await recommendationsFor(x, recCtx(ctx, now));
    return {
      key: x.key, name: x.name, english: x.english,
      lessons: x.lessons,
      outcomes: { mastered: x.outcomes.mastered, total: x.outcomes.total, band: x.outcomes.band, bandLabel: x.outcomes.bandLabel },
      ...(x.english && cefr ? { cefr } : {}),
      latestResult: x.latestResult,
      lessonsThisWeek: x.lessons.thisWeek,
      pointsCount: x.points.length,
      minutesThisWeek: x.minutesThisWeek,
      top: recs.items[0] ?? null,
    };
  }));
  return envelope(ctx, { subjects: cards, minutesThisWeek: cards.reduce((n, c) => n + c.minutesThisWeek, 0) });
}

export async function subjectView(ctx: LearnerContext, key: string, now = new Date()) {
  const d = await childData(ctx, now);
  if (!subjectsWithActivity(d).some((s) => s.key === key)) throw new AppError('Subject not found', 404, 'NOT_FOUND');
  const x = subjectDetail(d, key);
  const [recs, cefr] = await Promise.all([recommendationsFor(x, recCtx(ctx, now)), x.english ? englishLevel(ctx) : Promise.resolve(null)]);
  const { weakest: _w, activeBefore: _a, family: _f, ...shown } = x;
  return envelope(ctx, { subject: { ...shown, ...(cefr ? { cefr } : {}) }, recommendations: recs });
}

/** The subject of each session and result, for the subject filter on the Progress and Activity tabs. */
export async function subjectLabels(ctx: LearnerContext, now = new Date()) {
  const d = await childData(ctx, now);
  const names = new Map(subjectsWithActivity(d).map((s) => [s.key, s.name]));
  const tag = (k: string | null) => (k && names.has(k) ? { key: k, name: names.get(k)! } : null);
  return {
    session: (s: { id: string; courseId?: string; curriculumId?: string; classId?: string }) => tag(subjectOf(d, s)),
    attempt: (a: { id: string }) => { const r = d.attempts.find((t) => t.id === a.id); return r ? tag(subjectOf(d, r)) : null; },
  };
}
