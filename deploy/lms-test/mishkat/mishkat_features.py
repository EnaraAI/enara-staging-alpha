# Mishkat shared code: the features, the head and the bundle format. Imported by train_mishkat.py (training) AND by the Modal service
# (deploy/modal/mishkat), so training and serving compute the same numbers. Any change to the feature numbers or column order must bump
# FEATURE_VERSION (the training cache key and the service's bundle check both use it).
import json, os, re, subprocess
import numpy as np, torch

FEATURE_VERSION = 'v1'
MAXLEN = 256
ENCODERS = {'en': 'microsoft/deberta-v3-base', 'ar': 'CAMeL-Lab/bert-base-arabic-camelbert-msa'}
# Column order of feats(); the encoder embedding comes first, these follow it.
FEATURE_NAMES = ['spelling_per_100w', 'punct_per_100w', 'linking_per_sent', 'subord_per_sent', 'words_per_sent', 'mean_word_len',
                 'mattr25', 'colloq_per_100w', 'lowercase_start_share', 'lowercase_i_per_100w']

# ---------------- length-robust features ----------------
LINK = {'en': set('and but because so then also however therefore first firstly second finally moreover although while when after before since if or furthermore besides instead'.split()),
        'ar': set('ثم لأن لان لكن لذلك أيضا ايضا أيضًا كما بعد قبل عندما أولا اولا أولًا ثانيا أخيرا اخيرا بالإضافة إذ حيث لكي كي إذا اذا بينما رغم لذا وبالتالي'.split())}
SUB = {'en': set('because although while when if since which who that whose whom unless until'.split()), 'ar': set('الذي التي الذين لأن لان عندما إذا اذا حيث لكي كي بينما رغم أن ان'.split())}
COLLOQ = set('عشان علشان مش ده دي دول دلوقتي بتاع حاجة حاجه حاجات كتير اوي أوي ازاي إزاي فين ليه كده عايز عاوز اللي مافيش مفيش بقى احنا إحنا برضو خالص شوية زي'.split())
WRE = re.compile(r'[^\W\d_]+', re.U)
def hunspell_miss(texts, lang):
    d = 'en_US' if lang == 'en' else 'ar'
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
def feats(texts, lang):
    miss = hunspell_miss(texts, lang); rows = []
    for t, m in zip(texts, miss):
        ws = [w.lower() for w in WRE.findall(t)]; n = max(1, len(ws))
        sents = [s for s in re.split(r'[.!?؟\n]+', t) if s.strip()]; ns = max(1, len(sents))
        lower_start = sum(1 for s in sents if lang == 'en' and s.strip()[:1].islower()) / ns
        rows.append([
            100 * m / n,                                           # spelling errors per 100 words
            100 * len(re.findall(r'[.,;:!?؟،؛]', t)) / n,          # punctuation per 100 words
            sum(1 for w in ws if w in LINK[lang] or (lang == 'ar' and w.startswith('و') and len(w) > 3 and w[1:] in LINK['ar'])) / ns,
            sum(1 for w in ws if w in SUB[lang]) / ns,             # subordinate markers per sentence
            min(60, n / ns),                                       # mean words per sentence
            float(np.mean([len(w) for w in ws])) if ws else 0,     # mean word length
            mattr(ws),                                             # moving-window word variety
            100 * sum(1 for w in ws if w in COLLOQ) / n,           # colloquial per 100 words (Arabic)
            lower_start, 100 * sum(1 for w in WRE.findall(t) if w == 'i' and lang == 'en') / n,  # lowercase 'i' as a word
        ])
    return np.array(rows, dtype=np.float32).reshape(len(rows), len(FEATURE_NAMES))

# ---------------- encoder: mean-pooled last hidden state, max MAXLEN tokens ----------------
def encoder_tag(name):
    """Short hash identifying the encoder WEIGHTS, for cache file names (so cached readings of one encoder are never reused with another).
    A hub name hashes the name; a local directory (e.g. a fine-tuned encoder) hashes its config and weight files, since the same path
    can hold different weights from run to run."""
    import hashlib
    h = hashlib.sha1()
    if os.path.isdir(name):
        for f in sorted(os.listdir(name)):
            if f == 'config.json' or f.endswith(('.safetensors', '.bin')):
                h.update(f.encode())
                with open(os.path.join(name, f), 'rb') as fh:
                    for chunk in iter(lambda: fh.read(1 << 22), b''): h.update(chunk)
    else: h.update(name.encode())
    return h.hexdigest()[:8]
class Encoder:  # name: a Hugging Face hub name OR a local directory written by save_pretrained (model + tokenizer)
    def __init__(self, name, maxlen=MAXLEN, tok=None, model=None):
        if tok is None or model is None:
            from transformers import AutoTokenizer, AutoModel
            tok, model = AutoTokenizer.from_pretrained(name), AutoModel.from_pretrained(name)
        # On a GPU (the Modal evaluation of the fine-tuned encoder) the model runs there in fp32; on CPU nothing changes.
        # Always fp32 (24 Nov): transformers 5 loads these checkpoints in float16 by default, which is slow on CPU and would make the
        # service's CPU features differ from the GPU training features.
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        model = model.float().to(self.device)
        self.name, self.maxlen, self.tok, self.model = name, maxlen, tok, model.eval()
    def embed(self, texts, part='', log=None, batch=16):
        import time
        out = []; t1 = time.time(); n = len(texts)
        with torch.no_grad():
            for i in range(0, n, batch):
                b = self.tok(list(texts[i:i + batch]), truncation=True, max_length=self.maxlen, padding=True, return_tensors='pt')
                if self.device != 'cpu': b = {k: v.to(self.device) for k, v in b.items()}
                h = self.model(**b).last_hidden_state; m = b['attention_mask'].unsqueeze(-1).float()
                out.append(((h * m).sum(1) / m.sum(1)).float().cpu().numpy())
                if log and ((i // batch + 1) % 25 == 0 or i + batch >= n): log(f'encoder {part}: {min(i + batch, n)}/{n}, ~{(time.time() - t1) / min(i + batch, n) * (n - min(i + batch, n)) / 60:.1f} min left')
        return np.vstack(out).astype(np.float32)
def X_of(texts, lang, encoder, part='', log=None):
    """Raw (not normalised) feature matrix: [encoder embedding | FEATURE_NAMES]."""
    return np.hstack([encoder.embed(texts, part, log), feats(texts, lang)])

# ---------------- the head ----------------
HIDDEN = 128
class Head(torch.nn.Module):
    def __init__(self, d, k): super().__init__(); self.net = torch.nn.Sequential(torch.nn.Linear(d, HIDDEN), torch.nn.ReLU(), torch.nn.Dropout(0.2), torch.nn.Linear(HIDDEN, k))
    def forward(self, x): return self.net(x)

# ---------------- bundle (exported by training, loaded by the service) ----------------
# Criteria the service may ever return. task_completion and organisation stay with v3b (they need the meaning of the question).
SERVABLE = {'essay': ['grammar_accuracy', 'mechanics', 'vocabulary_range'], 'short_answer': ['grammar_accuracy', 'mechanics']}
NEVER_SERVED = {'task_completion', 'organisation'}
def write_bundle(out_dir, lang, version, encoder, maxlen, recipe, mu, sd, types, extra=None):
    """types: {type: {'model': Head, 'criteria': [...], 'max': {c: int}, 'passesBar': {c: bool}}}. Writes manifest.json, norm.npz,
    <type>.pt (state_dict only)."""
    os.makedirs(out_dir, exist_ok=True)
    np.savez(os.path.join(out_dir, 'norm.npz'), mu=np.asarray(mu, dtype=np.float32), sd=np.asarray(sd, dtype=np.float32))
    man = {'name': 'mishkat', 'label': 'MODEL-MARKED: development only', 'lang': lang, 'version': version, 'encoder': encoder,
           'maxTokens': maxlen, 'recipe': recipe, 'featureVersion': FEATURE_VERSION, 'featureNames': FEATURE_NAMES,
           'dim': int(len(mu)), 'norm': 'norm.npz', 'libs': {'torch': torch.__version__}, 'types': {}}
    try:
        import transformers; man['libs']['transformers'] = transformers.__version__
    except ImportError: pass
    for typ, t in types.items():
        m = t['model']; lin1, lin2 = m.net[0], m.net[3]
        torch.save({k: v.detach().cpu() for k, v in m.state_dict().items()}, os.path.join(out_dir, f'{typ}.pt'))
        man['types'][typ] = {'head': f'{typ}.pt', 'headShape': {'in': lin1.in_features, 'hidden': lin1.out_features, 'out': lin2.out_features},
                             'criteria': list(t['criteria']), 'max': {c: int(t['max'][c]) for c in t['criteria']},
                             'served': [c for c in SERVABLE[typ] if c in t['criteria'] and c not in NEVER_SERVED],
                             'passesBar': {c: bool(v) for c, v in (t.get('passesBar') or {}).items()}}
    man.update(extra or {})
    json.dump(man, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    return man
