# SIMULATION ONLY. ESL3 pre-registration power estimate from the ESL2 explicit-first A0+LE - P controlled differences.
import json, random, statistics as st
from collections import defaultdict
rows = json.load(open('reports/exp4/agent_sim_esl2/POST.json'))
by = defaultdict(dict)
for r in rows: by[r['learner']][r['arm']] = r
L = [l for l in by if by[l]['P']['explicitFirst']]
d = [by[l]['LE']['controlled'] - by[l]['P']['controlled'] for l in L]
def noise(r): return sum(i['expected'] * (1 - i['expected']) for i in r['items'] if i['kind'] == 'controlled') / 16
nv = st.mean(noise(by[l]['LE']) + noise(by[l]['P']) for l in L)
m, sd = st.mean(d), st.stdev(d); vt = max(sd ** 2 - nv, 0)
def signflip(x):
    v = [round(a * 8) for a in x if round(a * 8)]; dist = {0: 1}
    for a in v:
        nd = defaultdict(int)
        for s, c in dist.items(): nd[s + a] += c; nd[s - a] += c
        dist = nd
    o = abs(sum(v)); return sum(c for s, c in dist.items() if abs(s) >= o) / 2 ** len(v) if v else 1
def power(n, half=False, B=2000, seed=11):
    # resample ESL2 learner differences (n per simulated study). half=True: each draw keeps its sign with prob 0.5, else a random sign -> mean effect halved.
    rng = random.Random(seed); hit = 0
    for _ in range(B):
        x = []
        for _ in range(n):
            a = rng.choice(d)
            if half and rng.random() < 0.5: a = a * rng.choice([1, -1])
            x.append(a)
        if signflip(x) < 0.05 and sum(x) > 0: hit += 1
    return hit / B
k = ((vt + nv / 2) / sd ** 2) ** 0.5
out = {'esl2_n': len(d), 'mean': round(m, 3), 'sd': round(sd, 3), 'postTestNoiseVar': round(nv, 4), 'note': 'conservative: one replication per learner as in ESL2; averaging two replications can only lower the post-test noise part of the spread',
       'power_n48_esl2Effect': power(48), 'power_n48_halfEffect': power(48, True), 'power_n24_esl2Effect': power(24)}
print(json.dumps(out, indent=1)); json.dump(out, open('config/agent_sim_esl3/POWER.json', 'w'), indent=1)
