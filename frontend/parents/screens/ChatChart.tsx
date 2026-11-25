import React from 'react';
import type { ChatChart as Chart } from '../api';
import { useP } from '../ui';

// Charts under the assistant's answers about results (owner "go" 25 Nov 2026). Drawn here from the data the server built from released
// marks only (never from the model's words). Plain HTML bars, so right-to-left and dark mode work without extra code; a screen reader
// reads one sentence that says the same as the chart.
const PASS = 60;
const tone = (m: number) => (m >= PASS ? 'ok' : 'low');

export const ChatChart: React.FC<{ chart: Chart }> = ({ chart }) => {
  const { t, lang, n } = useP();
  const c = t.sch.chart;
  const nameOf = (s: { subject: string; subjectAr: string }) => (lang === 'ar' ? s.subjectAr || s.subject : s.subject);
  if (chart.kind === 'subjects') {
    const summary = chart.rows.map((r) => `${nameOf(r)} ${r.mark === null ? c.noMark : `${r.mark}%`}`).join(lang === 'ar' ? '، ' : ', ');
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="subjects">
        <figcaption className="pp-cchart-cap">{c.subjectsTitle}<span>{c.passLine(n(PASS))}</span></figcaption>
        <div role="img" aria-label={`${c.subjectsTitle}: ${summary}`}>
          {chart.rows.map((r) => {
            const hi = chart.highlight === r.subject;
            return (
              <div key={r.subject} className={`pp-cchart-row${hi ? ' pp-cchart-row--hi' : ''}`} data-testid="pp-chat-chart-row" aria-hidden="true">
                <div className="pp-cchart-head">
                  <b dir="auto">{nameOf(r)}</b>
                  {hi && chart.highlightKind && <span className="pp-cchart-flag">{c[chart.highlightKind]}</span>}
                  <span className="pp-cchart-val">{r.mark === null ? c.noMark : `${n(r.mark)}%`}</span>
                </div>
                <div className="pp-cchart-track"><i className={r.mark === null ? '' : `pp-cchart-fill--${tone(r.mark)}`} style={{ inlineSize: `${r.mark ?? 0}%` }} /><s style={{ insetInlineStart: `${PASS}%` }} /></div>
                <div className="pp-cchart-sub">
                  <span className="pp-cchart-thin"><i style={{ inlineSize: `${r.lessonsTotal ? Math.round((100 * r.lessonsDone) / r.lessonsTotal) : 0}%` }} /></span>
                  <span>{c.lessons(n(r.lessonsDone), n(r.lessonsTotal))}</span>
                  {r.waiting > 0 && <span className="pp-cchart-wait">{c.waiting(n(r.waiting))}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </figure>
    );
  }
  const name = nameOf(chart);
  const summary = chart.points.length ? chart.points.map((p) => `${p.title} ${p.mark}%`).join(lang === 'ar' ? '، ' : ', ') : c.noMark;
  return (
    <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="subject">
      <figcaption className="pp-cchart-cap"><span dir="auto">{c.subjectTitle(name)}</span><span>{c.passLine(n(PASS))}</span></figcaption>
      {chart.points.length ? (
        <div className="pp-cchart-cols" role="img" aria-label={`${c.subjectTitle(name)}: ${summary}`}>
          <s style={{ insetBlockEnd: `${PASS}%` }} aria-hidden="true" />
          {chart.points.map((p, i) => (
            <div key={i} className="pp-cchart-col" title={`${p.title}${p.date ? ` · ${p.date}` : ''}`} data-testid="pp-chat-chart-point" aria-hidden="true">
              <span className="pp-cchart-colval" style={{ insetBlockEnd: `calc(${Math.max(p.mark, 2)}% + 2px)` }}>{n(p.mark)}%</span>
              <i className={`pp-cchart-fill--${tone(p.mark)}`} style={{ blockSize: `${Math.max(p.mark, 2)}%` }} />
            </div>
          ))}
        </div>
      ) : <p className="pp-cchart-empty">{c.noMarksYet}</p>}
      <div className="pp-cchart-sub" style={{ marginBlockStart: 8 }}>
        <span>{c.lessons(n(chart.lessonsDone), n(chart.lessonsTotal))}</span>
        {chart.outcomesTotal > 0 && <span>{c.outcomes(n(chart.outcomesMastered), n(chart.outcomesTotal))}</span>}
        {chart.waiting.length > 0 && <span className="pp-cchart-wait">{c.waiting(n(chart.waiting.length))}</span>}
      </div>
    </figure>
  );
};
