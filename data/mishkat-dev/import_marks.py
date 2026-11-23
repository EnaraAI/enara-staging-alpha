# Imports a returned marking sheet into data/mishkat-dev.
#   Owner review sheet (Mishkat_review_sheet_*.xlsx + its -key.json): the "YOU" cells -> owner-corrections.json (source "owner").
#   Teacher sheet (ENARA_teacher_marking_sheet.xlsx + teacher-marking/key.json): the criterion cells -> teacher-marks.json (source
#   "teacher"); teacher marks replace model marks for the same answers. Usage:
#   python3 import_marks.py owner  <sheet.xlsx> <key.json>
#   python3 import_marks.py teacher <sheet.xlsx> <key.json> <teacher-id>
import json, sys, os, datetime
from openpyxl import load_workbook
HERE = os.path.dirname(os.path.abspath(__file__))
CR = ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']
MAX = {'essay': {c: 2 for c in CR}, 'short_answer': {'task_completion': 2, 'grammar_accuracy': 1, 'mechanics': 1}}
mode, sheet, keyf = sys.argv[1], sys.argv[2], sys.argv[3]
key = json.load(open(keyf)); wb = load_workbook(sheet, data_only=True)
types = {p['id']: p['type'] for l in ('en', 'ar') for p in json.load(open(f'{HERE}/pool-{l}.json'))}
out_f = f'{HERE}/owner-corrections.json' if mode == 'owner' else f'{HERE}/teacher-marks.json'
out = json.load(open(out_f)) if os.path.exists(out_f) else {}
n, problems = 0, []
for ws in wb.worksheets[1:]:
    for r in range(3, ws.max_row + 1):
        code = ws.cell(r, 1).value
        if not code or code not in key: continue
        aid = key[code]; typ = types.get(aid)
        if typ is None:  # teacher sheet answers come from the benchmark, not necessarily the pool
            typ = 'short_answer' if str(ws.cell(r, 3).value).startswith(('short', 'إجابة')) else 'essay'
        marks = {}
        for i, c in enumerate(CR):
            col = (8 + 3 * i) if mode == 'owner' else (6 + i)
            v = ws.cell(r, col).value
            if v in (None, ''): continue
            if c not in MAX[typ] or not str(v).strip().isdigit() or int(v) > MAX[typ][c]: problems.append(f'{code} {c}={v}'); continue
            marks[c] = int(v)
        if not marks: continue
        if mode == 'owner': out[aid] = {**out.get(aid, {}), **marks}
        else: out.setdefault(aid, {})[sys.argv[4]] = {'marks': marks, 'date': datetime.date.today().isoformat(), 'source': 'teacher'}
        n += 1
json.dump(out, open(out_f, 'w'), ensure_ascii=False, indent=1)
print(f'{n} answers imported into {os.path.basename(out_f)}; problems: {problems[:10]}')
