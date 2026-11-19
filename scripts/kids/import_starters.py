#!/usr/bin/env python3
"""kidsPack importer: build data/kids/prea1/WORDS.json and OUTCOMES.json from the OFFICIAL Cambridge files.

Inputs (download from cambridgeenglish.org; this container's network blocks that host):
  - Pre A1 Starters Word list picture book (starters-word-list-picture-book.pdf): the A-Z list pages.
  - Young Learners Can Do statements (461492-young-learners-can-do-statements-.pdf): the Pre A1 Starters section.
Usage:
  pdftotext -layout starters-word-list-picture-book.pdf words.txt
  pdftotext -layout 461492-young-learners-can-do-statements-.pdf cando.txt
  python3 scripts/kids/import_starters.py words.txt cando.txt data/kids/prea1
The parser expects A-Z lines of the form "<headword> <pos>[ ,<pos>]" (pos: adj adv conj det dis excl int n poss prep pron v),
and Can Do lines under the Pre A1 Starters heading, grouped by Listening/Reading/Writing/Speaking. Check the counts it prints
against the PDF before committing (the layout of a newer edition may differ).
"""
import json, re, sys, datetime, pathlib

POS = {'adj', 'adv', 'conj', 'det', 'dis', 'excl', 'int', 'n', 'poss', 'prep', 'pron', 'v', 'num'}
LINE = re.compile(r"^\s*([a-z](?:[a-z' .-]*?[a-z])?)\s+((?:adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v|num)(?:\s*(?:\+|,|&)\s*(?:adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v|num))*)\b(.*)$")

def parse_words(text):
    out, seen = [], set()
    for raw in text.splitlines():
        for chunk in re.split(r"\s{3,}", raw):  # -layout prints columns side by side
            m = LINE.match(chunk)
            if not m: continue
            word = m.group(1).strip().lower()
            pos = sorted({p for p in re.split(r"[\s,+&]+", m.group(2)) if p in POS})
            if word in seen or not pos: continue
            seen.add(word); out.append({'word': word, 'pos': pos})
    return out

def parse_cando(text):
    out, skill, on = [], None, False
    for raw in text.splitlines():
        line = raw.strip()
        if re.search(r'Pre A1 Starters', line, re.I): on = True; continue
        if re.search(r'A1 Movers', line, re.I) and on and out: break
        if not on: continue
        s = re.match(r'^(Listening|Reading|Writing|Speaking)\b', line, re.I)
        if s: skill = s.group(1).lower(); continue
        c = re.match(r'^(?:[•\-–]\s*)?((?:I|Can|They)\b.*)$', line)
        if skill and c and len(c.group(1)) > 12:
            out.append({'id': f'PREA1-{skill[:2].upper()}-{len([o for o in out if o["skill"] == skill]) + 1:02d}', 'skill': skill, 'canDo': c.group(1).rstrip('.') + '.', 'source': 'Cambridge Young Learners Can Do statements (Pre A1 Starters)'})
    return out

def main(words_txt, cando_txt, out_dir):
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    words = parse_words(open(words_txt, encoding='utf8').read())
    cando = parse_cando(open(cando_txt, encoding='utf8').read())
    (out / 'WORDS.json').write_text(json.dumps(words, indent=1))
    (out / 'OUTCOMES.json').write_text(json.dumps(cando, indent=1))
    (out / 'SOURCE.json').write_text(json.dumps({'wordList': 'Cambridge Pre A1 Starters Word list picture book (for exams from 2018)', 'canDo': 'Cambridge Young Learners Can Do statements', 'importedAt': datetime.date.today().isoformat()}, indent=1))
    print(f'words {len(words)}; can-dos {len(cando)} by skill', {s: sum(1 for c in cando if c['skill'] == s) for s in ['listening', 'reading', 'writing', 'speaking']})

if __name__ == '__main__':
    main(*sys.argv[1:4])
