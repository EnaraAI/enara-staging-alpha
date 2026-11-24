# Mishkat engine, Step B (owner go, 24 Nov 2026): a learned merge of the trained scorer's marks and v3b's marks.
# MODEL-MARKED data: development only, never for claims, never for a real school. Reads numbers only; writes numbers only.
# Inputs: the scorer's out-of-fold marks per answer (report.json of the training run), the three markers' marks (labels-<lang>.json).
# Targets and scoring: the Sonnet-Opus agreed marks only, so the merge cannot learn to copy DeepSeek (one of the three markers).
import json, os, re, sys, random
import numpy as np
from sklearn.linear_model import LogisticRegression

LANG, REPORT, LABELS, OUT = sys.argv[1:5]
SEED = 20261124; K = 5; BOOT = 1000
CRIT = {'essay': ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics'],
        'short_answer': ['task_completion', 'grammar_accuracy', 'mechanics']}
SPLIT_SCORER = {'grammar_accuracy', 'mechanics', 'vocabulary_range'}  # Step A rule (PR #104): the scorer marks these, v3b the rest

def qwk(a, b, k):
    a, b = np.asarray(a, int), np.asarray(b, int); O = np.zeros((k, k))
    for x, y in zip(a, b): O[x, y] += 1
    n = len(a); W = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)]); d = (W * np.outer(O.sum(1), O.sum(0)) / n).sum()
    return float(1 - (W * O).sum() / d) if d else None
def stats(p, g, k):
    p, g = np.asarray(p, int), np.asarray(g, int); q = qwk(p, g, k)
    return {'n': int(len(p)), 'exact': round(float((p == g).mean()), 3), 'within1': round(float((abs(p - g) <= 1).mean()), 3), 'qwk': None if q is None else round(q, 3), 'bias': round(float((p - g).mean()), 2)}

rep = json.load(open(REPORT)); labels = {l['id']: l for l in json.load(open(LABELS))}
out = {'label': 'MODEL-MARKED: development only, not for claims, never for a real school', 'lang': LANG,
       'scorerRun': {k: rep.get(k) for k in ('recipe', 'stage1', 'stage1Essays', 'enaraLabelled')},
       'method': 'per criterion, multinomial logistic regression on one-hot marks of the scorer and of v3b (all criteria of the type); '
                 '5-fold by question; trained and scored on the Sonnet-Opus agreed marks only', 'types': {}}
for typ, crit in CRIT.items():
    oof = rep['oof'][typ]; ids = [i for i in oof if i in labels]
    grp = [re.sub(r'-(weak|mid|strong)$', '', i) for i in ids]
    G = sorted(set(grp)); random.Random(SEED).shuffle(G); fold = {g: n % K for n, g in enumerate(G)}; F = np.array([fold[g] for g in grp])
    S = np.array([[oof[i][c] for c in crit] for i in ids]); V = np.array([[labels[i]['marks']['deepseek'][c] for c in crit] for i in ids])
    SO = np.array([[labels[i]['marks']['sonnet'][c] for c in crit] for i in ids]); agree = SO == np.array([[labels[i]['marks']['opus'][c] for c in crit] for i in ids])
    mx = {c: int(max(SO[:, j].max(), V[:, j].max(), S[:, j].max())) for j, c in enumerate(crit)}
    onehot = lambda M: np.hstack([(M[:, j:j + 1] == v).astype(float) for j, c in enumerate(crit) for v in range(mx[c] + 1)])
    X = np.hstack([onehot(S), onehot(V)])
    merged = np.zeros_like(S); per = {}
    for j, c in enumerate(crit):
        for k in range(K):
            tr = (F != k) & agree[:, j]; te = F == k
            ys = SO[tr, j]
            if len(set(ys)) < 2: merged[te, j] = ys[0] if len(ys) else S[te, j]; continue
            m = LogisticRegression(C=0.5, max_iter=2000).fit(X[tr], ys); merged[te, j] = m.predict(X[te])
        split = S[:, j] if c in SPLIT_SCORER else V[:, j]
        a = agree[:, j]; kk = mx[c] + 1
        cand = {'v3b': V[:, j], 'scorer': S[:, j], 'split_stepA': split, 'learned_merge': merged[:, j]}
        per[c] = {n: stats(p[a], SO[a, j], kk) for n, p in cand.items()}
        # bootstrap over questions: learned merge minus the better of (split, v3b), QWK
        rng = np.random.default_rng(SEED); ga = np.array(grp)[a]; ug = np.unique(ga); d = []
        idx_of = {g: np.where(ga == g)[0] for g in ug}
        for _ in range(BOOT):
            ix = np.concatenate([idx_of[g] for g in rng.choice(ug, len(ug))]); gold = SO[a, j][ix]
            qm = qwk(merged[a, j][ix], gold, kk); qb = max((qwk(split[a][ix], gold, kk) or 0), (qwk(V[a, j][ix], gold, kk) or 0))
            if qm is not None: d.append(qm - qb)
        per[c]['mergeMinusBest_qwk_95ci'] = [round(float(np.percentile(d, 2.5)), 3), round(float(np.percentile(d, 97.5)), 3)] if d else None
        best_other = max(per[c]['split_stepA']['qwk'] or 0, per[c]['v3b']['qwk'] or 0)
        q_ = per[c]['learned_merge']['qwk']  # no spread in the labels -> cannot be judged; the Step A rule stays
        per[c]['passesBar'] = None if q_ is None or (per[c]['split_stepA']['qwk'] is None and per[c]['v3b']['qwk'] in (None, 0.0)) else bool(q_ >= best_other and per[c]['learned_merge']['within1'] >= 0.85)
        print(typ, c, {n: per[c][n]['qwk'] for n in cand}, 'CI', per[c]['mergeMinusBest_qwk_95ci'], 'bar', per[c]['passesBar'], flush=True)
    out['types'][typ] = {'answers': len(ids), 'questions': len(G), 'perCriterion': per}
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True); json.dump(out, open(OUT, 'w'), indent=1)
