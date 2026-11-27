// liveRolePlay (live tutor upgrade item 4, owner go 27 Nov 2026): role-play lessons, behind ENARA_ENGINE_V2 `liveRolePlay` (named-only, NOT in "all").
// One engine for both channels: it runs inside buildLanguageTeachingContext / applyReplyGuards / completeLanguageTurn, which the live call
// (/api/avatar/query-stream) and the text tutor share. Code decides everything; the model only voices the current beat:
//  - start: the learner asks for a role-play, or the tutor offers one at a fitting point (OFFER RULE below: conservative, once per session);
//  - scene: picked by code from the fixed bank (roleplayScenes.ts) by age band, level, interests and the scenes the learner has not had recently;
//  - beats: each learner reply moves the scene one beat on; a failed try changes the method (simpler line + a choice, then the line said for
//    them and the scene moves on), so a learner never fails three times on one beat with the same method;
//  - errors: a code-detected error in the learner's message is corrected inside the scene by an in-character recast and logged with its code
//    to errors to work on (errorsToWorkOn.recordRolePlayError);
//  - post-check: a reply that leaves the scene (teaching talk, other content, personal details, too long, non-Starters words for a child)
//    gets ONE regeneration with the reason; if it still fails, the beat's fixed line is used;
//  - debrief: the rule line and the right/wrong pair of a rule-bank entry (the error seen most in the scene, else the scene's first target),
//    then one new item.
// English lessons only (the rule bank is English); every scene also has a fusha Arabic version for the scene card and later Arabic lessons.
import { createHash } from 'crypto';
import { engineV2 } from './engineV2';
import { ruleBankEntry, type RuleBankEntry } from './ruleBank';
import { detectL1Transfer } from './languageLearningState';
import { loadKidsPack, starterTokens, inList } from './kidsPack';
import { CHILD_SCENES, SCENES, sceneById, CEFR_ORDER, PERSONAL_DETAILS, type RolePlayScene, type SceneCefr, type Bi } from './roleplayScenes';

export const rolePlayOn = (): boolean => engineV2('liveRolePlay');

/** The stored tag on each tutor reply (codes and ids only, never learner text). */
export interface RolePlayTag {
  scene: string;
  /** offer: the reply offered this scene. beat: the reply voiced beat `beat`. debrief: the reply was the debrief. after / declined: carried on later replies. */
  phase: 'offer' | 'beat' | 'debrief' | 'after' | 'declined';
  beat?: number;
  /** Failed tries on the current beat so far. */
  tries?: number;
  /** Error codes seen in this scene so far (most recent last, at most 8). */
  errs?: string[];
  /** The error code corrected (recast) in this reply. */
  err?: string;
  /** How the learner got in: asked, or accepted an offer. */
  via?: 'ask' | 'offer';
  help?: 'hint' | 'model';
  /** debrief: the scene's last line, said in character first (the last beat flows into the debrief instead of a bare "goodbye"). */
  closing?: boolean;
}
/** This turn's role-play decision (in the language context; never rendered as data, only through the system line). */
export interface RolePlayTurn extends RolePlayTag {
  /** The detected error of the learner's last message (for the recast line and the errors-to-work-on log). */
  error?: { code: string; evidence: string; outcome?: string };
  /** debrief: the rule-bank entry it uses. */
  entryId?: string;
  child?: boolean;
  under9?: boolean;
  /** Today's lesson point in a few words (the lesson's title or grammar), for the recasts inside the scene. */
  lessonPoint?: string;
}

export const ROLEPLAY_OFFER_FROM = 6; // tutor replies already given this session before the tutor may offer a scene
const STOP = /^\s*(?:please\s+)?(?:stop|let'?s stop|i want to stop|end the (?:role[\s-]?play|scene|game)|stop the (?:role[\s-]?play|scene|game)|(?:go )?back to the lesson|enough|no more)\b|^\s*(?:توقف|توقفي|كفى|كفاية|خلاص|أنهِ|انهي|إنهاء|نرجع للدرس|ارجع للدرس|عودة إلى الدرس)/i;
const ASK = /\b(?:role[\s-]?play|roleplay|act (?:it |this |a scene )?out|let'?s pretend|pretend (?:to be|you are|you're|we are|we're|i am|i'm)|practi[sc]e (?:a|an|some) (?:real(?:-life)? )?(?:conversation|dialogue|situation|scene)|(?:a )?real[- ]life (?:situation|conversation|scene))\b|لعب (?:ال)?أدوار|لعب الأدوار|لعب دور|تمثيل (?:دور|مشهد|موقف)|مشهد تمثيلي|موقف حقيقي|رول ?بلاي|نمثل|نمثّل|مثّل معي/i;
const YES = /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|of course|alright|all right|let'?s (?:do it|go|try|play)|why not|good idea|great idea|sounds good|i(?:'d| would) like (?:that|to)|please)\b|^\s*(?:نعم|أيوه|ايوه|أيوا|ايوا|آه|اه|حاضر|تمام|موافق|موافقة|أكيد|اكيد|طيب|بالتأكيد|حسنًا|حسنا)(?=$|[\s!.,،؟?])/i;

/** Scene words the learner may name when asking ("a role-play at the airport"). */
const SCENE_WORDS: Record<string, RegExp> = {
  'shop-clothes': /\b(clothes|jacket|shopping|clothing)\b|ملابس/i,
  'airport-checkin': /\b(airport|flight|check[- ]?in|plane)\b|مطار|طائرة/i,
  'doctor-visit': /\b(doctor|clinic)\b|طبيب|دكتور|عيادة/i,
  'school-office': /\b(school office|new school|timetable)\b|مدرسة/i,
  'restaurant-order': /\b(restaurant|waiter|order(?:ing)? food)\b|مطعم/i,
  'train-tickets': /\b(train|station)\b|قطار|محطة/i,
  'cinema-tickets': /\b(cinema|movie|film)s?\b|سينما|فيلم/i,
  'football-club': /\b(football|club|soccer)\b|كرة القدم|نادي/i,
  'hotel-reception': /\b(hotel|reception)\b|فندق/i,
  'job-interview': /\b(job|interview)\b|مقابلة|وظيفة/i,
  'museum-visit': /\bmuseum\b|متحف/i,
  'pet-shop': /\b(pet|pet shop)\b|حيوانات أليفة/i,
  'kids-fruit-shop': /\bfruit\b|فاكهة/i,
  'kids-lost-pencil': /\bpencil\b|قلم/i,
  'kids-toy-shop': /\btoys?\b|ألعاب|لعبة/i,
  'kids-ice-cream': /\bice[- ]?cream\b|آيس كريم|مثلجات/i,
  'kids-zoo': /\bzoo\b|حديقة الحيوان/i,
  'kids-bookshop': /\b(book|library|bookshop)\b|كتاب|مكتبة/i,
  'kids-park-ball': /\b(park|ball)\b|حديقة|كرة/i,
};

// ------------------------------------------------------------------------------------------------ pure parts (unit-tested)
type H = { role: string; content?: string; languageTurn?: unknown };
export const tagOf = (h: H | undefined): RolePlayTag | undefined => (h?.role === 'assistant' ? ((h.languageTurn as { rolePlay?: RolePlayTag } | null | undefined)?.rolePlay ?? undefined) : undefined);
const lastTag = (history: H[]): RolePlayTag | undefined => tagOf([...history].reverse().find((h) => h.role === 'assistant'));

export const asksForRolePlay = (text: string): boolean => ASK.test(text);
export const saysYes = (text: string): boolean => YES.test(text) && !/^\s*(?:no|not|لا)\b/i.test(text);
export const asksToStop = (text: string): boolean => STOP.test(text);

/** The learner's reply to a beat: stop, stuck (a failed try: empty, "I don't know", asks for help or to repeat, only Arabic in an English scene), or ok. */
const FAREWELL = /\b(good ?bye|bye(?: bye)?|see you(?: later| soon| next time)?|have a (?:nice|good) (?:day|evening|night))\b|مع السلامة|باي/i;
/** The learner closes the conversation (a farewell): the scene ends there (its end condition), whatever beat it was on. */
export const saysFarewell = (text: string): boolean => FAREWELL.test(text);
export function classifyBeatReply(text: string, s: { dontKnow?: boolean; helpRequest?: boolean; repeatRequest?: boolean; answerRequest?: boolean }): 'stop' | 'stuck' | 'ok' {
  const t = text.trim();
  if (asksToStop(t) || saysFarewell(t)) return 'stop';
  if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return 'stuck';
  if (s.dontKnow || s.helpRequest || s.repeatRequest || s.answerRequest) return 'stuck';
  if (/[؀-ۿ]/.test(t) && !/[A-Za-z]{2,}/.test(t)) return 'stuck';
  if (/^(?:what|huh|sorry|pardon|again|repeat|help|hm+|um+|uh+)\W*$/i.test(t)) return 'stuck';
  return 'ok';
}

const CEFR_RE = /\b(pre[- ]?a1|a1|a2|b1|b2|c1|c2)\b/i;
export function levelOf(level?: string): SceneCefr | 'B2+' | undefined {
  const m = CEFR_RE.exec(level ?? '');
  if (!m) return /starter|pre[- ]?a1|مبتدئ/i.test(level ?? '') ? 'A1' : undefined;
  const v = m[1].toLowerCase().replace(/[- ]/g, '');
  return v === 'prea1' ? 'preA1' : v === 'a1' ? 'A1' : v === 'a2' ? 'A2' : v === 'b1' ? 'B1' : 'B2+';
}

export interface PickInput {
  child: boolean;
  /** The trusted age band; unknown is treated as a teen (13+ scenes without the adult-only ones). */
  ageBand?: 'child' | 'teen' | 'adult' | 'unknown';
  level?: string;
  interests?: string[];
  /** Scenes the learner had recently (session summaries and this session): avoided while others remain. */
  recent?: string[];
  /** The learner's own words when they asked (a setting they named wins). */
  ask?: string;
  /** Today's objective code (a scene that targets it scores higher). */
  objectiveCode?: string;
  /** Tie-break seed (learner and day), so the choice varies but is reproducible. */
  seed?: string;
  /** The lesson's own words (title, grammar, objectives, success criteria): a scene that practises today's point scores higher. */
  lessonText?: string;
}
/** Today's lesson point in the lesson's own words, for the scene targets (a fixed, checked list of patterns; code only). */
export const TARGET_HINTS: Record<string, RegExp> = {
  'EN-F-A1-GR-copula-be': /\b(verb be|be:|am\/is\/are|am, is (?:and|or) are)\b/i,
  'EN-F-A1-GR-article-a-an': /\b(a\/an|a or an|a and an)\b/i,
  'EN-F-A1-GR-possessive-adjectives': /\b(possessive|my\/your|his\/her)\b/i,
  'EN-F-A1-GR-prepositions-time': /\b(in\/on\/at|in, on (?:and|or) at|prepositions? of time)\b/i,
  'EN-F-A1-GR-there-is-are': /\bthere (?:is|are)\b/i,
  'EN-F-A1-GR-can-ability': /\bcan(?:'t| not|not)?\b/i,
  'EN-F-A2-GR-third-person-s': /\b(he\/she\/it|he, she (?:and|or) it|third person|-s\/-es)\b/i,
  'EN-F-A2-GR-present-continuous': /\bpresent continuous\b/i,
  'EN-F-A2-GR-past-simple-regular': /\b(past simple|past tense|-ed)\b/i,
  'EN-F-A2-GR-past-simple-irregular': /\b(past simple|past tense|irregular)\b/i,
  'EN-F-A2-GR-frequency-adverbs': /\b(adverbs? of frequency|frequency|usually|always|sometimes)\b/i,
  'EN-F-A2-GR-comparatives': /\bcomparatives?\b/i,
  'EN-F-A2-GR-going-to': /\bgoing to\b/i,
  'EN-F-A2-GR-some-any': /\bsome (?:and|or|\/) ?any\b/i,
  'EN-F-A2-FN-polite-requests': /\b(polite(?:ly)?|would like|could i|can i have)\b/i,
  'EN-F-A1-VO-food-drink': /\b(food|drinks?)\b/i,
  'EN-F-A1-VO-numbers-time': /\b(numbers?|clock|telling the time|o'clock)\b/i,
  'EN-F-A1-VO-days-months': /\b(days? of the week|months?)\b/i,
  'EN-F-A2-VO-clothes-shopping': /\b(clothes|shopping)\b/i,
  'EN-F-A1-VO-classroom-objects': /\bclassroom\b/i,
  'EN-F-A1-VO-common-adjectives': /\badjectives?\b/i,
};
/** The rule-bank outcomes today's lesson practises (from its own words). */
export const lessonTargets = (lessonText?: string): string[] => (lessonText ? Object.keys(TARGET_HINTS).filter((id) => TARGET_HINTS[id].test(lessonText)) : []);
/** The scenes this learner may get at all (age and level). */
export function eligibleScenes(p: Pick<PickInput, 'child' | 'ageBand' | 'level'>): RolePlayScene[] {
  if (p.child) {
    // A Pre A1 child gets the Pre A1 scenes; otherwise any child scene (all are Starters words).
    const kids = levelOf(p.level) === 'preA1' ? CHILD_SCENES.filter((s) => s.cefr === 'preA1') : CHILD_SCENES;
    return kids.length ? kids : CHILD_SCENES;
  }
  const band = p.ageBand === 'adult' ? 'adult' : 'teen';
  const pool = SCENES.filter((s) => s.ages.includes(band));
  const lv = levelOf(p.level) ?? 'A1';
  const idx = lv === 'B2+' ? CEFR_ORDER.indexOf('B1') : Math.max(CEFR_ORDER.indexOf(lv), CEFR_ORDER.indexOf('A1'));
  const fit = pool.filter((s) => { const i = CEFR_ORDER.indexOf(s.cefr); return i <= idx && i >= idx - 1; });
  if (fit.length) return fit;
  const below = pool.filter((s) => CEFR_ORDER.indexOf(s.cefr) <= idx);
  return below.length ? below : pool;
}
const hashNum = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);
/** Code picks the scene: eligible by age and level; a setting the learner named; not had recently; then objective and interests; seeded tie-break. */
export function pickScene(p: PickInput): RolePlayScene {
  let pool = eligibleScenes(p);
  if (p.ask) {
    const named = pool.filter((s) => SCENE_WORDS[s.id]?.test(p.ask!));
    if (named.length) pool = named;
  }
  const fresh = pool.filter((s) => !(p.recent ?? []).includes(s.id));
  if (fresh.length) pool = fresh;
  const lesson = lessonTargets(p.lessonText);
  const score = (s: RolePlayScene) => (p.objectiveCode && s.targets.includes(p.objectiveCode) ? 3 : 0) + (s.targets.some((t) => lesson.includes(t)) ? 2 : 0) + s.interests.filter((i) => (p.interests ?? []).includes(i)).length;
  const best = Math.max(...pool.map(score));
  const top = pool.filter((s) => score(s) === best);
  return top[hashNum(`${p.seed ?? ''}|${top.map((s) => s.id).join(',')}`) % top.length];
}

/** OFFER RULE (code, conservative): the tutor offers a scene only once per session, after ROLEPLAY_OFFER_FROM replies, right after a right
 *  answer with no struggle (no failed try, no confusion, no help request), and never in a review, the quick check, a real-chat reply,
 *  a listen-and-do or task step, or while an assignment limits the tutor to hints. */
export function mayOffer(i: { history: H[]; signals: { keyVerdict?: string | null; answeringCheck?: boolean; genuineFailedAttempts?: number; confusionCount?: number; helpRequest?: boolean; dontKnow?: boolean }; blocked: boolean }): boolean {
  if (i.blocked) return false;
  if (i.history.some((h) => tagOf(h))) return false;
  if (i.history.filter((h) => h.role === 'assistant').length < ROLEPLAY_OFFER_FROM) return false;
  const s = i.signals;
  if (!(s.answeringCheck && (s.keyVerdict === 'CORRECT' || s.keyVerdict === 'CORRECT_WITH_EQUIVALENT_FORMULATION'))) return false;
  return !(s.genuineFailedAttempts ?? 0) && !(s.confusionCount ?? 0) && !s.helpRequest && !s.dontKnow;
}

/** Arabic-L1 error codes (languageLearningState) mapped to the rule-bank outcome a recast and the debrief use. */
export const ERROR_OUTCOME: Record<string, string> = {
  article_omitted: 'EN-F-A1-GR-article-a-an',
  copula_omitted: 'EN-F-A1-GR-copula-be',
  age_with_have: 'EN-F-A1-GR-copula-be',
  be_with_base_verb: 'EN-F-A1-GR-copula-be',
  progressive_no_be: 'EN-F-A2-GR-present-continuous',
  subject_doubled: 'EN-F-A1-GR-word-order-svo',
  missing_third_person_s: 'EN-F-A2-GR-third-person-s',
};
const ERROR_LABEL: Record<string, string> = {
  article_omitted: 'a or an is missing before one countable thing',
  copula_omitted: 'am, is or are is missing',
  age_with_have: 'age is said with be (I am 20), not have',
  be_with_base_verb: 'am, is or are before a plain action verb',
  progressive_no_be: 'am, is or are is missing before the -ing verb',
  subject_doubled: 'the subject is said twice',
  resumptive_pronoun: 'an extra pronoun at the end',
  missing_third_person_s: 'the verb after he, she or it needs -s',
};
const THIRD_VERBS = 'like|want|need|live|work|play|go|have|eat|know|love|drink|study|speak|watch|read|come|think';
const THIRD = new RegExp(`(^|[.!?,]\\s*|\\s)(he|she|it|my (?:brother|sister|mother|father|friend|cat|dog))\\s+(${THIRD_VERBS})\\b`, 'i');
const NOT_BEFORE = /\b(does|doesn't|did|didn't|can|can't|will|won't|would|should|could|must|may|might|let|make|help|to|'ll)\s*$/i;
/** The error in the learner's message (code only, conservative): the Arabic-L1 patterns, then a missing third-person -s. */
export function detectSceneError(text: string): { code: string; evidence: string; outcome?: string } | null {
  const d = detectL1Transfer(text);
  if (d) return { code: d.code, evidence: d.evidence, ...(ERROR_OUTCOME[d.code] ? { outcome: ERROR_OUTCOME[d.code] } : {}) };
  const m = THIRD.exec(text);
  if (m && !NOT_BEFORE.test(text.slice(0, m.index + m[1].length))) return { code: 'missing_third_person_s', evidence: `${m[2]} ${m[3]}`.toLowerCase(), outcome: ERROR_OUTCOME.missing_third_person_s };
  return null;
}

/** The debrief's rule-bank entry: the error seen most in the scene (if it maps to an entry), else today's objective (when it is a rule-bank
 *  outcome), else today's lesson point (its own words), else the scene's first target. */
export function debriefEntry(scene: RolePlayScene, errs: string[] = [], objectiveCode?: string, lessonText?: string): RuleBankEntry | undefined {
  const count = new Map<string, number>();
  for (const e of errs) { const o = ERROR_OUTCOME[e]; if (o && ruleBankEntry(o)) count.set(o, (count.get(o) ?? 0) + 1); }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return ruleBankEntry(top) ?? ruleBankEntry(objectiveCode) ?? lessonTargets(lessonText).map((t) => ruleBankEntry(t)).find(Boolean) ?? scene.targets.map((t) => ruleBankEntry(t)).find(Boolean);
}

export interface StepInput {
  history: H[];
  message: string;
  signals: Parameters<typeof classifyBeatReply>[1] & Parameters<typeof mayOffer>[0]['signals'];
  /** True when this turn may not hold a scene at all (review, quick check, hints-only assignment, not an English lesson, opening). */
  blocked: boolean;
  /** True when another system step owns this reply (real chat): no new offer, but a running scene goes on. */
  busy?: boolean;
  pick: () => RolePlayScene | Promise<RolePlayScene>;
}
/** This turn's role-play step from the stored tags of this session's replies and the learner's message. Undefined = no role-play now. */
export async function rolePlayStep(i: StepInput): Promise<RolePlayTurn | undefined> {
  if (!rolePlayOn()) return undefined;
  const last = lastTag(i.history);
  const scene = sceneById(last?.scene);
  const carry = (t: RolePlayTag): RolePlayTurn => ({ scene: t.scene, phase: t.phase === 'declined' ? 'declined' : 'after' });
  // A running scene goes on (or ends) even in a turn that could not start one.
  if (last?.phase === 'beat' && scene) {
    const kind = classifyBeatReply(i.message, i.signals);
    const errs = last.errs ?? [];
    const error = kind === 'ok' ? detectSceneError(i.message) : null;
    const errsNow = error ? [...errs, error.code].slice(-8) : errs;
    const base = { scene: scene.id, ...(last.via ? { via: last.via } : {}), errs: errsNow, ...(error ? { error, err: error.code } : {}) };
    const n = last.beat ?? 1;
    if (kind === 'stop') return { ...base, phase: 'debrief' };
    if (kind === 'stuck') {
      const tries = (last.tries ?? 0) + 1;
      if (tries < 2) return { ...base, phase: 'beat', beat: n, tries, help: 'hint' };
      // second failed try on this beat: the line is said for them and the scene moves on (a change of method, never a third same try)
      return n + 1 >= scene.beats.length ? { ...base, phase: 'debrief', help: 'model', beat: n, closing: true } : { ...base, phase: 'beat', beat: n + 1, tries: 0, help: 'model' };
    }
    // The last beat (the character's goodbye) is said at the start of the debrief reply.
    return n + 1 >= scene.beats.length ? { ...base, phase: 'debrief', closing: true } : { ...base, phase: 'beat', beat: n + 1, tries: 0 };
  }
  if (i.blocked) return last && (last.phase === 'debrief' || last.phase === 'after' || last.phase === 'declined' || last.phase === 'offer') ? carry(last) : undefined;
  // The learner asks for a role-play: a scene starts now (also after an earlier scene this session).
  if (asksForRolePlay(i.message)) {
    const s = await i.pick();
    return { scene: s.id, phase: 'beat', beat: 1, tries: 0, via: 'ask', errs: [] };
  }
  if (last?.phase === 'offer' && scene) {
    if (saysYes(i.message)) return { scene: scene.id, phase: 'beat', beat: 1, tries: 0, via: 'offer', errs: [] };
    return { scene: scene.id, phase: 'declined' };
  }
  if (last) return carry(last);
  // Once per session (the tags are carried on every later reply, so the 12-message window still sees it).
  if (!i.busy && mayOffer({ history: i.history, signals: i.signals, blocked: false })) {
    const s = await i.pick();
    return { scene: s.id, phase: 'offer' };
  }
  return undefined;
}
/** The tag stored with the reply. */
export const rolePlayTagOf = (t: RolePlayTurn): RolePlayTag => {
  const { error: _e, entryId: _x, child: _c, under9: _u, lessonPoint: _l, ...tag } = t;
  return tag;
};
/** A scene reply (offer, beat or debrief): the lesson exercise, the closing ask and the real chat wait. */
export const rolePlayActive = (t?: RolePlayTurn): boolean => Boolean(t && (t.phase === 'beat' || t.phase === 'debrief' || t.phase === 'offer'));

const q = (s: string) => s.replace(/"/g, '\'');
const lc1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const offerSentence = (s: RolePlayScene, child: boolean): string => child
  ? `Do you want to play a game? It is called "${s.title.en}". I am ${s.character.en}.`
  : `Would you like to try a short role-play? "${s.title.en}": I am ${s.character.en}, and you ${lc1(s.goal.en)}.`;

/** The system line for this reply (appended to the language context, like the real-chat line). */
export function rolePlayLine(t: RolePlayTurn): string {
  const s = sceneById(t.scene);
  if (!s) return '';
  const child = Boolean(t.child);
  const english = 'English only.';
  const over = 'This overrides any instruction above to present a lesson exercise, state a rule, give a hint, ask for a recap or start a real chat.';
  if (t.phase === 'offer') {
    return `ROLE-PLAY OFFER (set by the system): if they just answered, confirm it in a few words. Then offer the role-play with this one question, in your own friendly words: "${offerSentence(s, child)}" No exercise and no other question in this reply. ${english} ${over}`;
  }
  if (t.phase === 'debrief') {
    const e = ruleBankEntry(t.entryId);
    const pair = e ? (t.under9 ? `"Right: ${q(e.right)}"` : `"Right: ${q(e.right)} Wrong: ${q(e.wrong)}"`) : '';
    const recast = t.error ? ` If their last message has the error "${q(t.error.evidence)}", say that part correctly once, in passing.` : '';
    const closing = t.closing ? ` First, still in character, react in a few words to what they said and close the scene with its last line: "${q(s.beats[s.beats.length - 1].say.en)}".` : '';
    return `ROLE-PLAY DEBRIEF (set by the system): the scene "${s.title.en}" is over.${closing} Then step out of the role and speak as the tutor again.${recast} (1) One short sentence that says the role-play is finished and praises their effort, naming ONE thing they did in the scene (if you quote them, copy their exact words from the conversation above; never "you are clever"). ${e ? `(2) Then say you will look at one point from it, and give exactly these lines: "Rule: ${q(e.rule)}" and ${pair}. (3) Then ONE new practice item on this rule, as a clear fill-in or a one-sentence task set in the same place as the scene (a new sentence, not one from the scene), and stop.` : '(2) Then ONE new practice item on today\'s lesson point, and stop.'} No other rule, no recap ask, no second task. ${english} ${over}`;
  }
  if (t.phase !== 'beat' || !t.beat) return '';
  const beat = s.beats[t.beat - 1];
  const prev = s.beats[t.beat - 2];
  const who = `You are ${s.character.en}, in this scene: ${s.setting.en}. The learner's goal: ${lc1(s.goal.en)}.`;
  const recast = t.error
    ? `Their last message has a small error (${ERROR_LABEL[t.error.code] ?? t.error.code.replace(/_/g, ' ')}: "${q(t.error.evidence)}"). Before your line, say that part back correctly once, the way ${s.character.en} naturally would in the conversation (a recast: echo their words in the right form). No grammar explanation, never say "wrong" or "mistake", at most one correction.`
    : 'If their last message has an error in grammar, a word form or a missing small word (for example "I goed", "He go", "I have banana"), say that part back correctly once inside your line, the way the character naturally would (a recast: "Oh, you went to the beach!"). Never repeat a wrong form as if it were right, never call it right, and never explain it.';
  const start = t.beat === 1 ? `Start the scene: in a few words say you are starting a short role-play called "${s.title.en}" and who you are, then your first line.` : '';
  const help = t.help === 'hint'
    ? `They could not answer your last line. Say the same line again, more simply, and give them a choice of two short answers (one of them: "${q(beat.example.en)}").`
    : t.help === 'model' && prev
      ? `They are stuck. First say what they could have said, kindly: "You can say: ${q(prev.example.en)}". Then go on with your next line.`
      : '';
  const len = child ? 'At most 3 very short sentences, with simple Starters words only.' : 'At most 2 short sentences (one more if you start the scene or help them).';
  const last = t.beat === s.beats.length ? ' This is the last line of the scene.' : '';
  const point = t.lessonPoint ? `Today's lesson point is ${q(t.lessonPoint)}: when their message has an error on it, always recast it.` : '';
  const react = t.beat === 1 ? '' : 'First react in a few words, in character, to what they actually said. If they asked you something, answer it briefly in character; if they already answered part of your line\'s question, do not ask that part again.';
  return `ROLE-PLAY (set by the system), beat ${t.beat} of ${s.beats.length}: ${who} Stay in character. ${start} ${react} ${recast} ${point} ${help} Your line now (say it in character; you may fit it to what they said, but keep its meaning and add nothing new; if it answers a question they did not ask, say it as new information instead): "${q(beat.say.en)}"${last} ${len} Do not add new events, places, people or topics. Do not explain grammar, do not give an exercise, a rule, a score or a recap, do not ask them to say or write anything again (the lesson comes back by itself after the scene), never claim they said something they did not say, and do not ask for personal details. Then stop and wait for their answer. ${english} ${over}`.replace(/\s{2,}/g, ' ');
}

// ------------------------------------------------------------------------------------------------ post-check
const META = /\b(grammar|rule|exercise|lesson|practice item|correct answer|the answer is|great job|good job|that'?s (?:right|correct)|that is (?:right|correct)|wrong|mistake|error|let'?s practi[sc]e|verb form|past tense|present tense|past simple|present simple)\b/gi;
const TASK = /_{2,}|\b(?:fill in|complete:|complete (?:this|the) sentence|write (?:one|a|your) (?:new )?sentence|tell me one thing you did|tell me about a real|say it again:|(?:now )?try again|now try|can you say (?:it|that|this) (?:with|again|correctly)|one last thing)\b/i;
const STOP_WORDS = new Set(['the', 'and', 'you', 'your', 'are', 'for', 'with', 'this', 'that', 'here', 'there', 'what', 'would', 'like', 'have', 'from', 'please', 'thank', 'thanks', 'hello', 'good', 'very', 'they', 'them', 'will', 'want', 'does', 'time', 'today', 'also', 'just', 'over', 'than', 'then', 'when', 'where', 'which', 'it\'s', 'is', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'or', 'it', 'we', 'i', 'my', 'me', 'do', 'can', 'be']);
const toks = (t: string) => t.toLowerCase().replace(/[’]/g, '\'').split(/[^a-z']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
let childList: Set<string> | undefined;
/** Child replies: the Starters list when the pack is installed, plus every word of the child scenes (all Starters words, checked by the bank test). */
function childWords(): Set<string> {
  if (childList) return childList;
  const d = loadKidsPack();
  const fromScenes = CHILD_SCENES.flatMap((s) => [s.title.en, s.character.en, s.goal.en, ...s.words, ...s.beats.flatMap((b) => [b.say.en, b.example.en, b.learner.en])]).flatMap(toks);
  childList = new Set([...(d ? starterTokens(d.words, [...d.numbers, ...d.names]) : []), ...fromScenes, 'yes', 'no', 'good', 'great', 'ok', 'oh', 'wow', 'try', 'again', 'you', 'can', 'say', 'or']);
  return childList;
}
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

/** Problems with a beat reply: off-scene teaching talk, personal details, Arabic in an English scene, too long, not voicing the beat, non-Starters words for a child. [] = keep it. */
export function sceneReplyProblems(t: RolePlayTurn, reply: string): string[] {
  const s = sceneById(t.scene);
  if (!s || t.phase !== 'beat' || !t.beat) return [];
  const beat = s.beats[t.beat - 1];
  const prev = s.beats[t.beat - 2];
  const own = new Set(toks([beat.say.en, beat.example.en, prev?.example.en ?? ''].join(' ')));
  const out: string[] = [];
  if (TASK.test(reply)) out.push('a lesson task inside the scene (a gap, or write / complete)');
  const meta = [...reply.matchAll(META)].map((m) => m[0].toLowerCase()).filter((w) => !w.split(/\s+/).every((x) => own.has(x)));
  if (meta.length) out.push(`teaching talk inside the scene (${[...new Set(meta)].slice(0, 3).join(', ')})`);
  if (PERSONAL_DETAILS.test(reply)) out.push('asks for personal details');
  if (/[؀-ۿ]/.test(reply)) out.push('Arabic in an English scene');
  const words = toks(reply);
  const maxWords = t.child ? 32 : 60;
  if (words.length > maxWords) out.push(`too long (${words.length} words, at most ${maxWords})`);
  if (t.child && sentencesOf(reply).length > 4) out.push('more than 3 short sentences for a child');
  const content = toks(beat.say.en).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  if (content.length && !content.some((w) => words.includes(w) || words.some((x) => x.startsWith(w.slice(0, 5)))) && !(t.help === 'hint')) out.push('does not voice the scene line');
  if (t.child) {
    const list = childWords();
    const off = [...new Set(words.filter((w) => !inList(w, list) && !own.has(w)))];
    if (off.length > 2) out.push(`words a young learner may not know (${off.slice(0, 4).join(', ')})`);
  }
  return out;
}
/** Problems that make a reply unusable (the beat's fixed line is used if the regeneration still has one); the others only ask for the regeneration. */
const HARD = /^(asks for personal details|Arabic in an English scene|a lesson task inside the scene|words a young learner may not know)/;
export const hardSceneProblems = (t: RolePlayTurn, reply: string): string[] => sceneReplyProblems(t, reply).filter((p) => HARD.test(p));
/** The note added to the one regeneration. */
export const SCENE_REGEN_NOTE = (problems: string[]) => `Your last draft left the role-play scene (${problems.join('; ')}). Write the reply again: only the scene line in character, as the role-play instruction says.`;

/** An unusable scene reply loses only its unusable sentences (a lesson task, teaching talk, personal details, Arabic) when what is left still
 *  voices the scene and is usable; otherwise null (then the beat's fixed line is used). Keeps the reaction and the recast. */
export function trimSceneReply(t: RolePlayTurn, reply: string): string | null {
  const parts = sentencesOf(reply);
  const bad = (x: string) => TASK.test(x) || new RegExp(META.source, 'i').test(x) || PERSONAL_DETAILS.test(x) || /[\u0600-\u06FF]/.test(x);
  const kept = parts.filter((x) => !bad(x));
  if (!kept.length || kept.length === parts.length) return null;
  const text = kept.join(' ');
  // What is left must still ask what the beat asks (a beat that asks a question keeps one).
  const beatAsks = /\?/.test(sceneById(t.scene)?.beats[(t.beat ?? 1) - 1]?.say.en ?? '');
  if (beatAsks && !/\?/.test(text)) return null;
  const left = sceneReplyProblems(t, text);
  return left.some((p) => HARD.test(p) || /^does not voice/.test(p)) ? null : text;
}
/** The fixed fallback when a regenerated reply still fails: the beat's own line (with the help the step asked for). */
export function sceneFallback(t: RolePlayTurn, draft?: string): string {
  const s = sceneById(t.scene);
  if (!s || !t.beat) return '';
  const beat = s.beats[t.beat - 1];
  const prev = s.beats[t.beat - 2];
  const intro = t.beat === 1 ? `Let's do a short role-play: "${s.title.en}". I am ${s.character.en}. ` : '';
  // The first usable sentence of the draft (the reaction to what they said) is kept before the fixed line, when there is one.
  const lead = draft ? sentencesOf(draft).find((x) => !TASK.test(x) && !new RegExp(META.source, 'i').test(x) && !PERSONAL_DETAILS.test(x) && !/[\u0600-\u06FF]/.test(x) && toks(x).length <= 12 && !/\?\s*$/.test(x)) : undefined;
  if (lead && t.beat > 1 && !t.help) return `${lead} ${beat.say.en}`;
  if (t.help === 'hint') return `${beat.say.en} For example: "${beat.example.en}"`;
  if (t.help === 'model' && prev) return `You can say: "${prev.example.en}" ${beat.say.en}`;
  return `${intro}${beat.say.en}`;
}

const norm = (x: string) => x.toLowerCase().replace(/[’]/g, '\'').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Debrief: the rule line and the right/wrong pair are guaranteed by code (added when the model left them out). */
export function ensureDebrief(t: RolePlayTurn, reply: string): { text: string; added: boolean } {
  const e = ruleBankEntry(t.entryId);
  if (!e || t.phase !== 'debrief') return { text: reply, added: false };
  const n = norm(reply);
  const hasRule = n.includes(norm(e.rule)); const hasRight = n.includes(norm(e.right)); const hasWrong = t.under9 || n.includes(norm(e.wrong));
  if (hasRule && hasRight && hasWrong) return { text: reply, added: false };
  const lines = [`Rule: ${e.rule}`, t.under9 ? `Right: ${e.right}` : `Right: ${e.right} Wrong: ${e.wrong}`];
  const parts = sentencesOf(reply);
  const first = parts[0] ?? 'Well done in the role-play!';
  const rest = parts.slice(1).filter((x) => !/^(rule|right|wrong)\s*:/i.test(x)).join(' ');
  return { text: `${first}\n${lines.join('\n')}${rest ? `\n\n${rest}` : ''}`, added: true };
}
/** Offer: the offer question is guaranteed by code (added when the model left it out). */
export function ensureOffer(t: RolePlayTurn, reply: string): { text: string; added: boolean } {
  const s = sceneById(t.scene);
  if (!s || t.phase !== 'offer') return { text: reply, added: false };
  if (/role[\s-]?play|play a game/i.test(reply)) return { text: reply, added: false };
  return { text: `${reply.trimEnd()}\n\n${offerSentence(s, Boolean(t.child))}`, added: true };
}

/** The scene card for the live call's side panel (and any client): the scene in both languages and where the learner is. Null outside a scene. */
export interface SceneCard { id: string; title: Bi; setting: Bi; character: Bi; goal: Bi; beat: number; beats: number; phase: 'beat' | 'debrief' }
export function sceneCard(t?: RolePlayTurn): SceneCard | null {
  const s = sceneById(t?.scene);
  if (!s || !t || (t.phase !== 'beat' && t.phase !== 'debrief')) return null;
  return { id: s.id, title: s.title, setting: s.setting, character: s.character, goal: s.goal, beat: t.phase === 'debrief' ? s.beats.length : t.beat ?? 1, beats: s.beats.length, phase: t.phase };
}

/** Scenes the learner had in this session's stored replies. */
export const scenesIn = (history: H[]): string[] => [...new Set(history.map(tagOf).filter((t): t is RolePlayTag => Boolean(t && (t.phase === 'beat' || t.phase === 'debrief'))).map((t) => t.scene))];
