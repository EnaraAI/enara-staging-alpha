# Mishkat scoring service on Modal (CPU). POST /score {lang, type, text} -> {version, scores, criteria}. See README.md.
# Bundles come from the Modal Volume "mishkat-bundles" (<lang>/manifest.json, written by the training job, uploaded by
# .github/workflows/mishkat-deploy.yml). Auth: Authorization: Bearer <MISHKAT_TOKEN> from the Modal secret "mishkat-auth".
from pathlib import Path
import modal

HERE = Path(__file__).resolve().parent
FEATURES = HERE.parents[1] / 'lms-test' / 'mishkat' / 'mishkat_features.py'  # the training script's own feature code
ENCODERS = ['microsoft/deberta-v3-base', 'CAMeL-Lab/bert-base-arabic-camelbert-msa']  # = mishkat_features.ENCODERS

image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('hunspell', 'hunspell-en-us', 'hunspell-ar')
    .pip_install('torch', index_url='https://download.pytorch.org/whl/cpu')
    .pip_install('numpy', 'transformers', 'sentencepiece', 'protobuf', 'tiktoken', 'fastapi[standard]')
    .env({'HF_HOME': '/models', 'TOKENIZERS_PARALLELISM': 'false', 'HF_HUB_DISABLE_PROGRESS_BARS': '1', 'TRANSFORMERS_VERBOSITY': 'error'})
    # bake the encoders into the image, so a cold start does not download ~1 GB
    .run_commands('python -c "import sys; from transformers import AutoTokenizer, AutoModel; '
                  '[(AutoTokenizer.from_pretrained(m), AutoModel.from_pretrained(m)) for m in sys.argv[1:]]" ' + ' '.join(ENCODERS))
    .add_local_file(FEATURES, '/root/mishkat_features.py')
    .add_local_file(HERE / 'scorer.py', '/root/scorer.py')
)
bundles = modal.Volume.from_name('mishkat-bundles', create_if_missing=True)
app = modal.App('mishkat', image=image)

@app.function(
    volumes={'/bundles': bundles},
    secrets=[modal.Secret.from_name('mishkat-auth')],  # key MISHKAT_TOKEN
    cpu=2.0, memory=4096, timeout=60,
    min_containers=0,       # nothing runs (or costs) while idle
    scaledown_window=300,   # stay warm 5 min after the last request; a cold start is ~10-20 s (image + torch + encoder load, to be measured)
)
@modal.asgi_app()
def web():
    import os, time, torch
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from starlette.concurrency import run_in_threadpool
    import scorer

    torch.set_num_threads(2)
    reg = scorer.Registry('/bundles')
    api = FastAPI(title='mishkat', docs_url=None, redoc_url=None, openapi_url=None)

    @api.post('/score')
    async def score(request: Request):
        if not scorer.authorized(request.headers.get('authorization'), os.environ.get('MISHKAT_TOKEN')):
            return JSONResponse({'error': 'unauthorized'}, status_code=401)
        try: payload = await request.json()
        except Exception: payload = None
        t0 = time.time()
        try: status, body = await run_in_threadpool(reg.handle, payload)
        except scorer.BundleError as e:
            print('bundle error:', e, flush=True); return JSONResponse({'error': 'model bundle unusable'}, status_code=503)
        print(f"score {status} {payload.get('lang') if isinstance(payload, dict) else '-'}/{payload.get('type') if isinstance(payload, dict) else '-'} {time.time() - t0:.2f}s", flush=True)  # no answer text in logs
        return JSONResponse(body, status_code=status)

    @api.get('/health')
    async def health():  # no auth; says only whether the service is up and which languages are loaded in this container
        return {'ok': True, 'loaded': sorted(reg.cache)}

    return api
