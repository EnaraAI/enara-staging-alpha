# Mishkat service load test (owner, 24 Nov 2026): 200 answers sent at the same time, latency per answer (median, p95). Runs inside Modal
# with the service secret attached, so the token is never outside Modal. Answers: ENARA model-marked dev answers (English and Arabic,
# essays and short answers), mounted at run time; their text is never printed. Round 1 starts from cold (the service scaled to 0);
# round 2 follows at once (warm). Numbers only.
import asyncio, json, os, random, statistics, time
import modal

DATA = os.environ.get('MK_EVAL_DATA', '')
image = modal.Image.debian_slim(python_version='3.11').pip_install('httpx')
if DATA: image = image.add_local_file(os.path.join(DATA, 'pool-en.json'), '/root/pool-en.json').add_local_file(os.path.join(DATA, 'pool-ar.json'), '/root/pool-ar.json')
app = modal.App('mishkat-loadtest', image=image)

def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]

@app.function(secrets=[modal.Secret.from_name('mishkat-auth')], timeout=1200, cpu=2.0, memory=2048)
def run(url: str, n: int = 200) -> dict:
    import httpx
    items = []
    for lang in ('en', 'ar'):
        for a in json.load(open(f'/root/pool-{lang}.json')):
            if a.get('type') in ('essay', 'short_answer') and a.get('answer'): items.append({'lang': lang, 'type': a['type'], 'text': a['answer'][:5000]})
    rnd = random.Random(20261124); sample = [rnd.choice(items) for _ in range(n)]
    hdr = {'Authorization': f"Bearer {os.environ['MISHKAT_TOKEN']}"}
    async def one(c, it):
        t = time.perf_counter()
        try: r = await c.post(url, json=it, headers=hdr); code = r.status_code
        except Exception as e: code = type(e).__name__
        return {'lang': it['lang'], 'type': it['type'], 'ms': (time.perf_counter() - t) * 1000, 'code': code}
    async def round_():
        limits = httpx.Limits(max_connections=n, max_keepalive_connections=n)
        async with httpx.AsyncClient(timeout=120, limits=limits) as c:
            t = time.perf_counter(); res = await asyncio.gather(*[one(c, it) for it in sample]); wall = time.perf_counter() - t
        ok = [r['ms'] for r in res if r['code'] == 200]
        out = {'answers': n, 'ok': len(ok), 'errors': {str(k): sum(1 for r in res if r['code'] == k) for k in {r['code'] for r in res if r['code'] != 200}},
               'wallSeconds': round(wall, 1), 'medianMs': round(statistics.median(ok)) if ok else None, 'p95Ms': round(pct(ok, 95)) if ok else None,
               'maxMs': round(max(ok)) if ok else None, 'byLang': {}}
        for lang in ('en', 'ar'):
            xs = [r['ms'] for r in res if r['code'] == 200 and r['lang'] == lang]
            if xs: out['byLang'][lang] = {'n': len(xs), 'medianMs': round(statistics.median(xs)), 'p95Ms': round(pct(xs, 95))}
        return out
    cold = asyncio.run(round_()); warm = asyncio.run(round_())
    return {'cold': cold, 'warm': warm}

@app.local_entrypoint()
def main(url: str, out: str = 'loadtest.json'):
    r = run.remote(url); json.dump(r, open(out, 'w'), indent=1); print(json.dumps(r, indent=1))
