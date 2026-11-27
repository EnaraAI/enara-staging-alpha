import type { ReactNode } from 'react';
import { Check, ChevronRight, Clock3, FileText, Filter, Mic, PenLine, SpellCheck, TextCursorInput, Undo2 } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { Avatar, Badge, Button, Card, Checkbox, Dir, Progress, Select, Separator, Tab, TabList, Tabs, TextField } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SourceBadge, TeacherShell, learner, type Source } from './common';

type Kind = 'essay' | 'short' | 'speaking' | 'spelling' | 'grammar';
interface Sub { id: string; who: string; kind: Kind; task: { en: string; ar: string }; source: Source; conf: number | null; score: number; max: number; was?: number; when: { en: string; ar: string } }

const SUBS: Sub[] = [
  { id: 's1', who: 'l07', kind: 'essay', task: { en: 'Essay: A place I would like to visit', ar: 'مقال: مكان أودّ زيارته' }, source: 'mishkat', conf: 92, score: 16, max: 20, when: { en: '25 Nov, 19:42', ar: '25 نوفمبر، 19:42' } },
  { id: 's2', who: 'l17', kind: 'short', task: { en: 'Reading: The Lost Key, question 4', ar: 'قراءة: المفتاح المفقود، السؤال 4' }, source: 'mishkat', conf: 58, score: 2, max: 4, when: { en: '25 Nov, 18:10', ar: '25 نوفمبر، 18:10' } },
  { id: 's3', who: 'l11', kind: 'speaking', task: { en: 'Speaking: Describe your weekend', ar: 'محادثة: صِف عطلة نهاية الأسبوع' }, source: 'model', conf: 74, score: 7, max: 10, when: { en: '25 Nov, 16:55', ar: '25 نوفمبر، 16:55' } },
  { id: 's4', who: 'l14', kind: 'essay', task: { en: 'Essay: A place I would like to visit', ar: 'مقال: مكان أودّ زيارته' }, source: 'mishkat', conf: 88, score: 17, max: 20, when: { en: '25 Nov, 15:30', ar: '25 نوفمبر، 15:30' } },
  { id: 's5', who: 'l09', kind: 'short', task: { en: 'Reading: The Lost Key, question 2', ar: 'قراءة: المفتاح المفقود، السؤال 2' }, source: 'model', conf: 63, score: 1, max: 4, when: { en: '25 Nov, 14:02', ar: '25 نوفمبر، 14:02' } },
  { id: 's6', who: 'l10', kind: 'spelling', task: { en: 'Spelling check: Unit 4 words', ar: 'اختبار إملاء: كلمات الوحدة 4' }, source: 'rules', conf: null, score: 18, max: 20, when: { en: '24 Nov, 20:15', ar: '24 نوفمبر، 20:15' } },
  { id: 's7', who: 'l26', kind: 'grammar', task: { en: 'Gap-fill: Past simple', ar: 'أكمل الفراغ: الماضي البسيط' }, source: 'rules', conf: null, score: 11, max: 15, when: { en: '24 Nov, 19:48', ar: '24 نوفمبر، 19:48' } },
  { id: 's8', who: 'l16', kind: 'essay', task: { en: 'Essay: A place I would like to visit', ar: 'مقال: مكان أودّ زيارته' }, source: 'teacher', conf: null, score: 15, max: 20, was: 13, when: { en: '24 Nov, 17:20', ar: '24 نوفمبر، 17:20' } },
];
const KIND_ICON: Record<Kind, typeof PenLine> = { essay: PenLine, short: TextCursorInput, speaking: Mic, spelling: SpellCheck, grammar: FileText };

const ESSAY = {
  p1: 'Last summer I visited Siwa with my family, but the place I would most like to visit again is Dahab. Dahab is a small town on the coast of South Sinai, and it is famous for its clear water and its colourful fish.',
  p4: 'In conclusion, I hope to visit Dahab next summer with my friends from school, and I want to learn how to dive.',
};

const T = {
  en: {
    title: 'Grading', sub: 'Grade 9 – B · 14 submissions waiting', filter: 'Filter',
    tAll: 'All', tReview: 'Needs review', tLow: 'Low confidence', tDone: 'Done today',
    conf: 'Confidence', exact: 'Exact match', suggested: 'Suggested', final: 'Final', was: 'was', review: 'Review', accept: 'Accept', accepted: 'Accepted',
    low: 'Low', high: 'High', med: 'Medium',
    open: 'Open submission', submitted: 'Submitted', words: '148 words', learnerText: 'Learner’s text', flagged: 'Marked by Mishkat: 4 grammar points',
    traits: 'Trait scores', level: 'Mishkat’s level', overall: 'Overall level',
    task: 'Task', org: 'Organisation', grammar: 'Grammar', vocab: 'Vocabulary',
    cTask: 'Answers the prompt fully, with reasons and an example.', cOrg: 'Clear paragraphs; linking words used well.', cGrammar: 'Irregular past forms often wrong (goed, swimmed, eat).', cVocab: 'Good range for B1; some repetition.',
    yourScore: 'Your score', reset: 'Reset to Mishkat’s scores', reason: 'Reason for the change (shown in the class report)', reasonPh: 'For example: grammar errors do not block meaning',
    notify: 'Tell the learner the score was changed by the teacher', feedback: 'Feedback to the learner', fb: 'Lovely description of Dahab with clear reasons. Next step: check the past simple of irregular verbs (go → went, swim → swam, eat → ate).',
    acceptScore: 'Accept 16 / 20', saveOverride: 'Save override', next: 'Next', prev: 'Previous', of: '1 of 14',
  },
  ar: {
    title: 'التصحيح', sub: 'الصف التاسع – ب · 14 تسليمًا بالانتظار', filter: 'تصفية',
    tAll: 'الكل', tReview: 'تحتاج مراجعة', tLow: 'ثقة منخفضة', tDone: 'تمّت اليوم',
    conf: 'الثقة', exact: 'مطابقة تامة', suggested: 'الدرجة المقترحة', final: 'النهائية', was: 'كانت', review: 'مراجعة', accept: 'اعتماد', accepted: 'معتمدة',
    low: 'منخفضة', high: 'مرتفعة', med: 'متوسطة',
    open: 'التسليم المفتوح', submitted: 'سُلّم في', words: '148 كلمة', learnerText: 'نص الطالب', flagged: 'حدّد مِشكاة 4 أخطاء نحوية',
    traits: 'درجات المعايير', level: 'مستوى مِشكاة', overall: 'المستوى العام',
    task: 'إنجاز المهمة', org: 'التنظيم', grammar: 'القواعد', vocab: 'المفردات',
    cTask: 'يجيب عن المطلوب كاملًا، مع أسباب ومثال.', cOrg: 'فقرات واضحة وأدوات ربط مستخدمة جيدًا.', cGrammar: 'أخطاء متكررة في الماضي للأفعال الشاذة (goed وswimmed وeat).', cVocab: 'مفردات متنوعة جيدة لمستوى B1 مع بعض التكرار.',
    yourScore: 'درجتك', reset: 'العودة إلى درجات مِشكاة', reason: 'سبب التعديل (يظهر في تقرير الفصل)', reasonPh: 'مثال: الأخطاء النحوية لا تعيق فهم المعنى',
    notify: 'إبلاغ الطالب بأن المعلم عدّل الدرجة', feedback: 'ملاحظات للطالب', fb: 'وصف جميل لمدينة دهب مع أسباب واضحة. الخطوة التالية: راجعي الماضي البسيط للأفعال الشاذة (الماضي من go هو went، ومن swim هو swam، ومن eat هو ate).',
    acceptScore: 'اعتماد 16 / 20', saveOverride: 'حفظ التعديل', next: 'التالي', prev: 'السابق', of: '1 من 14',
  },
};

function Confidence({ v }: { v: number | null }) {
  const t = useT(T);
  const { lang } = usePreview();
  if (v === null) return <span className="text-xs text-muted-foreground">{t.exact}</span>;
  const tone = v >= 85 ? 'success' : v >= 70 ? 'warning' : 'danger';
  return (
    <span className="flex items-center gap-1.5" title={t.conf}>
      <Progress value={v} size="sm" tone={tone} className="w-12" />
      <span className={cn('text-xs font-semibold tabular-nums', tone === 'danger' && 'text-destructive')}>{num(v, lang)}%</span>
    </span>
  );
}

const TRAITS = [
  { k: 'task', score: 5, level: 'B1+', c: 'cTask' },
  { k: 'org', score: 4, level: 'B1', c: 'cOrg' },
  { k: 'grammar', score: 3, level: 'A2+', c: 'cGrammar' },
  { k: 'vocab', score: 4, level: 'B1', c: 'cVocab' },
] as const;
const SCORES = [0, 1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: String(n) }));

export default function Grading() {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <TeacherShell active="grading" title={t.title} subtitle={t.sub} actions={<Button variant="outline" size="sm" className="hidden md:inline-flex"><Filter />{t.filter}</Button>}>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Queue */}
        <section className="flex min-w-0 flex-col gap-3">
          <Tabs>
            <TabList aria-label={t.title} className="w-full overflow-x-auto [&>*]:shrink-0">
              <Tab id="all" className="px-2.5">{t.tAll} <span className="text-muted-foreground">{num(14, lang)}</span></Tab>
              <Tab id="review" className="px-2.5">{t.tReview} <span className="text-muted-foreground">{num(5, lang)}</span></Tab>
              <Tab id="low" className="px-2.5">{t.tLow} <span className="text-muted-foreground">{num(2, lang)}</span></Tab>
              <Tab id="done" className="px-2.5">{t.tDone}</Tab>
            </TabList>
          </Tabs>
          <ul className="flex flex-col gap-2">
            {SUBS.map((s, i) => {
              const l = learner(s.who), Icon = KIND_ICON[s.kind], sel = i === 0;
              return (
                <li key={s.id}>
                  <Card className={cn('p-3.5', sel && 'border-primary ring-1 ring-primary lg:bg-secondary/60')}>
                    <div className="flex items-start gap-3">
                      <Avatar name={l[lang]} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{l[lang]}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{s.when[lang]}</span>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Icon className="size-3.5 shrink-0" /><span className="truncate">{s.task[lang]}</span></p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <SourceBadge source={s.source} />
                          {s.source !== 'teacher' && <Confidence v={s.conf} />}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <p className="me-auto text-sm">
                            <span className="text-xs text-muted-foreground">{s.source === 'teacher' ? t.final : t.suggested} </span>
                            <span className="font-bold tabular-nums">{num(s.score, lang)}/{num(s.max, lang)}</span>
                            {s.was !== undefined && <span className="text-xs text-muted-foreground"> ({t.was} {num(s.was, lang)})</span>}
                          </p>
                          {s.source === 'teacher' ? (
                            <Badge tone="success"><Check />{t.accepted}</Badge>
                          ) : (
                            <>
                              <Button size="sm" variant={sel ? 'secondary' : 'outline'} className="h-7 px-2.5 text-xs">{t.review}</Button>
                              <Button size="sm" variant={s.conf !== null && s.conf < 70 ? 'ghost' : 'default'} className="h-7 px-2.5 text-xs" isDisabled={s.conf !== null && s.conf < 70}><Check />{t.accept}</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Open submission (desktop) */}
        <section aria-label={t.open} className="hidden min-w-0 lg:block">
          <Card className="sticky top-20">
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
              <Avatar name={learner('l07')[lang]} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{learner('l07')[lang]}</p>
                <p className="text-xs text-muted-foreground">{SUBS[0].task[lang]} · {t.submitted} {SUBS[0].when[lang]} · {t.words}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" aria-label={t.prev}><Dir><ChevronRight className="rotate-180" /></Dir></Button>
                <span className="text-xs tabular-nums text-muted-foreground">{t.of}</span>
                <Button variant="ghost" size="sm" aria-label={t.next}><Dir><ChevronRight /></Dir></Button>
              </div>
            </div>

            <div className="grid gap-0 2xl:grid-cols-2">
              <div className="border-b p-5 2xl:border-b-0 2xl:border-e">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.learnerText}</p>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{t.flagged}</span>
                </div>
                <div dir="ltr" lang="en" className="space-y-3 rounded-lg bg-muted/50 p-4 max-w-[72ch] text-start font-[Inter_Variable,ui-sans-serif] text-[13.5px] leading-relaxed">
                  <p>{ESSAY.p1}</p>
                  <p>I would like to go there because I love the sea. When we <Mark>goed</Mark> there two years ago, we <Mark>swimmed</Mark> in the Blue Lagoon and we saw a turtle. In the evening we walked by the sea and <Mark>eat</Mark> fresh fish in a small restaurant.</p>
                  <p>Also, Dahab is quiet and the people are friendly. <Mark>There is not many cars</Mark>, so you can walk or ride a bike everywhere. In my opinion it is <Mark>a ideal</Mark> place for a family holiday.</p>
                  <p>{ESSAY.p4}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge source="mishkat" />
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{t.conf} <Confidence v={92} /></span>
                </div>
                <div className="flex items-end justify-between gap-3 rounded-lg border p-3">
                  <div><p className="text-xs text-muted-foreground">{t.suggested}</p><p className="text-2xl font-bold tabular-nums">{num(16, lang)}<span className="text-base text-muted-foreground"> / {num(20, lang)}</span></p></div>
                  <div className="text-end"><p className="text-xs text-muted-foreground">{t.overall}</p><Badge tone="info" className="mt-1 text-sm">B1</Badge></div>
                </div>

                <div>
                  <div className="mb-2 grid grid-cols-[1fr_auto_4.5rem] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{t.traits}</span><span>{t.level}</span><span className="text-center">{t.yourScore}</span>
                  </div>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {TRAITS.map((tr) => (
                      <li key={tr.k} className="grid grid-cols-[1fr_auto_4.5rem] items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{t[tr.k]}</span>
                            <span className="flex gap-0.5" aria-label={`${tr.score} / 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cn('h-1.5 w-3 rounded-full', n <= tr.score ? (tr.score <= 3 ? 'bg-warning' : 'bg-success') : 'bg-muted')} />)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{t[tr.c]}</p>
                        </div>
                        <Badge tone="outline">{tr.level}</Badge>
                        <Select aria-label={`${t.yourScore}: ${t[tr.k]}`} items={SCORES} defaultSelectedKey={String(tr.score)} className="[&_button]:h-8 [&_button]:min-h-0 [&_button]:px-2" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <Separator />
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              <TextField label={t.feedback} multiline defaultValue={t.fb} className="[&_textarea]:min-h-28" />
              <div className="flex flex-col gap-3">
                <TextField label={t.reason} placeholder={t.reasonPh} />
                <Checkbox defaultSelected>{t.notify}</Checkbox>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
              <Button variant="ghost" size="sm" className="me-auto"><Undo2 />{t.reset}</Button>
              <Button variant="outline">{t.saveOverride}</Button>
              <Button><Check />{t.acceptScore}</Button>
            </div>
          </Card>
        </section>
      </div>
    </TeacherShell>
  );
}

const Mark = ({ children }: { children: ReactNode }) => <mark className="rounded-sm bg-warning-soft px-0.5 text-foreground underline decoration-warning decoration-wavy decoration-1 underline-offset-4">{children}</mark>;
