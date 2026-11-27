// liveExpressive (live tutor upgrade item 5, docs: PLAN_LIVE_TUTOR_UPGRADE "5. Expressive avatar"): the live avatar gets a
// Director Notes baseline style by age band on a Cara 4 face (Anam docs personas/director-notes). Named-only ENARA_ENGINE_V2
// switch, off by default and not part of "all". Off, or a face that cannot run Cara 4.1 Express: today's call, unchanged.
//   adults and teens: preset "warm", expressivity 0.5;
//   children (and a learner whose age is not known): preset "supportive", expressivity 0.3, and voice speed 0.85 where
//   the voice allows it (Cartesia Sonic 3, ElevenLabs v1/v2; never ElevenLabs v3/v4, which reject a speed).
import { timingSafeEqual } from 'crypto';
import { getConfig } from '../config/env';
import { maintenanceAllowed, MIN_TOKEN_LENGTH } from '../maintenance/guards';
import { Institution } from '../models/Institution';
import { logger } from '../utils/logging';
import { engineV2 } from './engineV2';
import { finalizeLanguageTurn, loadTrustedAgeBand, type LanguageTeachingContext } from './languageTeachingContext';
import type { StrippedReply } from './languageLearningState';
import { faceVersions } from './tutorFaceService';

export const EXPRESS_MODEL = 'cara-4.1-express';
export const CHILD_SPEED = 0.85;
export type ExpressiveBand = 'adult' | 'teen' | 'child';
export interface DirectorNotes { presetStyle: 'warm' | 'supportive'; expressivity: number }
/** What a call was started with (kept on the call, so a language switch keeps it). */
export interface ExpressiveCall { on: boolean; band?: ExpressiveBand; cara4?: boolean }

export const liveExpressiveOn = (): boolean => engineV2('liveExpressive');

/** The session's baseline style: children always get the calm one. */
export function baselineStyle(band: ExpressiveBand): DirectorNotes {
  return band === 'child' ? { presetStyle: 'supportive', expressivity: 0.3 } : { presetStyle: 'warm', expressivity: 0.5 };
}

/** The band for the style: an unknown age is treated as a child (the calm style); staff with no learner are adults. */
export async function expressiveBand(p: { institutionId?: string; studentId?: string }): Promise<ExpressiveBand> {
  if (!p.studentId) return 'adult';
  try {
    const inst = p.institutionId ? ((await Institution.findOne({ id: p.institutionId }).select('learningSettings').lean()) as { learningSettings?: unknown } | null) : null;
    const { band } = await loadTrustedAgeBand({ institutionId: p.institutionId, studentId: p.studentId, learningSettings: inst?.learningSettings });
    return band === 'adult' || band === 'teen' ? band : 'child';
  } catch (error) {
    logger.warn('live_expressive_band_failed', { error: String((error as Error)?.message ?? error).slice(0, 120) });
    return 'child';
  }
}

/** Does this face offer Cara 4.1 Express? Unknown (not listed, list unavailable) = no, so the call stays as today. */
export async function faceSupportsExpress(avatarId: string): Promise<boolean> {
  try {
    return (await faceVersions(avatarId)).includes(EXPRESS_MODEL);
  } catch {
    return false;
  }
}

// The voice's provider and model (Anam GET /v1/voices/{id}), cached per voice for an hour. Ids and model names only.
export interface VoiceProfile { provider: string; model: string }
const VOICE_TTL_MS = 60 * 60 * 1000;
const voiceCache = new Map<string, { at: number; profile: VoiceProfile | null }>();
export async function voiceProfile(voiceId: string | undefined): Promise<VoiceProfile | null> {
  if (!voiceId) return null;
  const hit = voiceCache.get(voiceId);
  if (hit && Date.now() - hit.at < VOICE_TTL_MS) return hit.profile;
  let profile: VoiceProfile | null = null;
  try {
    const anam = getConfig().anam;
    if (!anam) return null;
    const res = await fetch(`https://api.anam.ai/v1/voices/${encodeURIComponent(voiceId)}`, { headers: { Authorization: `Bearer ${anam.apiKey}` }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const v = (await res.json()) as { provider?: unknown; providerModelId?: unknown };
      if (typeof v.provider === 'string') profile = { provider: v.provider.toUpperCase(), model: typeof v.providerModelId === 'string' ? v.providerModelId : '' };
    }
  } catch {
    profile = null;
  }
  voiceCache.set(voiceId, { at: Date.now(), profile });
  return profile;
}
export const clearVoiceCacheForTests = (): void => voiceCache.clear();

/** Anam voice settings (personas/voices/configuration): speed works on Cartesia Sonic 3 (0.6-1.5) and ElevenLabs v1/v2 (0.7-1.2);
 *  ElevenLabs v3 and v4 reject it (HTTP 400). Anything else or unknown: no speed. */
export function speedAllowed(v: VoiceProfile | null): boolean {
  if (!v) return false;
  if (v.provider === 'CARTESIA') return /^sonic-3/.test(v.model);
  if (v.provider === 'ELEVENLABS') return /^eleven_(flash_v2|flash_v2_5|turbo_v2|turbo_v2_5|multilingual_v2|multilingual_v1|monolingual_v1)$/.test(v.model);
  return false;
}

/** The extra personaConfig fields for an expressive call, or null for today's call (switch off, or the face is not Cara 4.1 Express). */
export async function expressivePersona(call: ExpressiveCall | undefined, voiceId: string | undefined): Promise<{ fields: Record<string, unknown>; speed: boolean; voice: VoiceProfile | null } | null> {
  if (!call?.on || !call.cara4 || !call.band) return null;
  const directorNotes = baselineStyle(call.band);
  const voice = call.band === 'child' && voiceId ? await voiceProfile(voiceId) : null;
  const speed = call.band === 'child' && speedAllowed(voice);
  return { fields: { avatarModel: EXPRESS_MODEL, directorNotes, ...(speed ? { voiceGenerationOptions: { speed: CHILD_SPEED } } : {}) }, speed, voice };
}

// A per-call test override for the screenshot run (lms-test only): the call starts with the switch on or off whatever the
// environment says, so "before" and "after" frames can be taken on the same deployment. It needs ALL of: the maintenance
// routes allowed on this deployment (MAINTENANCE_ENDPOINTS_ENABLED and the test cluster, maintenance/guards.ts), and the
// CI token (MAINTENANCE_CI_TOKEN only, compared in constant time) in X-Enara-Ci-Token. Anything else: no override.
export const TEST_OVERRIDE_HEADER = 'x-enara-expressive-test';
export const CI_TOKEN_HEADER = 'x-enara-ci-token';
export function ciExpressiveOverride(headers: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env, mongoUri?: string): boolean | undefined {
  const want = headers[TEST_OVERRIDE_HEADER];
  if (want !== 'on' && want !== 'off') return undefined;
  const token = env.MAINTENANCE_CI_TOKEN;
  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) return undefined;
  try { mongoUri ??= getConfig().mongoUri; } catch { return undefined; }
  if (!maintenanceAllowed(env, mongoUri)) return undefined;
  const given = Buffer.from(typeof headers[CI_TOKEN_HEADER] === 'string' ? (headers[CI_TOKEN_HEADER] as string) : '');
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  return want === 'on';
}

/** At call start: is this call expressive, for which band, and can the face do it. */
export async function startExpressiveCall(p: { headers: Record<string, unknown>; institutionId?: string; studentId?: string; avatarId: string }): Promise<ExpressiveCall & { test?: boolean }> {
  const override = ciExpressiveOverride(p.headers);
  const on = override ?? liveExpressiveOn();
  if (!on) return { on: false, ...(override !== undefined ? { test: true } : {}) };
  const [band, cara4] = await Promise.all([expressiveBand(p), faceSupportsExpress(p.avatarId)]);
  return { on: true, band, cara4, ...(override !== undefined ? { test: true } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 2: cues chosen by code from the turn's verdict, never by the model (Anam inline cues / director_note_cue).
//   right answer -> happy (children: warm, the calm one); wrong -> supportive; new question -> curious;
//   stuck -> concerned, then supportive from the second sentence. Blocked: angry, sad, distressed, laughter.
// The cue travels as its own NDJSON line ({"cue":"happy"}), never inside the reply text, so it is never spoken by
// ENARA's own voice and never reaches a caption or the transcript. Any cue tag the model writes itself is removed.
export type Cue = 'happy' | 'warm' | 'supportive' | 'curious' | 'concerned';
export const ALLOWED_CUES: readonly Cue[] = ['happy', 'warm', 'supportive', 'curious', 'concerned'];
export const BLOCKED_CUES = ['angry', 'sad', 'distressed', 'laughter'] as const;
// Every tag Anam reads as a cue: its own eleven, and the ElevenLabs audio tags it maps onto them
// (Anam docs integrations/elevenlabs/director-notes, "the complete alias list").
const CUE_TAGS = [
  'happy', 'warm', 'playful', 'curious', 'supportive', 'concerned', 'sad', 'surprised', 'angry', 'distressed', 'laughter',
  'excited', 'happily', 'cheerfully', 'elated', 'laugh', 'laughs', 'laughing', 'laughs harder', 'starts laughing', 'chuckles', 'chuckling', 'giggles', 'giggling',
  'whispers', 'whispering', 'quietly', 'sarcastic', 'playfully', 'curiously', 'quizzical', 'quizzically', 'sigh', 'sighs', 'exhales',
  'sadly', 'sorrowful', 'tearful', 'crying', 'gasp', 'gasps', 'startled', 'angrily', 'furious', 'intensely', 'nervous', 'fearful', 'scared',
];
const CUE_TAG = new RegExp(`^[ \\t]*\\[\\s*(?:${CUE_TAGS.map((t) => t.replace(/ /g, '\\s+')).join('|')})\\s*\\][ \\t]*$`, 'i');
/** The reply without any cue tag (the model may not choose cues). Other bracketed text ("[a] or [an]") is kept. */
export function stripCueTags(text: string): string {
  if (!text.includes('[')) return text;
  let removed = false;
  const out = text.replace(/[ \t]*\[[^\]\n]{1,40}\][ \t]*/g, (m, offset: number) => {
    if (!CUE_TAG.test(m)) return m;
    removed = true;
    // Keep one space between words; none at the very start or before punctuation.
    const after = text.charAt(offset + m.length);
    return offset === 0 || /[\s.,!?؟;:]/.test(after) || after === '' ? '' : ' ';
  });
  return removed ? out : text;
}
export const isAllowedCue = (c: unknown): c is Cue => typeof c === 'string' && (ALLOWED_CUES as readonly string[]).includes(c);

export interface TurnFacts {
  kind: 'turn' | 'opening' | 'nudge';
  /** The engine's verdict on the learner's answer (language courses), and what the reply does next. */
  verdict?: string;
  next?: string;
  /** The learner says they don't know, asks for a hint, is confused, asks why after a try, or failed the same item 3+ times. */
  stuck?: boolean;
  /** A drawing opens with this reply. */
  drawing?: boolean;
  /** The reply ends on a question (no verdict: curious rather than warm). */
  asks?: boolean;
}
export interface CuePlan { first: Cue; then?: Cue }
const SUCCESS = new Set(['CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION']);
const FAILURE = new Set(['INCORRECT', 'PARTIALLY_CORRECT']);
/** The turn's cues, from code only. Null: no cue (the session's baseline style). */
export function cuesForTurn(t: TurnFacts, band: ExpressiveBand): CuePlan | null {
  if (t.kind === 'opening') return { first: 'warm' };
  if (t.kind === 'nudge') return { first: 'supportive' };
  if (t.stuck) return { first: 'concerned', then: 'supportive' };
  if (t.verdict && SUCCESS.has(t.verdict)) return { first: band === 'child' ? 'warm' : 'happy', ...(t.next === 'NEW_ITEM' ? { then: 'curious' as const } : {}) };
  if (t.verdict && FAILURE.has(t.verdict)) return { first: 'supportive' };
  if (t.next === 'NEW_ITEM' || t.drawing || t.asks) return { first: 'curious' };
  // No verdict: a neutral cue, never one that could read as a judgement.
  return { first: 'warm' };
}

// Every other subject (maths, science, Arabic, social studies...): the learner's own words say they are stuck.
const STUCK_WORDS = /\b(i\s*(really\s*)?(don'?t|do not|dont) (know|understand|get it)|no idea|not sure|i'?m (confused|lost|stuck)|i give up|give me a hint|can you help|why is (that|it) wrong)\b|مش عارف|مش فاهم|لا أعرف|لا اعرف|لا أفهم|لا افهم|ما فهمت|ساعدني|محتار/i;
export const stuckFromWords = (learnerText: string): boolean => STUCK_WORDS.test(learnerText);

/** Stuck, from the language engine's signals for this learner message (current turn only). */
export function stuckFromSignals(s: { learnerResponse?: string; whyAfterAttempt?: boolean; learning?: { attemptsOnItem?: number } } | undefined, verdict?: string): boolean {
  if (!s) return false;
  if (s.learnerResponse === 'dont_know' || s.learnerResponse === 'hint_request' || s.learnerResponse === 'confusion' || s.whyAfterAttempt) return true;
  return Boolean(verdict && FAILURE.has(verdict) && (s.learning?.attemptsOnItem ?? 0) >= 2);
}

/** Where the second cue goes: after the first sentence of the reply (index into the text), or -1 when there is no second sentence. */
export function secondSentenceAt(text: string): number {
  const m = /[.!?؟](?:["')\]]*)\s+(?=\S)/.exec(text);
  return m ? m.index + m[0].length : -1;
}

/** The turn's cues for an expressive call, from the verdict on this reply: in an English lesson the language engine's own
 *  (finalizeLanguageTurn, the same pure step that later records the turn); in every other subject the reply's trusted hidden
 *  grading line (gradeAllSubjects' SUBJECT_GRADE_LINE, a right/wrong only when it answers the question set). Null: no cue. */
export function planTurnCues(p: {
  call: ExpressiveCall | undefined; kind: TurnFacts['kind']; language?: LanguageTeachingContext; marker?: StrippedReply;
  reply: string; learnerText: string; drawing: boolean;
}): (CuePlan & { verdict?: string; stuck?: boolean }) | null {
  if (!p.call?.on || !p.call.cara4) return null;
  let verdict: string | undefined;
  let next: string | undefined;
  if (p.language && p.kind === 'turn') {
    try {
      const f = finalizeLanguageTurn(p.language, { reply: p.reply, learnerText: p.learnerText, messageId: 'cue', parsed: p.marker?.assessment ?? null, malformed: p.marker?.malformed, untrustedMarkers: p.marker?.untrustedMarkers, firstMarkerNotLeading: p.marker?.firstMarkerNotLeading });
      verdict = f.assessment.verdict;
      next = f.assessment.next;
    } catch {
      verdict = undefined;
    }
  }
  if (!p.language && p.kind === 'turn') {
    const a = p.marker?.assessment as { verdict?: string; relevance?: string; next?: string } | null | undefined;
    if (a?.verdict && (a.relevance === 'ACTIVE_ITEM' || !(SUCCESS.has(a.verdict) || FAILURE.has(a.verdict)))) verdict = a.verdict;
    next = a?.next;
  }
  const stuck = p.kind === 'turn' && (p.language ? stuckFromSignals(p.language.signals as Parameters<typeof stuckFromSignals>[0], verdict) : stuckFromWords(p.learnerText));
  const asks = /[?؟]\s*$/.test(p.reply.trim());
  const plan = cuesForTurn({ kind: p.kind, verdict, next, stuck, drawing: p.drawing, asks }, p.call.band ?? 'child');
  return plan && { ...plan, ...(verdict ? { verdict } : {}), ...(stuck ? { stuck } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 3: "look at the drawing", worked around (Anam has no gaze, nod or pointing control: Director Notes "do not provide
// deterministic gesture, gaze, or pose control"). When a drawing opens, the tutor says so, the browser pulses the panel,
// and the panel sits on the side the face is turned to.
export const LOOK_LINE = { english: 'Look at the picture.', arabic: 'انظر إلى الصورة.' } as const;
const SAYS_LOOK = /\blook at (the|this) (picture|drawing|screen|board|visual)\b|انظر (إلى|الى) (الصورة|الرسم|الشاشة)/i;
/** The line the tutor says when a drawing opens with its reply, unless the reply already says it. */
export function lookLine(reply: string, language: 'english' | 'arabic'): string | null {
  return SAYS_LOOK.test(reply) ? null : LOOK_LINE[language];
}
// The panel's side, from each stock face's picture (checked 27 Nov 2026: every face looks at the camera; most sit left of
// centre with open space on the viewer's right, where the panel already is). Faces sitting right of centre, turned to the
// viewer's left, get the panel on the left.
const PANEL_LEFT = new Set(['27e12daa-50fc-4384-93c2-ebca73f1f78d']); // Anne (home)
export const panelSide = (avatarId: string | undefined): 'left' | 'right' => (avatarId && PANEL_LEFT.has(avatarId) ? 'left' : 'right');
