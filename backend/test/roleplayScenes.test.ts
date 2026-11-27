import { describe, expect, it } from 'vitest';
import { ALL_SCENES, CHILD_SCENES, SCENES, checkScene, checkSceneBank, sceneById, MIN_BEATS, MAX_BEATS, type RolePlayScene } from '../src/services/roleplayScenes';
import { loadKidsPack, starterTokens } from '../src/services/kidsPack';
import { RULE_BANK_BY_ID } from '../src/services/ruleBank';
import { INTERESTS } from '../src/models/LearnerMemory';

// liveRolePlay PR 1 (live tutor upgrade item 4): the scene bank and its checker. Data only: nothing here changes the tutor.
const pack = loadKidsPack()!;
const childWords = starterTokens(pack.words, [...pack.numbers, ...pack.names]);
const clone = (s: RolePlayScene): RolePlayScene => JSON.parse(JSON.stringify(s));

describe('role-play scene bank', () => {
  it('every scene is valid (outcome ids exist, 6-10 beats, EN + fusha AR, interest tags from INTERESTS, child words)', () => {
    expect(pack).toBeTruthy();
    expect(checkSceneBank(ALL_SCENES, childWords)).toEqual([]);
  });

  it('covers the plan settings (shop, airport, doctor, school office, restaurant) and every band A1-B1 for teens and adults', () => {
    const ids = SCENES.map((s) => s.id);
    for (const id of ['shop-clothes', 'airport-checkin', 'doctor-visit', 'school-office', 'restaurant-order']) expect(ids).toContain(id);
    for (const band of ['A1', 'A2', 'B1']) expect(SCENES.some((s) => s.cefr === band)).toBe(true);
    expect(SCENES.length).toBeGreaterThanOrEqual(10);
    for (const s of ALL_SCENES) {
      expect(s.beats.length).toBeGreaterThanOrEqual(MIN_BEATS);
      expect(s.beats.length).toBeLessThanOrEqual(MAX_BEATS);
      for (const t of s.targets) expect(RULE_BANK_BY_ID.has(t)).toBe(true);
      for (const i of s.interests) expect(INTERESTS as readonly string[]).toContain(i);
    }
    expect(sceneById('doctor-visit')?.character.en).toMatch(/doctor/i);
    expect(sceneById('nope')).toBeUndefined();
  });

  it('children under 13 get a separate fixed safe list: no doctor scene, no free topic, Starters words only', () => {
    expect(CHILD_SCENES.length).toBeGreaterThanOrEqual(6);
    for (const s of CHILD_SCENES) {
      expect(s.kind).toBe('child');
      expect(s.ages).toEqual(['child']);
      expect(['preA1', 'A1']).toContain(s.cefr);
      expect(JSON.stringify(s)).not.toMatch(/doctor|clinic|medicine/i);
    }
    for (const s of SCENES) expect(s.ages).not.toContain('child');
  });

  it('the checker catches a bad scene', () => {
    const s = clone(SCENES[0]);
    s.targets = ['EN-F-XX-not-a-rule'];
    s.beats = s.beats.slice(0, 3);
    s.interests = ['knitting' as never];
    s.title = { en: 'Shop', ar: '' };
    s.beats[0].say.ar = 'أنا عايز سترة';
    s.beats[1].say.en = 'Where do you live?';
    const p = checkScene(s);
    expect(p).toEqual(expect.arrayContaining([
      'target "EN-F-XX-not-a-rule" is not a rule-bank id',
      '3 beats (6-10)',
      'interest "knitting" is not in INTERESTS',
      'title: English or Arabic missing',
      'beat 1 say: "عايز" is colloquial, not fusha',
      'asks for personal details: "Where do you live?"',
    ]));
  });

  it('the checker catches a child scene with a doctor, a free topic or a non-Starters word', () => {
    const s = clone(CHILD_SCENES[0]);
    s.beats[0].say.en = 'Hello! Tell me about yourself.';
    s.beats[1].say.en = 'The doctor has a banana.';
    s.beats[2].example.en = 'I would like a pomegranate, please.';
    s.words = [...s.words, 'pomegranate'];
    const p = checkScene(s, childWords);
    expect(p.some((x) => x.startsWith('free topic in a child scene'))).toBe(true);
    expect(p.some((x) => x.startsWith('not allowed in a child scene') && x.includes('doctor'))).toBe(true);
    expect(p).toContain('"pomegranate" is not a Starters word ("I would like a pomegranate, please.")');
    expect(p).toContain('allowed word "pomegranate" is not a Starters word');
    // without the word list a child scene is never passed
    expect(checkScene(CHILD_SCENES[0])).toContain('no Starters word list to check a child scene against');
  });

  it('an adult scene may not be given to children; a child scene stays in the child band', () => {
    const a = clone(SCENES[0]); a.ages = ['child', 'adult'];
    expect(checkScene(a)).toContain('a teen/adult scene may not be given to children');
    const c = clone(CHILD_SCENES[0]); c.ages = ['child', 'teen']; c.cefr = 'A2';
    const p = checkScene(c, childWords);
    expect(p).toContain('a child scene is for the child band only');
    expect(p).toContain('a child scene is Pre A1 or A1');
  });

  it('the bank checker catches duplicate ids and a missing band', () => {
    const p = checkSceneBank([SCENES[0], SCENES[0]], childWords);
    expect(p).toContain(`duplicate id ${SCENES[0].id}`);
    expect(p).toContain('no child scene');
  });
});
