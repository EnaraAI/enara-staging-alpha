#!/usr/bin/env python3
"""Consolidate the three A1-A2 re-reviews (rereview3_R1/R2/R3.json), review round 4.

Flags are assigned by hand (GROUPS) to groups: one target set + one problem.
revise = True when >= 2 distinct reviewers flagged the same target + issue.
Single-reviewer groups are revised only for clear factual key errors (wrong or
ambiguous key, prompt lets the learner avoid the target form); marked factual.

Run: python3 research/assessment-review/a1a2/consolidate4.py
Writes CONSOLIDATED4.json next to this file. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
O = "EN-F-"
def slot(o, n, forms="ABC"):
    return [f"{O}{o}-{k}-{n}" for k in forms]

# (id, targets, issue, members [(reviewer, index)], decision for single groups, factual?)
GROUPS = [
    ("T01", slot("A2-VO-clothes-shopping", 4, "B"), "B-4 has no shop context, so 'waiting room' also fits", [("R1", 0), ("R2", 1), ("R3", 7)], None, False),
    ("T02", slot("A1-VO-classroom-objects", 6, "C"), "C-6 does not accept 'in a notebook' like other slot 5-6 items", [("R1", 3), ("R2", 3), ("R3", 5)], None, False),
    ("T03", [O + "A2-VO-jobs-workplaces"] + slot("A2-VO-jobs-workplaces", 6), "slot 6 tests article 'a' (grammar) in a vocabulary outcome; A-6 nurse/hospital cues A-1", [("R2", 0), ("R3", 8), ("R3", 9)], None, False),
    ("T04", [O + "A1-GR-prepositions-place (outcomes.json)"], "l1ErrorTypes article_def_misuse does not fit preposition transfer", [("R2", 5), ("R3", 0)], None, False),
    ("T05", [O + "A2-VO-weather"] + slot("A2-VO-weather", 5), "slot 5 '-ey' spellings not typical Arabic-L1; 'foggy' above A2", [("R1", 4), ("R3", 10)], None, False),
    # single-reviewer
    ("T06", [O + "A1-VO-classroom-objects (outcomes.json)"] + slot("A1-VO-classroom-objects", 5), "phon_p_b is audio-only but tags typed slot-5 spelling slips", [("R1", 1), ("R1", 2)], "revise (tag -> spelling_vowel, the only typed-spelling enum value; consonant-spelling enum is a user decision)", True),
    ("T07", [O + "A1-GR-capitals-full-stops"] + slot("A1-GR-capitals-full-stops", 6), "item l1ErrorType 'missing_full_stop (run_on)' is not an enum value", [("R1", 5)], "revise (-> run_on_and)", True),
    ("T08", [O + "A1-VO-home-rooms"] + slot("A1-VO-home-rooms", 9, "C"), "C-9 advert shows 'bathrooms' (C-1 key, C-5 correction)", [("R2", 2)], "revise", True),
    ("T09", ["placement:PL-A2-RD-03"], "'a cafe near the station' and article-less 'cafe near station' not accepted", [("R2", 4)], "revise", True),
    ("T10", [O + "A1-VO-days-months"] + slot("A1-VO-days-months", 5) + slot("A1-VO-days-months", 6), "prompt says 'the mistake' but sentence has spelling + capital errors", [("R3", 1)], "revise", True),
    ("T11", [O + "A1-VO-family"] + slot("A1-VO-family", 5) + slot("A1-VO-family", 6), "slot 5-6 kin-word swaps are factual absurdities; MATCHING stale", [("R3", 2)], "revise", True),
    ("T12", slot("A1-VO-food-drink", 6, "B"), "B-6 yoghurt is not a plausible drink-for-eat transfer", [("R3", 3)], "revise", True),
    ("T13", [O + "A1-VO-food-drink (outcomes.json)"], "l1ErrorTypes plural_s and MATCHING stale", [("R3", 4)], "revise", True),
    ("T14", [O + "A2-GR-much-many (outcomes.json)"], "l1ErrorTypes plural_s stale", [("R3", 6)], "revise", True),
    ("T15", [O + "A2-VO-weather (outcomes.json)"], "l1ErrorTypes copula_omission and MATCHING stale", [("R3", 11)], "revise", True),
]

NOTES = [
    "R1-0, R2-1 and R3-7 (clothes B-4) merged as T01; R1-3, R2-3 and R3-5 (classroom C-6) as T02.",
    "R2-0, R3-8 and R3-9 (jobs slot 6 grammar + A-6 cue) merged as T03: one fix (new slot-6 design) resolves both.",
    "R1-4 (foggy level) and R3-10 (-ey not Arabic-L1, foggy above A2) merged as T05; R3-11 (weather tags/MATCHING) kept separate as T15 but fixed in the same edit.",
    "R1-1 and R1-2 (phon_p_b) are one reviewer: T06, single-reviewer.",
]


def main():
    revs = {r: json.load(open(os.path.join(HERE, f"rereview3_{r}.json"))) for r in ("R1", "R2", "R3")}
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
        "source": ["rereview3_R1.json", "rereview3_R2.json", "rereview3_R3.json"],
        "rule": "revise=true when >=2 distinct reviewers flagged the same target+issue; single-reviewer clear factual key errors also revised (singleReviewerFactual)",
        "totals": {"flagsPerReviewer": {r: len(v["flags"]) for r, v in revs.items()},
                   "flags": sum(len(v["flags"]) for v in revs.values()), "groups": len(out),
                   "revise": sum(g["revise"] for g in out),
                   "singleReviewerFactual": sum(g["singleReviewerFactual"] for g in out),
                   "noted": sum(not g["revise"] and not g["singleReviewerFactual"] for g in out)},
        "mergeDecisions": NOTES,
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED4.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(json.dumps(res["totals"]))


if __name__ == "__main__":
    main()
