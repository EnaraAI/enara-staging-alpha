import { validateRubric, type Rubric, type Snapshot } from './contract';
import type { CandidateV2Budget } from './budget';
import { ProviderError, RETRYABLE, type Provider } from './provider';
import { deepFreeze, rubricTextHash } from './rubricIntegrity';
import type { Grader } from './runner';

// Candidate V2 native rubric grader (design NATIVE_RUBRIC_GRADER_DESIGN.md, D1).
// Builds a structured request from the snapshot + the rubric wording bundle, calls the
// injected provider, and returns the parsed reply. It never fills in fields and never
// decides validity: the runner passes the result to contract.validateOpenOutput.
// No anchors, no reference scores, no V1 code. Prompt text (D2), model (D5) and
// repair policy (D4) are not decided here; transport retries are configurable (default 0).

export interface RubricText {
  rubricId: string;
  rubricVersion: number;
  criteria: { criterionId: string; title: string; description: string; levels: { levelId: string; description: string }[] }[];
}
export interface Reference { kind: 'reference_answer' | 'marking_guide'; text: string; provenance: string }

export interface GraderRequest {
  candidateVersion: string; rubricId: string; rubricVersion: number; questionId: string; attemptId: string; inputSnapshotHash: string;
  question: string; answer: string;
  criteria: { criterionId: string; title: string; description: string; maxPoints: number; levels: { levelId: string; points: number; description: string }[] }[];
  references?: Reference[];
}

export class GraderError extends Error {
  constructor(public code: 'RUBRIC_TEXT_MISMATCH' | 'NOT_OPEN_RESPONSE' | 'BUDGET_EXCEEDED' | 'PROVIDER_ERROR' | 'TIMEOUT', message: string, public timeout = false) {
    super(message);
  }
}

// Compatibility check (design §3 items 1-2): the wording bundle must cover exactly the rubric's ids.
export function checkRubricCompatibility(rubric: Rubric | undefined, text: RubricText): { ok: true } | { ok: false; problems: string[] } {
  const p: string[] = [];
  const v = validateRubric(rubric);
  if (!v.ok) return { ok: false, problems: v.problems };
  const r = rubric!;
  if (text.rubricId !== r.id || text.rubricVersion !== r.version) p.push('rubric text is for a different rubric id or version');
  const want = r.criteria.map((c) => c.id).sort().join('|');
  const got = text.criteria.map((c) => c.criterionId).sort().join('|');
  if (want !== got) p.push('rubric text criteria differ from the rubric');
  for (const c of r.criteria) {
    const t = text.criteria.find((x) => x.criterionId === c.id);
    if (!t) continue;
    if (c.levels.map((l) => l.id).sort().join('|') !== t.levels.map((l) => l.levelId).sort().join('|')) p.push(`criterion ${c.id}: level wording differs from declared levels`);
    if (!t.description.trim() || t.levels.some((l) => !l.description.trim())) p.push(`criterion ${c.id}: missing wording`);
  }
  return p.length ? { ok: false, problems: p } : { ok: true };
}

export function buildRequest(snap: Snapshot, answer: string, text: RubricText, references?: Reference[]): GraderRequest {
  const r = snap.rubric!;
  return {
    candidateVersion: snap.candidateVersion, rubricId: r.id, rubricVersion: r.version, questionId: snap.questionId, attemptId: snap.attemptId,
    inputSnapshotHash: snap.hash, question: snap.questionText, answer,
    criteria: r.criteria.map((c) => {
      const t = text.criteria.find((x) => x.criterionId === c.id)!;
      return { criterionId: c.id, title: t.title, description: t.description, maxPoints: c.maxPoints,
        levels: c.levels.map((l) => ({ levelId: l.id, points: l.points, description: t.levels.find((x) => x.levelId === l.id)!.description })) };
    }),
    ...(references?.length ? { references: references.map((x) => ({ ...x })) } : {}),
  };
}

// Reply text -> object for the contract. Empty -> null (EMPTY_OUTPUT); unparseable -> the raw
// string (MALFORMED_OUTPUT). Nothing is repaired or defaulted.
export function parseReply(text: string): unknown {
  const t = (text ?? '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    return t;
  }
}

export interface NativeGraderOptions {
  provider: Provider;
  rubricText: RubricText;
  references?: Reference[];
  budget?: CandidateV2Budget;
  model?: string; // D5 (undecided); used for budget accounting only
  maxOutputTokens?: number;
  callTimeoutMs?: number;
  transportRetries?: number; // D4; default 0
}

export type NativeGrader = Grader & { rubricTextSha256: string };

export function createNativeGrader(o: NativeGraderOptions): NativeGrader {
  const retries = o.transportRetries ?? 0;
  const timeoutMs = o.callTimeoutMs ?? 60_000;
  // G2: a private frozen copy of the wording, hashed once and re-checked before every call.
  const rubricText = deepFreeze(structuredClone(o.rubricText));
  const textSha = rubricTextHash(rubricText);
  const grader = async (snap: Snapshot, answer: string) => {
    if (snap.kind !== 'open-response') throw new GraderError('NOT_OPEN_RESPONSE', 'native grader handles open responses only');
    if (rubricTextHash(rubricText) !== textSha) throw new GraderError('RUBRIC_TEXT_MISMATCH', 'rubric text changed during the run');
    const compat = checkRubricCompatibility(snap.rubric, rubricText);
    if (!compat.ok) throw new GraderError('RUBRIC_TEXT_MISMATCH', compat.problems.join('; '));
    const request = buildRequest(snap, answer, rubricText, o.references);
    for (let attempt = 0; ; attempt++) {
      try {
        o.budget?.reserve({ model: o.model ?? 'unset', inputChars: JSON.stringify(request).length, maxOutputTokens: o.maxOutputTokens ?? 4000 });
      } catch (e) {
        throw new GraderError('BUDGET_EXCEEDED', (e as Error).message);
      }
      try {
        const reply = await o.provider.complete(request, { timeoutMs });
        return parseReply(reply.text);
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : 'NETWORK';
        if (RETRYABLE.has(code) && attempt < retries) continue;
        throw code === 'TIMEOUT' ? new GraderError('TIMEOUT', 'provider timeout', true) : new GraderError('PROVIDER_ERROR', `provider error: ${code}`);
      }
    }
  };
  return Object.assign(grader, { rubricTextSha256: textSha });
}
