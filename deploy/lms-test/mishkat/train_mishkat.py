# Mishkat (owner go, 23 Nov 2026): two-stage essay/short-answer trait scorer. MODEL-MARKED dev data: development only, not for claims,
# never for a real school. Stage 1 pre-trains on LAILA / ELLIPSE (downloaded at run time, never stored); stage 2 fine-tunes on the ENARA
# model-marked labels (owner corrections win). Separate heads for essays and short answers. Length-robust features only (no raw length).
# Output: numbers only (results/report.json). CPU only, no secrets.
import json, os, re, subprocess, sys, time, random, zipfile, io, copy
import numpy as np, pandas as pd, torch

T0 = time.time()
def log(*a): print(f"[{time.strftime('%H:%M:%S')} +{(time.time() - T0) / 60:.1f} min]", *a, flush=True)
LANG = os.environ['MK_LANG']; DATA = os.environ['MK_DATA']; SEED = 20261123
ENC = {'en': 'microsoft/deberta-v3-base', 'ar': 'CAMeL-Lab/bert-base-arabic-camelbert-msa'}[LANG]  # = mishkat_features.ENCODERS
MAXLEN = 256; PRE_N = int(os.environ.get('MK_PRE_N', '2500'))
rng = np.random.default_rng(SEED); random.seed(SEED); torch.manual_seed(SEED)
torch.set_num_threads(max(1, min(4, len(os.sched_getaffinity(0)))))
os.makedirs('results', exist_ok=True)
CR = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']
SHORT_CR = ['task_completion', 'grammar_accuracy', 'mechanics']
MAX = {'essay': {c: 2 for c in CR}, 'short_answer': {'task_completion': 2, 'grammar_accuracy': 1, 'mechanics': 1}}

# ---------------- length-robust features + encoder: shared with the Modal service (mishkat_features.py), same numbers ----------------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mishkat_features as MF
from mishkat_features import Head
_E = MF.Encoder(ENC, MAXLEN)
def X_of(texts, part): return MF.X_of(texts, LANG, _E, part, log)

# ---------------- stage-1 data (public datasets, never stored) ----------------
def sh(c): subprocess.run(c, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def stage1():
    if LANG == 'en':
        sh('git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git /tmp/ellipse')
        df = pd.read_csv('/tmp/ellipse/ELLIPSE_Final_github_train.csv', encoding_errors='replace')
        b = lambda v: np.where(v <= 2.5, 0, np.where(v <= 3.5, 1, 2))
        Y = np.full((len(df), 5), np.nan, dtype=np.float32)
        Y[:, 1] = b((df.Grammar + df.Syntax) / 2); Y[:, 2] = b((df.Vocabulary + df.Phraseology) / 2); Y[:, 3] = b(df.Cohesion); Y[:, 4] = b(df.Conventions)
        texts = df.full_text.tolist(); ids = df.text_id_kaggle.astype(str).tolist()
    else:
        sh('git clone -q --depth 1 https://gitlab.com/bigirqu/laila.git /tmp/laila')
        df = pd.read_csv('/tmp/laila/essays_and_scores/all_essays_with_indivdual_rater_scores.csv', dtype={'essay_id': str})
        b = lambda v: np.where(v <= 1, 0, np.where(v <= 3, 1, 2))
        Y = np.stack([np.clip(np.rint(df.relevance), 0, 2), b(df.grammar), b(df.vocabulary), b(df.organization), b(df.mechanics)], 1).astype(np.float32)
        texts = df.essay.tolist(); ids = df.essay_id.astype(str).tolist()
    idx = rng.permutation(len(texts))[:PRE_N]
    return [texts[i] for i in idx], Y[idx], [ids[i] for i in idx]

# ---------------- human re-check: the same 200 human-scored essays as this morning's v3b measurement ----------------
def human():
    ids = [str(x) for x in json.load(open(os.environ['MK_BASELINE']))['results']['ellipse' if LANG == 'en' else 'laila']['sampledIds']]
    if LANG == 'en':
        pw = re.search(r'password for the zip file is \*\*(\S+?)\*\*', open('/tmp/ellipse/README.md').read()).group(1)  # public; never printed
        z = zipfile.ZipFile('/tmp/ellipse/ELLIPSE_Final_github_test.zip'); df = pd.read_csv(io.BytesIO(z.read(z.namelist()[0], pwd=pw.encode())), encoding_errors='replace')
        df = df.set_index(df.text_id_kaggle.astype(str)).loc[ids]
        b = lambda v: np.where(v <= 2.5, 0, np.where(v <= 3.5, 1, 2))
        Y = {'grammar_accuracy': b((df.Grammar + df.Syntax) / 2), 'vocabulary_range': b((df.Vocabulary + df.Phraseology) / 2), 'organisation': b(df.Cohesion), 'mechanics': b(df.Conventions)}
        return df.full_text.tolist(), Y, ids
    df = pd.read_csv('/tmp/laila/essays_and_scores/all_essays_with_indivdual_rater_scores.csv', dtype={'essay_id': str}).set_index('essay_id').loc[ids]
    b = lambda v: np.where(v <= 1, 0, np.where(v <= 3, 1, 2))
    Y = {'task_completion': np.clip(np.rint(df.relevance), 0, 2).astype(int), 'grammar_accuracy': b(df.grammar), 'vocabulary_range': b(df.vocabulary), 'organisation': b(df.organization), 'mechanics': b(df.mechanics)}
    return df.essay.tolist(), Y, ids

# ---------------- ENARA model-marked data ----------------
def enara():
    pool = {p['id']: p for p in json.load(open(f'{DATA}/pool-{LANG}.json'))}
    labels = json.load(open(f'{DATA}/labels-{LANG}.json'))
    corr_f = f'{DATA}/owner-corrections.json'; corr = json.load(open(corr_f)) if os.path.exists(corr_f) else {}
    rows = []; n_corr = 0
    for l in labels:
        lab = dict(l['label']); src = 'model-marked'
        if l['id'] in corr:
            for c, v in corr[l['id']].items():
                if c in lab and v is not None and v != lab[c]: lab[c] = int(v); n_corr += 1
            src = 'owner'
        p = pool[l['id']]
        grp = re.sub(r'-(weak|mid|strong)$', '', l['id'])  # benchmark answers share their question; new answers have their own
        rows.append({**p, 'label': lab, 'marks': l['marks'], 'labelSource': src, 'group': grp})
    return rows, n_corr

# ---------------- the head: pre-train (stage 1), fine-tune (stage 2) ----------------
# Head: imported from mishkat_features (the service builds the same module)
def fit(model, X, Y, epochs, lr, Xv=None, Yv=None):
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4); Xt = torch.tensor(X); Yt = torch.tensor(Y); best = (1e9, copy.deepcopy(model.state_dict())); bad = 0
    for ep in range(epochs):
        model.train(); perm = torch.randperm(len(Xt))
        for i in range(0, len(Xt), 64):
            j = perm[i:i + 64]; y = Yt[j]; m = ~torch.isnan(y); p = model(Xt[j])
            loss = ((p - torch.nan_to_num(y)) ** 2 * m).sum() / m.sum().clamp(min=1); opt.zero_grad(); loss.backward(); opt.step()
        if Xv is not None:
            model.eval()
            with torch.no_grad(): yv = torch.tensor(Yv); m = ~torch.isnan(yv); e = float((((model(torch.tensor(Xv)) - torch.nan_to_num(yv)) ** 2) * m).sum() / m.sum())
            if e < best[0] - 1e-4: best = (e, copy.deepcopy(model.state_dict())); bad = 0
            else:
                bad += 1
                if bad >= 8: break
    if Xv is not None: model.load_state_dict(best[1])
    return model
def predict(model, X):
    model.eval()
    with torch.no_grad(): return model(torch.tensor(X)).numpy()

def qwk(a, b, k):
    O = np.zeros((k, k))
    for x, y in zip(a, b): O[x, y] += 1
    n = len(a); ha, hb = O.sum(1), O.sum(0); W = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)])
    d = (W * np.outer(ha, hb) / n).sum(); return round(float(1 - (W * O).sum() / d), 3) if d else None
def stats(p, g, k):
    p, g = np.asarray(p, int), np.asarray(g, int)
    return {'n': int(len(p)), 'exact': round(float((p == g).mean()), 3), 'within1': round(float((abs(p - g) <= 1).mean()), 3), 'qwk': qwk(p, g, k), 'bias': round(float((p - g).mean()), 2)}

# ---------------- run ----------------
log(f'{LANG}: encoder {ENC}, max {MAXLEN} tokens, stage-1 sample {PRE_N}')
pre_texts, pre_Y, pre_ids = stage1(); log(f'stage 1 data: {len(pre_texts)} essays')
rows, n_corr = enara(); log(f'ENARA model-marked: {len(rows)} labelled answers, owner corrections applied: {n_corr}')
# Cache of the slow part (encoder + features), keyed by the workflow on the data and this feature version; a later crash or a retrain
# after owner corrections reuses it. Labels are not cached (corrections must always apply).
CACHE = os.environ.get('MK_CACHE', 'cache'); os.makedirs(CACHE, exist_ok=True)
def cached(name, texts, part):
    f = f'{CACHE}/{LANG}-{name}.npz'
    if os.path.exists(f):
        d = np.load(f, allow_pickle=True)
        if list(d['keys']) == [str(hash_t(t)) for t in texts]: log(f'{part}: from cache'); return d['X']
    X = X_of(texts, part); np.savez(f, X=X, keys=np.array([str(hash_t(t)) for t in texts])); return X
import hashlib
def hash_t(t): return hashlib.sha1(t.encode('utf-8')).hexdigest()[:16]
Xpre = cached('stage1', pre_texts, 'stage-1 essays')
Xen = cached('enara', [r['answer'] for r in rows], 'ENARA answers')
# Length augmentation (owner, 23 Nov 2026, Arabic): shortened and padded copies of every ENARA answer. They keep the answer's grammar and
# spelling labels (a shorter or longer answer with the same quality of language must get the same marks); the other criteria are left
# unlabelled for the copies. The padding sentences used here are different from the ones in the padding TEST.
AUG = os.environ.get('MK_AUG') == '1'
PAD_TRAIN = {'en': ['We go to the park on Fridays.', 'My brother likes football.', 'The weather is nice today.', 'I read a book every week.', 'Our teacher is very kind.', 'We eat dinner together.'],
             'ar': ['نذهب إلى الحديقة يوم الجمعة.', 'يحب أخي كرة القدم.', 'الجو جميل اليوم.', 'أقرأ كتابًا كل أسبوع.', 'معلمنا لطيف جدًا.', 'نتناول العشاء معًا.']}[LANG]
SPLIT = lambda t: [x for x in re.split(r'(?<=[.!?؟])\s+', t.strip()) if x]
K = 5
for typ_ in ('essay', 'short_answer'):  # the same fold assignment the CV loop uses
    gs = sorted({r['group'] for r in rows if r['type'] == typ_}); random.Random(SEED).shuffle(gs); fo = {g: n % K for n, g in enumerate(gs)}
    for r in rows:
        if r['type'] == typ_: r['fold'] = fo[r['group']]
# Padding (owner decision (b), 23 Nov 2026): pad with sentences that carry the answer's own kind of errors = sentences from OTHER answers
# of the same type, the same fold and the same grammar and spelling marks, so the share of faulty sentences stays the same. Used for the
# training copies and for the padding test; always inside one fold, so no test text reaches training.
POOL = {}
for n_, r in enumerate(rows):
    for sn in SPLIT(r['answer']):
        if len(sn.split()) >= 3: POOL.setdefault((r['type'], r['fold'], r['label']['grammar_accuracy'], r['label']['mechanics']), []).append((n_, sn))
def pad_like(i, k_, rng):
    r = rows[i]; cand = [sn for (n_, sn) in POOL.get((r['type'], r['fold'], r['label']['grammar_accuracy'], r['label']['mechanics']), []) if n_ != i]
    return ' '.join(rng.sample(cand, min(k_, len(cand)))) if cand else ''
aug_src, aug_texts = [], []
if AUG:
    rr = random.Random(SEED)
    for i, r in enumerate(rows):
        ss = SPLIT(r['answer']); keep = 2 if r['type'] == 'essay' else 1
        if len(ss) > keep: aug_src.append(i); aug_texts.append(' '.join(ss[:keep]))
        for kpad in (1, 2, 4):  # several padding amounts with same-kind sentences
            pad = pad_like(i, kpad, rr)
            if pad: aug_src.append(i); aug_texts.append(r['answer'] + ' ' + pad)
    Xaug = cached('aug', aug_texts, 'length-augmented copies')
    log(f'length augmentation: {len(aug_texts)} copies')
aug_src = np.array(aug_src, dtype=int)
mu, sd = np.vstack([Xpre, Xen]).mean(0), np.vstack([Xpre, Xen]).std(0) + 1e-6
Z = lambda X: ((X - mu) / sd).astype(np.float32)
Xpre, Xen = Z(Xpre), Z(Xen)
if AUG: Xaug = Z(Xaug)

# Keep the human re-check essays out of stage 1 (the cached stage-1 sample stays the same; overlapping rows are dropped here).
h_texts, h_Y, h_ids = human(); hset = set(h_ids)
keep = np.array([pid not in hset for pid in pre_ids]); Xpre, pre_Y = Xpre[keep], pre_Y[keep]
Xh = Z(cached('human', h_texts, 'human re-check essays'))
V3B = json.load(open(os.environ['MK_V3B']))['results']['ellipse' if LANG == 'en' else 'laila']['perCriterion']
log(f'stage 1 after removing re-check essays: {len(Xpre)}; human re-check essays: {len(h_texts)}')

report = {'label': 'MODEL-MARKED: development only, not for claims, never for a real school', 'lang': LANG, 'encoder': ENC, 'maxTokens': MAXLEN,
          'stage1Essays': int(len(Xpre)), 'enaraLabelled': len(rows), 'ownerCorrections': n_corr, 'evaluation': '5-fold cross-validation by question (every answer tested once, never trained on in its fold)', 'types': {}}
RECIPE = 'two_stage' if LANG == 'en' else 'stage2_only'  # run 2-3: the better recipe per language
CMP = None
if os.environ.get('MK_COMPARE') and os.path.exists(os.environ['MK_COMPARE']):  # answers Claude graded earlier
    CMP = json.load(open(os.environ['MK_COMPARE']))
    Xcmp = Z(cached('compare', [c['answer'] for c in CMP], 'Claude comparison answers')) if CMP else None
report['recipe'] = RECIPE; report['oof'] = {}; report['compareScores'] = {}
EXPORT_TYPES = {}  # final model per type, for the service bundle (MK_EXPORT=1)
rnd_of = lambda P, crit, mx: np.stack([np.clip(np.rint(P[:, j]), 0, mx[c]) for j, c in enumerate(crit)], 1).astype(int)
for typ in ['essay', 'short_answer']:
    crit = CR if typ == 'essay' else SHORT_CR; ix = [CR.index(c) for c in crit]; mx = MAX[typ]
    Ypre = pre_Y[:, ix].copy()
    if typ == 'short_answer':  # short answers: grammar and spelling are 0-1 (1 unless the meaning is blocked)
        for j, c in enumerate(crit):
            if mx[c] == 1: Ypre[:, j] = np.where(np.isnan(Ypre[:, j]), np.nan, (Ypre[:, j] >= 1).astype(np.float32))
    T = [i for i, r in enumerate(rows) if r['type'] == typ]
    groups = sorted({rows[i]['group'] for i in T}); random.Random(SEED).shuffle(groups)  # shuffled, so validation groups mix subjects
    fold_of = {rows[i]['group']: rows[i]['fold'] for i in T}
    Y_of = lambda idx: np.array([[rows[i]['label'][c] for c in crit] for i in idx], dtype=np.float32)
    d = Xpre.shape[1]
    torch.manual_seed(SEED); s1 = fit(Head(d, len(crit)), Xpre, Ypre, 15, 1e-3)
    oof = {'two_stage': np.zeros((len(rows), len(crit))), 'stage2_only': np.zeros((len(rows), len(crit))), 'stage1_only': predict(s1, Xen)}
    tests_acc = {r_: {'short': [], 'trunc': [], 'pad': []} for r_ in ('two_stage', 'stage2_only')}
    for k in range(K):
        te = [i for i in T if fold_of[rows[i]['group']] == k]
        trg = [g for g in groups if fold_of[g] != k]; val_g = set(trg[:max(1, len(trg) // 8)])
        va = [i for i in T if rows[i]['group'] in val_g]; tr = [i for i in T if fold_of[rows[i]['group']] != k and rows[i]['group'] not in val_g]
        Xtr, Ytr = Xen[tr], Y_of(tr)
        if AUG:  # copies of the training answers only (never of test answers)
            sel_a = [n for n, i in enumerate(aug_src) if i in set(tr)]
            Ya = np.full((len(sel_a), len(crit)), np.nan, dtype=np.float32)
            for m_, n in enumerate(sel_a):
                for j, c in enumerate(crit):
                    if c in ('grammar_accuracy', 'mechanics'): Ya[m_, j] = rows[aug_src[n]]['label'][c]
            Xtr, Ytr = np.vstack([Xtr, Xaug[sel_a]]), np.vstack([Ytr, Ya])
        s2 = fit(copy.deepcopy(s1), Xtr, Ytr, 80, 3e-4, Xen[va], Y_of(va))
        torch.manual_seed(SEED + k); s2o = fit(Head(d, len(crit)), Xtr, Ytr, 80, 1e-3, Xen[va], Y_of(va))
        P = predict(s2, Xen[te]); oof['two_stage'][te] = P; oof['stage2_only'][te] = predict(s2o, Xen[te])
        gi, mi = crit.index('grammar_accuracy'), crit.index('mechanics')
        Xc = Xp = None
        if typ == 'essay':
            strong = [n for n, i in enumerate(te) if rows[i]['label']['grammar_accuracy'] == 2 and len(re.split(r'(?<=[.!?؟])\s+', rows[i]['answer'])) >= 4]
            if strong: Xc = Z(X_of([' '.join(re.split(r'(?<=[.!?؟])\s+', rows[te[n]]['answer'])[:3]) for n in strong], f'truncation test fold {k + 1}'))
            rp = random.Random(SEED + 100 + k)  # padding test: 3 same-kind sentences from other test answers of this fold
            Xp = Z(X_of([rows[i]['answer'] + ' ' + pad_like(i, 3, rp) for i in te], f'padding test fold {k + 1}'))
        for rname, mdl in (('two_stage', s2), ('stage2_only', s2o)):
            P_ = predict(mdl, Xen[te]); acc = tests_acc[rname]
            if typ == 'short_answer':
                for n, i in enumerate(te):
                    L = rows[i]['label']
                    if L['grammar_accuracy'] == 1 and L['mechanics'] == 1 and L['task_completion'] == 2: acc['short'].append(bool(P_[n, gi] >= 0.5 and P_[n, mi] >= 0.5))
            else:
                if Xc is not None: Pc = predict(mdl, Xc); acc['trunc'] += list(np.r_[P_[strong, gi] - Pc[:, gi], P_[strong, mi] - Pc[:, mi]])
                Pp = predict(mdl, Xp); acc['pad'] += list(np.r_[Pp[:, gi] - P_[:, gi], Pp[:, mi] - P_[:, mi]])
        log(f'{typ} fold {k + 1}/{K}: train {len(tr)}, val {len(va)}, test {len(te)}')
    gold = Y_of(T).astype(int); v3b = np.array([[rows[i]['marks']['deepseek'][c] for c in crit] for i in T])
    so_mask = np.array([[rows[i]['marks']['sonnet'][c] == rows[i]['marks']['opus'][c] for c in crit] for i in T]); so_gold = np.array([[rows[i]['marks']['sonnet'][c] for c in crit] for i in T])
    preds = {name: rnd_of(P[T], crit, mx) for name, P in oof.items()}
    per = {}
    for j, c in enumerate(crit):
        kk = mx[c] + 1; m = so_mask[:, j]
        per[c] = {'vsMedian': {**{n: stats(P[:, j], gold[:, j], kk) for n, P in preds.items()}, 'v3b_deepseek': stats(v3b[:, j], gold[:, j], kk)},
                  'vsSonnetOpusAgreed': {**{n: stats(P[m, j], so_gold[m, j], kk) for n, P in preds.items()}, 'v3b_deepseek': stats(v3b[m, j], so_gold[m, j], kk)},
                  'labelSpread': {str(v): int((gold[:, j] == v).sum()) for v in range(kk)}}
    def tests_of(acc):
        t = {}
        if acc['short']: v = float(np.mean(acc['short'])); t['shortCorrectNotScoredDown'] = {'n': len(acc['short']), 'share': round(v, 3), 'pass': v >= 0.9}
        if acc['trunc']: v = float(np.mean(acc['trunc'])); t['truncation'] = {'n': len(acc['trunc']) // 2, 'meanDropGrammarSpelling': round(v, 3), 'pass': v <= 0.3}
        if acc['pad']: v = float(np.mean(acc['pad'])); t['padding'] = {'n': len(acc['pad']) // 2, 'meanRiseGrammarSpelling': round(v, 3), 'pass': v <= 0.1}
        return t
    tests = tests_of(tests_acc['two_stage']); tests_s2 = tests_of(tests_acc['stage2_only'])
    bar = {c: bool(per[c]['vsMedian']['two_stage']['within1'] >= 0.85 and (per[c]['vsMedian']['two_stage']['qwk'] or 0) >= (per[c]['vsMedian']['v3b_deepseek']['qwk'] or 0)) for c in crit}
    entry = {'answers': len(T), 'questions': len(groups), 'perCriterion': per, 'lengthTests': tests, 'lengthTests_stage2only': tests_s2, 'lengthAugmentation': AUG, 'passesBar': bar}
    report['oof'][typ] = {rows[i]['id']: {c: int(preds[RECIPE][n, j]) for j, c in enumerate(crit)} for n, i in enumerate(T)}
    # final model of the chosen recipe on all ENARA answers of this type (+ length copies), for scoring other answers
    trg = groups; val_g = set(trg[:max(1, len(trg) // 8)])
    va = [i for i in T if rows[i]['group'] in val_g]; tr = [i for i in T if rows[i]['group'] not in val_g]
    Xtr, Ytr = Xen[tr], Y_of(tr)
    if AUG:
        sel_a = [n for n, i in enumerate(aug_src) if i in set(tr)]
        Ya = np.full((len(sel_a), len(crit)), np.nan, dtype=np.float32)
        for m_, n in enumerate(sel_a):
            for j, c in enumerate(crit):
                if c in ('grammar_accuracy', 'mechanics'): Ya[m_, j] = rows[aug_src[n]]['label'][c]
        Xtr, Ytr = np.vstack([Xtr, Xaug[sel_a]]), np.vstack([Ytr, Ya])
    torch.manual_seed(SEED); final = fit(copy.deepcopy(s1) if RECIPE == 'two_stage' else Head(d, len(crit)), Xtr, Ytr, 80, 3e-4 if RECIPE == 'two_stage' else 1e-3, Xen[va], Y_of(va))
    EXPORT_TYPES[typ] = {'model': final, 'criteria': crit, 'max': mx, 'passesBar': bar}
    if CMP:
        ci = [n for n, c in enumerate(CMP) if c['type'] == typ]
        if ci:
            Pc = rnd_of(predict(final, Xcmp[ci]), crit, mx)
            for m_, n in enumerate(ci): report['compareScores'][CMP[n]['id']] = {c: int(Pc[m_, j]) for j, c in enumerate(crit)}
    if typ == 'essay':  # final essay model on all ENARA essays -> the 200 human-scored essays (v3b's numbers from today's measurement)
        trg = groups; val_g = set(trg[:max(1, len(trg) // 8)])
        va = [i for i in T if rows[i]['group'] in val_g]; tr = [i for i in T if rows[i]['group'] not in val_g]
        s2f = fit(copy.deepcopy(s1), Xen[tr], Y_of(tr), 80, 3e-4, Xen[va], Y_of(va))
        for name, mdl in [('two_stage', s2f), ('stage1_only', s1)]:
            Ph = rnd_of(predict(mdl, Xh), crit, mx)
            entry.setdefault('humanRecheck', {})[name] = {c: stats(Ph[:, j], np.asarray(h_Y[c], int), 3) for j, c in enumerate(crit) if c in h_Y}
        entry['humanRecheck']['v3b_deepseek'] = {c: {'n': 200, 'exact': V3B[c]['exact'], 'within1': V3B[c]['within1'], 'qwk': V3B[c]['qwk']} for c in crit if c in h_Y and c in V3B}
    report['types'][typ] = entry
    log(typ, json.dumps({c: (per[c]['vsMedian']['two_stage']['qwk'], per[c]['vsMedian']['stage2_only']['qwk'], per[c]['vsMedian']['v3b_deepseek']['qwk']) for c in crit}), json.dumps(tests), json.dumps(tests_s2))
# ---------------- service bundle (MK_EXPORT=1; only languages in MK_EXPORT_LANGS, default "en") ----------------
# Written to results/bundle-<lang>/ and uploaded by the workflow as an Actions artifact (never committed). Only grammar_accuracy,
# mechanics (+ vocabulary_range for essays) are listed as served; task_completion and organisation stay with v3b.
EXPORT_LANGS = [x.strip() for x in os.environ.get('MK_EXPORT_LANGS', 'en').split(',') if x.strip()]
if os.environ.get('MK_EXPORT') == '1' and LANG in EXPORT_LANGS:
    sha = os.environ.get('GITHUB_SHA') or subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'nogit'
    version = f"mishkat-{LANG}-{time.strftime('%Y%m%d', time.gmtime())}-{sha[:8]}"
    man = MF.write_bundle(f'results/bundle-{LANG}', LANG, version, ENC, MAXLEN, RECIPE, mu, sd, EXPORT_TYPES, {'augmentation': AUG})
    log(f'bundle {version}: ' + json.dumps({t: v['served'] for t, v in man['types'].items()}))
    report['bundle'] = {'version': version, 'served': {t: v['served'] for t, v in man['types'].items()}}
elif os.environ.get('MK_EXPORT') == '1': log(f'bundle: {LANG} not in MK_EXPORT_LANGS={EXPORT_LANGS}; not exported')
json.dump(report, open('results/report.json', 'w'), indent=1)
log('done')
