import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

// Live bus map: one small Leaflet map with OpenStreetMap tiles (free, no key). Loaded only on the screens that show a map
// (React.lazy), so the rest of the app downloads nothing extra. Markers are inline SVG.
export type MapPoint = { lat: number; lng: number };
export interface LiveMapProps {
  bus?: (MapPoint & { stale?: boolean; label?: string }) | null;
  buses?: (MapPoint & { id: string; label: string; stale?: boolean })[];
  stop?: (MapPoint & { label?: string }) | null;
  stops?: (MapPoint & { label: string })[];
  onPick?: (p: MapPoint) => void;
  height?: number;
  fallbackCenter?: MapPoint;
  ariaLabel: string;
}

const busIcon = (stale?: boolean) => L.divIcon({
  className: 'enara-map-bus', iconSize: [40, 40], iconAnchor: [20, 20],
  html: `<span class="enara-map-busdot${stale ? ' stale' : ''}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="4" y="3" width="16" height="15" rx="3" fill="#F5A524"/><rect x="6.5" y="5.5" width="11" height="5" rx="1.2" fill="#fff"/><circle cx="8" cy="15" r="1.3" fill="#0E2747"/><circle cx="16" cy="15" r="1.3" fill="#0E2747"/><rect x="6" y="18" width="3" height="3" rx="1" fill="#0E2747"/><rect x="15" y="18" width="3" height="3" rx="1" fill="#0E2747"/></svg></span>`,
});
const stopIcon = (mine: boolean) => L.divIcon({
  className: 'enara-map-stop', iconSize: mine ? [28, 28] : [16, 16], iconAnchor: mine ? [14, 28] : [8, 8],
  html: mine
    ? '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="#2B5CE6"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>'
    : '<span class="enara-map-stopdot"></span>',
});

const LiveMap: React.FC<LiveMapProps> = ({ bus, buses = [], stop, stops = [], onPick, height = 220, fallbackCenter = { lat: 30.0444, lng: 31.2357 }, ariaLabel }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([fallbackCenter.lat, fallbackCenter.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current?.({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current; const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const s of stops) { L.marker([s.lat, s.lng], { icon: stopIcon(false), title: s.label, keyboard: false }).addTo(g).bindTooltip(s.label); pts.push([s.lat, s.lng]); }
    if (stop) { L.marker([stop.lat, stop.lng], { icon: stopIcon(true), title: stop.label ?? '', keyboard: false }).addTo(g); pts.push([stop.lat, stop.lng]); }
    for (const b of [...(bus ? [{ ...bus, id: 'bus', label: bus.label ?? '' }] : []), ...buses]) {
      L.marker([b.lat, b.lng], { icon: busIcon(b.stale), title: b.label, keyboard: false, zIndexOffset: 1000 }).addTo(g).bindTooltip(b.label || '');
      pts.push([b.lat, b.lng]);
    }
    if (!pts.length) return;
    if (!fitted.current || pts.length === 1) {
      if (pts.length === 1) m.setView(pts[0], fitted.current ? m.getZoom() : 15);
      else m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
      fitted.current = true;
    } else if (bus && !m.getBounds().contains([bus.lat, bus.lng])) {
      m.panTo([bus.lat, bus.lng]);
    }
  }, [bus?.lat, bus?.lng, bus?.stale, stop?.lat, stop?.lng, JSON.stringify(buses), JSON.stringify(stops)]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="enara-map" style={{ blockSize: height }} role="region" aria-label={ariaLabel} data-testid="live-map" />;
};

export default LiveMap;
