#!/usr/bin/env python3
# Read-only investigation of pre-attempt rule disclosure and answer-form leakage across r4.2 runs 1-3.
import json, re, os
from collections import Counter, defaultdict
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
os.chdir(REPO)
B = 'docs/benchmarks/language-teaching'
C = f'{B}/20261109-r42-controlled-validation'
FX = {json.loads(l)['id']: json.loads(l) for l in open(f'{B}/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl')}
RAW = {n: {json.loads(l)['caseId']: json.loads(l) for l in open(f'{C}/run_{n}/live/raw_results.jsonl')} for n in (1, 2, 3)}
MAP = {m['anonId']: m for m in json.load(open('artifacts/human_review/r42/final/restricted/final_case_mapping.json'))['cases']}
CID = {m['caseId']: a for a, m in MAP.items()}

RULE = {
    'Talking about my family': re.compile(r"\b(he|she)\b\s*(=|is for|for a|means)|\b(boy|man|male)\b[^.\n?]{0,40}\bhe\b|\b(girl|woman|female)\b[^.\n?]{0,40}\bshe\b|\bhe\b[^.\n?]{0,25}\b(boy|man)\b|\bshe\b[^.\n?]{0,25}\b(girl|woman)\b", re.I),
    'My daily routine': re.compile(r"\b(he|she|it)\b[^.\n]{0,50}(-e?s\b|\badds?\b[^.\n]{0,15}\bs\b|\bending\b)|-es\b|third.person", re.I),
    'Life experiences': re.compile(r"past simple|present perfect|finished time|\bhave\s*/\s*has\b|ha(ve|s)\s*\+|past participle", re.I),
}
DECIDING = re.compile(r"\b(brother|father|grandfather|dad|son|uncle)\b[^.\n?]{0,25}\b(is a |= ?)?(boy|man)\b|\b(sister|mother|grandmother|mum|mom|daughter|aunt)\b[^.\n?]{0,25}\b(is a |= ?)?(girl|woman)\b", re.I)
LABEL = re.compile(r"\[ex\d\]")

def core(prompt):  # longest fragment of the quoted item text, gaps and (verb) cues removed
    m = re.search(r'"([^"]+)"', prompt)
    q = m.group(1) if m else prompt
    frags = [f.strip(' .?') for f in re.split(r'_+|\([^)]*\)', q)]
    return max(frags, key=len)

def forms(it):
    return [f for f in (it.get('targetForms') or []) if f.lower() not in ('he', 'she')]

rows = []
for n in (1, 2, 3):
    for cid, r in RAW[n].items():
        c = FX[cid]
        L = c.get('lessonDelivered')
        if not L: continue
        items = L['spec']['items']; title = L['title']
        attempted = set(); failed = set()
        script = c['learnerScript']
        for k, t in enumerate(r['turns']):
            tgt = script[k]['target']
            item_now = tgt.split(':')[1] if tgt.startswith('lesson_item:') else None
            if item_now: attempted.add(item_now)
            lt = t.get('languageTurn') or {}
            moves = lt.get('moves') or []
            verdict = ((lt.get('assessment') or {}).get('verdict'))
            reply = t['reply'] or ''
            for it in items:
                pc = core(it['prompt'])
                presents = pc.lower()[:18] in reply.lower()
                body = re.sub(re.escape(it['prompt'].split(':', 1)[-1].strip()), ' ', reply)  # exclude the item prompt itself
                pre_attempt = it['id'] not in attempted
                META = r'(?!\s+(?:at|before|after|in front|first|last|between|here|there|with the|right)\b)'
                leak_forms = [f for f in forms(it) if re.search(rf'\b{re.escape(f)}\b' + META, body, re.I)]
                rec = dict(run=n, caseId=cid, anon=CID.get(cid), turn=k + 1, item=it['id'], lesson=title, presents=presents, preAttempt=pre_attempt,
                           rule=bool(RULE[title].search(body)), deciding=bool(DECIDING.search(body)) if title == 'Talking about my family' else None,
                           formLeak=leak_forms, answerWithReasoning='answer_with_reasoning' in moves, verdictThisTurn=verdict,
                           learnerFailedBefore=(it['id'] in failed) or (item_now == it['id'] and verdict in ('INCORRECT', 'PARTIALLY_CORRECT', 'AMBIGUOUS')), label=bool(LABEL.search(reply)), snippet=reply)
                rows.append(rec)
            if item_now and verdict in ('INCORRECT', 'PARTIALLY_CORRECT'): failed.add(item_now)

def pct(a, b): return f'{a}/{b} ({100*a/b:.0f}%)' if b else '0/0'
pres_pre = [r for r in rows if r['presents'] and r['preAttempt']]
out = {}
out['itemPresentationsBeforeAttempt'] = len(pres_pre)
out['ruleStatedWhenPresenting'] = pct(sum(r['rule'] for r in pres_pre), len(pres_pre))
fam = [r for r in pres_pre if r['lesson'] == 'Talking about my family']
out['decidingFactWhenPresentingFamilyItem'] = pct(sum(1 for r in fam if r['deciding']), len(fam))
out['ruleByLesson'] = {t: pct(sum(r['rule'] for r in pres_pre if r['lesson'] == t), sum(1 for r in pres_pre if r['lesson'] == t)) for t in RULE}
out['ruleByRun'] = {n: pct(sum(r['rule'] for r in pres_pre if r['run'] == n), sum(1 for r in pres_pre if r['run'] == n)) for n in (1, 2, 3)}
leak_pre = [r for r in rows if r['preAttempt'] and r['formLeak'] and not r['answerWithReasoning']]
out['answerFormBeforeAttempt'] = {'turns': len(leak_pre), 'cases': len({(r['run'], r['caseId']) for r in leak_pre}), 'distinctCases': len({r['caseId'] for r in leak_pre}),
                                 'whilePresentingThatItem': sum(1 for r in leak_pre if r['presents']), 'byForm': dict(Counter(f for r in leak_pre for f in r['formLeak']))}
leak_hint = [r for r in rows if not r['preAttempt'] and r['learnerFailedBefore'] and r['formLeak'] and not r['answerWithReasoning'] and r['verdictThisTurn'] not in ('CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION')]
out['answerFormInHintAfterFailedAttempt'] = {'turns': len(leak_hint), 'distinctCases': len({r['caseId'] for r in leak_hint})}
labels = {(r['run'], r['caseId'], r['turn']) for r in rows if r['label']}
tot_turns = sum(len(RAW[n][c]['turns']) for n in (1, 2, 3) for c in RAW[n])
out['internalExerciseLabelShown'] = {'replies': len(labels), 'ofReplies': tot_turns, 'distinctCases': len({x[1] for x in labels})}
flag = {}
for a in ('EXP-C58A', 'EXP-D688', 'EXP-892B', 'EXP-4137'):
    cid = MAP[a]['caseId']; per = {}
    for n in (1, 2, 3):
        rr = [r for r in rows if r['run'] == n and r['caseId'] == cid]
        per[f'run{n}'] = {'formLeakBeforeAttempt': sorted({(r['turn'], r['item'], tuple(r['formLeak'])) for r in rr if r['formLeak'] and r['preAttempt'] and not r['answerWithReasoning']}),
                          'formLeakInHintAfterFailedAttempt': sorted({(r['turn'], r['item'], tuple(r['formLeak'])) for r in rr if r['formLeak'] and not r['preAttempt'] and r['learnerFailedBefore'] and not r['answerWithReasoning'] and r['verdictThisTurn'] not in ('CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION')}),
                          'rulePreAttemptTurns': sorted({(r['turn'], r['item']) for r in rr if r['rule'] and r['preAttempt']}),
                          'labelShown': any(r['label'] for r in rr),
                          'transcript': [{'turn': k + 1, 'learner': t['learner'], 'tutor': t['reply']} for k, t in enumerate(RAW[n][cid]['turns'])]}
    flag[a] = {'caseId': cid, 'designatedRun': MAP[a]['designatedTranscriptRun'], 'isCalibration': MAP[a]['isCalibration'], 'runs': per}
out['flaggedCases'] = flag
samples = {'answerFormBeforeAttempt': [(r['run'], r['caseId'], r['turn'], r['item'], r['formLeak'], r['snippet']) for r in leak_pre],
           'answerFormInHint': [(r['run'], r['caseId'], r['turn'], r['item'], r['formLeak'], r['snippet']) for r in leak_hint]}
out['samples'] = samples
json.dump(out, open('artifacts/human_review/r42/final/restricted/investigation_results.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in out.items() if k not in ('flaggedCases', 'samples')}, indent=1))
for a, f in flag.items(): print(a, f['caseId'], 'cal' if f['isCalibration'] else 'pri', {k: (v['formLeakBeforeAttempt'], v['formLeakInHintAfterFailedAttempt'], v['rulePreAttemptTurns'], v['labelShown']) for k, v in f['runs'].items()})
for k, v in samples.items():
    print('==', k)
    for s in v[:4]: print('  ', s[:5], '|', s[5][:220].replace('\n', ' / '))
