#!/usr/bin/env python3
"""Consolidate the three A1-A2 re-reviews (rereview4_R1/R2/R3.json), review round 5.

Flags are assigned by hand (GROUPS) to groups: one target set + one problem.
revise = True when >= 2 distinct reviewers flagged the same target + issue.
Single-reviewer groups are revised only for clear factual key errors (wrong or
ambiguous key, prompt lets the learner avoid the target form); marked factual.

Run: python3 research/assessment-review/a1a2/consolidate5.py
Writes CONSOLIDATED5.json next to this file. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
O = "EN-F-"
def slot(o, n, forms="ABC"):
    return [f"{O}{o}-{k}-{n}" for k in forms]

# (id, targets, issue, members [(reviewer, index)], decision for single groups, factual?)
GROUPS = [
    ("G01", slot("A1-VO-family", 6, "C"), "C-6 'nece'/niece is EVP A2 (above A1) and not parallel to A-6/B-6", [("R1", 4), ("R2", 0), ("R3", 3)], None, False),
    ("G02", [O + "A2-VO-weather"] + slot("A2-VO-weather", 6, "B") + slot("A2-VO-weather", 7) + slot("A2-VO-weather", 8, "B"), "in-form cueing: B-6 'windy' shown in B-3/B-7; A-7, B-7, B-8, C-7 name other items' answers", [("R2", 1), ("R3", 0)], None, False),
    # single-reviewer
    ("G03", [O + "A1-VO-classroom-objects (outcomes.json)"], "p/b slips need a consonant-spelling enum value", [("R1", 0)], "noted (enum change = user decision; carried from round 4)", False),
    ("G04", [O + "A2-VO-weather (outcomes.json)"], "slot-6 noun-for-adjective not in l1ErrorTypes", [("R1", 1)], "noted (no enum value; user decision, carried from round 4)", False),
    ("G05", [O + "A1-VO-home-rooms"] + slot("A1-VO-home-rooms", 5, "B") + slot("A1-VO-home-rooms", 6, "B"), "B-5 'cooking room' not a real Arabic calque; B-6 contrived double error; l1ErrorTypes empty", [("R1", 2)], "revise items (B-5 eating room, B-6 path room); l1_calque/spelling_p_b enum = user decision", True),
    ("G06", slot("A1-VO-home-rooms", 9, "C"), "C-9 'Two words' vs one-word key 'lounge'", [("R1", 3)], "revise (prompt 'One or two words')", True),
    ("G07", slot("A2-VO-weather", 9, "A"), "A-9 'warm and hot' accepted", [("R1", 5)], "revise (remove 'hot')", True),
    ("G08", [O + "A1-VO-home-rooms"] + slot("A1-VO-home-rooms", 7) + slot("A1-VO-home-rooms", 8) + slot("A1-VO-home-rooms", 3, "C"), "in-form cueing in slots 7-8 and C-3 options", [("R3", 1)], "revise (no-cueing rule across all forms)", True),
    ("G09", [O + "A1-VO-family"] + slot("A1-VO-family", 8) + slot("A1-VO-family", 7, "C"), "in-form cueing in slot 8 / C-3 options", [("R3", 2)], "revise (no-cueing rule across all forms)", True),
    ("G10", slot("A2-VO-jobs-workplaces", 6, "A"), "A-6 'pharmacist' likely EVP B1", [("R3", 4)], "revise (artest -> artist)", True),
    ("G11", [O + "A1-VO-days-months"], "slot 5-6 corrections repeat slot 1-2 keys (low severity)", [("R3", 5)], "noted (low severity: corrections are not shown to the learner, so no cueing; resampling would re-balance spelling difficulty set in round 4)", False),
]

NOTES = [
    "R1-4, R2-0 and R3-3 (family C-6 niece) merged as G01.",
    "R2-1 (weather B-6 windy cued) and R3-0 (weather slot 7-8 cueing) merged as G02: one fix (no answer word shown elsewhere in its form).",
    "R3-1 (home-rooms) and R3-2 (family) cueing are single-reviewer but the same rule as G02; applied across all three forms.",
]


def main():
    revs = {r: json.load(open(os.path.join(HERE, f"rereview4_{r}.json"))) for r in ("R1", "R2", "R3")}
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
                    "decision": "revise" if revise else (decision + " (single-reviewer)" if factual else decision),
                    "flags": flags})
    missing = [(r, i) for r in revs for i in range(len(revs[r]["flags"])) if (r, i) not in seen]
    assert not missing, f"unassigned flags: {missing}"
    res = {
        "source": ["rereview4_R1.json", "rereview4_R2.json", "rereview4_R3.json"],
        "rule": "revise=true when >=2 distinct reviewers flagged the same target+issue; clear single-reviewer fixes also revised (singleReviewerFactual)",
        "totals": {"flagsPerReviewer": {r: len(v["flags"]) for r, v in revs.items()},
                   "flags": sum(len(v["flags"]) for v in revs.values()), "groups": len(out),
                   "revise": sum(g["revise"] for g in out),
                   "singleReviewerFactual": sum(g["singleReviewerFactual"] for g in out),
                   "noted": sum(not g["revise"] and not g["singleReviewerFactual"] for g in out)},
        "mergeDecisions": NOTES,
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED5.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(json.dumps(res["totals"]))


if __name__ == "__main__":
    main()
