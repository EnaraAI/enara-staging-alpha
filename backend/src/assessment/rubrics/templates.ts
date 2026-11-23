// Assessment engine rubric templates (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3, §7): one fixed rubric per (domain, open type), with
// Arabic (MSA) and English titles and level descriptors. Criterion codes are the engine's reason-code vocabulary; levels are integer
// points 0..max. rubricFor() gives today's question.rubric shape in the item's language, so the existing checks, the teacher's grading
// view and the learning evidence work unchanged. CEFR-specific descriptors (curriculum=cefr) come later with the CEFR seed titles.
export type Bi = { ar: string; en: string };
interface CriterionTemplate { code: string; title: Bi; levels: Bi[] /* index = points */; byCode?: boolean }
export type Domain = 'language' | 'math' | 'science' | 'humanities' | 'listening';
export type OpenType = 'short_answer' | 'essay' | 'math_steps';
interface RubricTemplate { domain: Domain; type: OpenType; criteria: CriterionTemplate[]; checklist?: boolean }
/** Per item (science and humanities): the content points of the answer key, and whether units are marked. */
// spoken (language): the answer is a speech-to-text transcript, so spelling and punctuation (mechanics) are not marked.
export interface RubricExtras { points?: string[]; units?: boolean; spoken?: boolean }

const L = (ar: string, en: string): Bi => ({ ar, en });

export const TEMPLATES: RubricTemplate[] = [
  {
    domain: 'language', type: 'short_answer', criteria: [
      { code: 'task_completion', title: L('إنجاز المطلوب', 'Task completion'), levels: [L('لا يجيب عن المطلوب', 'Does not answer the task'), L('يجيب عن جزء من المطلوب', 'Answers part of the task'), L('يجيب عن الفكرة الرئيسة للمطلوب', 'Answers the main point of the task')] },
      { code: 'grammar_accuracy', title: L('صحة القواعد', 'Grammar accuracy'), levels: [L('أخطاء تعيق الفهم', 'Errors that block the meaning'), L('المعنى واضح رغم بعض الأخطاء', 'Meaning clear, even with some errors')] },
      { code: 'mechanics', title: L('الإملاء وعلامات الترقيم', 'Spelling and punctuation'), levels: [L('أخطاء تجعل القراءة صعبة', 'Errors make it hard to read'), L('القراءة سهلة رغم بعض الأخطاء', 'Easy to read, even with some errors')] },
    ],
  },
  {
    domain: 'language', type: 'essay', criteria: [
      { code: 'task_completion', title: L('إنجاز المطلوب', 'Task completion'), levels: [L('لا يتناول الموضوع', 'Off the task'), L('يتناول جزءًا من المطلوب', 'Covers part of the task'), L('يجيب عن الفكرة الرئيسة للمطلوب ولو كانت تفصيلة ضعيفة', 'Answers the main point of the task, even if one detail is thin')] },
      { code: 'grammar_accuracy', title: L('صحة القواعد', 'Grammar accuracy'), levels: [L('معظم الجمل فيها أخطاء تجعلها صعبة الفهم', 'Most sentences have errors that make them hard to understand'), L('أخطاء في جمل كثيرة لكن كل جملة مفهومة', 'Errors in many sentences, but each one can be understood'), L('معظم الجمل صحيحة', 'Most sentences are correct')] },
      { code: 'vocabulary_range', title: L('ثراء المفردات', 'Vocabulary range'), levels: [L('مفردات بسيطة جدًا أو مكررة، أو كلمات خاطئة تشوش المعنى', 'Very basic or repeated words, or wrong words blur the meaning'), L('مفردات مناسبة', 'Adequate vocabulary'), L('مفردات متنوعة تناسب الموضوع والمستوى ولو كانت بسيطة', 'Varied words that fit the topic and level, even if simple')] },
      { code: 'organisation', title: L('التنظيم والترابط', 'Organisation'), levels: [L('لا ترتيب واضح للأفكار', 'No clear order'), L('قائمة أفكار تربطها و/ثم فقط', 'A list of ideas joined only by and/then'), L('ترتيب واضح وأدوات ربط متنوعة وكل فكرة مطورة', 'Clear order, varied linking, each idea developed')] },
      { code: 'mechanics', title: L('الإملاء وعلامات الترقيم', 'Spelling and punctuation'), levels: [L('أخطاء في معظم الجمل وبعض الكلمات صعبة التعرف', 'Errors in most sentences; some words hard to recognise'), L('أخطاء في عدة جمل', 'Errors in several sentences'), L('أخطاء في جمل قليلة فقط', 'Errors in only a few sentences')] },
    ],
  },
  {
    domain: 'math', type: 'math_steps', criteria: [
      { code: 'final_answer', byCode: true, title: L('الإجابة النهائية', 'Final answer'), levels: [L('الإجابة النهائية خاطئة', 'Final answer wrong'), L('العدد صحيح والوحدة ناقصة أو خاطئة', 'Right number, unit missing or wrong'), L('الإجابة النهائية صحيحة', 'Final answer right')] },
      { code: 'method_choice', title: L('اختيار الطريقة', 'Method choice'), levels: [L('طريقة غير مناسبة', 'Unsuitable method'), L('طريقة مناسبة جزئيًا', 'Partly suitable method'), L('طريقة مناسبة', 'Suitable method')] },
      { code: 'execution', title: L('تنفيذ الخطوات', 'Execution'), levels: [L('خطوات خاطئة', 'Steps wrong'), L('خطوات صحيحة مع أخطاء حسابية', 'Steps right with calculation slips'), L('خطوات صحيحة', 'Steps right')] },
      { code: 'representation', title: L('العرض والكتابة الرياضية', 'Representation'), levels: [L('عرض غير واضح', 'Unclear working'), L('عرض واضح بالرموز والوحدات', 'Clear working with symbols and units')] },
    ],
  },
  // P3a. Science and humanities: a checklist built per item (one 0-1 criterion per content point of the answer key: point_1..point_n,
  // titled with the point itself), then the fixed criteria below. Units only when the item asks for them.
  ...(['short_answer', 'essay'] as const).map((type): RubricTemplate => ({
    domain: 'science', type, checklist: true, criteria: [
      { code: 'reasoning', title: L('التفسير العلمي', 'Reasoning'), levels: [L('لا تفسير أو تفسير خاطئ', 'No reasoning or wrong reasoning'), L('يفسر جزئيًا لماذا أو كيف', 'Partly explains why or how'), L('يفسر لماذا أو كيف بوضوح وصحة', 'Explains why or how clearly and correctly')] },
      { code: 'terminology', title: L('المصطلحات العلمية', 'Scientific terms'), levels: [L('مصطلحات ناقصة أو مستخدمة خطأ', 'Terms missing or misused'), L('مصطلحات علمية صحيحة', 'Correct scientific terms')] },
      { code: 'units', title: L('الوحدات', 'Units'), levels: [L('وحدات ناقصة أو خاطئة', 'Units missing or wrong'), L('وحدات صحيحة', 'Correct units')] },
    ],
  })),
  ...(['short_answer', 'essay'] as const).map((type): RubricTemplate => ({
    domain: 'humanities', type, checklist: true, criteria: [
      { code: 'accuracy_vs_source', title: L('الدقة مقارنة بالنص', 'Accuracy against the source'), levels: [L('ادعاءات تخالف النص أو ليست فيه', 'Claims contradict the source or are not in it'), L('يوافق النص في الغالب مع خطأ بسيط أو ادعاء غير مدعوم', 'Mostly matches the source, with a minor inaccuracy or an unsupported claim'), L('كل ما ذُكر يوافق النص', 'Everything stated matches the source')] },
      type === 'essay'
        ? { code: 'structure', title: L('البناء', 'Structure'), levels: [L('لا ترتيب واضح', 'No clear order'), L('بعض الترتيب', 'Some order'), L('مقدمة واضحة ونقاط مرتبة وخاتمة', 'Clear opening, points in order, conclusion')] }
        : { code: 'structure', title: L('الوضوح', 'Structure'), levels: [L('غير واضح', 'Unclear'), L('واضح ومباشر', 'Clear and direct')] },
    ],
  })),
  // P3b. Listening: the points heard in the recording, accuracy against the recording (its transcript), clarity. Language mistakes are
  // not marked here (it is listening, not writing).
  {
    domain: 'listening', type: 'short_answer', checklist: true, criteria: [
      { code: 'accuracy_vs_source', title: L('الدقة مقارنة بالتسجيل', 'Accuracy against the recording'), levels: [L('ادعاءات تخالف التسجيل أو ليست فيه', 'Claims contradict the recording or are not in it'), L('يوافق التسجيل في الغالب مع خطأ بسيط أو ادعاء غير مدعوم', 'Mostly matches the recording, with a minor inaccuracy or an unsupported claim'), L('كل ما ذُكر يوافق التسجيل', 'Everything stated matches the recording')] },
      { code: 'structure', title: L('الوضوح', 'Structure'), levels: [L('غير واضح', 'Unclear'), L('واضح ومباشر', 'Clear and direct')] },
    ],
  },
];

const POINT_LEVELS: Bi[] = [L('ناقصة أو خاطئة', 'Missing or wrong'), L('مذكورة بشكل صحيح', 'Stated correctly')];

/** The criteria of an item: the template's, with the checklist points first (science, humanities) and units only when asked. */
function criteriaOf(t: RubricTemplate, extras: RubricExtras = {}): CriterionTemplate[] {
  if (!t.checklist) return extras.spoken ? t.criteria.filter((c) => c.code !== 'mechanics') : t.criteria;
  const points = (extras.points ?? []).map((p, i): CriterionTemplate => ({ code: `point_${i + 1}`, title: L(p, p), levels: POINT_LEVELS }));
  return [...points, ...t.criteria.filter((c) => c.code !== 'units' || extras.units === true)];
}

export const templateFor = (domain: string, type: string): RubricTemplate | undefined => TEMPLATES.find((t) => t.domain === domain && t.type === type);

/** The rubric in today's question.rubric shape, in the item's language (criterion id = code; level id = `p<points>`). */
export function rubricFor(domain: string, type: string, lang: string, extras?: RubricExtras) {
  const t = templateFor(domain, type);
  if (!t) return null;
  const k: keyof Bi = lang.startsWith('ar') ? 'ar' : 'en';
  return {
    criteria: criteriaOf(t, extras).map((c) => ({
      id: c.code,
      title: c.title[k],
      maxPoints: c.levels.length - 1,
      levels: c.levels.map((d, points) => ({ id: `p${points}`, label: String(points), points, description: d[k] })),
      objectiveIds: undefined as string[] | undefined,
    })),
  };
}

/** Criteria the model scores (the final answer of a maths item is scored by code). */
const itemCriteria = (domain: string, type: string, extras?: RubricExtras) => { const t = templateFor(domain, type); return t ? criteriaOf(t, extras) : []; };
export const modelCriteria = (domain: string, type: string, extras?: RubricExtras): string[] => itemCriteria(domain, type, extras).filter((c) => !c.byCode).map((c) => c.code);
export const totalPoints = (domain: string, type: string, extras?: RubricExtras): number => itemCriteria(domain, type, extras).reduce((n, c) => n + c.levels.length - 1, 0);
/** Science and humanities rubrics are built per item from its content points. */
export const isChecklist = (domain: string, type: string): boolean => !!templateFor(domain, type)?.checklist;
