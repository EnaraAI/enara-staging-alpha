# Mishkat English encoder FULL fine-tune on a Modal GPU (modal 1.x). Development only; the result is evaluated by the existing CPU
# pipeline (train_mishkat.py with MK_ENCODER_DIR), see .github/workflows/lms-test-mishkat-ft.yml.
#
#   modal run deploy/lms-test/mishkat/ft/finetune_en.py --run-id 20261124-abc1234
#
# What it does: downloads the TRAIN splits of ELLIPSE, ASAP 2.0 and PERSUADE 2.0 at run time (never stored), builds the same 6 targets as
# train_mishkat.stage1() (5 ENARA criteria 0-2, NaN when missing, + holistic 0-2; code in ft_data.py), fine-tunes
# microsoft/deberta-v3-base (all weights) + mean pooling + a linear 6-output head with masked MSE, keeps the best epoch on a seeded 5%
# validation split, and saves the ENCODER only (save_pretrained: model + tokenizer, no head) to the Modal Volume "mishkat-ft" at
# /en/<run-id>, with ft-cost.json (numbers only) next to it.
#
# Held-out guard: the 200 human re-check essays come from the ELLIPSE TEST split; only the TRAIN split is used here. In addition every
# ELLIPSE TEST text (all of them, not only the 200) is removed from all three corpora by normalised text identity, because PERSUADE /
# ASAP 2.0 / ELLIPSE draw on overlapping essay pools.
#
# COST GUARD: Modal A10G assumed at about $1.10 per GPU-hour (Modal list price, Nov 2026; container CPU/memory adds a few cents).
# The function timeout is hard-capped at 50 minutes -> at most about $0.92 GPU per run (about $1 all-in), well below the owner's $5/run
# limit. Inside the function, training stops at TRAIN_BUDGET_MIN (best epoch so far is kept) so saving always fits under the cap.
import json, os, re, time
from pathlib import Path
import modal

HERE = Path(__file__).resolve().parent
BASE = 'microsoft/deberta-v3-base'          # = mishkat_features.ENCODERS['en']
GPU = 'A10G'
USD_PER_GPU_HOUR = 1.10                     # assumed Modal A10G price (see COST GUARD above)
TIMEOUT_MIN = 50                            # HARD CAP (cost guard); do not raise without the owner
TRAIN_BUDGET_MIN = 40                       # training stops here; the rest is for validation, saving and the Volume commit
MAXLEN, EPOCHS, LR, BATCH, VAL_FRAC = 256, 2, 2e-5, 16, 0.05

image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('git', 'curl')
    .pip_install('torch', 'transformers', 'sentencepiece', 'protobuf', 'tiktoken', 'pandas', 'numpy', 'gdown')
    .env({'HF_HOME': '/models', 'TOKENIZERS_PARALLELISM': 'false', 'HF_HUB_DISABLE_PROGRESS_BARS': '1', 'TRANSFORMERS_VERBOSITY': 'error'})
    # bake the base model into the image (built on CPU), so GPU time is not spent downloading it
    .run_commands(f'python -c "from transformers import AutoTokenizer, AutoModel; AutoTokenizer.from_pretrained(\'{BASE}\'); AutoModel.from_pretrained(\'{BASE}\')"')
    .add_local_file(HERE / 'ft_data.py', '/root/ft_data.py')
)
vol = modal.Volume.from_name('mishkat-ft', create_if_missing=True)
app = modal.App('mishkat-ft-en', image=image)
RUN_ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')


def _load_corpora(log):
    """Returns [(source, texts, Y, ids)] for the TRAIN splits and the ELLIPSE TEST texts (for the exclusion)."""
    import io, subprocess, zipfile
    import pandas as pd
    import ft_data as D
    subprocess.run('git clone -q --depth 1 https://github.com/scrosseye/ELLIPSE-Corpus.git /tmp/ellipse', shell=True, check=True)
    tr = pd.read_csv('/tmp/ellipse/ELLIPSE_Final_github_train.csv', encoding_errors='replace')
    # ELLIPSE TEST split (holds the 200 human re-check essays): read only to EXCLUDE its texts. Zip password is public (README); never printed.
    pw = re.search(r'password for the zip file is \*\*(\S+?)\*\*', open('/tmp/ellipse/README.md').read()).group(1)
    z = zipfile.ZipFile('/tmp/ellipse/ELLIPSE_Final_github_test.zip')
    te = pd.read_csv(io.BytesIO(z.read(z.namelist()[0], pwd=pw.encode())), encoding_errors='replace')
    test_texts = te.full_text.astype(str).tolist()
    parts = [('ellipse',) + D.targets_ellipse(tr)]
    subprocess.run(['curl', '-sSfL', '-o', '/tmp/asap2.zip', 'https://raw.githubusercontent.com/scrosseye/ASAP_2.0/main/ASAP_2_Final_github_train.zip'], check=True)
    z = zipfile.ZipFile('/tmp/asap2.zip')
    parts.append(('asap2',) + D.targets_asap2(pd.read_csv(io.BytesIO(z.read([n for n in z.namelist() if n.endswith('.csv')][0])))))
    subprocess.run(['gdown', '-q', '13phHyDzIsb0MHyJr6q-B-qIa9P2tM135', '-O', '/tmp/persuade_train'], check=True)
    p_ = '/tmp/persuade_train'
    if zipfile.is_zipfile(p_):
        z = zipfile.ZipFile(p_); df = pd.read_csv(io.BytesIO(z.read([n for n in z.namelist() if n.endswith('.csv')][0])), low_memory=False)
    else: df = pd.read_csv(p_, low_memory=False)
    parts.append(('persuade',) + D.targets_persuade(df))
    log('corpora: ' + json.dumps({s: len(t) for s, t, _, _ in parts}) + f', ELLIPSE test texts excluded: {len(test_texts)}')
    return parts, test_texts


@app.function(gpu=GPU, timeout=TIMEOUT_MIN * 60, volumes={'/vol': vol}, retries=0, cpu=4.0, memory=16384)
def finetune(run_id: str) -> dict:
    import copy, shutil
    import numpy as np, torch
    from transformers import AutoTokenizer, AutoModel, get_linear_schedule_with_warmup
    import ft_data as D
    t0 = time.time()
    def log(*a): print(f'[+{(time.time() - t0) / 60:.1f} min]', *a, flush=True)
    assert RUN_ID_RE.match(run_id), 'bad run id'
    torch.manual_seed(D.SEED); np.random.seed(D.SEED)

    parts, test_texts = _load_corpora(log)
    T, Y, _, S, dropped = D.combine(parts, exclude_texts=test_texts)
    tri, vai = D.split(len(T), VAL_FRAC, D.SEED)
    counts = {'perSourceDownloaded': {s: len(t) for s, t, _, _ in parts}, 'perSourceUsed': {s: S.count(s) for s, *_ in parts},
              **dropped, 'train': int(len(tri)), 'validation': int(len(vai)),
              'presentTargetsTrain': {c: int((~np.isnan(Y[tri, j])).sum()) for j, c in enumerate(D.TARGETS)}}
    log('data: ' + json.dumps(counts))

    tok = AutoTokenizer.from_pretrained(BASE)
    enc = tok(T, truncation=True, max_length=MAXLEN)['input_ids']
    dev = 'cuda'
    # Run 1 (24 Nov): bf16 autocast gave NaN from the first step (DeBERTa-v3 is known to overflow in half precision). Full precision,
    # with TF32 matmuls (Ampere) for speed.
    torch.backends.cuda.matmul.allow_tf32 = True; torch.backends.cudnn.allow_tf32 = True
    bf16 = True; amp_dtype = None
    backbone = AutoModel.from_pretrained(BASE).to(dev)  # fp32 master weights; autocast for speed
    head = torch.nn.Linear(backbone.config.hidden_size, 6).to(dev)
    params = [{'params': [p for n, p in backbone.named_parameters() if not any(k in n for k in ('bias', 'LayerNorm'))], 'weight_decay': 0.01},
              {'params': [p for n, p in backbone.named_parameters() if any(k in n for k in ('bias', 'LayerNorm'))], 'weight_decay': 0.0},
              {'params': head.parameters(), 'weight_decay': 0.0}]
    opt = torch.optim.AdamW(params, lr=LR)
    steps = EPOCHS * ((len(tri) + BATCH - 1) // BATCH)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * steps), steps)
    scaler = torch.amp.GradScaler('cuda', enabled=False)
    Yt = torch.tensor(Y)

    def batch(idx):
        L = max(len(enc[i]) for i in idx); pad = tok.pad_token_id
        ids = torch.full((len(idx), L), pad, dtype=torch.long); am = torch.zeros((len(idx), L), dtype=torch.long)
        for r, i in enumerate(idx): ids[r, :len(enc[i])] = torch.tensor(enc[i]); am[r, :len(enc[i])] = 1
        return ids.to(dev), am.to(dev), Yt[idx].to(dev)

    def forward(ids, am):
        h = backbone(input_ids=ids, attention_mask=am).last_hidden_state
        return head(D.mean_pool(h.float(), am))

    def validate():
        backbone.eval(); head.eval(); se = torch.zeros(6); n = torch.zeros(6)
        order = sorted(vai, key=lambda i: len(enc[i]))  # length-sorted for speed; the loss does not depend on order
        with torch.no_grad():
            for k in range(0, len(order), 64):
                ids, am, y = batch(order[k:k + 64]); p = forward(ids, am).cpu(); y = y.cpu(); m = ~torch.isnan(y)
                se += (((p - torch.nan_to_num(y)) ** 2) * m).sum(0); n += m.sum(0)
        backbone.train(); head.train()
        return float(se.sum() / n.sum().clamp(min=1)), {c: (round(float(se[j] / n[j]), 4) if n[j] else None) for j, c in enumerate(D.TARGETS)}

    val_hist, best, stopped, step, bad_steps = [], (float('inf'), None, -1), False, 0, 0
    rng = np.random.default_rng(D.SEED)
    backbone.train(); head.train()
    for ep in range(EPOCHS):
        perm = rng.permutation(tri); tl, tn = 0.0, 0
        for k in range(0, len(perm), BATCH):
            ids, am, y = batch(perm[k:k + BATCH])
            loss = D.masked_mse(forward(ids, am), y)
            opt.zero_grad(set_to_none=True)
            if not torch.isfinite(loss):  # never step on a non-finite loss; stop early (cost guard) if it keeps happening
                bad_steps += 1; step += 1; sched.step()
                if bad_steps >= 20 and bad_steps > step // 2: raise RuntimeError(f'non-finite loss in {bad_steps} of the first {step} steps; stopped to save GPU time')
                continue
            loss.backward()
            gn = torch.nn.utils.clip_grad_norm_(list(backbone.parameters()) + list(head.parameters()), 1.0)
            if not torch.isfinite(gn): bad_steps += 1; opt.zero_grad(set_to_none=True); step += 1; sched.step(); continue
            opt.step(); sched.step(); step += 1; tl += float(loss.detach()); tn += 1
            if step % 200 == 0: log(f'epoch {ep + 1} step {step}/{steps} train loss {tl / tn:.4f}')
            if time.time() - t0 > TRAIN_BUDGET_MIN * 60: stopped = True; break
        vl, per = validate(); val_hist.append({'epoch': ep + 1, 'valLoss': round(vl, 5), 'trainLoss': round(tl / max(1, tn), 5), 'perTarget': per, 'steps': step, 'partial': stopped})
        log(f'epoch {ep + 1}: val {vl:.4f} ' + json.dumps(per))
        if vl < best[0]: best = (vl, {k_: v.detach().to('cpu', copy=True) for k_, v in backbone.state_dict().items()}, ep + 1)
        if stopped: log(f'training budget ({TRAIN_BUDGET_MIN} min) reached; keeping the best epoch so far'); break
    if best[1] is None: raise RuntimeError('no epoch gave a finite validation loss; nothing saved')
    backbone.load_state_dict(best[1])

    out = f'/vol/en/{run_id}'
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    backbone.to('cpu').float().save_pretrained(out); tok.save_pretrained(out)  # the ENCODER only (no head)
    secs = time.time() - t0
    info = {'runId': run_id, 'base': BASE, 'gpu': GPU, 'assumedUsdPerGpuHour': USD_PER_GPU_HOUR, 'timeoutCapMinutes': TIMEOUT_MIN,
            'capUsd': round(USD_PER_GPU_HOUR * TIMEOUT_MIN / 60, 2), 'gpuSeconds': round(secs, 1),
            'estimatedUsd': round(secs / 3600 * USD_PER_GPU_HOUR, 3), 'precision': 'bf16' if bf16 else 'fp16',
            'maxTokens': MAXLEN, 'epochs': EPOCHS, 'lr': LR, 'batch': BATCH, 'valFraction': VAL_FRAC, 'bestEpoch': best[2],
            'stoppedByBudget': stopped, 'valLossPerEpoch': val_hist, 'counts': counts}
    json.dump(info, open(f'{out}/ft-cost.json', 'w'), indent=1)
    vol.commit()
    log(f'saved encoder to mishkat-ft:/en/{run_id}; {secs:.0f} s, ~${info["estimatedUsd"]}')
    return info


@app.local_entrypoint()
def main(run_id: str, out: str = 'ft-cost.json'):
    if not RUN_ID_RE.match(run_id): raise SystemExit('bad run id')
    info = finetune.remote(run_id)
    json.dump(info, open(out, 'w'), indent=1)
    print(json.dumps({k: info[k] for k in ('runId', 'gpuSeconds', 'estimatedUsd', 'bestEpoch', 'stoppedByBudget')}))
