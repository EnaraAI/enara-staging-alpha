// Spoken input (owner, 22 Nov 2026): when a learner SPEAKS (live avatar, kids chat microphone), the tutor grades text made by speech-to-text,
// which can mishear ("My pencil" heard as "Eye pencil", "My friends" as "I friends", "Ali" as "Ollie", "twelve" as "12"). A grammar or word
// error that may come from the transcription is never marked: the tutor asks the learner to say it again instead of correcting.
// - SPOKEN_INPUT_RULE goes into every spoken language turn (the model's grading rules);
// - misheardNote(text) spots the clearest cases in code and adds a turn note ("ask them to say it again; grade AMBIGUOUS");
// - spokenVerdictGuard() turns a wrong/partly-right grade on such a turn into AMBIGUOUS + SAME_ITEM, so nothing wrong is recorded.

export const SPOKEN_INPUT_RULE =
  'SPOKEN ANSWER: the learner said this aloud and you are reading speech-to-text, which can mishear. Never mark a grammar or word error that ' +
  'could come from the transcription: a word that sounds like the right one ("I" or "Eye" for "My", "there/their", "to/two/too", "for/four", ' +
  '"its/it\'s", "your/you\'re", "here/hear", "right/write"), a missing or extra small word, digits for number words ("12" for "twelve"), ' +
  'spelling, punctuation or capital letters, or a name spelled differently. If the only possible error is one of these, or you are not sure, ' +
  'do not correct it: grade AMBIGUOUS with next=SAME_ITEM and ask them warmly to say it again. Correct only errors that are clearly not ' +
  'from the transcription (a wrong verb form like "He go", a wrong word order, a wrong answer).';

// Words that can follow "I" in a normal sentence (verbs, modals, adverbs, contractions): "I like", "I can", "I really", "I'm".
const AFTER_I = new Set(('am was have had has like likes love loved can could will would shall should may might must do does did don\'t didn\'t ' +
  'can\'t won\'t go went get got live lived play played eat ate see saw think thought know knew need want wanted feel felt make made take ' +
  'took come came say said read write wrote speak spoke learn learned study swim draw run walk ride sing dance help hope wish mean ' +
  'really also never always usually often sometimes just only still already too not here there and or but so because when if ' +
  'every each me my\'m \'m\'ll\'d\'ve').split(/\s+/));

/** A clear sign the transcription misheard the learner, as a short note for the tutor; null when none is seen. */
export function misheardNote(text: string): string | null {
  const t = text.trim();
  const m = /^\s*(eye|i)\s+([a-z']+)\b/i.exec(t);
  if (m) {
    const first = m[1].toLowerCase(); const next = m[2].toLowerCase();
    if (first === 'eye' && !['is', 'are', 'was', 'hurts'].includes(next)) return `"${m[1]} ${m[2]}" was probably "My ${m[2]}" misheard`;
    if (first === 'i' && !AFTER_I.has(next) && !next.includes("'") && /^[a-z]{3,}$/.test(next) && !/(ed|ing)$/.test(next) && /\b(is|are|was|were|has|have|come|comes|go|goes|like|likes|lives|plays)\b/i.test(t.slice(m[0].length))) {
      return `"I ${m[2]}" was probably "My ${m[2]}" misheard`;
    }
  }
  return null;
}
/** The turn note for a spoken answer the code thinks was misheard. */
export const misheardTurnNote = (note: string): string =>
  `HEARD BY SPEECH-TO-TEXT, PROBABLY MISHEARD: ${note}. Do not correct it. Grade AMBIGUOUS with next=SAME_ITEM and ask them warmly to say the sentence again.`;

/** Whether a spoken turn's wrong grade should not count: the answer looks misheard. */
export function spokenVerdictGuard(p: { spoken: boolean; text: string; verdict?: string }): { verdict: 'AMBIGUOUS'; next: 'SAME_ITEM' } | null {
  if (!p.spoken || !p.verdict || !['INCORRECT', 'PARTIALLY_CORRECT'].includes(p.verdict)) return null;
  return misheardNote(p.text) ? { verdict: 'AMBIGUOUS', next: 'SAME_ITEM' } : null;
}


/** The hidden grading line of a spoken turn, with a wrong grade on a misheard answer turned into "say it again" (nothing wrong recorded). */
export function guardSpokenMarker<T extends { assessment: { verdict: string; next: string } | null }>(marker: T | undefined, text: string): T | undefined {
  const a = marker?.assessment;
  const g = spokenVerdictGuard({ spoken: true, text, verdict: a?.verdict });
  return g && marker && a ? { ...marker, assessment: { ...a, verdict: g.verdict, next: g.next } } : marker;
}
/** The prompt lines for a spoken language turn: the rule, and the note when code sees a likely mishearing. */
export function spokenLines(text: string): string {
  const note = misheardNote(text);
  return `\n\n${SPOKEN_INPUT_RULE}${note ? `\n${misheardTurnNote(note)}` : ''}`;
}
