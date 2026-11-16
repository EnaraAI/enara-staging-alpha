#!/usr/bin/env python3
"""Consolidate the three A1-A2 re-reviews (rereview2_R1/R2/R3.json), review round 3.

Flags are assigned by hand (GROUPS) to groups: one target set + one problem.
revise = True when >= 2 distinct reviewers flagged the same target + issue.
Single-reviewer groups are revised only for clear factual key errors (wrong or
ambiguous key, prompt lets the learner avoid the target form); marked factual.

Run: python3 research/assessment-review/a1a2/consolidate3.py
Writes CONSOLIDATED3.json next to this file. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
O = "EN-F-"
def slot(o, n, forms="ABC"):
    return [f"{O}{o}-{k}-{n}" for k in forms]
GAP_UNUSED = ["A2-GR-was-were", "A1-GR-plural-nouns", "A1-GR-prepositions-place", "A1-GR-possessive-s",
       "A1-GR-subject-object-pronouns", "A2-GR-superlatives", "A2-GR-imperatives", "A2-VO-transport-travel"]

# (id, targets, issue, members [(reviewer, index)], decision for single groups, factual?)
GROUPS = [
    ("T01", [O + "A1-VO-classroom-objects"] + slot("A1-VO-classroom-objects", 5) + slot("A1-VO-classroom-objects", 6),
     "slots 5-6 wrong-object swaps (cut with ruler, tell time with calendar, stick with scissors ...) are invented, not Arabic-L1 A1 errors",
     [("R1", 1), ("R1", 2), ("R1", 3), ("R2", 0), ("R2", 1), ("R2", 2), ("R2", 3), ("R2", 4), ("R2", 5), ("R3", 0)], None, False),
    ("T02", slot("A1-VO-food-drink", 6, "C"), "'drinks her ice cream' not a real transfer; not parallel to A/B soup/yoghurt", [("R1", 0), ("R2", 6)], None, False),
    ("T03", slot("A2-VO-jobs-workplaces", 6), "slot 6 job/workplace mismatches are factual absurdities with two fix directions", [("R1", 4), ("R2", 7)], None, False),
    ("T04", ["placement:PL-A2-RD-03"], "detail item mapped to EN-L-A2-RD-main-idea", [("R1", 10), ("R2", 13), ("R3", 11)], None, False),
    ("T05", [O + "A1-GR-possessive-s"], "l1ErrorTypes empty", [("R1", 8), ("R2", 11)], None, False),
    ("T06", [O + "A1-GR-prepositions-place"], "l1ErrorTypes empty", [("R1", 9), ("R2", 10)], None, False),
    # single-reviewer
    ("T07", ["placement:PL-A2-RD-03"], "short answers 'at the cafe'/'at the café' not accepted", [("R1", 11)], "revise (added 'at the cafe'/'at the café'; bare forms already accepted)", True),
    ("T08", [O + "A1-VO-days-months-B-8", O + "A1-VO-days-months-C-8"], "hot/cold-month lists score climate, not month vocabulary", [("R1", 5), ("R1", 6)], "revise", True),
    ("T09", [O + "A2-GR-imperatives"], "cefr A2 vs EGP reference A1", [("R1", 7)], "user decision (CEFR level not changed in this pass)", False),
    ("T10", [O + "A2-GR-was-were"], "l1ErrorTypes agreement_3s does not fit be-agreement", [("R2", 12)], "user decision (was-were outcome flags held with its level question; not changed)", False),
    ("T11", slot("A2-VO-weather", 5), "slot 5 tests copula omission (grammar), not weather vocabulary", [("R2", 8)], "revise", True),
    ("T12", slot("A2-VO-clothes-shopping", 4, "B"), "B-4 is/are agreement is grammar, not shop vocabulary", [("R2", 9)], "revise", True),
    ("T13", [O + "A1-VO-common-adjectives"], "statement 'give the opposite' does not cover slots 5, 7-8", [("R3", 1)], "noted (statement wording is an outcome-definition decision; keys correct)", False),
    ("T14", [O + "A1-VO-days-months-B-9", O + "A1-VO-days-months-C-9"], "B-9/C-9 answer repeated/cued elsewhere in the form", [("R3", 2), ("R3", 3)], "revise", True),
    ("T15", slot("A1-VO-family", 7) + slot("A1-VO-family", 8), "named-word prompts scored with open-field rubric (C-7 differs)", [("R3", 4)], "revise", True),
    ("T16", slot("A1-VO-home-rooms", 2, "C"), "C-2 has several correct rooms", [("R3", 5)], "revise", True),
    ("T17", slot("A1-VO-numbers-time", 7), "criterion gives <2 for 'at seven'/'seven thirty'", [("R3", 6)], "noted (rubric criterion change; keys correct)", False),
    ("T18", slot("A1-GR-capitals-full-stops", 6), "'Fix the mistake' admits the 'and' join as a second correct answer", [("R3", 7)], "revise", True),
    ("T19", slot("A2-VO-make-do", 9), "open-field rubric does not say what earns 1 for make/do", [("R3", 8)], "noted (rubric design change; keys correct)", False),
    ("T20", slot("A2-VO-clothes-shopping", 7), "colour asked for but not scored", [("R3", 9)], "noted (repeat of round-2 H24; scoring scope)", False),
    ("T21", [O + "A2-GR-much-many"], "matching note contradicts itself about item 6", [("R3", 10)], "revise", True),
]

NOTES = [
    "R1-1/2/3, R2-0..5 and R3-0 all say the classroom-objects slot 5-6 object swaps are invented errors; merged as T01 (outcome-level).",
    "R1-10, R2-13 and R3-11 (PL-A2-RD-03 mapping) merged as T04; R1-11 (accepted short answers) kept separate as T07.",
    "R1-5 and R1-6 (B-8/C-8 climate lists) are one reviewer, one problem: T08. R3-2 and R3-3 (B-9/C-9 cueing) likewise: T14.",
]


def main():
    revs = {r: json.load(open(os.path.join(HERE, f"rereview2_{r}.json"))) for r in ("R1", "R2", "R3")}
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
        "source": ["rereview2_R1.json", "rereview2_R2.json", "rereview2_R3.json"],
        "rule": "revise=true when >=2 distinct reviewers flagged the same target+issue; single-reviewer clear factual key errors also revised (singleReviewerFactual)",
        "totals": {"flagsPerReviewer": {r: len(v["flags"]) for r, v in revs.items()},
                   "flags": sum(len(v["flags"]) for v in revs.values()), "groups": len(out),
                   "revise": sum(g["revise"] for g in out),
                   "singleReviewerFactual": sum(g["singleReviewerFactual"] for g in out),
                   "noted": sum(not g["revise"] and not g["singleReviewerFactual"] for g in out)},
        "mergeDecisions": NOTES,
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED3.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(json.dumps(res["totals"]))


if __name__ == "__main__":
    main()
