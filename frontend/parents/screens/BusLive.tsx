import React, { useEffect, useState } from 'react';
import { cairoTime, schoolApi, type BusHomeView, type BusLive as BusLiveData, type LearnerChip } from '../api';
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
  const stop = trip.stop.lat !== null && trip.stop.lng !== null ? { lat: trip.stop.lat, lng: trip.stop.lng, label: trip.doorToDoor ? t.ui.homeLabel : trip.stop.name } : null;
  const childLine = trip.childStatus === 'absent' ? t.ui.absentToday : trip.childStatus && trip.childStatusAt ? (trip.childStatus === 'picked' ? t.ui.picked : t.ui.dropped)(cairoTime(trip.childStatusAt, lang)) : null;
  return (
    <section className="pp-card pp-buslive" aria-labelledby={`pp-buslive-${trip.direction}`} data-testid="pp-bus-live" data-stale={trip.stale ? '1' : '0'}>
      <div className="pp-row">
        <h2 className="pp-h2 pp-row" id={`pp-buslive-${trip.direction}`} style={{ gap: 8, justifyContent: 'flex-start' }}>
          <span className={`pp-livedot${trip.stale ? ' pp-livedot--stale' : ''}`} aria-hidden="true" />{t.ui.liveTitle(t.sch[trip.direction])}
        </h2>
        {trip.etaMin !== null && <b className="pp-bus-eta" data-testid="pp-bus-eta">{t.ui.etaMin(n(trip.etaMin))}</b>}
      </div>
      {childLine && <p className="pp-tag pp-tag--ok" data-testid="pp-bus-child-status" style={{ alignSelf: 'flex-start' }}><Icon name="check" style={{ inlineSize: 14, blockSize: 14 }} />{childLine}</p>}
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

/** Door to door: the child's pickup point. The parent sets it on the map; the school confirms it before the bus uses it. */
export const PickupPoint: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t } = useP();
  const [view, setView] = useState<BusHomeView | null>(null);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => schoolApi.busHome(learner.studentId).then(setView).catch(() => setView(null));
  useEffect(() => { void load(); }, [learner.studentId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view?.enabled) return null;
  const { confirmed, pending } = view.home;
  const shown = editing ? pin : pending ?? confirmed;
  const start = () => { setEditing(true); setPin(pending ?? confirmed ?? null); setNote((pending ?? confirmed)?.note ?? ''); setErr(null); };
  const here = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition((p) => setPin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }), () => setErr(t.error), { enableHighAccuracy: true, timeout: 20_000 });
  };
  const save = async () => {
    if (!pin) return;
    setBusy(true); setErr(null);
    try { await schoolApi.setBusHome(learner.studentId, { ...pin, note }); setEditing(false); await load(); } catch (e) { setErr((e as { message?: string })?.message || t.error); } finally { setBusy(false); }
  };
  return (
    <section className="pp-card pp-pickup" aria-labelledby="pp-pickup-h" data-testid="pp-pickup">
      <div className="pp-row"><h2 className="pp-h2 pp-row" id="pp-pickup-h" style={{ gap: 8, justifyContent: 'flex-start' }}><span className="pp-ico pp-ico--sun pp-ico--sm"><Icon name="home" /></span>{t.ui.pickupTitle}</h2>
        {!editing && view.canEdit && <button type="button" className="pp-linkbtn" onClick={start} data-testid="pp-pickup-edit">{confirmed || pending ? t.ui.pickupChange : t.ui.pickupSet}</button>}</div>
      {!editing && (
        pending ? <p className="pp-tag pp-tag--wait" data-testid="pp-pickup-status" style={{ alignSelf: 'flex-start' }}>{t.ui.pickupWaiting}</p>
          : confirmed ? <p className="pp-tag pp-tag--ok" data-testid="pp-pickup-status" style={{ alignSelf: 'flex-start' }}><Icon name="check" style={{ inlineSize: 14, blockSize: 14 }} />{t.ui.pickupConfirmed}</p>
            : <p className="pp-sub" data-testid="pp-pickup-status">{view.canEdit ? t.ui.pickupNone : t.ui.pickupViewOnly}</p>
      )}
      {(shown || editing) && (
        <React.Suspense fallback={<div className="pp-skeleton" style={{ blockSize: 200 }} />}>
          <LiveMap ariaLabel={t.ui.pickupTitle} height={200} stop={shown ? { ...shown, label: t.ui.homeLabel } : null} onPick={editing ? (p) => setPin(p) : undefined} />
        </React.Suspense>
      )}
      {!editing && (pending ?? confirmed)?.note && <p className="pp-sub" dir="auto">{(pending ?? confirmed)!.note}</p>}
      {editing && (
        <>
          <p className="pp-sub">{t.ui.pickupTap}</p>
          <button type="button" className="pp-btn pp-btn--ton" onClick={here} data-testid="pp-pickup-here"><Icon name="target" />{t.ui.pickupHere}</button>
          <label className="pp-field">{t.ui.pickupNote}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} dir="auto" data-testid="pp-pickup-note" /></label>
          {err && <p className="pp-error" role="alert">{err}</p>}
          <div className="pp-row"><button type="button" className="pp-btn" onClick={() => setEditing(false)}>{t.ui.pickupCancel}</button>
            <button type="button" className="pp-btn pp-btn--primary" disabled={!pin || busy} onClick={() => void save()} data-testid="pp-pickup-save">{t.ui.pickupSave}</button></div>
        </>
      )}
      {!editing && pending && view.canEdit && <button type="button" className="pp-linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => void schoolApi.cancelBusHome(learner.studentId).then(load)}>{t.ui.pickupCancelChange}</button>}
      <p className="pp-note2"><Icon name="shield" style={{ inlineSize: 15, blockSize: 15 }} /><span>{t.ui.pickupPrivacy}</span></p>
    </section>
  );
};
