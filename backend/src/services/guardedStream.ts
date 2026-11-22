// Speed step 6 (owner go 22 Nov 2026, avatarSentences): the live avatar used to wait for the WHOLE reply of a language lesson before speaking,
// because the lesson guards (answer not shown before the try, no copy-ready model, child length, mixed praise, closing ask) run on the whole
// reply. Now the guards run on the text so far each time a sentence ends, and a sentence is spoken once the guards keep it AND the next
// sentence has started (one sentence of look-ahead, so a guard that needs the next sentence, like praise followed by a correction, still works).
// At the end the guards run on the whole reply once more and anything they add (the closing ask) is spoken too. Anything already spoken can't
// be taken back: if the final guards would change it, that is counted ("diverged") for the turn record.
const SENTENCE_END_IN = /[.!?؟]["'”»)]*\s|\n/;
const HOLD_LAST = /^[\s\S]*[.!?؟]["'”»)]*\s+(?=\S)/;

export function guardedEmitter(guard: (text: string) => { text: string }) {
  let acc = ''; let emitted = ''; let diverged = false;
  const flush = (final: boolean): string => {
    const g = guard(acc.trim()).text;
    const safe = final ? g : (HOLD_LAST.exec(g)?.[0] ?? '');
    if (!safe.startsWith(emitted)) { if (final) diverged = true; return ''; }
    const add = safe.slice(emitted.length);
    if (!add.trim()) return '';
    emitted = safe; return add;
  };
  return {
    /** New visible text; returns what may be spoken now ('' while waiting). */
    push(visible: string): string { acc += visible; return SENTENCE_END_IN.test(visible) ? flush(false) : ''; },
    /** End of the reply: the rest that may be spoken. */
    end(): string { return flush(true); },
    get diverged() { return diverged; },
    get emitted() { return emitted; },
  };
}
