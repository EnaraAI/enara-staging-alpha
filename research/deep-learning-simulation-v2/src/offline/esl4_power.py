# SIMULATION ONLY. ESL4 sample size: 80% power for +0.08 controlled accuracy (A0+LE - P+), using the ESL3 spread of rep-averaged learner differences.
import json, random, statistics as st
from collections import defaultdict
rows = json.load(open('reports/exp4/agent_sim_esl3/POST.json'))
by = defaultdict(lambda: defaultdict(dict))
for r in rows: by[r['learner']][r['arm']][r['rep']] = r
EF = [l for l in by if by[l]['P'][1]['explicitFirst']]
d = [(by[l]['LE'][1]['controlled'] + by[l]['LE'][2]['controlled']) / 2 - (by[l]['P'][1]['controlled'] + by[l]['P'][2]['controlled']) / 2 for l in EF]
m, sd = st.mean(d), st.stdev(d)
def signflip(x):
    v = [round(a * 8) for a in x if round(a * 8)]; dist = {0: 1}
    for a in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + a] += c; nd[s - a] += c
        dist = nd
    o = abs(sum(v)); return sum(c for s, c in dist.items() if abs(s) >= o) / 2 ** len(v) if v else 1
def mc_signflip(x, rng, P=2000):
    o = abs(sum(x)); hit = 0
    for _ in range(P):
        if abs(sum(v if rng.random() < .5 else -v for v in x)) >= o - 1e-12: hit += 1
    return (hit + 1) / (P + 1)
def power(n, eff, B=400, seed=13):
    # resample ESL3 learner differences, centred and shifted to the target effect (no re-gridding); Monte Carlo sign-flip per simulated study
    rng = random.Random(seed); c = [x - m for x in d]; hit = 0
    for _ in range(B):
        x = [rng.choice(c) + eff for _ in range(n)]
        if sum(x) > 0 and mc_signflip(x, rng) < 0.05: hit += 1
    return hit / B
from statistics import NormalDist
def normal_power(n, eff): return round(1 - NormalDist().cdf(1.959964 - eff / (sd / n ** .5)), 3)
z = (1.959964 + 0.841621) ** 2
out = {'_label': 'SIMULATION ONLY', 'esl3_n': len(d), 'esl3_meanDiff': round(m, 4), 'esl3_sdDiff': round(sd, 4), 'target': 0.08,
       'normalApproxN': round(z * (sd / 0.08) ** 2, 1),
       'normalApproxPower': {n: normal_power(n, 0.08) for n in (48, 64, 80, 96)}, 'simPower': {n: power(n, 0.08) for n in (48, 64, 80, 96)}}
print(json.dumps(out, indent=1)); json.dump(out, open('config/agent_sim_esl4/POWER.json', 'w'), indent=1)
