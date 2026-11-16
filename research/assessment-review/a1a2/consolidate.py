#!/usr/bin/env python3
"""Consolidate the three independent A1-A2 reviews (review_R1/R2/R3.json).

Each flag is assigned (by hand, see GROUPS) to one or more groups. A group is
one target set (item ids, outcome id, rubric type or placement id; an
outcome-level or slot-level flag covers the items it names) plus one problem.
Wording that describes the same problem is merged; MERGE_NOTES records why.

revise = True when >= 2 distinct reviewers flagged the same target + issue.
A single-reviewer group is revised only when it is a factual key error
(ungrammatical accepted answer, wrong answer accepted, or a correct answer
missing); those are marked "single-reviewer, factual".

Run: python3 research/assessment-review/a1a2/consolidate.py
Writes CONSOLIDATED.json next to this file. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def slot(outcome, n, forms="ABC"):
    return [f"{outcome}-{k}-{n}" for k in forms]

O = "EN-F-"
GAP = ["EN-F-A2-GR-was-were", "EN-F-A1-GR-plural-nouns", "EN-F-A1-GR-prepositions-place",
       "EN-F-A1-GR-possessive-s", "EN-F-A1-GR-subject-object-pronouns", "EN-F-A2-GR-superlatives",
       "EN-F-A2-GR-imperatives", "EN-F-A2-VO-transport-travel"]

# (group id, targets, check(s), issue, members [(reviewer, flag index)], decision, factual-single?)
GROUPS = [
    ("G01", slot(O+"A1-GR-can-ability", 6, "A"), "C3", "ungrammatical accepted answer 'She can cook very well biryani.'",
     [("R1", 0), ("R2", 10), ("R3", 3)], "revise", False),
    ("G02", slot(O+"A2-GR-past-simple-irregular", 6, "B"), "C3", "key rewrites words outside the target; minimal correction not accepted",
     [("R1", 1), ("R2", 28), ("R3", 4)], "revise", False),
    ("G03", slot(O+"A1-GR-word-order-svo", 9), "C3", "text to the addressee keyed in third person / unnatural present; natural answers missing",
     [("R1", 2), ("R2", 12), ("R3", 12)], "revise", False),
    ("G04", slot(O+"A1-VO-numbers-time", 7), "C3", "bare 'to'/'past' keywords accept answers with no time in words",
     [("R1", 3)], "revise", True),
    ("G05", slot(O+"A1-VO-numbers-time", 8), "C3", "number-word keyword lists incomplete and different per form",
     [("R1", 4), ("R3", 13)], "revise", False),
    ("G06", slot(O+"A1-VO-numbers-time", 5, "C"), "C4", "C-5 is not a -teen spelling error",
     [("R1", 5)], "noted", False),
    ("G07", [O+"A1-VO-numbers-time-A-5", O+"A1-VO-numbers-time-B-6"], "C5", "f/v error tagged spelling_vowel",
     [("R1", 6), ("R2", 23), ("R3", 26)], "revise", False),
    ("G08", slot(O+"A1-VO-food-drink", 6, "A"), "C3/C5", "'drinks soup' is acceptable English, so A-6 has no clear error",
     [("R1", 7), ("R2", 21), ("R3", 29)], "revise", False),
    ("G09", slot(O+"A1-VO-food-drink", 4, "A"), "C2/C6", "statement stem ends with a question mark",
     [("R1", 8), ("R2", 22), ("R3", 32)], "revise", False),
    ("G10", slot(O+"A1-VO-classroom-objects", 5) + slot(O+"A1-VO-classroom-objects", 6), "C2",
     "error slots test article omission, not classroom-object vocabulary",
     [("R1", 9), ("R2", 14), ("R3", 17)], "revise", False),
    ("G11", slot(O+"A2-VO-jobs-workplaces", 5) + slot(O+"A2-VO-jobs-workplaces", 6), "C2",
     "error slots test article omission, not job/workplace vocabulary",
     [("R1", 9), ("R2", 15), ("R3", 18)], "revise", False),
    ("G12", slot(O+"A1-VO-food-drink", 5), "C2", "error slot tests plural -s, not food vocabulary",
     [("R1", 9), ("R3", 20)], "revise", False),
    ("G13", slot(O+"A2-VO-jobs-workplaces", 7) + slot(O+"A2-VO-jobs-workplaces", 8), "C2",
     "free items key only the job word given in the prompt; the workplace is never checked",
     [("R1", 10), ("R3", 18)], "revise", False),
    ("G14", slot(O+"A2-GR-much-many", 6), "C2", "slot 6 tests plural -s, not much/many",
     [("R1", 11), ("R2", 16), ("R3", 19)], "revise", False),
    ("G15", slot(O+"A2-VO-appearance", 4, "B"), "C3", "'small'/'little' also correct for a baby",
     [("R1", 12), ("R2", 25), ("R3", 8)], "revise", False),
    ("G16", slot(O+"A2-VO-appearance", 1), "C2/C4", "slot 1 uneven: C-1 gives answer in stem + accepts 'boyish'; B-1 'bald' above A2",
     [("R1", 13), ("R2", 24), ("R3", 28)], "revise", False),
    ("G17", [O+"A1-VO-family-C-4"] + slot(O+"A1-VO-family", 6), "C4", "kinship words above A1 / unequal across forms (sister-in-law, niece, nephew)",
     [("R1", 14), ("R2", 18), ("R3", 24)], "revise", False),
    ("G18", slot(O+"A1-VO-family", 5) + slot(O+"A1-VO-family", 6), "C2", "periphrasis 'the brother of my father' is grammatical; 's-genitive accepted so kin word not required",
     [("R2", 17), ("R3", 23)], "revise", False),
    ("G19", slot(O+"A1-VO-days-months", 2), "C4", "February harder to spell than August/September",
     [("R1", 15)], "noted", False),
    ("G20", slot(O+"A2-FN-polite-requests", 1, "B"), "C4", "B-1 prompt identical to A-1",
     [("R1", 16), ("R2", 8), ("R3", 11)], "revise", False),
    ("G21", slot(O+"A2-FN-polite-requests", 1), "C3", "'May' correct but not accepted",
     [("R1", 17), ("R2", 9), ("R3", 10)], "revise", False),
    ("G22", slot(O+"A2-FN-polite-requests", 6), "C3", "'Could I have ..., please?' correct but not accepted (slot 5 accepts it)",
     [("R3", 10)], "revise", True),
    ("G23", [O+"A1-GR-possessive-adjectives"], "C2", "no item tests my/your",
     [("R1", 18)], "noted", False),
    ("G24", slot(O+"A2-VO-weather", 6, "A"), "C5", "tag copula_omission wrong (copula present)",
     [("R1", 19)], "noted", False),
    ("G25", ["outcomes:A1-A2 form criterion"], "C6", "criterion '8 of 10 correct' vs 9 items with mixed 0/1 and 0/1/2 scoring",
     [("R1", 20), ("R2", 0)], "revise", False),
    ("G26", GAP + ["placement:PL-A1-GR-06", "placement:PL-A1-GR-07", "placement:PL-A2-VO-05"], "C2",
     "8 gap outcomes have no bank; placement items point at them",
     [("R1", 21), ("R2", 4), ("R3", 33)], "revise", False),
    ("G27", ["rubric:exact", O+"A1-GR-capitals-full-stops", O+"A1-VO-days-months"], "C6",
     "normalise rule (case/punctuation ignored) defeats capitals-full-stops and day/month capitals",
     [("R1", 22), ("R2", 1), ("R3", 0)], "revise", False),
    ("G28", ["rubric:free_production (vocabulary)"], "C6", "0/1/2 levels defined for grammar; vocabulary keyword items undefined",
     [("R1", 23), ("R2", 2)], "revise", False),
    ("G29", ["rubric:free_production tf1"], "C6", "tf1 text lacks 'can swimming / did went / is play'",
     [("R2", 3)], "noted", False),
    ("G30", ["placement:PL-A1-VO-07"], "C3", "'15' accepted for 'write in words'",
     [("R1", 24), ("R2", 31), ("R3", 14)], "revise", False),
    ("G31", [O+"A2-FN-polite-requests"], "C1", "EGP: Can I have / I would like is A1, not A2",
     [("R2", 5)], "noted (CEFR level not changed: 1 reviewer)", False),
    ("G32", [O+"A2-GR-third-person-s"], "C1", "EGP: third person -s is A1",
     [("R2", 6)], "noted (CEFR level not changed: 1 reviewer)", False),
    ("G33", [O+"A2-GR-present-continuous"], "C1", "EGP: present continuous is A1",
     [("R2", 7)], "noted (CEFR level not changed: 1 reviewer)", False),
    ("G34", slot(O+"A1-GR-capitals-full-stops", 1) + slot(O+"A1-GR-capitals-full-stops", 2)
     + slot(O+"A1-GR-capitals-full-stops", 3) + slot(O+"A1-GR-capitals-full-stops", 4), "C2/C6",
     "item types swapped (choice typed gap_fill; rewrite typed multiple_choice)",
     [("R2", 11), ("R3", 1)], "revise", False),
    ("G35", slot(O+"A1-GR-word-order-svo", 1) + slot(O+"A1-GR-word-order-svo", 2)
     + slot(O+"A1-GR-word-order-svo", 3) + slot(O+"A1-GR-word-order-svo", 4), "C2/C6",
     "item types swapped (choice typed gap_fill; ordering typed multiple_choice)",
     [("R2", 11), ("R3", 2)], "revise", False),
    ("G36", slot(O+"A2-GR-frequency-adverbs", 1) + slot(O+"A2-GR-frequency-adverbs", 2), "C2",
     "slot-position choice typed gap_fill",
     [("R2", 11)], "noted", False),
    ("G37", slot(O+"A1-GR-article-the", 9), "C4", "'The the' accepted only in A-9 (key format differs)",
     [("R2", 13)], "noted", False),
    ("G38", slot(O+"A1-VO-common-adjectives", 5), "C5", "'a little room/clean/easy' not an Arabic-L1 pattern; B/C grammatical",
     [("R2", 19), ("R3", 22)], "revise", False),
    ("G39", slot(O+"A1-VO-common-adjectives", 9), "C3", "comparatives lighter/cheaper/shorter correct but not accepted",
     [("R2", 20)], "revise", True),
    ("G40", slot(O+"A2-VO-clothes-shopping", 6, "C"), "C3", "accepted 'a big size' keeps the target error",
     [("R2", 26), ("R3", 9)], "revise", False),
    ("G41", slot(O+"A2-VO-clothes-shopping", 4, "B"), "C2", "B-4 tests be agreement, not vocabulary",
     [("R2", 27)], "noted", False),
    ("G42", slot(O+"A2-VO-weather", 6, "A"), "C3", "'it is going to rain' correct but not accepted",
     [("R2", 29)], "revise", True),
    ("G43", ["placement:PL-A1-GR-06"], "C2", "'(It is on top.)' gives the answer away",
     [("R2", 30)], "noted", False),
    ("G44", ["placement:PL-A2-RD-03"], "C3", "'near the station' accepted but does not name the place",
     [("R2", 32)], "revise", True),
    ("G45", ["placement:PL-A1-RD-04", "placement:PL-A2-RD-06"], "C2", "two-option yes/no items (50% guess)",
     [("R2", 33)], "noted", False),
    ("G46", slot(O+"A1-GR-possessive-adjectives", 4), "C3", "distractor 'our' also correct (two right answers)",
     [("R3", 5)], "revise", True),
    ("G47", slot(O+"A2-GR-conjunctions", 1), "C3", "'and' also correct; only 'but' accepted",
     [("R3", 6)], "revise", True),
    ("G48", slot(O+"A1-GR-article-the", 2), "C3", "'a' also correct (referent not unique)",
     [("R3", 7)], "revise", True),
    ("G49", ["placement:PL-A1-GR-01"], "C3", "option 'the' also grammatical (two answers)",
     [("R3", 15)], "revise", True),
    ("G50", ["placement:PL-A2-VO-07"], "C1", "'teacher' is A1 vocabulary in an A2 item",
     [("R3", 16)], "noted (CEFR level not changed: 1 reviewer)", False),
    ("G51", slot(O+"A1-VO-common-adjectives", 7) + slot(O+"A1-VO-common-adjectives", 8), "C2",
     "free items key the given word; opposite not elicited",
     [("R3", 21)], "noted", False),
    ("G52", slot(O+"A1-VO-home-rooms", 5, "C"), "C4", "C-5 b/p spelling vs calques in A/B",
     [("R3", 25)], "noted", False),
    ("G53", slot(O+"A1-VO-numbers-time", 3, "C") + slot(O+"A1-VO-numbers-time", 9, "C"), "C4", "'quarter to' harder than half/quarter past",
     [("R3", 27)], "noted", False),
    ("G54", slot(O+"A2-GR-going-to", 7) + slot(O+"A2-GR-going-to", 8), "C2", "free prompts do not ask for 'going to'",
     [("R3", 30)], "noted", False),
    ("G55", slot(O+"A2-GR-past-questions-did", 7), "C2", "free prompt does not ask for 'did'",
     [("R3", 31)], "noted", False),
    ("G56", slot(O+"A1-VO-food-drink", 6, "BC"), "C5", "'drinks his rice' / 'drinks bread' not realistic L1 errors",
     [("R1", 7)], "noted", False),
]

MERGE_NOTES = [
    "R1-9 is one outcome-level flag naming three outcomes (classroom-objects 5-6, jobs-workplaces 5-6, food-drink 5); it is counted in G10, G11 and G12.",
    "R3-18 names two problems (jobs 5-6 article slots; jobs 7-8 keyed on the given job word); counted in G11 and G13.",
    "R3-10 names two problems (slot-1 'May'; slot-6 'Could I have' missing); counted in G21 and G22 (G22 single-reviewer, factual).",
    "R1-7 names A-6 'drink soup' (merged with R2-21/R3-29 as G08) and B-6/C-6 realism (G56, single, noted).",
    "R2-11 names capitals-full-stops, word-order-svo and frequency-adverbs type swaps; R3-1 and R3-2 match the first two (G34, G35); frequency-adverbs is R2 only (G36, noted).",
    "R2-0 (stated as rubric:all) and R1-20 (outcomes:A1-A2) are the same criterion problem (G25).",
    "R1-22 (rubric:all), R2-1 (rubric:exact), R3-0 (rubric:all) are the same normalise-vs-capitals problem (G27).",
    "R1-23 and R2-2 (rubric:free_production / rubric:free) both ask for a vocabulary variant of the 0/1/2 levels (G28); R2-3 (tf1 text) is a different problem (G29).",
    "R1-21, R2-4, R3-33 (missing banks for 8 gap outcomes, 'outcomes:missing banks' / 'outcomes:coverage' / 'outcomes:A1-A2') merged (G26).",
    "R1-14, R2-18, R3-24 (family C-6 sister-in-law, C-4 niece, slot level) merged (G17). R2-17 and R3-23 (periphrasis not an error) merged (G18); R2-17 is targeted at A-5 but names A-6..C-6.",
    "R1-13, R2-24, R3-28 (appearance slot 1) merged even though R2 targets C-1 only: all three name the C-1 giveaway (G16).",
    "R1-6, R2-23, R3-26 (f/v tagged spelling_vowel) merged (G07).",
    "R2-19, R3-22 (common-adjectives slot 5) merged (G38).",
]


def main():
    reviews = {r: json.load(open(os.path.join(HERE, f"review_{r}.json"))) for r in ("R1", "R2", "R3")}
    seen = set()
    out = []
    for gid, targets, check, issue, members, decision, factual in GROUPS:
        flags = []
        for r, i in members:
            f = reviews[r]["flags"][i]
            seen.add((r, i))
            flags.append({"reviewer": r, "index": i, "target": f["target"], "check": f["check"], "problem": f["problem"], "fix": f["fix"]})
        reviewers = sorted({r for r, _ in members})
        revise = len(reviewers) >= 2
        assert revise == (decision == "revise") or factual, gid
        out.append({
            "group": gid, "targets": targets, "check": check, "issue": issue,
            "reviewers": reviewers, "count": len(reviewers), "revise": revise,
            "singleReviewerFactual": factual,
            "decision": "revise" if revise else ("revise (single-reviewer, factual)" if factual else decision),
            "flags": flags,
        })
    missing = [(r, i) for r in reviews for i in range(len(reviews[r]["flags"])) if (r, i) not in seen]
    assert not missing, f"unassigned flags: {missing}"
    res = {
        "source": ["review_R1.json", "review_R2.json", "review_R3.json"],
        "rule": "revise=true when >=2 distinct reviewers flagged the same target+issue; single-reviewer factual key errors are also revised and marked singleReviewerFactual",
        "totals": {
            "flags": sum(len(v["flags"]) for v in reviews.values()),
            "groups": len(out),
            "revise": sum(g["revise"] for g in out),
            "singleReviewerFactual": sum(g["singleReviewerFactual"] for g in out),
            "noted": sum(not g["revise"] and not g["singleReviewerFactual"] for g in out),
        },
        "mergeDecisions": MERGE_NOTES,
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(json.dumps(res["totals"]))


if __name__ == "__main__":
    main()
