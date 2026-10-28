import { Student } from '../models/Student';
import { originFilter, type OriginView } from './analyticsService';

// Demo/live views for teacher and class dashboards (P1 review). Same rule as
// school analytics: default live; records without an origin are live;
// `demo_seed` and `all` only select a view. They never widen tenant or class
// scope: every caller first scopes by institution and class, then narrows.
export { originFilter, type OriginView };

export function parseOriginView(value: unknown): OriginView {
  return value === 'demo_seed' || value === 'all' ? value : 'live';
}

// The students (already in scope) that belong to the view. Derived records
// without their own origin (mastery, misconceptions, interventions, TTU,
// history) follow their student.
export async function studentsInView(ids: string[], view: OriginView): Promise<string[]> {
  if (view === 'all' || !ids.length) return ids;
  const keep = await Student.find({ id: { $in: ids }, ...originFilter(view) }).select('id').lean();
  const set = new Set(keep.map((s) => s.id));
  return ids.filter((id) => set.has(id));
}

// A studentId clause for institution-wide queries over derived records.
export async function studentClauseForView(institutionId: string | undefined, view: OriginView): Promise<Record<string, unknown>> {
  if (view === 'all') return {};
  const demo = await Student.find({ ...(institutionId ? { institutionId } : {}), origin: 'demo_seed' }).select('id').lean();
  const ids = demo.map((s) => s.id);
  return view === 'demo_seed' ? { studentId: { $in: ids } } : ids.length ? { studentId: { $nin: ids } } : {};
}
