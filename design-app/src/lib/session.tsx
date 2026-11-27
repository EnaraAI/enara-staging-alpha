import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getDeviceToken, getToken, post, setDeviceToken, setToken, setUnauthorizedHandler } from './api';
import { clearLmsSession } from '@/kids-lms/bridge';

export type Role = 'student' | 'teacher' | 'admin' | 'academic_manager' | 'enara-admin' | 'parent';
export interface SessionUser { id?: string; email: string; role: Role; name?: string; studentId?: string; institutionId?: string; uiMode?: 'kids' | 'adult' | string; lmsAccount?: boolean }
interface SessionState {
  user: SessionUser | null; ready: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  parentCodePreview: (code: string) => Promise<any>;
  parentCodeStart: (code: string, language: 'en' | 'ar') => Promise<SessionUser>;
  logout: () => Promise<void>;
}
const Ctx = createContext<SessionState | null>(null);
export const useSession = () => { const s = useContext(Ctx); if (!s) throw new Error('no session'); return s; };

/** The screen a role lands on after sign-in. */
export function homeFor(u: SessionUser | null): string {
  if (!u) return '/login';
  switch (u.role) {
    case 'student': return u.uiMode === 'kids' ? '/kids' : '/student';
    case 'parent': return '/parent';
    case 'teacher': return '/teacher';
    case 'admin': case 'academic_manager': return '/school';
    case 'enara-admin': return '/platform';
    default: return '/login';
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  // Signing out also removes the token handed to the copied lms-test screens (src/kids-lms/bridge.ts).
  const signOutLocal = useCallback(() => { setToken(null); clearLmsSession(); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { signOutLocal(); window.location.hash = '#/login'; });
    (async () => {
      try {
        if (getToken()) { const s = await api<{ user: SessionUser }>('GET', '/api/auth/session'); setUser(s.user); }
        else if (getDeviceToken()) {
          // A parent's remembered device (180 days on the server) signs them back in without a password.
          const s = await api<{ token: string; user: SessionUser }>('POST', '/api/parents/device/session', { deviceToken: getDeviceToken() }, { auth: false });
          setToken(s.token); setUser(s.user);
        }
      } catch { signOutLocal(); }
      finally { setReady(true); }
    })();
  }, [signOutLocal]);

  const value = useMemo<SessionState>(() => ({
    user, ready,
    async login(email, password) {
      const r = await api<{ token: string; user: SessionUser }>('POST', '/api/auth/login', { email: email.trim(), password }, { auth: false });
      setToken(r.token); setUser(r.user); return r.user;
    },
    parentCodePreview: (code) => api('POST', '/api/parents/start/preview', { code }, { auth: false }),
    async parentCodeStart(code, language) {
      const r = await api<{ token: string; user: SessionUser; deviceToken: string }>('POST', '/api/parents/start', { code, language }, { auth: false });
      setToken(r.token); setDeviceToken(r.deviceToken); setUser(r.user); return r.user;
    },
    async logout() {
      try { await post('/api/auth/logout'); } catch { /* already signed out */ }
      try { if (getDeviceToken()) await post('/api/parents/device/sign-out', { deviceToken: getDeviceToken() }); } catch { /* ignore */ }
      setDeviceToken(null); signOutLocal();
    },
  }), [user, ready, signOutLocal]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
