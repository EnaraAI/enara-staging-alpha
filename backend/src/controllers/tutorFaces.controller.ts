import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin } from '../auth/authorization';
import { CourseInstance } from '../models/CourseInstance';
import { Institution } from '../models/Institution';
import { StudentTutorChoice, TutorFace, TutorFaceOptions } from '../models/TutorFace';
import { listAvatarChoices, resolveTutorFace, studentFaceOptions } from '../services/tutorFaceService';

// School admins choose the live tutor's face: a default for the school and,
// if they like, a different one per course.

// Schools an Enara admin can manage: registered institutions plus any school
// that has courses.
async function knownInstitutions(): Promise<{ id: string; name: string }[]> {
  const [registered, withCourses] = await Promise.all([
    Institution.find().select('id name').lean(),
    CourseInstance.distinct('institutionId'),
  ]);
  const all = new Map(registered.map((i) => [i.id, i.name]));
  for (const id of withCourses) if (id && !all.has(id)) all.set(id, id);
  return [...all.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// School admins manage their own school; Enara admins pass ?institutionId=
// (the first school if they don't).
async function institutionOf(req: AuthRequest): Promise<{ institutionId: string; institutions?: { id: string; name: string }[] }> {
  if (!isGlobalAdmin(req)) {
    if (!req.user!.institutionId) throw new AppError('Your account has no school', 400, 'INSTITUTION_REQUIRED');
    return { institutionId: req.user!.institutionId };
  }
  const institutions = await knownInstitutions();
  const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  const institutionId = requested || req.user!.institutionId || institutions[0]?.id;
  if (!institutionId || (requested && !institutions.some((i) => i.id === requested))) {
    throw new AppError('Choose a school', 400, 'INSTITUTION_REQUIRED');
  }
  return { institutionId, institutions };
}

const toFace = (f: { avatarId: string; name: string; imageUrl?: string; gender?: string } | undefined) =>
  f ? { avatarId: f.avatarId, name: f.name, imageUrl: f.imageUrl, gender: f.gender } : null;

// GET /api/tutor-faces
export const getTutorFaces = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { institutionId, institutions } = await institutionOf(req);
  const [avatars, faces, courses, options] = await Promise.all([
    listAvatarChoices(),
    TutorFace.find({ institutionId }).lean(),
    CourseInstance.find({ institutionId }).select('courseId courseName').lean(),
    TutorFaceOptions.findOne({ institutionId }).lean(),
  ]);
  const unique = new Map<string, string>();
  for (const c of courses) if (!unique.has(c.courseId)) unique.set(c.courseId, c.courseName);
  res.json({
    institutionId,
    // Only for Enara admins, who can switch between schools.
    institutions,
    avatars,
    // Faces students may pick for themselves; empty means every face.
    studentOptions: options?.avatarIds || [],
    default: toFace(faces.find((f) => f.courseId === '')),
    courses: [...unique.entries()].map(([courseId, courseName]) => ({
      courseId,
      courseName,
      face: toFace(faces.find((f) => f.courseId === courseId)),
    })),
  });
});

// PUT /api/tutor-faces { courseId?: string, avatarId: string | null }
// avatarId null removes the choice (a course then uses the school default).
export const setTutorFace = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { institutionId } = await institutionOf(req);
  const body = req.body as { courseId?: unknown; avatarId?: unknown };
  const courseId = typeof body.courseId === 'string' ? body.courseId : '';
  if (courseId && !(await CourseInstance.exists({ institutionId, courseId }))) {
    throw new AppError('Course not found', 404);
  }
  if (body.avatarId === null) {
    await TutorFace.deleteOne({ institutionId, courseId });
    res.json({ ok: true, face: null });
    return;
  }
  const avatar = (await listAvatarChoices()).find((a) => a.id === body.avatarId);
  if (!avatar) throw new AppError('Unknown tutor face', 400, 'VALIDATION_ERROR');
  await TutorFace.updateOne(
    { institutionId, courseId },
    { avatarId: avatar.id, name: avatar.name, imageUrl: avatar.imageUrl, gender: avatar.gender, updatedBy: req.user!.id },
    { upsert: true },
  );
  res.json({ ok: true, face: toFace({ avatarId: avatar.id, name: avatar.name, imageUrl: avatar.imageUrl, gender: avatar.gender }) });
});

// PUT /api/tutor-faces/student-options { avatarIds: string[] } — empty offers every face.
export const setStudentFaceOptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { institutionId } = await institutionOf(req);
  const ids = (req.body as { avatarIds?: unknown }).avatarIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new AppError('avatarIds must be a list', 400, 'VALIDATION_ERROR');
  }
  const known = new Set((await listAvatarChoices()).map((a) => a.id));
  const avatarIds = [...new Set(ids as string[])].filter((id) => known.has(id));
  await TutorFaceOptions.updateOne({ institutionId }, { avatarIds, updatedBy: req.user!.id }, { upsert: true });
  res.json({ ok: true, studentOptions: avatarIds });
});

// GET /api/me/tutor-face — the student's tutor and the faces they can pick from.
export const getMyTutorFace = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const [current, options] = await Promise.all([
    resolveTutorFace(req.user!.institutionId, undefined, studentId),
    studentFaceOptions(req.user!.institutionId),
  ]);
  res.json({
    current: current ? { avatarId: current.avatarId, name: current.name, imageUrl: current.imageUrl, gender: current.gender } : null,
    chosen: current?.source === 'student',
    options,
  });
});

// PUT /api/me/tutor-face { avatarId: string | null } — null goes back to the school's tutor.
export const setMyTutorFace = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const avatarId = (req.body as { avatarId?: unknown }).avatarId;
  if (avatarId === null) {
    await StudentTutorChoice.deleteOne({ studentId });
    res.json({ ok: true });
    return;
  }
  const avatar = (await studentFaceOptions(req.user!.institutionId)).find((a) => a.id === avatarId);
  if (!avatar) throw new AppError('That tutor is not available', 400, 'VALIDATION_ERROR');
  await StudentTutorChoice.updateOne(
    { studentId },
    { avatarId: avatar.id, name: avatar.name, imageUrl: avatar.imageUrl, gender: avatar.gender },
    { upsert: true },
  );
  res.json({ ok: true, face: { avatarId: avatar.id, name: avatar.name, imageUrl: avatar.imageUrl, gender: avatar.gender } });
});
