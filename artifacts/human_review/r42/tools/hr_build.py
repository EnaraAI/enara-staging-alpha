#!/usr/bin/env python3
# Builds artifacts/human_review/r42/ from frozen r4.2 artifacts. Read-only on all sources.
import csv, hashlib, json, os, random, re, subprocess, datetime
from collections import Counter

REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
os.chdir(REPO)
BENCH = 'docs/benchmarks/language-teaching'
CAMP = f'{BENCH}/20261109-r42-controlled-validation'
FX = f'{BENCH}/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl'
RUB_MD = f'{BENCH}/20261109-full-remediation/rubric_v2_draft.md'
RUB_JSON = f'{BENCH}/20261109-post-remediation-final/rubric_v2_machine.json'
OUT = 'artifacts/human_review/r42'
os.makedirs(OUT, exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
rng = random.SystemRandom()

def jl_lines(p):
    return [(k + 1, json.loads(l)) for k, l in enumerate(open(p, encoding='utf-8')) if l.strip()]

# ------------------------------------------------------------------ sources
fixture = {r['id']: (ln, r) for ln, r in jl_lines(FX)}
RAW, ATT, EV, SUM = {}, {}, {}, {}
for n in (1, 2, 3):
    RAW[n] = {r['caseId']: (ln, r) for ln, r in jl_lines(f'{CAMP}/run_{n}/live/raw_results.jsonl')}
    ATT[n] = {r['id']: r for _, r in jl_lines(f'{CAMP}/run_{n}/live/provider_attempts.jsonl') if r.get('kind') == 'provider_attempt'}
    for role in ('official', 'independent'):
        EV[(n, role)] = {r['caseId']: (ln, r) for ln, r in jl_lines(f'{CAMP}/run_{n}/eval_v2/judge_v2_{role}.jsonl')}
    SUM[n] = json.load(open(f'{CAMP}/run_{n}/summary.json'))
RETEST = {r['caseId']: (ln, r) for ln, r in jl_lines(f'{CAMP}/run_1/eval_v2_retest/judge_v2_official.jsonl')}
KEY = json.load(open(f'{CAMP}/adjudication_package/SEALED_case_key.json'))
TIERS = json.load(open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/hr_tiers.json'))
rubric = json.load(open(RUB_JSON))

missing = []  # every unavailable field, reported, never reconstructed
missing.append({'artifact': 'CEFR descriptor text', 'scope': 'all cases', 'status': 'NOT PRESENT in any original artifact (fixture, rubric draft, transcripts). Only the CEFR level estimate (A1/A2/B1) exists. Not reconstructed.'})
missing.append({'artifact': 'Stored message timestamps', 'scope': 'all turns', 'status': 'The harness raw results do not store message timestamps. Each tutor turn carries the provider attempt start time (startedAt) and latency from provider_attempts.jsonl; learner-message times are not recorded. Turn order is exact (learnerScript order).'})
missing.append({'artifact': 'Explicit "assessment type" field', 'scope': 'all cases', 'status': 'Not a field in the fixture. Package shows the fixture situation type (caseType) and per-turn learner-script targets instead; nothing inferred beyond those labels.'})
missing.append({'artifact': 'Evaluator test-retest', 'scope': 'run 1 only', 'status': 'Partial: 74/120 cases (container restart). Present only for cases in that subset.'})

# ------------------------------------------------------------------ helpers
def item_kind(it):
    tf = [t.lower() for t in (it.get('targetForms') or [])]
    if tf and set(tf) <= {'he', 'she'}:
        return 'two-option (he/she pronoun choice)'
    if tf and all(re.fullmatch(r'[a-z]+(s|es)', t) for t in tf) and it['prompt'].lower().startswith('correct the verb'):
        return 'single-ending (third-person -s/-es)'
    return 'verb-form choice (past simple / present perfect)'

TARGET_LABEL = {'request': 'learner request (not an answer)', 'lesson_item:ex1': 'learner attempt at lesson item ex1', 'lesson_item:ex2': 'learner attempt at lesson item ex2',
                'tutor_task': "learner answer to the tutor's own task", 'own_sentence': "learner's own sentence"}

def conversation(case_id, n):
    ln, raw = RAW[n][case_id]
    script = fixture[case_id][1]['learnerScript']
    turns = []
    for k, t in enumerate(raw['turns']):
        atts = [ATT[n].get(a) for a in t.get('attemptIds') or []]
        tutor_att = [a for a in atts if a and a.get('maxTokens') == 4000]
        turns.append({
            'turnId': f'{case_id}#run{n}#turn{k + 1}', 'turn': k + 1,
            'learner': t['learner'], 'learnerScriptTarget': script[k]['target'] if k < len(script) else None,
            'tutor': t['reply'], 'httpStatus': t['httpStatus'],
            'tutorCallStartedAt': tutor_att[0]['startedAt'] if tutor_att else None,
            'tutorLatencyMs': tutor_att[0].get('latencyMs') if tutor_att else t.get('latencyMs'),
            'providerAttemptIds': t.get('attemptIds') or [],
            'learnerTextMatchesFixture': k < len(script) and script[k]['text'] == t['learner'],
        })
    return {'run': n, 'source': {'file': f'{CAMP}/run_{n}/live/raw_results.jsonl', 'line': ln}, 'turns': turns}

def context(case_id):
    ln, c = fixture[case_id]
    ev = c['evaluatorView']
    lesson = c.get('lessonDelivered')
    items = []
    for it in (lesson or {}).get('spec', {}).get('items', []) or []:
        items.append({'itemId': it['id'], 'prompt': it['prompt'], 'acceptedAnswers': it.get('acceptedAnswers'), 'targetForms': it.get('targetForms'),
                      'successCriteriaTested': it.get('criteria'), 'itemType': item_kind(it)})
    spec = (lesson or {}).get('spec') or {}
    return {
        'source': {'file': FX, 'line': ln, 'fixtureVersion': c['fixtureVersion']},
        'scenario': c['caseType'], 'ageBand': c['cohort'], 'cefrEstimate': c['cefr'], 'targetLanguage': 'English (EFL)',
        'skills': spec.get('skills') or [], 'learnerFactsGivenToTutor': ev['learner'],
        'lesson': None if not lesson else {'title': lesson['title'], 'objective': lesson['objective'], 'objectives': spec.get('objectives'), 'successCriteria': spec.get('successCriteria'),
                                           'vocabulary': spec.get('vocabulary'), 'grammar': spec.get('grammar'), 'functions': spec.get('functions'), 'examples': spec.get('examples')},
        'lessonAvailableToTutor': bool(lesson),
        'itemsRestricted': items,
        'caseGuidance': ev['guidance'],
        'structuredExpectations': c.get('structuredExpectations'),
        'learnerScriptTargets': [s['target'] for s in c['learnerScript']],
    }

def automated(case_id):
    out = {'runs': {}}
    for n in (1, 2, 3):
        run = {}
        for role in ('official', 'independent'):
            ln, e = EV[(n, role)][case_id]
            res = e.get('result') or {}
            sc = res.get('scores') or {}
            run[role] = {'source': {'file': f'{CAMP}/run_{n}/eval_v2/judge_v2_{role}.jsonl', 'line': ln}, 'model': e['evaluatorModel'], 'coreVersion': e['coreVersion'],
                         'outcome': (e.get('outcome') or {}).get('outcome'), 'mean': (e.get('outcome') or {}).get('mean'), 'outcomeReasons': (e.get('outcome') or {}).get('reasons'),
                         'scores': sc, 'evidence': res.get('evidence'), 'failures': res.get('failures'), 'confidence': res.get('confidence'),
                         'naDimensions': [d for d, v in sc.items() if v == 'n/a'], 'insufficientEvidenceDimensions': [d for d, v in sc.items() if v == 'insufficient_evidence'],
                         'majorOrCritical': [f for f in res.get('failures') or [] if f.get('severity') in ('major', 'critical')],
                         'unparseable': e.get('unparseable'), 'deterministic': e.get('deterministic')}
        lt = [t.get('languageTurn') or {} for t in RAW[n][case_id][1]['turns']]
        run['engineTelemetry'] = [{'turn': k + 1, 'moves': x.get('moves'), 'hintLevelOffered': x.get('hintLevelOffered'), 'hintLevel': x.get('hintLevel'), 'learnerIntent': x.get('learnerIntent'),
                                   'assessment': x.get('assessment'), 'keyVerdict': x.get('keyVerdict'), 'qualityFlags': x.get('qualityFlags'), 'markerStatus': x.get('markerStatus')} for k, x in enumerate(lt)]
        out['runs'][f'run{n}'] = run
    o = [out['runs'][f'run{n}']['official']['outcome'] for n in (1, 2, 3)]
    i = [out['runs'][f'run{n}']['independent']['outcome'] for n in (1, 2, 3)]
    out['crossRun'] = {'officialOutcomes': o, 'independentOutcomes': i, 'officialChanged': len(set(o)) > 1, 'independentChanged': len(set(i)) > 1,
                       'runsWithEvaluatorDisagreement': [n for n in (1, 2, 3) if o[n - 1] and i[n - 1] and o[n - 1] != i[n - 1]]}
    if case_id in RETEST:
        ln, e = RETEST[case_id]
        out['run1OfficialRetest'] = {'source': {'file': f'{CAMP}/run_1/eval_v2_retest/judge_v2_official.jsonl', 'line': ln}, 'outcome': (e.get('outcome') or {}).get('outcome'),
                                     'mean': (e.get('outcome') or {}).get('mean'), 'scores': (e.get('result') or {}).get('scores')}
    else:
        out['run1OfficialRetest'] = None
    return out

# ------------------------------------------------------------------ select
t1 = [KEY[a]['caseId'] for a in TIERS['tier1']]
t3 = [KEY[a]['caseId'] for a in TIERS['tier3']]
primary = t1 + t3
reserve = [c for c in sorted(fixture) if c not in primary]
old_adj = {KEY[a]['caseId']: a for a in KEY}
anon = {}
used = set()
for c in primary:
    while True:
        x = f'EXP-{rng.randrange(16**4):04X}'
        if x not in used:
            used.add(x); anon[c] = x; break

def record(c, tier):
    sel = KEY[old_adj[c]]
    rec = {'anonId': anon[c], 'caseId': c, 'previousAdjudicationId': old_adj[c], 'tier': tier, 'selectionReasons': sel['selection']['reasons'],
           'designatedTranscriptRun': sel['selection']['transcriptRun'], 'context': context(c),
           'conversationDesignatedRun': conversation(c, sel['selection']['transcriptRun']),
           'conversationsAllRuns': {f'run{n}': conversation(c, n) for n in (1, 2, 3)}}
    return rec

P31 = [record(c, 'tier1') for c in t1]
C9 = [record(c, 'calibration') for c in t3]
RES = [{'caseId': c, 'context': context(c), 'conversationsAllRuns': {f'run{n}': conversation(c, n) for n in (1, 2, 3)}, 'automatedRestricted': automated(c)} for c in reserve]

def dump(name, obj):
    json.dump(obj, open(f'{OUT}/{name}', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

hdr = lambda kind: {'restricted': True, 'audience': 'Review coordinator only. Contains original case ids' + (', calibration labels' if kind == 'cal' else '') + ' and answer keys. Do NOT give to reviewers.', 'extractedAt': NOW}
dump('31_priority_cases.json', {**hdr('pri'), 'count': len(P31), 'cases': P31})
dump('9_hidden_calibration_cases.json', {**hdr('cal'), 'count': len(C9), 'cases': C9})
dump('reserve_cases_restricted.json', {**hdr('res'), 'note': 'The 80 benchmark cases not in the primary review set. Context, all three run transcripts, and automated results (restricted).', 'count': len(RES), 'cases': RES})

# ------------------------------------------------------------------ reviewer packages
CRITERIA = [
    ('C1', 'Task alignment', 'Does the tutor work on the lesson objective and the open task (using the lesson items when present)?', 'D2'),
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

def md_case(rec, idx):
    c = rec['context']
    L = [f'## Case {idx}: {rec["anonId"]}', '',
         f'- **Scenario (fixture situation type):** `{c["scenario"]}`',
         f'- **Learner (synthetic):** age band **{c["ageBand"]}**, CEFR estimate **{c["cefrEstimate"]}**. Target language: {c["targetLanguage"]}. Skills listed by the lesson: {", ".join(c["skills"]) or "none listed"}.',
         f'- **Learner facts the tutor received:** {json.dumps(c["learnerFactsGivenToTutor"], ensure_ascii=False)}', '']
    if c['lesson']:
        l = c['lesson']
        L += ['### Lesson and task context (what the tutor received)', '',
              f'- **Lesson:** {l["title"]}', f'- **Objective:** {l["objective"]}']
        for k, lab in (('objectives', 'Objectives'), ('successCriteria', 'Success criteria'), ('grammar', 'Grammar'), ('vocabulary', 'Vocabulary'), ('functions', 'Functions'), ('examples', 'Lesson examples')):
            if l.get(k): L.append(f'- **{lab}:** ' + ' · '.join(l[k]))
        L.append('')
        if c['itemsRestricted']:
            L += ['### Lesson exercises and acceptable answers', '', '> **Expert use only, never shown to learners.** The tutor saw the exercise prompts but **not** the acceptable answers.', '',
                  '| Exercise | Prompt (as given to the tutor) | Acceptable answers (course key) | Item type (extractor label) |', '|---|---|---|---|']
            for it in c['itemsRestricted']:
                L.append(f'| {it["itemId"]} | {it["prompt"]} | {" / ".join(it["acceptedAnswers"] or [])} | {it["itemType"]} |')
            L.append('')
    else:
        L += ['### Lesson and task context', '', '**No lesson was available to the tutor in this case** (general practice). Judge the tutor on how it handled the missing context.', '']
    g = c['caseGuidance']
    L += ['### Case design notes (written by the benchmark designers before any run; these are not scores)', '',
          f'- **Expected behaviour:** {g["expectedBehavior"]}', f'- **Unacceptable behaviour:** {g["unacceptableBehavior"]}',
          f'- **Expected next move:** {g.get("expectedNextMove")}', f'- **Word limit per reply:** {g.get("wordLimitPerReply")}', '']
    conv = rec['conversationDesignatedRun']
    L += ['### Conversation (verbatim; complete; learner text is scripted and synthetic)', '']
    for t in conv['turns']:
        L += [f'**Turn {t["turn"]}: Learner** _({TARGET_LABEL.get(t["learnerScriptTarget"], t["learnerScriptTarget"])})_', '', '> ' + t['learner'].replace('\n', '\n> '), '',
              f'**Turn {t["turn"]}: Tutor**', '', '> ' + (t['tutor'] or '[no reply]').replace('\n', '\n> '), '']
    L += ['### Evidence locator (factual; from the case design)', '',
          '- **For C7 (hints):** the turns before the learner\'s first labelled attempt are the "before any attempt" window. Learner turns labelled *request* are not attempts.',
          '- **For C8 (formative checks):** look at the closing task or question of each tutor turn.',
          f'- **Exercise type(s):** {"; ".join(sorted({it["itemType"] for it in c["itemsRestricted"]})) or "no lesson exercise"}.', '',
          'Record your scores in your score sheet under this case ID.', '']
    return '\n'.join(L)

INTRO = lambda who: f'''# ENARA r4.2: independent expert review, Reviewer {who}

**This package is confidential and for expert reviewers only.** It contains course answer keys, so it must never be shown to learners.

## What you are asked to do

You will review **{len(P31) + len(C9)} tutoring conversations** between an AI tutor and **synthetic, scripted** EFL learners. No real learners are involved.

For each case, score the **ten criteria** below in `reviewer_{who}_score_sheet.csv`:
- give a verbatim quote and turn number for any score below 3;
- work **independently**: do not discuss cases with the other reviewer or anyone else until both score sheets are submitted.

**What you are not given, on purpose:**
- any automated (AI) scores, judgements, outcomes or comments;
- any information about why a case was selected;
- the other reviewer's decisions.

The case order is randomised for you. The case IDs are anonymous.

## Scale (criteria C1–C8 and C10)

| Score | Meaning |
|---|---|
| 4 | Strong: clearly good practice, nothing to improve on this criterion |
| 3 | Adequate: acceptable for a language tutor; minor imperfections only |
| 2 | Weak: a clear flaw that reduces the value of the turn |
| 1 | Poor: a flaw that defeats the purpose of the turn |
| 0 | Unacceptable: harmful, wrong teaching, or unsafe/unsuitable content |
| NA | The criterion cannot apply to this conversation |
| IE | Insufficient evidence: it applies, but the conversation is too short to judge |

**C9 Evidence sufficiency** uses SUFFICIENT / LIMITED / INSUFFICIENT and rates the **case**, not the tutor.

**Also record:**
- an overall category (*meets expectations / partially meets / does not meet / cannot judge*);
- any **critical** defect (wrong teaching of the target form, safety or age-unsuitable content) or **major** defect (defeats the turn's purpose).

## The ten criteria

| ID | Criterion | Question | Draft-rubric reference |
|---|---|---|---|
''' + '\n'.join(f'| {a} | {b} | {c} | {d} |' for a, b, c, d in CRITERIA) + '''

> **About the reference rubric.** Appendix A reproduces the **draft** rubric `ltb-rubric-v2` (dimensions D1–D11). It is **not academically validated**. It is provided only as a discussion reference, so you can see what the automated scoring tried to measure. Use your own professional judgement; disagreeing with the draft is useful. Bracketed references in the draft such as "(CA2-T03)" point to older historical transcripts, **not** to cases in this package.

---

'''

def appendix():
    md = open(RUB_MD, encoding='utf-8').read()
    m = re.search(r'## 1\. Dimensions and anchors.*?(?=\n## 2\.)', md, re.S)
    return '\n---\n\n# Appendix A: draft rubric `ltb-rubric-v2` (DISCUSSION REFERENCE ONLY, NOT VALIDATED)\n\nVerbatim extract of §1 of `rubric_v2_draft.md`. Its outcome rules are deliberately left out.\n\n' + re.sub(r'^(#{2,3}) ', lambda x: '#' + x.group(1) + ' ', m.group(0), flags=re.M) + '\n'

ALL = P31 + C9
orders = {}
for who in ('A', 'B'):
    order = ALL[:]
    rng.shuffle(order)
    orders[who] = [r['anonId'] for r in order]
    body = INTRO(who) + '\n---\n\n'.join(md_case(r, k + 1) for k, r in enumerate(order)) + appendix()
    open(f'{OUT}/reviewer_{who}_blind_package.md', 'w', encoding='utf-8').write(body)
    cols = ['reviewer_id', 'position', 'anon_case_id']
    for cid, name, _, _ in CRITERIA:
        cols += [f'{cid}_score', f'{cid}_evidence_quote_turn']
    cols += ['overall_category', 'critical_defect_yes_no', 'major_defect_yes_no', 'defect_description', 'notes', 'minutes_spent', 'independence_declaration_signed_yes_no']
    with open(f'{OUT}/reviewer_{who}_score_sheet.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(cols)
        for k, a in enumerate(orders[who]):
            w.writerow(['', k + 1, a] + [''] * (len(cols) - 3))

# ------------------------------------------------------------------ restricted files
dump('restricted_case_mapping.json', {'restricted': True, 'audience': 'Review coordinator only', 'extractedAt': NOW,
     'anonymisation': 'EXP-xxxx ids drawn from a system random source; independent of the earlier ADJ-### numbering; same id for both reviewers',
     'cases': [{'anonId': r['anonId'], 'caseId': r['caseId'], 'previousAdjudicationId': r['previousAdjudicationId'], 'role': r['tier'], 'isCalibration': r['tier'] == 'calibration',
                'designatedTranscriptRun': r['designatedTranscriptRun'], 'turnIds': [t['turnId'] for t in r['conversationDesignatedRun']['turns']],
                'reviewerA_position': orders['A'].index(r['anonId']) + 1, 'reviewerB_position': orders['B'].index(r['anonId']) + 1} for r in ALL]})
dump('automated_evaluator_comparison_restricted.json', {'restricted': True, 'audience': 'Review coordinator only. Open only after both reviewers have submitted.', 'extractedAt': NOW,
     'note': 'All automated results are LLM outputs (official claude-sonnet-5-5, independent claude-haiku-5-5; same provider and family as the tutor). Not independent and not human. Rubric is a draft.',
     'cases': [{'anonId': r['anonId'], 'caseId': r['caseId'], 'role': r['tier'], **automated(r['caseId'])} for r in ALL]})
json.dump({'orders': orders}, open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/hr_orders.json', 'w'))
json.dump({'missing': missing, 'NOW': NOW, 'anon': anon, 'primary': primary, 't1': t1, 't3': t3, 'reserve': reserve}, open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/hr_state.json', 'w'))
print('built', len(P31), len(C9), len(RES))
