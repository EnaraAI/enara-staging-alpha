// DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)
// Validates data/outcomes/outcomes.json against data/outcomes/schema.json with a small
// hand validator (ajv is not installed), plus cross-record checks.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const schema = JSON.parse(readFileSync(join(root, 'data/outcomes/schema.json'), 'utf8'));
const doc = JSON.parse(readFileSync(join(root, 'data/outcomes/outcomes.json'), 'utf8'));
const placement = JSON.parse(readFileSync(join(root, 'data/assessments/placement/placement.json'), 'utf8'));
const outcomes: any[] = doc.outcomes;

/** Subset of JSON Schema used by schema.json. Returns error strings. */
function validate(s: any, v: any, path = '$'): string[] {
  const e: string[] = [];
  const type = (x: any) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x);
  if (s.type) {
    const t = type(v);
    if (!(s.type === t || (s.type === 'integer' && Number.isInteger(v)))) return [`${path}: type ${t} != ${s.type}`];
  }
  if ('const' in s && v !== s.const) e.push(`${path}: != const ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) e.push(`${path}: ${JSON.stringify(v)} not in enum`);
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(v)) e.push(`${path}: pattern ${s.pattern}`);
    if (s.minLength !== undefined && v.length < s.minLength) e.push(`${path}: minLength`);
    if (s.maxLength !== undefined && v.length > s.maxLength) e.push(`${path}: maxLength`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) e.push(`${path}: minItems`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) e.push(`${path}: uniqueItems`);
    if (s.items) v.forEach((x, i) => e.push(...validate(s.items, x, `${path}[${i}]`)));
  }
  if (type(v) === 'object') {
    for (const r of s.required ?? []) if (!(r in v)) e.push(`${path}: missing ${r}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties?.[k]) e.push(...validate(s.properties[k], x, `${path}.${k}`));
      else if (s.additionalProperties === false) e.push(`${path}: extra property ${k}`);
    }
  }
  if (s.not && validate(s.not, v, path).length === 0) e.push(`${path}: matches 'not'`);
  for (const sub of s.allOf ?? []) {
    if (sub.if && validate(sub.if, v, path).length === 0 && sub.then) e.push(...validate(sub.then, v, path));
  }
  return e;
}

const BANNED = /\b(understand|know|learn|appreciate|be aware of|be familiar with|grasp|feel confident|master|internalise|internalize|think about)\b/i;

describe('outcomes.json', () => {
  it('is DRAFT and A1-A2 only', () => {
    expect(doc.status).toBe('DRAFT');
    for (const o of outcomes) expect(['A1', 'A2']).toContain(o.cefr);
  });
  it('the hand validator rejects a bad record', () => {
    expect(validate(schema, { ...outcomes[0], statement: 'Can understand things well.' }).length).toBeGreaterThan(0);
    expect(validate(schema, { ...outcomes[0], extra: 1 }).length).toBeGreaterThan(0);
  });
  it('every record validates against schema.json', () => {
    const errors = outcomes.flatMap((o) => validate(schema, o, o.id));
    expect(errors).toEqual([]);
  });
  it('ids are unique and level letter matches', () => {
    expect(new Set(outcomes.map((o) => o.id)).size).toBe(outcomes.length);
    for (const o of outcomes) expect(o.id.split('-')[1]).toBe({ course: 'C', lesson: 'L', form: 'F' }[o.level as string]);
  });
  it('banned verbs are absent from statements, conditions and criteria', () => {
    for (const o of outcomes) for (const f of ['statement', 'condition', 'criterion']) expect(BANNED.test(o[f]), `${o.id}.${f}`).toBe(false);
  });
  it('every record has a reference; form records have hasLesson matching lessonIds', () => {
    for (const o of outcomes) expect(o.reference, o.id).toBeTruthy();
    for (const o of outcomes.filter((x) => x.level === 'form')) expect(o.hasLesson, o.id).toBe(o.lessonIds.length > 0);
  });
  it('links resolve: lessons -> course, forms -> lesson (if any) and course', () => {
    const byId = new Map(outcomes.map((o) => [o.id, o]));
    for (const o of outcomes) for (const p of o.parentIds ?? []) expect(byId.has(p), `${o.id} -> ${p}`).toBe(true);
    for (const o of outcomes.filter((x) => x.level === 'lesson')) expect(o.parentIds.some((p: string) => byId.get(p)?.level === 'course'), o.id).toBe(true);
    for (const o of outcomes.filter((x) => x.level === 'form')) {
      const lv = o.parentIds.map((p: string) => byId.get(p)?.level);
      expect(lv, o.id).toContain('course');
      if (o.hasLesson) expect(lv, o.id).toContain('lesson');
    }
  });
  it('lesson ids exist in the A1-A2 inventory (LEARNING_OUTCOMES.md PART 8)', () => {
    const inv = readFileSync(join(root, 'docs/LEARNING_OUTCOMES.md'), 'utf8');
    for (const o of outcomes) for (const l of o.lessonIds) expect(inv.includes('`' + l + '`'), `${o.id}: ${l}`).toBe(true);
  });
  it('listening and speaking are NOT MEASURABLE YET and have no placement items', () => {
    const nm = new Set(outcomes.filter((o) => o.measurable === 'NOT_MEASURABLE_YET').map((o) => o.id));
    for (const o of outcomes.filter((x) => ['listening', 'speaking'].includes(x.skill))) expect(nm.has(o.id)).toBe(true);
    const byId = new Map(outcomes.map((o) => [o.id, o]));
    for (const item of placement.items) {
      expect(['listening', 'speaking']).not.toContain(item.skill);
      for (const id of item.outcomeIds) {
        expect(byId.has(id), `${item.id} -> ${id}`).toBe(true);
        expect(nm.has(id), `${item.id} -> ${id}`).toBe(false);
      }
    }
  });
});
