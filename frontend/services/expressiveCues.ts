// liveExpressive (live tutor item 5): the server picks a cue for each tutor turn from the lesson's verdict and sends it
// as its own line ({"cue":"happy"}), never inside the reply text. The browser passes it to the video tutor only:
// inline in the talk stream when the video tutor speaks (Anam voice), or as a director_note_cue data message when
// ENARA's own voice is passed through. A cue is never spoken by ENARA's voice, captioned or kept in the transcript.
// Only these five are ever sent; anything else (angry, sad, distressed, laughter, unknown) is dropped here too.
export const EXPRESSIVE_CUES = ['happy', 'warm', 'supportive', 'curious', 'concerned'] as const;
export type ExpressiveCue = (typeof EXPRESSIVE_CUES)[number];

export const isExpressiveCue = (value: unknown): value is ExpressiveCue =>
  typeof value === 'string' && (EXPRESSIVE_CUES as readonly string[]).includes(value);

/** The talk-stream text for a cue (Anam reads the tag and strips it from what it shows). */
export const cueTag = (cue: ExpressiveCue): string => `[${cue}] `;

/** Passthrough: when, from the start of this spoken turn, a cue placed after `charsBefore` characters of the reply applies
 *  (about 14 spoken characters a second; 0 for the first cue). */
export const cueAtSeconds = (charsBefore: number): number => Math.max(0, Math.round((charsBefore / 14) * 10) / 10);
