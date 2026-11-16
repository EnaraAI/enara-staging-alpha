# SIMULATION ONLY. NO API.
# Pure, deterministic implementation of the ESL6 forgetting rule F1 and the section-2a answering rules
# (config/agent_sim_esl6/LEARNING_RULES.md sections 2a, 6, 7; parameters from config/agent_sim_esl6/F1_PARAMS.json).
# No I/O except loading F1_PARAMS.json once; no randomness except the seeded dice of section 2 (sha256), no global state changes.
#
# Knowledge state (dict):
#   {'form': <outcome key>, 'band': 'A1'|'A2'|'B2', 'primary': 'W1'|'W2', 'ws': ['W1'] or ['W1','W2'],
#    's': {'W1':x,'W2':x,'C1':x,'C2':x}, 'indep': {'C1':n,'C2':n}, 'start': {...starting strengths...},
#    'retr': {'C1': [sessions with a counted retrieval], 'C2': [...]}, 'afterF1': bool}
# Unused beliefs of one-wrong-belief outcomes (W2/C2) stay at 0 and are never probed.
import copy, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
PARAMS = json.load(open(os.path.join(ROOT, 'config/agent_sim_esl6/F1_PARAMS.json')))
BASE = PARAMS['correct_decay']['base_per_day']                 # 0.15
MULT = PARAMS['retrieval']['retrieval_multiplier']             # 0.5
R_CAP = PARAMS['retrieval']['r_cap']                           # 2
FRAC = PARAMS['wrong_return']['fraction_of_drop_per_day']      # 0.10
CAP = PARAMS['wrong_return']['cap_fraction_of_drop_per_gap']   # 0.5
RET_MULT = PARAMS['wrong_return']['retrieval_multiplier']     # 0.5 (F1 v2)
MIN_ERR = PARAMS['answering']['max_floor_error_prob']        # 0.4 (F1 v2: floor at Ck = 0)
FULL_RECALL = PARAMS['answering']['full_recall_strength']     # 2.0 (F1 v2: floor reaches 0 at Ck >= 2)
DAYS_GAP = PARAMS['timing']['days_session1_to_session2']       # 2
DAYS_DELAY = PARAMS['timing']['days_last_session_to_delayed_posttest']  # 7
EPS = 1e-9
PAIR = {'W1': 'C1', 'W2': 'C2', 'C1': 'W1', 'C2': 'W2'}


def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def rand(*parts): return int(sha('|'.join(str(p) for p in parts))[:8], 16) / 2 ** 32
def q(x): return round(x + 0.0, 6)


def start_strengths(band, primary='W1', ws=('W1', 'W2')):
    """Section 1 / 1b starting strengths. With only W1, W1 is the primary wrong belief; W2/C2 unused (0)."""
    ws = list(ws); primary = primary if primary in ws else 'W1'
    if band == 'B2': s = {'W1': 0, 'W2': 0, 'C1': 3, 'C2': 3}
    elif band == 'A1': s = {'W1': 1, 'W2': 1, 'C1': 0, 'C2': 0}; s[primary] = 3
    else: s = {'W1': 1, 'W2': 1, 'C1': 1, 'C2': 0}; s[primary] = 2
    if 'W2' not in ws: s['W2'] = 0; s['C2'] = 0
    return s


def initial_state(form, band, primary='W1', ws=('W1', 'W2')):
    s = start_strengths(band, primary, ws)
    return {'form': form, 'band': band, 'primary': primary if primary in ws else 'W1', 'ws': list(ws), 's': dict(s), 'indep': {'C1': 0, 'C2': 0},
            'start': dict(s), 'retr': {'C1': [], 'C2': []}, 'afterF1': False}


def floor_of(k, c):
    """6a floor: the band starting strength (A1 0/0, A2 1/0, B2 3/3); for an unused C2 it is 0."""
    return k['start'][c]


def removed(k, w):
    """6b: removed = set to 0 by R4's reset (independent count of the counterpart reached 2)."""
    return k['indep'][PAIR[w]] >= 2


def r_of(k, c):
    """6c: number of sessions so far with a counted retrieval attempt on c (session 1 excluded), capped at 2."""
    return min(R_CAP, len(set(x for x in k['retr'][c] if x >= 2)))


def decay_rate(r): return BASE * MULT ** min(R_CAP, r)


def return_factor(r): return RET_MULT ** min(R_CAP, r)


def f1_gap(k, days):
    """Run F1 for `days` simulated days outside a session, starting from the end-of-session state k. Returns a new state."""
    st = copy.deepcopy(k)
    if days <= 0: return st
    drop = {}; budget = {}; fr = {}
    for w in st['ws']:
        d = st['start'][w] - st['s'][w]
        g = return_factor(r_of(st, PAIR[w]))                            # 6b v2: retrieval of Ck also slows/limits Wk's return
        if d > EPS and not removed(st, w): drop[w] = d; budget[w] = CAP * g * d; fr[w] = FRAC * g
    rates = {c: decay_rate(r_of(st, c)) for c in ('C1', 'C2') if PAIR[c] in st['ws']}
    for _ in range(days):
        for c, rate in rates.items():                                   # 6a
            st['s'][c] = q(max(floor_of(st, c), st['s'][c] - rate))
        for w in drop:                                                  # 6b
            inc = min(fr[w] * drop[w], budget[w])
            if inc <= EPS: continue
            new = min(st['start'][w], st['s'][w] + inc); budget[w] -= new - st['s'][w]; st['s'][w] = q(new)
    st['afterF1'] = True
    return st


def p_wrong(w):
    """Section 2 table, with 2a rounding half up for non-whole strengths."""
    return 0.8 if w >= 1.5 - EPS else 0.4 if w >= 0.5 - EPS else 0.05


def recall_floor(c):
    """2a v2 graded mapping: floor on Wk's error probability from Ck = 0.4 * max(0, 1 - Ck/2) (0.4 at 0, 0.2 at 1, 0 at >= 2)."""
    return MIN_ERR * max(0.0, 1.0 - c / FULL_RECALL)


def item_error_prob(k, w):
    """Error probability of Wk on an item that tests Ck (2a graded floor applies only after at least one F1 interval)."""
    p = p_wrong(k['s'][w])
    if k.get('afterF1'): p = max(p, recall_floor(k['s'][PAIR[w]]))
    return p


def produce(k, probes, seed, purpose, turn, item):
    """Section 2: each probed wrong belief fires independently; the first that fires decides the error. Returns fired belief or None."""
    for w in probes:
        if rand(seed, purpose, turn, item, w) < item_error_prob(k, w): return w
    return None


# Post-test probe slots (ESL5 / ESL2 section 5 format: 4 controlled + 2 free). The three section-1 forms keep the frozen ESL5 slots.
POST_PROBES_SEC1 = {
    'articles': [['W1', 'W2'], ['W1'], ['W1'], ['W1', 'W2'], ['W1', 'W2'], ['W1', 'W2']],
    'copula': [['W1', 'W2'], ['W1'], ['W1', 'W2'], ['W1', 'W2'], ['W1', 'W2'], ['W1', 'W2']],
    'thirdS': [['W1'], ['W1', 'W2'], ['W1', 'W2'], ['W1'], ['W1', 'W2'], ['W1', 'W2']],
}
POST_PROBES_TWO = [['W1', 'W2'], ['W1'], ['W2'], ['W1', 'W2'], ['W1', 'W2'], ['W1', 'W2']]
POST_PROBES_ONE = [['W1']] * 6


def post_probes(k):
    sec1 = k.get('sec1')
    if sec1: return POST_PROBES_SEC1[sec1]
    return POST_PROBES_TWO if 'W2' in k['ws'] else POST_PROBES_ONE


def expected_acc(k):
    """Expected post-test accuracy (mean over the 6 items of prod(1 - p) over the item's probes), with sections 2 and 2a."""
    vals = []
    for probes in post_probes(k):
        p = 1.0
        for w in probes: p *= 1 - item_error_prob(k, w)
        vals.append(p)
    return sum(vals) / len(vals)


def wrong_at_zero(k): return sum(1 for w in k['ws'] if p_wrong(k['s'][w]) == 0.05)


def post_tests(end_of_last_session):
    """Section 7: immediate = end of last session (no F1); delayed = after 7 days of F1."""
    imm = copy.deepcopy(end_of_last_session); dly = f1_gap(end_of_last_session, DAYS_DELAY)
    return {'immediate': {'expected': expected_acc(imm), 'wrongAtZero': wrong_at_zero(imm)},
            'delayed': {'expected': expected_acc(dly), 'wrongAtZero': wrong_at_zero(dly), 'state': dly['s']}}


def apply_events(k, events, last, session=1, retrieval=None):
    """learnerSim.ts applyEvents semantics (same caps, rejections, dedupe) on possibly non-whole strengths, plus the 5b retrieval report.
    R1/R2 lower W by 1 (never below 0; a W between 0 and 0.5 goes to 0), at most 2 per W per turn; R3/R4 +1 (cap 3); R4 count 2 resets W to 0;
    R7 +1. Retrieval (list of Ck) is counted once per session and only from session 2 on, and only when the learner produced an answer."""
    st = copy.deepcopy(k); applied, rejected = [], []; drop = {'W1': 0, 'W2': 0}; seen = set()
    for e in events or []:
        if not isinstance(e, dict): continue
        rule, b = e.get('rule'), e.get('belief'); key = f'{rule}:{b}'
        if key in seen: continue
        seen.add(key)
        W = b if b in st['ws'] else None; C = b if (b in ('C1', 'C2') and PAIR[b] in st['ws']) else None
        if rule in ('R1', 'R2') and W:
            if drop[W] < 2 and st['s'][W] > EPS: st['s'][W] = q(max(0, st['s'][W] - 1)); drop[W] += 1
            applied.append(key)
        elif rule == 'R3' and C:
            if last and last.get('correct'): st['s'][C] = q(min(3, st['s'][C] + 1)); applied.append(key)
            else: rejected.append(key + ':no_correct_production')
        elif rule == 'R4' and C:
            if last and last.get('correct') and last.get('kind') in ('blank', 'sentence'):
                st['s'][C] = q(min(3, st['s'][C] + 1)); st['indep'][C] += 1
                if st['indep'][C] >= 2: st['s'][PAIR[C]] = 0
                applied.append(key)
            else: rejected.append(key + ':no_correct_production')
        elif rule == 'R7' and W:
            if last and last.get('correct') is False and last.get('fired') == W: st['s'][W] = q(min(3, st['s'][W] + 1)); applied.append(key)
            else: rejected.append(key + ':fact_mismatch')
        elif rule in ('R5', 'R6'): applied.append(rule)
        else: rejected.append(key + ':invalid')
    for c in sorted(set(retrieval or [])):
        if c in ('C1', 'C2') and PAIR[c] in st['ws'] and session >= 2 and last and last.get('kind') in ('blank', 'sentence'):
            if session not in st['retr'][c]: st['retr'][c] = sorted(st['retr'][c] + [session])
            applied.append(f'retrieval:{c}')
        else: rejected.append(f'retrieval:{c}:not_counted')
    return st, applied, rejected


def comparable(k):
    """What two judges must agree on: strengths, independent counts and counted retrievals."""
    return json.dumps({'s': k['s'], 'indep': k['indep'], 'retr': k['retr']}, sort_keys=True)
