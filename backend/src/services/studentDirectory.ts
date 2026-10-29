import { Batch } from '../models/Batch';
import { Student } from '../models/Student';
import { normaliseArabic } from './textSearch';

// Named-student lookups for educator analytics (P10). Only educational
// context the staff member may already see: name, grade (Student.grade),
// class (the student's batch: Student.batchId -> Batch.name, same school) and
// the courses they are enrolled in within the caller's scope (CourseInstance
// membership, never guessed from labels). Never contact details, birth date,
// health or other profile fields.

export interface StudentProfile {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  courses: string[];
}

export async function studentProfiles(institutionId: string, ids: string[], enrolment: Map<string, string[]>): Promise<Map<string, StudentProfile>> {
  const students = await Student.find({ id: { $in: ids }, institutionId }).select('id name grade batchId').lean();
  const batchIds = [...new Set(students.map((s) => s.batchId).filter(Boolean))] as string[];
  const batches = new Map((await Batch.find({ id: { $in: batchIds }, institutionId }).select('id name').lean()).map((b) => [b.id, b.name]));
  return new Map(
    students.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        grade: typeof s.grade === 'string' && s.grade.trim() ? s.grade.trim() : null,
        className: (s.batchId && batches.get(s.batchId)) || null,
        courses: [...new Set(enrolment.get(s.id) ?? [])].sort(),
      },
    ]),
  );
}

const norm = (t: string) => normaliseArabic(t.toLowerCase()).replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '\\p{L}\\p{N}';
// A name (or name part) present as a whole word, also after Arabic prefixes.
const present = (text: string, name: string) => new RegExp(`(?<![${B}'])(?:ال|و|ب|ل|ك|لل)?${esc(name)}(?![${B}])`, 'u').test(text);

export interface NameMatch {
  // Students the request names. Exact full-name matches win over name parts.
  ids: string[];
  // Distinct name strings found (for "more than one student named").
  mentions: string[];
  exact: boolean;
}

// Which authorised students a request names. Full names first; otherwise
// first or last names of 3+ letters. Several students sharing the matched
// name are all returned, so the caller can ask which one; nothing is chosen
// silently.
export function matchStudentNames(question: string, candidates: { id: string; name: string }[]): NameMatch {
  const q = norm(question);
  const full = candidates.filter((c) => norm(c.name).length >= 3 && present(q, norm(c.name)));
  if (full.length) {
    // Keep the longest matched names (a full name contains its parts).
    const longest = Math.max(...full.map((c) => norm(c.name).length));
    const keep = full.filter((c) => !full.some((o) => norm(o.name).length > norm(c.name).length && norm(o.name).includes(norm(c.name))) || norm(c.name).length === longest);
    return { ids: keep.map((c) => c.id), mentions: [...new Set(keep.map((c) => norm(c.name)))], exact: true };
  }
  const parts = candidates.flatMap((c) => norm(c.name).split(/[\s-]+/).filter((p) => p.length >= 3).map((p) => ({ id: c.id, part: p })));
  const hit = parts.filter((p) => present(q, p.part));
  return { ids: [...new Set(hit.map((h) => h.id))], mentions: [...new Set(hit.map((h) => h.part))], exact: false };
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Possible typos of an authorised student's name (offered, never chosen):
// words of 4+ letters within one edit (two for 8+ letters) of a name part.
export function nearStudentNames(question: string, candidates: { id: string; name: string }[]): string[] {
  const words = norm(question).split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 4);
  const out = new Set<string>();
  for (const c of candidates) {
    for (const part of norm(c.name).split(/[\s-]+/).filter((p) => p.length >= 4)) {
      if (words.some((w) => w !== part && distance(w, part) <= (part.length >= 8 ? 2 : 1))) out.add(c.id);
    }
  }
  return [...out];
}
