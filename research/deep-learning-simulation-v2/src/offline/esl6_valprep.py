# SIMULATION ONLY. NO API.
# Builds the ESL6 validation inputs in reports/exp4/agent_sim_esl6/validation/ (adapted from esl5_valprep.py; rules config/agent_sim_esl6/LEARNING_RULES.md):
#   cases_mixed.json   240 hand-templated tutor turns, 120 P+-style + 120 ENARA-style (ESL5 round-2 style definitions), 8 per outcome over the
#                      30 outcomes with >= 1 wrong belief (GAP outcomes excluded), sessions 1 and 2;
#   scripted_order.json scripted tutors a-d (same meaning as ESL5), 30 learners (one per outcome) x 4 turns, session 1;
#   noise_cases.json + noise_run1_input.json / noise_run2_input.json   2-session scripted recall tutor, 30 learners, to be judged twice (noise check);
#   FORGET_CHECK.json  forgetting check computed now, deterministically, with esl6_forget.py (reference events, no judge);
#   VAL_KEY.json (NOT for judges), judgeA_input.json / judgeB_input.json (identical cases, own shuffle) + judgeA/ judgeB/ batch files.
#   python3 src/offline/esl6_valprep.py
import json, os, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import esl6_forget as F  # noqa: E402
from esl6_outcomes import OUTCOMES, GAP  # noqa: E402

ROOT = F.ROOT
OUT = os.path.join(ROOT, 'reports/exp4/agent_sim_esl6/validation')
PER_BATCH = 36
HDR = 'SIMULATION ONLY'
NS = 'esl6-val'

# ------------------------------------------------------------------------------------------------ selection check (LEARNING_RULES 1b)
_outs = json.load(open(os.path.join(ROOT, '..', '..', 'data/outcomes/outcomes.json')))
_outs = _outs if isinstance(_outs, list) else _outs.get('outcomes', _outs)
_stat = json.load(open(os.path.join(ROOT, '..', 'assessment-review/a1a2/OUTCOME_STATUS.json')))
_sel = [o for o in _outs if o.get('level') == 'form' and o.get('cefr') in ('A1', 'A2') and o.get('lessonIds') and _stat.get(o['id'], {}).get('status') == 'passed_review_draft']
assert len(_sel) == 33, len(_sel)
assert sorted(o['id'] for o in _sel if not o.get('l1ErrorTypes')) == sorted(GAP)
assert sorted(o['id'] for o in _sel if o.get('l1ErrorTypes')) == sorted(x['id'] for x in OUTCOMES)
OB = {o['key']: o for o in OUTCOMES}


def fmt(x): return str(int(x)) if abs(x - round(x)) < 1e-9 else f'{x:.3f}'.rstrip('0')


def new_state(o, band, primary):
    k = F.initial_state(o['key'], band, primary, o['ws'])
    if o['sec1']: k['sec1'] = o['sec1']
    return k


def state_text(k, session, earlier=None):
    o = OB[k['form']]; s = k['s']
    lines = [f"Target form: {o['id']} ({o['topic']}). Learner level {k['band']}. First language Arabic.",
             f"Session {session}." + (' This is 2 days after session 1; the forgetting rule has run, so strengths may be non-whole (LEARNING_RULES 2a, 6).' if session == 2 else '')]
    for w in o['ws']: lines.append(f"{w} (wrong) strength {fmt(s[w])}: {o['W'][w]}. Its error: {o['E'][w]}.")
    for w in o['ws']:
        c = F.PAIR[w]; lines.append(f"{c} (correct) strength {fmt(s[c])}: {o['C'][c]}. Independent correct productions so far: {k['indep'][c]}.")
    if len(o['ws']) == 1: lines.append('This outcome has one wrong belief only (no W2, no C2).')
    if session == 2 and earlier: lines.append('Items this learner answered in session 1: ' + ' | '.join(f'"{e}"' for e in earlier))
    return '\n'.join(lines)


def fact_line(p, o):
    if not p or p['kind'] in ('none', 'rule'): return 'FACT: the last learner message did not produce the form (no exercise answer or sentence).'
    if p.get('correct'): return 'FACT: the last learner message produced the form CORRECTLY.'
    return f"FACT: the last learner message contained the error of {p['fired']} ({o['E'][p['fired']]})."


def judge_text(k, session, prev, prod, learner, tutor, earlier=None):
    o = OB[k['form']]
    return (f"KNOWLEDGE STATE (before this tutor turn):\n{state_text(k, session, earlier)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n"
            f"{prev if prev else '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n{learner}\n{fact_line(prod, o)}\n\nTUTOR TURN TO JUDGE:\n{tutor}")


def hello(o, session): return f"Hello! Can you give me an exercise on {o['topic']}?" if session == 1 else f"Hello again! Can we practise {o['topic']} again today?"
def strip_tail(p): return p.replace(' (answer with only the missing word)', '').replace(' (answer with only the verb)', '').replace(' (write the whole sentence)', '')
def rule_plain(o): return o['rule'].replace('Rule: ', '', 1)
def pair(o, w): r, x = o['contrast'][w]; return f'Right: {r} Wrong: {x}'


def prod_of(item, fired, kind='blank'):
    prompt, corr, errs = item
    return ({'kind': kind, 'correct': True, 'text': corr} if fired is None else {'kind': kind, 'correct': False, 'fired': fired, 'text': errs[fired]})


KEY = {}


# ------------------------------------------------------------------------------------------------ 1. mixed P+-style / ENARA-style cases
def perturbed(o, band, primary, seed):
    """A plausible end-of-session-1 state: wrong beliefs lowered by 0-2 steps, correct beliefs raised 0-2, independent counts 0-1."""
    k = new_state(o, band, primary)
    for w in o['ws']:
        c = F.PAIR[w]; dw = int(F.rand(seed, 'dw', w) * 3); dc = int(F.rand(seed, 'dc', c) * 3)
        k['s'][w] = max(0, k['s'][w] - dw); k['s'][c] = min(3, k['s'][c] + dc); k['indep'][c] = 1 if (dc and F.rand(seed, 'i', c) < 0.4) else 0
    return k


def s2_state(o, band, primary, seed):
    return F.f1_gap(perturbed(o, band, primary, seed), F.DAYS_GAP)


# each template: (style, name, allowed sessions, builder(o, w, s) -> (prev, learner, prod, tutor, reference events, reference retrieval, area))
def T_P1(o, w, s):
    B = o['blank']
    return (None, None, {'kind': 'none', 'text': ''}, f"Hello! Let's practise {o['topic']}. {rule_plain(o)}\nFor example: \"{o['contrast'][o['ws'][0]][0]}\"\nNow you:\n{B[0][0]}",
            [{'rule': 'R1', 'belief': x} for x in o['ws']], [], 'rule line at session start (4c/4d)')
def T_P2(o, w, s):
    B = o['blank']; r, x = o['contrast'][w]
    return (B[0][0], B[0][2][w], prod_of(B[0], w), f'Good try, but not quite. We say "{r}", not "{x}".\nLet\'s try another one:\n{B[1][0]}', [{'rule': 'R2', 'belief': w}], [], 'pair on the learner\'s error + new item')
def T_P3(o, w, s):
    B = o['blank']
    return (B[0][0], B[0][2][w], prod_of(B[0], w), f"Hmm, look at {o['look']} again. What do you notice? Try again.", [], [], '4d question hint')
def T_P4(o, w, s):
    B = o['blank']; r, x = o['contrast'][w]; prev = f'Good try, but not quite. We say "{r}", not "{x}".\nLet\'s try another one:\n{B[1][0]}'
    return (prev, B[1][1], prod_of(B[1], None), f'Yes! "{B[1][1]}" is right. Well done.\nNext one:\n{B[2][0]}',
            [{'rule': r_, 'belief': F.PAIR[x_]} for x_ in o['ws'] for r_ in ('R3', 'R4')], [], 'R3 + R4: new item after a pair on another sentence (4b)')
def T_P5(o, w, s):
    B = o['blank']; prev = f"Hmm, look at {o['look']} again. What do you notice? Try again."
    return (prev, B[0][1], prod_of(B[0], None), f'Great, that is correct now! Next:\n{B[1][0]}', [{'rule': 'R3', 'belief': F.PAIR[x]} for x in o['ws']], [], 'retry of the same item: R3, no R4 (4b check 1)')
def T_P6(o, w, s):
    S = o['sent']
    return (S[1][0], S[1][2][w], prod_of(S[1], w, 'sentence'), f'Good sentence! Now try this one: {S[2][0]}', [{'rule': 'R7', 'belief': w}], [], 'R7 false confirmation of an own sentence')
def T_P7(o, w, s):
    S = o['sent']
    return (S[1][0], S[1][1], prod_of(S[1], None, 'sentence'), f'Lovely sentence! Can you write one more? {S[2][0]}',
            [{'rule': r_, 'belief': F.PAIR[x]} for x in o['ws'] for r_ in ('R3', 'R4')], [], 'own sentence correct: R3 + R4 (5b)')
def T_P8(o, w, s):
    B = o['blank']; S = o['sent']
    return (B[2][0], B[2][2][w], prod_of(B[2], w), f'The answer is: "{B[2][1]}". Let\'s move on. {S[0][0]}', [{'rule': 'R5', 'belief': '-'}], [], 'answer given only: R5')
def T_P9(o, w, s):
    return (None, None, {'kind': 'none', 'text': ''}, f"Welcome back! Let's start with a short exercise.\n{o['blank'][1][0]}", [], [], 'session-2 opener, no event')
def T_E1(o, w, s):
    B = o['blank']
    return (None, None, {'kind': 'none', 'text': ''}, f"{o['rule']}\n{pair(o, w)}\nYour turn. {B[0][0]}",
            [{'rule': 'R1', 'belief': x} for x in o['ws']] + [{'rule': 'R2', 'belief': w}], [], 'rule line + contrast at start')
def T_E2(o, w, s):
    B = o['blank']
    return (B[0][0], B[0][2][w], prod_of(B[0], w), f"Not yet. Look at {o['look']}.\nTry again: {strip_tail(B[0][0])}", [], [], '4d look-hint')
def T_E3(o, w, s):
    B = o['blank']; prev = f"Not yet. Look at {o['look']}.\nTry again: {strip_tail(B[0][0])}"
    return (prev, B[0][2][w], prod_of(B[0], w), f"That was two tries, so here is the answer: \"{B[0][1]}\". {o['rule']}\n{pair(o, w)}\nNew one: {B[1][0]}",
            [{'rule': 'R5', 'belief': '-'}] + [{'rule': 'R1', 'belief': x} for x in o['ws']] + [{'rule': 'R2', 'belief': w}], [], '5a release: R5 + R1 + R2')
def T_E4(o, w, s):
    B = o['blank']; S = o['sent']; prev = f"That was two tries, so here is the answer: \"{B[0][1]}\". {o['rule']}\n{pair(o, w)}\nNew one: {B[1][0]}"
    return (prev, B[1][1], prod_of(B[1], None), f'Correct: "{B[1][1]}".\nNow write one sentence of your own. {S[0][0]}',
            [{'rule': r_, 'belief': F.PAIR[x]} for x in o['ws'] for r_ in ('R3', 'R4')], [], '5a new item after release: R3 + R4')
def T_E5(o, w, s):
    return (None, None, {'kind': 'none', 'text': ''}, f"Welcome back! Remember last time? Fill in again: {o['blank'][0][0]}", [], [], '5b recall item asked: no effect')
def T_E6(o, w, s):
    B = o['blank']; prev = f"Welcome back! Remember last time? Fill in again: {B[0][0]}"
    return (prev, B[0][1], prod_of(B[0], None), f'Right: "{B[0][1]}". Well remembered.\nNew one, no help: {B[2][0]}',
            [{'rule': 'R3', 'belief': F.PAIR[x]} for x in o['ws']], [F.PAIR[x] for x in o['ws']], '5b recall answered correctly: R3, no R4 (earlier-session item), retrieval')
def T_E7(o, w, s):
    B = o['blank']; prev = f"Welcome back! Remember last time? Fill in again: {B[0][0]}"
    return (prev, B[0][2][w], prod_of(B[0], w), f"Not yet. {pair(o, w)}\nTry again: {strip_tail(B[0][0])}",
            [{'rule': 'R2', 'belief': w}], [F.PAIR[x] for x in o['ws']], '5b recall answered wrongly: R2, retrieval still counts')
def T_E8(o, w, s):
    B = o['blank']; S = o['sent']; prev = f"Welcome back! Remember: \"{B[0][1]}\" is the answer here. Fill in: {B[0][0]}"
    return (prev, B[0][1], prod_of(B[0], None), f'Yes, well done.\n{S[1][0]}', [{'rule': 'R3', 'belief': F.PAIR[x]} for x in o['ws']], [], '5b settled recall: R3 only, no R4, no retrieval')
def T_E9(o, w, s):
    B = o['blank']; S = o['sent']
    return (S[1][0], S[1][1], prod_of(S[1], None, 'sentence'), f'Good: "{S[1][1]}".\nQuick check, no hints: {B[2][0]}',
            [{'rule': r_, 'belief': F.PAIR[x]} for x in o['ws'] for r_ in ('R3', 'R4')], [], 'own sentence: R3 + R4')

PPLUS = [('P1', T_P1, (1,)), ('P2', T_P2, (1, 2)), ('P3', T_P3, (1, 2)), ('P4', T_P4, (1, 2)), ('P5', T_P5, (1, 2)), ('P6', T_P6, (1, 2)), ('P7', T_P7, (1, 2)), ('P8', T_P8, (1, 2)), ('P9', T_P9, (2,))]
ENARA = [('E1', T_E1, (1,)), ('E2', T_E2, (1, 2)), ('E3', T_E3, (1, 2)), ('E4', T_E4, (1, 2)), ('E9', T_E9, (1, 2)), ('E5', T_E5, (2,)), ('E6', T_E6, (2,)), ('E7', T_E7, (2,)), ('E8', T_E8, (2,))]

mixed = []
for i, o in enumerate(OUTCOMES):
    for style, tmpls in (('pplus', PPLUS), ('enara', ENARA)):
        for j in range(4):
            name, fn, sess_ok = tmpls[(i * 2 + j * 2 + (1 if style == 'enara' else 0) + j // 2) % len(tmpls)]
            seed = f'{NS}|mixed|{o["key"]}|{style}|{j}'
            sess = sess_ok[0] if len(sess_ok) == 1 else 1 + (i + j) % 2
            band = 'A1' if F.rand(seed, 'band') < 0.5 else 'A2'; primary = o['ws'][int(F.rand(seed, 'prim') * len(o['ws']))]
            w = o['ws'][int(F.rand(seed, 'w') * len(o['ws']))]
            k = perturbed(o, band, primary, seed) if sess == 1 else s2_state(o, band, primary, seed)
            if w not in o['ws'] or (k['s'][w] < 0.5 and name in ('P2', 'P3', 'P6', 'P8', 'E2', 'E3', 'E7')): k['s'][w] = max(k['s'][w], 1)  # an error that fired needs a live W
            prev, learner, prod, tutor, ev, retr, area = fn(o, w, sess)
            msg = learner if learner is not None else hello(o, sess)
            earlier = [o['blank'][0][0], o['sent'][0][0]] if sess == 2 else None
            cid = 'w' + F.sha(f'{NS}|mixed|{o["key"]}|{style}|{j}')[:10]
            mixed.append({'id': cid, 'session': sess, 'form': o['key'], 'text': judge_text(k, sess, prev, prod, msg, tutor, earlier)})
            KEY[cid] = {'source': 'mixed', 'session': sess, 'style': style, 'template': name, 'outcome': o['id'], 'area': area, 'prevState': k, 'production': prod,
                        'referenceEvents': ev, 'referenceRetrieval': retr}

# ------------------------------------------------------------------------------------------------ 2. scripted tutors a-d (ESL5 meaning), session 1
CHAT = ['Hi! How are you today? What did you do this weekend?', 'That sounds nice. Do you like music?', 'Great. What is your favourite food?', 'Thanks for chatting with me today!']


def examples(o): return [o['contrast'][o['ws'][0]][0]] + [x[1] for x in o['sent']]


def scripted_tutor(kind, o, k, turn, last):
    if kind == 'a': return CHAT[turn - 1]
    if kind == 'b': return ('Here is an example: ' if turn == 1 else 'Next example: ') + f'"{examples(o)[turn - 1]}"'
    if kind == 'c': return o['rule'] if turn == 1 else ['OK, thank you for listening.', 'Do you have any questions?', 'Good luck with your English!'][turn - 2]
    if turn == 1: return f"{o['rule']}\n\nLook at this pair. {pair(o, k['primary'])}\n\nNow write one sentence of your own. {o['sent'][0][0]}"
    fb = 'Yes, that is correct. Well done.' if last.get('correct') else f"Not quite. {pair(o, last.get('fired') or k['primary'])}"
    return f"{fb}\n\n{o['sent'][turn - 1][0]}" if turn <= 3 else fb


def ref_scripted(kind, o, k, turn, last):
    """Reference events + next item, used ONLY to draw the fixed learner replies (and the reference order check); judges' own events are scored."""
    if kind == 'a': return [], None
    if kind == 'b': return [{'rule': 'R5', 'belief': '-'}], None
    if kind == 'c': return ([{'rule': 'R1', 'belief': w} for w in o['ws']] if turn == 1 else []), None
    if turn == 1: ev = [{'rule': 'R1', 'belief': w} for w in o['ws']] + [{'rule': 'R2', 'belief': k['primary']}]
    elif last.get('correct'): ev = [{'rule': r, 'belief': F.PAIR[w]} for w in o['ws'] for r in ('R3', 'R4')]
    else: ev = [{'rule': 'R2', 'belief': last['fired']}]
    return ev, (o['sent'][turn - 1] if turn <= 3 else None)


def reply(k, item, seed, label, kind='sentence'):
    if not item: return {'kind': 'none', 'text': 'OK. Can I have an exercise, please?'}
    return prod_of(item, F.produce(k, k['ws'], seed, 'prod', label, item[0]), kind)


scripted = []; ref_order = {}
for i, o in enumerate(OUTCOMES):
    band = 'A1' if i % 2 == 0 else 'A2'; primary = o['ws'][(i // 2) % len(o['ws'])]
    for t in 'abcd':
        sid = f'o{i:02d}_{t}'; seed = f'{NS}|L{i}|{t}'; st = new_state(o, band, primary); start = st
        learner = hello(o, 1); prod = {'kind': 'none', 'text': ''}; prev = None
        for turn in range(1, 5):
            tutor = scripted_tutor(t, o, st, turn, prod)
            cid = 'w' + F.sha(f'{NS}|scripted|{sid}|{turn}')[:10]
            scripted.append({'id': cid, 'session': 1, 'form': o['key'], 'text': judge_text(st, 1, prev, prod, learner, tutor)})
            ev, item = ref_scripted(t, o, st, turn, prod)
            KEY[cid] = {'source': 'scripted', 'session': 1, 'outcome': o['id'], 'chain': {'id': sid, 'kind': 'order', 'tutor': t, 'step': turn, 'gapBefore': 0}, 'startState': start,
                        'prevState': st, 'production': prod, 'referenceEvents': ev, 'referenceRetrieval': []}
            st, _, _ = F.apply_events(st, ev, prod, 1)
            prod = reply(st, item, seed, turn + 1); learner = prod['text']; prev = tutor
        ref_order.setdefault(t, []).append(F.expected_acc(st))

# ------------------------------------------------------------------------------------------------ 3. forgetting check (deterministic, reference events) and noise-check transcripts


def run_forget(o, band, primary, arm, seed, design='light'):
    """Two scripted tutors over 2 sessions (session 2 at day 2). Learner dice are keyed by item label, so shared turns draw the same dice in both arms.
    design 'light' (COUNTED): session 1 = rule + pair + item B0, feedback.  Session 2: (a) rule + pair again, no item, closing;
                              (b) the same, preceded by a recall item (B0, answered in session 1) whose feedback opens the rule turn.
    design 'full' (sensitivity only): session 1 = rule+pair+S0, fb+S1, fb+S2, fb+B0, fb; session 2 = rule+pair+B1, fb+B2, fb (+ the same recall item in b).
    Returns (turn rows, end state, start state)."""
    st = new_state(o, band, primary); start = st; rows = []; prod = {'kind': 'none', 'text': ''}; prev = None; learner = hello(o, 1)
    S, B = o['sent'], o['blank']; ALLW = [{'rule': 'R1', 'belief': w} for w in o['ws']] + [{'rule': 'R2', 'belief': primary}]
    def fb(p): return 'Yes, that is correct. Well done.' if p.get('correct') else f"Not quite. {pair(o, p['fired'])}"
    def fb_ev(p): return [{'rule': r, 'belief': F.PAIR[w]} for w in o['ws'] for r in ('R3', 'R4')] if p.get('correct') else [{'rule': 'R2', 'belief': p['fired']}]
    def recall_head(p): return f'Right: "{B[0][1]}". Well remembered.' if p.get('correct') else f'The answer is "{B[0][1]}".'
    def recall_ev(p): return [{'rule': 'R3', 'belief': F.PAIR[w]} for w in o['ws']] if p.get('correct') else [{'rule': 'R5', 'belief': '-'}]
    rule_pair = f"{o['rule']}\n{pair(o, primary)}"
    if design == 'full':
        plan1 = [(lambda p: f"{rule_pair}\n\nNow write one sentence of your own. {S[0][0]}", lambda p: ALLW, (S[0], 'sentence', 's1S0')),
                 (lambda p: f"{fb(p)}\n\n{S[1][0]}", fb_ev, (S[1], 'sentence', 's1S1')),
                 (lambda p: f"{fb(p)}\n\n{S[2][0]}", fb_ev, (S[2], 'sentence', 's1S2')),
                 (lambda p: f"{fb(p)}\n\nFill in: {B[0][0]}", fb_ev, (B[0], 'blank', 's1B0')),
                 (lambda p: fb(p), fb_ev, None)]
        tail2 = (f"Fill in: {B[1][0]}", (B[1], 'blank', 's2B1'))
        rest2 = [(lambda p: f"{fb(p)}\n\nFill in: {B[2][0]}", fb_ev, (B[2], 'blank', 's2B2')), (lambda p: fb(p), fb_ev, None)]
    else:
        plan1 = [(lambda p: f"{rule_pair}\n\nYour turn. {B[0][0]}", lambda p: ALLW, (B[0], 'blank', 's1B0')),
                 (lambda p: f"{fb(p)}\n\nThat is all for today. See you next time!", fb_ev, None)]
        tail2 = ('Do you have any questions about this rule?', None)
        rest2 = [(lambda p: 'Good luck with your English! See you next time.', lambda p: [], None)]
    plan2 = []
    if arm == 'b':
        plan2.append((lambda p: 'Welcome back! Remember last time? Fill in again: ' + B[0][0], lambda p: [], (B[0], 'blank', 's2recall')))
        plan2.append((lambda p: f"{recall_head(p)}\n{rule_pair}\n{tail2[0]}", lambda p: recall_ev(p) + ALLW, tail2[1]))
    else:
        plan2.append((lambda p: f"Welcome back! Today we look at the rule again.\n{rule_pair}\n{tail2[0]}", lambda p: ALLW, tail2[1]))
    plan2 += rest2
    step = 0
    for session, plan in ((1, plan1), (2, plan2)):
        if session == 2:
            st = F.f1_gap(st, F.DAYS_GAP); prod = {'kind': 'none', 'text': ''}; prev = None; learner = hello(o, 2)
        for n, (tut, evf, item) in enumerate(plan):
            step += 1
            tutor = tut(prod); ev = evf(prod)
            retr = [F.PAIR[w] for w in o['ws']] if (arm == 'b' and session == 2 and n == 1 and prod.get('kind') in ('blank', 'sentence')) else []
            rows.append({'session': session, 'step': step, 'gapBefore': F.DAYS_GAP if (session == 2 and n == 0) else 0, 'prevState': st, 'production': prod, 'prev': prev,
                         'learner': learner, 'tutor': tutor, 'referenceEvents': ev, 'referenceRetrieval': retr, 'earlier': [B[0][0]] + ([x[0] for x in S] if design == 'full' else []) if session == 2 else None})
            st, _, _ = F.apply_events(st, ev, prod, session, retr)
            if item: prod = prod_of(item[0], F.produce(st, st['ws'], seed, 'prod', item[2], item[0][0]), item[1]); learner = prod['text']
            else: prod = {'kind': 'none', 'text': 'OK. Can I have an exercise, please?'}; learner = prod['text']
            prev = tutor
    return rows, st, start


def mean(xs): return sum(xs) / len(xs)
# where can retrieval change the delayed score at all? one wrong belief, removed (R4 reset) vs lowered to 0 and not removed, C at the end of session 2
WINDOW = []
for removed_ in (True, False):
    for c_end in (1.0, 1.5, 2.0, 2.5, 3.0):
        row = {'W1': 'removed (R4 reset)' if removed_ else 'lowered to 0 from 3, not removed', 'C1_end': c_end}
        for r_ in (0, 1):
            k_ = F.initial_state('x', 'A1', 'W1', ['W1']); k_['s'].update({'W1': 0, 'C1': c_end}); k_['indep']['C1'] = 2 if removed_ else 1; k_['retr']['C1'] = [2] if r_ else []; k_['afterF1'] = True
            d_ = F.f1_gap(k_, F.DAYS_DELAY); row[f'r{r_}'] = {'C1_day7': d_['s']['C1'], 'W1_day7': d_['s']['W1'], 'pError': F.item_error_prob(d_, 'W1')}
        WINDOW.append(row)
FORGET = {}; forget_rows = []
for design in ('light', 'full'):
    forget = {'a': [], 'b': []}
    for i, o in enumerate(OUTCOMES):
        for band in ('A1', 'A2'):
            primary = o['ws'][i % len(o['ws'])]
            for arm in 'ab':
                rows, end, start = run_forget(o, band, primary, arm, f'{NS}|forget|{o["key"]}|{band}', design)
                pt = F.post_tests(end)
                forget[arm].append({'outcome': o['id'], 'band': band, 'immediate': round(pt['immediate']['expected'], 6), 'delayed': round(pt['delayed']['expected'], 6),
                                    'wrongAtZeroImm': pt['immediate']['wrongAtZero'], 'wrongAtZeroDelayed': pt['delayed']['wrongAtZero'], 'r': {c: F.r_of(end, c) for c in ('C1', 'C2')},
                                    'endState': end['s'], 'delayedState': pt['delayed']['state']})
                if design == 'light' and arm == 'b' and band == ('A1' if i % 2 == 0 else 'A2'): forget_rows.append((i, o, rows, start))
    FG = {arm: {'n': len(v), 'immediate': round(mean([x['immediate'] for x in v]), 4), 'delayed': round(mean([x['delayed'] for x in v]), 4)} for arm, v in forget.items()}
    D = {'delayed_b_minus_a': round(FG['b']['delayed'] - FG['a']['delayed'], 4), 'immediate_b_minus_a': round(FG['b']['immediate'] - FG['a']['immediate'], 4)}
    FORGET[design] = {'means': FG, 'diff': D, 'pass': {'delayed_b_gt_a': D['delayed_b_minus_a'] > 0, 'immediate_abs_diff_le_0.03': abs(D['immediate_b_minus_a']) <= 0.03},
                      'learnersWithDelayedDiff': sum(1 for x, y in zip(forget['a'], forget['b']) if abs(y['delayed'] - x['delayed']) > 1e-9), 'perLearner': forget}

noise = []
for i, o, rows, start in forget_rows:
    sid = f'n{i:02d}'
    for r in rows:
        cid = 'n' + F.sha(f'{NS}|noise|{sid}|{r["step"]}')[:10]
        noise.append({'id': cid, 'session': r['session'], 'form': o['key'], 'text': judge_text(r['prevState'], r['session'], r['prev'], r['production'], r['learner'], r['tutor'], r['earlier'])})
        KEY[cid] = {'source': 'noise', 'session': r['session'], 'outcome': o['id'], 'chain': {'id': sid, 'kind': 'noise', 'tutor': 'forget_b', 'step': r['step'], 'gapBefore': r['gapBefore']},
                    'startState': start, 'prevState': r['prevState'], 'production': r['production'], 'referenceEvents': r['referenceEvents'], 'referenceRetrieval': r['referenceRetrieval']}

# ------------------------------------------------------------------------------------------------ write
os.makedirs(OUT, exist_ok=True)
def dump(name, obj): json.dump(obj, open(os.path.join(OUT, name), 'w'), indent=1, ensure_ascii=False)
dump('cases_mixed.json', {'note': HDR, 'source': '240 templated tutor turns: 120 P+-style + 120 ENARA-style (ESL5 round-2 style definitions), 30 outcomes x 8, sessions 1 and 2; blind', 'cases': mixed})
dump('scripted_order.json', {'note': HDR, 'source': 'scripted tutors a-d (ESL5 meaning), 30 learners (one per outcome) x 4 turns, session 1; fixed transcripts', 'cases': scripted})
dump('noise_cases.json', {'note': HDR, 'source': 'scripted 2-session recall tutor (forgetting arm b), 30 learners (one per outcome); judged twice for the noise check; not part of the agreement set', 'cases': noise})
dump('VAL_KEY.json', {'note': HDR + '. NOT FOR JUDGES. Source, style/template, state before the turn, production fact, reference events, chains, for esl6_valscore.py.', 'cases': KEY})
dump('FORGET_CHECK.json', {'note': HDR + '. Computed deterministically by esl6_valprep.py with esl6_forget.py and reference events (no judge).',
                           'learners': '60 (30 outcomes x A1/A2), same learners and dice in both arms; immediate = end of session 2 (2a applies), delayed = after 7 days of F1',
                           'counted': 'full', 'designs': {'full': 'COUNTED. Scripted tutor d content. s1: rule+pair + 3 own sentences + item B0, feedback each; s2 (a): rule+pair + new items B1, B2 with feedback; s2 (b): recall item B0 (answered in s1) first, then the same.',
                                                            'light': 'sensitivity only (lower teaching dose, to rule out a ceiling explanation). s1: rule+pair+item B0, feedback. s2 (a): rule+pair, no item. s2 (b): recall item B0 first, then the same.'},
                           'mechanism': WINDOW,
                           'rule': 'pass iff delayed mean (b) > (a) and |immediate mean (b) - (a)| <= 0.03', **{d: FORGET[d] for d in FORGET}})
dump('ORDER_REFERENCE.json', {'note': HDR + '. Order check with the reference events (what a judge following the rules should give); the counted check uses each judge\'s events.',
                              'meanExpectedPerTutor': {t: round(mean(v), 4) for t, v in sorted(ref_order.items())}})

allc = mixed + scripted
for J in ('A', 'B'):
    order = sorted(allc, key=lambda c: F.sha(f'{NS}-shuffle|{J}|{c["id"]}'))
    d = os.path.join(OUT, f'judge{J}'); os.makedirs(d, exist_ok=True); batches = []
    for n in range(0, len(order), PER_BATCH):
        chunk = order[n:n + PER_BATCH]; b = f'v6{J}_j{n // PER_BATCH + 1:02d}'
        with open(os.path.join(d, f'{b}.md'), 'w') as fh:
            fh.write(f'# SIMULATION ONLY\n\nBatch {b}. Judge every case with JUDGE_INSTRUCTIONS.md and the ESL6 LEARNING_RULES.md. Write {{"batch":"{b}","cases":{{...}}}} to the file named in your task.\n'
                     + ''.join(f"\n=========== CASE {c['id']} ===========\n{c['text']}\n" for c in chunk))
        batches.append({'batch': b, 'ids': [c['id'] for c in chunk]})
    dump(f'judge{J}_input.json', {'note': HDR, 'judge': J, 'shuffleSeed': f'{NS}-shuffle|{J}', 'perBatch': PER_BATCH, 'batchDir': f'judge{J}', 'batches': batches, 'cases': [{'id': c['id'], 'text': c['text']} for c in order]})
for R in (1, 2):
    order = sorted(noise, key=lambda c: F.sha(f'{NS}-noise-shuffle|run{R}|{c["id"]}'))
    d = os.path.join(OUT, f'noise_run{R}'); os.makedirs(d, exist_ok=True); batches = []
    for n in range(0, len(order), PER_BATCH):
        chunk = order[n:n + PER_BATCH]; b = f'n6r{R}_j{n // PER_BATCH + 1:02d}'
        with open(os.path.join(d, f'{b}.md'), 'w') as fh:
            fh.write(f'# SIMULATION ONLY\n\nBatch {b}. Judge every case with JUDGE_INSTRUCTIONS.md and the ESL6 LEARNING_RULES.md. Write {{"batch":"{b}","cases":{{...}}}} to the file named in your task.\n'
                     + ''.join(f"\n=========== CASE {c['id']} ===========\n{c['text']}\n" for c in chunk))
        batches.append({'batch': b, 'ids': [c['id'] for c in chunk]})
    dump(f'noise_run{R}_input.json', {'note': HDR, 'run': R, 'shuffleSeed': f'{NS}-noise-shuffle|run{R}', 'perBatch': PER_BATCH, 'batchDir': f'noise_run{R}', 'batches': batches, 'cases': [{'id': c['id'], 'text': c['text']} for c in order]})

print('mixed', len(mixed), dict(Counter((KEY[c['id']]['style'], c['session']) for c in mixed)), 'session2', sum(c['session'] == 2 for c in mixed))
print('templates', dict(Counter(KEY[c['id']]['template'] for c in mixed)))
print('scripted', len(scripted), 'judge total', len(allc), 'batches/judge', -(-len(allc) // PER_BATCH), 'noise', len(noise))
print('order reference', {t: round(mean(v), 4) for t, v in sorted(ref_order.items())})
print('forget', {d: (FORGET[d]['means'], FORGET[d]['diff'], FORGET[d]['pass'], FORGET[d]['learnersWithDelayedDiff']) for d in FORGET})
