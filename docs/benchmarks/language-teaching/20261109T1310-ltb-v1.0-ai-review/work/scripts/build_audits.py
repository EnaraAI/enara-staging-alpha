"""Phase 3 targeted audits + Phase 4 adjudication task builder. Runs after the blind reviews are hashed.
Usage: python3 build_audits.py <REV> <RUN> <R3RUN> audits|adjudication"""
import csv, json, random, sys
REV, RUN, R3, MODE = sys.argv[1:5]
DIMS = ['learner_context_fidelity', 'lesson_alignment', 'pedagogical_appropriateness', 'scaffolding_adaptation',
        'age_proficiency_fit', 'formative_check_evidence', 'clarity_accessibility']
cases = {c['id']: c for c in (json.loads(l) for l in open(f'{RUN}/benchmark_cases.jsonl'))}
raw = {r['caseId']: r for r in (json.loads(l) for l in open(f'{RUN}/raw_results.jsonl'))}
rows = {r['caseId']: r for r in csv.DictReader(open(f'{RUN}/case_scores.csv'))}
judge = {j['caseId']: j['result'] for j in (json.loads(l) for l in open(f'{RUN}/judge_results.jsonl')) if j['pass'] == 1}
rev = {j['case_id']: j for j in (json.loads(l) for l in open(f'{REV}/independent_case_reviews.jsonl'))}
rubric = json.load(open(f'{RUN}/rubric_v1.json'))

def case_view(cid):
    c = cases[cid]; last = raw[cid]['turns'][-1].get('languageTurn') or {}
    return {'case_id': cid, 'trustedAgeBand': last.get('ageBand', c['cohort']), 'cefrEstimate': c['cefr'], 'situationType': c['caseType'],
            'lesson': ({'title': c['lesson']['title'], 'objective': c['lesson']['objective'], 'spec': c['lesson'].get('spec'), 'exercise': c['lesson'].get('exercise')} if c.get('lesson') else None), 'learnerGoal': c['learner'].get('goal'),
            'expectedBehavior': c['expectedBehavior'], 'unacceptableBehavior': c['unacceptableBehavior'], 'wordLimitPerReply': c['structuredExpectations'].get('maxWords')}

def transcript(r):
    return '\n\n'.join(f"LEARNER (turn {i+1}): {t['learner']}\nTUTOR (turn {i+1}): {t.get('reply') or '[no reply]'}" for i, t in enumerate(r['turns']))

def flagged(cat):
    return [cid for cid in sorted(rows) if cat in rows[cid]['failures']]

BASE = ('You are an independent auditor of AI language-tutor conversations (English as a foreign language). Synthetic data. '
        'Use only what is visible in the transcript. Do not invent external facts. Quote tutor/learner text VERBATIM. '
        'Never infer learning gains or real outcomes. Reply with ONLY one JSON object, no prose, no code fence.')
tasks = []
if MODE == 'audits':
    # A. factual errors flagged by the official judge
    for cid in flagged('factual_error'):
        notes = [f for f in judge[cid].get('failures', []) if f.get('category') == 'factual_error']
        tasks.append({'taskId': f'A:{cid}', 'system': BASE + ' Task: factual-correctness audit of an English-language claim flagged by another evaluator.', 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nTRANSCRIPT:\n{transcript(raw[cid])}\n\nFLAG RAISED BY ANOTHER EVALUATOR (may be wrong): {json.dumps(notes, ensure_ascii=False)}\n\n"
            'Locate the exact tutor statement the flag refers to (if none matches, say so). Classify it as exactly one of CONFIRMED_FACTUAL_ERROR, TECHNICALLY_CORRECT_BUT_MISLEADING, ACCEPTABLE_SIMPLIFICATION, FALSE_POSITIVE, CANNOT_DETERMINE, NEEDS_EXTERNAL_VERIFICATION. '
            'JSON shape: {"classification":"...","tutor_statement":"verbatim","turn":n,"context":"what the learner asked/did","explanation":"why, about English usage","severity":"critical|major|minor|none","could_mislead_learner":true|false,"recommended_remediation":"...","claim_needing_external_verification":null|"exact claim"}'})
    # C. ignored learner replies
    for cid in flagged('ignored_learner_reply'):
        notes = [f for f in judge[cid].get('failures', []) if f.get('category') == 'ignored_learner_reply']
        tasks.append({'taskId': f'C:{cid}', 'system': BASE + ' Task: decide whether the tutor ignored what the learner actually wrote.', 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nTRANSCRIPT:\n{transcript(raw[cid])}\n\nFLAG RAISED BY ANOTHER EVALUATOR (may be wrong): {json.dumps(notes, ensure_ascii=False)}\n\n"
            'For the learner turn(s) concerned, classify as exactly one of ACTUALLY_IGNORED (the tutor did not respond to what the learner wrote), ACKNOWLEDGED_NOT_USED (acknowledged it but did not use it to decide the next step), RESPONDED_APPROPRIATELY (the flag is not supported). '
            'JSON shape: {"classification":"...","severity":"major|minor|none","learner_turn":n,"learner_text":"verbatim","tutor_response":"verbatim excerpt","what_the_tutor_should_have_done":"...","explanation":"..."}'})
    # D. verbosity
    for cid in flagged('verbosity'):
        words = [len((t.get('reply') or '').split()) for t in raw[cid]['turns']]
        targets = [((t.get('languageTurn') or {}).get('lengthTarget') or {}) for t in raw[cid]['turns']]
        tasks.append({'taskId': f'D:{cid}', 'system': BASE + ' Task: verbosity audit. Do not apply a universal word limit; judge the effect of length on comprehension and participation for this age band and CEFR level.', 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nTRANSCRIPT:\n{transcript(raw[cid])}\n\nTUTOR REPLY WORD COUNTS PER TURN: {words}\n\n"
            'JSON shape: {"unnecessary_explanation":true|false,"repetition":true|false,"cognitive_overload":true|false,"reduced_learner_participation":true|false,"tutor_dominates":true|false,"length_appropriate_for_age_and_cefr":true|false,'
            '"classification":"HARMFUL_VERBOSITY|MILD_EXCESS|ACCEPTABLE_LENGTH","what_could_be_cut":"verbatim excerpt or null","explanation":"..."}'})
    # B. teen cohort register (all teen cases)
    for cid in sorted(c for c in cases if cases[c]['cohort'] == 'teen'):
        words = [len((t.get('reply') or '').split()) for t in raw[cid]['turns']]
        tasks.append({'taskId': f'B:{cid}', 'system': BASE + ' Task: teen-register audit. The trusted age band is teen. Age and language proficiency are not interchangeable: a teen at A1 needs simple English but not childish content or tone.', 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nTRANSCRIPT:\n{transcript(raw[cid])}\n\nTUTOR REPLY WORD COUNTS PER TURN: {words}\n\n"
            'Rate each 0-2 (0 problem, 1 minor issue, 2 fine): language_maturity, examples, explanation_depth, cognitive_complexity, verbosity, learner_participation, cefr_alignment. '
            'JSON shape: {"ratings":{"language_maturity":n,"examples":n,"explanation_depth":n,"cognitive_complexity":n,"verbosity":n,"learner_participation":n,"cefr_alignment":n},"classification":"APPROPRIATE|MINOR_REGISTER_ISSUE|MATERIAL_REGISTER_PROBLEM","childish_or_too_adult":"childish|too_adult|neither","evidence":"verbatim excerpt","explanation":"..."}'})
    # E. regressions: pairwise r3 vs latest (anonymised, randomised order)
    r3raw = {r['caseId']: r for r in (json.loads(l) for l in open(f'{R3}/raw_results.jsonl'))}
    rng = random.Random(20261109)
    order = {}
    for cid in ['LTB-CA1-T04', 'LTB-CA1-T06', 'LTB-CA1-T13', 'LTB-CA2-T03', 'LTB-TA1-T07', 'LTB-TA2-T13', 'LTB-AA1-T09', 'LTB-AA2-T04', 'LTB-AA2-T11']:
        flip = rng.random() < 0.5; order[cid] = 'X=latest,Y=r3' if flip else 'X=r3,Y=latest'
        X, Y = (raw[cid], r3raw[cid]) if flip else (r3raw[cid], raw[cid])
        tasks.append({'taskId': f'E:{cid}', 'system': BASE + ' Task: compare two tutor conversations for the SAME case and learner turns against the frozen rubric. Rubric: ' + json.dumps({'dimensions': rubric['dimensions']}, ensure_ascii=False), 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nCONVERSATION X:\n{transcript(X)}\n\nCONVERSATION Y:\n{transcript(Y)}\n\n"
            'Score each conversation on the seven rubric dimensions (0-4; n/a only for scaffolding_adaptation on single-turn cases). Then say which is better supported by the rubric, and whether the difference is a genuine pedagogical difference or ordinary variation of equivalent quality. '
            'JSON shape: {"scores_X":{dim:n},"scores_Y":{dim:n},"better":"X|Y|EQUIVALENT","difference_type":"GENUINE_PEDAGOGICAL_DIFFERENCE|ORDINARY_VARIATION","exact_reason":"...","evidence_X":"verbatim","evidence_Y":"verbatim"}'})
    json.dump(order, open(f'{REV}/work/regression_pair_order.json', 'w'), indent=1)
elif MODE == 'adjudication':
    cmp_ = json.load(open(f'{REV}/work/comparison.json'))
    rng = random.Random(1109); order = {}
    for cid in cmp_['disagreements']:
        C = cmp_['cases'][cid]; r = rev[cid]
        A_orig = {'outcome': C['official'], 'scores': C['officialScores'], 'rationale': C['officialRationale'], 'failures': C['officialFailureNotes']}
        A_ind = {'outcome': C['independent'], 'scores': C['independentScores'], 'failures': r.get('failure_tags'), 'evidence': [{'turn': e.get('turn'), 'quote': e.get('quote'), 'supports': e.get('supports')} for e in r.get('evidence', [])], 'notes': r.get('reviewer_notes')}
        flip = rng.random() < 0.5; order[cid] = 'A=independent,B=original' if flip else 'A=original,B=independent'
        A, B = (A_ind, A_orig) if flip else (A_orig, A_ind)
        det = C['detFail']
        tasks.append({'taskId': f'ADJ:{cid}', 'system': BASE + ' Task: adjudicate between two evaluations of the same conversation under a frozen rubric. Neither evaluator is presumed right. Decide from the transcript. Rubric: ' + json.dumps({'scale': rubric['scale'], 'dimensions': rubric['dimensions'], 'severity': rubric['severity']}, ensure_ascii=False)
            + ' Outcome rule (frozen): MEETS = all deterministic checks pass, no dimension below 2, mean of scored dimensions >= 3.0, no critical failure; DOES_NOT_MEET = any critical failure or any dimension 0; otherwise PARTIAL.', 'user':
            f"CASE:\n{json.dumps(case_view(cid), ensure_ascii=False, indent=1)}\n\nTRANSCRIPT:\n{transcript(raw[cid])}\n\nDETERMINISTIC CHECKS FAILED: {det or 'none'}\n\nEVALUATION A:\n{json.dumps(A, ensure_ascii=False)}\n\nEVALUATION B:\n{json.dumps(B, ensure_ascii=False)}\n\n"
            'List the disputed dimensions, decide each from transcript evidence, and give the outcome the evidence supports. If the evidence does not clearly favour one evaluation (e.g. the case sits on the 3.0 boundary and both readings are defensible), choose UNRESOLVED. '
            'JSON shape: {"disputed_dimensions":[...],"per_dimension":{dim:{"supported_score":n,"reason":"..."}},"supported_outcome":"MEETS|PARTIAL|DOES_NOT_MEET","favours":"A|B|UNRESOLVED","evidence":"verbatim tutor quote with turn","confidence":"low|medium|high","explanation":"..."}'})
    json.dump(order, open(f'{REV}/work/adjudication_order.json', 'w'), indent=1)
path = f'{REV}/work/{MODE}_tasks.jsonl'
with open(path, 'w') as f:
    for t in tasks: f.write(json.dumps(t, ensure_ascii=False) + '\n')
print(MODE, len(tasks), 'tasks ->', path, 'chars', sum(len(t['system']) + len(t['user']) for t in tasks))
