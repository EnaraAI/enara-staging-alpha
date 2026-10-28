import { canonical, sha256 } from './contract';
import type { RubricText } from './nativeGrader';

// G2: rubric wording is outside the snapshot hash, so it is hashed and frozen separately.
// Canonicalization: contract.canonical (JSON, object keys sorted by code-unit order, arrays kept
// in order, no whitespace), criteria sorted by criterionId and levels by levelId first, encoded
// UTF-8. Text is NOT normalised (no Unicode normalisation, trimming or case folding): the exact
// strings are hashed. The digest is recorded in the evaluation manifest.
export const CANONICALIZATION = 'candidateV2.rubricText.v1: sort criteria by criterionId, levels by levelId; contract.canonical JSON (sorted keys, no whitespace); UTF-8; no text normalisation';

export function canonicalRubricText(t: RubricText): string {
  const sorted = {
    rubricId: t.rubricId,
    rubricVersion: t.rubricVersion,
    criteria: [...t.criteria].sort((a, b) => (a.criterionId < b.criterionId ? -1 : a.criterionId > b.criterionId ? 1 : 0)).map((c) => ({
      criterionId: c.criterionId, title: c.title, description: c.description,
      levels: [...c.levels].sort((a, b) => (a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0)).map((l) => ({ levelId: l.levelId, description: l.description })),
    })),
  };
  return canonical(sorted);
}

export const rubricTextHash = (t: RubricText) => sha256(canonicalRubricText(t));

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
