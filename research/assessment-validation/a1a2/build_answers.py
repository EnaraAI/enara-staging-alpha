# DRAFT — builds answers.json (learner answers, no scores) and answers_design.json
# (the author's design intent; NOT shown to the reference scorers). Synthetic
# answers written by an agent to resemble Arabic-L1 A1-A2 learners; not real data.
import json, glob, os
HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, '../../../data/assessments/outcomes')
items = {}
for f in glob.glob(os.path.join(BANK, '*.json')):
    d = json.load(open(f))
    for form in d['forms'].values():
        for i in form:
            items[i['id']] = dict(i, outcomeId=d['outcomeId'])
P = 'EN-F-'
# (item id suffix, response, design category)
A = [
 # ---- controlled / error-correction ----
 ('A1-GR-copula-be-A-1', 'are', 'correct'),
 ('A1-GR-copula-be-A-1', "'re", 'correct'),
 ('A1-GR-copula-be-A-2', 'Am', 'correct'),
 ('A1-GR-copula-be-A-3', 'is.', 'correct'),
 ('A1-GR-copula-be-A-4', 'is', 'wrong'),
 ('A1-GR-copula-be-A-5', 'My brother is very busy this week', 'correct'),
 ('A1-GR-copula-be-A-5', "My brother's very busy this week.", 'correct'),
 ('A1-GR-copula-be-A-5', 'my brother is very bussy this week', 'off_target_error'),
 ('A1-GR-copula-be-A-6', 'The shops are close on Friday morning.', 'off_target_error'),
 ('A1-GR-copula-be-A-6', 'The shops is closed on Friday morning.', 'wrong'),
 ('A1-GR-article-a-an-A-1', 'an', 'correct'),
 ('A1-GR-article-a-an-A-2', 'a', 'wrong'),
 ('A1-GR-article-a-an-A-3', 'an', 'wrong'),
 ('A1-GR-article-a-an-A-4', 'an umbrella', 'correct_format_variant'),
 ('A1-GR-article-a-an-A-5', 'My brother is an engineer at the airport.', 'correct'),
 ('A1-GR-article-a-an-A-5', 'My brother is a engineer at the airport.', 'wrong'),
 ('A1-GR-article-a-an-A-6', 'She found an egg in the basket', 'correct'),
 ('A2-GR-past-simple-irregular-A-1', 'went', 'correct'),
 ('A2-GR-past-simple-irregular-A-1', 'goed', 'wrong'),
 ('A2-GR-past-simple-irregular-A-3', 'seed', 'wrong'),
 ('A2-GR-past-simple-irregular-A-4', 'bought', 'correct'),
 ('A2-GR-past-simple-irregular-A-5', 'Yesterday I went to the bank with my uncle.', 'correct'),
 ('A2-GR-past-simple-irregular-A-6', 'Last night we ate at my grandmothers house.', 'off_target_error'),
 ('A2-GR-past-simple-irregular-A-6', "Last night we eated at my grandmother's house.", 'wrong'),
 ('A1-GR-there-is-are-A-1', 'There are', 'correct'),
 ('A1-GR-there-is-are-A-2', "there's", 'correct'),
 ('A1-GR-there-is-are-A-3', 'There are', 'wrong'),
 ('A1-GR-there-is-are-A-5', 'There are four bedrooms in our new flat.', 'correct'),
 ('A1-GR-there-is-are-A-6', 'There is a small mosque in my village.', 'correct'),
 ('A1-GR-there-is-are-A-6', 'In my village, there is a small mosque.', 'correct'),
 ('A1-GR-there-is-are-A-6', 'My village has a small mosque.', 'target_avoided'),
 ('A1-GR-can-ability-A-1', 'cannot', 'correct'),
 ('A1-GR-can-ability-A-1', 'can not', 'correct'),
 ('A1-GR-can-ability-A-3', "can't", 'correct'),
 ('A1-GR-can-ability-A-3', 'cant', 'minor_slip'),
 ('A1-GR-can-ability-A-4', 'drives', 'wrong'),
 ('A1-GR-can-ability-A-5', 'My brother can fix old radios.', 'correct'),
 ('A1-GR-can-ability-A-6', 'She can cook very good biryani.', 'correct'),
 ('A2-GR-some-any-A-2', 'any', 'correct'),
 ('A2-GR-some-any-A-3', 'some', 'wrong'),
 ('A2-GR-some-any-A-5', 'We do not have any bread at home.', 'correct'),
 ('A2-GR-some-any-A-5', 'We don’t have any bread at home.', 'correct'),
 ('A2-GR-comparatives-A-3', 'biger', 'wrong'),
 ('A2-GR-comparatives-A-6', 'My new phone is cheaper than the old one.', 'correct'),
 ('A2-GR-going-to-A-5', 'Samir is going to repair the door tonight.', 'correct'),
 ('A2-FN-polite-requests-A-3', '(b) Can I have a bag, please?', 'correct_format_variant'),
 ('A2-FN-polite-requests-A-5', 'Could I have the remote control please?', 'correct'),
 ('A2-FN-polite-requests-A-6', "I'd like a bottle of juice, please.", 'correct'),
 ('A2-GR-frequency-adverbs-A-1', 'Rami usually takes the metro to work.', 'correct'),
 ('A2-GR-present-continuous-A-5', 'My sister is talking on the phone now', 'correct'),
 # ---- free production (target form only, 0/1/2) ----
 ('A2-GR-third-person-s-A-7', 'My friend Ahmed drink coffee every morning.', 'wrong'),
 ('A2-GR-third-person-s-A-7', 'My friend Ali drinks tea and eat bread every morning.', 'minor_slip'),
 ('A2-GR-third-person-s-A-8', 'My father goes to the mosque on friday.', 'off_target_error'),
 ('A2-GR-third-person-s-A-8', 'My mother visites her sister in the weekend.', 'minor_slip'),
 ('A2-GR-third-person-s-B-7', 'Mr Nabil walks his dog.', 'correct'),
 ('A2-GR-third-person-s-B-8', 'My sister play video games after school.', 'wrong'),
 ('A2-GR-third-person-s-C-7', 'The teacher check our homework every day.', 'wrong'),
 ('A2-GR-third-person-s-C-8', 'My grandfather watchs TV in the evening.', 'minor_slip'),
 ('A1-GR-copula-be-A-7', 'Today very sunny.', 'wrong'),
 ('A1-GR-copula-be-A-8', 'My grandmother she is 80 years old.', 'off_target_error'),
 ('A1-GR-copula-be-A-8', 'My grandfather are very kind.', 'wrong'),
 ('A1-GR-article-a-an-A-7', 'I have a pen and an notebook in my bag.', 'minor_slip'),
 ('A1-GR-article-a-an-A-7', 'There is a umbrella in my bag.', 'wrong'),
 ('A1-GR-article-a-an-A-8', 'My uncle is an doctor.', 'wrong'),
 ('A1-GR-article-a-an-A-8', 'My sister is a teacher in primary school.', 'correct'),
 ('A2-GR-past-simple-irregular-A-7', 'Last month I went to Luxor with my family.', 'correct'),
 ('A2-GR-past-simple-irregular-A-8', 'Last week I buyed a new phone.', 'wrong'),
 ('A2-GR-past-simple-irregular-A-8', 'I saw a very beautifull bird in the park last week.', 'off_target_error'),
 ('A2-GR-past-simple-irregular-A-8', 'I boughted a dress for the wedding.', 'minor_slip'),
 ('A1-GR-there-is-are-A-7', 'There is many cars in my street.', 'wrong'),
 ('A1-GR-there-is-are-A-8', 'In my living room there are two sofa and a TV.', 'off_target_error'),
 ('A1-GR-can-ability-A-7', 'I can swimming very well.', 'wrong'),
 ('A1-GR-can-ability-A-8', "I can't drive a car yet.", 'correct'),
 ('A1-GR-can-ability-A-8', "I cann't speak French.", 'minor_slip'),
 ('A2-GR-some-any-A-7', "I don't have some sweets in my bag.", 'wrong'),
 ('A2-GR-some-any-A-8', 'There is some cheese and some egg in my kitchen.', 'off_target_error'),
 ('A2-GR-going-to-A-7', 'This evening I am going to visit my aunt.', 'correct'),
 ('A2-GR-going-to-A-7', 'I going to watch a film tonight.', 'wrong'),
 ('A2-GR-going-to-A-8', 'My friend is going to travel at Dubai for the holiday.', 'off_target_error'),
 ('A2-GR-going-to-A-8', 'My friend is going to travels to Dubai.', 'minor_slip'),
 ('A2-GR-comparatives-A-7', 'Cairo is biger than Alexandria.', 'minor_slip'),
 ('A2-GR-comparatives-A-7', 'Cairo is more big than Aswan.', 'wrong'),
 ('A2-FN-polite-requests-A-8', 'I would like a coffee with milk please.', 'correct'),
 ('A2-FN-polite-requests-A-8', 'I like a tea please.', 'wrong'),
 ('A2-GR-frequency-adverbs-A-7', 'I usually visit my grandmother at weekend.', 'off_target_error'),
 ('A2-GR-frequency-adverbs-A-8', 'I eat never fish.', 'wrong'),
 ('A1-GR-prepositions-time-A-7', 'I start school at 7:30.', 'correct'),
 ('A2-GR-present-continuous-A-8', 'I am writting an answer now.', 'minor_slip'),
 ('A2-VO-make-do-A-8', 'I make my homework every day.', 'wrong'),
 ('A1-GR-possessive-adjectives-A-7', 'My best friend is Sara. His phone is new.', 'wrong'),
 # ---- transfer ----
 ('A2-GR-third-person-s-A-9', 'Omar catches the bus at seven.', 'correct'),
 ('A2-GR-third-person-s-B-9', 'Layla washs her car on Saturday.', 'minor_slip'),
 ('A2-GR-third-person-s-C-9', 'He fix computers at home.', 'wrong'),
 ('A1-GR-copula-be-A-9', "I'm single.", 'correct'),
 ('A1-GR-copula-be-A-9', 'Yes, single.', 'wrong'),
 ('A2-GR-past-simple-irregular-A-9', 'I had eggs and bread.', 'correct'),
 ('A2-GR-going-to-A-9', "On Friday evening I'm going to have dinner with Aunt Mervat.", 'correct'),
 ('A1-GR-prepositions-time-A-9', 'Art club is on Tuesday at 4:00 in October.', 'correct'),
 ('A1-GR-there-is-are-A-9', 'There is a pool and there is two restaurants.', 'minor_slip'),
 ('A2-GR-some-any-A-9', 'Do you have some lemon cake?', 'wrong'),
]
def group(t):
    if t == 'free_production': return 'free'
    if t == 'transfer': return 'transfer'
    return 'controlled'
out, design = [], []
for n, (sfx, resp, cat) in enumerate(A, 1):
    it = items[P + sfx]
    aid = f'a1a2-{n:03d}'
    out.append({'answerId': aid, 'itemId': it['id'], 'outcomeId': it['outcomeId'], 'level': it['level'],
                'itemType': it['type'], 'group': group(it['type']), 'scoring': it['scoring'],
                'prompt': it['prompt'], 'targetForm': it.get('targetForm'), 'response': resp})
    design.append({'answerId': aid, 'designCategory': cat})
from collections import Counter
print(len(out), Counter(o['group'] for o in out))
json.dump({'status': 'DRAFT', 'note': 'Synthetic learner answers written by an agent to resemble Arabic-L1 A1-A2 learners. No scores, no study arm, neutral ids.', 'answers': out},
          open(os.path.join(HERE, 'answers.json'), 'w'), indent=1, ensure_ascii=False)
json.dump({'status': 'DRAFT', 'note': 'Author design intent only. Not given to reference scorers; not a score.', 'design': design},
          open(os.path.join(HERE, 'answers_design.json'), 'w'), indent=1)
