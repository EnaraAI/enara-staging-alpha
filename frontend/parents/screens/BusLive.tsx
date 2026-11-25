import React, { useEffect, useState } from 'react';
import { cairoTime, schoolApi, type BusLive as BusLiveData, type LearnerChip } from '../api';
import { Icon, useP } from '../ui';

const LiveMap = React.lazy(() => import('../../components/LiveMap'));

/** Polls the child's live bus every 15 s while the page is visible. Null until the first answer; trips empty outside a trip. */
export function useBusLive(learner: LearnerChip | undefined, enabled: boolean) {
  const [data, setData] = useState<BusLiveData | null>(null);
  useEffect(() => {
    setData(null);
    if (!learner || !enabled) return undefined;
    let stop = false;
    const load = () => { if (document.visibilityState === 'visible') schoolApi.busLive(learner.studentId).then((d) => { if (!stop) setData(d); }).catch(() => { if (!stop) setData({ on: false, trips: [] }); }); };
    load();
    const id = window.setInterval(load, 15_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [learner?.studentId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

/** The live map card: the bus, the child's stop, "about N min away" and when the position was last updated. */
export const BusLiveCard: React.FC<{ learner: LearnerChip; live: BusLiveData | null; compact?: boolean }> = ({ learner, live, compact }) => {
  const { t, n, lang } = useP();
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((x) => x + 1), 5_000); return () => window.clearInterval(id); }, []);
  const trip = live?.trips[0];
  if (!live?.on || !trip) return null;
  const ago = trip.bus ? Math.max(0, Math.round((Date.now() - new Date(trip.bus.at).getTime()) / 1000)) : null;
  const stop = trip.stop.lat !== null && trip.stop.lng !== null ? { lat: trip.stop.lat, lng: trip.stop.lng, label: trip.stop.name } : null;
  return (
    <section className="pp-card pp-buslive" aria-labelledby={`pp-buslive-${trip.direction}`} data-testid="pp-bus-live" data-stale={trip.stale ? '1' : '0'}>
      <div className="pp-row">
        <h2 className="pp-h2 pp-row" id={`pp-buslive-${trip.direction}`} style={{ gap: 8, justifyContent: 'flex-start' }}>
          <span className={`pp-livedot${trip.stale ? ' pp-livedot--stale' : ''}`} aria-hidden="true" />{t.ui.liveTitle(t.sch[trip.direction])}
        </h2>
        {trip.etaMin !== null && <b className="pp-bus-eta" data-testid="pp-bus-eta">{t.ui.etaMin(n(trip.etaMin))}</b>}
      </div>
      {trip.bus ? (
        <React.Suspense fallback={<div className="pp-skeleton" style={{ blockSize: compact ? 180 : 240 }} />}>
          <LiveMap ariaLabel={t.ui.liveMapAria(learner.firstName)} height={compact ? 180 : 240} bus={{ lat: trip.bus.lat, lng: trip.bus.lng, stale: trip.stale, label: t.ui.busTile }} stop={stop} />
        </React.Suspense>
      ) : <p className="pp-sub">{t.ui.liveWaiting}</p>}
      <p className="pp-meta" data-testid="pp-bus-live-updated" aria-live="polite">
        {trip.stale ? (trip.bus ? t.ui.lastSeen(cairoTime(trip.bus.at, lang)) : t.ui.liveWaiting) : ago !== null ? t.ui.updatedAgo(n(ago)) : ''}
        {!stop && ` · ${t.ui.noStopPin}`}
      </p>
      <p className="pp-note2"><Icon name="shield" style={{ inlineSize: 15, blockSize: 15 }} /><span>{t.ui.livePrivacy}</span></p>
    </section>
  );
};
