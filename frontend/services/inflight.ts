// Speed (lms-speed-2): identical read requests that are already in flight share one network call.
// Several screens ask for the same data while a page loads (e.g. the student tab checks and the
// home page both read /api/me/assignments). Nothing is kept once the call has finished: the next
// call with the same key goes to the network again.
export function createInflight<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const p = run().finally(() => { if (pending.get(key) === p) pending.delete(key); });
    pending.set(key, p);
    return p;
  };
}
