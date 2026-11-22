// Parents: "How you can help this week", per subject (owner go, 22 Nov 2026; docs/parents/ALL_SUBJECTS_PLAN.md).
// 1. Code picks what matters most from the child's real data in that subject (pickFocus): open points to practise (released only), the
//    weakest outcome, a low RELEASED result, no practice this week, something due soon, the next lesson. An unreleased result never
//    reaches this file (SubjectDetail.latestResult and .points hold only what the parent may see).
// 2. The model writes it in plain words (both languages), and checkWritten() refuses anything off: wrong language, too long, links,
//    Markdown, numbers that are not in the data, or answer-giving words. A refused or missing item gets the written-in-advance text.
// 3. Saved per child, subject and week; written again only when the data it was built from changes.
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { ParentRecommendation } from '../models/ParentRecommendation';
import { deepseekReady, llmClient, llmModel } from '../services/llmProvider';
import type { Tier } from './policy';
import type { Bi, Family, SubjectDetail } from './subjects';

export type FocusKind = 'error' | 'outcome' | 'result' | 'routine' | 'due' | 'next';
export interface Focus { kind: FocusKind; topic?: string; detail?: string; score?: number; dueAt?: string }
export interface Rec { kind: FocusKind; do: Bi; why: Bi; say: Bi; ai: boolean }

const DAY = 86_400_000;

/** What matters most this week in one subject, most important first (at most 3). Uses only what the parent may see. */
export function pickFocus(s: SubjectDetail, now = new Date()): Focus[] {
  const out: Focus[] = [];
  for (const p of s.points.slice(0, 2)) out.push({ kind: 'error', topic: p.objective || p.error, detail: p.error });
  if (s.weakest && !out.some((f) => f.topic === s.weakest!.title)) out.push({ kind: 'outcome', topic: s.weakest.title });
  if (s.latestResult && s.latestResult.score < 60) out.push({ kind: 'result', topic: s.latestResult.title, score: s.latestResult.score });
  if (s.minutesThisWeek === 0 && s.activeBefore) out.push({ kind: 'routine' });
  if (s.next.due && new Date(s.next.due.dueAt).getTime() - now.getTime() <= 7 * DAY) out.push({ kind: 'due', topic: s.next.due.title, dueAt: s.next.due.dueAt });
  if (out.length < 3 && s.next.lesson) out.push({ kind: 'next', topic: s.next.lesson });
  return out.slice(0, 3);
}

// ----------------------------------------------------------------- written in advance (always available)

const ACTIVITY: Record<Family, { kid: Bi; teen: Bi }> = {
  language: {
    kid: { en: 'make up 3 short sentences about your day with it and say them out loud', ar: 'كوّنا ٣ جمل قصيرة عن يومكم بها وقولوها بصوت عالٍ' },
    teen: { en: 'ask them to use it in 3 sentences about something they care about', ar: 'اطلب منه أن يستخدمها في ٣ جمل عن شيء يهمه' },
  },
  maths: {
    kid: { en: 'solve 3 everyday examples together: shopping, cooking or telling the time', ar: 'حُلّا ٣ أمثلة من الحياة معًا: التسوق أو الطبخ أو قراءة الساعة' },
    teen: { en: 'ask them to show you one worked example and explain each step', ar: 'اطلب منه أن يشرح لك مثالًا محلولًا خطوة بخطوة' },
  },
  science: {
    kid: { en: 'find one example of it around the house and talk about what is happening', ar: 'ابحثا عن مثال له في البيت وتحدّثا عمّا يحدث' },
    teen: { en: 'ask them to explain where it shows up in everyday life', ar: 'اطلب منه أن يشرح أين نراه في الحياة اليومية' },
  },
  general: {
    kid: { en: 'ask them to teach you one thing about it with a small drawing', ar: 'اطلب منه أن يعلّمك شيئًا واحدًا عنه برسمة صغيرة' },
    teen: { en: 'ask them to sum it up for you in 2 minutes', ar: 'اطلب منه أن يلخصه لك في دقيقتين' },
  },
};

const q = (s: string) => `«${s}»`;
function dueWords(iso: string, lang: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The written-in-advance suggestion for one focus. Never empty, never made up: every fact in it comes from the focus. */
export function fallbackRec(f: Focus, ctx: { name: string; subject: Bi; family: Family; tier: Tier }): Rec {
  const kid = ctx.tier === 'kid';
  const act = ACTIVITY[ctx.family][kid ? 'kid' : 'teen'];
  const n = ctx.name; const sub = ctx.subject; const t = f.topic ?? '';
  const say = (kidEn: string, kidAr: string, teenEn: string, teenAr: string): Bi => (kid ? { en: kidEn, ar: kidAr } : { en: teenEn, ar: teenAr });
  switch (f.kind) {
    case 'error':
      return {
        kind: f.kind, ai: false,
        do: { en: `Spend 5 minutes on ${q(t)} together: ${act.en}.`, ar: `خصّصا ٥ دقائق لـ ${q(t)}: ${act.ar}.` },
        why: { en: `${n} keeps finding ${q(f.detail ?? t)} hard in ${sub.en}.`, ar: `ما زال ${q(f.detail ?? t)} صعبًا على ${n} في ${sub.ar}.` },
        say: say('Show me how you do this one. Talk me through it.', 'وريني إزاي بتحلها، واشرحلي خطوة خطوة.', `What is the trick to ${q(t)}? I never really got it.`, `إيه السر في ${q(t)}؟ أنا عمري ما فهمتها كويس.`),
      };
    case 'outcome':
      return {
        kind: f.kind, ai: false,
        do: { en: `Pick ${q(t)} for a short practice: ${act.en}.`, ar: `اختارا ${q(t)} لتدريب قصير: ${act.ar}.` },
        why: { en: `It is the part of ${sub.en} ${n} is least sure of so far.`, ar: `هذا هو الجزء الأقل ثباتًا عند ${n} في ${sub.ar} حتى الآن.` },
        say: say('Can you teach me this? I want to learn it too.', 'ممكن تعلّمني دي؟ أنا كمان عايز أتعلمها.', `Which bit of ${q(t)} feels hardest right now?`, `أنهي جزء في ${q(t)} حاسس إنه الأصعب دلوقتي؟`),
      };
    case 'result':
      return {
        kind: f.kind, ai: false,
        do: { en: 'Look at the result together, find the question that felt hardest, and try one like it.', ar: 'راجعا النتيجة معًا، وحدّدا أصعب سؤال، وجرّبا سؤالًا مثله.' },
        why: { en: `The latest released ${sub.en} result, ${q(t)}, was ${f.score}%.`, ar: `آخر نتيجة معلنة في ${sub.ar}، ${q(t)}، كانت ${f.score}٪.` },
        say: say('You worked hard on that. Which question was the trickiest?', 'إنت تعبت فيه. أنهي سؤال كان أصعب واحد؟', 'What would you do differently next time?', 'لو هتعيده، هتعمل إيه بشكل مختلف؟'),
      };
    case 'routine':
      return {
        kind: f.kind, ai: false,
        do: { en: `Agree on one 10-minute ${sub.en} session with the tutor on a day that suits you both.`, ar: `اتفقا على جلسة واحدة مدتها ١٠ دقائق في ${sub.ar} مع المعلم الذكي في يوم يناسبكما.` },
        why: { en: `${n} has not practised ${sub.en} with the tutor yet this week.`, ar: `لم يتدرّب ${n} على ${sub.ar} مع المعلم الذكي هذا الأسبوع بعد.` },
        say: say(`Shall we do 10 minutes of ${sub.en} after dinner?`, `نعمل ١٠ دقايق ${sub.ar} بعد العشا؟`, `When this week works for 10 minutes of ${sub.en}?`, `إمتى الأسبوع ده يناسبك ١٠ دقايق ${sub.ar}؟`),
      };
    case 'due':
      return {
        kind: f.kind, ai: false,
        do: { en: 'Ask when they plan to do it, and offer a quiet 15 minutes.', ar: 'اسأله متى ينوي إنجازه، واعرض عليه ١٥ دقيقة هادئة.' },
        why: { en: `${q(t)} is due ${dueWords(f.dueAt!, 'en')}.`, ar: `موعد تسليم ${q(t)} هو ${dueWords(f.dueAt!, 'ar')}.` },
        say: say('Do you want me to sit with you while you do it?', 'تحب أقعد جنبك وإنت بتعمله؟', 'Is there anything you need for it?', 'محتاج أي حاجة عشانه؟'),
      };
    default:
      return {
        kind: 'next', ai: false,
        do: { en: 'Ask what they think it will be about, and one thing they already know.', ar: 'اسأله عمّا يتوقع أن يكون موضوعه، وعن شيء واحد يعرفه عنه.' },
        why: { en: `Next in ${sub.en}: ${q(t)}.`, ar: `التالي في ${sub.ar}: ${q(t)}.` },
        say: say(`What do you think ${q(t)} will be about?`, `تفتكر ${q(t)} هيكون عن إيه؟`, `Anything you already know about ${q(t)}?`, `تعرف حاجة عن ${q(t)} من قبل؟`),
      };
  }
}

// ----------------------------------------------------------------- model writing and its checks

const AR = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{4,}/g;
const ANSWER_WORDS = /\b(the answer is|answer key|correct answer|copy the answer)\b|الإجابة الصحيحة|الإجابة هي/i;
const MAX = { do: 220, why: 180, say: 140 };

/** Whether one written suggestion may be shown: right language per side, short, plain text, no new numbers, no answers. */
export function checkWritten(w: { do?: Bi; why?: Bi; say?: Bi } | undefined, facts: string): string | null {
  if (!w) return 'missing';
  const allowedNums = new Set<string>([...(facts.match(/\d+/g) ?? []), ...(['1', '2', '3', '5', '10', '15', '20'])]);
  for (const part of ['do', 'why', 'say'] as const) {
    const b = w[part];
    if (!b || typeof b.en !== 'string' || typeof b.ar !== 'string' || !b.en.trim() || !b.ar.trim()) return `${part}: empty`;
    if (b.en.length > MAX[part] || b.ar.length > MAX[part] + 40) return `${part}: too long`;
    if (AR.test(b.en)) return `${part}: Arabic in the English text`;
    if (!AR.test(b.ar)) return `${part}: the Arabic text is not Arabic`;
    // Topic names may be English inside the Arabic text, but not whole English sentences.
    if ((b.ar.match(LATIN_WORD) ?? []).length > 6) return `${part}: too much English in the Arabic text`;
    for (const s of [b.en, b.ar]) {
      if (/https?:|www\.|[*#`_]{2,}|^\s*[-*#]/.test(s)) return `${part}: link or Markdown`;
      if (ANSWER_WORDS.test(s)) return `${part}: gives an answer`;
      const western = s.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
      for (const num of western.match(/\d+/g) ?? []) if (!allowedNums.has(num)) return `${part}: a number not in the data (${num})`;
    }
  }
  return null;
}

const SYSTEM = [
  'You write short, warm suggestions for a parent: how they can help their child this week in one school subject.',
  'You get the child\'s first name, age group, the subject and up to 3 focus points picked from the child\'s real data. Write exactly one suggestion per focus point, in the same order.',
  'Each suggestion has: "do" (one home activity of 5 to 10 minutes that needs nothing special), "why" (one sentence, only facts given to you), "say" (one thing the parent can say to the child).',
  'Rules: use only the facts given. Never invent scores, dates, names or numbers. Never give the answer to any school work. No lists, no Markdown, no links.',
  'Age group "kid": activities the parent and child do together, playful. Age group "13plus": respectful, suggest asking or talking, never checking up or testing.',
  'Write every field in English ("en") and in simple Modern Standard or Egyptian Arabic ("ar"). Topic names may stay as given.',
  'Reply with JSON only: {"items":[{"do":{"en":"","ar":""},"why":{"en":"","ar":""},"say":{"en":"","ar":""}}]}',
].join('\n');

let client: Anthropic | null = null;
const modelOn = (): boolean => deepseekReady() || Boolean(getConfig().anthropicApiKey);

async function writeWithModel(focus: Focus[], ctx: { name: string; subject: Bi; tier: Tier; institutionId?: string }, timeoutMs: number): Promise<({ do: Bi; why: Bi; say: Bi } | undefined)[]> {
  if (!modelOn() || !focus.length) return [];
  client ??= new Anthropic({ apiKey: getConfig().anthropicApiKey || 'unused', timeout: timeoutMs, maxRetries: 0 });
  const model = llmModel(getConfig().anthropicVoiceModel);
  const input = { child: ctx.name, ageGroup: ctx.tier, subject: ctx.subject.en, focus: focus.map((f) => ({ kind: f.kind, topic: f.topic, detail: f.detail, score: f.score, due: f.dueAt ? new Date(f.dueAt).toISOString().slice(0, 10) : undefined })) };
  const { trackAiCall } = await import('../services/aiCalls');
  const res = await trackAiCall('parent_recommendations', model, () => llmClient(client!, timeoutMs).messages.create({ model, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(input) }] }), { institutionId: ctx.institutionId });
  const text = (res.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const items = (JSON.parse(json) as { items?: unknown[] }).items;
  return Array.isArray(items) ? (items as { do: Bi; why: Bi; say: Bi }[]) : [];
}

export const inputHashOf = (focus: Focus[], tier: Tier): string => createHash('sha256').update(JSON.stringify({ focus, tier, v: 1 })).digest('hex').slice(0, 16);

/** The suggestions of one subject this week: the saved ones when the data is the same, else written now (model, with checks and fallback). */
export async function recommendationsFor(
  s: SubjectDetail,
  ctx: { studentId: string; name: string; tier: Tier; institutionId?: string; weekStart: string; now?: Date },
  opts: { timeoutMs?: number; write?: typeof writeWithModel } = {},
): Promise<{ source: 'ai' | 'rules' | 'mixed'; items: Rec[] }> {
  const focus = pickFocus(s, ctx.now);
  if (!focus.length) return { source: 'rules', items: [] };
  const hash = inputHashOf(focus, ctx.tier);
  const saved = await ParentRecommendation.findOne({ studentId: ctx.studentId, subjectKey: s.key, weekStart: ctx.weekStart }).lean().catch(() => null);
  if (saved && saved.inputHash === hash) return { source: saved.source, items: saved.items as Rec[] };
  const base = { name: ctx.name, subject: s.name, family: s.family, tier: ctx.tier };
  let written: ({ do: Bi; why: Bi; say: Bi } | undefined)[] = [];
  try {
    written = await (opts.write ?? writeWithModel)(focus, { ...base, institutionId: ctx.institutionId }, opts.timeoutMs ?? 9_000);
  } catch (e) {
    logger.warn('parents.recommendations_model_failed', { reason: (e as Error).message?.slice(0, 120) });
  }
  const items = focus.map((f, i) => {
    const facts = [f.topic, f.detail, f.score, ctx.name, s.name.en].join(' ');
    const why = checkWritten(written[i], facts);
    if (why) {
      if (written.length) logger.info('parents.recommendation_refused', { kind: f.kind, why });
      return fallbackRec(f, base);
    }
    return { kind: f.kind, do: written[i]!.do, why: written[i]!.why, say: written[i]!.say, ai: true };
  });
  const ai = items.filter((x) => x.ai).length;
  const source = ai === items.length ? 'ai' : ai ? 'mixed' : 'rules';
  // A rules-only result is kept for the week only when the model is not in use; otherwise the next visit tries the model again.
  if (source !== 'rules' || !modelOn()) {
    await ParentRecommendation.updateOne({ studentId: ctx.studentId, subjectKey: s.key, weekStart: ctx.weekStart }, { $set: { inputHash: hash, source, items } }, { upsert: true }).catch(() => undefined);
  }
  return { source, items };
}
