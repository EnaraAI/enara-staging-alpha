// Assessment engine rubric templates (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3, §7): one fixed rubric per (domain, open type), with
// Arabic (MSA) and English titles and level descriptors. Criterion codes are the engine's reason-code vocabulary; levels are integer
// points 0..max. rubricFor() gives today's question.rubric shape in the item's language, so the existing checks, the teacher's grading
// view and the learning evidence work unchanged. CEFR-specific descriptors (curriculum=cefr) come later with the CEFR seed titles.
export type Bi = { ar: string; en: string };
interface CriterionTemplate { code: string; title: Bi; levels: Bi[] /* index = points */; byCode?: boolean }
interface RubricTemplate { domain: 'language' | 'math'; type: 'short_answer' | 'essay' | 'math_steps'; criteria: CriterionTemplate[] }

const L = (ar: string, en: string): Bi => ({ ar, en });

export const TEMPLATES: RubricTemplate[] = [
  {
    domain: 'language', type: 'short_answer', criteria: [
      { code: 'task_completion', title: L('إنجاز المطلوب', 'Task completion'), levels: [L('لا يجيب عن المطلوب', 'Does not answer the task'), L('يجيب عن جزء من المطلوب', 'Answers part of the task'), L('يجيب عن المطلوب كاملًا', 'Answers the whole task')] },
      { code: 'grammar_accuracy', title: L('صحة القواعد', 'Grammar accuracy'), levels: [L('أخطاء تعيق الفهم', 'Errors that block understanding'), L('قواعد صحيحة في الغالب', 'Mostly accurate grammar')] },
      { code: 'mechanics', title: L('الإملاء وعلامات الترقيم', 'Spelling and punctuation'), levels: [L('أخطاء كثيرة', 'Many errors'), L('أخطاء قليلة أو لا أخطاء', 'Few or no errors')] },
    ],
  },
  {
    domain: 'language', type: 'essay', criteria: [
      { code: 'task_completion', title: L('إنجاز المطلوب', 'Task completion'), levels: [L('لا يتناول الموضوع', 'Off the task'), L('يتناول بعض المطلوب', 'Covers part of the task'), L('يتناول المطلوب كاملًا وبوضوح', 'Covers the whole task clearly')] },
      { code: 'grammar_accuracy', title: L('صحة القواعد', 'Grammar accuracy'), levels: [L('أخطاء كثيرة تعيق الفهم', 'Frequent errors that block understanding'), L('بعض الأخطاء لا تعيق الفهم', 'Some errors that do not block understanding'), L('قواعد صحيحة في الغالب', 'Mostly accurate grammar')] },
      { code: 'vocabulary_range', title: L('ثراء المفردات', 'Vocabulary range'), levels: [L('مفردات محدودة جدًا أو مكررة', 'Very limited or repeated words'), L('مفردات مناسبة', 'Adequate vocabulary'), L('مفردات متنوعة ودقيقة', 'Varied and precise vocabulary')] },
      { code: 'organisation', title: L('التنظيم والترابط', 'Organisation'), levels: [L('أفكار غير مرتبة', 'Ideas not organised'), L('ترتيب مقبول وبعض أدوات الربط', 'Some order and linking words'), L('تنظيم واضح وأدوات ربط مناسبة', 'Clear order and good linking')] },
      { code: 'mechanics', title: L('الإملاء وعلامات الترقيم', 'Spelling and punctuation'), levels: [L('أخطاء كثيرة', 'Many errors'), L('بعض الأخطاء', 'Some errors'), L('أخطاء قليلة أو لا أخطاء', 'Few or no errors')] },
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
];

export const templateFor = (domain: string, type: string): RubricTemplate | undefined => TEMPLATES.find((t) => t.domain === domain && t.type === type);

/** The rubric in today's question.rubric shape, in the item's language (criterion id = code; level id = `p<points>`). */
export function rubricFor(domain: string, type: string, lang: string) {
  const t = templateFor(domain, type);
  if (!t) return null;
  const k: keyof Bi = lang.startsWith('ar') ? 'ar' : 'en';
  return {
    criteria: t.criteria.map((c) => ({
      id: c.code,
      title: c.title[k],
      maxPoints: c.levels.length - 1,
      levels: c.levels.map((d, points) => ({ id: `p${points}`, label: String(points), points, description: d[k] })),
      objectiveIds: undefined as string[] | undefined,
    })),
  };
}

/** Criteria the model scores (the final answer of a maths item is scored by code). */
export const modelCriteria = (domain: string, type: string): string[] => (templateFor(domain, type)?.criteria ?? []).filter((c) => !c.byCode).map((c) => c.code);
export const totalPoints = (domain: string, type: string): number => (templateFor(domain, type)?.criteria ?? []).reduce((n, c) => n + c.levels.length - 1, 0);
