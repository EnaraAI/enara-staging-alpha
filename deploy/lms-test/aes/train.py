# Essay trait scoring (owner, 23 Nov 2026: train now, LAILA + ELLIPSE). CPU only, no secrets.
# Data is downloaded at run time from the official repositories and never written to the repo, the results or the logs.
# Models: (A) features = TF-IDF word + character n-grams + simple counts, ridge regression per trait;
#         (B) frozen pretrained encoder (mean-pooled embeddings) + ridge per trait.
# Held out: ELLIPSE official test split; LAILA = the 200 essays of the grader baseline + a seeded 15% of the rest.
# Output: numbers only (results/summary.json); trained models go to a private Actions artifact (not the repo).
import json, os, re, subprocess, sys, zipfile, io, time, random
import numpy as np, pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge
from scipy.sparse import hstack, csr_matrix

OUT = 'results'; os.makedirs(OUT, exist_ok=True); os.makedirs('models', exist_ok=True)
cfg = json.load(open('config.json'))
MAX_LEN = int(os.environ.get('AES_MAX_LEN', '512'))  # fast run: 256
DATASETS = [d for d in os.environ.get('AES_DATASETS', 'ellipse,laila').split(',') if d]
rng = random.Random(cfg['seed'])
summary = {'note': 'numbers only; data downloaded at run time; LAILA used for training by owner decision (23 Nov 2026), written confirmation from the authors pending', 'datasets': {}}

T0 = time.time()
def log(*a):  # progress lines: counts and timings only, never essay text
    print(f"[{time.strftime('%H:%M:%S')} +{(time.time() - T0) / 60:.1f} min]", *a, flush=True)

def sh(cmd): subprocess.run(cmd, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ---------- data ----------
def ellipse():
    if not os.path.exists('/tmp/ellipse'): sh('git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git /tmp/ellipse')
    pw = re.search(r'password for the zip file is \*\*(\S+?)\*\*', open('/tmp/ellipse/README.md').read()).group(1)  # public; never printed
    tr = pd.read_csv('/tmp/ellipse/ELLIPSE_Final_github_train.csv', encoding_errors='replace')
    z = zipfile.ZipFile('/tmp/ellipse/ELLIPSE_Final_github_test.zip'); te = pd.read_csv(io.BytesIO(z.read(z.namelist()[0], pwd=pw.encode())), encoding_errors='replace')
    traits = ['Cohesion', 'Syntax', 'Vocabulary', 'Phraseology', 'Grammar', 'Conventions', 'Overall']
    keep = ['text_id_kaggle', 'full_text'] + traits  # demographics dropped
    tr, te = tr[keep].rename(columns={'text_id_kaggle': 'id', 'full_text': 'text'}), te[keep].rename(columns={'text_id_kaggle': 'id', 'full_text': 'text'})
    return tr, te, traits, 'en'

def laila(baseline_ids):
    if not os.path.exists('/tmp/laila'): sh('git clone -q --depth 1 https://gitlab.com/bigirqu/laila.git /tmp/laila')
    df = pd.read_csv('/tmp/laila/essays_and_scores/all_essays_with_indivdual_rater_scores.csv')
    traits = ['relevance', 'organization', 'vocabulary', 'style', 'development', 'mechanics', 'grammar', 'holistic']
    df = df[['essay_id', 'prompt_id', 'essay'] + traits].rename(columns={'essay_id': 'id', 'essay': 'text'})
    df['id'] = df['id'].astype(str)
    held = df['id'].isin(baseline_ids)
    rest = df[~held].sample(frac=1, random_state=cfg['seed'])
    n_test = int(0.15 * len(rest))
    te = pd.concat([df[held], rest.iloc[:n_test]]); tr = rest.iloc[n_test:]
    return tr, te, traits, 'ar'

# ENARA 0-2 bins (same as the grader baseline)
def to_enara(ds, trait, v):
    v = np.asarray(v, dtype=float)
    if ds == 'ellipse': return np.where(v <= 2.5, 0, np.where(v <= 3.5, 1, 2))
    if trait == 'relevance': return np.clip(np.rint(v), 0, 2).astype(int)
    return np.where(v <= 1, 0, np.where(v <= 3, 1, 2))

def snap(ds, trait, p):  # predictions to the dataset's own grid
    if ds == 'ellipse': return np.clip(np.round(p * 2) / 2, 1, 5)
    hi = 2 if trait == 'relevance' else (32 if trait == 'holistic' else 5)
    return np.clip(np.rint(p), 0, hi)

def qwk(a, b, k):
    a = np.asarray(a, int); b = np.asarray(b, int); O = np.zeros((k, k))
    for x, y in zip(a, b): O[x, y] += 1
    ha, hb = O.sum(1), O.sum(0); E = np.outer(ha, hb) / len(a); W = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)]) / (k - 1) ** 2
    d = (W * E).sum(); return float(round(1 - (W * O).sum() / d, 3)) if d else None

HOLISTIC = {'Overall', 'holistic'}
def metrics(ds, trait, y, p):
    ps = snap(ds, trait, p)
    if trait in HOLISTIC:  # no ENARA criterion: native scale only
        k = 9 if ds == 'ellipse' else 33
        gy = np.rint((y - 1) * 2).astype(int) if ds == 'ellipse' else np.rint(y).astype(int); gp = np.rint((ps - 1) * 2).astype(int) if ds == 'ellipse' else ps.astype(int)
        return {'rmse': float(round(np.sqrt(np.mean((p - y) ** 2)), 3)), 'qwkNative': qwk(gy, gp, k)}
    ye, pe = to_enara(ds, trait, y), to_enara(ds, trait, ps)
    if ds == 'ellipse': gy, gp, k = np.rint((y - 1) * 2).astype(int), np.rint((ps - 1) * 2).astype(int), 9
    else: hi = 2 if trait == 'relevance' else (32 if trait == 'holistic' else 5); gy, gp, k = np.rint(y).astype(int), ps.astype(int), hi + 1
    return {'rmse': float(round(np.sqrt(np.mean((p - y) ** 2)), 3)), 'qwkNative': qwk(gy, gp, k),
            'enaraExact': float(round(np.mean(ye == pe), 3)), 'enaraWithin1': float(round(np.mean(np.abs(ye - pe) <= 1), 3)), 'enaraQwk': qwk(ye, pe, 3)}

# ---------- features ----------
def counts(texts):
    rows = []
    for t in texts:
        w = t.split(); s = [x for x in re.split(r'[.!?؟\n]+', t) if x.strip()]
        rows.append([len(t), len(w), len(s), len(set(w)) / max(1, len(w)), np.mean([len(x) for x in w]) if w else 0, t.count(',') + t.count('،'), t.count('\n\n')])
    a = np.array(rows, float); return csr_matrix((a - a.mean(0)) / (a.std(0) + 1e-9))

def model_A(tr, te):
    wv = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=50000, sublinear_tf=True)
    cv = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), min_df=3, max_features=80000, sublinear_tf=True)
    Xtr = hstack([wv.fit_transform(tr.text), cv.fit_transform(tr.text), counts(tr.text)]).tocsr()
    Xte = hstack([wv.transform(te.text), cv.transform(te.text), counts(te.text)]).tocsr()
    return Xtr, Xte

def model_B(tr, te, name):
    import torch
    from transformers import AutoTokenizer, AutoModel
    tok = AutoTokenizer.from_pretrained(name); enc = AutoModel.from_pretrained(name).eval(); torch.set_num_threads(os.cpu_count() or 4)
    def emb(texts, part):
        out = []; t1 = time.time(); n = len(texts); every = 25
        log(f'{LABEL} encoder {name}: reading {n} {part} essays')
        with torch.no_grad():
            for i in range(0, len(texts), 16):
                b = tok(list(texts[i:i + 16]), truncation=True, max_length=MAX_LEN, padding=True, return_tensors='pt')
                h = enc(**b).last_hidden_state; m = b['attention_mask'].unsqueeze(-1).float()
                out.append(((h * m).sum(1) / m.sum(1)).numpy())
                done = min(i + 16, n); b_i = i // 16 + 1
                if b_i % every == 0 or done == n:
                    el = time.time() - t1; left = el / done * (n - done)
                    log(f'{LABEL} encoder {part}: {done}/{n} essays ({100 * done // n}%), {el / 60:.1f} min so far, ~{left / 60:.1f} min left')
        return np.vstack(out)
    t0 = time.time(); Etr = emb(tr.text.tolist(), 'train'); Ete = emb(te.text.tolist(), 'test')
    return Etr, Ete, round((time.time() - t0) / (len(tr) + len(te)) * 1000, 1)

def baseline_now(need):
    # The grader baseline's held-out ids (results branch). LAILA waits up to 90 min for them, so they are never trained on.
    for i in range(46):
        subprocess.run('git fetch -q origin claude/tutor-lms-ellipse-results && git show FETCH_HEAD:summary.json > baseline_summary.json', shell=True)
        try: b = json.load(open('baseline_summary.json'))
        except Exception: b = {}
        if not need or (b.get('results', {}).get(need, {}).get('sampledIds')): return b
        print('waiting for the grader baseline ids', need, flush=True); time.sleep(120)
    raise SystemExit('baseline ids not available')
summary['maxLength'] = MAX_LEN
for ds in DATASETS:
    baseline = baseline_now('laila' if ds == 'laila' else None)
    base_ids = [str(x) for x in (baseline.get('results', {}).get('laila', {}).get('sampledIds') or [])]
    LABEL = ds
    log(f'{ds}: loading data')
    tr, te, traits, lang = ellipse() if ds == 'ellipse' else laila(base_ids)
    log(f'{ds}: {len(tr)} train / {len(te)} test essays, {len(traits)} traits')
    res = {'train': int(len(tr)), 'test': int(len(te)), 'models': {}}
    log(f'{ds}: model A (text features) building')
    feats = {'A_features_ridge': model_A(tr, te)}
    log(f'{ds}: model A features ready')
    enc_name = cfg['encoders'][lang]
    try:
        Etr, Ete, ms = model_B(tr, te, enc_name); feats[f'B_{enc_name}_ridge'] = (Etr, Ete); res['encoderMsPerEssayCpu'] = ms
    except Exception as e:
        res['encoderError'] = str(e)[:200]; log(f'{ds}: encoder failed: {type(e).__name__}')
    bid = set(base_ids) if ds == 'laila' else set(str(x) for x in (baseline.get('results', {}).get('ellipse', {}).get('sampledIds') or []))
    mask_base = te['id'].astype(str).isin(bid).values
    for mname, (Xtr, Xte) in feats.items():
        per = {}
        for t in traits:
            y_tr, y_te = tr[t].values.astype(float), te[t].values.astype(float)
            best = None
            for alpha in [0.3, 1, 3, 10, 30]:
                # simple holdout inside train for alpha
                n = Xtr.shape[0]; idx = np.arange(n); np.random.default_rng(cfg['seed']).shuffle(idx); v = idx[: n // 6]; f = idx[n // 6:]
                r = Ridge(alpha=alpha).fit(Xtr[f], y_tr[f]); e = np.sqrt(np.mean((r.predict(Xtr[v]) - y_tr[v]) ** 2))
                if best is None or e < best[0]: best = (e, alpha)
            r = Ridge(alpha=best[1]).fit(Xtr, y_tr); p = r.predict(Xte)
            per[t] = {'alpha': best[1], 'test': metrics(ds, t, y_te, p)}
            log(f'{ds} {mname} {t}: done ({traits.index(t) + 1}/{len(traits)})')
            if mask_base.any(): per[t]['baselineEssays'] = metrics(ds, t, y_te[mask_base], p[mask_base])
            t0 = time.time(); r.predict(Xte[:100]); per[t]['msPer100Predict'] = round((time.time() - t0) * 1000, 1)
        res['models'][mname] = per
        print(ds, mname, json.dumps({t: per[t]['test'] for t in traits}), flush=True)
    res['baselineEssaysInTest'] = int(mask_base.sum())
    summary['datasets'][ds] = res
json.dump(summary, open(f'{OUT}/summary.json', 'w'), indent=1)
log('done')
