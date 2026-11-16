# DRAFT — AGENT STAND-IN — not the production grader.
# Writes the replies an agent gave when applying the grader's exact prompts
# (evaluateShortAnswer system prompt; RUBRIC_SYSTEM eval-v2) to each answer.
# The harness passes these replies through the REAL validators
# (validateShortAnswer, validateProposal, agree). Same agent that wrote the
# rubric and the reference passes: agreement is likely inflated (REPORT.md §2).
import json
L = 'AGENT STAND-IN — not the production grader'
# Short-answer meaning check (only used when the answer key misses). True = "means the same".
SA = {
 '002': (True, "'re is the short form of are."), '004': (True, 'Same word; full stop only.'),
 '006': (True, 'Same sentence without the full stop.'), '007': (True, "brother's = brother is."),
 '008': (True, 'Correct fix; only a spelling slip in busy.'), '009': (True, 'are is correct; close/closed treated as a slip.'),
 '010': (False, 'The mistake is not corrected.'), '012': (False, 'Wrong article.'), '013': (False, 'Wrong article.'),
 '016': (False, 'Still the wrong article.'), '017': (True, 'Same sentence without the full stop.'),
 '019': (False, 'goed is not the past of go.'), '020': (False, 'seed is not the past of see.'),
 '022': (True, 'Same.'), '023': (True, 'Correct fix; apostrophe slip only.'), '024': (False, 'eated is not a past form.'),
 '025': (True, 'Same.'), '026': (True, "there's = there is."), '027': (False, 'milk is uncountable: there is.'),
 '028': (True, 'Same.'), '029': (True, 'Same.'), '030': (True, 'Same meaning, different order.'),
 '031': (True, 'Correct sentence with the same meaning.'),
 '032': (True, "cannot = can't."), '033': (True, "can not = can't."), '034': (True, 'Same.'),
 '035': (True, "Spelling slip for can't."), '037': (True, 'Same.'), '038': (True, 'Same.'),
 '039': (True, 'Same.'), '041': (True, "do not = don't."), '042': (True, 'Same, curly apostrophe.'),
 '044': (True, 'Same.'), '045': (True, 'Same.'), '047': (True, 'Polite request with the same meaning.'),
 '048': (True, "I'd like = I would like."), '049': (True, 'usually is in position A.'), '050': (True, 'Same without full stop.'),
 '001': (True, 'Same.'), '003': (True, 'Same.'), '015': (True, 'Same.'), '018': (True, 'Same.'),
}
# Rubric runs: (level, quote) per answer for run 1 and run 2.
R1 = {
 '051': ('tf0', None), '052': ('tf1', 'drinks'), '053': ('tf2', 'goes'), '054': ('tf1', 'visites'), '055': ('tf2', 'walks'),
 '056': ('tf0', None), '057': ('tf0', None), '058': ('tf1', 'watchs'), '059': ('tf0', None), '060': ('tf2', 'she is'),
 '061': ('tf0', None), '062': ('tf1', 'a pen'), '063': ('tf0', None), '064': ('tf0', None), '065': ('tf2', 'a teacher'),
 '066': ('tf2', 'went'), '067': ('tf0', None), '068': ('tf2', 'saw'), '069': ('tf1', 'boughted'), '070': ('tf0', None),
 '071': ('tf2', 'there are'), '072': ('tf0', None), '073': ("tf2", "can't drive"), '074': ('tf1', "cann't speak"),
 '075': ('tf0', None), '076': ('tf2', 'some cheese'), '077': ('tf2', 'am going to visit'), '078': ('tf0', None),
 '079': ('tf2', 'is going to travel'), '080': ('tf1', 'is going to travels'), '081': ('tf1', 'biger than'), '082': ('tf0', None),
 '083': ('tf2', 'I would like'), '084': ('tf0', None), '085': ('tf2', 'usually visit'), '086': ('tf0', None),
 '087': ('tf2', 'at 7:30'), '088': ('tf1', 'am writting'), '089': ('tf0', None), '090': ('tf0', None),
 '091': ('tf2', 'catches'), '092': ('tf1', 'washs'), '093': ('tf0', None), '094': ('tf2', "I'm single"), '095': ('tf0', None),
 '096': ('tf2', 'I had'), '097': ('tf2', "I'm going to have"), '098': ('tf2', 'on Tuesday at 4:00 in October'),
 '099': ('tf1', 'There is a pool'), '100': ('tf0', None),
}
R2 = dict(R1)
R2['072'] = ('tf1', 'can swimming')        # run 2 read the -ing as a slip after a correct auxiliary
R2['060'] = ('tf1', 'she is')              # run 2 marked down the extra pronoun (an off-target error)
FB = 'Look again at the form this task practises and check it in your sentence.'
def rubric_reply(aid, lvl, q):
    return {'criteria': [{'criterionId': 'target_form', 'levelId': lvl, 'evidence': [q] if q else [], 'rationale': f'Target form only; level {lvl}.'}],
            'scoreExplanation': f'Scored on the target form only ({lvl}).', 'strengths': [], 'improvements': [],
            'feedback': FB, 'objectiveIds': [], 'confidence': 'medium', 'flags': []}
json.dump({'status': 'DRAFT', 'label': L, 'prompt': 'evaluateShortAnswer system prompt (gradingProposals.ts), eval-v2',
           'replies': {f'a1a2-{k}': {'correct': v, 'scoreExplanation': e, 'feedback': 'Check your answer again.', 'flags': []} for k, (v, e) in SA.items()}},
          open('standin_short.json', 'w'), indent=1, ensure_ascii=False)
for n, R in ((1, R1), (2, R2)):
    json.dump({'status': 'DRAFT', 'label': L, 'prompt': 'RUBRIC_SYSTEM (eval-v2, PRODUCTION_POLICY) + rubric from docs/SCORING_RUBRIC.md §2.3/2.4', 'run': n,
               'replies': {f'a1a2-{k}': rubric_reply(k, *v) for k, v in R.items()}}, open(f'standin_rubric_run{n}.json', 'w'), indent=1, ensure_ascii=False)
