#!/usr/bin/env python3
# final_score_workbook.xlsx (coordinator tool). Usage: fin_xlsx.py <out.xlsx> [--dummy <A.csv> <B.csv> <cal_ids_csv> [--as-text]]
import csv, json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

out = sys.argv[1]
DUMMY = '--dummy' in sys.argv
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
ids = sorted(c['anonId'] for c in json.load(open(f'{REPO}/artifacts/human_review/r42/final/restricted/final_case_mapping.json'))['cases'])
N = len(ids)
CRIT = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']
CATS = {'C9': ['SUFFICIENT', 'LIMITED', 'INSUFFICIENT'], 'OVERALL': ['MEETS EXPECTATIONS', 'PARTIALLY MEETS', 'DOES NOT MEET', 'CANNOT JUDGE'], 'CRITICAL': ['YES', 'NO'], 'MAJOR': ['YES', 'NO']}
H = Font(bold=True); FILL = PatternFill('solid', fgColor='DDEBF7')
st = json.load(open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/final/fin_state.json'))
COLS = st['cols']
pos = {c: COLS.index(c) + 1 for c in COLS}
FIELDS = [(c, pos[f'{c}_score']) for c in CRIT] + [('OVERALL', pos['overall_category']), ('CRITICAL', pos['critical_defect_yes_no']), ('MAJOR', pos['major_defect_yes_no'])]
NUMERIC = [c for c in CRIT if c != 'C9']

wb = Workbook()
ws = wb.active; ws.title = 'Instructions'
for r, t in enumerate([
    'ENARA r4.2: final score workbook (COORDINATOR TOOL, restricted, do not give to reviewers)',
    '1. After BOTH reviewers submit: paste reviewer_A_score_sheet.csv as-is into A_raw from cell A1 (header row included); B into B_raw. Row order does not matter.',
    '2. Values are normalised: spaces trimmed, case ignored, numbers stored as text are converted to numbers. A blank cell is MISSING, never 0.',
    '3. Out-of-domain values (e.g. 5, 2.5, "maybe") are flagged as INVALID in Comparison and excluded from agreement statistics. Check the Agreement "invalid" column is 0 before reporting.',
    '4. Only AFTER both submissions: enter Y for the calibration cases in Calibration_flags (from restricted/final_case_mapping.json). All other cases N.',
    '5. Comparison: one row per case x field, with class: exact / adjacent (1 point) / substantive (2+ points) / scored vs NA-IE / NA vs IE / category disagreement / missing A|B|both / invalid A|B.',
    '6. Agreement: for all cases and for calibration only: pairs, exact %, within-one % (0-4 criteria), Cohen kappa (quadratic weighted for 0-4, unweighted for categories) and Gwet AC2/AC1 (robust when most scores are the same).',
    '   Kappa or AC is blank when fewer than 2 valid pairs exist or the statistic is undefined (e.g. one category only). Report exact agreement next to kappa.',
    '7. AI results (automated evaluators, coordinator AI review) are NOT in this workbook. Compare them separately after adjudication.',
    'Rubric ltb-rubric-v2 is a DRAFT and not academically validated.']):
    ws.cell(row=r + 1, column=1, value=t).font = H if r == 0 else Font()
ws.column_dimensions['A'].width = 160

for who in ('A', 'B'):
    r = wb.create_sheet(f'{who}_raw')
    for j, h in enumerate(COLS): r.cell(row=1, column=j + 1, value=h).font = H

def norm(rng, row):
    x = f'INDEX({rng},MATCH($A{row},%s,0))'
    return x

for who in ('A', 'B'):
    s = wb.create_sheet(f'Reviewer_{who}')
    s.cell(row=1, column=1, value='anon_case_id').font = H
    for j, (f, _) in enumerate(FIELDS): s.cell(row=1, column=j + 2, value=f).font = H
    s.cell(row=1, column=len(FIELDS) + 2, value='consulted_appendix_A').font = H
    keyr = f'{who}_raw!$C$2:$C$500'
    for i, a in enumerate(ids):
        row = i + 2
        s.cell(row=row, column=1, value=a)
        for j, (f, col) in enumerate(FIELDS + [('APPX', pos['consulted_appendix_A_yes_no'])]):
            g = f'INDEX({who}_raw!${L(col)}$2:${L(col)}$500,MATCH($A{row},{keyr},0))'
            t = f'TRIM({g}&"")'
            s.cell(row=row, column=j + 2, value=f'=IFERROR(IF({t}="","",IF(ISNUMBER(--{t}),--{t},UPPER({t}))),"")')

cal = wb.create_sheet('Calibration_flags')
cal['A1'] = 'anon_case_id'; cal['B1'] = 'is_calibration (Y/N), fill ONLY after both reviewers submit'
cal['A1'].font = cal['B1'].font = H
dv = DataValidation(type='list', formula1='"Y,N"', allow_blank=True); cal.add_data_validation(dv)
for i, a in enumerate(ids):
    cal.cell(row=i + 2, column=1, value=a); dv.add(f'B{i+2}')

cmp_ = wb.create_sheet('Comparison')
ch = ['anon_case_id', 'field', 'reviewer_A', 'reviewer_B', 'valid_A', 'valid_B', 'both_numeric', 'exact_agreement', 'abs_difference', 'class', 'calibration', 'adjudicated_value', 'adjudication_note', 'adjudicator', 'resolved_yes_no']
for j, h in enumerate(ch): cmp_.cell(row=1, column=j + 1, value=h).font = H
row = 2
for a in ids:
    for k, (f, _) in enumerate(FIELDS):
        cmp_.cell(row=row, column=1, value=a); cmp_.cell(row=row, column=2, value=f)
        for col, who in ((3, 'A'), (4, 'B')):
            cmp_.cell(row=row, column=col, value=f'=INDEX(Reviewer_{who}!$B$2:${L(len(FIELDS)+1)}${N+1},MATCH($A{row},Reviewer_{who}!$A$2:$A${N+1},0),{k+1})')
        for col, src in ((5, 'C'), (6, 'D')):
            v = f'{src}{row}'
            if f in NUMERIC:
                cond = f'IF({v}="","",IF(ISNUMBER({v}),AND({v}>=0,{v}<=4,{v}=INT({v})),OR({v}="NA",{v}="IE")))'
            else:
                cond = f'IF({v}="","",OR(' + ','.join(f'{v}="{c}"' for c in CATS[f]) + '))'
            cmp_.cell(row=row, column=col, value=f'={cond}')
        cmp_.cell(row=row, column=7, value=f'=IF(AND(E{row}=TRUE,F{row}=TRUE,ISNUMBER(C{row}),ISNUMBER(D{row})),1,0)')
        cmp_.cell(row=row, column=8, value=f'=IF(AND(E{row}=TRUE,F{row}=TRUE),IF(C{row}=D{row},1,0),"")')
        cmp_.cell(row=row, column=9, value=f'=IF(G{row}=1,ABS(C{row}-D{row}),"")')
        cmp_.cell(row=row, column=10, value=(f'=IF(AND(C{row}="",D{row}=""),"missing both",IF(C{row}="","missing A",IF(D{row}="","missing B",'
                                              f'IF(E{row}<>TRUE,"invalid A",IF(F{row}<>TRUE,"invalid B",IF(H{row}=1,"exact",IF(G{row}=1,IF(I{row}=1,"adjacent (1 point)","substantive (2+ points)"),'
                                              f'IF(OR(ISNUMBER(C{row}),ISNUMBER(D{row})),"scored vs NA/IE",IF(OR(C{row}="NA",C{row}="IE"),"NA vs IE","category disagreement")))))))))'))
        cmp_.cell(row=row, column=11, value=f'=IFERROR(UPPER(INDEX(Calibration_flags!$B$2:$B${N+1},MATCH($A{row},Calibration_flags!$A$2:$A${N+1},0))&""),"")')
        row += 1
LAST = row - 1
for col, w in zip('ABCDEFGHIJKLMNO', (12, 10, 20, 20, 8, 8, 9, 9, 9, 22, 11, 14, 40, 14, 12)): cmp_.column_dimensions[col].width = w

km = wb.create_sheet('Kappa_matrices')
ag = wb.create_sheet('Agreement')
agh = ['field', 'scale', 'subset', 'pairs answered (both non-blank)', 'valid scored pairs (n)', 'exact agreement % (valid pairs)', 'within 1 point %', 'Cohen kappa', 'kappa type', 'Gwet AC', 'AC type',
       'scored vs NA/IE', 'NA vs IE', 'category disagreements', 'missing (A, B or both)', 'invalid values']
for j, h in enumerate(agh): ag.cell(row=1, column=j + 1, value=h).font = H
R = lambda c: f'Comparison!${c}$2:${c}${LAST}'
krow, arow = 1, 2

def block(f, cats, weighted, subset):
    global krow, arow
    k = len(cats); top = krow
    km.cell(row=top, column=1, value=f'{f}: {subset} ({"quadratic weighted" if weighted else "unweighted"})').font = H
    for j, c in enumerate(cats):
        km.cell(row=top + 1, column=2 + j, value=c).fill = FILL; km.cell(row=top + 2 + j, column=1, value=c).fill = FILL
    extra = '' if subset == 'all' else f',{R("K")},"Y"'
    for i, ri in enumerate(cats):
        for j, cj in enumerate(cats):
            vi = ri if isinstance(ri, int) else f'"{ri}"'; vj = cj if isinstance(cj, int) else f'"{cj}"'
            km.cell(row=top + 2 + i, column=2 + j, value=f'=COUNTIFS({R("B")},"{f}",{R("C")},{vi},{R("D")},{vj},{R("E")},TRUE,{R("F")},TRUE{extra})')
    O = f'{L(2)}{top+2}:{L(1+k)}{top+1+k}'
    km.cell(row=top + 1, column=3 + k, value='row total').font = H
    for i in range(k): km.cell(row=top + 2 + i, column=3 + k, value=f'=SUM({L(2)}{top+2+i}:{L(1+k)}{top+2+i})')
    km.cell(row=top + 2 + k, column=1, value='col total').font = H
    for j in range(k): km.cell(row=top + 2 + k, column=2 + j, value=f'=SUM({L(2+j)}{top+2}:{L(2+j)}{top+1+k})')
    ncell = f'{L(3+k)}{top+2+k}'; km[ncell] = f'=SUM({O})'
    e0 = top + 4 + k; w0 = e0 + k + 1; a0 = w0 + k + 1; p0 = a0 + k + 1
    for lab, r0 in (('expected', e0), ('disagreement weights', w0), ('agreement weights', a0)): km.cell(row=r0 - 1, column=1, value=lab).font = H
    km.cell(row=p0 - 1, column=1, value='pi_k (Gwet)').font = H
    for i in range(k):
        km.cell(row=p0, column=2 + i, value=f'=IF({ncell}=0,0,({L(3+k)}{top+2+i}+{L(2+i)}{top+2+k})/(2*{ncell}))')
        for j in range(k):
            km.cell(row=e0 + i, column=2 + j, value=f'=IF({ncell}=0,0,{L(3+k)}{top+2+i}*{L(2+j)}${top+2+k}/{ncell})')
            dw = ((i - j) ** 2 / (k - 1) ** 2) if weighted else (0 if i == j else 1)
            km.cell(row=w0 + i, column=2 + j, value=dw); km.cell(row=a0 + i, column=2 + j, value=1 - dw)
    E = f'{L(2)}{e0}:{L(1+k)}{e0+k-1}'; W = f'{L(2)}{w0}:{L(1+k)}{w0+k-1}'; WA = f'{L(2)}{a0}:{L(1+k)}{a0+k-1}'; PI = f'{L(2)}{p0}:{L(1+k)}{p0}'
    kc = f'{L(3+k)}{top}'; acc = f'{L(4+k)}{top}'
    km.cell(row=top, column=2 + k, value='kappa / AC =').font = H
    km[kc] = f'=IF({ncell}<2,"",IF(SUMPRODUCT({W},{E})=0,"",1-SUMPRODUCT({W},{O})/SUMPRODUCT({W},{E})))'
    pe = f'(SUM({WA})/({k}*({k}-1)))*SUMPRODUCT({PI},1-{PI})'
    km[acc] = f'=IF({ncell}<2,"",IF(1-{pe}=0,"",(SUMPRODUCT({WA},{O})/{ncell}-{pe})/(1-{pe})))'
    krow = p0 + 3
    sub = '' if subset == 'all' else f',{R("K")},"Y"'
    ag.cell(row=arow, column=1, value=f); ag.cell(row=arow, column=2, value='0-4' if weighted else ' / '.join(cats)); ag.cell(row=arow, column=3, value=subset)
    miss = '+'.join(f'COUNTIFS({R("B")},"{f}",{R("J")},"{m}"{sub})' for m in ('missing A', 'missing B', 'missing both'))
    ag.cell(row=arow, column=4, value=f'=COUNTIFS({R("B")},"{f}"{sub})-({miss})')
    ag.cell(row=arow, column=5, value=f'=Kappa_matrices!{ncell}')
    ag.cell(row=arow, column=6, value=f'=IF(Kappa_matrices!{ncell}=0,"",COUNTIFS({R("B")},"{f}",{R("J")},"exact",{R("E")},TRUE{sub}' + (f',{R("G")},1' if weighted else '') + f')/Kappa_matrices!{ncell})')
    if weighted:
        ag.cell(row=arow, column=7, value=f'=IF(Kappa_matrices!{ncell}=0,"",COUNTIFS({R("B")},"{f}",{R("G")},1,{R("I")},"<=1"{sub})/Kappa_matrices!{ncell})')
    ag.cell(row=arow, column=8, value=f'=Kappa_matrices!{kc}')
    ag.cell(row=arow, column=9, value='Cohen, quadratic weighted' if weighted else 'Cohen, unweighted')
    ag.cell(row=arow, column=10, value=f'=Kappa_matrices!{acc}')
    ag.cell(row=arow, column=11, value='Gwet AC2, quadratic' if weighted else 'Gwet AC1')
    for c, lab in ((12, 'scored vs NA/IE'), (13, 'NA vs IE'), (14, 'category disagreement')):
        ag.cell(row=arow, column=c, value=f'=COUNTIFS({R("B")},"{f}",{R("J")},"{lab}"{sub})')
    ag.cell(row=arow, column=15, value=f'={miss}')
    ag.cell(row=arow, column=16, value=f'=COUNTIFS({R("B")},"{f}",{R("J")},"invalid A"{sub})+COUNTIFS({R("B")},"{f}",{R("J")},"invalid B"{sub})')
    arow += 1

for subset in ('all', 'calibration'):
    for f in NUMERIC: block(f, [0, 1, 2, 3, 4], True, subset)
    for f in ('C9', 'OVERALL', 'CRITICAL', 'MAJOR'): block(f, CATS[f], False, subset)
for col, w in zip('ABCDEFGHIJKLMNOP', (10, 22, 12, 14, 12, 14, 12, 10, 22, 10, 16, 12, 10, 14, 12, 10)): ag.column_dimensions[col].width = w
for c in (6, 7, 8, 10):
    for r in range(2, arow): ag.cell(row=r, column=c).number_format = '0.000'

if DUMMY:  # dry-run copy only
    a_csv, b_csv, cal_csv = sys.argv[sys.argv.index('--dummy') + 1: sys.argv.index('--dummy') + 4]
    as_text = '--as-text' in sys.argv
    for who, p in (('A', a_csv), ('B', b_csv)):
        rows = list(csv.reader(open(p, encoding='utf-8')))
        sh = wb[f'{who}_raw']
        for i, r in enumerate(rows[1:]):
            for j, v in enumerate(r):
                if v == '': continue
                if not as_text:
                    try: v = int(v)
                    except ValueError: pass
                sh.cell(row=i + 2, column=j + 1, value=v)
    flags = set(open(cal_csv).read().split())
    for i, a in enumerate(ids): cal.cell(row=i + 2, column=2, value='Y' if a in flags else 'N')
wb.save(out)
print('saved', out, 'comparison rows', LAST - 1, 'agreement rows', arow - 2)
