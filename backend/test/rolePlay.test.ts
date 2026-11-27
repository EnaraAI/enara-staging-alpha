import { afterEach, describe, expect, it } from 'vitest';
import { rolePlayStep, pickScene, eligibleScenes, mayOffer, classifyBeatReply, detectSceneError, debriefEntry, rolePlayLine, sceneReplyProblems, hardSceneProblems, lessonTargets, sceneFallback, ensureDebrief, ensureOffer, sceneCard, asksForRolePlay, saysYes, ROLEPLAY_OFFER_FROM, type RolePlayTurn } from '../src/services/rolePlay';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { sceneById, CHILD_SCENES, SCENES } from '../src/services/roleplayScenes';
import { engineV2 } from '../src/services/engineV2';

// liveRolePlay PR 2 (live tutor upgrade item 4): the engine. Pure parts; the end-to-end path through the live call is in rolePlayLive.test.ts.
const u = (content = 'x') => ({ role: 'user', content });
const a = (rolePlay?: object) => ({ role: 'assistant', content: 'y', languageTurn: rolePlay ? { rolePlay } : {} });
const none = {} as const;
const restaurant = sceneById('restaurant-order')!;
const pickRestaurant = () => restaurant;
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
const on = () => { process.env.ENARA_ENGINE_V2 = 'liveRolePlay'; };

describe('liveRolePlay switch', () => {
  it('is named-only: off by default and not in "all"', async () => {
    expect(engineV2('liveRolePlay')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(engineV2('liveRolePlay')).toBe(false);
    expect(await rolePlayStep({ history: [u(), a()], message: 'can we do a role play?', signals: none, blocked: false, pick: pickRestaurant })).toBeUndefined();
    on(); expect(engineV2('liveRolePlay')).toBe(true);
  });
});

describe('starting a scene', () => {
  it('the learner asks (English or Arabic): the scene starts at beat 1', async () => {
    on();
    for (const m of ['Can we do a role-play?', "Let's pretend we are in a restaurant", 'ممكن نعمل لعب أدوار؟', 'I want to practise a real conversation']) {
      expect(asksForRolePlay(m)).toBe(true);
      expect(await rolePlayStep({ history: [u(), a()], message: m, signals: none, blocked: false, pick: pickRestaurant })).toEqual({ scene: 'restaurant-order', phase: 'beat', beat: 1, tries: 0, via: 'ask', errs: [] });
    }
    expect(asksForRolePlay('I play football on Fridays')).toBe(false);
  });

  it('OFFER RULE: only after the offer threshold, right after a right answer with no struggle, once per session', () => {
    const six = Array.from({ length: ROLEPLAY_OFFER_FROM }, () => [u(), a()]).flat();
    const right = { answeringCheck: true, keyVerdict: 'CORRECT' };
    expect(ROLEPLAY_OFFER_FROM).toBe(6);
    expect(mayOffer({ history: six, signals: right, blocked: false })).toBe(true);
    expect(mayOffer({ history: six.slice(2), signals: right, blocked: false })).toBe(false);
    expect(mayOffer({ history: six, signals: { answeringCheck: true, keyVerdict: 'INCORRECT' }, blocked: false })).toBe(false);
    expect(mayOffer({ history: six, signals: { answeringCheck: false }, blocked: false })).toBe(false);
    expect(mayOffer({ history: six, signals: { ...right, genuineFailedAttempts: 1 }, blocked: false })).toBe(false);
    expect(mayOffer({ history: six, signals: { ...right, confusionCount: 1 }, blocked: false })).toBe(false);
    expect(mayOffer({ history: six, signals: right, blocked: true })).toBe(false);
    expect(mayOffer({ history: [...six, a({ scene: 'x', phase: 'declined' })], signals: right, blocked: false })).toBe(false);
  });

  it('an offer, then yes starts the scene; anything else declines it (no second offer)', async () => {
    on();
    const six = Array.from({ length: 6 }, () => [u(), a()]).flat();
    const offer = await rolePlayStep({ history: six, message: 'goes', signals: { answeringCheck: true, keyVerdict: 'CORRECT' }, blocked: false, pick: pickRestaurant });
    expect(offer).toEqual({ scene: 'restaurant-order', phase: 'offer' });
    const h = [...six, u('goes'), a({ scene: 'restaurant-order', phase: 'offer' })];
    expect(saysYes('Yes, sure!')).toBe(true); expect(saysYes('أيوه')).toBe(true); expect(saysYes('no thanks')).toBe(false);
    expect(await rolePlayStep({ history: h, message: 'Yes, sure!', signals: none, blocked: false, pick: pickRestaurant })).toMatchObject({ phase: 'beat', beat: 1, via: 'offer' });
    expect(await rolePlayStep({ history: h, message: 'Not now, more exercises please', signals: none, blocked: false, pick: pickRestaurant })).toEqual({ scene: 'restaurant-order', phase: 'declined' });
    // carried: never offered again
    const after = await rolePlayStep({ history: [...h, u('no'), a({ scene: 'restaurant-order', phase: 'declined' })], message: 'goes', signals: { answeringCheck: true, keyVerdict: 'CORRECT' }, blocked: false, pick: pickRestaurant });
    expect(after).toEqual({ scene: 'restaurant-order', phase: 'declined' });
  });

  it('blocked turns (review, quick check, hints only) never start a scene, but a running scene goes on', async () => {
    on();
    expect(await rolePlayStep({ history: [u(), a()], message: 'role play please', signals: none, blocked: true, pick: pickRestaurant })).toBeUndefined();
    expect(await rolePlayStep({ history: [u(), a({ scene: 'restaurant-order', phase: 'beat', beat: 2, tries: 0, errs: [] })], message: 'Can I have some water, please?', signals: none, blocked: true, pick: pickRestaurant })).toMatchObject({ phase: 'beat', beat: 3 });
  });
});

describe('beats, failed tries and the end', () => {
  const at = (beat: number, tries = 0, errs: string[] = []) => [u(), a({ scene: 'restaurant-order', phase: 'beat', beat, tries, errs, via: 'ask' })];
  it('each answer moves one beat on; after the last beat comes the debrief', async () => {
    on();
    expect(await rolePlayStep({ history: at(3), message: 'I would like the chicken, please.', signals: none, blocked: false, pick: pickRestaurant })).toMatchObject({ phase: 'beat', beat: 4, tries: 0 });
    expect(await rolePlayStep({ history: at(restaurant.beats.length), message: 'Thank you. Goodbye.', signals: none, blocked: false, pick: pickRestaurant })).toMatchObject({ phase: 'debrief' });
    expect(await rolePlayStep({ history: at(3), message: 'stop please', signals: none, blocked: false, pick: pickRestaurant })).toMatchObject({ phase: 'debrief' });
  });
  it('a failed try changes the method: first a simpler line with a choice, then the line said for them and the scene moves on (never a third try)', async () => {
    on();
    const t1 = await rolePlayStep({ history: at(3), message: "I don't know", signals: { dontKnow: true }, blocked: false, pick: pickRestaurant });
    expect(t1).toMatchObject({ phase: 'beat', beat: 3, tries: 1, help: 'hint' });
    const t2 = await rolePlayStep({ history: at(3, 1), message: '...', signals: none, blocked: false, pick: pickRestaurant });
    expect(t2).toMatchObject({ phase: 'beat', beat: 4, tries: 0, help: 'model' });
    expect(classifyBeatReply('ما فهمتش', none)).toBe('stuck');
    expect(classifyBeatReply('Rice, please.', none)).toBe('ok');
    expect(classifyBeatReply('?', none)).toBe('stuck');
  });
  it('an error in the learner message is detected by code, recast in the next line and kept for the debrief', async () => {
    on();
    const t = await rolePlayStep({ history: at(5, 0, ['copula_omitted']), message: 'The food very good.', signals: none, blocked: false, pick: pickRestaurant }) as RolePlayTurn;
    expect(t.error).toMatchObject({ code: 'copula_omitted', outcome: 'EN-F-A1-GR-copula-be' });
    expect(t.errs).toEqual(['copula_omitted', 'copula_omitted']);
    const line = rolePlayLine({ ...t });
    expect(line).toMatch(/recast/); expect(line).toMatch(/never say "wrong"/);
    expect(detectSceneError('She like pizza.')).toMatchObject({ code: 'missing_third_person_s', outcome: 'EN-F-A2-GR-third-person-s' });
    expect(detectSceneError('Does she like pizza?')).toBeNull();
    expect(detectSceneError('I would like the chicken, please.')).toBeNull();
  });
});

describe('scene choice (code, not the model)', () => {
  it('children get only the child list; teens never the adult-only scene; level and interests decide; recent scenes are avoided', () => {
    for (let i = 0; i < 20; i += 1) expect(CHILD_SCENES).toContain(pickScene({ child: true, ageBand: 'child', level: 'A1', seed: String(i), ask: 'a role play at the doctor' }));
    expect(eligibleScenes({ child: false, ageBand: 'teen', level: 'B1' }).map((s) => s.id)).not.toContain('job-interview');
    expect(eligibleScenes({ child: false, ageBand: 'adult', level: 'B1' }).map((s) => s.id)).toContain('job-interview');
    expect(eligibleScenes({ child: false, ageBand: 'adult', level: 'A1' }).every((s) => s.cefr === 'A1')).toBe(true);
    expect(eligibleScenes({ child: true, level: 'Pre-A1' }).every((s) => s.cefr === 'preA1')).toBe(true);
    expect(pickScene({ child: false, ageBand: 'adult', level: 'A1', interests: ['cooking'], seed: 's' }).id).toBe('restaurant-order');
    expect(pickScene({ child: false, ageBand: 'adult', level: 'A1', interests: ['cooking'], recent: ['restaurant-order'], seed: 's' }).id).not.toBe('restaurant-order');
    expect(pickScene({ child: false, ageBand: 'adult', level: 'A2', ask: "let's role-play at the airport", seed: 's' }).id).toBe('airport-checkin');
    // the same inputs give the same scene
    expect(pickScene({ child: false, ageBand: 'teen', level: 'A2', seed: 'k' }).id).toBe(pickScene({ child: false, ageBand: 'teen', level: 'A2', seed: 'k' }).id);
  });
});

describe('today\'s lesson point (its own words)', () => {
  it('a scene that practises it scores higher; the debrief falls back to it; the beat line asks for recasts on it', () => {
    expect(lessonTargets('Jobs and the verb be; be: am/is/are; Uses a/an before a job')).toEqual(expect.arrayContaining(['EN-F-A1-GR-copula-be', 'EN-F-A1-GR-article-a-an']));
    expect(lessonTargets('Last holiday (past simple)')).toEqual(expect.arrayContaining(['EN-F-A2-GR-past-simple-regular', 'EN-F-A2-GR-past-simple-irregular']));
    expect(pickScene({ child: false, ageBand: 'adult', level: 'B1', lessonText: 'Last holiday (past simple)', seed: 's' }).targets.some((t) => /past-simple/.test(t))).toBe(true);
    expect(debriefEntry(sceneById('airport-checkin')!, [], undefined, 'Last holiday (past simple)')?.id).toMatch(/past-simple/);
    expect(rolePlayLine({ scene: 'restaurant-order', phase: 'beat', beat: 3, tries: 0, lessonPoint: 'Daily routines (he/she -s)' })).toMatch(/Today's lesson point is Daily routines \(he\/she -s\): when their message has an error on it, always recast it/);
  });
});

describe('the model only voices the current beat; post-check keeps it in the scene', () => {
  const beat = (n: number, extra: Partial<RolePlayTurn> = {}): RolePlayTurn => ({ scene: 'restaurant-order', phase: 'beat', beat: n, tries: 0, errs: [], ...extra });
  it('the system line gives the fixed line of this beat only', () => {
    const line = rolePlayLine(beat(2));
    expect(line).toContain('beat 2 of 8');
    expect(line).toContain(restaurant.beats[1].say.en);
    expect(line).not.toContain(restaurant.beats[2].say.en);
    expect(line).toMatch(/Do not add new events, places, people or topics/);
    expect(rolePlayLine(beat(1))).toMatch(/Start the scene/);
  });
  it('flags teaching talk, personal details, Arabic, length, a missing scene line; child replies outside the Starters words', () => {
    expect(sceneReplyProblems(beat(2), 'Here is the menu. Would you like something to drink?')).toEqual([]);
    expect(sceneReplyProblems(beat(2), 'Good grammar! The rule is: use some. Here is the menu. Would you like a drink?')[0]).toMatch(/teaching talk/);
    expect(hardSceneProblems(beat(2), 'Here is the menu. Complete this sentence: I would like ___.')[0]).toMatch(/lesson task/);
    expect(hardSceneProblems(beat(2), 'Good grammar! Here is the menu. Would you like a drink?')).toEqual([]);
    expect(sceneReplyProblems(beat(2), 'Here is the menu. What is your phone number? Would you like a drink?')).toContain('asks for personal details');
    expect(sceneReplyProblems(beat(2), 'Let us talk about football and your favourite team today instead.')).toContain('does not voice the scene line');
    const kid: RolePlayTurn = { scene: 'kids-fruit-shop', phase: 'beat', beat: 2, tries: 0, errs: [], child: true };
    expect(sceneReplyProblems(kid, 'What would you like?')).toEqual([]);
    expect(sceneReplyProblems(kid, 'What would you like? We have pomegranates, persimmons and kumquats.')[0]).toMatch(/young learner/);
    // a word that is in the beat's own line is fine ("Well done!" in a child scene)
    expect(sceneReplyProblems({ scene: 'kids-lost-pencil', phase: 'beat', beat: 6, tries: 0, errs: [], child: true }, 'Well done! Goodbye for now!')).toEqual([]);
  });
  it('a reply still off the scene after the regeneration becomes the beat line (shared guards, both channels)', () => {
    process.env.ENARA_ENGINE_V2 = 'liveRolePlay';
    const language = { rolePlay: beat(2), learner: {}, lesson: { spec: {} }, signals: {}, moves: [] } as never;
    // a lesson task in the scene is unusable: the beat's own line
    const g = applyReplyGuards(language, 'Good. Fill in: I would like ___ water.', '');
    expect(g.text).toBe(restaurant.beats[1].say.en);
    expect(g.rolePlayFixed).toBe(true);
    expect(g.postCheck).toEqual(expect.arrayContaining(['roleplay_fallback', 'roleplay_hard:a_lesson_task_inside_the_scene']));
    // only the unusable sentence goes when what is left still voices the scene (the reaction and recast stay)
    const t = applyReplyGuards(language, 'Some water, of course. Here is the menu. Would you like something to drink? Now try again: I would like ___ water.', '');
    expect(t.text).toBe('Some water, of course. Here is the menu. Would you like something to drink?');
    expect(t.postCheck).toContain('roleplay_trimmed');
    // softer problems only asked for the regeneration: the reply stays, the problem is recorded
    const soft = applyReplyGuards(language, 'Let us talk about grammar and football today instead.', '');
    expect(soft.text).toBe('Let us talk about grammar and football today instead.');
    expect(soft.rolePlayFixed).toBeUndefined();
    expect(soft.postCheck).toEqual(expect.arrayContaining(['roleplay_soft:teaching_talk_inside_the_scene', 'roleplay_soft:does_not_voice_the_scene_line']));
    expect(sceneFallback(beat(4, { help: 'model' }))).toBe(`You can say: "${restaurant.beats[2].example.en}" ${restaurant.beats[3].say.en}`);
    expect(sceneFallback(beat(3, { help: 'hint' }))).toContain(restaurant.beats[2].example.en);
  });
});

describe('debrief and offer are guaranteed by code', () => {
  it('debrief: the rule line and right/wrong pair of the error seen most, else the scene target', () => {
    expect(debriefEntry(restaurant, ['copula_omitted', 'article_omitted', 'copula_omitted'])?.id).toBe('EN-F-A1-GR-copula-be');
    expect(debriefEntry(restaurant, [])?.id).toBe(restaurant.targets[0]);
    const t: RolePlayTurn = { scene: 'restaurant-order', phase: 'debrief', entryId: 'EN-F-A1-GR-copula-be' };
    const line = rolePlayLine(t);
    expect(line).toContain('The giraffe is very tall.'); expect(line).toContain('The giraffe very tall.'); expect(line).toMatch(/ONE new practice item/);
    const d = ensureDebrief(t, 'Great job in the restaurant! Now try this: My sister ___ a nurse.');
    expect(d.added).toBe(true);
    expect(d.text).toMatch(/^Great job in the restaurant!\nRule: With no action word/);
    expect(d.text).toContain('Right: The giraffe is very tall. Wrong: The giraffe very tall.');
    expect(d.text).toContain('My sister ___ a nurse.');
    expect(ensureDebrief(t, d.text).added).toBe(false);
    expect(ensureDebrief({ ...t, under9: true }, 'Well done!').text).not.toContain('Wrong:');
  });
  it('offer: the offer question is added when the model left it out', () => {
    const t: RolePlayTurn = { scene: 'restaurant-order', phase: 'offer' };
    expect(ensureOffer(t, 'Yes, "goes" is right.').text).toMatch(/Would you like to try a short role-play\? "Ordering at a restaurant"/);
    expect(ensureOffer(t, 'Right! Shall we try a role-play at a restaurant?').added).toBe(false);
    expect(ensureOffer({ scene: 'kids-zoo', phase: 'offer', child: true }, 'Yes!').text).toMatch(/Do you want to play a game\?/);
  });
  it('the scene card (EN/AR) exists only during the scene', () => {
    const c = sceneCard({ scene: 'airport-checkin', phase: 'beat', beat: 3 })!;
    expect(c).toMatchObject({ id: 'airport-checkin', beat: 3, beats: 8, phase: 'beat' });
    expect(c.goal.ar).toMatch(/[؀-ۿ]/); expect(c.character.en).toMatch(/Omar/);
    expect(sceneCard({ scene: 'airport-checkin', phase: 'after' })).toBeNull();
    expect(sceneCard({ scene: 'airport-checkin', phase: 'offer' })).toBeNull();
    expect(sceneCard(undefined)).toBeNull();
    expect(SCENES.length + CHILD_SCENES.length).toBeGreaterThan(15);
  });
});
