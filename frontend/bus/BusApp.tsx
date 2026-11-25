import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../services/apiService';
import './bus.css';

// Live bus map: the bus supervisor's phone, at /bus. Sign in once with the code from the school (the phone keeps a bus token,
// never an ENARA session). Start a trip for an assigned route; while it runs, the phone sends its position every 15 seconds and
// keeps the screen awake. On a phone browser the page must stay open (iPhones stop location in the background): it says so.
type Lang = 'en' | 'ar';
type Me = { supervisor: { name: string }; liveOn: boolean; windows: { from: string; to: string }[]; inWindowNow: boolean; routes: { routeKey: string; routeName: string; busNumber: string | null; liveOn: boolean }[]; trip: { id: string; routeKey: string; direction: 'morning' | 'afternoon'; startedAt: string; endsBy: string } | null };
const TOKEN_KEY = 'enara_bus_token';
const LANG_KEY = 'enara_bus_lang';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const T = {
  en: {
    title: 'ENARA bus', signInTitle: 'Bus supervisor sign-in', signInBody: 'Type the code the school gave you. It looks like BUS-ABCD-EFGH. This phone will remember you.',
    code: 'Sign-in code', go: 'Sign in', invalid: 'Code not valid or expired. Ask the school office for a new one.', failed: 'Could not reach ENARA. Check the connection and try again.',
    hello: (n: string) => `Hello, ${n}`, routes: 'Your routes', morning: 'Morning trip', afternoon: 'Afternoon trip', start: (d: string) => `Start ${d.toLowerCase()}`,
    off: 'The live bus map is switched off by the school.', routeOff: 'Live sharing is off for this route.', hours: (w: string) => `Trips can start only during trip hours: ${w}.`,
    sharing: 'Sharing your location', sharingBody: 'Keep this page open with the screen on until the trip ends.', lastSent: (s: string) => `Last sent ${s}`, waitingGps: 'Waiting for the phone’s location…',
    denied: 'Location is blocked. Allow location for this site in the browser settings, then tap Try again.', tryAgain: 'Try again', gpsError: 'The phone could not find its location. Move to an open place.',
    stalled: 'Location updates stopped. Keep this page open and the screen on.', late: 'Running late', minutes: (m: number) => `${m} min`, cancel: 'Trip cancelled', cancelConfirm: 'Tell parents this trip is cancelled today?',
    noticeSent: 'Parents were told.', end: 'End trip', endConfirm: 'End the trip and stop sharing your location?', ended: 'Trip ended. Location sharing stopped.', endsBy: (t: string) => `Stops by itself at ${t}`,
    signOut: 'Sign out of this phone', signedOut: 'Signed out by the school. Ask the office for a new code.', privacy: 'Your location is shared only during a trip, only with parents of children on this bus, and deleted when the trip ends.',
    accuracy: (m: number) => `accuracy about ${m} m`, lang: 'العربية',
    noRoutes: 'No bus route is assigned to you yet. Ask the school office to assign your route in the Bus supervisors tab, then tap Refresh.', refresh: 'Refresh',
  },
  ar: {
    title: 'حافلة إنارة', signInTitle: 'دخول مشرف الحافلة', signInBody: 'اكتب الرمز الذي أعطته لك المدرسة. يبدو هكذا: BUS-ABCD-EFGH. سيتذكرك هذا الهاتف.',
    code: 'رمز الدخول', go: 'دخول', invalid: 'الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا من مكتب المدرسة.', failed: 'تعذّر الاتصال بإنارة. تحقق من الاتصال وحاول مرة أخرى.',
    hello: (n: string) => `أهلًا، ${n}`, routes: 'خطوط سيرك', morning: 'رحلة الذهاب', afternoon: 'رحلة العودة', start: (d: string) => `ابدأ ${d}`,
    off: 'أوقفت المدرسة خريطة الحافلة المباشرة.', routeOff: 'المشاركة المباشرة متوقفة لهذا الخط.', hours: (w: string) => `تبدأ الرحلات في مواعيدها فقط: ${w}.`,
    sharing: 'تتم مشاركة موقعك', sharingBody: 'أبقِ هذه الصفحة مفتوحة والشاشة مضاءة حتى نهاية الرحلة.', lastSent: (s: string) => `آخر إرسال ${s}`, waitingGps: 'بانتظار موقع الهاتف…',
    denied: 'الموقع محظور. اسمح بالموقع لهذا الموقع من إعدادات المتصفح ثم اضغط حاول مرة أخرى.', tryAgain: 'حاول مرة أخرى', gpsError: 'تعذّر على الهاتف تحديد موقعه. انتقل إلى مكان مفتوح.',
    stalled: 'توقفت تحديثات الموقع. أبقِ الصفحة مفتوحة والشاشة مضاءة.', late: 'تأخير', minutes: (m: number) => `${m} د`, cancel: 'إلغاء الرحلة', cancelConfirm: 'إبلاغ أولياء الأمور بإلغاء هذه الرحلة اليوم؟',
    noticeSent: 'تم إبلاغ أولياء الأمور.', end: 'إنهاء الرحلة', endConfirm: 'إنهاء الرحلة وإيقاف مشاركة موقعك؟', ended: 'انتهت الرحلة وتوقفت مشاركة الموقع.', endsBy: (t: string) => `تتوقف تلقائيًا الساعة ${t}`,
    signOut: 'الخروج من هذا الهاتف', signedOut: 'أخرجتك المدرسة. اطلب رمزًا جديدًا من المكتب.', privacy: 'يُشارك موقعك أثناء الرحلة فقط، ومع أولياء أمور أطفال هذه الحافلة فقط، ويُحذف عند انتهاء الرحلة.',
    accuracy: (m: number) => `الدقة نحو ${m} م`, lang: 'English',
    noRoutes: 'لم يُخصَّص لك خط سير بعد. اطلب من مكتب المدرسة تخصيص خطك من صفحة مشرفي الحافلات، ثم اضغط تحديث.', refresh: 'تحديث',
  },
};

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function call<R>(method: string, path: string, body?: unknown, token?: string | null): Promise<R> {
  const res = await fetch(apiUrl(path), { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bus ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, json?.error?.code ?? '', json?.error?.message ?? json?.message ?? 'error');
  return json as R;
}
const hm = (d: string | Date, lang: Lang) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(d));

const BusApp: React.FC = () => {
  const [lang, setLang] = useState<Lang>(() => (read(LANG_KEY) === 'ar' ? 'ar' : 'en'));
  const t = T[lang];
  const [token, setToken] = useState<string | null>(() => read(TOKEN_KEY));
  const [me, setMe] = useState<Me | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.title = t.title; write(LANG_KEY, lang); }, [lang, t.title]);

  const signOut = useCallback((msg?: string) => { write(TOKEN_KEY, null); setToken(null); setMe(null); if (msg) setNote(msg); }, []);
  const refresh = useCallback(async () => {
    if (!token) return;
    try { setMe(await call<Me>('GET', '/api/bus/me', undefined, token)); }
    catch (e) { if (e instanceof HttpError && e.status === 401) signOut(t.signedOut); else setNote(t.failed); }
  }, [token, signOut, t.signedOut, t.failed]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!token || !me) return (
    <main className="bus" data-testid="bus-app">
      <Header t={t} onLang={() => setLang(lang === 'en' ? 'ar' : 'en')} />
      {token && !me ? <p className="bus-muted" role="status">…</p> : <SignIn t={t} note={note} onDone={(tok, home) => { write(TOKEN_KEY, tok); setToken(tok); setMe(home); setNote(null); }} />}
    </main>
  );
  return (
    <main className="bus" data-testid="bus-app">
      <Header t={t} onLang={() => setLang(lang === 'en' ? 'ar' : 'en')} />
      <h1 className="bus-h1">{t.hello(me.supervisor.name)}</h1>
      {note && <p className="bus-note" role="status">{note}</p>}
      {me.trip ? (
        <Trip t={t} lang={lang} token={token} me={me} onEnded={(msg) => { setNote(msg); void refresh(); }} onSignedOut={() => signOut(t.signedOut)} />
      ) : (
        <>
          {!me.liveOn && <p className="bus-warn" data-testid="bus-off">{t.off}</p>}
          {me.liveOn && !me.inWindowNow && <p className="bus-warn" data-testid="bus-hours">{t.hours(me.windows.map((w) => `${w.from}–${w.to}`).join(', '))}</p>}
          <h2 className="bus-h2">{t.routes}</h2>
          {me.routes.length === 0 && (
            <div className="bus-warn" role="status" data-testid="bus-no-routes">
              <p style={{ margin: 0 }}>{t.noRoutes}</p>
              <button type="button" className="bus-btn" style={{ marginBlockStart: 10, inlineSize: '100%' }} onClick={() => void refresh()}>{t.refresh}</button>
            </div>
          )}
          {me.routes.map((r) => (
            <section key={r.routeKey} className="bus-card" data-testid="bus-route" data-route={r.routeKey}>
              <b className="bus-route" dir="auto">{r.routeName}{r.busNumber ? ` · ${r.busNumber}` : ''}</b>
              {!r.liveOn && <p className="bus-muted">{t.routeOff}</p>}
              <div className="bus-two">
                {(['morning', 'afternoon'] as const).map((d) => (
                  <button key={d} type="button" className="bus-btn bus-btn--go" disabled={busy || !me.liveOn || !me.inWindowNow || !r.liveOn} data-testid={`bus-start-${d}`}
                    onClick={async () => { setBusy(true); setNote(null); try { await call('POST', '/api/bus/trips', { routeKey: r.routeKey, direction: d }, token); await refresh(); } catch (e) { setNote(e instanceof HttpError ? e.message : t.failed); } finally { setBusy(false); } }}>
                    {t.start(t[d])}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <p className="bus-muted">{t.privacy}</p>
          <button type="button" className="bus-link" onClick={() => signOut()}>{t.signOut}</button>
        </>
      )}
    </main>
  );
};

const Header: React.FC<{ t: (typeof T)['en']; onLang: () => void }> = ({ t, onLang }) => (
  <header className="bus-head">
    <span className="bus-brand"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="4" y="3" width="16" height="15" rx="3" fill="#F5A524" /><rect x="6.5" y="5.5" width="11" height="5" rx="1.2" fill="#fff" /><circle cx="8" cy="15" r="1.3" fill="#0E2747" /><circle cx="16" cy="15" r="1.3" fill="#0E2747" /></svg>{t.title}</span>
    <button type="button" className="bus-lang" onClick={onLang}>{t.lang}</button>
  </header>
);

const SignIn: React.FC<{ t: (typeof T)['en']; note: string | null; onDone: (token: string, me: Me) => void }> = ({ t, note, onDone }) => {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await call<Me & { token: string }>('POST', '/api/bus/start', { code }); const { token, ...home } = r; onDone(token, home); }
    catch (x) { setErr(x instanceof HttpError && x.status < 500 && x.status !== 404 ? t.invalid : t.failed); } finally { setBusy(false); }
  };
  return (
    <form className="bus-card bus-signin" onSubmit={submit}>
      <h1 className="bus-h1">{t.signInTitle}</h1>
      <p className="bus-muted">{t.signInBody}</p>
      {note && <p className="bus-warn" role="status">{note}</p>}
      <label className="bus-label" htmlFor="bus-code">{t.code}</label>
      <input id="bus-code" className="bus-code" dir="ltr" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={16} placeholder="BUS-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="bus-code" />
      {err && <p className="bus-err" role="alert">{err}</p>}
      <button type="submit" className="bus-btn bus-btn--go" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 8} data-testid="bus-signin">{t.go}</button>
    </form>
  );
};

/** A running trip: watches the phone's location, sends the latest every 15 s, keeps the screen awake, notices and End trip. */
const Trip: React.FC<{ t: (typeof T)['en']; lang: Lang; token: string; me: Me; onEnded: (msg: string) => void; onSignedOut: () => void }> = ({ t, lang, token, me, onEnded, onSignedOut }) => {
  const trip = me.trip!;
  const route = me.routes.find((r) => r.routeKey === trip.routeKey);
  const latest = useRef<GeolocationPosition | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [gps, setGps] = useState<'waiting' | 'ok' | 'denied' | 'error'>('waiting');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) { setGps('error'); return undefined; }
    const id = navigator.geolocation.watchPosition(
      (p) => { latest.current = p; setGps('ok'); setAccuracy(Math.round(p.coords.accuracy)); },
      (e) => setGps(e.code === e.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  // Keep the screen awake while the trip runs (where the browser allows it); take it again when the page comes back.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const take = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* not allowed */ } };
    void take();
    const onVis = () => { if (document.visibilityState === 'visible') void take(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, []);

  const send = useCallback(async () => {
    const p = latest.current; if (!p) return;
    try {
      await call('POST', `/api/bus/trips/${encodeURIComponent(trip.id)}/position`, { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed ?? undefined, heading: p.coords.heading ?? undefined }, token);
      setSentAt(new Date());
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) onSignedOut();
      else if (e instanceof HttpError && e.status === 409) onEnded(e.message);
    }
  }, [trip.id, token, onEnded, onSignedOut]);
  useEffect(() => { if (gps === 'ok' && !sentAt) void send(); }, [gps, sentAt, send]);
  useEffect(() => { const id = window.setInterval(() => { void send(); tick((x) => x + 1); }, 15_000); return () => window.clearInterval(id); }, [send]);

  const stalled = sentAt && Date.now() - sentAt.getTime() > 60_000;
  const notice = async (body: { kind: 'delay' | 'cancel'; minutes?: number }) => {
    if (body.kind === 'cancel' && !window.confirm(t.cancelConfirm)) return;
    try { await call('POST', `/api/bus/trips/${encodeURIComponent(trip.id)}/notice`, body, token); setMsg(t.noticeSent); } catch (e) { setMsg(e instanceof HttpError ? e.message : t.failed); }
  };
  const end = async () => {
    if (!window.confirm(t.endConfirm)) return;
    try { await call('POST', `/api/bus/trips/${encodeURIComponent(trip.id)}/end`, {}, token); } catch { /* ended anyway */ }
    onEnded(t.ended);
  };

  return (
    <section className="bus-card bus-trip" data-testid="bus-trip" data-trip={trip.id}>
      <b className="bus-route" dir="auto">{route?.routeName ?? trip.routeKey} · {t[trip.direction]}</b>
      <div className={`bus-live${gps === 'ok' && !stalled ? '' : ' bus-live--wait'}`} role="status" data-testid="bus-sharing">
        <span className="bus-pulse" aria-hidden="true" />
        <div><b>{gps === 'ok' ? t.sharing : t.waitingGps}</b><span>{t.sharingBody}</span></div>
      </div>
      <p className="bus-muted" data-testid="bus-last-sent">{[sentAt ? t.lastSent(hm(sentAt, lang)) : null, accuracy !== null ? t.accuracy(accuracy) : null, t.endsBy(hm(trip.endsBy, lang))].filter(Boolean).join(' · ')}</p>
      {gps === 'denied' && <p className="bus-err" role="alert">{t.denied} <button type="button" className="bus-link" onClick={() => setAttempt((a) => a + 1)}>{t.tryAgain}</button></p>}
      {gps === 'error' && <p className="bus-err" role="alert">{t.gpsError} <button type="button" className="bus-link" onClick={() => setAttempt((a) => a + 1)}>{t.tryAgain}</button></p>}
      {stalled && <p className="bus-warn" role="alert">{t.stalled}</p>}
      <h2 className="bus-h2">{t.late}</h2>
      <div className="bus-four">
        {[5, 10, 15, 20].map((m) => <button key={m} type="button" className="bus-btn" onClick={() => void notice({ kind: 'delay', minutes: m })} data-testid={`bus-late-${m}`}>{t.minutes(m)}</button>)}
      </div>
      <button type="button" className="bus-btn bus-btn--warn" onClick={() => void notice({ kind: 'cancel' })} data-testid="bus-cancel">{t.cancel}</button>
      {msg && <p className="bus-note" role="status" data-testid="bus-msg">{msg}</p>}
      <button type="button" className="bus-btn bus-btn--end" onClick={() => void end()} data-testid="bus-end">{t.end}</button>
    </section>
  );
};

export default BusApp;
