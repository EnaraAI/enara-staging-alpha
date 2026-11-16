#!/usr/bin/env python3
# Learning-outcome simulation cases: 24 keyed lessons (grammar, vocabulary, reading), one simulated
# learner each, 6 tutor turns. Quiz items (quiz.py) are never shown to the tutor or in the lesson.
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lessons import L
from quiz import Q
OUT = sys.argv[1]
COH = ['child', 'teen', 'adult']
AGE = {'child': 'a 10-year-old', 'teen': 'a 15-year-old', 'adult': 'an adult'}
FIRST = {'A1': 'Exercise please.', 'A2': 'Can I have an exercise, please?', 'B1': 'Could you give me one exercise from this lesson?', 'B2': "I'd like to practise - could you give me a task from this lesson?"}
def persona(l, cohort):
    return (f"You are role-playing {AGE[cohort]} learner of English in Egypt (first language Arabic), level {l['cefr']}, in a chat with an English tutor. "
            f"Write ONLY what the learner types: short, at {l['cefr']} level, with the kind of mistakes such a learner makes; never mention being an AI or role-playing. "
            f"Your starting habit for this lesson: {Q[l['title']]['mis']}. When you answer an exercise, follow your habit unless the tutor has helped you understand why it is wrong; "
            f"just being told an answer is not understanding. Try exercises yourself first; if stuck, you may ask for a hint. Keep each message under 25 words.")
def with_text(near, transfer):
    # a "Same text/email/..." question carries the text it refers to (fix: v1 quiz omitted it)
    if not transfer.startswith('Same'): return transfer
    txt = near.split(' Question:')[0]
    return txt + ' ' + transfer.split('. ', 1)[1] if '. ' in transfer else txt + ' ' + transfer
out = []
for n, l in enumerate(L):
    if l['title'] not in Q: continue
    cohort = COH[n % 3]
    items = [{'id': x['id'], 'prompt': x['prompt'], **({'acceptedAnswers': x['acc']} if x['acc'] else {}), **({'targetForms': x['forms']} if x['forms'] and x['acc'] else {}), 'criteria': [1]} for x in l['items']]
    spec = {'objectives': [l['objective']], **{k: l[k] for k in ('successCriteria', 'vocabulary', 'grammar', 'functions', 'skills', 'examples') if l[k]}, 'items': items}
    cid = f"OUT-{l['skill'][:3].upper()}-{l['cefr']}-L{n:02d}"
    learner = {'ageBand': cohort, 'grade': {'child': 'Grade 4', 'teen': 'Grade 9', 'adult': None}[cohort], 'adultSchool': cohort == 'adult', 'knownLanguages': ['Arabic'], 'goal': f"Learn: {l['objective']}", 'priorEvidence': None}
    out.append({'id': cid, 'fixtureVersion': 'ltb-skills-v1', 'cohort': cohort, 'cefr': l['cefr'], 'caseType': 'OUTCOME_SIM', 'skill': l['skill'], 'learner': learner,
                'lessonDelivered': {'title': l['title'], 'objective': l['objective'], 'spec': spec},
                'learnerScript': [{'turn': 1, 'text': FIRST[l['cefr']], 'target': 'request'}],
                'simLearner': {'persona': persona(l, cohort), 'turns': 6, 'model': 'claude-haiku-5-5'},
                'quiz': {'near': {'prompt': Q[l['title']]['near'][0], 'acceptedAnswers': Q[l['title']]['near'][1]},
                         'transfer': {'prompt': with_text(Q[l['title']]['near'][0], Q[l['title']]['transfer'][0]), 'acceptedAnswers': Q[l['title']]['transfer'][1]}},
                'notes': {'objective': l['objective'], 'successCriteria': l['successCriteria'], 'examples': l['examples']}})
with open(OUT, 'w') as f:
    for c in out: f.write(json.dumps(c, ensure_ascii=False) + '\n')
print(len(out), 'outcome cases')
