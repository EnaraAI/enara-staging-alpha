# Evaluate the fine-tuned English encoder on a Modal GPU (owner, 24 Nov 2026 3:30 PM: "Yes, do it" — the CPU evaluation took hours).
# Runs the SAME train_mishkat.py as GitHub (stage 1 + ENARA 5-fold + length tests + the 200 human-scored ELLIPSE essays), with the
# encoder from the Modal Volume. Returns numbers only (report.json) and the log; model weights never leave the Volume.
# Cost guard: A10G, hard cap 30 min (about $0.55 at an assumed $1.10/h); typical run 5-10 min.
import json, os, pathlib, re, subprocess, time
import modal

HERE = pathlib.Path(__file__).resolve().parent            # deploy/lms-test/mishkat/ft
CODE = HERE.parent                                         # deploy/lms-test/mishkat
DATA = os.environ.get('MK_EVAL_DATA', '')                  # the model-marked dev data (mk/data/mishkat-dev), set by the workflow
V3B = os.environ.get('MK_EVAL_V3B', '')                    # today's v3b numbers on the human-scored essays
TIMEOUT_MIN, USD_PER_GPU_HOUR = 30, 1.10
RUN_ID_RE = re.compile(r'^\d{8}-[0-9a-f]{7}$')

image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('git', 'curl', 'hunspell', 'hunspell-en-us')
    .pip_install('torch', 'transformers', 'sentencepiece', 'protobuf', 'tiktoken', 'pandas', 'numpy', 'scipy', 'gdown')
    .env({'HF_HUB_DISABLE_PROGRESS_BARS': '1', 'TRANSFORMERS_VERBOSITY': 'error'})
    .add_local_file(CODE / 'train_mishkat.py', '/root/mk/train_mishkat.py')
    .add_local_file(CODE / 'mishkat_features.py', '/root/mk/mishkat_features.py')
)
if DATA: image = image.add_local_dir(DATA, '/root/data')
if V3B: image = image.add_local_file(V3B, '/root/v3b-human.json')
vol = modal.Volume.from_name('mishkat-ft')
app = modal.App('mishkat-ft-eval-en', image=image)

@app.function(gpu='A10G', timeout=TIMEOUT_MIN * 60, volumes={'/vol': vol}, retries=0, cpu=4.0, memory=16384)
def evaluate(run_id: str) -> dict:
    assert RUN_ID_RE.match(run_id), 'bad run id'
    t0 = time.time()
    env = {**os.environ, 'MK_LANG': 'en', 'MK_STAGE1': 'ellipse,asap2,persuade', 'MK_EGYPT': '0', 'MK_AUG': '0', 'MK_DATA': '/root/data',
           'MK_BASELINE': '/root/v3b-human.json', 'MK_V3B': '/root/v3b-human.json', 'MK_COMPARE': '/root/data/claude-compare/compare-en.json',
           'MK_EXPORT': '0', 'MK_ENCODER_DIR': f'/vol/en/{run_id}', 'MK_FT_RUN': run_id, 'MK_CACHE': '/tmp/cache'}
    p = subprocess.run(['python', 'train_mishkat.py'], cwd='/root/mk', env=env, capture_output=True, text=True)
    log = (p.stdout + p.stderr)[-200_000:]
    rep = pathlib.Path('/root/mk/results/report.json')
    secs = time.time() - t0
    return {'ok': p.returncode == 0 and rep.exists(), 'report': rep.read_text() if rep.exists() else None, 'log': log,
            'gpuSeconds': round(secs, 1), 'estimatedUsd': round(secs / 3600 * USD_PER_GPU_HOUR, 3)}

@app.local_entrypoint()
def main(run_id: str, out_dir: str):
    if not RUN_ID_RE.match(run_id): raise SystemExit('bad run id')
    r = evaluate.remote(run_id)
    out = pathlib.Path(out_dir); (out / 'results').mkdir(parents=True, exist_ok=True)
    (out / 'train.log').write_text(r['log'])
    if r['report']: (out / 'results' / 'report.json').write_text(r['report'])
    json.dump({'gpuSeconds': r['gpuSeconds'], 'estimatedUsd': r['estimatedUsd']}, open(out / 'eval-cost.json', 'w'))
    print(json.dumps({'ok': r['ok'], 'gpuSeconds': r['gpuSeconds'], 'estimatedUsd': r['estimatedUsd']}))
    if not r['ok']: raise SystemExit('evaluation failed; see train.log')
