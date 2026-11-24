# Mishkat scoring service on Modal (CPU). POST /score {lang, type, text} -> {version, scores, criteria}. See README.md.
# Bundles come from the Modal Volume "mishkat-bundles" (<lang>/manifest.json, written by the training job, uploaded by
# .github/workflows/mishkat-deploy.yml). Auth: Authorization: Bearer <MISHKAT_TOKEN> from the Modal secret "mishkat-auth".
from pathlib import Path
import modal

HERE = Path(__file__).resolve().parent
FEATURES = HERE.parents[1] / 'lms-test' / 'mishkat' / 'mishkat_features.py'  # the training script's own feature code
ENCODERS = ['microsoft/deberta-v3-base', 'CAMeL-Lab/bert-base-arabic-camelbert-msa']  # = mishkat_features.ENCODERS

# ---- the one-line hardware switch (owner, 24 Nov 2026): False = CPU (default), True = one A10G GPU per container. Cost: README.md.
MISHKAT_GPU = False

_torch = (modal.Image.debian_slim(python_version='3.11').apt_install('hunspell', 'hunspell-en-us', 'hunspell-ar')
          .pip_install('torch') if MISHKAT_GPU else
          modal.Image.debian_slim(python_version='3.11').apt_install('hunspell', 'hunspell-en-us', 'hunspell-ar')
          .pip_install('torch', index_url='https://download.pytorch.org/whl/cpu'))
image = (
    _torch
    .pip_install('numpy', 'transformers', 'sentencepiece', 'protobuf', 'tiktoken', 'fastapi[standard]')
    .env({'HF_HOME': '/models', 'TOKENIZERS_PARALLELISM': 'false', 'HF_HUB_DISABLE_PROGRESS_BARS': '1', 'TRANSFORMERS_VERBOSITY': 'error'})
    # bake the hub encoders into the image, so a cold start does not download ~1 GB (the fine-tuned English encoder is in its bundle)
    .run_commands('python -c "import sys; from transformers import AutoTokenizer, AutoModel; '
                  '[(AutoTokenizer.from_pretrained(m), AutoModel.from_pretrained(m)) for m in sys.argv[1:]]" ' + ' '.join(ENCODERS))
    .add_local_file(FEATURES, '/root/mishkat_features.py')
    .add_local_file(HERE / 'scorer.py', '/root/scorer.py')
)
bundles = modal.Volume.from_name('mishkat-bundles', create_if_missing=True)
app = modal.App('mishkat', image=image)

# Autoscaling (owner, 24 Nov 2026): 0 to 10 containers, scaled on the request queue: each container takes up to 8 answers at once and
# the autoscaler adds containers when more than 4 per container are waiting or running. One container is kept warm during school hours
# (Cairo, Sunday-Thursday, 8 am - 4 pm) by the two scheduled functions at the bottom; outside them nothing runs while idle.
@app.function(
    volumes={'/bundles': bundles},
    secrets=[modal.Secret.from_name('mishkat-auth')],  # key MISHKAT_TOKEN
    gpu='A10G' if MISHKAT_GPU else None,
    cpu=2.0, memory=6144, timeout=60,
    min_containers=0, max_containers=10,
    scaledown_window=300,   # stay warm 5 min after the last request
)
@modal.concurrent(max_inputs=8, target_inputs=4)
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


# ---- school-hours warm container (Cairo time). Every hour from 8:00 to 15:00, Sunday-Thursday, keep 1 container warm (hourly, so a
# redeploy during the day, which resets the autoscaler, is corrected within the hour); at 16:00 back to 0.
def _set_min(n: int):
    f = modal.Function.from_name('mishkat', 'web')
    try: f.autoscaler.update(min_containers=n)       # Modal >= 1.6
    except AttributeError: f.update_autoscaler(min_containers=n)
    print(f'mishkat web: min_containers={n}', flush=True)

@app.function(schedule=modal.Cron('0 8-15 * * 0-4', timezone='Africa/Cairo'), cpu=0.125, memory=256, timeout=60)
def school_hours_warm():
    _set_min(1)

@app.function(schedule=modal.Cron('0 16 * * 0-4', timezone='Africa/Cairo'), cpu=0.125, memory=256, timeout=60)
def school_hours_cool():
    _set_min(0)
