# Local test for the Mishkat service core (no Modal, no model download): builds a tiny fake bundle with the SAME writer the training
# job uses (mishkat_features.write_bundle) and scores through scorer.Registry end to end.
# Run: python -m pytest deploy/modal/mishkat/test_scorer.py -q   (needs numpy, torch, pytest; hunspell optional)
import hashlib, json, shutil, sys
from pathlib import Path
import numpy as np, pytest, torch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scorer
F = scorer.F
EMB = 8  # fake encoder width

class FakeEncoder:  # deterministic stand-in for DeBERTa/CAMeLBERT: same interface as mishkat_features.Encoder
    def embed(self, texts, part='', log=None):
        return np.stack([np.frombuffer(hashlib.sha256(t.encode()).digest()[:EMB], dtype=np.uint8) / 255.0 for t in texts]).astype(np.float32)

@pytest.fixture(autouse=True)
def no_hunspell(monkeypatch):
    if not shutil.which('hunspell'): monkeypatch.setattr(F, 'hunspell_miss', lambda texts, lang: [0] * len(texts))

def make_bundle(root, lang='en', version='mishkat-en-20261123-abcdef12'):
    torch.manual_seed(0); d = EMB + len(F.FEATURE_NAMES)
    mu = np.linspace(-1, 1, d).astype(np.float32); sd = np.linspace(0.5, 2, d).astype(np.float32)
    CR = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']; SH = ['task_completion', 'grammar_accuracy', 'mechanics']
    types = {'essay': {'model': F.Head(d, 5), 'criteria': CR, 'max': {c: 2 for c in CR}, 'passesBar': {c: True for c in CR}},
             'short_answer': {'model': F.Head(d, 3), 'criteria': SH, 'max': {'task_completion': 2, 'grammar_accuracy': 1, 'mechanics': 1}}}
    man = F.write_bundle(str(root / lang), lang, version, 'fake-encoder', 256, 'two_stage', mu, sd, types)
    return man, mu, sd, types

@pytest.fixture
def reg(tmp_path):
    man, mu, sd, types = make_bundle(tmp_path)
    return scorer.Registry(tmp_path, encoder_factory=lambda m: FakeEncoder()), man, mu, sd, types

TEXT = 'My school is big. We learn many things there because the teachers are kind, although some days are long.'

def test_manifest_lists_only_servable_criteria(reg):
    _, man, *_ = reg
    assert man['types']['essay']['served'] == ['grammar_accuracy', 'mechanics', 'vocabulary_range']
    assert man['types']['short_answer']['served'] == ['grammar_accuracy', 'mechanics']
    assert man['featureVersion'] == F.FEATURE_VERSION and man['dim'] == EMB + 10 and man['types']['essay']['headShape'] == {'in': 18, 'hidden': 128, 'out': 5}

def test_features_columns_and_normalisation(reg):
    r, man, mu, sd, _ = reg
    raw = F.feats([TEXT], 'en'); assert raw.shape == (1, len(F.FEATURE_NAMES)) == (1, 10)
    b = r.get('en'); z = b.features([TEXT])
    X = np.hstack([FakeEncoder().embed([TEXT]), raw])
    assert z.shape == (1, man['dim']) and np.allclose(z, (X - mu) / sd)

@pytest.mark.parametrize('typ', ['essay', 'short_answer'])
def test_score_end_to_end(reg, typ):
    r, man, mu, sd, types = reg
    st, body = r.handle({'lang': 'en', 'type': typ, 'text': TEXT})
    assert st == 200 and set(body) == {'version', 'scores', 'criteria'} and body['version'] == man['version']
    assert body['criteria'] == man['types'][typ]['served'] and list(body['scores']) == body['criteria']
    assert not {'task_completion', 'organisation'} & set(body['scores'])
    m = types[typ]['model'].eval(); X = np.hstack([FakeEncoder().embed([TEXT]), F.feats([TEXT], 'en')])
    with torch.no_grad(): want = m(torch.tensor(((X - mu) / sd).astype(np.float32))).numpy()[0]
    for c, v in body['scores'].items(): assert abs(v - float(want[types[typ]['criteria'].index(c)])) < 1e-3
    json.dumps(body)

def test_manifest_cannot_widen_served(tmp_path):
    make_bundle(tmp_path); p = tmp_path / 'en' / 'manifest.json'; m = json.loads(p.read_text())
    m['types']['essay']['served'] += ['task_completion', 'organisation']; p.write_text(json.dumps(m))
    st, body = scorer.Registry(tmp_path, lambda m: FakeEncoder()).handle({'lang': 'en', 'type': 'essay', 'text': TEXT})
    assert st == 200 and body['criteria'] == ['grammar_accuracy', 'mechanics', 'vocabulary_range']

@pytest.mark.parametrize('payload', [None, [], 'x', {}, {'lang': 'en', 'type': 'essay'}, {'lang': 'en', 'type': 'poem', 'text': 'Hi.'},
                                     {'lang': '../en', 'type': 'essay', 'text': 'Hi.'}, {'lang': 'en', 'type': 'essay', 'text': '   '},
                                     {'lang': 'en', 'type': 'essay', 'text': 5}, {'lang': 'en', 'type': 'essay', 'text': 'a' * 5001}])
def test_400(reg, payload):
    assert reg[0].handle(payload)[0] == 400

def test_404(tmp_path):
    make_bundle(tmp_path); r = scorer.Registry(tmp_path, lambda m: FakeEncoder())
    assert r.handle({'lang': 'ar', 'type': 'essay', 'text': 'نص.'})[0] == 404           # no Arabic bundle
    shutil.rmtree(tmp_path / 'en'); make_bundle(tmp_path); m = json.loads((tmp_path / 'en' / 'manifest.json').read_text())
    del m['types']['short_answer']; (tmp_path / 'en' / 'manifest.json').write_text(json.dumps(m))
    assert scorer.Registry(tmp_path, lambda m: FakeEncoder()).handle({'lang': 'en', 'type': 'short_answer', 'text': TEXT})[0] == 404
    assert r.handle({'lang': 'en', 'type': 'essay', 'text': 'a' * 5000})[0] == 200        # exactly at the cap is fine

def test_feature_version_mismatch_is_refused(tmp_path):
    make_bundle(tmp_path); p = tmp_path / 'en' / 'manifest.json'; m = json.loads(p.read_text()); m['featureVersion'] = 'v0'; p.write_text(json.dumps(m))
    with pytest.raises(scorer.BundleError): scorer.Registry(tmp_path, lambda m: FakeEncoder()).get('en')

def test_auth():
    assert scorer.authorized('Bearer s3cret', 's3cret')
    for h in [None, '', 's3cret', 'Bearer wrong', 'Basic s3cret', 'Bearer ']: assert not scorer.authorized(h, 's3cret')
    assert not scorer.authorized('Bearer ', '') and not scorer.authorized('Bearer x', None)
