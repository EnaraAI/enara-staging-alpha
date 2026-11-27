// Assessment builder, wired to lms-test:
//   GET   /api/assignments/classes                         classes and their curricula (an assessment belongs to a curriculum)
//   GET   /api/assessments                                 the teacher's assessments (open one)
//   GET   /api/assessments/:id                             one assessment with totalPoints and publishProblems
//   POST  /api/assessments { lifecycle: 'draft' }          create a draft (never published on create)
//   PATCH /api/assessments/:id                             save (on a published assessment this publishes a new version; the button says so)
//   POST  /api/assessments/:id/publish                     publish, only on an explicit click (UNSOURCED_QUESTIONS asks again)
//   GET   /api/teaching/features                           whether AI drafts are on for the school
//   GET   /api/teaching/classes/:classId/objectives        outcomes to aim the AI draft at
//   POST  /api/assessments/generate                        AI draft: costs AI credits, runs only on an explicit click, never publishes
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, CircleDot, Copy, Eye, FilePlus2, Headphones, ListChecks, Pencil, PenLine, Plus, Send, Sparkles, TextCursorInput, Timer, ToggleLeft, Trash2, Upload, X } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { ApiError, api, errorText, get, post } from '@/lib/api';
import { SectionTitle } from '@/components/shell';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Select, Separator, Skeleton, Switch, TextField, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EmptyPanel, ErrorPanel, NotYet, SkeletonRows, SourceBadge, TeacherShell, arr, isFeatureOff, numOr, obj, setQuery, str, useLoad, useQueryParam, useTeacherClasses, type TeacherClass } from './common';

type QType = 'multiple-choice' | 'true-false' | 'short-answer' | 'open-response' | 'engine';
const EDITABLE: QType[] = ['multiple-choice', 'true-false', 'short-answer', 'open-response'];
const TYPE_ICON: Record<string, typeof CircleDot> = { 'multiple-choice': CircleDot, 'true-false': ToggleLeft, 'short-answer': TextCursorInput, 'open-response': PenLine, engine: ListChecks };
interface Level { id: string; label: string; points: number; description?: string }
interface Crit { id: string; title: string; levels: Level[]; [k: string]: unknown }
interface Q { id: string; type: string; text: string; options?: string[]; correctAnswer?: string | number; points?: number; modelAnswer?: string; rubric?: { criteria: Crit[] }; source?: string; sourceStatus?: string; [k: string]: unknown }
interface Doc { id?: string; title: string; subject: string; curriculumId: string; duration: string; instructions: string; answerReveal: string; lifecycle: string; publishedVersion: number | null; hasUnpublishedChanges: boolean; questions: Q[]; problems: string[] }

const T = {
  en: {
    title: 'Assessment builder', newDraft: 'New draft', draft: 'Draft', published: 'Published', archived: 'Archived', version: (v: number) => `version ${v}`, unsaved: 'unsaved changes', saved: 'saved',
    open: 'Open an assessment', newBtn: 'New', edit: 'Edit', preview: 'Preview as learner', save: 'Save draft', saveVersion: 'Save and publish as a new version', publish: 'Publish', saving: 'Saving…',
    leave: 'You have unsaved changes. Leave them?',
    settings: 'Settings', name: 'Title', namePh: 'For example: Unit 4 check: Past simple', cls: 'Class and curriculum', clsLocked: 'The curriculum cannot change after the first save.', subject: 'Subject',
    noCurriculum: 'None of your classes has a curriculum yet, so assessments can’t be saved.',
    due: 'Due date', dueV: 'Set when you assign it to a class', limit: 'Time limit (minutes)', limitHint: '1 to 600 minutes.',
    reveal: 'Answers shown to learners', revealOpts: { 'after-submit': 'After they submit', 'after-close': 'After the assignment closes', never: 'Never' } as Record<string, string>,
    shuffle: 'Shuffle question order', instructions: 'Instructions for learners',
    questions: 'Questions', totals: (q: number, p: number) => `${q} ${q === 1 ? 'question' : 'questions'} · ${p} ${p === 1 ? 'point' : 'points'}`,
    type: { 'multiple-choice': 'Multiple choice', 'true-false': 'True / false', 'short-answer': 'Short answer (exact match)', 'open-response': 'Open answer with rubric', engine: 'ENARA engine question' } as Record<string, string>,
    pts: (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`, up: 'Move up', down: 'Move down', editQ: 'Edit', done: 'Done', dup: 'Duplicate', del: 'Delete',
    qText: 'Question', option: (n: number) => `Option ${n}`, markCorrect: 'Mark as the correct answer', addOption: 'Add option', removeOption: 'Remove option',
    correct: 'Correct answer', answer: 'Answer', points: 'Points', modelAnswer: 'Model answer (teachers only; never shown to learners)',
    rubric: 'Rubric', criterion: 'Criterion', level: 'Level', removeCriterion: 'Remove criterion', removeLevel: 'Remove level', addLevel: 'Add level', addCriterion: 'Add criterion',
    rubricScoring: 'Scored with the rubric', engineNote: 'This question type is edited in the full ENARA builder.',
    aiDraft: 'AI draft · review before publishing', noSource: 'No supporting source in the chosen documents. Check this question.', checked: 'I’ve checked it',
    writtenAnswer: 'The learner writes an answer here.',
    add: 'Add question', addHint: 'Choose a question type', addMc: 'One correct answer from a list', addTf: 'True or false', addShort: 'A short answer checked against your key', addOpen: 'Longer writing scored with a rubric',
    addListen: 'Listening', addUpload: 'Import from a file',
    empty: 'No questions yet', emptyBody: 'Add a question, or make AI drafts from your curriculum.',
    lesson: 'Lesson', anyLesson: 'Any lesson in the curriculum', ai: 'Generate with AI', aiSub: 'Make draft questions from your curriculum. They open as a new draft assessment.', aiClass: 'Class', objectives: 'Learning outcomes (up to 10)', noObjectives: 'No approved outcomes for this class yet; ENARA uses the whole curriculum.',
    brief: 'What should it cover?', briefPh: 'For example: past simple of irregular verbs in travel stories', difficulty: 'Difficulty', diff: { Easy: 'Easy', Medium: 'Medium', Hard: 'Hard' } as Record<string, string>,
    count: 'Number of questions', types: 'Question types', makes: 'You get', generate: 'Generate drafts', generating: 'Generating…', cost: 'Uses your school’s AI credits.', englishOnly: 'AI drafts are in English only for now.',
    aiNote: 'Review before publishing', aiNoteBody: 'Questions made with AI are drafts. Check each one; learners see nothing until you publish and assign it.',
    aiOff: 'AI drafts are switched off for your school.', aiDirty: 'Save first: the AI draft opens as a new assessment.', aiDone: 'AI draft ready. Review every question, answer and rubric before publishing.',
    summary: 'Scoring in this assessment', ruleScored: 'Scored by rules', rubricScored: 'Scored with a rubric',
    problems: 'Before you can publish', ready: 'Ready to publish.', savedOk: 'Draft saved.', savedVersion: 'Saved and published as a new version.', savedNotPublished: 'Saved, but not published yet:',
    publishedOk: (v: number | null) => (v ? `Published as version ${v}. Learners get it when you assign it.` : 'Published.'),
    unsourced: 'Some questions have no supporting source', publishAnyway: 'Publish anyway', cancel: 'Cancel', needTitle: 'Add a title first.', needClass: 'Choose a class first.',
    archivedNote: 'This assessment is archived. Restore it in the full ENARA builder to edit it.',
  },
  ar: {
    title: 'منشئ التقييمات', newDraft: 'مسودة جديدة', draft: 'مسودة', published: 'منشور', archived: 'مؤرشف', version: (v: number) => `الإصدار ${v}`, unsaved: 'تغييرات غير محفوظة', saved: 'محفوظ',
    open: 'افتح تقييمًا', newBtn: 'جديد', edit: 'تحرير', preview: 'معاينة كطالب', save: 'حفظ المسودة', saveVersion: 'حفظ ونشر إصدار جديد', publish: 'نشر', saving: 'جارٍ الحفظ…',
    leave: 'لديك تغييرات غير محفوظة. هل تتركها؟',
    settings: 'الإعدادات', name: 'العنوان', namePh: 'مثال: اختبار الوحدة 4: الماضي البسيط', cls: 'الفصل والمنهج', clsLocked: 'لا يمكن تغيير المنهج بعد الحفظ الأول.', subject: 'المادة',
    noCurriculum: 'لا يوجد منهج مرتبط بأي من فصولك بعد، لذا لا يمكن حفظ التقييمات.',
    due: 'موعد التسليم', dueV: 'يُحدَّد عند تعيين التقييم لفصل', limit: 'المدة المحددة (بالدقائق)', limitHint: 'من 1 إلى 600 دقيقة.',
    reveal: 'متى يرى الطلاب الإجابات', revealOpts: { 'after-submit': 'بعد التسليم', 'after-close': 'بعد إغلاق الواجب', never: 'لا يرونها أبدًا' } as Record<string, string>,
    shuffle: 'ترتيب الأسئلة عشوائيًا', instructions: 'تعليمات للطلاب',
    questions: 'الأسئلة', totals: (q: number, p: number) => `${q} ${q === 1 ? 'سؤال' : q === 2 ? 'سؤالان' : q <= 10 ? 'أسئلة' : 'سؤالًا'} · ${p} ${p === 1 ? 'درجة' : p === 2 ? 'درجتان' : p <= 10 ? 'درجات' : 'درجة'}`,
    type: { 'multiple-choice': 'اختيار من متعدد', 'true-false': 'صواب / خطأ', 'short-answer': 'إجابة قصيرة (مطابقة تامة)', 'open-response': 'إجابة مفتوحة بمعايير تقييم', engine: 'سؤال من محرك إنارة' } as Record<string, string>,
    pts: (n: number) => (n === 1 ? 'درجة واحدة' : n === 2 ? 'درجتان' : n >= 3 && n <= 10 ? `${n} درجات` : `${n} درجة`), up: 'نقل إلى أعلى', down: 'نقل إلى أسفل', editQ: 'تحرير', done: 'تم', dup: 'تكرار', del: 'حذف',
    qText: 'السؤال', option: (n: number) => `الخيار ${n}`, markCorrect: 'تحديد كإجابة صحيحة', addOption: 'إضافة خيار', removeOption: 'حذف الخيار',
    correct: 'الإجابة الصحيحة', answer: 'الإجابة', points: 'الدرجات', modelAnswer: 'الإجابة النموذجية (للمعلمين فقط ولا تظهر للطلاب)',
    rubric: 'معايير التقييم', criterion: 'المعيار', level: 'المستوى', removeCriterion: 'حذف المعيار', removeLevel: 'حذف المستوى', addLevel: 'إضافة مستوى', addCriterion: 'إضافة معيار',
    rubricScoring: 'يُصحَّح بمعايير التقييم', engineNote: 'يُحرَّر هذا النوع من الأسئلة في منشئ إنارة الكامل.',
    aiDraft: 'مسودة من الذكاء الاصطناعي · راجعها قبل النشر', noSource: 'لا يوجد مصدر داعم في المستندات المختارة. راجع هذا السؤال.', checked: 'راجعته',
    writtenAnswer: 'يكتب الطالب إجابته هنا.',
    add: 'إضافة سؤال', addHint: 'اختر نوع السؤال', addMc: 'إجابة صحيحة واحدة من قائمة', addTf: 'صواب أو خطأ', addShort: 'إجابة قصيرة تُقارن بمفتاحك', addOpen: 'كتابة أطول تُصحَّح بمعايير تقييم',
    addListen: 'استماع', addUpload: 'استيراد من ملف',
    empty: 'لا توجد أسئلة بعد', emptyBody: 'أضف سؤالًا، أو أنشئ مسودات بالذكاء الاصطناعي من منهجك.',
    lesson: 'الدرس', anyLesson: 'أي درس في المنهج', ai: 'التوليد بالذكاء الاصطناعي', aiSub: 'أنشئ مسودات أسئلة من منهجك. تُفتح كتقييم جديد في وضع المسودة.', aiClass: 'الفصل', objectives: 'نواتج التعلّم (حتى 10)', noObjectives: 'لا توجد نواتج تعلّم معتمدة لهذا الفصل بعد؛ ستستخدم إنارة المنهج كاملًا.',
    brief: 'ماذا يجب أن تغطي الأسئلة؟', briefPh: 'مثال: الماضي البسيط للأفعال الشاذة في قصص السفر', difficulty: 'الصعوبة', diff: { Easy: 'سهل', Medium: 'متوسط', Hard: 'صعب' } as Record<string, string>,
    count: 'عدد الأسئلة', types: 'أنواع الأسئلة', makes: 'ستحصل على', generate: 'توليد المسودات', generating: 'جارٍ التوليد…', cost: 'يستهلك رصيد الذكاء الاصطناعي لمدرستك.', englishOnly: 'مسودات الذكاء الاصطناعي باللغة الإنجليزية فقط حاليًا.',
    aiNote: 'راجع قبل النشر', aiNoteBody: 'الأسئلة المولَّدة بالذكاء الاصطناعي مسودات. راجع كل سؤال؛ لا يرى الطلاب شيئًا حتى تنشر التقييم وتعيّنه.',
    aiOff: 'مسودات الذكاء الاصطناعي غير مفعَّلة لمدرستك.', aiDirty: 'احفظ أولًا: تُفتح مسودة الذكاء الاصطناعي كتقييم جديد.', aiDone: 'مسودة الذكاء الاصطناعي جاهزة. راجع كل سؤال وإجابة ومعيار قبل النشر.',
    summary: 'طرق التصحيح في هذا التقييم', ruleScored: 'يُصحَّح بالقواعد', rubricScored: 'يُصحَّح بمعايير التقييم',
    problems: 'قبل أن تتمكن من النشر', ready: 'جاهز للنشر.', savedOk: 'حُفظت المسودة.', savedVersion: 'حُفظ ونُشر إصدار جديد.', savedNotPublished: 'حُفظ، لكنه لم يُنشر بعد:',
    publishedOk: (v: number | null) => (v ? `نُشر الإصدار ${v}. يحصل عليه الطلاب عندما تعيّنه لهم.` : 'تم النشر.'),
    unsourced: 'بعض الأسئلة بلا مصدر داعم', publishAnyway: 'النشر على أي حال', cancel: 'إلغاء', needTitle: 'أضف عنوانًا أولًا.', needClass: 'اختر فصلًا أولًا.',
    archivedNote: 'هذا التقييم مؤرشف. استعده من منشئ إنارة الكامل لتحريره.',
  },
};

const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;
const isOpenQ = (q: Q) => q.type === 'open-response' || (q.type === 'engine' && arr(q.rubric?.criteria).length > 0);
const critMax = (c: Crit) => Math.max(0, ...arr<Level>(c.levels).map((l) => numOr(l.points) ?? 0));
function qPoints(q: Q): number {
  if (q.type === 'open-response') return arr<Crit>(q.rubric?.criteria).reduce((n, c) => n + critMax(c), 0);
  return numOr(q.points) ?? (q.type === 'engine' ? arr<Crit>(q.rubric?.criteria).reduce((n, c) => n + critMax(c), 0) : 1);
}
function blankQuestion(type: QType): Q {
  if (type === 'open-response') return { id: uid('q'), type, text: '', rubric: { criteria: [{ id: uid('c'), title: '', levels: [{ id: uid('l'), label: '', points: 0 }, { id: uid('l'), label: '', points: 2 }, { id: uid('l'), label: '', points: 4 }] }] } };
  if (type === 'true-false') return { id: uid('q'), type, text: '', options: ['True', 'False'], correctAnswer: 'True', points: 1 };
  if (type === 'short-answer') return { id: uid('q'), type, text: '', correctAnswer: '', points: 1 };
  return { id: uid('q'), type, text: '', options: ['', ''], correctAnswer: '', points: 1 };
}
function toDoc(raw: unknown): Doc {
  const o = obj(raw);
  return {
    id: str(o.id) || undefined, title: str(o.title), subject: str(o.subject), curriculumId: str(o.curriculumId), duration: numOr(o.duration) === null ? '30' : String(o.duration),
    instructions: str(o.instructions), answerReveal: str(o.answerReveal) || 'after-submit', lifecycle: str(o.lifecycle) || 'published',
    publishedVersion: numOr(o.publishedVersion), hasUnpublishedChanges: o.hasUnpublishedChanges === true,
    questions: arr(o.questions).map(obj).filter((q) => str(q.id) && str(q.type)).map((q) => ({
      ...q, id: str(q.id), type: str(q.type), text: str(q.text),
      ...(Array.isArray(q.options) ? { options: arr(q.options).map(str) } : {}),
      ...(q.rubric ? { rubric: { ...obj(q.rubric), criteria: arr(obj(q.rubric).criteria).map(obj).map((c) => ({ ...c, id: str(c.id), title: str(c.title), levels: arr(c.levels).map(obj).map((l) => ({ ...l, id: str(l.id), label: str(l.label), points: numOr(l.points) ?? 0 })) })) } } : {}),
    }) as Q),
    problems: arr(o.publishProblems).map(str).filter(Boolean),
  };
}
const blankDoc = (c: TeacherClass | null): Doc => ({ title: '', subject: c?.courseName ?? '', curriculumId: c?.curriculumId ?? '', duration: '30', instructions: '', answerReveal: 'after-submit', lifecycle: 'draft', publishedVersion: null, hasUnpublishedChanges: false, questions: [], problems: [] });

const En = ({ children }: { children: ReactNode }) => <bdi dir="auto">{children}</bdi>;

// ------------------------------------------------------------------ one question
function QCard({ n, q, total, editable, previewing, onChange, onDelete, onDuplicate, onMove }: { n: number; q: Q; total: number; editable: boolean; previewing: boolean; onChange: (q: Q) => void; onDelete: () => void; onDuplicate: () => void; onMove: (d: -1 | 1) => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const [editing, setEditing] = useState(false);
  const Icon = TYPE_ICON[q.type] ?? ListChecks;
  const draft = q.source === 'ai';
  const canEdit = editable && !previewing && (EDITABLE as string[]).includes(q.type);
  const criteria = arr<Crit>(q.rubric?.criteria);
  const setCrit = (i: number, c: Crit) => onChange({ ...q, rubric: { ...(q.rubric ?? {}), criteria: criteria.map((x, j) => (j === i ? c : x)) } });
  const options = arr<string>(q.options);

  return (
    <Card className={cn('flex', draft && 'border-dashed border-accent bg-accent/5')}>
      {editable && !previewing && (
        <div className="flex w-9 shrink-0 flex-col items-center gap-1 rounded-s-xl border-e bg-muted/50 py-2">
          <Button variant="ghost" size="sm" className="size-7 px-0" aria-label={t.up} isDisabled={n === 1} onPress={() => onMove(-1)}><ArrowUp /></Button>
          <Button variant="ghost" size="sm" className="size-7 px-0" aria-label={t.down} isDisabled={n === total} onPress={() => onMove(1)}><ArrowDown /></Button>
        </div>
      )}
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{num(n, lang)}</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="size-4 shrink-0 text-muted-foreground" />{t.type[q.type] ?? q.type}</span>
            <span className="text-xs text-muted-foreground">· {t.pts(qPoints(q))}</span>
          </span>
          {editable && !previewing && (
            <span className="flex shrink-0 items-center gap-0.5">
              {canEdit && <Button variant={editing ? 'secondary' : 'ghost'} size="sm" className="size-8 px-0" aria-label={editing ? t.done : t.editQ} onPress={() => setEditing((v) => !v)}>{editing ? <Check /> : <Pencil />}</Button>}
              <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={t.dup} onPress={onDuplicate}><Copy /></Button>
              <Button variant="ghost" size="sm" className="size-8 px-0 text-destructive" aria-label={t.del} onPress={onDelete}><Trash2 /></Button>
            </span>
          )}
        </div>

        {editing && canEdit ? (
          <div className="mt-3 flex flex-col gap-3">
            <TextField label={t.qText} multiline value={q.text} onChange={(v) => onChange({ ...q, text: v })} />
            {q.type === 'multiple-choice' && (
              <div className="flex flex-col gap-2">
                {options.map((o, k) => {
                  const isCorrect = o !== '' && String(q.correctAnswer) === o;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <Button size="sm" variant={isCorrect ? 'success' : 'outline'} className="size-9 shrink-0 px-0" aria-label={`${t.markCorrect}: ${t.option(k + 1)}`} aria-pressed={isCorrect} onPress={() => onChange({ ...q, correctAnswer: o })}><Check /></Button>
                      <TextField aria-label={t.option(k + 1)} placeholder={t.option(k + 1)} value={o} className="min-w-0 flex-1"
                        onChange={(v) => onChange({ ...q, options: options.map((x, m) => (m === k ? v : x)), correctAnswer: String(q.correctAnswer) === o ? v : q.correctAnswer })} />
                      <Button size="sm" variant="ghost" className="size-9 shrink-0 px-0 text-destructive" aria-label={t.removeOption} isDisabled={options.length <= 2} onPress={() => onChange({ ...q, options: options.filter((_, m) => m !== k), correctAnswer: String(q.correctAnswer) === o ? '' : q.correctAnswer })}><X /></Button>
                    </div>
                  );
                })}
                <Button size="sm" variant="ghost" className="self-start" isDisabled={options.length >= 20} onPress={() => onChange({ ...q, options: [...options, ''] })}><Plus />{t.addOption}</Button>
              </div>
            )}
            {q.type === 'true-false' && (
              <Select label={t.correct} items={[{ id: 'True', name: lang === 'ar' ? 'صواب (True)' : 'True' }, { id: 'False', name: lang === 'ar' ? 'خطأ (False)' : 'False' }]} selectedKey={String(q.correctAnswer ?? 'True')} onSelectionChange={(k) => onChange({ ...q, options: ['True', 'False'], correctAnswer: String(k ?? 'True') })} className="max-w-48" />
            )}
            {q.type === 'short-answer' && <TextField label={t.correct} value={str(q.correctAnswer)} onChange={(v) => onChange({ ...q, correctAnswer: v })} />}
            {q.type === 'open-response' ? (
              <>
                <TextField label={t.modelAnswer} multiline value={str(q.modelAnswer)} onChange={(v) => onChange({ ...q, modelAnswer: v })} />
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold">{t.rubric}</p>
                  {criteria.map((c, i) => (
                    <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-end gap-2">
                        <TextField label={t.criterion} value={c.title} onChange={(v) => setCrit(i, { ...c, title: v })} className="min-w-0 flex-1" />
                        <Button size="sm" variant="ghost" className="size-11 shrink-0 px-0 text-destructive" aria-label={t.removeCriterion} isDisabled={criteria.length <= 1} onPress={() => onChange({ ...q, rubric: { ...(q.rubric ?? {}), criteria: criteria.filter((_, j) => j !== i) } })}><Trash2 /></Button>
                      </div>
                      {arr<Level>(c.levels).map((l, li) => (
                        <div key={l.id} className="flex items-center gap-2">
                          <TextField aria-label={`${t.level} ${li + 1}`} placeholder={`${t.level} ${li + 1}`} value={l.label} className="min-w-0 flex-1" onChange={(v) => setCrit(i, { ...c, levels: c.levels.map((x, k) => (k === li ? { ...x, label: v } : x)) })} />
                          <TextField aria-label={t.points} type="number" inputMode="numeric" value={String(l.points)} className="w-20 shrink-0" onChange={(v) => setCrit(i, { ...c, levels: c.levels.map((x, k) => (k === li ? { ...x, points: Math.max(0, Math.min(100, Number(v) || 0)) } : x)) })} />
                          <Button size="sm" variant="ghost" className="size-9 shrink-0 px-0" aria-label={t.removeLevel} isDisabled={c.levels.length <= 1} onPress={() => setCrit(i, { ...c, levels: c.levels.filter((_, k) => k !== li) })}><X /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" className="self-start" isDisabled={c.levels.length >= 8} onPress={() => setCrit(i, { ...c, levels: [...c.levels, { id: uid('l'), label: '', points: 0 }] })}><Plus />{t.addLevel}</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="self-start" isDisabled={criteria.length >= 12} onPress={() => onChange({ ...q, rubric: { ...(q.rubric ?? {}), criteria: [...criteria, { id: uid('c'), title: '', levels: [{ id: uid('l'), label: '', points: 0 }, { id: uid('l'), label: '', points: 2 }] }] } })}><Plus />{t.addCriterion}</Button>
                </div>
              </>
            ) : (
              <TextField label={t.points} type="number" inputMode="numeric" value={q.points == null ? '1' : String(q.points)} onChange={(v) => onChange({ ...q, points: Math.max(0, Math.min(100, Number(v) || 0)) })} className="max-w-32" />
            )}
          </div>
        ) : (
          <div className="mt-2.5 text-sm">
            <p className="font-medium" dir="auto">{q.text || <span className="text-muted-foreground">—</span>}</p>
            {(q.type === 'multiple-choice' || q.type === 'true-false') && options.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {options.map((o, i) => {
                  const right = !previewing && o !== '' && String(q.correctAnswer) === o;
                  return (
                    <li key={i} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm', right && 'border-success bg-success-soft font-semibold')}>
                      <span className="text-xs text-muted-foreground">{'abcdefghijklmnopqrst'[i] ?? ''})</span><En>{o || '—'}</En>{right && <Check className="ms-auto size-4 text-success" />}
                    </li>
                  );
                })}
              </ul>
            )}
            {q.type === 'short-answer' && !previewing && <p className="mt-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{t.correct}: <En>{str(q.correctAnswer) || '—'}</En></p>}
            {(q.type === 'short-answer' || q.type === 'open-response') && previewing && <p className="mt-2 rounded-md border border-dashed px-2.5 py-3 text-xs text-muted-foreground">{t.writtenAnswer}</p>}
            {q.type === 'open-response' && !previewing && (
              <div className="mt-2.5 rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold">{t.rubric}</p>
                <div className="flex flex-wrap gap-1.5">{criteria.map((c) => <Badge key={c.id} tone="outline"><En>{c.title || '—'}</En> · {num(critMax(c), lang)}</Badge>)}</div>
                {str(q.modelAnswer) && <p className="mt-2 text-xs text-muted-foreground" dir="auto">{t.modelAnswer}: {str(q.modelAnswer)}</p>}
              </div>
            )}
            {q.type === 'engine' && !previewing && <p className="mt-2 text-xs text-muted-foreground">{t.engineNote}</p>}
          </div>
        )}

        {!previewing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOpenQ(q) ? <Badge tone="outline"><PenLine />{t.rubricScoring}</Badge> : <SourceBadge source="rules" />}
            {draft && <Badge tone="warning"><Sparkles />{t.aiDraft}</Badge>}
          </div>
        )}
        {!previewing && q.sourceStatus === 'no_supporting_source' && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning-foreground">
            <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 shrink-0" />{t.noSource}</span>
            {editable && <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onPress={() => { const { sourceStatus: _s, ...rest } = q; onChange(rest as Q); }}>{t.checked}</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ page
export default function Builder() {
  const t = useT(T);
  const { lang } = usePreview();
  const idParam = useQueryParam('id');
  const classParam = useQueryParam('class');
  const classes = useTeacherClasses();
  const withCurriculum = useMemo(() => (classes.data ?? []).filter((c) => c.curriculumId), [classes.data]);
  const list = useLoad(async (signal) => arr(await get('/api/assessments', signal)).map(obj).map((a) => ({ id: str(a.id), title: str(a.title), lifecycle: str(a.lifecycle) || 'published' })).filter((a) => a.id), []);
  const features = useLoad(async (signal) => obj(await get('/api/teaching/features', signal)), []);
  const loaded = useLoad(idParam ? async (signal) => obj(await get(`/api/assessments/${encodeURIComponent(idParam)}`, signal)) : null, [idParam]);

  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string; list?: string[] } | null>(null);
  const [unsourced, setUnsourced] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const defaultClass = withCurriculum.find((c) => c.id === classParam) ?? withCurriculum[0] ?? null;
  useEffect(() => { if (idParam) { setDoc(loaded.data ? toDoc(loaded.data) : null); setDirty(false); } }, [idParam, loaded.data]);
  useEffect(() => { if (!idParam && classes.data) { setDoc(blankDoc(defaultClass)); setDirty(false); } }, [idParam, classes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setUnsourced(null); setPreviewing(false); }, [idParam]);

  const update = (patch: Partial<Doc>) => { setDoc((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };
  const setQuestions = (fn: (qs: Q[]) => Q[]) => update({ questions: fn(doc?.questions ?? []) });
  const confirmLeave = () => !dirty || window.confirm(t.leave);
  const openId = (id: string | null) => { if (!confirmLeave()) return; setMsg(null); if (!id && !idParam && classes.data) { setDoc(blankDoc(defaultClass)); setDirty(false); } setQuery('/teacher/builder', { id }); };

  // ---- AI draft
  const [aiClassId, setAiClassId] = useState<string | null>(null);
  const aiClass = withCurriculum.find((c) => c.id === aiClassId) ?? withCurriculum.find((c) => c.curriculumId === doc?.curriculumId) ?? defaultClass;
  const objectives = useLoad(aiClass ? async (signal) => arr(obj(await get(`/api/teaching/classes/${encodeURIComponent(aiClass.id)}/objectives`, signal)).objectives).map(obj).map((o) => ({ id: str(o.id), name: [str(o.code), str(o.title)].filter(Boolean).join(' · ') || str(o.id) })).filter((o) => o.id) : null, [aiClass?.id]);
  const [aiObjectives, setAiObjectives] = useState<string[]>([]);
  const [lessonId, setLessonId] = useState('__any');
  const [brief, setBrief] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [count, setCount] = useState('5');
  const [aiTypes, setAiTypes] = useState<string[]>(['multiple-choice', 'short-answer']);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => { setAiObjectives([]); setLessonId('__any'); }, [aiClass?.id]);
  const aiCounts = useMemo(() => {
    const sel = EDITABLE.filter((x) => aiTypes.includes(x));
    const n = Number(count) || 0;
    const out: Record<string, number> = { 'multiple-choice': 0, 'true-false': 0, 'short-answer': 0, 'open-response': 0 };
    sel.forEach((x, i) => { out[x] = Math.floor(n / sel.length) + (i < n % sel.length ? 1 : 0); });
    return out;
  }, [aiTypes, count]);
  const aiOn = features.data ? features.data.aiAssessmentDrafts !== false : !isFeatureOff(features.error);
  const generate = async () => {
    if (!aiClass?.curriculumId) return;
    setAiBusy(true); setAiMsg(null);
    try {
      const r = obj(await post('/api/assessments/generate', { curriculumId: aiClass.curriculumId, ...(lessonId !== '__any' ? { lessonId } : {}), objectiveIds: aiObjectives, brief: brief.trim(), language: 'en', difficulty, counts: aiCounts }));
      const id = str(obj(r.assessment).id);
      setAiMsg({ tone: 'success', text: t.aiDone });
      list.reload();
      if (id) { setDirty(false); setQuery('/teacher/builder', { id }); }
    } catch (e) {
      setAiMsg({ tone: 'danger', text: isFeatureOff(e) ? t.aiOff : errorText(e, lang) });
    } finally { setAiBusy(false); }
  };

  // ---- save and publish
  const editable = !!doc && doc.lifecycle !== 'archived';
  const save = async () => {
    if (!doc) return;
    if (!doc.title.trim()) { setMsg({ tone: 'danger', text: t.needTitle }); return; }
    if (!doc.curriculumId) { setMsg({ tone: 'danger', text: t.needClass }); return; }
    const dur = Number(doc.duration);
    const payload = {
      title: doc.title.trim(), subject: doc.subject.trim() || withCurriculum.find((c) => c.curriculumId === doc.curriculumId)?.courseName || 'General', curriculumId: doc.curriculumId,
      instructions: doc.instructions, answerReveal: doc.answerReveal, ...(Number.isFinite(dur) && dur >= 1 && dur <= 600 ? { duration: Math.round(dur) } : {}),
      questions: doc.questions.map((q) => ({ ...q, points: q.type === 'open-response' ? undefined : numOr(Number(q.points ?? 1)) ?? 1 })),
    };
    setBusy(true); setMsg(null);
    try {
      if (doc.id) {
        const r = obj(await api('PATCH', `/api/assessments/${encodeURIComponent(doc.id)}`, payload));
        const problems = arr(r.publishProblems).map(str).filter(Boolean);
        setMsg(doc.lifecycle === 'published' ? (problems.length ? { tone: 'warning', text: t.savedNotPublished, list: problems } : { tone: 'success', text: t.savedVersion }) : { tone: 'success', text: t.savedOk });
        setDirty(false); loaded.reload(); list.reload();
      } else {
        const r = obj(await post('/api/assessments', { ...payload, lifecycle: 'draft' }));
        setMsg({ tone: 'success', text: t.savedOk });
        setDirty(false); list.reload();
        if (str(r.id)) setQuery('/teacher/builder', { id: str(r.id) });
      }
    } catch (e) { setMsg({ tone: 'danger', text: errorText(e, lang) }); } finally { setBusy(false); }
  };
  const publish = async (acknowledge = false) => {
    if (!doc?.id) return;
    setBusy(true); setMsg(null);
    try {
      const r = obj(await post(`/api/assessments/${encodeURIComponent(doc.id)}/publish`, acknowledge ? { acknowledgeUnsourced: true } : {}));
      setUnsourced(null);
      setMsg({ tone: 'success', text: t.publishedOk(numOr(obj(r.version).version)) });
      loaded.reload(); list.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNSOURCED_QUESTIONS') setUnsourced(e.message);
      else setMsg({ tone: 'danger', text: errorText(e, lang) });
    } finally { setBusy(false); }
  };

  const questions = doc?.questions ?? [];
  const totalPts = questions.reduce((n, q) => n + qPoints(q), 0);
  const rulePts = questions.filter((q) => !isOpenQ(q)).reduce((n, q) => n + qPoints(q), 0);
  const lifecycleLabel = !doc ? '' : !doc.id ? t.newDraft : doc.lifecycle === 'draft' ? t.draft : doc.lifecycle === 'archived' ? t.archived : t.published;
  const subtitle = doc ? [lifecycleLabel, doc.publishedVersion ? t.version(doc.publishedVersion) : '', dirty ? t.unsaved : doc.id ? t.saved : ''].filter(Boolean).join(' · ') : undefined;
  const canPublish = !!doc?.id && doc.lifecycle === 'draft' && !dirty && !busy && !doc.problems.length;
  const listItems = (list.data ?? []).map((a) => ({ id: a.id, name: `${a.title || '—'} · ${a.lifecycle === 'draft' ? t.draft : a.lifecycle === 'archived' ? t.archived : t.published}` }));
  const curriculumItems = withCurriculum.map((c) => ({ id: c.id, name: [c.courseName, c.curriculumName].filter(Boolean).join(' · ') || c.id }));
  const docClass = withCurriculum.find((c) => c.curriculumId === doc?.curriculumId) ?? null;
  const addItems: [QType, string][] = [['multiple-choice', t.addMc], ['true-false', t.addTf], ['short-answer', t.addShort], ['open-response', t.addOpen]];

  const loadingDoc = (idParam ? loaded.loading && !loaded.data : !classes.data) && !classes.error;

  return (
    <TeacherShell active="assessments" title={doc?.title || t.title} subtitle={subtitle}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {list.data ? <Select aria-label={t.open} placeholder={t.open} items={listItems} selectedKey={idParam} onSelectionChange={(k) => { if (k != null && String(k) !== idParam) openId(String(k)); }} className="min-w-0 flex-1 sm:w-72" /> : list.error ? null : <Skeleton className="h-11 flex-1 sm:w-72" />}
            <Button variant="outline" onPress={() => openId(null)}><FilePlus2 />{t.newBtn}</Button>
          </div>
          <div role="group" aria-label={t.preview} className="flex gap-1 rounded-lg bg-muted p-1">
            <Toggle isSelected={!previewing} onChange={() => setPreviewing(false)} className="border-0"><Pencil />{t.edit}</Toggle>
            <Toggle isSelected={previewing} onChange={() => setPreviewing(true)} className="border-0 bg-transparent"><Eye />{t.preview}</Toggle>
          </div>
          {editable && (
            <div className="flex w-full gap-2 sm:ms-auto sm:w-auto">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" isDisabled={busy || (!dirty && !!doc?.id)} onPress={save}>{busy ? t.saving : doc?.lifecycle === 'published' && doc.id ? t.saveVersion : t.save}</Button>
              {doc?.lifecycle !== 'published' && <Button size="sm" className="flex-1 sm:flex-none" isDisabled={!canPublish} onPress={() => publish(false)}><Send />{t.publish}</Button>}
            </div>
          )}
        </div>
        {list.error ? <ErrorPanel error={list.error} onRetry={list.reload} /> : null}
        {msg && (
          <Alert tone={msg.tone} icon={msg.tone === 'success' ? <Check /> : <AlertTriangle />} title={msg.text}>
            {msg.list && <ul className="list-disc ps-5">{msg.list.map((p) => <li key={p}>{p}</li>)}</ul>}
          </Alert>
        )}
        {unsourced && (
          <Alert tone="warning" icon={<AlertTriangle />} title={t.unsourced}>
            <p>{unsourced}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" isDisabled={busy} onPress={() => publish(true)}><Send />{t.publishAnyway}</Button><Button size="sm" variant="ghost" onPress={() => setUnsourced(null)}>{t.cancel}</Button></div>
          </Alert>
        )}
        {doc && doc.id && doc.lifecycle === 'draft' && !dirty && (doc.problems.length ? (
          <Alert tone="warning" icon={<AlertTriangle />} title={t.problems}><ul className="list-disc ps-5">{doc.problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>
        ) : <Alert tone="success" icon={<Check />}>{t.ready}</Alert>)}
        {doc?.lifecycle === 'archived' && <Alert tone="info">{t.archivedNote}</Alert>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            {classes.error ? <ErrorPanel error={classes.error} onRetry={classes.reload} /> : idParam && loaded.error ? <ErrorPanel error={loaded.error} onRetry={loaded.reload} /> : loadingDoc || !doc ? (
              <Card className="p-5"><SkeletonRows rows={4} /></Card>
            ) : (
              <>
                {!previewing && (
                  <Card>
                    <CardHeader><CardTitle>{t.settings}</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <TextField label={t.name} placeholder={t.namePh} value={doc.title} onChange={(v) => update({ title: v })} isDisabled={!editable} className="sm:col-span-2" />
                      {withCurriculum.length ? (
                        <Select label={t.cls} items={curriculumItems} selectedKey={docClass?.id ?? null} isDisabled={!editable || !!doc.id}
                          onSelectionChange={(k) => { const c = withCurriculum.find((x) => x.id === String(k)); if (c) update({ curriculumId: c.curriculumId ?? '', subject: doc.subject || c.courseName }); }} />
                      ) : <Alert tone="warning" icon={<AlertTriangle />}>{t.noCurriculum}</Alert>}
                      <TextField label={t.subject} value={doc.subject} onChange={(v) => update({ subject: v })} isDisabled={!editable} />
                      <div className="flex flex-col gap-1.5"><p className="text-sm font-semibold">{t.due}</p><p className="flex min-h-tap items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground"><CalendarDays className="size-4" />{t.dueV}</p></div>
                      <TextField label={t.limit} type="number" inputMode="numeric" value={doc.duration} onChange={(v) => update({ duration: v })} isDisabled={!editable} description={t.limitHint} />
                      <Select label={t.reveal} items={Object.entries(t.revealOpts).map(([id, name]) => ({ id, name }))} selectedKey={doc.answerReveal} isDisabled={!editable} onSelectionChange={(k) => k != null && update({ answerReveal: String(k) })} />
                      <div className="flex flex-col justify-center gap-0.5"><Switch isDisabled>{t.shuffle}</Switch><NotYet className="ps-14" /></div>
                      <TextField label={t.instructions} multiline value={doc.instructions} onChange={(v) => update({ instructions: v })} isDisabled={!editable} className="sm:col-span-2" />
                    </CardContent>
                  </Card>
                )}

                <section>
                  <SectionTitle action={<span className="text-xs text-muted-foreground">{t.totals(questions.length, totalPts)}</span>}>{t.questions}</SectionTitle>
                  <div className="flex flex-col gap-3">
                    {!questions.length && <EmptyPanel title={t.empty} body={t.emptyBody} />}
                    {questions.map((q, i) => (
                      <QCard key={q.id} n={i + 1} q={q} total={questions.length} editable={editable} previewing={previewing}
                        onChange={(nq) => setQuestions((qs) => qs.map((x, j) => (j === i ? nq : x)))}
                        onDelete={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                        onDuplicate={() => setQuestions((qs) => [...qs.slice(0, i + 1), { ...JSON.parse(JSON.stringify(q)), id: uid('q') }, ...qs.slice(i + 1)])}
                        onMove={(dlt) => setQuestions((qs) => { const a = [...qs]; const [x] = a.splice(i, 1); a.splice(Math.max(0, Math.min(a.length, i + dlt)), 0, x); return a; })} />
                    ))}

                    {editable && !previewing && (
                      <div className="rounded-xl border-2 border-dashed p-3">
                        <Button variant="outline" className="w-full sm:w-auto" aria-expanded={addOpen} onPress={() => setAddOpen((v) => !v)}><Plus />{t.add}</Button>
                        {addOpen && (
                          <div role="menu" aria-label={t.addHint} className="mt-2 rounded-lg border bg-popover p-1 shadow-lg sm:max-w-md">
                            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.addHint}</p>
                            {addItems.map(([k, desc]) => {
                              const Icon = TYPE_ICON[k];
                              return (
                                <button key={k} type="button" role="menuitem" className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-muted"
                                  onClick={() => { setQuestions((qs) => [...qs, blankQuestion(k)]); setAddOpen(false); }}>
                                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground"><Icon className="size-4" /></span>
                                  <span className="min-w-0"><span className="block text-sm font-semibold">{t.type[k]}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
                                </button>
                              );
                            })}
                            <Separator className="my-1" />
                            {([[Headphones, t.addListen], [Upload, t.addUpload]] as const).map(([Icon, label]) => (
                              <div key={label} role="menuitem" aria-disabled="true" className="flex items-center gap-3 rounded-md px-2 py-2 opacity-60">
                                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                                <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><NotYet /></span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <Card className="border-accent/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>{t.ai}</CardTitle>
                <CardDescription>{t.aiSub}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {features.loading && !features.data ? <SkeletonRows rows={2} /> : !aiOn ? <Alert tone="info">{t.aiOff}</Alert> : !withCurriculum.length ? <Alert tone="warning" icon={<AlertTriangle />}>{t.noCurriculum}</Alert> : (
                  <>
                    <Select label={t.aiClass} items={curriculumItems} selectedKey={aiClass?.id ?? null} onSelectionChange={(k) => k != null && setAiClassId(String(k))} />
                    {(aiClass?.lessons ?? []).length > 0 && (
                      <Select label={t.lesson} items={[{ id: '__any', name: t.anyLesson }, ...(aiClass?.lessons ?? []).map((l) => ({ id: l.id, name: l.title || l.id }))]} selectedKey={lessonId} onSelectionChange={(k) => k != null && setLessonId(String(k))} />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{t.objectives}</p>
                      {objectives.loading && !objectives.data ? <SkeletonRows rows={2} className="mt-2" /> : objectives.error ? <ErrorPanel error={objectives.error} onRetry={objectives.reload} className="mt-2" /> : !(objectives.data ?? []).length ? (
                        <p className="mt-1 text-xs text-muted-foreground">{t.noObjectives}</p>
                      ) : (
                        <div className="mt-1 max-h-40 overflow-y-auto">
                          {(objectives.data ?? []).map((o) => (
                            <Checkbox key={o.id} isSelected={aiObjectives.includes(o.id)} isDisabled={!aiObjectives.includes(o.id) && aiObjectives.length >= 10}
                              onChange={(on) => setAiObjectives((s) => (on ? [...s, o.id] : s.filter((x) => x !== o.id)))}><span dir="auto" className="line-clamp-2">{o.name}</span></Checkbox>
                          ))}
                        </div>
                      )}
                    </div>
                    <TextField label={t.brief} placeholder={t.briefPh} multiline value={brief} onChange={setBrief} />
                    <div className="grid grid-cols-2 gap-3">
                      <Select label={t.difficulty} items={['Easy', 'Medium', 'Hard'].map((id) => ({ id, name: t.diff[id] }))} selectedKey={difficulty} onSelectionChange={(k) => k != null && setDifficulty(String(k))} />
                      <Select label={t.count} items={[3, 5, 8, 10, 15, 20].map((c) => ({ id: String(c), name: num(c, lang) }))} selectedKey={count} onSelectionChange={(k) => k != null && setCount(String(k))} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.types}</p>
                      <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2 xl:grid-cols-1">
                        {EDITABLE.map((k) => <Checkbox key={k} isSelected={aiTypes.includes(k)} onChange={(on) => setAiTypes((s) => (on ? [...s, k] : s.filter((x) => x !== k)))}>{t.type[k]}</Checkbox>)}
                      </div>
                      {aiTypes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t.makes}: {EDITABLE.filter((k) => aiCounts[k] > 0).map((k) => `${num(aiCounts[k], lang)} × ${t.type[k]}`).join(' · ')}</p>}
                    </div>
                    <Alert tone="warning" icon={<Eye />} title={t.aiNote}>{t.aiNoteBody}</Alert>
                    {dirty && <p className="text-xs font-semibold text-warning-foreground">{t.aiDirty}</p>}
                    <Button variant="accent" className="w-full" isDisabled={aiBusy || !aiTypes.length || !aiClass?.curriculumId || dirty} onPress={generate}><Sparkles />{aiBusy ? t.generating : t.generate}</Button>
                    <p className="text-center text-xs text-muted-foreground">{t.cost} {t.englishOnly}</p>
                    {aiMsg && <Alert tone={aiMsg.tone} icon={aiMsg.tone === 'success' ? <Check /> : <AlertTriangle />}>{aiMsg.text}</Alert>}
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle>{t.summary}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2.5 text-sm">
                <div className="flex items-center justify-between gap-2"><SourceBadge source="rules" /><span className="font-semibold tabular-nums">{t.pts(rulePts)}</span></div>
                <div className="flex items-center justify-between gap-2"><Badge tone="outline"><PenLine />{t.rubricScored}</Badge><span className="font-semibold tabular-nums">{t.pts(totalPts - rulePts)}</span></div>
                <Separator className="my-1" />
                <p className="flex items-center gap-2 text-muted-foreground"><Timer className="size-4" />{doc && Number(doc.duration) >= 1 ? `${num(Number(doc.duration), lang)} ${lang === 'ar' ? 'دقيقة' : 'min'}` : '—'}</p>
                <p className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" />{t.dueV}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </TeacherShell>
  );
}
