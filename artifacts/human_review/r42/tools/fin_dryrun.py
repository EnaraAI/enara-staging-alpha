#!/usr/bin/env python3
import csv, json, os, random, subprocess, shutil
from collections import Counter
from openpyxl import load_workbook
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
D = f'{REPO}/artifacts/human_review/r42/dry_run_evidence'
os.makedirs(D, exist_ok=True)
st = json.load(open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/fin_state.json'))
COLS = st['cols']
ids = sorted(st['orders']['A'])
CRIT = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']
CATS = {'C9': ['SUFFICIENT', 'LIMITED', 'INSUFFICIENT'], 'OVERALL': ['MEETS EXPECTATIONS', 'PARTIALLY MEETS', 'DOES NOT MEET', 'CANNOT JUDGE'], 'CRITICAL': ['YES', 'NO'], 'MAJOR': ['YES', 'NO']}
FIELDS = CRIT + ['OVERALL', 'CRITICAL', 'MAJOR']
COLOF = {**{c: f'{c}_score' for c in CRIT}, 'OVERALL': 'overall_category', 'CRITICAL': 'critical_defect_yes_no', 'MAJOR': 'major_defect_yes_no'}

rnd = random.Random(2026)
NUMPOOL = ['4', '4', '3', '3', '3', '2', '1', '0', ' 3', '4 ', 'NA', 'na', 'IE', '', '5', '2.5']
def val(f, base):
    if f in ('C9',): return rnd.choice(['SUFFICIENT', 'limited', ' Limited ', 'INSUFFICIENT', 'Sufficient', '', 'maybe'])
    if f == 'OVERALL': return rnd.choice(['meets expectations', 'Meets Expectations', 'partially meets', 'does not meet', 'cannot judge', 'Meets', ''])
    if f in ('CRITICAL', 'MAJOR'): return rnd.choice(['no', 'No', 'yes', ''])
    return base if rnd.random() < 0.55 else rnd.choice(NUMPOOL)
sheets = {}
for who in ('A', 'B'):
    rows = []
    for k, a in enumerate(rnd.sample(ids, len(ids))):
        r = {c: '' for c in COLS}
        r.update(reviewer_id=f'DUMMY-{who}', position=k + 1, anon_case_id=a)
        for f in FIELDS:
            base = str((hash(a + f) % 3) + 2)  # shared 'true' score 2-4 so A and B partly agree
            r[COLOF[f]] = val(f, base)
        if who == 'A' and a == ids[0]:  # one fully blank case in A
            for f in FIELDS: r[COLOF[f]] = ''
        rows.append(r)
    sheets[who] = rows
    with open(f'{D}/dummy_reviewer_{who}.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLS); w.writeheader(); w.writerows(rows)
# forced edge case: A blank and B '0' on one cell (must be "missing A", never counted as 0/0)
special = ids[1]
for r in sheets['A']:
    if r['anon_case_id'] == special: r['C1_score'] = ''
for r in sheets['B']:
    if r['anon_case_id'] == special: r['C1_score'] = '0'
for who in ('A', 'B'):
    with open(f'{D}/dummy_reviewer_{who}.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLS); w.writeheader(); w.writerows(sheets[who])
special2 = ids[2]
for r in sheets['A']:
    if r['anon_case_id'] == special2: r['C2_score'] = 'NA'; r['C9_score'] = ' limited'
for r in sheets['B']:
    if r['anon_case_id'] == special2: r['C2_score'] = ' ie'; r['C9_score'] = 'LIMITED'
for who in ('A', 'B'):
    with open(f'{D}/dummy_reviewer_{who}.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLS); w.writeheader(); w.writerows(sheets[who])
calids = ids[::4]
open(f'{D}/dummy_calibration_ids.txt', 'w').write('\n'.join(calids))

# ---------- reference implementation
def norm(v):
    v = (v or '').strip()
    if v == '': return ''
    try:
        return float(v) if '.' in v else int(v)
    except ValueError:
        return v.upper()
def valid(f, v):
    if v == '': return None
    if f in CATS: return v in CATS[f]
    if isinstance(v, (int, float)): return 0 <= v <= 4 and v == int(v)
    return v in ('NA', 'IE')
def cls(f, a, b):
    va, vb = valid(f, a), valid(f, b)
    if a == '' and b == '': return 'missing both'
    if a == '': return 'missing A'
    if b == '': return 'missing B'
    if not va: return 'invalid A'
    if not vb: return 'invalid B'
    if a == b: return 'exact'
    bn = isinstance(a, (int, float)) and isinstance(b, (int, float))
    if bn: return 'adjacent (1 point)' if abs(a - b) == 1 else 'substantive (2+ points)'
    if isinstance(a, (int, float)) or isinstance(b, (int, float)): return 'scored vs NA/IE'
    if a in ('NA', 'IE'): return 'NA vs IE'
    return 'category disagreement'
A = {r['anon_case_id']: r for r in sheets['A']}; B = {r['anon_case_id']: r for r in sheets['B']}
def stats(f, subset):
    cats = list(range(5)) if f not in CATS else CATS[f]
    weighted = f not in CATS
    sel = [a for a in ids if subset == 'all' or a in calids]
    pairs, classes = [], Counter()
    for a in sel:
        x, y = norm(A[a][COLOF[f]]), norm(B[a][COLOF[f]])
        c = cls(f, x, y); classes[c] += 1
        if valid(f, x) and valid(f, y) and x in cats and y in cats: pairs.append((x, y))
    n = len(pairs); k = len(cats)
    res = {'answered': len(sel) - classes['missing A'] - classes['missing B'] - classes['missing both'], 'n': n, 'classes': classes}
    if n:
        res['exact'] = sum(x == y for x, y in pairs) / n
        if weighted: res['within1'] = sum(abs(x - y) <= 1 for x, y in pairs) / n
    idx = {c: i for i, c in enumerate(cats)}
    O = [[0] * k for _ in range(k)]
    for x, y in pairs: O[idx[x]][idx[y]] += 1
    W = [[((i - j) ** 2 / (k - 1) ** 2) if weighted else (0 if i == j else 1) for j in range(k)] for i in range(k)]
    res['kappa'] = res['ac'] = None
    if n >= 2:
        r = [sum(O[i]) for i in range(k)]; c = [sum(O[i][j] for i in range(k)) for j in range(k)]
        den = sum(W[i][j] * r[i] * c[j] / n for i in range(k) for j in range(k))
        if den: res['kappa'] = 1 - sum(W[i][j] * O[i][j] for i in range(k) for j in range(k)) / den
        WA = [[1 - W[i][j] for j in range(k)] for i in range(k)]
        pi = [(r[q] + c[q]) / (2 * n) for q in range(k)]
        pe = sum(map(sum, WA)) / (k * (k - 1)) * sum(p * (1 - p) for p in pi)
        pa = sum(WA[i][j] * O[i][j] for i in range(k) for j in range(k)) / n
        if 1 - pe: res['ac'] = (pa - pe) / (1 - pe)
    return res

def check(mode):
    wbp = f'{D}/dryrun_{mode}.xlsx'
    subprocess.run(['python3', '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/fin_xlsx.py', wbp, '--dummy', f'{D}/dummy_reviewer_A.csv', f'{D}/dummy_reviewer_B.csv', f'{D}/dummy_calibration_ids.txt'] + (['--as-text'] if mode == 'text' else []), check=True, capture_output=True)
    rc = f'{D}/recalc_{mode}'; shutil.rmtree(rc, ignore_errors=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', rc, wbp], check=True, capture_output=True, timeout=300)
    wb = load_workbook(f'{rc}/dryrun_{mode}.xlsx', data_only=True)
    errs = [(ws.title, cell.coordinate, cell.value) for ws in wb for row in ws.iter_rows() for cell in row if isinstance(cell.value, str) and cell.value.startswith('#') and cell.value[1:3].isupper()]
    # Reviewer sheets: numeric import
    ra = list(wb['Reviewer_A'].iter_rows(min_row=2, values_only=True))
    numeric_ok = all((isinstance(v, (int, float)) == isinstance(norm(A[r[0]][COLOF[f]]), (int, float))) for r in ra for f, v in zip(FIELDS, r[1:14]))
    cmp_rows = list(wb['Comparison'].iter_rows(min_row=2, values_only=True))
    cls_bad = [(r[0], r[1], r[9], cls(r[1], norm(A[r[0]][COLOF[r[1]]]), norm(B[r[0]][COLOF[r[1]]]))) for r in cmp_rows if r[9] != cls(r[1], norm(A[r[0]][COLOF[r[1]]]), norm(B[r[0]][COLOF[r[1]]]))]
    sp = [r for r in cmp_rows if r[0] == special and r[1] == 'C1'][0]
    sp2 = {r[1]: r[9] for r in cmp_rows if r[0] == special2 and r[1] in ('C2', 'C9')}
    ag = list(wb['Agreement'].iter_rows(min_row=2, values_only=True))
    bad = []
    close = lambda x, y: (x in (None, '') and y is None) or (x not in (None, '') and y is not None and abs(x - y) < 1e-9)
    for r in ag:
        f, subset = r[0], r[2]
        e = stats(f, subset)
        checks = {'answered': r[3] == e['answered'], 'n': r[4] == e['n'], 'exact': close(r[5], e.get('exact')), 'kappa': close(r[7], e['kappa']), 'ac': close(r[9], e['ac']),
                  'scored_vs_na': r[11] == e['classes']['scored vs NA/IE'], 'na_vs_ie': r[12] == e['classes']['NA vs IE'], 'catdis': r[13] == e['classes']['category disagreement'],
                  'missing': r[14] == e['classes']['missing A'] + e['classes']['missing B'] + e['classes']['missing both'], 'invalid': r[15] == e['classes']['invalid A'] + e['classes']['invalid B']}
        if f not in CATS: checks['within1'] = close(r[6], e.get('within1'))
        if not all(checks.values()): bad.append((f, subset, {k: v for k, v in checks.items() if not v}, r, e))
    allcls = Counter(r[9] for r in cmp_rows)
    return {'mode': mode, 'errorCells': len(errs), 'errorsSample': errs[:5], 'numericImportMatchesReference': numeric_ok, 'comparisonRows': len(cmp_rows), 'classMismatches': len(cls_bad), 'classMismatchSample': cls_bad[:3],
            'agreementRows': len(ag), 'agreementMismatches': len(bad), 'agreementMismatchSample': [str(b)[:400] for b in bad[:3]], 'classDistribution': dict(allcls),
            'blankVsZeroCase': {'A': sp[2], 'B': sp[3], 'class': sp[9]}, 'naVsIeAndCaseFoldCase': sp2, 'calibrationRowsAgreement': sum(1 for r in ag if r[2] == 'calibration'),
            'sampleAgreement': [list(x) for x in ag[:2]] + [list(x) for x in ag if x[2] == 'calibration'][:1]}
res = [check('text'), check('numeric')]
json.dump(res, open(f'{D}/dry_run_results.json', 'w'), indent=1, default=str)
for r in res: print({k: v for k, v in r.items() if k not in ('sampleAgreement',)})
