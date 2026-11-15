#!/usr/bin/env python3
"""ESL stage-1 agent study analysis (change A, levelExplicit). SIMULATION ONLY: AI-simulated learners, tutors, scorers and raters.
Usage: esl1_analysis.py <tags.json> <closed_scores.json> <free_scores.json> <ratings_dir> <key_p1.json> <key_p2.json> <out_dir>
Arms: P, A0, ARB (= A0+arb), LE (= A0+LE). Paired over students (cluster = student). Contrasts fixed in advance (PROTOCOL.md):
  LE-A0, LE-ARB, LE-P, A0-P. Bootstrap 95% CI over students (10,000 resamples), exact sign-flip test over students (2^n), Holm over the four contrasts,
  separately for each outcome. Subgroups: all 18, explicit-first (A1+A2, n=12), B2 proficient (n=6). Read-only on inputs."""
import json, glob, os, sys, itertools, collections
import numpy as np

tagsf, closedf, freef, ratedir, key1, key2, out = sys.argv[1:8]
os.makedirs(out, exist_ok=True); rng = np.random.default_rng(20261115)
ARMS = ['P', 'A0', 'ARB', 'LE']
CONTRASTS = [('LE', 'A0'), ('LE', 'ARB'), ('LE', 'P'), ('A0', 'P')]
CRIT = ['overall', 'clarity', 'reasoning', 'answer_protection', 'hint_progression', 'recap']
tags = json.load(open(tagsf)); closed = json.load(open(closedf)); free = json.load(open(freef))
band = {t['studentIdx']: t['band'] for t in tags}; S = sorted(band)
GROUPS = {'all 18': S, 'explicit-first (A1+A2)': [s for s in S if band[s] in ('A1', 'A2')], 'B2 proficient': [s for s in S if band[s] == 'B2']}

# ---- post-test scores per (student, arm)
acc = collections.defaultdict(lambda: collections.defaultdict(float))
cnt = collections.defaultdict(lambda: collections.defaultdict(int))
for r in closed:
    k = (r['studentIdx'], r['arm']); kind = 'next' if r['kind'] == 'next' else 'controlled'
    acc[k][(r['version'], kind)] += r['correct']; cnt[k][(r['version'], kind)] += 1
fr = collections.defaultdict(lambda: collections.defaultdict(list))
for r in free: fr[(r['studentIdx'], r['arm'])][r['version']].append(r['score'])
def outcome(s, arm, name):
    k = (s, arm)
    c = acc[k][('v1', 'controlled')]; f = sum(fr[k]['v1']); n_c = cnt[k][('v1', 'controlled')]; n_f = len(fr[k]['v1'])
    if name == 'controlled': return c / n_c if n_c else np.nan
    if name == 'free': return f / n_f if n_f else np.nan
    if name == 'combined': return (c + f) / (n_c + n_f) if (n_c + n_f) else np.nan   # 4 controlled + 2 free items, free scored 0 / 0.5 / 1
    if name == 'next_level': n = cnt[k][('v1', 'next')]; return acc[k][('v1', 'next')] / n if n else np.nan
    if name == 'consistency':  # parallel form v2 after the filler: 4 controlled + 2 free
        c2 = acc[k][('v2', 'controlled')]; n2 = cnt[k][('v2', 'controlled')]; f2 = sum(fr[k]['v2']); nf2 = len(fr[k]['v2'])
        return (c2 + f2) / (n2 + nf2) if (n2 + nf2) else np.nan
OUTS = ['combined', 'controlled', 'free', 'next_level', 'consistency']

def boot(d, B=10000):
    d = np.asarray(d, float); idx = rng.integers(0, len(d), (B, len(d))); bs = d[idx].mean(axis=1)
    return float(d.mean()), float(np.quantile(bs, .025)), float(np.quantile(bs, .975))
def signflip(d):
    d = np.asarray(d, float); n = len(d); obs = abs(d.mean())
    signs = np.array(list(itertools.product([-1, 1], repeat=n)), dtype=np.int8) if n <= 18 else None
    if signs is None: raise SystemExit('n too large for exact test')
    return float((np.abs((signs * d).mean(axis=1)) >= obs - 1e-12).mean())
def holm(ps):
    o = sorted(range(len(ps)), key=lambda i: ps[i]); res = [0] * len(ps); run = 0
    for k, i in enumerate(o): run = max(run, min(1, (len(ps) - k) * ps[i])); res[i] = run
    return res

def contrast_table(valfn, students):
    rows = []
    for x, y in CONTRASTS:
        d = np.array([valfn(s, x) - valfn(s, y) for s in students]); d = d[~np.isnan(d)]
        if len(d) < 2: rows.append(dict(contrast=f'{x} - {y}', n=len(d))); continue
        est, lo, hi = boot(d); rows.append(dict(contrast=f'{x} - {y}', n=len(d), diff=round(est, 3), lo=round(lo, 3), hi=round(hi, 3), p=round(signflip(d), 4), ties=int((d == 0).sum())))
    for r, q in zip(rows, holm([r.get('p', 1.0) for r in rows])): r['holm_p'] = round(q, 4)
    return rows

res = dict(n_students=len(S), groups={g: len(v) for g, v in GROUPS.items()}, means={}, contrasts={})
for gname, members in GROUPS.items():
    res['means'][gname] = {o: {a: round(float(np.nanmean([outcome(s, a, o) for s in members])), 3) for a in ARMS} for o in OUTS}
    res['contrasts'][gname] = {o: contrast_table(lambda s, a, o=o: outcome(s, a, o), members) for o in OUTS}

# ---- ratings (two passes; 4 tutors per case, labels hidden)
R = collections.defaultdict(lambda: collections.defaultdict(list)); RK = collections.defaultdict(dict)
for pnum, kf in (('1', key1), ('2', key2)):
    key = json.load(open(kf))
    for f in sorted(glob.glob(os.path.join(ratedir, f'rt*_p{pnum}.json'))):
        d = json.load(open(f)); b = d['batch']
        for r in d['ratings']:
            k = key[b][r['case']]; stu = k['studentIdx']
            for L, sc in r['scores'].items():
                arm = k['labels'][L]
                for c in CRIT:
                    if sc.get(c) is not None: R[(stu, arm)][c].append(sc[c])
            RK[stu][pnum] = [k['labels'][L] for L in r['ranking']]
def rate(s, a, c): v = R[(s, a)][c]; return float(np.mean(v)) if v else np.nan
if R:
    res['rating_means'] = {g: {c: {a: round(float(np.nanmean([rate(s, a, c) for s in m])), 2) for a in ARMS} for c in CRIT} for g, m in GROUPS.items()}
    res['rating_contrasts'] = {g: {c: contrast_table(lambda s, a, c=c: rate(s, a, c), m) for c in CRIT} for g, m in GROUPS.items()}
    first = collections.Counter(); last = collections.Counter(); agree = []
    for s, d in RK.items():
        for rk in d.values(): first[rk[0]] += 1; last[rk[-1]] += 1
        if len(d) == 2: agree.append(d['1'][0] == d['2'][0])
    res['rating_ranked_first'] = dict(first); res['rating_ranked_last'] = dict(last); res['rating_agreement_top_pick'] = round(float(np.mean(agree)), 3) if agree else None
    a1 = [R[(s, a)]['overall'] for s in S for a in ARMS if len(R[(s, a)]['overall']) == 2]
    res['rating_overall_corr_between_passes'] = round(float(np.corrcoef([x[0] for x in a1], [x[1] for x in a1])[0, 1]), 3) if len(a1) > 2 else None

# ---- tags: strand split, rule line, moves, guards
T = collections.defaultdict(list)
for t in tags: T[t['arm']].append(t)
ENARA = ['A0', 'ARB', 'LE']
res['strand_split'] = {a: dict(collections.Counter(t['strand'] for t in T[a] if t['strand'])) for a in ENARA}
res['moves'] = {a: dict(collections.Counter(m for t in T[a] for m in t['moves'])) for a in ENARA}
res['rule_line_share'] = {a: {g: round(float(np.mean([bool(t['ruleLine']) for t in T[a] if t['studentIdx'] in GROUPS[g]])), 3) for g in ('explicit-first (A1+A2)', 'B2 proficient')} for a in ENARA}
res['first_turn_rule_line'] = {a: {g: int(sum(1 for t in T[a] if t['turn'] == 2 - 1 and t['ruleLine'] and t['studentIdx'] in GROUPS[g])) for g in ('explicit-first (A1+A2)', 'B2 proficient')} for a in ENARA}
res['closing_ask'] = {a: dict(collections.Counter(t['closingAsk'] for t in T[a] if t['closingAsk'])) for a in ENARA}
res['mean_tutor_words'] = {a: round(float(np.mean([t['words'] for t in T[a]])), 1) for a in ARMS}
res['guard_removed_turns'] = {a: int(sum(1 for t in T[a] if t['guardRemoved'])) for a in ENARA}
leak_raw = {a: int(sum(1 for t in T[a] if t['leakRaw'])) for a in ARMS}; leak_final = {a: int(sum(1 for t in T[a] if t['leakFinal'])) for a in ARMS}
two = {a: int(sum(1 for t in T[a] if t['twoAsks'])) for a in ENARA}
res['leaks'] = dict(raw_turns=leak_raw, reaching_student_turns=leak_final, sessions_with_leak_reaching_student={a: len({t['studentIdx'] for t in T[a] if t['leakFinal']}) for a in ARMS}, turns_per_arm=len(T['A0']))
res['two_asks_turns'] = two

# ---- guards (A0+LE against A0) and decision
ap = {a: [rate(s, a, 'answer_protection') for s in S] for a in ARMS}
ap_drop = float(np.nanmean(ap['A0']) - np.nanmean(ap['LE'])) if R else None
guards = dict(
    answer_protection_drop_vs_A0=None if ap_drop is None else round(ap_drop, 3), g1_pass=None if ap_drop is None else bool(ap_drop <= 0.3),
    leaks_reaching_student=dict(A0=leak_final['A0'], LE=leak_final['LE']), g2_pass=bool(leak_final['LE'] <= leak_final['A0']),
    two_asks=two, g3_pass=bool(all(v == 0 for v in two.values())),
)
ef = res['contrasts']['explicit-first (A1+A2)']['combined'][0]
cond_a = bool(ef.get('lo', -1) > 0)
guards_ok = bool(guards['g1_pass'] and guards['g2_pass'] and guards['g3_pass']) if guards['g1_pass'] is not None else None
res['guards'] = guards
res['decision'] = dict(explicit_first_LE_minus_A0_combined=ef, interval_above_zero=cond_a, guards_pass=guards_ok, verdict='GO' if (cond_a and guards_ok) else 'NO-GO')
json.dump(res, open(os.path.join(out, 'ESL1_SUMMARY.json'), 'w'), indent=1)
print(json.dumps({k: res[k] for k in ('means', 'guards', 'decision')}, indent=1))
