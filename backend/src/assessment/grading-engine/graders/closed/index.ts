// Closed item types, graded by code (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3). One entry point: gradeClosed(item, answer).
// The item is checked against the schema first: a malformed item is an error, never a grade.
import { ClosedItem, type GradeResult } from '../../../schema';
import { gradeDropdown } from './dropdown';
import { gradeFillBlank } from './fillBlank';
import { gradeMatching } from './matching';
import { gradeMcq } from './mcq';
import { gradeNumeric } from './numeric';
import { gradeOrdering } from './ordering';
import { gradeTrueFalse } from './trueFalse';

export class InvalidItemError extends Error {
  constructor(public issues: string[]) { super(`invalid item: ${issues.join('; ')}`); }
}

export function gradeClosed(rawItem: unknown, answer: unknown): GradeResult {
  const parsed = ClosedItem.safeParse(rawItem);
  if (!parsed.success) throw new InvalidItemError(parsed.error.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`));
  const item = parsed.data;
  const max = item.points ?? 1;
  switch (item.type) {
    case 'mcq': return gradeMcq(item, answer, max);
    case 'true_false': return gradeTrueFalse(item, answer, max);
    case 'fill_blank': return gradeFillBlank(item, answer, max);
    case 'matching': return gradeMatching(item, answer, max);
    case 'numeric': return gradeNumeric(item, answer, max);
    case 'ordering': return gradeOrdering(item, answer, max);
    case 'dropdown': return gradeDropdown(item, answer, max);
  }
}
