# Mishkat training on a Modal GPU (owner, 24 Nov 2026: "Keep training on the Modal GPU"). Runs the SAME train_mishkat.py as GitHub.
# With --export, the service bundle (numbers + head weights; for a fine-tuned encoder also the encoder) goes straight to the Modal
# Volume "mishkat-bundles" at /<lang>, where the scoring service reads it. Nothing but numbers leaves Modal (report.json, log).
# Cost guard: A10G, hard cap 50 min (about $0.92 at an assumed $1.10/h).
import json, os, pathlib, re, shutil, subprocess, threading, time
import modal

HERE = pathlib.Path(__file__).resolve().parent             # deploy/lms-test/mishkat/gpu
CODE = HERE.parent                                          # deploy/lms-test/mishkat
DATA = os.environ.get('MK_EVAL_DATA', ''); V3B = os.environ.get('MK_EVAL_V3B', '')
TIMEOUT_MIN, USD_PER_GPU_HOUR = 50, 1.10
ENC_RE = re.compile(r'^(\d{8}-[0-9a-f]{7}|base)$')

image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('git', 'curl', 'hunspell', 'hunspell-en-us', 'hunspell-ar')
    .pip_install('torch', 'transformers', 'sentencepiece', 'protobuf', 'tiktoken', 'pandas', 'numpy', 'scipy', 'gdown')
    .env({'HF_HUB_DISABLE_PROGRESS_BARS': '1', 'TRANSFORMERS_VERBOSITY': 'error'})
    .add_local_file(CODE / 'train_mishkat.py', '/root/mk/train_mishkat.py')
    .add_local_file(CODE / 'mishkat_features.py', '/root/mk/mishkat_features.py')
)
if DATA: image = image.add_local_dir(DATA, '/root/data')
if V3B: image = image.add_local_file(V3B, '/root/v3b-human.json')
ft = modal.Volume.from_name('mishkat-ft', create_if_missing=True)
bundles = modal.Volume.from_name('mishkat-bundles', create_if_missing=True)
app = modal.App('mishkat-gpu-train', image=image)

@app.function(gpu='A10G', timeout=TIMEOUT_MIN * 60, volumes={'/vol': ft, '/bundles': bundles}, retries=0, cpu=4.0, memory=24576)
def train(cfg: dict) -> dict:
    t0 = time.time(); lang, enc = cfg['lang'], cfg['encoder']
    assert lang in ('en', 'ar') and ENC_RE.match(enc) and not (lang == 'ar' and enc != 'base')
    sha = cfg.get('sha', 'nogit')
    env = {**os.environ, 'MK_LANG': lang, 'MK_STAGE1': cfg['stage1'], 'MK_PRE_MAX': str(cfg['preMax']), 'MK_RECIPE': cfg['recipe'],
           'MK_AUG': '1' if cfg.get('aug') else '0', 'MK_EGYPT': '1' if cfg.get('egypt') else '0', 'MK_DATA': '/root/data',
           'MK_BASELINE': '/root/v3b-human.json', 'MK_V3B': '/root/v3b-human.json', 'MK_COMPARE': f'/root/data/claude-compare/compare-{lang}.json',
           'MK_EXPORT': '1' if cfg.get('export') else '0', 'MK_EXPORT_LANGS': lang, 'GITHUB_SHA': sha,
           'MK_CACHE': f'/vol/cache/{lang}-{enc}', **({} if enc == 'base' else {'MK_ENCODER_DIR': f'/vol/en/{enc}', 'MK_FT_RUN': enc})}
    os.makedirs(env['MK_CACHE'], exist_ok=True)
    stop = threading.Event()
    def committer():
        while not stop.wait(120):
            try: ft.commit()
            except Exception: pass
    threading.Thread(target=committer, daemon=True).start()
    p = subprocess.Popen(['python', '-u', 'train_mishkat.py'], cwd='/root/mk', env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    for line in p.stdout: print(line, end='', flush=True); lines.append(line)
    p.wait(); stop.set()
    try: ft.commit()
    except Exception: pass
    rep = pathlib.Path('/root/mk/results/report.json'); bdir = pathlib.Path(f'/root/mk/results/bundle-{lang}')
    out = {'ok': p.returncode == 0 and rep.exists(), 'report': rep.read_text() if rep.exists() else None, 'log': ''.join(lines)[-200_000:]}
    if out['ok'] and cfg.get('export'):
        if not (bdir / 'manifest.json').is_file(): out['ok'] = False; out['log'] += '\nbundle missing'
        else:
            dst = pathlib.Path(f'/bundles/{lang}')
            if dst.exists(): shutil.rmtree(dst)
            shutil.copytree(bdir, dst); bundles.commit()
            man = json.loads((dst / 'manifest.json').read_text())
            out['bundle'] = {'version': man['version'], 'encoder': man.get('encoderLabel', man['encoder']), 'recipe': man['recipe'],
                             'served': {t: v['served'] for t, v in man['types'].items()}}
    secs = time.time() - t0; out.update({'gpuSeconds': round(secs, 1), 'estimatedUsd': round(secs / 3600 * USD_PER_GPU_HOUR, 3)})
    return out

@app.local_entrypoint()
def main(cfg: str, out_dir: str):
    r = train.remote(json.loads(cfg))
    out = pathlib.Path(out_dir); (out / 'results').mkdir(parents=True, exist_ok=True)
    (out / 'train.log').write_text(r['log'])
    if r['report']: (out / 'results' / 'report.json').write_text(r['report'])
    json.dump({k: r.get(k) for k in ('gpuSeconds', 'estimatedUsd', 'bundle')}, open(out / 'gpu-run.json', 'w'), indent=1)
    print(json.dumps({k: r.get(k) for k in ('ok', 'gpuSeconds', 'estimatedUsd', 'bundle')}))
    if not r['ok']: raise SystemExit('training failed; see train.log')
