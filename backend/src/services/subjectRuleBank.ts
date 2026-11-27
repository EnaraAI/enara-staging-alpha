// liveRolePlay (live tutor item 4, owner correction 27 Nov 2026: the live tutor teaches every subject): the rule or method lines the role-play
// debrief gives for subjects other than English (English uses the checked rule bank, ruleBank.ts). One entry per outcome: the rule or method in
// one plain line, a right example and a wrong example that differ only in the usual mistake, in English and in formal Arabic (fusha).
// Arabic-language entries (subject 'arabic') are taught in Arabic: their English text is a gloss for teachers. Checked by checkSubjectEntry.
import type { Bi } from './roleplayScenes';

export type SceneSubject = 'english' | 'maths' | 'science' | 'arabic' | 'social';
export const SUBJECTS: SceneSubject[] = ['english', 'maths', 'science', 'arabic', 'social'];
export interface SubjectRuleEntry {
  id: string;
  subject: Exclude<SceneSubject, 'english'>;
  rule: Bi;
  right: Bi;
  wrong: Bi;
}

export const SUBJECT_RULE_BANK: SubjectRuleEntry[] = [
  // ------------------------------------------------------------------ maths
  { id: 'MA-money-change', subject: 'maths',
    rule: { en: 'Change is the money you give minus the price.', ar: 'الباقي هو المبلغ الذي تدفعه ناقصًا الثمن.' },
    right: { en: 'I pay 50 pounds for a 35-pound book: 50 − 35 = 15 pounds change.', ar: 'أدفع خمسين جنيهًا لكتاب ثمنه خمسة وثلاثون جنيهًا: ٥٠ − ٣٥ = ١٥ جنيهًا باقيًا.' },
    wrong: { en: 'I pay 50 pounds for a 35-pound book: 50 + 35 = 85 pounds change.', ar: 'أدفع خمسين جنيهًا لكتاب ثمنه خمسة وثلاثون جنيهًا: ٥٠ + ٣٥ = ٨٥ جنيهًا باقيًا.' } },
  { id: 'MA-total-price', subject: 'maths',
    rule: { en: 'For the total, multiply the price of one by how many you buy.', ar: 'لحساب المجموع نضرب ثمن الواحد في عدد ما نشتريه.' },
    right: { en: 'Three kilos at 12 pounds a kilo: 3 × 12 = 36 pounds.', ar: 'ثلاثة كيلوجرامات بسعر ١٢ جنيهًا للكيلو: ٣ × ١٢ = ٣٦ جنيهًا.' },
    wrong: { en: 'Three kilos at 12 pounds a kilo: 3 + 12 = 15 pounds.', ar: 'ثلاثة كيلوجرامات بسعر ١٢ جنيهًا للكيلو: ٣ + ١٢ = ١٥ جنيهًا.' } },
  { id: 'MA-scaling-quantities', subject: 'maths',
    rule: { en: 'To make more of a recipe, multiply every amount by the same number.', ar: 'لمضاعفة الوصفة نضرب كل كمية في العدد نفسه.' },
    right: { en: 'Double the recipe: 2 eggs become 4 eggs and 150 g of flour becomes 300 g.', ar: 'نضاعف الوصفة: تصبح البيضتان أربع بيضات، ويصبح الدقيق ٣٠٠ جرام بدلًا من ١٥٠.' },
    wrong: { en: 'Double the recipe: 2 eggs become 4 eggs and 150 g of flour becomes 152 g.', ar: 'نضاعف الوصفة: تصبح البيضتان أربع بيضات، ويصبح الدقيق ١٥٢ جرامًا بدلًا من ١٥٠.' } },
  { id: 'MA-time-duration', subject: 'maths',
    rule: { en: 'Count the minutes from the start time to the end time; 60 minutes make one hour.', ar: 'نعد الدقائق من وقت البداية إلى وقت النهاية، والساعة ستون دقيقة.' },
    right: { en: 'From 9:40 to 10:15 is 35 minutes.', ar: 'من التاسعة وأربعين دقيقة إلى العاشرة وخمس عشرة دقيقة: خمس وثلاثون دقيقة.' },
    wrong: { en: 'From 9:40 to 10:15 is 75 minutes.', ar: 'من التاسعة وأربعين دقيقة إلى العاشرة وخمس عشرة دقيقة: خمس وسبعون دقيقة.' } },
  { id: 'MA-add-small', subject: 'maths',
    rule: { en: 'When we put things together, we add: count them all.', ar: 'عندما نجمع الأشياء معًا نعدها كلها.' },
    right: { en: 'Three apples and two apples are five apples.', ar: 'ثلاث تفاحات وتفاحتان تساوي خمس تفاحات.' },
    wrong: { en: 'Three apples and two apples are six apples.', ar: 'ثلاث تفاحات وتفاحتان تساوي ست تفاحات.' } },
  { id: 'MA-take-away-small', subject: 'maths',
    rule: { en: 'When we take some away, we count back.', ar: 'عندما نأخذ بعض الأشياء نعد إلى الوراء.' },
    right: { en: 'Six bananas, we eat two: four bananas are left.', ar: 'ست موزات، أكلنا اثنتين: بقيت أربع موزات.' },
    wrong: { en: 'Six bananas, we eat two: eight bananas are left.', ar: 'ست موزات، أكلنا اثنتين: بقيت ثماني موزات.' } },
  // ------------------------------------------------------------------ science
  { id: 'SC-states-of-matter', subject: 'science',
    rule: { en: 'Heating turns a solid into a liquid (melting) and a liquid into a gas (boiling).', ar: 'التسخين يحول الصلب إلى سائل (الانصهار)، ويحول السائل إلى غاز (الغليان).' },
    right: { en: 'Ice melts into water when it gets warm.', ar: 'ينصهر الجليد فيصير ماءً عندما يدفأ.' },
    wrong: { en: 'Water melts into ice when it gets warm.', ar: 'ينصهر الماء فيصير جليدًا عندما يدفأ.' } },
  { id: 'SC-germs-hygiene', subject: 'science',
    rule: { en: 'Germs spread from dirty hands and cuts; washing with soap and clean water removes them.', ar: 'تنتقل الجراثيم من الأيدي والجروح غير النظيفة، والغسل بالصابون والماء النظيف يزيلها.' },
    right: { en: 'Wash a small cut with clean water, then cover it.', ar: 'اغسل الجرح الصغير بماء نظيف ثم غطه.' },
    wrong: { en: 'Cover a small cut first, then wash it the next day.', ar: 'غط الجرح الصغير أولًا ثم اغسله في اليوم التالي.' } },
  { id: 'SC-body-health', subject: 'science',
    rule: { en: 'The body needs water, healthy food, rest and sleep to stay well.', ar: 'يحتاج الجسم إلى الماء والطعام الصحي والراحة والنوم ليبقى سليمًا.' },
    right: { en: 'With a fever, drink water and rest.', ar: 'عند الحمى نشرب الماء ونرتاح.' },
    wrong: { en: 'With a fever, drink no water and run a lot.', ar: 'عند الحمى لا نشرب الماء ونجري كثيرًا.' } },
  { id: 'SC-plants-needs', subject: 'science',
    rule: { en: 'Plants need water, light and air to grow.', ar: 'تحتاج النباتات إلى الماء والضوء والهواء لتنمو.' },
    right: { en: 'A plant by the window grows well.', ar: 'ينمو النبات القريب من النافذة جيدًا.' },
    wrong: { en: 'A plant in a dark cupboard grows well.', ar: 'ينمو النبات في خزانة مظلمة جيدًا.' } },
  // ------------------------------------------------------------------ Arabic language (taught in Arabic; the English is a gloss)
  { id: 'AR-adjective-agreement', subject: 'arabic',
    rule: { en: 'An adjective agrees with its noun: masculine or feminine.', ar: 'تتبع الصفة الموصوف في التذكير والتأنيث.' },
    right: { en: 'اشتريت تفاحةً حمراءَ. (I bought a red apple.)', ar: 'اشتريت تفاحةً حمراءَ.' },
    wrong: { en: 'اشتريت تفاحةً أحمرَ. (agreement error)', ar: 'اشتريت تفاحةً أحمرَ.' } },
  { id: 'AR-question-words', subject: 'arabic',
    rule: { en: 'Ask about a price with «kam» (how much) and about a place with «ayna» (where).', ar: 'نسأل عن الثمن بـ «كم» وعن المكان بـ «أين».' },
    right: { en: 'كم ثمنُ الكتاب؟ (How much is the book?)', ar: 'كم ثمنُ الكتاب؟' },
    wrong: { en: 'أين ثمنُ الكتاب؟ (wrong question word)', ar: 'أين ثمنُ الكتاب؟' } },
  { id: 'AR-verb-subject-agreement', subject: 'arabic',
    rule: { en: 'With a feminine subject the present verb starts with ta-: hiya tadhhabu.', ar: 'مع الفاعل المؤنث يبدأ الفعل المضارع بالتاء: هي تذهبُ.' },
    right: { en: 'هي تذهبُ إلى المدرسة. (She goes to school.)', ar: 'هي تذهبُ إلى المدرسة.' },
    wrong: { en: 'هي يذهبُ إلى المدرسة. (agreement error)', ar: 'هي يذهبُ إلى المدرسة.' } },
  // ------------------------------------------------------------------ social studies
  { id: 'SS-map-directions', subject: 'social',
    rule: { en: 'On most maps north is at the top, so east is to the right and west is to the left.', ar: 'في معظم الخرائط يكون الشمال في الأعلى، فيكون الشرق إلى اليمين والغرب إلى اليسار.' },
    right: { en: 'The gate is east of the café, so it is to the right of the café on the map.', ar: 'البوابة شرق المقهى، فهي على يمين المقهى في الخريطة.' },
    wrong: { en: 'The gate is east of the café, so it is to the left of the café on the map.', ar: 'البوابة شرق المقهى، فهي على يسار المقهى في الخريطة.' } },
  { id: 'SS-timeline', subject: 'social',
    rule: { en: 'On a timeline older events come first; years BC count down towards year 1.', ar: 'في الخط الزمني تأتي الأحداث الأقدم أولًا، وتتناقص السنوات قبل الميلاد كلما اقتربنا من السنة الأولى.' },
    right: { en: 'The Great Pyramid (about 2560 BC) is older than the Library of Alexandria (about 285 BC).', ar: 'الهرم الأكبر (نحو ٢٥٦٠ ق.م) أقدم من مكتبة الإسكندرية (نحو ٢٨٥ ق.م).' },
    wrong: { en: 'The Great Pyramid (about 2560 BC) is newer than the Library of Alexandria (about 285 BC).', ar: 'الهرم الأكبر (نحو ٢٥٦٠ ق.م) أحدث من مكتبة الإسكندرية (نحو ٢٨٥ ق.م).' } },
  { id: 'SS-places-in-town', subject: 'social',
    rule: { en: 'A map shows where places are: next to, behind, in front of.', ar: 'تبين الخريطة أماكن الأشياء: بجانب، وخلف، وأمام.' },
    right: { en: 'The park is next to the school.', ar: 'الحديقة بجانب المدرسة.' },
    wrong: { en: 'The park is in the school.', ar: 'الحديقة داخل المدرسة.' } },
];
export const SUBJECT_RULE_BY_ID = new Map(SUBJECT_RULE_BANK.map((e) => [e.id, e]));
export const subjectRuleEntry = (id?: string | null): SubjectRuleEntry | undefined => (id ? SUBJECT_RULE_BY_ID.get(id) : undefined);

/** Static checks of one entry: both languages, a rule of 25 words or fewer, a right and a wrong example that differ. */
export function checkSubjectEntry(e: SubjectRuleEntry): string[] {
  const out: string[] = [];
  for (const [k, b] of [['rule', e.rule], ['right', e.right], ['wrong', e.wrong]] as const) {
    if (!b.en?.trim() || !b.ar?.trim()) out.push(`${k}: English or Arabic missing`);
    if (!/[؀-ۿ]/.test(b.ar)) out.push(`${k}: the Arabic text has no Arabic`);
  }
  if (e.rule.en.split(/\s+/).length > 25) out.push('rule longer than 25 words');
  if (e.right.en === e.wrong.en || e.right.ar === e.wrong.ar) out.push('right and wrong are identical');
  return out;
}
