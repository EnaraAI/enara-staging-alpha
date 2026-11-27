import { useState } from 'react';
import { Bus, CalendarClock, CircleCheck, CircleMinus, Download, GraduationCap, Landmark, Lock, MessageCircle, Receipt, TriangleAlert } from 'lucide-react';
import { API_BASE, ApiError, get, getToken } from '@/lib/api';
import { useT, usePreview, egp, num, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Ring, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildChip, ChildGate, ParentShell, SchoolTabs } from './B_common';
import {
  CalmState, cairoToday, daysBetween, ep, ErrorState, fmtDay, fmtStamp, friendly, isFeesMainOnly, isOff, OffState, useChildren, useLoad,
  type Children, type FeeStatus, type FeesResp, type Instalment, type LearnerChip,
} from './data';

const T = {
  en: {
    title: 'Fees', sub: 'The school’s fee record',
    total: 'Total', paid: 'Paid', remaining: 'Remaining', overdue: 'Overdue', plans: (n: number) => (n === 1 ? '1 plan' : `${n} plans`),
    paidHint: (a: number, b: number) => `${a} of ${b} instalments`, remHint: (d: string) => `Next: ${d}`, noneDue: 'Nothing due',
    overdueHint: (n: number) => (n === 1 ? '1 instalment' : `${n} instalments`), waivedHint: (a: string) => `${a} waived`,
    overdueTitle: (n: number) => (n === 1 ? 'One instalment is overdue' : `${n} instalments are overdue`),
    overdueBody: (plan: string, n: number, of: number, amt: string, d: string) => `${plan}, instalment ${n} of ${of} (${amt}) was due on ${d}. Please visit the accounts office or contact the school.`,
    instalments: 'Instalments', instalment: (n: number, of: number) => `Instalment ${n} of ${of}`,
    st: { paid: 'Paid', due: 'Due', overdue: 'Overdue', waived: 'Waived' } as Record<FeeStatus, string>,
    dueOn: 'Due', paidOn: 'Paid on', receipt: 'Receipt', download: 'Download receipt', downloading: 'Downloading…',
    inDays: (n: number) => (n === 0 ? 'due today' : n === 1 ? 'in 1 day' : `in ${n} days`), daysLate: (n: number) => (n === 1 ? '1 day late' : `${n} days late`),
    planPaid: (p: string) => `${p} paid`,
    payTitle: 'Payment is made at the school', payBody: (s: string) => `ENARA shows the school’s fee record only. It does not take payments. Pay at ${s || 'the school'}, and the school will update this record.`,
    updated: (d: string) => `Record last updated by the school on ${d}`, question: 'A question about a fee?', ask: 'Ask the school', yearPaid: 'of the total paid',
    empty: 'No fee record yet', emptyBody: 'When the school adds this child’s fees, they will appear here.',
    mainOnly: 'Fees are shown to the main guardian only', mainOnlyBody: 'The school has chosen to show fees only to the guardian who pays them. Please ask them or the school office.',
    receiptErr: 'The receipt could not be downloaded.',
  },
  ar: {
    title: 'الرسوم', sub: 'سجل الرسوم في المدرسة',
    total: 'الإجمالي', paid: 'المدفوع', remaining: 'المتبقي', overdue: 'متأخر السداد', plans: (n: number) => (n === 1 ? 'خطة واحدة' : n === 2 ? 'خطتان' : `${n} خطط`),
    paidHint: (a: number, b: number) => `${a} من ${b} أقساط`, remHint: (d: string) => `القسط التالي: ${d}`, noneDue: 'لا شيء مستحق',
    overdueHint: (n: number) => (n === 1 ? 'قسط واحد' : `${n} أقساط`), waivedHint: (a: string) => `معفى: ${a}`,
    overdueTitle: (n: number) => (n === 1 ? 'يوجد قسط متأخر السداد' : `يوجد ${n} أقساط متأخرة السداد`),
    overdueBody: (plan: string, n: number, of: number, amt: string, d: string) => `القسط ${n} من ${of} في ${plan} (${amt}) كان مستحقًا في ${d}. يُرجى زيارة مكتب الحسابات أو التواصل مع المدرسة.`,
    instalments: 'الأقساط', instalment: (n: number, of: number) => `القسط ${n} من ${of}`,
    st: { paid: 'مدفوع', due: 'مستحق', overdue: 'متأخر', waived: 'معفى' } as Record<FeeStatus, string>,
    dueOn: 'تاريخ الاستحقاق', paidOn: 'دُفع في', receipt: 'الإيصال', download: 'تنزيل الإيصال', downloading: 'جارٍ التنزيل…',
    inDays: (n: number) => (n === 0 ? 'مستحق اليوم' : n === 1 ? 'بعد يوم واحد' : `بعد ${n} أيام`), daysLate: (n: number) => (n === 1 ? 'متأخر يومًا واحدًا' : `متأخر ${n} يومًا`),
    planPaid: (p: string) => `دُفع ${p}`,
    payTitle: 'يتم الدفع في المدرسة', payBody: (s: string) => `تعرض إنارة سجل الرسوم الخاص بالمدرسة فقط، ولا تتلقى أي مدفوعات. ادفع في ${s || 'المدرسة'}، وستقوم المدرسة بتحديث هذا السجل.`,
    updated: (d: string) => `آخر تحديث للسجل من المدرسة في ${d}`, question: 'هل لديك سؤال عن الرسوم؟', ask: 'اسأل المدرسة', yearPaid: 'من الإجمالي مدفوع',
    empty: 'لا يوجد سجل رسوم بعد', emptyBody: 'عندما تضيف المدرسة رسوم هذا الابن أو الابنة، ستظهر هنا.',
    mainOnly: 'تُعرض الرسوم لولي الأمر الرئيسي فقط', mainOnlyBody: 'اختارت المدرسة أن تعرض الرسوم لولي الأمر الذي يدفعها فقط. يُرجى سؤاله أو سؤال مكتب المدرسة.',
    receiptErr: 'تعذّر تنزيل الإيصال.',
  },
};
type TT = (typeof T)['en'];

const TONE: Record<FeeStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { paid: 'success', due: 'warning', overdue: 'danger', waived: 'neutral' };
const ICON: Record<FeeStatus, typeof CircleCheck> = { paid: CircleCheck, due: CalendarClock, overdue: TriangleAlert, waived: CircleMinus };
const COLOR: Record<FeeStatus, string> = { paid: 'text-success', due: 'text-warning', overdue: 'text-destructive', waived: 'text-muted-foreground' };
const statusOf = (s: unknown): FeeStatus => (s === 'paid' || s === 'due' || s === 'overdue' || s === 'waived' ? s : 'due');

export default function Fees() {
  const t = useT(T);
  const kids = useChildren();
  return (
    <ParentShell active="school" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <ChildGate kids={kids}>
          {(child) => <FeesBody key={child.studentId} child={child} kids={kids} />}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

function FeesBody({ child, kids }: { child: LearnerChip; kids: Children }) {
  const t = useT(T);
  const { lang } = usePreview();
  const q = useLoad((signal) => get<FeesResp>(ep.fees(child.studentId), signal), [child.studentId]);
  const updated = q.data?.source?.updatedAt ? fmtStamp(q.data.source.updatedAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChildChip kids={kids} />
        {updated && <p className="text-xs text-muted-foreground">{t.updated(updated)}</p>}
      </div>
      <SchoolTabs active="fees" />
      {q.loading ? <FeesSkeleton />
        : isOff(q.error) ? <OffState />
        : isFeesMainOnly(q.error) ? <CalmState icon={<Lock />} title={t.mainOnly} body={t.mainOnlyBody} />
        : q.error || !q.data ? <ErrorState error={q.error} onRetry={q.reload} />
        : !(q.data.plans ?? []).some((p) => p?.instalments?.length) ? <CalmState icon={<Receipt />} title={t.empty} body={t.emptyBody} />
        : <FeesView data={q.data} child={child} t={t} lang={lang} />}
    </>
  );
}

function FeesSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" data-testid="parent-loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
    </div>
  );
}

function FeesView({ data, child, t, lang }: { data: FeesResp; child: LearnerChip; t: TT; lang: Lang }) {
  const today = cairoToday();
  const plans = (data.plans ?? []).filter((p) => p?.instalments?.length);
  const all = plans.flatMap((p) => (p.instalments ?? []).map((i) => ({ i, plan: p.name ?? '', of: p.instalments?.length ?? 0 })));
  const tot = data.totals ?? {};
  const total = tot.total ?? 0, paid = tot.paid ?? 0, waived = tot.waived ?? 0;
  const remaining = tot.remaining ?? Math.max(0, total - paid - waived), overdueAmt = tot.overdue ?? 0;
  const overdue = all.filter((x) => statusOf(x.i.status) === 'overdue');
  const paidCount = all.filter((x) => statusOf(x.i.status) === 'paid').length;
  const payable = total - waived;
  const pct = payable > 0 ? Math.round((paid / payable) * 100) : 0;
  const stats = [
    { label: t.total, value: egp(total, lang), hint: waived ? t.waivedHint(egp(waived, lang)) : t.plans(plans.length), cls: '' },
    { label: t.paid, value: egp(paid, lang), hint: t.paidHint(paidCount, all.length), cls: 'text-success' },
    { label: t.remaining, value: egp(remaining, lang), hint: data.next?.dueDate ? t.remHint(fmtDay(data.next.dueDate, lang)) : t.noneDue, cls: '' },
    { label: t.overdue, value: egp(overdueAmt, lang), hint: t.overdueHint(overdue.length), cls: overdueAmt ? 'text-destructive' : '' },
  ];
  const first = overdue[0];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={i} className={cn('min-w-0 p-4', i === 3 && overdueAmt > 0 && 'border-destructive/30 bg-destructive-soft/40')}>
            <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
            <p className={cn('mt-1.5 break-words text-lg font-extrabold tabular-nums leading-tight md:text-2xl', s.cls)}>{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
          </Card>
        ))}
      </div>

      {first && (
        <Alert tone="danger" icon={<TriangleAlert />} title={t.overdueTitle(overdue.length)}>
          {t.overdueBody(first.plan, first.i.number ?? 0, first.of, egp(first.i.amount ?? 0, lang), fmtDay(first.i.dueDate, lang))}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <SectionTitle>{t.instalments}</SectionTitle>
          {plans.map((p, pi) => {
            const pt = p.totals ?? {};
            const pPayable = (pt.total ?? 0) - (pt.waived ?? 0);
            const PlanIcon = /bus|حافل|نقل|transport/i.test(p.name ?? '') ? Bus : GraduationCap;
            const of = p.instalments?.length ?? 0;
            return (
              <Card key={`${p.name}-${pi}`}>
                <CardHeader className="flex-row items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><PlanIcon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <CardTitle>{[p.name, p.academicYear].filter(Boolean).join(' · ')}</CardTitle>
                    <CardDescription>{t.planPaid(`${egp(pt.paid ?? 0, lang)} / ${egp(pt.total ?? 0, lang)}`)}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <Progress value={pPayable > 0 ? Math.min(100, ((pt.paid ?? 0) / pPayable) * 100) : 0} size="sm" tone="success" ariaLabel={t.planPaid(p.name ?? '')} />
                </CardContent>
                <ul className="divide-y border-t">
                  {(p.instalments ?? []).map((it) => <InstalmentRow key={it.id} it={it} of={of} studentId={child.studentId} today={today} t={t} lang={lang} />)}
                </ul>
              </Card>
            );
          })}
        </section>

        <aside className="flex flex-col gap-4">
          <Card className="border-primary/20 bg-secondary/60">
            <CardHeader className="flex-row items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Landmark className="size-5" /></span>
              <div><CardTitle>{t.payTitle}</CardTitle><CardDescription className="mt-1.5 leading-relaxed">{t.payBody(child.school ?? '')}</CardDescription></div>
            </CardHeader>
          </Card>
          <Card className="flex items-center gap-4 p-5">
            <Ring value={Math.min(100, pct)} size={72} tone="var(--success)" ariaLabel={`${pct}% ${t.yearPaid}`}>{num(pct, lang)}%</Ring>
            <div className="min-w-0">
              <p className="text-sm font-bold">{egp(paid, lang)}</p>
              <p className="text-xs text-muted-foreground">{t.yearPaid}</p>
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-bold">{t.question}</p>
            <a href="#/parent/chat" className="mt-1 inline-flex min-h-tap items-center gap-2 text-sm font-semibold text-primary"><MessageCircle className="size-4" />{t.ask}</a>
          </Card>
        </aside>
      </div>
    </>
  );
}

function InstalmentRow({ it, of, studentId, today, t, lang }: { it: Instalment; of: number; studentId: string; today: string; t: TT; lang: Lang }) {
  const s = statusOf(it.status);
  const Icon = ICON[s];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const due = it.dueDate ? daysBetween(today, it.dueDate) : null;
  const line = s === 'paid'
    ? [it.paidDate ? `${t.paidOn} ${fmtDay(it.paidDate, lang)}` : '', it.receiptRef ? `${t.receipt} ${it.receiptRef}` : ''].filter(Boolean).join(' · ')
    : [it.dueDate ? `${t.dueOn} ${fmtDay(it.dueDate, lang)}` : '', s === 'due' && due !== null && due >= 0 ? t.inDays(due) : '', s === 'overdue' && due !== null && due < 0 ? t.daysLate(-due) : ''].filter(Boolean).join(' · ');
  const download = async () => {
    setBusy(true); setErr(null);
    try { await saveReceipt(studentId, it); } catch (e) { setErr(e instanceof ApiError && e.status < 500 && e.status !== 0 ? `${t.receiptErr} ${friendly(e, lang)}` : t.receiptErr); } finally { setBusy(false); }
  };
  return (
    <li className={cn('flex gap-3 px-5 py-3.5', s === 'overdue' && 'bg-destructive-soft/40')}>
      <Icon className={cn('mt-0.5 size-5 shrink-0 sm:mt-2.5', COLOR[s])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t.instalment(it.number ?? 0, of)}</p>
          {line && <p className="text-xs text-muted-foreground">{line}</p>}
          {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-bold tabular-nums">{egp(it.amount ?? 0, lang)}</span>
          <Badge tone={TONE[s]}><Icon />{t.st[s]}</Badge>
          {s === 'paid' && it.hasReceipt && <Button variant="outline" size="sm" onPress={download} isDisabled={busy}><Download />{busy ? t.downloading : t.download}</Button>}
        </div>
      </div>
    </li>
  );
}

/** The receipt file needs the sign-in token, so it is fetched and saved from a blob (never opened by URL). */
async function saveReceipt(studentId: string, it: Instalment) {
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(API_BASE + ep.receipt(studentId, it.id), { credentials: 'omit', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch { throw new ApiError('offline', 0, 'NETWORK'); }
  if (!res.ok) {
    let code: string | undefined; let message = `HTTP ${res.status}`;
    try { const b = await res.json(); code = b?.error?.code; message = b?.error?.message ?? message; } catch { /* not JSON */ }
    throw new ApiError(message, res.status, code);
  }
  const blob = await res.blob();
  const type = blob.type || res.headers.get('Content-Type') || '';
  const ext = /pdf/.test(type) ? 'pdf' : /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : 'bin';
  const fromHeader = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fromHeader || `receipt-${(it.receiptRef || it.id).replace(/[^\w.-]+/g, '_')}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

