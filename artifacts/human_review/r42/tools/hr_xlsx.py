#!/usr/bin/env python3
# Builds reviewer_agreement_template.xlsx (coordinator tool). Usage: hr_xlsx.py <out.xlsx> [--fill-test]
import json, sys, random
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

out = sys.argv[1]
TEST = '--fill-test' in sys.argv
OUT = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha/artifacts/human_review/r42'
ids = sorted(c['anonId'] for c in json.load(open(f'{OUT}/restricted_case_mapping.json'))['cases'])
N = len(ids)
CRIT = [('C1', 'Task alignment'), ('C2', 'Age appropriateness'), ('C3', 'Answer correctness'), ('C4', 'Grounding'), ('C5', 'Grammar'), ('C6', 'CEFR appropriateness'),
        ('C7', 'Hint quality and answer leakage'), ('C8', 'Formative assessment quality'), ('C9', 'Evidence sufficiency'), ('C10', 'Overall instructional quality')]
NUMERIC = [c for c, _ in CRIT if c != 'C9']
CATEG = {'C9': ['SUFFICIENT', 'LIMITED', 'INSUFFICIENT'], 'OVERALL': ['meets expectations', 'partially meets', 'does not meet', 'cannot judge']}
H = Font(bold=True); FILL = PatternFill('solid', fgColor='DDEBF7')
wb = Workbook()

ws = wb.active; ws.title = 'Instructions'
for r, t in enumerate([
    'ENARA r4.2: reviewer agreement template (COORDINATOR TOOL, do not give to reviewers)',
    '1. After BOTH reviewers submit, paste reviewer_A_score_sheet.csv as-is into sheet A_raw (from cell A1, header row included); same for B into B_raw.',
    '2. Sheets Reviewer_A / Reviewer_B pull scores by anonymous case id (row order of the CSVs does not matter).',
    '3. Only AFTER both submissions: open restricted_case_mapping.json and enter Y for calibration cases in sheet Calibration_flags (column B). Leave N otherwise.',
    '4. Comparison: one row per case x criterion; exact agreement, absolute difference and disagreement class are computed. Fill adjudicated score and note during adjudication.',
    '5. Agreement: exact agreement %, within-one %, quadratic-weighted Cohen kappa (C1-C8, C10; scale 0-4) and unweighted kappa (C9, overall category), for all cases and for calibration cases only.',
    '   NA / IE are excluded from numeric agreement and kappa and counted separately. Kappa is blank when fewer than 2 numeric pairs exist or when it is undefined.',
    '6. The automated (AI) evaluator results are in automated_evaluator_comparison_restricted.json and are deliberately NOT part of this workbook.',
    'Rubric ltb-rubric-v2 is a DRAFT and not academically validated.']):
    ws.cell(row=r + 1, column=1, value=t).font = H if r == 0 else Font()
ws.column_dimensions['A'].width = 150

# raw paste sheets (CSV layout: reviewer_id, position, anon_case_id, C1_score, C1_evidence, ..., C10_evidence, overall_category, critical, major, ...)
hdr = ['reviewer_id', 'position', 'anon_case_id'] + [x for c, _ in CRIT for x in (f'{c}_score', f'{c}_evidence_quote_turn')] + ['overall_category', 'critical_defect_yes_no', 'major_defect_yes_no', 'defect_description', 'notes', 'minutes_spent', 'independence_declaration_signed_yes_no']
for who in ('A', 'B'):
    r = wb.create_sheet(f'{who}_raw')
    for j, h in enumerate(hdr): r.cell(row=1, column=j + 1, value=h).font = H
    if TEST:  # synthetic test data, only in the verification copy
        rnd = random.Random(7 if who == 'A' else 8)
        order = ids[:]; rnd.shuffle(order)
        for i, a in enumerate(order):
            row = [f'TEST-{who}', i + 1, a]
            for c, _ in CRIT:
                if c == 'C9': v = rnd.choice(CATEG['C9'])
                else: v = rnd.choice([0, 1, 2, 3, 3, 3, 4, 4, 'NA', 'IE'])
                row += [v, '']
            row += [rnd.choice(CATEG['OVERALL']), 'no', rnd.choice(['yes', 'no']), '', '', 10, 'yes']
            for j, v in enumerate(row): r.cell(row=i + 2, column=j + 1, value=v)

score_col = {c: 4 + 2 * k for k, (c, _) in enumerate(CRIT)}  # 1-based in raw
ov_col, crit_col, maj_col = 4 + 2 * len(CRIT), 5 + 2 * len(CRIT), 6 + 2 * len(CRIT)
fields = [(c, score_col[c]) for c, _ in CRIT] + [('OVERALL', ov_col), ('CRITICAL', crit_col), ('MAJOR', maj_col)]
for who in ('A', 'B'):
    s = wb.create_sheet(f'Reviewer_{who}')
    s.cell(row=1, column=1, value='anon_case_id').font = H
    for j, (f, _) in enumerate(fields): s.cell(row=1, column=j + 2, value=f).font = H
    for i, a in enumerate(ids):
        s.cell(row=i + 2, column=1, value=a)
        for j, (f, col) in enumerate(fields):
            rng = f"{who}_raw!${L(col)}$2:${L(col)}$500"
            s.cell(row=i + 2, column=j + 2, value=f'=IFERROR(IF(INDEX({rng},MATCH($A{i+2},{who}_raw!$C$2:$C$500,0))="","",INDEX({rng},MATCH($A{i+2},{who}_raw!$C$2:$C$500,0))),"")')

cal = wb.create_sheet('Calibration_flags')
cal['A1'] = 'anon_case_id'; cal['B1'] = 'is_calibration (Y/N), fill ONLY after both reviewers submit'
cal['A1'].font = cal['B1'].font = H
dv = DataValidation(type='list', formula1='"Y,N"', allow_blank=True); cal.add_data_validation(dv)
for i, a in enumerate(ids):
    cal.cell(row=i + 2, column=1, value=a); dv.add(f'B{i+2}')
    if TEST: cal.cell(row=i + 2, column=2, value='Y' if i % 4 == 0 else 'N')

# long comparison table
cmp_ = wb.create_sheet('Comparison')
ch = ['anon_case_id', 'criterion', 'reviewer_A', 'reviewer_B', 'both_numeric', 'exact_agreement', 'abs_difference', 'disagreement_class', 'calibration', 'adjudicated_value', 'adjudication_note', 'adjudicator', 'resolved_yes_no']
for j, h in enumerate(ch): cmp_.cell(row=1, column=j + 1, value=h).font = H
crit_fields = [f for f, _ in fields]
row = 2
for a in ids:
    for k, f in enumerate(crit_fields):
        ci = k + 2
        cmp_.cell(row=row, column=1, value=a); cmp_.cell(row=row, column=2, value=f)
        cmp_.cell(row=row, column=3, value=f'=INDEX(Reviewer_A!$B$2:${L(len(fields)+1)}${N+1},MATCH($A{row},Reviewer_A!$A$2:$A${N+1},0),{ci-1})')
        cmp_.cell(row=row, column=4, value=f'=INDEX(Reviewer_B!$B$2:${L(len(fields)+1)}${N+1},MATCH($A{row},Reviewer_B!$A$2:$A${N+1},0),{ci-1})')
        cmp_.cell(row=row, column=5, value=f'=IF(AND(ISNUMBER(C{row}),ISNUMBER(D{row})),1,0)')
        cmp_.cell(row=row, column=6, value=f'=IF(OR(C{row}="",D{row}=""),"",IF(UPPER(C{row}&"")=UPPER(D{row}&""),1,0))')
        cmp_.cell(row=row, column=7, value=f'=IF(E{row}=1,ABS(C{row}-D{row}),"")')
        cmp_.cell(row=row, column=8, value=f'=IF(OR(C{row}="",D{row}=""),"pending",IF(F{row}=1,"exact",IF(E{row}=1,IF(G{row}=1,"adjacent (1 point)","substantive (2+ points)"),IF(OR(ISNUMBER(C{row}),ISNUMBER(D{row})),"scored vs NA/IE","category mismatch"))))')
        cmp_.cell(row=row, column=9, value=f'=IFERROR(INDEX(Calibration_flags!$B$2:$B${N+1},MATCH($A{row},Calibration_flags!$A$2:$A${N+1},0))&"","")')
        row += 1
LAST = row - 1
for col, w in zip('ABCDEFGHIJKLM', (12, 10, 12, 12, 10, 10, 10, 22, 11, 14, 40, 14, 12)): cmp_.column_dimensions[col].width = w

# kappa matrices + agreement summary
km = wb.create_sheet('Kappa_matrices')
ag = wb.create_sheet('Agreement')
agh = ['criterion', 'scale', 'subset', 'pairs (both answered)', 'numeric/category pairs', 'exact agreement %', 'within 1 point %', 'kappa', 'kappa type', 'NA/IE disagreements']
for j, h in enumerate(agh): ag.cell(row=1, column=j + 1, value=h).font = H
CR = f'Comparison!$B$2:$B${LAST}'; CA = f'Comparison!$C$2:$C${LAST}'; CB = f'Comparison!$D$2:$D${LAST}'; CE = f'Comparison!$E$2:$E${LAST}'
CF = f'Comparison!$F$2:$F${LAST}'; CG = f'Comparison!$G$2:$G${LAST}'; CI = f'Comparison!$I$2:$I${LAST}'; CH = f'Comparison!$H$2:$H${LAST}'
krow, arow = 1, 2
def block(f, cats, weighted, subset):
    global krow, arow
    k = len(cats); top = krow
    km.cell(row=top, column=1, value=f'{f}: {"all cases" if subset == "all" else "calibration only"} ({"quadratic weighted" if weighted else "unweighted"})').font = H
    for j, c in enumerate(cats):
        km.cell(row=top + 1, column=2 + j, value=c).fill = FILL; km.cell(row=top + 2 + j, column=1, value=c).fill = FILL
    extra = '' if subset == 'all' else f',{CI},"Y"'
    for i, ri in enumerate(cats):
        for j, cj in enumerate(cats):
            vi = ri if isinstance(ri, int) else f'"{ri}"'; vj = cj if isinstance(cj, int) else f'"{cj}"'
            km.cell(row=top + 2 + i, column=2 + j, value=f'=COUNTIFS({CR},"{f}",{CA},{vi},{CB},{vj}{extra})')
    O = f'{L(2)}{top+2}:{L(1+k)}{top+1+k}'
    km.cell(row=top + 1, column=3 + k, value='row total').font = H
    for i in range(k): km.cell(row=top + 2 + i, column=3 + k, value=f'=SUM({L(2)}{top+2+i}:{L(1+k)}{top+2+i})')
    km.cell(row=top + 2 + k, column=1, value='col total').font = H
    for j in range(k): km.cell(row=top + 2 + k, column=2 + j, value=f'=SUM({L(2+j)}{top+2}:{L(2+j)}{top+1+k})')
    ncell = f'{L(3+k)}{top+2+k}'; km[ncell] = f'=SUM({O})'
    e0 = top + 4 + k; w0 = e0 + k + 1
    km.cell(row=e0 - 1, column=1, value='expected').font = H; km.cell(row=w0 - 1, column=1, value='weights').font = H
    for i in range(k):
        for j in range(k):
            km.cell(row=e0 + i, column=2 + j, value=f'=IF({ncell}=0,0,{L(3+k)}{top+2+i}*{L(2+j)}${top+2+k}/{ncell})')
            km.cell(row=w0 + i, column=2 + j, value=((i - j) ** 2 / (k - 1) ** 2) if weighted else (0 if i == j else 1))
    E = f'{L(2)}{e0}:{L(1+k)}{e0+k-1}'; W = f'{L(2)}{w0}:{L(1+k)}{w0+k-1}'
    kc = f'{L(3+k)}{top}'
    km[kc] = f'=IF({ncell}<2,"",IF(SUMPRODUCT({W},{E})=0,"",1-SUMPRODUCT({W},{O})/SUMPRODUCT({W},{E})))'
    km.cell(row=top, column=2 + k, value='kappa =').font = H
    krow = w0 + k + 2
    sub = '' if subset == 'all' else f',{CI},"Y"'
    ag.cell(row=arow, column=1, value=f); ag.cell(row=arow, column=2, value='0-4' if weighted else '/'.join(str(c) for c in cats)); ag.cell(row=arow, column=3, value=subset)
    ag.cell(row=arow, column=4, value=f'=COUNTIFS({CR},"{f}",{CH},"<>pending"{sub})')
    ag.cell(row=arow, column=5, value=f"=Kappa_matrices!{ncell}")
    ag.cell(row=arow, column=6, value=f'=IF(Kappa_matrices!{ncell}=0,"",SUMPRODUCT((Kappa_matrices!{O})*(ROW(Kappa_matrices!{O})-ROW(Kappa_matrices!{L(2)}{top+2})=COLUMN(Kappa_matrices!{O})-COLUMN(Kappa_matrices!{L(2)}{top+2})))/Kappa_matrices!{ncell})')
    if weighted:
        ag.cell(row=arow, column=7, value=f'=IF(Kappa_matrices!{ncell}=0,"",COUNTIFS({CR},"{f}",{CG},"<=1"{sub})/Kappa_matrices!{ncell})')
    ag.cell(row=arow, column=8, value=f'=Kappa_matrices!{kc}')
    ag.cell(row=arow, column=9, value='Cohen, quadratic weighted' if weighted else 'Cohen, unweighted')
    ag.cell(row=arow, column=10, value=f'=COUNTIFS({CR},"{f}",{CH},"scored vs NA/IE"{sub})+COUNTIFS({CR},"{f}",{CH},"category mismatch"{sub})')
    arow += 1
for subset in ('all', 'calibration'):
    for f in NUMERIC: block(f, [0, 1, 2, 3, 4], True, subset)
    block('C9', CATEG['C9'], False, subset)
    block('OVERALL', CATEG['OVERALL'], False, subset)
for col, w in zip('ABCDEFGHIJ', (10, 18, 12, 18, 18, 16, 16, 10, 24, 18)): ag.column_dimensions[col].width = w
for c in range(6, 9):
    for r in range(2, arow): ag.cell(row=r, column=c).number_format = '0.000'
wb.save(out)
print('saved', out, 'comparison rows', LAST - 1, 'agreement rows', arow - 2)
