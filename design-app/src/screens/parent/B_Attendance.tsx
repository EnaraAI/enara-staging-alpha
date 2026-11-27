import { useState } from 'react';
import { ChevronLeft, ChevronRight, CircleCheck, CircleDashed, CircleX, Clock3, FileCheck2, MessageCircle, MessageSquareText } from 'lucide-react';
import { get } from '@/lib/api';
import { useT, usePreview, num, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dir, Progress, Skeleton, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ChildGate, ParentShell, SchoolTabs } from './B_common';
import { cairoMonth, cairoToday, ep, ErrorState, fmtDay, fmtMonth, fmtStamp, isOff, OffState, shiftMonth, useChildren, useLoad, type AttendanceResp, type AttendanceStatus, type Children, type LearnerChip } from './data';

type St = AttendanceStatus | 'none' | 'future';
const STYLE: Record<St, { cell: string; dot: string; letter: { en: string; ar: string }; Icon: typeof CircleCheck | null }> = {
  present: { cell: 'bg-success-soft text-success border-success/20', dot: 'text-success', letter: { en: 'P', ar: 'ح' }, Icon: CircleCheck },
  absent: { cell: 'bg-destructive-soft text-destructive border-destructive/40 ring-2 ring-destructive/40', dot: 'text-destructive', letter: { en: 'A', ar: 'غ' }, Icon: CircleX },
  late: { cell: 'bg-warning-soft text-warning-foreground border-warning/40', dot: 'text-warning', letter: { en: 'L', ar: 'ت' }, Icon: Clock3 },
  excused: { cell: 'bg-info-soft text-info border-info/30', dot: 'text-info', letter: { en: 'E', ar: 'ع' }, Icon: FileCheck2 },
  none: { cell: 'bg-muted/50 text-muted-foreground border-transparent', dot: 'text-muted-foreground', letter: { en: '', ar: '' }, Icon: CircleDashed },
  future: { cell: 'bg-card text-muted-foreground border-dashed', dot: '', letter: { en: '', ar: '' }, Icon: null },
};
const MAX_BACK = 12; // months the parent can step back

const T = {
  en: {
    title: 'Attendance', sub: 'Recorded by the school', prev: 'Previous month', next: 'Next month',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], weekend: 'Friday and Saturday are the weekend.',
    st: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', none: 'Not recorded', future: 'Upcoming' } as Record<St, string>,
    rate: 'Attendance this month', of: (a: string, b: string) => `${a} of ${b} recorded school days`, noRate: 'No attendance recorded for this month yet.',
    legend: 'Key', calendar: 'Calendar', updated: (d: string) => `Updated by the school on ${d}`,
    absenceTitle: (d: string) => `Absence on ${d}`, schoolNote: 'Note from the school', period: (n: string) => `Period ${n}`, noNote: 'The school did not add a note.',
    ask: 'Message the school', others: 'Other days to note', noOthers: 'Nothing else to note this month.',
  },
  ar: {
    title: 'الحضور', sub: 'تسجّله المدرسة', prev: 'الشهر السابق', next: 'الشهر التالي',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'], short: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس'], weekend: 'الجمعة والسبت عطلة نهاية الأسبوع.',
    st: { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'غياب بعذر', none: 'لم يُسجَّل', future: 'قادم' } as Record<St, string>,
    rate: 'نسبة الحضور هذا الشهر', of: (a: string, b: string) => `${a} من ${b} يومًا دراسيًا مسجّلًا`, noRate: 'لم يُسجَّل حضور لهذا الشهر بعد.',
    legend: 'دليل الرموز', calendar: 'التقويم', updated: (d: string) => `حدّثته المدرسة في ${d}`,
    absenceTitle: (d: string) => `غياب يوم ${d}`, schoolNote: 'ملاحظة من المدرسة', period: (n: string) => `الحصة ${n}`, noNote: 'لم تُضف المدرسة ملاحظة.',
    ask: 'راسل المدرسة', others: 'أيام أخرى للانتباه', noOthers: 'لا شيء آخر للانتباه هذا الشهر.',
  },
};
type TT = (typeof T)['en'];

export default function Attendance() {
  const t = useT(T);
  const kids = useChildren();
  return (
    <ParentShell active="school" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ChildGate kids={kids}>
          {(child) => <AttendanceBody key={child.studentId} child={child} kids={kids} />}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

type Rec = NonNullable<AttendanceResp['records']>[number];
const dayStatus = (rs: Rec[]): AttendanceStatus => (rs.some((r) => r.status === 'absent') ? 'absent' : rs.some((r) => r.status === 'late') ? 'late' : rs.length && rs.every((r) => r.status === 'excused') ? 'excused' : 'present');

function AttendanceBody({ child, kids }: { child: LearnerChip; kids: Children }) {
  const t = useT(T);
  const { lang } = usePreview();
  const now = cairoMonth();
  const [month, setMonth] = useState(now);
  const q = useLoad((signal) => get<AttendanceResp>(ep.attendance(child.studentId, month), signal), [child.studentId, month]);
  const oldest = shiftMonth(now, -MAX_BACK);
  const off = isOff(q.error);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildChip kids={kids} />
        {q.data?.source?.updatedAt && <p className="text-xs text-muted-foreground">{t.updated(fmtStamp(q.data.source.updatedAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>}
      </div>
      <SchoolTabs active="attendance" />
      {off ? <OffState /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Button variant="ghost" size="icon" aria-label={t.prev} isDisabled={month <= oldest} onPress={() => setMonth((m) => shiftMonth(m, -1))}><Dir><ChevronLeft className="size-5" /></Dir></Button>
                <h2 className="flex-1 text-center text-lg font-bold" aria-live="polite" data-testid="attendance-month">{fmtMonth(month, lang)}</h2>
                <Button variant="ghost" size="icon" aria-label={t.next} isDisabled={month >= now} onPress={() => setMonth((m) => shiftMonth(m, 1))}><Dir><ChevronRight className="size-5" /></Dir></Button>
              </CardHeader>
              <CardContent>
                {q.loading ? <div className="grid grid-cols-5 gap-1.5 md:gap-2" aria-busy="true" data-testid="parent-loading">{Array.from({ length: 25 }, (_, i) => <Skeleton key={i} className="aspect-square min-h-14 md:aspect-[4/3]" />)}</div>
                  : q.error || !q.data ? <ErrorState error={q.error} onRetry={q.reload} className="shadow-none" />
                  : <Calendar month={month} data={q.data} t={t} lang={lang} />}
              </CardContent>
            </Card>
          </div>
          <aside className="flex flex-col gap-4">
            {q.loading ? <><Skeleton className="h-56 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></>
              : q.data ? <Side month={month} data={q.data} t={t} lang={lang} /> : null}
          </aside>
        </div>
      )}
    </>
  );
}

function byDay(data: AttendanceResp) {
  const m = new Map<string, Rec[]>();
  for (const r of data.records ?? []) { if (!r?.date) continue; const d = r.date.slice(0, 10); m.set(d, [...(m.get(d) ?? []), r]); }
  return m;
}

function Calendar({ month, data, t, lang }: { month: string; data: AttendanceResp; t: TT; lang: Lang }) {
  const today = cairoToday();
  const recs = byDay(data);
  const [y, mo] = month.split('-').map(Number);
  const len = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  // Weeks of Sunday to Thursday (school days); Friday and Saturday are left out of the grid.
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = [null, null, null, null, null];
  for (let d = 1; d <= len; d++) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (wd === 0 && week.some(Boolean)) { weeks.push(week); week = [null, null, null, null, null]; }
    if (wd <= 4) week[wd] = day;
  }
  if (week.some(Boolean)) weeks.push(week);
  const statusOf = (day: string): St => (recs.has(day) ? dayStatus(recs.get(day)!) : day > today ? 'future' : 'none');
  const legend: St[] = ['present', 'late', 'absent', 'excused', 'none'];
  return (
    <>
      <div role="grid" aria-label={`${t.calendar} ${fmtMonth(month, lang)}`} className="flex flex-col gap-1.5 md:gap-2">
        <div role="row" className="grid grid-cols-5 gap-1.5 md:gap-2">
          {t.days.map((d, i) => <div role="columnheader" key={d} className="truncate pb-1 text-center text-xs font-semibold text-muted-foreground"><span className="md:hidden">{t.short[i]}</span><span className="hidden md:inline">{d}</span></div>)}
        </div>
        {weeks.map((w, wi) => (
          <div role="row" key={wi} className="grid grid-cols-5 gap-1.5 md:gap-2">
            {w.map((day, di) => {
              if (!day) return <div role="gridcell" key={di} />;
              const s = statusOf(day), st = STYLE[s];
              const dn = Number(day.slice(8, 10));
              return (
                <div role="gridcell" key={di} aria-label={`${fmtDay(day, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · ${t.st[s]}`}
                  className={cn('flex aspect-square min-h-14 min-w-0 flex-col justify-between rounded-lg border p-1.5 md:aspect-[4/3] md:p-2.5', st.cell, day === today && 'outline-2 outline-offset-2 outline-primary')}>
                  <span className="text-sm font-bold tabular-nums text-foreground md:text-base">{num(dn, lang)}</span>
                  {st.Icon && s !== 'none' && (
                    <span className="flex items-center justify-end gap-1 text-xs font-bold">
                      <st.Icon className="size-4 md:size-5" aria-hidden /><span>{st.letter[lang]}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.weekend}</p>
      <div className="mt-4 rounded-lg bg-muted/60 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t.legend}</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {legend.map((s) => {
            const st = STYLE[s];
            return (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span className={cn('flex h-7 min-w-11 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-bold', st.cell, 'ring-0')}>{st.Icon && s !== 'none' && <st.Icon className="size-4" aria-hidden />}{st.letter[lang]}</span>
                {t.st[s]}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function Side({ month, data, t, lang }: { month: string; data: AttendanceResp; t: TT; lang: Lang }) {
  const recs = byDay(data);
  const days = [...recs.entries()].filter(([d]) => d.startsWith(month)).sort(([a], [b]) => a.localeCompare(b)).map(([d, rs]) => ({ d, rs, s: dayStatus(rs) }));
  const count = (s: AttendanceStatus) => days.filter((x) => x.s === s).length;
  const attended = count('present') + count('late');
  const rate = days.length ? Math.round((attended / days.length) * 100) : null;
  const totals: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
  const lastAbsence = [...days].reverse().find((x) => x.s === 'absent');
  const others = days.filter((x) => x.s !== 'present' && x !== lastAbsence).reverse();
  const noteLines = (rs: Rec[]) => rs.filter((r) => r.note).map((r) => (r.period != null ? `${t.period(num(r.period, lang))}: ${r.note}` : r.note!));
  return (
    <>
      <Card className="p-5">
        <p className="text-sm font-semibold text-muted-foreground">{t.rate}</p>
        {rate === null ? <p className="mt-2 text-sm text-muted-foreground">{t.noRate}</p> : (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums">{num(rate, lang)}%</span><span className="text-sm text-muted-foreground">{t.of(num(attended, lang), num(days.length, lang))}</span></div>
            <Progress value={rate} tone="success" className="mt-3" ariaLabel={t.rate} />
          </>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {totals.map((s) => {
            const st = STYLE[s];
            return (
              <li key={s} className="flex items-center gap-2 rounded-lg border p-2.5">
                {st.Icon && <st.Icon className={cn('size-5 shrink-0', st.dot)} aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-sm">{t.st[s]}</span>
                <span className="text-lg font-bold tabular-nums">{num(count(s), lang)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {lastAbsence && (
        <Card className="border-destructive/30">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="danger"><CircleX />{t.st.absent}</Badge></div>
            <CardTitle>{t.absenceTitle(fmtDay(lastAbsence.d, lang, { weekday: 'long', day: 'numeric', month: 'long' }))}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageSquareText className="size-4" />{t.schoolNote}</p>
              {noteLines(lastAbsence.rs).length ? noteLines(lastAbsence.rs).map((n, i) => <p key={i} className="mt-1.5 text-sm leading-relaxed">{n}</p>) : <p className="mt-1.5 text-sm text-muted-foreground">{t.noNote}</p>}
            </div>
            <a href="#/parent/chat" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}><MessageCircle />{t.ask}</a>
          </CardContent>
        </Card>
      )}

      <section>
        <SectionTitle>{t.others}</SectionTitle>
        {!others.length ? <p className="text-sm text-muted-foreground">{t.noOthers}</p> : (
          <ul className="flex flex-col gap-2">
            {others.map((x) => {
              const st = STYLE[x.s];
              const notes = noteLines(x.rs);
              return (
                <li key={x.d} className="flex gap-3 rounded-lg border bg-card p-3">
                  {st.Icon && <st.Icon className={cn('mt-0.5 size-5 shrink-0', st.dot)} aria-hidden />}
                  <div className="min-w-0"><p className="text-sm font-semibold">{fmtDay(x.d, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {t.st[x.s]}</p>{notes.map((n, i) => <p key={i} className="text-xs text-muted-foreground">{n}</p>)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
