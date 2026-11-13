#!/usr/bin/env python3
# Builds the LO experiment: per campaign, 12 outcomes x 10 profiles = 120 simulated learners, each
# tutored by the real ENARA tutor route on the ENARA lesson that teaches the outcome. Writes the
# tutoring cases (no assessment items in them) and, separately, the frozen assessment bank.
# Usage: gen_lo.py <out_dir>   (run from anywhere; reads fixture v2 from the repo)
import json, sys, os, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lo_bank import LO
from profiles import P, FORGET
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../..'))
# ENARA curriculum lessons (copied verbatim from backend/src/services/demoTemplate.ts and fixture v2).
DEMO = {
 'demo1': dict(title='Lesson 1: Hello and introductions', objective='Greet people and introduce yourself and others.', spec=dict(objectives=['Greet people and introduce yourself', 'Introduce a friend and say their job'], successCriteria=['Uses the right greeting for the time of day', 'Says "This is … He/She is a …" correctly'], vocabulary=['hello', 'nice to meet you', 'good morning', 'good afternoon', 'good evening', 'student', 'doctor', 'teacher'], grammar=["I'm / he's / she's (to be)", 'This is …', 'Where are you from?'], functions=['greeting', 'introducing yourself', 'introducing someone else'], skills=['writing', 'reading'], examples=["Hello, I'm Lina. Nice to meet you.", 'This is Mona. She is a doctor.'])),
 'demo3': dict(title='Lesson 3: At the café', objective='Order food and drink politely.', spec=dict(objectives=['Order food and drink politely'], successCriteria=['Uses "Can I have …, please?" or "I\'d like …"', 'Uses a/an with countable and some with uncountable nouns'], vocabulary=['coffee', 'tea', 'sandwich', 'water', 'rice', 'How much is it?', 'Here you are'], grammar=['Can I have …?', "I'd like …", 'a/an vs some (countable/uncountable)'], functions=['ordering', 'asking the price', 'polite requests'], skills=['writing', 'reading'], examples=['Can I have a coffee, please?', "I'd like a cheese sandwich."])),
 'demo4': dict(title='Lesson 4: Last weekend', objective='Talk about finished actions in the past.', spec=dict(objectives=['Talk about finished actions in the past'], successCriteria=['Uses -ed for regular verbs', 'Uses went, had, saw, ate correctly', 'Asks questions with did'], vocabulary=['last weekend', 'yesterday', 'played', 'visited', 'watched', 'went', 'had', 'saw', 'ate'], grammar=['past simple regular (-ed)', 'common irregular past forms', 'questions with did'], functions=['telling what happened', 'asking about the past'], skills=['writing', 'reading'], examples=['What did you do last weekend?', 'I went to the beach.'])),
}
FX = {}
FXPATH = f'{REPO}/docs/benchmarks/language-teaching/20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl'
for l in open(FXPATH):
    c = json.loads(l); L = c.get('lessonDelivered')
    if L:
        key = {'A1': 'fx_a1', 'A2': 'fx_a2', 'B1': 'fx_b1'}[c['cefr']]
        FX.setdefault(key, L)
LESSONS = {**DEMO, **FX}
FIRST = {'P01': 'help me this lesson pls', 'P10': 'just tell me the answers', 'P06': 'I want learn this. help'}
def persona(o, p):
    belief = '' if p['id'] == 'P03' else f"Your current belief about this point: {o['belief']} Apply it in your answers unless what you are taught - by a tutor or by study material, it does not matter which - really changes your mind (see your profile). "
    return (f"You are role-playing an English learner in Egypt (first language Arabic), course level {o['cefr']}, learning English (sometimes in a chat with a tutor, sometimes from study material). "
            f"Write ONLY what the learner types; never mention being an AI or role-playing; keep each message under 25 words. "
            f"Your profile: {p['name']}. {p['text']} Your English: {p['language']}. Typical errors: {p['errors']}. Hints: {p['hints']}. "
            f"{belief}Do not pretend to understand if the explanation did not help you; you may ask for clarification, make mistakes, guess, or fail to learn.")
cases = []
for o in LO:
    L = LESSONS[o['lesson']]
    for p in P:
        cid = f"LOX-{o['id']}-{p['id']}"
        cohort = 'child' if o['cefr'] == 'A1' else ('adult' if o['lesson'].startswith('demo') else 'teen')
        cases.append({'id': cid, 'fixtureVersion': 'ltb-skills-v1', 'cohort': cohort, 'cefr': o['cefr'], 'caseType': 'LO_EXPERIMENT', 'lo': o['id'], 'profile': p['id'],
            'learner': {'ageBand': cohort, 'grade': {'child': 'Grade 4', 'teen': 'Grade 9', 'adult': None}[cohort], 'adultSchool': cohort == 'adult', 'knownLanguages': ['Arabic'], 'goal': f"Learn: {o['skill']}", 'priorEvidence': None},
            'lessonDelivered': {'title': L['title'], 'objective': L['objective'], 'spec': L['spec']},
            'learnerScript': [{'turn': 1, 'text': FIRST.get(p['id'], f"Can you help me practise this: {o['skill'].lower()}?"), 'target': 'request'}],
            'simLearner': {'persona': persona(o, p), 'turns': 8, 'model': 'claude-haiku-5-5'}})
with open(f'{OUT}/lo_cases.jsonl', 'w') as f:
    for c in cases: f.write(json.dumps(c, ensure_ascii=False) + '\n')
bank = {'outcomes': LO, 'profiles': P, 'forget': FORGET, 'staticMaterial': {k: {'title': v['title'], 'objective': v['objective'], 'spec': {kk: vv for kk, vv in v['spec'].items() if kk != 'items'}} for k, v in LESSONS.items()}}
json.dump(bank, open(f'{OUT}/lo_assessment_bank.json', 'w'), indent=1, ensure_ascii=False)
# leak scan: no accepted answer phrase (> 3 chars) may appear in any persona
leaks = []
for c in cases:
    o = next(x for x in LO if x['id'] == c['lo'])
    pers = c['simLearner']['persona'].lower()
    for st in ('pre', 'post', 'transfer', 'ret1', 'ret2'):
        for it in o[st]:
            for a in it['accepted']:
                if len(a) > 3 and f' {a.lower()} ' in f' {pers} ': leaks.append((c['id'], st, a))
h = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]
print(len(cases), 'cases; persona answer leaks:', leaks[:5], len(leaks), '; hashes', h(f'{OUT}/lo_cases.jsonl'), h(f'{OUT}/lo_assessment_bank.json'))
