import * as React from 'react';
import { ArrowLeft, CalendarClock, ChevronRight, Clock, FileText, LogOut, MessageSquare, Send, UserRound, Users, Inbox, Bot, CircleCheck, TriangleAlert, Loader2, Info } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { errorText, post } from '@/lib/api';
import { Alert, Avatar, Badge, Button, Card, Dir, SearchField, Select, Toggle, inputClass } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell, ROUTE } from './SchoolShell';
import { EmptyState, ErrorState, ListSkeleton, fmtDate, fmtWhen, hoursSince, n0, refreshRequestCounts, useApi, useScope, type ReqList, type ReqRow, type ReqStatus, type ReqType, type Status } from './data';

const STATUSES: ReqStatus[] = ['new', 'in_progress', 'done', 'refused', 'cancelled'];
const TYPES: ReqType[] = ['certificate', 'early_leave', 'teacher_meeting', 'other'];

const T = {
  en: {
    title: 'Requests', sub: (n: string) => `${n} open · parents send these from the app`, search: 'Search learner or text',
    all: 'All', st: { new: 'New', in_progress: 'In progress', done: 'Done', refused: 'Refused', cancelled: 'Cancelled by the parent' } as Record<string, string>,
    kind: { certificate: 'Enrolment certificate', early_leave: 'Early leave', teacher_meeting: 'Meeting with a teacher', other: 'Other' } as Record<string, string>,
    type: 'Type', allTypes: 'All types', waiting: 'Waiting over 48 h', viaChat: 'Through the assistant',
    reqFor: 'For', opened: (w: string) => `Opened ${w}`, preferred: (d: string) => `Preferred date: ${d}`,
    status: 'Status', parent: 'Parent', school: 'School',
    sys: (s: string, w: string) => `Status set to ${s} · ${w}`, cancelledBy: (w: string) => `The parent cancelled this request · ${w}`,
    reply: 'Reply to the parent', replyPh: 'Write a reply. The parent sees it in the app.',
    send: 'Send reply', saveStatus: 'Save status', sendDone: 'Send and mark done', visible: 'The parent sees your replies and the status in the app, and gets a notification when Notifications is on.',
    refusedNeedsReply: 'Write the reason before refusing.', saved: 'Saved. The parent can see it now.', cancelledNote: 'The parent cancelled this request. It can no longer be answered.',
    none: 'No requests here', noneD: 'Requests parents send from the app show here.', noMatch: 'No request matches your search.',
    pick: 'Choose a request', pickD: 'Open a request on the start side to read it and reply.', back: 'All requests',
    off: 'The Requests section is off for your school, so parents cannot send new requests.', turnOn: 'Open Parents app',
    assigneeNA: 'Assigning to a colleague: not available yet',
  },
  ar: {
    title: 'الطلبات', sub: (n: string) => `${n} طلبات مفتوحة · يرسلها أولياء الأمور من التطبيق`, search: 'ابحث عن طالب أو نص',
    all: 'الكل', st: { new: 'جديد', in_progress: 'قيد التنفيذ', done: 'مكتمل', refused: 'مرفوض', cancelled: 'ألغاه وليّ الأمر' } as Record<string, string>,
    kind: { certificate: 'شهادة قيد', early_leave: 'انصراف مبكر', teacher_meeting: 'لقاء مع معلّم', other: 'طلب آخر' } as Record<string, string>,
    type: 'النوع', allTypes: 'كل الأنواع', waiting: 'ينتظر أكثر من 48 ساعة', viaChat: 'عبر المساعد',
    reqFor: 'بشأن', opened: (w: string) => `فُتح ${w}`, preferred: (d: string) => `التاريخ المفضّل: ${d}`,
    status: 'الحالة', parent: 'وليّ الأمر', school: 'المدرسة',
    sys: (s: string, w: string) => `تغيّرت الحالة إلى ${s} · ${w}`, cancelledBy: (w: string) => `ألغى وليّ الأمر هذا الطلب · ${w}`,
    reply: 'الرد على وليّ الأمر', replyPh: 'اكتب ردًّا يراه وليّ الأمر في التطبيق.',
    send: 'إرسال الرد', saveStatus: 'حفظ الحالة', sendDone: 'إرسال وإنهاء الطلب', visible: 'يرى وليّ الأمر ردودك والحالة في التطبيق، ويصله إشعار عندما يكون قسم الإشعارات مفعّلًا.',
    refusedNeedsReply: 'اكتب السبب قبل الرفض.', saved: 'تم الحفظ، ويستطيع وليّ الأمر رؤيته الآن.', cancelledNote: 'ألغى وليّ الأمر هذا الطلب، فلا يمكن الرد عليه.',
    none: 'لا طلبات هنا', noneD: 'تظهر هنا الطلبات التي يرسلها أولياء الأمور من التطبيق.', noMatch: 'لا يوجد طلب يطابق بحثك.',
    pick: 'اختر طلبًا', pickD: 'افتح طلبًا من القائمة لقراءته والرد عليه.', back: 'جميع الطلبات',
    off: 'قسم الطلبات متوقف في مدرستك، فلا يستطيع أولياء الأمور إرسال طلبات جديدة.', turnOn: 'فتح تطبيق أولياء الأمور',
    assigneeNA: 'الإحالة إلى زميل: غير متاحة بعد',
  },
};

const KIND_ICON: Record<string, React.ReactNode> = { certificate: <FileText />, early_leave: <LogOut className="rtl:-scale-x-100" />, teacher_meeting: <Users />, other: <MessageSquare /> };
const TONE: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = { new: 'info', in_progress: 'warning', done: 'success', refused: 'danger', cancelled: 'neutral' };
const isOpen = (r: ReqRow) => r?.status === 'new' || r?.status === 'in_progress';

// Data: GET /api/school-app/status (Requests section on/off), GET /api/school-app/requests?status=… (counts of every status + up to 300 rows).
// Write (on "Send reply" / "Save status" / "Send and mark done"): POST /api/school-app/requests/:id { status, reply }.
export default function SchoolRequests() {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const nb = (n: number) => num(n, lang);
  const status = useApi<Status>(scope.path('/api/school-app/status'));
  const [filter, setFilter] = React.useState<ReqStatus | 'all'>('all');
  const data = useApi<ReqList>(scope.path(`/api/school-app/requests${filter === 'all' ? '' : `?status=${filter}`}`));
  const [q, setQ] = React.useState('');
  const [type, setType] = React.useState<string>('all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const autoOpened = React.useRef(false);

  const counts = data.data?.counts ?? {};
  const openCount = n0(counts.new) + n0(counts.in_progress);
  const needle = q.trim().toLowerCase();
  const all = data.data?.requests ?? [];
  const list = all.filter((r) => (type === 'all' || r?.type === type) && (!needle || [r?.studentName, r?.details, r?.id, r?.reply].some((x) => String(x ?? '').toLowerCase().includes(needle))));
  const open = all.find((r) => r?.id === openId) ?? null;

  // Desktop: open the first request once, like the approved design. Phone: the list stays until the admin taps one.
  React.useEffect(() => {
    if (autoOpened.current || !all.length) return;
    autoOpened.current = true;
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches) setOpenId(all[0]?.id ?? null);
  }, [all]);

  const types = [{ id: 'all', name: t.allTypes }, ...TYPES.map((k) => ({ id: k, name: t.kind[k] }))];
  const loading = data.loading && !data.data;

  return (
    <SchoolShell active="requests" title={t.title} subtitle={data.data ? t.sub(nb(openCount)) : undefined}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {status.data && !status.data.sections?.requests && status.data.institutionId && (
          <Alert tone="info" icon={<Info />}>{t.off} <a className="font-semibold text-primary underline underline-offset-2" href={scope.href(ROUTE.parents)}>{t.turnOn}</a></Alert>
        )}
        <div className="flex flex-col gap-4 lg:h-[calc(100vh-9rem)] lg:flex-row">
          {/* Inbox */}
          <div className={cn('flex min-w-0 flex-col gap-3 lg:w-[380px] lg:shrink-0', open && 'hidden lg:flex')}>
            <div className="flex gap-2">
              <SearchField aria-label={t.search} placeholder={t.search} value={q} onChange={setQ} className="min-w-0 flex-1" />
              <Select aria-label={t.type} items={types} selectedKey={type} onSelectionChange={(k) => setType(k ? String(k) : 'all')} className="w-36 shrink-0 sm:w-40" />
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              <Toggle isSelected={filter === 'all'} onChange={() => setFilter('all')} className="shrink-0">{t.all}</Toggle>
              {STATUSES.map((s) => (
                <Toggle key={s} isSelected={filter === s} onChange={() => setFilter(s)} className="shrink-0">{s === 'cancelled' ? (lang === 'ar' ? 'ملغى' : 'Cancelled') : t.st[s]}{data.data && <span className="text-xs opacity-70 tabular-nums">{nb(n0(counts[s]))}</span>}</Toggle>
              ))}
            </div>
            {loading ? <ListSkeleton rows={5} /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : list.length === 0 ? (
              <Card><EmptyState icon={<Inbox />} title={all.length ? t.noMatch : t.none}>{all.length ? null : t.noneD}</EmptyState></Card>
            ) : (
              <Card className="min-h-0 flex-1 divide-y overflow-y-auto">
                {list.map((r, i) => {
                  const active = !!r?.id && r.id === openId;
                  const late = isOpen(r) && hoursSince(r?.createdAt) > 48;
                  return (
                    <button key={r?.id ?? i} type="button" onClick={() => setOpenId(r?.id ?? null)} aria-current={active ? 'true' : undefined} data-testid="request-row"
                      className={cn('flex w-full gap-3 px-3 py-3 text-start hover:bg-muted/60', active && 'bg-secondary lg:shadow-[inset_3px_0_0_var(--primary)] rtl:lg:shadow-[inset_-3px_0_0_var(--primary)]')}>
                      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{KIND_ICON[String(r?.type)] ?? <MessageSquare />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold"><bdi>{r?.studentName || '—'}</bdi></p>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmtWhen(r?.createdAt, lang)}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{t.kind[String(r?.type)] ?? String(r?.type ?? '')}{r?.via === 'chat' ? ` · ${t.viaChat}` : ''}</p>
                        <p className="mt-0.5 truncate text-xs" dir="auto">{r?.details ?? ''}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={TONE[String(r?.status)] ?? 'neutral'}>{t.st[String(r?.status)] ?? String(r?.status ?? '')}</Badge>
                          {late && <Badge tone="danger"><Clock />{t.waiting}</Badge>}
                        </div>
                      </div>
                      <Dir><ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground lg:hidden" /></Dir>
                    </button>
                  );
                })}
              </Card>
            )}
          </div>

          {/* Open request */}
          <Card className={cn('min-w-0 flex-1 flex-col overflow-hidden', open ? 'flex' : 'hidden lg:flex')}>
            {open ? <RequestDetail key={open.id} r={open} onSaved={() => { data.reload(); refreshRequestCounts(); }} onBack={() => setOpenId(null)} /> : (
              <div className="grid flex-1 place-items-center"><EmptyState icon={<Inbox />} title={t.pick}>{t.pickD}</EmptyState></div>
            )}
          </Card>
        </div>
      </div>
    </SchoolShell>
  );
}

function RequestDetail({ r, onSaved, onBack }: { r: ReqRow; onSaved: () => void; onBack: () => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const cancelled = r?.status === 'cancelled';
  const [st, setSt] = React.useState<string>(String(r?.status ?? 'new'));
  const [reply, setReply] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const statusItems = (['new', 'in_progress', 'done', 'refused'] as const).map((s) => ({ id: s, name: t.st[s] }));
  const changed = st !== r?.status;

  const save = async (status: string) => {
    if (!r?.id) return;
    setMsg(null);
    if (status === 'refused' && !reply.trim() && !r?.reply) { setMsg({ tone: 'danger', text: t.refusedNeedsReply }); return; }
    setBusy(true);
    try {
      await post(scope.path(`/api/school-app/requests/${encodeURIComponent(r.id)}`), { status, ...(reply.trim() ? { reply: reply.trim() } : {}) });
      setReply(''); setMsg({ tone: 'success', text: t.saved }); onSaved();
    } catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); }
    finally { setBusy(false); }
  };

  // The conversation: the parent's request, then each step of the history (school replies as bubbles, status changes as notes).
  const history = (r?.history ?? []).filter((h, i) => !(i === 0 && h?.by === 'parent' && h?.status === 'new'));
  return (
    <>
      <div className="flex flex-col gap-3 border-b p-4">
        <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary lg:hidden"><ArrowLeft className="size-4 rtl:-scale-x-100" />{t.back}</button>
        <div className="flex items-start gap-3">
          <Avatar name={r?.studentName || '?'} className="size-10" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold">{t.kind[String(r?.type)] ?? String(r?.type ?? '')}</h2>{r?.id && <Badge tone="outline" className="font-mono" title={r.id}>#{r.id.slice(-6)}</Badge>}{r?.via === 'chat' && <Badge tone="info"><Bot />{t.viaChat}</Badge>}</div>
            <p className="text-sm text-muted-foreground"><UserRound className="me-1 inline size-3.5 align-[-2px]" />{t.reqFor} <bdi>{r?.studentName || '—'}</bdi></p>
            <p className="text-xs text-muted-foreground"><CalendarClock className="me-1 inline size-3.5 align-[-2px]" />{t.opened(fmtWhen(r?.createdAt, lang, true))}{r?.preferredDate ? ` · ${t.preferred(fmtDate(r.preferredDate, lang, true))}` : ''}</p>
          </div>
        </div>
        {!cancelled && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label={t.status} items={statusItems} selectedKey={st} onSelectionChange={(k) => setSt(k ? String(k) : st)} isDisabled={busy} />
            <div className="flex flex-col justify-end pb-2"><span className="text-xs text-muted-foreground">{t.assigneeNA}</span></div>
          </div>
        )}
      </div>
      <div className="flex min-h-48 flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-4">
        <Bubble me={false} who={t.parent} time={fmtWhen(r?.createdAt, lang)} text={r?.details ?? ''} />
        {history.map((h, i) => {
          const when = fmtWhen(h?.at, lang);
          if (h?.by === 'parent' && h?.status === 'cancelled') return <SysNote key={i}>{t.cancelledBy(when)}</SysNote>;
          if (h?.by === 'school' && h?.note) return (
            <React.Fragment key={i}>
              <SysNote>{t.sys(t.st[String(h?.status)] ?? String(h?.status ?? ''), when)}</SysNote>
              <Bubble me who={t.school} time={when} text={h.note} />
            </React.Fragment>
          );
          return <SysNote key={i}>{t.sys(t.st[String(h?.status)] ?? String(h?.status ?? ''), when)}</SysNote>;
        })}
      </div>
      <div className="flex flex-col gap-2 border-t p-4">
        {msg && <Alert tone={msg.tone} icon={msg.tone === 'success' ? <CircleCheck /> : <TriangleAlert />}>{msg.text}</Alert>}
        {cancelled ? <p className="text-sm text-muted-foreground">{t.cancelledNote}</p> : (
          <>
            <textarea aria-label={t.reply} placeholder={t.replyPh} dir="auto" maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} className={cn(inputClass, 'h-24 py-2')} data-testid="reply" />
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 basis-48 text-[11px] text-muted-foreground">{t.visible}</p>
              <Button variant="outline" size="sm" isDisabled={busy || !reply.trim()} onPress={() => void save('done')}>{t.sendDone}</Button>
              <Button size="sm" isDisabled={busy || (!reply.trim() && !changed)} onPress={() => void save(st)} data-testid="send">{busy ? <Loader2 className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}{reply.trim() ? t.send : t.saveStatus}</Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const SysNote = ({ children }: { children: React.ReactNode }) => <p className="max-w-full self-center rounded-full bg-card px-3 py-1 text-center text-[11px] text-muted-foreground shadow-sm">{children}</p>;
function Bubble({ me, who, time, text }: { me: boolean; who: string; time: string; text: string }) {
  return (
    <div className={cn('flex max-w-[85%] flex-col gap-1', me ? 'items-end self-end' : 'items-start self-start')}>
      <span className="px-1 text-[11px] text-muted-foreground">{who} · {time}</span>
      <p className={cn('whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed', me ? 'rounded-se-sm bg-primary text-primary-foreground' : 'rounded-ss-sm border bg-card')} dir="auto">{text}</p>
    </div>
  );
}
