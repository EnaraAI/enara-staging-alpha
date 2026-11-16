// ALL mock data for the Parents Portal lives in this folder. Every value that
// leaves here is wrapped by the service in a section marked `mock: true`, and
// the frontends show "Sample data" next to it. Nothing here reads learner data.
//
// Mocked until a real source exists:
//   level (only when the learner has no outcome-mastery evidence), skills,
//   8-week score trend, can-dos (only without evidence), strengths / focus
//   areas (only when Student.adaptiveProfile is empty), "this week they
//   learned" bullets, try-this-at-home, per-session went well / was hard /
//   words / focus, safety alerts (no detector yet), upcoming items, plan and
//   billing, co-guardians beyond the real links.
import type { Cefr } from '../levels';
import type { Tier } from '../policy';
import type { SafetyCategory } from '../../models/SafetyAlert';

function seed(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}
const pick = <T>(xs: readonly T[], n: number): T => xs[n % xs.length];

export function mockLevel(studentId: string, tier: Tier): { cefr: Cefr; subLevelPct: number } {
  const n = seed(studentId);
  const cefr: Cefr = tier === 'kid' ? pick(['A1', 'A1', 'Pre-A1', 'A2'] as const, n) : pick(['B1', 'A2', 'B2'] as const, n);
  return { cefr, subLevelPct: 20 + (n % 60) };
}

export const SKILLS = ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar'] as const;
export type Skill = (typeof SKILLS)[number];
export function mockSkills(studentId: string): { skill: Skill; pct: number; trend: 'up' | 'flat' | 'down' }[] {
  const n = seed(studentId);
  return SKILLS.map((skill, i) => ({ skill, pct: 40 + ((n >> i) % 35), trend: (n >> (i + 3)) % 3 === 0 ? 'flat' : 'up' }));
}

export function mockTrend(studentId: string): { weekStart: string; score: number; assessment?: boolean }[] {
  const n = seed(studentId);
  const out: { weekStart: string; score: number; assessment?: boolean }[] = [];
  let score = 30 + (n % 10);
  const now = Date.now();
  for (let i = 7; i >= 0; i--) {
    score += 2 + ((n >> i) % 4);
    out.push({ weekStart: new Date(now - i * 7 * 86_400_000).toISOString().slice(0, 10), score: Math.min(95, score), ...(i === 2 ? { assessment: true } : {}) });
  }
  return out;
}

const CANDOS: Record<string, { en: string; ar: string }[]> = {
  'Pre-A1': [
    { en: 'Knows greetings', ar: 'يعرف التحيات' }, { en: 'Names colours', ar: 'يسمّي الألوان' }, { en: 'Counts to 20', ar: 'يعدّ لحد ٢٠' },
  ],
  A1: [
    { en: 'Greets people and says goodbye', ar: 'يسلّم على الناس ويودّعهم' },
    { en: 'Introduces self and family', ar: 'يعرّف بنفسه وعيلته' },
    { en: 'Names everyday objects at home', ar: 'يسمّي حاجات البيت' },
    { en: 'Asks and answers simple questions', ar: 'يسأل ويجاوب أسئلة بسيطة' },
    { en: 'Talks about what they like', ar: 'يتكلم عن اللي بيحبه' },
    { en: 'Writes 3 short sentences about themselves', ar: 'يكتب ٣ جمل قصيرة عن نفسه' },
  ],
  A2: [
    { en: 'Talks about daily routine', ar: 'يتكلم عن يومه' },
    { en: 'Describes last weekend', ar: 'يحكي عن الويك إند اللي فات' },
    { en: 'Writes a short email', ar: 'يكتب إيميل قصير' },
    { en: 'Compares two things', ar: 'يقارن بين حاجتين' },
  ],
  B1: [
    { en: 'Tells a story in order', ar: 'يحكي قصة بالترتيب' },
    { en: 'Explains an opinion simply', ar: 'يشرح رأيه ببساطة' },
    { en: 'Links ideas with however and although', ar: 'يربط الأفكار بـ however و although' },
    { en: 'Writes a short essay', ar: 'يكتب موضوع قصير' },
  ],
};
export function mockCanDos(cefr: string, studentId: string) {
  const list = CANDOS[cefr] ?? CANDOS.B1;
  const done = Math.max(1, Math.floor(list.length / 2));
  return list.map((t, i) => ({ text: t, state: i < done ? 'achieved' : i === done || i === done + 1 ? 'in_progress' : 'not_started' as 'achieved' | 'in_progress' | 'not_started', id: `${cefr}-${i}-${seed(studentId) % 7}` }));
}

export function mockStrengths(tier: Tier) {
  return tier === 'kid'
    ? { strengths: [{ en: 'Remembers new words quickly', ar: 'بيفتكر الكلمات الجديدة بسرعة' }, { en: 'Understands short spoken stories', ar: 'بيفهم القصص القصيرة المسموعة' }], focusAreas: [{ en: 'Writing full sentences', ar: 'كتابة جمل كاملة' }, { en: 'Using he / she correctly', ar: 'استخدام he و she صح' }] }
    : { strengths: [{ en: 'Gives clear opinions', ar: 'بيقول رأيه بوضوح' }, { en: 'Reads longer texts calmly', ar: 'بيقرا نصوص أطول بهدوء' }], focusAreas: [{ en: 'Linking ideas in writing', ar: 'ربط الأفكار في الكتابة' }, { en: 'Past tense in speech', ar: 'الماضي في الكلام' }] };
}

export function mockLearned(tier: Tier) {
  return tier === 'kid'
    ? [
        { en: 'Talking about family: who they are and what they like', ar: 'الكلام عن العيلة: مين هما وبيحبوا إيه' },
        { en: '18 new words, including kitchen, hungry and favourite', ar: '١٨ كلمة جديدة، منها kitchen و hungry و favourite' },
        { en: 'Longest answer yet: 4 sentences without switching to Arabic', ar: 'أطول إجابة لحد دلوقتي: ٤ جمل من غير ما يرجع للعربي' },
      ]
    : [
        { en: 'Giving opinions in a debate about school uniforms', ar: 'إبداء الرأي في نقاش عن الزي المدرسي' },
        { en: 'Linking ideas with however and although', ar: 'ربط الأفكار بـ however و although' },
      ];
}

export function mockTryAtHome(tier: Tier, name: string) {
  return tier === 'kid'
    ? { en: `At dinner, ask ${name} to introduce the family in English. They practised exactly this this week.`, ar: `على العشا، اطلب من ${name} يعرّف العيلة بالإنجليزي. اتدرّب على ده بالظبط الأسبوع ده.` }
    : { en: `Ask ${name} their opinion on something in English at dinner. Encourage, don't check: teens practise more when it doesn't feel like homework.`, ar: `اسأل ${name} عن رأيه في حاجة بالإنجليزي على العشا. شجّع من غير ما تصحّح: الكبار بيتدرّبوا أكتر لما الموضوع مش شبه الواجب.` };
}

const INSIGHTS = [
  { wentWell: { en: 'Named every family member without help', ar: 'سمّى كل أفراد العيلة من غير مساعدة' }, wasHard: { en: 'Saying "she" for mum, not "he"', ar: 'يقول she لماما مش he' }, words: ['grandma', 'cousin', 'kitchen', 'hungry', 'favourite'] },
  { wentWell: { en: 'Fast, accurate word matching', ar: 'توصيل كلمات سريع ودقيق' }, wasHard: { en: 'Spelling "kitchen"', ar: 'تهجئة kitchen' }, words: ['sofa', 'fridge', 'window'] },
  { wentWell: { en: 'Retold the story in order', ar: 'حكى القصة بالترتيب' }, wasHard: { en: 'Past tense verbs', ar: 'أفعال الماضي' }, words: ['lost', 'found', 'looked'] },
];
export function mockSessionInsight(sessionId: string) {
  const n = seed(sessionId);
  return { ...pick(INSIGHTS, n), focus: pick(['high', 'high', 'medium', 'low'] as const, n >> 2) };
}

export function mockSafetyAlerts(studentId: string, now: Date): { id: string; category: SafetyCategory; subtype?: string; actionTaken: { en: string; ar: string }; excerpt: string; createdAt: string; detector: 'pattern' | 'model_refusal' | 'classifier'; beta: boolean; reviewRequired: boolean; reviewedAt?: string }[] {
  const old = new Date(now.getTime() - 9 * 86_400_000).toISOString();
  return [
    { id: `mock-alert-${seed(studentId) % 1000}-1`, category: 'personal_details', subtype: 'phone', actionTaken: { en: 'ENARA reminded them not to share phone numbers and did not keep the number.', ar: 'إنارة فكّرته ميشاركش أرقام تليفون ومحفظتش الرقم.' }, excerpt: 'my number is 01•• ••• ••••', createdAt: old, detector: 'pattern', beta: false, reviewRequired: false },
    // Beta category awaiting human review: must never reach a parent.
    { id: `mock-alert-${seed(studentId) % 1000}-2`, category: 'distress', actionTaken: { en: 'Flagged for review.', ar: 'متعلّم للمراجعة.' }, excerpt: '(pending review)', createdAt: old, detector: 'classifier', beta: true, reviewRequired: true },
  ];
}

export function mockUpcoming(tier: Tier) {
  return [
    ...(tier === 'kid' ? [{ kind: 'assessment', text: { en: 'Checkpoint quiz on Thursday', ar: 'اختبار قصير يوم الخميس' }, meta: 'Unit 4' }] : []),
    { kind: 'plan_renewal', text: { en: 'Plan renews on 1 December', ar: 'الباقة بتتجدد يوم ١ ديسمبر' } },
  ];
}

export function mockPlan(learnerCount: number) {
  return { name: { en: 'Family plan', ar: 'باقة العيلة' }, price: '[PRICE] / month', learners: learnerCount, renewsOn: '2026-12-01', payment: { en: 'Card, Fawry or mobile wallet', ar: 'كارت أو فوري أو محفظة موبايل' } };
}
