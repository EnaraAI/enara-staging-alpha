import { describe, expect, it } from 'vitest';
import { buildPeopleIndex, fileRefs, scanDoc, shapeFor, stripDoc } from '../src/contentCopy/transform';
import { mongoHost, TEST_CLUSTER_HOST_PREFIX } from '../src/maintenance/routes';

// Content copy to the LMS test site (docs/lms/CONTENT_COPY.md): people and
// schools are stripped, files are not copied, and any personal data left in
// text holds the record back.

describe('stripDoc', () => {
  it('removes every reference to a person, school, class or file, at any depth', () => {
    const doc = {
      _id: 'x', id: 'CUR-1', name: 'English A2', institutionId: 'real-school', createdBy: 'u1', assignedBatches: ['Grade 7B Ms X'],
      chapters: [{ id: 'L1', title: 'Hello', uploads: ['r2/key/teacher-file.pdf'], quiz: { questions: [{ id: 'q', text: 'Hi?', createdBy: 'u2' }] } }],
      history: [{ by: 'u3', at: 'd' }], batchId: 'b', studentId: 's', fileUrl: 'https://r2/x', deploymentLink: 'https://x',
    };
    expect(stripDoc(doc)).toEqual({ id: 'CUR-1', name: 'English A2', chapters: [{ id: 'L1', title: 'Hello', uploads: [], quiz: { questions: [{ id: 'q', text: 'Hi?' }] } }], history: [] });
  });
  it('keeps dates and numbers', () => {
    const d = new Date('2026-01-01');
    expect(stripDoc({ dueDate: d, points: 3 })).toEqual({ dueDate: d, points: 3 });
  });
});

describe('shapeFor', () => {
  it('skips per-student tutor faces, renames document files, clears plan versions', () => {
    expect(shapeFor('tutorfaces', { avatarId: 'a' }, 0)).toBeNull();
    expect(shapeFor('tutorfaces', { courseId: 'C', avatarId: 'a' }, 0)).toEqual({ courseId: 'C', avatarId: 'a' });
    expect(shapeFor('curriculum_chunks', { id: 'k', fileName: 'Ahmed Ali homework.pdf', text: 't' }, 4)).toMatchObject({ fileName: 'document-5' });
    expect(shapeFor('lesson_plans', { id: 'p', versions: [{ savedBy: 'u' }] }, 0)).toMatchObject({ versions: [] });
  });
  it('fileRefs counts files per lesson without names', () => {
    expect(fileRefs([{ id: 'C1', chapters: [{ id: 'L1', uploads: ['a', 'b'] }, { id: 'L2', uploads: [] }] }])).toEqual([{ curriculumId: 'C1', lessonId: 'L1', files: 2 }]);
  });
});

describe('personal-data scan', () => {
  const people = buildPeopleIndex([{ name: 'Mona Hassan', email: 'mona@school.eg' }, { name: 'Ali', email: 'ali@x.eg' }]);
  it('flags real full names, any email and phone numbers, with paths and kinds only', () => {
    const hits = scanDoc({ chapters: [{ text: 'Ask mona HASSAN about it' }], note: 'mail mona@school.eg', other: 'write to a@b.co', tel: 'call +20 100 123 4567' }, people);
    expect(hits).toEqual(expect.arrayContaining([
      { path: 'chapters[0].text', kind: 'real_name' },
      { path: 'note', kind: 'real_email' },
      { path: 'other', kind: 'email' },
      { path: 'tel', kind: 'phone' },
    ]));
    expect(JSON.stringify(hits)).not.toMatch(/mona|hassan|4567/i);
  });
  it('does not flag single first names or normal lesson text', () => {
    expect(scanDoc({ text: 'Ali goes to school at 7:30. Page 12 of 2026.' }, people)).toEqual([]);
  });
});

describe('import safety', () => {
  it('only the test cluster passes the import check', () => {
    expect((mongoHost('mongodb+srv://u:p@enara-lms-test.vrcgfbg.mongodb.net/enara_staging_alpha') ?? '').startsWith(TEST_CLUSTER_HOST_PREFIX)).toBe(true);
    expect((mongoHost('mongodb+srv://u:p@cluster0.real.mongodb.net/enara_staging_alpha') ?? '').startsWith(TEST_CLUSTER_HOST_PREFIX)).toBe(false);
  });
});
