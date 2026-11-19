# SIMULATION ONLY. NO API. ESL stage-6 confirmatory analysis, fixed before any session ran (config/agent_sim_esl6/PROTOCOL.md sections 8-11).
# Primary (the only confirmatory test; DECISIONS 11 and 14): LE - PP on the DELAYED score on the PRIMARY items (gap-fill and choice items; 4 points per
#   form, 3 on the 6 forms with a rewrite item; percent of those points), explicit-first learners (n = 270), each learner's two replications averaged.
#   Test: two-sided paired sign-flip, EXACT over all 2^n sign patterns by convolution when every difference lies on the 1/24 grid (k/8 or k/6 per arm
#   after averaging 2 replications), otherwise Monte Carlo with 100,000 draws, seed 6. alpha 0.05.
#   Interval: 95% percentile bootstrap of the mean difference, 10,000 resamples, seed 7.
# Secondary outcomes (descriptive only, section 9) and guards (section 10, all must pass):
#   1 two asks <= 2% of LE turns; 2 early leaks LE <= PP (ESL5 definition: completed answer of a lesson item the learner has not solved with < 2 genuine
#   failed attempts this session; the genuine-attempt count is rebuilt from the transcript and production facts by esl6Study.ts tags, the esl5_leak_recount
#   method, not from the engine counter; releases and answers after >= 2 attempts counted separately); 3 blind answer_protection LE >= PP;
#   4 judge agreement >= 85% overall AND >= 85% in the later agreement round (5; amendment A1), no missing cases; 5 grader recheck >= 95% exact agreement on the PRIMARY item types
#   (DECISIONS 9 and 11; all-exact agreement and free-item QWK reported, not guards) (GRADER_RECHECK.json from esl6Study.ts recheckscore).
# Decision (section 11): CONFIRMED only if p < 0.05 AND CI lower bound > 0 AND all five guards pass AND data complete (270 + 12 learners, both arms, both
#   replications, 5 judged rounds (amendment A1), 3 forms scored each); otherwise NOT CONFIRMED. B2 no-harm is reported next to the decision.
# The analysis refuses to decide on incomplete data (decision NOT CONFIRMED with complete = false, and the missing parts listed).
# Usage: python3 src/offline/esl6_analyze.py reports/exp4/agent_sim_esl6
ROUNDS = 5  # amendment A1 (2026-11-19, before round 1): one session of 5 turns, PROTOCOL §6; session-2 outputs are empty by design
import json, os, random, sys
from collections import defaultdict

D = sys.argv[1]
ARMS = ('PP', 'LE'); TIMES = ('pre', 'imm', 'del'); GRID = 24
J = lambda f: json.load(open(os.path.join(D, f))) if os.path.exists(os.path.join(D, f)) else None
rows = J('POST.json') or []
tags = J('TAGS.json') or []
stuck = J('STUCK.json') or []
mean = lambda xs: sum(xs) / len(xs) if xs else None
r4 = lambda x: None if x is None else round(x, 4)

by = defaultdict(lambda: defaultdict(dict))
for r in rows: by[r['learner']][r['arm']][r['rep']] = r
info = {r['learner']: r for r in rows}
EF = sorted(l for l in by if info[l]['explicitFirst']); B2 = sorted(l for l in by if not info[l]['explicitFirst'])


def score(r, time, what='pct'):
    a = (r.get('assess') or {}).get(time)
    if not a: return None
    if what == 'primary': return a['primary'] / a['primaryMax']
    if what == 'ecRewrite': return a['ecRewrite'] / a['ecRewriteMax'] if a.get('ecRewriteMax') else None
    if what == 'pct': return a['points'] / 12
    if what == 'free': return a['free'] / 6
    if what == 'mastery': return 1.0 if a['points'] / 12 >= 0.8 and a['items1to4'] >= 3 else 0.0
    raise ValueError(what)


def avg(l, arm, time, what='pct'):
    v = [score(by[l][arm][k], time, what) for k in (1, 2) if k in by[l][arm]]
    return sum(v) / 2 if len(v) == 2 and None not in v else None


# ------------------------------------------------------------------------------------------------ completeness
problems = []
if len(EF) != 270: problems.append(f'explicit-first learners {len(EF)} != 270')
if len(B2) != 12: problems.append(f'B2 learners {len(B2)} != 12')
for l in by:
    for a in ARMS:
        for k in (1, 2):
            r = by[l][a].get(k)
            if not r: problems.append(f'L{l} {a} rep{k} missing'); continue
            if r.get('rounds') != ROUNDS: problems.append(f'L{l} {a} rep{k} judged rounds {r.get("rounds")}')
            for t in TIMES:
                if t not in (r.get('assess') or {}): problems.append(f'L{l} {a} rep{k} no {t} form')
complete = not problems
res = {'_label': 'SIMULATION ONLY', 'complete': complete, 'incomplete': problems[:50], 'incompleteCount': len(problems), 'nExplicitFirst': len(EF), 'nB2': len(B2)}


# ------------------------------------------------------------------------------------------------ tests
def signflip(d):
    v = [x * GRID for x in d]
    if any(abs(x - round(x)) > 1e-9 for x in v): return signflip_mc(d), 'monte_carlo_100000_seed6'
    v = [abs(int(round(x))) for x in v if round(x) != 0]; dist = {0: 1}
    for x in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + x] += c; nd[s - x] += c
        dist = nd
    o = abs(sum(int(round(x * GRID)) for x in d))
    return (sum(c for s, c in dist.items() if abs(s) >= o) / 2 ** len(v) if v else 1.0), 'exact'


def signflip_mc(d, B=100000, seed=6):
    rng = random.Random(seed); o = abs(sum(d)) - 1e-12; hit = 0
    for _ in range(B):
        if abs(sum(x if rng.random() < 0.5 else -x for x in d)) >= o: hit += 1
    return (hit + 1) / (B + 1)


def boot(d, B=10000, seed=7):
    if not d: return [None, None]
    rng = random.Random(seed); n = len(d); m = sorted(sum(d[rng.randrange(n)] for _ in range(n)) / n for _ in range(B)); return [round(m[int(.025 * B)], 4), round(m[int(.975 * B) - 1], 4)]


def diff_block(learners, time, what='pct'):
    pairs = [(avg(l, 'LE', time, what), avg(l, 'PP', time, what)) for l in learners]; pairs = [p for p in pairs if None not in p]
    d = [a - b for a, b in pairs]
    return {'n': len(d), 'meanLE': r4(mean([a for a, _ in pairs])), 'meanPP': r4(mean([b for _, b in pairs])), 'diff': r4(mean(d)), 'ci95': boot(d)}, d


blk, d = diff_block(EF, 'del', 'primary')
p, method = signflip(d) if d else (None, None)
res['primary'] = {'outcome': 'delayed form, PRIMARY items (gap-fill and choice), percent of points, LE - PP, explicit-first, mean of 2 replications', 'test': method, **blk, 'p': p,
                  'positive': sum(x > 0 for x in d), 'negative': sum(x < 0 for x in d), 'zero': sum(x == 0 for x in d)}

# ------------------------------------------------------------------------------------------------ secondary (descriptive only)
sec = {}
sec['immediate'] = diff_block(EF, 'imm', 'primary')[0]
sec['wholeFormDelayed'] = diff_block(EF, 'del', 'pct')[0]
sec['wholeFormImmediate'] = diff_block(EF, 'imm', 'pct')[0]
sec['errorCorrectionAndRewrite'] = {t: diff_block(EF, t, 'ecRewrite')[0] for t in ('imm', 'del')}
sec['masteryDelayed'] = diff_block(EF, 'del', 'mastery')[0]
sec['freeProduction'] = {t: diff_block(EF, t, 'free')[0] for t in ('imm', 'del')}
sec['preTest'] = diff_block(EF, 'pre')[0]
gain = lambda l, a, t: None if avg(l, a, t) is None or avg(l, a, 'pre') is None else avg(l, a, t) - avg(l, a, 'pre')
for t in ('imm', 'del'):
    g = [(gain(l, 'LE', t), gain(l, 'PP', t)) for l in EF]; g = [x for x in g if None not in x]
    sec[f'gain_{t}'] = {'meanLE': r4(mean([a for a, _ in g])), 'meanPP': r4(mean([b for _, b in g])), 'diff': r4(mean([a - b for a, b in g])), 'ci95': boot([a - b for a, b in g])}
fg = [(avg(l, 'LE', 'imm') - avg(l, 'LE', 'del'), avg(l, 'PP', 'imm') - avg(l, 'PP', 'del')) for l in EF if None not in (avg(l, 'LE', 'imm'), avg(l, 'LE', 'del'), avg(l, 'PP', 'imm'), avg(l, 'PP', 'del'))]
sec['forgettingImmToDel'] = {'LE': r4(mean([a for a, _ in fg])), 'PP': r4(mean([b for _, b in fg])), 'diff': r4(mean([a - b for a, b in fg])), 'ci95': boot([a - b for a, b in fg])}
types = defaultdict(list); outs = defaultdict(list)
for l in EF: types[info[l]['type']].append(l); outs[info[l]['outcome']].append(l)
sec['byType'] = {t: diff_block(ls, 'del')[0] for t, ls in sorted(types.items())}
sec['byOutcome'] = {o: diff_block(ls, 'del')[0] for o, ls in sorted(outs.items())}
for rep in (1, 2):
    dd = [score(by[l]['LE'][rep], 'del') - score(by[l]['PP'][rep], 'del') for l in EF if rep in by[l]['LE'] and rep in by[l]['PP'] and None not in (score(by[l]['LE'][rep], 'del'), score(by[l]['PP'][rep], 'del'))]
    sec[f'delayed_rep{rep}'] = {'n': len(dd), 'diff': r4(mean(dd)), 'ci95': boot(dd)}
traj = defaultdict(lambda: [[] for _ in range(ROUNDS)])
for t in tags:
    if t.get('stateAfter') and t['band'] != 'B2': traj[t['arm']][t['turn'] - 1].append(sum(t['stateAfter']['s'][w] for w in t['stateAfter']['ws']))
sec['trajectoryW1W2'] = {a: [round(mean(v), 3) if v else None for v in traj[a]] for a in traj}
sec['stuckRuns'] = {a: {'runs': sum(1 for s in stuck if s['arm'] == a and s['band'] != 'B2'), 'sessionsWithRun': len({(s['learner'], s['rep'], s['session']) for s in stuck if s['arm'] == a and s['band'] != 'B2'}), 'meanLength': round(mean([s['length'] for s in stuck if s['arm'] == a and s['band'] != 'B2']) or 0, 2)} for a in ARMS}


def turn_types(t):
    sb = (t.get('stateBefore') or {}).get('s', {}); out = set()
    for e in t.get('events') or []:
        if e.get('rule') in ('R1', 'R2') and e.get('belief') in ('W1', 'W2'): out.add('rule_or_contrast_on_live_belief' if sb.get(e['belief'], 0) >= 0.5 else 'rule_or_contrast_on_belief_at_0')
        if e.get('rule') == 'R5': out.add('answer_given')
        if e.get('rule') == 'R3': out.add('confirmed_correct')
        if e.get('rule') == 'R4': out.add('independent_correct')
    if t.get('retrieval'): out.add('retrieval_attempt')
    nt = t.get('next_task') or {}; out.add(f"next_task_{nt.get('kind', 'none')}")
    probes = [w for w in (nt.get('probes') or []) if w in ('W1', 'W2')]
    if nt.get('kind') in ('blank', 'sentence'): out.add('next_task_tests_live_belief' if any(sb.get(w, 0) >= 0.5 for w in probes) else 'next_task_tests_only_beliefs_at_0')
    for k, v in (t.get('ev5') or {}).items(): out.add(f'engine_{k}' if k != 'ownSentence' else f'engine_ownSentence_{v}')
    return out


tt = {}
for a in ARMS:
    s2 = [t for t in tags if t['arm'] == a and t['session'] == 2 and t['band'] != 'B2']; c = defaultdict(int)
    for t in s2:
        for k in turn_types(t): c[k] += 1
    tt[a] = {'turns': len(s2), **{k: {'n': v, 'share': round(v / len(s2), 4)} for k, v in sorted(c.items())}}
sec['session2TurnTypes'] = tt
# grader null count and items with probe "none" (answered from the key in every arm)
asr = [r for t in TIMES for r in (J(f'ASSESS_{t}.json') or [])]
sec['graderNull'] = {t: sum(1 for r in asr if r['time'] == t and r['points'] is None) for t in TIMES}
sec['probeNoneAnswers'] = {'answers': sum(1 for r in asr if r['probes'] == ['none']), 'of': len(asr)}
sec['beliefFired'] = {a: {t: r4(mean([1.0 if r['fired'] else 0.0 for r in asr if r['arm'] == a and r['time'] == t and r['probes'] != ['none']])) for t in TIMES} for a in ARMS}
res['secondary'] = sec

# B2 no-harm: every B2 learner ends session 2 with W1 = W2 = 0 and delayed score >= pre-test score, in both arms and replications
b2 = [(l, a, k) for l in B2 for a in ARMS for k in (1, 2) if k in by[l][a]]
fails = [f'L{l} {a} rep{k}' for l, a, k in b2 if not (by[l][a][k].get('endS2') and by[l][a][k]['endS2']['W1'] == 0 and by[l][a][k]['endS2']['W2'] == 0 and score(by[l][a][k], 'del') is not None and score(by[l][a][k], 'del') >= score(by[l][a][k], 'pre'))]
res['b2NoHarm'] = {'pass': bool(b2) and not fails, 'failures': fails}

# ------------------------------------------------------------------------------------------------ counts per arm (all tutored turns, all learners)
g = defaultdict(lambda: defaultdict(int))
for t in tags:
    x = g[t['arm']]; x['turns'] += 1; x['twoAsks'] += bool(t['twoAsks']); x['twoAsksRaw'] += bool(t.get('twoAsksRaw'))
    x['earlyLeakFinal'] += t.get('earlyLeakFinal', 0) > 0; x['earlyLeakRaw'] += t.get('earlyLeakRaw', 0) > 0; x['leakFinalESL4'] += t.get('leakFinal', 0) > 0
    x['answerReleased'] += bool(t.get('answerReleased')); x['answerAfterTwoFails'] += t.get('lateAnswerFinal', 0) > 0
    if t['arm'] == 'LE': x[f"marker_{t.get('markerStatus')}"] += 1
res['counts'] = {a: dict(v) for a, v in g.items()}

# ------------------------------------------------------------------------------------------------ blind rating (one pass, replication 1)
rate = defaultdict(lambda: defaultdict(list)); RD = os.path.join(D, 'rate'); rateMissing = []
if os.path.exists(os.path.join(RD, 'KEY.json')):
    key = json.load(open(os.path.join(RD, 'KEY.json')))
    for b, cases in key.items():
        f = os.path.join(RD, f'{b}.json')
        if not os.path.exists(f): rateMissing.append(b); continue
        for r in json.load(open(f))['ratings']:
            k = cases.get(r['case'])
            if k:
                for lab, sc in r['scores'].items():
                    for dim, v in sc.items(): rate[k['labels'][lab]][dim].append(v)
res['ratings'] = {a: {dim: round(mean(v), 3) for dim, v in dims.items()} | {'n': len(dims.get('overall', []))} for a, dims in rate.items()}
res['ratingsMissingBatches'] = rateMissing

# ------------------------------------------------------------------------------------------------ guards
le, pp = g['LE'], g['PP']
ap = res['ratings'].get('LE', {}).get('answer_protection'); app = res['ratings'].get('PP', {}).get('answer_protection')
agree = J('JUDGE_AGREEMENT.json'); rc = J('GRADER_RECHECK.json')
a_all = agree.get('agreement') if agree else None; a_s2 = agree.get('late') if agree else None  # amendment A1: later agreement round (5) replaces session 2
res['guards'] = {
    'twoAsks': {'LE': le['twoAsks'], 'turns': le['turns'], 'rate': round(le['twoAsks'] / max(le['turns'], 1), 4), 'rawBeforeGuard': le['twoAsksRaw'], 'pass': le['turns'] > 0 and le['twoAsks'] <= 0.02 * le['turns']},
    'earlyLeaks': {'LE': le['earlyLeakFinal'], 'PP': pp['earlyLeakFinal'], 'releasesLE_notLeaks': le['answerReleased'], 'answersAfterTwoFails': {'LE': le['answerAfterTwoFails'], 'PP': pp['answerAfterTwoFails']}, 'pass': le['turns'] > 0 and le['earlyLeakFinal'] <= pp['earlyLeakFinal']},
    'answerProtection': {'LE': ap, 'PP': app, 'pass': ap is not None and app is not None and ap >= app and not rateMissing},
    'judgeAgreement': {'overall': a_all, 'lateRound5': a_s2, 'pass': a_all is not None and a_s2 is not None and a_all >= 0.85 and a_s2 >= 0.85 and (agree or {}).get('missing', 1) == 0},
    'graderRecheck': {'primaryAgreement': (rc or {}).get('primaryAgreement'), 'exactAgreement': (rc or {}).get('exactAgreement'), 'qwk': (rc or {}).get('qwk'), 'sampled': (rc or {}).get('sampled'), 'pass': bool(rc and rc.get('pass'))},
}
res['validityFailure'] = not res['guards']['judgeAgreement']['pass']
res['fidelity'] = J('FIDELITY.json')
pr = res['primary']; guards = all(v['pass'] for v in res['guards'].values())
res['decisionInputs'] = {'p<0.05': pr['p'] is not None and pr['p'] < 0.05, 'ciLower>0': pr['ci95'][0] is not None and pr['ci95'][0] > 0, 'allGuards': guards, 'complete': complete}
res['decision'] = 'CONFIRMED' if all(res['decisionInputs'].values()) else 'NOT CONFIRMED'
res['limits'] = 'Forgetting check FAILED in validation (DECISIONS 6): the forgetting model shows no recall benefit when teaching is complete. Underpowered: n = 270 gives ~0.65 power at +0.06 on the 4-item primary (conservative estimate, POWER_C.json). Primary narrowed to gap-fill/choice items after the round-8 grader result (DECISIONS 11). Simulation only.'
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1)
print(json.dumps({k: res[k] for k in ('complete', 'incompleteCount', 'primary', 'guards', 'b2NoHarm', 'decisionInputs', 'decision')}, indent=1))
