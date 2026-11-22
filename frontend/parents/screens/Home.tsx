import React from 'react';
import { bi } from '../i18n';
import { cairoDate, parentsApi, weekdayIndex, type LearnerChip } from '../api';
import { AiBadge, ErrorBox, Icon, Loading, Ring, useP } from '../ui';
import type { SubjectCard } from '../api';
import { ALL, SubjectView, SubjectsOverview } from './Subjects';
import { useLive } from '../useLive';

type HomeProps = { learner: LearnerChip; refreshKey: number; go: (tab: string) => void; onShare: () => void; onFetched: (d: Date | null, loading: boolean) => void; subjectKey?: string; overview?: SubjectCard[]; onPickSubject?: (key: string) => void };

// All subjects: a chosen subject shows its own page; "All subjects" shows the week, the subject cards and the real cards below.
// Cards built from placeholder data (mock) are not shown: parents see only real data.
export const Home: React.FC<HomeProps> = (props) => (props.subjectKey && props.subjectKey !== ALL
  ? <SubjectView learner={props.learner} subjectKey={props.subjectKey} mode="home" refreshKey={props.refreshKey} onFetched={props.onFetched} />
  : <HomeAll {...props} />);

const HomeAll: React.FC<HomeProps> = ({ learner, refreshKey, go, onShare, onFetched, overview = [], onPickSubject }) => {
  const { t, n, lang } = useP();
  const q = useLive(() => parentsApi.home(learner.studentId), [learner.studentId], refreshKey);
  React.useEffect(() => onFetched(q.fetchedAt, q.loading), [q.fetchedAt, q.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const d = q.data;
  const s = d.status;
  const name = learner.firstName;
  const kid = learner.tier === 'kid';
  const notice = t.tierNotice[learner.tier](name);
  const lvl = d.level;
  const accepted = s.goalAcceptedByLearner;

  return (
    <>
      {!kid && (
        <section className="pp-notice">
          <Icon name="eye" style={{ color: '#075985' }} />
          <div><b>{notice.title}</b><p>{notice.body}</p></div>
        </section>
      )}

      <section className="pp-card pp-effort" aria-labelledby="pp-week">
        <Ring done={s.minutesDone} goal={s.goalMinutes} />
        <div className="pp-effort-body">
          <p className="pp-eyebrow" id="pp-week">{t.thisWeek}</p>
          <ul className="pp-days">
            {s.days.map((day) => {
              const wd = weekdayIndex(day.day);
              const state = day.practised ? 'practised' : day.isToday ? 'today' : day.isFuture ? 'upcoming' : 'missed';
              return (
                <li key={day.day}>
                  <span className={`pp-daydot${day.practised ? ' pp-daydot--done' : day.isToday ? ' pp-daydot--today' : ''}`}>
                    {day.practised && <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                  <span aria-hidden="true">{t.weekdays[wd]}</span>
                  <span className="sr">{`${t.weekdaysLong[wd]}: ${t.dayState[state]}`}</span>
                </li>
              );
            })}
          </ul>
          <p style={{ fontSize: 14, lineHeight: '20px' }}>
            {s.streak > 0 && <><strong style={{ fontWeight: 600 }}>{t.streak(n(s.streak))}</strong>{' · '}</>}
            <span style={{ color: '#566376' }}>{t.sessions(n(s.sessions))}{s.lastPractised ? ` · ${t.lastPractised(cairoDate(s.lastPractised, lang, { weekday: 'long' }))}` : ` · ${t.notYet}`}</span>
          </p>
        </div>
      </section>

      {onPickSubject && <SubjectsOverview subjects={overview} onPick={onPickSubject} />}

      {!lvl.mock && <button type="button" className="pp-card pp-card--link" onClick={() => go('progress')}>
        <div className="pp-row">
          <p className="pp-eyebrow">{t.level}</p>
          <Icon name="chevron" flip style={{ color: '#566376' }} />
        </div>
        <p className="pp-level">{bi(lvl.label, lang)} <span>· {lvl.cefr}{lvl.subLevel && lvl.cefr !== 'Pre-A1' ? ` (${lvl.subLevel})` : ''}</span></p>
        {lvl.subLevelPct !== null ? (
          <>
            <div className="pp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lvl.subLevelPct} aria-label={t.level}><i style={{ inlineSize: `${lvl.subLevelPct}%` }} /></div>
            {lvl.nextLabel && <p className="pp-sub">{t.toNext(n(lvl.subLevelPct), `${bi(lvl.nextLabel, lang)} (${lvl.next})`)}</p>}
          </>
        ) : <p className="pp-sub">{t.noSubLevel}</p>}
        {kid && lvl.latestCanDo?.text && !lvl.latestCanDo.mock && (
          <div className="pp-verified"><Icon name="check" style={{ inlineSize: 18, blockSize: 18 }} /><p><strong style={{ fontWeight: 600 }}>{t.newCanDo}</strong> {bi(lvl.latestCanDo.text, lang)}</p></div>
        )}
      </button>}

      {!d.learned.mock && (
        <section className="pp-card" aria-labelledby="pp-learned">
          <div className="pp-row">
            <h2 className="pp-h2" id="pp-learned">{t.learned(name, learner.tier)}</h2>
            <AiBadge />
          </div>
          <ul className="pp-bullets pp-ai-block">{d.learned.items.map((b, i) => <li key={i}>{bi(b, lang)}</li>)}</ul>
        </section>
      )}

      {!kid && (
        <section className="pp-card pp-card--flush">
          <div className="pp-list-row"><Icon name="eye" style={{ color: '#566376' }} /><p>{t.conversations}</p><button type="button" className="pp-linkbtn" onClick={() => go('activity')}>{t.conversationsVisible}</button></div>
          <div className="pp-list-row"><Icon name="shield" style={{ color: '#047857' }} /><p>{t.safetyAlerts}</p><span className="pp-meta">{d.alerts.count && !d.alerts.mock ? n(d.alerts.count) : t.noAlerts}</span></div>
          <div className="pp-list-row"><Icon name="target" style={{ color: '#566376' }} /><p>{t.weeklyGoal(n(s.goalMinutes))}</p><span className={`pp-tag ${accepted ? 'pp-tag--sky' : 'pp-tag--warn'}`}>{accepted ? t.acceptedBy(name) : t.waitingFor(name)}</span></div>
        </section>
      )}

      {!d.tryAtHome.mock && (
        <section className="pp-card pp-try">
          <div className="pp-row"><p className="pp-eyebrow">{t.tryAtHome}</p><AiBadge /></div>
          <p className="pp-try-text">{bi(d.tryAtHome.text, lang)}</p>
        </section>
      )}

      {d.alerts.latest && !d.alerts.mock && (
        <section className="pp-card" aria-labelledby="pp-alert">
          <div className="pp-row"><h2 className="pp-h2" id="pp-alert"><Icon name="shield" style={{ color: '#b42318', verticalAlign: 'middle', marginInlineEnd: 6 }} />{t.alertCat[d.alerts.latest.category] ?? d.alerts.latest.category}</h2></div>
          <p className="pp-meta">{cairoDate(d.alerts.latest.createdAt.slice(0, 10), lang)}</p>
          <p style={{ fontSize: 14 }}><strong style={{ fontWeight: 600 }}>{t.whatEnaraDid}:</strong> {bi(d.alerts.latest.actionTaken, lang)}</p>
          {d.alerts.latest.excerpt && <p style={{ fontSize: 14 }}><strong style={{ fontWeight: 600 }}>{t.excerpt}:</strong> <q dir="auto">{d.alerts.latest.excerpt}</q></p>}
        </section>
      )}

      {!d.upcoming.mock && <section className="pp-card pp-card--flush" aria-label={t.alerts}>
        {d.upcoming.items.map((u, i) => (
          <div className="pp-list-row" key={i}>
            <span className="pp-dot" style={{ background: u.kind === 'assessment' ? '#db7706' : '#566376' }} aria-hidden="true" />
            <p>{bi(u.text, lang)}</p>
            {u.kind === 'plan_renewal' ? <button type="button" className="pp-linkbtn" onClick={() => go('account')}>{t.manage}</button> : <span className="pp-meta">{u.meta}</span>}
          </div>
        ))}
      </section>}

      <button type="button" className="pp-btn pp-btn--primary pp-btn--block" onClick={onShare}><Icon name="share" />{t.share}</button>
    </>
  );
};
