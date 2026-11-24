# Mishkat English encoder fine-tune: data and loss code without Modal, so it can be unit-tested on a CPU (test_ft_data.py).
# The target mapping is COPIED from train_mishkat.py stage1() (that module runs the whole pipeline on import, so it cannot be imported).
# Keep the two in step: columns = the 5 ENARA criteria (0-2, NaN when the corpus lacks one) + holistic (0-2).
import hashlib, re
import numpy as np

CR = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']  # = train_mishkat.CR
TARGETS = CR + ['holistic']
SEED = 20261123  # = train_mishkat.SEED


def _norm(v, lo, hi):  # = train_mishkat._norm
    return ((np.asarray(v, dtype=np.float32) - lo) / (hi - lo) * 2).astype(np.float32)


def _band(v):  # ELLIPSE 1-5 analytic score -> 0/1/2, = the lambda b in stage1() for 'ellipse'
    v = np.asarray(v, dtype=np.float32)
    return np.where(v <= 2.5, 0, np.where(v <= 3.5, 1, 2)).astype(np.float32)


def targets_ellipse(df):
    Y = np.full((len(df), 6), np.nan, dtype=np.float32)
    Y[:, 1] = _band((df.Grammar + df.Syntax) / 2); Y[:, 2] = _band((df.Vocabulary + df.Phraseology) / 2)
    Y[:, 3] = _band(df.Cohesion); Y[:, 4] = _band(df.Conventions); Y[:, 5] = _norm(df.Overall, 1, 5)
    return df.full_text.astype(str).tolist(), Y, df.text_id_kaggle.astype(str).tolist()


def targets_asap2(df):  # ASAP 2.0: holistic 1-6 only
    Y = np.full((len(df), 6), np.nan, dtype=np.float32); Y[:, 5] = _norm(df.score, 1, 6)
    return df.full_text.astype(str).tolist(), Y, ('asap2-' + df.essay_id.astype(str)).tolist()


def targets_persuade(df):  # PERSUADE 2.0: holistic 1-6 only; one row per essay (the corpus has one row per discourse element)
    df = df.drop_duplicates('essay_id').dropna(subset=['full_text', 'holistic_essay_score'])
    Y = np.full((len(df), 6), np.nan, dtype=np.float32); Y[:, 5] = _norm(df.holistic_essay_score, 1, 6)
    return df.full_text.astype(str).tolist(), Y, ('persuade-' + df.essay_id.astype(str)).tolist()


def text_key(t):  # whitespace- and case-insensitive text identity, for cross-corpus de-duplication and the test-split exclusion
    return hashlib.sha1(re.sub(r'\s+', ' ', str(t)).strip().lower().encode('utf-8')).hexdigest()


def combine(parts, exclude_texts=()):
    """parts: [(source, texts, Y, ids)]. Drops empty texts, texts equal to any of exclude_texts (the ELLIPSE TEST split, which holds the
    200 human re-check essays) and duplicate texts across sources (ASAP 2.0 and PERSUADE share essays; the first source wins)."""
    ex = {text_key(t) for t in exclude_texts}; seen = set(); T, Ys, I, S = [], [], [], []
    counts = {'excludedTestOverlap': 0, 'duplicates': 0, 'empty': 0}
    for src, texts, Y, ids in parts:
        for t, y, i in zip(texts, Y, ids):
            if not str(t).strip(): counts['empty'] += 1; continue
            k = text_key(t)
            if k in ex: counts['excludedTestOverlap'] += 1; continue
            if k in seen: counts['duplicates'] += 1; continue
            seen.add(k); T.append(str(t)); Ys.append(y); I.append(i); S.append(src)
    Y = np.vstack(Ys).astype(np.float32) if Ys else np.zeros((0, 6), np.float32)
    return T, Y, I, S, counts


def split(n, frac=0.05, seed=SEED):
    """Seeded train/validation split (indices)."""
    p = np.random.default_rng(seed).permutation(n); nv = max(1, int(round(n * frac))) if n > 1 else 0
    return np.sort(p[nv:]), np.sort(p[:nv])


def masked_mse(pred, y):
    """Mean squared error over the PRESENT targets only (y is NaN where a corpus lacks a criterion). torch tensors."""
    import torch
    m = ~torch.isnan(y)
    return (((pred - torch.nan_to_num(y)) ** 2) * m).sum() / m.sum().clamp(min=1)


def mean_pool(h, mask):  # = mishkat_features.Encoder.embed pooling
    m = mask.unsqueeze(-1).to(h.dtype)
    return (h * m).sum(1) / m.sum(1).clamp(min=1e-6)
# run 1: after English run 9 (24 Nov)
# run 2: Modal secrets set (24 Nov 2:10 PM); cap $5 per run
