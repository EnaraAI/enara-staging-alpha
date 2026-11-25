import React from 'react';
import type { ChatChart as Chart } from '../api';
import { useP } from '../ui';

// Charts under the assistant's answers about results (owner "go" 25 Nov 2026). Drawn here from the data the server built from released
// marks only (never from the model's words). Plain HTML bars, so right-to-left and dark mode work without extra code; a screen reader
// reads one sentence that says the same as the chart.
const PASS = 60;
const tone = (m: number) => (m >= PASS ? 'ok' : 'low');

/** Columns with an optional reference line (pass mark or weekly goal); values are 0–100 of the plot height. */
const Cols: React.FC<{ points: { label: string; value: number; text: string; tone: 'ok' | 'low'; under?: string }[]; line?: number; aria: string; small?: boolean }> = ({ points, line, aria, small }) => (
  <div className={`pp-cchart-cols${small ? ' pp-cchart-cols--sm' : ''}`} role="img" aria-label={aria}>
    {line !== undefined && <s style={{ insetBlockEnd: `${line}%` }} aria-hidden="true" />}
    {points.map((p, i) => (
      <div key={i} className="pp-cchart-col" title={p.label} data-testid="pp-chat-chart-point" aria-hidden="true">
        <span className="pp-cchart-colval" style={{ insetBlockEnd: `calc(${Math.max(p.value, 2)}% + 2px)` }}>{p.text}</span>
        <i className={`pp-cchart-fill--${p.tone}`} style={{ blockSize: `${Math.max(p.value, 2)}%` }} />
        {p.under && <small className="pp-cchart-under">{p.under}</small>}
      </div>
    ))}
  </div>
);

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
  if (chart.kind === 'trend') {
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="trend">
        <figcaption className="pp-cchart-cap">{c.trendTitle}<span>{c.passLine(n(PASS))}</span></figcaption>
        {chart.subjects.map((s) => (
          <div key={s.subject} className="pp-cchart-row" data-testid="pp-chat-chart-row">
            <div className="pp-cchart-head"><b dir="auto">{nameOf(s)}</b><span className={`pp-cchart-trend pp-cchart-trend--${s.trend}`}>{c.trend[s.trend]}{s.change !== null && s.trend !== 'steady' ? ` ${s.change > 0 ? '+' : ''}${n(s.change)}` : ''}</span></div>
            {s.points.length ? <Cols points={s.points.map((p) => ({ label: `${p.title}${p.date ? ` · ${p.date}` : ''}`, value: p.mark, text: `${n(p.mark)}%`, tone: tone(p.mark) }))} line={PASS} aria={`${nameOf(s)}: ${s.points.map((p) => `${p.mark}%`).join(', ')}`} small /> : <p className="pp-cchart-empty">{c.noMarksYet}</p>}
          </div>
        ))}
      </figure>
    );
  }
  if (chart.kind === 'weekdays') {
    const school = chart.weekdays.filter((w) => w.day !== 5 && w.day !== 6);
    const max = Math.max(1, ...school.map((w) => w.absent + w.late));
    const pct = (m: { attendedPercent: number | null }) => (m.attendedPercent === null ? '—' : `${n(m.attendedPercent)}%`);
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="weekdays">
        <figcaption className="pp-cchart-cap">{c.attendanceTitle}</figcaption>
        <div className="pp-cchart-kpis">
          <div><small>{c.thisMonth}</small><b>{pct(chart.thisMonth)}</b><span>{c.absentLate(n(chart.thisMonth.absentDays), n(chart.thisMonth.lateDays))}</span></div>
          <div><small>{c.lastMonth}</small><b>{pct(chart.lastMonth)}</b><span>{c.absentLate(n(chart.lastMonth.absentDays), n(chart.lastMonth.lateDays))}</span></div>
        </div>
        <div role="img" aria-label={`${c.byWeekday}: ${school.map((w) => `${c.days[w.day]} ${w.absent}/${w.late}`).join(', ')}`}>
          <p className="pp-cchart-sub" style={{ marginBlockEnd: 4 }}>{c.byWeekday} · <i className="pp-cchart-key pp-cchart-key--abs" />{c.absent} <i className="pp-cchart-key pp-cchart-key--late" />{c.late}</p>
          {school.map((w) => (
            <div key={w.day} className="pp-cchart-wd" aria-hidden="true">
              <span>{c.days[w.day]}</span>
              <div className="pp-cchart-stack"><i className="pp-cchart-key--abs" style={{ inlineSize: `${(100 * w.absent) / max}%` }} /><i className="pp-cchart-key--late" style={{ inlineSize: `${(100 * w.late) / max}%` }} /></div>
              <b>{w.absent + w.late ? n(w.absent + w.late) : ''}</b>
            </div>
          ))}
        </div>
      </figure>
    );
  }
  if (chart.kind === 'weeks') {
    const max = Math.max(chart.goal, ...chart.weeks.map((w) => w.minutes), 1);
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="weeks">
        <figcaption className="pp-cchart-cap">{c.practiceTitle}<span>{c.goalLine(n(chart.goal))}</span></figcaption>
        <Cols points={chart.weeks.map((w, i) => ({ label: w.start, value: (100 * w.minutes) / max, text: n(w.minutes), tone: w.minutes >= chart.goal ? 'ok' : 'low', under: i === chart.weeks.length - 1 ? c.nowWeek : c.weekOf(w.start.slice(5).replace('-', '/')) }))} line={(100 * chart.goal) / max} aria={`${c.practiceTitle}: ${chart.weeks.map((w) => `${w.minutes}`).join(', ')}`} />
        <p className="pp-cchart-sub">{c.streak(n(chart.streakDays))}</p>
      </figure>
    );
  }
  if (chart.kind === 'practice_marks') {
    const maxMin = Math.max(1, ...chart.rows.map((r) => r.minutes));
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="practice_marks">
        <figcaption className="pp-cchart-cap">{c.pmTitle}<span>{c.pmNote}</span></figcaption>
        <div role="img" aria-label={chart.rows.map((r) => `${nameOf(r)} ${r.minutes} min, ${r.mark === null ? c.noMark : `${r.mark}%`}`).join(', ')}>
          {chart.rows.map((r) => (
            <div key={r.subject} className="pp-cchart-row" data-testid="pp-chat-chart-row" aria-hidden="true">
              <div className="pp-cchart-head"><b dir="auto">{nameOf(r)}</b></div>
              <div className="pp-cchart-pair"><span>{c.practiceMin}</span><div className="pp-cchart-track"><i className="pp-cchart-fill--min" style={{ inlineSize: `${(100 * r.minutes) / maxMin}%` }} /></div><b>{n(r.minutes)}</b></div>
              <div className="pp-cchart-pair"><span>{c.mark}</span><div className="pp-cchart-track"><i className={r.mark === null ? '' : `pp-cchart-fill--${tone(r.mark)}`} style={{ inlineSize: `${r.mark ?? 0}%` }} /></div><b>{r.mark === null ? '—' : `${n(r.mark)}%`}</b></div>
            </div>
          ))}
        </div>
      </figure>
    );
  }
  if (chart.kind === 'week') {
    return (
      <figure className="pp-cchart" data-testid="pp-chat-chart" data-kind="week">
        <figcaption className="pp-cchart-cap">{c.weekTitle}</figcaption>
        <table className="pp-cchart-table">
          <thead><tr><th scope="col" /><th scope="col">{c.thisWeek}</th><th scope="col">{c.lastWeek}</th><th scope="col" aria-label={c.change} /></tr></thead>
          <tbody>
            {chart.rows.map((r) => {
              const diff = r.thisWeek - r.lastWeek;
              const good = r.key === 'practiceMinutes' || r.key === 'newMarks' ? diff > 0 : diff < 0;
              return (
                <tr key={r.key} data-testid="pp-chat-chart-row">
                  <th scope="row">{c.weekRow[r.key]}</th><td>{n(r.thisWeek)}</td><td>{n(r.lastWeek)}</td>
                  <td className={diff === 0 ? '' : good ? 'pp-cchart-good' : 'pp-cchart-bad'}>{diff === 0 ? '=' : `${diff > 0 ? '▲' : '▼'} ${n(Math.abs(diff))}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
