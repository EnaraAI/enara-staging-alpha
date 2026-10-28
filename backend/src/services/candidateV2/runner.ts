import { CANDIDATE_VERSION, canonical, sha256, validateOpenOutput, validateRubric, validateShortOutput, type Failure, type OpenResult, type ReasonCode, type Rubric, type ShortResult, type Snapshot, type Status } from './contract';

// Candidate V2 isolated runner (design-v1, Phase C: stubbed execution only).
// Inputs are read, never written: the attempt is only used to build an immutable
// snapshot. The grader and the result store are injected; there is no model
// client, database access, anchor lookup or fallback grader in this module.

export interface AttemptView {
  id: string; tenantId: string; assessmentVersion: number;
  answers: ReadonlyArray<{ questionId: string; studentAnswer?: string | null }>;
}
export interface QuestionView { id: string; type: string; text: string; points?: number; rubric?: Rubric }
export type Grader = (snapshot: Snapshot, answer: string) => Promise<unknown>;
export interface ResultStore {
  claim(key: string): Promise<boolean>; // false = already claimed (idempotency)
  put(key: string, record: StoredResult): Promise<void>;
}
export interface RunConfig { enabled: boolean; tenants: ReadonlySet<string>; timeoutMs: number }

export type RunResult = {
  candidateVersion: string; source: 'candidate_v2'; key?: string; status: Status | 'DUPLICATE'; reasonCode?: ReasonCode;
  inputSnapshotHash?: string; result?: OpenResult | ShortResult;
};
export type StoredResult = Omit<RunResult, 'key'> & { tenantId: string; attemptId: string; questionId: string };

export function readCandidateV2Config(env: Record<string, string | undefined> = process.env): RunConfig {
  return {
    enabled: (env.ENARA_CANDIDATE_V2_ENABLED ?? 'false').trim().toLowerCase() === 'true',
    tenants: new Set((env.ENARA_CANDIDATE_V2_TENANTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    timeoutMs: Number(env.ENARA_CANDIDATE_V2_TIMEOUT_MS) > 0 ? Number(env.ENARA_CANDIDATE_V2_TIMEOUT_MS) : 60_000,
  };
}

export function buildSnapshot(attempt: AttemptView, q: QuestionView, answer: string): Snapshot {
  const kind = q.type as Snapshot['kind'];
  const maxPoints = kind === 'open-response' ? (q.rubric?.criteria ?? []).reduce((n, c) => n + c.maxPoints, 0) : (q.points ?? 1);
  const base = { candidateVersion: CANDIDATE_VERSION, tenantId: attempt.tenantId, attemptId: attempt.id, questionId: q.id, assessmentVersion: attempt.assessmentVersion,
    kind, rubric: q.rubric ? structuredClone(q.rubric) : undefined, maxPoints, questionText: q.text, answerSha256: sha256(answer) };
  return Object.freeze({ ...base, hash: sha256(canonical(base)) });
}

const withTimeout = <T>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { timeout: true })), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

export async function runCandidateV2(params: {
  attempt: AttemptView; question: QuestionView; assessmentVersion: number; expectedRubricVersion?: number; expectedSnapshotHash?: string;
  grader: Grader; store: ResultStore; config: RunConfig; log?: (event: string, meta: Record<string, unknown>) => void;
}): Promise<RunResult> {
  const { attempt, question: q, grader, store, config } = params;
  const log = params.log ?? (() => {});
  const r = (status: RunResult['status'], reasonCode?: ReasonCode, extra: Partial<RunResult> = {}): RunResult => ({ candidateVersion: CANDIDATE_VERSION, source: 'candidate_v2', status, reasonCode, ...extra });
  if (!config.enabled) return r('NOT_ELIGIBLE', 'DISABLED');
  if (!attempt?.id || !q?.id || !attempt.tenantId) return r('ERROR', 'MISSING_ID');
  if (!config.tenants.has(attempt.tenantId)) return r('NOT_ELIGIBLE', 'TENANT_NOT_ALLOWED');
  if (attempt.assessmentVersion !== params.assessmentVersion) return r('NOT_ELIGIBLE', 'VERSION_MISMATCH');
  const matches = attempt.answers.filter((a) => a.questionId === q.id);
  if (matches.length !== 1) return r('ERROR', matches.length ? 'DUPLICATE_ANSWER_ID' : 'MISSING_ID');
  if (q.type !== 'open-response' && q.type !== 'short-answer') return r('NOT_ELIGIBLE', 'UNSUPPORTED_QUESTION');
  if (q.type === 'open-response' && !validateRubric(q.rubric).ok) return r('NOT_ELIGIBLE', 'INVALID_RUBRIC');
  if (q.type === 'open-response' && params.expectedRubricVersion !== undefined && q.rubric!.version !== params.expectedRubricVersion) return r('NOT_ELIGIBLE', 'RUBRIC_VERSION_MISMATCH');
  const answer = String(matches[0].studentAnswer ?? '');
  if (!answer.trim()) return r('UNGRADABLE', 'UNGRADABLE_ANSWER');
  const snap = buildSnapshot(attempt, q, answer);
  if (params.expectedSnapshotHash !== undefined && params.expectedSnapshotHash !== snap.hash) return r('ERROR', 'SNAPSHOT_HASH_MISMATCH', { inputSnapshotHash: snap.hash });
  const key = `${attempt.tenantId}|${attempt.id}|${q.id}|${CANDIDATE_VERSION}|${snap.hash}`;
  if (!(await store.claim(key))) return r('DUPLICATE', undefined, { key, inputSnapshotHash: snap.hash });

  let out: RunResult;
  try {
    const raw = await withTimeout(grader(snap, answer), config.timeoutMs);
    const v: OpenResult | ShortResult | Failure = q.type === 'open-response' ? validateOpenOutput(raw, snap, answer) : validateShortOutput(raw, snap);
    out = v.status === 'VALID' ? r('VALID', undefined, { key, inputSnapshotHash: snap.hash, result: v }) : r(v.status, (v as Failure).reasonCode, { key, inputSnapshotHash: snap.hash });
  } catch (e) {
    // A technical failure is never a grade: no points, explicit status.
    out = r('ERROR', (e as { timeout?: boolean }).timeout ? 'TIMEOUT' : 'GRADER_EXCEPTION', { key, inputSnapshotHash: snap.hash });
  }
  try {
    const { key: _k, ...rest } = out;
    await store.put(key, { ...rest, tenantId: attempt.tenantId, attemptId: attempt.id, questionId: q.id });
  } catch {
    out = r('ERROR', 'STORAGE_FAILURE', { key, inputSnapshotHash: snap.hash });
  }
  log('candidate_v2_result', { attemptId: attempt.id, questionId: q.id, status: out.status, reasonCode: out.reasonCode ?? null });
  return out;
}

// Coverage accounting: valid grades, failures and ineligible items are counted separately.
export function summarize(results: RunResult[]) {
  const c = { valid: 0, failed: 0, ungradable: 0, notEligible: 0, duplicate: 0, total: results.length };
  for (const x of results) {
    if (x.status === 'VALID') c.valid++;
    else if (x.status === 'NOT_ELIGIBLE') c.notEligible++;
    else if (x.status === 'UNGRADABLE') c.ungradable++;
    else if (x.status === 'DUPLICATE') c.duplicate++;
    else c.failed++;
  }
  return c;
}
