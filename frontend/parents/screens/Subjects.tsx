import React from 'react';
import { bi } from '../i18n';
import { cairoDate, parentsApi, type LearnerChip, type Rec, type SubjectCard } from '../api';
import { AiBadge, ErrorBox, Icon, Loading, levelNextLine, useP } from '../ui';
import { useLive } from '../useLive';

// All subjects (docs/parents/ALL_SUBJECTS_PLAN.md): the subject chips, the "All subjects" overview, one subject's page and the
// "How you can help this week" card. Only real data: a subject with no activity is not listed by the server.

export const ALL = 'all';

/** "All subjects" first, then one chip per subject with activity. Scrolls sideways on a phone; follows the page direction. */
export const SubjectChips: React.FC<{ subjects: SubjectCard[]; value: string; onChange: (key: string) => void }> = ({ subjects, value, onChange }) => {
  const { t, lang } = useP();
  if (!subjects.length) return null;
  return (
    <nav className="pp-subjects" aria-label={t.subjectsNav} data-testid="pp-subjects">
      {[{ key: ALL, label: t.allSubjects }, ...subjects.map((s) => ({ key: s.key, label: bi(s.name, lang) }))].map((c) => (
        <button type="button" key={c.key} className="pp-subject-chip" data-subject={c.key} aria-current={value === c.key ? 'true' : undefined} onClick={() => onChange(c.key)}>{c.label}</button>
      ))}
    </nav>
  );
};

const RecRow: React.FC<{ r: Rec; compact?: boolean }> = ({ r, compact }) => {
  const { t, lang } = useP();
  return (
    <div className="pp-rec" data-testid="pp-rec">
      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: '22px' }}>{bi(r.do, lang)}</p>
      <p className="pp-sub"><span className="sr">{t.helpWhy}: </span>{bi(r.why, lang)}</p>
      {!compact && <p className="pp-rec-say"><span className="pp-eyebrow">{t.helpSay}</span> <q>{bi(r.say, lang)}</q></p>}
    </div>
  );
};

export const HelpCard: React.FC<{ items: Rec[] }> = ({ items }) => {
  const { t } = useP();
  if (!items.length) return null;
  return (
    <section className="pp-card pp-try" aria-labelledby="pp-help" data-testid="pp-help">
      <div className="pp-row"><h2 className="pp-h2" id="pp-help">{t.howToHelp}</h2>{items.some((i) => i.ai) && <AiBadge />}</div>
      {items.map((r, i) => <RecRow key={i} r={r} />)}
    </section>
  );
};

const LevelLine: React.FC<{ s: Pick<SubjectCard, 'english' | 'cefr' | 'outcomes' | 'lessons'> }> = ({ s }) => {
  const { t, n, lang } = useP();
  if (s.english && s.cefr) return <p className="pp-level" style={{ fontSize: 18 }}>{bi(s.cefr.label, lang)} <span>· {s.cefr.cefr}</span></p>;
  return (
    <p style={{ fontSize: 14 }}>
      {s.outcomes.bandLabel && <strong style={{ fontWeight: 600 }}>{bi(s.outcomes.bandLabel, lang)}</strong>}
      {s.outcomes.total > 0 && <span className="pp-sub">{s.outcomes.bandLabel ? ' · ' : ''}{t.outcomesOf(n(s.outcomes.mastered), n(s.outcomes.total))}</span>}
    </p>
  );
};

/** "All subjects": one small card per subject with its progress, latest released result, points to practise and top suggestion. */
export const SubjectsOverview: React.FC<{ subjects: SubjectCard[]; onPick: (key: string) => void }> = ({ subjects, onPick }) => {
  const { t, n, lang } = useP();
  if (!subjects.length) return null;
  return (
    <section aria-label={t.allSubjects} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="pp-overview">
      {subjects.map((s) => {
        const pct = s.lessons.total ? Math.round((s.lessons.done / s.lessons.total) * 100) : 0;
        return (
          <article className="pp-card" key={s.key} data-testid="pp-subject-card" data-subject={s.key}>
            <button type="button" className="pp-card--link pp-subject-head" onClick={() => onPick(s.key)}>
              <h2 className="pp-h2">{bi(s.name, lang)}</h2>
              <Icon name="chevron" flip style={{ color: '#566376' }} />
            </button>
            <LevelLine s={s} />
            {s.lessons.total > 0 && (
              <>
                <div className="pp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={bi(s.name, lang)}><i style={{ inlineSize: `${pct}%` }} /></div>
                <p className="pp-sub">{t.lessonsOf(n(s.lessons.done), n(s.lessons.total))} · {t.minThisWeek(n(s.minutesThisWeek))}</p>
              </>
            )}
            <div className="pp-wrap">
              {s.latestResult && <span className="pp-tag pp-tag--sky">{t.latestResult}: {n(s.latestResult.score)}%</span>}
              {s.pointsCount > 0 && <span className="pp-tag pp-tag--warn">{t.pointsCount(n(s.pointsCount))}</span>}
            </div>
            {s.top && <div className="pp-try" style={{ borderRadius: 12, padding: 12 }}><p className="pp-eyebrow">{t.howToHelp}</p><RecRow r={s.top} compact /></div>}
          </article>
        );
      })}
    </section>
  );
};

/** One subject: on Home the level, suggestions, points to practise, next and recent sessions; on Progress the outcomes and results. */
export const SubjectView: React.FC<{ learner: LearnerChip; subjectKey: string; mode: 'home' | 'progress'; refreshKey: number; onFetched: (d: Date | null, loading: boolean) => void }> = ({ learner, subjectKey, mode, refreshKey, onFetched }) => {
  const ctx = useP();
  const { t, n, lang } = ctx;
  const q = useLive(() => parentsApi.subject(learner.studentId, subjectKey), [learner.studentId, subjectKey], refreshKey);
  React.useEffect(() => onFetched(q.fetchedAt, q.loading), [q.fetchedAt, q.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const s = q.data.subject;
  const pct = s.lessons.total ? Math.round((s.lessons.done / s.lessons.total) * 100) : 0;

  const level = (
    <section className="pp-card" aria-labelledby="pp-sub-level">
      <p className="pp-eyebrow" id="pp-sub-level">{t.subjectLevel}</p>
      <LevelLine s={s} />
      {s.english && s.cefr && levelNextLine(ctx, s.cefr) && <p className="pp-sub">{levelNextLine(ctx, s.cefr)}</p>}
      {s.lessons.total > 0 && (
        <>
          <div className="pp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.lessonsOf(n(s.lessons.done), n(s.lessons.total))}><i style={{ inlineSize: `${pct}%` }} /></div>
          <p className="pp-sub">{t.lessonsOf(n(s.lessons.done), n(s.lessons.total))} · {t.minThisWeek(n(s.minutesThisWeek))}</p>
        </>
      )}
    </section>
  );

  const results = (
    <section className="pp-card" aria-labelledby="pp-sub-results">
      <h2 className="pp-h2" id="pp-sub-results">{t.assessments}</h2>
      {s.results.length === 0 && <p className="pp-sub">{t.noAssessments}</p>}
      {s.results.map((a) => (
        <div className="pp-row" key={a.id} data-testid="pp-result">
          <div style={{ flexGrow: 1, minInlineSize: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }} dir="auto">{a.title}</p>
            <p className="pp-sub">{a.submittedAt ? cairoDate(a.submittedAt.slice(0, 10), lang) : ''}{a.score !== null ? ` · ${n(a.score)}%` : ''}</p>
          </div>
          {a.waiting && <span className="pp-tag pp-tag--sky" data-testid="pp-result-waiting">{t.waitingForTeacher}</span>}
          {a.passed !== null && (a.passed ? <span className="pp-tag pp-tag--ok"><Icon name="check" style={{ inlineSize: 14, blockSize: 14 }} />{t.passed}</span> : <span className="pp-tag pp-tag--warn">{t.notPassed}</span>)}
        </div>
      ))}
    </section>
  );

  if (mode === 'progress') {
    return (
      <>
        <h1 className="pp-h1">{bi(s.name, lang)}</h1>
        {level}
        {s.outcomes.items.length > 0 && (
          <section className="pp-card" aria-labelledby="pp-sub-outcomes">
            <div className="pp-row" style={{ alignItems: 'baseline' }}><h2 className="pp-h2" id="pp-sub-outcomes">{t.outcomesTitle}</h2><span className="pp-sub">{t.ofN(n(s.outcomes.mastered), n(s.outcomes.total))}</span></div>
            {s.outcomes.items.map((c) => (
              <div className="pp-cando" key={c.id}>
                <span className={`pp-cando-mark pp-cando-mark--${c.state}`} aria-hidden="true">{c.state === 'achieved' && <Icon name="check" style={{ inlineSize: 14, blockSize: 14, strokeWidth: 3 }} />}</span>
                <div style={{ flexGrow: 1 }}>
                  <p style={{ fontSize: 14, lineHeight: '20px' }} dir="auto">{c.title}</p>
                  <p className={`pp-state--${c.state}`} style={{ fontSize: 12, marginBlockStart: 2 }}>{t.canDoState[c.state]}</p>
                </div>
              </div>
            ))}
          </section>
        )}
        {results}
      </>
    );
  }

  return (
    <>
      <h1 className="pp-h1">{bi(s.name, lang)}</h1>
      {level}
      <HelpCard items={q.data.recommendations.items} />
      <section className="pp-card" aria-labelledby="pp-sub-points" data-testid="pp-points">
        <h2 className="pp-h2" id="pp-sub-points">{t.pointsToPractise}</h2>
        {s.points.length === 0 ? <p className="pp-sub">{t.noPoints}</p> : s.points.map((p) => (
          <div key={p.id}><p style={{ fontSize: 14, fontWeight: 600 }} dir="auto">{p.objective || p.error}</p>{p.objective && <p className="pp-sub" dir="auto">{p.error}</p>}</div>
        ))}
      </section>
      {(s.next.lesson || s.next.due) && (
        <section className="pp-card pp-card--flush" aria-label={t.comingNext}>
          {s.next.due && <div className="pp-list-row"><span className="pp-dot" style={{ background: '#db7706' }} aria-hidden="true" /><p dir="auto">{s.next.due.title}</p><span className="pp-meta">{t.dueOn(cairoDate(s.next.due.dueAt.slice(0, 10), lang, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>}
          {s.next.lesson && <div className="pp-list-row"><span className="pp-dot" style={{ background: '#566376' }} aria-hidden="true" /><p dir="auto">{s.next.lesson}</p><span className="pp-meta">{t.nextLesson}</span></div>}
        </section>
      )}
      {results}
      <section className="pp-card" aria-labelledby="pp-sub-sessions">
        <h2 className="pp-h2" id="pp-sub-sessions">{t.recentSessions}</h2>
        {s.sessions.length === 0 && <p className="pp-sub">{t.noRecentSessions}</p>}
        {s.sessions.map((x) => (
          <div className="pp-row" key={x.id}>
            <p style={{ fontSize: 14 }} dir="auto">{x.title}</p>
            <span className="pp-meta">{cairoDate(x.day, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {t.mShort(n(x.durationMin))}</span>
          </div>
        ))}
      </section>
    </>
  );
};
