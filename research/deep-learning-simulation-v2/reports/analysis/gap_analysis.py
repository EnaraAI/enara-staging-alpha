#!/usr/bin/env python3
"""ENARA (A) vs plain AI tutor (C): gap analysis on the immutable data of runs/full-experiment-3.
Read-only: never writes into runs/. Outputs CSV/JSON next to this file's parent (reports/).
SIMULATION ONLY: AI-simulated students, not human-learning evidence. No scipy: numpy bootstrap/permutation only."""
import csv, glob, json, os, re, math, collections
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..')); REPORTS = os.path.join(ROOT, 'reports')
R = os.path.join(ROOT, 'runs', 'full-experiment-3')
rng = np.random.default_rng(20261114)
B_BOOT, B_PERM = 5000, 20000

rows = [json.loads(l) for l in open(os.path.join(R, 'raw/blocks.jsonl'))]
audit = {a['blockId']: a for a in map(json.loads, open(os.path.join(R, 'raw/audit.jsonl')))}
bench = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'benchmark/outcomes/*.json'))):
    for o in json.load(open(f))['outcomes']: bench[o['id']] = o
DOMAIN = {'grammar': 'Grammar', 'vocabulary': 'Vocabulary', 'reading': 'Reading comprehension', 'writing': 'Writing', 'functional': 'Functional language', 'listening': 'Text-based listening/dialogue comprehension'}

def block(r):
    x = r['result']; d = r['dimensions'] or {}
    a = audit.get(x['blockId'])
    return dict(blockId=x['blockId'], student=x['studentId'], rep=x['replication'], outcome=x['outcomeId'], area=x['area'], cond=x['condition'], tags=x['tags'], difficulty=x['difficulty'], cefr=x['cefr'],
        pre=x['pre'], post=x['post'], gain=x['post'] - x['pre'], transfer=x['transfer'], delayed=x['delayed'], mastered=1.0 if x['mastered'] else 0.0,
        mis_held=x['misconceptionHeld'], mis_rec=(None if x['misconceptionRecovered'] is None else (1.0 if x['misconceptionRecovered'] else 0.0)),
        indep=d.get('independentPerformance'), prereq=x['prereq'], cost=x['costUsd'], hintdep=x['hintDependence'], calib=x['calibrationGap'], turns=x['turns'], words=x['exposureWords'],
        knows=(a or {}).get('knowsAlready'), heldMis=(a or {}).get('heldMisconception'), has_audit=a is not None, raw=r)
ALL = [block(r) for r in rows]
AC = [b for b in ALL if b['cond'] in ('A', 'C')]
A = [b for b in AC if b['cond'] == 'A']; C = [b for b in AC if b['cond'] == 'C']
STUDENTS = sorted({b['student'] for b in ALL})
TAGS = {b['student']: b['tags'] for b in ALL}

METRICS = [('pre', 'Pre-test'), ('post', 'Post-test'), ('gain', 'Learning gain (post-pre)'), ('transfer', 'Transfer'), ('delayed', 'Delayed retention'), ('mastered', 'Mastery rate'), ('indep', 'Independent performance (post+transfer)')]

# outcome baselines from non-E conditions only (difficulty adjustment); E is excluded from every definitive comparison
base = collections.defaultdict(lambda: collections.defaultdict(list))
for b in ALL:
    if b['cond'] != 'E':
        for m, _ in METRICS:
            if b[m] is not None: base[m][b['outcome']].append(b[m])
base = {m: {o: float(np.mean(v)) for o, v in d.items()} for m, d in base.items()}

def student_diffs(m, students=None, adjust=False, blocks=None):
    blocks = blocks if blocks is not None else AC
    by = collections.defaultdict(lambda: {'A': [], 'C': []})
    for b in blocks:
        if students is not None and b['student'] not in students: continue
        v = b[m]
        if v is None or (isinstance(v, float) and math.isnan(v)): continue
        if adjust: v = v - base[m][b['outcome']]
        by[b['student']][b['cond']].append(v)
    out = {s: (np.mean(d['A']) - np.mean(d['C'])) for s, d in by.items() if d['A'] and d['C']}
    mean_a = float(np.mean([np.mean(d['A']) for d in by.values() if d['A'] and d['C']])) if out else float('nan')
    mean_c = float(np.mean([np.mean(d['C']) for d in by.values() if d['A'] and d['C']])) if out else float('nan')
    return out, mean_a, mean_c

def hedges_dz(d):
    n = len(d); sd = np.std(d, ddof=1) if n > 1 else float('nan')
    if not n > 1 or sd == 0: return float('nan')
    return float(np.mean(d) / sd * (1 - 3 / (4 * (n - 1) - 1)))

def boot_ci(d, B=B_BOOT):
    d = np.asarray(d); n = len(d)
    if n < 2: return (float('nan'), float('nan'))
    idx = rng.integers(0, n, size=(B, n)); m = d[idx].mean(axis=1)
    return (float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975)))

def sign_flip_p(d, B=B_PERM):
    d = np.asarray(d); n = len(d)
    if n < 2: return float('nan')
    obs = abs(d.mean()); s = rng.choice([-1.0, 1.0], size=(B, n)); m = np.abs((s * d).mean(axis=1))
    return float((np.sum(m >= obs - 1e-12) + 1) / (B + 1))

def outcome_cluster_ci(m, B=B_BOOT):
    """Generalisation across outcomes: per outcome (with both A and C blocks) difference of means; bootstrap outcomes."""
    per = collections.defaultdict(lambda: {'A': [], 'C': []})
    for b in AC:
        if b[m] is not None: per[b['outcome']][b['cond']].append(b[m])
    d = np.array([np.mean(v['A']) - np.mean(v['C']) for v in per.values() if v['A'] and v['C']])
    if len(d) < 2: return (float('nan'), float('nan'), len(d))
    idx = rng.integers(0, len(d), size=(B, len(d))); mm = d[idx].mean(axis=1)
    return (float(np.quantile(mm, 0.025)), float(np.quantile(mm, 0.975)), len(d))

def interp(m, diff, lo, hi, p):
    pts = diff * 100; sig = (lo > 0 or hi < 0)
    size = 'negligible' if abs(pts) < 3 else ('small' if abs(pts) < 8 else 'educationally meaningful')
    who = 'ENARA higher' if diff > 0 else 'Plain AI tutor higher' if diff < 0 else 'equal'
    return f"{who}; {abs(pts):.1f} points ({size}); {'CI excludes 0' if sig else 'CI includes 0 (not distinguishable from zero)'}"

def metric_row(label, m, students=None, scope='overall', adjust=False, with_outcome_ci=False):
    d, ma, mc = student_diffs(m, students, adjust)
    arr = np.array(list(d.values()))
    if len(arr) < 2: return None
    lo, hi = boot_ci(arr); p = sign_flip_p(arr); diff = float(arr.mean())
    rel = (diff / mc) if (mc is not None and abs(mc) >= 0.05) else float('nan')
    row = dict(metric=label + (' [outcome-adjusted]' if adjust else ''), scope=scope, n_students=len(arr), A=round(ma, 4), C=round(mc, 4), diff_A_minus_C=round(diff, 4), relative_diff=(round(rel, 3) if rel == rel else ''),
               hedges_dz=round(hedges_dz(arr), 3), ci95_lo=round(lo, 4), ci95_hi=round(hi, 4), p_sign_flip=round(p, 4), test='student-level paired difference (mean over the student\'s 3 replications); student-cluster bootstrap CI (5000); sign-flip permutation test (20000)', interpretation=interp(m, diff, lo, hi, p))
    if with_outcome_ci:
        olo, ohi, n_o = outcome_cluster_ci(m); row.update(outcome_ci95_lo=round(olo, 4), outcome_ci95_hi=round(ohi, 4), n_outcomes_with_both=n_o)
    return row

def prop_row(label, vals_a, vals_c, scope):
    """Unpaired block-level proportion difference with student-cluster bootstrap (misconception recovery: few paired students)."""
    if not vals_a or not vals_c: return None
    sa = collections.defaultdict(list); sc = collections.defaultdict(list)
    for s, v in vals_a: sa[s].append(v)
    for s, v in vals_c: sc[s].append(v)
    def est(ss_a, ss_c):
        a = np.mean([v for s in ss_a for v in sa[s]]) if any(sa[s] for s in ss_a) else float('nan'); c = np.mean([v for s in ss_c for v in sc[s]]) if any(sc[s] for s in ss_c) else float('nan'); return a - c
    A_st = [s for s in sa]; C_st = [s for s in sc]
    diffs = []
    for _ in range(B_BOOT):
        ia = rng.choice(A_st, size=len(A_st)); ic = rng.choice(C_st, size=len(C_st)); diffs.append(est(ia, ic))
    diffs = np.array([x for x in diffs if x == x]); a = float(np.mean([v for _, v in vals_a])); c = float(np.mean([v for _, v in vals_c])); lo, hi = float(np.quantile(diffs, .025)), float(np.quantile(diffs, .975))
    # permutation of condition labels at block level (students clustered by shuffling labels within student where both present is not possible; label shuffle is an approximation, stated)
    allv = np.array([v for _, v in vals_a] + [v for _, v in vals_c]); nA = len(vals_a); obs = abs(a - c); cnt = 0
    for _ in range(B_PERM // 4):
        perm = rng.permutation(allv); cnt += abs(perm[:nA].mean() - perm[nA:].mean()) >= obs - 1e-12
    p = (cnt + 1) / (B_PERM // 4 + 1)
    return dict(metric=label, scope=scope, n_students=f"{len(A_st)} (A) / {len(C_st)} (C)", A=round(a, 4), C=round(c, 4), diff_A_minus_C=round(a - c, 4), relative_diff=(round((a - c) / c, 3) if c >= 0.05 else ''), hedges_dz='',
                ci95_lo=round(lo, 4), ci95_hi=round(hi, 4), p_sign_flip=round(p, 4), test=f"unpaired block-level proportion (A blocks {len(vals_a)}, C blocks {len(vals_c)}) among blocks where the pre-test showed the misconception; student-cluster bootstrap CI; label-permutation p (ignores clustering: anti-conservative)", interpretation=interp('mis', a - c, lo, hi, p))

metric_rows = []
for m, label in METRICS:
    metric_rows.append(metric_row(label, m, scope='overall', with_outcome_ci=True))
    metric_rows.append(metric_row(label, m, scope='overall', adjust=True))
mv_a = [(b['student'], b['mis_rec']) for b in A if b['mis_rec'] is not None]; mv_c = [(b['student'], b['mis_rec']) for b in C if b['mis_rec'] is not None]
metric_rows.append(prop_row('Misconception correction (blocks where the misconception showed at pre-test)', mv_a, mv_c, 'overall'))
for rep in (1, 2, 3):
    sub = [b for b in AC if b['rep'] == rep]
    for m, label in METRICS:
        r = None
        d, ma, mc = student_diffs(m, blocks=sub); arr = np.array(list(d.values()))
        if len(arr) > 1:
            lo, hi = boot_ci(arr); diff = float(arr.mean()); metric_rows.append(dict(metric=label, scope=f'replication {rep}', n_students=len(arr), A=round(ma, 4), C=round(mc, 4), diff_A_minus_C=round(diff, 4), relative_diff=(round(diff / mc, 3) if abs(mc) >= .05 else ''), hedges_dz=round(hedges_dz(arr), 3), ci95_lo=round(lo, 4), ci95_hi=round(hi, 4), p_sign_flip=round(sign_flip_p(arr), 4), test='student-level paired difference within the replication (1 block per condition per student); student bootstrap CI; sign-flip test', interpretation=interp(m, diff, lo, hi, 0)))
for area, dom in DOMAIN.items():
    sub = [b for b in AC if b['area'] == area]
    for m, label in METRICS:
        d, ma, mc = student_diffs(m, blocks=sub); arr = np.array(list(d.values()))
        if len(arr) > 1:
            lo, hi = boot_ci(arr); diff = float(arr.mean()); metric_rows.append(dict(metric=label, scope=f'domain, paired within student (small n): {dom}', n_students=len(arr), A=round(ma, 4), C=round(mc, 4), diff_A_minus_C=round(diff, 4), relative_diff=(round(diff / mc, 3) if abs(mc) >= .05 else ''), hedges_dz=round(hedges_dz(arr), 3), ci95_lo=round(lo, 4), ci95_hi=round(hi, 4), p_sign_flip=round(sign_flip_p(arr), 4), test='student-level paired difference over that domain\'s blocks (1 block per condition per student per replication); student bootstrap CI; sign-flip test', interpretation=interp(m, diff, lo, hi, 0)))
TAGLIST = sorted({t for ts in TAGS.values() for t in ts})
for tag in TAGLIST:
    studs = {s for s, ts in TAGS.items() if tag in ts}
    if len(studs) < 4: continue
    for m, label in METRICS[2:6]:
        r = metric_row(label, m, studs, scope=f'profile tag: {tag} (simulator parameter, not a validated classification)')
        if r: metric_rows.append(r)

# block-level, outcome-adjusted domain comparison (A blocks vs C blocks inside the domain; student-cluster bootstrap of each arm)
def block_level_row(label, m, blocks, scope):
    a = [(b['student'], b[m] - base[m][b['outcome']]) for b in blocks if b['cond'] == 'A' and b[m] is not None]
    c = [(b['student'], b[m] - base[m][b['outcome']]) for b in blocks if b['cond'] == 'C' and b[m] is not None]
    if len(a) < 4 or len(c) < 4: return None
    sa, sc = collections.defaultdict(list), collections.defaultdict(list)
    for s_, v in a: sa[s_].append(v)
    for s_, v in c: sc[s_].append(v)
    A_st, C_st = list(sa), list(sc); diffs = []
    for _ in range(B_BOOT):
        ia = rng.choice(A_st, size=len(A_st)); ic = rng.choice(C_st, size=len(C_st))
        diffs.append(np.mean([v for s_ in ia for v in sa[s_]]) - np.mean([v for s_ in ic for v in sc[s_]]))
    va = np.array([v for _, v in a]); vc = np.array([v for _, v in c]); diff = float(va.mean() - vc.mean()); allv = np.concatenate([va, vc]); cnt = 0
    for _ in range(4000):
        pm = rng.permutation(allv); cnt += abs(pm[:len(va)].mean() - pm[len(va):].mean()) >= abs(diff) - 1e-12
    lo, hi = float(np.quantile(diffs, .025)), float(np.quantile(diffs, .975)); sp = math.sqrt((va.var(ddof=1) * (len(va) - 1) + vc.var(ddof=1) * (len(vc) - 1)) / (len(va) + len(vc) - 2))
    ma = float(np.mean([b[m] for b in blocks if b['cond'] == 'A' and b[m] is not None])); mc = float(np.mean([b[m] for b in blocks if b['cond'] == 'C' and b[m] is not None]))
    return dict(metric=label + ' [outcome-adjusted, block-level]', scope=scope, n_students=f"{len(A_st)} (A) / {len(C_st)} (C)", A=round(ma, 4), C=round(mc, 4), diff_A_minus_C=round(diff, 4), relative_diff=(round((ma - mc) / mc, 3) if abs(mc) >= .05 else ''), hedges_dz=round(diff / sp, 3) if sp > 0 else '', ci95_lo=round(lo, 4), ci95_hi=round(hi, 4), p_sign_flip=round((cnt + 1) / 4001, 4),
                test=f"unpaired block-level difference of outcome-adjusted values (A {len(a)} blocks, C {len(c)} blocks); student-cluster bootstrap CI; label-permutation p (ignores clustering: anti-conservative); effect size = Cohen d (pooled SD) of block values", interpretation=interp(m, diff, lo, hi, 0))
for area, dom in DOMAIN.items():
    sub = [b for b in AC if b['area'] == area]
    for m, label in METRICS[1:6]:
        r = block_level_row(label, m, sub, f'domain, block-level: {dom}')
        if r: metric_rows.append(r)
# Benjamini-Hochberg q over every exploratory (non-overall) row with a p-value
ex = [r for r in metric_rows if r['scope'] != 'overall' and isinstance(r.get('p_sign_flip'), float) and r['p_sign_flip'] == r['p_sign_flip'] and r['p_sign_flip'] > 0]
ex.sort(key=lambda r: r['p_sign_flip']); mtot = len(ex); prev = 1.0
for i in range(mtot - 1, -1, -1):
    prev = min(prev, ex[i]['p_sign_flip'] * mtot / (i + 1)); ex[i]['q_BH_exploratory'] = round(prev, 4)
metric_rows = [r for r in metric_rows if r]
keys = ['metric', 'scope', 'n_students', 'A', 'C', 'diff_A_minus_C', 'relative_diff', 'hedges_dz', 'ci95_lo', 'ci95_hi', 'outcome_ci95_lo', 'outcome_ci95_hi', 'n_outcomes_with_both', 'p_sign_flip', 'q_BH_exploratory', 'test', 'interpretation']
with open(os.path.join(REPORTS, 'ENARA_A_VS_C_METRICS.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore'); w.writeheader(); [w.writerow(r) for r in metric_rows]

# ---------------------------------------------------------------- outcomes
per_o = collections.defaultdict(lambda: {'A': [], 'C': []})
for b in AC: per_o[b['outcome']][b['cond']].append(b)
def mean_of(bs, m): v = [x[m] for x in bs if x[m] is not None]; return float(np.mean(v)) if v else float('nan')
out_rows = []
for oid in sorted(bench):
    o = bench[oid]; a = per_o[oid]['A']; c = per_o[oid]['C']
    row = dict(outcome=oid, domain=DOMAIN[o['area']], title=o['title'], cefr=o['cefr'], difficulty=o['difficulty'], n_blocks_A=len(a), n_blocks_C=len(c))
    for m in ('pre', 'post', 'gain', 'transfer', 'delayed', 'mastered'):
        row[f'A_{m}'] = round(mean_of(a, m), 3) if a else ''; row[f'C_{m}'] = round(mean_of(c, m), 3) if c else ''
    if a and c:
        gd = [x['gain'] for x in a]; gc = [x['gain'] for x in c]; diff = np.mean(gd) - np.mean(gc)
        ia = rng.integers(0, len(gd), size=(B_BOOT, len(gd))); ic = rng.integers(0, len(gc), size=(B_BOOT, len(gc)))
        bs = np.array(gd)[ia].mean(axis=1) - np.array(gc)[ic].mean(axis=1); lo, hi = np.quantile(bs, .025), np.quantile(bs, .975)
        row.update(gain_diff=round(float(diff), 3), gain_ci95_lo=round(float(lo), 3), gain_ci95_hi=round(float(hi), 3))
        pa, pc = mean_of(a, 'post'), mean_of(c, 'post'); ma_, mc_ = mean_of(a, 'mastered'), mean_of(c, 'mastered')
        n_min = min(len(a), len(c))
        if pa < .35 and pc < .35 and ma_ == 0 and mc_ == 0: cls = 'both tutors fail (post < 35%, no mastery)'
        elif ma_ >= .5 and mc_ >= .5: cls = 'both tutors reach mastery (>= 50% of blocks)'
        elif abs(diff) < .05: cls = 'similar (gain difference under 5 points)'
        elif diff > 0: cls = 'ENARA higher (directional)'
        else: cls = 'Plain AI tutor higher (directional)'
        ev = 'insufficient: fewer than 6 blocks per arm' if n_min < 6 else 'limited'
        if n_min >= 6 and (lo > 0 or hi < 0): ev = 'CI excludes 0'
        row.update(classification=cls, evidence=ev)
    else:
        row.update(classification='no A-vs-C comparison possible (outcome has no block in one of the two conditions)', evidence='none')
    out_rows.append(row)
okeys = ['outcome', 'domain', 'title', 'cefr', 'difficulty', 'n_blocks_A', 'n_blocks_C'] + [f'{c}_{m}' for m in ('pre', 'post', 'gain', 'transfer', 'delayed', 'mastered') for c in 'AC'] + ['gain_diff', 'gain_ci95_lo', 'gain_ci95_hi', 'classification', 'evidence']
with open(os.path.join(REPORTS, 'ENARA_OUTCOME_GAP_ANALYSIS.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=okeys, extrasaction='ignore'); w.writeheader(); [w.writerow(r) for r in out_rows]

# ---------------------------------------------------------------- students
stu_rows = []
for s in STUDENTS:
    a = [b for b in A if b['student'] == s]; c = [b for b in C if b['student'] == s]
    def mm(bs, m): return mean_of(bs, m)
    row = dict(student=s, tags='; '.join(TAGS[s]), n_A=len(a), n_C=len(c))
    for m in ('pre', 'gain', 'transfer', 'delayed', 'mastered'):
        row[f'A_{m}'] = round(mm(a, m), 3); row[f'C_{m}'] = round(mm(c, m), 3)
    mra = [x['mis_rec'] for x in a if x['mis_rec'] is not None]; mrc = [x['mis_rec'] for x in c if x['mis_rec'] is not None]
    row.update(A_mis_blocks=len(mra), A_mis_recovered=int(sum(mra)), C_mis_blocks=len(mrc), C_mis_recovered=int(sum(mrc)))
    row['gain_diff_A_minus_C'] = round(row['A_gain'] - row['C_gain'], 3)
    flags = []
    if row['gain_diff_A_minus_C'] >= .15: flags.append('learned better with ENARA (gain +15 pts or more)')
    if row['gain_diff_A_minus_C'] <= -.15: flags.append('learned better with plain tutor (gain -15 pts or more)')
    if row['A_gain'] <= .05 and row['C_gain'] <= .05 and row['A_mastered'] == 0 and row['C_mastered'] == 0: flags.append('neither tutor worked (gain <= 5 pts, no mastery)')
    if (len(mra) and sum(mra) == 0) and (len(mrc) == 0 or sum(mrc) == 0) and (len(mra) + len(mrc)) >= 2: flags.append('persistent misconception (never recovered under either tutor)')
    hdA = [x['hintdep'] for x in a if x['hintdep'] is not None]
    if hdA and np.mean(hdA) >= 0.5 and (mm(a, 'post') - mm(a, 'transfer')) >= .1: flags.append('hint-heavy ENARA sessions with post>transfer gap (possible hint dependence; text-pattern proxy)')
    for tag_c, bs in (('ENARA', a), ('plain tutor', c)):
        if mm(bs, 'post') >= .5 and (mm(bs, 'post') - mm(bs, 'delayed')) >= .2: flags.append(f'good post but forgot later under {tag_c} (post - delayed >= 20 pts)')
    row['flags'] = ' | '.join(flags)
    stu_rows.append(row)
skeys = ['student', 'tags', 'n_A', 'n_C'] + [f'{c}_{m}' for m in ('pre', 'gain', 'transfer', 'delayed', 'mastered') for c in 'AC'] + ['A_mis_blocks', 'A_mis_recovered', 'C_mis_blocks', 'C_mis_recovered', 'gain_diff_A_minus_C', 'flags']
with open(os.path.join(REPORTS, 'ENARA_STUDENT_GAP_ANALYSIS.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=skeys, extrasaction='ignore'); w.writeheader(); [w.writerow(r) for r in stu_rows]

# ---------------------------------------------------------------- process metrics from transcripts (text-pattern heuristics; stated as such)
RULE = re.compile(r"\b(rule|we add|add -?s|always|never|must|means?|should|use \*?\*?\w+\*?\*? (for|with|before|after)|comes? (before|after)|is used)\b", re.I)
HINT = re.compile(r"\b(hint|clue|think about|look at|remember|notice|what (do|does) (you|the)|try again|have another look|check the)\b", re.I)
PRAISE = re.compile(r"\b(great|good job|well done|excellent|nice|correct|exactly|perfect|that'?s right|right!)\b", re.I)
def norm(t): return ' ' + re.sub(r'\s+', ' ', re.sub(r"[^\w' ]+", ' ', t.lower())).strip() + ' '
def process_metrics(bl):
    o = bench[bl['outcome']]; t = bl['raw']['teaching']['turns']; tut = [u['tutor'] or '' for u in t]; stu = [u['learner'] for u in t]
    answers = [norm(a) for it in o['lesson']['spec']['items'] for a in it['acceptedAnswers'] if len(a.split()) >= 2]
    gave = any(a.strip() and a in norm(x) for a in answers for x in tut)
    return dict(words_per_turn=np.mean([len(x.split()) for x in tut]), q_rate=np.mean(['?' in x for x in tut]), rule_turn1=bool(RULE.search(tut[0])), rule_any=np.mean([bool(RULE.search(x)) for x in tut]),
        hint_rate=np.mean([bool(HINT.search(x)) for x in tut]), praise_rate=np.mean([bool(PRAISE.search(x)) for x in tut]), gave_practice_answer=gave, turn1_has_question=('?' in tut[0]), turn1_words=len(tut[0].split()),
        student_attempt_turns=sum(1 for x in stu[1:] if len(x.split()) <= 12))
proc = {}
for cond, bs in (('A', A), ('C', C)):
    pm = [process_metrics(b) for b in bs]
    proc[cond] = {k: round(float(np.mean([p[k] for p in pm])), 3) for k in pm[0]}
json.dump(proc, open(os.path.join(HERE, 'process_metrics.json'), 'w'), indent=1)

# domain and profile summary dicts for the report writer
summary = {'overall': {r['metric']: r for r in metric_rows if r['scope'] == 'overall'}, 'process': proc}
json.dump({'metric_rows': metric_rows, 'outcome_rows': out_rows, 'student_rows': stu_rows, 'process': proc}, open(os.path.join(HERE, 'results.json'), 'w'), indent=1, default=str)
print('metrics rows', len(metric_rows), 'outcomes', len(out_rows), 'students', len(stu_rows))
for r in metric_rows:
    if r['scope'] == 'overall': print(r['metric'][:44].ljust(44), 'A', r['A'], 'C', r['C'], 'diff', r['diff_A_minus_C'], '[', r['ci95_lo'], r['ci95_hi'], '] g', r.get('hedges_dz'), 'p', r['p_sign_flip'], 'outcomeCI', r.get('outcome_ci95_lo'), r.get('outcome_ci95_hi'))
print(proc)
