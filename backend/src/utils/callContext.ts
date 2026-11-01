import { AsyncLocalStorage } from 'async_hooks';

// Who the current request is for. Set by requestContext and filled in by
// authMiddleware, so deep services (e.g. AI call logging) can attribute work
// to a school and user without threading them through every call.
export interface CallContext {
  requestId?: string;
  userId?: string;
  role?: string;
  institutionId?: string;
  studentId?: string;
  // Per-request memo of read-only lookups (P20): the same student and class
  // records were read up to three times in one request.
  memo?: Map<string, Promise<unknown>>;
  // Shared by every context of one request (auth copies the context, this
  // object comes along). aiStarted: budget was reserved for a provider call, so
  // the GET deadline must not cut the request off (P20).
  request?: { aiStarted: boolean };
}

const storage = new AsyncLocalStorage<CallContext>();

export function runWithCallContext<T>(context: CallContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCallContext(): CallContext {
  return storage.getStore() ?? {};
}


// Runs a read once per request and shares the result with later callers in the
// same request. Outside a request (scripts, jobs) it just runs the read.
export function requestMemo<T>(key: string, read: () => Promise<T>): Promise<T> {
  const memo = storage.getStore()?.memo;
  if (!memo) return read();
  let hit = memo.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = read();
    memo.set(key, hit);
    hit.catch(() => memo.delete(key));
  }
  return hit;
}
