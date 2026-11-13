#!/usr/bin/env python3
"""Blind transcript-rating analysis (Experiment 5b transcripts). AI raters, simulated students. Unblinds with a private key file.
Usage: rating_analysis.py <ratings_dir> <key_json> <out_dir>"""
import json, glob, os, sys, collections
import numpy as np
rd, keyf, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
key = json.load(open(keyf)); rng = np.random.default_rng(20261116)
CR = ['explanation_clarity','addresses_misconception','holds_correct_position','elicits_reasoning','hint_progression','answer_protection','consolidation','overall']
R = collections.defaultdict(dict)  # triplet -> pass -> {cond: scores}; rank
for f in sorted(glob.glob(os.path.join(rd, '*.json'))):
    d = json.load(open(f)); b = d['batch']; ps = b[:2]
    for r in d['ratings']:
        k = key.get(f"{b}|{r['triplet']}") or key.get(b, {}).get(r['triplet'])
        if k is None: print('NO KEY', b, r['triplet']); continue
        sc = {k[l]: r['scores'][l] for l in 'XYZ'}; rk = [k[l] for l in r['ranking']]
        R[r['triplet']][ps] = dict(scores=sc, rank=rk)
NP = max(len(v) for v in R.values()); T = sorted(t for t in R if len(R[t]) == NP); print('passes:', NP, 'triplets:', len(T))
def tm(c, crit):  # per-triplet mean across both passes (ignoring nulls)
    out = []
    for t in T:
        v = [R[t][p]['scores'][c][crit] for p in R[t] if R[t][p]['scores'][c].get(crit) is not None]
        out.append(np.mean(v) if v else np.nan)
    return np.array(out)
def ci(d):
    d = d[~np.isnan(d)]; bs = [rng.choice(d, len(d)).mean() for _ in range(5000)]
    return float(d.mean()), float(np.quantile(bs, .025)), float(np.quantile(bs, .975)), len(d)
rows = []
for crit in CR:
    m = {c: tm(c, crit) for c in 'ABC'}
    row = dict(criterion=crit, **{f'mean_{c}': round(float(np.nanmean(m[c])), 2) for c in 'ABC'})
    for a, b in (('A','C'), ('B','C'), ('B','A')):
        e, lo, hi, n = ci(m[a] - m[b]); row[f'{a}-{b}'] = f'{e:+.2f} [{lo:+.2f},{hi:+.2f}] n={n}'
    rows.append(row)
# ranks
pts = {c: [] for c in 'ABC'}; first = collections.Counter(); last = collections.Counter(); pair = collections.Counter()
for t in T:
    for p in R[t]:
        rk = R[t][p]['rank']; first[rk[0]] += 1; last[rk[-1]] += 1
        for i, c in enumerate(rk): pts[c].append(3 - i)
        for a, b in (('A','C'), ('B','C'), ('B','A')): pair[(a, b, rk.index(a) < rk.index(b))] += 1
# agreement between passes on overall ranking and overall score
agree = (np.mean([R[t]['p1']['rank'][0] == R[t]['p2']['rank'][0] for t in T]) if NP==2 else float('nan'))
from itertools import combinations
conc = [True]
for t in (T if NP==2 else []):
    for a, b in combinations('ABC', 2):
        x = R[t]['p1']['rank'].index(a) < R[t]['p1']['rank'].index(b); y = R[t]['p2']['rank'].index(a) < R[t]['p2']['rank'].index(b); conc.append(x == y)
rho = float('nan')
if NP==2:
    ov = {p: np.array([R[t][p]['scores'][c]['overall'] for t in T for c in 'ABC'], float) for p in ('p1', 'p2')}
    rho = float(np.corrcoef(ov['p1'], ov['p2'])[0, 1])
# per-triplet win rate (mean of both passes): who is rated best
wins = collections.Counter()
for t in T:
    o = {c: np.mean([R[t][p]['scores'][c]['overall'] for p in R[t]]) for c in 'ABC'}; wins[max(o, key=o.get) if list(o.values()).count(max(o.values())) == 1 else 'tie'] += 1
res = dict(n_triplets=len(T), rows=rows, mean_rank_points={c: round(float(np.mean(v)), 2) for c, v in pts.items()}, ranked_first=dict(first), ranked_last=dict(last),
           pairwise_ranked_higher={f'{a}>{b}': pair[(a, b, True)] for a, b in (('A','C'), ('B','C'), ('B','A'))}, pairwise_total_per_pair=NP * len(T), passes=NP,
           agreement_top_pick=round(float(agree), 3), agreement_pairwise=round(float(np.mean(conc)), 3), corr_overall_scores_between_passes=round(rho, 3), best_by_mean_overall=dict(wins))
json.dump(res, open(os.path.join(out, 'RATING_SUMMARY.json'), 'w'), indent=1)
print(json.dumps(res, indent=1))
