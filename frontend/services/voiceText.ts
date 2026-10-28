// Text helpers for the live avatar's voice: which language a sentence is in,
// and whether what the microphone heard is just the avatar's own speech.

export type VoiceLanguage = 'english' | 'arabic';

export function languageOfText(text: string): VoiceLanguage {
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return arabic > 0 && arabic >= latin / 3 ? 'arabic' : 'english';
}

// The transcript's own script decides first (Arabic letters are Arabic even if
// the detector labelled them otherwise); the detector's label only settles
// Latin-script text, e.g. Arabic spoken but written in Latin letters.
export function toVoiceLanguage(code: string | null | undefined, text: string): VoiceLanguage {
  if (/[\u0600-\u06FF]/.test(text)) return languageOfText(text);
  return (code || '').toLowerCase().startsWith('ar') ? 'arabic' : 'english';
}

export function voiceWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

// True when what the mic heard is the avatar's own speech coming back: echo
// repeats the avatar word for word, while a student answering often reuses a
// few of its words ("we subtract 4") but not long runs of them in order.
export function isEcho(heard: string, spoken: string): boolean {
  const heardWords = voiceWords(heard);
  if (!heardWords.length) return true;
  const spokenWords = voiceWords(spoken);
  if (!spokenWords.length) return false;

  // Longest run of heard words that appears, in order, in what the avatar said.
  let longest = 0;
  for (let i = 0; i < spokenWords.length; i++) {
    let run = 0;
    while (i + run < spokenWords.length && run < heardWords.length && spokenWords[i + run] === heardWords[run]) run++;
    longest = Math.max(longest, run);
    for (let start = 1; start < heardWords.length && longest < heardWords.length - start; start++) {
      let r = 0;
      while (i + r < spokenWords.length && start + r < heardWords.length && spokenWords[i + r] === heardWords[start + r]) r++;
      longest = Math.max(longest, r);
    }
  }
  if (heardWords.length <= 3) return longest === heardWords.length && heardWords.length >= 2;
  return longest >= 4 || longest / heardWords.length >= 0.6;
}
