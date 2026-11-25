import React from 'react';
import { weekdayIndex, type LearnerChip, type SchoolOverview, type WeeklyStatus } from '../api';
import { Icon, useP } from '../ui';
import type { SchoolView } from './School';
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
export const BusCard: React.FC<{ overview: SchoolOverview | null; open: (v: SchoolView) => void }> = ({ overview: o, open }) => {
  const { t, n } = useP();
  if (!o?.sections.buses || !o.bus?.trips.length) return null;
  const hm = nowHm();
  const trip = o.bus.trips.find((tr) => tr.notice) ?? o.bus.trips.find((tr) => tr.direction === (hm < '12:00' ? 'morning' : 'afternoon')) ?? o.bus.trips[0];
  const nt = trip.notice;
  return (
    <>
      <div className="pp-sec-h"><h2>{t.ui.onTheWay}</h2></div>
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
        <p className="pp-note2"><Icon name="alert" style={{ inlineSize: 16, blockSize: 16 }} /><span>{t.ui.notGps}</span></p>
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
