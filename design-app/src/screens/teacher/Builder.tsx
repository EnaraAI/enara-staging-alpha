import type { ReactNode } from 'react';
import { CalendarDays, Check, CircleDot, Copy, Eye, GripVertical, Headphones, ListChecks, Pencil, PenLine, Play, Plus, Send, Sparkles, TextCursorInput, Timer, Trash2, Upload } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Select, Separator, Switch, TextField, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SourceBadge, TeacherShell, type Source } from './common';

type QType = 'mc' | 'short' | 'essay' | 'listening';
const TYPE_ICON: Record<QType, typeof CircleDot> = { mc: CircleDot, short: TextCursorInput, essay: PenLine, listening: Headphones };

const T = {
  en: {
    title: 'Assessment builder', sub: 'Draft · last saved 2 minutes ago', edit: 'Edit', preview: 'Preview as learner', save: 'Save draft', publish: 'Publish',
    settings: 'Settings', name: 'Title', nameV: 'Unit 4 check: Past simple and travel', cls: 'Class', due: 'Due date', dueV: 'Thu 3 Dec 2026, 20:00', limit: 'Time limit', limitV: '35 minutes',
    shuffle: 'Shuffle question order', results: 'Show scores after the teacher confirms them',
    questions: 'Questions', totals: (q: number, p: number) => `${q} questions · ${p} points · about 30 min`,
    type: { mc: 'Multiple choice', short: 'Short answer', essay: 'Essay with rubric', listening: 'Listening' } as Record<QType, string>,
    pts: (n: number) => `${n} pts`, drag: 'Drag to reorder', editQ: 'Edit', dup: 'Duplicate', del: 'Delete',
    q1: 'Choose the correct past form:', q2: 'Why did Sara miss the train? Answer in one sentence.', q2a: 'Model answer:',
    q3: 'Write 120–150 words about a trip you took. Say where you went, what you did and how you felt.', rubric: 'Rubric', task: 'Task', org: 'Organisation', grammar: 'Grammar', vocab: 'Vocabulary', each5: 'each out of 5',
    reviewBelow: 'You review any essay scored with less than 80% confidence.',
    q4: 'Listen to the station announcement. Which platform does the train to Aswan leave from?', audio: 'station-announcement.mp3 · 0:42 · plays twice',
    q5: 'Read the sentence and choose the word that is wrong:', draft: 'AI draft · review before publishing', approve: 'Approve',
    add: 'Add question', addHint: 'Choose a question type',
    addMc: 'One correct answer from a list', addShort: 'A sentence or two, scored by Mishkat', addEssay: 'Longer writing with trait scores', addListen: 'Audio clip with questions', addUpload: 'Import from a file', addUploadD: 'Word or PDF worksheet', play: 'Play',
    ai: 'Generate with AI from lesson', aiSub: 'Make draft questions from a lesson you taught.', lesson: 'Lesson', count: 'Number of questions', types: 'Question types', generate: 'Generate drafts',
    aiNote: 'Review before publishing', aiNoteBody: 'Questions made with AI are drafts. Check each one; learners see nothing until you publish.',
    lastRun: 'Last run: 3 drafts added, 1 still to review', summary: 'Scoring in this assessment',
  },
  ar: {
    title: 'منشئ التقييمات', sub: 'مسودة · آخر حفظ قبل دقيقتين', edit: 'تحرير', preview: 'معاينة كطالب', save: 'حفظ المسودة', publish: 'نشر',
    settings: 'الإعدادات', name: 'العنوان', nameV: 'اختبار الوحدة 4: الماضي البسيط والسفر', cls: 'الفصل', due: 'موعد التسليم', dueV: 'الخميس 3 ديسمبر 2026، 20:00', limit: 'المدة المحددة', limitV: '35 دقيقة',
    shuffle: 'ترتيب الأسئلة عشوائيًا', results: 'إظهار الدرجات بعد أن يعتمدها المعلم',
    questions: 'الأسئلة', totals: (q: number, p: number) => `${q} أسئلة · ${p} درجة · نحو 30 دقيقة`,
    type: { mc: 'اختيار من متعدد', short: 'إجابة قصيرة', essay: 'مقال بمعايير تقييم', listening: 'استماع' } as Record<QType, string>,
    pts: (n: number) => (n === 2 ? 'درجتان' : n >= 3 && n <= 10 ? `${n} درجات` : `${n} درجة`), drag: 'اسحب لإعادة الترتيب', editQ: 'تحرير', dup: 'تكرار', del: 'حذف',
    q1: 'اختر صيغة الماضي الصحيحة:', q2: 'لماذا فاتَ سارة القطار؟ أجب بجملة واحدة.', q2a: 'الإجابة النموذجية:',
    q3: 'اكتب من 120 إلى 150 كلمة عن رحلة قمت بها: إلى أين ذهبت، وماذا فعلت، وبماذا شعرت.', rubric: 'معايير التقييم', task: 'إنجاز المهمة', org: 'التنظيم', grammar: 'القواعد', vocab: 'المفردات', each5: 'لكلٍّ منها 5 درجات',
    reviewBelow: 'تراجع أنت أي مقال صُحّح بثقة أقل من 80%.',
    q4: 'استمع إلى إعلان المحطة. من أي رصيف يغادر القطار المتجه إلى أسوان؟', audio: 'station-announcement.mp3 · 0:42 · يُشغَّل مرتين',
    q5: 'اقرأ الجملة واختر الكلمة الخاطئة:', draft: 'مسودة من الذكاء الاصطناعي · راجعها قبل النشر', approve: 'اعتماد',
    add: 'إضافة سؤال', addHint: 'اختر نوع السؤال',
    addMc: 'إجابة صحيحة واحدة من قائمة', addShort: 'جملة أو جملتان، يصحّحها مِشكاة', addEssay: 'كتابة أطول مع درجات للمعايير', addListen: 'مقطع صوتي مع أسئلة', addUpload: 'استيراد من ملف', addUploadD: 'ورقة عمل Word أو PDF', play: 'تشغيل',
    ai: 'التوليد بالذكاء الاصطناعي من درس', aiSub: 'أنشئ مسودات أسئلة من درس قمت بتدريسه.', lesson: 'الدرس', count: 'عدد الأسئلة', types: 'أنواع الأسئلة', generate: 'توليد المسودات',
    aiNote: 'راجع قبل النشر', aiNoteBody: 'الأسئلة المولَّدة بالذكاء الاصطناعي مسودات. راجع كل سؤال؛ لا يرى الطلاب شيئًا حتى تنشر.',
    lastRun: 'آخر تشغيل: أُضيفت 3 مسودات، وتبقى واحدة للمراجعة', summary: 'طرق التصحيح في هذا التقييم',
  },
};

function QCard({ n, type, points, source, children, draft }: { n: number; type: QType; points: number; source: Source; children: ReactNode; draft?: boolean }) {
  const t = useT(T);
  const { lang } = usePreview();
  const Icon = TYPE_ICON[type];
  return (
    <Card className={cn('flex', draft && 'border-dashed border-accent bg-accent/5')}>
      <button type="button" aria-label={t.drag} className="flex w-8 shrink-0 cursor-grab items-start justify-center rounded-s-xl border-e bg-muted/50 pt-4 text-muted-foreground hover:bg-muted"><GripVertical className="size-4" /></button>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{num(n, lang)}</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="size-4 shrink-0 text-muted-foreground" />{t.type[type]}</span>
            <span className="text-xs text-muted-foreground">· {t.pts(points)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={t.editQ}><Pencil /></Button>
            <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={t.dup}><Copy /></Button>
            <Button variant="ghost" size="sm" className="size-8 px-0 text-destructive" aria-label={t.del}><Trash2 /></Button>
          </span>
        </div>
        <div className="mt-2.5 text-sm">{children}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SourceBadge source={source} />
          {draft && <Badge tone="warning"><Sparkles />{t.draft}</Badge>}
        </div>
      </div>
    </Card>
  );
}

export default function Builder() {
  const t = useT(T);
  const { lang } = usePreview();
  const lessons = lang === 'ar'
    ? [{ id: 'l3', name: 'الوحدة 4 · الدرس 3: قصص السفر' }, { id: 'l2', name: 'الوحدة 4 · الدرس 2: في المحطة' }]
    : [{ id: 'l3', name: 'Unit 4 · Lesson 3: Travel stories' }, { id: 'l2', name: 'Unit 4 · Lesson 2: At the station' }];
  const classes = [{ id: '9b', name: lang === 'ar' ? 'الصف التاسع – ب' : 'Grade 9 – B' }, { id: '9a', name: lang === 'ar' ? 'الصف التاسع – أ' : 'Grade 9 – A' }];
  const counts = [5, 8, 10].map((c) => ({ id: String(c), name: num(c, lang) }));
  const addItems: [QType | 'upload', string, string][] = [['mc', t.type.mc, t.addMc], ['short', t.type.short, t.addShort], ['essay', t.type.essay, t.addEssay], ['listening', t.type.listening, t.addListen], ['upload', t.addUpload, t.addUploadD]];
  const opts = ['go', 'went', 'gone', 'goes'];

  return (
    <TeacherShell active="assessments" title={t.title} subtitle={t.sub}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.preview} className="flex gap-1 rounded-lg bg-muted p-1">
            <Toggle defaultSelected className="border-0"><Pencil />{t.edit}</Toggle>
            <Toggle className="border-0 bg-transparent"><Eye />{t.preview}</Toggle>
          </div>
          <div className="ms-auto flex gap-2">
            <Button variant="outline" size="sm">{t.save}</Button>
            <Button size="sm"><Send />{t.publish}</Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader><CardTitle>{t.settings}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <TextField label={t.name} defaultValue={t.nameV} className="sm:col-span-2" />
                <Select label={t.cls} items={classes} defaultSelectedKey="9b" />
                <TextField label={t.due} defaultValue={t.dueV} />
                <TextField label={t.limit} defaultValue={t.limitV} description={lang === 'ar' ? 'اتركه فارغًا لعدم تحديد مدة.' : 'Leave empty for no time limit.'} />
                <div className="flex flex-col justify-center gap-1">
                  <Switch defaultSelected>{t.shuffle}</Switch>
                  <Switch defaultSelected>{t.results}</Switch>
                </div>
              </CardContent>
            </Card>

            <section>
              <SectionTitle action={<span className="text-xs text-muted-foreground">{t.totals(5, 29)}</span>}>{t.questions}</SectionTitle>
              <div className="flex flex-col gap-3">
                <QCard n={1} type="mc" points={2} source="rules">
                  <p className="font-medium">{t.q1} <En>Yesterday we ___ to Alexandria by train.</En></p>
                  <ul dir="ltr" className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {opts.map((o, i) => (
                      <li key={o} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm', i === 1 && 'border-success bg-success-soft font-semibold')}>
                        <span className="text-xs text-muted-foreground">{'abcd'[i]})</span>{o}{i === 1 && <Check className="ms-auto size-4 text-success" />}
                      </li>
                    ))}
                  </ul>
                </QCard>
                <QCard n={2} type="short" points={3} source="mishkat">
                  <p className="font-medium">{t.q2}</p>
                  <p className="mt-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{t.q2a} <En>Because she woke up late.</En></p>
                </QCard>
                <QCard n={3} type="essay" points={20} source="mishkat">
                  <p className="font-medium">{t.q3}</p>
                  <div className="mt-2.5 rounded-md border p-3">
                    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs font-semibold">{t.rubric}<span className="font-normal text-muted-foreground">· {t.each5}</span></p>
                    <div className="flex flex-wrap gap-1.5">{[t.task, t.org, t.grammar, t.vocab].map((r) => <Badge key={r} tone="outline">{r} · {num(5, lang)}</Badge>)}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{t.reviewBelow}</p>
                  </div>
                </QCard>
                <QCard n={4} type="listening" points={2} source="rules">
                  <p className="font-medium">{t.q4}</p>
                  <div className="mt-2 flex items-center gap-3 rounded-md bg-muted px-2.5 py-2">
                    <Button size="sm" variant="secondary" className="size-8 shrink-0 rounded-full px-0" aria-label={t.play}><Play /></Button>
                    <div className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>{Array.from({ length: 48 }, (_, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-primary/40" style={{ height: `${25 + ((i * 37) % 70)}%` }} />)}</div>
                    <span dir="ltr" className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{t.audio}</span>
                  </div>
                </QCard>
                <QCard n={5} type="mc" points={2} source="rules" draft>
                  <p className="font-medium">{t.q5} <En>“We buyed tickets and waited on the platform.”</En></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" className="h-7 px-2.5 text-xs"><Check />{t.approve}</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs"><Pencil />{t.editQ}</Button>
                  </div>
                </QCard>

                <div className="rounded-xl border-2 border-dashed p-3">
                  <Button variant="outline" className="w-full sm:w-auto" aria-expanded="true"><Plus />{t.add}</Button>
                  <div role="menu" aria-label={t.addHint} className="mt-2 rounded-lg border bg-popover p-1 shadow-lg sm:max-w-md">
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.addHint}</p>
                    {addItems.map(([k, label, desc], i) => {
                      const Icon = k === 'upload' ? Upload : TYPE_ICON[k];
                      return (
                        <div key={k}>
                          {k === 'upload' && <Separator className="my-1" />}
                          <a role="menuitem" href="#" className={cn('flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted', i === 0 && 'bg-muted')}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground"><Icon className="size-4" /></span>
                            <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            <Card className="border-accent/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>{t.ai}</CardTitle>
                <CardDescription>{t.aiSub}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select label={t.lesson} items={lessons} defaultSelectedKey="l3" />
                <Select label={t.count} items={counts} defaultSelectedKey="5" />
                <div>
                  <p className="text-sm font-semibold">{t.types}</p>
                  <div className="grid grid-cols-2 gap-x-2">
                    {(['mc', 'short', 'essay', 'listening'] as QType[]).map((k) => <Checkbox key={k} defaultSelected={k !== 'essay'}>{t.type[k]}</Checkbox>)}
                  </div>
                </div>
                <Alert tone="warning" icon={<Eye />} title={t.aiNote}>{t.aiNoteBody}</Alert>
                <Button variant="accent" className="w-full"><Sparkles />{t.generate}</Button>
                <p className="text-center text-xs text-muted-foreground">{t.lastRun}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle>{t.summary}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2.5 text-sm">
                {([['rules', 6, ListChecks], ['mishkat', 23, PenLine]] as const).map(([s, p]) => (
                  <div key={s} className="flex items-center justify-between gap-2"><SourceBadge source={s} /><span className="font-semibold tabular-nums">{t.pts(p)}</span></div>
                ))}
                <Separator className="my-1" />
                <p className="flex items-center gap-2 text-muted-foreground"><Timer className="size-4" />{t.limitV}</p>
                <p className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" />{t.dueV}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </TeacherShell>
  );
}

const En = ({ children }: { children: ReactNode }) => <bdi dir="ltr" lang="en">{children}</bdi>;
