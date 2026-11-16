// Content copy (real database -> LMS test database), pure functions only:
// which collections are copied, what is stripped, and the personal-data scan.
// See docs/lms/CONTENT_COPY.md. No people, classes, attempts or chats are ever
// copied; only learning content, with every reference to a person removed.

export const CONTENT_COLLECTIONS = [
  'curriculums',
  'assessments',
  'assessment_versions',
  'learning_objectives',
  'lesson_plans',
  'curriculum_chunks',
  'tutorfaces',
] as const;
export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

// Keys removed anywhere in a document (people, schools, who-did-what, files).
const DROP_KEYS = new Set([
  '_id', '__v', 'institutionId', 'schoolId',
  'createdBy', 'updatedBy', 'publishedBy', 'approvedBy', 'savedBy', 'uploadedBy', 'by', 'actor', 'reviewedBy', 'deletedBy',
  'studentId', 'studentIds', 'batchId', 'batchIds', 'classId', 'assignedBatches', 'instructorIds', 'teacherId',
  'email', 'phone', 'userId', 'parentUserId',
  'fileUrl', 'uploadId', 'deploymentLink',
]);
// Keys replaced with an empty value rather than removed.
const EMPTY_ARRAY_KEYS = new Set(['uploads', 'history']);

export function stripDoc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDoc);
  if (value && typeof value === 'object' && !(value instanceof Date) && !isObjectIdLike(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = EMPTY_ARRAY_KEYS.has(k) ? [] : stripDoc(v);
    }
    return out;
  }
  return value;
}

function isObjectIdLike(v: object): boolean {
  return (v as { _bsontype?: string })._bsontype === 'ObjectId' || (v as { _bsontype?: string })._bsontype === 'ObjectID';
}

/** Per-collection rules applied after stripDoc. Returns null to skip the document. */
export function shapeFor(collection: ContentCollection, doc: Record<string, unknown>, index: number): Record<string, unknown> | null {
  if (collection === 'tutorfaces' && !doc.courseId) return null; // course-level faces only
  if (collection === 'curriculum_chunks') return { ...doc, fileName: `document-${index + 1}` };
  if (collection === 'learning_objectives') return { ...doc, history: [] };
  if (collection === 'lesson_plans') return { ...doc, versions: [] };
  return doc;
}

/** Counts of uploaded files referenced per curriculum lesson (for the files decision; no names). */
export function fileRefs(curricula: Record<string, unknown>[]): { curriculumId: string; lessonId: string; files: number }[] {
  const out: { curriculumId: string; lessonId: string; files: number }[] = [];
  for (const c of curricula) {
    for (const ch of (c.chapters as { id?: string; uploads?: unknown[] }[] | undefined) ?? []) {
      const n = Array.isArray(ch.uploads) ? ch.uploads.length : 0;
      if (n) out.push({ curriculumId: String(c.id), lessonId: String(ch.id), files: n });
    }
  }
  return out;
}

// ---- Personal-data scan --------------------------------------------------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// 8+ digits, optionally with +, spaces, dashes or dots between them.
const PHONE_RE = /(?:\+?\d[\s.-]?){8,}\d/;

export interface PeopleIndex {
  names: string[]; // lowercased full names (2+ words)
  emails: Set<string>;
}

export function buildPeopleIndex(people: { name?: string; email?: string }[]): PeopleIndex {
  const names = new Set<string>();
  const emails = new Set<string>();
  for (const p of people) {
    const n = (p.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (n.split(' ').length >= 2 && n.length >= 6) names.add(n);
    if (p.email) emails.add(p.email.trim().toLowerCase());
  }
  return { names: [...names], emails };
}

export type Hit = { path: string; kind: 'email' | 'phone' | 'real_name' | 'real_email' };

/** Finds personal data in every string of a document. Returns paths and kinds only, never the text. */
export function scanDoc(doc: unknown, people: PeopleIndex, path = ''): Hit[] {
  if (typeof doc === 'string') {
    const hits: Hit[] = [];
    const lower = doc.toLowerCase();
    const email = EMAIL_RE.exec(doc);
    if (email) hits.push({ path, kind: people.emails.has(email[0].toLowerCase()) ? 'real_email' : 'email' });
    if (PHONE_RE.test(doc)) hits.push({ path, kind: 'phone' });
    if (people.names.some((n) => lower.includes(n))) hits.push({ path, kind: 'real_name' });
    return hits;
  }
  if (Array.isArray(doc)) return doc.flatMap((v, i) => scanDoc(v, people, `${path}[${i}]`));
  if (doc && typeof doc === 'object' && !(doc instanceof Date)) {
    return Object.entries(doc as Record<string, unknown>).flatMap(([k, v]) => scanDoc(v, people, path ? `${path}.${k}` : k));
  }
  return [];
}
