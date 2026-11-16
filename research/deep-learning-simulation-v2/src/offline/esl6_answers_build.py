# SIMULATION ONLY. NO API. Authoring record (not a runtime file) for config/agent_sim_esl6/ITEM_BELIEF_MAP.json and WRONG_ANSWERS.json.
# Written once, before init, from the bank (data/assessments/outcomes/*.json), config/agent_sim_esl6/LEARNING_RULES.md §1b/§4a and
# docs/SCORING_RUBRIC.md only, with no access to any session and blind to arm (PROTOCOL §7).
# Mapping rules (PROTOCOL §7, LEARNING_RULES §4a ESL6 scope line):
#  - an item probes Wk only if Wk's error (1b row) could change the answer to THIS item;
#  - options that exclude Wk's error exclude Wk (4a: "a or an" -> no omission; "am, is or are" -> no omission; picking from spelled options -> no spelling belief);
#  - error-correction: the Wk whose error the prompt shows (by l1ErrorType, or by meaning when the type is outside the row) and any other Wk that
#    could occur in the corrected sentence; free/transfer: every Wk of the row whose error can show in an answer to the prompt (if the frame of the
#    key sentence cannot show it, e.g. an I-subject for "-s after can", it is not probed and the reason is recorded);
#  - wrong string: EC with the item's own error = the prompt sentence unchanged; otherwise the key with Wk's error applied in the target form only;
#    gap/choice: the option or form Wk would produce ("" = gap left empty); a choice item answered by letter gets Wk's option letter.
#  - key string: answerKey ("e.g. " removed, first alternative); where answerKey is a description of the answer ("classroom noun", "day name",
#    "tall/short") or a frame with "...", an authored sentence that answers the prompt with an accepted word (recorded with keySource "authored").
# Run: python3 src/offline/esl6_answers_build.py   (rewrites both JSON files; then run esl6Study.ts answercheck)
import glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..')); REPO = os.path.normpath(os.path.join(ROOT, '..', '..'))
GAP = ['EN-F-A1-GR-possessive-adjectives', 'EN-F-A1-VO-common-adjectives', 'EN-F-A2-VO-make-do']
ITEMS = {}; BY_OUT = {}
for f in sorted(glob.glob(os.path.join(REPO, 'data/assessments/outcomes/*.json'))):
    d = json.load(open(f))
    if d['outcomeId'] in GAP: continue
    BY_OUT[d['outcomeId']] = d
    for form, its in d['forms'].items():
        for it in its: ITEMS[it['id']] = it

# ------------------------------------------------------------------------------------------------ authored key sentences
AUTH_KEY = {
    'EN-F-A1-GR-can-ability-A-9': 'I can speak Arabic and English.', 'EN-F-A1-GR-can-ability-B-9': 'I can play football and tennis.', 'EN-F-A1-GR-can-ability-C-9': 'I can carry boxes.',
    'EN-F-A1-GR-copula-be-B-9': 'I am twenty years old.', 'EN-F-A1-GR-copula-be-C-9': 'I am at home.',
    'EN-F-A2-GR-past-simple-irregular-A-9': 'I had bread and beans.', 'EN-F-A2-GR-past-simple-irregular-B-9': 'I went to Alexandria.', 'EN-F-A2-GR-past-simple-irregular-C-9': 'I saw the pyramids.',
    'EN-F-A1-VO-classroom-objects-A-7': 'There is a pencil in my school bag.', 'EN-F-A1-VO-classroom-objects-A-8': 'There is a map on the classroom wall.',
    'EN-F-A1-VO-classroom-objects-B-7': 'I use a pen in class every day.', 'EN-F-A1-VO-classroom-objects-B-8': 'There are twenty desks in my classroom.',
    'EN-F-A1-VO-classroom-objects-C-7': 'There is a sharpener in my pencil case.', 'EN-F-A1-VO-classroom-objects-C-8': 'There is a board at the front of the classroom.',
    'EN-F-A1-VO-days-months-A-7': 'My favourite day is Wednesday.', 'EN-F-A1-VO-days-months-A-8': 'My birthday is in February.',
    'EN-F-A1-VO-days-months-B-7': 'I go shopping on Tuesday.', 'EN-F-A1-VO-days-months-B-8': 'We have a school holiday in August.',
    'EN-F-A1-VO-days-months-C-7': 'I play football on Thursday.', 'EN-F-A1-VO-days-months-C-8': 'I like October because it is cool.',
    'EN-F-A1-VO-family-A-7': 'My grandfather is very kind.', 'EN-F-A1-VO-family-A-8': 'My uncle lives in Giza.', 'EN-F-A1-VO-family-B-7': 'My grandmother makes good bread.',
    'EN-F-A1-VO-family-B-8': 'My aunt is a nurse.', 'EN-F-A1-VO-family-C-7': 'My brother plays football.', 'EN-F-A1-VO-family-C-8': 'My cousin lives in Cairo.',
    'EN-F-A1-VO-food-drink-A-7': 'I like bananas.', 'EN-F-A1-VO-food-drink-A-8': 'I drink tea in the morning.', 'EN-F-A1-VO-food-drink-B-8': 'I drink milk in the evening.', 'EN-F-A1-VO-food-drink-C-8': 'I drink cold water when I am hot.',
    'EN-F-A1-GR-article-the-A-8': 'the letter was from my aunt.', 'EN-F-A1-GR-article-the-B-8': 'I gave the key to a police officer.', 'EN-F-A1-GR-article-the-C-8': 'the cake was delicious.', 'EN-F-A1-VO-food-drink-B-7': 'I like carrots.', 'EN-F-A1-VO-food-drink-C-7': 'I eat rice for lunch.',
    'EN-F-A1-VO-home-rooms-A-7': 'My favourite room is my bedroom.', 'EN-F-A1-VO-home-rooms-A-8': 'I clean the kitchen every week.',
    'EN-F-A1-VO-home-rooms-B-7': 'The biggest room in my home is the living room.', 'EN-F-A1-VO-home-rooms-B-8': 'I use the bathroom every morning.',
    'EN-F-A1-VO-home-rooms-C-7': 'The smallest room in my home is the bathroom.', 'EN-F-A1-VO-home-rooms-C-8': 'I use the dining room in the evening.',
    'EN-F-A1-VO-numbers-time-A-7': 'I get up at seven o\'clock.', 'EN-F-A1-VO-numbers-time-A-8': 'A cup of tea is five pounds.',
    'EN-F-A1-VO-numbers-time-B-7': 'I have lunch at half past one.', 'EN-F-A1-VO-numbers-time-B-8': 'The book is fifty pounds.',
    'EN-F-A1-VO-numbers-time-C-7': 'I go to bed at eleven o\'clock.', 'EN-F-A1-VO-numbers-time-C-8': 'The T-shirt is seventy pounds.',
    'EN-F-A2-VO-appearance-A-7': 'I have short black hair.', 'EN-F-A2-VO-appearance-A-8': 'My friend is tall.', 'EN-F-A2-VO-appearance-B-7': 'I have brown eyes.',
    'EN-F-A2-VO-appearance-B-8': 'My father is tall.', 'EN-F-A2-VO-appearance-C-7': 'My friend has long curly hair.', 'EN-F-A2-VO-appearance-C-8': 'I am short.',
    'EN-F-A2-VO-clothes-shopping-A-7': 'I wear a blue shirt at the weekend.', 'EN-F-A2-VO-clothes-shopping-A-8': 'Can I have this shirt in medium, please?',
    'EN-F-A2-VO-clothes-shopping-B-7': 'I wear a white shirt to school.', 'EN-F-A2-VO-clothes-shopping-B-8': 'Do you have this dress in red?',
    'EN-F-A2-VO-clothes-shopping-C-7': 'I wear a yellow T-shirt in summer.', 'EN-F-A2-VO-clothes-shopping-C-8': 'How much is this jacket?',
    'EN-F-A2-VO-jobs-workplaces-A-7': 'A waiter works in a restaurant.', 'EN-F-A2-VO-jobs-workplaces-A-8': 'A dentist works in a clinic.',
    'EN-F-A2-VO-jobs-workplaces-B-7': 'A nurse works in a hospital.', 'EN-F-A2-VO-jobs-workplaces-B-8': 'A farmer works on a farm.',
    'EN-F-A2-VO-jobs-workplaces-C-7': 'A mechanic works in a garage.', 'EN-F-A2-VO-jobs-workplaces-C-8': 'A pilot works at an airport.',
    'EN-F-A2-VO-weather-A-7': 'It is hot this morning.', 'EN-F-A2-VO-weather-A-8': 'It is cold in winter.', 'EN-F-A2-VO-weather-B-7': 'The streets are wet after the rain.',
    'EN-F-A2-VO-weather-B-8': 'It is warm in spring.', 'EN-F-A2-VO-weather-C-7': 'It is dry in the desert.', 'EN-F-A2-VO-weather-C-8': 'It is warm in spring.',
    # after the first answercheck run: the bank key B-7 used "half", whose W1 form "halv" the grader accepts; a time with f keeps the item probing W1
    'EN-F-A1-VO-numbers-time-B-7': "I have lunch at five o'clock.",
    # after the first answercheck run: the grader reads "have" in "I have usually tea" as an auxiliary; a main verb other than have keeps W1 visible
    'EN-F-A2-GR-frequency-adverbs-C-7': 'I usually drink tea at seven.',
}
AUTH_KEY = {k: v for k, v in AUTH_KEY.items() if v}


def key_of(it):
    if it['id'] in AUTH_KEY: return AUTH_KEY[it['id']], 'authored'
    k = re.sub(r'^e\.g\.\s*', '', it['answerKey']).split(' / ')[0].strip()
    return k, ('answerKey_first_alternative' if ' / ' in it['answerKey'] else 'answerKey')


def core(prompt):
    """the sentence of an error-correction / rewrite prompt (instruction before the first ': ' removed)."""
    return prompt.split(': ', 1)[1].strip() if ': ' in prompt else prompt.strip()


def sub1(s, pat, rep, flags=0):
    out, n = re.subn(pat, rep, s, count=1, flags=flags)
    assert n == 1, (s, pat)
    return out


def letter_of(prompt, pred):
    """letter of the first option (a)/(b)/(c) whose text satisfies pred."""
    opts = re.findall(r'\(([abc])\)\s*([^()]*?)(?=\s*\([abc]\)|$)', prompt)
    for l, t in opts:
        if pred(t.strip()): return l
    raise AssertionError(('no option', prompt))


def paren_opts(prompt):
    m = re.search(r'\(([^()]*/[^()]*)\)', prompt); return [x.strip() for x in m.group(1).split('/')] if m else []


ORD = {}  # item id -> (probes, {Wk: wrong}, note)
def put(it, probes, wrong=None, note=''):
    wrong = wrong or {}
    assert sorted(probes) == sorted(wrong), (it['id'], probes, wrong)
    ORD[it['id']] = (probes, wrong, note)


def pos(it): return int(it['id'].rsplit('-', 1)[1])
def form(it): return it['id'].rsplit('-', 2)[1]


# ------------------------------------------------------------------------------------------------ per outcome
def o_aan(it, k):
    p = pos(it)
    if p in (1, 2, 4): return put(it, ['W2'], {'W2': 'a'}, '"a or an" options: omission not possible (4a) -> W2 only')
    if p == 3: return put(it, [], {}, 'key "a": W2 ("a" everywhere) gives the key; omission not an option')
    if p == 5:
        w = {'W1': core(it['prompt'])}
        if re.search(r'\ban\b', k): w['W2'] = sub1(k, r'\ban\b', 'a')
        return put(it, sorted(w), w, 'omission shown (W1); W2 only if the corrected article is "an"')
    if p == 6: return put(it, ['W1', 'W2'], {'W2': core(it['prompt']), 'W1': sub1(k, r'\ban ', '')}, 'a-before-vowel shown (W2); W1 omission can occur')
    if p in (7, 8):
        w = {'W1': sub1(k, r'\b(an?) ', '')}
        if re.search(r'\ban\b', k): w['W2'] = sub1(k, r'\ban\b', 'a')
        return put(it, sorted(w), w, 'free: W2 only when the key sentence needs "an"')
    if p == 9:
        return put(it, ['W1', 'W2'], {'W1': re.sub(r'\ban? ', '', k), 'W2': re.sub(r'\ban\b', 'a', k)}, 'transfer list')


def o_the(it, k):
    p = pos(it)
    if p in (1, 2, 3, 4): return put(it, ['W1'], {'W1': 'a'}, '"a or the": W1 drops "the" for the known thing -> "a" (4a ESL6 note)')
    if p in (5, 6): return put(it, ['W1'], {'W1': core(it['prompt'])}, 'error shown is W1 (omission for a known thing / the with a general noun)')
    if p in (7, 8): return put(it, ['W1'], {'W1': sub1(k, r'\bthe ', '', re.I)}, 'free: "the" left out for the known thing')
    if p == 9: return put(it, ['W1'], {'W1': 'A, a'}, 'transfer: known things given "a"')


def o_cop(it, k):
    p = pos(it)
    if p in (1, 2, 4): return put(it, ['W2'], {'W2': 'is'}, '"am, is or are" options: omission not possible -> C2/W2 only (4a)')
    if p == 3: return put(it, [], {}, 'key "is": W2 gives the key; omission not an option')
    if p == 5: return put(it, ['W1'], {'W1': core(it['prompt'])}, 'omission shown (W1); W2 gives "is" = key')
    if p == 6: return put(it, ['W1', 'W2'], {'W2': core(it['prompt']), 'W1': sub1(k, r' are ', ' ')}, 'be_agreement_plural mapped to W2 ("is" with every subject); W1 omission can occur')
    if p in (7, 8, 9):
        w = {'W1': sub1(k, r'\b(am|is|are) ', '', re.I)}
        if re.search(r'\b(am|are)\b', k): w['W2'] = sub1(k, r'\b(am|are)\b', 'is')
        return put(it, sorted(w), w, 'free: W2 only when the key subject needs am/are')


def o_s3(it, k):
    p = pos(it); stem = {'drives': 'drive', 'washes': 'wash', 'cries': 'cry', 'sleeps': 'sleep', 'rides': 'ride', 'finishes': 'finish', 'flies': 'fly', 'runs': 'run',
                         'makes': 'make', 'brushes': 'brush', 'studies': 'study', 'opens': 'open'}
    bad = {'washes': 'washs', 'cries': 'crys', 'finishes': 'finishs', 'flies': 'flys', 'brushes': 'brushs', 'studies': 'studys'}
    if p in (1, 2, 3):
        w = {'W1': stem[k]}
        if k in bad: w['W2'] = bad[k]
        return put(it, sorted(w), w, 'he/she/it subject: W1; W2 only for -es/-ies stems (4a)')
    if p == 4: return put(it, ['W1'], {'W1': stem[k]}, 'choice of plain stem vs -s: W1 only')
    if p == 5: return put(it, ['W1'], {'W1': core(it['prompt'])}, 'omission shown (W1); plain stem: no W2')
    if p == 6:
        v = re.search(r'\b(\w+(?:ches|shes))\b', k).group(1)
        return put(it, ['W1', 'W2'], {'W2': core(it['prompt']), 'W1': sub1(k, rf'\b{v}\b', v[:-2])}, '-es misspelt shown (W2); W1 can occur')
    if p in (7, 8):
        v = re.search(r'\b(\w+s)\b(?= )', re.sub(r'^(My \w+|\w+) ', '', k)).group(1)
        return put(it, ['W1'], {'W1': sub1(k, rf'\b{v}\b', v[:-1])}, 'free: plain -s verb, so W2 cannot show')
    if p == 9:
        v = {'goes': ('go', 'gos'), 'watches': ('watch', 'watchs'), 'does': ('do', 'dos')}
        vb = next(x for x in v if re.search(rf'\b{x}\b', k))
        return put(it, ['W1', 'W2'], {'W1': sub1(k, rf'\b{vb}\b', v[vb][0]), 'W2': sub1(k, rf'\b{vb}\b', v[vb][1])}, 'transfer: -es stem, W1 and W2')


def o_pc(it, k):
    p = pos(it)
    third = lambda v: v + ('es' if re.search(r'(sh|ch|s|x|o)$', v) else 's')
    def parts(s):
        m = re.search(r'\b(am|is|are) (\w+)ing\b', s); return m
    def base(ing):
        b = {'play': 'play', 'cook': 'cook', 'sleep': 'sleep', 'sing': 'sing', 'wait': 'wait', 'read': 'read', 'walk': 'walk', 'talk': 'talk', 'sitt': 'sit', 'tak': 'take',
             'watch': 'watch', 'call': 'call', 'stand': 'stand', 'rid': 'ride', 'wash': 'wash', 'study': 'study', 'buy': 'buy', 'sitting': 'sit'}
        return b[ing]
    def w2(s):
        m = parts(s); aux, ing = m.group(1), m.group(2); b = base(ing); v = third(b) if aux == 'is' else b
        return s[:m.start()] + v + s[m.end():]
    def w1(s):
        m = parts(s); return s[:m.start()] + m.group(2) + 'ing' + s[m.end():]
    if p in (1, 2, 3):
        m = re.match(r'(am|is|are) (\w+)ing$', k); b = base(m.group(2)); return put(it, ['W1', 'W2'], {'W1': m.group(2) + 'ing', 'W2': third(b) if m.group(1) == 'is' else b}, 'open gap with the verb given: W1 (-ing alone) and W2 (plain present)')
    if p == 4: return put(it, ['W2'], {'W2': paren_opts(it['prompt'])[0]}, 'choice plain present vs be + -ing: W2 only')
    if p == 5: return put(it, ['W1', 'W2'], {'W1': core(it['prompt']), 'W2': w2(k)}, 'be omitted shown (W1); W2 can occur')
    if p == 6: return put(it, ['W1', 'W2'], {'W2': core(it['prompt']), 'W1': w1(k)}, 'plain present shown (W2); W1 can occur')
    if p in (7, 8, 9): return put(it, ['W1', 'W2'], {'W1': w1(k), 'W2': w2(k)}, 'free')


def o_reg(it, k):
    p = pos(it); base = {'visited': 'visit', 'cleaned': 'clean', 'stopped': 'stop', 'studied': 'study', 'called': 'call', 'washed': 'wash', 'dropped': 'drop', 'carried': 'carry',
                         'helped': 'help', 'fixed': 'fix', 'clapped': 'clap', 'copied': 'copy', 'travelled': 'travel', 'tried': 'try', 'moved': 'move', 'cried': 'cry', 'arrived': 'arrive',
                         'walked': 'walk', 'cooked': 'cook', 'watched': 'watch', 'played': 'play', 'opened': 'open', 'visited ': 'visit', 'hurried': 'hurry', 'replied': 'reply'}
    def unpast(s): return re.sub(r'\b(' + '|'.join(sorted(base, key=len, reverse=True)) + r')\b', lambda m: base[m.group(1)], s)
    if p in (1, 2, 3, 4): return put(it, ['W1'], {'W1': base[k]}, 'W1: verb unchanged after a time word')
    if p == 5: return put(it, ['W1'], {'W1': core(it['prompt'])}, 'unchanged verb shown (W1)')
    if p == 6: return put(it, ['W1'], {'W1': unpast(k)}, 'ied_spelling is outside the row; W1 (unchanged verb) can occur in the corrected sentence')
    if p in (7, 8, 9): return put(it, ['W1'], {'W1': unpast(k)}, 'free: verbs unchanged')


def o_irr(it, k):
    p = pos(it); ed = {'went': 'goed', 'had': 'haved', 'saw': 'seed', 'bought': 'buyed', 'took': 'taked', 'ate': 'eated', 'drank': 'drinked', 'wrote': 'writed', 'came': 'comed'}
    if p in (1, 2, 3): return put(it, ['W1'], {'W1': ed[k]}, 'W1: -ed on every past verb')
    if p == 4: return put(it, ['W1'], {'W1': 'buyed'}, 'choice: W1 picks the -ed form')
    if p in (5, 6): return put(it, ['W1'], {'W1': core(it['prompt'])}, 'overregularisation / present for past are both W1 (1b: "-ed (or not changed)")')
    if p in (7, 8, 9):
        v = next(x for x in ed if re.search(rf'\b{x}\b', k)); return put(it, ['W1'], {'W1': sub1(k, rf'\b{v}\b', ed[v])}, 'free: -ed form')


def o_did(it, k):
    p = pos(it); P = core(it['prompt'])
    past = {'see': 'saw', 'buy': 'bought', 'hear': 'heard', 'finish': 'finished', 'answer': 'answered', 'enjoy': 'enjoyed', 'go': 'went', 'find': 'found', 'make': 'made',
            'visit': 'visited', 'eat': 'ate', 'leave': 'left', 'meet': 'met', 'sell': 'sold', 'start': 'started', 'miss': 'missed'}
    if p in (1, 3): return put(it, ['W2'], {'W2': ''}, 'gap for did: W2 leaves it out; W1 cannot change it')
    if p == 2: return put(it, ['W1'], {'W1': past[k]}, 'base verb after did: W1 gives the past form')
    if p == 4: return put(it, ['W1'], {'W1': paren_opts(it['prompt'])[1]}, 'choice base vs past after did: W1')
    def w1(s):
        m = re.search(r'\b(did|Did) (\w+) (\w+)', s); v = m.group(3); return s[:m.start(3)] + past[v] + s[m.end(3):]
    def w2(s):
        m = re.search(r'\b(did|Did) (\w+) (\w+)', s); v = m.group(3); out = s[:m.start()] + m.group(2) + ' ' + past[v] + s[m.end():]
        return out[0].upper() + out[1:]
    if p == 5: return put(it, ['W1', 'W2'], {'W1': P, 'W2': w2(k)}, 'did + past shown (W1); W2 (no did) can occur')
    if p == 6: return put(it, ['W1', 'W2'], {'W2': P, 'W1': w1(k)}, 'auxiliary omission shown (W2); W1 can occur')
    if p in (7, 8, 9): return put(it, ['W1', 'W2'], {'W1': w1(k), 'W2': w2(k)}, 'free')


def o_ppt(it, k):
    p = pos(it)
    if p in (1, 3, 4): return put(it, ['W1'], {'W1': 'in'}, 'W1: "in" for every time')
    if p == 2: return put(it, [], {}, 'key "in": W1 gives the key')
    if p in (5, 6): return put(it, ['W1'], {'W1': core(it['prompt'])}, '"in" for on/at shown (W1)')
    if p in (7, 8, 9):
        if not re.search(r'\b(at|on)\b', k): return put(it, [], {}, 'key uses only "in": W1 cannot change it')
        return put(it, ['W1'], {'W1': re.sub(r'\b(at|on)\b', 'in', k)}, 'free: in for at/on')


def o_there(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 4): return put(it, ['W1'], {'W1': 'There is'}, 'plural after a number/many: W1 (number not marked) -> "There is"; options exclude omission (W2)')
    if p in (2, 3): return put(it, [], {}, 'singular/uncountable: W1 cannot change it; options exclude omission')
    if p == 5: return put(it, ['W1', 'W2'], {'W1': P, 'W2': sub1(k, r'There are ', 'There ')}, 'be_agreement_plural mapped by meaning to W1 (number not marked); W2 can occur')
    if p == 6: return put(it, ['W2'], {'W2': P}, 'have_for_existential mapped by meaning to W2 (no is/are in an existential)')
    if p in (7, 8, 9):
        w = {'W2': re.sub(r'\b([Tt]here) (is|are) ', r'\1 ', k)}
        m = re.search(r'\b(are) (two|three|four|five|six|many) (\w+)', k)
        if m: w['W1'] = sub1(k, r'\bare (two|three|four|five|six|many) ', r'is \1 ')
        return put(it, sorted(w), w, 'free: W1 only with a plural after a number')


def o_can(it, k):
    p = pos(it); P = core(it['prompt'])
    s3 = lambda v: v + ('es' if re.search(r'(sh|ch|s|x|o)$', v) else 's')
    if p in (1, 2, 3): return put(it, [], {}, 'can vs can\'t: W1 (-s after can) cannot change it')
    if p == 4:
        if re.match(r'(She|He|It) ', P): return put(it, ['W1'], {'W1': paren_opts(it['prompt'])[1]}, 'he/she subject: W1 picks the -s form')
        return put(it, [], {}, 'plural subject: W1 does not fire')
    def w1(s):
        m = re.search(r"\b(can|can't) (\w+)", s); return s[:m.start(2)] + s3(m.group(2)) + s[m.end(2):]
    if p == 5: return put(it, ['W1'], {'W1': w1(k)}, 'can + to is outside the row; W1 can occur in the corrected sentence (he/she subject)')
    if p == 6: return put(it, ['W1'], {'W1': P}, '-s after can shown (W1)')
    if p in (7, 8, 9):
        if re.match(r'I ', k): return put(it, [], {}, 'I-subject: W1 (he/she/it) cannot show')
        return put(it, ['W1'], {'W1': w1(k)}, 'free: he/she subject')


def o_svo(it, k):
    p = pos(it); P = core(it['prompt'])
    def vfirst(s):
        m = re.match(r"(My \w+|We|I'll|I|\w+) (\w+) (.*)$", s); subj, v, rest = m.groups()
        if subj == "I'll": return f'Will meet I {rest}' if v == 'meet' else f'Will {v} I {rest}'
        return f'{v[0].upper() + v[1:]} {subj[0].lower() + subj[1:] if subj in ("My uncle", "My aunt", "My grandfather", "We") else subj} {rest}'
    if p in (1, 2):
        def vs(t): return bool(re.match(r'(Every \w+|In the \w+|After \w+) (\w+s) ', t))
        return put(it, ['W1'], {'W1': letter_of(it['prompt'], vs)}, 'choice: W1 picks the verb-before-subject option; no adjective (W2 not probed)')
    if p in (3, 4): return put(it, ['W1'], {'W1': vfirst(k)}, 'word order: W1 verb first; no adjective')
    if p == 5: return put(it, ['W1'], {'W1': P}, 'verb-subject order shown (W1)')
    if p == 6:
        m = re.match(r'(\w+) (\w+) (.*)$', k); return put(it, ['W1', 'W2'], {'W2': P, 'W1': f'{m.group(2)[0].upper() + m.group(2)[1:]} {m.group(1)} {m.group(3)}'}, 'noun-adjective shown (W2); W1 can occur')
    if p in (7, 8, 9): return put(it, ['W1'], {'W1': vfirst(k)}, 'free: no attributive adjective in the key sentence, so W2 cannot show')


def o_freq(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2): return put(it, ['W1'], {'W1': 'B'}, 'slot choice: W1 puts the adverb after the verb (slot B)')
    if p in (3, 4):
        return put(it, ['W1'], {'W1': letter_of(it['prompt'], lambda t: bool(re.match(r'(\w+ \w+|\w+) (\w+) (always|sometimes|usually|never) ', t)) and not re.match(r'(Always|Sometimes)', t))}, 'choice: W1 picks adverb-after-verb')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, 'adverb after the verb shown (W1)')
    m = re.search(r'\b(always|usually|sometimes|never) (\w+) ', k)
    return put(it, ['W1'], {'W1': k[:m.start()] + m.group(2) + ' ' + m.group(1) + ' ' + k[m.end():]}, 'free: adverb after the verb')


def o_comp(it, k):
    p = pos(it); P = core(it['prompt'])
    sound = {'faster': 'fastr', 'quicker': 'quickr', 'cheaper': 'cheapr', 'bigger': 'biger', 'taller': 'tallr', 'older': 'oldr', 'newer': 'newr'}
    if p == 1: return put(it, ['W1'], {'W1': sound[k]}, 'comparative spelled by sound (W1)')
    if p == 2: return put(it, [], {}, 'more + long adjective: the -er spelling (W1) is not involved')
    if p == 3: return put(it, ['W1'], {'W1': paren_opts(it['prompt'])[1]}, 'doubling choice: W1 picks the undoubled form')
    if p == 4: return put(it, ['W1'], {'W1': paren_opts(it['prompt'])[2]}, 'y->ier choice: W1 picks the spelled-by-sound form')
    if p == 5: return put(it, ['W1'], {'W1': P}, 'missing doubling shown (W1)')
    if p == 6: return put(it, [], {}, 'double comparative is outside the row: no seeded belief')
    v = next((x for x in sound if re.search(rf'\b{x}\b', k)), None)
    if not v: return put(it, [], {}, 'key uses more + long adjective: W1 cannot show')
    return put(it, ['W1'], {'W1': sub1(k, rf'\b{v}\b', sound[v])}, 'free: -er form by sound')


def o_conj(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2, 4): return put(it, ['W1'], {'W1': 'and'}, 'W1: "and" whatever the meaning')
    if p == 3: return put(it, [], {}, 'key "and": W1 gives the key')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, '"and" for because/but shown (W1)')
    return put(it, ['W1'], {'W1': re.sub(r',? \b(because|but)\b', ' and', k, count=1)}, 'free: "and" for because/but')


def o_caps(it, k):
    p = pos(it); P = core(it['prompt'])
    low = lambda s: re.sub(r'[.]', '', s).lower().strip()
    if p in (1, 2): return put(it, ['W1'], {'W1': letter_of(it['prompt'], lambda t: t[:1].islower() or not t.endswith('.'))}, 'choice: W1 picks an option without capitals/full stop')
    if p in (3, 4, 5, 6, 9): return put(it, ['W1'], {'W1': P if p != 6 else P}, 'the uncapitalised / run-on text shown is W1 (no_case_distinction mapped to W1 by meaning)')
    return put(it, ['W1'], {'W1': low(k)}, 'free: no capitals, no full stop')


def o_goingto(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2): return put(it, ['W1'], {'W1': ''}, 'gap for am/is/are: W1 leaves it empty')
    if p == 3: return put(it, ['W1'], {'W1': 'going to'}, 'choice: W1 picks "going to" without be')
    if p == 4: return put(it, [], {}, 'no option without be: W1 cannot change it')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, 'be omitted shown (W1)')
    return put(it, ['W1'], {'W1': sub1(k, r'\b(am|is|are) going to\b', 'going to')}, 'free: be omitted')


def o_much(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2, 3, 4): return put(it, ['W1'], {'W1': {'many': 'much', 'much': 'many'}[k]}, 'W1: one word for both')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, 'wrong quantifier shown (W1)')
    m = re.search(r'\b(much|many|Many)\b', k); r = {'much': 'many', 'many': 'much', 'Many': 'Much'}[m.group(1)]
    return put(it, ['W1'], {'W1': k[:m.start()] + r + k[m.end():]}, 'free: the other quantifier')


def o_some(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (2, 3): return put(it, ['W1'], {'W1': 'some'}, 'W1: "some" in every sentence (1b example)')
    if p in (1, 4): return put(it, [], {}, 'key "some": W1 gives the key')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, 'wrong some/any shown (W1: "some (or any) fits every sentence")')
    if re.search(r'\bany\b', k): return put(it, ['W1'], {'W1': sub1(k, r'\bany\b', 'some')}, 'free: some for any')
    return put(it, [], {}, 'key uses "some": W1 gives the key')


def o_polite(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2): return put(it, [], {}, 'the gap frame (_ I have / I _ like) leaves no place for a bare imperative or "I want"')
    if p == 3: return put(it, ['W1'], {'W1': letter_of(it['prompt'], lambda t: t.startswith('Give me'))}, 'choice: W1 picks the bare imperative')
    if p == 4: return put(it, ['W1'], {'W1': letter_of(it['prompt'], lambda t: t.startswith('I want'))}, 'choice: W1 picks "I want"')
    if p in (5, 6): return put(it, ['W1'], {'W1': P}, 'direct request shown (W1)')
    if k.startswith('Can I have'): return put(it, ['W1'], {'W1': re.sub(r'^Can I have (.*?), please\?$', r'Give me \1.', k)}, 'free: bare imperative')
    return put(it, ['W1'], {'W1': re.sub(r'^I would like (.*?), please\.$', r'I want \1.', k)}, 'free: "I want"')


# vocabulary outcomes: target word per item and its Wk forms
def word_item(it, k, target, forms, note):
    """forms: {Wk: replacement of `target` in k} (only Wk listed are probed)."""
    w = {x: (sub1(k, rf'\b{re.escape(target)}\b', r, re.I) if target else r) for x, r in forms.items()}
    put(it, sorted(w), w, note)


VOWEL = {'grandmother': 'grandmather', 'cousin': 'cousn', 'grandfather': 'grandfathr', 'uncle': 'uncl', 'father': 'fathr', 'daughter': 'doughter', 'son': 'sun', 'aunt': 'ant',
         'brother': 'brothr', 'wife': 'wif', 'children': 'childrn', 'husband': 'husbnd', 'mother': 'mothr',
         'kitchen': 'kitchn', 'bathroom': 'bathrom', 'bedroom': 'bedrom', 'garden': 'gardn', 'living room': 'leving room', 'dining room': 'dinin room',
         'Tuesday': 'Tusday', 'February': 'Febuary', 'Wednesday': 'Wensday', 'August': 'Agust', 'Thursday': 'Thrusday', 'September': 'Septmber', 'January': 'Janury',
         'Friday': 'Fridy', 'Saturday': 'Saterday', 'May': 'Mai', 'June': 'Jun', 'October': 'Octobr',
         'nurse': 'nurs', 'cook': 'cok', 'teacher': 'techer', 'mechanic': 'mechanc', 'lawyer': 'lawyr', 'hairdresser': 'hairdressr', 'shop assistant': 'shop asistant',
         'receptionist': 'receptionst', 'driver': 'drivr', 'waiter': 'waitr', 'dentist': 'dentest', 'farmer': 'farmr', 'pilot': 'pilt', 'artist': 'artest', 'engineer': 'engeneer',
         'rainy': 'rany', 'windy': 'windi', 'snowy': 'snowi', 'cloudy': 'clody', 'sunny': 'suny', 'cold': 'culd', 'hot': 'hut', 'wet': 'wit', 'warm': 'worm', 'dry': 'dri'}
MONTH_NO = {'January': 'month one', 'February': 'month two', 'March': 'month three', 'April': 'month four', 'May': 'month five', 'June': 'month six', 'July': 'month seven',
            'August': 'month eight', 'September': 'month nine', 'October': 'month ten', 'November': 'month eleven', 'December': 'month twelve'}
FV = lambda w: w.replace('f', 'v') if 'f' in w else w.replace('v', 'f')
PB = lambda w: w.replace('p', 'b') if 'p' in w else w.replace('b', 'p')


def o_family(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2): return word_item(it, k, None, {'W1': VOWEL[k]}, 'kin word written: W1 vowel slip; W2 (one word, two meanings) not involved')
    if p in (3, 4): return put(it, [], {}, 'choice of spelled options: no seeded belief changes it')
    if p == 5: return put(it, ['W1'], {'W1': P}, 'vowel slip shown (W1)')
    if p == 6:
        t = next(x for x in ('wife', 'children', 'husband') if re.search(rf'\b{x}\b', k))
        return put(it, ['W1', 'W2'], {'W2': P, 'W1': sub1(k, rf'\b{t}\b', VOWEL[t])}, 'lexical transfer shown (W2); W1 vowel slip on the target word can occur')
    if p in (7, 8):
        t = next(x for x in ('grandfather', 'grandmother', 'uncle', 'aunt', 'brother', 'cousin') if re.search(rf'\b{x}\b', k)); return word_item(it, k, t, {'W1': VOWEL[t]}, 'free: W1 on the kin word')
    if p == 9: return word_item(it, k, None, {'W1': VOWEL[k]}, 'one word: W1')


def o_home(it, k):
    p = pos(it); P = core(it['prompt']); calq = {'bedroom': 'sleeping room', 'dining room': 'eating room'}
    def both(t, kk, note):
        f = {'W1': VOWEL[t]}
        if t in calq: f['W2'] = calq[t]
        return word_item(it, kk, t if kk != t else None, f, note)
    if p in (1, 2): return both(k, k, 'room word written: W1; W2 only where Arabic names the room with a phrase (bedroom, dining room)')
    if p in (3, 4): return put(it, [], {}, 'choice of given words: no seeded belief changes it')
    if p == 5:
        t = next(x for x in ('bedroom', 'living room', 'kitchen') if x in k); f = {'W1': P}
        if t in calq: f['W2'] = sub1(k, t, calq[t])
        return put(it, sorted(f), f, 'vowel slip shown (W1); W2 if the room has an Arabic phrase name')
    if p == 6:
        t = next(x for x in ('dining room', 'bedroom') if x in k); return put(it, ['W1', 'W2'], {'W2': P, 'W1': sub1(k, t, VOWEL[t])}, 'calque shown (W2); W1 on the room word')
    if p in (7, 8):
        t = next(x for x in ('living room', 'dining room', 'bedroom', 'bathroom', 'kitchen', 'garden') if x in k); return both(t, k, 'free: W1 on the room word; W2 if bedroom/dining room')
    if p == 9: return both(k, k, 'one or two words')


def o_days(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2, 9):
        f = {'W1': VOWEL[k]}
        if k in MONTH_NO: f['W2'] = MONTH_NO[k]
        return word_item(it, k, None, f, 'day/month written: W1; W2 only for a month')
    if p in (3, 4): return put(it, ['W1'], {'W1': paren_opts(it['prompt'].replace('Choose the correct word ', ''))[1]}, 'choice between spellings: W1 picks the vowel-slip spelling; W2 not an option')
    if p == 5:
        mth = next(x for x in MONTH_NO if re.search(rf'\b{x}\b', k)); return put(it, ['W1', 'W2'], {'W1': P, 'W2': sub1(k, rf'\bin {mth}\b', f'in {MONTH_NO[mth]}')}, 'vowel slip shown (W1); W2 numbered month can occur')
    if p == 6:
        mth = next(x for x in MONTH_NO if re.search(rf'\b{x}\b', k)); return put(it, ['W1', 'W2'], {'W2': P, 'W1': sub1(k, rf'\b{mth}\b', VOWEL[mth])}, 'numbered month shown (W2); W1 on the month word')
    t = next(x for x in VOWEL if re.search(rf'\b{x}\b', k) and x[0].isupper()); f = {'W1': sub1(k, rf'\b{t}\b', VOWEL[t])}
    if t in MONTH_NO: f['W2'] = sub1(k, rf'\bin {t}\b', f'in {MONTH_NO[t]}') if re.search(rf'\bin {t}\b', k) else sub1(k, rf'\b{t}\b', MONTH_NO[t])
    return put(it, sorted(f), f, 'free: W1 on the day/month word; W2 only for a month')


def o_food(it, k):
    p = pos(it); P = core(it['prompt'])
    if p == 6: return put(it, ['W1'], {'W1': P}, '"drink" for soup shown (W1)')
    return put(it, [], {}, 'no soup/spoon food in the item: W1 (soup is drunk) cannot change it' + (' (lexical_sound_confusion is outside the row)' if p == 5 else ''))


def o_cls(it, k):
    p = pos(it); P = core(it['prompt'])
    words = ['pencil case', 'pencil', 'pen', 'desks', 'board', 'map', 'paper', 'page', 'desk', 'library', 'sharpener', 'calculator', 'ruler']
    if p in (1, 2, 9):
        if re.search(r'[pbfv]', k): return word_item(it, k, None, {'W1': PB(k) if re.search('[pb]', k) else FV(k)}, 'word written: W1 (p/b, f/v) only if the word has one of these letters; W2 not involved in a one-word answer')
        return put(it, [], {}, 'word has no p/b/f/v: W1 cannot change it')
    if p in (3, 4): return put(it, [], {}, 'choice of given words: no seeded belief changes it')
    if p == 5: return put(it, ['W1'], {'W1': P}, 'p/b slip shown (W1)')
    if p == 6:
        t = next(x for x in ('page', 'desk', 'library') if re.search(rf'\b{x}\b', k)); f = {'W2': P}
        if re.search('[pbfv]', t): f['W1'] = sub1(k, rf'\b{t}\b', PB(t))
        return put(it, sorted(f), f, 'word-for-word transfer shown (W2); W1 if the target word has p/b')
    t = next(x for x in words if re.search(rf'\b{x}\b', k)); f = {}
    if re.search('[pbfv]', t): f['W1'] = sub1(k, rf'\b{t}\b', PB(t) if re.search('[pb]', t) else FV(t))
    return put(it, sorted(f), f, 'free: W1 on the classroom word if it has p/b/f/v')


def o_num(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2, 9):
        if re.search('[fv]', k): return word_item(it, k, None, {'W1': FV(k)}, 'number word written: W1 if it has f/v')
        return put(it, [], {}, 'no f/v in the word: W1 cannot change it; W2 (clock for hour) not involved')
    if p in (3, 4): return put(it, [], {}, 'choice of given words: no seeded belief changes it')
    if p == 5:
        if 'fivteen' in P: return put(it, ['W1'], {'W1': P}, 'f/v slip shown (W1)')
        t = re.search(r'\b(fourteen|nine)\b', k).group(1)
        if 'f' in t: return put(it, ['W1'], {'W1': sub1(k, rf'\b{t}\b', FV(t))}, 'spelling_vowel is not seeded (1b row 25); W1 f/v can occur on the number word')
        return put(it, [], {}, 'spelling_vowel is not seeded; no f/v in the number word')
    if p == 6: return put(it, ['W2'], {'W2': P}, 'clock for hour shown (W2); no f/v in the corrected sentence')
    t = re.search(r'\b(seven|five|half|eleven|fifty|seventy)\b', k).group(1); return put(it, ['W1'], {'W1': sub1(k, rf'\b{t}\b', FV(t))}, 'free: W1 on the number word; no hour phrase (W2 cannot show)')


def o_jobs(it, k):
    p = pos(it); P = core(it['prompt'])
    if p in (1, 2, 9): return word_item(it, k, None, {'W1': VOWEL[k]}, 'job word written: W1')
    if p in (3, 4): return put(it, [], {}, 'choice of given words: no seeded belief changes it')
    if p == 5:
        t = next(x for x in ('cook', 'driver', 'teacher') if re.search(rf'\b{x}\b', k)); return put(it, ['W1'], {'W1': sub1(k, rf'\b{t}\b', VOWEL[t])}, 'agent-noun error is outside the row; W1 can occur on the job word')
    if p == 6: return put(it, ['W1'], {'W1': P}, 'vowel slip shown (W1)')
    t = next(x for x in ('waiter', 'dentist', 'nurse', 'farmer', 'mechanic', 'pilot') if re.search(rf'\b{x}\b', k)); return put(it, ['W1'], {'W1': sub1(k, rf'\b{t}\b', VOWEL[t])}, 'free: W1 on the job word')


def o_weather(it, k):
    p = pos(it); P = core(it['prompt']); noun = {'rainy': 'rain', 'windy': 'wind', 'snowy': 'snow', 'cloudy': 'cloud', 'sunny': 'sun'}
    if p in (1, 2, 9):
        f = {'W2': VOWEL[k]}
        if k in noun: f['W1'] = noun[k]
        return word_item(it, k, None, f, 'adjective written: W2 vowel slip; W1 (noun) only for -y adjectives made from a noun')
    if p in (3, 4): return put(it, ['W1'], {'W1': paren_opts(it['prompt'].replace('Choose the correct word ', ''))[1]}, 'choice adjective vs noun: W1 picks the noun; spelled options exclude W2')
    if p == 5:
        t = re.search(r'\b(wet|cloudy|hot)\b', k).group(1); f = {'W2': P}
        if t in noun: f['W1'] = sub1(k, rf'\b{t}\b', noun[t])
        return put(it, sorted(f), f, 'vowel slip shown (W2); W1 only for a -y adjective from a noun')
    if p == 6:
        t = re.search(r'\b(rainy|sunny|cloudy)\b', k).group(1); return put(it, ['W1', 'W2'], {'W1': P, 'W2': sub1(k, rf'\b{t}\b', VOWEL[t])}, 'noun for adjective shown (W1); W2 on the adjective')
    t = re.search(r'\b(hot|cold|wet|warm|dry)\b', k).group(1); return put(it, ['W2'], {'W2': sub1(k, rf'\b{t}\b', VOWEL[t])}, 'free: W2 on the adjective; W1 not involved (no noun form used as description)')


def o_app(it, k):
    p = pos(it); P = core(it['prompt'])
    if p == 5: return put(it, ['W1'], {'W1': P}, 'adjective after noun shown (W1)')
    if p == 7:
        m = re.search(r'\b(have|has) ((?:\w+ )+?)(hair|eyes)\.$', k); return put(it, ['W1'], {'W1': k[:m.start(2)] + m.group(3) + ' ' + m.group(2).strip() + '.'}, 'free: adjectives after the noun')
    return put(it, [], {}, 'one word / predicative adjective: W1 (adjective after noun) cannot change it' + (' (long_for_tall is outside the row)' if p == 6 else ''))


def o_clothes(it, k):
    p = pos(it); P = core(it['prompt'])
    if p == 5: return put(it, ['W1'], {'W1': P}, 'adjective after noun shown (W1)')
    if p == 7:
        m = re.search(r'\ba (\w+) (shirt|T-shirt)\b', k); return put(it, ['W1'], {'W1': k[:m.start()] + f'a {m.group(2)} {m.group(1)}' + k[m.end():]}, 'free: colour after the noun')
    return put(it, [], {}, 'no attributive colour/size before a noun: W1 cannot change it' + (' (collocation error is outside the row)' if p == 6 else ''))


FN = {'EN-F-A1-GR-article-a-an': o_aan, 'EN-F-A1-GR-article-the': o_the, 'EN-F-A1-GR-copula-be': o_cop, 'EN-F-A2-GR-third-person-s': o_s3, 'EN-F-A2-GR-present-continuous': o_pc,
      'EN-F-A2-GR-past-simple-regular': o_reg, 'EN-F-A2-GR-past-simple-irregular': o_irr, 'EN-F-A2-GR-past-questions-did': o_did, 'EN-F-A1-GR-prepositions-time': o_ppt,
      'EN-F-A1-GR-there-is-are': o_there, 'EN-F-A1-GR-can-ability': o_can, 'EN-F-A1-GR-word-order-svo': o_svo, 'EN-F-A2-GR-frequency-adverbs': o_freq,
      'EN-F-A2-GR-comparatives': o_comp, 'EN-F-A2-GR-going-to': o_goingto, 'EN-F-A2-GR-much-many': o_much, 'EN-F-A2-GR-some-any': o_some, 'EN-F-A2-GR-conjunctions': o_conj,
      'EN-F-A1-GR-capitals-full-stops': o_caps, 'EN-F-A1-VO-family': o_family, 'EN-F-A1-VO-food-drink': o_food, 'EN-F-A1-VO-classroom-objects': o_cls,
      'EN-F-A1-VO-home-rooms': o_home, 'EN-F-A1-VO-numbers-time': o_num, 'EN-F-A1-VO-days-months': o_days, 'EN-F-A2-VO-jobs-workplaces': o_jobs,
      'EN-F-A2-VO-weather': o_weather, 'EN-F-A2-VO-clothes-shopping': o_clothes, 'EN-F-A2-VO-appearance': o_app, 'EN-F-A2-FN-polite-requests': o_polite}
assert sorted(FN) == sorted(BY_OUT), set(FN) ^ set(BY_OUT)

# manual overrides after the first answercheck run (each with its reason)
OVERRIDE = {}
def _ov(i, probes, wrong, note): OVERRIDE[i] = (probes, wrong, note)
for f_, w_ in (('A', 'Meet I you at the café at six.'), ('B', 'See I you at the station at nine.'), ('C', 'Wait I for you at the bus stop at eight.')):
    _ov(f'EN-F-A1-GR-word-order-svo-{f_}-9', ['W1'], {'W1': w_}, 'transfer: verb before subject ("I\'ll" frame dropped; the first draft "Will meet I you" read as a question to the grader)')
_ov('EN-F-A1-VO-classroom-objects-A-7', ['W1'], {'W1': 'There is a bencil in my school pag.'}, 'free: W1 (p = b) on every classroom word of the sentence (first draft changed only "pencil" and "bag" kept the score full)')
_ov('EN-F-A1-VO-classroom-objects-C-7', ['W1'], {'W1': 'There is a sharbener in my bencil case.'}, 'free: W1 (p = b) on every classroom word of the sentence')
for i_, w_ in (('A-7', 'A waitr works in a restrant.'), ('A-8', 'A dentest works in a clinc.'), ('B-7', 'A nurs works in a hospitl.'), ('B-8', 'A farmr works on a frm.'),
               ('C-7', 'A mechanc works in a garag.'), ('C-8', 'A pilt works at an airprt.')):
    _ov(f'EN-F-A2-VO-jobs-workplaces-{i_}', ['W1'], {'W1': w_}, 'free: W1 (vowels left out) on the job word and its workplace word (1b C: "each job word goes with its workplace and is spelled with its vowels"); job word alone kept the score full')

# Grader-blind wrong answers (reported, not fixable in the data without misrepresenting the belief): the deterministic grader gives full points to the
# faithful wrong string. The belief still fires and the answer is this string (it scores full, like the key), so the item cannot differ between a
# learner with and without the belief. Listed separately in WRONG_ANSWERS.json (graderBlind) and counted in the report.
GRADER_BLIND = {}
for f_ in 'ABC':
    for p_ in (7, 8, 9): GRADER_BLIND[f'EN-F-A2-GR-conjunctions-{f_}-{p_}'] = 'conjunction rule accepts any clause-joining and/but/because; "and" for because/but (W1) is not detected'
    GRADER_BLIND[f'EN-F-A2-VO-appearance-{f_}-7'] = 'vocabulary rubric scores the appearance words, not their order; adjective after the noun (W1) scores full'
    GRADER_BLIND[f'EN-F-A2-VO-clothes-shopping-{f_}-7'] = 'vocabulary rubric scores the clothing/colour words, not their order; colour after the noun (W1) scores full'

if __name__ == '__main__':
    ibm = {'_label': 'SIMULATION ONLY', '_about': 'ESL6 item-belief map (PROTOCOL §7). Per item: probes (wrong beliefs that could change the answer, W1 before W2), key (answer string when no belief fires) and its source, note (mapping reason). Written from the bank and LEARNING_RULES §1b/§4a only, before init; authoring record src/offline/esl6_answers_build.py.', 'items': {}}
    wa = {'_label': 'SIMULATION ONLY', '_about': 'ESL6 wrong answers (PROTOCOL §7): per item and probed wrong belief, the fixed answer string showing that belief\'s error ("" = gap left empty). Written once before init, blind to arm.', 'items': {}}
    for oid, d in sorted(BY_OUT.items()):
        for fm in 'ABC':
            for it in d['forms'][fm]:
                k, src = key_of(it); FN[oid](it, k)
                probes, wrong, note = ORD[it['id']]
                if it['id'] in OVERRIDE: probes, wrong, note = OVERRIDE[it['id']]
                ibm['items'][it['id']] = {'outcome': oid, 'form': fm, 'position': pos(it), 'probes': probes or ['none'], 'key': k, 'keySource': src, 'note': note}
                if it['id'] in GRADER_BLIND: ibm['items'][it['id']]['graderBlind'] = GRADER_BLIND[it['id']]; wa.setdefault('graderBlind', {})[it['id']] = GRADER_BLIND[it['id']]
                if probes: wa['items'][it['id']] = wrong
    json.dump(ibm, open(os.path.join(ROOT, 'config/agent_sim_esl6/ITEM_BELIEF_MAP.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(wa, open(os.path.join(ROOT, 'config/agent_sim_esl6/WRONG_ANSWERS.json'), 'w'), indent=1, ensure_ascii=False)
    n = len(ibm['items']); none = sum(1 for v in ibm['items'].values() if v['probes'] == ['none'])
    print('items', n, 'probe none', none, 'wrong strings', sum(len(v) for v in wa['items'].values()))
