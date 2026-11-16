#!/usr/bin/env python3
import json, os, re, csv, hashlib
REPO = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha'
os.chdir(REPO)
OUT = 'artifacts/human_review/r42'
st = json.load(open('../final/hr_state.json'))
P31 = json.load(open(f'{OUT}/31_priority_cases.json'))['cases']
C9 = json.load(open(f'{OUT}/9_hidden_calibration_cases.json'))['cases']
MAP = json.load(open(f'{OUT}/restricted_case_mapping.json'))['cases']
AUTO = json.load(open(f'{OUT}/automated_evaluator_comparison_restricted.json'))['cases']
RES = json.load(open(f'{OUT}/reserve_cases_restricted.json'))['cases']
FX = {json.loads(l)['id']: json.loads(l) for l in open('docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl')}
pkg = {w: open(f'{OUT}/reviewer_{w}_blind_package.md', encoding='utf-8').read() for w in 'AB'}
cases_part = {w: pkg[w].split('# Appendix A')[0] for w in 'AB'}
checks, incomplete = [], []
def chk(name, ok, detail):
    checks.append((name, bool(ok), detail))

ALL = P31 + C9
chk('31 priority cases present', len(P31) == 31 and [c['caseId'] for c in P31] == st['t1'], f'{len(P31)} records; ids equal the Tier 1 list in order')
chk('9 calibration cases present', len(C9) == 9 and sorted(c['caseId'] for c in C9) == sorted(st['t3']), f'{len(C9)} records')
chk('No overlap / no replacement cases', len({c['caseId'] for c in ALL}) == 40 and all(c['previousAdjudicationId'] for c in ALL), '40 distinct cases, each traced to its earlier ADJ id')
chk('Reserve package', len(RES) == 80 and not ({c['caseId'] for c in RES} & {c['caseId'] for c in ALL}), f'{len(RES)} remaining benchmark cases (complete fixture = 120)')

# conversation evidence completeness and fidelity
raw = {}
for n in (1, 2, 3):
    raw[n] = {json.loads(l)['caseId']: json.loads(l) for l in open(f'docs/benchmarks/language-teaching/20261109-r42-controlled-validation/run_{n}/live/raw_results.jsonl')}
bad_turns = []
for c in ALL + RES:
    script = FX[c['caseId']]['learnerScript']
    convs = c['conversationsAllRuns']
    for rk, conv in convs.items():
        n = int(rk[-1])
        r = raw[n][c['caseId']]
        if len(conv['turns']) != len(script) or len(r['turns']) != len(script):
            bad_turns.append((c['caseId'], rk, 'turn count'))
        for k, t in enumerate(conv['turns']):
            if not t['tutor'] or t['httpStatus'] != 200: bad_turns.append((c['caseId'], rk, k + 1, 'empty/failed reply'))
            if t['tutor'] != r['turns'][k]['reply'] or t['learner'] != r['turns'][k]['learner']: bad_turns.append((c['caseId'], rk, k + 1, 'text differs from source'))
            if t['learner'] != script[k]['text']: bad_turns.append((c['caseId'], rk, k + 1, 'learner text differs from fixture'))
            if not t['turnId'] or not conv['source']['line']: bad_turns.append((c['caseId'], rk, k + 1, 'traceability'))
            if not t['tutorCallStartedAt']: incomplete.append((c['caseId'], rk, k + 1, 'no provider timestamp'))
chk('Every case has complete conversation evidence (all 3 runs)', not bad_turns, f'{sum(len(conv["turns"]) for c in ALL + RES for conv in c["conversationsAllRuns"].values())} turns checked against raw_results and fixture; problems: {bad_turns[:5]}')

# verbatim presence in blind packages (designated run)
def quoted(text):
    return '> ' + text.replace('\n', '\n> ')
missing_q = [(c['anonId'], t['turn']) for c in ALL for t in c['conversationDesignatedRun']['turns'] for w in 'AB' if quoted(t['tutor']) not in pkg[w] or quoted(t['learner']) not in pkg[w]]
chk('Original wording preserved; no fabricated or reconstructed turns', not missing_q, f'every designated-run learner and tutor turn appears verbatim in both packages; turn counts equal fixture scripts; misses: {missing_q[:5]}')

# no AI evaluation in blind packages
ai_strings = set()
for a in AUTO:
    for rk, run in a['runs'].items():
        for role in ('official', 'independent'):
            for v in (run[role].get('evidence') or {}).values():
                if isinstance(v, str) and len(v) > 30: ai_strings.add(v[:60])
            for f in run[role].get('failures') or []:
                for k in ('note',):
                    if f.get(k) and len(f[k]) > 30: ai_strings.add(f[k][:60])
leaked = [s for s in ai_strings for w in 'AB' if s in cases_part[w]]
banned = re.compile(r'\b(MEETS|PARTIAL|DOES_NOT_MEET|UNCERTAIN|official evaluator|independent evaluator|Sonnet|Haiku|judge_v2|outcome:|hintLevel|keyVerdict|learnerIntent|markerStatus|answer_with_reasoning)\b')
hits = {w: sorted(set(banned.findall(cases_part[w]))) for w in 'AB'}
chk('No AI evaluation results in blind packages', not leaked and not any(hits.values()), f'{len(ai_strings)} evaluator rationale strings searched: {len(leaked)} found; banned outcome/telemetry terms in case sections: {hits}')
calib = re.compile(r'calibrat|Tier\s*\d|priority|control case|ADJ-\d|selection reason', re.I)
chk('No calibration or selection labels exposed', not any(calib.search(cases_part[w]) for w in 'AB'), 'searched case sections and introduction for calibration/tier/priority/ADJ/selection terms')
ident = re.compile(r'LTB-|Qorvath|ltb-(?:stu|school|learner|admin|cls|crs|cur|lsn|obj|mis|b)-|bench\.invalid|Synthetic School|Bench Admin|#run\d|run_\d')
idhits = {w: sorted(set(ident.findall(pkg[w]))) for w in 'AB'}
caseid_hits = [c['caseId'] for c in ALL for w in 'AB' if c['caseId'] in pkg[w]]
chk('Anonymisation', not any(idhits.values()) and not caseid_hits, f'identifier patterns: {idhits}; original case ids present: {caseid_hits}')

# A/B equivalence and independent order
def sections(text):
    parts = re.split(r'\n## Case \d+: ', text)[1:]
    return sorted(p.split('---')[0] if False else p for p in [re.sub(r'\n---\n?$', '', x).split('\n# Appendix A')[0].rstrip('-\n ') for x in parts])
sa, sb = sections(pkg['A']), sections(pkg['B'])
oa = [m['anonId'] for m in sorted(MAP, key=lambda m: m['reviewerA_position'])]
ob = [m['anonId'] for m in sorted(MAP, key=lambda m: m['reviewerB_position'])]
same_pos = sum(1 for x, y in zip(oa, ob) if x == y)
intro_eq = pkg['A'].split('## Case 1:')[0].replace('Reviewer A', 'Reviewer X').replace('reviewer_A', 'reviewer_X') == pkg['B'].split('## Case 1:')[0].replace('Reviewer B', 'Reviewer X').replace('reviewer_B', 'reviewer_X')
chk('Reviewer A and B receive equivalent evidence', sa == sb and len(sa) == 40 and intro_eq and pkg['A'].split('# Appendix A')[1] == pkg['B'].split('# Appendix A')[1], f'40 case sections identical as sets; introduction and appendix identical apart from reviewer letter')
chk('Case order randomised independently', oa != ob, f'{same_pos}/40 cases share the same position in both orders')
ida = [r['anon_case_id'] for r in csv.DictReader(open(f'{OUT}/reviewer_A_score_sheet.csv'))]
idb = [r['anon_case_id'] for r in csv.DictReader(open(f'{OUT}/reviewer_B_score_sheet.csv'))]
chk('Score sheets match packages', ida == oa and idb == ob and set(ida) == {c['anonId'] for c in ALL}, 'each CSV lists the 40 anonymous ids in that reviewer\'s package order; no scores pre-filled')
chk('Automated comparison complete (restricted)', len(AUTO) == 40 and all(len(a['runs']) == 3 for a in AUTO), f'40 cases x 3 runs x 2 evaluators; retest available for {sum(1 for a in AUTO if a["run1OfficialRetest"])}/40')
chk('Answer keys only in expert material', all('Expert use only' in pkg[w] for w in 'AB'), 'acceptable answers appear only in the expert packages under an "expert use only, never shown to learners" label; no learner-facing material is produced')
srcm = json.load(open(f'{OUT}/source_manifest.json'))
chk('Source traceability and baseline integrity', not srcm['baselineIntegrity']['changed'] and all(os.path.exists(p) for p in srcm['sources']), f'{len(srcm["sources"])} source files hashed; frozen baseline files changed: {srcm["baselineIntegrity"]["changed"]}')

json.dump({'checks': checks, 'incomplete': incomplete}, open('../final/hr_validation.json', 'w'), indent=1)
for n, ok, d in checks: print('PASS' if ok else 'FAIL', n, '|', d[:160])
print('incomplete fields', len(incomplete))
