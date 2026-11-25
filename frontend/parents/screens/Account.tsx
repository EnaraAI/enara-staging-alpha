import React, { useState } from 'react';
import { bi, type Lang } from '../i18n';
import { cairoDate, parentsApi } from '../api';
import { Avatar, ErrorBox, Icon, Loading, useP } from '../ui';
import { useLive } from '../useLive';
import { AddEmail } from './AddEmail';
import type { Theme } from '../ParentsApp';

export const Account: React.FC<{ refreshKey: number; setLang: (l: Lang) => void; onLink: () => void; onPick: (studentId: string) => void; onChanged: () => void; onSignOut: () => void ; schoolOn?: boolean; feesOn?: boolean; busOn?: boolean; requestsOn?: boolean; theme?: Theme; setTheme?: (v: Theme) => void; onControls?: () => void }> = ({ refreshKey, setLang, onLink, onPick, onChanged, onSignOut , schoolOn, feesOn, busOn, requestsOn, theme, setTheme, onControls }) => {
  const { t, n, lang } = useP();
  const q = useLive(() => parentsApi.account(), [], refreshKey);
  const [note, setNote] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState(false);
  if (!q.data) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const d = q.data;
  const providedBy = d.plan.mock === false ? d.plan.providedBy : [];
  const chooseLang = (l: Lang) => { setLang(l); parentsApi.savePreferences({ language: l }).catch(() => undefined); };
  const unlink = async (linkId: string, name: string) => {
    if (!window.confirm(t.unlinkConfirm(name))) return;
    await parentsApi.unlink(linkId).catch(() => undefined);
    onChanged();
    q.reload();
  };
  const setRole = async (studentId: string, linkId: string, role: 'full' | 'view') => {
    await parentsApi.setGuardianRole(studentId, linkId, role).catch(() => undefined);
    q.reload();
  };

  return (
    <>
      <h1 className="pp-h1">{t.accountTitle}</h1>

      <section className="pp-card" aria-labelledby="pp-learners">
        <div className="pp-row"><h2 className="pp-h2" id="pp-learners">{t.learners}</h2><button type="button" className="pp-linkbtn" onClick={onLink}><Icon name="plus" style={{ inlineSize: 16, blockSize: 16, verticalAlign: 'middle' }} /> {d.learners.length ? t.addAnotherChild : t.linkChild}</button></div>
        {d.learners.length === 0 && <p className="pp-sub">{t.noLearnersBody}</p>}
        {d.learners.map((l, i) => (
          <div className="pp-person" key={l.studentId}>
            <Avatar initial={l.initial} index={i} />
            <button type="button" className="pp-person-text" style={{ border: 0, background: 'none', textAlign: 'start', cursor: 'pointer', padding: 0, minBlockSize: 44, justifyContent: 'center' }} onClick={() => onPick(l.studentId)}>
              <b>{l.firstName}{l.age !== null ? `${lang === 'ar' ? '، ' : ', '}${n(l.age)}` : ''}</b>
              <small>{t.tierLine[l.tier]}</small>
              {l.consent === 'pending' && <small style={{ color: 'var(--warn)' }}>{t.consentPending}</small>}
            </button>
            <button type="button" className="pp-linkbtn" onClick={() => unlink(l.linkId, l.firstName)}>{t.unlink}</button>
          </div>
        ))}
        {d.pending.length > 0 && <p className="pp-sub">{t.pendingLink}</p>}
      </section>

      <section className="pp-card" aria-labelledby="pp-guardians">
        <h2 className="pp-h2" id="pp-guardians">{t.guardians}</h2>
        {d.guardians.byLearner.map((g) => {
          const learner = d.learners.find((l) => l.studentId === g.studentId);
          return (
            <div key={g.studentId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {d.guardians.byLearner.length > 1 && <p className="pp-eyebrow">{learner?.firstName}</p>}
              {g.items.map((p) => (
                <div className="pp-row" key={p.linkId} style={{ minBlockSize: 44, fontSize: 14 }}>
                  <span>{p.isYou ? t.you : p.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className="pp-tag pp-tag--sky">{t.role[p.role]}</span>
                    {g.canManage && !p.isYou && p.role !== 'owner' && (
                      <button type="button" className="pp-linkbtn" onClick={() => setRole(g.studentId, p.linkId, p.role === 'full' ? 'view' : 'full')}>{p.role === 'full' ? t.makeView : t.makeFull}</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </section>

      {/* A placeholder plan (mock) is not shown: parents see only real data. */}
      {d.plan.mock ? null : (
        // Parents P1: ENARA Parents is provided free by the school (D1); no price.
        <section className="pp-card" aria-labelledby="pp-plan" data-testid="pp-provided-by">
          <h2 className="pp-h2" id="pp-plan">{t.planTitle}</h2>
          {providedBy.length ? providedBy.map((school) => <p key={school} style={{ fontSize: 14 }} dir="auto">{t.providedBy(school)}</p>) : <p className="pp-sub">{t.noLearnersBody}</p>}
          <p className="pp-sub">{t.providedFree}</p>
        </section>
      )}

      {d.signIn?.emailSignin && (d.signIn.hasEmail && !editEmail ? (
        // Parents P2: the account's email (sign-in on any device, notifications).
        <section className="pp-card" aria-labelledby="pp-email-h" data-testid="pp-email">
          <div className="pp-row"><h2 className="pp-h2" id="pp-email-h">{t.emailTitle}</h2><button type="button" className="pp-linkbtn" onClick={() => setEditEmail(true)}>{t.changeEmail}</button></div>
          <p style={{ fontSize: 14 }} dir="ltr">{d.signIn.email}</p>
          <p className="pp-sub">{d.signIn.emailVerified ? t.emailVerified : t.emailNotVerified}</p>
        </section>
      ) : (
        <AddEmail mode="inline" suggested={d.signIn?.suggestedEmail} onDone={() => { setEditEmail(false); onChanged(); q.reload(); }} />
      ))}

      {d.signIn?.method === 'code' && (
        // Parents P1 (code-first): no email on this account yet; this device remembers the parent.
        <section className="pp-card" aria-labelledby="pp-signin" data-testid="pp-code-only">
          <h2 className="pp-h2" id="pp-signin">{t.signInTitle}</h2>
          <p style={{ fontSize: 14 }}>{t.codeOnlyBody}</p>
        </section>
      )}

      <section className="pp-card" aria-labelledby="pp-prefs">
        <h2 className="pp-h2" id="pp-prefs">{t.preferences}</h2>
        <div className="pp-row" style={{ fontSize: 14 }}>
          <span id="pp-lang-label">{t.language}</span>
          <div className="pp-langseg" role="group" aria-labelledby="pp-lang-label">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')} lang="en">English</button>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => chooseLang('ar')} lang="ar">العربية</button>
          </div>
        </div>
        {setTheme && (
          // Redesign step 1: dark mode (saved on this device).
          <div className="pp-row" style={{ fontSize: 14, flexWrap: 'wrap' }}>
            <span id="pp-theme-label">{t.ui.theme}</span>
            <div className="pp-theme" role="group" aria-labelledby="pp-theme-label" data-testid="pp-theme">
              {(['light', 'dark', 'auto'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={theme === v} onClick={() => setTheme(v)}>{v === 'light' ? t.ui.themeLight : v === 'dark' ? t.ui.themeDark : t.ui.themeAuto}</button>
              ))}
            </div>
          </div>
        )}
        {d.preferences.emails ? (
          // Parents P4: the parent's own on/off for the two optional emails (the school's switches apply first).
          <>
            {(['weeklySummary', 'newResults'] as const).map((k) => (
              <label key={k} className="pp-row" style={{ fontSize: 14, minBlockSize: 44 }}>
                <span>{k === 'weeklySummary' ? t.emailWeekly : t.emailNewResults}</span>
                <input type="checkbox" checked={d.preferences.emails![k]} data-testid={`pp-pref-${k}`}
                  onChange={(e) => { void parentsApi.savePreferences({ [k === 'weeklySummary' ? 'weeklySummaryEmail' : 'newResultsEmail']: e.target.checked } as never).then(() => q.reload()); }} />
              </label>
            ))}
            {/* Parents school app (a4): school notice emails; in-app notifications are always on. SMS and WhatsApp come later. */}
            {schoolOn && (['schoolAttendance', 'schoolAnnouncements', ...(feesOn ? ['schoolFees'] as const : []), ...(busOn ? ['schoolBus'] as const : []), ...(requestsOn ? ['schoolRequests'] as const : [])] as const).map((k) => (
              <label key={k} className="pp-row" style={{ fontSize: 14, minBlockSize: 44 }}>
                <span>{k === 'schoolAttendance' ? t.sch.emailAttendance : k === 'schoolFees' ? t.sch.emailFees : k === 'schoolBus' ? t.sch.emailBus : k === 'schoolRequests' ? t.sch.emailRequests : t.sch.emailAnnouncements}</span>
                <input type="checkbox" checked={d.preferences.emails![k] !== false} data-testid={`pp-pref-${k}`}
                  onChange={(e) => { void parentsApi.savePreferences({ [k === 'schoolAttendance' ? 'schoolAttendanceEmail' : k === 'schoolFees' ? 'schoolFeesEmail' : k === 'schoolBus' ? 'schoolBusEmail' : k === 'schoolRequests' ? 'schoolRequestsEmail' : 'schoolAnnouncementsEmail']: e.target.checked } as never).then(() => q.reload()); }} />
              </label>
            ))}
            {schoolOn && <p className="pp-sub">{t.sch.smsLater}</p>}
            {!d.signIn?.hasEmail && <p className="pp-sub">{t.emailsNeedAddress}</p>}
          </>
        ) : (
          <div className="pp-row" style={{ fontSize: 14, minBlockSize: 44 }}><span>{t.weeklySummary}</span><span className="pp-meta">{t.onDemand}</span></div>
        )}
        <div className="pp-row" style={{ fontSize: 14, minBlockSize: 44 }}><span>{t.alertsVia}</span><span className="pp-meta">{d.preferences.alertChannels.map((c) => t.channels[c] ?? c).join(' + ')}</span></div>
      </section>

      {onControls && d.learners.length > 0 && (
        // Redesign step 1: learning controls moved here from their own tab.
        <section className="pp-card pp-card--flush" style={{ gap: 0 }}>
          <button type="button" className="pp-thread" onClick={onControls} data-testid="pp-open-controls">
            <span className="pp-av2 pp-av2--info"><Icon name="controls" /></span>
            <span className="pp-thread-body"><span className="pp-thread-name">{t.ui.controlsRow}</span><span className="pp-thread-sub">{t.ui.controlsSub}</span></span>
            <Icon name="chevron" flip style={{ color: 'var(--muted)' }} />
          </button>
        </section>
      )}

      <section className="pp-card" aria-labelledby="pp-privacy" style={{ gap: 4 }}>
        <h2 className="pp-h2" id="pp-privacy" style={{ marginBlockEnd: 8 }}>{t.privacy}</h2>
        {[t.download, t.deleteConvos, t.closeAccount].map((label) => (
          <button type="button" className="pp-actionlink" key={label} onClick={() => setNote(t.comingSoon)}>{label}<Icon name="chevron" flip /></button>
        ))}
      </section>
      {note && <p className="pp-notice" role="status" style={{ display: 'block', fontSize: 13 }}>{note}</p>}

      <button type="button" className="pp-btn pp-btn--block" onClick={() => { if (d.signIn?.method === 'code' && !window.confirm(t.codeOnlySignOut)) return; onSignOut(); }}><Icon name="out" flip />{t.signOut}</button>
    </>
  );
};
