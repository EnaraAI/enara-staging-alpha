// Parents: "How you can help this week", per subject (owner go, 22 Nov 2026; docs/parents/ALL_SUBJECTS_PLAN.md).
// 1. Code picks what matters most from the child's real data in that subject (pickFocus): open points to practise (released only), the
//    weakest outcome, a low RELEASED result, no practice this week, something due soon, the next lesson. An unreleased result never
//    reaches this file (SubjectDetail.latestResult and .points hold only what the parent may see).
// 2. Code writes it (fallbackRec, both languages, a different activity idea from week to week) and the parent sees it at once.
// 3. The model only adds variation (owner, 22 Nov 2026): in the background it rewords the code's text, keeping every fact; checkWritten()
//    refuses anything off (wrong language, too long, links, Markdown, numbers not in the code's text, answer-giving words), and a refused
//    item keeps the code's text. The reworded version is saved per child, subject and week and shown from the next visit.
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { ParentRecommendation } from '../models/ParentRecommendation';
import { deepseekReady, llmClient, llmModel } from '../services/llmProvider';
import type { Tier } from './policy';
import type { Bi, Family, SubjectDetail } from './subjects';

export type FocusKind = 'error' | 'outcome' | 'result' | 'routine' | 'due' | 'next' | 'celebrate';
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
  // Nothing to work on but a good released result: build on it, so every subject with a result has a suggestion.
  if (!out.length && s.latestResult && s.latestResult.score >= 60) out.push({ kind: 'celebrate', topic: s.latestResult.title, score: s.latestResult.score });
  return out.slice(0, 3);
}

// ----------------------------------------------------------------- written in advance (always available)

const ACTIVITY_B: Record<Family, { kid: Bi; teen: Bi }> = {
  language: {
    kid: { en: 'play a quick game: take turns saying a sentence with it about something in the room', ar: 'العبا لعبة سريعة: بالدور قولوا جملة بها عن شيء في الغرفة' },
    teen: { en: 'ask them to write a short message to a friend using it, and read it to you', ar: 'اطلب منه أن يكتب رسالة قصيرة لصديق يستخدمها فيها ويقرأها لك' },
  },
  maths: {
    kid: { en: 'use coins, fruit or toys to make 3 small problems together', ar: 'استخدما عملات أو فاكهة أو ألعابًا لعمل ٣ مسائل صغيرة معًا' },
    teen: { en: 'ask them to make up one problem like it for you to solve, then check your answer', ar: 'اطلب منه أن يؤلف لك مسألة مثلها لتحلها، ثم يصحح إجابتك' },
  },
  science: {
    kid: { en: 'do a tiny kitchen experiment or drawing about it and talk about what you see', ar: 'اعملا تجربة صغيرة في المطبخ أو رسمة عنه وتحدّثا عمّا تريانه' },
    teen: { en: 'ask them to explain it to you in their own words with one real example', ar: 'اطلب منه أن يشرحه لك بكلماته مع مثال حقيقي واحد' },
  },
  general: {
    kid: { en: 'ask them to tell you a short story about it', ar: 'اطلب منه أن يحكي لك قصة قصيرة عنه' },
    teen: { en: 'ask them what they found most interesting about it and why', ar: 'اسأله ما أكثر شيء شدّه فيه ولماذا' },
  },
};

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
export function fallbackRec(f: Focus, ctx: { name: string; subject: Bi; family: Family; tier: Tier; variant?: number }): Rec {
  const kid = ctx.tier === 'kid';
  const act = (ctx.variant ? ACTIVITY_B : ACTIVITY)[ctx.family][kid ? 'kid' : 'teen'];
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
    case 'celebrate':
      return {
        kind: f.kind, ai: false,
        do: { en: `Ask them to show you one question from ${q(t)} they got right and how they solved it.`, ar: `اطلب منه أن يريك سؤالًا واحدًا من ${q(t)} أجاب عنه صح، وكيف حلّه.` },
        why: { en: `${n} did well in ${sub.en}: ${f.score}% on ${q(t)}.`, ar: `${n} أبلى بلاءً حسنًا في ${sub.ar}: ${f.score}٪ في ${q(t)}.` },
        say: say('Well done! Can you teach me how you did that one?', 'برافو! ممكن تعلّمني إزاي حليتها؟', 'Nice result. What helped you most?', 'نتيجة حلوة. إيه أكتر حاجة ساعدتك؟'),
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
    if ((b.ar.match(LATIN_WORD) ?? []).length > 10) return `${part}: too much English in the Arabic text`;
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
  'You reword short suggestions for a parent about helping their child at home in one school subject, so they do not read the same every week.',
  'You get the suggestions already written in English ("en") and Arabic ("ar"). Rewrite each one in fresh, warm, plain words.',
  'Keep exactly the same meaning, the same activity idea, the same facts, names, topics, numbers and dates. Add nothing new. Never give the answer to any school work.',
  'Keep each field about as short as the original. Plain sentences: no lists, no Markdown, no links, no emojis.',
  'English fields in English only. Arabic fields in simple Arabic (Modern Standard or Egyptian); topic names in quotes may stay as given.',
  'Reply with JSON only, the same number of items in the same order: {"items":[{"do":{"en":"","ar":""},"why":{"en":"","ar":""},"say":{"en":"","ar":""}}]}',
].join('\n');

let client: Anthropic | null = null;
const MAX_OUT = 2000;
const modelOn = (): boolean => deepseekReady() || Boolean(getConfig().anthropicApiKey);
type Written = { do: Bi; why: Bi; say: Bi } | undefined;

/** The model's rewording of the code's suggestions (throws on a failed call or an unreadable reply). */
async function rewordWithModel(items: Rec[], ctx: { tier: Tier; institutionId?: string }, timeoutMs: number): Promise<Written[]> {
  if (!modelOn() || !items.length) return [];
  client ??= new Anthropic({ apiKey: getConfig().anthropicApiKey || 'unused', timeout: timeoutMs, maxRetries: 0 });
  const model = llmModel(getConfig().anthropicVoiceModel);
  const input = { ageGroup: ctx.tier, items: items.map((r) => ({ do: r.do, why: r.why, say: r.say })) };
  const content = JSON.stringify(input);
  const { meteredMessage } = await import('../services/aiGateway');
  const { textTokenBound } = await import('../services/priceCatalog');
  // The call states its cost ceiling (input and output tokens), as the tutor's calls do: the lms-test spend cap refuses a call without one.
  const res = await meteredMessage({ feature: 'parent_recommendations', modelName: model, institutionId: ctx.institutionId, bound: { inputTokens: textTokenBound(SYSTEM, content), outputTokens: MAX_OUT } },
    () => llmClient(client!, timeoutMs).messages.create({ model, max_tokens: MAX_OUT, system: SYSTEM, messages: [{ role: 'user', content }] }));
  const text = (res.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`no JSON in the reply (${text.length} chars, stop ${String((res as { stop_reason?: string }).stop_reason)})`);
  const parsed = (JSON.parse(text.slice(start, end + 1)) as { items?: unknown[] }).items;
  return Array.isArray(parsed) ? (parsed as Written[]) : [];
}

/** Each reworded item if it passes the checks against the code's own text, else the code's item. */
export function mergeReworded(code: Rec[], written: Written[]): { items: Rec[]; refused: string[] } {
  const refused: string[] = [];
  const items = code.map((c, i) => {
    const why = checkWritten(written[i], JSON.stringify([c.do, c.why, c.say]));
    if (why) { refused.push(`${c.kind}: ${why}`); return c; }
    return { ...c, do: written[i]!.do, why: written[i]!.why, say: written[i]!.say, ai: true };
  });
  return { items, refused };
}

export const inputHashOf = (focus: Focus[], tier: Tier): string => createHash('sha256').update(JSON.stringify({ focus, tier, v: 2 })).digest('hex').slice(0, 16);
const variantOf = (studentId: string, subjectKey: string, weekStart: string): number => createHash('sha256').update(`${studentId}:${subjectKey}:${weekStart}`).digest()[0] % 2;
const running = new Set<string>();

/**
 * The suggestions of one subject this week, at once: the model's reworded version when it is saved for the same data, else the code's.
 * When there is no reworded version yet, the rewording runs in the background (after the reply) and is saved for the next visit.
 */
export async function recommendationsFor(
  s: SubjectDetail,
  ctx: { studentId: string; name: string; tier: Tier; institutionId?: string; weekStart: string; now?: Date },
  opts: { timeoutMs?: number; reword?: typeof rewordWithModel; wait?: boolean } = {},
): Promise<{ source: 'ai' | 'rules' | 'mixed'; items: Rec[] }> {
  const focus = pickFocus(s, ctx.now);
  if (!focus.length) return { source: 'rules', items: [] };
  const hash = inputHashOf(focus, ctx.tier);
  const where = { studentId: ctx.studentId, subjectKey: s.key, weekStart: ctx.weekStart };
  const saved = await ParentRecommendation.findOne(where).lean().catch(() => null);
  if (saved && saved.inputHash === hash && saved.source !== 'rules') return { source: saved.source, items: saved.items as Rec[] };
  const code = focus.map((f) => fallbackRec(f, { name: ctx.name, subject: s.name, family: s.family, tier: ctx.tier, variant: variantOf(ctx.studentId, s.key, ctx.weekStart) }));
  const job = `${ctx.studentId}:${s.key}:${ctx.weekStart}:${hash}`;
  const tried = saved && saved.inputHash === hash && saved.source === 'rules' && Date.now() - new Date(saved.triedAt ?? 0).getTime() < 3_600_000;
  if ((opts.reword || modelOn()) && !running.has(job) && !tried) {
    running.add(job);
    const task = (async () => {
      let note = '';
      let out: { items: Rec[]; refused: string[] } = { items: code, refused: [] };
      try {
        out = mergeReworded(code, await (opts.reword ?? rewordWithModel)(code, { tier: ctx.tier, institutionId: ctx.institutionId }, opts.timeoutMs ?? 25_000));
        note = out.refused.join('; ');
      } catch (e) {
        note = `model: ${String((e as Error).message ?? e).slice(0, 160)}`;
      }
      const ai = out.items.filter((x) => x.ai).length;
      const source = ai === out.items.length ? 'ai' : ai ? 'mixed' : 'rules';
      if (note) logger.info('parents.recommendations_reword', { source, note: note.slice(0, 200) });
      await ParentRecommendation.updateOne(where, { $set: { inputHash: hash, source, items: out.items, note: note.slice(0, 300), triedAt: new Date() } }, { upsert: true }).catch(() => undefined);
    })().finally(() => running.delete(job));
    if (opts.wait) await task;
    else import('@vercel/functions').then(({ waitUntil }) => waitUntil(task)).catch(() => undefined);
  }
  return { source: 'rules', items: code };
}

/** Maintenance check (lms-test): one rewording of a sample, with timing, the outcome and each refusal reason. No learner data. */
export async function rewordCheck(institutionId?: string): Promise<Record<string, unknown>> {
  const sample: Rec[] = [
    fallbackRec({ kind: 'error', topic: 'Halves and quarters', detail: 'mixes up halves and quarters' }, { name: 'Mona', subject: { en: 'Maths', ar: 'الرياضيات' }, family: 'maths', tier: 'kid' }),
    fallbackRec({ kind: 'result', topic: 'Unit quiz', score: 45 }, { name: 'Mona', subject: { en: 'Maths', ar: 'الرياضيات' }, family: 'maths', tier: 'kid' }),
  ];
  const t = Date.now();
  try {
    const written = await rewordWithModel(sample, { tier: 'kid', institutionId }, 25_000);
    const m = mergeReworded(sample, written);
    return { ok: true, modelOn: modelOn(), ms: Date.now() - t, returned: written.length, accepted: m.items.filter((x) => x.ai).length, refused: m.refused, sample: m.items.map((x) => ({ ai: x.ai, do: x.do })) };
  } catch (e) {
    return { ok: false, modelOn: modelOn(), ms: Date.now() - t, error: String((e as Error).message ?? e).slice(0, 300), code: (e as { code?: string }).code ?? null };
  }
}
