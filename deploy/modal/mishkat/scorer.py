# Mishkat scoring core (no Modal here, so it is testable locally). Loads a bundle written by train_mishkat.py (MK_EXPORT=1) and scores one
# answer with the SAME feature code as training (mishkat_features.py).
import hmac, json, os, sys, threading
from pathlib import Path
import numpy as np, torch
try:
    import mishkat_features as F
except ImportError:  # local run / tests: the shared module lives next to the training script
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'lms-test' / 'mishkat'))
    import mishkat_features as F

MAX_CHARS = 5000
TYPES = ('essay', 'short_answer')

class BundleError(Exception): pass

class LangBundle:
    def __init__(self, path, encoder=None):
        p = Path(path); man = json.loads((p / 'manifest.json').read_text())
        if man.get('featureVersion') != F.FEATURE_VERSION:
            raise BundleError(f"bundle feature version {man.get('featureVersion')} != service {F.FEATURE_VERSION}")
        nz = np.load(p / man['norm']); self.mu, self.sd = nz['mu'].astype(np.float32), nz['sd'].astype(np.float32)
        if len(self.mu) != man['dim'] or len(self.sd) != man['dim']: raise BundleError('mu/sd size does not match the manifest')
        self.man, self.lang, self.version = man, man['lang'], man['version']
        self.heads, self.types = {}, {}
        for typ, t in man['types'].items():
            sh = t['headShape']
            if sh['in'] != man['dim'] or sh['hidden'] != F.HIDDEN or sh['out'] != len(t['criteria']): raise BundleError(f'{typ}: head shape mismatch')
            head = F.Head(sh['in'], sh['out']); head.load_state_dict(torch.load(p / t['head'], map_location='cpu', weights_only=True)); head.eval()
            served = [c for c in t['served'] if c in t['criteria'] and c in F.SERVABLE.get(typ, []) and c not in F.NEVER_SERVED]
            self.heads[typ], self.types[typ] = head, {'criteria': t['criteria'], 'served': served}
        self.encoder = encoder or F.Encoder(man['encoder'], man['maxTokens'])

    def features(self, texts):
        """Normalised feature matrix, exactly as training's Z(X_of(...))."""
        X = F.X_of(texts, self.lang, self.encoder)
        if X.shape[1] != len(self.mu): raise BundleError(f'feature width {X.shape[1]} != bundle {len(self.mu)}')
        return ((X - self.mu) / self.sd).astype(np.float32)

    def score(self, typ, text):
        z = self.features([text])
        with torch.no_grad(): out = self.heads[typ](torch.tensor(z)).numpy()[0]
        t = self.types[typ]
        return {'version': self.version, 'scores': {c: round(float(out[t['criteria'].index(c)]), 4) for c in t['served']}, 'criteria': list(t['served'])}

class Registry:
    """Bundles under <root>/<lang>/manifest.json, loaded lazily (first request per language) and kept for the container's life."""
    def __init__(self, root, encoder_factory=None):
        self.root, self.encoder_factory, self.cache, self.lock = Path(root), encoder_factory, {}, threading.Lock()
    def get(self, lang):
        if lang in self.cache: return self.cache[lang]
        with self.lock:
            if lang not in self.cache:
                d = self.root / lang
                if not (d / 'manifest.json').is_file(): return None  # not cached: a bundle uploaded later is picked up by a new container
                enc = self.encoder_factory(json.loads((d / 'manifest.json').read_text())) if self.encoder_factory else None
                self.cache[lang] = LangBundle(d, enc)
            return self.cache[lang]
    def handle(self, payload):
        """-> (http status, body). 400 bad input, 404 no bundle for lang/type, 200 scores."""
        if not isinstance(payload, dict): return 400, {'error': 'body must be a JSON object {lang, type, text}'}
        lang, typ, text = payload.get('lang'), payload.get('type'), payload.get('text')
        if not isinstance(lang, str) or not lang.isalpha() or not 2 <= len(lang) <= 8: return 400, {'error': 'lang must be a language code such as "en" or "ar"'}
        if typ not in TYPES: return 400, {'error': f'type must be one of {list(TYPES)}'}
        if not isinstance(text, str) or not text.strip(): return 400, {'error': 'text must be a non-empty string'}
        if len(text) > MAX_CHARS: return 400, {'error': f'text longer than {MAX_CHARS} characters'}
        b = self.get(lang.lower())
        if b is None or typ not in b.heads: return 404, {'error': f'no Mishkat model for {lang}/{typ}'}
        return 200, b.score(typ, text)

def authorized(header, token):
    """Authorization: Bearer <token>, compared in constant time. No token configured = nobody is authorised."""
    if not token or not isinstance(header, str) or not header.startswith('Bearer '): return False
    return hmac.compare_digest(header[len('Bearer '):].strip().encode(), token.encode())
