import React, { useEffect, useState } from 'react';
import { Icon, useP } from './ui';
import { cairoTime, type WeeklyStatus } from './api';

/** The status line shown above every tab: icon + title + one-line reason (never colour alone). */
export const StatusLine: React.FC<{ status: WeeklyStatus }> = ({ status }) => {
  const { t, n } = useP();
  const icon = status.status === 'on_track' ? 'ontrack' : status.status === 'needs_nudge' ? 'nudge' : 'alert';
  const color = status.status === 'on_track' ? '#2f6bff' : status.status === 'needs_nudge' ? '#db7706' : '#b42318';
  return (
    <section className={`pp-status pp-status--${status.status}`} aria-live="polite" aria-labelledby="pp-status-title">
      <Icon name={icon} className="pp-status-icon" style={{ color }} />
      <div>
        <p className="pp-status-title" id="pp-status-title">{t.status[status.status]}</p>
        <p className="pp-status-reason">{t.reason(status.reason.code, status.reason.params, (x) => n(x))}</p>
      </div>
    </section>
  );
};

/** "Updated just now · 2:05 pm Cairo time" + Refresh. Ticks every 30 s. */
export const Updated: React.FC<{ at: Date | null; loading: boolean; onRefresh: () => void }> = ({ at, loading, onRefresh }) => {
  const { t, n, lang } = useP();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  const mins = at ? Math.floor((Date.now() - at.getTime()) / 60_000) : 0;
  return (
    <div className="pp-updated">
      <span aria-live="polite">{at ? t.updated(mins < 1 ? t.justNow : t.minAgo(n(mins)), cairoTime(at, lang)) : t.loading}</span>
      <button type="button" onClick={onRefresh} disabled={loading} aria-label={loading ? t.refreshing : t.refresh}>
        <Icon name="refresh" />{loading ? t.refreshing : t.refresh}
      </button>
    </div>
  );
};
