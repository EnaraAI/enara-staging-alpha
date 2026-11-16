#!/usr/bin/env python3
import json, os
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
os.chdir(REPO)
OUT = 'artifacts/human_review/r42'
P = json.load(open(f'{OUT}/31_priority_cases.json'))['cases'] + json.load(open(f'{OUT}/9_hidden_calibration_cases.json'))['cases']
A = {c['anonId']: c for c in json.load(open(f'{OUT}/automated_evaluator_comparison_restricted.json'))['cases']}
by = lambda f: sorted([c for c in P if f(c)], key=lambda c: c['anonId'])

def first_attempt(c):
    t = c['context']['learnerScriptTargets']
    return next((k + 1 for k, x in enumerate(t) if x != 'request'), None)

def ex(cs, why, k=4):
    out = []
    for c in cs[:k]:
        fa = first_attempt(c)
        n = len(c['conversationDesignatedRun']['turns'])
        out.append(f"`{c['anonId']}` ({c['context']['ageBand']}, {c['context']['cefrEstimate']}, {n} turn{'s' if n > 1 else ''}; {why(c, fa)})")
    return out or ['(no case in the 40 meets the rule)']

kind = lambda c: {it['itemType'] for it in c['context']['itemsRestricted']}
two = by(lambda c: any('two-option' in k for k in kind(c)) and len(c['conversationDesignatedRun']['turns']) >= 2)
single = by(lambda c: any('single-ending' in k for k in kind(c)) and len(c['conversationDesignatedRun']['turns']) >= 2)
form = by(lambda c: any('verb-form' in k for k in kind(c)) and len(c['conversationDesignatedRun']['turns']) >= 2)
short = by(lambda c: len(c['conversationDesignatedRun']['turns']) == 1)
long = by(lambda c: len(c['conversationDesignatedRun']['turns']) >= 3)
ie = by(lambda c: any(A[c['anonId']]['runs'][r][role]['insufficientEvidenceDimensions'] for r in ('run1', 'run2', 'run3') for role in ('official', 'independent')))
nolesson = by(lambda c: not c['context']['lessonAvailableToTutor'])
a1 = by(lambda c: c['context']['cefrEstimate'] == 'A1' and c['context']['lessonAvailableToTutor'])
b1 = by(lambda c: c['context']['cefrEstimate'] == 'B1' and c['context']['lessonAvailableToTutor'])
hintwin = lambda c, fa: (f"hint turns before first attempt: {', '.join(str(i) for i in range(1, fa))}" if fa and fa > 1 else 'learner attempts in turn 1') if fa else 'all learner turns are requests, no attempt'

D = [
 ('1', 'Acceptable hint strength on two-option questions',
  'On an item where only two answers are possible (he/she), what may a tutor say before the learner\'s first attempt without "giving the answer away"? Examples: naming the deciding fact ("a brother is a boy"), offering both options, asking "boy or girl?", or showing a model with a different noun.',
  ex(two, hintwin) + ex(single, hintwin, 2),
  ['(a) Any cue that makes the choice trivial (deciding fact, both options listed) counts as leakage before an attempt.',
   '(b) Naming the deciding concept is acceptable at A1 (and/or for children), because without it the learner cannot act; leakage is only stating or highlighting the answer form.',
   '(c) The acceptable cue depends on the item type: two-option items vs single-ending (-s/-es) vs verb-form choice.']),
 ('2', 'Minimum evidence required for MEETS',
  'Many cases are one learner turn long. Should a case be able to "meet expectations" when only a few criteria can be judged?',
  ex(short, lambda c, fa: 'single exchange') + ex(long, lambda c, fa: 'multi-turn', 2),
  ['(a) No minimum: judge whatever is observable.', '(b) Require a minimum number of judgeable criteria, or a minimum number of core criteria (e.g. at least 2 of grounding, answer judgement, hints, grammar).',
   '(c) Report short cases separately and never mix them with multi-turn cases in one pass rate.']),
 ('3', 'Insufficient-evidence rules',
  'The draft says both "give no score" and "may be scored 3 with the flag set" (contradictory). When should a reviewer use insufficient evidence, and what does it do to the overall result?',
  ex(ie, lambda c, fa: 'an automated evaluator marked at least one criterion as insufficient evidence'),
  ['(a) Insufficient evidence means unscored and excluded; if a core criterion is affected, the case goes to human adjudication.', '(b) Insufficient evidence may be scored 3 (neutral) with a flag.',
   '(c) Insufficient evidence on any criterion means the case cannot meet expectations.']),
 ('4', 'N/A rules',
  'When is a criterion not applicable (as opposed to insufficient evidence)? E.g. answer judgement when the learner gave no answer; hints when no hint was due; formative check on a clarification turn.',
  ex(short, lambda c, fa: 'learner turn is a request, not an answer') + ex(nolesson, lambda c, fa: 'no lesson available to the tutor', 2),
  ['(a) Keep N/A distinct from insufficient evidence and list the legitimate N/A situations per criterion.', '(b) Merge N/A and insufficient evidence into one "not judged" category.',
   '(c) Disallow N/A on core criteria; force a judgement.']),
 ('5', 'Pass threshold',
  'The draft requires: no critical or major defect; every judged criterion at least 2; every core criterion at least 3; average at least 3.00. In the automated runs most cases sat at or near an average of 3.00, so small differences changed the result. Should this threshold be kept, changed, or replaced with a profile report?',
  ['Use the cases in this package after your blind scoring. The threshold question is about the rule, not about any single case.'],
  ['(a) Keep the draft thresholds.', '(b) Set the threshold by a formal standard-setting exercise (e.g. contrasting groups or Angoff) using your scores on these cases.',
   '(c) Report per-criterion profiles and core-criterion pass/fail as the primary result, with no single pass/fail label.']),
 ('6', 'D7 scoring anchors (hint leakage)',
  'Are the draft D7 anchors (Appendix A of the reviewer package) usable and fair across item types? Should "L6, after repeated failure or a request after an attempt, is not leakage" be kept?',
  ex(two, hintwin, 2) + ex(single, hintwin, 2) + ex(form, hintwin, 2),
  ['(a) Keep the D7 anchors and add worked examples per item type.', '(b) Rewrite D7 around what the learner still had to do (the tested step), regardless of cue form.',
   '(c) Split D7 into "answer revealed before attempt" (pass/fail) and "hint quality" (0-4).']),
 ('7', 'CEFR descriptor anchoring',
  'The draft D4 anchors are not tied to CEFR descriptors. No CEFR descriptor text exists in the benchmark artifacts (not reconstructed here). Should D4 be anchored to specific CEFR Companion Volume descriptors per level?',
  ex(a1, lambda c, fa: 'A1 lesson case', 2) + ex(b1, lambda c, fa: 'B1 lesson case', 2),
  ['(a) Anchor D4 to 2–3 named CEFR CV descriptors per level (reception and mediation scales).', '(b) Keep holistic judgement with exemplar transcripts per level.', '(c) Drop D4 and rely on the word limit and comprehension checks.']),
 ('8', 'Do all 11 draft dimensions measure the intended construct?',
  'Intended construct: quality of an AI tutor\'s turn-level teaching moves in short written EFL interactions. Overlaps noted: D5/D11 (re-testing penalised twice) and D8/D9 (unaided check). Missing: learner affect and motivation, judicious L1 use.',
  ['Consider the ten review criteria you used (C1–C10) against the 11 draft dimensions in Appendix A.'],
  ['(a) Keep 11 dimensions, fixing the overlaps.', '(b) Reduce to the ten review criteria used in this package.', '(c) Add a learner-support/affect dimension.']),
 ('9', 'The 5-dimension vs 11-dimension MEETS discrepancy',
  'In the automated r4.2 runs, cases where only 5 dimensions could be scored met expectations 97% of the time (31/32), while cases with all 11 scored met them 17% of the time (19/112). This suggests the automated outcome partly reflects case length rather than tutoring quality. (Figures are aggregate automated results, given here for the decision only.)',
  ex(short, lambda c, fa: 'few judgeable criteria', 2) + ex(long, lambda c, fa: 'many judgeable criteria', 2),
  ['(a) Require a minimum coverage for MEETS (see decision 2).', '(b) Report outcomes by coverage band.', '(c) Score only criteria observable in every case, and score others as separate supplementary indicators.']),
]

L = ['# Educator rubric decision worksheet (r4.2)', '',
     '**For:** both expert reviewers and the review coordinator.',
     '**When:** use **after both reviewers have submitted their blind score sheets.** This worksheet contains aggregate automated findings (decisions 5 and 9) that must not influence blind scoring.', '',
     '**Status:**',
     '- Rubric `ltb-rubric-v2` is a **draft**. It is **not academically validated**.',
     '- **No decision below has been made.**',
     '- The listed interpretations are options for discussion. They are not recommendations and not approved positions.', '',
     '**How to use this worksheet:**',
     '- Examples cite anonymous case IDs from your review package (`EXP-xxxx`), with turn numbers where useful.',
     '- Examples were selected by fixed rules from case design facts (item type, number of turns, lesson availability, use of insufficient evidence). **They do not show anyone\'s scores.**',
     '- Record each reviewer\'s ruling **independently first**. Then record the consensus, or the unresolved disagreement.', '']
for num, title, q, exs, opts in D:
    L += ['---', '', f'## Decision {num}: {title}', '', f'**Question.** {q}', '', '**Relevant examples (anonymous):**', ''] + [f'- {e}' for e in exs] + ['', '**Competing interpretations:**', ''] + [f'- {o}' for o in opts] + [
        '', '| | Ruling | Rationale |', '|---|---|---|', '| Educator A (independent) | | |', '| Educator B (independent) | | |', '| **Final consensus decision** | | |', '| Unresolved disagreement (if any) | | |', '']
L += ['---', '', '## Sign-off', '', '| | Name | Date | Independence / conflict-of-interest declaration signed |', '|---|---|---|---|', '| Educator A | | | |', '| Educator B | | | |', '| Coordinator | | | n/a |', '',
      'After sign-off, the rubric and the scoring code (`judge_v2_core.ts`) must be frozen **together**, with hashes. Until then any automated score remains provisional.']
open(f'{OUT}/educator_rubric_decisions.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('decisions written', sum(len(d[3]) for d in D), 'example refs')
