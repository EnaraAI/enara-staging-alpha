import React, { useState } from 'react';
import { bi } from '../i18n';
import { cairoDate, parentsApi, type LearnerChip } from '../api';
import { AiBadge, ErrorBox, Icon, Loading, SampleBadge, Sheet, useP } from '../ui';
import { useLive } from '../useLive';

// "Share this week": the weekly summary as one shareable card, on demand.
export const ShareSheet: React.FC<{ learner: LearnerChip; onClose: () => void }> = ({ learner, onClose }) => {
  const { t, n, lang } = useP();
  const q = useLive(() => parentsApi.report(learner.studentId), [learner.studentId], 0);
  const [result, setResult] = useState<{ kind: 'ok' | 'wa' | 'err'; text?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canShare = learner.role !== 'view';
  const send = async (channel: 'email' | 'whatsapp') => {
    setBusy(true);
    try {
      const r = await parentsApi.share(learner.studentId, channel);
      setResult(channel === 'whatsapp' ? { kind: 'wa', text: r.preview } : { kind: 'ok' });
    } catch { setResult({ kind: 'err' }); } finally { setBusy(false); }
  };
  const r = q.data?.report;
  return (
    <Sheet title={t.share} onClose={onClose}>
      {!q.data && (q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />)}
      {r && (
        <article className="pp-card pp-report" aria-label={t.shareTitle(learner.firstName)}>
          <div className="pp-report-head">
            <small>{t.weekOf(cairoDate(r.weekStart, lang, { day: 'numeric', month: 'short' }))}</small>
            <b>{t.shareTitle(learner.firstName)}</b>
          </div>
          <div className="pp-report-body">
            <p className={`pp-status pp-status--${r.status}`} style={{ fontWeight: 600, fontSize: 14 }}>{t.status[r.status]}</p>
            <div className="pp-stats">
              <div><p>{n(r.minutesDone)}</p><p>{t.ofMinShort(n(r.goalMinutes))}</p></div>
              <div><p>{n(r.streak)}</p><p>{t.streakShort}</p></div>
              <div><p>{r.level.cefr}</p><p>{bi(r.level.label, lang)}{r.level.subLevelPct !== null ? ` · ${n(r.level.subLevelPct)}%` : ''}</p></div>
            </div>
            <div>
              <div className="pp-row" style={{ marginBlockEnd: 6 }}><p className="pp-eyebrow">{t.heLearned}</p><span style={{ display: 'inline-flex', gap: 6 }}><AiBadge /><SampleBadge show={r.learned.mock} /></span></div>
              <ul className="pp-bullets pp-ai-block">{r.learned.items.map((b, i) => <li key={i}>{bi(b, lang)}</li>)}</ul>
            </div>
            <div className="pp-card pp-try" style={{ padding: 12, gap: 4 }}>
              <p className="pp-eyebrow">{t.tryAtHome}</p>
              <p style={{ fontSize: 14 }}>{bi(r.tryAtHome.text, lang)}</p>
            </div>
            {(r.level.mock) && <SampleBadge />}
          </div>
        </article>
      )}
      {r && canShare && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="pp-btn pp-btn--primary pp-btn--block" disabled={busy} onClick={() => send('whatsapp')}><Icon name="share" />{t.shareWhatsapp}</button>
          <button type="button" className="pp-btn pp-btn--block" disabled={busy} onClick={() => send('email')}>{t.shareEmail}</button>
        </div>
      )}
      {r && !canShare && <p className="pp-sub">{t.viewOnly}</p>}
      {result?.kind === 'ok' && <p className="pp-success" role="status"><Icon name="check" />{t.shareSent}</p>}
      {result?.kind === 'wa' && <div role="status"><p className="pp-sub" style={{ marginBlockEnd: 6 }}>{t.shareWhatsappReady}</p><p className="pp-whatsapp" dir="auto">{result.text}</p></div>}
      {result?.kind === 'err' && <p className="pp-error" role="alert">{t.shareFailed}</p>}
    </Sheet>
  );
};
