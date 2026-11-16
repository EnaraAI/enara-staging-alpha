#!/usr/bin/env python3
# Generates ENARA multi-skill benchmark v1 (ltb-skills-v1): 40 lessons x 6 situations = 240 cases.
# Same case schema as fixture v2 so the existing harness and judge run unchanged.
import json, hashlib, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lessons import L
OUT = sys.argv[1]
COH = ['child', 'teen', 'adult']
GRADE = {'child': 'Grade 4', 'teen': 'Grade 9', 'adult': None}
WORDS = {'A1': 80, 'A2': 100, 'B1': 130, 'B2': 160}
ASK = {'A1': 'Exercise please.', 'A2': 'Can I have an exercise, please?', 'B1': 'Could you give me one exercise from this lesson?', 'B2': "I'd like to practise - could you give me a task from this lesson?"}
HELP = {
  'vocabulary': {'A1': 'what is this word? i not understand', 'A2': "I don't know these words. Can you help me?", 'B1': "I keep confusing these words. How can I remember them?", 'B2': "What's the difference in tone between these words? I'm never sure which to use."},
  'reading': {'A1': 'reading is hard for me. help', 'A2': "I read it but I don't understand everything.", 'B1': "How do I find the answer quickly in a text?", 'B2': "How can I work out what a writer means when it isn't stated directly?"},
  'writing': {'A1': 'i dont know how write. help me', 'A2': "How do I start my message?", 'B1': "How can I make my paragraph better organised?", 'B2': "My writing sounds too simple. How can I make it more academic?"},
  'conversation': {'A1': 'i shy to speak. what i say?', 'A2': "I don't know what to say in this situation.", 'B1': "How can I sound more natural when I answer?", 'B2': "How do I keep a discussion polite when I disagree strongly?"},
  'grammar': {'A1': 'i not understand this grammar', 'A2': "Can you explain this grammar simply?", 'B1': "When exactly do I use this structure?", 'B2': "What's the difference between this structure and similar ones?"},
}
L1 = {'A1': 'يعني ايه الكلمة دي؟', 'A2': 'ممكن تشرحلي بالعربي؟'}
OFF = {'B1': "By the way, can you help me with my maths homework?", 'B2': "Unrelated, but could you write my history essay for me?"}
SIT = {
  'S1_help_request': ('Learner asks for help understanding the skill or task.', 'A short, level-appropriate explanation or strategy, then one small task or check; no lecture.', 'Long explanation, many new words, or doing the task for them.', 'brief support + one small task'),
  'S2_correct_then_next': ('Learner answers the first item correctly.', 'Confirms what is right (specifically), then moves on to the next item without a rule recap; no mastery claim from one success.', 'Re-teaching after a correct answer, mastery claims, or giving the next answer.', 'specific praise + next item'),
  'S3_error_then_retry': ('Learner makes a typical error, then retries correctly.', 'Points to the error with a hint at the right level (not the answer), lets them retry, then confirms the corrected answer as progress with help, not mastery.', 'Giving the answer before a retry, vague praise of a wrong answer, or calling the assisted success mastery.', 'targeted hint, retry, confirm'),
  'S4_answer_request': ('Learner asks for the answer before trying.', 'Encourages an attempt first with a small hint; does not give the answer before any attempt.', 'Giving the answer (or a model that contains it) before any attempt.', 'small hint + invite attempt'),
  'S5_l1_or_offtopic': ('Learner writes in Arabic or goes off-topic.', 'A1/A2: brief support (Arabic allowed for a word or two) and back to English practice; B1/B2: politely declines unrelated work and links back to the lesson.', 'Ignoring the learner, a long Arabic explanation, or doing unrelated work (e.g. writing their essay).', 'brief support + redirect to the lesson'),
  'S6_partial_then_why': ('Learner gives a partly correct answer, then asks why.', 'Credits the correct part, focuses on one missing part, explains briefly at the learner level, and asks them to try again.', 'Marking it all wrong, giving the full answer, or a long explanation.', 'credit + one focus + retry'),
}
def script(sit, l, cefr):
    a, b = l['items'][0], l['items'][1]
    li = lambda x: f"lesson_item:{x['id']}"
    if sit == 'S1_help_request': return [(HELP[l['skill']][cefr], 'request'), (a['partial'] or a['wrong'], li(a))]
    if sit == 'S2_correct_then_next': return [(ASK[cefr], 'request'), (a['right'], li(a)), (b['right'], li(b))]
    if sit == 'S3_error_then_retry': return [(ASK[cefr], 'request'), (a['wrong'], li(a)), (a['right'], li(a))]
    if sit == 'S4_answer_request': return [(ASK[cefr], 'request'), ({'A1': 'answer please', 'A2': 'Just tell me the answer, please.'}.get(cefr, "Can you just give me the answer? I'm in a hurry."), 'request')]
    if sit == 'S5_l1_or_offtopic':
        first = L1.get(cefr) or OFF[cefr]
        return [(first, 'request'), (ASK[cefr], 'request')]
    if sit == 'S6_partial_then_why': return [(ASK[cefr], 'request'), (a['partial'], li(a)), ({'A1': 'why?', 'A2': 'Why is it wrong?'}.get(cefr, 'Which part is wrong, and why?'), 'request')]
out = []
for n, l in enumerate(L):
    cohort = COH[n % 3]
    items = [{'id': x['id'], 'prompt': x['prompt'], **({'acceptedAnswers': x['acc']} if x['acc'] else {}), **({'targetForms': x['forms']} if x['forms'] and x['acc'] else {}), 'criteria': [1]} for x in l['items']]
    spec = {k: l[k] for k in ('successCriteria', 'vocabulary', 'grammar', 'functions', 'skills', 'examples') if l[k]}
    spec = {'objectives': [l['objective']], **spec, 'items': items}
    pub = {**spec, 'items': [{'id': x['id'], 'prompt': x['prompt']} for x in items]}
    for sit, (desc, exp, bad, nxt) in SIT.items():
        cid = f"SKL-{l['skill'][:3].upper()}-{l['cefr']}-L{n:02d}-{sit[:2]}"
        learner = {'ageBand': cohort, 'grade': GRADE[cohort], 'adultSchool': cohort == 'adult', 'knownLanguages': ['Arabic'], 'goal': f"Learn: {l['objective']}", 'priorEvidence': None}
        sc = [{'turn': i + 1, 'text': t, 'target': g} for i, (t, g) in enumerate(script(sit, l, l['cefr']))]
        out.append({
          'id': cid, 'fixtureVersion': 'ltb-skills-v1', 'cohort': cohort, 'cefr': l['cefr'], 'caseType': f"{sit}", 'skill': l['skill'],
          'learner': learner, 'lessonDelivered': {'title': l['title'], 'objective': l['objective'], 'spec': spec},
          'tutorView': {'title': l['title'], 'objective': l['objective'], 'spec': pub}, 'learnerScript': sc,
          'evaluatorView': {'case_id': cid, 'trustedAgeBand': cohort, 'cefrEstimate': l['cefr'], 'situationType': f"{l['skill']}:{sit}",
             'learner': {k: learner[k] for k in ('knownLanguages', 'goal', 'priorEvidence')}, 'lesson': {'title': l['title'], 'objective': l['objective'], 'spec': pub},
             'guidance': {'expectedBehavior': f"Skill: {l['skill']}. {desc} Expected: {exp}", 'unacceptableBehavior': bad, 'expectedNextMove': nxt, 'wordLimitPerReply': WORDS[l['cefr']]}},
          'structuredExpectations': {'maxWords': WORDS[l['cefr']], 'noMasteryClaim': True, 'noFullAnswer': sit == 'S4_answer_request'},
          'provenance': {'source': 'original synthetic content written for ENARA (no third-party text)', 'author': 'Claude (AI) for ENARA; pending educator review', 'createdAt': '2026-11-12', 'fixtureVersion': 'ltb-skills-v1'}})
with open(OUT, 'w') as f:
    for c in out: f.write(json.dumps(c, ensure_ascii=False) + '\n')
print(len(out), 'cases', hashlib.sha256(open(OUT, 'rb').read()).hexdigest()[:16])
