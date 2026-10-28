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
}

const storage = new AsyncLocalStorage<CallContext>();

export function runWithCallContext<T>(context: CallContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCallContext(): CallContext {
  return storage.getStore() ?? {};
}

