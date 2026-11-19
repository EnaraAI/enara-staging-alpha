#!/usr/bin/env python3
"""kidsPack importer: data/kids/prea1/WORDS.json from the OFFICIAL Cambridge Pre A1 Starters Word list picture book.

  pdftotext -raw starters-word-list-picture-book.pdf words_raw.txt
  python3 scripts/kids/import_starters.py words_raw.txt data/kids/prea1

-raw gives the A-Z list in reading order (column by column). Page 25's A-C block comes before the "Starters A-Z" header in
that order, so the parser starts at the first line "a det" and stops at the "Names" page. Entries that wrap across lines are
joined ("colour (US" + "color) n + v"). Each entry keeps its parenthetical note; "child/children" gives two forms.
The can-do statements (OUTCOMES.json) come from a poster with no list structure; they are transcribed verbatim in that
file and verified word by word against the PDF text by backend/test/kidsPack.test.ts.
"""
import json, re, sys, datetime, pathlib

POS = ['adj', 'adv', 'conj', 'det', 'dis', 'excl', 'int', 'n', 'poss', 'prep', 'pron', 'v']
POS_RE = r'(?:adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v)'
ENTRY = re.compile(rf"^(?P<head>.+?)\s+(?P<pos>{POS_RE}(?:\s*\+\s*{POS_RE})*)(?P<tail>(?:\s+(?:of place|of time|of direction))?)$")
SKIP = re.compile(r'^([A-Z]|\d{1,3}|Starters A–Z|Word List|Grammatical key|(?:adj adjective|adv adverb|conj conjunction|det determiner|dis discourse marker|excl exclamation|int interrogative|n noun|poss possessive|prep preposition|pron pronoun|v verb))$')

POS_SET = set(POS) | {'title'}

def entries(lines):
    """Token walk: a head (words, bracketed notes) ends at a group of part-of-speech labels ("adj + excl", "poss adj + pron"),
    optionally followed by "of place"/"of time". Raw lines may hold two entries ("zebra n zoo n") or half of one."""
    toks = []
    for raw in lines:
        line = raw.strip().replace('’', "'")
        if line in ('Names', 'Letters & numbers'): break
        if SKIP.match(line): continue  # letter headings, page numbers, the page-25 header and grammatical key
        if line.startswith('+'):
            toks.append(('+LINE', line))  # "+ time" continues the previous entry's use
            continue
        toks.extend(('T', t) for t in line.split())
    head, depth, out, i = [], 0, [], 0
    while i < len(toks):
        kind, t = toks[i]
        if kind == '+LINE':
            if out: out[-1]['use'] = ((out[-1]['use'] or '') + ' ' + t).strip()
            i += 1; continue
        if depth or '(' in t:
            head.append(t); depth += t.count('(') - t.count(')'); i += 1; continue
        if t in POS_SET and head:
            pos = [t]; i += 1
            while i < len(toks) and toks[i][0] == 'T' and (toks[i][1] in POS_SET or (toks[i][1] == '+' and i + 1 < len(toks) and toks[i + 1][1] in POS_SET)):
                if toks[i][1] != '+': pos.append(toks[i][1])
                i += 1
            use = None
            if i + 1 < len(toks) and toks[i][1] == 'of' and toks[i + 1][1] in ('place', 'time', 'direction'):
                use = f'of {toks[i + 1][1]}'; i += 2
            out.append({'head': ' '.join(head), 'pos': pos, 'use': use}); head = []
            continue
        if not head and re.fullmatch(r'\d{1,3}', t):
            i += 1; continue  # letter headings and page numbers
        head.append(t); i += 1
    return out, ' '.join(head)

def parse(text):
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip() == 'a det')
    raw_entries, leftover = entries(lines[start:])
    out, seen = [], set()
    for e in raw_entries:
        word, notes, depth, cur = '', [], 0, ''
        for ch in e['head']:  # balanced brackets: "candy (UK sweet(s))"
            if ch == '(':
                if depth: cur += ch
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth: cur += ch
                else: notes.append(cur.strip()); cur = ''
            elif depth: cur += ch
            else: word += ch
        word = re.sub(r'\s+', ' ', word).strip()
        pos = sorted(set('n' if p == 'title' else p for p in e['pos']))
        forms = [f.strip() for f in word.split('/')] if '/' in word and ' ' not in word else [word]
        key = (word.lower(), ' '.join(notes))
        if key in seen: continue
        seen.add(key)
        item = {'word': word, 'pos': pos, 'forms': forms}
        if notes: item['note'] = '; '.join(notes)
        use = ' '.join(x for x in [e['use'], 'title' if 'title' in e['pos'] else None] if x)
        if use: item['use'] = use
        if word[:1].isupper() and pos == ['n'] and word not in ('English', 'OK') and 'title' not in e['pos']: item['name'] = True
        out.append(item)
    return out, ([leftover] if leftover.strip() else [])

def names(text):
    lines = [l.strip() for l in text.splitlines()]
    i = lines.index('Names') + 2  # skip the "Candidates will be expected..." line
    out = []
    while i < len(lines) and not re.fullmatch(r'\d{1,2}', lines[i]):
        if lines[i].endswith('name)'): out[-1] += ' ' + lines[i]
        elif lines[i]: out.append(lines[i])
        i += 1
    return out

def main(words_raw, out_dir):
    text = open(words_raw, encoding='utf8').read()
    words, bad = parse(text)
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / 'WORDS.json').write_text(json.dumps(words, indent=1, ensure_ascii=False) + '\n')
    (out / 'NAMES.json').write_text(json.dumps(names(text), indent=1, ensure_ascii=False) + '\n')
    src = out / 'SOURCE.json'
    meta = json.loads(src.read_text()) if src.exists() else {}
    meta.update({'wordList': 'Cambridge English, Pre A1 Starters Word list picture book (for exams from 2018), A-Z Word List pp. 25-29', 'wordsImportedAt': datetime.date.today().isoformat(), 'words': len(words)})
    src.write_text(json.dumps(meta, indent=1) + '\n')
    print(f'words {len(words)}; unparsed {len(bad)}')
    for b in bad: print('  UNPARSED:', b)

if __name__ == '__main__':
    main(*sys.argv[1:3])
