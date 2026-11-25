import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../services/apiService';
import { LangSwitch, initialLang, type Lang } from './LmsSchoolStatus';

const LiveMap = React.lazy(() => import('../components/LiveMap'));

// Live bus map: the school admin's "Bus supervisors" tab. Switches (school, routes, trip hours), supervisors and their one-time
// sign-in codes, stop pins, the trips running now (with Stop trip) and the trip history (who and when; never positions).
type Win = { from: string; to: string };
type Stop = { name: string; lat: number | null; lng: number | null };
type Route = { routeKey: string; routeName: string; busNumber: string | null; liveOn: boolean; sheetSupervisor: { name: string; phone: string | null } | null; stops: Stop[] };
type Sup = { id: string; name: string; phone: string | null; routeKeys: string[]; hasCode: boolean; codeHint: string | null; lastSignInAt: string | null };
type Running = { id: string; routeKey: string; routeName: string; direction: 'morning' | 'afternoon'; supervisor: string; startedAt: string; position: { lat: number; lng: number; at: string } | null };
type Hist = { id: string; routeName: string; direction: 'morning' | 'afternoon'; supervisor: string; startedAt: string; endedAt: string | null; endReason: string | null };
type View = { sectionOn: boolean; enabled: boolean; windows: Win[]; routesOff: string[]; inWindowNow: boolean; routes: Route[]; supervisors: Sup[]; running: Running[]; history: Hist[] };

const TEXT = {
  en: {
    title: 'Bus supervisors', intro: 'Bus supervisors share the bus’s location from their phone during a trip. Parents of children on that bus see it on a live map. Positions are deleted when the trip ends.',
    sectionOff: 'Turn on the Buses section (Parents → School app) and import the bus sheets first.',
    live: 'Live bus map', liveOn: 'On for this school', liveOff: 'Off', hours: 'Trip hours (Cairo time)', addWindow: 'Add hours', remove: 'Remove', from: 'From', to: 'To', save: 'Save', saved: 'Saved.',
    routes: 'Routes', routeLive: 'Live sharing on', nowInHours: 'Trips can start now.', notInHours: 'Outside trip hours now.',
    sups: 'Supervisors', addSup: 'Add a supervisor', name: 'Name', phone: 'Phone', assign: 'Routes', add: 'Add', fromSheet: 'From the bus sheet:', use: 'Use',
    code: 'Sign-in code', newCode: 'Create sign-in code', codeShown: 'Give this code to the supervisor. It works once, for 14 days, and is shown only now.', print: 'Print', close: 'Close',
    codeActive: (h: string) => `Code waiting to be used (…${h})`, signedIn: (d: string) => `Last signed in ${d}`, never: 'Not signed in yet', signOut: 'Sign out all devices', removeSup: 'Remove',
    confirmRemove: (n: string) => `Remove ${n}? Their phone is signed out and any running trip ends.`, confirmSignOut: (n: string) => `Sign ${n} out of every phone?`, edit: 'Edit routes', done: 'Done',
    pins: 'Stops on the map', pinHelp: 'Pick a stop, then tap its place on the map. Parents see their stop and an arrival estimate.', route: 'Route', clearPin: 'Clear pin', pinned: 'on the map', notPinned: 'not on the map',
    running: 'Running now', none: 'No trip is running.', stopTrip: 'Stop trip', confirmStop: 'Stop this trip? Location sharing ends now.', lastUpdate: (s: string) => `last update ${s}`, noPos: 'no position yet',
    history: 'Trip history', started: 'Started', ended: 'Ended', who: 'Supervisor', how: { ended: 'ended by supervisor', auto: 'stopped after 2 hours', admin: 'stopped by the school', off: 'live map switched off' } as Record<string, string>,
    d2d: 'Door to door (homes)', d2dHelp: 'On a door-to-door route each child’s home is their stop. Parents set the home in their app; you confirm it here before the bus uses it. You can also set it yourself.', d2dOn: 'Door to door on this route', order: 'Order', up: 'Up', down: 'Down', confirmed: 'Confirmed', pendingHome: 'Waiting for you', noHome: 'No home yet', confirm: 'Confirm', reject: 'Turn down', setOnMap: 'Set on map', pickOnMap: (n: string) => `Tap ${n}’s home on the map.`, noKids: 'No children on this route yet (bus assignments sheet).',
    noRoute: 'No route yet: this supervisor sees nothing until you tick a route (Edit routes).', pickRoute: 'Tick at least one route.',
    morning: 'Morning', afternoon: 'Afternoon', failed: 'Something went wrong. Try again.', loading: 'Loading…', mapAria: 'Map',
  },
  ar: {
    title: 'مشرفو الحافلات', intro: 'يشارك مشرفو الحافلات موقع الحافلة من هواتفهم أثناء الرحلة، ويراه أولياء أمور أطفال تلك الحافلة على خريطة مباشرة. تُحذف المواقع عند انتهاء الرحلة.',
    sectionOff: 'شغّل قسم الحافلات (أولياء الأمور ← تطبيق المدرسة) واستورد كشوف الحافلات أولًا.',
    live: 'خريطة الحافلات المباشرة', liveOn: 'مفعّلة لهذه المدرسة', liveOff: 'متوقفة', hours: 'مواعيد الرحلات (بتوقيت القاهرة)', addWindow: 'إضافة موعد', remove: 'حذف', from: 'من', to: 'إلى', save: 'حفظ', saved: 'تم الحفظ.',
    routes: 'خطوط السير', routeLive: 'المشاركة المباشرة مفعّلة', nowInHours: 'يمكن بدء الرحلات الآن.', notInHours: 'خارج مواعيد الرحلات الآن.',
    sups: 'المشرفون', addSup: 'إضافة مشرف', name: 'الاسم', phone: 'الهاتف', assign: 'الخطوط', add: 'إضافة', fromSheet: 'من كشف الحافلات:', use: 'استخدام',
    code: 'رمز الدخول', newCode: 'إنشاء رمز دخول', codeShown: 'أعطِ هذا الرمز للمشرف. يعمل مرة واحدة لمدة 14 يومًا، ويظهر الآن فقط.', print: 'طباعة', close: 'إغلاق',
    codeActive: (h: string) => `رمز بانتظار الاستخدام (…${h})`, signedIn: (d: string) => `آخر دخول ${d}`, never: 'لم يدخل بعد', signOut: 'الخروج من كل الأجهزة', removeSup: 'حذف',
    confirmRemove: (n: string) => `حذف ${n}؟ سيُخرج من هاتفه وتنتهي أي رحلة جارية.`, confirmSignOut: (n: string) => `إخراج ${n} من كل الهواتف؟`, edit: 'تعديل الخطوط', done: 'تم',
    pins: 'المحطات على الخريطة', pinHelp: 'اختر محطة ثم اضغط مكانها على الخريطة. يرى أولياء الأمور محطتهم والوقت المتوقع للوصول.', route: 'الخط', clearPin: 'إزالة الدبوس', pinned: 'على الخريطة', notPinned: 'ليست على الخريطة',
    running: 'الرحلات الجارية', none: 'لا توجد رحلة جارية.', stopTrip: 'إيقاف الرحلة', confirmStop: 'إيقاف هذه الرحلة؟ تتوقف مشاركة الموقع الآن.', lastUpdate: (s: string) => `آخر تحديث ${s}`, noPos: 'لا موقع بعد',
    history: 'سجل الرحلات', started: 'البداية', ended: 'النهاية', who: 'المشرف', how: { ended: 'أنهاها المشرف', auto: 'توقفت بعد ساعتين', admin: 'أوقفتها المدرسة', off: 'أُوقفت الخريطة المباشرة' } as Record<string, string>,
    d2d: 'من البيت للبيت', d2dHelp: 'في خط «من البيت للبيت» يكون بيت كل طفل هو محطته. يحدد ولي الأمر البيت من التطبيق، وتوافق عليه هنا قبل أن تعتمده الحافلة. يمكنك أيضًا تحديده بنفسك.', d2dOn: 'من البيت للبيت في هذا الخط', order: 'الترتيب', up: 'أعلى', down: 'أسفل', confirmed: 'معتمد', pendingHome: 'بانتظار موافقتك', noHome: 'لا بيت بعد', confirm: 'موافقة', reject: 'رفض', setOnMap: 'تحديد على الخريطة', pickOnMap: (n: string) => `اضغط على بيت ${n} في الخريطة.`, noKids: 'لا أطفال على هذا الخط بعد (كشف توزيع الحافلات).',
    noRoute: 'لا خط بعد: لن يرى هذا المشرف شيئًا حتى تختار خطًا (تعديل الخطوط).', pickRoute: 'اختر خطًا واحدًا على الأقل.',
    morning: 'الذهاب', afternoon: 'العودة', failed: 'حدث خطأ. حاول مرة أخرى.', loading: 'جارٍ التحميل…', mapAria: 'خريطة',
  },
};

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const primary = 'rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50';
const field = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const card = 'rounded-xl border border-slate-200 bg-white p-5 space-y-4';
const errText = (e: unknown, fb: string) => (e as { message?: string })?.message || fb;
const when = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

export const BusAdmin: React.FC = () => {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = TEXT[lang];
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<View>('GET', '/api/school-app/bus-live').then((d) => { setV(d); setErr(null); }).catch((e) => setErr(errText(e, t.failed))), [t.failed]);
  useEffect(() => { void load(); const id = window.setInterval(() => { void load(); }, 15_000); return () => window.clearInterval(id); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setNote(null); try { await fn(); if (ok) setNote(ok); } catch (e) { setNote(errText(e, t.failed)); } await load(); };

  if (!v) return <section className={card} data-testid="bus-admin"><h2 className="text-lg font-semibold">{t.title}</h2><p className="text-sm text-slate-600">{err ?? t.loading}</p></section>;
  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-testid="bus-admin">
      <section className={card}>
        <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{t.title}</h2><LangSwitch lang={lang} setLang={setLang} /></div>
        <p className="text-sm text-slate-600">{t.intro}</p>
        {!v.sectionOn && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="bus-admin-section-off">{t.sectionOff}</p>}
        {note && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800" role="status" data-testid="bus-admin-note">{note}</p>}
      </section>
      <Settings t={t} v={v} act={act} />
      <Supervisors t={t} lang={lang} v={v} act={act} />
      <Pins t={t} v={v} act={act} />
      <Homes t={t} v={v} act={act} />
      <RunningNow t={t} lang={lang} v={v} act={act} />
      <History t={t} lang={lang} v={v} />
    </div>
  );
};

type P = { t: (typeof TEXT)['en']; v: View; act?: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; lang?: Lang };

const Settings: React.FC<P> = ({ t, v, act = async () => undefined }) => {
  const [enabled, setEnabled] = useState(v.enabled);
  const [windows, setWindows] = useState<Win[]>(v.windows);
  const [off, setOff] = useState<string[]>(v.routesOff);
  useEffect(() => { setEnabled(v.enabled); setWindows(v.windows); setOff(v.routesOff); }, [v.enabled, JSON.stringify(v.windows), JSON.stringify(v.routesOff)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={card} data-testid="bus-admin-settings">
      <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="bus-live-enabled" />{t.live}: {enabled ? t.liveOn : t.liveOff}</label>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t.hours}</legend>
        {windows.map((w, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2" data-testid="bus-window">
            <label className="text-sm">{t.from}<input type="time" className={field} value={w.from} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} data-testid={`bus-window-from-${i}`} /></label>
            <label className="text-sm">{t.to}<input type="time" className={field} value={w.to} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} data-testid={`bus-window-to-${i}`} /></label>
            {windows.length > 1 && <button type="button" className={btn} onClick={() => setWindows(windows.filter((_, j) => j !== i))}>{t.remove}</button>}
          </div>
        ))}
        {windows.length < 4 && <button type="button" className={btn} onClick={() => setWindows([...windows, { from: '14:00', to: '15:00' }])}>{t.addWindow}</button>}
        <p className="text-xs text-slate-500">{v.inWindowNow ? t.nowInHours : t.notInHours}</p>
      </fieldset>
      {v.routes.length > 0 && (
        <fieldset className="space-y-1"><legend className="text-sm font-semibold">{t.routes}</legend>
          {v.routes.map((r) => (
            <label key={r.routeKey} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={!off.includes(r.routeKey)} onChange={(e) => setOff(e.target.checked ? off.filter((x) => x !== r.routeKey) : [...off, r.routeKey])} data-testid={`bus-route-live-${r.routeKey}`} /><span dir="auto">{r.routeName}{r.busNumber ? ` · ${r.busNumber}` : ''}</span><span className="text-xs text-slate-500">{t.routeLive}</span></label>
          ))}
        </fieldset>
      )}
      <button type="button" className={primary} onClick={() => void act(() => apiRequest('PUT', '/api/school-app/bus-live/settings', { enabled, windows, routesOff: off }), t.saved)} data-testid="bus-live-save">{t.save}</button>
    </section>
  );
};

const Supervisors: React.FC<P> = ({ t, lang = 'en', v, act = async () => undefined }) => {
  const [f, setF] = useState<{ name: string; phone: string; routeKeys: string[] }>({ name: '', phone: '', routeKeys: [] });
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const routeName = (k: string) => v.routes.find((r) => r.routeKey === k)?.routeName ?? k;
  const suggestions = v.routes.filter((r) => r.sheetSupervisor && !v.supervisors.some((s) => s.name === r.sheetSupervisor!.name));
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  return (
    <section className={card} data-testid="bus-admin-supervisors">
      <h3 className="text-base font-semibold">{t.sups}</h3>
      {v.supervisors.map((s) => (
        <article key={s.id} className="rounded-lg border border-slate-200 p-3 space-y-2" data-testid="bus-sup" data-name={s.name}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><b dir="auto">{s.name}</b>{s.phone && <span className="text-sm text-slate-500" dir="ltr"> · {s.phone}</span>}<div className="text-xs text-slate-500">{s.hasCode ? t.codeActive(s.codeHint ?? '') : s.lastSignInAt ? t.signedIn(when(s.lastSignInAt, lang)) : t.never}</div></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} data-testid="bus-sup-code" onClick={() => void act(async () => { const r = await apiRequest<{ code: string }>('POST', `/api/school-app/bus-live/supervisors/${encodeURIComponent(s.id)}/code`, {}); setCode({ name: s.name, code: r.code }); })}>{t.newCode}</button>
              <button type="button" className={btn} onClick={() => setEditing(editing === s.id ? null : s.id)}>{t.edit}</button>
              <button type="button" className={btn} onClick={() => { if (window.confirm(t.confirmSignOut(s.name))) void act(() => apiRequest('POST', `/api/school-app/bus-live/supervisors/${encodeURIComponent(s.id)}/sign-out`, {})); }}>{t.signOut}</button>
              <button type="button" className={btn} onClick={() => { if (window.confirm(t.confirmRemove(s.name))) void act(() => apiRequest('DELETE', `/api/school-app/bus-live/supervisors/${encodeURIComponent(s.id)}`)); }}>{t.removeSup}</button>
            </div>
          </div>
          {editing === s.id ? (
            <div className="flex flex-wrap gap-3">{v.routes.map((r) => <label key={r.routeKey} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.routeKeys.includes(r.routeKey)} onChange={() => void act(() => apiRequest('PUT', `/api/school-app/bus-live/supervisors/${encodeURIComponent(s.id)}`, { routeKeys: toggle(s.routeKeys, r.routeKey) }))} /><span dir="auto">{r.routeName}</span></label>)}</div>
          ) : s.routeKeys.length ? <p className="text-sm text-slate-700" dir="auto">{t.assign}: {s.routeKeys.map(routeName).join('، ')}</p>
            : <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900" data-testid="bus-sup-no-route">{t.noRoute}</p>}
        </article>
      ))}
      {code && (
        <div className="rounded-xl border-2 border-blue-600 bg-blue-50 p-4 space-y-2" role="dialog" aria-label={t.code} data-testid="bus-code-shown">
          <p className="text-sm"><b dir="auto">{code.name}</b> · {t.codeShown}</p>
          <p className="text-3xl font-bold tracking-widest text-center" dir="ltr" data-testid="bus-code-value">{code.code}</p>
          <div className="flex gap-2"><button type="button" className={btn} onClick={() => window.print()}>{t.print}</button><button type="button" className={primary} onClick={() => setCode(null)}>{t.close}</button></div>
        </div>
      )}
      <form className="rounded-lg bg-slate-50 p-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { await apiRequest('POST', '/api/school-app/bus-live/supervisors', f); setF({ name: '', phone: '', routeKeys: [] }); }); }} data-testid="bus-sup-form">
        <h4 className="text-sm font-semibold">{t.addSup}</h4>
        {suggestions.length > 0 && <p className="text-xs text-slate-600">{t.fromSheet} {suggestions.map((r) => <button key={r.routeKey} type="button" className="underline me-2" onClick={() => setF({ name: r.sheetSupervisor!.name, phone: r.sheetSupervisor!.phone ?? '', routeKeys: [r.routeKey] })}><span dir="auto">{r.sheetSupervisor!.name}</span> ({r.routeName})</button>)}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">{t.name}<input className={field} dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={80} data-testid="bus-sup-name" /></label>
          <label className="text-sm">{t.phone}<input className={field} dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} data-testid="bus-sup-phone" /></label>
        </div>
        <fieldset className="flex flex-wrap gap-3"><legend className="text-sm">{t.assign}</legend>{v.routes.map((r) => <label key={r.routeKey} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.routeKeys.includes(r.routeKey)} onChange={() => setF({ ...f, routeKeys: toggle(f.routeKeys, r.routeKey) })} data-testid={`bus-sup-route-${r.routeKey}`} /><span dir="auto">{r.routeName}</span></label>)}</fieldset>
        {f.routeKeys.length === 0 && v.routes.length > 0 && <p className="text-xs text-amber-800">{t.pickRoute}</p>}
        <button type="submit" className={primary} disabled={f.routeKeys.length === 0 && v.routes.length > 0} data-testid="bus-sup-add">{t.add}</button>
      </form>
    </section>
  );
};

const Pins: React.FC<P> = ({ t, v, act = async () => undefined }) => {
  const [routeKey, setRouteKey] = useState(v.routes[0]?.routeKey ?? '');
  const [stop, setStop] = useState<string | null>(null);
  const route = v.routes.find((r) => r.routeKey === routeKey) ?? v.routes[0];
  if (!route) return null;
  const pinned = route.stops.filter((s) => s.lat !== null && s.lng !== null) as (Stop & { lat: number; lng: number })[];
  return (
    <section className={card} data-testid="bus-admin-pins">
      <h3 className="text-base font-semibold">{t.pins}</h3>
      <p className="text-sm text-slate-600">{t.pinHelp}</p>
      <label className="text-sm block max-w-xs">{t.route}<select className={field} value={route.routeKey} onChange={(e) => { setRouteKey(e.target.value); setStop(null); }} data-testid="bus-pin-route">{v.routes.map((r) => <option key={r.routeKey} value={r.routeKey}>{r.routeName}</option>)}</select></label>
      <ul className="flex flex-wrap gap-2">
        {route.stops.map((s) => (
          <li key={s.name}><button type="button" className={`${btn} ${stop === s.name ? '!border-blue-600 !bg-blue-50' : ''}`} aria-pressed={stop === s.name} onClick={() => setStop(s.name)} data-testid="bus-pin-stop" data-stop={s.name}>
            <span dir="auto">{s.name}</span> <span className="text-xs text-slate-500">· {s.lat !== null ? t.pinned : t.notPinned}</span></button></li>
        ))}
      </ul>
      <React.Suspense fallback={<div className="h-64 rounded-xl bg-slate-100" />}>
        <LiveMap ariaLabel={t.mapAria} height={300} stops={pinned.map((s) => ({ lat: s.lat, lng: s.lng, label: s.name }))}
          onPick={stop ? (p) => void act(() => apiRequest('PUT', '/api/school-app/bus-live/stops', { routeKey: route.routeKey, stopName: stop, lat: p.lat, lng: p.lng })) : undefined} />
      </React.Suspense>
      {stop && route.stops.find((s) => s.name === stop)?.lat !== null && <button type="button" className={btn} onClick={() => void act(() => apiRequest('PUT', '/api/school-app/bus-live/stops', { routeKey: route.routeKey, stopName: stop, lat: null, lng: null }))}>{t.clearPin}</button>}
    </section>
  );
};

type HomeRow = { studentId: string; name: string; order: number; confirmed: { lat: number; lng: number; note: string } | null; pending: { lat: number; lng: number; note: string } | null };
type HomesView = { routes: { routeKey: string; routeName: string; doorToDoor: boolean; children: HomeRow[] }[] };

const Homes: React.FC<P> = ({ t, act = async () => undefined }) => {
  const [hv, setHv] = useState<HomesView | null>(null);
  const [routeKey, setRouteKey] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const load = useCallback(() => apiRequest<HomesView>('GET', '/api/school-app/bus-live/homes').then(setHv).catch(() => setHv(null)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => { await act(fn); await load(); };
  if (!hv?.routes.length) return null;
  const route = hv.routes.find((r) => r.routeKey === routeKey) ?? hv.routes[0];
  const kids = route.children;
  const move = (i: number, d: -1 | 1) => { const ids = kids.map((k) => k.studentId); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; void run(() => apiRequest('PUT', '/api/school-app/bus-live/homes/order', { studentIds: ids })); };
  const pins = kids.filter((k) => k.confirmed).map((k) => ({ lat: k.confirmed!.lat, lng: k.confirmed!.lng, label: k.name }));
  const sel = kids.find((k) => k.studentId === picking);
  return (
    <section className={card} data-testid="bus-admin-homes">
      <h3 className="text-base font-semibold">{t.d2d}</h3>
      <p className="text-sm text-slate-600">{t.d2dHelp}</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm block max-w-xs">{t.route}<select className={field} value={route.routeKey} onChange={(e) => { setRouteKey(e.target.value); setPicking(null); }} data-testid="bus-homes-route">{hv.routes.map((r) => <option key={r.routeKey} value={r.routeKey}>{r.routeName}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={route.doorToDoor} onChange={(e) => void run(() => apiRequest('PUT', '/api/school-app/bus-live/homes/door-to-door', { routeKey: route.routeKey, on: e.target.checked }))} data-testid="bus-homes-d2d" />{t.d2dOn}</label>
      </div>
      {route.doorToDoor && (kids.length === 0 ? <p className="text-sm text-slate-600">{t.noKids}</p> : (
        <>
          <ol className="space-y-2">
            {kids.map((k, i) => (
              <li key={k.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3" data-testid="bus-home-row" data-student={k.studentId}>
                <span className="text-sm"><b className="me-2">{i + 1}.</b><span dir="auto">{k.name}</span>
                  {k.pending ? <span className="ms-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800" data-testid="bus-home-state">{t.pendingHome}</span>
                    : k.confirmed ? <span className="ms-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800" data-testid="bus-home-state">{t.confirmed}</span>
                      : <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" data-testid="bus-home-state">{t.noHome}</span>}
                  {(k.pending ?? k.confirmed)?.note && <span className="block text-xs text-slate-500" dir="auto">{(k.pending ?? k.confirmed)!.note}</span>}
                </span>
                <span className="flex flex-wrap gap-2">
                  {k.pending && <button type="button" className={primary} onClick={() => void run(() => apiRequest('POST', `/api/school-app/bus-live/homes/${encodeURIComponent(k.studentId)}`, { action: 'confirm' }))} data-testid="bus-home-confirm">{t.confirm}</button>}
                  {k.pending && <button type="button" className={btn} onClick={() => void run(() => apiRequest('POST', `/api/school-app/bus-live/homes/${encodeURIComponent(k.studentId)}`, { action: 'reject' }))}>{t.reject}</button>}
                  <button type="button" className={`${btn} ${picking === k.studentId ? '!border-blue-600 !bg-blue-50' : ''}`} aria-pressed={picking === k.studentId} onClick={() => setPicking(picking === k.studentId ? null : k.studentId)}>{t.setOnMap}</button>
                  <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t.up}: ${k.name}`}>↑</button>
                  <button type="button" className={btn} disabled={i === kids.length - 1} onClick={() => move(i, 1)} aria-label={`${t.down}: ${k.name}`}>↓</button>
                </span>
              </li>
            ))}
          </ol>
          {sel && <p className="text-sm text-blue-800">{t.pickOnMap(sel.name)}</p>}
          <React.Suspense fallback={<div className="h-64 rounded-xl bg-slate-100" />}>
            <LiveMap ariaLabel={t.mapAria} height={300} stops={pins} stop={sel?.pending ? { ...sel.pending, label: sel.name } : null}
              onPick={sel ? (p) => { setPicking(null); void run(() => apiRequest('POST', `/api/school-app/bus-live/homes/${encodeURIComponent(sel.studentId)}`, { action: 'set', lat: p.lat, lng: p.lng })); } : undefined} />
          </React.Suspense>
        </>
      ))}
    </section>
  );
};

const RunningNow: React.FC<P> = ({ t, lang = 'en', v, act = async () => undefined }) => (
  <section className={card} data-testid="bus-admin-running">
    <h3 className="text-base font-semibold">{t.running}</h3>
    {v.running.length === 0 ? <p className="text-sm text-slate-600">{t.none}</p> : (
      <>
        <React.Suspense fallback={<div className="h-64 rounded-xl bg-slate-100" />}>
          <LiveMap ariaLabel={t.mapAria} height={280} buses={v.running.filter((r) => r.position).map((r) => ({ id: r.id, lat: r.position!.lat, lng: r.position!.lng, label: `${r.routeName} · ${r.supervisor}`, stale: Date.now() - new Date(r.position!.at).getTime() > 120_000 }))} />
        </React.Suspense>
        <ul className="space-y-2">
          {v.running.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3" data-testid="bus-running">
              <span className="text-sm"><b dir="auto">{r.routeName}</b> · {t[r.direction]} · <span dir="auto">{r.supervisor}</span> · <span className="text-slate-500">{r.position ? t.lastUpdate(when(r.position.at, lang)) : t.noPos}</span></span>
              <button type="button" className={btn} onClick={() => { if (window.confirm(t.confirmStop)) void act(() => apiRequest('POST', `/api/school-app/bus-live/trips/${encodeURIComponent(r.id)}/stop`, {})); }} data-testid="bus-stop-trip">{t.stopTrip}</button>
            </li>
          ))}
        </ul>
      </>
    )}
  </section>
);

const History: React.FC<P> = ({ t, lang = 'en', v }) => (
  v.history.length ? (
    <section className={card} data-testid="bus-admin-history">
      <h3 className="text-base font-semibold">{t.history}</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start text-slate-500"><th className="py-1 text-start">{t.route}</th><th className="text-start">{t.who}</th><th className="text-start">{t.started}</th><th className="text-start">{t.ended}</th></tr></thead>
        <tbody>{v.history.map((h) => <tr key={h.id} className="border-t border-slate-100" data-testid="bus-history-row"><td className="py-2" dir="auto">{h.routeName} · {t[h.direction]}</td><td dir="auto">{h.supervisor}</td><td>{when(h.startedAt, lang)}</td><td>{h.endedAt ? `${when(h.endedAt, lang)} (${t.how[h.endReason ?? ''] ?? ''})` : '…'}</td></tr>)}</tbody></table></div>
    </section>
  ) : null
);
