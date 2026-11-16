import { useCallback, useEffect, useRef, useState } from 'react';

// Real-time data: fetch on mount, when the key changes, when the parent pulls
// to refresh (refreshKey), and whenever the page regains focus.
export function useLive<T>(fetcher: () => Promise<T>, deps: unknown[], refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ status?: number; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await fetcher();
      if (id !== seq.current) return;
      setData(d);
      setError(null);
      setFetchedAt(new Date());
    } catch (e: any) {
      if (id !== seq.current) return;
      setError({ status: e?.status, message: e?.message });
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setData(null); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);
  return { data, error, loading, fetchedAt, reload: load };
}
