# SIMULATION ONLY. Post hoc recount of ESL5 LE answer releases (see reports/exp4/ESL5_LEAK_RECOUNT.md).
# For every LE turn with answerReleased=true, reconstruct from the transcript whether the learner made
# >= 2 genuine failed attempts on the SAME item immediately before the release.
#   item(j)   = task sentence set in tutor turn j (last line holding '___', else last non-empty line,
#               instruction prefix before ':' removed, normalised)
#   attempt k = learner message of turn k answers item(k-1); judged via production facts in turn k.
#   genuine fail = production kind blank/sentence, correct False, non-empty, not "don't know", not a copy of the prompt.
# Classes: a = >=2 genuine fails on the item (legit release); c = learner had already answered the item
# correctly; b = 1 genuine fail only (premature); n = no genuine attempt on a lesson item before the
# release (rule-in-own-words tasks, requests, don't-know): no lesson-item answer to leak, not counted. Reads frozen session files only; writes JSON next to the sessions dir.
import json, glob, os, re, sys, random

DK = re.compile(r"\b(don'?t know|do not know|not sure|no idea|i forget|i can'?t)\b", re.I)

def norm(s):
    s = s.lower().replace('___', ' ').replace('"', ' ').replace('“', ' ').replace('”', ' ')
    return re.sub(r'[^a-z ]', ' ', re.sub(r'\s+', ' ', s)).split()

def item_of(tutor):
    lines = [l.strip() for l in (tutor or '').split('\n') if l.strip()]
    if not lines: return None
    cand = [l for l in lines if '___' in l]
    l = cand[-1] if cand else lines[-1]
    l = re.sub(r'\(answer with[^)]*\)', '', l)
    if ':' in l and '___' not in l.split(':', 1)[1] and cand:
        pass
    if ':' in l:
        head, tail = l.split(':', 1)
        if tail.strip(): l = tail
    return ' '.join(norm(l)) or None

def genuine_fail(t, item):
    p = t.get('production') or {}
    if p.get('kind') not in ('blank', 'sentence') or p.get('correct') is not False: return False
    txt = (p.get('text') or t.get('learner') or '').strip()
    if not txt or DK.search(txt): return False
    if item and ' '.join(norm(txt)) == item and len(item.split()) > 1: return False  # copy of prompt
    return True

RETRY = re.compile(r"\b(again|once more|one more time|fix (it|your)|rewrite your|your sentence)\b", re.I)

def key(T, j):
    """item key of tutor turn j; a retry request without a new gap sentence keeps the previous item."""
    tut = T[j]['tutor'] or ''
    tail = ' '.join(l for l in tut.split('\n')[-3:])
    if j > 0 and RETRY.search(tail) and T[j-1].get('session') == T[j].get('session'):
        own = item_of(tut)
        prev = key(T, j-1)
        if '___' not in tail or own == prev: return prev
    return item_of(tut)

def chain(T, i):
    """attempts on item(i-1) in consecutive turns ending at i: list of (k, status)."""
    X = key(T, i-1) if i > 0 else None
    out = []; k = i
    while k > 0 and key(T, k-1) == X and T[k-1].get('session') == T[i].get('session'):
        p = T[k].get('production') or {}
        st = 'correct' if p.get('correct') is True else 'fail' if genuine_fail(T[k], X) else 'other'
        out.append((k, st)); k -= 1
    return X, out[::-1]

def classify(T, i):
    X, ch = chain(T, i)
    if any(s == 'correct' for _, s in ch): return 'c', X, ch
    if not any(s == 'fail' for _, s in ch): return 'n', X, ch   # no answer attempt on a lesson item: nothing to leak
    return ('a' if sum(s == 'fail' for _, s in ch) >= 2 else 'b'), X, ch

def main(d):
    rows = []; pp_after2 = 0; pp_leak = 0; le_leak = 0; overlap = {'a': 0, 'b': 0, 'c': 0, 'n': 0}
    for f in sorted(glob.glob(os.path.join(d, '*.json'))):
        S = json.load(open(f)); T = S['turns']; key = os.path.basename(f)[:-5]
        for i, t in enumerate(T):
            if 'tutor' not in t: continue
            el = t.get('earlyLeakFinal', 0) > 0
            if S['arm'] == 'PP':
                pp_leak += el
                if el and i > 0 and sum(s == 'fail' for _, s in chain(T, i)[1]) >= 2: pp_after2 += 1
                continue
            le_leak += el
            if t.get('answerReleased'):
                c, X, ch = classify(T, i)
                overlap[c] += el
                rows.append({'session': key, 'turn': i + 1, 'class': c, 'item': X, 'chain': ch,
                             'learner': t['learner'][:120], 'tutor': t['tutor'][:200], 'earlyLeakFinal': el})
    cnt = {c: sum(r['class'] == c for r in rows) for c in 'abcn'}
    res = {'releases': len(rows), 'classes': cnt, 'overlap_with_earlyLeakFinal': overlap,
           'LE_original': le_leak,
           'LE_substantive': le_leak + cnt['b'] - overlap['b'],
           'LE_strict': le_leak + cnt['b'] + cnt['c'] - overlap['b'] - overlap['c'],
           'PP': pp_leak, 'PP_leaks_after_two_genuine_fails': pp_after2}
    for k in ('LE_original', 'LE_substantive', 'LE_strict'): res[k + '_pass'] = res[k] <= pp_leak
    random.seed(5); res['samples'] = {c: random.sample([r for r in rows if r['class'] == c], min(10, cnt[c])) for c in 'abcn'}
    out = os.path.join(os.path.dirname(d.rstrip('/')), 'leak_recount.json')
    json.dump({**res, 'rows': rows}, open(out, 'w'), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != 'samples'}, indent=1)); print('wrote', out)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'reports/exp4/agent_sim_esl5/sessions')
