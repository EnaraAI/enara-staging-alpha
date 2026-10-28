import { getConfig } from '../config/env';
import { StudentTutorChoice, TutorFace, TutorFaceOptions } from '../models/TutorFace';
import { logger } from '../utils/logging';

// Anam's stock avatars, as faces admins can choose for their tutor.

export interface AvatarChoice {
  id: string;
  name: string;
  variant?: string;
  imageUrl?: string;
  gender?: 'woman' | 'man';
  description?: string;
}

const LIST_TTL_MS = 60 * 60 * 1000;
let cached: { at: number; avatars: AvatarChoice[] } | undefined;

function genderOf(tags: unknown): AvatarChoice['gender'] {
  const list = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];
  if (list.includes('woman') || list.includes('female')) return 'woman';
  if (list.includes('man') || list.includes('male')) return 'man';
  return undefined;
}

export async function listAvatarChoices(): Promise<AvatarChoice[]> {
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.avatars;
  const anam = getConfig().anam;
  if (!anam) return [];
  const avatars: AvatarChoice[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.anam.ai/v1/avatars?perPage=100&page=${page}`, {
      headers: { Authorization: `Bearer ${anam.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn('anam_avatar_list_failed', { status: res.status });
      break;
    }
    const body = (await res.json()) as { data?: Record<string, unknown>[]; meta?: { lastPage?: number } };
    for (const a of body.data || []) {
      avatars.push({
        id: String(a.id),
        name: String(a.displayName || 'Tutor'),
        variant: a.variantName ? String(a.variantName) : undefined,
        imageUrl: (a.portraitImageUrl || a.imageUrl) as string | undefined,
        gender: genderOf(a.displayTags),
        description: a.description ? String(a.description) : undefined,
      });
    }
    if (!body.meta?.lastPage || page >= body.meta.lastPage) break;
  }
  if (avatars.length) cached = { at: Date.now(), avatars };
  return avatars;
}

// Faces a school's students may choose from: the school's list, or every face.
export async function studentFaceOptions(institutionId: string | undefined): Promise<AvatarChoice[]> {
  const all = await listAvatarChoices();
  const options = institutionId ? await TutorFaceOptions.findOne({ institutionId }).lean() : null;
  if (!options?.avatarIds.length) return all;
  const allowed = new Set(options.avatarIds);
  return all.filter((a) => allowed.has(a.id));
}

export type ResolvedFace = { avatarId: string; name?: string; imageUrl?: string; gender?: 'woman' | 'man'; source: 'student' | 'course' | 'school' };

// The face for a call: the student's own pick (if the school still offers
// it), else the course's, else the school's default, else the platform default.
export async function resolveTutorFace(
  institutionId: string | undefined,
  courseId: string | undefined,
  studentId?: string,
): Promise<ResolvedFace | undefined> {
  if (studentId) {
    const pick = await StudentTutorChoice.findOne({ studentId }).lean();
    if (pick) {
      const offered = institutionId ? await TutorFaceOptions.findOne({ institutionId }).lean() : null;
      if (!offered?.avatarIds.length || offered.avatarIds.includes(pick.avatarId)) {
        return { avatarId: pick.avatarId, name: pick.name, imageUrl: pick.imageUrl, gender: pick.gender, source: 'student' };
      }
    }
  }
  if (!institutionId) return undefined;
  const faces = await TutorFace.find({ institutionId, courseId: { $in: ['', courseId || ''] } }).lean();
  const course = faces.find((f) => courseId && f.courseId === courseId);
  const face = course || faces.find((f) => f.courseId === '');
  return face
    ? { avatarId: face.avatarId, name: face.name, imageUrl: face.imageUrl, gender: face.gender, source: course ? 'course' : 'school' }
    : undefined;
}
