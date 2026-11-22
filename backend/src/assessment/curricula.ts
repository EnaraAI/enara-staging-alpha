// Curriculum seeds for the assessment engine (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §5). Objectives come only from official syllabus
// documents: every seed file names its source document and year, and a file whose document is not in the repo is "unverified" with
// no objectives (it loads nothing). Seeds become LearningObjective rows in the shared space (institutionId ENARA-SHARED), with
// Arabic and English titles in `translations`; nothing school-owned is touched. CEFR comes from the existing outcome bank
// (data/outcomes/outcomes.json), read in place so there is one source.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { z } from 'zod';
import { loadOutcomes } from '../parents/levels';

export const SHARED_INSTITUTION = 'ENARA-SHARED';
const TRACKS = ['science', 'maths', 'literary'] as const;

const SeedObjective = z.object({
  code: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  unit: z.string().max(200).optional(),
  lesson: z.string().max(200).optional(),
  title_ar: z.string().min(1).max(500),
  title_en: z.string().min(1).max(500),
  tracks: z.array(z.enum(TRACKS)).optional(),
}).strict();

export const SeedFile = z.object({
  curriculum: z.string().regex(/^[a-z0-9:-]{2,64}$/),
  grade: z.string().regex(/^[A-Za-z0-9-]{1,16}$/),
  subject: z.string().regex(/^[a-z_]{2,40}$/),
  domain: z.enum(['language', 'math', 'science', 'humanities', 'code', 'other']),
  subject_title: z.object({ ar: z.string().min(1), en: z.string().min(1) }).strict(),
  tracks: z.array(z.enum(TRACKS)).optional(),
  version: z.number().int().min(1),
  source: z.object({ document: z.string().min(10), year: z.number().int().min(1990).max(2100).nullable(), url: z.string().url().optional(), status: z.enum(['verified', 'unverified']) }).strict(),
  note: z.string().optional(),
  objectives: z.array(SeedObjective),
}).strict().superRefine((f, ctx) => {
  if (f.source.status === 'unverified' && f.objectives.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'an unverified file has no objectives (they must come from the official document)' });
  if (f.source.status === 'verified' && (!f.objectives.length || f.source.year === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a verified file names the document year and has objectives' });
  const codes = f.objectives.map((o) => o.code);
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'objective codes repeat' });
});
export type SeedFile = z.infer<typeof SeedFile>;

export interface SeedObjectiveRow {
  id: string; curriculumKey: string; curriculumId: string; level: string; subjectKey: string; domain: string; code: string;
  titleAr: string | null; titleEn: string; language: 'ar' | 'en'; tracks: string[];
  source: { document: string; year: number | null; url?: string; status: 'verified' | 'unverified' };
}

export function curriculaDir(): string | null {
  const candidates = [join(__dirname, '../../../data/curricula'), join(process.cwd(), '../data/curricula'), join(process.cwd(), 'data/curricula')];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.json') ? [p] : []; });

/** Every seed file, checked. A file that fails the check stops the load (seeds are code-reviewed data, never guessed). */
export function readSeedFiles(dir = curriculaDir()): { path: string; file: SeedFile }[] {
  if (!dir) return [];
  return walk(dir).sort().map((p) => {
    const parsed = SeedFile.safeParse(JSON.parse(readFileSync(p, 'utf8')));
    if (!parsed.success) throw new Error(`curriculum seed ${relative(dir, p)}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ')}`);
    return { path: relative(dir, p), file: parsed.data };
  });
}

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The objective rows the seeds describe: CEFR from the outcome bank, then every seed file's objectives. */
export function seedObjectives(files = readSeedFiles()): SeedObjectiveRow[] {
  const cefr: SeedObjectiveRow[] = loadOutcomes().map((o) => ({
    id: `seed-cefr-${safe(o.id)}`, curriculumKey: 'cefr', curriculumId: `seed:cefr:${o.cefr}:english`, level: o.cefr, subjectKey: 'english', domain: 'language',
    code: o.id, titleAr: null, titleEn: o.statement, language: 'en', tracks: [],
    // The ENARA CEFR outcome bank is itself marked DRAFT (not yet reviewed), so its objectives load as drafts.
    source: { document: 'data/outcomes/outcomes.json: ENARA CEFR outcome bank (A1-A2, DRAFT, based on the CEFR Companion Volume)', year: 2026, status: 'unverified' },
  }));
  const rest = files.flatMap(({ file }) => file.objectives.map((o) => ({
    id: `seed-${safe(file.curriculum)}-${safe(file.grade)}-${safe(file.subject)}-${safe(o.code)}`,
    curriculumKey: file.curriculum, curriculumId: `seed:${file.curriculum}:${file.grade}:${file.subject}`, level: file.grade, subjectKey: file.subject, domain: file.domain,
    code: o.code, titleAr: o.title_ar, titleEn: o.title_en, language: (file.domain === 'language' && file.subject === 'arabic') || file.curriculum === 'eg-national' ? 'ar' as const : 'en' as const,
    tracks: o.tracks ?? file.tracks ?? [], source: file.source,
  })));
  return [...cefr, ...rest];
}

/** Seed files still waiting for their official document (listed in the plan). */
export const unverifiedFiles = (files = readSeedFiles()): string[] => files.filter((f) => f.file.source.status === 'unverified').map((f) => f.path);

/** Writes the seed objectives into learning_objectives (shared space). Idempotent: same ids, fields set again; nothing removed. */
export async function applySeeds(): Promise<{ objectives: number; unverifiedFiles: number }> {
  const { LearningObjective } = await import('../models/LearningObjective');
  const files = readSeedFiles();
  const rows = seedObjectives(files);
  for (let i = 0; i < rows.length; i += 200) {
    await LearningObjective.bulkWrite(rows.slice(i, i + 200).map((r) => ({
      updateOne: {
        filter: { id: r.id },
        update: {
          $set: {
            institutionId: SHARED_INSTITUTION, curriculumId: r.curriculumId, code: r.code, title: r.titleEn, language: r.language,
            translations: { en: { title: r.titleEn }, ...(r.titleAr ? { ar: { title: r.titleAr } } : {}) },
            curriculumKey: r.curriculumKey, level: r.level, subjectKey: r.subjectKey, ...(r.tracks.length === 1 ? { track: r.tracks[0] } : {}),
            source: r.source, origin: 'seed', status: r.source.status === 'verified' ? 'approved' : 'draft',
          },
          $setOnInsert: { id: r.id, version: 1, createdBy: 'system:seed' },
        },
        upsert: true,
      },
    })) as Parameters<typeof LearningObjective.bulkWrite>[0]);
  }
  return { objectives: rows.length, unverifiedFiles: unverifiedFiles(files).length };
}
