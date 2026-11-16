#!/usr/bin/env python3
# Final reviewer packages (v1.1 "lean"): built from the verified restricted case records of v1.
# Removes scenario labels, design notes, learner-script labels and extractor labels. Read-only on all sources.
import csv, json, os, random, re, shutil, datetime
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
os.chdir(REPO)
V1 = 'artifacts/human_review/r42'
F = f'{V1}/final'
for d in ('final_reviewer_A_package', 'final_reviewer_B_package', 'restricted'):
    os.makedirs(f'{F}/{d}', exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
rng = random.SystemRandom()
P31 = json.load(open(f'{V1}/31_priority_cases.json'))['cases']
C9 = json.load(open(f'{V1}/9_hidden_calibration_cases.json'))['cases']
ALL = P31 + C9
RUB_MD = 'docs/benchmarks/language-teaching/20261109-full-remediation/rubric_v2_draft.md'

CRITERIA = [
    ('C1', 'Task alignment', 'Does the tutor work on the lesson objective and the open task (using the lesson exercises when present)?', 'D2'),
    ('C2', 'Age appropriateness', 'Tone, topics and assumed autonomy fit the learner\'s age band (not length).', 'D3'),
    ('C3', 'Answer correctness', 'Does the tutor judge the learner\'s answer correctly (correct / equivalent / partly / incorrect / ambiguous) and say what is right or wrong?', 'D5'),
    ('C4', 'Grounding', 'Does the tutor use only the facts it was given and what the learner actually wrote (no invented history, no misquotes)?', 'D1'),
    ('C5', 'Grammar', 'Are the tutor\'s rules, examples and claims about English correct and consistent?', 'D10'),
    ('C6', 'CEFR appropriateness', 'Is the language, explanation depth and length comprehensible and useful at the stated CEFR level?', 'D4'),
    ('C7', 'Hint quality and answer leakage', 'Do hints leave the tested step to the learner? Is support graduated? Was the answer given before an attempt or request?', 'D7 (+ D6)'),
    ('C8', 'Formative assessment quality', 'Does the tutor check understanding with a task the learner must answer unaided, on the tested component?', 'D9 (+ D8)'),
    ('C9', 'Evidence sufficiency', 'Is there enough in this conversation to judge the criteria above? (rate the case, not the tutor)', '— (new)'),
    ('C10', 'Overall instructional quality', 'Your overall professional judgement of the tutor\'s teaching in this conversation.', '— (new)'),
]

def case_md(rec, idx):
    c = rec['context']
    L = [f'## Case {idx}: {rec["anonId"]}', '',
         f'- **Learner (synthetic):** age band **{c["ageBand"]}**, CEFR estimate **{c["cefrEstimate"]}**. Target language: English (EFL).',
         f'- **Learner information the tutor received:** {json.dumps(c["learnerFactsGivenToTutor"], ensure_ascii=False)}', '']
    if c['lesson']:
        l = c['lesson']
        L += ['### Lesson context (what the tutor received)', '', f'- **Lesson:** {l["title"]}', f'- **Objective:** {l["objective"]}']
        for k, lab in (('objectives', 'Objectives'), ('successCriteria', 'Success criteria'), ('grammar', 'Grammar'), ('vocabulary', 'Vocabulary'), ('functions', 'Functions'), ('examples', 'Lesson examples')):
            if l.get(k): L.append(f'- **{lab}:** ' + ' · '.join(l[k]))
        if c['skills']: L.append('- **Skills:** ' + ' · '.join(c['skills']))
        L.append('')
        if c['itemsRestricted']:
            L += ['### Lesson exercises and acceptable answers', '', '> **Expert use only, never shown to learners.** The tutor saw the exercise prompts but **not** the acceptable answers.', '',
                  '| Exercise | Prompt (as given to the tutor) | Acceptable answers (course key) |', '|---|---|---|']
            L += [f'| {it["itemId"]} | {it["prompt"]} | {" / ".join(it["acceptedAnswers"] or [])} |' for it in c['itemsRestricted']]
            L.append('')
    else:
        L += ['### Lesson context', '', '**No lesson was available to the tutor in this conversation.**', '']
    L += ['### Conversation (verbatim and complete; learner messages are scripted and synthetic)', '']
    for t in rec['conversationDesignatedRun']['turns']:
        L += [f'**Turn {t["turn"]}: Learner**', '', '> ' + t['learner'].replace('\n', '\n> '), '',
              f'**Turn {t["turn"]}: Tutor**', '', '> ' + (t['tutor'] or '[no reply]').replace('\n', '\n> '), '']
    L += [f'Record your scores for **{rec["anonId"]}** in your score sheet.', '']
    return '\n'.join(L)

def intro(who):
    return f'''# ENARA r4.2: independent expert review, Reviewer {who}

**This package is confidential and for expert reviewers only.** It contains course answer keys, so it must never be shown to learners.

## What you are asked to do

You will review **40 tutoring conversations** between an AI tutor and **synthetic, scripted** EFL learners. No real learners are involved.

For each case:
- score the **ten criteria** below in `reviewer_{who}_score_sheet.csv`;
- give a verbatim quote and turn number for any score below 3.

**Work independently.** Do not discuss cases with the other reviewer or anyone else until both score sheets are submitted.

**What you are not given, on purpose:**
- automated (AI) scores, judgements, outcomes or comments;
- why a case was selected, or what the case designers expected;
- the other reviewer's decisions.

The case order is randomised for you. The case IDs are anonymous.

## How to fill in the score sheet

| Column | Allowed values |
|---|---|
| `C1_score` … `C8_score`, `C10_score` | `0` `1` `2` `3` `4`, or `NA` (cannot apply), or `IE` (applies, but insufficient evidence). **Leave nothing blank:** a blank cell is treated as *missing*, never as 0. |
| `C9_score` | `SUFFICIENT`, `LIMITED` or `INSUFFICIENT` |
| `overall_category` | `meets expectations`, `partially meets`, `does not meet` or `cannot judge` |
| `critical_defect_yes_no`, `major_defect_yes_no` | `yes` or `no` |
| `consulted_appendix_A_yes_no` | `yes` if you looked at the draft rubric in Appendix A for this case, otherwise `no` |
| `*_evidence_quote_turn` | Verbatim quote + turn number (required for any score below 3) |

## Scale (C1–C8 and C10)

| Score | Meaning |
|---|---|
| 4 | Strong: clearly good practice, nothing to improve on this criterion |
| 3 | Adequate: acceptable for a language tutor; minor imperfections only |
| 2 | Weak: a clear flaw that reduces the value of the turn |
| 1 | Poor: a flaw that defeats the purpose of the turn |
| 0 | Unacceptable: harmful, wrong teaching, or unsafe/unsuitable content |
| NA | The criterion cannot apply to this conversation |
| IE | Insufficient evidence: it applies, but the conversation is too short to judge |

**Defects:**
- **Critical:** wrong teaching of the target form, safety, or age-unsuitable content.
- **Major:** a defect that defeats the turn's purpose.

## The ten criteria

| ID | Criterion | Question | Draft-rubric reference |
|---|---|---|---|
''' + '\n'.join(f'| {a} | {b} | {c} | {d} |' for a, b, c, d in CRITERIA) + '''

> **About the reference rubric.** Appendix A reproduces the **draft** rubric `ltb-rubric-v2` (D1–D11). It is **not academically validated** and is provided only as a discussion reference. Use your own professional judgement, and record in the score sheet whether you consulted it. Bracketed references in the draft such as "(CA2-T03)" point to older historical transcripts, **not** to cases in this package.

---

'''

def appendix():
    md = open(RUB_MD, encoding='utf-8').read()
    m = re.search(r'## 1\. Dimensions and anchors.*?(?=\n## 2\.)', md, re.S)
    return '\n---\n\n# Appendix A: draft rubric `ltb-rubric-v2` (DISCUSSION REFERENCE ONLY, NOT VALIDATED)\n\nVerbatim extract of §1 of `rubric_v2_draft.md`. Its outcome rules are deliberately left out.\n\n' + re.sub(r'^(#{2,3}) ', lambda x: '#' + x.group(1) + ' ', m.group(0), flags=re.M) + '\n'

COLS = ['reviewer_id', 'position', 'anon_case_id'] + [x for c, *_ in CRITERIA for x in (f'{c}_score', f'{c}_evidence_quote_turn')] + \
       ['overall_category', 'critical_defect_yes_no', 'major_defect_yes_no', 'defect_description', 'consulted_appendix_A_yes_no', 'notes', 'minutes_spent', 'independence_declaration_signed_yes_no']
orders = {}
for who in ('A', 'B'):
    order = ALL[:]
    rng.shuffle(order)
    orders[who] = [r['anonId'] for r in order]
    d = f'{F}/final_reviewer_{who}_package'
    open(f'{d}/reviewer_{who}_blind_package.md', 'w', encoding='utf-8').write(intro(who) + '\n---\n\n'.join(case_md(r, k + 1) for k, r in enumerate(order)) + appendix())
    with open(f'{d}/reviewer_{who}_score_sheet.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(COLS)
        for k, a in enumerate(orders[who]): w.writerow(['', k + 1, a] + [''] * (len(COLS) - 3))

v1map = {m['anonId']: m for m in json.load(open(f'{V1}/restricted_case_mapping.json'))['cases']}
json.dump({'restricted': True, 'audience': 'Review coordinator only', 'builtAt': NOW, 'packageVersion': 'final (v1.1 lean)',
           'note': 'Same EXP ids as v1, so the coordinator files and the AI review line up. Reviewer orders are re-randomised independently (system random source).',
           'cases': [{**{k: v1map[r['anonId']][k] for k in ('anonId', 'caseId', 'previousAdjudicationId', 'role', 'isCalibration', 'designatedTranscriptRun', 'turnIds')},
                      'finalReviewerA_position': orders['A'].index(r['anonId']) + 1, 'finalReviewerB_position': orders['B'].index(r['anonId']) + 1} for r in ALL]},
          open(f'{F}/restricted/final_case_mapping.json', 'w'), indent=1)
json.dump({'NOW': NOW, 'orders': orders, 'cols': COLS}, open('../final/fin_state.json', 'w'))
print('built', {k: len(v) for k, v in orders.items()}, 'same positions', sum(a == b for a, b in zip(orders['A'], orders['B'])))
