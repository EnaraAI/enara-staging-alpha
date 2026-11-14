import csv, json, hashlib, os, collections, statistics as st, datetime
B = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha/docs/benchmarks/language-teaching'
REV = f'{B}/20261109T1310-ltb-v1.0-ai-review'; W = f'{REV}/work'; O = f'{B}/20261109T1211-ltb-v1.0-ageband/official'; R3 = f'{B}/20261109T1110-ltb-v1.0-r3/official'
D = ['learner_context_fidelity', 'lesson_alignment', 'pedagogical_appropriateness', 'scaffolding_adaptation', 'age_proficiency_fit', 'formative_check_evidence', 'clarity_accessibility']
NAME = dict(zip(D, ['Learner-context fidelity', 'Lesson alignment', 'Pedagogical appropriateness', 'Scaffolding', 'Age & proficiency fit', 'Formative check', 'Clarity']))
L = lambda p: [json.loads(l) for l in open(p) if l.strip()]
cmp_ = json.load(open(f'{W}/comparison.json')); C = cmp_['cases']; OV = cmp_['overall']; DM = cmp_['dimensions']
rev = {j['case_id']: j for j in L(f'{REV}/independent_case_reviews.jsonl')}
cases = {c['id']: c for c in L(f'{O}/benchmark_cases.jsonl')}
raw = {r['caseId']: r for r in L(f'{O}/raw_results.jsonl')}; r3raw = {r['caseId']: r for r in L(f'{R3}/raw_results.jsonl')}
rows = {r['caseId']: r for r in csv.DictReader(open(f'{O}/case_scores.csv'))}; r3rows = {r['caseId']: r for r in csv.DictReader(open(f'{R3}/case_scores.csv'))}
AUD = {x['taskId']: x['result'] for x in L(f'{W}/audit_results.jsonl')}
porder = json.load(open(f'{W}/regression_pair_order.json')); aorder = json.load(open(f'{W}/adjudication_order.json'))
r3blind = {j['case_id']: j for j in L(f'{W}/r3_regression_blind_reviews.jsonl')}
def mean(s):
    v = [s[d] for d in D if isinstance(s.get(d), int)]; return sum(v) / len(v)
def norm(s): return ' '.join(str(s or '').replace('*', '').replace('_', ' ').split()).lower()
def in_transcript(q, r): return bool(q) and any(norm(q)[:80] in norm(t.get('reply')) for t in r['turns'])
def derive(scores, fails, crit, detrow):
    det = {k[4:]: v for k, v in detrow.items() if k.startswith('chk_')}
    if det['reply_received'] == 'fail' or det['no_direct_identifiers_in_payload'] == 'fail': return 'DOES_NOT_MEET'
    v = [scores[d] for d in D if scores[d] != 'n/a']
    if crit or any(f.get('severity') == 'critical' for f in fails) or 0 in v: return 'DOES_NOT_MEET'
    if not any(x == 'fail' for x in det.values()) and min(v) >= 2 and sum(v) / len(v) >= 3: return 'MEETS'
    return 'PARTIAL'
pct = lambda a, n=120: f'{100*a/n:.1f}%'

# ---------- spend ----------
att_files = {'pilot (2 cases, superseded prompt)': f'{W}/pilot_review_attempts.jsonl', 'aborted run v1 (prompt lacked restrictions 1-9; discarded)': f'{W}/aborted_v1/review_attempts.jsonl',
             'blind review (120 cases, final prompt)': f'{W}/review_attempts.jsonl', 'targeted audits + adjudication (122 tasks)': f'{W}/audit_attempts.jsonl',
             'blind review of r3 transcripts for the 9 regressions': f'{W}/r3_regression_attempts.jsonl'}
spend = {}
for k, p in att_files.items():
    a = L(p); u = collections.Counter()
    for x in a:
        for t in ('input_tokens', 'output_tokens'): u[t] += (x.get('usage') or {}).get(t, 0) or 0
        u['thinking_tokens'] += ((x.get('usage') or {}).get('output_tokens_details') or {}).get('thinking_tokens', 0) or 0
    spend[k] = {'calls': len(a), 'http200': sum(1 for x in a if x.get('status') == 200), 'retries': sum(1 for x in a if x.get('attempt', 1) > 1), 'inputTokens': u['input_tokens'], 'outputTokens': u['output_tokens'], 'thinkingTokensInOutput': u['thinking_tokens'], 'usd': round(sum(x.get('costUsd', 0) for x in a), 6)}
TOTAL = round(sum(v['usd'] for v in spend.values()), 4)

# ---------- adjudication ----------
adj = {}
for cid, o in aorder.items():
    r = AUD['ADJ:' + cid]; Aind = o.startswith('A=independent')
    disp = 'UNRESOLVED' if r['favours'] == 'UNRESOLVED' else ('ACCEPT_INDEPENDENT' if (r['favours'] == 'A') == Aind else 'ACCEPT_ORIGINAL')
    adj[cid] = {**r, 'disposition': disp, 'evidenceInTranscript': in_transcript(str(r.get('evidence', '')).split('"')[1] if '"' in str(r.get('evidence', '')) else r.get('evidence'), raw[cid])}
dc = collections.Counter(a['disposition'] for a in adj.values())
agreedMeets = sum(1 for i in C if C[i]['official'] == C[i]['independent'] == 'MEETS')
resolvedMeets = agreedMeets + sum(1 for i, a in adj.items() if (a['disposition'] == 'ACCEPT_ORIGINAL' and C[i]['official'] == 'MEETS') or (a['disposition'] == 'ACCEPT_INDEPENDENT' and C[i]['independent'] == 'MEETS'))
unres = [i for i, a in adj.items() if a['disposition'] == 'UNRESOLVED']
lo, hi = resolvedMeets, resolvedMeets + len(unres)
indMeets = OV['independentDist'].get('MEETS', 0)
boundary = [i for i in C if C[i]['official'] == 'MEETS' and abs(mean(C[i]['officialScores']) - 3) < 1e-9]

# ---------- regressions ----------
REG = list(porder.keys()); reg = {}
for cid in REG:
    r = AUD['E:' + cid]; latestX = porder[cid].startswith('X=latest')
    better = {'X': 'latest' if latestX else 'r3', 'Y': 'r3' if latestX else 'latest'}.get(r['better'], 'equivalent')
    b3 = r3blind[cid]; r3out = derive(b3['dimension_scores'], b3['failure_tags'], (b3.get('critical_issue') or {}).get('present'), r3rows[cid])
    reg[cid] = {'pairBetter': better, 'pairType': r['difference_type'], 'reason': r['exact_reason'], 'r3Official': r3rows[cid]['outcome'], 'latestOfficial': C[cid]['official'],
                'r3Blind': r3out, 'r3BlindMean': round(mean(b3['dimension_scores']), 2), 'latestBlind': C[cid]['independent'], 'latestBlindMean': round(mean(C[cid]['independentScores']), 2)}
    x = reg[cid]
    if x['latestBlind'] == 'MEETS': v = 'JUDGE_VARIATION — independent review scores the latest transcript MEETS; the official PARTIAL is not supported'
    elif x['r3Blind'] == 'MEETS' and x['pairBetter'] == 'r3': v = 'GENUINE_REGRESSION — r3 meets, latest falls below threshold, pairwise comparison prefers r3'
    elif x['r3Blind'] != 'MEETS' and x['latestBlind'] != 'MEETS': v = 'BOTH_BELOW_THRESHOLD — independent review finds r3 also below MEETS; the official r3 MEETS was itself borderline'
    else: v = 'MIXED_EVIDENCE'
    x['verdict'] = v

# ---------- helpers for cohorts/tags ----------
def tagcases(cat, src='ind'):
    if src == 'ind': return [i for i in C if any(cat in f for f in C[i]['independentFailures'])]
    return [i for i in C if cat in C[i]['officialFailures']]
words = lambda src, coh: [len((t.get('reply') or '').split()) for x in src.values() if x['cohort'] == coh for t in x['turns']]
os.makedirs(REV, exist_ok=True)

# ================= independent_ai_review_report.md =================
md = []; w = md.append
w('# ENARA Phase 1: Independent AI Review of the r3 + Trusted Age Band run\n')
w('Benchmark `ltb-v1.0`, run `20261109T1211-ltb-v1.0-ageband` (official result **90/120 MEETS, 75.0%**). Review date: 2026-11-09. Rubric `ltb-rubric-v1` and scorer `ltb-scoring-v1`, both used unchanged.\n')
w('> **What this is not.** This is an AI-only review. It is not human educator validation. It is not evidence of learning gains or real-world educational effectiveness. All conversations are synthetic.\n')
w('## 1. Executive summary\n')
w(f'- **Reviewer:** `claude-haiku-5-5` at high effort. This is a different Claude model from the tutor (`claude-opus-5-5`) and the official judge (`claude-sonnet-5-5`), from the **same provider**. The review is **partially independent, not cross-provider**: no other provider is configured in this repository.')
w(f'- **Coverage:** 120/120 cases were reviewed and 0 were unreviewable. Each case was a blind, isolated call. Reviews were sealed (SHA-256 `{open(W+"/blind_reviews_sha256_at_seal.txt").read().split()[0]}`) before any judge output was read.')
w(f'- **Independent outcome (frozen `ltb-scoring-v1` rule applied to the independent scores):** **{indMeets}/120 MEETS ({pct(indMeets)})**, {OV["independentDist"].get("PARTIAL",0)} PARTIAL, {OV["independentDist"].get("DOES_NOT_MEET",0)} DOES_NOT_MEET. The reviewer\'s own holistic verdicts give {OV["holisticDist"].get("MEETS")}/120.')
w(f'- **Against the official result:** 90/120 (75.0%) officially, {indMeets}/120 ({pct(indMeets)}) independently. Outcome agreement is {OV["agreementPct"]}% (Cohen\'s κ = {OV["kappa"]}). All {len(cmp_["disagreements"])} disagreements are MEETS↔PARTIAL: 25 official MEETS were scored PARTIAL independently, and 10 official PARTIAL were scored MEETS.')
w(f'- **After adjudicating the 35 disagreements:** {resolvedMeets}–{hi}/120 MEETS ({pct(lo)}–{pct(hi)}). The spread comes from {len(unres)} unresolved cases.')
w(f'- **70% internal target (84/120):** **not met under independent scoring**, in any of the scenarios above.')
w(f'- **Why the counts differ:** the two evaluators agree closely on each dimension. Mean differences are at most 0.18, and 99–100% of scores fall within 1 point. But {len(boundary)} of the 90 official MEETS have a judge mean of **exactly 3.00**, the threshold. A one-point difference on one dimension flips such a case. The official 75% therefore rests on a large boundary population.')
w('- **No critical issues.** No critical failure tag, no dimension scored 0, no DOES_NOT_MEET, and no privacy issue.')
w('- **Recommended status:** `AI_REVIEW_FINDS_MATERIAL_SCORING_DISAGREEMENT` (see `phase1_ai_review_decision.md`).\n')
w('## 2. Methodology\n')
w('1. **Phase 0 integrity checks**, all passed:')
w('   - 120 unique cases and 219 turns;')
w('   - case-set SHA-256 `725edb2b…a2bb` matches;')
w('   - all 50 artifacts in the run manifest re-verified;')
w('   - runtime `languageTurn` metadata on all 219 turns: child/class_age_band/known 73, teen/class_age_band/known 73, adult/school_setting_adult_learners/known 73;')
w('   - 0 empty replies.')
w('2. **Phase 1–2 blind review:** one isolated call per case.')
w('   - **The reviewer saw:** the frozen rubric (anchors, scoring rules, failure categories, severity); the evaluation checks A–G and restrictions 1–9 from the brief; the case ID, trusted age band, CEFR estimate, situation type, lesson and objective, expected and unacceptable behaviour, word limit; and the full transcript.')
w('   - **The reviewer did not see:** judge scores, tags, outcomes, regression status, engine moves, deterministic-check results, or the learner\'s grade (restriction 5).')
w('   - **Output checks:** JSON is validated, with one re-ask if invalid. Every evidence quote is checked against the transcript: 543/544 quotes were found verbatim.')
w('   - **Privacy:** every payload is scanned for the synthetic name, email, student/school/batch IDs and school name before sending. 0 hits; nothing was blocked.')
w('3. **Outcome derivation:** the frozen `ltb-scoring-v1` rule from `score.mjs`, with the independent scores and tags in place of the judge\'s and the official deterministic-check results (unchanged). The reviewer\'s holistic outcome is kept as a secondary field. It agrees with the derived outcome in 116/120 cases; the 4 differences are 3 mastery-regex check failures and 1 holistic MEETS at a 2.83 mean.')
w('4. **Phase 3 targeted audits**, run after the seal, could use the official flags as hypotheses:')
w('   - 5 factual-error flags;')
w('   - 40 teen cases;')
w('   - 11 ignored-reply flags;')
w('   - 22 verbosity flags;')
w('   - 9 regressions, compared pairwise r3 vs latest with an anonymised, randomised order, plus a blind review of the r3 transcripts with the identical prompt.')
w('5. **Phase 4 comparison and adjudication:** each of the 35 disagreements went to a separate adjudication call. The two evaluations were presented anonymised as A/B in randomised order, with the transcript. Scores were never averaged.')
w(f'6. **Spend:** ${TOTAL:.4f} of the $5.00 cap ({sum(v["calls"] for v in spend.values())} calls), metered from provider-reported usage with the repository price catalogue. No budget, provider setting or `AI_TEST_SPEND_ID` was touched.\n')
w('## 3. Reviewer identity and independence\n')
w('| Role | Model | Effort |\n|---|---|---|\n| Tutor (under review) | claude-opus-5-5 | low |\n| Official judge | claude-sonnet-5-5 | medium |\n| **Independent reviewer, auditor and adjudicator** | **claude-haiku-5-5** | high |\n')
w('Option 1 in the brief (a different provider) was not available: the backend price catalogue and configuration contain Anthropic models only, and no credentials were created. Option 2 was used. Opus was not chosen because it generated the transcripts, which risks self-preference. The review is labelled **DIFFERENT CLAUDE MODEL, SAME PROVIDER — PARTIALLY INDEPENDENT, NOT CROSS-PROVIDER**. A smaller model can also be stricter or noisier than a larger judge; see Limitations.\n')
w('## 4. Overall outcomes\n')
w('| | MEETS | PARTIAL | DOES_NOT_MEET |\n|---|---:|---:|---:|')
w(f'| Official judge | 90 | 30 | 0 |\n| Independent (frozen rule) | {indMeets} | {OV["independentDist"].get("PARTIAL",0)} | {OV["independentDist"].get("DOES_NOT_MEET",0)} |\n| Independent (holistic) | {OV["holisticDist"].get("MEETS",0)} | {OV["holisticDist"].get("PARTIAL",0)} | {OV["holisticDist"].get("DOES_NOT_MEET",0)} |\n| After adjudication | {lo}–{hi} | {120-hi}–{120-lo} | 0 |\n')
w('## 5. Seven-dimension analysis (independent reviewer)\n')
w('| Dimension | Independent mean | Official mean | Δ | Exact agreement | Within 1 |\n|---|---:|---:|---:|---:|---:|')
for d in D: x = DM[d]; w(f'| {NAME[d]} | {x["independentMean"]:.2f} | {x["officialMean"]:.2f} | {x["diff"]:+.2f} | {x["exact"]}% | {x["within1"]}% |')
w('\nThe independent reviewer is slightly stricter on lesson alignment, context fidelity, scaffolding and pedagogy, and slightly more lenient on age fit and clarity. Weakest dimensions overall: **scaffolding** (2.75) and **formative check** (2.82).\n')
w('Independent failure tags (count):\n')
w('| Tag | Independent | Official |\n|---|---:|---:|')
allt = sorted(set(list(cmp_['tagCounts']['independent']) + list(cmp_['tagCounts']['official'])), key=lambda t: (-cmp_['tagCounts']['independent'].get(t, 0), t))
for t in allt: w(f'| {t} | {cmp_["tagCounts"]["independent"].get(t,0)} | {cmp_["tagCounts"]["official"].get(t,0)} |')
w('\nThe independent reviewer\'s dominant concern is **over-helping**: 33 tags, including 3 major ones where hints reveal the target answer. The official judge\'s dominant tags are lesson drift and verbosity. The independent reviewer also raised 13 factual_error tags (2 major); see the factual audit, where several are judged pedantic.\n')
for title, key in [('6. Cohort breakdown', 'byCohort'), ('7. CEFR breakdown', 'byCefr'), ('8. Situation-type breakdown', 'byType')]:
    w(f'## {title}\n'); w('| Group | n | Official MEETS | Independent MEETS | Outcome agreement | Age-fit (official → independent) |\n|---|---:|---:|---:|---:|---|')
    for k, x in cmp_[key].items(): w(f'| {k} | {x["n"]} | {x["officialMeets"]} | {x["independentMeets"]} | {x["agree"]}/{x["n"]} | {x["officialAgeFit"]:.2f} → {x["independentAgeFit"]:.2f} |')
    w('')
w('Teen cases have the lowest independent MEETS count (24/40). The teen audit shows the cause is **over-helping in the T05–T13 multi-turn situations**, not register.\n')
w('## 9. Rubric ambiguities flagged by the reviewer\n')
w(f'The reviewer raised `RUBRIC_AMBIGUITY` notes on {len(OV["ambiguityFlags"])} cases. It was asked to flag rather than invent thresholds (restriction 9). Recurring themes:')
w('- **No threshold for how strong a hint may be** before it counts as over-helping. This affects scaffolding and pedagogy scores in T05, T06 and T13.')
w('- **No definition of what counts as a meaningful formative check:** whether a copy-with-one-blank prompt or a single "Your turn" qualifies.')
w('- **How to score a learner answer that matches the lesson item but not the tutor\'s own prompt.**')
w('- **How to weigh partial lesson alignment and minor simplifications.**\n')
w('These gaps are the main reason two careful evaluators land on opposite sides of 3.00 for the same transcript. **Recommendation:** add hint-strength and formative-check anchors in a future rubric version (v2). Do not change v1 retroactively.\n')
w('## 10. Limitations\n')
w('- **No human educator involved.** The review is AI-only and the reviewer is from the same provider as the tutor and judge. Shared training biases cannot be excluded.')
w('- **One model reviewed, audited and adjudicated.** Haiku 5.5 did all three. The adjudication accepted the independent reading 21 times and the original 7 times; self-agreement bias is possible. The decision does not depend on the adjudication: independent scoring alone is 62.5%, and even the most favourable adjudicated scenario is 64.2%.')
w('- **One pass per case.** No self-consistency repeat of the reviewer was run. The official judge\'s 12-case repeat agreed on 94% of dimension scores with 0 outcome flips.')
w('- **Orchestrator was not blind.** The orchestrating agent (Claude Code) had seen the official results in earlier work. It did not score cases; all scores come from isolated reviewer calls. The audit commentary in `targeted_issue_audit.md` is the orchestrator\'s interpretation and is labelled as such.')
w('- **Synthetic transcripts only.** Nothing here measures learning.\n')
open(f'{REV}/independent_ai_review_report.md', 'w').write('\n'.join(md))

# ================= original_vs_independent_comparison.md =================
md = []; w = md.append
w('# Original judge vs independent AI review\n')
w('> The independent reviewer (`claude-haiku-5-5`) is a different model from the original judge (`claude-sonnet-5-5`) but from the **same provider**. Agreement is therefore **partial, not fully independent, validation**.\n')
w('## 1. Overall agreement\n')
w(f'- Outcome agreement: **{OV["agreement"]}/120 ({OV["agreementPct"]}%)**. Cohen\'s κ = {OV["kappa"]}, which is fair agreement.')
w(f'- Official: 90 MEETS / 30 PARTIAL. Independent: {indMeets} MEETS / {OV["independentDist"].get("PARTIAL",0)} PARTIAL.')
w(f'- Of the 90 official MEETS, {len(boundary)} have a judge mean of exactly 3.00. Of these, {sum(C[i]["independent"]=="PARTIAL" for i in boundary)} were scored PARTIAL independently.\n')
w('## 2. Confusion matrix (rows = official, columns = independent)\n')
w('| Official \\ Independent | MEETS | PARTIAL | DOES_NOT_MEET |\n|---|---:|---:|---:|')
for a in ['MEETS', 'PARTIAL', 'DOES_NOT_MEET']: w(f'| {a} | {OV["confusion"][a]["MEETS"]} | {OV["confusion"][a]["PARTIAL"]} | {OV["confusion"][a]["DOES_NOT_MEET"]} |')
w('\n## 3. Dimension comparison\n')
w('| Dimension | Official mean | Independent mean | Δ | Exact | Within 1 | Independent lower / higher | Gaps ≥2 |\n|---|---:|---:|---:|---:|---:|---|---|')
for d in D: x = DM[d]; w(f'| {NAME[d]} | {x["officialMean"]:.2f} | {x["independentMean"]:.2f} | {x["diff"]:+.2f} | {x["exact"]}% | {x["within1"]}% | {x["indLower"]} / {x["indHigher"]} | {", ".join(x["bigGaps"]) or "none"} |')
w('\n**Agreement pattern:**')
w('- At the dimension level the two evaluators are close: no mean differs by more than 0.18 and nearly every score is within 1 point.')
w('- The only gap of 2+ points is on lesson alignment in one case.')
w('- The outcome disagreement comes almost entirely from **single-point differences on cases sitting at the 3.00 threshold**, not from opposite readings of the conversations.\n')
w('## 4. Cohort, CEFR and situation-type comparison\n')
for title, key in [('Cohort', 'byCohort'), ('CEFR', 'byCefr'), ('Situation type', 'byType')]:
    w(f'### {title}\n'); w('| Group | n | Official MEETS | Independent MEETS | Agreement |\n|---|---:|---:|---:|---:|')
    for k, x in cmp_[key].items(): w(f'| {k} | {x["n"]} | {x["officialMeets"]} | {x["independentMeets"]} | {pct(x["agree"], x["n"])} |')
    w('')
w('## 5. Adjudication\n')
w(f'Each of the {len(adj)} disagreements was adjudicated in a separate call. The adjudicator saw the transcript and both evaluations, anonymised as A/B in randomised order, plus the frozen outcome rule. Neither evaluation was presumed right, and scores were never averaged.\n')
w(f'- Dispositions: **ACCEPT_INDEPENDENT {dc["ACCEPT_INDEPENDENT"]}**, **ACCEPT_ORIGINAL {dc["ACCEPT_ORIGINAL"]}**, **UNRESOLVED {dc["UNRESOLVED"]}**.')
w(f'- Resulting MEETS count: {lo}/120 with all unresolved cases as PARTIAL, {hi}/120 with all unresolved as MEETS, i.e. {pct(lo)}–{pct(hi)}.')
w('- **Caveat:** the adjudicator is the same model as the independent reviewer, so a preference for its own reading is possible. Use the dispositions as triage for human review, not as final rulings.\n')
w('## 6. Complete adjudication queue\n')
for cid in sorted(adj):
    a = adj[cid]; c = C[cid]; r = rev[cid]
    disputed = a.get('disputed_dimensions') or []
    w(f'### {cid} ({c["cohort"]}, {c["cefr"]}, {c["type"]}): official **{c["official"]}** → independent **{c["independent"]}** → **{a["disposition"]}**\n')
    w(f'- Means: official {mean(c["officialScores"]):.2f}, independent {mean(c["independentScores"]):.2f}. Disputed dimensions: {", ".join(disputed) or "n/a"}.')
    w('- Scores (official → independent): ' + '; '.join(f'{NAME[d]} {c["officialScores"][d]}→{c["independentScores"][d]}' for d in D if c['officialScores'][d] != c['independentScores'][d]) + '.')
    orat = ' '.join(f'[{NAME.get(d,d)}] {c["officialRationale"].get(d,"")}' for d in disputed if d in c['officialRationale'])[:700]
    w(f'- **Original rationale:** {orat or "—"} Original tags: {c["officialFailures"] or "none"}.')
    irat = ' '.join(f'"{e.get("quote","")}" (turn {e.get("turn")}): {e.get("supports","")}' for e in r['evidence'][:3])[:700]
    w(f'- **Independent rationale:** tags {", ".join(c["independentFailures"]) or "none"}. {irat}')
    w(f'- **Adjudication** (confidence {a.get("confidence")}; supported outcome {a.get("supported_outcome")}): {str(a.get("explanation",""))[:600]}')
    w(f'- **Transcript evidence:** {str(a.get("evidence",""))[:300]}\n')
open(f'{REV}/original_vs_independent_comparison.md', 'w').write('\n'.join(md))

# ================= targeted_issue_audit.md =================
md = []; w = md.append
w('# Targeted issue audits (Phase 3)\n')
w('Each audit call was an isolated `claude-haiku-5-5` call made **after** the blind reviews were sealed. The official flags were given only as hypotheses that might be wrong. Text marked **Orchestrator note** is the orchestrating agent\'s own reading of the transcript; it is not an independent score.\n')
w('## A. Factual-correctness audit (5 official `factual_error` flags)\n')
ON = {'LTB-CA2-T07': 'Agreed: a genuine English-rule error. "go" ends in -o, not -ch. The tutor had stated the -o rule correctly in turn 2, so this contradicts its own earlier teaching. Severity minor-to-major: it could confuse a child learning spelling rules.',
      'LTB-CA2-T03': 'This is a misquotation of the learner ("go to bed late" vs the learner\'s "went to bed late"), not a false statement about English. The label CONFIRMED_FACTUAL_ERROR is accepted for the misquote. It does not teach a wrong rule.',
      'LTB-AA2-T11': 'Agreed: "it doesn\'t work" listed under "it + verb with -s" is misleading. In negatives the -s moves to "does". Minor, but it touches the exact grammar point being taught.',
      'LTB-TA1-T02': 'The sentence is awkward ("like you are a child of your mum and dad") rather than false. This is closer to a clarity issue; the half-sibling point the reviewer raised is an acceptable simplification at A1.',
      'LTB-TA2-T03': 'Agreed: praising "went to bed late" as a habit while the lesson is the present simple sends a mixed signal. The same turn does say "not past words like went", which limits the harm.'}
w('| Case | Classification | Severity | Could mislead | Tutor statement (turn) |\n|---|---|---|---|---|')
for cid in sorted(k[2:] for k in AUD if k.startswith('A:')):
    a = AUD['A:' + cid]; w(f'| {cid} | **{a["classification"]}** | {a["severity"]} | {a.get("could_mislead_learner")} | "{a["tutor_statement"]}" (t{a.get("turn")}) |')
w('')
for cid in sorted(k[2:] for k in AUD if k.startswith('A:')):
    a = AUD['A:' + cid]
    w(f'**{cid}.**')
    w(f'- Context: {a.get("context","")}')
    w(f'- Explanation: {a.get("explanation","")}')
    w(f'- Remediation: {a.get("recommended_remediation","")}')
    w(f'- External verification needed: {a.get("claim_needing_external_verification") or "none"}')
    w(f'- *Orchestrator note:* {ON.get(cid,"")}\n')
w('**Additional factual_error tags raised only by the blind reviewer** (13 total, 2 major):\n')
for cid in tagcases('factual_error'):
    for t in rev[cid]['failure_tags']:
        if t['category'] == 'factual_error': w(f'- {cid} ({t["severity"]}, turn {t.get("turn")}): {t["note"]}')
w('\n**Orchestrator note:**')
w('- **Real or misleading statements:**')
w('  - CA2-T07: "go" given as an example of a -ch verb.')
w('  - AA2-T11: the negative grouped under "+ -s".')
w('  - The "only one word/thing changes" slips in CB1-T06 and TA1-T06.')
w('  - AA2-T06: "one extra letter".')
w('  - AB1-T13: "gone" offered without explaining "been to" versus "gone to".')
w('- **Pedantic flags:** the sister/mother definitions (TA1-T02, AA1-T02) and "always ≈ every day" (CA2-T01) are acceptable A1/A2 simplifications.')
w('- **Contestable diagnosis:** AB1-T03 calls "I never have seen" a word-order problem; the placement is unusual but not wrong.')
w('- **Neither flag holds up:** CB1-T04 and AB1-T08.')
w('- **Conclusion:** factual issues are **real but minor and sparse**: about 6 problematic statements across 219 turns, none critical. They cluster in rule statements, so a "state the rule precisely" constraint in the tutor prompt would address them.\n')
w('## B. Teen cohort audit (40 cases)\n')
tb = [AUD['B:' + c] for c in sorted(c for c in cases if cases[c]['cohort'] == 'teen')]
cls = collections.Counter(x['classification'] for x in tb)
rt = collections.defaultdict(list)
for x in tb:
    for k, v in x['ratings'].items(): rt[k].append(v)
w(f'- Register classification: **APPROPRIATE {cls["APPROPRIATE"]}/40**, MINOR_REGISTER_ISSUE {cls["MINOR_REGISTER_ISSUE"]}, MATERIAL_REGISTER_PROBLEM {cls["MATERIAL_REGISTER_PROBLEM"]}. Childish: {sum(1 for x in tb if x.get("childish_or_too_adult")=="childish")}. Too adult: {sum(1 for x in tb if x.get("childish_or_too_adult")=="too_adult")}.')
w('- Mean ratings (0 = problem, 1 = minor, 2 = fine): ' + ', '.join(f'{k} {st.mean(v):.2f}' for k, v in rt.items()) + '.')
w(f'- Reply length, median words per tutor turn (r3 → latest): child {st.median(words(r3raw,"child"))} → {st.median(words(raw,"child"))}; **teen {st.median(words(r3raw,"teen"))} → {st.median(words(raw,"teen"))}**; adult {st.median(words(r3raw,"adult"))} → {st.median(words(raw,"adult"))}.')
w(f'- Independent age-fit for teens: {cmp_["byCohort"]["teen"]["independentAgeFit"]:.2f}, the official judge\'s {cmp_["byCohort"]["teen"]["officialAgeFit"]:.2f}. Neither evaluator finds an age-fit problem.')
teenOH = [i for i in tagcases('over_helping') if C[i]['cohort'] == 'teen']
w(f'- Independent MEETS for teens is 24/40, the lowest cohort. **{len(teenOH)} of the {len(tagcases("over_helping"))} over_helping tags are teen cases** ({", ".join(teenOH)}), mostly the TA2 multi-turn cases.')
for x, cid in zip(tb, sorted(c for c in cases if cases[c]['cohort'] == 'teen')):
    if x['classification'] != 'APPROPRIATE': w(f'- {cid}: {x["classification"]} ({x.get("childish_or_too_adult")}): {x["explanation"]}')
w('\n**Conclusion:**')
w('- The teen register is appropriate. The shift from 33 to 32 official MEETS, the age-fit change from 3.13 to 3.05, and the median length rising from 69 to 78 words are consistent with **ordinary output variation**: the length rise stays within targets and the auditor never found it harmful.')
w('- The genuine teen weakness is **scaffolding**: hints that give away the answer. That is not a register problem.\n')
w('## C. Ignored learner replies (11 official flags)\n')
w('| Case | Official | Audit classification | Severity | Learner text |\n|---|---|---|---|---|')
for cid in tagcases('ignored_learner_reply', 'off'):
    a = AUD['C:' + cid]; sev = [f for f in C[cid]['officialFailures'].split(';') if 'ignored' in f][0].split(':')[0]
    w(f'| {cid} | {sev} | **{a["classification"]}** | {a["severity"]} | "{a.get("learner_text","")}" |')
w('')
for cid in tagcases('ignored_learner_reply', 'off'):
    a = AUD['C:' + cid]; w(f'- **{cid}:** {a["explanation"]} *Should have:* {a.get("what_the_tutor_should_have_done","")}')
cc = collections.Counter(AUD['C:' + c]['classification'] for c in tagcases('ignored_learner_reply', 'off'))
w(f'\n**Conclusion:**')
w(f'- **{cc["ACTUALLY_IGNORED"]} replies were truly ignored.** {cc["RESPONDED_APPROPRIATELY"]} of the 11 flags are not supported: the tutor quoted and addressed the learner\'s text.')
w(f'- **{cc["ACKNOWLEDGED_NOT_USED"]} cases are major:** CA2-T08 and TA2-T08 (T08, "consolidate after success"). The tutor confirmed the learner\'s correct sentences, then kept re-issuing the same item instead of advancing.')
w('- **The pattern behind both:** when the learner\'s correct answer matches a lesson item rather than the tutor\'s own just-written prompt, the tutor treats it as off-task. The blind reviewer independently flagged the same pattern as major in CA1-T03, CB1-T08, TA1-T04 and TA2-T08.')
w('- **This is a real, narrow defect in success handling**, not a general failure to listen.\n')
w('## D. Verbosity audit (22 official `verbosity` flags)\n')
ver = tagcases('verbosity', 'off')
w('| Cohort | Flags | HARMFUL_VERBOSITY | MILD_EXCESS | ACCEPTABLE_LENGTH |\n|---|---:|---:|---:|---:|')
for coh in ['child', 'teen', 'adult']:
    s = [AUD['D:' + c]['classification'] for c in ver if C[c]['cohort'] == coh]; k = collections.Counter(s)
    w(f'| {coh} | {len(s)} | {k["HARMFUL_VERBOSITY"]} | {k["MILD_EXCESS"]} | {k["ACCEPTABLE_LENGTH"]} |')
for k in ['unnecessary_explanation', 'repetition', 'cognitive_overload', 'reduced_learner_participation', 'tutor_dominates', 'length_appropriate_for_age_and_cefr']:
    w(f'- {k}: {sum(1 for c in ver if AUD["D:"+c].get(k))}/22')
w('\n**Conclusion:**')
w('- No flagged case shows harmful verbosity. The excess is **unnecessary explanation (16/22) and repetition (11/22)**, mostly re-stating the rule, and it does not reduce learner participation (0/22).')
w('- Adults carry most flags (10), consistent with adult replies being longest (median 89 words).')
w('- The blind reviewer, told not to penalise length as such, raised only 1 verbosity tag. The official judge\'s 22 flags look like a judge-style preference more than a learning-interaction problem.')
w('- **Recommended remediation, low priority:** trim repeated rule restatements.\n')
w('## E. Regression audit (9 cases: official r3 MEETS → latest PARTIAL)\n')
w('| Case | r3 official | Latest official | r3 independent (mean) | Latest independent (mean) | Pairwise better | Verdict |\n|---|---|---|---|---|---|---|')
for cid in REG:
    x = reg[cid]; w(f'| {cid} | {x["r3Official"].replace("_expectations","").replace("partially_meets","partial")} | {x["latestOfficial"]} | {x["r3Blind"]} ({x["r3BlindMean"]}) | {x["latestBlind"]} ({x["latestBlindMean"]}) | {x["pairBetter"]} | {x["verdict"].split(" — ")[0]} |')
w('')
for cid in REG: x = reg[cid]; w(f'- **{cid}:** {x["verdict"]}. Pairwise reason: {x["reason"]}')
vc = collections.Counter(reg[c]['verdict'].split(' — ')[0] for c in REG)
w(f'\n**Conclusion:**')
w(f'- **{vc["GENUINE_REGRESSION"]} genuine regressions:** the latest transcript is worse than r3, and r3 meets.')
w(f'- **{vc["JUDGE_VARIATION"]} cases are judge variation:** the latest transcript meets on independent review.')
w(f'- **{vc["BOTH_BELOW_THRESHOLD"]} cases fall below the threshold in both versions:** the official r3 MEETS was itself borderline.')
w(f'- **{vc["MIXED_EVIDENCE"]} mixed.**')
w('- **The genuine regressions share two patterns:**')
w('  - Mishandling a correct learner answer: CA1-T04 rejects "he is twelve" and hands back a frame containing the answer.')
w('  - Over-specific hints or invented context: TA2-T13, AA2-T04, AA2-T11.')
w('- **These are tutor-output variation at temperature, not caused by the Option B change:** the engine moves were identical in the r3 stability study, and the age band only changes register and length.\n')
open(f'{REV}/targeted_issue_audit.md', 'w').write('\n'.join(md))

# ================= phase1_ai_review_decision.md =================
md = []; w = md.append
w('# Phase 1 AI-review decision\n')
w('## Final status\n\n**`AI_REVIEW_FINDS_MATERIAL_SCORING_DISAGREEMENT`**\n')
w(f'The independent review does not reproduce the official 90/120:')
w(f'- **Independent result:** {indMeets}/120 ({pct(indMeets)}) under the frozen rule.')
w(f'- **After adjudication:** {lo}–{hi}/120.')
w('- **No critical quality issues were found**, so `AI_REVIEW_FINDS_CRITICAL_QUALITY_ISSUES` does not apply.')
w('- **The review is complete:** 120/120 cases and all audits, so `INCOMPLETE_REVIEW` does not apply.\n')
w('## Answers to the 12 questions\n')
w('1. **Does the independent AI review broadly support the official 90/120?**')
w(f'   **Partly.** It agrees on the quality profile: dimension means within ±0.18 and no critical failures. It does not support the count: {indMeets} vs 90, with 25 official MEETS scored PARTIAL. {len(boundary)} of the 90 official MEETS sit exactly on the 3.00 threshold.')
w(f'2. **Independent MEETS percentage:** **{pct(indMeets)}** ({indMeets}/120). Holistic verdicts give {pct(OV["holisticDist"].get("MEETS",0))}; after adjudication, {pct(lo)}–{pct(hi)}.')
w(f'3. **Is the 70% target (84/120) met under independent scoring?** **No.** It is missed by {84-indMeets} cases, and by {84-hi}–{84-lo} cases after adjudication.')
w('4. **Is Option B provenance correctly implemented in this run?** **Yes.** Runtime metadata on all 219 turns shows the expected band, source and known status: child/class_age_band 73, teen/class_age_band 73, adult/school_setting_adult_learners 73.')
w(f'5. **Are the child, teen and adult results acceptable?**')
w(f'   Independent MEETS: child {cmp_["byCohort"]["child"]["independentMeets"]}/40, teen {cmp_["byCohort"]["teen"]["independentMeets"]}/40, adult {cmp_["byCohort"]["adult"]["independentMeets"]}/40. **None reaches 70% independently.** Age fit is good in all three (3.02–3.12). The teen gap is scaffolding (over-helping), not register.')
w('6. **Are factual issues material?** **No, not in aggregate.** About 6 genuinely wrong or misleading rule statements across 219 turns, none critical. They should be fixed because they sit on the exact grammar point being taught, e.g. "go" given as a -ch verb, or the negative grouped under "+ -s".')
w('7. **Are ignored learner replies a significant problem?**')
w('   **Not as a general problem:** 9 of the 11 official flags are not supported.')
w('   **Yes as a narrow one:** in 2 T08 cases (major) and in several cases the blind reviewer flagged as major, the tutor fails to accept a correct answer that matches a lesson item rather than its own prompt, then repeats the task.')
w('8. **Is verbosity harming the interaction?** **No.** 18/22 flags are mild excess and 4 acceptable length; none reduces participation. This is low priority.')
w(f'9. **Is lesson alignment reliable?** **Mostly.** Independent mean {DM["lesson_alignment"]["independentMean"]:.2f} against the official {DM["lesson_alignment"]["officialMean"]:.2f}. The deductions come from small drifts and imprecise rule statements, not off-topic teaching. Only 4 lesson_drift tags were raised independently.')
w(f'10. **Are formative checks meaningful?** **Weakly.** Independent mean {DM["formative_check_evidence"]["independentMean"]:.2f}. Checks exist in almost every reply, but often as copy-with-one-blank prompts or checks that do not test the full objective. The rubric does not define a minimum, which the reviewer flagged as an ambiguity.')
w('11. **Can Phase 1 be considered technically complete?**')
w('    **Technically, yes:**')
w('    - Option B is implemented and verified.')
w('    - Deterministic checks pass, apart from the 3 known mastery-regex false positives.')
w('    - No privacy leaks, no critical failures.')
w('    **On quality, no:** the 70% pedagogical-quality target is not independently confirmed. Phase 1 should not be declared complete on quality until the scoring disagreement is resolved by qualified human review of the 35 disputed cases, or a remediation re-run clears the target under both evaluators.')
w('12. **What must be fixed before the next evaluation?**')
w('    1. **Success handling:** accept a correct learner answer that matches a lesson item even when it differs from the tutor\'s own prompt, then advance (T04/T08 pattern; CA1-T04, TA1-T04, CA2-T08, TA2-T08, CB1-T08).')
w('    2. **Hint strength:** hints must not contain the target form or a frame that already holds the answer (TA2-T13, AB1-T13, CA1-T04, teen TA2 cases).')
w('    3. **Rule precision:** state grammar rules exactly. The examples must match the rule, and negatives and auxiliaries must be correct. Never misquote the learner.')
w('    4. **No invented context:** do not present unsupplied learner details (AA2-T11, CB1-T08, TB1-T13).')
w('    5. **Evaluation reliability:**')
w('       - Human educator adjudication of the 35 disputed cases.')
w('       - Rubric v2 anchors for hint strength and minimum formative checks.')
w('       - Report the count of cases at mean exactly 3.00 alongside the headline.')
w('       - Use two evaluators with a disagreement queue as standard practice.')
w('    6. *(Low priority)* Trim repeated rule restatements in adult replies.\n')
w('## Critical risks\n')
w('- **Headline fragility.** The official 75% depends on 62 boundary cases; a stricter but reasonable evaluator gets 62.5%.')
w('- **Over-helping** is the most frequent independent finding (33 tags) and undermines learner autonomy.')
w('- **AI-only evaluation.** All evaluators are from one provider; no human educator has validated any score.\n')
w('## Decision principles observed\n')
w('- The 70% threshold is an engineering benchmark target, not evidence of educational efficacy.')
w('- No claim is made that students learn more.')
w('- No claim is made about release readiness.')
w('- Regressions are reported per case, not hidden behind the aggregate.\n')
open(f'{REV}/phase1_ai_review_decision.md', 'w').write('\n'.join(md))

# ================= manifest =================
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
inputs = json.load(open('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/review/inputs.json'))
for f in ['blind_review.ts', 'blind_review_v2_as_run.ts', 'audit_calls.ts', 'compare.py', 'build_audits.py', 'write_reports.py']:
    os.makedirs(f'{W}/scripts', exist_ok=True); open(f'{W}/scripts/{f}', 'w').write(open(f'/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/review/{f}').read())
rs = json.load(open(f'{W}/review_status.json'))
man = {
    'reviewId': '20261109T1310-ltb-v1.0-ai-review', 'generatedAt': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'runUnderReview': {'runId': '20261109T1211-ltb-v1.0-ageband', 'label': 'r3 + Trusted Age Band (Option B)', 'officialResult': '90/120 MEETS (75.0%)', 'benchmarkVersion': 'ltb-v1.0'},
    'integrity': {'cases': 120, 'uniqueCases': 120, 'turns': 219, 'caseSetSha256': '725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb', 'caseSetShaMatches': True,
                  'runManifestArtifactsVerified': '50/50', 'emptyReplies': 0,
                  'ageBandProvenanceRuntime': {'child/class_age_band/known': 73, 'teen/class_age_band/known': 73, 'adult/school_setting_adult_learners/known': 73}, 'allChecksPassed': True},
    'rubricSha256': '963962bba8b427ea7e15afd5d2b7bc2ad90945fc16fcff6633813941546f0e5b', 'scoringSpecSha256': '8fbf752bffd4fe9c1f51831b313e06f020e3d47dc57b62e446fd65dc38f82c05',
    'inputs': inputs['inputs'], 'benchmarkCodeSha256': inputs['benchmarkCode'],
    'originalModels': {'tutor': 'claude-opus-5-5 (effort low)', 'judge': 'claude-sonnet-5-5 (effort medium)'},
    'reviewer': {'model': 'claude-haiku-5-5', 'effort': 'high', 'maxTokens': 8000, 'provider': 'anthropic (same provider as tutor and judge)', 'independence': 'DIFFERENT CLAUDE MODEL, SAME PROVIDER — PARTIALLY INDEPENDENT, NOT CROSS-PROVIDER',
                 'selectionReason': 'Only Anthropic models are configured in backend/src/services/priceCatalog.ts; no other provider is configured and no credentials were created. Opus 5.5 excluded (generated the transcripts).',
                 'blindSystemPromptSha256': rs['systemPromptSha256'], 'usedAlsoFor': ['targeted audits', 'adjudication', 'blind review of r3 transcripts for 9 regressions']},
    'methodology': ['Blind isolated per-case review (no judge scores/tags/outcomes/regression status, no engine moves, no learner grade).', 'Frozen ltb-scoring-v1 rule applied to independent scores with official deterministic-check results.',
                    'Evidence quotes verified against transcripts.', 'Payload privacy scan before every call.', 'Reviews sealed and hashed before judge outputs were read.',
                    'Targeted audits and anonymised randomised A/B adjudication after the seal; scores never averaged.'],
    'blindSealSha256': open(f'{W}/blind_reviews_sha256_at_seal.txt').read().split()[0],
    'spend': {'capUsd': 5.0, 'actualUsd': TOTAL, 'byStage': spend, 'calls': sum(v['calls'] for v in spend.values()),
              'inputTokens': sum(v['inputTokens'] for v in spend.values()), 'outputTokens': sum(v['outputTokens'] for v in spend.values()), 'pricing': 'backend/src/services/priceCatalog.ts (haiku-5-5: $0.1/$0.5 per M tokens)',
              'note': 'Aborted v1 run (10 calls) used a prompt missing restrictions 1-9 of the brief; its outputs are archived in work/aborted_v1/ and not used.'},
    'coverage': {'reviewed': sum(1 for j in rev.values() if j['review_status'] == 'REVIEWED'), 'notReviewable': sum(1 for j in rev.values() if j['review_status'] != 'REVIEWED')},
    'results': {'independentDerived': OV['independentDist'], 'independentHolistic': OV['holisticDist'], 'official': OV['officialDist'], 'agreementPct': OV['agreementPct'], 'kappa': OV['kappa'],
                'adjudication': dict(dc), 'adjudicatedMeetsRange': [lo, hi], 'finalStatus': 'AI_REVIEW_FINDS_MATERIAL_SCORING_DISAGREEMENT'},
    'constraints': {'applicationCodeChanged': False, 'benchmarkRerun': False, 'newTutorConversations': False, 'stagingOrProductionAccess': False, 'deployment': False, 'gitCommitOrPush': False,
                    'budgetOrSpendControlChanges': False, 'AI_TEST_SPEND_ID_changed': False, 'originalArtifactsModified': False},
    'deliverables': {}, 'workFiles': {},
}
for f in ['independent_case_reviews.jsonl', 'independent_ai_review_report.md', 'original_vs_independent_comparison.md', 'targeted_issue_audit.md', 'phase1_ai_review_decision.md']:
    man['deliverables'][f] = {'sha256': sha(f'{REV}/{f}'), 'bytes': os.path.getsize(f'{REV}/{f}')}
for root, _, fs in os.walk(W):
    for f in fs:
        p = os.path.join(root, f); man['workFiles'][os.path.relpath(p, REV)] = sha(p)
man['deliverables']['ai_review_manifest.json'] = 'this file (self-hash not embeddable; see ai_review_manifest.sha256)'
json.dump(man, open(f'{REV}/ai_review_manifest.json', 'w'), indent=1, ensure_ascii=False)
open(f'{REV}/ai_review_manifest.sha256', 'w').write(sha(f'{REV}/ai_review_manifest.json') + '  ai_review_manifest.json\n')
print('TOTAL', TOTAL, 'ind', indMeets, 'adj', lo, hi, dict(dc), collections.Counter(reg[c]['verdict'].split(' — ')[0] for c in REG))
