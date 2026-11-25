import React, { useState } from 'react';
import { bi } from '../i18n';
import { cairoDate, parentsApi, type LearnerChip } from '../api';
import { ErrorBox, Icon, Loading, levelNextLine, useP } from '../ui';
import { ALL, SubjectView } from './Subjects';
import { useLive } from '../useLive';
import { ClassFilter } from '../shared';
import { MemoryCard } from './MemoryCard';

type ProgressProps = { learner: LearnerChip; refreshKey: number; onFetched: (d: Date | null, loading: boolean) => void; subjectKey?: string; english?: boolean };

// All subjects: English (and "All subjects") keep the CEFR view; another subject shows its own outcomes and results.
// Placeholder sections (mock) are not shown.
export const Progress: React.FC<ProgressProps> = (props) => (props.subjectKey && props.subjectKey !== ALL && !props.english
  ? <SubjectView learner={props.learner} subjectKey={props.subjectKey} mode="progress" refreshKey={props.refreshKey} onFetched={props.onFetched} />
  : <ProgressAll {...props} />);

const ProgressAll: React.FC<ProgressProps> = ({ learner, refreshKey, onFetched, subjectKey }) => {
  const ctx = useP();
  const { t, n, lang } = ctx;
  const [classId, setClassId] = useState<string | null>(null);
  const q = useLive(() => parentsApi.progress(learner.studentId, classId), [learner.studentId, classId], refreshKey);
  React.useEffect(() => onFetched(q.fetchedAt, q.loading), [q.fetchedAt, q.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const d = q.data;
  const lvlName = `${bi(d.level.label, lang)} (${d.level.cefr})`;
  const shown = subjectKey && subjectKey !== ALL ? d.assessments.items.filter((a) => a.subject?.key === subjectKey) : d.assessments.items;
  const achieved = d.canDos.items.filter((c) => c.state === 'achieved').length;
  const weeks = d.trend.weeks;
  // Trend chart geometry (logical: the x axis is mirrored in RTL).
  const W = 320, H = 140, x0 = 28, x1 = 312, yOf = (s: number) => 120 - (s / 100) * 120 + 10;
  const rtl = lang === 'ar';
  const xs = weeks.map((_, i) => { const x = x0 + ((x1 - x0) * i) / Math.max(1, weeks.length - 1); return rtl ? W - x : x; });
  const pts = weeks.map((w, i) => `${xs[i]},${yOf(w.score)}`).join(' ');
  const last = weeks[weeks.length - 1];
  const checkpoint = weeks.findIndex((w) => w.assessment);

  return (
    <>
      <h1 className="pp-h1">{t.progressTitle}</h1>

      {!d.level.mock && <section className="pp-card" aria-labelledby="pp-cefr" style={{ gap: 4 }}>
        <div className="pp-row" style={{ marginBlockEnd: 8 }}><p className="pp-eyebrow" id="pp-cefr">{t.cefrTitle}</p></div>
        <ol className="pp-ladder">
          {[...d.ladder].reverse().map((lv) => (
            <li key={lv.cefr} className={lv.state === 'current' ? 'is-current' : ''} aria-current={lv.state === 'current' ? 'step' : undefined}>
              <span className={`pp-mark${lv.state === 'done' ? ' pp-mark--done' : lv.state === 'current' ? ' pp-mark--current' : ''}`} aria-hidden="true">{lv.state === 'done' ? '✓' : lv.state === 'current' ? '●' : ''}</span>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="pp-row" style={{ alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: lv.state === 'current' ? 600 : lv.state === 'done' ? 500 : 400, color: lv.state === 'ahead' ? 'var(--muted)' : 'var(--text)' }}>{bi(lv.label, lang)}</span>
                  <span className="pp-meta">{lv.cefr}</span>
                </div>
                {lv.state === 'current' && (d.level.subLevelPct !== null ? (
                  <>
                    <div className="pp-bar" style={{ blockSize: 6, background: '#fff' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.level.subLevelPct} aria-label={lvlName}><i style={{ inlineSize: `${d.level.subLevelPct}%` }} /></div>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{d.level.subLevel ? `${d.level.subLevel} · ` : ''}{levelNextLine(ctx, d.level) ?? ''}</span>
                  </>
                ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.noSubLevel}</span>)}
                {lv.state === 'done' && <span className="sr">{t.canDoState.achieved}</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>}

      {!d.skills.mock && <section className="pp-card" aria-labelledby="pp-skills" style={{ gap: 14 }}>
        <div className="pp-row pp-row--top">
          <div><h2 className="pp-h2" id="pp-skills">{t.skills}</h2><p className="pp-sub" style={{ marginBlockStart: 2 }}>{t.skillsSub(lvlName)}</p></div>
        </div>
        {d.skills.items.map((s) => (
          <div className="pp-skill" key={s.skill}>
            <div className="pp-row" style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>{t.skill[s.skill] ?? s.skill}</span>
              <span className="pp-num" style={{ color: 'var(--text-2)' }}>{n(s.pct)}% <span aria-hidden="true" style={{ color: s.trend === 'up' ? 'var(--navy)' : 'var(--muted)', fontWeight: s.trend === 'up' ? 600 : 400 }}>{s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : rtl ? '←' : '→'}</span><span className="sr">, {t.trend[s.trend]}</span></span>
            </div>
            <div className="pp-bar pp-bar--navy" aria-hidden="true"><i style={{ inlineSize: `${s.pct}%` }} /></div>
          </div>
        ))}
      </section>}

      {!d.trend.mock && <section className="pp-card" aria-labelledby="pp-trend" style={{ gap: 10 }}>
        <div className="pp-row"><h2 className="pp-h2" id="pp-trend">{t.trendTitle}</h2></div>
        {weeks.length > 1 && (
          <svg className="pp-chart" style={{ direction: 'ltr' }} width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.trendLabel(n(weeks[0].score), n(last.score))}>
            {[25, 50, 75].map((v) => (
              <g key={v}>
                <line x1={x0} x2={x1} y1={yOf(v)} y2={yOf(v)} stroke="#eef2f6" />
                <text x={rtl ? W - 20 : 20} y={yOf(v) + 4} textAnchor={rtl ? 'start' : 'end'} fontSize="10" fill="#566376">{n(v)}</text>
              </g>
            ))}
            {checkpoint >= 0 && (
              <g>
                <line x1={xs[checkpoint]} x2={xs[checkpoint]} y1={14} y2={116} stroke="#0c8d62" strokeDasharray="3 3" />
                <text x={xs[checkpoint] + (rtl ? -4 : 4)} y={12} textAnchor={rtl ? 'end' : 'start'} fontSize="10" fill="#047857">{t.assessmentMark}</text>
              </g>
            )}
            <polyline points={pts} fill="none" stroke="#0b203c" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx={xs[xs.length - 1]} cy={yOf(last.score)} r="4" fill="#0b203c" />
            <text x={xs[xs.length - 1] + (rtl ? 6 : -6)} y={yOf(last.score) - 10} textAnchor={rtl ? 'start' : 'end'} fontSize="11" fontWeight="600" fill="#111c2c">{n(last.score)}</text>
            <text x={xs[0]} y={134} textAnchor={rtl ? 'end' : 'start'} fontSize="10" fill="#566376">{cairoDate(weeks[0].weekStart, lang)}</text>
            <text x={xs[xs.length - 1]} y={134} textAnchor={rtl ? 'start' : 'end'} fontSize="10" fill="#566376">{t.thisWeekShort}</text>
          </svg>
        )}
      </section>}

      {!d.canDos.mock && <section className="pp-card" aria-labelledby="pp-cando">
        <div className="pp-row" style={{ alignItems: 'baseline' }}>
          <h2 className="pp-h2" id="pp-cando">{t.canDos(bi(d.level.label, lang))}</h2>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span className="pp-sub">{t.ofN(n(achieved), n(d.canDos.items.length))}</span></span>
        </div>
        {d.canDos.items.map((c) => (
          <div className="pp-cando" key={c.id}>
            <span className={`pp-cando-mark pp-cando-mark--${c.state}`} aria-hidden="true">{c.state === 'achieved' && <Icon name="check" style={{ inlineSize: 14, blockSize: 14, strokeWidth: 3 }} />}</span>
            <div style={{ flexGrow: 1 }}>
              <p style={{ fontSize: 14, lineHeight: '20px' }} dir="auto">{bi(c.text, lang)}</p>
              <p className={`pp-state--${c.state}`} style={{ fontSize: 12, marginBlockStart: 2 }}>{t.canDoState[c.state]}</p>
            </div>
          </div>
        ))}
      </section>}

      {!d.strengths.mock && <section className="pp-grid2">
        <div className="pp-card"><div className="pp-row"><p className="pp-eyebrow">{t.strengths}</p></div>{d.strengths.strengths.map((s, i) => <p key={i} style={{ fontSize: 14, lineHeight: '20px' }}>{bi(s, lang)}</p>)}</div>
        <div className="pp-card"><p className="pp-eyebrow">{t.focusNext}</p>{d.strengths.focusAreas.map((s, i) => <p key={i} style={{ fontSize: 14, lineHeight: '20px' }}>{bi(s, lang)}</p>)}</div>
      </section>}

      <MemoryCard studentId={learner.studentId} canEdit={learner.role !== 'view'} />

      <section className="pp-card" aria-labelledby="pp-results">
        <div className="pp-row"><h2 className="pp-h2" id="pp-results">{t.assessments}</h2><span className="pp-meta">{t.lessonsDone(n(d.lessonsCompleted.count))}</span></div>
        <ClassFilter classes={d.classes} value={classId} onChange={setClassId} />
        {shown.length === 0 && <p className="pp-sub">{t.noAssessments}</p>}
        {shown.map((a) => (
          <div className="pp-row" key={a.id} data-testid="pp-result">
            <div style={{ flexGrow: 1, minInlineSize: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }} dir="auto">{a.title}</p>
              <p className="pp-sub">{a.submittedAt ? cairoDate(a.submittedAt.slice(0, 10), lang) : ''}{a.score !== null ? ` · ${n(a.score)}%` : ''}{a.class !== undefined ? ` · ${a.class ? t.inClass(a.class.name) : t.noClass}` : ''}</p>
            </div>
            {/* Parents P3: not released yet: no score, "Waiting for the teacher". */}
            {a.waiting && <span className="pp-tag pp-tag--sky" data-testid="pp-result-waiting">{t.waitingForTeacher}</span>}
            {a.passed !== null && a.verified && (a.passed
              ? <span className="pp-tag pp-tag--ok"><Icon name="check" style={{ inlineSize: 14, blockSize: 14 }} />{t.passed}</span>
              : <span className="pp-tag pp-tag--warn">{t.notPassed}</span>)}
          </div>
        ))}
      </section>
    </>
  );
};
