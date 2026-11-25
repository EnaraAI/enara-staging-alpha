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

/** A small ring with a label in the middle (subject rows, the subject header). */
export const MiniRing: React.FC<{ pct: number | null; label: string; size?: number; color?: string }> = ({ pct, label, size = 56, color = 'var(--blue)' }) => {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <span className="pp-mring" style={{ inlineSize: size, blockSize: size }} aria-hidden="true">
      <svg viewBox="0 0 54 54"><circle cx="27" cy="27" r={r} fill="none" stroke="var(--track)" strokeWidth="5" />{pct !== null && <circle className="pp-ringfill" cx="27" cy="27" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`} transform="rotate(-90 27 27)" />}</svg>
      <b style={{ fontSize: size > 70 ? 22 : 14 }}>{label}</b>
    </span>
  );
};

const SUBJECT_COLORS = ['#2B5CE6', '#E07A1F', '#14946F', '#B23C77', '#6D4AFF', '#0E7490'];
export const subjectColor = (i: number) => SUBJECT_COLORS[i % SUBJECT_COLORS.length];

/** Redesign step 3: the subject rows on Progress. Each opens the subject's page. */
export const SubjectRows: React.FC<{ subjects: SubjectCard[]; onPick: (key: string) => void }> = ({ subjects, onPick }) => {
  const { t, n, lang } = useP();
  if (!subjects.length) return null;
  return (
    <>
      <div className="pp-sec-h"><h2>{t.ui.subjectsTitle}</h2></div>
      <section className="pp-card pp-card--flush pp-threads" aria-label={t.ui.subjectsTitle}>
        {subjects.map((s, i) => {
          const pct = s.english && s.cefr ? s.cefr.subLevelPct : s.latestResult ? s.latestResult.score : s.outcomes.total ? Math.round((s.outcomes.mastered / s.outcomes.total) * 100) : null;
          const label = s.english && s.cefr ? s.cefr.cefr : s.latestResult ? `${n(s.latestResult.score)}%` : s.outcomes.total ? `${n(pct ?? 0)}%` : '–';
          const sub = s.english && s.cefr ? (levelNextLine({ t, n, lang }, s.cefr) ?? bi(s.cefr.label, lang)) : s.latestResult ? s.latestResult.title : s.outcomes.total ? t.ui.outcomesShort(n(s.outcomes.mastered), n(s.outcomes.total)) : t.lessonsOf(n(s.lessons.done), n(s.lessons.total));
          return (
            <button type="button" key={s.key} className="pp-thread" onClick={() => onPick(s.key)} data-testid="pp-progress-subject" data-subject={s.key}>
              <MiniRing pct={pct} label={label} color={subjectColor(i)} />
              <span className="pp-thread-body"><span className="pp-thread-name">{bi(s.name, lang)}</span><span className="pp-thread-sub" dir="auto">{sub}</span></span>
              {s.pointsCount > 0 ? <span className="pp-tag pp-tag--warn">{t.ui.toPractise(n(s.pointsCount))}</span> : <span className="pp-tag pp-tag--plain">{t.ui.nothingNew}</span>}
              <Icon name="chevron" flip style={{ color: 'var(--muted)' }} />
            </button>
          );
        })}
      </section>
    </>
  );
};

/** One result: a score tile (or a dashed waiting tile with the three steps), title, date and passed / keep practising.
 * Parents P3: a result the teacher has not released shows no score, only "Waiting for the teacher". */
export const ResultRow: React.FC<{ a: { id: string; title: string; score: number | null; submittedAt: string | null; passed: boolean | null; waiting?: boolean; verified?: boolean }; extra?: string }> = ({ a, extra }) => {
  const { t, n, lang } = useP();
  const tone = a.waiting ? 'wait' : a.passed === false ? 'warn' : a.score !== null && a.score < 50 ? 'warn' : 'ok';
  return (
    <div className={`pp-res${a.waiting ? ' pp-res--waiting' : ''}`} data-testid="pp-result">
      <div className="pp-res-main">
        <span className={`pp-score pp-score--${tone}`} aria-hidden={a.waiting ? 'true' : undefined}>{a.waiting ? <Icon name="nudge" /> : a.score !== null ? `${n(a.score)}%` : '–'}</span>
        <div className="pp-res-tx">
          <p dir="auto">{a.title}</p>
          <span className="pp-sub">{a.submittedAt ? cairoDate(a.submittedAt.slice(0, 10), lang) : ''}{!a.waiting && a.score !== null ? ` · ${n(a.score)}%` : ''}{extra ? ` · ${extra}` : ''}</span>
        </div>
        {a.waiting && <span className="pp-tag pp-tag--wait" data-testid="pp-result-waiting">{t.waitingForTeacher}</span>}
        {a.passed !== null && a.verified !== false && (a.passed ? <span className="pp-tag pp-tag--ok"><Icon name="check" style={{ inlineSize: 14, blockSize: 14 }} />{t.passed}</span> : <span className="pp-tag pp-tag--warn">{t.notPassed}</span>)}
      </div>
      {a.waiting && (
        <ol className="pp-steps" aria-label={t.waitingForTeacher}>
          <li className="pp-step--done"><i><Icon name="check" /></i>{t.ui.stepHanded}</li>
          <li className="pp-step--cur" aria-current="step"><i /> {t.ui.stepMarking}</li>
          <li><i />{t.ui.stepReleased}</li>
        </ol>
      )}
    </div>
  );
};

/** Waiting results first (they are what a parent is looking for), then newest first as the server sends them. */
export const waitingFirst = <T extends { waiting?: boolean }>(items: T[]): T[] => [...items.filter((x) => x.waiting), ...items.filter((x) => !x.waiting)];

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
              <Icon name="chevron" flip style={{ color: 'var(--muted)' }} />
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

  const headPct = s.english && s.cefr ? s.cefr.subLevelPct : s.outcomes.total ? Math.round((s.outcomes.mastered / s.outcomes.total) * 100) : s.lessons.total ? pct : null;
  const level = (
    <section className="pp-card pp-shead" aria-labelledby="pp-sub-level">
      <div className="pp-shead-top">
        <MiniRing size={92} pct={headPct} label={s.english && s.cefr ? s.cefr.cefr : headPct !== null ? `${n(headPct)}%` : '–'} />
        <div style={{ minInlineSize: 0 }}>
      <p className="pp-eyebrow" id="pp-sub-level">{t.subjectLevel}</p>
      <LevelLine s={s} />
      {s.english && s.cefr && levelNextLine(ctx, s.cefr) && <p className="pp-sub">{levelNextLine(ctx, s.cefr)}</p>}
        </div>
      </div>
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
      {waitingFirst(s.results).map((a) => <ResultRow key={a.id} a={a} />)}
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
          {s.next.due && <div className="pp-list-row"><span className="pp-dot" style={{ background: 'var(--warn-dot)' }} aria-hidden="true" /><p dir="auto">{s.next.due.title}</p><span className="pp-meta">{t.dueOn(cairoDate(s.next.due.dueAt.slice(0, 10), lang, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>}
          {s.next.lesson && <div className="pp-list-row"><span className="pp-dot" style={{ background: 'var(--muted)' }} aria-hidden="true" /><p dir="auto">{s.next.lesson}</p><span className="pp-meta">{t.nextLesson}</span></div>}
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
