// liveRolePlay (live tutor upgrade item 4, owner go 27 Nov 2026): role-play scenes for the live tutor and the text tutor.
// The scenes come from a fixed bank in code (roleplaySceneData.ts); the model never invents a scene. Children under 13 get a
// separate fixed safe list built from Pre A1 Starters words. This module holds the types, the bank and its checker; the engine
// that picks a scene and runs it is added separately (behind ENARA_ENGINE_V2 `liveRolePlay`, named-only, off by default).
import { RULE_BANK_BY_ID } from './ruleBank';
import { INTERESTS } from '../models/LearnerMemory';
import { inList } from './kidsPack';
import { SCENES, CHILD_SCENES } from './roleplaySceneData';

export const ROLEPLAY_BANK_VERSION = 'rp-v1';
export type SceneCefr = 'preA1' | 'A1' | 'A2' | 'B1';
export type SceneAgeBand = 'child' | 'teen' | 'adult';
export type SceneInterest = (typeof INTERESTS)[number];
/** Every text is given in English and in formal Arabic (fusha). */
export interface Bi { en: string; ar: string }
export interface SceneBeat {
  /** The character's line at this beat (fixed; the model voices it in character). */
  say: Bi;
  /** What the learner should do at this beat (for the model, the help line and the scene card). */
  learner: Bi;
  /** One thing the learner could say (given only as help after a failed try). */
  example: Bi;
}
export interface RolePlayScene {
  id: string;
  /** 'child': the fixed safe list for under-13s; 'adult': teens and adults. */
  kind: 'adult' | 'child';
  cefr: SceneCefr;
  ages: SceneAgeBand[];
  interests: SceneInterest[];
  title: Bi;
  setting: Bi;
  character: Bi;
  /** The learner's goal in the scene (shown on the scene card). */
  goal: Bi;
  /** The target outcomes: rule-bank ids (ruleBank.ts). The debrief's rule line and right/wrong pair come from these entries. */
  targets: string[];
  /** Key words of the scene (English). For child scenes every word is a Starters word. */
  words: string[];
  /** 6-10 fixed beats. */
  beats: SceneBeat[];
  /** The end condition: when the scene is over (after the last beat, or earlier when the learner asks to stop). */
  end: Bi;
}

export const MIN_BEATS = 6;
export const MAX_BEATS = 10;
export const CEFR_ORDER: SceneCefr[] = ['preA1', 'A1', 'A2', 'B1'];
/** Settings that never appear in a child scene. */
export const CHILD_BANNED = /\b(doctor|dentist|hospital|clinic|medicine|pill|nurse|ill|sick|hurt|injur\w*|blood|police|stranger|money|pounds?|price|pay|interview)\b/i;
/** A free topic: an open invitation to talk about anything (never in a child scene). */
export const FREE_TOPIC = /\b(tell me about (yourself|your (life|family|day|home))|anything you (want|like)|whatever you (want|like)|what do you want to talk about|any topic|free topic)\b/i;
/** Personal details the tutor never asks for, in any scene. */
export const PERSONAL_DETAILS = /\b(your (real )?(address|phone( number)?|mobile|email|surname|family name|school'?s? name|password)|where do you live|how old are you|what is your (real )?name|what'?s your name)\b/i;
/** Egyptian colloquial forms that are not fusha (the Arabic texts are formal Arabic). */
export const NOT_FUSHA = /(^|[\s،.!؟])(عايز|عايزة|عاوز|عاوزة|إزاي|ازاي|دلوقتي|كده|كدا|بتاع|بتاعت|مش|إيه|ايه|فين|ده|دي|دول|عشان|علشان|اللي|لسه|خالص|أوي|اوي|بقى|يعني|ماشي|طب|برضه|هنا كده|أهو|اهو)(?=$|[\s،.!؟])/;
const ARABIC = /[؀-ۿ]/;
const words = (t: string) => t.split(/[\s/,.!?;:"()]+/).map((w) => w.trim()).filter(Boolean);

export const ALL_SCENES: RolePlayScene[] = [...SCENES, ...CHILD_SCENES];
export const SCENE_BY_ID = new Map(ALL_SCENES.map((s) => [s.id, s]));
export const sceneById = (id?: string | null): RolePlayScene | undefined => (id ? SCENE_BY_ID.get(id) : undefined);
export { SCENES, CHILD_SCENES };

/** Every English text of a scene that the learner sees or hears (card, beats, examples). */
export function sceneEnglish(s: RolePlayScene): string[] {
  return [s.title.en, s.setting.en, s.character.en, s.goal.en, ...s.beats.flatMap((b) => [b.say.en, b.learner.en, b.example.en])];
}
const allBi = (s: RolePlayScene): [string, Bi][] => [['title', s.title], ['setting', s.setting], ['character', s.character], ['goal', s.goal], ['end', s.end], ...s.beats.flatMap((b, i) => [[`beat ${i + 1} say`, b.say], [`beat ${i + 1} learner`, b.learner], [`beat ${i + 1} example`, b.example]] as [string, Bi][])];

/** The Starters words a child scene may use: the Starters list (with its names and numbers), checked with kidsPack's base-form rule. */
export type ChildWordList = Set<string>;

/** Static checks of one scene. `childWords` (the Starters tokens) is needed for child scenes. Returns problems; [] = valid. */
export function checkScene(s: RolePlayScene, childWords?: ChildWordList): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) out.push('id is not lower-case-with-dashes');
  if (!CEFR_ORDER.includes(s.cefr)) out.push(`unknown CEFR band ${s.cefr}`);
  if (!s.ages.length || s.ages.some((a) => !['child', 'teen', 'adult'].includes(a))) out.push('age bands missing or unknown');
  if (!s.interests.length) out.push('no interest tag');
  for (const t of s.interests) if (!(INTERESTS as readonly string[]).includes(t)) out.push(`interest "${t}" is not in INTERESTS`);
  if (!s.targets.length) out.push('no target outcome');
  for (const t of s.targets) if (!RULE_BANK_BY_ID.has(t)) out.push(`target "${t}" is not a rule-bank id`);
  if (s.beats.length < MIN_BEATS || s.beats.length > MAX_BEATS) out.push(`${s.beats.length} beats (${MIN_BEATS}-${MAX_BEATS})`);
  if (!s.words.length) out.push('no allowed words');
  for (const [where, bi] of allBi(s)) {
    if (!bi.en?.trim() || !bi.ar?.trim()) { out.push(`${where}: English or Arabic missing`); continue; }
    if (ARABIC.test(bi.en)) out.push(`${where}: Arabic script in the English text`);
    if (!ARABIC.test(bi.ar)) out.push(`${where}: the Arabic text has no Arabic`);
    const nf = NOT_FUSHA.exec(bi.ar);
    if (nf) out.push(`${where}: "${nf[2]}" is colloquial, not fusha`);
  }
  for (const t of sceneEnglish(s)) {
    if (PERSONAL_DETAILS.test(t)) out.push(`asks for personal details: "${t}"`);
  }
  if (s.kind === 'child') {
    if (s.ages.length !== 1 || s.ages[0] !== 'child') out.push('a child scene is for the child band only');
    if (!['preA1', 'A1'].includes(s.cefr)) out.push('a child scene is Pre A1 or A1');
    for (const t of [...sceneEnglish(s), s.id.replace(/-/g, ' ')]) {
      if (CHILD_BANNED.test(t)) out.push(`not allowed in a child scene: "${t}"`);
      if (FREE_TOPIC.test(t)) out.push(`free topic in a child scene: "${t}"`);
    }
    for (const b of s.beats) for (const line of [b.say.en, b.example.en]) {
      const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length > 3) out.push(`child line has ${sentences.length} sentences (max 3): "${line}"`);
      for (const x of sentences) if (words(x).length > 10) out.push(`child sentence over 10 words: "${x}"`);
    }
    if (!childWords) out.push('no Starters word list to check a child scene against');
    else {
      const allowed = new Set([...childWords]);
      for (const w of s.words) for (const p of w.split(/\s+/)) if (!inList(p, childWords)) out.push(`allowed word "${p}" is not a Starters word`);
      for (const t of sceneEnglish(s)) for (const w of words(t)) if (!inList(w, allowed)) out.push(`"${w}" is not a Starters word ("${t}")`);
    }
  } else if (s.ages.includes('child')) out.push('a teen/adult scene may not be given to children');
  return out;
}

/** The whole bank: every scene valid, ids unique, a child list and an adult list, at least one scene per CEFR band A1-B1. */
export function checkSceneBank(scenes: RolePlayScene[], childWords?: ChildWordList): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scenes) {
    if (seen.has(s.id)) out.push(`duplicate id ${s.id}`);
    seen.add(s.id);
    for (const p of checkScene(s, childWords)) out.push(`${s.id}: ${p}`);
  }
  if (!scenes.some((s) => s.kind === 'child')) out.push('no child scene');
  for (const band of ['A1', 'A2', 'B1'] as SceneCefr[]) if (!scenes.some((s) => s.kind === 'adult' && s.cefr === band)) out.push(`no teen/adult scene at ${band}`);
  return out;
}
