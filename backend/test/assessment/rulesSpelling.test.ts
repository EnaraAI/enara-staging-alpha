import { describe, expect, it } from 'vitest';
import { Hunspell } from '../../src/assessment/text/hunspell';
import { spellChecker, allowed, type SpellChecker } from '../../src/assessment/text/dictionaries';
import { englishSpelling, arabicSpelling, arabicVariants, colloquialWord, dialectReport, mechanicsDecision, sentenceSpans, spellingReport, withoutQuotes } from '../../src/assessment/grading-engine/rules/spelling';
import { runRules } from '../../src/assessment/grading-engine/rules';
import { rubricFor } from '../../src/assessment/rubrics/templates';
import type { OpenItem } from '../../src/assessment/grading-engine/graders/domains';

// Rules-first grading, spelling by code (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.1): the Hunspell reader, the spelling, capital and
// colloquial rules, and the mechanics decision. The shipped dictionaries (backend/assets/dictionaries) are used as they are.

const en = spellChecker('en') as SpellChecker;
const ar = spellChecker('ar') as SpellChecker;
const words = (r: { misspelled: { word: string }[] }) => r.misspelled.map((m) => m.word);

describe('the Hunspell reader', () => {
  it('reads FLAG long, AF aliases, IGNORE, a prefix allowed by a suffix\'s continuation class and a twofold suffix', () => {
    const aff = ['SET UTF-8', 'FLAG long', 'IGNORE َُ', 'AF 3', 'AF AaSb', 'AF Pa', 'AF Sc',
      'PFX Pa Y 1', 'PFX Pa 0 ال .',
      'SFX Aa Y 1', 'SFX Aa 0 0/2 .', // a zero suffix whose continuation allows the article
      'SFX Sb Y 1', 'SFX Sb ة ات/3 ة', // plural, then (twofold) a further suffix
      'SFX Sc Y 1', 'SFX Sc 0 هم .'].join('\n');
    const h = new Hunspell(aff, '1\nمدرسة/1\n');
    for (const w of ['مدرسة', 'المدرسة', 'مدرسات', 'مدرساتهم', 'مَدرَسة']) expect(h.check(w), w).toBe('ok');
    for (const w of ['المدرسه', 'مدرسهم', 'المدرساتهمم']) expect(h.check(w), w).toBe('bad');
  });
  it('case: capitalised and all-capitals forms of a word are fine; a name in lower case is a case problem', () => {
    const h = new Hunspell('SET UTF-8\nSFX S Y 1\nSFX S 0 s .\n', '2\nhouse/S\nCairo\n');
    expect([h.check('House'), h.check('HOUSES'), h.check('Cairo'), h.check('cairo'), h.check('hause')]).toEqual(['ok', 'ok', 'ok', 'case', 'bad']);
  });
  it('the shipped dictionaries load and know common words in every form', () => {
    for (const w of ['house', 'children', 'walked', "don't", 'unhappy']) expect(en.check(w), w).toBe('ok');
    for (const w of ['recieve', 'beautifull', 'goverment']) expect(en.check(w), w).toBe('bad');
    for (const w of ['المدرسة', 'بالمدرسة', 'والمدرسة', 'للمدرسة', 'مدرستهم', 'الطلاب', 'سيذهبون', 'أكلت', 'مَدْرَسَةٌ']) expect(ar.check(w), w).toBe('ok');
    for (const w of ['اكلت', 'هذة', 'الى']) expect(ar.check(w), w).toBe('bad');
  });
  it('our own allow-list is separate and matches Arabic words with attached prefixes', () => {
    const allow = new Set(['الأتوبيس', 'kahk']);
    expect(allowed(allow, 'والأتوبيس', 'ar')).toBe(true);
    expect(allowed(allow, 'بالأتوبيس', 'ar')).toBe(true);
    expect(allowed(allow, 'أتوبيس', 'ar')).toBe(true);
    expect(allowed(allow, 'Kahk', 'en')).toBe(true);
    expect(allowed(allow, 'الأتوبيسات', 'ar')).toBe(false);
  });
});

describe('English spelling and capitals', () => {
  it('counts misspelled words', () => {
    const r = englishSpelling('We see beautifull fish. The goverment must help.', en);
    expect(words(r)).toEqual(['beautifull', 'goverment']);
    expect(r.misspelled.every((m) => m.certain && m.kind === 'spelling')).toBe(true);
  });
  it('guards: names, words from the question, numbers, short words, British spelling, quotes', () => {
    expect(words(englishSpelling('Last summer Ahmed and I went to Hurghada and Marsa Alam.', en))).toEqual([]);
    expect(words(englishSpelling('The zorblat festival is fun.', en, { stem: 'Describe the zorblat festival.' }))).toEqual([]);
    expect(words(englishSpelling('I wake up at 6 and sleep at 10pm. We had 3 lessons on the 2nd floor.', en))).toEqual([]);
    expect(words(englishSpelling('My favourite colour is grey. We travelled to the centre.', en))).toEqual([]);
    expect(words(englishSpelling('He wrote "teh" on the board.', en))).toEqual([]);
    expect(words(englishSpelling('We eat kahk and fesikh on Sham El-Nessim.', en))).toEqual([]);
  });
  it('capitals: sentence start, the pronoun I, a name in lower case', () => {
    const r = englishSpelling('last summer i went to cairo. we swim. i\'m happy.', en);
    expect(r.capitals.map((c) => [c.word, c.kind])).toEqual([['last', 'sentence_start'], ['i', 'pronoun_i'], ['cairo', 'proper_noun'], ['we', 'sentence_start'], ["i'm", 'pronoun_i']]);
    expect(r.errorSentences).toBe(3);
  });
  it('a new line or "e.g." is not a sentence end for the capital check', () => {
    expect(englishSpelling('Dear Ali,\ncome to my party, e.g. at six.', en).capitals).toEqual([]);
    expect(sentenceSpans('Hi. 3.5 kg is a lot! Ok')).toHaveLength(3);
  });
});

describe('Arabic spelling', () => {
  it('hamza, taa marbuta and alef maqsura variants are named, with the corrected form', () => {
    const r = arabicSpelling('اكلت في المدرسه ثم ذهبت الى البيت فى المساء.', ar);
    expect(r.misspelled.map((m) => [m.word, m.kind, m.fix])).toEqual([['اكلت', 'hamza', 'أكلت'], ['المدرسه', 'taa_marbuta', 'المدرسة'], ['الى', 'hamza', 'إلى'], ['فى', 'alef_maqsura', 'في']]);
    expect(r.misspelled.every((m) => m.certain)).toBe(true);
    expect(arabicVariants('المدرسه').map((v) => v.form)).toContain('المدرسة');
    // The article's alef never takes a hamza.
    expect(arabicVariants('الكتاب').some((v) => v.form.startsWith('أل') || v.form.startsWith('إل'))).toBe(false);
  });
  it('with and without diacritics; tatweel ignored', () => {
    expect(words(arabicSpelling('ذَهَبْتُ إِلَى المَدْرَسَةِ صَبَاحًا.', ar))).toEqual([]);
    expect(words(arabicSpelling('ذهبت إلى المدرسـة صباحا.', ar))).toEqual([]);
    expect(arabicSpelling('ذَهَبْتُ إِلَى المَدْرَسَه.', ar).misspelled.map((m) => m.kind)).toEqual(['taa_marbuta']);
  });
  it('guards: words from the question, Latin words, numbers, one-letter words, colloquial words (not spelling), quotes', () => {
    expect(words(arabicSpelling('زرت قايتبايه الجميلة.', ar, { stem: 'صف زيارتك إلى قايتبايه.' }))).toEqual([]);
    expect(words(arabicSpelling('أحب لعبة football و PlayStation كثيرا ١٢٣ 45.', ar))).toEqual([]);
    expect(words(arabicSpelling('انا مش عايز اروح عشان تعبان.', ar))).toEqual(['انا']);
    expect(words(arabicSpelling('قال المعلم «اكلت» ثم سكت.', ar))).toEqual([]);
  });
  it('a word the dictionary does not know at all (a name, a loanword) is reported but not certain', () => {
    const r = arabicSpelling('ركبنا الأتوبيسات إلى زوزوفيا.', ar);
    expect(r.misspelled.length).toBeGreaterThan(0);
    expect(r.misspelled.every((m) => !m.certain)).toBe(true);
    expect(r.certainErrors).toBe(0);
    expect(r.clean).toBe(false);
  });
});

describe('colloquial Arabic: a finding, never spelling', () => {
  it('listed words and بـ/هـ verb forms; real words that look alike are not colloquial', () => {
    for (const w of ['عشان', 'مش', 'ده', 'دي', 'دلوقتي', 'بتاعي', 'ازاي', 'فين', 'ليه', 'كده', 'عايز', 'عايزة', 'اللي', 'ومش', 'بيلعب', 'هنروح', 'بنروح']) expect(colloquialWord(w, ar), w).toBe(true);
    for (const w of ['بيت', 'بنات', 'هيئة', 'ذلك', 'لأن', 'يلعب', 'هذا', 'مدرسة']) expect(colloquialWord(w, ar), w).toBe(false);
  });
  it('counts words and sentences; quotes and question words are left out', () => {
    const d = dialectReport('انا مش عايز اروح. الجو حلو. قال "ده كويس".', ar);
    expect(d.colloquial.map((c) => c.word)).toEqual(['مش', 'عايز']);
    expect(d.colloquialSentences).toBe(1);
    expect(dialectReport('اكتب عن كده.', ar, { stem: 'لماذا نقول كده؟' }).colloquial).toEqual([]);
    expect(withoutQuotes('a «b» c')).toBe('a     c');
  });
});

describe('mechanics by code: only far from the level boundaries', () => {
  const report = (lang: 'en' | 'ar', t: string) => spellingReport(lang, t, lang === 'en' ? en : ar)!;
  it('short answer: easy to read → 1; many errors → not decided', () => {
    expect(mechanicsDecision('short_answer', report('en', 'There are five people in my family.'))).toMatchObject({ points: 1 });
    expect(mechanicsDecision('short_answer', report('en', 'i wnet to scool wiht my frend'))).toBeNull();
    expect(mechanicsDecision('short_answer', report('ar', 'السد العالى ده حاجه كبيره اوى فى اسوان'))).toBeNull();
  });
  it('essay: at most one error in one sentence → 2, with the words as evidence', () => {
    const t = 'Last summer I went to Hurghada with my family. We stayed in a hotel near the beach. Every day we swam in the sea and saw beautifull fish. One day we went on a boat trip. It was the best holiday ever.';
    const m = mechanicsDecision('essay', report('en', t));
    expect(m).toMatchObject({ points: 2 });
    expect(m!.evidence).toContain('beautifull');
  });
  it('essay: errors in most sentences, every word recognisable → 1', () => {
    const m = mechanicsDecision('essay', report('en', 'last summer i go to alex with my family. we swim in the sea. it is very good. i eat fish.'));
    expect(m).toMatchObject({ points: 1 });
    expect(m!.reason).toMatch(/several sentences/);
    expect(mechanicsDecision('essay', report('ar', 'انا بحب القطه. القطه بتاعتي اسمها مشمش. هي بيضا و حلوه. انا بلعب معاها.'))).toMatchObject({ points: 1 });
  });
  it('not decided: an uncertain word, a short essay, no final stop (English), errors in a few sentences', () => {
    expect(mechanicsDecision('essay', report('ar', 'زرنا مدينة الإسكندرية في الصيف الماضي مع أسرتي وركبنا الأتوبيسات إلى زوزوفيا. كان البحر جميلا جدا والجو لطيفا. أتمنى أن أزورها مرة أخرى مع أصدقائي في العام القادم إن شاء الله.'))).toBeNull();
    expect(mechanicsDecision('essay', report('en', 'My house is big. I love my house.'))).toBeNull();
    expect(mechanicsDecision('essay', report('en', 'Every day I wake up at six. Then I wear my uniform and eat breakfast. I go to school by bus at seven. After school I eat lunch and do my homework. I sleep at eleven'))).toBeNull();
  });
});

describe('runRules: spelling for language items; findings only elsewhere; never for spoken answers', () => {
  const crit = (item: OpenItem) => rubricFor(item.domain, item.type, item.language, { points: item.points, units: item.units, spoken: item.spoken === true })!.criteria.map((c) => ({ id: c.id, maxPoints: c.maxPoints }));
  const essayEn: OpenItem = { questionId: 'e1', stem: 'Write about your last holiday (4-6 sentences).', type: 'essay', domain: 'language', language: 'en' };
  const text = 'last summer i go to alex with my family. we swim in the sea. it is very good. i eat fish.';
  it('an English essay: mechanics decided with its evidence, the findings for the model, error codes', () => {
    const r = runRules(essayEn, text, crit(essayEn));
    expect(r.decided.mechanics).toMatchObject({ points: 1, ruleId: 'mechanics_spelling' });
    expect(r.decided.mechanics.evidence).toContain('i → I');
    expect(r.findings.find((f) => f.ruleId === 'capitalisation')).toMatchObject({ criterion: 'mechanics', evidence: expect.stringContaining('Code found') });
    expect(r.errorCodes).toEqual(['capitalisation']);
    expect(Object.keys(r.decided)).toEqual(['mechanics']);
  });
  it('an Arabic essay: hamza codes, the colloquial finding for grammar_accuracy (never decided)', () => {
    const item: OpenItem = { questionId: 'e2', stem: 'اكتب عن حيوانك المفضل.', type: 'essay', domain: 'language', language: 'ar' };
    const r = runRules(item, 'انا بحب القطه. القطه بتاعتي اسمها مشمش. هي بيضا و حلوه. انا بلعب معاها.', crit(item));
    expect(r.errorCodes?.sort()).toEqual(['hamza_spelling', 'spelling']);
    expect(r.findings.find((f) => f.ruleId === 'colloquial')).toMatchObject({ criterion: 'grammar_accuracy', evidence: expect.stringContaining('بتاعتي') });
    expect(r.decided.grammar_accuracy).toBeUndefined();
    expect(r.findings.find((f) => f.ruleId === 'spelling')!.evidence).toMatch(/القطه → القطة \(taa marbuta/);
  });
  it('a spoken answer is never spelling-checked', () => {
    const spoken: OpenItem = { ...essayEn, spoken: true };
    const r = runRules(spoken, text, crit(spoken));
    expect(r.findings.some((f) => f.ruleId === 'spelling' || f.ruleId === 'capitalisation')).toBe(false);
    expect(r.decided.mechanics).toBeUndefined();
    expect(r.errorCodes).toBeUndefined();
  });
  it('science: spelling findings without a criterion, no decision, no error code', () => {
    const sci: OpenItem = { questionId: 's1', stem: 'Why do plants need light?', type: 'short_answer', domain: 'science', language: 'en', points: ['Plants make food by photosynthesis', 'Light gives the energy'] };
    const r = runRules(sci, 'Plants need light becuase it gives energy.', crit(sci));
    expect(r.findings.find((f) => f.ruleId === 'spelling')).toEqual({ ruleId: 'spelling', value: 1, evidence: expect.stringContaining('becuase') });
    expect(r.errorCodes).toBeUndefined();
  });
  it('no dictionary (files missing): no spelling finding and no decision', () => {
    const r = runRules(essayEn, text, crit(essayEn), 'en', { spell: () => null });
    expect(r.decided).toEqual({});
    expect(r.findings.some((f) => f.ruleId === 'spelling' || f.ruleId === 'capitalisation')).toBe(false);
  });
});
