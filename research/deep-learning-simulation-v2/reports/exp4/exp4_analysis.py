#!/usr/bin/env python3
"""Experiment 4 analysis (matched triplets: A current ENARA, B improved ENARA, C plain AI tutor). SIMULATION ONLY.
Usage: exp4_analysis.py <run-dir> <out-dir> [--outcomes hold-out|all|<file with ids>]
Read-only on the run directory. Frozen process-metric heuristics version: exp4-pm-v1 (do not change after seeing results without disclosure)."""
import csv, json, math, os, re, sys, collections
import numpy as np

run, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
subset = 'all'
if '--outcomes' in sys.argv: subset = sys.argv[sys.argv.index('--outcomes') + 1]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
hold = set(json.load(open(os.path.join(ROOT, 'config/exp4_holdout.json')))['holdout'])
rng = np.random.default_rng(20261115)
rows = [json.loads(l) for l in open(os.path.join(run, 'raw/blocks.jsonl'))]
man = json.load(open(os.path.join(run, 'manifest.json')))
att = [json.loads(l) for l in open(os.path.join(run, 'provider_attempts.jsonl'))]

def unit_of(bid): return bid.rsplit('-', 1)[0]
U = collections.defaultdict(dict)
for r in rows:
    x = r['result']
    if subset == 'hold-out' and x['outcomeId'] not in hold: continue
    if subset not in ('all', 'hold-out') and x['outcomeId'] not in set(open(subset).read().split()): continue
    U[unit_of(x['blockId'])][x['condition']] = r
units = {u: c for u, c in U.items() if {'A', 'B', 'C'} <= set(c) and all(c[k]['result']['status'] == 'ok' for k in 'ABC')}
n_incomplete = len(U) - len(units)
meta = {u: (c['A']['result']['studentId'], c['A']['result']['outcomeId']) for u, c in units.items()}
keys = sorted(units)
stud = np.array([meta[u][0] for u in keys]); outc = np.array([meta[u][1] for u in keys])
si = {s: i for i, s in enumerate(sorted(set(stud)))}; oi = {o: i for i, o in enumerate(sorted(set(outc)))}
S = np.array([si[s] for s in stud]); O = np.array([oi[o] for o in outc])

MEAS = {'gain': lambda x: x['post'] - x['pre'], 'post': lambda x: x['post'], 'transfer': lambda x: x['transfer'], 'delayed': lambda x: x['delayed'], 'mastered': lambda x: 1.0 if x['mastered'] else 0.0}
def vals(cond, m): return np.array([MEAS[m](units[u][cond]['result']) for u in keys])

def two_way_ci(d, B=4000):
    ns, no = len(si), len(oi); est = float(d.mean()); res = []
    for _ in range(B):
        cs = np.bincount(rng.integers(0, ns, ns), minlength=ns); co = np.bincount(rng.integers(0, no, no), minlength=no); w = cs[S] * co[O]
        if w.sum() > 0: res.append((w * d).sum() / w.sum())
    return est, float(np.quantile(res, .025)), float(np.quantile(res, .975))
def sign_flip(d, B=20000):
    per = {}
    for s_, v in zip(S, d): per.setdefault(s_, []).append(v)
    m = np.array([np.mean(v) for v in per.values()]); obs = abs(m.mean()); sg = rng.choice([-1.0, 1.0], size=(B, len(m)))
    return float((np.sum(np.abs((sg * m).mean(axis=1)) >= obs - 1e-12) + 1) / (B + 1))
def dz(d):
    per = {}
    for s_, v in zip(S, d): per.setdefault(s_, []).append(v)
    m = np.array([np.mean(v) for v in per.values()]); sd = m.std(ddof=1)
    return float(m.mean() / sd * (1 - 3 / (4 * (len(m) - 1) - 1))) if sd > 0 else float('nan')
def holm(ps):
    idx = sorted(range(len(ps)), key=lambda i: ps[i]); out_, run_ = [0] * len(ps), 0
    for k, i in enumerate(idx): run_ = max(run_, min(1, (len(ps) - k) * ps[i])); out_[i] = run_
    return out_

res = []; Z = (2.2414 + 0.841621) ** 2
for m in MEAS:
    vA, vB, vC = (vals(c, m) for c in 'ABC')
    for a, b, va, vb in (('B', 'A', vB, vA), ('B', 'C', vB, vC), ('A', 'C', vA, vC)):
        d = va - vb; est, lo, hi = two_way_ci(d); res.append(dict(measure=m, contrast=f'{a} - {b}', n_units=len(d), n_students=len(si), n_outcomes=len(oi), mean_first=round(float(va.mean()), 4), mean_second=round(float(vb.mean()), 4), diff=round(est, 4), ci_lo=round(lo, 4), ci_hi=round(hi, 4), dz=round(dz(d), 3), var_unit_diff=round(float(d.var(ddof=1)), 4), p_sign_flip=round(sign_flip(d), 4)))
conf = [r for r in res if r['measure'] == 'gain' and r['contrast'] in ('B - A', 'B - C')]
for r, q in zip(conf, holm([r['p_sign_flip'] for r in conf])): r['holm_adj_p'] = round(q, 4); r['label'] = 'confirmatory'
for r in res: r.setdefault('label', 'descriptive (A - C)' if r['contrast'] == 'A - C' else 'secondary/exploratory')
with open(os.path.join(out, 'EXP4_CONTRASTS.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(res[0].keys()) + ['holm_adj_p']); w.writeheader(); [w.writerow(r) for r in res]

# process metrics (frozen heuristics)
HINT = re.compile(r"\b(hint|clue|think about|look at|which (one|word)|try again|have another look|check the)\b", re.I)
CLOSE = re.compile(r"\b(remember|to sum|summary|recap|in your own words|so far you|what you (learned|did)|today you)\b", re.I)
OWN = re.compile(r"in your own words|tell me the rule", re.I)
CONC = re.compile(r"you('re| are) right[^.!?\n]{0,70}\b(fine|okay|ok)\b", re.I)
def pm(r):
    t = [u['tutor'] or '' for u in r['teaching']['turns']]
    hintq = [bool(HINT.search(x)) and '?' in x for x in t]; run = best = 0
    for h in hintq: run = run + 1 if h else 0; best = max(best, run)
    return dict(recap=bool(CLOSE.search(t[-1])), own_words=any(OWN.search(x) for x in t), hint_run3=best >= 3, concession=any(CONC.search(x) for x in t))
proc = {}
for c in 'ABC':
    p = [pm(units[u][c]) for u in keys]; proc[c] = {k: round(float(np.mean([x[k] for x in p])), 3) for k in p[0]}
# cost per condition (block-attributed ledger)
bc = collections.defaultdict(float)
for a in att:
    if a['blockId'] and (a['costUsd'] is not None): bc[a['blockId'].rsplit('-', 1)[1]] += a['costUsd']
cost = {c: round(bc[c], 2) for c in 'ABC'}; nb = len(keys)
mast = {c: int(sum(units[u][c]['result']['mastered'] for u in keys)) for c in 'ABC'}
d_BA = vals('B', 'gain') - vals('A', 'gain'); d_BC = vals('B', 'gain') - vals('C', 'gain')
sig2 = max(float(d_BA.var(ddof=1)), float(d_BC.var(ddof=1)))
n_rule = max(150, math.ceil(1.2 * 9.505 * sig2 / 0.08 ** 2))
summary = dict(run=run, subset=subset, units_complete=nb, units_incomplete_excluded=n_incomplete, students=len(si), outcomes=len(oi), process_metrics=proc, cost_by_condition=cost, mastered=mast, var_gain_diff_B_minus_A=round(float(d_BA.var(ddof=1)), 4), var_gain_diff_B_minus_C=round(float(d_BC.var(ddof=1)), 4), sigma2_d_used=round(sig2, 4), N_triplets_by_rule=n_rule, heuristics='exp4-pm-v1')
json.dump(summary, open(os.path.join(out, 'EXP4_SUMMARY.json'), 'w'), indent=1)
print(json.dumps(summary, indent=1))
for r in res:
    if r['measure'] in ('gain', 'transfer', 'delayed', 'mastered'): print(r['measure'].ljust(10), r['contrast'], 'n', r['n_units'], r['mean_first'], r['mean_second'], 'diff', r['diff'], '[', r['ci_lo'], r['ci_hi'], '] p', r['p_sign_flip'], r.get('holm_adj_p', ''))
