import React, { createContext, useContext, useEffect, useRef } from 'react';
import { T, num, type Lang, type Strings } from './i18n';

// Shared bits of the Parents Portal: language context, icons, badges.

export interface PCtx { lang: Lang; t: Strings; n: (x: number | string) => string }
export const ParentsCtx = createContext<PCtx>({ lang: 'en', t: T.en as Strings, n: (x) => String(x) });
export const useP = () => useContext(ParentsCtx);
export const makeCtx = (lang: Lang): PCtx => ({ lang, t: T[lang] as Strings, n: (x) => num(x, lang) });

const PATHS: Record<string, React.ReactNode> = {
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  progress: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>,
  activity: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  controls: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  chevron: <polyline points="9 18 15 12 9 6" />,
  down: <polyline points="6 9 12 15 18 9" />,
  check: <polyline points="20 6 9 17 4 12" />,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  nudge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ontrack: <><circle cx="12" cy="12" r="9" /><polyline points="16 9 11 15 8 12" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  out: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><path d="M21 12H9" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  school: <><path d="M2 9 12 4l10 5-10 5z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>,
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  rings: <><path d="M12 3a9 9 0 1 1-9 9" /><path d="M12 6.8a5.2 5.2 0 1 1-5.2 5.2" /><circle cx="12" cy="12" r="1.5" /></>,
  messages: <><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" /><path d="M8 10h8M8 13h5" /></>,
  actions: <path d="m4 7 1.8 1.8L9 5.5M4 15.5l1.8 1.8L9 14M12.5 7.5H20M12.5 16H20" />,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" /></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  bus: <><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M8 21v-3M16 21v-3" /><circle cx="8" cy="14.5" r=".8" /><circle cx="16" cy="14.5" r=".8" /></>,
  send: <><path d="M4 12 20 4l-6 16-3-7z" /><path d="m11 13 9-9" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
};
export const Icon: React.FC<{ name: keyof typeof PATHS | string; className?: string; flip?: boolean; style?: React.CSSProperties }> = ({ name, className, flip, style }) => (
  <svg className={`pp-icon${flip ? ' pp-flip' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}>{PATHS[name]}</svg>
);

/** The ENARA assistant's avatar: a star with a turning ring and a twinkling spark (CSS motion, still with "reduce motion"). */
export const AssistantStar: React.FC<{ small?: boolean }> = ({ small }) => {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg className={`pp-star${small ? ' pp-star--sm' : ''}`} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D4AFF" /><stop offset="1" stopColor="#2B5CE6" /></linearGradient></defs>
      <circle cx="20" cy="20" r="20" fill={`url(#g${id})`} />
      <circle className="pp-orb" cx="20" cy="20" r="13" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="3 5" />
      <path d="M20 11.5c.7 5 2.8 7.2 8 8-5.2.8-7.3 3-8 8-.7-5-2.8-7.2-8-8 5.2-.8 7.3-3 8-8z" fill="#fff" />
      <circle className="pp-spark" cx="29.5" cy="11" r="2.2" fill="#FFD58A" />
    </svg>
  );
};

/** Marks AI-written text. */
export const AiBadge: React.FC = () => {
  const { t } = useP();
  return (
    <span className="pp-ai" title={t.aiBadgeLabel}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" /></svg>
      {t.aiBadge}
    </span>
  );
};

/** Placeholder sections are no longer shown to parents (owner, 22 Nov 2026): only real data. Kept as a no-op for older imports. */
export const SampleBadge: React.FC<{ show?: boolean }> = () => null;

export const AVATAR_COLORS = [['#f59f0a', '#08172b'], ['#0ea5a4', '#ffffff'], ['#0b203c', '#ffffff'], ['#6d4aff', '#ffffff']] as const;
export const Avatar: React.FC<{ initial: string; index: number }> = ({ initial, index }) => {
  const [bg, fg] = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return <span className="pp-avatar" style={{ background: bg, color: fg }} aria-hidden="true">{initial}</span>;
};

export const Ring: React.FC<{ done: number; goal: number }> = ({ done, goal }) => {
  const { t, n } = useP();
  const pct = goal ? Math.min(1, done / goal) : 0;
  const c = 2 * Math.PI * 40;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={t.ringLabel(n(done), n(goal), n(Math.round(pct * 100)))} style={{ flexShrink: 0 }}>
      <circle cx="48" cy="48" r="40" fill="none" stroke="#f2f4f8" strokeWidth="10" />
      <circle cx="48" cy="48" r="40" fill="none" stroke="#f59f0a" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 48 48)" />
      <text x="48" y="46" textAnchor="middle" fontSize="22" fontWeight="600" fill="#111c2c">{n(done)}</text>
      <text x="48" y="64" textAnchor="middle" fontSize="11" fill="#566376">{t.ofMinShort(n(goal))}</text>
    </svg>
  );
};

export const Loading: React.FC = () => {
  const { t } = useP();
  return <div role="status" aria-live="polite"><span className="sr">{t.loading}</span><div className="pp-skeleton" /><div className="pp-skeleton" style={{ marginBlockStart: 12 }} /></div>;
};

export const ErrorBox: React.FC<{ onRetry: () => void; message?: string }> = ({ onRetry, message }) => {
  const { t } = useP();
  return (
    <div className="pp-error" role="alert">
      <Icon name="alert" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>{message || t.error}</span>
        <button type="button" className="pp-btn" onClick={onRetry}>{t.retry}</button>
      </div>
    </div>
  );
};

/** Modal bottom sheet with focus handling and Escape to close. */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const { t } = useP();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="pp-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pp-sheet" role="dialog" aria-modal="true" aria-labelledby="pp-sheet-title" tabIndex={-1} ref={ref}>
        <div className="pp-row">
          <h2 className="pp-h2" id="pp-sheet-title">{title}</h2>
          <button type="button" className="pp-iconbtn" onClick={onClose} aria-label={t.close}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

/** The line under an English level: how far to the next level, or, once the share needed is reached (80 %, parents/levels.ts), that the
 * checkpoint test is what moves the child up (otherwise "100 % of the way" while staying at the same level reads wrong). */
export function levelNextLine(ctx: PCtx, l: { cefr: string; subLevelPct: number | null; next: string | null; nextLabel: { en: string; ar: string } | null }): string | null {
  if (l.subLevelPct === null || !l.next || !l.nextLabel) return null;
  const next = `${l.nextLabel[ctx.lang] || l.nextLabel.en} (${l.next})`;
  return l.subLevelPct >= 80 ? ctx.t.readyCheckpoint(l.cefr, next) : ctx.t.toNext(ctx.n(l.subLevelPct), next);
}
