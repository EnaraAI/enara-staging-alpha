# Mishkat (owner go, 23 Nov 2026): two-stage essay/short-answer trait scorer. MODEL-MARKED dev data: development only, not for claims,
# never for a real school. Stage 1 pre-trains on LAILA / ELLIPSE (downloaded at run time, never stored); stage 2 fine-tunes on the ENARA
# model-marked labels (owner corrections win). Separate heads for essays and short answers. Length-robust features only (no raw length).
# Output: numbers only (results/report.json). CPU only, no secrets.
import json, os, re, subprocess, sys, time, random, zipfile, io, copy
import numpy as np, pandas as pd, torch
from transformers import AutoTokenizer, AutoModel

T0 = time.time()
def log(*a): print(f"[{time.strftime('%H:%M:%S')} +{(time.time() - T0) / 60:.1f} min]", *a, flush=True)
LANG = os.environ['MK_LANG']; DATA = os.environ['MK_DATA']; SEED = 20261123
ENC = {'en': 'microsoft/deberta-v3-base', 'ar': 'CAMeL-Lab/bert-base-arabic-camelbert-msa'}[LANG]
MAXLEN = 256; PRE_N = int(os.environ.get('MK_PRE_N', '2500'))
rng = np.random.default_rng(SEED); random.seed(SEED); torch.manual_seed(SEED)
torch.set_num_threads(max(1, min(4, len(os.sched_getaffinity(0)))))
os.makedirs('results', exist_ok=True)
CR = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']
SHORT_CR = ['task_completion', 'grammar_accuracy', 'mechanics']
MAX = {'essay': {c: 2 for c in CR}, 'short_answer': {'task_completion': 2, 'grammar_accuracy': 1, 'mechanics': 1}}

# ---------------- length-robust features ----------------
LINK = {'en': set('and but because so then also however therefore first firstly second finally moreover although while when after before since if or furthermore besides instead'.split()),
        'ar': set('ثم لأن لان لكن لذلك أيضا ايضا أيضًا كما بعد قبل عندما أولا اولا أولًا ثانيا أخيرا اخيرا بالإضافة إذ حيث لكي كي إذا اذا بينما رغم لذا وبالتالي'.split())}
SUB = {'en': set('because although while when if since which who that whose whom unless until'.split()), 'ar': set('الذي التي الذين لأن لان عندما إذا اذا حيث لكي كي بينما رغم أن ان'.split())}
COLLOQ = set('عشان علشان مش ده دي دول دلوقتي بتاع حاجة حاجه حاجات كتير اوي أوي ازاي إزاي فين ليه كده عايز عاوز اللي مافيش مفيش بقى احنا إحنا برضو خالص شوية زي'.split())
WRE = re.compile(r'[^\W\d_]+', re.U)
def hunspell_miss(texts):
    d = 'en_US' if LANG == 'en' else 'ar'
    inp = '\n'.join('^' + (re.sub(r'\s+', ' ', t).replace('^', ' ') or '.') for t in texts) + '\n'  # '^' = check this line as text
    out = subprocess.run(['hunspell', '-a', '-d', d], input=inp, capture_output=True, text=True).stdout.split('\n')[1:]
    res, cur = [], 0
    for line in out:
        if line == '': res.append(cur); cur = 0
        elif line[0] in '&#': cur += 1
    return (res + [0] * len(texts))[:len(texts)]
def mattr(ws, w=25):
    if len(ws) <= w: return len(set(ws)) / max(1, len(ws))
    return float(np.mean([len(set(ws[i:i + w])) / w for i in range(0, len(ws) - w + 1)]))
def feats(texts):
    miss = hunspell_miss(texts); rows = []
    for t, m in zip(texts, miss):
        ws = [w.lower() for w in WRE.findall(t)]; n = max(1, len(ws))
        sents = [s for s in re.split(r'[.!?؟\n]+', t) if s.strip()]; ns = max(1, len(sents))
        lower_start = sum(1 for s in sents if LANG == 'en' and s.strip()[:1].islower()) / ns
        rows.append([
            100 * m / n,                                           # spelling errors per 100 words
            100 * len(re.findall(r'[.,;:!?؟،؛]', t)) / n,          # punctuation per 100 words
            sum(1 for w in ws if w in LINK[LANG] or (LANG == 'ar' and w.startswith('و') and len(w) > 3 and w[1:] in LINK['ar'])) / ns,
            sum(1 for w in ws if w in SUB[LANG]) / ns,             # subordinate markers per sentence
            min(60, n / ns),                                       # mean words per sentence
            float(np.mean([len(w) for w in ws])) if ws else 0,     # mean word length
            mattr(ws),                                             # moving-window word variety
            100 * sum(1 for w in ws if w in COLLOQ) / n,           # colloquial per 100 words (Arabic)
            lower_start, 100 * sum(1 for w in WRE.findall(t) if w == 'i' and LANG == 'en') / n,  # lowercase 'i' as a word
        ])
    return np.array(rows, dtype=np.float32)
_tok = AutoTokenizer.from_pretrained(ENC); _enc = AutoModel.from_pretrained(ENC).eval()
def embed(texts, part):
    out = []; t1 = time.time(); n = len(texts)
    with torch.no_grad():
        for i in range(0, n, 16):
            b = _tok(list(texts[i:i + 16]), truncation=True, max_length=MAXLEN, padding=True, return_tensors='pt')
            h = _enc(**b).last_hidden_state; m = b['attention_mask'].unsqueeze(-1).float()
            out.append(((h * m).sum(1) / m.sum(1)).numpy())
            if (i // 16 + 1) % 25 == 0 or i + 16 >= n: log(f'encoder {part}: {min(i + 16, n)}/{n}, ~{(time.time() - t1) / min(i + 16, n) * (n - min(i + 16, n)) / 60:.1f} min left')
    return np.vstack(out).astype(np.float32)
def X_of(texts, part): return np.hstack([embed(texts, part), feats(texts)])

# ---------------- stage-1 data (public datasets, never stored) ----------------
def sh(c): subprocess.run(c, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def stage1():
    if LANG == 'en':
        sh('git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git /tmp/ellipse')
        df = pd.read_csv('/tmp/ellipse/ELLIPSE_Final_github_train.csv', encoding_errors='replace')
        b = lambda v: np.where(v <= 2.5, 0, np.where(v <= 3.5, 1, 2))
        Y = np.full((len(df), 5), np.nan, dtype=np.float32)
        Y[:, 1] = b((df.Grammar + df.Syntax) / 2); Y[:, 2] = b((df.Vocabulary + df.Phraseology) / 2); Y[:, 3] = b(df.Cohesion); Y[:, 4] = b(df.Conventions)
        texts = df.full_text.tolist()
    else:
        sh('git clone -q --depth 1 https://gitlab.com/bigirqu/laila.git /tmp/laila')
        df = pd.read_csv('/tmp/laila/essays_and_scores/all_essays_with_indivdual_rater_scores.csv', dtype={'essay_id': str})
        b = lambda v: np.where(v <= 1, 0, np.where(v <= 3, 1, 2))
        Y = np.stack([np.clip(np.rint(df.relevance), 0, 2), b(df.grammar), b(df.vocabulary), b(df.organization), b(df.mechanics)], 1).astype(np.float32)
        texts = df.essay.tolist()
    idx = rng.permutation(len(texts))[:PRE_N]
    return [texts[i] for i in idx], Y[idx]

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
class Head(torch.nn.Module):
    def __init__(self, d, k): super().__init__(); self.net = torch.nn.Sequential(torch.nn.Linear(d, 128), torch.nn.ReLU(), torch.nn.Dropout(0.2), torch.nn.Linear(128, k))
    def forward(self, x): return self.net(x)
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
pre_texts, pre_Y = stage1(); log(f'stage 1 data: {len(pre_texts)} essays')
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
mu, sd = np.vstack([Xpre, Xen]).mean(0), np.vstack([Xpre, Xen]).std(0) + 1e-6
Z = lambda X: ((X - mu) / sd).astype(np.float32)
Xpre, Xen = Z(Xpre), Z(Xen)

report = {'label': 'MODEL-MARKED: development only, not for claims, never for a real school', 'lang': LANG, 'encoder': ENC, 'maxTokens': MAXLEN,
          'stage1Essays': len(pre_texts), 'enaraLabelled': len(rows), 'ownerCorrections': n_corr, 'types': {}}
for typ in ['essay', 'short_answer']:
    crit = CR if typ == 'essay' else SHORT_CR; ix = [CR.index(c) for c in crit]; mx = MAX[typ]
    Ypre = pre_Y[:, ix].copy()
    if typ == 'short_answer':  # short answers: grammar and spelling are 0-1 (1 unless the meaning is blocked)
        for j, c in enumerate(crit):
            if mx[c] == 1: Ypre[:, j] = np.where(np.isnan(Ypre[:, j]), np.nan, (Ypre[:, j] >= 1).astype(np.float32))
    R = [r for r in rows if r['type'] == typ]; groups = sorted({r['group'] for r in R}); random.Random(SEED).shuffle(groups)
    test_g = set(groups[:max(1, len(groups) // 5)]); val_g = set(groups[len(test_g):len(test_g) + max(1, len(groups) // 8)])
    sel = lambda gs: [i for i, r in enumerate(rows) if r['type'] == typ and r['group'] in gs]
    te, va = sel(test_g), sel(val_g); tr = [i for i, r in enumerate(rows) if r['type'] == typ and r['group'] not in test_g | val_g]
    Y_of = lambda idx: np.array([[rows[i]['label'][c] for c in crit] for i in idx], dtype=np.float32)
    d = Xpre.shape[1]
    torch.manual_seed(SEED); s1 = fit(Head(d, len(crit)), Xpre, Ypre, 15, 1e-3)
    s2 = fit(copy.deepcopy(s1), Xen[tr], Y_of(tr), 80, 3e-4, Xen[va], Y_of(va))
    torch.manual_seed(SEED); s2only = fit(Head(d, len(crit)), Xen[tr], Y_of(tr), 80, 1e-3, Xen[va], Y_of(va))
    rnd = lambda P: np.stack([np.clip(np.rint(P[:, j]), 0, mx[c]) for j, c in enumerate(crit)], 1).astype(int)
    preds = {'two_stage': rnd(predict(s2, Xen[te])), 'stage1_only': rnd(predict(s1, Xen[te])), 'stage2_only': rnd(predict(s2only, Xen[te]))}
    v3b = np.array([[rows[i]['marks']['deepseek'][c] for c in crit] for i in te]); gold = Y_of(te).astype(int)
    so_mask = np.array([[rows[i]['marks']['sonnet'][c] == rows[i]['marks']['opus'][c] for c in crit] for i in te])
    so_gold = np.array([[rows[i]['marks']['sonnet'][c] for c in crit] for i in te])
    per = {}
    for j, c in enumerate(crit):
        k = mx[c] + 1; m = so_mask[:, j]
        per[c] = {'vsMedian': {**{name: stats(P[:, j], gold[:, j], k) for name, P in preds.items()}, 'v3b_deepseek': stats(v3b[:, j], gold[:, j], k)},
                  'vsSonnetOpusAgreed': {**{name: stats(P[m, j], so_gold[m, j], k) for name, P in preds.items()}, 'v3b_deepseek': stats(v3b[m, j], so_gold[m, j], k)}}
    # length tests (on held-out answers)
    tests = {}
    gi, mi = crit.index('grammar_accuracy'), crit.index('mechanics')
    P2 = predict(s2, Xen[te])
    if typ == 'short_answer':
        ok = [n for n, i in enumerate(te) if rows[i]['label']['grammar_accuracy'] == 1 and rows[i]['label']['mechanics'] == 1 and rows[i]['label']['task_completion'] == 2]
        if ok:
            hit = float(np.mean([(P2[n, gi] >= 0.5) and (P2[n, mi] >= 0.5) for n in ok]))
            tests['shortCorrectNotScoredDown'] = {'n': len(ok), 'share': round(hit, 3), 'pass': hit >= 0.9}
    else:
        strong = [n for n, i in enumerate(te) if rows[i]['label']['grammar_accuracy'] == 2 and len(re.split(r'(?<=[.!?؟])\s+', rows[i]['answer'])) >= 4]
        if strong:
            cut = [' '.join(re.split(r'(?<=[.!?؟])\s+', rows[te[n]]['answer'])[:3]) for n in strong]
            Pc = predict(s2, Z(X_of(cut, 'truncation test')))
            drop = float(np.mean(np.r_[P2[strong, gi] - Pc[:, gi], P2[strong, mi] - Pc[:, mi]]))
            tests['truncation'] = {'n': len(strong), 'meanDropGrammarSpelling': round(drop, 3), 'pass': drop <= 0.3}
        PAD = {'en': ' I like my school. My school is big. We learn many things there.', 'ar': ' أحب مدرستي. مدرستي كبيرة. نتعلم فيها أشياء كثيرة.'}[LANG]
        allx = list(range(len(te)))
        Pp = predict(s2, Z(X_of([rows[te[n]]['answer'] + PAD for n in allx], 'padding test')))
        rise = float(np.mean(np.r_[Pp[:, gi] - P2[:, gi], Pp[:, mi] - P2[:, mi]]))
        tests['padding'] = {'n': len(allx), 'meanRiseGrammarSpelling': round(rise, 3), 'pass': rise <= 0.1}
    bar = {c: bool(per[c]['vsMedian']['two_stage']['within1'] >= 0.85 and (per[c]['vsMedian']['two_stage']['qwk'] or 0) >= (per[c]['vsMedian']['v3b_deepseek']['qwk'] or 0)) for c in crit}
    report['types'][typ] = {'train': len(tr), 'val': len(va), 'heldOut': len(te), 'heldOutQuestions': len(test_g), 'perCriterion': per, 'lengthTests': tests, 'passesBar': bar}
    log(typ, json.dumps({c: (per[c]['vsMedian']['two_stage']['qwk'], per[c]['vsMedian']['v3b_deepseek']['qwk']) for c in crit}), json.dumps(tests))
json.dump(report, open('results/report.json', 'w'), indent=1)
log('done')
