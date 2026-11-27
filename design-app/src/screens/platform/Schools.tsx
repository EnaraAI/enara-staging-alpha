import { useMemo, useState } from 'react';
import { Building2, CircleCheck, KeyRound, PauseCircle, Plug, RefreshCw, Unplug } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { errorText, put } from '@/lib/api';
import { Badge, Button, Card, Cell, Column, Row, SearchField, Select, Table, TableBody, TableHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';
import { dateShort, fetchCredits, fetchSchools, useLoad, type School } from './data';
import { EmptyBlock, ErrorBlock, LoadingBlock } from './states';

const T = {
  en: {
    title: 'Schools', sub: (s: string, l: string) => `${s} schools · ${l} learners`, subNoLearners: (s: string) => `${s} schools`, refresh: 'Refresh',
    search: 'Search by school or contact', status: 'Status', lms: 'LMS',
    allStatus: 'All statuses', allLms: 'Any LMS',
    st: { active: 'Active', suspended: 'Suspended' } as Record<string, string>,
    cName: 'School', cLearners: 'Learners', cStatus: 'Status', cLms: 'LMS', cKeys: 'API keys', cAdded: 'Added', cMore: 'Actions',
    lmsOn: 'LMS connected', lmsOff: 'No LMS', reactivate: 'Reactivate', reactivating: 'Reactivating…',
    kActive: 'Active', kSusp: 'Suspended', kLms: 'LMS connected', kLearners: 'Learners',
    learners: 'learners', keys: (n: string) => `${n} API keys`, added: (d: string) => `Added ${d}`,
    learnersCap: 'Counted from the first 1,000 students only.', learnersNa: 'Learner counts could not be loaded.',
    empty: 'No schools yet', emptyD: 'Schools added through Integrations will appear here.', noMatch: 'No school matches these filters',
    failed: 'The school list could not be loaded.', notReactivated: 'Not reactivated:',
  },
  ar: {
    title: 'المدارس', sub: (s: string, l: string) => `${s} مدرسة · ${l} طالبًا`, subNoLearners: (s: string) => `${s} مدرسة`, refresh: 'تحديث',
    search: 'ابحث باسم المدرسة أو جهة الاتصال', status: 'الحالة', lms: 'نظام إدارة التعلم',
    allStatus: 'كل الحالات', allLms: 'أي نظام',
    st: { active: 'نشطة', suspended: 'موقوفة' } as Record<string, string>,
    cName: 'المدرسة', cLearners: 'الطلاب', cStatus: 'الحالة', cLms: 'نظام التعلم', cKeys: 'مفاتيح API', cAdded: 'تاريخ الإضافة', cMore: 'إجراءات',
    lmsOn: 'نظام تعلم متصل', lmsOff: 'بلا نظام تعلم', reactivate: 'إعادة التفعيل', reactivating: 'جارٍ إعادة التفعيل…',
    kActive: 'نشطة', kSusp: 'موقوفة', kLms: 'نظام تعلم متصل', kLearners: 'الطلاب',
    learners: 'طالبًا', keys: (n: string) => `${n} مفاتيح API`, added: (d: string) => `أُضيفت في ${d}`,
    learnersCap: 'محسوبة من أول 1,000 طالب فقط.', learnersNa: 'تعذّر تحميل أعداد الطلاب.',
    empty: 'لا توجد مدارس بعد', emptyD: 'ستظهر هنا المدارس المضافة من صفحة التكاملات.', noMatch: 'لا توجد مدرسة تطابق هذه التصفية',
    failed: 'تعذّر تحميل قائمة المدارس.', notReactivated: 'لم تُعَد للتفعيل:',
  },
};

const TONE: Record<string, 'success' | 'danger' | 'outline'> = { active: 'success', suspended: 'danger' };

export default function PlatformSchools() {
  const t = useT(T);
  const { lang } = usePreview();
  const schools = useLoad((signal) => fetchSchools(signal));
  // Learner counts come from the credits report; the list still shows when it fails.
  const credits = useLoad((signal) => fetchCredits(signal));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [lms, setLms] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; error: unknown } | null>(null);

  const list = schools.data ?? [];
  const learners = (s: School) => credits.data?.learnersBySchool.get(s.id) ?? 0;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((s) => (status === 'all' || s.status === status) && (lms === 'all' || (lms === 'on' ? !!s.lms : !s.lms))
      && (!needle || s.name.toLowerCase().includes(needle) || s.contact.toLowerCase().includes(needle) || s.lms.toLowerCase().includes(needle)));
  }, [list, q, status, lms]);

  const reactivate = async (s: School) => {
    setBusy(s.id); setActionError(null);
    try { await put(`/api/integrations/institutions/${encodeURIComponent(s.id)}/status`, { status: 'active' }); schools.reload(); }
    catch (e) { setActionError({ id: s.id, error: e }); }
    finally { setBusy(null); }
  };

  const stItems = [{ id: 'all', name: t.allStatus }, { id: 'active', name: t.st.active }, { id: 'suspended', name: t.st.suspended }];
  const lmsItems = [{ id: 'all', name: t.allLms }, { id: 'on', name: t.lmsOn }, { id: 'off', name: t.lmsOff }];
  const learnersTotal = credits.data ? credits.data.learners : null;
  const kpis = [
    { label: t.kActive, value: num(list.filter((s) => s.status === 'active').length, lang), tone: 'bg-success' },
    { label: t.kSusp, value: num(list.filter((s) => s.status === 'suspended').length, lang), tone: 'bg-destructive' },
    { label: t.kLms, value: num(list.filter((s) => !!s.lms).length, lang), tone: 'bg-primary' },
    { label: t.kLearners, value: learnersTotal == null ? '—' : `${num(learnersTotal, lang)}${credits.data?.truncated ? '+' : ''}`, tone: 'bg-info' },
  ];
  const subtitle = schools.data ? (learnersTotal == null ? t.subNoLearners(num(list.length, lang)) : t.sub(num(list.length, lang), `${num(learnersTotal, lang)}${credits.data?.truncated ? '+' : ''}`)) : undefined;

  const Lms = ({ s }: { s: School }) => (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', s.lms ? 'text-foreground' : 'text-muted-foreground')}>
      {s.lms ? <Plug className="size-3.5 text-success" /> : <Unplug className="size-3.5" />}{s.lms ? <bdi>{s.lms}</bdi> : t.lmsOff}
    </span>
  );
  const StatusBadge = ({ s }: { s: School }) => <Badge tone={TONE[s.status] ?? 'outline'}>{s.status === 'suspended' ? <PauseCircle /> : <CircleCheck />}{t.st[s.status] ?? s.status}</Badge>;
  const sub = (s: School) => [s.contact, s.createdAt ? t.added(dateShort(s.createdAt, lang)) : ''].filter(Boolean).join(' · ');
  const Learners = ({ s }: { s: School }) => <>{credits.data ? num(learners(s), lang) : '—'}</>;
  const Action = ({ s, full }: { s: School; full?: boolean }) => s.status === 'suspended'
    ? <Button variant="outline" size="sm" className={full ? 'w-full' : undefined} isDisabled={busy === s.id} onPress={() => void reactivate(s)}>{busy === s.id ? t.reactivating : t.reactivate}</Button>
    : null;
  const ActionError = ({ s }: { s: School }) => actionError?.id === s.id ? <p role="alert" className="text-xs text-destructive">{t.notReactivated} {errorText(actionError.error, lang)}</p> : null;

  let body;
  if (schools.loading && !schools.data) body = <LoadingBlock rows={5} />;
  else if (schools.error && !schools.data) body = <ErrorBlock error={schools.error} onRetry={schools.reload} title={t.failed} />;
  else if (!list.length) body = <EmptyBlock icon={<Building2 />} title={t.empty}>{t.emptyD}</EmptyBlock>;
  else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="flex items-center gap-3 p-3.5">
              <span className={cn('h-8 w-1 rounded-full', k.tone)} />
              <div><p className="text-xs font-semibold text-muted-foreground">{k.label}</p><p className="text-xl font-bold tabular-nums">{k.value}</p></div>
            </Card>
          ))}
        </div>
        {credits.data?.truncated && <p className="-mt-2 text-xs text-muted-foreground">{t.learnersCap}</p>}
        {credits.error != null && !credits.data && (
          <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{t.learnersNa}<Button size="sm" variant="ghost" onPress={credits.reload}><RefreshCw />{t.refresh}</Button></p>
        )}
        {schools.error != null && <ErrorBlock error={schools.error} onRetry={schools.reload} title={t.failed} />}

        <Card className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          <SearchField aria-label={t.search} placeholder={t.search} className="md:flex-1" value={q} onChange={setQ} />
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Select aria-label={t.status} items={stItems} selectedKey={status} onSelectionChange={(k) => setStatus(String(k ?? 'all'))} className="md:w-40" />
            <Select aria-label={t.lms} items={lmsItems} selectedKey={lms} onSelectionChange={(k) => setLms(String(k ?? 'all'))} className="md:w-44" />
          </div>
        </Card>

        {!shown.length ? <EmptyBlock title={t.noMatch} /> : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto md:block">
              <Table aria-label={t.title}>
                <TableHeader>
                  <Column isRowHeader>{t.cName}</Column><Column className="text-end">{t.cLearners}</Column><Column>{t.cStatus}</Column><Column>{t.cLms}</Column><Column className="text-end">{t.cKeys}</Column><Column><span className="sr-only">{t.cMore}</span></Column>
                </TableHeader>
                <TableBody>
                  {shown.map((s) => (
                    <Row key={s.id} id={s.id} className={cn(s.status === 'suspended' && 'bg-destructive-soft/40')}>
                      <Cell>
                        <div className="flex items-center gap-3">
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', s.status === 'suspended' ? 'bg-destructive-soft text-destructive' : 'bg-secondary text-primary')}><Building2 className="size-4" /></span>
                          <div className="min-w-0"><p dir="auto" className="font-semibold">{s.name}</p>{sub(s) && <p className="text-xs text-muted-foreground">{sub(s)}</p>}<ActionError s={s} /></div>
                        </div>
                      </Cell>
                      <Cell className="text-end tabular-nums"><Learners s={s} /></Cell>
                      <Cell><StatusBadge s={s} /></Cell>
                      <Cell><Lms s={s} /></Cell>
                      <Cell className="text-end tabular-nums">{num(s.apiKeys, lang)}</Cell>
                      <Cell className="text-end"><Action s={s} /></Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Phone cards */}
            <ul className="flex flex-col gap-2 md:hidden">
              {shown.map((s) => (
                <li key={s.id}>
                  <Card className={cn('flex flex-col gap-2.5 p-3', s.status === 'suspended' && 'border-destructive/40 bg-destructive-soft/40')}>
                    <div className="flex items-start gap-3">
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', s.status === 'suspended' ? 'bg-destructive-soft text-destructive' : 'bg-secondary text-primary')}><Building2 className="size-4" /></span>
                      <div className="min-w-0 flex-1"><p dir="auto" className="break-words text-sm font-semibold leading-snug">{s.name}</p>{sub(s) && <p className="break-words text-xs text-muted-foreground">{sub(s)}</p>}</div>
                      <StatusBadge s={s} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="tabular-nums"><Learners s={s} /> {t.learners}</span>
                      <Lms s={s} />
                      <span className="inline-flex items-center gap-1"><KeyRound className="size-3.5" />{t.keys(num(s.apiKeys, lang))}</span>
                    </div>
                    <ActionError s={s} />
                    <Action s={s} full />
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <PlatformShell active="schools" title={t.title} subtitle={subtitle}
      actions={<Button size="sm" variant="outline" aria-label={t.refresh} onPress={() => { schools.reload(); credits.reload(); }}><RefreshCw /><span className="hidden sm:inline">{t.refresh}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">{body}</div>
    </PlatformShell>
  );
}
