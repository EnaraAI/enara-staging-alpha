// One shared language-teaching turn pipeline. The text chat (tutor.controller) and the live avatar (avatar.controller) BOTH go through
// this module, so an update to the language engine reaches both automatically. The avatar adds only a thin voice layer
// (VOICE_ADAPTATION: spoken style); it never changes teaching decisions or guards. tests (languageParity.test.ts) fail if either
// channel stops using the shared functions or if the policy version differs between them.
import {
  buildLanguageTeachingContext, finalizeLanguageTurn, guardedItems, independentSuccessItem, turnEvidence, LANGUAGE_CONTEXT_VERSION,
  type LanguageTeachingContext, type LanguageTurnEvidence,
} from './languageTeachingContext';
import { recordProfileTurn } from './learnerLanguageProfile';
import { stripPreAttemptModels, stripCopyReadyModels, type StrippedReply } from './languageLearningState';

export type LanguageChannel = 'chat' | 'voice';
/** The single policy version both channels report. */
export const LANGUAGE_POLICY_VERSION = LANGUAGE_CONTEXT_VERSION;

/** Thin voice layer: spoken-style adaptation only. Same teaching rules; nothing here relaxes a guard. */
export const VOICE_ADAPTATION =
  'This is a spoken conversation: your words are read aloud. Use short natural sentences, no lists, no markdown, no symbols, and do not spell out punctuation. ' +
  'When you give an English example, say it once, clearly, as a plain sentence. Keep every teaching rule above exactly as written (same hint ladder, no answers before an attempt, English only).';

export type PrepareInput = Parameters<typeof buildLanguageTeachingContext>[0];
/** The one place a language turn's context is built, for either channel. */
export async function prepareLanguageContext(input: PrepareInput, channel: LanguageChannel): Promise<{ context: LanguageTeachingContext; prompt: string } | null> {
  const context = await buildLanguageTeachingContext(input);
  if (!context) return null;
  return { context, prompt: channel === 'voice' ? `${context.prompt}\n\n${VOICE_ADAPTATION}` : context.prompt };
}

/** Reply guards (fixes 1 and 2A): applied to every language reply, chat or voice, before anything is stored, shown or spoken. */
export function applyReplyGuards(language: LanguageTeachingContext, answer: string, learnerText: string): { text: string; removed: number } {
  let text = answer; let removed = 0;
  const guarded = stripPreAttemptModels(text, guardedItems(language), learnerText, [...(language.lesson.spec?.vocabulary ?? []), ...(language.lesson.spec?.examples ?? [])]);
  if (guarded.removed.length) { text = guarded.text; removed += guarded.removed.length; }
  const copy = stripCopyReadyModels(text, learnerText);
  if (copy.removed.length) { text = copy.text; removed += copy.removed.length; }
  return { text, removed };
}

/** Evidence stored with the reply and used by the next turn's engine state; also records the cross-session learner profile. */
export async function completeLanguageTurn(opts: {
  language: LanguageTeachingContext; objectiveId?: string; reply: string; learnerText: string; messageId: string; marker?: StrippedReply; removed: number;
  institutionId: string; studentId: string;
}): Promise<LanguageTurnEvidence> {
  const { language, marker } = opts;
  const lt = {
    ...turnEvidence(language, opts.objectiveId),
    ...finalizeLanguageTurn(language, {
      reply: opts.reply, learnerText: opts.learnerText, messageId: opts.messageId, parsed: marker?.assessment ?? null, malformed: marker?.malformed,
      untrustedMarkers: marker?.untrustedMarkers, firstMarkerNotLeading: marker?.firstMarkerNotLeading,
    }),
    ...(opts.removed ? { preAttemptModelsRemoved: opts.removed } : {}),
  };
  await recordProfileTurn(opts.institutionId, opts.studentId, { errorCode: language.signals.diagnosis?.code, independentSuccessOn: independentSuccessItem(language, lt) });
  return lt as unknown as LanguageTurnEvidence;
}

/** Stored messages -> the engine's own history (with stored language-turn state). */
export function languageHistoryFrom(earlier: { role: string; text: string; meta?: unknown }[]) {
  return earlier.filter((m) => m.role === 'user' || m.role === 'ai').slice(-12).map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.text,
    languageTurn: (m as { meta?: { languageTurn?: LanguageTurnEvidence } }).meta?.languageTurn ?? null,
  }));
}
