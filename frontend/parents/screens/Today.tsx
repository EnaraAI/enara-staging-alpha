import React from 'react';
import { cairoDate, schoolApi, weekdayIndex, type SubjectCard, type LearnerChip, type SchoolOverview, type WeeklyStatus } from '../api';
import { Icon, useP } from '../ui';
import { bi } from '../i18n';
import { useLive } from '../useLive';
import type { SchoolView } from './School';
import { BusLiveCard } from './BusLive';
import type { BusLive as BusLiveData } from '../api';
import { actionsCount } from './Actions';

// Redesign step 2: the parts of the Today tab. Motion is CSS only (rings fill, the bus status dot pulses, the hero's sparks drift). No moving bus on a map: the app has no live bus position
// and stops when the phone asks for reduced motion. Graphics are inline SVG: nothing extra to download.

/** Fixed weekly targets for the lessons and days rings (owner decision, 25 Nov 2026). Minutes use the child's own weekly goal. */
export const LESSONS_TARGET = 6;
export const DAYS_TARGET = 5;

const nowHm = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

const HeroRing: React.FC<{ done: number; goal: number; color: string; label: string; of: string }> = ({ done, goal, color, label, of }) => {
  const { t, n } = useP();
  const pct = goal ? Math.min(1, done / goal) : 0;
  const c = 2 * Math.PI * 22;
  return (
    <div className="pp-hr" role="img" aria-label={t.ui.ringAria(label, n(done), n(goal))}>
      <span className="pp-hr-ring">
        <svg viewBox="0 0 54 54" aria-hidden="true">
          <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="6" />
          <circle className="pp-ringfill" cx="27" cy="27" r="22" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 27 27)" />
        </svg>
        <b>{n(done)}</b>
      </span>
      <span className="pp-hr-tx"><b>{of}</b><small>{label}</small></span>
    </div>
  );
};

/** The navy hero: this week's status in words, three rings and the Sat–Fri dots. */
export const Hero: React.FC<{ learner: LearnerChip; status: WeeklyStatus; lessons: number }> = ({ learner, status: s, lessons }) => {
  const { t, n } = useP();
  const practised = s.days.filter((d) => d.practised).length;
  const icon = s.status === 'on_track' ? 'ontrack' : s.status === 'needs_nudge' ? 'nudge' : 'alert';
  return (
    <section className={`pp-hero pp-hero--${s.status}`} aria-labelledby="pp-hero-h" data-testid="pp-hero">
      <svg className="pp-hero-art" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
        <circle className="pp-drift" cx="168" cy="22" r="42" fill="rgba(245,165,36,.16)" />
        <circle className="pp-drift2" cx="186" cy="96" r="26" fill="rgba(122,156,255,.14)" />
        <path className="pp-twinkle" d="M150 18l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#FFD58A" />
        <path className="pp-twinkle pp-twinkle--late" d="M182 54l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#fff" />
      </svg>
      <div className="pp-hero-top">
        <span className="pp-hero-eyebrow">{t.ui.weekOf(learner.firstName)}</span>
        <span className="pp-hero-status"><Icon name={icon} />{t.status[s.status]}</span>
      </div>
      <h2 id="pp-hero-h">{t.ui.practisedDays(learner.firstName, n(practised), n(DAYS_TARGET))}</h2>
      <p>{t.reason(s.reason.code, s.reason.params, (x) => n(x))}</p>
      <div className="pp-hrings">
        <HeroRing done={s.minutesDone} goal={s.goalMinutes} color="#F5A524" label={t.ui.ringPractice} of={t.ui.ofMin(n(s.goalMinutes))} />
        <HeroRing done={lessons} goal={LESSONS_TARGET} color="#7A9CFF" label={t.ui.ringLessons} of={t.ui.ofLessons(n(LESSONS_TARGET))} />
        <HeroRing done={practised} goal={DAYS_TARGET} color="#5FD4A0" label={t.ui.ringDays} of={t.ui.ofDays(n(DAYS_TARGET))} />
      </div>
      <ul className="pp-hdays" aria-label={t.thisWeek}>
        {s.days.map((d) => {
          const wd = weekdayIndex(d.day);
          const state = d.practised ? 'practised' : d.isToday ? 'today' : d.isFuture ? 'upcoming' : 'missed';
          return (
            <li key={d.day} className={`pp-hday pp-hday--${state}`}>
              <span className="pp-hday-dot">{d.practised && <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}</span>
              <span aria-hidden="true">{t.weekdays[wd]}</span>
              <span className="sr">{`${t.weekdaysLong[wd]}: ${t.dayState[state]}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** "2 things need you": consents and overdue fees, across the school's sections. Opens Actions. */
export const NeedsYou: React.FC<{ overview: SchoolOverview | null; onOpen: () => void }> = ({ overview: o, onOpen }) => {
  const { t, n, lang } = useP();
  const count = actionsCount(o);
  if (!o || !count) return null;
  const items = [
    o.sections.consents && o.consentsPending ? t.ui.consentItem(n(o.consentsPending)) : null,
    o.sections.fees && o.fees?.overdueCount ? t.ui.feeItem(n(o.fees.overdueCount)) : null,
  ].filter(Boolean);
  return (
    <button type="button" className="pp-needs" onClick={onOpen} data-testid="pp-needs-you">
      <span className="pp-needs-n">{n(count)}</span>
      <span className="pp-needs-tx"><b>{t.ui.needsYou(count, n(count))}</b><span>{items.join(lang === 'ar' ? '، ' : ' · ')}</span></span>
      <Icon name="chevron" flip />
    </button>
  );
};

/** "On the way": today's bus trips from the school's bus sheet, with a late or cancelled notice. Not live GPS. */
export const BusCard: React.FC<{ overview: SchoolOverview | null; open: (v: SchoolView) => void; learner?: LearnerChip; live?: BusLiveData | null }> = ({ overview: o, open, learner, live }) => {
  const { t, n } = useP();
  if (!o?.sections.buses || !o.bus?.trips.length) return null;
  const liveTrip = learner && live?.on && live.trips.length ? live : null;
  const hm = nowHm();
  const trip = o.bus.trips.find((tr) => tr.notice) ?? o.bus.trips.find((tr) => tr.direction === (hm < '12:00' ? 'morning' : 'afternoon')) ?? o.bus.trips[0];
  const nt = trip.notice;
  return (
    <>
      <div className="pp-sec-h"><h2>{t.ui.onTheWay}</h2></div>
      {liveTrip && learner && <BusLiveCard learner={learner} live={liveTrip} compact />}
      <section className="pp-card pp-bus" aria-label={t.ui.onTheWay} data-testid="pp-today-bus">
        <div className="pp-row">
          <span className="pp-row" style={{ gap: 10, justifyContent: 'flex-start' }}>
            <span className="pp-ico pp-ico--sun"><Icon name="bus" /></span>
            <span><b style={{ fontSize: 16 }}>{t.sch[trip.direction]}</b><span className="pp-sub" style={{ display: 'block' }} dir="auto">{trip.stop}</span></span>
          </span>
          {trip.time && <b className="pp-bus-time" dir="ltr">{n(trip.time)}</b>}
        </div>
        <div className={`pp-bus-status${nt ? (nt.kind === 'cancel' ? ' pp-bus-status--bad' : ' pp-bus-status--late') : ''}`} role="status">
          <span className="pp-pulse" aria-hidden="true" />
          <span>{nt ? (nt.kind === 'cancel' ? t.sch.cancelled : t.sch.delay(n(nt.minutes ?? 0))) : t.ui.onTime}{nt?.message ? <span dir="auto"> · {nt.message}</span> : null}</span>
        </div>
        <button type="button" className="pp-btn pp-btn--ton pp-btn--block" onClick={() => open('buses')}>{t.ui.busDetails}<Icon name="chevron" flip /></button>
        {!liveTrip && <p className="pp-note2"><Icon name="alert" style={{ inlineSize: 16, blockSize: 16 }} /><span>{t.ui.notGps}</span></p>}
      </section>
    </>
  );
};

/** "Today at school": attendance and today's classes, the current one marked Now. */
export const TodayClasses: React.FC<{ overview: SchoolOverview | null; open: (v: SchoolView) => void }> = ({ overview: o, open }) => {
  const { t, n } = useP();
  if (!o?.sections.timetable || !o.todayClasses?.length) return null;
  const hm = nowHm();
  const current = o.todayClasses.find((c) => c.start <= hm && hm < c.end);
  const next = o.todayClasses.find((c) => c.start > hm);
  return (
    <>
      <div className="pp-sec-h"><h2>{t.ui.todayAtSchool}</h2><button type="button" className="pp-linkbtn" onClick={() => open('timetable')}>{t.ui.timetable}</button></div>
      <section className="pp-card" data-testid="pp-today-classes">
        <div className="pp-row">
          {o.sections.attendance && o.attendanceToday ? <span className={`pp-tag ${o.attendanceToday === 'present' ? 'pp-tag--ok' : o.attendanceToday === 'absent' ? 'pp-tag--bad' : 'pp-tag--warn'}`}>{t.sch.status[o.attendanceToday]}</span> : <span />}
          <span className="pp-meta">{t.ui.classesCount(n(o.todayClasses.length))}</span>
        </div>
        <ul className="pp-tt">
          {o.todayClasses.map((c) => {
            const state = c === current ? 'now' : c === next ? 'next' : c.end <= hm ? 'done' : '';
            return (
              <li key={`${c.period}-${c.start}`} className={state ? `pp-tt--${state}` : undefined}>
                <time dir="ltr">{n(c.start)}</time>
                <span className="pp-tt-slot"><b dir="auto">{c.subject}</b>{state === 'now' && <span className="pp-tag pp-tag--now">{t.ui.now}</span>}{state === 'next' && <span className="pp-meta">{t.ui.next}</span>}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
};

/** School tiles: one per section the school has on. Each opens its detail screen. */
export const SchoolTiles: React.FC<{ overview: SchoolOverview | null; open: (v: SchoolView) => void; school?: string | null }> = ({ overview: o, open, school }) => {
  const { t, n, lang } = useP();
  if (!o) return null;
  const on = o.sections;
  const hm = nowHm();
  const next = o.todayClasses?.find((c) => c.end > hm) ?? null;
  const busNotice = o.bus?.trips.find((tr) => tr.notice)?.notice ?? null;
  const tiles: { key: SchoolView; icon: string; tone: string; title: string; sub: React.ReactNode; testid?: string; bad?: boolean }[] = [];
  if (on.timetable) tiles.push({ key: 'timetable', icon: 'activity', tone: 'brand', title: t.ui.timetableTile, sub: next ? <span dir="auto">{`${n(next.start)} · ${next.subject}`}</span> : o.todayClasses?.length ? t.ui.classesCount(n(o.todayClasses.length)) : t.sch.noClassesToday });
  if (on.attendance) tiles.push({ key: 'attendance', icon: 'ontrack', tone: o.attendanceToday === 'absent' ? 'bad' : 'ok', title: t.ui.attendanceTile, sub: o.attendanceToday ? t.sch.status[o.attendanceToday] : t.sch.notRecorded });
  if (on.buses && o.bus) tiles.push({ key: 'buses', icon: 'bus', tone: 'sun', title: t.ui.busTile, testid: 'pp-school-home-bus', bad: !!busNotice, sub: <>{o.bus.trips.map((tr) => `${t.sch[tr.direction]} ${tr.time ? n(tr.time) : ''}`).join(' · ')}{busNotice ? <> · <b>{busNotice.kind === 'cancel' ? t.sch.cancelled : t.sch.delay(n(busNotice.minutes ?? 0))}</b></> : null}</> });
  if (on.fees && o.fees) tiles.push({ key: 'fees', icon: 'coin', tone: o.fees.overdueCount ? 'bad' : 'brand', title: t.ui.feesTile, testid: 'pp-school-home-fees', bad: !!o.fees.overdueCount, sub: o.fees.overdueCount ? t.sch.overdueCount(n(o.fees.overdueCount)) : o.fees.next ? t.sch.feeDueLine(n(o.fees.next.amount.toLocaleString('en-US')), new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${o.fees.next.dueDate}T00:00:00Z`))) : t.sch.feeNone });
  if (on.consents && o.consentsPending) tiles.push({ key: 'consents', icon: 'pen', tone: 'warn', title: t.ui.consentsTile, testid: 'pp-school-home-consents', bad: true, sub: t.sch.consentPending(n(o.consentsPending)) });
  if (on.requests) tiles.push({ key: 'requests', icon: 'inbox', tone: 'info', title: t.ui.requestsTile, testid: 'pp-school-home-requests', sub: o.openRequests ? t.sch.openRequests(n(o.openRequests)) : t.ui.noRequests });
  if (on.announcements) tiles.push({ key: 'announcements', icon: 'megaphone', tone: 'info', title: t.ui.announcementsTile, sub: o.announcementsCount ? n(o.announcementsCount) : t.sch.none });
  if (!tiles.length) return null;
  return (
    <>
      <div className="pp-sec-h"><h2>{t.ui.schoolTiles}</h2>{school && <span className="pp-meta" dir="auto">{school}</span>}</div>
      <section className="pp-sgrid" aria-label={t.ui.schoolTiles} data-testid="pp-school-home">
        {tiles.map((x) => (
          <button key={x.key} type="button" className={`pp-stile${x.bad ? ' pp-stile--bad' : ''}`} onClick={() => open(x.key)} data-testid={x.testid}>
            <span className={`pp-ico pp-ico--${x.tone}`}><Icon name={x.icon} /></span>
            <span className="pp-stile-tx"><b>{x.title}</b><span>{x.sub}</span></span>
          </button>
        ))}
      </section>
    </>
  );
};

/** Redesign step 3: the weekly rings on Progress (three concentric rings with a written legend, the days and what is left). */
export const RingsCard: React.FC<{ status: WeeklyStatus; lessons: number }> = ({ status: s, lessons }) => {
  const { t, n } = useP();
  const practised = s.days.filter((d) => d.practised).length;
  const rings = [
    { r: 60, done: s.minutesDone, goal: s.goalMinutes, color: '#F5A524', label: t.ui.practiceTime, line: t.ofMin(n(s.minutesDone), n(s.goalMinutes)) },
    { r: 45, done: lessons, goal: LESSONS_TARGET, color: '#2B5CE6', label: t.ui.lessonsDone, line: `${n(lessons)} ${t.ui.ofLessons(n(LESSONS_TARGET))}` },
    { r: 30, done: practised, goal: DAYS_TARGET, color: '#1B8A58', label: t.ui.daysPractised, line: `${n(practised)} ${t.ui.ofDays(n(DAYS_TARGET))}` },
  ];
  const left = Math.max(0, s.goalMinutes - s.minutesDone);
  return (
    <section className="pp-card" aria-labelledby="pp-rings-h" data-testid="pp-rings">
      <h2 className="pp-h2" id="pp-rings-h">{t.ui.thisWeekCard}</h2>
      <div className="pp-rings">
        <svg className="pp-rings-svg" viewBox="0 0 140 140" role="img" aria-label={rings.map((x) => t.ui.ringAria(x.label, n(x.done), n(x.goal))).join('; ')}>
          {rings.map((x) => {
            const c = 2 * Math.PI * x.r;
            const pct = x.goal ? Math.min(1, x.done / x.goal) : 0;
            return (
              <g key={x.r}>
                <circle cx="70" cy="70" r={x.r} fill="none" stroke="var(--track)" strokeWidth="11" />
                <circle className="pp-ringfill" cx="70" cy="70" r={x.r} fill="none" stroke={x.color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 70 70)" />
              </g>
            );
          })}
        </svg>
        <ul className="pp-legend">
          {rings.map((x) => <li key={x.r}><span className="pp-sw" style={{ background: x.color }} aria-hidden="true" /><span><b>{x.line}</b><small>{x.label}</small></span></li>)}
        </ul>
      </div>
      <ul className="pp-wdots" aria-label={t.thisWeek}>
        {s.days.map((d) => {
          const wd = weekdayIndex(d.day);
          const state = d.practised ? 'practised' : d.isToday ? 'today' : d.isFuture ? 'upcoming' : 'missed';
          return (
            <li key={d.day} className={`pp-wd pp-wd--${state}`}>
              <i>{d.practised && <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}</i>
              <span aria-hidden="true">{t.weekdays[wd]}</span><span className="sr">{`${t.weekdaysLong[wd]}: ${t.dayState[state]}`}</span>
            </li>
          );
        })}
      </ul>
      <p className="pp-note-tip"><Icon name={left ? 'target' : 'ontrack'} /><span>{left ? t.ui.toGo(n(left)) : t.ui.goalDone}</span></p>
    </section>
  );
};

/** True on a wide screen (desktop layout). Follows window resizes. */
export function useWide(query = '(min-width: 1180px)'): boolean {
  const get = () => { try { return window.matchMedia(query).matches; } catch { return false; } };
  const [wide, setWide] = React.useState(get);
  React.useEffect(() => {
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setWide(mq!.matches);
    mq.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, [query]);
  return wide;
}

/** Follow-up (item 4): "Latest" on Today. Built only from real data: the school's notifications for this child and each subject's
 * latest released result (Parents P3: a held result is never here). Newest first, four at most; "See all" opens the notifications. */
export const Latest: React.FC<{ learner: LearnerChip; overview: SchoolOverview | null; subjects: SubjectCard[]; refreshKey: number; open: (v: SchoolView) => void }> = ({ learner, overview: o, subjects, refreshKey, open }) => {
  const { t, n, lang } = useP();
  const notesOn = !!o?.sections.notifications;
  const q = useLive(() => (notesOn ? schoolApi.notifications().catch(() => null) : Promise.resolve(null)), [notesOn], refreshKey);
  type Item = { key: string; at: string; tone: string; icon: string; tile?: string; kicker: string; title: string; body?: string };
  const KIND: Record<string, { tone: string; icon: string }> = { absence: { tone: 'bad', icon: 'alert' }, late: { tone: 'warn', icon: 'nudge' }, announcement: { tone: 'info', icon: 'megaphone' }, fee_due: { tone: 'warn', icon: 'coin' }, bus_notice: { tone: 'sun', icon: 'bus' }, request_update: { tone: 'info', icon: 'inbox' }, consent: { tone: 'warn', icon: 'pen' } };
  const items: Item[] = [
    ...(q.data?.notifications ?? []).filter((x) => x.studentId === learner.studentId).map((x) => ({ key: `n-${x.id}`, at: x.createdAt, ...(KIND[x.kind] ?? { tone: 'info', icon: 'bell' }), kicker: t.ui.latestKind[x.kind] ?? t.sch.notifications, title: x.title, body: x.body })),
    ...subjects.filter((s) => s.latestResult?.submittedAt).map((s) => ({ key: `r-${s.key}`, at: s.latestResult!.submittedAt!, tone: s.latestResult!.score >= 50 ? 'ok' : 'warn', icon: 'check', tile: `${n(s.latestResult!.score)}%`, kicker: `${t.ui.resultReleased} · ${bi(s.name, lang)}`, title: s.latestResult!.title })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  if (!items.length) return null;
  return (
    <div className="pp-block" data-testid="pp-latest">
      <div className="pp-sec-h"><h2>{t.ui.latest}</h2>{notesOn && <button type="button" className="pp-linkbtn" onClick={() => open('notifications')}>{t.ui.seeAll}</button>}</div>
      <section className="pp-card pp-card--flush pp-threads">
        {items.map((x) => (
          <div key={x.key} className="pp-ev">
            {x.tile ? <span className={`pp-score pp-score--${x.tone}`}>{x.tile}</span> : <span className={`pp-ico pp-ico--${x.tone}`}><Icon name={x.icon} /></span>}
            <div className="pp-ev-tx">
              <span className="pp-meta">{x.kicker} · {cairoDate(x.at.slice(0, 10), lang)}</span>
              <b dir="auto">{x.title}</b>
              {x.body && <p dir="auto">{x.body}</p>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

/** Follow-up (item 5): the weekly report card on Progress, written from this week's real numbers (no AI): results released and
 * waiting since the week began, points to practise, minutes against the goal. "Share this week" opens the share sheet. */
export const ReportCard: React.FC<{ learner: LearnerChip; status: WeeklyStatus; subjects: SubjectCard[]; results: { submittedAt: string | null; passed: boolean | null; waiting?: boolean; score: number | null }[]; onShare?: () => void }> = ({ learner, status: s, subjects, results, onShare }) => {
  const { t, n, lang } = useP();
  const week = results.filter((r) => r.submittedAt && r.submittedAt.slice(0, 10) >= s.weekStart);
  const released = week.filter((r) => !r.waiting && r.score !== null);
  const passed = released.filter((r) => r.passed).length;
  const waiting = week.filter((r) => r.waiting).length;
  const points = subjects.reduce((sum, x) => sum + (x.pointsCount || 0), 0);
  const end = new Date(`${s.weekStart}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
  const range = `${cairoDate(s.weekStart, lang)} – ${cairoDate(end.toISOString().slice(0, 10), lang)}`;
  const lines: { icon: string; tone: string; text: string }[] = [
    { icon: 'target', tone: s.minutesDone >= s.goalMinutes ? 'ok' : 'sun', text: t.ofMin(n(s.minutesDone), n(s.goalMinutes)) },
    ...(released.length ? [{ icon: 'check', tone: 'ok', text: t.ui.rPassed(n(passed), n(released.length)) }] : []),
    ...(waiting ? [{ icon: 'nudge', tone: 'wait', text: t.ui.rWaiting(n(waiting)) }] : []),
    ...(points ? [{ icon: 'alert', tone: 'warn', text: t.ui.rPoints(n(points)) }] : []),
  ];
  return (
    <section className="pp-card pp-wreport" aria-labelledby="pp-report-h" data-testid="pp-report">
      <span className="pp-meta">{t.ui.reportCard} · {range}</span>
      <h2 className="pp-h2" id="pp-report-h" style={{ fontSize: 18 }}>{t.ui.reportTitle[s.status](learner.firstName)}</h2>
      <ul className="pp-rlines">
        {lines.map((l, i) => <li key={i}><span className={`pp-ico pp-ico--${l.tone} pp-ico--sm`}><Icon name={l.icon} /></span>{l.text}</li>)}
      </ul>
      {onShare && <button type="button" className="pp-btn pp-btn--block" onClick={onShare}><Icon name="share" />{t.share}</button>}
    </section>
  );
};
