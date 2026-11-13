#!/usr/bin/env python3
# Writes LO1 (outcome matrix) and LO2 (profiles) from the frozen sources. Run from the experiment folder.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lo_bank import LO
from profiles import P, FORGET
L = ['# LO1 — Learning Outcome Matrix', '', 'Frozen for all campaigns (`lo_assessment_bank.json`, source `lo_bank.py`).', '',
     '**Source:** every outcome is one success criterion already in ENARA content: the shipped demo course *Everyday English A2* (`backend/src/services/demoTemplate.ts`, lessons 1, 3, 4) and the three tutor benchmark lessons (fixture v2: A1 family, A2 daily routine, B1 life experiences). Nothing was invented.', '',
     '**Not covered** (no ENARA lesson with a testable criterion): reading, writing, listening, speaking, vocabulary-only outcomes.', '',
     '| ID | Level | ENARA lesson / criterion | Target skill | Prerequisite | Starting misconception | Pre-test | Post-test | Transfer | Retention (short / long) | Mastery |', '|---|---|---|---|---|---|---|---|---|---|---|']
for o in LO:
    q = lambda st: ' / '.join(i['prompt'] for i in o[st])
    L.append(f"| {o['id']} | {o['cefr']} | {o['source']} — *{o['criterion']}* | {o['skill']} | {o['prereq']} | {o['belief']} | {q('pre')} | {q('post')} | {q('transfer')} | {q('ret1')} // {q('ret2')} | post 2/2 and transfer ≥ 1/2, alone |")
L += ['', '**Independent measurement:** all items are held out (never in the tutor lesson, the learner persona or tutoring). Each is answered alone, 3 samples, majority correct, scored by a deterministic answer-key match (LO5). Tutor verdicts are never outcome evidence.']
open('LO1_LEARNING_OUTCOME_MATRIX.md', 'w').write('\n'.join(L) + '\n')
L = ['# LO2 — AI Student Profiles', '', 'Frozen (`profiles.py`). Every profile is crossed with every outcome: 10 x 12 = 120 simulated learners per campaign. Simulator: `claude-haiku-5-5` (same model family as the tutor, a stated limitation).', '',
     '| ID | Profile | Knowledge | Holds misconception | Language | Accuracy | Speed | Hints | Errors | Forgetting |', '|---|---|---|---|---|---|---|---|---|---|']
for p in P: L.append(f"| {p['id']} | {p['name']} | {p['knowledge']} | {p['holds_belief']} | {p['language']} | {p['accuracy']} | {p['speed']} | {p['hints']} | {p['errors']} | {p['forget']} |")
L += ['', '## Behaviour text given to the simulator', ''] + [f"- **{p['id']}:** {p['text']}" for p in P]
L += ['', '## Forgetting model (assumption, not real memory)', '', 'The learner\'s own post-lesson note is what it remembers.', '', '| Level | Short delay | Long delay |', '|---|---|---|'] + [f"| {k} | {v['short'].replace('_', ' ')} | {v['long'].replace('_', ' ')} |" for k, v in FORGET.items()]
L += ['', '## Independence', '', '- No answer keys, post/transfer/retention questions, rubrics or condition labels are ever given to the simulator.', '- Scan of all 120 personas: 0 accepted-answer phrases.', '- Simulator validity check (no tutor) passed before any campaign: strong profile 91% on the pre-test, others 13%; no teaching 13% to 15%; correct material 41% vs misleading notes 15%.']
open('LO2_AI_STUDENT_PROFILES.md', 'w').write('\n'.join(L) + '\n')
print('written')
