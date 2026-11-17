import React, { useState } from 'react';
import { bi } from '../i18n';
import { cairoDate, cairoTime, dayOfMonth, parentsApi, weekdayIndex, type LearnerChip, type Transcript } from '../api';
import { AiBadge, ErrorBox, Icon, Loading, SampleBadge, Sheet, useP } from '../ui';
import { useLive } from '../useLive';
import { ClassFilter } from '../shared';

const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

export const Activity: React.FC<{ learner: LearnerChip; refreshKey: number; onFetched: (d: Date | null, loading: boolean) => void }> = ({ learner, refreshKey, onFetched }) => {
  const { t, n, lang } = useP();
  const [classId, setClassId] = useState<string | null>(null);
  const q = useLive(() => parentsApi.activity(learner.studentId, classId), [learner.studentId, classId], refreshKey);
  React.useEffect(() => onFetched(q.fetchedAt, q.loading), [q.fetchedAt, q.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ id: string; data?: Transcript; error?: string; expired?: boolean } | null>(null);

  const openTranscript = async (id: string) => {
    setTranscript({ id });
    try {
      setTranscript({ id, data: await parentsApi.transcript(learner.studentId, id) });
    } catch (e: any) {
      setTranscript({ id, expired: e?.status === 410, error: e?.status === 410 ? t.summaryOnly : t.error });
    }
  };

  if (!q.data) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const d = q.data;
  let lastDay = '';
  const firstOpen = open ?? d.sessions[0]?.id ?? null;

  return (
    <>
      <h1 className="pp-h1">{t.activityTitle}</h1>

      <section className="pp-card" aria-labelledby="pp-cal" style={{ paddingBlock: '16px 12px', paddingInline: 16, gap: 10 }}>
        <div className="pp-row" style={{ alignItems: 'baseline' }}>
          <p className="pp-eyebrow" id="pp-cal">{t.last2Weeks}</p>
          <span className="pp-meta">{t.daysPractised(n(d.calendar.practisedCount), n(d.calendar.pastCount))}</span>
        </div>
        <div className="pp-cal" role="list">
          {WEEK_ORDER.map((w) => <span key={`h${w}`} aria-hidden="true">{t.weekdays[w]}</span>)}
          {d.calendar.days.map((c) => (
            <span role="listitem" key={c.day} className={`pp-calday pp-calday--${c.state}`} aria-label={`${cairoDate(c.day, lang, { weekday: 'long', day: 'numeric', month: 'long' })}: ${t.dayState[c.state]}${c.minutes ? `, ${t.minShort(n(c.minutes))}` : ''}`}>
              <span aria-hidden="true">{n(dayOfMonth(c.day))}</span>
            </span>
          ))}
        </div>
        <div className="pp-legend" aria-hidden="true">
          <span><i style={{ background: '#f59f0a' }} />{t.practised}</span>
          <span><i style={{ background: '#f2f4f8' }} />{t.missed}</span>
          <span><i style={{ border: '1.5px dashed #566376' }} />{t.upcoming}</span>
        </div>
      </section>

      <ClassFilter classes={d.classes} value={classId} onChange={setClassId} />
      {d.sessions.length === 0 && <p className="pp-sub">{t.noSessions}</p>}
      {d.sessions.map((s) => {
        const isOpen = firstOpen === s.id;
        const heading = s.day !== lastDay ? (lastDay = s.day, <h2 className="pp-day-heading" key={`d${s.day}`}>{cairoDate(s.day, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>) : null;
        return (
          <React.Fragment key={s.id}>
            {heading}
            <article className="pp-card pp-card--flush">
              <button type="button" className="pp-sess-toggle" aria-expanded={isOpen} aria-controls={`pp-s-${s.id}`} onClick={() => setOpen(isOpen ? '' : s.id)}>
                <div className="pp-sess-when">
                  <p className="pp-meta">{t.weekdays[weekdayIndex(s.day)]}</p>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{t.mShort(n(s.durationMin))}</p>
                </div>
                <div style={{ flexGrow: 1, minInlineSize: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }} dir="auto">{s.title}</p>
                  <p className="pp-meta" style={{ marginBlockStart: 2 }}>{cairoTime(s.startedAt, lang)} · {s.mode === 'voice' ? t.voice : t.chat}{s.class !== undefined ? ` · ${s.class ? t.inClass(s.class.name) : t.noClass}` : ''}</p>
                </div>
                <Icon name="down" className={`pp-chev${isOpen ? ' pp-chev--open' : ''}`} />
              </button>
              {isOpen && (
                <div className="pp-sess-body" id={`pp-s-${s.id}`}>
                  {s.methods.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBlockStart: 12 }}>
                      <p className="pp-eyebrow">{t.howTaught}</p>
                      <div className="pp-wrap">{s.methods.map((m, i) => <span className="pp-method" key={i}>{bi(m, lang)}</span>)}</div>
                    </div>
                  )}
                  <div className="pp-row" style={{ justifyContent: 'flex-start', gap: 6, paddingBlockStart: s.methods.length ? 0 : 12 }}><AiBadge /><SampleBadge show={s.insight.mock} /></div>
                  <div className="pp-grid2 pp-ai-block">
                    <div><p className="pp-eyebrow" style={{ marginBlockEnd: 4 }}>{t.wentWell}</p><p style={{ fontSize: 13, lineHeight: '18px' }}>{bi(s.insight.wentWell, lang)}</p></div>
                    <div><p className="pp-eyebrow" style={{ marginBlockEnd: 4 }}>{t.wasHard}</p><p style={{ fontSize: 13, lineHeight: '18px' }}>{bi(s.insight.wasHard, lang)}</p></div>
                  </div>
                  <div>
                    <p className="pp-eyebrow" style={{ marginBlockEnd: 6 }}>{t.words}</p>
                    <div className="pp-wrap">{s.insight.words.map((w) => <span className="pp-word" key={w} lang="en" dir="ltr">{w}</span>)}</div>
                  </div>
                  <div className="pp-facts">
                    <span>{t.speakingTime} <strong style={{ fontWeight: 600 }}>{t.minShort(n(s.speakingMin))}</strong></span>
                    <span>{t.focus} <strong style={{ fontWeight: 600 }}>{t.focusLevel[s.insight.focus]}</strong></span>
                  </div>
                  {s.transcript.available ? (
                    <>
                      <button type="button" className="pp-btn pp-btn--block" onClick={() => openTranscript(s.id)}>{t.viewConversation}</button>
                      <p className="pp-meta" style={{ textAlign: 'center', marginBlockStart: -6 }}>{t.keptDays(n(s.transcript.retentionDays))}</p>
                    </>
                  ) : <p className="pp-meta" style={{ textAlign: 'center' }}>{t.summaryOnly}</p>}
                </div>
              )}
            </article>
          </React.Fragment>
        );
      })}

      {transcript && (
        <Sheet title={transcript.data ? transcript.data.session.title : t.transcriptTitle} onClose={() => setTranscript(null)}>
          {!transcript.data && !transcript.error && <Loading />}
          {transcript.error && <div className={transcript.expired ? 'pp-notice' : 'pp-error'} role="alert"><p>{transcript.error}</p></div>}
          {transcript.data && (
            <>
              <p className="pp-meta">{t.transcriptExpires(cairoDate(transcript.data.expiresAt.slice(0, 10), lang, { day: 'numeric', month: 'long' }))} · {t.noAudio}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {transcript.data.messages.map((m) => (
                  <div key={m.id} className={`pp-bubble pp-bubble--${m.from}`}>
                    <small>{m.from === 'learner' ? t.learnerSaid(learner.firstName) : t.enaraSaid} · {cairoTime(m.at, lang)}</small>
                    <span dir="auto">{m.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
};
