# SIMULATION ONLY. NO API. ESL7-journey analysis (config/agent_sim_esl7/PROTOCOL.md section 8).
# Input: a run folder with POST.json and CEFR.json (esl7Study.ts post), and, when present, TAGS.json / STUCK.json (tags), FIT.json, JUDGE_AGREEMENT.json,
# FIT_AGREEMENT.json. Output: ANALYSIS.json and ANALYSIS.md in the run folder.
# Primary: the 4-week delayed score per learner (mean of their 2 outcomes), NEW - BASE: paired sign-flip test (exact when n <= 20, else 100000 random
# flips, seed 20261120), two-sided, and a 95% bootstrap interval (10000 resamples, seed 20261121). NEW is better if p < 0.05 and the interval is above 0.
# Secondary (descriptive): NEW - PP, BASE - PP on the same measure; every measure by outcome, skill and age band, the three arms side by side.
import itertools, json, os, random, sys
from collections import defaultdict

ARMS = ['BASE', 'NEW', 'PP']
TIMES = ['pre', 'imm', 'wk1', 'wk4']
FLIPS = 100000
BOOT = 10000
SKILL_NAMES = {'GR': 'grammar', 'VO': 'vocabulary', 'FN': 'functions', 'RD': 'reading', 'WR': 'writing'}
AGE_ORDER = ['u9', '9-12', 'teen', 'adult']


def load(d, name, default=None):
    p = os.path.join(d, name)
    return json.load(open(p)) if os.path.exists(p) else default


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def r3(x): return None if x is None else round(x, 3)


def sign_flip(diffs, seed=20261120):
    n = len(diffs); obs = abs(sum(diffs) / n) if n else 0.0
    if n == 0: return {'n': 0, 'p': None, 'method': 'none'}
    if n <= 20:
        k = sum(1 for signs in itertools.product([1, -1], repeat=n) if abs(sum(s * d for s, d in zip(signs, diffs)) / n) >= obs - 1e-12)
        return {'n': n, 'p': k / 2 ** n, 'method': 'exact sign-flip'}
    rng = random.Random(seed); k = 0
    for _ in range(FLIPS):
        if abs(sum(d if rng.random() < 0.5 else -d for d in diffs) / n) >= obs - 1e-12: k += 1
    return {'n': n, 'p': (k + 1) / (FLIPS + 1), 'method': f'{FLIPS} random sign flips (seed {seed})'}


def bootstrap(diffs, seed=20261121):
    if not diffs: return [None, None]
    rng = random.Random(seed); n = len(diffs)
    ms = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(BOOT))
    return [ms[int(0.025 * BOOT)], ms[int(0.975 * BOOT) - 1]]


def compare(per_learner, a, b):
    ids = sorted(set(per_learner[a]) & set(per_learner[b]))
    diffs = [per_learner[a][i] - per_learner[b][i] for i in ids]
    t = sign_flip(diffs); ci = bootstrap(diffs)
    return {'contrast': f'{a} - {b}', 'n': len(diffs), 'meanDiff': r3(mean(diffs)), 'p': None if t['p'] is None else round(t['p'], 5), 'test': t['method'],
            'ci95': [r3(ci[0]), r3(ci[1])], 'meanA': r3(mean([per_learner[a][i] for i in ids])), 'meanB': r3(mean([per_learner[b][i] for i in ids]))}


def table(rows, keyf):
    """{group: {arm: {time: mean, n, mastery}}}"""
    g = defaultdict(lambda: defaultdict(list))
    for r in rows: g[keyf(r)][r['arm']].append(r)
    out = {}
    for k in sorted(g, key=lambda x: (AGE_ORDER.index(x) if x in AGE_ORDER else 99, str(x))):
        out[k] = {}
        for arm in ARMS:
            rs = g[k].get(arm, [])
            out[k][arm] = {**{t: r3(mean([r[t] for r in rs])) for t in TIMES}, 'n': len(rs), 'mastered': sum(1 for r in rs if r.get('mastery') is True)}
    return out


def main(d):
    post = load(d, 'POST.json'); cefr = load(d, 'CEFR.json', [])
    if not post: raise SystemExit(f'{d}/POST.json missing: run "post" first')
    # primary measure: per learner and arm, the mean 4-week score of their 2 outcomes
    per = {arm: {} for arm in ARMS}
    by = defaultdict(list)
    for r in post: by[(r['arm'], r['learner'])].append(r)
    for (arm, lid), rs in by.items():
        if len(rs) == 2 and all(r['wk4'] is not None for r in rs): per[arm][lid] = sum(r['wk4'] for r in rs) / 2
    primary = compare(per, 'NEW', 'BASE')
    primary['verdict'] = 'NEW better' if primary['p'] is not None and primary['p'] < 0.05 and primary['ci95'][0] is not None and primary['ci95'][0] > 0 else 'not shown'
    secondary = [compare(per, 'NEW', 'PP'), compare(per, 'BASE', 'PP')]
    # descriptive tables
    tables = {
        'overall': table(post, lambda r: 'all'),
        'byOutcome': table(post, lambda r: r['outcome']),
        'bySkill': table(post, lambda r: SKILL_NAMES.get(r['skill'], r['skill'])),
        'byAgeGroup': table(post, lambda r: r['ageGroup']),
        'byLevel': table(post, lambda r: r['level']),
    }
    mastery = {arm: {'mastered': sum(1 for r in post if r['arm'] == arm and r['mastery'] is True), 'of': sum(1 for r in post if r['arm'] == arm),
                     'bySkill': {SKILL_NAMES.get(s, s): sum(1 for r in post if r['arm'] == arm and r['skill'] == s and r['mastery'] is True) for s in sorted({r['skill'] for r in post})}} for arm in ARMS}
    cefr_out = {}
    for arm in ARMS:
        cs = [c for c in cefr if c['arm'] == arm]
        mv = [c['move'] for c in cs if c['move'] is not None]
        dist = lambda key: {lv: sum(1 for c in cs if (c[key] or {}).get('level') == lv) for lv in ['pre-A1', 'A1', 'A2', 'B1']}
        cefr_out[arm] = {'n': len(cs), 'meanMove': r3(mean(mv)), 'up': sum(1 for m in mv if m > 0), 'same': sum(1 for m in mv if m == 0), 'down': sum(1 for m in mv if m < 0), 'pre': dist('pre'), 'wk4': dist('wk4')}
    # other measures (PROTOCOL section 7), when present
    tags = load(d, 'TAGS.json'); stuck = load(d, 'STUCK.json'); fit = load(d, 'FIT.json')
    other = {}
    if tags is not None:
        def tag_tab(keyf):
            g = defaultdict(lambda: defaultdict(list))
            for t in tags: g[keyf(t)][t['arm']].append(t)
            st = defaultdict(lambda: defaultdict(int))
            for s in stuck or []: st[keyf(s)][s['arm']] += 1
            return {k: {arm: {'replies': len(g[k].get(arm, [])), 'earlyLeakReplies': sum(1 for t in g[k].get(arm, []) if t['earlyLeakFinal'] > 0), 'twoAsksReplies': sum(1 for t in g[k].get(arm, []) if t['twoAsks']), 'stuckRuns': st[k].get(arm, 0)} for arm in ARMS} for k in sorted(g, key=lambda x: (AGE_ORDER.index(x) if x in AGE_ORDER else 99, str(x)))}
        other['tags'] = {'overall': tag_tab(lambda t: 'all'), 'bySkill': tag_tab(lambda t: SKILL_NAMES.get(t['skill'], t['skill'])), 'byAgeGroup': tag_tab(lambda t: t['ageGroup']), 'byOutcome': tag_tab(lambda t: t['outcome'])}
    if fit is not None:
        def fit_tab(keyf):
            g = defaultdict(lambda: defaultdict(list))
            for f in fit: g[keyf(f)][f['arm']].append(f)
            return {k: {arm: {'n': len(g[k].get(arm, [])), **{it: r3(mean([f['items'][it] for f in g[k].get(arm, [])])) for it in ['teacher_accept', 'age_fit']}} for arm in ARMS} for k in sorted(g, key=lambda x: (AGE_ORDER.index(x) if x in AGE_ORDER else 99, str(x)))}
        other['fit'] = {'overall': fit_tab(lambda f: 'all'), 'byAgeGroup': fit_tab(lambda f: f['ageGroup'])}
    guards = {'judgeAgreement': load(d, 'JUDGE_AGREEMENT.json'), 'fitAgreement': load(d, 'FIT_AGREEMENT.json')}
    guards = {k: ({x: v[x] for x in ('agreement', 'pass') if x in v} if v else None) for k, v in guards.items()}
    res = {'_label': 'SIMULATION ONLY: simulated learners, not evidence about real learners', 'learners': len({r['learner'] for r in post}), 'outcomes': len({r['outcome'] for r in post}),
           'primary': primary, 'secondary': secondary, 'tables': tables, 'mastery': mastery, 'cefr': cefr_out, 'other': other, 'guards': guards}
    json.dump(res, open(os.path.join(d, 'ANALYSIS.json'), 'w'), indent=1)
    # markdown
    f = lambda x: '-' if x is None else (f'{x:.3f}' if isinstance(x, float) else str(x))
    L = ['# SIMULATION ONLY', '', '# ESL7-journey analysis', '', f'Simulated learners: {res["learners"]}; outcomes: {res["outcomes"]}. These are simulated results, not evidence about real learners.', '',
         '## Primary (PROTOCOL §8): 4-week score per learner (mean of 2 outcomes)', '', '| Contrast | n | mean A | mean B | diff | 95% CI | p | test |', '|---|---|---|---|---|---|---|---|']
    for c in [primary] + secondary:
        L.append(f'| {c["contrast"]} | {c["n"]} | {f(c["meanA"])} | {f(c["meanB"])} | {f(c["meanDiff"])} | [{f(c["ci95"][0])}, {f(c["ci95"][1])}] | {f(c["p"])} | {c["test"]} |')
    L += ['', f'Verdict (NEW better if p < 0.05 and the interval is above 0): **{primary["verdict"]}**. NEW - PP and BASE - PP are descriptive.', '']
    for name, key in [('Overall', 'overall'), ('By skill', 'bySkill'), ('By age band', 'byAgeGroup'), ('By level', 'byLevel'), ('By outcome (n = 4 learners per arm; means only)', 'byOutcome')]:
        L += [f'## {name}: mean score (pre / imm / wk1 / wk4) and mastered on wk4', '', '| Group | ' + ' | '.join(f'{a} pre/imm/wk1/wk4 | {a} mastered' for a in ARMS) + ' |', '|---|' + '---|---|' * len(ARMS)]
        for k, v in tables[key].items():
            L.append(f'| {k} | ' + ' | '.join(f'{f(v[a]["pre"])} / {f(v[a]["imm"])} / {f(v[a]["wk1"])} / {f(v[a]["wk4"])} | {v[a]["mastered"]} of {v[a]["n"]}' for a in ARMS) + ' |')
        L.append('')
    L += ['## Mastery on the 4-week test (outcome criterion, unassisted)', '', '| Arm | mastered | ' + ' | '.join(SKILL_NAMES.get(s, s) for s in sorted({r["skill"] for r in post})) + ' |', '|---|---|' + '---|' * len({r["skill"] for r in post})]
    for a in ARMS: L.append(f'| {a} | {mastery[a]["mastered"]} of {mastery[a]["of"]} | ' + ' | '.join(str(v) for v in mastery[a]['bySkill'].values()) + ' |')
    L += ['', '## CEFR estimate (placement engine, pre and 4 weeks)', '', '| Arm | n | mean move | up | same | down | pre (pre-A1/A1/A2) | wk4 (pre-A1/A1/A2) |', '|---|---|---|---|---|---|---|---|']
    for a in ARMS:
        c = cefr_out[a]; L.append(f'| {a} | {c["n"]} | {f(c["meanMove"])} | {c["up"]} | {c["same"]} | {c["down"]} | {c["pre"]["pre-A1"]}/{c["pre"]["A1"]}/{c["pre"]["A2"]} | {c["wk4"]["pre-A1"]}/{c["wk4"]["A1"]}/{c["wk4"]["A2"]} |')
    if 'tags' in other:
        L += ['', '## Stuck runs, early answer leaks, two-task replies', '', '| Group | ' + ' | '.join(f'{a} stuck / early leaks / two asks (replies)' for a in ARMS) + ' |', '|---|' + '---|' * len(ARMS)]
        for sect in ['overall', 'bySkill', 'byAgeGroup']:
            for k, v in other['tags'][sect].items(): L.append(f'| {k} | ' + ' | '.join(f'{v[a]["stuckRuns"]} / {v[a]["earlyLeakReplies"]} / {v[a]["twoAsksReplies"]} ({v[a]["replies"]})' for a in ARMS) + ' |')
    if 'fit' in other:
        L += ['', '## Fit judges (0-2; one case per journey, blind to arm)', '', '| Group | ' + ' | '.join(f'{a} teacher_accept / age_fit' for a in ARMS) + ' |', '|---|' + '---|' * len(ARMS)]
        for sect in ['overall', 'byAgeGroup']:
            for k, v in other['fit'][sect].items(): L.append(f'| {k} | ' + ' | '.join(f'{f(v[a]["teacher_accept"])} / {f(v[a]["age_fit"])}' for a in ARMS) + ' |')
    L += ['', '## Guards', '', f'- Judge agreement: {guards["judgeAgreement"]}', f'- Fit agreement: {guards["fitAgreement"]}', '']
    open(os.path.join(d, 'ANALYSIS.md'), 'w').write('\n'.join(L))
    print(json.dumps({'primary': primary, 'secondary': secondary, 'mastery': {a: mastery[a]['mastered'] for a in ARMS}, 'cefrMeanMove': {a: cefr_out[a]['meanMove'] for a in ARMS}}))


if __name__ == '__main__':
    main(os.path.abspath(sys.argv[1]))
