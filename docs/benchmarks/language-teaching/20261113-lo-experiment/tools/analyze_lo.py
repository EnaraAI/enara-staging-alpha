#!/usr/bin/env python3
# LO experiment analysis. Usage: analyze_lo.py <campaign dirs...>  -> prints a JSON summary
import json, sys, collections
STAGES = ('post', 'transfer', 'ret1', 'ret2')
def load(d):
    rows = [json.loads(l) for l in open(f'{d}/lo_assessment.jsonl')]
    live = {json.loads(l)['caseId']: json.loads(l) for l in open(f'{d}/live/raw_results.jsonl')}
    return rows, live, json.load(open(f'{d}/live/run_status.json')), json.load(open(f'{d}/lo_assessment_status.json'))
def S(r, k): return sum(i['itemCorrect'] for i in r[k]) / 2 if k in r else None
def pct(v):
    v = [x for x in v if x is not None]
    return round(100 * sum(v) / len(v), 1) if v else None
def summarize(dirs):
    rows, live, cost = [], {}, {'tutorUsd': 0, 'simLearnerUsd': 0, 'assessUsd': 0}
    for d in dirs:
        r, l, st, ast = load(d); rows += r; live.update({f'{d}|{k}': v for k, v in l.items()})
        cost['tutorUsd'] += st['meteredUsd'] - st.get('simulatedLearnerUsd', 0); cost['simLearnerUsd'] += st.get('simulatedLearnerUsd', 0); cost['assessUsd'] += ast['meteredUsd']
    tut = [r for r in rows if r.get('tutored') and 'A_post' in r]
    out = {'learners': len(rows), 'tutored': len(tut)}
    out['scores'] = {grp: {s: pct([S(r, f'{grp}_{s}') for r in tut]) for s in STAGES} for grp in 'ABCD'}
    out['scores']['pre'] = pct([S(r, 'pre') for r in tut])
    def gains(grp):
        ab, ng, imp, same, worse, ceil = [], [], 0, 0, 0, 0
        for r in tut:
            pre, post = S(r, 'pre'), S(r, f'{grp}_post')
            if pre == 1: ceil += 1; continue
            ab.append(post - pre); ng.append((post - pre) / (1 - pre)); imp += post > pre; same += post == pre; worse += post < pre
        n = len(ab)
        return {'absGain': round(100 * sum(ab) / n, 1), 'normGain': round(sum(ng) / n, 3), 'improved%': round(100 * imp / n, 1), 'noChange%': round(100 * same / n, 1), 'worse%': round(100 * worse / n, 1), 'ceilingExcluded': ceil, 'n': n}
    out['gains'] = {grp: gains(grp) for grp in 'ABC'}
    mastered = lambda r, grp: S(r, f'{grp}_post') == 1 and S(r, f'{grp}_transfer') >= 0.5
    nonceil = [r for r in tut if S(r, 'pre') < 1]
    out['mastery'] = {grp: pct([1 if mastered(r, grp) else 0 for r in nonceil]) for grp in 'ABC'}
    cls = collections.Counter(); hints = []; turns = []
    for r in nonceil:
        rec = next((v for k, v in live.items() if k.endswith('|' + r['caseId'])), None)
        lt = [t.get('languageTurn') or {} for t in (rec or {}).get('turns', [])]
        hl = max([x.get('hintLevel') or 0 for x in lt] or [0]); hints.append(sum(1 for x in lt if (x.get('hintLevel') or 0) > 0)); turns.append(len(lt))
        reveal = any('answer_with_reasoning' in [m.get('id') if isinstance(m, dict) else m for m in (x.get('moves') or [])] for x in lt)
        if mastered(r, 'A'): cls['independent' if hl == 0 else 'minimal_scaffold' if hl <= 2 and not reveal else 'extensive_scaffold'] += 1
        elif S(r, 'A_post') == 1: cls['correct_without_transfer'] += 1
        else: cls['no_mastery'] += 1
    out['hintDependencyA'] = dict(cls); out['avgHintTurnsA'] = round(sum(hints) / max(1, len(hints)), 2); out['avgTurns'] = round(sum(turns) / max(1, len(turns)), 2)
    am = [r for r in nonceil if mastered(r, 'A')]
    out['retentionA'] = {'ret1': pct([S(r, 'A_ret1') for r in am]), 'ret2': pct([S(r, 'A_ret2') for r in am]), 'n_mastered': len(am)}
    for key in ('profile', 'lo'):
        b = collections.defaultdict(list)
        for r in tut: b[r[key]].append(r)
        out[f'by_{key}'] = {k: {m: pct([S(r, f) for r in v]) for m, f in (('pre', 'pre'), ('A_post', 'A_post'), ('C_post', 'C_post'), ('B_post', 'B_post'), ('A_transfer', 'A_transfer'), ('C_transfer', 'C_transfer'), ('A_ret2', 'A_ret2'))} for k, v in sorted(b.items())}
    out['cost'] = {k: round(v, 2) for k, v in cost.items()}; out['cost']['total'] = round(sum(cost.values()), 2)
    nA = sum(1 for r in nonceil if mastered(r, 'A')); out['cost']['perLearner'] = round(out['cost']['total'] / max(1, len(tut)), 3); out['cost']['perMasteredOutcomeA'] = round(cost['tutorUsd'] / max(1, nA), 3)
    return out
if __name__ == '__main__':
    print(json.dumps(summarize(sys.argv[1:]), indent=1))
