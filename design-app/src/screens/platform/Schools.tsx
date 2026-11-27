import { Building2, CircleCheck, Download, Ellipsis, PauseCircle, Plug, Plus, Unplug, Clock } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { Badge, Button, Card, Cell, Column, Row, SearchField, Select, Table, TableBody, TableHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PlatformShell } from './PlatformShell';

type Status = 'active' | 'suspended' | 'trial';
type Plan = 'core' | 'plus' | 'trial';
interface School { id: string; en: string; ar: string; city: { en: string; ar: string }; plan: Plan; learners: number; status: Status; lms: 'moodle' | 'excel'; last: { en: string; ar: string } }

const SCHOOLS: School[] = [
  { id: 'nvis', en: 'Nile Valley International School', ar: 'مدرسة وادي النيل الدولية', city: { en: 'New Cairo', ar: 'القاهرة الجديدة' }, plan: 'plus', learners: 1482, status: 'active', lms: 'moodle', last: { en: '2 min ago', ar: 'منذ دقيقتين' } },
  { id: 'alex', en: 'Alexandria Language School', ar: 'مدرسة الإسكندرية للغات', city: { en: 'Alexandria', ar: 'الإسكندرية' }, plan: 'core', learners: 964, status: 'active', lms: 'excel', last: { en: '14 min ago', ar: 'منذ 14 دقيقة' } },
  { id: 'misr', en: 'Misr Future Academy', ar: 'أكاديمية مصر المستقبل', city: { en: '6th of October', ar: 'السادس من أكتوبر' }, plan: 'plus', learners: 2210, status: 'active', lms: 'moodle', last: { en: '1 h ago', ar: 'منذ ساعة' } },
  { id: 'delta', en: 'Delta Bridges School', ar: 'مدرسة جسور الدلتا', city: { en: 'Mansoura', ar: 'المنصورة' }, plan: 'core', learners: 618, status: 'suspended', lms: 'excel', last: { en: '12 days ago', ar: 'منذ 12 يومًا' } },
  { id: 'sun', en: 'Sunrise Montessori', ar: 'مدرسة شروق مونتيسوري', city: { en: 'Sheikh Zayed', ar: 'الشيخ زايد' }, plan: 'trial', learners: 240, status: 'trial', lms: 'excel', last: { en: '3 h ago', ar: 'منذ 3 ساعات' } },
  { id: 'red', en: 'Red Sea STEM School', ar: 'مدرسة البحر الأحمر للعلوم والتكنولوجيا', city: { en: 'Hurghada', ar: 'الغردقة' }, plan: 'trial', learners: 410, status: 'trial', lms: 'moodle', last: { en: 'Yesterday', ar: 'أمس' } },
  { id: 'helio', en: 'Heliopolis British School', ar: 'مدرسة مصر الجديدة البريطانية', city: { en: 'Cairo', ar: 'القاهرة' }, plan: 'plus', learners: 1735, status: 'active', lms: 'moodle', last: { en: '6 min ago', ar: 'منذ 6 دقائق' } },
];

const T = {
  en: {
    title: 'Schools', sub: '7 schools · 7,659 learners', add: 'Add school', export: 'Export',
    search: 'Search by school or city', status: 'Status', plan: 'Plan', lms: 'LMS',
    allStatus: 'All statuses', allPlans: 'All plans', allLms: 'Any LMS',
    st: { active: 'Active', suspended: 'Suspended', trial: 'Trial' } as Record<Status, string>,
    pl: { core: 'Core', plus: 'Plus', trial: 'Trial' } as Record<Plan, string>,
    cName: 'School', cPlan: 'Plan', cLearners: 'Learners', cStatus: 'Status', cLms: 'LMS', cLast: 'Last activity', cMore: 'Actions',
    moodle: 'Moodle connected', excel: 'Excel only', trialEnds: 'Trial ends 14 Dec',
    suspendedWhy: 'Suspended 15 Nov · unpaid invoice', reactivate: 'Reactivate', more: 'More actions',
    kActive: 'Active', kTrial: 'On trial', kSusp: 'Suspended', kLms: 'Moodle connected', learners: 'learners',
  },
  ar: {
    title: 'المدارس', sub: '7 مدارس · 7,659 طالبًا', add: 'إضافة مدرسة', export: 'تصدير',
    search: 'ابحث باسم المدرسة أو المدينة', status: 'الحالة', plan: 'الباقة', lms: 'نظام إدارة التعلم',
    allStatus: 'كل الحالات', allPlans: 'كل الباقات', allLms: 'أي نظام',
    st: { active: 'نشطة', suspended: 'موقوفة', trial: 'تجريبية' } as Record<Status, string>,
    pl: { core: 'الأساسية', plus: 'المتقدمة', trial: 'تجريبية' } as Record<Plan, string>,
    cName: 'المدرسة', cPlan: 'الباقة', cLearners: 'الطلاب', cStatus: 'الحالة', cLms: 'نظام التعلم', cLast: 'آخر نشاط', cMore: 'إجراءات',
    moodle: 'Moodle متصل', excel: 'Excel فقط', trialEnds: 'تنتهي التجربة 14 ديسمبر',
    suspendedWhy: 'موقوفة منذ 15 نوفمبر · فاتورة غير مسددة', reactivate: 'إعادة التفعيل', more: 'إجراءات أخرى',
    kActive: 'نشطة', kTrial: 'تجريبية', kSusp: 'موقوفة', kLms: 'Moodle متصل', learners: 'طالبًا',
  },
};

const TONE: Record<Status, 'success' | 'danger' | 'info'> = { active: 'success', suspended: 'danger', trial: 'info' };

export default function PlatformSchools() {
  const t = useT(T);
  const { lang } = usePreview();
  const stItems = [{ id: 'all', name: t.allStatus }, ...(['active', 'trial', 'suspended'] as Status[]).map((s) => ({ id: s, name: t.st[s] }))];
  const plItems = [{ id: 'all', name: t.allPlans }, ...(['core', 'plus', 'trial'] as Plan[]).map((p) => ({ id: p, name: t.pl[p] }))];
  const lmsItems = [{ id: 'all', name: t.allLms }, { id: 'moodle', name: t.moodle }, { id: 'excel', name: t.excel }];
  const kpis = [
    { label: t.kActive, value: 4, tone: 'bg-success' },
    { label: t.kTrial, value: 2, tone: 'bg-info' },
    { label: t.kSusp, value: 1, tone: 'bg-destructive' },
    { label: t.kLms, value: 4, tone: 'bg-primary' },
  ];
  const Lms = ({ s }: { s: School }) => <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', s.lms === 'moodle' ? 'text-foreground' : 'text-muted-foreground')}>{s.lms === 'moodle' ? <Plug className="size-3.5 text-success" /> : <Unplug className="size-3.5" />}{s.lms === 'moodle' ? t.moodle : t.excel}</span>;
  const StatusBadge = ({ s }: { s: School }) => <Badge tone={TONE[s.status]}>{s.status === 'active' ? <CircleCheck /> : s.status === 'suspended' ? <PauseCircle /> : <Clock />}{t.st[s.status]}</Badge>;
  const sub = (s: School) => s.status === 'suspended' ? t.suspendedWhy : s.status === 'trial' ? `${s.city[lang]} · ${t.trialEnds}` : s.city[lang];

  return (
    <PlatformShell active="schools" title={t.title} subtitle={t.sub} actions={<Button size="sm" aria-label={t.add}><Plus /><span className="hidden sm:inline">{t.add}</span></Button>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="flex items-center gap-3 p-3.5">
              <span className={cn('h-8 w-1 rounded-full', k.tone)} />
              <div><p className="text-xs font-semibold text-muted-foreground">{k.label}</p><p className="text-xl font-bold tabular-nums">{num(k.value, lang)}</p></div>
            </Card>
          ))}
        </div>

        <Card className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          <SearchField aria-label={t.search} placeholder={t.search} className="md:flex-1" />
          <div className="grid grid-cols-3 gap-2 md:flex">
            <Select aria-label={t.status} items={stItems} defaultSelectedKey="all" className="md:w-36" />
            <Select aria-label={t.plan} items={plItems} defaultSelectedKey="all" className="md:w-32" />
            <Select aria-label={t.lms} items={lmsItems} defaultSelectedKey="all" className="md:w-40" />
          </div>
          <Button variant="outline" size="sm" className="hidden md:inline-flex"><Download />{t.export}</Button>
        </Card>

        {/* Desktop table */}
        <Card className="hidden overflow-x-auto md:block">
          <Table aria-label={t.title}>
            <TableHeader>
              <Column isRowHeader>{t.cName}</Column><Column>{t.cPlan}</Column><Column className="text-end">{t.cLearners}</Column><Column>{t.cStatus}</Column><Column>{t.cLms}</Column><Column>{t.cLast}</Column><Column><span className="sr-only">{t.cMore}</span></Column>
            </TableHeader>
            <TableBody>
              {SCHOOLS.map((s) => (
                <Row key={s.id} id={s.id} className={cn(s.status === 'suspended' && 'bg-destructive-soft/40')}>
                  <Cell>
                    <div className="flex items-center gap-3">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', s.status === 'suspended' ? 'bg-destructive-soft text-destructive' : 'bg-secondary text-primary')}><Building2 className="size-4" /></span>
                      <div className="min-w-0"><p className="font-semibold">{s[lang]}</p><p className={cn('text-xs', s.status === 'suspended' ? 'text-destructive' : 'text-muted-foreground')}>{sub(s)}</p></div>
                    </div>
                  </Cell>
                  <Cell><Badge tone={s.plan === 'plus' ? 'primary' : 'outline'}>{t.pl[s.plan]}</Badge></Cell>
                  <Cell className="text-end tabular-nums">{num(s.learners, lang)}</Cell>
                  <Cell><StatusBadge s={s} /></Cell>
                  <Cell><Lms s={s} /></Cell>
                  <Cell className={cn('whitespace-nowrap text-muted-foreground', s.status === 'suspended' && 'text-destructive')}>{s.last[lang]}</Cell>
                  <Cell className="text-end">
                    {s.status === 'suspended' ? <Button variant="outline" size="sm">{t.reactivate}</Button> : <Button variant="ghost" size="sm" aria-label={t.more} className="px-2"><Ellipsis /></Button>}
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Phone cards */}
        <ul className="flex flex-col gap-2 md:hidden">
          {SCHOOLS.map((s) => (
            <li key={s.id}>
              <Card className={cn('flex flex-col gap-2.5 p-3', s.status === 'suspended' && 'border-destructive/40 bg-destructive-soft/40')}>
                <div className="flex items-start gap-3">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', s.status === 'suspended' ? 'bg-destructive-soft text-destructive' : 'bg-secondary text-primary')}><Building2 className="size-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-snug">{s[lang]}</p><p className={cn('text-xs', s.status === 'suspended' ? 'text-destructive' : 'text-muted-foreground')}>{sub(s)}</p></div>
                  <StatusBadge s={s} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <Badge tone={s.plan === 'plus' ? 'primary' : 'outline'}>{t.pl[s.plan]}</Badge>
                  <span className="tabular-nums">{num(s.learners, lang)} {t.learners}</span>
                  <Lms s={s} />
                  <span className="ms-auto">{s.last[lang]}</span>
                </div>
                {s.status === 'suspended' && <Button variant="outline" size="sm" className="w-full">{t.reactivate}</Button>}
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </PlatformShell>
  );
}
