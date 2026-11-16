# SIMULATION ONLY. NO API.
# ESL5 judge validation, round 1: scores two blind judges (A, B) on the same cases.
#   python3 src/offline/esl5_valscore.py <judgeA> <judgeB> [--key KEY.json] [--out RESULT.json]
# <judgeA>/<judgeB>: a JSON file ({"cases":{...}} or {"batch":..,"cases":{...}}, or a list of such) or a directory of batch JSON files.
# Agreement is computed exactly as esl4Study.ts `agreescore`: for each case, both judges' events are applied (applyEvents, ported 1:1 from
# learnerSim.ts) to the same knowledge state before the turn with the same production fact; the case agrees iff the two resulting states are identical.
# Order check: the judged events are applied turn by turn to the 12 scripted learners (fixed transcripts) for tutors a, b, c, d; mean expected
# post-test accuracy (postTest().expected, ported 1:1) per tutor; pass iff d > c > max(a, b) and |b - a| <= 0.25 * (d - a).
import hashlib, json, os, sys, copy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
DEFAULT_KEY = os.path.join(ROOT, 'reports/exp4/agent_sim_esl5/validation/round1/VAL_KEY.json')
APPROX = 0.25  # b ~ a  iff  |b - a| <= APPROX * (d - a)


def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def rand(*parts): return int(sha('|'.join(str(p) for p in parts))[:8], 16) / 2 ** 32
def p_error(x): return 0.8 if x >= 2 else 0.4 if x == 1 else 0.05


def apply_events(k, events, last):
    """Port of learnerSim.ts applyEvents (same numbers, caps, rejections, dedupe)."""
    st = copy.deepcopy(k); applied, rejected = [], []; drop = {'W1': 0, 'W2': 0}; seen = set()
    for e in events or []:
        rule, b = e.get('rule'), e.get('belief'); key = f'{rule}:{b}'
        if key in seen: continue
        seen.add(key)
        W = b if b in ('W1', 'W2') else None; C = b if b in ('C1', 'C2') else None
        if rule in ('R1', 'R2') and W:
            if drop[W] < 2 and st['s'][W] > 0: st['s'][W] -= 1; drop[W] += 1
            applied.append(key)
        elif rule == 'R3' and C:
            if last and last.get('correct'): st['s'][C] = min(3, st['s'][C] + 1); applied.append(key)
            else: rejected.append(key + ':no_correct_production')
        elif rule == 'R4' and C:
            if last and last.get('correct') and last.get('kind') in ('blank', 'sentence'):
                st['s'][C] = min(3, st['s'][C] + 1); st['indep'][C] += 1
                if st['indep'][C] >= 2: st['s']['W1' if C == 'C1' else 'W2'] = 0
                applied.append(key)
            else: rejected.append(key + ':no_correct_production')
        elif rule == 'R7' and W:
            if last and last.get('correct') is False and last.get('fired') == W: st['s'][W] = min(3, st['s'][W] + 1); applied.append(key)
            else: rejected.append(key + ':fact_mismatch')
        elif rule in ('R5', 'R6'): applied.append(rule)
        else: rejected.append(key + ':invalid')
    return st, applied, rejected


POST_PROBES = {
    'articles': [('controlled', ['W1', 'W2']), ('controlled', ['W1']), ('controlled', ['W1']), ('controlled', ['W1', 'W2']), ('free', ['W1', 'W2']), ('free', ['W1', 'W2'])],
    'copula': [('controlled', ['W1', 'W2']), ('controlled', ['W1']), ('controlled', ['W1', 'W2']), ('controlled', ['W1', 'W2']), ('free', ['W1', 'W2']), ('free', ['W1', 'W2'])],
    'thirdS': [('controlled', ['W1']), ('controlled', ['W1', 'W2']), ('controlled', ['W1', 'W2']), ('controlled', ['W1']), ('free', ['W1', 'W2']), ('free', ['W1', 'W2'])],
}


def expected_acc(k):
    """Port of postTest(...).expected: mean over the 6 items of prod(1 - pError(W)) over the item's probes."""
    vals = []
    for _, probes in POST_PROBES[k['form']]:
        p = 1.0
        for w in probes: p *= 1 - p_error(k['s'][w])
        vals.append(p)
    return sum(vals) / len(vals)


def load_judge(p):
    out = {}
    def take(d):
        if isinstance(d, list):
            for x in d: take(x)
        elif isinstance(d, dict): out.update(d.get('cases', {}))
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            if f.endswith('.json'): take(json.load(open(os.path.join(p, f))))
    else: take(json.load(open(p)))
    return out


def eff(ev): return ','.join(sorted(f"{e.get('rule')}:{e.get('belief')}" for e in ev or [] if e.get('rule') in ('R1', 'R2', 'R3', 'R4', 'R7')))


def main(argv):
    args, opts, i = [], {}, 0
    while i < len(argv):
        if argv[i].startswith('--'): opts[argv[i]] = argv[i + 1]; i += 2
        else: args.append(argv[i]); i += 1
    key_path = opts.get('--key', DEFAULT_KEY); out_path = opts.get('--out')
    if len(args) < 2: print('usage: esl5_valscore.py <judgeA> <judgeB> [--key K] [--out O]'); sys.exit(2)
    A, B = load_judge(args[0]), load_judge(args[1]); KEY = json.load(open(key_path))['cases']
    groups = {}; diffs = []; missing = {'A': [], 'B': []}
    def bump(g, same):
        x = groups.setdefault(g, {'cases': 0, 'same': 0}); x['cases'] += 1; x['same'] += int(same)
    for cid, k in KEY.items():
        if cid not in A: missing['A'].append(cid)
        if cid not in B: missing['B'].append(cid)
        if cid not in A or cid not in B: continue
        sa, _, _ = apply_events(k['prevState'], A[cid].get('events'), k['production'])
        sb, _, _ = apply_events(k['prevState'], B[cid].get('events'), k['production'])
        same = json.dumps(sa, sort_keys=True) == json.dumps(sb, sort_keys=True)
        bump('overall', same); bump(f"session{k['session']}", same); bump(f"source:{k['source']}", same)
        bump(f"source:{k['source']}|session{k['session']}", same)
        if k['source'] == 'recheck': bump(f"recheck:esl4_round{k['esl4Round']}", same)
        if k['source'] == 'new': bump(f"new:{k['style']}", same)
        if not same: diffs.append({'id': cid, 'source': k['source'], 'session': k['session'], 'A': eff(A[cid].get('events')), 'B': eff(B[cid].get('events'))})
    for g in groups.values(): g['agreement'] = round(g['same'] / g['cases'], 4) if g['cases'] else None

    # order check on the scripted learners, per judge
    order = {}
    scripted = sorted([(k['scripted']['session'], k['scripted']['turn'], cid) for cid, k in KEY.items() if k['source'] == 'scripted'])
    for name, J in (('A', A), ('B', B)):
        final = {}; start = {}; miss = 0
        for sess, turn, cid in scripted:
            k = KEY[cid]
            if turn == 1: final[sess] = k['startState']; start[sess] = k['startState']
            ev = J.get(cid, {}).get('events')
            if cid not in J: miss += 1
            final[sess], _, _ = apply_events(final[sess], ev, k['production'])
        per = {}
        for sess, st in final.items():
            t = KEY[[c for s_, _, c in scripted if s_ == sess][0]]['scripted']['tutor']
            per.setdefault(t, []).append((expected_acc(st), expected_acc(st) - expected_acc(start[sess])))
        m = {t: {'n': len(v), 'expected': round(sum(x for x, _ in v) / len(v), 4), 'gain': round(sum(g for _, g in v) / len(v), 4)} for t, v in sorted(per.items())}
        if all(t in m for t in 'abcd'):
            e = {t: m[t]['expected'] for t in 'abcd'}; rng = e['d'] - e['a']
            ok = e['d'] > e['c'] > max(e['a'], e['b']) and rng > 0 and abs(e['b'] - e['a']) <= APPROX * rng
            order[name] = {'meanPerTutor': m, 'missingCases': miss, 'rule': f'd > c > max(a, b) and |b - a| <= {APPROX} * (d - a), on mean expected post-test accuracy', 'tolerance': round(APPROX * rng, 4), 'pass': ok}
        else: order[name] = {'meanPerTutor': m, 'missingCases': miss, 'pass': False}

    res = {'note': 'SIMULATION ONLY', 'agreementRule': 'same knowledge state after applying each judge\'s events (esl4Study.ts agreescore)', 'groups': dict(sorted(groups.items())),
           'missing': {k: len(v) for k, v in missing.items()}, 'missingIds': missing, 'orderCheck': order, 'diffs': diffs}
    if out_path: json.dump(res, open(out_path, 'w'), indent=1)
    print(json.dumps({'groups': res['groups'], 'missing': res['missing'], 'orderCheck': {k: {'pass': v['pass'], 'meanPerTutor': v['meanPerTutor']} for k, v in order.items()}}, indent=1))


if __name__ == '__main__':
    main(sys.argv[1:])
