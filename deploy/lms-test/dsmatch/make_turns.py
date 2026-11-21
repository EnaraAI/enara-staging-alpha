# DeepSeek match test set (owner go 21 Nov 2026): 100 fake tutor turns in every subject, English and Arabic, all ages.
# Fake learners and the fake course passages of backend/eval/subjects. Run: python3 make_turns.py <path to backend/eval/subjects> <dscompare/turns.json>
import json, sys
SUBJ = {s: json.load(open(f"{sys.argv[1]}/{s}.json")) for s in ['maths', 'science', 'arabic']}
P = {p['id']: p for s in SUBJ.values() for p in s['passages']}
AGE = {'u9': 'Age: 8 (under 9). A young child: very short sentences, one small task.', 'child': 'Age: 11 (a child).', 'teen': 'Age: 15.', 'adult': 'Adult learner.'}
def src(*ids): return [{'fileName': P[i]['fileName'], 'page': P[i].get('page'), 'text': P[i]['text'], 'lessonId': P[i].get('lessonId')} for i in ids]
T = []
def practice(group, subj, age, lang, ask, q, ans, verdicts, expected, retry=False, sources=()):
    T.append({'id': f'{group}{len([t for t in T if t["group"] == group]) + 1:02d}', 'group': group, 'subject': subj, 'age': age, 'lang': lang,
              'turn': {'history': [{'role': 'user', 'content': ask}, {'role': 'assistant', 'content': q}], 'query': ans, 'learner': AGE[age], 'practice': True, 'sources': src(*sources)},
              'expect': {'verdicts': verdicts, 'answer': expected, 'retry': retry, 'task': True}})
EN, AR = 'Can I practise, please?', 'ممكن أتمرن؟'
R, PW, W, N = ['right'], ['partial', 'wrong'], ['wrong', 'partial'], ['none']
# maths (20)
practice('math', 'maths', 'u9', 'en', EN, 'Let\'s add! What is 3 + 5?', '8', R, '8')
practice('math', 'maths', 'u9', 'en', EN, 'What is 7 - 2?', '4', W, '5', True)
practice('math', 'maths', 'u9', 'ar', AR, 'هيا نجمع! كم يساوي ٤ + ٣؟', '٧', R, '7')
practice('math', 'maths', 'u9', 'en', EN, 'What is 2 + 6?', "I don't know", ['wrong', 'partial', 'none'], '8', True)
practice('math', 'maths', 'child', 'en', EN, 'Write 1/2 as a decimal.', '0.5', R, '0.5', sources=['m02'])
practice('math', 'maths', 'child', 'en', EN, 'What is 2/8 + 3/8?', '5/16', W, '5/8', True, ['m01'])
practice('math', 'maths', 'child', 'en', EN, 'Which is bigger, 0.6 or 0.59?', '0.59', W, '0.6', True, ['m02'])
practice('math', 'maths', 'child', 'ar', AR, 'ما محيط مستطيل طوله ٧ سم وعرضه ٣ سم؟', '٢٠', ['partial', 'right'], '20 سم', False, ['m06'])
practice('math', 'maths', 'child', 'en', EN, 'Write 3/4 as a percentage.', '75%', R, '75%', sources=['m03'])
practice('math', 'maths', 'child', 'en', EN, 'Find 20% of 80.', '16', R, '16', sources=['m03'])
practice('math', 'maths', 'teen', 'en', EN, 'Solve 3x + 4 = 19.', 'x = 5', R, 'x = 5', sources=['m08'])
practice('math', 'maths', 'teen', 'en', EN, 'Solve 2x - 6 = 10.', 'x = 2', W, 'x = 8', True, ['m08'])
practice('math', 'maths', 'teen', 'en', EN, 'What is the area of a triangle with base 6 cm and height 4 cm?', '24 cm²', W, '12 cm²', True, ['m05'])
practice('math', 'maths', 'teen', 'ar', AR, 'حل المعادلة: ٥س = ٣٥', 'س = ٧', R, 'س = 7', sources=['m08'])
practice('math', 'maths', 'teen', 'en', EN, 'Simplify the ratio 10:15.', '2:3', R, '2:3', sources=['m04'])
practice('math', 'maths', 'teen', 'en', EN, 'Two angles of a triangle are 50° and 60°. What is the third angle?', '80°', W, '70°', True, ['m07'])
practice('math', 'maths', 'adult', 'en', EN, 'Find the mean of 4, 8 and 6.', '6', R, '6', sources=['m09'])
practice('math', 'maths', 'adult', 'en', EN, 'Write 0.25 as a fraction in its simplest form.', '1/4', R, '1/4', sources=['m02'])
practice('math', 'maths', 'adult', 'ar', AR, 'ما احتمال ظهور العدد ٦ عند رمي حجر نرد مرة واحدة؟', '1/6', R, '1/6', sources=['m10'])
practice('math', 'maths', 'adult', 'en', EN, 'What is the perimeter of a square with sides of 5 m?', '20', ['partial', 'right'], '20 m', False, ['m06'])
# science (12)
practice('sci', 'science', 'u9', 'en', EN, 'What do plants need from the Sun to make food?', 'light', R, 'light', sources=['s01'])
practice('sci', 'science', 'u9', 'en', EN, 'Plants make food in their green l____. Write the word.', 'leef', PW, 'leaves', True, ['s01'])
practice('sci', 'science', 'child', 'en', EN, 'What gas do plants give out during photosynthesis?', 'carbon dioxide', W, 'oxygen', True, ['s01'])
practice('sci', 'science', 'child', 'en', EN, 'In a food chain, what do we call the plant at the start?', 'a producer', R, 'producer', sources=['s02'])
practice('sci', 'science', 'child', 'ar', AR, 'ما الغاز الذي تأخذه النباتات من الهواء لتصنع غذاءها؟', 'ثاني أكسيد الكربون', R, 'ثاني أكسيد الكربون', sources=['s01'])
practice('sci', 'science', 'teen', 'en', EN, 'What is the name of the process plants use to make their own food?', 'fotosynthesis', PW + ['right'], 'photosynthesis', False, ['s01'])
practice('sci', 'science', 'teen', 'en', EN, 'What is the unit of force?', 'the newton', R, 'newton', sources=['s07'])
practice('sci', 'science', 'teen', 'ar', AR, 'ما حالات المادة الثلاث؟', 'صلبة وسائلة', ['partial'], 'صلبة وسائلة وغازية', True, ['s05'])
practice('sci', 'science', 'adult', 'en', EN, 'Which planet is closest to the Sun?', 'Venus', W, 'Mercury', True, ['s10'])
practice('sci', 'science', 'adult', 'en', EN, 'What happens when two north poles of magnets are pushed together?', 'they repel each other', R, 'they repel', sources=['s08'])
practice('sci', 'science', 'child', 'en', EN, "Why won't a bulb light if there is a gap in the circuit?", 'because the circuit is not complete so the current cannot flow', R, 'the circuit is not complete', sources=['s09'])
practice('sci', 'science', 'teen', 'en', EN, 'Which part of a plant cell is NOT found in an animal cell?', "I'm not sure", ['wrong', 'partial', 'none'], 'cell wall', True, ['s03'])
# Arabic grammar (8)
practice('arab', 'arabic', 'child', 'ar', AR, 'ما المبتدأ في جملة «الطالبُ مجتهدٌ»؟', 'الطالب', R, 'الطالب', sources=['a01'])
practice('arab', 'arabic', 'child', 'ar', AR, 'ما الخبر في جملة «السماءُ صافيةٌ»؟', 'السماء', W, 'صافية', True, ['a03'])
practice('arab', 'arabic', 'teen', 'ar', AR, 'ما الفاعل في جملة «نجح الطالبُ»؟', 'الطالب', R, 'الطالب', sources=['a04'])
practice('arab', 'arabic', 'teen', 'ar', AR, 'أكمل بكلمة صحيحة الإملاء: ذهبتُ إلى ___ صباحًا (المكان الذي ندرس فيه).', 'المدرسه', PW, 'المدرسة', True)
practice('arab', 'arabic', 'teen', 'ar', AR, 'استخرج المفعول به: «قرأ عليٌّ الكتابَ».', 'الكتاب', R, 'الكتاب', sources=['a05'])
practice('arab', 'arabic', 'adult', 'ar', AR, 'هل «كان» فعل ناقص أم حرف؟', 'حرف', W, 'فعل ناقص', True, ['a06'])
practice('arab', 'arabic', 'adult', 'en', 'Can I practise Arabic grammar in English?', 'Sure. In «كتب الولدُ الدرسَ», which word is the subject (al-fa\'il)?', 'الولد', R, 'الولد', sources=['a04'])
practice('arab', 'arabic', 'child', 'ar', AR, 'ما نوع الجملة «يلعبُ الأطفالُ»: اسمية أم فعلية؟', 'اسمية', W, 'فعلية', True, ['a02'])
# questions answered from the course materials (20) and questions the materials don't cover (10)
QS = {q['id']: (s, q) for s, d in SUBJ.items() for q in d['questions']}
NOISE = {'maths': 'm09', 'science': 's06', 'arabic': 'a09'}
ages = ['u9', 'child', 'teen', 'adult']
for i, qid in enumerate(['mq02', 'mq08', 'mq11', 'mq13', 'mq15', 'mq17', 'sq01', 'sq02', 'sq07', 'sq10', 'sq13', 'sq14', 'sq16', 'aq01', 'aq03', 'aq05', 'aq07', 'aq13', 'aq15', 'aq16']):
    s, q = QS[qid]; ids = q['expect'] + ([NOISE[s]] if NOISE[s] not in q['expect'] else [])
    T.append({'id': f'src{i + 1:02d}', 'group': 'src', 'subject': s, 'age': ages[i % 4], 'lang': q['lang'], 'turn': {'history': [], 'query': q['q'], 'learner': AGE[ages[i % 4]], 'practice': True, 'sources': src(*ids)},
              'expect': {'verdicts': N, 'cite': True}})
for i, qid in enumerate(['mq18', 'mq19', 'mq20', 'sq18', 'sq19', 'sq20', 'aq18', 'aq19', 'aq20']):
    s, q = QS[qid]
    T.append({'id': f'oos{i + 1:02d}', 'group': 'oos', 'subject': s, 'age': ages[(i + 1) % 4], 'lang': q['lang'], 'turn': {'history': [], 'query': q['q'], 'learner': AGE[ages[(i + 1) % 4]], 'practice': True, 'outOfScope': True},
              'expect': {'verdicts': N, 'oos': True}})
T.append({'id': 'oos10', 'group': 'oos', 'subject': 'maths', 'age': 'teen', 'lang': 'en', 'turn': {'history': [], 'query': 'who won the football world cup in 2022?', 'learner': AGE['teen'], 'practice': True, 'outOfScope': True}, 'expect': {'verdicts': N, 'oos': True}})
# a question in the middle of practice (10): answer it, then back to the task
MID = [('maths', 'child', 'en', 'What is 2/8 + 3/8?', 'wait, what does the denominator mean?', ['m01']), ('maths', 'teen', 'en', 'Solve 2x + 3 = 11.', 'why do we subtract 3 first?', ['m08']),
       ('maths', 'adult', 'ar', 'احسب ٢٥٪ من ٤٠.', 'يعني إيه نسبة مئوية أصلاً؟', ['m03']), ('science', 'u9', 'en', 'What do plants need to make food?', 'what is a leaf for?', ['s01']),
       ('science', 'teen', 'en', 'What is the unit of force?', 'is weight the same as mass?', ['s07']), ('science', 'child', 'ar', 'ما الذي يجعل الماء يتبخر؟', 'يعني إيه يتبخر؟', ['s06']),
       ('arabic', 'teen', 'ar', 'ما المفعول به في «شرب الولدُ الحليبَ»؟', 'إزاي أعرف المفعول به أصلاً؟', ['a05']), ('arabic', 'adult', 'ar', 'أدخل «كان» على جملة «الجوُّ جميلٌ».', 'هي كان بتعمل إيه في الجملة؟', ['a06']),
       ('maths', 'u9', 'en', 'What is 4 + 4?', 'can we play a game after?', []), ('science', 'adult', 'en', 'Which planet is closest to the Sun?', 'how big is the sun compared with earth?', ['s10'])]
for i, (s, age, lang, q, ask, ids) in enumerate(MID):
    T.append({'id': f'mid{i + 1:02d}', 'group': 'mid', 'subject': s, 'age': age, 'lang': lang, 'turn': {'history': [{'role': 'user', 'content': AR if lang == 'ar' else EN}, {'role': 'assistant', 'content': q}], 'query': ask, 'learner': AGE[age], 'practice': True, 'sources': src(*ids)},
              'expect': {'verdicts': N, 'task': True, **({'cite': False} if not ids else {})}})
# English lessons (20): the saved turns, sent as the real tutor sends them
CLS = {'CORRECT': R, 'CORRECT_WITH_EQUIVALENT_FORMULATION': R, 'PARTIALLY_CORRECT': PW, 'INCORRECT': W, 'NOT_EVALUATED': N}
import re
for i, t in enumerate(json.load(open(sys.argv[2]))):
    sysp, conv = t['prompt'].split('CONVERSATION SO FAR:')
    msgs = []
    for line in re.sub(r"\n*Write the tutor's next reply only\.\s*$", '', conv).strip().split('\n'):
        m = re.match(r'^(STUDENT|TUTOR): ?(.*)$', line)
        if m: msgs.append({'role': 'user' if m[1] == 'STUDENT' else 'assistant', 'content': m[2]})
        elif msgs: msgs[-1]['content'] += '\n' + line
    v = re.search(r'verdict=(\w+)', t['claude'])[1]
    nxt = re.search(r'next=(\w+)', t['claude'])
    exp = CLS.get(v, N)
    if t['id'] == 's7003_NEW_o2#6': exp = ['right', 'partial']  # "half past fife": right time, one spelling slip
    T.append({'id': f'eng{i + 1:02d}', 'group': 'eng', 'subject': 'english', 'age': {'u9': 'u9', '9-12': 'child'}.get(t['ageGroup'], t['ageGroup']), 'lang': 'en',
              'turn': {'history': msgs[:-1], 'query': msgs[-1]['content'], 'languageContext': sysp.strip()}, 'claude': t['claude'],
              'expect': {'verdicts': exp, 'task': bool(nxt and nxt[1] in ('NEW_ITEM', 'SAME_ITEM')), 'english': True}})
assert len(T) == 100, len(T)
json.dump(T, open('turns.json', 'w'), ensure_ascii=False, indent=1)
print(len(T), {g: sum(1 for t in T if t['group'] == g) for g in ['math', 'sci', 'arab', 'src', 'oos', 'mid', 'eng']})
