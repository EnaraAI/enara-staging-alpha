// kidsAudioVisual (NEXT_PLAN item 1, owner go 21 Nov 2026): picture choices for children under 9. The tutor names 2-4 kids-pack words in its
// hidden assess line (pics=...); only words with a picture in the index (ENARA's own set, kidsPictureIndex.ts, the same files as
// frontend/public/kids/pics; owner go 21 Nov 2026, replaced OpenMoji) become tap-able choices. The choices never say which one is right. Children's speaking is a separate switch (kidsSpeaking).
import { engineV2 } from './engineV2';
import { KIDS_PICTURES } from './kidsPictureIndex';

let cache: Map<string, string> | undefined;
export function pictureIndex(): Map<string, string> {
  return (cache ??= new Map(Object.entries(KIDS_PICTURES)));
}
export const kidsAudioVisualOn = (): boolean => engineV2('kidsAudioVisual');
/** Picture choices for the reply: 2-4 distinct known words, each with its picture path. Fewer than 2 known words: none. */
export function pictureChoices(words: string[] | undefined, index = pictureIndex()): { word: string; src: string }[] | undefined {
  if (!words?.length) return undefined;
  const out: { word: string; src: string }[] = [];
  for (const w of words) {
    const slug = index.get(w.toLowerCase());
    if (slug && !out.some((o) => o.word === w)) out.push({ word: w, src: `/kids/pics/${slug}.svg` });
  }
  return out.length >= 2 ? out.slice(0, 4) : undefined;
}
export const KIDS_PICS_LINE = 'This child is under 9 and can tap pictures. When this reply sets a task whose answer is ONE thing or animal (for example "What is it?", "Find the cat", "Which one is red?"), add pics=word1|word2|word3 to the hidden assess line: 2 to 4 simple English words (things, animals, colours, actions; use _ for a space, e.g. ice_cream), one of them the answer and the others clearly different, in mixed order. The child sees and hears them as picture buttons. In the visible text never say which picture is right. If the task is not about one thing or animal, leave pics out.';
