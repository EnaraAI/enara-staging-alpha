# SIMULATION ONLY. ESL stage-2 analysis: paired contrasts, bootstrap CI, exact sign-flip, Holm.
import json, random, sys, os
from collections import defaultdict
D = sys.argv[1]
rows = json.load(open(os.path.join(D, 'POST.json')))
by = defaultdict(dict)
for r in rows: by[r['learner']][r['arm']] = r
CONTRASTS = [('LE', 'P'), ('LEM', 'P'), ('LE', 'A0'), ('LEM', 'LE')]
NAME = {'P': 'P', 'A0': 'A0', 'LE': 'A0+LE', 'LEM': 'A0+LE+M'}
OUT = ['controlled', 'free', 'wrongAtZero', 'expectedControlled', 'expectedFree']
def signflip(d):
    # exact two-sided p, sums scaled to integers (grid 1/240)
    v = [round(x * 240) for x in d if round(x * 240) != 0]
    obs = abs(sum(v)); dist = {0: 1}
    for x in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + x] += c; nd[s - x] += c
        dist = nd
    tot = 2 ** len(v)
    return sum(c for s, c in dist.items() if abs(s) >= obs) / tot if v else 1.0
def boot(d, B=10000, seed=7):
    rng = random.Random(seed); n = len(d); m = []
    for _ in range(B): m.append(sum(d[rng.randrange(n)] for _ in range(n)) / n)
    m.sort(); return m[int(0.025 * B)], m[int(0.975 * B) - 1]
def holm(ps):
    o = sorted(range(len(ps)), key=lambda i: ps[i]); adj = [0] * len(ps); run = 0
    for k, i in enumerate(o): run = max(run, min(1, (len(ps) - k) * ps[i])); adj[i] = run
    return adj
res = {'means': {}, 'contrasts': []}
for pop in ['all', 'explicitFirst']:
    L = [l for l in sorted(by) if pop == 'all' or by[l]['P']['explicitFirst']]
    res['means'][pop] = {NAME[a]: {o: round(sum(by[l][a][o] for l in L) / len(L), 3) for o in OUT} for a in ['P', 'A0', 'LE', 'LEM']}
    for o in OUT:
        fam = []
        for a, b in CONTRASTS:
            d = [by[l][a][o] - by[l][b][o] for l in L]
            if o == 'wrongAtZero': pass
            lo, hi = boot(d); fam.append({'pop': pop, 'outcome': o, 'contrast': f'{NAME[a]} - {NAME[b]}', 'n': len(L), 'mean': round(sum(d) / len(d), 3), 'ci': [round(lo, 3), round(hi, 3)], 'p': signflip(d)})
        for f, ph in zip(fam, holm([f['p'] for f in fam])): f['pHolm'] = round(ph, 4); f['p'] = round(f['p'], 4); f['ciExcludesZero'] = f['ci'][0] > 0 or f['ci'][1] < 0
        res['contrasts'] += fam
tags = json.load(open(os.path.join(D, 'TAGS.json')))
g = defaultdict(lambda: {'turns': 0, 'leakFinal': 0, 'twoAsks': 0})
for t in tags: x = g[NAME[t['arm']]]; x['turns'] += 1; x['leakFinal'] += t['leakFinal'] > 0; x['twoAsks'] += bool(t['twoAsks'])
res['guards'] = g
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1)
print(json.dumps(res['means'], indent=1)); print(json.dumps(dict(g)))
for c in res['contrasts']:
    if c['outcome'] in ('controlled', 'free', 'wrongAtZero'): print(c['pop'], c['outcome'], c['contrast'], c['mean'], c['ci'], c['p'], c['pHolm'])
# ratings (blind, four tutors per learner)
RD = os.path.join(D, 'rate'); key = json.load(open(os.path.join(RD, 'KEY.json')))
rat = defaultdict(lambda: defaultdict(list)); rank = defaultdict(list); nc = 0
for b, cases in key.items():
    f = os.path.join(RD, f'{b}.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f))['ratings']:
        k = cases.get(r['case'])
        if not k: continue
        nc += 1
        for lab, sc in r['scores'].items():
            for dim, v in sc.items(): rat[NAME[k['labels'][lab]]][dim].append(v)
        for i, lab in enumerate(r['ranking']): rank[NAME[k['labels'][lab]]].append(i + 1)
res['ratings'] = {'cases': nc, 'means': {a: {d: round(sum(v) / len(v), 2) for d, v in dims.items()} for a, dims in rat.items()}, 'meanRank': {a: round(sum(v) / len(v), 2) for a, v in rank.items()}}
json.dump(res, open(os.path.join(D, 'ANALYSIS.json'), 'w'), indent=1)
print(json.dumps(res['ratings'], indent=1))
