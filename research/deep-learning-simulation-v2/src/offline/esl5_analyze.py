# SIMULATION ONLY. NO API. ESL stage-5 confirmatory analysis, fixed before any session ran (config/agent_sim_esl5/PROTOCOL.md).
# Primary: LE - PP (P+), controlled post-test accuracy after round 10, explicit-first learners (n = 108), each learner's two replications averaged.
#   Test: EXACT two-sided paired sign-flip (all 2^n sign patterns, by convolution on the common grid); if the differences do not lie on a 1/240 grid,
#   Monte Carlo sign-flip with 100,000 draws (seed 5). alpha 0.05. Interval: 95% percentile bootstrap, 10,000 resamples, seed 7.
# Guards (all must pass): two asks <= 2% of LE turns; early leaks LE <= PP (answer releases counted separately); blind answer_protection LE >= PP;
#   in-study judge agreement >= 85% overall AND >= 85% in session 2 (else validity failure).
# Decision: CONFIRMED only if p < 0.05 AND CI lower bound > 0 AND all guards pass AND data complete; otherwise NOT CONFIRMED.
# Usage: python3 src/offline/esl5_analyze.py reports/exp4/agent_sim_esl5
import json, os, random, sys
from collections import defaultdict

D = sys.argv[1]
ARMS = ('PP', 'LE')
rows = json.load(open(os.path.join(D, 'POST.json')))
tags = json.load(open(os.path.join(D, 'TAGS.json')))
stuck = json.load(open(os.path.join(D, 'STUCK.json'))) if os.path.exists(os.path.join(D, 'STUCK.json')) else []
by = defaultdict(lambda: defaultdict(dict))
for r in rows: by[r['learner']][r['arm']][r['rep']] = r
def avg(l, arm, key): return sum(by[l][arm][k][key] for k in (1, 2)) / 2
mean = lambda xs: sum(xs) / len(xs) if xs else None
GRID = 240

def signflip(d):
    v = [x * GRID for x in d]
    if any(abs(x - round(x)) > 1e-9 for x in v): return signflip_mc(d), 'monte_carlo_100000_seed5'
    v = [abs(int(round(x))) for x in v if round(x) != 0]; dist = {0: 1}
    for x in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + x] += c; nd[s - x] += c
        dist = nd
    o = abs(sum(int(round(x * GRID)) for x in d))
    return (sum(c for s, c in dist.items() if abs(s) >= o) / 2 ** len(v) if v else 1.0), 'exact'
def signflip_mc(d, B=100000, seed=5):
    rng = random.Random(seed); o = abs(sum(d)) - 1e-12; hit = 0
    for _ in range(B):
        if abs(sum(x if rng.random() < 0.5 else -x for x in d)) >= o: hit += 1
    return (hit + 1) / (B + 1)
def boot(d, B=10000, seed=7):
    rng = random.Random(seed); n = len(d); m = sorted(sum(d[rng.randrange(n)] for _ in range(n)) / n for _ in range(B)); return [round(m[int(.025 * B)], 4), round(m[int(.975 * B) - 1], 4)]

EF = sorted(l for l in by if by[l]['PP'].get(1, {}).get('explicitFirst')); B2 = sorted(l for l in by if l not in EF)
complete = (len(EF) == 108 and len(B2) == 12 and all(len(by[l][a]) == 2 and all(by[l][a][k].get('rounds') == 10 for k in (1, 2)) for l in by for a in ARMS))
res = {'_label': 'SIMULATION ONLY', 'complete': complete, 'nExplicitFirst': len(EF), 'nB2': len(B2)}
d = [avg(l, 'LE', 'controlled') - avg(l, 'PP', 'controlled') for l in EF]
p, method = signflip(d)
res['primary'] = {'outcome': 'controlled accuracy after round 10, LE - P+, explicit-first, mean of 2 replications', 'test': method, 'meanLE': round(mean([avg(l, 'LE', 'controlled') for l in EF]), 4), 'meanPP': round(mean([avg(l, 'PP', 'controlled') for l in EF]), 4), 'diff': round(mean(d), 4), 'ci95': boot(d), 'p': p, 'positive': sum(x > 0 for x in d), 'negative': sum(x < 0 for x in d), 'zero': sum(x == 0 for x in d)}

# ---------------- secondary, descriptive only
sec = {}
for o in ('free', 'wrongAtZero', 'expectedControlled', 'expectedFree'):
    dd = [avg(l, 'LE', o) - avg(l, 'PP', o) for l in EF]; sec[o] = {'meanLE': round(mean([avg(l, 'LE', o) for l in EF]), 4), 'meanPP': round(mean([avg(l, 'PP', o) for l in EF]), 4), 'diff': round(mean(dd), 4), 'ci95': boot(dd)}
for rep in (1, 2):
    dd = [by[l]['LE'][rep]['controlled'] - by[l]['PP'][rep]['controlled'] for l in EF]; sec[f'controlled_rep{rep}'] = {'diff': round(mean(dd), 4), 'ci95': boot(dd)}
traj = defaultdict(lambda: [[] for _ in range(10)])
for t in tags:
    if t.get('stateAfter') and t['band'] != 'B2': traj[t['arm']][t['turn'] - 1].append(t['stateAfter']['s']['W1'] + t['stateAfter']['s']['W2'])
sec['trajectoryW1W2'] = {a: [round(mean(v), 3) if v else None for v in traj[a]] for a in traj}
sec['stuckRuns'] = {a: {'runs': sum(1 for s in stuck if s['arm'] == a and s['band'] != 'B2'), 'sessionsWithRun': len({(s['learner'], s['rep'], s['session']) for s in stuck if s['arm'] == a and s['band'] != 'B2'}), 'meanLength': round(mean([s['length'] for s in stuck if s['arm'] == a and s['band'] != 'B2']) or 0, 2)} for a in ARMS}
# session-2 turn types (automatic, from judge events, the state before the turn, the judge's next task and the engine's evidence tags)
def turn_types(t):
    sb = (t.get('stateBefore') or {}).get('s', {}); ev = t.get('events') or []; out = set()
    for e in ev:
        if e.get('rule') in ('R1', 'R2') and e.get('belief') in ('W1', 'W2'): out.add('rule_or_contrast_on_live_belief' if sb.get(e['belief'], 0) > 0 else 'rule_or_contrast_on_belief_at_0')
        if e.get('rule') == 'R5': out.add('answer_given')
        if e.get('rule') == 'R3': out.add('confirmed_correct')
        if e.get('rule') == 'R4': out.add('independent_correct')
    nt = t.get('next_task') or {}; out.add(f"next_task_{nt.get('kind', 'none')}")
    probes = [w for w in (nt.get('probes') or []) if w in ('W1', 'W2')]
    if nt.get('kind') in ('blank', 'sentence'): out.add('next_task_tests_live_belief' if any(sb.get(w, 0) > 0 for w in probes) else 'next_task_tests_only_beliefs_at_0')
    for k, v in (t.get('ev5') or {}).items(): out.add(f'engine_{k}' if k != 'ownSentence' else f'engine_ownSentence_{v}')
    return out
tt = {}
for a in ARMS:
    s2 = [t for t in tags if t['arm'] == a and t['session'] == 2 and t['band'] != 'B2']; c = defaultdict(int)
    for t in s2:
        for k in turn_types(t): c[k] += 1
    tt[a] = {'turns': len(s2), **{k: {'n': v, 'share': round(v / len(s2), 4)} for k, v in sorted(c.items())}}
sec['session2TurnTypes'] = tt
res['secondary'] = sec
res['b2NoHarm'] = {'pass': all(by[l][a][k]['final']['W1'] == 0 and by[l][a][k]['final']['W2'] == 0 for l in B2 for a in ARMS for k in (1, 2)), 'maxWrongStrength': max(by[l][a][k]['final']['W1'] + by[l][a][k]['final']['W2'] for l in B2 for a in ARMS for k in (1, 2))}

# ---------------- counts per arm (all tutored turns, all learners)
g = defaultdict(lambda: defaultdict(int))
for t in tags:
    x = g[t['arm']]; x['turns'] += 1; x['twoAsks'] += bool(t['twoAsks']); x['twoAsksRaw'] += bool(t.get('twoAsksRaw'))
    x['earlyLeakFinal'] += t.get('earlyLeakFinal', 0) > 0; x['earlyLeakRaw'] += t.get('earlyLeakRaw', 0) > 0; x['leakFinalESL4'] += t.get('leakFinal', 0) > 0
    x['answerReleased'] += bool(t.get('answerReleased')); x['answerAfterTwoFails'] += t.get('lateAnswerFinal', 0) > 0
res['counts'] = {a: dict(v) for a, v in g.items()}

# ---------------- blind rating (one pass, replication 1)
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

# ---------------- guards
le, pp = g['LE'], g['PP']
ap = res['ratings'].get('LE', {}).get('answer_protection'); app = res['ratings'].get('PP', {}).get('answer_protection')
fa = os.path.join(D, 'JUDGE_AGREEMENT.json'); agree = json.load(open(fa)) if os.path.exists(fa) else None
a_all = agree.get('agreement') if agree else None; a_s2 = (agree.get('sessions', {}).get('2') or agree.get('sessions', {}).get(2) or {}).get('agreement') if agree else None
res['guards'] = {
    'twoAsks': {'LE': le['twoAsks'], 'turns': le['turns'], 'rate': round(le['twoAsks'] / max(le['turns'], 1), 4), 'rawBeforeGuard': le['twoAsksRaw'], 'pass': le['twoAsks'] <= 0.02 * le['turns']},
    'earlyLeaks': {'LE': le['earlyLeakFinal'], 'PP': pp['earlyLeakFinal'], 'releasesLE_notLeaks': le['answerReleased'], 'pass': le['earlyLeakFinal'] <= pp['earlyLeakFinal']},
    'answerProtection': {'LE': ap, 'PP': app, 'pass': ap is not None and app is not None and ap >= app},
    'judgeAgreement': {'overall': a_all, 'session2': a_s2, 'pass': a_all is not None and a_s2 is not None and a_all >= 0.85 and a_s2 >= 0.85 and (agree or {}).get('missing', 1) == 0},
}
res['validityFailure'] = not res['guards']['judgeAgreement']['pass']
ff = os.path.join(D, 'FIDELITY.json'); res['fidelity'] = json.load(open(ff)) if os.path.exists(ff) else None
pr = res['primary']; guards = all(v['pass'] for v in res['guards'].values())
res['decisionInputs'] = {'p<0.05': pr['p'] < 0.05, 'ciLower>0': pr['ci95'][0] > 0, 'allGuards': guards, 'complete': complete}
res['decision'] = 'CONFIRMED' if all(res['decisionInputs'].values()) else 'NOT CONFIRMED'
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1); print(json.dumps({k: res[k] for k in ('primary', 'guards', 'b2NoHarm', 'decisionInputs', 'decision')}, indent=1))
