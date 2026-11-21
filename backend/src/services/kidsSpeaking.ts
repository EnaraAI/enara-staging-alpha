// kidsSpeaking (owner go 21 Nov 2026, VOICE_KIDS_PICTURES_PLAN PR 2): children can speak to the tutor (the microphone in the kids tutor
// chat) and to the live avatar. An internal engine switch for the environment only (on for lms-test); there is no user, teacher or parent
// setting. Audio is never stored: the kids chat microphone uses the browser's speech recognition and sends only the text; the avatar call
// streams to Anam and keeps only the transcript, as for every learner. Before the first real school: parent consent and the legal review
// (docs/GO_LIVE_CHECKLIST.md).
import { engineV2 } from './engineV2';

export const kidsSpeakingOn = (): boolean => engineV2('kidsSpeaking');
/** What the kids app may show: the chat microphone and the live call. Only booleans; nothing about audio is kept. */
export function kidsSpeakingInfo(): { microphone: boolean; liveCall: boolean } {
  const on = kidsSpeakingOn();
  return { microphone: on, liveCall: on };
}
