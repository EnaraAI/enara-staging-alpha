import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { readSeedFiles, SeedFile, seedObjectives, unverifiedFiles } from '../../src/assessment/curricula';
import { RubricSchema } from '../../src/assessment/schema';

// Assessment engine P1a: curriculum seeds (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §5).
describe('curriculum seeds', () => {
  it('the repo seed files all pass the check; Egyptian national files wait for the official documents', () => {
    const files = readSeedFiles();
    expect(files.length).toBe(21);
    const list = unverifiedFiles(files);
    expect(list.length).toBe(21);
    expect(list).toContain('eg-national/g4/math.json');
    expect(list).toContain('eg-national/g12/philosophy_logic.json');
    const g12 = files.filter((f) => f.file.grade === 'G12');
    expect(g12.length).toBe(9);
    expect(g12.every((f) => f.file.tracks?.length)).toBe(true);
    for (const f of files) expect(f.file.subject_title.ar).toMatch(/[؀-ۿ]/);
  });
  it('CEFR objectives come from the outcome bank (one source), as drafts; unverified files add nothing', () => {
    const rows = seedObjectives();
    expect(rows.length).toBe(95);
    expect(rows.every((r) => r.curriculumKey === 'cefr' && r.source.status === 'unverified')).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it('refuses objectives in an unverified file, and a verified file without a year', () => {
    const f = { curriculum: 'eg-national', grade: 'G4', subject: 'math', domain: 'math', subject_title: { ar: 'الرياضيات', en: 'Maths' }, version: 1, source: { document: 'Official syllabus document name', year: null, status: 'unverified' }, objectives: [{ code: 'M4.1', title_ar: 'الجمع', title_en: 'Addition' }] };
    expect(SeedFile.safeParse(f).success).toBe(false);
    expect(SeedFile.safeParse({ ...f, source: { ...f.source, status: 'verified' } }).success).toBe(false);
    expect(SeedFile.safeParse({ ...f, source: { ...f.source, status: 'verified', year: 2024 } }).success).toBe(true);
    expect(SeedFile.safeParse({ ...f, source: { ...f.source, status: 'verified', year: 2024 }, objectives: [f.objectives[0], f.objectives[0]] }).success).toBe(false);
  });
  it('a verified file becomes rows with both titles, the track and the source; a bad file stops the load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seeds-'));
    mkdirSync(join(dir, 'eg-national', 'g12'), { recursive: true });
    writeFileSync(join(dir, 'eg-national', 'g12', 'physics.json'), JSON.stringify({ curriculum: 'eg-national', grade: 'G12', subject: 'physics', domain: 'science', subject_title: { ar: 'الفيزياء', en: 'Physics' }, tracks: ['science', 'maths'], version: 1, source: { document: 'MOETE Physics G12 syllabus', year: 2024, status: 'verified' }, objectives: [{ code: 'PH12.U1.L1', title_ar: 'التيار الكهربي', title_en: 'Electric current' }, { code: 'PH12.U1.L2', title_ar: 'قانون أوم', title_en: "Ohm's law", tracks: ['maths'] }] }));
    const rows = seedObjectives(readSeedFiles(dir)).filter((r) => r.curriculumKey === 'eg-national');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'seed-eg-national-g12-physics-ph12-u1-l1', titleAr: 'التيار الكهربي', titleEn: 'Electric current', tracks: ['science', 'maths'], language: 'ar', level: 'G12', curriculumId: 'seed:eg-national:G12:physics' });
    expect(rows[1].tracks).toEqual(['maths']);
    writeFileSync(join(dir, 'eg-national', 'g12', 'bad.json'), JSON.stringify({ curriculum: 'eg-national' }));
    expect(() => readSeedFiles(dir)).toThrow(/bad.json/);
    expect(readSeedFiles(null)).toEqual([]);
  });
});

describe('rubric schema', () => {
  const r = { id: 'rub-lang-essay', version: 1, domain: 'language', type: 'essay', total_points: 4, criteria: [{ code: 'task_completion', title_ar: 'إنجاز المهمة', title_en: 'Task completion', max_points: 2, descriptors_ar: { '0': 'لم ينجز', '2': 'أنجز' }, descriptors_en: { '0': 'Not done', '2': 'Done' } }, { code: 'mechanics', title_ar: 'الإملاء والترقيم', title_en: 'Mechanics', max_points: 2, descriptors_ar: {}, descriptors_en: {} }] };
  it('accepts bilingual criteria whose points add up, refuses otherwise', () => {
    expect(RubricSchema.safeParse(r).success).toBe(true);
    expect(RubricSchema.safeParse({ ...r, total_points: 5 }).success).toBe(false);
  });
});
