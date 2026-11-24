# Dry unit test of the fine-tune's target building and masked loss (no GPU, no downloads, no Modal). Run: python -m pytest -q <this file>
import os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ft_data as D


def _ellipse():
    return pd.DataFrame({'text_id_kaggle': ['A', 'B', 'C'], 'full_text': ['One essay.', 'Two  essay.', 'Held-out essay.'],
                         'Grammar': [2.0, 3.0, 4.5], 'Syntax': [3.0, 4.0, 5.0], 'Vocabulary': [1.0, 3.5, 4.0], 'Phraseology': [2.0, 3.5, 4.0],
                         'Cohesion': [2.5, 3.5, 3.6], 'Conventions': [1.0, 3.0, 5.0], 'Overall': [1.0, 3.0, 5.0]})


def test_ellipse_targets_match_stage1_mapping():
    T, Y, I = D.targets_ellipse(_ellipse())
    assert Y.shape == (3, 6) and Y.dtype == np.float32 and I == ['A', 'B', 'C']
    assert np.isnan(Y[:, 0]).all()                 # task_completion: not in ELLIPSE
    assert Y[:, 1].tolist() == [0, 1, 2]           # (Grammar+Syntax)/2 = 2.5, 3.5, 4.75; <=2.5 -> 0, <=3.5 -> 1, else 2
    assert Y[:, 2].tolist() == [0, 1, 2]           # (Vocabulary+Phraseology)/2 = 1.5, 3.5, 4.0
    assert Y[:, 3].tolist() == [0, 1, 2]           # Cohesion 2.5, 3.5, 3.6
    assert Y[:, 4].tolist() == [0, 1, 2]           # Conventions
    assert np.allclose(Y[:, 5], [0, 1, 2])         # Overall 1-5 -> 0-2


def test_holistic_only_corpora():
    a = pd.DataFrame({'essay_id': [7, 8], 'full_text': ['x y', 'z w'], 'score': [1, 6]})
    T, Y, I = D.targets_asap2(a)
    assert I == ['asap2-7', 'asap2-8'] and np.isnan(Y[:, :5]).all() and np.allclose(Y[:, 5], [0, 2])
    p = pd.DataFrame({'essay_id': ['e1', 'e1', 'e2', 'e3'], 'full_text': ['t1', 't1', 't2', None], 'holistic_essay_score': [4, 4, 3.5, 2]})
    T, Y, I = D.targets_persuade(p)               # one row per essay; rows without text dropped
    assert I == ['persuade-e1', 'persuade-e2'] and np.allclose(Y[:, 5], [1.2, 1.0]) and np.isnan(Y[:, :5]).all()


def test_combine_excludes_test_texts_and_duplicates():
    T1, Y1, I1 = D.targets_ellipse(_ellipse())
    a = pd.DataFrame({'essay_id': [1, 2, 3], 'full_text': ['two essay.', 'New text', '  '], 'score': [3, 4, 5]})
    parts = [('ellipse', T1, Y1, I1), ('asap2',) + D.targets_asap2(a)]
    T, Y, I, S, c = D.combine(parts, exclude_texts=['held-out   ESSAY.'])
    assert I == ['A', 'B', 'asap2-2'] and S == ['ellipse', 'ellipse', 'asap2'] and Y.shape == (3, 6)
    assert c == {'excludedTestOverlap': 1, 'duplicates': 1, 'empty': 1}


def test_split_is_seeded_and_disjoint():
    tr, va = D.split(100, 0.05)
    tr2, va2 = D.split(100, 0.05)
    assert len(va) == 5 and len(tr) == 95 and not set(tr) & set(va) and (va == va2).all() and (tr == tr2).all()


def test_masked_mse_ignores_missing_targets():
    import torch
    y = torch.tensor([[float('nan'), 1.0, float('nan'), 0.0, 2.0, 1.0], [float('nan')] * 5 + [2.0]])
    p = torch.tensor([[9.0, 2.0, -9.0, 0.0, 2.0, 0.0], [5.0, 5.0, 5.0, 5.0, 5.0, 1.0]])
    # present: row 0 -> errors 1,0,0,1 ; row 1 -> 1  => 3 / 5
    assert abs(float(D.masked_mse(p, y)) - 0.6) < 1e-6
    assert float(D.masked_mse(p, torch.full_like(y, float('nan')))) == 0.0   # nothing present -> 0, not NaN
    h = torch.tensor([[[1.0], [3.0], [100.0]]]); m = torch.tensor([[1, 1, 0]])
    assert float(D.mean_pool(h, m)) == 2.0                                  # padding not pooled


if __name__ == '__main__':
    for k, f in list(globals().items()):
        if k.startswith('test_'): f(); print('ok', k)
