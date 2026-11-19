# SIMULATION ONLY. NO API. Amendment A1 (2026-11-19, before ESL6 round 1): power of ESL6 at n = 270 for 10, 5 and 3 rounds.
# Effect and spread per round come from ESL5's own sessions (explicit-first, both arms, 2 replications): expected controlled post-test accuracy
# (postTest().expected over the 4 controlled probes, ported 1:1) after round k. Power uses the registered ESL6 method (POWER_C.json):
# target +0.06 at round 10, conservative SD 0.4213 = sqrt(0.3072^2 + 0.1549^2) * sqrt(6/4). At round k the target is scaled by
# effect_k / effect_10 and the SD by SD_k / SD_10 (SD_k = expected-diff spread + item noise, rescaled to ESL5's realised 0.3072; judge noise kept).
# Normal approximation, two-sided, alpha 0.05. ESL5 is a proxy (3 outcomes, immediate test); the numbers are rough.
import json, glob, math, sys, statistics as st
from statistics import NormalDist
D = sys.argv[1] if len(sys.argv) > 1 else 'reports/exp4/agent_sim_esl5/sessions'
PP = {'articles': [['W1', 'W2'], ['W1'], ['W1'], ['W1', 'W2']], 'copula': [['W1', 'W2'], ['W1'], ['W1', 'W2'], ['W1', 'W2']], 'thirdS': [['W1'], ['W1', 'W2'], ['W1', 'W2'], ['W1']]}
pe = lambda s: 0.8 if s >= 2 else 0.4 if s == 1 else 0.05
data = {}
for f in glob.glob(D + '/*.json'):
    d = json.load(open(f)); L = d['learnerIdx']
    if L >= 608: continue  # B2
    t = d['turns']; assert len(t) == 10
    for r in range(1, 11):
        k = t[r]['stateBefore'] if r < 10 else d['state']
        ps = [math.prod(1 - pe(k['s'][w]) for w in pr) for pr in PP[k['form']]]
        data.setdefault((L, r), {}).setdefault(d['arm'], []).append((sum(ps) / 4, sum(p * (1 - p) for p in ps) / 16))
Ls = sorted({k[0] for k in data}); per = {}
for r in range(1, 11):
    diffs = [st.mean(x[0] for x in data[(L, r)]['LE']) - st.mean(x[0] for x in data[(L, r)]['PP']) for L in Ls]
    noise = st.mean(sum(x[1] for x in data[(L, r)]['LE']) / 4 + sum(x[1] for x in data[(L, r)]['PP']) / 4 for L in Ls)
    per[r] = {'diff': round(st.mean(diffs), 4), 'sd': round(math.sqrt(st.pstdev(diffs) ** 2 + noise), 4)}
J, SD10C, N, T = 0.1549, 0.4213, 270, 0.06
scale = 0.3072 / per[10]['sd']
def power(eff, sd_model):
    sd = math.sqrt((sd_model * scale) ** 2 + J * J) * math.sqrt(6 / 4); t = T * eff / per[10]['diff']
    return round(t, 4), round(sd, 4), round(NormalDist().cdf(t / sd * math.sqrt(N) - 1.96), 3)
out = {'_label': 'SIMULATION ONLY', 'source': D, 'n': N, 'perRoundESL5': per, 'options': {}}
for name, r, eff in [('10 rounds', 10, per[10]['diff']), ('5 rounds', 5, per[5]['diff']), ('3 rounds (round 3)', 3, per[3]['diff']), ('3 rounds (rounds 2-4 mean)', 3, st.mean(per[i]['diff'] for i in (2, 3, 4)))]:
    t, sd, p = power(eff, per[r]['sd']); out['options'][name] = {'target': t, 'sdConservative': sd, 'power': p}
print(json.dumps(out['options'], indent=1))
json.dump(out, open('config/agent_sim_esl6/POWER_A1.json', 'w'), indent=1)
