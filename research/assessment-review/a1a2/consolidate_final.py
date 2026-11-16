#!/usr/bin/env python3
"""Consolidate the final A1-A2 review round (final_R1/R2/R3.json).

Stopping rule (user): this round is the last. Only factual key errors
(category key_error: wrong key / wrong key field; missing_answer: a correct
answer missing from acceptedAnswers) are fixed. Every other group is recorded
as a known issue, whatever its reviewer count.

Run: python3 research/assessment-review/a1a2/consolidate_final.py
Writes CONSOLIDATED_FINAL.json and OUTCOME_STATUS.json. Fails if a flag is unassigned.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
O = "EN-F-"
R = lambda *ix: [("R1", i) for i in ix]
R2 = lambda *ix: [("R2", i) for i in ix]
R3 = lambda *ix: [("R3", i) for i in ix]

# (id, category, outcomes, items/scope, issue, members, severity, fixed)
GROUPS = [
    ("F01", "key_error", ["A1-VO-family"], "C-4", "targetForm 'niece' but key/acceptedAnswers 'aunt'", R(0) + R3(0), "high", True),
    ("F02", "missing_answer", ["A1-GR-prepositions-time"], "A-6, B-6, C-6", "'at 6 o'clock' (digit + o'clock) and parallel variants not accepted", R(10), "high", True),
    ("K01", "other", ["A1-VO-family", "A1-VO-classroom-objects", "A1-VO-days-months", "A1-VO-numbers-time", "A1-VO-home-rooms"], "slot 6 all forms; home-rooms A-5/A-6/B-5/C-6", "slot-6 tags lexical_l1_polysemy / lexical_l1_calque / lexical_room_label not in PART 2 enum nor outcome l1ErrorTypes", R(3, 7) + R2(33) + R3(5), "high", False),
    ("K02", "other", ["A1-VO-family"], "A-4/A-6, C-1/C-5, C-4/C-6", "in-form cueing and repeated keys within forms A and C", R(1, 2), "high", False),
    ("K03", "other", ["A1-VO-family"], "C-1 = A-1", "C-1 verbatim copy of A-1 (not parallel)", R2(34) + R3(1), "high", False),
    ("K04", "other", ["A1-VO-home-rooms"], "A-1/A-9, A-2/A-5, B-2/B-6/B-9, C-1/C-5, C-2/C-6, B-3~A-4, B-7=A-7, C-7=B-8", "repeated keys within forms and repeated/identical stems across forms", R(4) + R2(35, 36), "high", False),
    ("K05", "other", ["A1-VO-home-rooms"], "B-6, C-5", "'path room' (b->p) implausible Arabic-L1 slip, real word 'path', reused in two forms", R(5, 6) + R3(3), "high", False),
    ("K06", "other", ["A1-VO-home-rooms"], "slots 5-6 all forms", "slot 5-6 error types not parallel across forms; form A has no spelling_consonant item", R3(2), "medium", False),
    ("K07", "other", ["A1-VO-days-months"], "A-6, B-6, C-6", "slot 6 tests time-expression meaning, not spelling of days/months; stray matchingNote on B-6/C-6", R(8) + R3(4), "high", False),
    ("K08", "other", ["A1-VO-classroom-objects"], "B-6", "watch/clock is not a classroom object; 'on my arm' unnatural; not parallel to A-6/C-6", R(9) + R3(6), "high", False),
    ("K09", "other", ["A2-FN-polite-requests"], "all 27 items (A-5, B-5, B-3, C-3, C-4, B-9, C-7, C-8, B-8, A-9, B-1)", "outcome now A1 but vocabLevel A2 and above-A1 words (receipt, kiosk, plasters, charger, milkshake, ...)", R(11) + R2(*range(0, 11)) + R3(7), "high", False),
    ("K10", "other", ["A2-FN-polite-requests"], "A-4, B-4, C-4", "'Two tickets give.'-type OV distractors are not Arabic-L1 plausible", R(12) + R3(8), "high", False),
    ("K11", "other", ["A2-FN-polite-requests"], "slots 5-6", "tags direct_imperative / want_for_request not in enum; outcome l1ErrorTypes []", R(13) + R2(11) + R3(9), "high", False),
    ("K12", "other", ["A2-GR-present-continuous"], "all 27 items (B-1, C-1, A-4, C-4, B-3, C-6, C-8, C-9)", "outcome now A1 but vocabLevel A1-A2 and above-A1 words (knock, bridge, workers, climb, sales report, probably)", R(14) + R2(12, 13, 14, 15, 16, 17) + R3(10), "high", False),
    ("K13", "other", ["A2-GR-present-continuous"], "slots 5-6", "tags be_omission_progressive / simple_for_progressive not in enum (outcome lists copula_omission, tense_aspect)", R(15) + R2(21) + R3(11), "high", False),
    ("K14", "other", ["A2-GR-present-continuous"], "A-8, A-9, B-9, C-9", "rubric criterion differs across parallel items (am/is/are vs am)", R(16), "medium", False),
    ("K15", "other", ["A2-GR-present-continuous"], "A-6, B-6, C-6", "planted sentence has two errors (no be+-ing and no 3rd-person -s)", R2(18, 19, 20), "high", False),
    ("K16", "other", ["A2-GR-third-person-s"], "all 27 items (B-4, B-6, A-6, C-6, B-2, C-9, C-1, C-2)", "outcome now A1 but vocabLevel A1-A2 and above-A1 words (strangers, mix, paint, fix, bake, weather report)", R(17) + R2(*range(22, 30)) + R3(12), "high", False),
    ("K17", "other", ["A2-GR-third-person-s"], "slots 5-6", "tags third_person_s_omission / es_spelling not in enum (outcome lists agreement_3s)", R(18) + R2(30) + R3(13), "high", False),
    ("K18", "other", ["A2-GR-imperatives"], "outcomes.json", "l1ErrorTypes copula_omission does not fit imperatives", R(19) + R2(31), "high", False),
    ("K19", "other", ["A2-GR-was-were"], "outcomes.json", "agreement_3s (present 3rd-person -s) used for was/were number agreement", R2(32) + R3(14), "high", False),
    ("K20", "other", ["A1-VO-food-drink"], "outcomes.json / matching note", "stale matching note ('l1ErrorTypes cleared'); slot-5 sound slips untagged", R3(15), "low", False),
]


def main():
    revs = {r: json.load(open(os.path.join(HERE, f"final_{r}.json"))) for r in ("R1", "R2", "R3")}
    seen, out = set(), []
    for gid, cat, outs, items, issue, members, sev, fixed in GROUPS:
        flags = []
        for r, i in members:
            assert (r, i) not in seen, (r, i)
            seen.add((r, i))
            f = revs[r]["flags"][i]
            flags.append({"reviewer": r, "index": i, "target": f["target"], "check": f["check"], "problem": f["problem"], "fix": f["fix"]})
        reviewers = sorted({r for r, _ in members})
        assert fixed == (cat != "other"), gid
        out.append({"group": gid, "category": cat, "outcomes": [O + o for o in outs], "items": items, "issue": issue,
                    "reviewers": reviewers, "count": len(reviewers), "severity": sev,
                    "status": "fixed" if fixed else "known_issue", "flags": flags})
    missing = [(r, i) for r in revs for i in range(len(revs[r]["flags"])) if (r, i) not in seen]
    assert not missing, f"unassigned flags: {missing}"
    res = {
        "source": ["final_R1.json", "final_R2.json", "final_R3.json"],
        "rule": "final round: fix only key_error / missing_answer; all other groups recorded as known issues",
        "totals": {"flagsPerReviewer": {r: len(v["flags"]) for r, v in revs.items()},
                   "flags": sum(len(v["flags"]) for v in revs.values()), "groups": len(out),
                   "flaggedBy2plus": sum(g["count"] >= 2 for g in out),
                   "fixed": sum(g["status"] == "fixed" for g in out),
                   "knownIssues": sum(g["status"] == "known_issue" for g in out),
                   "knownIssues2plus": sum(g["status"] == "known_issue" and g["count"] >= 2 for g in out)},
        "groups": out,
    }
    with open(os.path.join(HERE, "CONSOLIDATED_FINAL.json"), "w") as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False); fh.write("\n")

    # outcome status: every A1-A2 EN-F outcome with assessment forms, plus outcomes flagged at outcome level
    oids = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "data", "assessments", "outcomes"))
                  if f.startswith(("EN-F-A1-", "EN-F-A2-")) and f.endswith(".json"))
    for g in out:
        for o in g["outcomes"]:
            if o not in oids:
                oids.append(o)
    status = {}
    for o in sorted(oids):
        blocking = [f"{g['group']} ({g['count']} reviewers): {g['issue']}" for g in out if o in g["outcomes"] and g["status"] == "known_issue" and g["count"] >= 2]
        minor = [f"{g['group']} ({g['count']} reviewer, known issue): {g['issue']}" for g in out if o in g["outcomes"] and g["status"] == "known_issue" and g["count"] < 2]
        fixes = [f"{g['group']} fixed: {g['issue']}" for g in out if o in g["outcomes"] and g["status"] == "fixed"]
        has_forms = os.path.exists(os.path.join(ROOT, "data", "assessments", "outcomes", o + ".json"))
        reasons = blocking + minor + fixes + ([] if has_forms else ["no assessment forms; outcome-level metadata flag only"])
        if not reasons:
            reasons = ["no flags in final round"]
        status[o] = {"status": "not_passed_draft" if blocking else "passed_review_draft", "reasons": reasons}
    with open(os.path.join(HERE, "OUTCOME_STATUS.json"), "w") as fh:
        json.dump(status, fh, indent=1, ensure_ascii=False); fh.write("\n")
    print(json.dumps(res["totals"]))
    print("not passed:", [o for o, v in status.items() if v["status"] == "not_passed_draft"])
    print("passed:", len([o for o, v in status.items() if v["status"] == "passed_review_draft"]))


if __name__ == "__main__":
    main()
