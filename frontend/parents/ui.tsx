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
};
export const Icon: React.FC<{ name: keyof typeof PATHS | string; className?: string; flip?: boolean; style?: React.CSSProperties }> = ({ name, className, flip, style }) => (
  <svg className={`pp-icon${flip ? ' pp-flip' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}>{PATHS[name]}</svg>
);

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
