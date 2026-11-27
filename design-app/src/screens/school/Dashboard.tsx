import { BellRing, Bot, Bus, CalendarCheck, CalendarDays, ChevronRight, ClipboardCheck, FilePenLine, FileSpreadsheet, Inbox, Megaphone, Receipt, RefreshCw, Users, Link2, Upload, Plus, Smartphone, LayoutGrid } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Dir, LinkButton, Progress, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell, ROUTE } from './SchoolShell';
import { EmptyState, ErrorState, ListSkeleton, NotYet, SECTIONS, fmtLongToday, fmtWhen, hoursSince, n0, rosterStudents, useApi, useParentsSchool, useScope, type ImportRow, type ImportSection, type Moodle, type ReqList, type Roster, type Section, type Status } from './data';

const T = {
  en: {
    title: 'Dashboard', newAnn: 'New announcement',
    kLearners: 'Learners enrolled', kLearnersHint: (c: string) => `in ${c} classes`,
    kParents: 'Parents linked', kParentsHint: (a: string) => `${a} active in the last 7 days`,
    kSections: 'Parents app sections on', kSectionsHint: (n: string) => `of ${n} available on this site`,
    kReq: 'Open requests', kReqHint: (n: string) => `${n} new`, kReqWarn: (n: string) => `${n} waiting over 48 h`, kReqOff: 'The Requests section is off',
    sections: 'Parents app sections', sectionsDesc: 'What parents see in the app today', manage: 'Manage', on: 'On', off: 'Off', setup: 'Not available yet',
    s: { timetable: 'Timetable', announcements: 'Announcements', attendance: 'Attendance', notifications: 'Notifications', fees: 'Fees', buses: 'Bus', requests: 'Requests', consents: 'Consent forms', chat: 'Chat assistant' } as Record<Section, string>,
    imp: { timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', fees: 'Fees', bus_routes: 'Bus routes', bus_assignments: 'Bus: children’s stops' } as Record<ImportSection, string>,
    imports: 'Recent imports', viewAll: 'View all', noImports: 'No imports yet', noImportsD: 'Import a timetable, attendance, fees or bus file to fill the parents app.',
    rows: (n: string) => `${n} rows`, rejected: (n: string) => `${n} rejected`,
    st: { confirmed: 'Imported', warn: 'Check rows', undone: 'Undone', preview: 'Preview only', expired: 'Expired' } as Record<string, string>,
    alerts: 'Alerts', noAlerts: 'Nothing needs your attention', noAlertsD: 'Moodle sync results and imports with rejected rows show here.',
    moodleT: (at: string) => `Moodle sync ran ${at}`, moodle: (a: string, b: string, p: string | null) => `${a} announcements and ${b} attendance records came in${p ? `; ${p} problems` : ''}.`, moodleErr: (code: string) => `The last Moodle sync did not finish (${code}).`,
    rejT: (n: string, f: string) => `${n} rows were rejected in ${f}`, rejD: 'Fix the file and import it again.',
    quick: 'Quick actions', q: ['Import a file', 'Write an announcement', 'Answer requests', 'Parents app sections'],
  },
  ar: {
    title: 'لوحة المتابعة', newAnn: 'إعلان جديد',
    kLearners: 'الطلاب المسجّلون', kLearnersHint: (c: string) => `في ${c} فصلًا`,
    kParents: 'أولياء الأمور المرتبطون', kParentsHint: (a: string) => `${a} نشطون في آخر 7 أيام`,
    kSections: 'أقسام التطبيق المفعّلة', kSectionsHint: (n: string) => `من أصل ${n} متاحة على الموقع`,
    kReq: 'الطلبات المفتوحة', kReqHint: (n: string) => `${n} جديدة`, kReqWarn: (n: string) => `${n} تنتظر أكثر من 48 ساعة`, kReqOff: 'قسم الطلبات متوقف',
    sections: 'أقسام تطبيق أولياء الأمور', sectionsDesc: 'ما يراه أولياء الأمور في التطبيق اليوم', manage: 'إدارة', on: 'مفعّل', off: 'متوقف', setup: 'غير متاح بعد',
    s: { timetable: 'الجدول الدراسي', announcements: 'الإعلانات', attendance: 'الحضور', notifications: 'الإشعارات', fees: 'الرسوم', buses: 'الحافلة', requests: 'الطلبات', consents: 'نماذج الموافقة', chat: 'المساعد الذكي' } as Record<Section, string>,
    imp: { timetable: 'الجدول الدراسي', attendance: 'الحضور', announcements: 'الإعلانات', fees: 'الرسوم', bus_routes: 'خطوط الحافلات', bus_assignments: 'الحافلات: محطات الطلاب' } as Record<ImportSection, string>,
    imports: 'أحدث عمليات الاستيراد', viewAll: 'عرض الكل', noImports: 'لا عمليات استيراد بعد', noImportsD: 'استورد ملف الجدول أو الحضور أو الرسوم أو الحافلات لتظهر بياناته في تطبيق أولياء الأمور.',
    rows: (n: string) => `${n} صفًا`, rejected: (n: string) => `${n} مرفوضة`,
    st: { confirmed: 'تم الاستيراد', warn: 'راجع الصفوف', undone: 'تم التراجع', preview: 'معاينة فقط', expired: 'منتهية' } as Record<string, string>,
    alerts: 'التنبيهات', noAlerts: 'لا شيء يحتاج إلى انتباهك', noAlertsD: 'تظهر هنا نتائج مزامنة Moodle وعمليات الاستيراد التي رُفضت فيها صفوف.',
    moodleT: (at: string) => `تمّت مزامنة Moodle ${at}`, moodle: (a: string, b: string, p: string | null) => `وصل ${a} إعلانًا و${b} سجل حضور${p ? `، مع ${p} مشكلات` : ''}.`, moodleErr: (code: string) => `لم تكتمل آخر مزامنة مع Moodle (${code}).`,
    rejT: (n: string, f: string) => `رُفض ${n} صفًا في ${f}`, rejD: 'صحّح الملف ثم أعد الاستيراد.',
    quick: 'إجراءات سريعة', q: ['استيراد ملف', 'كتابة إعلان', 'الرد على الطلبات', 'أقسام تطبيق أولياء الأمور'],
  },
};

const ICON: Record<Section, React.ReactNode> = { timetable: <CalendarDays />, announcements: <Megaphone />, attendance: <CalendarCheck />, notifications: <BellRing />, fees: <Receipt />, buses: <Bus />, requests: <Inbox />, consents: <FilePenLine />, chat: <Bot /> };

// Data (all real): GET /api/school-app/status, /roster, /imports, /requests, /moodle and GET /api/parents-admin/schools (parents linked).
// Not shown because no API gives it: learners active this week, attendance today, fee reminder batches.
export default function SchoolDashboard() {
  const t = useT(T);
  const { lang } = usePreview();
  const scope = useScope();
  const status = useApi<Status>(scope.path('/api/school-app/status'));
  const ok = !!status.data?.institutionId;
  const roster = useApi<Roster>(ok ? scope.path('/api/school-app/roster') : null);
  const imports = useApi<{ imports?: ImportRow[] }>(ok ? scope.path('/api/school-app/imports') : null);
  const requests = useApi<ReqList>(ok ? scope.path('/api/school-app/requests') : null);
  const moodle = useApi<Moodle>(ok ? scope.path('/api/school-app/moodle') : null);
  const parents = useParentsSchool();
  const usage = parents.school?.usage;

  const nb = (n: number) => num(n, lang);
  const sections = status.data?.sections ?? {};
  const available = status.data?.available ?? {};
  const onCount = SECTIONS.filter((s) => sections[s]).length;
  const availCount = SECTIONS.filter((s) => available[s]).length;
  const students = rosterStudents(roster.data);
  const counts = requests.data?.counts ?? {};
  const openReqs = (requests.data?.requests ?? []).filter((r) => r?.status === 'new' || r?.status === 'in_progress');
  const late = openReqs.filter((r) => hoursSince(r?.createdAt) > 48).length;
  const noSchool = !status.loading && !status.error && !ok;
  const kpiValue = (loading: boolean, failed: boolean, v: string) => (loading ? <Skeleton className="h-6 w-16" /> : failed ? <NotYet /> : v);
  const linked = n0(usage?.linkedParents), active7 = n0(usage?.active7);

  const kpis = [
    { label: t.kLearners, value: kpiValue(status.loading || roster.loading, !!roster.error || !ok, nb(students.length)), hint: roster.data ? t.kLearnersHint(nb(roster.data.groups?.length ?? 0)) : null, icon: <Users />, extra: null },
    { label: t.kParents, value: kpiValue(parents.loading, parents.failed || !usage, nb(linked)), hint: usage ? t.kParentsHint(nb(active7)) : null, icon: <Link2 />,
      extra: linked > 0 ? <Progress value={Math.min(100, (active7 / linked) * 100)} size="sm" tone="info" ariaLabel={t.kParentsHint(nb(active7))} /> : null },
    { label: t.kSections, value: kpiValue(status.loading, !!status.error || noSchool, nb(onCount)), hint: status.data ? t.kSectionsHint(nb(availCount)) : null, icon: <LayoutGrid />,
      extra: availCount > 0 ? <Progress value={(onCount / availCount) * 100} size="sm" tone="success" ariaLabel={t.kSections} /> : null },
    { label: t.kReq, value: kpiValue(status.loading || requests.loading, !!requests.error || !ok, nb(n0(counts.new) + n0(counts.in_progress))), hint: requests.data ? (sections.requests ? t.kReqHint(nb(n0(counts.new))) : t.kReqOff) : null, icon: <Inbox />,
      extra: late > 0 ? <Badge tone="warning" className="w-fit whitespace-normal">{t.kReqWarn(nb(late))}</Badge> : null },
  ];
  const quickHref = [ROUTE.imports, ROUTE.announcements, ROUTE.requests, ROUTE.parents];
  const quickIcon = [<Upload key="u" />, <Megaphone key="m" />, <Inbox key="i" />, <Smartphone key="p" />];

  // Alerts from real data only: the last Moodle sync per connection, and recent imports that rejected rows.
  const runs = (moodle.data?.connections ?? []).filter((c) => c?.lastRun?.at);
  const rejectedImports = (imports.data?.imports ?? []).filter((r) => r?.status === 'confirmed' && n0(r?.counts?.rejected) > 0 && hoursSince(r?.confirmedAt ?? r?.createdAt) < 72).slice(0, 2);
  const recent = (imports.data?.imports ?? []).slice(0, 5);
  const impName = (r: ImportRow) => r?.fileName || (r?.section ? t.imp[r.section] ?? r.section : '—');
  const alertsLoading = (moodle.loading && !moodle.data) || (imports.loading && !imports.data) || status.loading;

  return (
    <SchoolShell active="dashboard" title={t.title} subtitle={fmtLongToday(lang)}
      actions={<LinkButton href={scope.href(ROUTE.announcements)} size="sm" aria-label={t.newAnn}><Plus /><span className="hidden sm:inline">{t.newAnn}</span></LinkButton>}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        {status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : noSchool ? <ErrorState error={{ status: 400 }} /> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <Card key={i} className="flex min-w-0 flex-col gap-3 p-4" data-testid="kpi">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{k.label}</span>
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-4">{k.icon}</span>
              </div>
              <span className="text-2xl font-bold tabular-nums leading-none">{k.value}</span>
              {k.extra}{k.hint && <span className="text-xs text-muted-foreground">{k.hint}</span>}
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="flex flex-col gap-1"><CardTitle>{t.sections}</CardTitle><CardDescription>{t.sectionsDesc}</CardDescription></div>
              <LinkButton href={scope.href(ROUTE.parents)} variant="outline" size="sm">{t.manage}<Dir><ChevronRight /></Dir></LinkButton>
            </CardHeader>
            <CardContent>
              {status.loading && !status.data ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-busy="true">{SECTIONS.map((s) => <li key={s}><Skeleton className="h-[52px] w-full" /></li>)}</ul>
              ) : status.data ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SECTIONS.map((s) => {
                    const state = sections[s] ? 'on' : available[s] ? 'off' : 'setup';
                    return (
                      <li key={s} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" data-testid={`section-${s}`}>
                        <span className={cn('grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', state === 'on' ? 'bg-success-soft text-success' : state === 'setup' ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground')}>{ICON[s]}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.s[s]}</span>
                        <Badge tone={state === 'on' ? 'success' : state === 'setup' ? 'warning' : 'neutral'}>{state === 'on' ? t.on : state === 'setup' ? t.setup : t.off}</Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : status.error ? <NotYet /> : null}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>{t.quick}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {t.q.map((q, i) => (
                <LinkButton key={q} href={scope.href(quickHref[i])} variant={i === 0 ? 'default' : 'outline'} className="h-auto min-h-tap justify-start whitespace-normal py-2 text-start">{quickIcon[i]}<span className="flex-1">{q}</span></LinkButton>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <section className="min-w-0 lg:col-span-3">
            <SectionTitle action={<a href={scope.href(ROUTE.imports)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{t.viewAll}<Dir><ChevronRight className="size-4" /></Dir></a>}>{t.imports}</SectionTitle>
            {(status.loading || imports.loading) && !imports.data ? <ListSkeleton rows={4} /> : imports.error ? <ErrorState error={imports.error} onRetry={imports.reload} /> : recent.length === 0 ? (
              <Card><EmptyState icon={<FileSpreadsheet />} title={t.noImports}>{t.noImportsD}</EmptyState></Card>
            ) : (
              <Card className="divide-y">
                {recent.map((r, i) => {
                  const rej = n0(r?.counts?.rejected);
                  const st = r?.status === 'confirmed' ? (rej > 0 ? 'warn' : 'confirmed') : String(r?.status ?? '');
                  return (
                    <div key={r?.id ?? i} className="flex items-center gap-3 px-4 py-3" data-testid="recent-import">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">{r?.fileName ? <FileSpreadsheet /> : <RefreshCw />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold"><bdi>{impName(r)}</bdi></p>
                        <p className="truncate text-xs text-muted-foreground">{r?.section ? t.imp[r.section] ?? r.section : ''} · {fmtWhen(r?.confirmedAt ?? r?.createdAt, lang)} · <span className="tabular-nums">{t.rows(nb(n0(r?.counts?.total)))}{rej ? ` · ${t.rejected(nb(rej))}` : ''}</span></p>
                      </div>
                      <Badge tone={st === 'confirmed' ? 'success' : st === 'warn' ? 'warning' : 'neutral'}>{t.st[st] ?? st}</Badge>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
          <section className="min-w-0 lg:col-span-2">
            <SectionTitle>{t.alerts}</SectionTitle>
            {alertsLoading ? <ListSkeleton rows={2} /> : runs.length + rejectedImports.length === 0 ? (
              <Card><EmptyState icon={<ClipboardCheck />} title={t.noAlerts}>{t.noAlertsD}</EmptyState></Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {runs.map((c, i) => {
                  const lr = c?.lastRun;
                  return lr?.code && lr.code !== 'ok'
                    ? <Alert key={c?.platformId ?? i} tone="warning" icon={<RefreshCw />} title={t.moodleT(fmtWhen(lr?.at, lang, true))}>{t.moodleErr(lr.code)}</Alert>
                    : <Alert key={c?.platformId ?? i} tone="info" icon={<RefreshCw />} title={t.moodleT(fmtWhen(lr?.at, lang, true))}>{t.moodle(nb(n0(lr?.announcements)), nb(n0(lr?.attendance)), n0(lr?.problems) ? nb(n0(lr?.problems)) : null)}</Alert>;
                })}
                {rejectedImports.map((r, i) => (
                  <Alert key={r?.id ?? i} tone="warning" icon={<ClipboardCheck />} title={t.rejT(nb(n0(r?.counts?.rejected)), impName(r))}>{t.rejD}</Alert>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </SchoolShell>
  );
}
