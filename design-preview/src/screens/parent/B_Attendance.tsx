import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock3, FileCheck2, MessageSquareText, Send } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dir, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ParentShell } from './B_common';

type St = 'present' | 'absent' | 'late' | 'excused' | 'future';
// November 2026 starts on a Sunday. School days are Sunday to Thursday; Friday and Saturday are the weekend.
const WEEKS: (number | null)[][] = [[1, 2, 3, 4, 5], [8, 9, 10, 11, 12], [15, 16, 17, 18, 19], [22, 23, 24, 25, 26], [29, 30, null, null, null]];
const SPECIAL: Record<number, St> = { 4: 'excused', 9: 'absent', 17: 'late', 24: 'late' };
const statusOf = (d: number): St => (d > 26 ? 'future' : SPECIAL[d] ?? 'present');

const STYLE: Record<St, { cell: string; dot: string; letter: { en: string; ar: string }; Icon: typeof CircleCheck | null }> = {
  present: { cell: 'bg-success-soft text-success border-success/20', dot: 'text-success', letter: { en: 'P', ar: 'ح' }, Icon: CircleCheck },
  absent: { cell: 'bg-destructive-soft text-destructive border-destructive/40 ring-2 ring-destructive/40', dot: 'text-destructive', letter: { en: 'A', ar: 'غ' }, Icon: CircleX },
  late: { cell: 'bg-warning-soft text-warning-foreground border-warning/40', dot: 'text-warning', letter: { en: 'L', ar: 'ت' }, Icon: Clock3 },
  excused: { cell: 'bg-info-soft text-info border-info/30', dot: 'text-info', letter: { en: 'E', ar: 'ع' }, Icon: FileCheck2 },
  future: { cell: 'bg-card text-muted-foreground border-dashed', dot: '', letter: { en: '', ar: '' }, Icon: null },
};

const T = {
  en: {
    title: 'Attendance', sub: 'Recorded by the school each morning', month: 'November 2026', prev: 'October 2026', next: 'December 2026',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], weekend: 'Friday and Saturday are the weekend.',
    st: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', future: 'Upcoming' } as Record<St, string>,
    rate: 'Attendance this month', of: (a: number, b: number) => `${a} of ${b} school days`, term: 'Term so far: 95%',
    legend: 'Key', calendar: 'Calendar',
    absenceTitle: 'Absence on Monday 9 Nov', unexcused: 'No reason received',
    schoolNote: 'Note from the school', noteBy: 'Ms Rania Fathy · Homeroom teacher · 9 Nov, 08:15',
    note: 'Laila was marked absent at morning registration. We did not receive a reason. If she was unwell, please send a short note or a medical certificate so we can record the absence as excused.',
    sendReason: 'Send a reason to the school', reply: 'Reply to Ms Rania',
    others: 'Other days to note', d4: 'Wed 4 Nov', d4n: 'Medical appointment. Note received on 3 Nov.', d17: 'Tue 17 Nov', d17n: 'Arrived at 07:56. School starts at 07:45.', d24: 'Tue 24 Nov', d24n: 'Arrived at 08:02 with the late morning bus (school notice).',
  },
  ar: {
    title: 'الحضور', sub: 'تسجّله المدرسة كل صباح', month: 'نوفمبر 2026', prev: 'أكتوبر 2026', next: 'ديسمبر 2026',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'], weekend: 'الجمعة والسبت عطلة نهاية الأسبوع.',
    st: { present: 'حاضرة', absent: 'غائبة', late: 'متأخرة', excused: 'غياب بعذر', future: 'قادم' } as Record<St, string>,
    rate: 'نسبة الحضور هذا الشهر', of: (a: number, b: number) => `${a} من ${b} يومًا دراسيًا`, term: 'منذ بداية الفصل: 95%',
    legend: 'دليل الرموز', calendar: 'التقويم',
    absenceTitle: 'غياب يوم الاثنين 9 نوفمبر', unexcused: 'لم يصل سبب للغياب',
    schoolNote: 'ملاحظة من المدرسة', noteBy: 'أ. رانيا فتحي · رائدة الفصل · 9 نوفمبر، 08:15',
    note: 'سُجّلت ليلى غائبة في تسجيل الحضور الصباحي، ولم يصلنا سبب الغياب. إذا كانت مريضة، يُرجى إرسال ملاحظة قصيرة أو شهادة طبية حتى نسجّل الغياب بعذر.',
    sendReason: 'أرسل سبب الغياب إلى المدرسة', reply: 'الرد على أ. رانيا',
    others: 'أيام أخرى للانتباه', d4: 'الأربعاء 4 نوفمبر', d4n: 'موعد طبي. وصلت الملاحظة في 3 نوفمبر.', d17: 'الثلاثاء 17 نوفمبر', d17n: 'وصلت الساعة 07:56، ويبدأ اليوم الدراسي الساعة 07:45.', d24: 'الثلاثاء 24 نوفمبر', d24n: 'وصلت الساعة 08:02 مع حافلة الصباح المتأخرة (تنبيه من المدرسة).',
  },
};

export default function Attendance() {
  const t = useT(T);
  const { lang } = usePreview();
  const days = WEEKS.flat().filter((d): d is number => d !== null && d <= 26);
  const count = (s: St) => days.filter((d) => statusOf(d) === s).length;
  const totals: St[] = ['present', 'late', 'absent', 'excused'];
  const rate = Math.round(((count('present') + count('late')) / days.length) * 100);

  return (
    <ParentShell title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ChildChip />

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Button variant="ghost" size="icon" aria-label={t.prev}><Dir><ChevronLeft className="size-5" /></Dir></Button>
                <h2 className="flex-1 text-center text-lg font-bold">{t.month}</h2>
                <Button variant="ghost" size="icon" aria-label={t.next}><Dir><ChevronRight className="size-5" /></Dir></Button>
              </CardHeader>
              <CardContent>
                <div role="grid" aria-label={`${t.calendar} ${t.month}`} className="flex flex-col gap-1.5 md:gap-2">
                  <div role="row" className="grid grid-cols-5 gap-1.5 md:gap-2">
                    {t.days.map((d) => <div role="columnheader" key={d} className="pb-1 text-center text-xs font-semibold text-muted-foreground"><span className="md:hidden">{lang === 'ar' ? d.replace('ال', '') : d}</span><span className="hidden md:inline">{d}</span></div>)}
                  </div>
                  {WEEKS.map((w, wi) => (
                    <div role="row" key={wi} className="grid grid-cols-5 gap-1.5 md:gap-2">
                      {w.map((d, di) => {
                        if (d === null) return <div role="gridcell" key={di} />;
                        const s = statusOf(d), st = STYLE[s];
                        return (
                          <div role="gridcell" key={di} aria-label={`${num(d, lang)} · ${t.st[s]}`}
                            className={cn('flex aspect-square min-h-14 flex-col justify-between rounded-lg border p-1.5 md:aspect-[4/3] md:p-2.5', st.cell, d === 26 && 'outline-2 outline-offset-2 outline-primary')}>
                            <span className="text-sm font-bold tabular-nums text-foreground md:text-base">{num(d, lang)}</span>
                            {st.Icon && (
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
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {totals.map((s) => {
                      const st = STYLE[s];
                      return (
                        <li key={s} className="flex items-center gap-2 text-sm">
                          <span className={cn('flex h-7 min-w-11 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-bold', st.cell, 'ring-0')}>{st.Icon && <st.Icon className="size-4" aria-hidden />}{st.letter[lang]}</span>
                          {t.st[s]}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="p-5">
              <p className="text-sm font-semibold text-muted-foreground">{t.rate}</p>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums">{num(rate, lang)}%</span><span className="text-sm text-muted-foreground">{t.of(count('present') + count('late'), days.length)}</span></div>
              <Progress value={rate} tone="success" className="mt-3" />
              <p className="mt-2 text-xs text-muted-foreground">{t.term}</p>
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

            <Card className="border-destructive/30">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="danger"><CircleX />{t.st.absent}</Badge><Badge tone="outline">{t.unexcused}</Badge></div>
                <CardTitle>{t.absenceTitle}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageSquareText className="size-4" />{t.schoolNote}</p>
                  <p className="mt-1.5 text-sm leading-relaxed">{t.note}</p>
                  <div className="mt-2 flex items-center gap-2"><Avatar name={lang === 'ar' ? 'رانيا فتحي' : 'Rania Fathy'} className="size-6 text-[10px]" /><p className="text-xs text-muted-foreground">{t.noteBy}</p></div>
                </div>
                <Button className="w-full"><Send />{t.sendReason}</Button>
                <Button variant="outline" className="w-full">{t.reply}</Button>
              </CardContent>
            </Card>

            <section>
              <SectionTitle>{t.others}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {([[t.d4, t.d4n, 'excused'], [t.d17, t.d17n, 'late'], [t.d24, t.d24n, 'late']] as [string, string, St][]).map(([d, n, s]) => {
                  const st = STYLE[s];
                  return (
                    <li key={d} className="flex gap-3 rounded-lg border bg-card p-3">
                      {st.Icon && <st.Icon className={cn('mt-0.5 size-5 shrink-0', st.dot)} aria-hidden />}
                      <div className="min-w-0"><p className="text-sm font-semibold">{d} · {t.st[s]}</p><p className="text-xs text-muted-foreground">{n}</p></div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </ParentShell>
  );
}
