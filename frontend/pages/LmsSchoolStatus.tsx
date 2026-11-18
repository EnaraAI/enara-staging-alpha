import React, { useCallback, useEffect, useState } from 'react';
import {
  checkLmsConnectionAgain,
  fetchLmsSchoolStatus,
  LmsInviteTexts,
  LmsLang,
  LmsSchoolStatus as StatusData,
  markLmsInviteSent,
  newLmsOnboardingLink,
  sendLmsInviteEmail,
  setLmsManualSetting,
  setLmsPlatformPublicKey,
} from '../services/apiService';
import { LmsProblems } from './LmsProblems';

// LMS step 2: the school connection status page (S5: school admins for their
// own school, ENARA admins for any school; never teachers). The checklist
// (invite sent → link opened → registered → activated → first teacher → first
// student → roster → first grade), the 4 hand-ticked Moodle settings (who and
// when are recorded), the automatic connection check per connection with
// "Check again", the "Elapsed since invite" timer (15-minute goal), the
// pasted-public-key fallback for a Moodle the internet cannot reach, and the
// Problems view. English and Arabic (the EN / العربية switch, as in Problems).
//
// data-testid attributes are stable for the end-to-end suite.

const T = {
  en: {
    title: 'School connection status',
    refresh: 'Refresh',
    checkAgain: 'Check again',
    checking: 'Checking…',
    elapsed: 'Elapsed since invite',
    goal: 'Goal: 15 minutes',
    goalMet: 'Goal met',
    goalMissed: 'Over 15 minutes',
    notStarted: 'The timer starts when the invite is made.',
    startedFromCreated: '(from when the invite was made; it was not marked as sent)',
    checklist: 'Checklist',
    next: 'Next step',
    connection: 'Connection',
    lastCheck: 'Last automatic check',
    never: 'Not checked yet.',
    ok: 'OK', fail: 'Problem', waiting: 'Waiting',
    steps: { registered: 'Registered', reachable: 'Moodle reachable', services: 'Grade and roster access', activated: 'Activated', roster: 'Roster', grades: 'Grades' } as Record<string, string>,
    reference: 'Reference',
    manual: 'Moodle settings to set by hand (ENARA cannot see these)',
    manualHelp: 'Tick each one when it is done in Moodle. ENARA records who ticked it and when.',
    tickedBy: (by: string, at: string) => `Ticked by ${by}, ${at}`,
    invite: 'Invite and Moodle link',
    linkState: { unused: 'Unused', used: 'Used', revoked: 'Cancelled', expired: 'Expired' } as Record<string, string>,
    expires: 'expires',
    newLink: 'New link',
    newLinkConfirm: 'Make a new Moodle link? The old unused link stops working.',
    noOnboarding: 'This school was not set up with "New school", so there is no invite or timer.',
    problems: 'Problems view',
    showProblems: 'Show problems',
    hideProblems: 'Hide problems',
    pasteKey: "Moodle can't be reached from the internet: paste Moodle's public key",
    pasteKeyHelp: 'Paste the key (PEM "-----BEGIN PUBLIC KEY-----", or the JSON from Moodle\'s …/mod/lti/certs.php opened inside the school network). Launches are then checked with it.',
    saveKey: 'Save public key',
    hasKey: 'A pasted public key is used for launches.',
    status: { pending: 'pending', active: 'active', disabled: 'switched off' } as Record<string, string>,
    adminInvitation: 'School admin account invitation',
  },
  ar: {
    title: 'حالة ربط المدرسة',
    refresh: 'تحديث',
    checkAgain: 'تحقق مرة أخرى',
    checking: 'جارٍ التحقق…',
    elapsed: 'الوقت منذ الدعوة',
    goal: 'الهدف: 15 دقيقة',
    goalMet: 'تحقق الهدف',
    goalMissed: 'أكثر من 15 دقيقة',
    notStarted: 'يبدأ المؤقت عند إنشاء الدعوة.',
    startedFromCreated: '(منذ إنشاء الدعوة؛ لم تُعلَّم كمُرسلة)',
    checklist: 'قائمة الخطوات',
    next: 'الخطوة التالية',
    connection: 'الاتصال',
    lastCheck: 'آخر تحقق تلقائي',
    never: 'لم يُتحقق بعد.',
    ok: 'سليم', fail: 'مشكلة', waiting: 'بانتظار',
    steps: { registered: 'التسجيل', reachable: 'الوصول إلى Moodle', services: 'الوصول إلى الدرجات وقوائم الطلاب', activated: 'التفعيل', roster: 'قائمة الطلاب', grades: 'الدرجات' } as Record<string, string>,
    reference: 'رمز المرجع',
    manual: 'إعدادات Moodle التي تُضبط يدويًا (لا يستطيع ENARA رؤيتها)',
    manualHelp: 'ضع علامة على كل إعداد عند إتمامه في Moodle. يسجّل ENARA من وضع العلامة ومتى.',
    tickedBy: (by: string, at: string) => `وضع العلامة ${by}، ${at}`,
    invite: 'الدعوة ورابط Moodle',
    linkState: { unused: 'غير مستخدم', used: 'مستخدم', revoked: 'ملغى', expired: 'منتهي الصلاحية' } as Record<string, string>,
    expires: 'ينتهي',
    newLink: 'رابط جديد',
    newLinkConfirm: 'إنشاء رابط Moodle جديد؟ سيتوقف الرابط القديم غير المستخدم عن العمل.',
    noOnboarding: 'لم تُنشأ هذه المدرسة من "مدرسة جديدة"، لذلك لا توجد دعوة ولا مؤقت.',
    problems: 'المشكلات',
    showProblems: 'عرض المشكلات',
    hideProblems: 'إخفاء المشكلات',
    pasteKey: 'لا يمكن الوصول إلى Moodle من الإنترنت: الصق المفتاح العام لـ Moodle',
    pasteKeyHelp: 'الصق المفتاح (PEM يبدأ بـ "-----BEGIN PUBLIC KEY-----"، أو JSON من …/mod/lti/certs.php مفتوحًا داخل شبكة المدرسة). يُتحقق من الفتح به بعد ذلك.',
    saveKey: 'حفظ المفتاح العام',
    hasKey: 'يُستخدم مفتاح عام ملصق للتحقق من الفتح.',
    status: { pending: 'بانتظار الموافقة', active: 'نشط', disabled: 'متوقف' } as Record<string, string>,
    adminInvitation: 'دعوة حساب مسؤول المدرسة',
  },
};

export type Lang = LmsLang;

export const initialLang = (): Lang => {
  try {
    return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'en';
  }
};

const when = (iso: string | null | undefined, lang: Lang) => (iso ? new Date(iso).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : undefined) : '—');

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const LangSwitch: React.FC<{ lang: Lang; setLang: (l: Lang) => void }> = ({ lang, setLang }) => (
  <div className="flex items-center gap-1" role="group" aria-label="Language">
    <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en" className={`px-2 py-1 text-xs rounded ${lang === 'en' ? 'bg-slate-200 font-bold' : 'text-slate-600'}`} data-testid="lms-lang-en">EN</button>
    <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar" className={`px-2 py-1 text-xs rounded ${lang === 'ar' ? 'bg-slate-200 font-bold' : 'text-slate-600'}`} data-testid="lms-lang-ar">العربية</button>
  </div>
);

const copy = async (text: string) => {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* the text stays selectable */
  }
};

/**
 * The invite: the Moodle link (shown once), the invite text in English and
 * Arabic with Copy buttons, and "Send email" (only when emails are on).
 */
export const InviteBox: React.FC<{
  url: string;
  expiresAt: string;
  texts: LmsInviteTexts;
  emailAvailable: boolean;
  canEmail: boolean;
  onCopied: () => void;
  onSendEmail: () => void;
  busy?: boolean;
}> = ({ url, expiresAt, texts, emailAvailable, canEmail, onCopied, onSendEmail, busy }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const doCopy = (key: string, text: string) => {
    void copy(text).then(() => {
      setCopied(key);
      onCopied();
    });
  };
  const btn = 'text-sm font-semibold text-teal-700';
  return (
    <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3" data-testid="lms-invite">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-sm text-slate-600 shrink-0">Moodle link · رابط Moodle</span>
          <code className="text-sm bg-white border border-slate-100 rounded px-2 py-1 break-all flex-1" dir="ltr" data-testid="lms-invite-link">{url}</code>
          <button type="button" className={btn} onClick={() => doCopy('link', url)} data-testid="lms-invite-copy-link">{copied === 'link' ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <p className="text-xs text-slate-500 mt-1" data-testid="lms-invite-expiry" data-expires-at={expiresAt}>
          Shown only once. Works once, until {new Date(expiresAt).toLocaleString()}. · يظهر مرة واحدة فقط ويعمل مرة واحدة.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">English</span>
            <button type="button" className={btn} onClick={() => doCopy('en', texts.en)} data-testid="lms-invite-copy-en">{copied === 'en' ? 'Copied ✓' : 'Copy'}</button>
          </div>
          <pre className="mt-1 whitespace-pre-wrap text-xs bg-white border border-slate-100 rounded-lg p-3 max-h-72 overflow-auto" lang="en" dir="ltr" data-testid="lms-invite-text-en">{texts.en}</pre>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">العربية</span>
            <button type="button" className={btn} onClick={() => doCopy('ar', texts.ar)} data-testid="lms-invite-copy-ar">{copied === 'ar' ? 'تم النسخ ✓' : 'نسخ'}</button>
          </div>
          <pre className="mt-1 whitespace-pre-wrap text-xs bg-white border border-slate-100 rounded-lg p-3 max-h-72 overflow-auto font-sans" lang="ar" dir="rtl" data-testid="lms-invite-text-ar">{texts.ar}</pre>
        </div>
      </div>
      {canEmail && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!emailAvailable || busy} onClick={onSendEmail}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50" data-testid="lms-invite-send-email" title={emailAvailable ? undefined : 'Emails are off on this site'}>
            Send email
          </button>
          {!emailAvailable && <span className="text-xs text-slate-500" data-testid="lms-invite-email-off">Emails are off on this site. Copy the text and send it yourself. · البريد الإلكتروني متوقف في هذا الموقع.</span>}
          {emailAvailable && <span className="text-xs text-slate-500">Emails the school admin a sign-in link (the email never contains the Moodle link).</span>}
        </div>
      )}
    </div>
  );
};

const STATUS_STYLE: Record<string, string> = { ok: 'bg-teal-100 text-teal-800', fail: 'bg-red-100 text-red-800', waiting: 'bg-amber-100 text-amber-800' };

export const LmsSchoolStatus: React.FC<{ institutionId: string; isEnara: boolean }> = ({ institutionId, isEnara }) => {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [newLink, setNewLink] = useState<{ url: string; expiresAt: string; texts: LmsInviteTexts } | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const t = T[lang];

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchLmsSchoolStatus(institutionId));
      setLoadedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [institutionId]);
  useEffect(() => { void load(); }, [load]);
  // The timer ticks every second while it runs; the status reloads every 30 s.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const reload = window.setInterval(() => void load(), 30_000);
    return () => { window.clearInterval(tick); window.clearInterval(reload); };
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const timer = data?.timer;
  const elapsed = timer ? (timer.running ? timer.elapsedMs + (now - loadedAt) : timer.elapsedMs) : 0;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-testid="lms-status-page" data-institution-id={institutionId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          {data && <p className="text-slate-500 mt-1" data-testid="lms-status-school">{data.institution.name} <span className="text-xs" dir="ltr">({data.institution.id})</span></p>}
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch lang={lang} setLang={setLang} />
          <button type="button" className="text-sm font-semibold text-slate-700" onClick={() => void load()} data-testid="lms-status-refresh">{t.refresh}</button>
          <button type="button" disabled={busy || !data?.platforms.length} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            onClick={() => act(async () => { const r = await checkLmsConnectionAgain(institutionId); setData(r.status); })} data-testid="lms-status-check-again">
            {busy ? t.checking : t.checkAgain}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700" data-testid="lms-status-error">{error}</div>}
      {message && <div className="rounded-lg px-4 py-3 text-sm bg-teal-50 text-teal-800">{message}</div>}

      {data && (
        <>
          <section className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-wrap items-center gap-4" data-testid="lms-status-timer"
            data-running={timer ? String(timer.running) : 'none'} data-goal-met={timer ? String(timer.goalMet) : 'none'} data-elapsed-ms={timer ? String(Math.round(elapsed)) : ''}>
            <div>
              <div className="text-sm text-slate-500">{t.elapsed}</div>
              <div className={`text-3xl font-bold tabular-nums ${timer && elapsed > timer.goalMs ? 'text-red-700' : 'text-slate-900'}`} dir="ltr" data-testid="lms-status-elapsed">{timer ? formatElapsed(elapsed) : '—'}</div>
            </div>
            <div className="text-sm text-slate-600">
              {timer ? (
                <>
                  <div>{t.goal}</div>
                  {!timer.running && <div className={timer.goalMet ? 'text-teal-700 font-semibold' : 'text-red-700 font-semibold'}>{timer.goalMet ? t.goalMet : t.goalMissed}</div>}
                  {timer.startedFrom === 'invite_created' && <div className="text-xs text-slate-500">{t.startedFromCreated}</div>}
                </>
              ) : <div>{data.onboarding ? t.notStarted : t.noOnboarding}</div>}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="font-bold text-slate-900 mb-3">{t.checklist}</h2>
            <ol className="space-y-2" data-testid="lms-status-checklist">
              {data.checklist.map((c) => (
                <li key={c.key} className="flex gap-3 items-start" data-testid={`lms-status-item-${c.key}`} data-done={String(c.done)}>
                  <span aria-hidden className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs ${c.done ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-400'}`}>{c.done ? '✓' : ''}</span>
                  <div className="text-sm">
                    <div className="font-semibold text-slate-900">{c.label[lang]} {c.done && <span className="text-xs font-normal text-slate-500">· {when(c.at, lang)}</span>}</div>
                    {!c.done && c.next && <div className="text-slate-600"><span className="font-semibold">{t.next}:</span> {c.next[lang]}{c.code && <> <code className="text-xs bg-slate-100 px-1 rounded" dir="ltr">{c.code}</code></>}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {data.onboarding && (
            <section className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="lms-status-invite">
              <h2 className="font-bold text-slate-900 mb-2">{t.invite}</h2>
              {data.currentLink && (
                <p className="text-sm text-slate-600" data-testid="lms-status-current-link" data-link-status={data.currentLink.status}>
                  {t.linkState[data.currentLink.status] ?? data.currentLink.status}
                  {data.currentLink.status === 'unused' && <> · {t.expires} {when(data.currentLink.expiresAt, lang)}</>}
                  {data.currentLink.lastErrorCode && <> · <code className="text-xs bg-slate-100 px-1 rounded" dir="ltr">{data.currentLink.lastErrorCode}</code></>}
                </p>
              )}
              {isEnara && data.onboarding.moodleAdminEmail && <p className="text-xs text-slate-500 mt-1">Moodle admin: <span dir="ltr">{data.onboarding.moodleAdminEmail}</span></p>}
              {data.onboarding.schoolAdminInvitation && (
                <p className="text-xs text-slate-500 mt-1" data-testid="lms-status-admin-invitation">{t.adminInvitation}: {data.onboarding.schoolAdminInvitation.status}</p>
              )}
              <button type="button" disabled={busy} className="mt-3 px-4 py-2 border border-slate-300 rounded-xl text-sm font-bold disabled:opacity-50" data-testid="lms-status-new-link"
                onClick={() => window.confirm(t.newLinkConfirm) && act(async () => {
                  const r = await newLmsOnboardingLink(institutionId);
                  setNewLink({ url: r.url, expiresAt: r.link.expiresAt, texts: r.invite });
                })}>
                {t.newLink}
              </button>
              {newLink && (
                <InviteBox url={newLink.url} expiresAt={newLink.expiresAt} texts={newLink.texts} emailAvailable={data.emailAvailable} canEmail={isEnara} busy={busy}
                  onCopied={() => { if (!data.onboarding?.inviteSentAt) void markLmsInviteSent(institutionId).then(() => load()).catch(() => undefined); }}
                  onSendEmail={() => act(() => sendLmsInviteEmail(institutionId), 'Email sent.')} />
              )}
            </section>
          )}

          {data.platforms.map((p) => (
            <section key={p.id} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4" data-testid="lms-status-connection" data-platform-id={p.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-slate-900">{t.connection}</h2>
                <span className="text-sm text-slate-700 break-all" dir="ltr">{p.issuer}</span>
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">{t.status[p.status] ?? p.status}</span>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-2">
                  {t.lastCheck}: {p.check.checkedAt ? <>{when(p.check.checkedAt, lang)} {p.check.outcome && <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded ${STATUS_STYLE[p.check.outcome]}`} data-testid="lms-check-outcome">{t[p.check.outcome]}</span>}</> : t.never}
                </div>
                <ul className="space-y-2" data-testid="lms-check-steps">
                  {p.check.steps.map((s) => (
                    <li key={s.key} className="rounded-lg border border-slate-100 px-3 py-2" data-testid={`lms-check-step-${s.key}`} data-status={s.status}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_STYLE[s.status]}`}>{t[s.status]}</span>
                        <span className="font-semibold text-slate-900">{t.steps[s.key] ?? s.key}</span>
                        <span className="text-xs text-slate-500">{t.reference}: <code dir="ltr">{s.code}</code></span>
                      </div>
                      <p className="text-sm text-slate-800 mt-1">{s.help[lang].what}</p>
                      {s.status !== 'ok' && <p className="text-sm text-slate-600"><span className="font-semibold">{t.next}:</span> {s.help[lang].fix}</p>}
                    </li>
                  ))}
                </ul>
              </div>

              {(p.check.unreachable || p.hasPublicKey) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3" data-testid="lms-public-key">
                  {p.hasPublicKey && <p className="text-sm text-teal-800">{t.hasKey}</p>}
                  {p.check.unreachable && (
                    <>
                      <label className="text-sm font-semibold text-slate-800 block">{t.pasteKey}
                        <textarea dir="ltr" rows={4} className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono" value={keyDraft[p.id] ?? ''} onChange={(e) => setKeyDraft({ ...keyDraft, [p.id]: e.target.value })} data-testid="lms-public-key-input" />
                      </label>
                      <p className="text-xs text-slate-500">{t.pasteKeyHelp}</p>
                      <button type="button" disabled={busy || !(keyDraft[p.id] ?? '').trim()} className="mt-2 text-sm font-semibold text-teal-700 disabled:opacity-50" data-testid="lms-public-key-save"
                        onClick={() => act(() => setLmsPlatformPublicKey(p.id, keyDraft[p.id].trim()), 'Saved.')}>{t.saveKey}</button>
                    </>
                  )}
                </div>
              )}

              <div data-testid="lms-manual-settings">
                <h3 className="text-sm font-bold text-slate-900">{t.manual}</h3>
                <p className="text-xs text-slate-500 mb-2">{t.manualHelp}</p>
                <ul className="space-y-2">
                  {p.manualSettings.map((m) => (
                    <li key={m.key} className="flex gap-3 items-start" data-testid={`lms-manual-${m.key}`} data-checked={String(m.checked)}>
                      <input type="checkbox" className="mt-1" checked={m.checked} disabled={busy} id={`lms-manual-${p.id}-${m.key}`}
                        onChange={(e) => act(() => setLmsManualSetting(institutionId, p.id, m.key, e.target.checked))} data-testid={`lms-manual-${m.key}-checkbox`} />
                      <label htmlFor={`lms-manual-${p.id}-${m.key}`} className="text-sm">
                        <span className="font-semibold text-slate-900">{m.label[lang]}</span>
                        <span className="block text-slate-600">{m.how[lang]}</span>
                        {m.checked && m.at && <span className="block text-xs text-slate-500">{t.tickedBy(m.by ?? '—', when(m.at, lang))}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          <section>
            <button type="button" className="text-sm font-semibold text-teal-700" onClick={() => setShowProblems((v) => !v)} data-testid="lms-status-problems-link">
              {t.problems}: {showProblems ? t.hideProblems : t.showProblems}
            </button>
            {showProblems && <div className="mt-3"><LmsProblems isEnara={isEnara} institutionId={institutionId} /></div>}
          </section>
        </>
      )}
    </div>
  );
};
