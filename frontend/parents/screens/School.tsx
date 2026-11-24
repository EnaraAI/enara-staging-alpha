import React, { useEffect, useState } from 'react';
import { cairoDate, cairoTime, schoolApi, type AttendanceStatus, type LearnerChip, type SchoolOverview, type SchoolSection, type SchoolSource } from '../api';
import { ErrorBox, Icon, Loading, useP } from '../ui';
import { useLive } from '../useLive';

// Parents school app (a): one child's school information, read from the school's own sheets (or, later, its system).
// ENARA only shows it. Each part names its source and when it was last updated. A section the school has off is not shown.
export type SchoolView = 'today' | 'timetable' | 'attendance' | 'announcements' | 'notifications';

const STATUS_COLOR: Record<AttendanceStatus, string> = { present: '#047857', absent: '#b42318', late: '#db7706', excused: '#075985' };
const cairoMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 15)); return d.toISOString().slice(0, 7); };

const Source: React.FC<{ source: SchoolSource }> = ({ source }) => {
  const { t, lang } = useP();
  const label = t.sch.srcLabel[source.label] ?? source.label;
  const when = source.updatedAt ? `${cairoDate(source.updatedAt.slice(0, 10), lang)} · ${cairoTime(source.updatedAt, lang)}` : null;
  return <p className="pp-meta" data-testid="pp-school-source">{when ? t.sch.source(label, when) : t.sch.sourceNone(label)}</p>;
};

const StatusTag: React.FC<{ status: AttendanceStatus }> = ({ status }) => {
  const { t } = useP();
  return <span className="pp-tag" style={{ color: STATUS_COLOR[status], background: '#f6f7fa', border: `1px solid ${STATUS_COLOR[status]}33` }}>{t.sch.status[status]}</span>;
};

export const School: React.FC<{ learner: LearnerChip; refreshKey: number; overview: SchoolOverview; view: SchoolView; setView: (v: SchoolView) => void; onRead: () => void; nameOf: (studentId: string) => string }> = ({ learner, refreshKey, overview, view, setView, onRead, nameOf }) => {
  const { t } = useP();
  const on = overview.sections;
  const views: SchoolView[] = (['today', 'timetable', 'attendance', 'announcements', 'notifications'] as const).filter((v) => v === 'today' || on[v as SchoolSection]);
  const current = views.includes(view) ? view : 'today';
  return (
    <>
      <h1 className="pp-h1">{t.sch.title}</h1>
      <div className="pp-seg pp-school-seg" role="tablist" aria-label={t.sch.title}>
        {views.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={current === v} aria-pressed={current === v} data-testid={`pp-school-${v}`} onClick={() => setView(v)}>
            {t.sch[v]}
            {v === 'notifications' && overview.unreadNotifications ? <span className="pp-badge" aria-hidden="true">{overview.unreadNotifications}</span> : null}
          </button>
        ))}
      </div>
      {current === 'today' && <Today overview={overview} setView={setView} />}
      {current === 'timetable' && <Timetable learner={learner} refreshKey={refreshKey} today={overview.today} />}
      {current === 'attendance' && <Attendance learner={learner} refreshKey={refreshKey} />}
      {current === 'announcements' && <Announcements learner={learner} refreshKey={refreshKey} />}
      {current === 'notifications' && <Notifications refreshKey={refreshKey} onRead={onRead} nameOf={nameOf} />}
      <p className="pp-sub" style={{ marginBlockStart: 4 }}>{t.sch.displayOnly}</p>
    </>
  );
};

const Today: React.FC<{ overview: SchoolOverview; setView: (v: SchoolView) => void }> = ({ overview: o, setView }) => {
  const { t, n } = useP();
  return (
    <>
      {o.sections.attendance && (
        <button type="button" className="pp-card pp-card--link" onClick={() => setView('attendance')} data-testid="pp-school-today-attendance">
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.attendanceToday}</p><Icon name="chevron" flip style={{ color: '#566376' }} /></div>
          {o.attendanceToday ? <StatusTag status={o.attendanceToday} /> : <p className="pp-sub">{t.sch.notRecorded}</p>}
        </button>
      )}
      {o.sections.timetable && (
        <button type="button" className="pp-card pp-card--link" onClick={() => setView('timetable')} data-testid="pp-school-today-classes">
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.todayClasses}</p><Icon name="chevron" flip style={{ color: '#566376' }} /></div>
          {o.todayClasses?.length ? (
            <ul className="pp-school-list">{o.todayClasses.map((c) => <li key={c.period}><span className="pp-num">{n(c.start)}–{n(c.end)}</span><b dir="auto">{c.subject}</b></li>)}</ul>
          ) : <p className="pp-sub">{t.sch.noClassesToday}</p>}
        </button>
      )}
      {o.sections.announcements && (
        <button type="button" className="pp-card pp-card--link" onClick={() => setView('announcements')}>
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.announcements}</p><Icon name="chevron" flip style={{ color: '#566376' }} /></div>
          <p className="pp-sub">{o.announcementsCount ? t.sch.newAnnouncements(n(o.announcementsCount)) : t.sch.noAnnouncements}</p>
        </button>
      )}
    </>
  );
};

const Timetable: React.FC<{ learner: LearnerChip; refreshKey: number; today: string }> = ({ learner, refreshKey, today }) => {
  const { t, n } = useP();
  const q = useLive(() => schoolApi.timetable(learner.studentId), [learner.studentId], refreshKey);
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const todayIdx = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (!q.data.days.length) return <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noTimetable}</p>;
  return (
    <>
      {q.data.group && <p className="pp-sub">{t.sch.group(q.data.group)}</p>}
      {q.data.days.map((d) => (
        <section key={d.day} className={`pp-card pp-card--flush${d.day === todayIdx ? ' pp-school-today' : ''}`} aria-labelledby={`pp-tt-${d.day}`} data-testid={`pp-tt-day-${d.day}`}>
          <h2 className="pp-h2" id={`pp-tt-${d.day}`} style={{ padding: '14px 16px 4px' }}>{t.weekdaysLong[d.day]}{d.day === todayIdx ? <span className="pp-tag pp-tag--sky" style={{ marginInlineStart: 8 }}>{t.sch.today}</span> : null}</h2>
          {d.periods.map((p) => (
            <div className="pp-list-row" key={p.period}>
              <span className="pp-num pp-meta" style={{ minInlineSize: 84 }}>{n(p.start)}–{n(p.end)}</span>
              <p><b dir="auto">{p.subject}</b>{(p.teacher || p.room) && <span className="pp-meta" style={{ display: 'block' }} dir="auto">{[p.teacher, p.room ? `${t.sch.room} ${p.room}` : null].filter(Boolean).join(' · ')}</span>}</p>
            </div>
          ))}
        </section>
      ))}
      <Source source={q.data.source} />
    </>
  );
};

const Attendance: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, n, lang } = useP();
  const [month, setMonth] = useState(cairoMonth);
  useEffect(() => { setMonth(cairoMonth()); }, [learner.studentId]);
  const q = useLive(() => schoolApi.attendance(learner.studentId, month), [learner.studentId, month], refreshKey);
  const label = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));
  const atNow = month >= cairoMonth();
  return (
    <>
      <div className="pp-row pp-card" style={{ padding: '8px 12px' }}>
        <button type="button" className="pp-iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t.sch.prevMonth}><Icon name="chevron" flip={lang !== 'ar'} /></button>
        <b aria-live="polite" data-testid="pp-att-month">{label}</b>
        <button type="button" className="pp-iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={atNow} aria-label={t.sch.nextMonth}><Icon name="chevron" flip={lang === 'ar'} /></button>
      </div>
      {!q.data ? (q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />) : (
        <>
          <p className="pp-sub" data-testid="pp-att-counts">{t.sch.counts(n(q.data.counts.present), n(q.data.counts.absent), n(q.data.counts.late), n(q.data.counts.excused))}</p>
          {q.data.records.length ? (
            <section className="pp-card pp-card--flush">
              {q.data.records.map((r, i) => (
                <div className="pp-list-row" key={`${r.date}-${r.period ?? 0}-${i}`} data-testid="pp-att-row">
                  <span className="pp-meta" style={{ minInlineSize: 96 }}>{cairoDate(r.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <p>{r.period != null ? <span className="pp-meta">{t.sch.period(n(r.period))} </span> : null}{r.note ? <span className="pp-meta" dir="auto" style={{ display: 'block' }}>{r.note}</span> : null}</p>
                  <StatusTag status={r.status} />
                </div>
              ))}
            </section>
          ) : <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noAttendance}</p>}
          <Source source={q.data.source} />
        </>
      )}
    </>
  );
};

const Announcements: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, lang } = useP();
  const q = useLive(() => schoolApi.announcements(learner.studentId), [learner.studentId], refreshKey);
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const aud: Record<string, string> = { school: t.sch.forAll, grade: t.sch.forGrade, group: t.sch.forGroup, student: t.sch.forStudent };
  return (
    <>
      {q.data.announcements.length ? q.data.announcements.map((a) => {
        const title = (lang === 'ar' && a.titleAr) || a.title;
        const body = (lang === 'ar' && a.bodyAr) || a.body;
        return (
          <article key={a.id} className="pp-card" data-testid="pp-announcement">
            <div className="pp-row pp-row--top"><h2 className="pp-h2" dir="auto">{title}</h2><span className="pp-tag pp-tag--sky">{aud[a.audience] ?? a.audience}</span></div>
            <p className="pp-meta">{cairoDate(a.publishAt.slice(0, 10), lang)}{a.expiresAt ? ` · ${t.sch.until(cairoDate(a.expiresAt.slice(0, 10), lang))}` : ''}</p>
            <p dir="auto" style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>{body}</p>
          </article>
        );
      }) : <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noAnnouncements}</p>}
      <Source source={q.data.source} />
    </>
  );
};

const Notifications: React.FC<{ refreshKey: number; onRead: () => void; nameOf: (studentId: string) => string }> = ({ refreshKey, onRead, nameOf }) => {
  const { t, n, lang } = useP();
  const [bump, setBump] = useState(0);
  const q = useLive(() => schoolApi.notifications(), [bump], refreshKey);
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const markAll = async () => { await schoolApi.markRead(); setBump((b) => b + 1); onRead(); };
  return (
    <>
      <div className="pp-row">
        <p className="pp-sub" data-testid="pp-notif-unread">{t.sch.unread(n(q.data.unread))}</p>
        {q.data.unread > 0 && <button type="button" className="pp-btn" onClick={markAll} data-testid="pp-notif-markall">{t.sch.markAllRead}</button>}
      </div>
      {q.data.notifications.length ? (
        <section className="pp-card pp-card--flush">
          {q.data.notifications.map((x) => (
            <div className="pp-list-row" key={x.id} data-testid="pp-notification" data-read={x.read ? '1' : '0'}>
              <span className="pp-dot" style={{ background: x.read ? 'transparent' : x.kind === 'absence' ? '#b42318' : x.kind === 'late' ? '#db7706' : '#2f6bff' }} aria-hidden="true" />
              <p>
                <b dir="auto" style={{ fontWeight: x.read ? 500 : 700 }}>{t.sch.kind[x.kind] ?? x.kind} · {nameOf(x.studentId)}</b>
                {x.kind !== 'announcement' && x.date ? (
                  <>
                    <span style={{ display: 'block' }}>{(x.kind === 'late' ? t.sch.wasLate : t.sch.wasAbsent)(nameOf(x.studentId), cairoDate(x.date, lang, { weekday: 'long', day: 'numeric', month: 'short' }))}</span>
                    <span className="pp-meta" style={{ display: 'block' }}>{t.sch.fromRegister}</span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'block' }} dir="auto">{x.title}</span>
                    {x.body ? <span className="pp-meta" style={{ display: 'block' }} dir="auto">{x.body}</span> : null}
                  </>
                )}
              </p>
              <span className="pp-meta">{cairoDate(x.createdAt.slice(0, 10), lang)}</span>
            </div>
          ))}
        </section>
      ) : <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noNotifications}</p>}
    </>
  );
};

/** The school card on Home: today's attendance, the next class, announcements and unread notifications. Hidden when every section is off. */
export const SchoolHomeCard: React.FC<{ overview: SchoolOverview; open: (v: SchoolView) => void }> = ({ overview: o, open }) => {
  const { t, n } = useP();
  const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const next = o.todayClasses?.find((c) => c.end > nowHm) ?? null;
  return (
    <section className="pp-card pp-card--flush" aria-labelledby="pp-school-home" data-testid="pp-school-home">
      <h2 className="pp-h2" id="pp-school-home" style={{ padding: '14px 16px 4px' }}><Icon name="school" style={{ verticalAlign: 'middle', marginInlineEnd: 6, color: '#0b203c' }} />{t.sch.title}</h2>
      {o.sections.attendance && (
        <button type="button" className="pp-list-row pp-card--link" style={{ border: 0, background: 'none' }} onClick={() => open('attendance')}>
          <p>{t.sch.attendanceToday}</p>{o.attendanceToday ? <StatusTag status={o.attendanceToday} /> : <span className="pp-meta">{t.sch.notRecorded}</span>}
        </button>
      )}
      {o.sections.timetable && (
        <button type="button" className="pp-list-row pp-card--link" style={{ border: 0, background: 'none' }} onClick={() => open('timetable')}>
          <p>{t.sch.todayClasses}</p><span className="pp-meta" dir="auto">{next ? `${n(next.start)} · ${next.subject}` : t.sch.noClassesToday}</span>
        </button>
      )}
      {o.sections.announcements && (
        <button type="button" className="pp-list-row pp-card--link" style={{ border: 0, background: 'none' }} onClick={() => open('announcements')}>
          <p>{t.sch.announcements}</p><span className="pp-meta">{o.announcementsCount ? n(o.announcementsCount) : t.noAlerts}</span>
        </button>
      )}
      {o.sections.notifications && (
        <button type="button" className="pp-list-row pp-card--link" style={{ border: 0, background: 'none' }} onClick={() => open('notifications')}>
          <p>{t.sch.notifications}</p>{o.unreadNotifications ? <span className="pp-badge">{n(o.unreadNotifications)}</span> : <span className="pp-meta">{t.noAlerts}</span>}
        </button>
      )}
    </section>
  );
};
