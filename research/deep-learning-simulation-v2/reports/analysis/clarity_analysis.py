#!/usr/bin/env python3
"""Agent-run clarity study analysis (five arms A0, A, B, C, P). SIMULATION ONLY.
Usage: clarity_analysis.py <ratings_dir> <key_json> <post_scores_json> <sessions_dir> <out_dir> [n_students]
Paired over students (cluster = student). Contrasts fixed in advance: A-A0, B-P, B-A, C-B. Holm over the four, separately for clarity and post-test.
Bootstrap 95% CI over students; exact sign-flip permutation test over students (2^n). Read-only on inputs."""
import json, glob, os, sys, itertools, collections
import numpy as np
rd, keyf, postf, sessd, out = sys.argv[1:6]; NS = int(sys.argv[6]) if len(sys.argv) > 6 else 8
os.makedirs(out, exist_ok=True); rng = np.random.default_rng(20261123)
ARMS = ['A0', 'A', 'B', 'C', 'P']; SUF = {'A0': 'D', 'A': 'E', 'B': 'F', 'C': 'G', 'P': 'C'}
CRIT = ['overall', 'clarity', 'reasoning', 'answer_protection', 'hint_progression', 'recap']
CONTRASTS = [('A', 'A0'), ('B', 'P'), ('B', 'A'), ('C', 'B')]
key = json.load(open(keyf))
R = collections.defaultdict(lambda: collections.defaultdict(list))   # (student, arm) -> crit -> [scores per rater]
RK = collections.defaultdict(dict)                                    # case -> pass -> ranking of arms
OV = collections.defaultdict(dict)                                    # (student, arm) -> pass -> overall
for f in sorted(glob.glob(os.path.join(rd, '*.json'))):
    d = json.load(open(f)); b = d['batch']; ps = b[:2]
    for r in d['ratings']:
        k = key[f"{b}|{r['case']}"]; stu = int(r['case'].split('_')[0][1:])
        for L, sc in r['scores'].items():
            arm = k[L]
            for c in CRIT:
                if sc.get(c) is not None: R[(stu, arm)][c].append(sc[c])
            OV[(stu, arm)][ps] = sc['overall']
        RK[stu][ps] = [k[L] for L in r['ranking']]
S = range(NS)
def m(stu, arm, c): v = R[(stu, arm)][c]; return float(np.mean(v)) if v else np.nan
post = json.load(open(postf)); P = {(x['studentIdx'], x['arm']): x['acc'] for x in post}
def boot(d, B=10000):
    d = np.asarray(d, float); idx = rng.integers(0, len(d), (B, len(d))); bs = d[idx].mean(axis=1); return float(d.mean()), float(np.quantile(bs, .025)), float(np.quantile(bs, .975))
def signflip(d):
    d = np.asarray(d, float); obs = abs(d.mean()); n = len(d); cnt = 0
    for s in itertools.product([-1, 1], repeat=n): cnt += abs((np.array(s) * d).mean()) >= obs - 1e-12
    return cnt / 2 ** n
def holm(ps):
    o = sorted(range(len(ps)), key=lambda i: ps[i]); res = [0] * len(ps); run = 0
    for k, i in enumerate(o): run = max(run, min(1, (len(ps) - k) * ps[i])); res[i] = run
    return res
rows = {}
means = {c: {a: round(float(np.nanmean([m(s, a, c) for s in S])), 2) for a in ARMS} for c in CRIT}
means['posttest'] = {a: round(float(np.mean([P[(s, a)] for s in S])), 3) for a in ARMS}
for c in CRIT + ['posttest']:
    vals = {a: [(m(s, a, c) if c != 'posttest' else P[(s, a)]) for s in S] for a in ARMS}
    rr = []
    for x, y in CONTRASTS:
        d = np.array(vals[x]) - np.array(vals[y]); est, lo, hi = boot(d); rr.append(dict(contrast=f'{x} - {y}', diff=round(est, 3), lo=round(lo, 3), hi=round(hi, 3), p=round(signflip(d), 4)))
    if c in ('clarity', 'posttest'):
        for r_, q in zip(rr, holm([r_['p'] for r_ in rr])): r_['holm_p'] = round(q, 4)
    rows[c] = rr
# ranks
first = collections.Counter(); last = collections.Counter(); pts = collections.defaultdict(list); agree = []
for stu in S:
    for ps, rk in RK[stu].items():
        first[rk[0]] += 1; last[rk[-1]] += 1
        for i, a in enumerate(rk): pts[a].append(4 - i)
    pp = sorted(RK[stu]);
    if len(pp) == 2: agree.append(RK[stu][pp[0]][0] == RK[stu][pp[1]][0])
a1 = []; a2 = []
for (stu, arm), d in OV.items():
    ps = sorted(d)
    if len(ps) == 2: a1.append(d[ps[0]]); a2.append(d[ps[1]])
# by method (arms with the plan: A, B, C)
meth = collections.defaultdict(lambda: collections.defaultdict(list))
for stu in S:
    for arm in ('A', 'B', 'C'):
        sess = json.load(open(os.path.join(sessd, f's{stu}_{SUF[arm]}.json'))); mt = (sess['turns'][0].get('method') or {}); mt = mt.get('primary') if isinstance(mt, dict) else None
        meth[mt]['clarity'].append(m(stu, arm, 'clarity') - m(stu, 'P', 'clarity')); meth[mt]['post'].append(P[(stu, arm)] - P[(stu, 'P')]); meth[mt]['clarity_abs'].append(m(stu, arm, 'clarity')); meth[mt]['n_students'].append(stu)
bym = {k: dict(sessions=len(v['clarity']), students=sorted(set(v['n_students'])), clarity_mean=round(float(np.mean(v['clarity_abs'])), 2), clarity_minus_plain=round(float(np.mean(v['clarity'])), 2), post_minus_plain=round(float(np.mean(v['post'])), 3)) for k, v in meth.items()}
res = dict(n_students=NS, means=means, contrasts=rows, ranked_first=dict(first), ranked_last=dict(last), mean_rank_points={a: round(float(np.mean(v)), 2) for a, v in pts.items()},
           agreement_top_pick=round(float(np.mean(agree)), 3) if agree else None, corr_overall_between_passes=round(float(np.corrcoef(a1, a2)[0, 1]), 3) if len(a1) > 2 else None, by_method=bym)
json.dump(res, open(os.path.join(out, 'CLARITY_SUMMARY.json'), 'w'), indent=1)
print(json.dumps(res, indent=1))
