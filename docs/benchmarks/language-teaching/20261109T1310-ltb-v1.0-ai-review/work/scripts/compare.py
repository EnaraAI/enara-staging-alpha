"""Phase 4 comparison. Run ONLY after independent_case_reviews.jsonl is saved and hashed.
Writes work/comparison.json (machine-readable) used by the report writer."""
import csv, json, sys, statistics as st
from collections import Counter, defaultdict

REV = sys.argv[1]; RUN = sys.argv[2]
DIMS = ['learner_context_fidelity', 'lesson_alignment', 'pedagogical_appropriateness', 'scaffolding_adaptation',
        'age_proficiency_fit', 'formative_check_evidence', 'clarity_accessibility']
SHORT = dict(zip(DIMS, ['Context', 'Lesson', 'Pedagogy', 'Scaffold', 'Age/CEFR', 'Formative', 'Clarity']))
MAP = {'meets_expectations': 'MEETS', 'partially_meets': 'PARTIAL', 'does_not_meet': 'DOES_NOT_MEET', 'unscored': 'UNSCORED'}

rev = {j['case_id']: j for j in (json.loads(l) for l in open(f'{REV}/independent_case_reviews.jsonl'))}
rows = {r['caseId']: r for r in csv.DictReader(open(f'{RUN}/case_scores.csv'))}
judge = {}
for l in open(f'{RUN}/judge_results.jsonl'):
    j = json.loads(l)
    if j['pass'] == 1: judge[j['caseId']] = j['result']
cases = {c['id']: c for c in (json.loads(l) for l in open(f'{RUN}/benchmark_cases.jsonl'))}

def derived(r, row):
    """Frozen ltb-scoring-v1 rule with the independent reviewer's scores in place of the judge's."""
    det = {k[4:]: v for k, v in row.items() if k.startswith('chk_')}
    if det['reply_received'] == 'fail' or det['no_direct_identifiers_in_payload'] == 'fail': return 'DOES_NOT_MEET'
    if r.get('review_status') != 'REVIEWED': return 'UNSCORED'
    vals = [r['dimension_scores'][d] for d in DIMS if r['dimension_scores'][d] != 'n/a']
    crit = any(t.get('severity') == 'critical' for t in r.get('failure_tags', [])) or bool((r.get('critical_issue') or {}).get('present'))
    if crit or any(v == 0 for v in vals): return 'DOES_NOT_MEET'
    detFail = any(v == 'fail' for v in det.values())
    if not detFail and all(v >= 2 for v in vals) and sum(vals) / len(vals) >= 3: return 'MEETS'
    return 'PARTIAL'

out = {'cases': {}}
for cid, row in rows.items():
    r = rev.get(cid, {})
    off = MAP[row['outcome']]
    ind = derived(r, row) if r else 'MISSING'
    jr = judge.get(cid) or {}
    det_fail = [k[4:] for k, v in row.items() if k.startswith('chk_') and v == 'fail']
    rs = r.get('dimension_scores') or {}
    out['cases'][cid] = {
        'cohort': row['cohort'], 'cefr': row['cefr'], 'type': row['caseType'][:3], 'turns': int(row['turns']),
        'official': off, 'independent': ind, 'independentHolistic': r.get('overall_outcome'),
        'officialScores': {d: (row['judge_' + d] if row['judge_' + d] == 'n/a' else int(row['judge_' + d])) for d in DIMS},
        'independentScores': rs, 'detFail': det_fail,
        'officialFailures': row['failures'], 'independentFailures': [f"{t.get('severity')}:{t.get('category')}" for t in r.get('failure_tags', [])],
        'independentCritical': r.get('critical_issue'),
        'officialRationale': jr.get('rationale', {}), 'officialFailureNotes': jr.get('failures', []),
        'confidence': r.get('confidence'), 'evidenceTotal': len(r.get('evidence', [])),
        'evidenceVerified': sum(1 for e in r.get('evidence', []) if e.get('quoteVerified')),
        'evidenceFoundAnyTurn': sum(1 for e in r.get('evidence', []) if e.get('quoteFoundInAnyTurn')),
        'ambiguity': 'RUBRIC_AMBIGUITY' in (r.get('reviewer_notes') or ''),
    }
C = out['cases']; ids = sorted(C)
labels = ['MEETS', 'PARTIAL', 'DOES_NOT_MEET']
def dist(key, sub=None):
    s = [C[i] for i in (sub or ids)]; return dict(Counter(x[key] for x in s))
conf = {a: {b: sum(1 for i in ids if C[i]['official'] == a and C[i]['independent'] == b) for b in labels + ['UNSCORED', 'MISSING']} for a in labels}
agree = sum(1 for i in ids if C[i]['official'] == C[i]['independent'])
# Cohen's kappa
n = len(ids); po = agree / n
pe = sum((sum(1 for i in ids if C[i]['official'] == l) / n) * (sum(1 for i in ids if C[i]['independent'] == l) / n) for l in labels)
kappa = (po - pe) / (1 - pe) if pe < 1 else None
out['overall'] = {'n': n, 'officialDist': dist('official'), 'independentDist': dist('independent'), 'holisticDist': dist('independentHolistic'),
                  'agreement': agree, 'agreementPct': round(100 * po, 1), 'kappa': round(kappa, 3) if kappa is not None else None, 'confusion': conf,
                  'holisticVsDerivedAgree': sum(1 for i in ids if C[i]['independent'] == C[i]['independentHolistic']),
                  'evidenceQuotes': sum(C[i]['evidenceTotal'] for i in ids), 'evidenceVerified': sum(C[i]['evidenceVerified'] for i in ids),
                  'evidenceFoundAnyTurn': sum(C[i]['evidenceFoundAnyTurn'] for i in ids), 'ambiguityFlags': [i for i in ids if C[i]['ambiguity']]}
dims = {}
for d in DIMS:
    pairs = [(C[i]['officialScores'][d], C[i]['independentScores'].get(d)) for i in ids]
    num = [(a, b) for a, b in pairs if isinstance(a, int) and isinstance(b, int)]
    o = [a for a, _ in num]; r_ = [b for _, b in num]
    dims[d] = {'n': len(num), 'officialMean': round(st.mean(o), 2), 'independentMean': round(st.mean(r_), 2), 'diff': round(st.mean(r_) - st.mean(o), 2),
               'exact': round(100 * sum(a == b for a, b in num) / len(num), 1), 'within1': round(100 * sum(abs(a - b) <= 1 for a, b in num) / len(num), 1),
               'indLower': sum(b < a for a, b in num), 'indHigher': sum(b > a for a, b in num),
               'bigGaps': [i for i in ids if isinstance(C[i]['officialScores'][d], int) and isinstance(C[i]['independentScores'].get(d), int) and abs(C[i]['officialScores'][d] - C[i]['independentScores'][d]) >= 2],
               'naMismatch': sum(1 for a, b in pairs if (a == 'n/a') != (b == 'n/a'))}
out['dimensions'] = dims
def breakdown(key):
    g = defaultdict(list)
    for i in ids: g[C[i][key]].append(i)
    res = {}
    for k in sorted(g):
        s = g[k]
        res[k] = {'n': len(s), 'officialMeets': sum(C[i]['official'] == 'MEETS' for i in s), 'independentMeets': sum(C[i]['independent'] == 'MEETS' for i in s),
                  'agree': sum(C[i]['official'] == C[i]['independent'] for i in s),
                  'officialAgeFit': round(st.mean([C[i]['officialScores']['age_proficiency_fit'] for i in s]), 2),
                  'independentAgeFit': round(st.mean([C[i]['independentScores'].get('age_proficiency_fit', 0) for i in s if isinstance(C[i]['independentScores'].get('age_proficiency_fit'), int)]), 2)}
    return res
out['byCohort'] = breakdown('cohort'); out['byCefr'] = breakdown('cefr'); out['byType'] = breakdown('type')
out['disagreements'] = [i for i in ids if C[i]['official'] != C[i]['independent']]
out['tagCounts'] = {'official': dict(Counter(f for i in ids for f in C[i]['officialFailures'].split(';') if f)),
                    'independent': dict(Counter(f for i in ids for f in C[i]['independentFailures']))}
json.dump(out, open(f'{REV}/work/comparison.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps(out['overall'], indent=1))
for d in DIMS: print(SHORT[d], dims[d]['officialMean'], dims[d]['independentMean'], dims[d]['diff'], dims[d]['exact'], dims[d]['within1'], len(dims[d]['bigGaps']))
print('cohort', json.dumps(out['byCohort'])); print('cefr', json.dumps(out['byCefr']))
print('disagreements', len(out['disagreements']))
