// Sign-in bridge between the design app's session and the copied lms-test files (src/lms: the kids app, the live avatar modal).
// The copied services/apiService.ts reads its token and user from 'enara_token' / 'enara_user' (local or session storage),
// as on lms-test. The design session (src/lib/session.tsx) keeps its own token; it is written into those keys before a copied
// screen mounts (the kids app, or the student's live tutor call), and removed again on any sign-out. Calls go to lms-test only (VITE_API_URL).
import type { SessionUser } from '@/lib/session';

const TOKEN_KEY = 'enara_token';
const USER_KEY = 'enara_user';

export const isKidsLearner = (u: SessionUser | null | undefined) => !!u && u.role === 'student' && u.uiMode === 'kids';

/** Hands the design session's token and user to the copied apiService. */
export function writeLmsSession(token: string, user: SessionUser) {
  try {
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* storage blocked: the kids app shows its own error states */ }
}

/** Removes everything the copied apiService keeps for the signed-in learner. */
export function clearLmsSession() {
  try {
    for (const s of [localStorage, sessionStorage]) { s.removeItem(TOKEN_KEY); s.removeItem(USER_KEY); }
    sessionStorage.removeItem('enara_demo'); sessionStorage.removeItem('enara_lms');
  } catch { /* storage blocked */ }
}
