import { Bus, CalendarClock, CircleCheck, Clock3, Download, GraduationCap, Landmark, MapPin, MessageCircle, Phone, TriangleAlert } from 'lucide-react';
import { useT, usePreview, egp, num } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Ring, Separator } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ParentShell } from './B_common';

type Status = 'paid' | 'due' | 'overdue' | 'upcoming';
interface Inst { n: number; of: number; amount: number; date: { en: string; ar: string }; status: Status; paidOn?: { en: string; ar: string }; receipt?: string }

const PLANS: { id: string; icon: 'tuition' | 'bus'; name: { en: string; ar: string }; total: number; items: Inst[] }[] = [
  {
    id: 'tuition', icon: 'tuition', name: { en: 'Tuition 2026-2027', ar: 'الرسوم الدراسية 2026-2027' }, total: 96000,
    items: [
      { n: 1, of: 3, amount: 32000, date: { en: '1 Sep 2026', ar: '1 سبتمبر 2026' }, status: 'paid', paidOn: { en: '28 Aug 2026', ar: '28 أغسطس 2026' }, receipt: 'NVIS-R-20418' },
      { n: 2, of: 3, amount: 32000, date: { en: '2 Dec 2026', ar: '2 ديسمبر 2026' }, status: 'due' },
      { n: 3, of: 3, amount: 32000, date: { en: '1 Mar 2027', ar: '1 مارس 2027' }, status: 'upcoming' },
    ],
  },
  {
    id: 'bus', icon: 'bus', name: { en: 'School bus 2026-2027', ar: 'الحافلة المدرسية 2026-2027' }, total: 18000,
    items: [
      { n: 1, of: 3, amount: 6000, date: { en: '1 Sep 2026', ar: '1 سبتمبر 2026' }, status: 'paid', paidOn: { en: '28 Aug 2026', ar: '28 أغسطس 2026' }, receipt: 'NVIS-R-20419' },
      { n: 2, of: 3, amount: 6000, date: { en: '15 Nov 2026', ar: '15 نوفمبر 2026' }, status: 'overdue' },
      { n: 3, of: 3, amount: 6000, date: { en: '15 Feb 2027', ar: '15 فبراير 2027' }, status: 'upcoming' },
    ],
  },
];

const T = {
  en: {
    title: 'Fees', sub: 'School fee record for 2026-2027',
    total: 'Total for the year', paid: 'Paid', remaining: 'Remaining', overdue: 'Overdue', overdueHint: '1 instalment', paidHint: '2 of 6 instalments', remHint: 'Next: 2 Dec 2026',
    totalHint: '2 plans',
    overdueTitle: 'One instalment is overdue', overdueBody: 'School bus, instalment 2 of 3 (6,000 EGP) was due on 15 Nov 2026. Please visit the accounts office or contact the school.',
    instalments: 'Instalments', instalment: (n: number, of: number) => `Instalment ${n} of ${of}`,
    st: { paid: 'Paid', due: 'Due on 2 Dec', overdue: 'Overdue', upcoming: 'Upcoming' } as Record<Status, string>,
    dueOn: 'Due', paidOn: 'Paid on', receipt: 'Receipt', download: 'Download receipt', daysLeft: 'in 5 days', daysLate: '12 days late',
    planPaid: (p: string) => `${p} paid`,
    payTitle: 'Payment is made at the school', payBody: 'ENARA shows the school’s fee record only. It does not take payments. Pay at the NVIS accounts office by cash, card or bank transfer, and the school will update this record.',
    office: 'Accounts office', hours: 'Sunday to Thursday, 08:00–14:00', place: 'Main building, ground floor', call: 'Call accounts office',
    updated: 'Record last updated by the school on 25 Nov 2026', question: 'A question about a fee?', ask: 'Message the accounts office', yearPaid: 'of the year paid',
  },
  ar: {
    title: 'الرسوم', sub: 'سجل الرسوم المدرسية للعام 2026-2027',
    total: 'إجمالي العام', paid: 'المدفوع', remaining: 'المتبقي', overdue: 'متأخر السداد', overdueHint: 'قسط واحد', paidHint: 'قسطان من 6 أقساط', remHint: 'القسط التالي: 2 ديسمبر 2026',
    totalHint: 'خطتان',
    overdueTitle: 'يوجد قسط متأخر السداد', overdueBody: 'القسط الثاني من 3 للحافلة المدرسية (6,000 ج.م) كان مستحقًا في 15 نوفمبر 2026. يُرجى زيارة مكتب الحسابات أو التواصل مع المدرسة.',
    instalments: 'الأقساط', instalment: (n: number, of: number) => `القسط ${n} من ${of}`,
    st: { paid: 'مدفوع', due: 'مستحق في 2 ديسمبر', overdue: 'متأخر', upcoming: 'قادم' } as Record<Status, string>,
    dueOn: 'تاريخ الاستحقاق', paidOn: 'دُفع في', receipt: 'الإيصال', download: 'تنزيل الإيصال', daysLeft: 'بعد 5 أيام', daysLate: 'متأخر 12 يومًا',
    planPaid: (p: string) => `دُفع ${p}`,
    payTitle: 'يتم الدفع في المدرسة', payBody: 'تعرض إنارة سجل الرسوم الخاص بالمدرسة فقط، ولا تتلقى أي مدفوعات. ادفع في مكتب الحسابات بمدرسة وادي النيل الدولية نقدًا أو بالبطاقة أو بتحويل بنكي، وستقوم المدرسة بتحديث هذا السجل.',
    office: 'مكتب الحسابات', hours: 'من الأحد إلى الخميس، 08:00–14:00', place: 'المبنى الرئيسي، الطابق الأرضي', call: 'الاتصال بمكتب الحسابات',
    updated: 'آخر تحديث للسجل من المدرسة في 25 نوفمبر 2026', question: 'هل لديك سؤال عن الرسوم؟', ask: 'راسل مكتب الحسابات', yearPaid: 'من رسوم العام مدفوعة',
  },
};

const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral'> = { paid: 'success', due: 'warning', overdue: 'danger', upcoming: 'neutral' };
const ICON: Record<Status, typeof CircleCheck> = { paid: CircleCheck, due: CalendarClock, overdue: TriangleAlert, upcoming: Clock3 };

export default function Fees() {
  const t = useT(T);
  const { lang } = usePreview();
  const all = PLANS.flatMap((p) => p.items);
  const total = all.reduce((s, i) => s + i.amount, 0);
  const paid = all.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const overdue = all.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const pct = Math.round((paid / total) * 100);

  const stats = [
    { label: t.total, value: egp(total, lang), hint: t.totalHint, cls: '' },
    { label: t.paid, value: egp(paid, lang), hint: t.paidHint, cls: 'text-success' },
    { label: t.remaining, value: egp(total - paid, lang), hint: t.remHint, cls: '' },
    { label: t.overdue, value: egp(overdue, lang), hint: t.overdueHint, cls: 'text-destructive' },
  ];

  return (
    <ParentShell title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChildChip />
          <p className="text-xs text-muted-foreground">{t.updated}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Card key={i} className={cn('p-4', i === 3 && 'border-destructive/30 bg-destructive-soft/40')}>
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
              <p className={cn('mt-1.5 text-lg font-extrabold tabular-nums leading-tight md:text-2xl', s.cls)}>{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </Card>
          ))}
        </div>

        <Alert tone="danger" icon={<TriangleAlert />} title={t.overdueTitle}>{t.overdueBody}</Alert>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="flex min-w-0 flex-col gap-4">
            <SectionTitle>{t.instalments}</SectionTitle>
            {PLANS.map((p) => {
              const pPaid = p.items.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
              const PlanIcon = p.icon === 'bus' ? Bus : GraduationCap;
              return (
                <Card key={p.id}>
                  <CardHeader className="flex-row items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><PlanIcon className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <CardTitle>{p.name[lang]}</CardTitle>
                      <CardDescription>{t.planPaid(`${egp(pPaid, lang)} / ${egp(p.total, lang)}`)}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <Progress value={(pPaid / p.total) * 100} size="sm" tone="success" />
                  </CardContent>
                  <ul className="divide-y border-t">
                    {p.items.map((it) => {
                      const Icon = ICON[it.status];
                      return (
                        <li key={it.n} className={cn('flex gap-3 px-5 py-3.5', it.status === 'overdue' && 'bg-destructive-soft/40')}>
                          <Icon className={cn('mt-0.5 size-5 shrink-0 sm:mt-2.5', { paid: 'text-success', due: 'text-warning', overdue: 'text-destructive', upcoming: 'text-muted-foreground' }[it.status])} aria-hidden />
                          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{t.instalment(it.n, it.of)}</p>
                              <p className="text-xs text-muted-foreground">
                                {it.status === 'paid' && it.paidOn ? `${t.paidOn} ${it.paidOn[lang]} · ${t.receipt} ${it.receipt}` : `${t.dueOn} ${it.date[lang]}`}
                                {it.status === 'due' && ` · ${t.daysLeft}`}
                                {it.status === 'overdue' && ` · ${t.daysLate}`}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="text-sm font-bold tabular-nums">{egp(it.amount, lang)}</span>
                              <Badge tone={TONE[it.status]}><Icon />{t.st[it.status]}</Badge>
                              {it.status === 'paid' && <Button variant="outline" size="sm"><Download />{t.download}</Button>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </section>

          <aside className="flex flex-col gap-4">
            <Card className="border-primary/20 bg-secondary/60">
              <CardHeader className="flex-row items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Landmark className="size-5" /></span>
                <div><CardTitle>{t.payTitle}</CardTitle><CardDescription className="mt-1.5 leading-relaxed">{t.payBody}</CardDescription></div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Separator />
                <div className="text-sm">
                  <p className="font-bold">{t.office}</p>
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Clock3 className="size-4 shrink-0" />{t.hours}</p>
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground"><MapPin className="size-4 shrink-0" />{t.place}</p>
                </div>
                <Button variant="outline" className="w-full"><Phone />{t.call}</Button>
              </CardContent>
            </Card>
            <Card className="flex items-center gap-4 p-5">
              <Ring value={pct} size={72} tone="var(--success)">{num(pct, lang)}%</Ring>
              <div className="min-w-0">
                <p className="text-sm font-bold">{egp(paid, lang)}</p>
                <p className="text-xs text-muted-foreground">{t.yearPaid}</p>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-bold">{t.question}</p>
              <Button variant="link" className="mt-1 h-auto min-h-0 p-0"><MessageCircle />{t.ask}</Button>
            </Card>
          </aside>
        </div>
      </div>
    </ParentShell>
  );
}
