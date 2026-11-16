# SIMULATION ONLY. NO API.
# ESL6 judge validation scorer (adapted from esl5_valscore.py; rules config/agent_sim_esl6/LEARNING_RULES.md, F1 in esl6_forget.py).
#   python3 src/offline/esl6_valscore.py agree <judgeA> <judgeB> [--key VAL_KEY.json] [--out RESULT.json]
#   python3 src/offline/esl6_valscore.py noise <run1> <run2> [--key VAL_KEY.json] [--out NOISE_RESULT.json]
#   python3 src/offline/esl6_valscore.py reference [--key VAL_KEY.json]      (order + noise chains with the reference events; sanity check)
# <judge>/<run>: a JSON file ({"cases":{...}}, {"batch":..,"cases":{...}} or a list of such) or a directory of batch JSON files.
# Agreement (as ESL5 / esl4Study.ts agreescore, extended for ESL6): for each case both judges' events AND retrieval reports are applied
#   (esl6_forget.apply_events) to the same state before the turn with the same production fact; the case agrees iff the resulting strengths,
#   independent counts and counted retrievals are identical.
# Targets (fixed in VALIDATION_PLAN.md): required set = the 240 mixed cases: agreement >= 0.85 overall and >= 0.85 in session 2.
# Order check: each judge's events applied turn by turn to the 30 scripted learners (fixed transcripts) for tutors a-d; mean expected post-test
#   accuracy (session 1 only, no F1); pass iff d > c > max(a, b) and |b - a| <= 0.25 * (d - a)  (ESL5 rule).
# Noise check: the 2-session recall transcripts judged twice (runs 1, 2: different shuffle seeds, fresh judges); events chained with F1 (2 days)
#   between sessions; reports mean expected immediate and 7-day scores per run and their differences.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import esl6_forget as F  # noqa: E402

DEFAULT_KEY = os.path.join(F.ROOT, 'reports/exp4/agent_sim_esl6/validation/VAL_KEY.json')
APPROX = 0.25
TARGET = 0.85


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


def ev_of(j): return (j or {}).get('events') or []
def retr_of(j): return [x for x in ((j or {}).get('retrieval') or []) if isinstance(x, str)]
def eff(j): return ','.join(sorted([f"{e.get('rule')}:{e.get('belief')}" for e in ev_of(j) if isinstance(e, dict) and e.get('rule') in ('R1', 'R2', 'R3', 'R4', 'R7')] + [f'ret:{c}' for c in retr_of(j)]))


def after(k, j):
    st, _, _ = F.apply_events(k['prevState'], ev_of(j), k['production'], k['session'], retr_of(j)); return F.comparable(st)


def chains(KEY, kind):
    ch = {}
    for cid, k in KEY.items():
        c = k.get('chain')
        if c and c['kind'] == kind: ch.setdefault(c['id'], []).append((c['step'], cid))
    return {s: [cid for _, cid in sorted(v)] for s, v in ch.items()}


def run_chain(KEY, ids, J):
    """Apply judged events (J: case id -> judgement, or None for reference) along one transcript; F1 runs for gapBefore days. Returns end state, misses."""
    st = KEY[ids[0]]['startState']; miss = 0
    for cid in ids:
        k = KEY[cid]
        if k['chain']['gapBefore']: st = F.f1_gap(st, k['chain']['gapBefore'])
        if J is None: ev, rt = k['referenceEvents'], k['referenceRetrieval']
        else:
            if cid not in J: miss += 1
            ev, rt = ev_of(J.get(cid)), retr_of(J.get(cid))
        st, _, _ = F.apply_events(st, ev, k['production'], k['session'], rt)
    return st, miss


def order_check(KEY, J):
    per = {}; miss = 0
    for sid, ids in chains(KEY, 'order').items():
        st, m = run_chain(KEY, ids, J); miss += m
        start = KEY[ids[0]]['startState']; t = KEY[ids[0]]['chain']['tutor']
        per.setdefault(t, []).append((F.expected_acc(st), F.expected_acc(st) - F.expected_acc(start)))
    m = {t: {'n': len(v), 'expected': round(sum(x for x, _ in v) / len(v), 4), 'gain': round(sum(g for _, g in v) / len(v), 4)} for t, v in sorted(per.items())}
    if not all(t in m for t in 'abcd'): return {'meanPerTutor': m, 'missingCases': miss, 'pass': False}
    e = {t: m[t]['expected'] for t in 'abcd'}; rng = e['d'] - e['a']
    ok = e['d'] > e['c'] > max(e['a'], e['b']) and rng > 0 and abs(e['b'] - e['a']) <= APPROX * rng
    return {'meanPerTutor': m, 'missingCases': miss, 'rule': f'd > c > max(a, b) and |b - a| <= {APPROX} * (d - a), mean expected post-test accuracy', 'tolerance': round(APPROX * rng, 4), 'pass': ok}


def noise_scores(KEY, J):
    out = {}; miss = 0
    for sid, ids in sorted(chains(KEY, 'noise').items()):
        st, m = run_chain(KEY, ids, J); miss += m; pt = F.post_tests(st)
        out[sid] = {'immediate': pt['immediate']['expected'], 'delayed': pt['delayed']['expected']}
    return out, miss


def parse(argv):
    args, opts, i = [], {}, 0
    while i < len(argv):
        if argv[i].startswith('--'): opts[argv[i]] = argv[i + 1]; i += 2
        else: args.append(argv[i]); i += 1
    return args, opts


def cmd_agree(args, opts):
    A, B = load_judge(args[0]), load_judge(args[1]); KEY = json.load(open(opts.get('--key', DEFAULT_KEY)))['cases']
    groups = {}; diffs = []; missing = {'A': [], 'B': []}
    def bump(g, same):
        x = groups.setdefault(g, {'cases': 0, 'same': 0}); x['cases'] += 1; x['same'] += int(same)
    for cid, k in KEY.items():
        if k['source'] == 'noise': continue
        if cid not in A: missing['A'].append(cid)
        if cid not in B: missing['B'].append(cid)
        if cid not in A or cid not in B: continue
        same = after(k, A[cid]) == after(k, B[cid])
        bump('all', same); bump(f"source:{k['source']}", same); bump(f"source:{k['source']}|session{k['session']}", same)
        if k['source'] == 'mixed': bump(f"mixed:{k['style']}", same); bump(f"mixed:{k['style']}|session{k['session']}", same); bump(f"template:{k['template']}", same)
        if not same: diffs.append({'id': cid, 'source': k['source'], 'session': k['session'], 'template': k.get('template'), 'A': eff(A[cid]), 'B': eff(B[cid])})
    for g in groups.values(): g['agreement'] = round(g['same'] / g['cases'], 4) if g['cases'] else None
    req = groups.get('source:mixed', {}); req2 = groups.get('source:mixed|session2', {})
    targets = {'required_overall': req.get('agreement'), 'required_session2': req2.get('agreement'),
               'pass': bool(req.get('agreement') is not None and req['agreement'] >= TARGET and req2.get('agreement') is not None and req2['agreement'] >= TARGET
                            and not missing['A'] and not missing['B'])}
    order = {'A': order_check(KEY, A), 'B': order_check(KEY, B), 'reference': order_check(KEY, None)}
    res = {'note': 'SIMULATION ONLY', 'agreementRule': 'same strengths, independent counts and counted retrievals after applying each judge\'s events and retrieval report',
           'targets': targets, 'groups': dict(sorted(groups.items())), 'missing': {k: len(v) for k, v in missing.items()}, 'missingIds': missing, 'orderCheck': order, 'diffs': diffs}
    if opts.get('--out'): json.dump(res, open(opts['--out'], 'w'), indent=1)
    print(json.dumps({'targets': targets, 'groups': res['groups'], 'missing': res['missing'], 'orderCheck': {k: {'pass': v['pass'], 'meanPerTutor': v['meanPerTutor']} for k, v in order.items()}}, indent=1))


def cmd_noise(args, opts):
    KEY = json.load(open(opts.get('--key', DEFAULT_KEY)))['cases']
    r1, m1 = noise_scores(KEY, load_judge(args[0])); r2, m2 = noise_scores(KEY, load_judge(args[1])); ref, _ = noise_scores(KEY, None)
    def mean(d, f): return sum(v[f] for v in d.values()) / len(d)
    res = {'note': 'SIMULATION ONLY', 'learners': len(r1), 'missing': {'run1': m1, 'run2': m2}}
    for f in ('immediate', 'delayed'):
        res[f] = {'run1': round(mean(r1, f), 4), 'run2': round(mean(r2, f), 4), 'reference': round(mean(ref, f), 4), 'run2_minus_run1': round(mean(r2, f) - mean(r1, f), 4),
                  'meanAbsPerLearnerDiff': round(sum(abs(r2[s][f] - r1[s][f]) for s in r1) / len(r1), 4), 'learnersDiffering': sum(1 for s in r1 if abs(r2[s][f] - r1[s][f]) > 1e-9)}
    res['perLearner'] = {s: {'run1': r1[s], 'run2': r2[s], 'reference': ref[s]} for s in r1}
    if opts.get('--out'): json.dump(res, open(opts['--out'], 'w'), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != 'perLearner'}, indent=1))


def cmd_reference(args, opts):
    KEY = json.load(open(opts.get('--key', DEFAULT_KEY)))['cases']
    ref, _ = noise_scores(KEY, None)
    print(json.dumps({'orderCheck': order_check(KEY, None), 'noiseReference': {f: round(sum(v[f] for v in ref.values()) / len(ref), 4) for f in ('immediate', 'delayed')}}, indent=1))


if __name__ == '__main__':
    a, o = parse(sys.argv[1:])
    if not a or a[0] not in ('agree', 'noise', 'reference') or (a[0] != 'reference' and len(a) < 3):
        print(__doc__ or 'usage: esl6_valscore.py agree|noise <A> <B> [--key K] [--out O] | reference'); sys.exit(2)
    {'agree': cmd_agree, 'noise': cmd_noise, 'reference': cmd_reference}[a[0]](a[1:], o)
