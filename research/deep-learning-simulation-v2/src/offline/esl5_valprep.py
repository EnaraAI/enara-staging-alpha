# SIMULATION ONLY. NO API.
# Builds the ESL5 blind judge validation inputs (round 1) in reports/exp4/agent_sim_esl5/validation/round1/:
#   cases_recheck.json (165 ESL4 recheck cases, rounds 3 and 7), cases_new.json (60 hand-written cases), scripted_order.json
#   (scripted tutors a-d, 12 learners x 4 turns), VAL_KEY.json (NOT for judges: source, arm, state before, production), judgeA/B inputs + batch files.
#   python3 src/offline/esl5_valprep.py
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from esl5_valscore import sha, rand, p_error, apply_events, ROOT  # noqa: E402

ESL4 = os.path.join(ROOT, 'reports/exp4/agent_sim_esl4')
OUT = os.path.join(ROOT, 'reports/exp4/agent_sim_esl5/validation/round1')
PER_BATCH = 36

BELIEF_TEXT = {
    'articles': {'W1': 'no a/an is needed before a singular noun', 'W2': 'a and an are the same; "a" (or "the") goes everywhere', 'C1': 'a singular countable noun needs a/an (or the)', 'C2': 'an before a vowel sound, a before a consonant sound'},
    'copula': {'W1': 'no am/is/are is needed in a present sentence', 'W2': '"is" works with every subject', 'C1': 'a present sentence like "She is a teacher" needs am/is/are', 'C2': 'am with I, is with he/she/it, are with you/we/they'},
    'thirdS': {'W1': 'the verb does not change after he/she/it', 'W2': '-s goes on every verb and -es/-ies are not needed', 'C1': 'add -s/-es after he/she/it', 'C2': '-es after sh/ch/s/x/o, -ies after consonant + y, no -s after I/you/we/they'},
}
ERROR_TEXT = {
    'articles': {'W1': 'leaves out a/an ("She is teacher")', 'W2': 'uses "a" where "an" is needed ("a apple")'},
    'copula': {'W1': 'leaves out am/is/are ("She teacher")', 'W2': 'uses "is" with every subject ("They is happy")'},
    'thirdS': {'W1': 'leaves the verb unchanged after he/she/it ("She like tea")', 'W2': 'adds -s wrongly or misspells -es/-ies ("She watchs TV", "I plays")'},
}
TOPIC = {'articles': 'a, an and the', 'copula': 'am, is and are', 'thirdS': 'he, she and it with -s'}


def state_text(k):
    b = BELIEF_TEXT[k['form']]; e = ERROR_TEXT[k['form']]; s = k['s']
    return '\n'.join([f"Target form: {k['form']}. Learner level {k['band']}. First language Arabic.",
                      f"W1 (wrong) strength {s['W1']}: {b['W1']}. Its error: {e['W1']}.",
                      f"W2 (wrong) strength {s['W2']}: {b['W2']}. Its error: {e['W2']}.",
                      f"C1 (correct) strength {s['C1']}: {b['C1']}. Independent correct productions so far: {k['indep']['C1']}.",
                      f"C2 (correct) strength {s['C2']}: {b['C2']}. Independent correct productions so far: {k['indep']['C2']}."])


def fact_line(p, form):
    if not p or p['kind'] in ('none', 'rule'): return 'FACT: the last learner message did not produce the form (no exercise answer or sentence).'
    if p.get('correct'): return 'FACT: the last learner message produced the form CORRECTLY.'
    return f"FACT: the last learner message contained the error of {p['fired']} ({ERROR_TEXT[form][p['fired']]})."


def judge_case(k, prev, prod, learner, tutor):
    return (f"KNOWLEDGE STATE (before this tutor turn):\n{state_text(k)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n"
            f"{prev if prev else '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n{learner}\n{fact_line(prod, k['form'])}\n\nTUTOR TURN TO JUDGE:\n{tutor}")


def split_input(text):
    a = text.split('\n\nPREVIOUS TUTOR TURN (the task set before the learner\'s message):\n'); st = a[0].replace('KNOWLEDGE STATE (before this tutor turn):\n', '')
    b = a[1].split('\n\nLEARNER\'S LAST MESSAGE:\n'); c = b[1].split('\n\nTUTOR TURN TO JUDGE:\n'); lm = c[0].rsplit('\nFACT: ', 1)
    return {'state_text': st, 'previous_tutor_turn': b[0], 'learner_message': lm[0], 'fact': 'FACT: ' + lm[1], 'tutor_turn': c[1]}


def case_row(cid, session, form, text):
    return {'id': cid, 'session': session, 'form': form, **split_input(text), 'text': text}


def mk_state(form, band, primary, w1, w2, c1, c2, i1=0, i2=0):
    return {'form': form, 'band': band, 'primary': primary, 's': {'W1': w1, 'W2': w2, 'C1': c1, 'C2': c2}, 'indep': {'C1': i1, 'C2': i2}}


def initial_state(form, band, primary):
    other = 'W2' if primary == 'W1' else 'W1'
    s = {'W1': 0, 'W2': 0, 'C1': 3, 'C2': 3} if band == 'B2' else ({primary: 3, other: 1, 'C1': 0, 'C2': 0} if band == 'A1' else {primary: 2, other: 1, 'C1': 1, 'C2': 0})
    return {'form': form, 'band': band, 'primary': primary, 's': {k: s[k] for k in ('W1', 'W2', 'C1', 'C2')}, 'indep': {'C1': 0, 'C2': 0}}


KEY = {}

# ------------------------------------------------------------------------------------------------ 1. recheck (ESL4 agree rounds 3 and 7)
recheck = []
for rnd in (3, 7):
    key = json.load(open(os.path.join(ESL4, 'agree', f'ag{rnd}_KEY.json')))
    for aid, ref in sorted(key.items()):
        sk, _, cid4 = ref.split('|'); s = json.load(open(os.path.join(ESL4, 'sessions', f'{sk}.json'))); t = s['turns'][rnd - 1]
        prev = s['start'] if rnd == 1 else s['turns'][rnd - 2]['stateAfter']
        assert state_text(prev) in t['judgeInput'], (aid, 'state mismatch')
        nid = 'v' + sha(f'esl5-val|recheck|{aid}')[:10]
        recheck.append(case_row(nid, t['session'], prev['form'], t['judgeInput']))
        KEY[nid] = {'source': 'recheck', 'session': t['session'], 'esl4Round': rnd, 'esl4AgreeId': aid, 'esl4Session': sk, 'arm': s['arm'], 'prevState': prev, 'production': t['production'], 'esl4JudgeEvents': t.get('events', [])}

# ------------------------------------------------------------------------------------------------ 2. 60 new hand-written cases
HELLO = {1: lambda f: f'Hello! Can you give me an exercise on {TOPIC[f]}?', 2: lambda f: f'Hello again! Can we practise {TOPIC[f]} again today?'}
NONE = {'kind': 'none', 'text': ''}
EMPTY = '(I leave it empty, no word)'
def ok(kind='blank'): return {'kind': kind, 'correct': True}
def err(w, kind='blank'): return {'kind': kind, 'correct': False, 'fired': w}

# (style, session, state, prev tutor turn or None, learner message (None = hello), production, tutor turn, area tag)
A, C, T = 'articles', 'copula', 'thirdS'
NEW = [
    # ---------------- P+ style, session 1
    ('pplus', 1, mk_state(A, 'A1', 'W1', 3, 1, 0, 0), None, None, NONE,
     'Hello! Let\'s practise. In English, before one thing we use a or an: "a camel", "an island". We use "an" before a vowel sound (a, e, i, o, u).\nTry this one:\nWrite a or an: There is ___ island in the middle of the river. (answer with only the missing word)', '4c/4d rule at session start; a/an item'),
    ('pplus', 1, mk_state(A, 'A1', 'W1', 2, 0, 0, 0), 'Write a or an: My cousin is ___ engineer. (answer with only the missing word)', EMPTY, err('W1'),
     'Good try, but we need a word here. We say "My cousin is an engineer", not "My cousin is engineer". "Engineer" starts with a vowel sound, so we use "an".\nTry again: My cousin is ___ engineer.', '4c R1 W2 at 0; pair on omission; answer given'),
    ('pplus', 1, mk_state(A, 'A2', 'W2', 1, 2, 1, 0), 'Write a or an: I saw ___ ostrich at the farm. (answer with only the missing word)', 'a', err('W2'),
     'Not quite. Look at the word after the gap: "ostrich". What is its first sound? Say it slowly and try again.', '4d hint only'),
    ('pplus', 1, mk_state(A, 'A2', 'W2', 1, 1, 1, 1), 'Not quite. Look at the word after the gap: "ostrich". What is its first sound? Say it slowly and try again.', 'an', ok(),
     'Yes! "Ostrich" starts with a vowel sound, so we say "an ostrich". Well done.\nNext one:\nWrite a or an: My neighbour keeps ___ camel behind his house. (answer with only the missing word)', '4a C2 only; 4b retry; 4c one-item clause'),
    ('pplus', 1, mk_state(A, 'A1', 'W1', 2, 1, 1, 0), 'Write a, an or the: I have a bicycle. ___ bicycle is red. (answer with only the missing word)', 'the', ok(),
     'Correct! We use "the" because we already talked about the bicycle, so we know which one.\nNow try this one:\nWrite a or an: Her sister is ___ artist. (answer with only the missing word)', '4a the-item: no belief tested'),
    ('pplus', 1, mk_state(C, 'A1', 'W1', 3, 1, 0, 0), None, None, NONE,
     'Hi! Today we practise am, is and are. We use am with I, is with he, she and it, and are with you, we and they.\nExamples: I am happy. She is a doctor. They are at home.\nNow you:\nWrite am, is or are: The soup ___ very hot. (answer with only the missing word)', '4c rule names subjects only: R1 W2, not W1'),
    ('pplus', 1, mk_state(C, 'A1', 'W1', 3, 0, 0, 0), 'Write am, is or are: The soup ___ very hot. (answer with only the missing word)', EMPTY, err('W1'),
     'Almost! In English we can\'t say "The soup very hot." Think about it and try again: The soup ___ very hot.', '4d "we cannot say X" without a right form'),
    ('pplus', 1, mk_state(C, 'A2', 'W2', 1, 2, 1, 0), 'Write am, is or are: My cousins ___ in Alexandria this week. (answer with only the missing word)', 'is', err('W2'),
     'Not quite. "My cousins" means more than one person, like "they". We say "My cousins are in Alexandria", not "My cousins is in Alexandria".\nLet\'s try another one:\nWrite am, is or are: You ___ my best friend. (answer with only the missing word)', 'R2 W2 pair + answer; one-item reason'),
    ('pplus', 1, mk_state(C, 'A2', 'W2', 1, 1, 1, 0), 'Not quite. "My cousins" means more than one person, like "they". We say "My cousins are in Alexandria", not "My cousins is in Alexandria".\nLet\'s try another one:\nWrite am, is or are: You ___ my best friend. (answer with only the missing word)', 'are', ok(),
     'Great! "You" always takes "are", even for one person. Now write one sentence about your favourite teacher. Use am, is or are.', '4a C2 only; 4b new item after a different-example rule; 4c single-pronoun clause'),
    ('pplus', 1, mk_state(T, 'A1', 'W1', 3, 1, 0, 0), 'Write the correct form: Karim ___ (read) the newspaper every day. (answer with only the verb)', 'read', err('W1'),
     'Good try! Remember: with he, she or it, we add -s to the verb. Karim is "he", so it is "Karim reads the newspaper".\nLet\'s try another one:\nWrite the correct form: The cat ___ (catch) mice in the garden. (answer with only the verb)', 'R1 W1 + answer given'),
    ('pplus', 1, mk_state(T, 'A1', 'W1', 2, 1, 0, 0), 'Write the correct form: The cat ___ (catch) mice in the garden. (answer with only the verb)', 'catchs', err('W2'),
     'Very close! You added -s, good. But "catch" ends in -ch, so we add -es: catches.\nRight: The cat catches mice. Wrong: The cat catchs mice.\nTry this one: My grandfather ___ (sleep) after lunch. (answer with only the verb)', 'R1 W2 + R2 W2, no R7'),
    ('pplus', 1, mk_state(T, 'A2', 'W2', 0, 2, 2, 0, 1, 0), 'Write the correct form: They ___ (play) football in the park. (answer with only the verb)', 'plays', err('W2'),
     'Hmm, look at the subject again. Is it one person or more than one? Try again.', '4d question hint'),
    ('pplus', 1, mk_state(T, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Write the correct form: The little boy ___ (try) very hard at school. (answer with only the verb)', 'tries', ok(),
     'Excellent! "Try" ends in a consonant + y, so we change y to -ies: tries.\nNow write one sentence about what your mother does in the evening.', '4a he + -ies: C1 and C2; R1 W2 class'),
    ('pplus', 1, mk_state(A, 'B2', 'W1', 0, 0, 3, 3), None, None, NONE,
     'Hello! You know articles well, so let\'s do something a little harder.\nWrite a, an or the: I read ___ interesting article about Egypt yesterday. (answer with only the missing word)', 'no event; B2'),
    ('pplus', 1, mk_state(C, 'A1', 'W2', 1, 3, 0, 0), 'Not quite. "Mona and I" is two people. Try again: Mona and I ___ good friends. (answer with only the missing word)', 'is', err('W2'),
     'That\'s OK, this one is tricky. The answer is "are": "Mona and I are good friends." "Mona and I" means "we", and we always use "are" with we.\nLet\'s try a new one:\nWrite am, is or are: The windows ___ open. (answer with only the missing word)', '5a-like release by P+: R5 + R1 W2?'),
    # ---------------- P+ style, session 2
    ('pplus', 2, mk_state(A, 'A1', 'W1', 2, 0, 1, 1, 0, 1), None, None, NONE,
     'Welcome back! Let\'s start with a short exercise.\nWrite a or an: My aunt lives in ___ old house near the river. (answer with only the missing word)', 'no event; session-2 opener'),
    ('pplus', 2, mk_state(A, 'A2', 'W2', 0, 2, 2, 1, 1, 0), 'Write a or an: I need ___ envelope for this letter. (answer with only the missing word)', 'a', err('W2'),
     'Not quite. "Envelope" starts with the sound "e", and that is a vowel sound. Before a vowel sound we use "an". Try again: I need ___ envelope for this letter.', 'R1 W2 general; not W1'),
    ('pplus', 2, mk_state(A, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Not quite. "Envelope" starts with the sound "e", and that is a vowel sound. Before a vowel sound we use "an". Try again: I need ___ envelope for this letter.', 'an', ok(),
     'Yes, that\'s right! "an envelope". Good job.\nNext: Write a, an or the: There is ___ lemon on the table. (answer with only the missing word)', '4a C2 only; 4b retry: no R4'),
    ('pplus', 2, mk_state(A, 'A1', 'W1', 3, 0, 0, 0), 'Write a or an: He is ___ farmer. (answer with only the missing word)', EMPTY, err('W1'),
     'We need a word in the gap here. "He is farmer" is not correct English.\nRule: look at the word "farmer". Try again: He is ___ farmer.', '4d Rule label + cannot-say without right form'),
    ('pplus', 2, mk_state(C, 'A1', 'W1', 2, 1, 1, 0), None, None, NONE,
     'Hello! Nice to see you again. Remember: every English sentence in the present needs am, is or are. We say "I am tired", not "I tired".\nLet\'s start:\nWrite the sentence again with the missing word: Our flat small.', 'R1 W1 + R2 W1 at session start'),
    ('pplus', 2, mk_state(C, 'A1', 'W1', 0, 1, 1, 0), 'Hello! Nice to see you again. Remember: every English sentence in the present needs am, is or are. We say "I am tired", not "I tired".\nLet\'s start:\nWrite the sentence again with the missing word: Our flat small.', 'Our flat is small.', ok(),
     'Perfect! "Our flat is small." "Flat" is one thing, like "it", so we use "is".\nNow: Write am, is or are: I ___ a dentist. (answer with only the missing word)', '4a open: C1+C2; 4b rule with other example; 4c no R1 W2'),
    ('pplus', 2, mk_state(C, 'A2', 'W2', 0, 2, 2, 0, 1, 0), 'Write am, is or are: My classmates ___ from Aswan. (answer with only the missing word)', 'is', err('W2'),
     'Good try. "My classmates" is more than one person. More than one person takes "are": "My classmates are from Aswan."\nNow a new one: Write am, is or are: The shops ___ near my house. (answer with only the missing word)', 'R1 W2 class + R5, no pair'),
    ('pplus', 2, mk_state(C, 'A2', 'W2', 0, 1, 2, 0, 1, 0), 'Good try. "My classmates" is more than one person. More than one person takes "are": "My classmates are from Aswan."\nNow a new one: Write am, is or are: The shops ___ near my house. (answer with only the missing word)', 'are', ok(),
     'Correct! "The shops" is plural, so we use "are". Great job.\nNow, can you write one sentence about your favourite teacher?', '4b general rule with a different example does not block R4; C2 only'),
    ('pplus', 2, mk_state(T, 'A1', 'W1', 2, 1, 1, 0), None, None, NONE,
     'Welcome back! A quick reminder: after he, she or it, the verb gets -s.\nLet\'s practise: Write the correct form: My aunt ___ (fix) old bicycles. (answer with only the verb)', 'R1 W1 at start'),
    ('pplus', 2, mk_state(T, 'A1', 'W1', 1, 1, 1, 0), 'Welcome back! A quick reminder: after he, she or it, the verb gets -s.\nLet\'s practise: Write the correct form: My aunt ___ (fix) old bicycles. (answer with only the verb)', 'fixs', err('W2'),
     'You remembered the -s, well done! But "fix" ends in -x, so we write -es: fixes.\nTry this one: Ali ___ (do) his homework after dinner. (answer with only the verb)', 'R1 W2 class; answer given; no pair'),
    ('pplus', 2, mk_state(T, 'A2', 'W1', 1, 0, 1, 1), 'You remembered the -s, well done! But "fix" ends in -x, so we write -es: fixes.\nTry this one: Ali ___ (do) his homework after dinner. (answer with only the verb)', 'does', ok(),
     'Yes! "Does" is correct. Well done.', '4c plain restatement: no R1; 4a he + -o stem: C1+C2; R4 new item after a different-example rule'),
    ('pplus', 2, mk_state(T, 'A2', 'W2', 0, 2, 2, 1, 1, 0), 'Write the correct form: We ___ (play) volleyball at the beach. (answer with only the verb)', 'plays', err('W2'),
     'Careful! "Plays" is only for he, she or it. With we, there is no -s: "We play volleyball at the beach."\nNow you: Write the correct form: I ___ (finish) work at five. (answer with only the verb)', 'R1 W2 general (no -s after we); answer given; no explicit pair'),
    ('pplus', 2, mk_state(C, 'B2', 'W1', 0, 0, 3, 3, 0, 0), 'Write one sentence about your city. Use am, is or are.', 'Alexandria is a beautiful city.', ok('sentence'),
     'Lovely sentence! "Alexandria is a beautiful city." Can you add one more sentence about the people there?', 'own sentence B2: R3/R4 at cap'),
    ('pplus', 2, mk_state(A, 'A1', 'W1', 2, 1, 1, 0), 'Write one sentence about an animal you saw at the zoo. Use a or an.', 'I saw lion.', err('W1', 'sentence'),
     'Nice idea! Small correction: "I saw lion" should be "I saw a lion". One lion needs "a".\nCan you write one more sentence about another animal?', 'own-sentence error: R2 W1; one-item reason'),
    ('pplus', 2, mk_state(C, 'A2', 'W2', 1, 2, 1, 0), 'Write one sentence about someone in your family. Use am, is or are.', 'My brothers is tall.', err('W2', 'sentence'),
     'Good sentence! Now write one about your mother.', 'R7 W2 false confirmation'),
    # ---------------- ENARA-esl5 style, session 1
    ('esl5', 1, mk_state(A, 'A1', 'W1', 3, 1, 0, 0), None, None, NONE,
     'Rule: one thing (a singular noun) needs a or an. Use an before a vowel sound (an island), a before a consonant sound (a camel).\nRight: My cousin is a farmer. Wrong: My cousin is farmer.\nYour turn. Write a or an: She is ___ actor in Cairo. (answer with only the missing word)', 'rule line + contrast: R1 W1, R1 W2, R2 W1'),
    ('esl5', 1, mk_state(A, 'A1', 'W1', 1, 0, 0, 0), 'Rule: one thing (a singular noun) needs a or an. Use an before a vowel sound (an island), a before a consonant sound (a camel).\nRight: My cousin is a farmer. Wrong: My cousin is farmer.\nYour turn. Write a or an: She is ___ actor in Cairo. (answer with only the missing word)', 'an', ok(),
     'Correct: "actor" starts with a vowel sound, so "an actor".\nNow a new one. Write the missing word: I ride ___ bicycle to school. (answer with only the missing word)', '4a a/an options: C2 only; R4 (rule used other examples); R1 W2 at 0'),
    ('esl5', 1, mk_state(A, 'A2', 'W2', 1, 2, 1, 0), 'Write a or an: I have ___ idea for the party. (answer with only the missing word)', 'a', err('W2'),
     'Not yet. Look at the first sound of "idea".\nTry again: I have ___ idea for the party.', '4d look-hint'),
    ('esl5', 1, mk_state(A, 'A2', 'W2', 1, 2, 1, 0), 'Not yet. Look at the first sound of "idea".\nTry again: I have ___ idea for the party.', 'a', err('W2'),
     'That was two tries, so here is the answer: "an idea". "Idea" starts with a vowel sound, and before a vowel sound we use an.\nRight: I have an idea. Wrong: I have a idea.\nNew one. Write a or an: We waited at ___ airport for two hours. (answer with only the missing word)', '5a release: R5 + R1 W2 + R2 W2'),
    ('esl5', 1, mk_state(A, 'A2', 'W2', 1, 0, 1, 0), 'That was two tries, so here is the answer: "an idea". "Idea" starts with a vowel sound, and before a vowel sound we use an.\nRight: I have an idea. Wrong: I have a idea.\nNew one. Write a or an: We waited at ___ airport for two hours. (answer with only the missing word)', 'an', ok(),
     'Yes: "an airport". Well done.\nNow write one sentence of your own about something in your kitchen. Use a or an.', '5a new item after release: R4 C2 only'),
    ('esl5', 1, mk_state(C, 'A1', 'W1', 3, 1, 0, 0), None, None, NONE,
     'Rule: every present sentence needs am, is or are. Use am with I, is with he, she and it, are with you, we and they.\nRight: The tea is hot. Wrong: The tea hot.\nYour turn. Write the missing word: My uncle ___ a taxi driver. (answer with only the missing word)', 'rule line + contrast W1'),
    ('esl5', 1, mk_state(C, 'A1', 'W1', 1, 0, 0, 0), 'Rule: every present sentence needs am, is or are. Use am with I, is with he, she and it, are with you, we and they.\nRight: The tea is hot. Wrong: The tea hot.\nYour turn. Write the missing word: My uncle ___ a taxi driver. (answer with only the missing word)', EMPTY, err('W1'),
     'Not yet. The gap cannot stay empty.\nTry again: My uncle ___ a taxi driver.', '4d gap-cannot-be-empty'),
    ('esl5', 1, mk_state(C, 'A1', 'W1', 1, 0, 0, 0), 'Not yet. The gap cannot stay empty.\nTry again: My uncle ___ a taxi driver.', 'is', ok(),
     'Correct! "My uncle is a taxi driver." He is one person, so we use is.\nNext: Write the missing word: The bananas ___ yellow. (answer with only the missing word)', '4a open gap C1+C2; 4b retry no R4; 4c he->is does not contradict W2'),
    ('esl5', 1, mk_state(C, 'A2', 'W2', 1, 2, 1, 0), 'Write am, is or are: You and Sami ___ late again. (answer with only the missing word)', 'is', err('W2'),
     'Not quite. "You and Sami" means more than one person.\nRight: You are late. Wrong: You is late.\nTry again: You and Sami ___ late again.', 'R2 W2 pair; hint not a rule'),
    ('esl5', 1, mk_state(C, 'A2', 'W2', 1, 1, 1, 0), 'Hint: "the windows" is more than one thing, so think "they". Write am, is or are: The windows ___ open. (answer with only the missing word)', 'are', ok(),
     'Right: "The windows are open."\nQuick check, no hints this time: Write am, is or are: I ___ from Luxor. (answer with only the missing word)', '4b settling hint: no R4; C2 only; faded check'),
    ('esl5', 1, mk_state(T, 'A1', 'W1', 3, 1, 0, 0), None, None, NONE,
     'Rule: after he, she or it, add -s to the verb: he reads, she eats.\nRight: She drinks milk. Wrong: She drink milk.\nYour turn. Write the correct form: Karim ___ (open) the shop at nine. (answer with only the verb)', 'R1 W1, R2 W1; not W2'),
    ('esl5', 1, mk_state(T, 'A1', 'W1', 1, 1, 0, 0), 'Rule: after he, she or it, add -s to the verb: he reads, she eats.\nRight: She drinks milk. Wrong: She drink milk.\nYour turn. Write the correct form: Karim ___ (open) the shop at nine. (answer with only the verb)', 'opens', ok(),
     'Correct: Karim opens. He is one person, so the verb takes -s.\nNext: Write the correct form: My mother ___ (mix) the flour and the eggs. (answer with only the verb)', '4a plain stem C1 only; R4; R1 W1 one-item general clause'),
    ('esl5', 1, mk_state(T, 'A2', 'W2', 0, 2, 2, 0, 1, 0), 'Write the correct form: My mother ___ (mix) the flour and the eggs. (answer with only the verb)', 'mixs', err('W2'),
     'Not yet. Look at the last letter of "mix".\nTry again: My mother ___ (mix) the flour and the eggs.', '4d look-hint'),
    ('esl5', 1, mk_state(T, 'A2', 'W2', 0, 2, 2, 0, 1, 0), 'Not yet. Look at the last letter of "mix".\nTry again: My mother ___ (mix) the flour and the eggs.', 'mixs', err('W2'),
     'Two tries, so here it is: "mixes". Verbs that end in -x, -sh, -ch, -s or -o take -es.\nRight: She mixes the eggs. Wrong: She mixs the eggs.\nNew one. Write the correct form: The waiter ___ (carry) three plates. (answer with only the verb)', '5a release: R5 + R1 W2 + R2 W2'),
    ('esl5', 1, mk_state(T, 'A2', 'W2', 0, 0, 2, 0, 1, 0), 'Two tries, so here it is: "mixes". Verbs that end in -x, -sh, -ch, -s or -o take -es.\nRight: She mixes the eggs. Wrong: She mixs the eggs.\nNew one. Write the correct form: The waiter ___ (carry) three plates. (answer with only the verb)', 'carries', ok(),
     'Yes, "carries": a consonant + y becomes -ies.\nNow write one sentence of your own about what your neighbour does every morning.', '4a he + -ies: C1+C2; R4 after release; R1 W2 at 0'),
    # ---------------- ENARA-esl5 style, session 2
    ('esl5', 2, mk_state(A, 'A1', 'W1', 2, 0, 1, 1, 0, 1), None, None, NONE,
     'Welcome back! Remember last time? Fill in: She has ___ orange in her bag. (answer with only the missing word)', '5b recall item: no effect'),
    ('esl5', 2, mk_state(A, 'A1', 'W1', 2, 0, 1, 1, 0, 1), 'Welcome back! Remember last time? Fill in: She has ___ orange in her bag. (answer with only the missing word)', 'an', ok(),
     'Correct! "an orange".\nRule: one thing needs a or an, and we use an before a vowel sound.\nNew one: Write the missing word: My brother wants to be ___ engineer. (answer with only the missing word)', '5b recall from earlier session: no R4; R3 C1+C2 (open fill-in); R1 W1, R1 W2'),
    ('esl5', 2, mk_state(A, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Remember: before a vowel sound we use an, so we say "an ostrich" and "an onion".\nFill in: I cut ___ onion for the salad. (answer with only the missing word)', 'an', ok(),
     'Yes, "an onion".\nNow write one sentence of your own about your mobile phone. Use a or an.', '5b Remember line models the item: no R4'),
    ('esl5', 2, mk_state(A, 'A2', 'W2', 0, 1, 2, 2, 1, 1), 'Write one sentence of your own about something on your desk. Use a or an. Example: There is a lamp on my desk.', 'There is a pen on my desk.', ok('sentence'),
     'Good: "a pen".\nQuick check: Write a or an: He drew ___ eagle in his notebook. (answer with only the missing word)', '5b own sentence copies model with one word changed: no R4'),
    ('esl5', 2, mk_state(A, 'A1', 'W1', 3, 0, 0, 0), 'Write a or an: Salma is ___ actress. (answer with only the missing word)', EMPTY, err('W1'),
     'Not yet. Rule: look at the first sound of the next word. A vowel sound takes "an"; other sounds take "a".\nTry again: Salma is ___ actress.', '4d/4c a/an rule: R1 W2 at 0, not W1'),
    ('esl5', 2, mk_state(C, 'A1', 'W1', 2, 1, 1, 1, 0, 0), None, None, NONE,
     'Welcome back! Remember last time? Fill in: I ___ a student. (answer with only the missing word)', '5b recall item: no effect'),
    ('esl5', 2, mk_state(C, 'A1', 'W1', 2, 1, 1, 1, 0, 0), 'Welcome back! Remember last time? Fill in: I ___ a student. (answer with only the missing word)', 'am', ok(),
     'Right: "I am a student."\nNew one, no help: Write the missing word: My grandmother ___ eighty years old. (answer with only the missing word)', '5b recall: R3 C1+C2 open, no R4'),
    ('esl5', 2, mk_state(C, 'A2', 'W2', 0, 2, 2, 1, 1, 0), 'Fill in: My parents ___ at work now. (answer with only the missing word)', 'is', err('W2'),
     'Not yet. Rule: is is for he, she and it. "My parents" means they, and they takes are.\nRight: They are at work. Wrong: They is at work.\nTry again: My parents ___ at work now.', 'R1 W2 + R2 W2'),
    ('esl5', 2, mk_state(C, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Not yet. Rule: is is for he, she and it. "My parents" means they, and they takes are.\nRight: They are at work. Wrong: They is at work.\nTry again: My parents ___ at work now.', 'is', err('W2'),
     'Two tries, so here is the answer: "are". "My parents are at work now."\nNew one: Write the missing word: The keys ___ on the table. (answer with only the missing word)', '5a minimal release: R5 only'),
    ('esl5', 2, mk_state(C, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Two tries, so here is the answer: "are". "My parents are at work now."\nNew one: Write the missing word: The keys ___ on the table. (answer with only the missing word)', 'are', ok(),
     'Correct: "The keys are on the table." Plural nouns take are.\nNow write one sentence of your own about your neighbours.', '5a new item after release: R3+R4 C1+C2; R1 W2 class'),
    ('esl5', 2, mk_state(T, 'A1', 'W1', 2, 1, 1, 0), None, None, NONE,
     'Welcome back! Remember: after he, she or it, the verb takes -s.\nFill in: He ___ (drink) tea in the morning. (answer with only the verb)', '5b recall with Remember rule: R1 W1'),
    ('esl5', 2, mk_state(T, 'A1', 'W1', 1, 1, 1, 0), 'Welcome back! Remember: after he, she or it, the verb takes -s.\nFill in: He ___ (drink) tea in the morning. (answer with only the verb)', 'drinks', ok(),
     'Yes: he drinks.\nNew one: Write the correct form: My cousin ___ (push) the trolley at the market. (answer with only the verb)', '5b recall + settling Remember line: R3 C1 only, no R4'),
    ('esl5', 2, mk_state(T, 'A2', 'W2', 0, 2, 2, 1, 1, 1), 'Write the correct form: I ___ (go) to the market on Saturdays. (answer with only the verb)', 'goes', err('W2'),
     'Not yet. With I, the verb has no -s.\nRight: I go to the market. Wrong: I goes to the market.\nNew one: Write the correct form: You ___ (speak) very fast. (answer with only the verb)', 'R2 W2; R1 single-pronoun line'),
    ('esl5', 2, mk_state(T, 'A2', 'W2', 0, 1, 2, 1, 1, 0), 'Write one sentence of your own about what your friend does after school.', 'My friend plays football after school.', ok('sentence'),
     'Correct: "my friend plays". One person, so -s.\nQuick check: Write the correct form: Our dog ___ (bark) at night. (answer with only the verb)', '5b own sentence: R4 C1 only (plain stem); R1 W1 at 0'),
    ('esl5', 2, mk_state(T, 'A2', 'W2', 0, 1, 3, 1, 2, 0), 'Correct: "my friend plays". One person, so -s.\nQuick check: Write the correct form: Our dog ___ (bark) at night. (answer with only the verb)', 'barks', ok(),
     'Correct. That is the end of today\'s practice. Great work!', 'faded check: R3+R4 C1 only'),
]
assert len(NEW) == 60
new_rows = []
for i, (style, sess, st, prev, learner, prod, tutor, area) in enumerate(NEW):
    msg = learner if learner is not None else HELLO[sess](st['form']); prod = {**prod, 'text': msg} if prod['kind'] != 'none' else {'kind': 'none', 'text': ''}
    nid = 'v' + sha(f'esl5-val|new|{i}')[:10]
    new_rows.append(case_row(nid, sess, st['form'], judge_case(st, prev, prod, msg, tutor)))
    KEY[nid] = {'source': 'new', 'session': sess, 'style': style, 'index': i + 1, 'area': area, 'prevState': st, 'production': prod}

# ------------------------------------------------------------------------------------------------ 3. scripted tutors a-d (as learnerSim.ts scriptedTutor / vinit)
RULE = {
    'articles': 'Here is the rule. Before one thing (a singular noun) we always put a or an: "a book", not "book". Use an before a vowel sound (an apple, an egg) and a before a consonant sound (a cat, a dog).',
    'copula': 'Here is the rule. In English every present sentence needs am, is or are: "She is a teacher", not "She teacher". Use am with I, is with he, she and it, and are with you, we and they.',
    'thirdS': 'Here is the rule. After he, she or it, the verb takes -s: "She likes tea", not "She like tea". Add -es after sh, ch, s, x and o (watches, goes) and change consonant + y to -ies (studies). Do not add -s after I, you, we or they.',
}
CONTRAST = {
    'articles': {'W1': 'Right: "My brother is a doctor." Wrong: "My brother is doctor."', 'W2': 'Right: "I want an apple." Wrong: "I want a apple."'},
    'copula': {'W1': 'Right: "My sister is happy." Wrong: "My sister happy."', 'W2': 'Right: "They are happy." Wrong: "They is happy."'},
    'thirdS': {'W1': 'Right: "He plays football." Wrong: "He play football."', 'W2': 'Right: "She watches TV." Wrong: "She watchs TV."'},
}
PRODUCE = {
    'articles': ['Now write one sentence of your own about something in your bag. Use a or an.', 'Write one more new sentence of your own about an animal you like. Use a or an.', 'One more: write a new sentence about a job someone in your family has. Use a or an.'],
    'copula': ['Now write one sentence of your own about a friend: who is your friend and how is he or she today?', 'Write one more new sentence of your own about your family. Use am, is or are.', 'One more: write a new sentence about you and your classmates today. Use am, is or are.'],
    'thirdS': ['Now write one sentence of your own about what your father or mother does every morning.', 'Write one more new sentence of your own about what your best friend likes.', 'One more: write a new sentence about what your teacher does every day.'],
}
# reference next_task for each PRODUCE prompt (used only to draw the fixed learner replies; probes per section 4a)
PRODUCE_TASK = {
    'articles': [('I have a pen and an eraser in my bag.', {'W1': 'I have pen and eraser in my bag.', 'W2': 'I have a pen and a eraser in my bag.'}),
                 ('An owl is my favourite animal.', {'W1': 'Owl is my favourite animal.', 'W2': 'A owl is my favourite animal.'}),
                 ('My aunt is an engineer.', {'W1': 'My aunt is engineer.', 'W2': 'My aunt is a engineer.'})],
    'copula': [('My friends Sami and Hany are happy today.', {'W1': 'My friends Sami and Hany happy today.', 'W2': 'My friends Sami and Hany is happy today.'}),
               ('We are a big family.', {'W1': 'We a big family.', 'W2': 'We is a big family.'}),
               ('My classmates and I are tired today.', {'W1': 'My classmates and I tired today.', 'W2': 'My classmates and I is tired today.'})],
    'thirdS': [('My mother watches the news every morning.', {'W1': 'My mother watch the news every morning.', 'W2': 'My mother watchs the news every morning.'}),
               ('My best friend likes chess.', {'W1': 'My best friend like chess.'}),
               ('My teacher finishes class at noon.', {'W1': 'My teacher finish class at noon.', 'W2': 'My teacher finishs class at noon.'})],
}
CHAT = ['Hi! How are you today? What did you do this weekend?', 'That sounds nice. Do you like music?', 'Great. What is your favourite food?', 'Thanks for chatting with me today!']
ANSWERS = {
    'articles': ['Here is an example: "She has an orange in her bag." The answer is "an".', 'Next one: "My uncle is a doctor." The answer is "a".', 'Next: "I bought a book. The book is very good." The answer is "the".', 'Last one: "We saw an elephant at the zoo." The answer is "an".'],
    'copula': ['Here is an example: "I am a student." The answer is "am".', 'Next one: "She is at home today." The answer is "is".', 'Next: "They are happy." The answer is "are".', 'Last one: "My father is a pilot." The answer is "is".'],
    'thirdS': ['Here is an example: "My sister plays tennis on Sundays." The answer is "plays".', 'Next one: "He drinks tea in the morning." The answer is "drinks".', 'Next: "She watches TV after dinner." The answer is "watches".', 'Last one: "The baby cries at night." The answer is "cries".'],
}


def scripted_tutor(kind, k, turn, last):
    f = k['form']
    if kind == 'a': return CHAT[turn - 1]
    if kind == 'b': return ANSWERS[f][turn - 1]
    if kind == 'c': return RULE[f] if turn == 1 else ['OK, thank you for listening.', 'Do you have any questions?', 'Good luck with your English!'][turn - 2]
    if turn == 1: return f"{RULE[f]}\n\nLook at this pair. {CONTRAST[f][k['primary']]}\n\n{PRODUCE[f][0]}"
    fb = 'Yes, that is correct. Well done.' if last.get('correct') else f"Not quite. {CONTRAST[f][last.get('fired') or k['primary']]}"
    return f"{fb}\n\n{PRODUCE[f][turn - 1]}" if turn <= 3 else fb


def reference_judgement(kind, k, turn, last):
    """Reference events/next_task used ONLY to generate the fixed transcript (the learner's replies); the judges' own events are scored."""
    if kind == 'a': return [], None
    if kind == 'b': return [{'rule': 'R5', 'belief': '-'}], None
    if kind == 'c': return ([{'rule': 'R1', 'belief': 'W1'}, {'rule': 'R1', 'belief': 'W2'}] if turn == 1 else []), None
    ev = []
    if turn == 1: ev = [{'rule': 'R1', 'belief': 'W1'}, {'rule': 'R1', 'belief': 'W2'}, {'rule': 'R2', 'belief': k['primary']}]
    elif last.get('correct'):
        cs = ['C1'] if (k['form'] == 'thirdS' and turn == 3) else ['C1', 'C2']
        ev = [{'rule': r, 'belief': c} for c in cs for r in ('R3', 'R4')]
    else: ev = [{'rule': 'R2', 'belief': last['fired']}]
    task = None
    if turn <= 3:
        corr, errs = PRODUCE_TASK[k['form']][turn - 1]; task = {'kind': 'sentence', 'probes': list(errs), 'correct': corr, 'errors': errs}
    return ev, task


def learner_reply(k, task, seed, turn):
    if task and task['kind'] in ('blank', 'sentence'):
        for w in task['probes']:
            if rand(seed, 'prod', turn, w) < p_error(k['s'][w]):
                return {'kind': task['kind'], 'correct': False, 'fired': w, 'text': task['errors'][w]}
        return {'kind': task['kind'], 'correct': True, 'text': task['correct']}
    return {'kind': 'none', 'text': 'OK. Can I have an exercise, please?'}


scripted_rows = []
FORMS = ['articles', 'copula', 'thirdS']
for i in range(12):
    form = FORMS[i % 3]; band = 'A1' if i < 6 else 'A2'; primary = 'W1' if (i // 3) % 2 == 0 else 'W2'
    for t in 'abcd':
        sid = f'v{i}_{t}'; seed = f'esl5-val|L{i}|{t}'; st = initial_state(form, band, primary); start = st
        learner = f'Hello! Can you give me an exercise on {TOPIC[form]}?'; prod = {'kind': 'none', 'text': ''}; prev = None
        for turn in range(1, 5):
            tutor = scripted_tutor(t, st, turn, prod)
            nid = 'v' + sha(f'esl5-val|scripted|{sid}|{turn}')[:10]
            scripted_rows.append(case_row(nid, 1, form, judge_case(st, prev, prod, learner, tutor)))
            KEY[nid] = {'source': 'scripted', 'session': 1, 'scripted': {'session': sid, 'tutor': t, 'turn': turn, 'learner': i}, 'startState': start, 'prevState': st, 'production': prod}
            ev, task = reference_judgement(t, st, turn, prod)
            st, _, _ = apply_events(st, ev, prod)
            prod = learner_reply(st, task, seed, turn + 1); learner = prod['text'] if prod['kind'] != 'none' else prod['text']; prev = tutor

# ------------------------------------------------------------------------------------------------ write
os.makedirs(OUT, exist_ok=True)
HDR = 'SIMULATION ONLY'
def dump(name, obj): json.dump(obj, open(os.path.join(OUT, name), 'w'), indent=1, ensure_ascii=False)
dump('cases_recheck.json', {'note': HDR, 'source': 'ESL4 judge-agreement recheck (rounds 3 and 7), blind: no arm, no prior judgments', 'cases': recheck})
dump('cases_new.json', {'note': HDR, 'source': '60 new hand-written turns (30 P+-style, 30 ENARA-esl5-style; 15+15 per session), blind', 'cases': new_rows})
dump('scripted_order.json', {'note': HDR, 'source': 'scripted tutors a-d (learnerSim.ts scriptedTutor), 12 learners x 4 turns; fixed transcripts', 'cases': scripted_rows})
dump('VAL_KEY.json', {'note': HDR + '. NOT FOR JUDGES. Source, arm/style, state before the turn and production fact per case, for esl5_valscore.py.', 'cases': KEY})

allc = recheck + new_rows + scripted_rows
for J in ('A', 'B'):
    order = sorted(allc, key=lambda c: sha(f'esl5-val-shuffle|{J}|{c["id"]}'))
    d = os.path.join(OUT, f'judge{J}'); os.makedirs(d, exist_ok=True); batches = []
    for n in range(0, len(order), PER_BATCH):
        chunk = order[n:n + PER_BATCH]; b = f'v5{J}_j{n // PER_BATCH + 1:02d}'
        with open(os.path.join(d, f'{b}.md'), 'w') as fh:
            fh.write(f'SIMULATION ONLY\n\nBatch {b}. Judge every case with JUDGE_INSTRUCTIONS.md and the ESL5 LEARNING_RULES.md. Write {{"batch":"{b}","cases":{{...}}}} to the file named in your task.\n'
                     + ''.join(f"\n=========== CASE {c['id']} ===========\n{c['text']}\n" for c in chunk))
        batches.append({'batch': b, 'ids': [c['id'] for c in chunk]})
    dump(f'judge{J}_input.json', {'note': HDR, 'judge': J, 'shuffleSeed': f'esl5-val-shuffle|{J}', 'perBatch': PER_BATCH, 'batchDir': f'judge{J}', 'batches': batches, 'cases': [{'id': c['id'], 'text': c['text']} for c in order]})

from collections import Counter
print('recheck', len(recheck), Counter(c['session'] for c in recheck))
print('new', len(new_rows), Counter((KEY[c['id']]['style'], c['session']) for c in new_rows))
print('scripted', len(scripted_rows), 'total', len(allc), 'batches/judge', -(-len(allc) // PER_BATCH))
