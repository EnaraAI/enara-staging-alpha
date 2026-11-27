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
import { loadTrustedAgeBand } from './languageTeachingContext';
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
