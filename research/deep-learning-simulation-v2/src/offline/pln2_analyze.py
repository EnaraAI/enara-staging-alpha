# SIMULATION ONLY. NO API. planner2 study (PLN2) analysis, fixed before any session ran (config/agent_sim_pln2/PROTOCOL.md sections 8-10).
# Everything here is DESCRIPTIVE (n = 12 learners per group, one replication). Pass rules (PROTOCOL section 9):
#   no-harm:  overall delayed primary-score difference P2 - OFF, paired 95% percentile bootstrap CI lower bound > -0.05, AND no group mean difference < -0.05;
#   fit:      on every group, the P2 mean score on the group's OWN rubric items >= the OFF mean, AND P2 quick-check compliance >= 95% (P2 TTT sessions);
#   judges:   event-judge agreement >= 85% AND fit-judge agreement (exact item scores) >= 85%, no missing cases.
#   Overall PASS only if all three hold and the data are complete (48 learners x 2 arms, 5 judged rounds, 3 tests, 96 fit cases).
# Delayed primary score = share of the PRIMARY items' points (gap-fill and choice items; ESL6 DECISIONS 11) on the delayed form.
# Bootstrap: 10,000 resamples of learners (paired differences), seed 7; group CIs resample within the group, the overall CI over all 48.
# Quick-check compliance: a P2 TTT session that had at least one quick-check turn is compliant when the fit judge scores `test_first_clean` 2 AND no
#   quick-check turn gave a lesson item's answer (leakFinal or earlyLeakFinal > 0). Teaching words in quick-check turns are counted (descriptive only).
# Usage: python3 src/offline/pln2_analyze.py reports/exp4/agent_sim_pln2   -> ANALYSIS.json and ANALYSIS.md in that folder; tables also printed.
import json, os, random, sys
from collections import Counter, defaultdict

D = sys.argv[1]
ARMS = ('OFF', 'P2'); GROUPS = ('TASK', 'TTT', 'LAD', 'KIDPPP'); ROUNDS = 5; N_PER_GROUP = 12
RUBRIC = {
    'TASK': ['task_goal', 'feedback_after_task', 'task_repeat'],
    'TTT': ['test_first_clean', 'teach_targets_gaps', 'retest_end'],
    'LAD': ['story_chant', 'listen_do_steps', 'child_tone'],
    'KIDPPP': ['short_sentences', 'one_instruction', 'praise_effort', 'game_story', 'ppp_order'],
}
COMMON = ['age_fit', 'teacher_accept']
EXPECTED_SHAPES = {'TASK': {'TASK'}, 'TTT': {'TTT', 'PPP'}, 'LAD': {'LAD'}, 'KIDPPP': {'PPP'}}
L1_CODES = ('article_omitted', 'copula_omitted', 'progressive_no_be', 'be_with_base_verb', 'subject_doubled', 'resumptive_pronoun', 'age_with_have')
J = lambda f: json.load(open(os.path.join(D, f))) if os.path.exists(os.path.join(D, f)) else None
post = J('POST.json') or []; tags = J('TAGS.json') or []; stuck = J('STUCK.json') or []; fit = J('FIT.json') or []
fit_ag = J('FIT_AGREEMENT.json'); ev_ag = J('JUDGE_AGREEMENT.json'); recheck = J('GRADER_RECHECK.json')
mean = lambda xs: sum(xs) / len(xs) if xs else None
r4 = lambda x: None if x is None else round(x, 4)


def boot(d, B=10000, seed=7):
    if not d: return [None, None]
    rnd = random.Random(seed); n = len(d)
    ms = sorted(sum(d[rnd.randrange(n)] for _ in range(n)) / n for _ in range(B))
    return [r4(ms[int(0.025 * B)]), r4(ms[int(0.975 * B) - 1])]


# ---------------------------------------------------------------------------------------------- scores per learner and arm
by = defaultdict(dict)  # learner -> arm -> post row
for r in post: by[r['learner']][r['arm']] = r
group_of = {r['learner']: r['group'] for r in post}


def pct(r, time, what):
    a = (r.get('assess') or {}).get(time)
    if not a: return None
    if what == 'primary': return a['primary'] / a['primaryMax'] if a['primaryMax'] else None
    return a['pct']


def diff_block(time, what):
    out = {}
    for g in (*GROUPS, 'ALL'):
        ls = [l for l in sorted(by) if (g == 'ALL' or group_of[l] == g) and all(a in by[l] for a in ARMS)]
        pairs = [(pct(by[l]['OFF'], time, what), pct(by[l]['P2'], time, what)) for l in ls]
        pairs = [p for p in pairs if None not in p]
        d = [b - a for a, b in pairs]
        out[g] = {'n': len(d), 'OFF': r4(mean([a for a, _ in pairs])), 'P2': r4(mean([b for _, b in pairs])), 'diff': r4(mean(d)), 'ci95': boot(d),
                  'P2_better': sum(x > 1e-9 for x in d), 'same': sum(abs(x) <= 1e-9 for x in d), 'OFF_better': sum(x < -1e-9 for x in d)}
    return out


delayed = diff_block('del', 'primary'); immediate = diff_block('imm', 'primary'); delayed_whole = diff_block('del', 'whole'); pre = diff_block('pre', 'primary')

# ---------------------------------------------------------------------------------------------- turn tags: stuck, two asks, leaks
turn_stats = {}
for g in (*GROUPS, 'ALL'):
    turn_stats[g] = {}
    for a in ARMS:
        ts = [t for t in tags if t['arm'] == a and (g == 'ALL' or t['group'] == g)]
        turn_stats[g][a] = {
            'turns': len(ts), 'twoAsks': sum(bool(t['twoAsks']) for t in ts), 'twoAsksRaw': sum(bool(t.get('twoAsksRaw')) for t in ts),
            'earlyLeakTurns': sum(t.get('earlyLeakFinal', 0) > 0 for t in ts), 'earlyLeaks': sum(t.get('earlyLeakFinal', 0) for t in ts),
            'answersAfterTwoFails': sum(t.get('lateAnswerFinal', 0) for t in ts), 'answerReleased': sum(bool(t.get('answerReleased')) for t in ts),
            'meanWords': r4(mean([t.get('words', 0) for t in ts])),
            'stuckRuns': sum(1 for s in stuck if s['arm'] == a and (g == 'ALL' or s['group'] == g)),
        }

# ---------------------------------------------------------------------------------------------- planner shapes and stages (P2), TTT quick-check split
p2 = [t for t in tags if t['arm'] == 'P2' and t.get('planner')]
lab = lambda p: f"{p.get('shape')}/{p.get('stage')}{'/QC' if p.get('quickCheck') else ''}"
shape_dist = {g: dict(Counter(lab(t['planner']) for t in p2 if t['group'] == g)) for g in GROUPS}
shape_by_turn = {g: {k: dict(Counter(f"{t['planner'].get('shape')}:{t['planner'].get('shapeRule')}:{t['planner'].get('stage')}" for t in p2 if t['group'] == g and t['turn'] == k)) for k in range(1, ROUNDS + 1)} for g in GROUPS}
method_dist = {g: dict(Counter(f"{t['planner'].get('methodRule')}:{t['planner'].get('primary')}" for t in p2 if t['group'] == g)) for g in GROUPS}
off_method = {g: dict(Counter(t['planner'].get('primary') for t in tags if t['arm'] == 'OFF' and t['group'] == g and t.get('planner'))) for g in GROUPS}
shape_match = {}
for g in GROUPS:
    ts = [t for t in p2 if t['group'] == g]; m = sum(1 for t in ts if t['planner'].get('shape') in EXPECTED_SHAPES[g])
    shape_match[g] = {'turns': len(ts), 'match': m, 'rate': r4(m / len(ts)) if ts else None}
l1 = {'turnsWithL1Misconception': sum(1 for t in p2 if t['planner'].get('l1Misconception')), 'turnsWithP1Contrast': sum(1 for t in p2 if t['planner'].get('methodRule') == 'P1_L1_CONTRAST'),
      'arabicTransferDiagnoses': {f'{a}:{c}': n for (a, c), n in sorted(Counter((t['arm'], t['diagnosis']) for t in tags if t.get('diagnosis') in L1_CODES).items())}}
ttt_split = {'sessions': 0, 'resolved': 0, 'twoOrMore_TTT': 0, 'underTwo_PPP': 0, 'stillPending_at_turn5': 0, 'learners': {}}
for l in sorted(by):
    if group_of[l] != 'TTT': continue
    ts = sorted([t for t in p2 if t['learner'] == l], key=lambda t: t['turn'])
    if not ts: continue
    ttt_split['sessions'] += 1; last = ts[-1]['planner']; q = (last.get('progress') or {}).get('quickCheck')
    if last.get('shapeRule') == 'S4q' or not q: ttt_split['stillPending_at_turn5'] += 1; ttt_split['learners'][l] = 'pending'
    else:
        ttt_split['resolved'] += 1
        if q['right'] * 3 >= q['of'] * 2: ttt_split['twoOrMore_TTT'] += 1
        else: ttt_split['underTwo_PPP'] += 1
        ttt_split['learners'][l] = f"{q['right']}/{q['of']} -> {last.get('shape')}"
ttt_split['predicted'] = (J('LEARNERS.json') or {}).get('predictedQuickCheck', {}).get('twoOrMore')

# ---------------------------------------------------------------------------------------------- fit scores
fit_rows = defaultdict(lambda: defaultdict(list))  # group -> arm -> rows
for r in fit: fit_rows[r['group']][r['arm']].append(r)
fit_table = {}
for g in GROUPS:
    t = {}
    for k in RUBRIC[g] + COMMON:
        o = [r['items'][k] for r in fit_rows[g]['OFF']]; p = [r['items'][k] for r in fit_rows[g]['P2']]
        t[k] = {'OFF': r4(mean(o)), 'P2': r4(mean(p)), 'diff': r4(mean(p) - mean(o)) if o and p else None}
    own = {a: [mean([r['items'][k] for k in RUBRIC[g]]) for r in fit_rows[g][a]] for a in ARMS}
    paired = {}
    for a in ARMS:
        for r in fit_rows[g][a]: paired.setdefault(r['learner'], {})[a] = mean([r['items'][k] for k in RUBRIC[g]])
    d = [v['P2'] - v['OFF'] for v in paired.values() if 'OFF' in v and 'P2' in v]
    t['_ownRubric'] = {'OFF': r4(mean(own['OFF'])), 'P2': r4(mean(own['P2'])), 'diff': r4(mean(d)), 'ci95': boot(d), 'n': len(d)}
    fit_table[g] = t

# ---------------------------------------------------------------------------------------------- quick-check compliance (P2 TTT)
fit_by_session = {r['session']: r for r in fit}
qc = {'sessions': 0, 'compliant': 0, 'violations': [], 'qcTurns': 0, 'qcTurnsWithAnswer': 0, 'qcTurnsWithTeachWords': 0}
for l in sorted(by):
    if group_of[l] != 'TTT' or 'P2' not in by[l]: continue
    qts = [t for t in p2 if t['learner'] == l and t['planner'].get('quickCheck')]
    if not qts: continue
    qc['sessions'] += 1; qc['qcTurns'] += len(qts)
    leak = [t['turn'] for t in qts if t.get('leakFinal', 0) > 0 or t.get('earlyLeakFinal', 0) > 0]
    qc['qcTurnsWithAnswer'] += len(leak); qc['qcTurnsWithTeachWords'] += sum(bool(t.get('qcTeachWords')) for t in qts)
    fr = fit_by_session.get(f's{l}_P2_r1'); judged = fr['items'].get('test_first_clean') if fr else None
    if judged == 2 and not leak: qc['compliant'] += 1
    else: qc['violations'].append({'learner': l, 'test_first_clean': judged, 'answerInTurns': leak})
qc['rate'] = r4(qc['compliant'] / qc['sessions']) if qc['sessions'] else None
qc['offTTT_test_first_clean'] = r4(mean([r['items']['test_first_clean'] for r in fit_rows['TTT']['OFF']]))

# ---------------------------------------------------------------------------------------------- completeness and pass rules
missing = []
for l in sorted(by):
    for a in ARMS:
        r = by[l].get(a)
        if not r: missing.append(f'{l}:{a}:no session'); continue
        if r['rounds'] != ROUNDS: missing.append(f'{l}:{a}:rounds {r["rounds"]}')
        for tm in ('pre', 'imm', 'del'):
            if tm not in (r.get('assess') or {}): missing.append(f'{l}:{a}:{tm}')
if len(by) != 4 * N_PER_GROUP: missing.append(f'learners {len(by)} of {4 * N_PER_GROUP}')
if len(fit) != 2 * 4 * N_PER_GROUP: missing.append(f'fit cases {len(fit)} of {2 * 4 * N_PER_GROUP}')
if not ev_ag: missing.append('JUDGE_AGREEMENT.json')
if not fit_ag: missing.append('FIT_AGREEMENT.json')
complete = not missing

no_harm = {'overallCiLower': delayed['ALL']['ci95'][0], 'groupDiffs': {g: delayed[g]['diff'] for g in GROUPS}}
no_harm['pass'] = no_harm['overallCiLower'] is not None and no_harm['overallCiLower'] > -0.05 and all(v is not None and v >= -0.05 for v in no_harm['groupDiffs'].values())
fit_rule = {'ownRubric': {g: fit_table[g]['_ownRubric'] for g in GROUPS}, 'quickCheckCompliance': qc['rate']}
fit_rule['pass'] = all(fit_table[g]['_ownRubric']['P2'] is not None and fit_table[g]['_ownRubric']['OFF'] is not None and fit_table[g]['_ownRubric']['P2'] >= fit_table[g]['_ownRubric']['OFF'] for g in GROUPS) and qc['rate'] is not None and qc['rate'] >= 0.95
judges = {'event': (ev_ag or {}).get('agreement'), 'eventMissing': (ev_ag or {}).get('missing'), 'fit': (fit_ag or {}).get('agreement'), 'fitWithin1': (fit_ag or {}).get('within1')}
judges['pass'] = bool(ev_ag and fit_ag and ev_ag.get('missing') == 0 and (ev_ag.get('agreement') or 0) >= 0.85 and (fit_ag.get('agreement') or 0) >= 0.85)
verdict = 'PASS' if complete and no_harm['pass'] and fit_rule['pass'] and judges['pass'] else 'NOT PASSED'

res = {'_label': 'SIMULATION ONLY', 'complete': complete, 'missing': missing[:50], 'verdict': verdict,
       'passRules': {'noHarm': no_harm, 'fit': fit_rule, 'judges': judges},
       'delayedPrimary': delayed, 'immediatePrimary': immediate, 'delayedWholeForm': delayed_whole, 'pretestPrimary_balance': pre,
       'turnStats': turn_stats, 'quickCheck': qc, 'tttSplit': ttt_split, 'fit': fit_table,
       'plannerP2': {'shapeStage': shape_dist, 'shapeByTurn': shape_by_turn, 'methodRule': method_dist, 'shapeMatch': shape_match, 'l1': l1}, 'offPrimaryMethod': off_method,
       'graderRecheck': recheck and {k: recheck.get(k) for k in ('primaryAgreement', 'exactAgreement', 'freeExactAgreement', 'sampled', 'pass')}}
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1)

# ---------------------------------------------------------------------------------------------- tables
L = ['SIMULATION ONLY. PLN2 analysis (descriptive; n = 12 per group, one replication).', '', f'Data complete: {complete}' + ('' if complete else f' (missing: {", ".join(missing[:10])})'), f'Verdict (pre-registered pass rules): **{verdict}**', '']


def f(x):
    if x is None: return '-'
    if isinstance(x, float): return f'{x:+.3f}' if x < 0 else f'{x:.3f}'
    return str(x)


def score_table(title, blk):
    L.extend([f'### {title}', '', '| Group | n | OFF | P2 | P2 - OFF | 95% CI | P2 better / same / OFF better |', '|---|---|---|---|---|---|---|'])
    for g in (*GROUPS, 'ALL'):
        b = blk[g]; L.append(f"| {g} | {b['n']} | {f(b['OFF'])} | {f(b['P2'])} | {f(b['diff'])} | [{f(b['ci95'][0])}, {f(b['ci95'][1])}] | {b['P2_better']} / {b['same']} / {b['OFF_better']} |")
    L.append('')


score_table('Delayed test, primary items (no-harm measure)', delayed)
score_table('Immediate test, primary items', immediate)
score_table('Delayed test, whole form', delayed_whole)
score_table('Pre-test, primary items (balance check)', pre)
L.extend([f"No-harm rule: overall CI lower bound {f(no_harm['overallCiLower'])} > -0.05 and no group mean below -0.05 -> {'pass' if no_harm['pass'] else 'FAIL'}", ''])
L.extend(['### Turn tags', '', '| Group | Arm | turns | two asks | early-leak turns | answers after 2 fails | stuck runs | mean words |', '|---|---|---|---|---|---|---|---|'])
for g in (*GROUPS, 'ALL'):
    for a in ARMS:
        x = turn_stats[g][a]; L.append(f"| {g} | {a} | {x['turns']} | {x['twoAsks']} | {x['earlyLeakTurns']} | {x['answersAfterTwoFails']} | {x['stuckRuns']} | {f(x['meanWords'])} |")
L.append('')
L.extend(['### Fit scores (mean 0-2) by rubric item', '', '| Group | Item | OFF | P2 | P2 - OFF |', '|---|---|---|---|---|'])
for g in GROUPS:
    for k in RUBRIC[g] + COMMON:
        x = fit_table[g][k]; L.append(f"| {g} | {k} | {f(x['OFF'])} | {f(x['P2'])} | {f(x['diff'])} |")
    x = fit_table[g]['_ownRubric']; L.append(f"| {g} | **own rubric mean** | {f(x['OFF'])} | {f(x['P2'])} | {f(x['diff'])} [{f(x['ci95'][0])}, {f(x['ci95'][1])}] |")
L.extend(['', f"Quick-check compliance (P2 TTT): {qc['compliant']} of {qc['sessions']} sessions = {f(qc['rate'])} (violations: {qc['violations']}); quick-check turns {qc['qcTurns']}, with an answer {qc['qcTurnsWithAnswer']}, with teaching words (descriptive) {qc['qcTurnsWithTeachWords']}; OFF TTT test_first_clean mean {f(qc['offTTT_test_first_clean'])}.",
          f"Fit rule: P2 own-rubric mean >= OFF on every group and compliance >= 0.95 -> {'pass' if fit_rule['pass'] else 'FAIL'}", ''])
L.extend(['### Planner in P2: shape/stage per turn (expected: TASK->TASK, TTT->TTT or PPP after the check, LAD->LAD, KIDPPP->PPP)', '', '| Group | shape match | shape/stage counts | method rule:primary |', '|---|---|---|---|'])
for g in GROUPS:
    L.append(f"| {g} | {shape_match[g]['match']}/{shape_match[g]['turns']} | {', '.join(f'{k} {v}' for k, v in sorted(shape_dist[g].items()))} | {', '.join(f'{k} {v}' for k, v in sorted(method_dist[g].items()))} |")
L.extend(['', '| Group | turn | shape:rule:stage counts |', '|---|---|---|'])
for g in GROUPS:
    for k in range(1, ROUNDS + 1): L.append(f"| {g} | {k} | {', '.join(f'{x} {v}' for x, v in sorted(shape_by_turn[g][k].items()))} |")
L.extend(['', f"OFF primary method per group (turns): {off_method}",
          f"TTT quick-check split (P2): {ttt_split['sessions']} sessions; resolved {ttt_split['resolved']} ({ttt_split['twoOrMore_TTT']} with >= 2 of 3 -> TTT, {ttt_split['underTwo_PPP']} with < 2 -> PPP); still pending at turn 5: {ttt_split['stillPending_at_turn5']}; predicted from the start state: {ttt_split['predicted']} of 12 with >= 2.",
          f"Arabic transfer: P2 turns with the in-session l1_transfer misconception {l1['turnsWithL1Misconception']}, with the P1 contrast rule {l1['turnsWithP1Contrast']}; diagnoses {l1['arabicTransferDiagnoses']}.", ''])
L.extend(['### Judges', '', f"Event-judge agreement: {f(judges['event'])} (missing {judges['eventMissing']}); fit-judge agreement (exact item scores): {f(judges['fit'])} (within 1: {f(judges['fitWithin1'])}) -> {'pass' if judges['pass'] else 'FAIL'}",
          f"Grader recheck (reported): {res['graderRecheck']}", ''])
open(os.path.join(D, 'ANALYSIS.md'), 'w').write('\n'.join(L) + '\n')
print('\n'.join(L))
