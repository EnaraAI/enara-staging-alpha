#!/usr/bin/env python3
"""Consolidate the three A1-A2 re-reviews (rereview_R1/R2/R3.json), round 2.

Flags are assigned by hand (GROUPS) to groups: one target set + one problem.
revise = True when >= 2 distinct reviewers flagged the same target + issue.
Single-reviewer groups are revised only for clear factual key errors (wrong or
ambiguous key, prompt lets the learner avoid the target form); marked factual.

Run: python3 research/assessment-review/a1a2/consolidate2.py
Writes CONSOLIDATED2.json next to this file. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
O = "EN-F-"
def slot(o, n, forms="ABC"):
    return [f"{O}{o}-{k}-{n}" for k in forms]
GAP = ["A2-GR-was-were", "A1-GR-plural-nouns", "A1-GR-prepositions-place", "A1-GR-possessive-s",
       "A1-GR-subject-object-pronouns", "A2-GR-superlatives", "A2-GR-imperatives", "A2-VO-transport-travel"]

# (id, targets, issue, members [(reviewer, index)], decision for single groups, factual?)
GROUPS = [
    ("H01", ["rubric:mastery-criterion (outcome conditions)"], "conditions still say 'Gap-fill or choice items' while forms have EC/FP/transfer scored 0/1/2", [("R1", 6), ("R2", 7)], None, False),
    ("H02", ["EN-F-A1-VO-days-months"], "item acceptedAnswersNote 'Case-insensitive' contradicts case-sensitive matchingNote / rubric rule 2 exception", [("R2", 0), ("R3", 6)], None, False),
    ("H03", ["placement:PL-A1-GR-06"], "mapped to umbrella course outcome although EN-F-A1-GR-prepositions-place exists", [("R2", 3), ("R3", 30)], None, False),
    ("H04", ["placement:PL-A1-GR-07"], "mapped to umbrella course outcome although EN-F-A1-GR-plural-nouns exists", [("R2", 4), ("R3", 31)], None, False),
    ("H05", ["placement:PL-A2-VO-05"], "mapped to umbrella course outcome although EN-F-A2-VO-transport-travel exists", [("R2", 5), ("R3", 32)], None, False),
    ("H06", [O + g for g in GAP], "8 gap outcomes (no lesson, no form) carry measurable 'yes' and a criterion that cannot be applied",
     [("R2", 6), ("R3", 21), ("R3", 22), ("R3", 23), ("R3", 24), ("R3", 25), ("R3", 26), ("R3", 27), ("R3", 28)], None, False),
    ("H07", slot("A1-GR-capitals-full-stops", 6, "C"), "key models non-standard 'very fun'", [("R1", 0), ("R3", 1)], None, False),
    ("H08", slot("A1-VO-food-drink", 6), "'drinks eggs/rice/bread' not a realistic Arabic-L1 eat/drink transfer", [("R1", 2), ("R3", 9)], None, False),
    ("H09", [O + "A1-VO-classroom-objects"] + slot("A1-VO-classroom-objects", 5) + slot("A1-VO-classroom-objects", 6),
     "l1ErrorTypes/matching say article omission but EC items are object swaps; C-6 'close the board' / B-6 'pens in notebook' not certain errors",
     [("R1", 4), ("R2", 2), ("R3", 7)], None, False),
    ("H10", slot("A1-VO-common-adjectives", 5), "slot 5: C-5 reverses the tawil transfer; keys model comma splice; A-5 near-duplicate of appearance A-6",
     [("R1", 1), ("R3", 4), ("R3", 12)], None, False),
    ("H11", ["rubric:free_production (vocabulary)"] + [f"{O}A1-VO-common-adjectives-{k}-{n}" for k in "ABC" for n in (7, 8)],
     "single-word prompts get the open 'any target-field word' rubric; old acceptedAnswersNote disagrees with rubric", [("R2", 1), ("R3", 35)], None, False),
    # single-reviewer
    ("H12", [O + "A1-VO-numbers-time-A-5", O + "A1-VO-numbers-time-B-6"], "f->v spelling is hypercorrection; Arabic-L1 error is v->f", [("R1", 3)], "noted (error realism, key correct)", False),
    ("H13", [O + "A2-VO-weather-A-6"], "l1ErrorType label 'copula_omission/noun_for_adj' wrong (copula present)", [("R1", 5)], "noted (metadata label, key correct)", False),
    ("H14", slot("A1-GR-article-the", 9), "second gap also takes zero article (generic); only 'the' keyed", [("R3", 0)], "revise", True),
    ("H15", slot("A1-GR-possessive-adjectives", 5), "'his' may refer to another man, so no certain mistake", [("R3", 2)], "revise", True),
    ("H16", slot("A1-GR-possessive-adjectives", 7) + [O + "A1-GR-possessive-adjectives-B-8"], "his/her gender uncheckable; B-8 unnatural", [("R3", 3)], "noted (grader policy, not a key error)", False),
    ("H17", slot("A1-VO-common-adjectives", 6), "items 6 tagged lexical_opposite_negation but no 'not'; 'young' for objects atypical", [("R3", 5)], "noted (error realism/label, key correct)", False),
    ("H18", slot("A1-VO-food-drink", 1, "C"), "'egg' accepted gives ungrammatical sentence", [("R3", 10)], "revise", True),
    ("H19", slot("A1-VO-home-rooms", 2, "C"), "instruction 'one word' but key is two words", [("R3", 11)], "revise", True),
    ("H20", [O + "A2-GR-comparatives"], "l1ErrorTypes do not match items 5-6", [("R3", 13)], "noted (schema enum has no fitting value; key correct)", False),
    ("H21", slot("A2-GR-conjunctions", 5), "'and' sentences are grammatical, so no certain mistake", [("R3", 14)], "revise", True),
    ("H22", slot("A2-GR-going-to", 7) + slot("A2-GR-going-to", 8) + slot("A2-GR-going-to", 9), "prompts let the learner avoid going to", [("R3", 15)], "revise", True),
    ("H23", slot("A2-VO-clothes-shopping", 4, "B"), "B-4 tests agreement, not vocabulary", [("R3", 16)], "noted (parallelism, key correct)", False),
    ("H24", slot("A2-VO-clothes-shopping", 7), "prompt asks for colour but colour not scored", [("R3", 17)], "noted (scoring scope, key correct)", False),
    ("H25", [O + "A2-VO-jobs-workplaces"], "l1ErrorTypes/matching say article omission but no item tests it", [("R3", 18)], "noted (metadata, key correct)", False),
    ("H26", slot("A2-VO-make-do", 9), "chore-chart prompt lets the learner avoid make/do", [("R3", 19)], "revise", True),
    ("H27", slot("A2-VO-weather", 2, "C"), "C-2 breaks slot-2 match (no weather noun, non -y adjective)", [("R3", 20)], "noted (parallelism, key correct)", False),
    ("H28", ["placement:PL-A1-GR-01"], "'some apple' defensible, two options correct", [("R3", 29)], "revise", True),
    ("H29", ["placement:PL-A2-RD-03"], "detail item mapped to main-idea outcome; accented 'café' not accepted", [("R3", 33)], "revise (accepted answers only; mapping noted)", True),
    ("H30", ["rubric:exact"], "choice items list only the letter; option text would be marked wrong", [("R3", 34)], "noted (rubric/grader-level, no grader change in this pass)", False),
    ("H32", slot("A1-VO-family", 5) + slot("A1-VO-family", 6), "EC kin swaps are not the periphrastic pattern the matching note names", [("R3", 8)], "noted (realism/matching-note wording, keys correct)", False),
    ("H31", ["rubric:mastery-criterion"], "exact-scored transfer counted 1 or 2 points ambiguously", [("R3", 36)], "noted (conditions now state per-item scoring; criterion text not changed)", False),
]

NOTES = [
    "R3-21..R3-28 are eight per-outcome flags for the same problem R2-6 states once (gap outcomes measurable 'yes'); merged as H06. R3-25/R3-27 also question the CEFR level of imperatives and was-were (single reviewer, noted, not changed).",
    "R1-4 (classroom B-6), R2-2 (l1ErrorTypes + C-6) and R3-7 (l1ErrorTypes + C-6) are one outcome-level problem (EC slots no longer match the stated error type and two items are not certain errors); merged as H09.",
    "R1-1 (C-5 direction), R3-4 (comma-splice keys) and R3-12 (A-5 duplicate of appearance A-6) all target common-adjectives slot 5; merged as H10 and fixed together.",
    "R2-1 and R3-35 both say named-word VO prompts are scored with the open-field rubric; merged as H11.",
    "R1-6 and R2-7 (condition text) merged as H01; R3-36 (points count) is a different criterion problem (H31).",
]


def main():
    revs = {r: json.load(open(os.path.join(HERE, f"rereview_{r}.json"))) for r in ("R1", "R2", "R3")}
    seen, out = set(), []
    for gid, targets, issue, members, decision, factual in GROUPS:
        flags = []
        for r, i in members:
            f = revs[r]["flags"][i]
            assert (r, i) not in seen, (r, i)
            seen.add((r, i))
            flags.append({"reviewer": r, "index": i, "target": f["target"], "check": f["check"], "problem": f["problem"], "fix": f["fix"]})
        reviewers = sorted({r for r, _ in members})
        revise = len(reviewers) >= 2
        assert revise == (decision is None), gid
        out.append({"group": gid, "targets": targets, "issue": issue, "reviewers": reviewers, "count": len(reviewers),
                    "revise": revise, "singleReviewerFactual": factual,
                    "decision": "revise" if revise else (decision + " (single-reviewer, factual)" if factual else decision),
                    "flags": flags})
    missing = [(r, i) for r in revs for i in range(len(revs[r]["flags"])) if (r, i) not in seen]
    assert not missing, f"unassigned flags: {missing}"
    res = {
        "source": ["rereview_R1.json", "rereview_R2.json", "rereview_R3.json"],
        "rule": "revise=true when >=2 distinct reviewers flagged the same target+issue; single-reviewer clear factual key errors also revised (singleReviewerFactual)",
        "totals": {"flagsPerReviewer": {r: len(v["flags"]) for r, v in revs.items()},
                   "flags": sum(len(v["flags"]) for v in revs.values()), "groups": len(out),
                   "revise": sum(g["revise"] for g in out),
                   "singleReviewerFactual": sum(g["singleReviewerFactual"] for g in out),
                   "noted": sum(not g["revise"] and not g["singleReviewerFactual"] for g in out)},
        "mergeDecisions": NOTES,
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED2.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(json.dumps(res["totals"]))


if __name__ == "__main__":
    main()
