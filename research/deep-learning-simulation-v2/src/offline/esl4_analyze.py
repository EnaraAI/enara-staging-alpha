# SIMULATION ONLY. ESL stage-4 confirmatory analysis vs the strong baseline P+ (arm 'PP'), fixed before any session ran (config/agent_sim_esl4/PROTOCOL.md).
# Primary: LE - P+, controlled post-test accuracy, explicit-first learners, each learner's two replications averaged; exact two-sided paired sign-flip, alpha 0.05;
# 95% bootstrap interval (10,000 resamples, seed 7). Decision: CONFIRMED only if p < 0.05 AND interval lower bound > 0 AND all three guards pass.
import json, os, random, sys
from collections import defaultdict
D = sys.argv[1]
rows = json.load(open(os.path.join(D, 'POST.json')))
tags = json.load(open(os.path.join(D, 'TAGS.json')))
by = defaultdict(lambda: defaultdict(dict))
for r in rows: by[r['learner']][r['arm']][r['rep']] = r
def avg(l, arm, key): return sum(by[l][arm][k][key] for k in (1, 2)) / 2
def signflip(d):
    v = [round(x * 240) for x in d if round(x * 240) != 0]; dist = {0: 1}
    for x in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + x] += c; nd[s - x] += c
        dist = nd
    o = abs(sum(v)); return sum(c for s, c in dist.items() if abs(s) >= o) / 2 ** len(v) if v else 1.0
def boot(d, B=10000, seed=7):
    rng = random.Random(seed); n = len(d); m = sorted(sum(d[rng.randrange(n)] for _ in range(n)) / n for _ in range(B)); return [round(m[int(.025 * B)], 4), round(m[int(.975 * B) - 1], 4)]
EF = sorted(l for l in by if by[l]['PP'][1]['explicitFirst']); B2 = sorted(l for l in by if not by[l]['PP'][1]['explicitFirst'])
complete = all(len(by[l][a]) == 2 for l in by for a in ('PP', 'LE'))
res = {'complete': complete, 'nExplicitFirst': len(EF), 'nB2': len(B2)}
d = [avg(l, 'LE', 'controlled') - avg(l, 'PP', 'controlled') for l in EF]
res['primary'] = {'outcome': 'controlled accuracy, LE - P+, explicit-first, mean of 2 replications', 'meanLE': round(sum(avg(l, 'LE', 'controlled') for l in EF) / len(EF), 4), 'meanP': round(sum(avg(l, 'PP', 'controlled') for l in EF) / len(EF), 4), 'diff': round(sum(d) / len(d), 4), 'ci95': boot(d), 'p': signflip(d), 'positive': sum(x > 0 for x in d), 'negative': sum(x < 0 for x in d), 'zero': sum(x == 0 for x in d)}
sec = {}
for o in ('free', 'wrongAtZero', 'expectedControlled', 'expectedFree'):
    dd = [avg(l, 'LE', o) - avg(l, 'PP', o) for l in EF]; sec[o] = {'meanLE': round(sum(avg(l, 'LE', o) for l in EF) / len(EF), 4), 'meanP': round(sum(avg(l, 'PP', o) for l in EF) / len(EF), 4), 'diff': round(sum(dd) / len(dd), 4), 'ci95': boot(dd)}
for rep in (1, 2):
    dd = [by[l]['LE'][rep]['controlled'] - by[l]['PP'][rep]['controlled'] for l in EF]; sec[f'controlled_rep{rep}'] = {'diff': round(sum(dd) / len(dd), 4), 'ci95': boot(dd)}
res['secondary'] = sec
res['b2NoHarm'] = {'pass': all(by[l][a][k]['final']['W1'] == 0 and by[l][a][k]['final']['W2'] == 0 for l in B2 for a in ('PP', 'LE') for k in (1, 2)), 'maxWrongStrength': max(by[l][a][k]['final']['W1'] + by[l][a][k]['final']['W2'] for l in B2 for a in ('PP', 'LE') for k in (1, 2))}
g = defaultdict(lambda: {'turns': 0, 'leakFinal': 0, 'twoAsks': 0, 'twoAsksRaw': 0})
for t in tags: x = g[t['arm']]; x['turns'] += 1; x['leakFinal'] += t['leakFinal'] > 0; x['twoAsks'] += bool(t['twoAsks']); x['twoAsksRaw'] += bool(t.get('twoAsksRaw'))
traj = defaultdict(lambda: [[] for _ in range(10)])
for t in tags:
    if t.get('stateAfter') and t['band'] != 'B2': traj[t['arm']][t['turn'] - 1].append(t['stateAfter']['s']['W1'] + t['stateAfter']['s']['W2'])
res['trajectory'] = {a: [round(sum(v) / len(v), 3) if v else None for v in traj[a]] for a in traj}
rate = defaultdict(lambda: defaultdict(list)); RD = os.path.join(D, 'rate')
if os.path.exists(os.path.join(RD, 'KEY.json')):
    key = json.load(open(os.path.join(RD, 'KEY.json')))
    for b, cases in key.items():
        f = os.path.join(RD, f'{b}.json')
        if not os.path.exists(f): continue
        for r in json.load(open(f))['ratings']:
            k = cases.get(r['case'])
            if k:
                for lab, sc in r['scores'].items():
                    for dim, v in sc.items(): rate[k['labels'][lab]][dim].append(v)
res['ratings'] = {a: {dim: round(sum(v) / len(v), 3) for dim, v in dims.items()} | {'n': len(dims.get('overall', []))} for a, dims in rate.items()}
le, p = g['LE'], g['PP']
ap = res['ratings'].get('LE', {}).get('answer_protection'); app = res['ratings'].get('PP', {}).get('answer_protection')
res['guards'] = {'twoAsks': {'LE': le['twoAsks'], 'turns': le['turns'], 'rate': round(le['twoAsks'] / max(le['turns'], 1), 4), 'pass': le['twoAsks'] <= 0.02 * le['turns'], 'rawBeforeGuard': le['twoAsksRaw']},
                 'leaks': {'LE': le['leakFinal'], 'PP': p['leakFinal'], 'pass': le['leakFinal'] <= p['leakFinal']},
                 'answerProtection': {'LE': ap, 'PP': app, 'pass': ap is not None and app is not None and ap >= app}}
pr = res['primary']; guards = all(v['pass'] for v in res['guards'].values())
for extra in ('JUDGE_AGREEMENT.json', 'FIDELITY.json'):
    f = os.path.join(D, extra)
    res[extra.split('.')[0].lower()] = json.load(open(f)) if os.path.exists(f) else None
res['decision'] = 'CONFIRMED' if complete and pr['p'] < 0.05 and pr['ci95'][0] > 0 and guards else 'NOT CONFIRMED'
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1); print(json.dumps({k: res[k] for k in ('primary', 'guards', 'b2NoHarm', 'decision')}, indent=1))
