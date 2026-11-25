import React, { useEffect, useState } from 'react';
import type { RequestType } from '../api';
import { cairoDate, cairoTime, schoolApi, type AttendanceStatus, type FeeStatus, type LearnerChip, type SchoolOverview, type SchoolSection, type SchoolSource } from '../api';
import { ErrorBox, Icon, Loading, useP } from '../ui';
import { useLive } from '../useLive';
import { BusLiveCard, useBusLive } from './BusLive';

// Parents school app (a): one child's school information, read from the school's own sheets (or, later, its system).
// ENARA only shows it. Each part names its source and when it was last updated. A section the school has off is not shown.
export type SchoolView = 'today' | 'timetable' | 'attendance' | 'announcements' | 'fees' | 'buses' | 'requests' | 'consents' | 'notifications';

const STATUS_COLOR: Record<AttendanceStatus, string> = { present: 'var(--emerald)', absent: 'var(--bad)', late: 'var(--warn-dot)', excused: 'var(--sky)' };
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
  return <span className="pp-tag" style={{ color: STATUS_COLOR[status], background: 'var(--page)', border: `1px solid color-mix(in srgb, ${STATUS_COLOR[status]} 20%, transparent)` }}>{t.sch.status[status]}</span>;
};

export const School: React.FC<{ learner: LearnerChip; refreshKey: number; overview: SchoolOverview; view: SchoolView; setView: (v: SchoolView) => void; onRead: () => void; nameOf: (studentId: string) => string; onBack?: () => void; backLabel?: string }> = ({ learner, refreshKey, overview, view, setView, onRead, nameOf, onBack, backLabel }) => {
  const { t } = useP();
  const on = overview.sections;
  const views: SchoolView[] = (['today', 'timetable', 'attendance', 'buses', 'fees', 'announcements', 'consents', 'requests', 'notifications'] as const).filter((v) => v === 'today' || on[v as SchoolSection]);
  const current = views.includes(view) ? view : 'today';
  return (
    <>
      {/* Follow-up (item 6): a detail page header (back to the tab it belongs to, and the section's name); the section chips scroll. */}
      <div className="pp-dhead">
        {onBack && <button type="button" className="pp-iconbtn pp-dhead-back" onClick={onBack} aria-label={backLabel ?? t.sch.title}><Icon name="chevron" className="pp-back" /></button>}
        <div><span className="pp-meta">{t.sch.title}{learner.school ? ` · ${learner.school}` : ''}</span><h1 className="pp-h1" style={{ margin: 0 }}>{t.sch[current]}</h1></div>
      </div>
      <div className="pp-seg pp-school-seg" role="tablist" aria-label={t.sch.title}>
        {views.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={current === v} aria-pressed={current === v} data-testid={`pp-school-${v}`} onClick={() => setView(v)}>
            {t.sch[v]}
            {v === 'consents' && overview.consentsPending ? <span className="pp-badge" aria-hidden="true">{overview.consentsPending}</span> : null}
            {v === 'notifications' && overview.unreadNotifications ? <span className="pp-badge" aria-hidden="true">{overview.unreadNotifications}</span> : null}
          </button>
        ))}
      </div>
      {current === 'today' && <Today overview={overview} setView={setView} />}
      {current === 'timetable' && <Timetable learner={learner} refreshKey={refreshKey} today={overview.today} />}
      {current === 'attendance' && <Attendance learner={learner} refreshKey={refreshKey} />}
      {current === 'announcements' && <Announcements learner={learner} refreshKey={refreshKey} />}
      {current === 'requests' && <Requests learner={learner} refreshKey={refreshKey} />}
      {current === 'consents' && <Consents learner={learner} refreshKey={refreshKey} onChanged={onRead} />}
      {current === 'buses' && <Bus learner={learner} refreshKey={refreshKey} />}
      {current === 'fees' && <Fees learner={learner} refreshKey={refreshKey} />}
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
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.attendanceToday}</p><Icon name="chevron" flip style={{ color: 'var(--muted)' }} /></div>
          {o.attendanceToday ? <StatusTag status={o.attendanceToday} /> : <p className="pp-sub">{t.sch.notRecorded}</p>}
        </button>
      )}
      {o.sections.timetable && (
        <button type="button" className="pp-card pp-card--link" onClick={() => setView('timetable')} data-testid="pp-school-today-classes">
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.todayClasses}</p><Icon name="chevron" flip style={{ color: 'var(--muted)' }} /></div>
          {o.todayClasses?.length ? (
            <ul className="pp-school-list">{o.todayClasses.map((c) => <li key={c.period}><span className="pp-num">{n(c.start)}–{n(c.end)}</span><b dir="auto">{c.subject}</b></li>)}</ul>
          ) : <p className="pp-sub">{t.sch.noClassesToday}</p>}
        </button>
      )}
      {o.sections.announcements && (
        <button type="button" className="pp-card pp-card--link" onClick={() => setView('announcements')}>
          <div className="pp-row"><p className="pp-eyebrow">{t.sch.announcements}</p><Icon name="chevron" flip style={{ color: 'var(--muted)' }} /></div>
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
          <div className="pp-att-tiles" aria-hidden="true">
            {(['present', 'absent', 'late', 'excused'] as const).map((k) => <div key={k} className={`pp-att-tile pp-att-tile--${k}`}><b>{n(q.data!.counts[k])}</b><span>{t.sch.status[k]}</span></div>)}
          </div>
          <p className="pp-sub sr" data-testid="pp-att-counts">{t.sch.counts(n(q.data.counts.present), n(q.data.counts.absent), n(q.data.counts.late), n(q.data.counts.excused))}</p>
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
            <div className="pp-row pp-row--top"><span className="pp-ico pp-ico--info pp-ico--sm" aria-hidden="true"><Icon name="megaphone" /></span><h2 className="pp-h2" dir="auto" style={{ flex: 1 }}>{title}</h2><span className="pp-tag pp-tag--sky">{aud[a.audience] ?? a.audience}</span></div>
            <p className="pp-meta">{cairoDate(a.publishAt.slice(0, 10), lang)}{a.expiresAt ? ` · ${t.sch.until(cairoDate(a.expiresAt.slice(0, 10), lang))}` : ''}</p>
            <p dir="auto" style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>{body}</p>
          </article>
        );
      }) : <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noAnnouncements}</p>}
      <Source source={q.data.source} />
    </>
  );
};

const NOTE_ICON: Record<string, string> = { absence: 'alert', late: 'nudge', announcement: 'megaphone', fee_due: 'coin', bus_notice: 'bus', request_update: 'inbox', consent: 'pen' };
const NOTE_TONE: Record<string, string> = { absence: 'bad', late: 'warn', announcement: 'info', fee_due: 'warn', bus_notice: 'sun', request_update: 'info', consent: 'warn' };

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
              <span className={`pp-ico pp-ico--sm pp-ico--${NOTE_TONE[x.kind] ?? 'info'}${x.read ? ' pp-ico--read' : ''}`} aria-hidden="true"><Icon name={NOTE_ICON[x.kind] ?? 'bell'} /></span>
              <p>
                <b dir="auto" style={{ fontWeight: x.read ? 500 : 700 }}>{t.sch.kind[x.kind] ?? x.kind} · {nameOf(x.studentId)}</b>
                {x.kind === 'fee_due' || x.kind === 'bus_notice' || x.kind === 'request_update' || x.kind === 'consent' ? (
                  <span style={{ display: 'block' }} dir="auto">{x.title}</span>
                ) : x.kind !== 'announcement' && x.date ? (
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


const FEE_COLOR: Record<FeeStatus, string> = { paid: 'var(--emerald)', due: 'var(--sky)', overdue: 'var(--bad)', waived: 'var(--muted)' };
const money = (a: number, n: (x: number | string) => string) => n(a.toLocaleString('en-US', { maximumFractionDigits: 2 }));

/** Step (b): fees, display only. The school records payments; ENARA never takes money. */
const Fees: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, n, lang } = useP();
  const q = useLive(() => schoolApi.fees(learner.studentId), [learner.studentId], refreshKey);
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : q.error.status === 403 ? <p className="pp-notice" data-testid="pp-fees-main-only">{t.sch.feesMainOnly}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const f = q.data;
  const stat = (label: string, v: number, color?: string, id?: string) => (
    <div style={{ flex: '1 1 40%', minInlineSize: 0 }}><p className="pp-meta">{label}</p><p style={{ fontSize: 18, fontWeight: 700, color }} className="pp-num" data-testid={id}>{t.sch.egp(money(v, n))}</p></div>
  );
  return (
    <>
      <p className="pp-notice" style={{ display: 'block', fontSize: 13 }} data-testid="pp-fees-pay-at-school">{t.sch.payAtSchool}</p>
      {!f.plans.length ? <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noFees}</p> : (
        <>
          <section className="pp-card" aria-label={t.sch.fees} data-testid="pp-fees-totals">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {stat(t.sch.feeTotal, f.totals.total)}
              {stat(t.sch.feePaid, f.totals.paid, 'var(--emerald)', 'pp-fees-paid')}
              {stat(t.sch.feeRemaining, f.totals.remaining, undefined, 'pp-fees-remaining')}
              {f.totals.overdue > 0 && stat(t.sch.feeOverdue, f.totals.overdue, 'var(--bad)', 'pp-fees-overdue')}
            </div>
            {f.totals.total > 0 && (
              <div className="pp-feebar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((f.totals.paid / f.totals.total) * 100)} aria-label={t.sch.feePaid}>
                <i style={{ inlineSize: `${Math.min(100, (f.totals.paid / f.totals.total) * 100)}%` }} />
                {f.totals.overdue > 0 && <i className="pp-feebar-over" style={{ inlineSize: `${Math.min(100, (f.totals.overdue / f.totals.total) * 100)}%` }} />}
              </div>
            )}
            {f.next && <p className="pp-sub">{t.sch.feeNext}: {t.sch.instalment(n(f.next.number))} · {t.sch.egp(money(f.next.amount, n))} · {t.sch.dueOn(cairoDate(f.next.dueDate, lang))}</p>}
          </section>
          {f.plans.map((p) => (
            <section key={p.name} className="pp-card pp-card--flush" aria-label={p.name} data-testid="pp-fee-plan">
              <h2 className="pp-h2" style={{ padding: '14px 16px 4px' }} dir="auto">{p.name}{p.academicYear ? <span className="pp-meta"> · {p.academicYear}</span> : null}</h2>
              {p.instalments.map((i) => (
                <div className="pp-list-row" key={i.id} data-testid="pp-instalment" data-status={i.status}>
                  <p>
                    <b>{t.sch.instalment(n(i.number))} · {t.sch.egp(money(i.amount, n))}</b>
                    <span className="pp-meta" style={{ display: 'block' }}>{i.status === 'paid' && i.paidDate ? t.sch.paidOn(cairoDate(i.paidDate, lang)) : t.sch.dueOn(cairoDate(i.dueDate, lang))}{i.receiptRef ? ` · ${t.sch.receipt(i.receiptRef)}` : ''}</span>
                    {i.hasReceipt && <button type="button" className="pp-linkbtn" data-testid="pp-receipt" onClick={() => { schoolApi.receipt(learner.studentId, i.id).catch(() => window.alert(t.sch.receiptFailed)); }}>{t.sch.downloadReceipt}</button>}
                  </p>
                  <span className="pp-tag" style={{ color: FEE_COLOR[i.status], background: 'var(--page)', border: `1px solid color-mix(in srgb, ${FEE_COLOR[i.status]} 20%, transparent)` }}>{t.sch.feeStatus[i.status]}</span>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      <Source source={f.source} />
    </>
  );
};

/** Step (c): the child's bus today, by trip. Stop times from the school's sheet; no live tracking. */
const Bus: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, n } = useP();
  const q = useLive(() => schoolApi.bus(learner.studentId), [learner.studentId], refreshKey);
  const live = useBusLive(learner, true);
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  return (
    <>
      <BusLiveCard learner={learner} live={live} />
      {!q.data.trips.length ? <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noBus}</p> : q.data.trips.map((tr) => (
        <section key={tr.direction} className="pp-card pp-bustrip" aria-labelledby={`pp-bus-${tr.direction}`} data-testid={`pp-bus-${tr.direction}`}>
          <div className="pp-row">
            <h2 className="pp-h2 pp-row" id={`pp-bus-${tr.direction}`} style={{ gap: 10, justifyContent: 'flex-start' }}><span className="pp-ico pp-ico--sun"><Icon name="bus" /></span>{t.sch[tr.direction]}</h2>
            <span className="pp-meta" dir="auto">{tr.route}{tr.busNumber ? ` · ${t.sch.busNumber(tr.busNumber)}` : ''}</span>
          </div>
          {tr.notices.map((nt, i) => (
            <p key={i} className={`pp-bus-status ${nt.kind === 'cancel' ? 'pp-bus-status--bad' : 'pp-bus-status--late'}`} role="alert" data-testid="pp-bus-notice" style={{ margin: 0 }}>
              <span className="pp-pulse" aria-hidden="true" />
              <span><b>{nt.kind === 'cancel' ? t.sch.cancelled : t.sch.delay(n(nt.minutes ?? 0))}</b>{nt.message ? <span dir="auto"> · {nt.message}</span> : null}</span>
            </p>
          ))}
          <div className="pp-row" style={{ fontSize: 15 }}>
            <span>{t.sch.yourStop}: <b dir="auto">{tr.stop}</b></span>
            <b className="pp-num" style={{ fontSize: 20 }} data-testid="pp-bus-time">{tr.time ? n(tr.time) : '—'}</b>
          </div>
          {(() => { const d = tr.notices.find((x) => x.kind === 'delay' && x.minutes); if (!d || !tr.time) return null; const [h, m] = tr.time.split(':').map(Number); const tot = h * 60 + m + (d.minutes ?? 0); const exp = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`; return <p className="pp-bus-expected" data-testid="pp-bus-expected">{t.ui.expected(n(exp))}</p>; })()}
          {tr.mapLink && <a href={tr.mapLink} target="_blank" rel="noopener noreferrer" className="pp-linkbtn">{t.sch.mapLink}</a>}
          {(tr.supervisor || tr.driver) && (
            <p className="pp-sub" dir="auto">
              {tr.supervisor ? `${t.sch.supervisor}: ${tr.supervisor}` : ''}{tr.supervisor && tr.driver ? ' · ' : ''}{tr.driver ? `${t.sch.driver}: ${tr.driver}` : ''}
            </p>
          )}
          {tr.supervisorPhone && <a className="pp-btn" href={`tel:${tr.supervisorPhone}`} data-testid="pp-bus-call"><span dir="ltr">{tr.supervisorPhone}</span> · {t.sch.callSupervisor(tr.supervisor ?? '')}</a>}
          <button type="button" className="pp-linkbtn" aria-expanded={open === tr.direction} onClick={() => setOpen(open === tr.direction ? null : tr.direction)}>{t.sch.allStops}</button>
          {open === tr.direction && (
            <ol className="pp-school-list" data-testid="pp-bus-stops">
              {tr.stops.map((s) => <li key={s.name} style={s.mine ? { fontWeight: 700 } : undefined}><span className="pp-num">{s.time ? n(s.time) : '—'}</span><span dir="auto">{s.name}</span></li>)}
            </ol>
          )}
        </section>
      ))}
      <p className="pp-sub">{t.sch.noGps}</p>
      <Source source={q.data.source} />
    </>
  );
};

const REQ_COLOR: Record<string, string> = { new: 'var(--sky)', in_progress: 'var(--warn-dot)', done: 'var(--emerald)', refused: 'var(--bad)' };

/** Step (d): requests to the school office. Sent only by a main or full guardian; the school answers here. */
const Requests: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, lang } = useP();
  const [bump, setBump] = useState(0);
  const q = useLive(() => schoolApi.requests(learner.studentId), [learner.studentId, bump], refreshKey);
  const [f, setF] = useState<{ type: RequestType; details: string; preferredDate: string }>({ type: 'certificate', details: '', preferredDate: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setState('sending');
    try { await schoolApi.createRequest(learner.studentId, { type: f.type, details: f.details, ...(f.preferredDate ? { preferredDate: f.preferredDate } : {}) }); setState('sent'); setF({ ...f, details: '', preferredDate: '' }); setBump((b) => b + 1); }
    catch (x) { setState('error'); setErr((x as { message?: string })?.message || t.error); }
  };
  return (
    <>
      {q.data.canCreate ? (
        <form className="pp-card" onSubmit={send} data-testid="pp-request-form">
          <h2 className="pp-h2">{t.sch.newRequest}</h2>
          <label className="pp-field">{t.sch.reqTypeLabel}
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as RequestType })} data-testid="pp-request-type">
              {q.data.types.map((k) => <option key={k} value={k}>{t.sch.reqType[k]}</option>)}
            </select>
          </label>
          <label className="pp-field">{t.sch.reqDetails}
            <textarea rows={3} dir="auto" maxLength={2000} required minLength={3} placeholder={t.sch.reqDetailsPh} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} data-testid="pp-request-details" />
          </label>
          <label className="pp-field">{t.sch.reqDate}<input type="date" value={f.preferredDate} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} /></label>
          <button type="submit" className="pp-btn pp-btn--primary pp-btn--block" disabled={state === 'sending'} data-testid="pp-request-send">{t.sch.send}</button>
          {state === 'sent' && <p className="pp-sub" role="status" data-testid="pp-request-sent">{t.sch.sent}</p>}
          {state === 'error' && <p className="pp-error" role="alert">{err}</p>}
        </form>
      ) : <p className="pp-notice" style={{ display: 'block', fontSize: 13 }}>{t.sch.viewOnlyNote}</p>}
      {q.data.requests.length ? q.data.requests.map((r) => (
        <article key={r.id} className="pp-card" data-testid="pp-request" data-status={r.status}>
          <div className="pp-row pp-row--top">
            <h2 className="pp-h2">{t.sch.reqType[r.type] ?? r.type}</h2>
            <span className="pp-tag" style={{ color: REQ_COLOR[r.status], background: 'var(--page)', border: `1px solid color-mix(in srgb, ${REQ_COLOR[r.status]} 20%, transparent)` }}>{t.sch.reqStatus[r.status] ?? r.status}</span>
          </div>
          <p className="pp-meta">{cairoDate(r.createdAt.slice(0, 10), lang)}{r.preferredDate ? ` · ${cairoDate(r.preferredDate, lang)}` : ''}</p>
          <p dir="auto" style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{r.details}</p>
          {r.reply && <div className="pp-notice" style={{ display: 'block' }}><b style={{ display: 'block', fontSize: 13 }}>{t.sch.schoolReply}</b><span dir="auto" style={{ fontSize: 14 }} data-testid="pp-request-reply">{r.reply}</span></div>}
        </article>
      )) : <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noRequests}</p>}
    </>
  );
};

/** Step (d): consent forms. The parent reads the text, picks a choice, ticks "I confirm" and sends; the record keeps the exact text. */
const Consents: React.FC<{ learner: LearnerChip; refreshKey: number; onChanged: () => void }> = ({ learner, refreshKey, onChanged }) => {
  const { t, lang } = useP();
  const [bump, setBump] = useState(0);
  const q = useLive(() => schoolApi.consents(learner.studentId), [learner.studentId, bump], refreshKey);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  if (!q.data) return q.error ? (q.error.status === 404 ? <p className="pp-notice">{t.sch.off}</p> : <ErrorBox onRetry={q.reload} />) : <Loading />;
  const when = (iso: string) => `${cairoDate(iso.slice(0, 10), lang)} · ${cairoTime(iso, lang)}`;
  const sign = async (formId: string, textHash: string) => {
    setErr({ ...err, [formId]: '' });
    try { await schoolApi.signConsent(learner.studentId, formId, { choice: pick[formId], agree: true, textHash }); setEditing({ ...editing, [formId]: false }); setBump((b) => b + 1); onChanged(); }
    catch (x) { setErr({ ...err, [formId]: (x as { message?: string })?.message || t.error }); }
  };
  if (!q.data.forms.length) return <p className="pp-notice" style={{ display: 'block' }}>{t.sch.noForms}</p>;
  return (
    <>
      {!q.data.canSign && <p className="pp-notice" style={{ display: 'block', fontSize: 13 }}>{t.sch.viewOnlyNote}</p>}
      {q.data.forms.map((f) => {
        const label = (key: string) => { const o = f.options.find((x) => x.key === key); return o ? (lang === 'ar' && o.labelAr) || o.label : key; };
        const showForm = q.data!.canSign && f.open && (!f.answer || editing[f.id] || !f.answer.sameText);
        return (
          <article key={f.id} className="pp-card" data-testid="pp-consent" data-answered={f.answer ? '1' : '0'}>
            <div className="pp-row pp-row--top"><h2 className="pp-h2" dir="auto">{(lang === 'ar' && f.titleAr) || f.title}</h2><span className="pp-meta">{f.open ? t.sch.deadline(cairoDate(f.deadline, lang)) : t.sch.closed}</span></div>
            <p dir="auto" style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>{(lang === 'ar' && f.bodyAr) || f.body}</p>
            {f.answer && !f.answer.sameText && <p className="pp-error" role="note">{t.sch.textChanged}</p>}
            {f.answer && <p className="pp-sub" data-testid="pp-consent-answer"><b>{(f.answer.byYou ? t.sch.yourAnswer : t.sch.otherGuardian)(label(f.answer.choice), when(f.answer.at))}</b></p>}
            {showForm ? (
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {f.options.map((o) => (
                  <label key={o.key} className="pp-row" style={{ justifyContent: 'flex-start', gap: 10, minBlockSize: 44, fontSize: 15 }}>
                    <input type="radio" name={`c-${f.id}`} checked={pick[f.id] === o.key} onChange={() => setPick({ ...pick, [f.id]: o.key })} data-testid={`pp-consent-option-${o.key}`} />{(lang === 'ar' && o.labelAr) || o.label}
                  </label>
                ))}
                <label className="pp-row" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!!ok[f.id]} onChange={(e) => setOk({ ...ok, [f.id]: e.target.checked })} data-testid="pp-consent-confirm" style={{ marginBlockStart: 3 }} />{t.sch.iConfirm}
                </label>
                <button type="button" className="pp-btn pp-btn--primary pp-btn--block" disabled={!pick[f.id] || !ok[f.id]} onClick={() => void sign(f.id, f.textHash)} data-testid="pp-consent-sign">{t.sch.signBtn}</button>
                <p className="pp-meta">{t.sch.signedAt}</p>
                {err[f.id] && <p className="pp-error" role="alert">{err[f.id]}</p>}
              </fieldset>
            ) : f.answer && f.open && q.data!.canSign ? <button type="button" className="pp-linkbtn" onClick={() => setEditing({ ...editing, [f.id]: true })}>{t.sch.changeAnswer}</button> : null}
          </article>
        );
      })}
    </>
  );
};
