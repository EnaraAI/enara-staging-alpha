// Kids area: data helpers shared by the wired kids screens.
// Lessons come from the same student API today's Enara Kids app uses (/api/me/dashboard, /api/me/courses/:id);
// the lesson check and the stars are worked out in the browser, as today's kids app does (its lesson check never
// calls the server). Stars are kept on this device only (localStorage), per child.
import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '@/lib/api';
import type { Lang } from '@/lib/preview';

type Any = any;

/** Load data once (and again on reload or when deps change). */
export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ data, loading: false }); },
      (error) => { if (!ctl.signal.aborted) setState({ error, loading: false }); },
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}

// ---------- Text and speech ----------
const ARABIC = /[؀-ۿ]/;
export const firstName = (name?: string | null) => String(name ?? '').trim().split(/\s+/)[0] || '';

/** Words only: no Markdown symbols, links or citation markers (for showing and for reading aloud). */
export function plainText(text: unknown): string {
  let t = typeof text === 'string' ? text : '';
  t = t.replace(/^[ \t]*```[^\n]*$/gm, '').replace(/`+/g, '');
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[\^?\d+\]|【[^】]*】/g, '');
  t = t.replace(/\bhttps?:\/\/\S+/g, '');
  t = t.replace(/^#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(\S(?:.*?\S)?)\1/g, '$2');
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Read aloud with the browser's voice, as today's kids app does. Arabic text gets an Arabic voice whatever the screen language. */
export function speak(text: string, lang: Lang) {
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || !text) return;
    synth.cancel();
    const words = plainText(text) || text;
    const u = new SpeechSynthesisUtterance(words);
    u.lang = ARABIC.test(words) ? 'ar-SA' : lang === 'ar' && !/[a-z]/i.test(words) ? 'ar-SA' : 'en-GB';
    u.rate = 0.95;
    synth.speak(u);
  } catch { /* speech not available */ }
}
export function stopSpeaking() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
/** Stop reading aloud when a screen closes. */
export function useStopSpeechOnLeave() { useEffect(() => () => stopSpeaking(), []); }

// ---------- Routes with a query (#/kids/lesson?course=..&lesson=..) ----------
export function hashQuery(): URLSearchParams {
  const h = typeof window !== 'undefined' ? window.location.hash : '';
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}
export const lessonPath = (courseId: string, lessonId: string) => `/kids/lesson?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`;

// ---------- Today's lesson ----------
export interface KidQuestion { id: string; text: string; choices: string[]; answer: number; why: string }
export interface KidLesson {
  courseId: string; courseTitle: string; id: string; title: string; n: number; of: number;
  paragraphs: string[]; questions: KidQuestion[]; completed: boolean; nextId: string | null;
}
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function lessonsOf(tree: Any): Any[] {
  const mods = Array.isArray(tree?.modules) ? tree.modules : [];
  return mods.flatMap((m: Any) => (Array.isArray(m?.lessons) ? m.lessons : [])).filter((l: Any) => l && l.id != null);
}

/** One lesson of a course tree (GET /api/me/courses/:id), as the kids lesson shows it. */
export function lessonFromTree(tree: Any, lessonId: string): KidLesson | null {
  const all = lessonsOf(tree);
  const i = all.findIndex((l: Any) => str(l.id) === lessonId);
  if (i < 0) return null;
  const l = all[i];
  const paragraphs = plainText(str(l.content || l.description)).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const questions: KidQuestion[] = (Array.isArray(l.quiz?.questions) ? l.quiz.questions : [])
    .map((q: Any, k: number) => ({
      id: str(q?.id) || `q${k}`,
      text: plainText(str(q?.text)),
      choices: (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => plainText(str(o))).filter(Boolean),
      answer: Number(q?.correctAnswer),
      why: plainText(str(q?.explanation)),
    }))
    // Only questions the child can answer by tapping: 2 or more choices and a known right one.
    .filter((q: KidQuestion) => q.text && q.choices.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length);
  return {
    courseId: str(tree?.id), courseTitle: str(tree?.title), id: str(l.id), title: str(l.title), n: i + 1, of: all.length,
    paragraphs, questions, completed: l.status === 'completed', nextId: all[i + 1] ? str(all[i + 1].id) : null,
  };
}

/** Where today's lesson is: the dashboard's "continue learning", else the first course's active lesson. */
export async function findTodaysLesson(signal?: AbortSignal): Promise<{ courseId: string; lessonId: string } | null> {
  const dash: Any = await get('/api/me/dashboard', signal);
  const c = dash?.continueLearning;
  if (c?.courseId && c?.lessonId) return { courseId: str(c.courseId), lessonId: str(c.lessonId) };
  return null;
}

export async function loadLesson(courseId: string, lessonId: string, signal?: AbortSignal) {
  const tree = await get(`/api/me/courses/${encodeURIComponent(courseId)}`, signal);
  return lessonFromTree(tree, lessonId);
}

// ---------- Stars (this device only) ----------
export const starsFor = (score: number | null | undefined) => (score == null ? 0 : score >= 85 ? 3 : score >= 60 ? 2 : 1);
const STARS_KEY = 'enara_design_kids_stars';
const REWARD_KEY = 'enara_design_kids_reward';
const childKey = (u: { id?: string; studentId?: string; email?: string } | null | undefined) => u?.studentId || u?.id || u?.email || 'child';

function readStarMap(child: string): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(STARS_KEY) || '{}');
    const mine = all && typeof all === 'object' ? all[child] : null;
    return mine && typeof mine === 'object' ? mine : {};
  } catch { return {}; }
}
export function totalStars(u: Parameters<typeof childKey>[0]): number {
  return Object.values(readStarMap(childKey(u))).reduce((a, b) => a + (Number.isFinite(b) ? Math.max(0, Math.min(3, b)) : 0), 0);
}
export function lessonStars(u: Parameters<typeof childKey>[0], courseId: string, lessonId: string): number | null {
  const v = readStarMap(childKey(u))[`${courseId}:${lessonId}`];
  return Number.isFinite(v) ? v : null;
}
/** Keeps the best stars for a lesson. */
export function saveStars(u: Parameters<typeof childKey>[0], courseId: string, lessonId: string, stars: number) {
  try {
    const all = JSON.parse(localStorage.getItem(STARS_KEY) || '{}') || {};
    const child = childKey(u);
    const mine = all[child] && typeof all[child] === 'object' ? all[child] : {};
    const k = `${courseId}:${lessonId}`;
    mine[k] = Math.max(Number(mine[k]) || 0, stars);
    all[child] = mine;
    localStorage.setItem(STARS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the reward still shows */ }
}

export interface Reward { stars: number; right: number; total: number; title: string; courseId: string; nextId: string | null }
export function setReward(r: Reward) { try { sessionStorage.setItem(REWARD_KEY, JSON.stringify(r)); } catch { /* ignore */ } }
export function readReward(): Reward | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(REWARD_KEY) || 'null');
    if (!r || typeof r !== 'object' || !Number.isFinite(r.stars)) return null;
    return { stars: Math.max(0, Math.min(3, r.stars)), right: Number(r.right) || 0, total: Number(r.total) || 0, title: str(r.title), courseId: str(r.courseId), nextId: r.nextId ? str(r.nextId) : null };
  } catch { return null; }
}

/** Keeps a value in a ref so callbacks always see the latest one. */
export function useLatest<T>(v: T) { const r = useRef(v); r.current = v; return r; }
