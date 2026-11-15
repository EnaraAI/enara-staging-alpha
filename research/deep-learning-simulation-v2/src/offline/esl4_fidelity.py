# SIMULATION ONLY. ESL4 P+ fidelity summary (pre-registered, descriptive): rate of P+ replies that followed the P+ prompt, from the checker batches.
import json, os, sys, glob, re
D = sys.argv[1]; FD = os.path.join(D, 'fidelity'); rows = {}; missing = []
for md in sorted(glob.glob(os.path.join(FD, 'fd*.md'))):
    ids = re.findall(r'CASE (f[0-9a-f]+)', open(md).read()); js = md[:-3] + '.json'
    got = json.load(open(js))['cases'] if os.path.exists(js) else {}
    for i in ids:
        if i in got: rows[i] = got[i]
        else: missing.append(i)
n = len(rows); f = lambda k: sum(1 for r in rows.values() if r.get(k) is True)
two = [r for r in rows.values() if r.get('after_two_misses') in ('yes', 'no')]
res = {'_label': 'SIMULATION ONLY', 'checked': n, 'missing': len(missing), 'followedRate': round(f('followed') / n, 4) if n else None, 'oneTaskRate': round(f('one_task') / n, 4) if n else None, 'tryFirstRate': round(f('try_first') / n, 4) if n else None, 'afterTwoMisses': {'applicable': len(two), 'yes': sum(1 for r in two if r['after_two_misses'] == 'yes')}}
json.dump(res, open(os.path.join(D, 'FIDELITY.json'), 'w'), indent=1); print(json.dumps(res))
