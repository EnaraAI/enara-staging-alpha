import { ArrowRight, CircleCheck, CloudUpload, Download, FileSpreadsheet, Info, RefreshCw, Undo2, X, Ban, CircleMinus, CirclePlus, PencilLine, Equal } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Cell, Checkbox, Column, Dir, Row, Select, Table, TableBody, TableHeader, Tab, TabList, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell } from './SchoolShell';

const T = {
  en: {
    title: 'Imports', sub: 'Bring data in from Excel or Moodle. Every import can be undone for 24 hours.',
    excel: 'Excel file', moodle: 'Moodle connector', moodleNote: 'Moodle connected · last sync today at 06:00 · 38 changes',
    section: 'Section', template: 'Download the Fees template', step1: '1. Choose a section and upload',
    drop: 'Drop an Excel file here', dropOr: 'or', browse: 'choose a file', dropHint: '.xlsx or .csv · up to 10 MB · first row must be the column names',
    uploaded: 'fees_term2_instalments.xlsx', uploadedMeta: '1,573 rows · 5 columns · uploaded 09:42', replace: 'Replace',
    step2: '2. Check the preview', step2d: 'Nothing changes until you confirm.',
    cNew: 'New', cChanged: 'Changed', cSame: 'Unchanged', cRemoved: 'Removed', cRejected: 'Rejected',
    rejected: 'Rejected rows', rejectedD: 'These rows will be skipped. Fix them in the file and import again.',
    rRow: 'Row', rLearner: 'Learner ID', rReason: 'Reason',
    rej: [
      { row: 14, id: 'NV-20391', reason: 'No learner with this ID at NVIS' },
      { row: 208, id: 'NV-18802', reason: 'Amount “1200 EGP” is not a number. Write 1200' },
      { row: 377, id: 'NV-19944', reason: 'Due date 31/02/2027 is not a real date' },
    ],
    map: 'Match your columns', mapD: 'We read the first row of your file. Tell us which ENARA field each column holds.',
    yours: 'Your column', ours: 'ENARA field', sample: 'e.g.',
    remember: 'Remember this matching for the next Fees import', ignore: 'Do not import',
    fields: [{ id: 'learner', name: 'Learner ID' }, { id: 'instalment', name: 'Instalment name' }, { id: 'amount', name: 'Amount (EGP)' }, { id: 'due', name: 'Due date' }, { id: 'ignore', name: 'Do not import' }],
    cols: [
      { col: 'Student Code', sample: 'NV-20114', field: 'learner' },
      { col: 'Installment', sample: 'Term 2 – part 1', field: 'instalment' },
      { col: 'Value', sample: '18,500', field: 'amount' },
      { col: 'Pay before', sample: '15/01/2027', field: 'due' },
      { col: 'Notes (office)', sample: 'paid cash', field: 'ignore' },
    ],
    confirm: 'Import 330 rows', cancel: 'Cancel', confirmNote: '3 rejected rows will be skipped. You can undo this import until 09:42 tomorrow.',
    log: 'Import log', lFile: 'File', lSection: 'Section', lResult: 'Result', lBy: 'By', lWhen: 'When', lAction: 'Undo',
    undo: 'Undo', undoLeft: (h: string) => `${h} left`, expired: 'Undo window closed', undone: 'Undone',
    rows: [
      { file: 'attendance_week11.xlsx', section: 'Attendance', result: '1,476 new', by: 'Ahmed Anwar', when: 'Today, 08:40', left: '23 h', state: 'live' },
      { file: 'Moodle sync', section: 'Classes', result: '12 new · 26 changed', by: 'Moodle', when: 'Today, 06:00', left: '21 h', state: 'live' },
      { file: 'fees_term1_instalment2.xlsx', section: 'Fees', result: '415 changed · 3 rejected', by: 'Ahmed Anwar', when: 'Yesterday, 14:12', left: '4 h', state: 'live' },
      { file: 'timetable_v3.xlsx', section: 'Timetable', result: '—', by: 'Rana Fouad', when: 'Yesterday, 11:30', left: '', state: 'undone' },
      { file: 'bus_routes_nov.xlsx', section: 'Bus', result: '412 new', by: 'Rana Fouad', when: '23 Nov, 10:05', left: '', state: 'expired' },
    ],
  },
  ar: {
    title: 'الاستيراد', sub: 'أدخل البيانات من Excel أو Moodle. يمكن التراجع عن أي استيراد خلال 24 ساعة.',
    excel: 'ملف Excel', moodle: 'موصل Moodle', moodleNote: 'Moodle متصل · آخر مزامنة اليوم في الساعة 06:00 · 38 تغييرًا',
    section: 'القسم', template: 'تنزيل قالب الرسوم', step1: '1. اختر القسم ثم ارفع الملف',
    drop: 'أفلت ملف Excel هنا', dropOr: 'أو', browse: 'اختر ملفًا', dropHint: 'بصيغة ‎.xlsx أو ‎.csv · حتى 10 ميغابايت · يجب أن يحتوي الصف الأول على أسماء الأعمدة',
    uploaded: 'fees_term2_instalments.xlsx', uploadedMeta: '1,573 صفًا · 5 أعمدة · رُفع في الساعة 09:42', replace: 'استبدال',
    step2: '2. راجع المعاينة', step2d: 'لن يتغيّر شيء قبل أن تؤكّد.',
    cNew: 'جديد', cChanged: 'معدَّل', cSame: 'دون تغيير', cRemoved: 'محذوف', cRejected: 'مرفوض',
    rejected: 'الصفوف المرفوضة', rejectedD: 'ستُتخطّى هذه الصفوف. صحّحها في الملف ثم أعد الاستيراد.',
    rRow: 'الصف', rLearner: 'رقم الطالب', rReason: 'السبب',
    rej: [
      { row: 14, id: 'NV-20391', reason: 'لا يوجد طالب بهذا الرقم في المدرسة' },
      { row: 208, id: 'NV-18802', reason: 'المبلغ «1200 جنيه» ليس رقمًا. اكتب 1200' },
      { row: 377, id: 'NV-19944', reason: 'تاريخ الاستحقاق 31/02/2027 ليس تاريخًا صحيحًا' },
    ],
    map: 'طابِق أعمدتك', mapD: 'قرأنا الصف الأول من ملفك. حدّد حقل إنارة الذي يقابل كل عمود.',
    yours: 'عمودك', ours: 'حقل إنارة', sample: 'مثال:',
    remember: 'تذكّر هذه المطابقة في عملية استيراد الرسوم القادمة', ignore: 'لا تستورد',
    fields: [{ id: 'learner', name: 'رقم الطالب' }, { id: 'instalment', name: 'اسم القسط' }, { id: 'amount', name: 'المبلغ (ج.م)' }, { id: 'due', name: 'تاريخ الاستحقاق' }, { id: 'ignore', name: 'لا تستورد' }],
    cols: [
      { col: 'Student Code', sample: 'NV-20114', field: 'learner' },
      { col: 'Installment', sample: 'Term 2 – part 1', field: 'instalment' },
      { col: 'Value', sample: '18,500', field: 'amount' },
      { col: 'Pay before', sample: '15/01/2027', field: 'due' },
      { col: 'Notes (office)', sample: 'paid cash', field: 'ignore' },
    ],
    confirm: 'استيراد 330 صفًا', cancel: 'إلغاء', confirmNote: 'ستُتخطّى 3 صفوف مرفوضة. يمكنك التراجع عن هذا الاستيراد حتى الساعة 09:42 غدًا.',
    log: 'سجل الاستيراد', lFile: 'الملف', lSection: 'القسم', lResult: 'النتيجة', lBy: 'بواسطة', lWhen: 'الوقت', lAction: 'التراجع',
    undo: 'تراجع', undoLeft: (h: string) => `متبقٍّ ${h}`, expired: 'انتهت مهلة التراجع', undone: 'تم التراجع',
    rows: [
      { file: 'attendance_week11.xlsx', section: 'الحضور', result: '1,476 جديدًا', by: 'أحمد أنور', when: 'اليوم، 08:40', left: '23 ساعة', state: 'live' },
      { file: 'مزامنة Moodle', section: 'الفصول', result: '12 جديدًا · 26 معدَّلًا', by: 'Moodle', when: 'اليوم، 06:00', left: '21 ساعة', state: 'live' },
      { file: 'fees_term1_instalment2.xlsx', section: 'الرسوم', result: '415 معدَّلًا · 3 مرفوضة', by: 'أحمد أنور', when: 'أمس، 14:12', left: '4 ساعات', state: 'live' },
      { file: 'timetable_v3.xlsx', section: 'الجدول الدراسي', result: '—', by: 'رنا فؤاد', when: 'أمس، 11:30', left: '', state: 'undone' },
      { file: 'bus_routes_nov.xlsx', section: 'الحافلة', result: '412 جديدًا', by: 'رنا فؤاد', when: '23 نوفمبر، 10:05', left: '', state: 'expired' },
    ],
  },
};

const SECTIONS = {
  en: [{ id: 'fees', name: 'Fees' }, { id: 'attendance', name: 'Attendance' }, { id: 'timetable', name: 'Timetable' }, { id: 'bus', name: 'Bus' }, { id: 'consent', name: 'Consent forms' }, { id: 'learners', name: 'Learners and guardians' }],
  ar: [{ id: 'fees', name: 'الرسوم' }, { id: 'attendance', name: 'الحضور' }, { id: 'timetable', name: 'الجدول الدراسي' }, { id: 'bus', name: 'الحافلة' }, { id: 'consent', name: 'نماذج الموافقة' }, { id: 'learners', name: 'الطلاب وأولياء الأمور' }],
};

export default function SchoolImports() {
  const t = useT(T);
  const { lang } = usePreview();
  const counts = [
    { label: t.cNew, n: 312, icon: <CirclePlus />, cls: 'bg-success-soft text-success' },
    { label: t.cChanged, n: 18, icon: <PencilLine />, cls: 'bg-info-soft text-info' },
    { label: t.cSame, n: 1240, icon: <Equal />, cls: 'bg-muted text-muted-foreground' },
    { label: t.cRemoved, n: 0, icon: <CircleMinus />, cls: 'bg-muted text-muted-foreground' },
    { label: t.cRejected, n: 3, icon: <Ban />, cls: 'bg-destructive-soft text-destructive' },
  ];
  const UndoCell = ({ r }: { r: (typeof t.rows)[number] }) =>
    r.state === 'live' ? (
      <span className="inline-flex items-center gap-2"><Button variant="outline" size="sm"><Undo2 />{t.undo}</Button><span className="text-xs text-muted-foreground tabular-nums">{t.undoLeft(r.left)}</span></span>
    ) : r.state === 'undone' ? <Badge tone="neutral">{t.undone}</Badge> : <span className="text-xs text-muted-foreground">{t.expired}</span>;

  return (
    <SchoolShell active="imports" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Tabs defaultSelectedKey="excel">
          <TabList aria-label={t.title}>
            <Tab id="excel"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4" />{t.excel}</span></Tab>
            <Tab id="moodle"><span className="inline-flex items-center gap-1.5"><RefreshCw className="size-4" />{t.moodle}</span></Tab>
          </TabList>
        </Tabs>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Step 1 */}
          <Card className="lg:self-start">
            <CardHeader><CardTitle>{t.step1}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Select aria-label={t.section} label={t.section} items={SECTIONS[lang]} defaultSelectedKey="fees" />
              <a href="#" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary"><Download className="size-4" />{t.template}</a>
              <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/50 px-4 py-6 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-card text-primary shadow-sm"><CloudUpload className="size-5" /></span>
                <p className="text-sm font-semibold">{t.drop} <span className="font-normal text-muted-foreground">{t.dropOr}</span> <a href="#" className="text-primary underline underline-offset-2">{t.browse}</a></p>
                <p className="text-xs text-muted-foreground">{t.dropHint}</p>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-success-soft text-success"><FileSpreadsheet className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold"><bdi>{t.uploaded}</bdi></p><p className="truncate text-xs text-muted-foreground">{t.uploadedMeta}</p></div>
                <Button variant="ghost" size="sm">{t.replace}</Button>
              </div>
              <Alert tone="info" icon={<Info />}>{t.moodleNote}</Alert>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card>
            <CardHeader><CardTitle>{t.step2}</CardTitle><CardDescription>{t.step2d}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {counts.map((c) => (
                  <div key={c.label} className={cn('flex flex-col gap-1 rounded-lg px-3 py-2', c.cls)}>
                    <span className="flex items-center gap-1 text-xs font-semibold [&_svg]:size-3.5">{c.icon}{c.label}</span>
                    <span className="text-xl font-bold tabular-nums text-foreground">{num(c.n, lang)}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-bold">{t.rejected}</p>
                <p className="mb-2 text-xs text-muted-foreground">{t.rejectedD}</p>
                <ul className="divide-y rounded-lg border">
                  {t.rej.map((r) => (
                    <li key={r.row} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <span className="shrink-0 rounded bg-destructive-soft px-1.5 py-0.5 text-xs font-bold text-destructive tabular-nums">{t.rRow} {num(r.row, lang)}</span>
                      <div className="min-w-0 flex-1"><p className="font-mono text-xs text-muted-foreground">{r.id}</p><p>{r.reason}</p></div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-sm font-bold">{t.map}</p>
                <p className="mb-3 text-xs text-muted-foreground">{t.mapD}</p>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.yours}</span><span />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.ours}</span>
                  {t.cols.map((c) => (
                    <MapRow key={c.col} col={c.col} sample={`${t.sample} ${c.sample}`} field={c.field} items={t.fields} label={`${t.ours}: ${c.col}`} />
                  ))}
                </div>
                <Checkbox defaultSelected className="mt-2">{t.remember}</Checkbox>
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
                <p className="flex-1 text-xs text-muted-foreground">{t.confirmNote}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 sm:flex-none"><X />{t.cancel}</Button>
                  <Button className="flex-1 sm:flex-none"><CircleCheck />{t.confirm}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <section>
          <SectionTitle>{t.log}</SectionTitle>
          <Card className="hidden overflow-x-auto md:block">
            <Table aria-label={t.log}>
              <TableHeader>
                <Column isRowHeader>{t.lFile}</Column><Column>{t.lSection}</Column><Column>{t.lResult}</Column><Column>{t.lBy}</Column><Column>{t.lWhen}</Column><Column>{t.lAction}</Column>
              </TableHeader>
              <TableBody>
                {t.rows.map((r) => (
                  <Row key={r.file} id={r.file}>
                    <Cell><span className="inline-flex items-center gap-2 font-medium"><FileSpreadsheet className="size-4 text-muted-foreground" /><bdi>{r.file}</bdi></span></Cell>
                    <Cell>{r.section}</Cell>
                    <Cell className="tabular-nums text-muted-foreground">{r.result}</Cell>
                    <Cell>{r.by}</Cell>
                    <Cell className="whitespace-nowrap text-muted-foreground">{r.when}</Cell>
                    <Cell><UndoCell r={r} /></Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="flex flex-col gap-2 md:hidden">
            {t.rows.map((r) => (
              <li key={r.file}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-start gap-2">
                    <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold"><bdi>{r.file}</bdi></p><p className="text-xs text-muted-foreground">{r.section} · {r.by} · {r.when}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm tabular-nums">{r.result}</span><UndoCell r={r} /></div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SchoolShell>
  );
}

function MapRow({ col, sample, field, items, label }: { col: string; sample: string; field: string; items: { id: string; name: string }[]; label: string }) {
  return (
    <>
      <div className="min-w-0 rounded-lg border bg-muted/50 px-3 py-1.5">
        <p className="truncate text-sm font-semibold"><bdi>{col}</bdi></p>
        <p className="truncate text-xs text-muted-foreground">{sample}</p>
      </div>
      <Dir><ArrowRight className="size-4 text-muted-foreground" /></Dir>
      <Select aria-label={label} items={items} defaultSelectedKey={field} className={field === 'ignore' ? '[&_button]:text-muted-foreground' : undefined} />
    </>
  );
}
