import { AREAS, AREA_PREFIX, ITEM_COUNTS, type AssessmentItem, type Outcome, type Stage } from './schema';
import { norm, scoreItem } from './scoring';

const wordSet = (t: string) => new Set(norm(t).trim().split(' ').filter((w) => w.length > 2));
export const jaccard = (a: string, b: string): number => {
  const A = wordSet(a); const B = wordSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
};

// Everything the tutor, the study notes or the scripted tutor can show a learner.
export function tutorVisibleText(o: Outcome): string[] {
  const s = o.lesson.spec;
  return [
    o.lesson.title, o.lesson.objective, ...s.objectives, ...s.successCriteria, ...s.vocabulary, ...s.grammar, ...s.functions, ...s.examples,
    ...s.items.flatMap((i) => [i.prompt, i.material ?? '', ...i.acceptedAnswers]),
    o.studyNotes, o.scriptedTutor.explanation, ...o.scriptedTutor.hints, o.scriptedTutor.correctFeedback, o.scriptedTutor.incorrectFeedback, o.scriptedTutor.closing,
  ].filter(Boolean);
}

export function allItems(o: Outcome): AssessmentItem[] {
  return [o.prereqProbe, ...o.items.pre, ...o.items.post, ...o.items.transfer, ...o.items.delayed];
}

export function validateOutcome(o: Outcome): string[] {
  const e: string[] = [];
  const err = (m: string) => e.push(`${o?.id ?? '?'}: ${m}`);
  if (!o || typeof o !== 'object') return ['outcome is not an object'];
  const area = AREAS.find((a) => o.id?.startsWith(AREA_PREFIX[a] + '-'));
  if (!area) err('id must start with GR-, VO-, RD-, WR-, FN- or LS-');
  else if (o.area !== area) err(`area ${o.area} does not match id prefix (${area})`);
  if (!/^[A-Z]{2}-0[1-8]$/.test(o.id ?? '')) err('id must be XX-01 .. XX-08');
  if (!o.title || !o.objective) err('title and objective are required');
  if (!Array.isArray(o.prerequisites) || o.prerequisites.length < 1) err('at least 1 prerequisite');
  if (![1, 2, 3, 4, 5].includes(o.difficulty)) err('difficulty must be 1..5');
  if (!['A1', 'A2', 'B1', 'B2'].includes(o.cefr)) err('cefr must be A1|A2|B1|B2');
  if (o.area === 'listening') { if (o.modality !== 'text_dialogue') err("listening outcomes must have modality 'text_dialogue'"); } else if (o.modality !== 'text') err("non-listening outcomes must have modality 'text'");
  if (o.audioListening !== false) err('audioListening must be false (text-based only)');
  if (!Array.isArray(o.misconceptions) || o.misconceptions.length < 2) err('at least 2 misconceptions');
  const mids = new Set((o.misconceptions ?? []).map((m) => m.id));
  for (const m of o.misconceptions ?? []) if (!m.id || !m.description || !m.exampleWrong) err(`misconception ${m.id} needs id, description, exampleWrong`);
  if (!Array.isArray(o.teachingSuccessCriteria) || o.teachingSuccessCriteria.length < 2) err('at least 2 teachingSuccessCriteria');
  const mm = o.mastery;
  if (!mm || !(mm.postMinCorrect > 0 && mm.postMinCorrect <= 1) || !(mm.transferMinCorrect > 0 && mm.transferMinCorrect <= 1)) err('mastery.postMinCorrect and transferMinCorrect must be in (0,1]');
  // lesson
  const sp = o.lesson?.spec;
  if (!sp) err('lesson.spec missing');
  else {
    if (!sp.successCriteria?.length || sp.successCriteria.length < 2) err('lesson.spec.successCriteria needs at least 2');
    if (!sp.items?.length || sp.items.length < 2) err('lesson.spec.items needs at least 2 practice items');
    for (const it of sp.items ?? []) { if (!it.id || !it.prompt || !it.acceptedAnswers?.length) err(`practice item ${it.id} needs id, prompt, acceptedAnswers`); }
  }
  if (!o.studyNotes || o.studyNotes.trim().split(/\s+/).length > 200) err('studyNotes required and at most 200 words');
  const st = o.scriptedTutor;
  if (!st || !st.explanation || !st.correctFeedback || !st.incorrectFeedback || !st.closing || !Array.isArray(st.hints) || st.hints.length < 2) err('scriptedTutor needs explanation, correctFeedback, incorrectFeedback, closing and at least 2 hints');
  // assessment items
  const ids = new Set<string>(); const prompts = new Set<string>();
  const checkItem = (it: AssessmentItem, stage: Stage, label: string) => {
    const ctx = `${label} ${it?.id}`;
    if (!it?.id || !it.prompt) { err(`${ctx}: id and prompt required`); return; }
    if (it.stage !== stage) err(`${ctx}: stage must be '${stage}'`);
    if (ids.has(it.id)) err(`${ctx}: duplicate item id`); ids.add(it.id);
    const pn = norm(it.prompt + ' ' + (it.material ?? ''));
    if (prompts.has(pn)) err(`${ctx}: duplicate prompt`); prompts.add(pn);
    if (!it.right?.length || !it.wrong?.length) { err(`${ctx}: needs at least one right and one wrong example`); return; }
    if (it.misconceptionId && !mids.has(it.misconceptionId)) err(`${ctx}: unknown misconceptionId ${it.misconceptionId}`);
    if (it.scoring?.type === 'key') { if (!it.scoring.accepted?.length) err(`${ctx}: key scoring needs accepted answers`); }
    else if (it.scoring?.type === 'rubric') {
      if (it.scoring.checks.length < 2 || !it.scoring.checks.some((c) => c.required)) err(`${ctx}: rubric needs at least 2 checks and 1 required`);
    } else { err(`${ctx}: scoring.type must be key or rubric`); return; }
    for (const r of it.right) if (!scoreItem(r, it).correct) err(`${ctx}: right example scored wrong: "${r.slice(0, 60)}" (${scoreItem(r, it).detail})`);
    for (const w of it.wrong) if (scoreItem(w, it).correct) err(`${ctx}: wrong example scored right: "${w.slice(0, 60)}"`);
  };
  for (const stage of ['pre', 'post', 'transfer', 'delayed'] as Stage[]) {
    const arr = o.items?.[stage];
    if (!Array.isArray(arr) || arr.length !== ITEM_COUNTS[stage]) { err(`items.${stage} must have exactly ${ITEM_COUNTS[stage]} items`); continue; }
    arr.forEach((it) => checkItem(it, stage, stage));
  }
  if (!o.prereqProbe) err('prereqProbe missing'); else checkItem(o.prereqProbe, 'pre', 'prereqProbe');
  // leakage (static): assessment content must not be visible to the tutor, notes or script
  const visible = tutorVisibleText(o); const visibleNorm = norm(visible.join(' \n '));
  for (const it of allItems(o)) {
    if (!it?.prompt) continue;
    const pn = norm(it.prompt).trim();
    if (pn.length > 12 && visibleNorm.includes(pn)) err(`LEAK ${it.id}: assessment prompt appears verbatim in tutor-visible text`);
    for (const v of visible) { const j = jaccard(it.prompt, v); if (v.length > 25 && j >= 0.7) err(`LEAK ${it.id}: assessment prompt is too similar (${j.toFixed(2)}) to tutor-visible text "${v.slice(0, 50)}"`); }
    if (it.scoring?.type === 'key') for (const a of it.scoring.accepted) { const an = norm(a).trim(); if (an.split(' ').length >= 3 && visibleNorm.includes(an)) err(`LEAK ${it.id}: accepted answer "${a}" (3+ words) appears in tutor-visible text`); }
  }
  return e;
}

export function validateBenchmark(outcomes: Outcome[], opts: { partial?: boolean } = {}): string[] {
  const e: string[] = [];
  const ids = new Set<string>();
  for (const o of outcomes) { if (ids.has(o.id)) e.push(`${o.id}: duplicate outcome id`); ids.add(o.id); e.push(...validateOutcome(o)); }
  if (!opts.partial) {
    if (outcomes.length !== 48) e.push(`benchmark must have 48 outcomes, found ${outcomes.length}`);
    for (const a of AREAS) {
      const n = outcomes.filter((o) => o.area === a).length;
      if (n !== 8) e.push(`area ${a} must have 8 outcomes, found ${n}`);
      for (let k = 1; k <= 8; k += 1) if (!ids.has(`${AREA_PREFIX[a]}-0${k}`)) e.push(`missing outcome ${AREA_PREFIX[a]}-0${k}`);
    }
  }
  // answer-item reuse across outcomes
  const seen = new Map<string, string>();
  for (const o of outcomes) for (const it of allItems(o)) { const k = norm(it.prompt + ' ' + (it.material ?? '')); const prev = seen.get(k); if (prev && prev !== o.id) e.push(`${o.id}: item ${it.id} duplicates a prompt of ${prev}`); seen.set(k, o.id); }
  return e;
}
