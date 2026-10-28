#!/usr/bin/env python3
"""Run ENARA's grading engine on the normalized benchmark samples and score it.

    # see the plan and cost estimate, no AI calls:
    python scripts/benchmarks/run_grading_eval.py --limit 10 --estimate-only
    # smoke test (10 responses per dataset from the test split):
    python scripts/benchmarks/run_grading_eval.py --limit 10
    # full test split (needs --yes when the estimate exceeds --max-cost):
    python scripts/benchmarks/run_grading_eval.py --limit 0 --yes

Grading goes through backend/src/scripts/gradingEvalAdapter.ts, i.e. the
production evaluateOpen + validateGrading functions on a throwaway in-memory
database. Only grader-visible fields are sent (question, response, reference
answer, rubric); gold and human scores stay in this process. Results go to
data/benchmarks/runs/<run>/ (git-ignored): input.jsonl, results.jsonl,
joined.jsonl, metrics.json, report.md.

Variants (docs/benchmarks/GRADING_IMPROVEMENTS.md):
  --variant baseline   production policy (eval-v2, leak check v1). Default.
  --variant v3         opt-in eval-v3 with --improvements (default: all of
                       brevity,levels,anchors,leak). Anchors are human-scored
                       examples drawn ONLY from the calibration split. They
                       are never evaluated themselves, and their questions are
                       excluded when evaluating on calibration. A v3 run on
                       the held-out test split needs --allow-test.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import budget as budgets  # noqa: E402
from grading_metrics import classification, cluster_bootstrap, criterion_disagreement, feedback_language_ok, group_by, score_rows  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = REPO_ROOT / "data" / "benchmarks" / "grading"
RUNS = REPO_ROOT / "data" / "benchmarks" / "runs"
DATASETS = {"mohler": "nkazi/MohlerASAG", "araes": "Rnghazawi-NLP/AR-AES", "scientsbank": "nkazi/SciEntsBank", "vex": "VEXAnon/VEX_2026", "arasag": "leilaouahrani/AR-ASAG", "laila": "bigirqu/laila", "qaes": "bigirqu/qaes"}
# Fields the grading engine may see. Everything else stays here.
GRADER_FIELDS = ("sample_id", "language", "assessment_type", "question", "student_response", "reference_answer", "rubric")
# Per-call cost for the estimate (USD), measured in the smoke run on
# 2026-10-25 with claude-opus-5-5 (Mohler $0.0128, AR-AES $0.0267 per call).
# Calls per sample: 2 independent evaluations, plus a third on disagreement.
# SciEntsBank and VEX measured in smoke runs on 2026-10-25 (16 and 10 calls):
# $0.0138 and $0.0180 per call.
# AR-ASAG measured in the validation pilot on 2026-10-25 (62 calls): $0.0212 per call.
ASSUMED_COST_PER_CALL = {"nkazi/MohlerASAG": 0.013, "Rnghazawi-NLP/AR-AES": 0.027, "nkazi/SciEntsBank": 0.014, "VEXAnon/VEX_2026": 0.018,
                         "leilaouahrani/AR-ASAG": 0.021,
                         # LAILA measured in the validation pilot on 2026-10-25 (82 calls): $0.054 per call.
                         "bigirqu/laila": 0.054,
                         # QAES: extrapolated from LAILA's measured rate for ~2.9x longer essays (489 vs 171 words); unmeasured.
                         "bigirqu/qaes": 0.068}
ASSUMED_CALLS_PER_SAMPLE = 2.1

# Mohler has no rubric. ENARA's rubric grader needs one, so the harness
# supplies this generic holistic scale (0-5, matching the dataset's scale)
# and labels it rubric source "harness_generic". It is not dataset content.
MOHLER_HARNESS_RUBRIC = {
    "source": "harness_generic",
    "criteria": [{
        "id": "overall",
        "title": "Correctness and completeness compared with the reference answer",
        "max_points": 5,
        "levels": [
            {"id": "s0", "label": "0", "points": 0, "description": "Wrong, irrelevant or no answer"},
            {"id": "s1", "label": "1", "points": 1, "description": "Mostly wrong; a small relevant fragment"},
            {"id": "s2", "label": "2", "points": 2, "description": "Partly right with major errors or omissions"},
            {"id": "s3", "label": "3", "points": 3, "description": "Main idea right but important parts missing or inaccurate"},
            {"id": "s4", "label": "4", "points": 4, "description": "Right with minor gaps or imprecision"},
            {"id": "s5", "label": "5", "points": 5, "description": "Fully correct and complete"},
        ],
    }],
}


# SciEntsBank: the grader picks one level per response and the level IS the
# predicted class. Level points exist only because ENARA rubrics need them;
# classification metrics use the level, never the points. Descriptions follow
# the SemEval-2013 Task 7 label definitions.
SCIENTS_HARNESS_RUBRIC = {
    "source": "harness_categorical",
    "criteria": [{
        "id": "label",
        "title": "Classify the response against the reference answer",
        "max_points": 2,
        "levels": [
            {"id": "correct", "label": "Correct", "points": 2, "description": "A correct and complete paraphrase of the reference answer"},
            {"id": "partially_correct_incomplete", "label": "Partially correct, incomplete", "points": 1, "description": "Contains some of the reference answer's content but is incomplete; nothing contradicts it"},
            {"id": "contradictory", "label": "Contradictory", "points": 0, "description": "States something that contradicts the reference answer"},
            {"id": "irrelevant", "label": "Irrelevant", "points": 0, "description": "Talks about domain content but doesn't answer the question"},
            {"id": "non_domain", "label": "Non-domain", "points": 0, "description": "Not about the subject at all (e.g. 'I don't know', off-topic remarks)"},
        ],
    }],
}
# VEX has no rubric or reference answer: a generic 0-4 scale matching its
# grades {0, 0.25, 0.5, 0.75, 1} x 4. Harness content, labelled as such.
VEX_HARNESS_RUBRIC = {
    "source": "harness_generic",
    "criteria": [{
        "id": "overall",
        "title": "Correctness and completeness of the answer to the question",
        "max_points": 4,
        "levels": [
            {"id": "g0", "label": "0", "points": 0, "description": "Wrong, irrelevant or no answer"},
            {"id": "g1", "label": "1", "points": 1, "description": "Mostly wrong; a small relevant part"},
            {"id": "g2", "label": "2", "points": 2, "description": "About half right"},
            {"id": "g3", "label": "3", "points": 3, "description": "Mostly right with minor errors or gaps"},
            {"id": "g4", "label": "4", "points": 4, "description": "Fully correct"},
        ],
    }],
}
# Mohler harness scale v2 (opt-in "scale2"): the same 0-5 range, with level
# descriptors centred on the core idea instead of on matching the reference,
# to test partial-credit calibration. Harness content, labelled as such.
MOHLER_HARNESS_RUBRIC_V2 = {
    "source": "harness_generic_v2",
    "criteria": [{
        "id": "overall",
        "title": "How well the answer shows the key idea the question asks for",
        "max_points": 5,
        "levels": [
            {"id": "s0", "label": "0", "points": 0, "description": "No relevant correct content, or wrong"},
            {"id": "s1", "label": "1", "points": 1, "description": "A relevant fragment, but the key idea is missing or wrong"},
            {"id": "s2", "label": "2", "points": 2, "description": "Key idea only hinted at, or mixed with a significant error"},
            {"id": "s3", "label": "3", "points": 3, "description": "Key idea partly stated; an essential part the question asks for is missing"},
            {"id": "s4", "label": "4", "points": 4, "description": "Key idea correct; a minor inaccuracy or a detail the question explicitly asks for is missing"},
            {"id": "s5", "label": "5", "points": 5, "description": "Key idea correct, however briefly or differently worded"},
        ],
    }],
}
# AR diagnostic ("no_length_instruction"): removes "explain at length"-type
# wording from the question text. A counterfactual to locate the c1 error,
# not a deployable change: the question text is the teacher's.
LENGTH_PHRASES = ["باستفاضة", "بإستفاضة", "بشكل مفصل", "بالتفصيل", "بشكل موسع"]


def strip_length_instruction(question: str) -> str:
    q = question
    for ph in LENGTH_PHRASES:
        q = q.replace(ph, "")
    return re.sub(r"\s{2,}", " ", q).strip()


# AR-ASAG has no rubric and the same 0-5 scale as Mohler: same generic harness scale.
HARNESS_RUBRICS = {"nkazi/MohlerASAG": "MOHLER", "leilaouahrani/AR-ASAG": "MOHLER", "nkazi/SciEntsBank": "SCIENTS", "VEXAnon/VEX_2026": "VEX"}
SCIENTS_LABELS = ["correct", "contradictory", "partially_correct_incomplete", "irrelevant", "non_domain"]
SCIENTS_3WAY = {"correct": "correct", "contradictory": "contradictory", "partially_correct_incomplete": "incorrect", "irrelevant": "incorrect", "non_domain": "incorrect"}
SCIENTS_2WAY = {k: ("correct" if k == "correct" else "incorrect") for k in SCIENTS_LABELS}

IMPROVEMENTS = ("brevity", "levels", "anchors", "leak", "criterion", "alternatives", "scale2", "no_length_instruction", "relevance", "arabic_semantic")
# Criteria that measure topic relevance only (essays): the "relevance" improvement scopes them (LAILA).
RELEVANCE_CRITERIA = {"essay": ["relevance"]}
# The default --variant v3 set (eval-v3 as validated earlier); "criterion" is opt-in.
DEFAULT_IMPROVEMENTS = ("brevity", "levels", "anchors", "leak")
ANCHORS_PER_TYPE = {"short_answer": 4, "essay": 3}
# At most this many distinct calibration questions supply anchors, so the
# rest of the calibration split stays available for tuning. AR-AES has only
# two calibration questions: anchors come from one, tuning uses the other.
ANCHOR_QUESTIONS = {"short_answer": 4, "essay": 1}


def pick_anchors(samples: list[dict], dataset_id: str, n: int, seed: str, max_questions: int | None = None) -> list[dict]:
    """Human-scored calibration examples spread across the score range, one per question where possible."""
    pool = [s for s in samples if s["dataset_id"] == dataset_id and s["split"] == "calibration" and s["gradable"] and s["student_response"]
            and s.get("score_type", "ordinal") == "ordinal" and s.get("canonical_gold_score") is not None]
    # Never from a question that appears in any test partition (e.g. SciEntsBank's unseen-answers test reuses train questions).
    test_qs = {s["question_id"] for s in samples if s["dataset_id"] == dataset_id and s["split"] == "test"}
    pool = [s for s in pool if s["question_id"] not in test_qs]
    if max_questions:
        qs = sorted({s["question_id"] for s in pool}, key=lambda q: hashlib.sha256(f"{seed}:{q}".encode()).hexdigest())[:max_questions]
        pool = [s for s in pool if s["question_id"] in qs]
    pool.sort(key=lambda s: (s["canonical_gold_score"] / s["maximum_score"], hashlib.sha256(f"{seed}:{s['sample_id']}".encode()).hexdigest()))
    if not pool or n <= 0:
        return []
    chosen, used_q = [], set()
    for k in range(n):
        target = round(k * (len(pool) - 1) / max(1, n - 1))
        # nearest candidate to this quantile from a question not used yet
        for off in range(len(pool)):
            for idx in (target - off, target + off):
                fresh_q = pool[idx]["question_id"] not in used_q or len(used_q) >= len({s["question_id"] for s in pool}) if 0 <= idx < len(pool) else False
                if 0 <= idx < len(pool) and fresh_q and pool[idx] not in chosen:
                    chosen.append(pool[idx])
                    used_q.add(pool[idx]["question_id"])
                    break
            else:
                continue
            break
    return chosen


def build_policy(samples: list[dict], datasets: list[str], improvements: set[str], seed: str) -> tuple[dict, list[dict]]:
    anchors: dict[str, list] = {}
    used: list[dict] = []
    if "anchors" in improvements:
        for ds in datasets:
            atype = next((s["assessment_type"] for s in samples if s["dataset_id"] == ds), None)
            picked = pick_anchors(samples, ds, ANCHORS_PER_TYPE.get(atype, 3), seed, ANCHOR_QUESTIONS.get(atype))
            if not picked:
                continue  # no human-scored calibration data (VEX: silver train only; SciEntsBank: categorical)
            if atype in anchors:
                # Policy anchors are keyed by assessment type; two datasets of one type
                # (Mohler and AR-ASAG) would silently replace each other's anchors.
                raise SystemExit(f"anchors: more than one {atype} dataset in this run; run them separately")
            used += picked
            anchors[atype] = [{"question": a["question"], "response": a["student_response"], "score": a["canonical_gold_score"], "max": a["maximum_score"]} for a in picked]
    policy = {
        "version": "eval-v3",
        "levelGuidance": "levels" in improvements,
        "leakCheck": "v2" if "leak" in improvements else "v1",
        "brevityFor": ["short_answer"] if "brevity" in improvements else [],
        "criterionScopedFor": ["essay"] if "criterion" in improvements else [],
        "alternativesFor": ["short_answer"] if "alternatives" in improvements else [],
        "anchors": anchors,
        "relevanceCriteriaFor": RELEVANCE_CRITERIA if "relevance" in improvements else {},
        # Arabic short answers only; the adapter applies it to short_answer items, the prompt only to Arabic answers.
        "arabicSemanticFor": ["short_answer"] if "arabic_semantic" in improvements else [],
    }
    return policy, used


def grader_input(sample: dict, improvements: set | None = None) -> dict:
    """What the grading engine receives for one sample. Never includes scores."""
    improvements = improvements or set()
    harness = {"MOHLER": MOHLER_HARNESS_RUBRIC_V2 if "scale2" in improvements else MOHLER_HARNESS_RUBRIC, "SCIENTS": SCIENTS_HARNESS_RUBRIC, "VEX": VEX_HARNESS_RUBRIC}
    rubric = sample["rubric"] if sample["rubric"] else harness.get(HARNESS_RUBRICS.get(sample["dataset_id"], ""))
    if rubric is None:
        raise ValueError(f"{sample['sample_id']} has no rubric")
    rubric = {"source": rubric.get("source", "dataset"), "criteria": [
        {k: v for k, v in c.items() if k in ("id", "title", "description", "max_points", "levels")} for c in rubric["criteria"]
    ]}
    out = {k: sample.get(k) for k in GRADER_FIELDS}
    out["rubric"] = rubric
    if "no_length_instruction" in improvements and sample["language"] == "ar" and out["question"]:
        out["question"] = strip_length_instruction(out["question"])
    return out


def load_samples(data: Path) -> list[dict]:
    """normalized/samples.jsonl plus, when present, normalized_additional/samples.jsonl (AR-ASAG)."""
    out: list[dict] = []
    for sub in ("normalized", "normalized_additional"):
        f = data / sub / "samples.jsonl"
        if f.exists():
            out += [json.loads(l) for l in f.read_text(encoding="utf-8").split("\n") if l]
    return out


def select(samples: list[dict], dataset_id: str, split: str, limit: int, seed: str, partition: str | None = None) -> list[dict]:
    """Gradable samples of one dataset, split (and test partition); with a limit, spread round-robin across questions."""
    pool = [s for s in samples if s["dataset_id"] == dataset_id and s["split"] == split and s["gradable"] and (partition is None or s.get("test_partition") == partition)]
    pool.sort(key=lambda s: hashlib.sha256(f"{seed}:{s['sample_id']}".encode()).hexdigest())
    if not limit or limit >= len(pool):
        return pool
    by_q = group_by(pool, lambda s: s["question_id"])
    queues = [by_q[q] for q in sorted(by_q, key=lambda q: hashlib.sha256(f"{seed}:{q}".encode()).hexdigest())]
    out: list[dict] = []
    while len(out) < limit:
        for q in queues:
            if q and len(out) < limit:
                out.append(q.pop(0))
        if not any(queues):
            break
    return out


def estimate(chosen: list[dict]) -> dict:
    by = defaultdict(int)
    for s in chosen:
        by[s["dataset_id"]] += 1
    calls = {d: round(n * ASSUMED_CALLS_PER_SAMPLE) for d, n in by.items()}
    cost = {d: round(calls[d] * ASSUMED_COST_PER_CALL[d], 2) for d in by}
    return {"samples": dict(by), "ai_calls": calls, "cost_usd": cost, "total_cost_usd": round(sum(cost.values()), 2),
            "assumptions": {"calls_per_sample": ASSUMED_CALLS_PER_SAMPLE, "cost_per_call": ASSUMED_COST_PER_CALL}}


def run_adapter(inp: Path, out: Path, concurrency: int, adapter_cmd: str | None, policy: Path | None = None,
                budget_file: Path | None = None, run: str = "") -> None:
    extra = ["--policy", str(policy)] if policy else []
    if budget_file:
        extra += ["--budget", str(budget_file), "--run", run]
    if adapter_cmd:
        cmd = adapter_cmd.split() + ["--in", str(inp), "--out", str(out)] + extra
        cwd = REPO_ROOT
    else:
        cmd = ["npx", "tsx", "src/scripts/gradingEvalAdapter.ts", "--in", str(inp), "--out", str(out), "--concurrency", str(concurrency)] + extra
        cwd = REPO_ROOT / "backend"
    proc = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    # The backend logs every AI call as JSON on stdout; keep them in the run folder, not on screen.
    (out.parent / "adapter.log").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr, encoding="utf-8")
    if proc.returncode != 0:
        raise SystemExit(f"adapter failed ({proc.returncode}); see {out.parent / 'adapter.log'}\n{proc.stderr[-2000:]}")


def discrepancies(joined: list[dict], top: int = 10) -> list[dict]:
    graded = [r for r in joined if r["result"]["status"] == "graded"]
    graded.sort(key=lambda r: -abs(r["result"]["predicted_score"] - r["sample"]["canonical_gold_score"]) / r["sample"]["maximum_score"])
    return [{
        "sample_id": r["sample"]["sample_id"], "question_id": r["sample"]["question_id"],
        "gold": r["sample"]["canonical_gold_score"], "graders": [h.get("final") for h in r["sample"]["human_scores"]],
        "predicted": r["result"]["predicted_score"], "max": r["sample"]["maximum_score"],
        "evaluations": r["result"].get("evaluations"),
        "response_excerpt": (r["sample"]["student_response"] or "")[:220],
        "model_explanation": (r["result"].get("score_explanation") or "")[:300],
    } for r in graded[:top]]


def predicted_label(result: dict) -> str | None:
    crit = result.get("criteria") or []
    return crit[0]["level_id"] if result.get("status") == "graded" and crit else None


def classify_rows(rows: list[dict]) -> dict:
    """SciEntsBank-style categorical evaluation: the chosen rubric level is the predicted class."""
    graded = [r for r in rows if predicted_label(r["result"]) in SCIENTS_LABELS]
    statuses: dict = {}
    reasons: dict = {}
    for r in rows:
        statuses[r["result"]["status"]] = statuses.get(r["result"]["status"], 0) + 1
        if r["result"].get("reason"):
            reasons[r["result"]["reason"]] = reasons.get(r["result"]["reason"], 0) + 1
    out = {"samples": len(rows), "status": statuses, "failure_reasons": reasons,
           "invalid_or_ungraded_rate": round(1 - len(graded) / len(rows), 4) if rows else None}
    for scheme, mapping, labels in (("5way", None, SCIENTS_LABELS), ("3way", SCIENTS_3WAY, ["correct", "contradictory", "incorrect"]), ("2way", SCIENTS_2WAY, ["correct", "incorrect"])):
        m = (lambda x: x) if mapping is None else mapping.get
        pred = [m(predicted_label(r["result"])) for r in graded]
        gold = [m(r["sample"]["gold_label"]) for r in graded]
        c = classification(pred, gold, labels)
        if len(graded) >= 10:
            pairs = list(zip(pred, gold))
            cl = [r["sample"]["question_id"] for r in graded]
            c["ci95_question_bootstrap"] = {
                "accuracy": cluster_bootstrap(pairs, cl, lambda xs: sum(p == g for p, g in xs) / len(xs)),
                "macro_f1": cluster_bootstrap(pairs, cl, lambda xs: classification([p for p, _ in xs], [g for _, g in xs], labels)["macro_f1"]),
            }
        out[f"classification_{scheme}"] = c
    fb = [r for r in graded if (r["result"].get("feedback") or "").strip()]
    out["feedback"] = {"present_rate": round(len(fb) / len(graded), 4) if graded else None,
                       "language_matches_rate": round(sum(feedback_language_ok(r["sample"]["language"], r["result"]["feedback"]) for r in fb) / len(fb), 4) if fb else None}
    evals = [r["result"].get("evaluations") or [] for r in graded]
    out["consistency"] = {"first_two_evaluations_identical_rate": round(sum(1 for e in evals if len(e) >= 2 and e[0] == e[1]) / len(evals), 4) if evals else None,
                          "third_evaluation_rate": round(sum(1 for r in graded if r["result"].get("third_evaluation_used")) / len(graded), 4) if graded else None}
    ms = sorted(r["result"].get("ms") or 0 for r in rows)
    out["latency_ms"] = {"mean": round(sum(ms) / len(ms)) if ms else None, "p95": ms[int(0.95 * (len(ms) - 1))] if ms else None}
    out["cost_usd"] = round(sum(r["result"].get("cost_usd") or 0 for r in rows), 4)
    out["ai_calls"] = sum(r["result"].get("ai_calls") or 0 for r in rows)
    return out


def rows_metrics(rows: list[dict]) -> dict:
    return classify_rows(rows) if rows and rows[0]["sample"].get("score_type") == "categorical" else score_rows(rows)


def trait_metrics(rows: list[dict]) -> dict:
    """Datasets with official per-trait gold (LAILA): the model's criterion points vs each trait, per dataset and trait.
    Traits are never combined into a new score; the dataset's own holistic score is covered by vs_canonical_gold."""
    acc: dict = defaultdict(lambda: {"n": 0, "abs": 0.0, "signed": 0.0, "exact": 0, "within1": 0, "max": None})
    for r in rows:
        gold, res = r["sample"].get("trait_gold"), r["result"]
        if not gold or res["status"] != "graded" or not res.get("criteria"):
            continue
        maxes = {c["id"]: c["max_points"] for c in r["sample"]["rubric"]["criteria"]}
        for c in res["criteria"]:
            g = gold.get(c["criterion_id"])
            if g is None or c.get("points") is None:
                continue
            a = acc[(r["sample"]["dataset_id"], c["criterion_id"])]
            d = c["points"] - g
            a["n"] += 1
            a["abs"] += abs(d)
            a["signed"] += d
            a["exact"] += abs(d) < 1e-9
            a["within1"] += abs(d) <= 1 + 1e-9
            a["max"] = maxes.get(c["criterion_id"])
    out: dict = {}
    for (ds, trait), a in acc.items():
        out.setdefault(ds, {})[trait] = {
            "n": a["n"], "max_points": a["max"], "mae": round(a["abs"] / a["n"], 3), "bias": round(a["signed"] / a["n"], 3),
            "mae_normalized": round(a["abs"] / a["n"] / a["max"], 3) if a["max"] else None,
            "exact": round(a["exact"] / a["n"], 3), "within_one_point": round(a["within1"] / a["n"], 3)}
    return out


def build_metrics(joined: list[dict]) -> dict:
    """Metrics are always computed within one dataset (one scale); nothing pools incompatible scales."""
    def by(key):
        return {f"{d} | {k}": rows_metrics(rows) for d, drows in group_by(joined, lambda r: r["sample"]["dataset_id"]).items() for k, rows in group_by(drows, key).items()}
    ordinal = [r for r in joined if r["sample"].get("score_type", "ordinal") == "ordinal"]
    return {
        "run_totals": {"samples": len(joined), "ai_calls": sum(r["result"].get("ai_calls") or 0 for r in joined), "cost_usd": round(sum(r["result"].get("cost_usd") or 0 for r in joined), 4)},
        "by_dataset": {d: rows_metrics(rows) for d, rows in group_by(joined, lambda r: r["sample"]["dataset_id"]).items()},
        "by_dataset_partition": by(lambda r: r["sample"].get("test_partition") or r["sample"]["split"]),
        "by_dataset_language": by(lambda r: r["sample"]["language"]),
        "by_dataset_assessment_type": by(lambda r: r["sample"]["assessment_type"]),
        "by_question": {k: rows_metrics(rows) for k, rows in group_by(joined, lambda r: r["sample"]["question_id"]).items()},
        "criterion_disagreement": criterion_disagreement(ordinal),
        "trait_vs_official_gold": trait_metrics(ordinal),
        "largest_discrepancies": discrepancies(ordinal),
    }


def report_md(meta: dict, metrics: dict) -> str:
    t = metrics["run_totals"]
    lines = [f"# Grading benchmark run {meta['run']}", "", f"- Split: `{meta['split']}` · limit per dataset/partition: {meta['limit'] or 'all'} · policy: {meta.get('variant')} · model: {meta.get('model', 'see adapter.log')}",
             f"- Samples: {t['samples']} · AI calls: {t['ai_calls']} · measured cost: ${t['cost_usd']}", "", "Each table covers one dataset (one scale). Nothing below pools incompatible scales.", ""]
    for name, m in metrics["by_dataset_partition"].items():
        lines += [f"## {name}", "", "| Metric | Value |", "|---|---|", f"| Samples / status | {m['samples']} / {m['status']} |", f"| Failures | {m['failure_reasons'] or '-'} |"]
        if "classification_5way" in m:
            for sch in ("5way", "3way", "2way"):
                c = m[f"classification_{sch}"]
                lines.append(f"| {sch}: accuracy / macro-F1 (n) | {c.get('accuracy')} / {c.get('macro_f1')} ({c.get('n')}) · CI95 {c.get('ci95_question_bootstrap')} |")
        else:
            g = m["vs_canonical_gold"]
            for k in ("n", "mae_normalized", "mean_signed_error_normalized", "exact_agreement", "within_1_points", "within_0.5_points", "qwk_11bin", "severe_overgrading_rate", "severe_undergrading_rate", "ci95_question_bootstrap"):
                if k in g:
                    lines.append(f"| vs gold: {k} | {g[k]} |")
            ig = m["inter_grader_reference"]
            lines.append(f"| inter-grader: MAE / exact / QWK (n) | {ig.get('mae_normalized')} / {ig.get('exact_agreement')} / {ig.get('qwk_11bin')} ({ig.get('n')}) |")
        lines.append(f"| feedback present / language match | {m['feedback']['present_rate']} / {m['feedback']['language_matches_rate']} |")
        lines.append(f"| evaluations identical / third used | {m['consistency']['first_two_evaluations_identical_rate']} / {m['consistency']['third_evaluation_rate']} |")
        lines.append(f"| latency mean / p95 (ms) · cost | {m['latency_ms']['mean']} / {m['latency_ms']['p95']} · ${m['cost_usd']} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", type=Path, default=DEFAULT_DATA)
    p.add_argument("--datasets", default="mohler,araes")
    p.add_argument("--split", default="test", choices=["calibration", "validation", "test"])
    p.add_argument("--limit", type=int, default=10, help="responses per dataset (0 = all gradable in the split)")
    p.add_argument("--sample-seed", default="enara-bench-v1")
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--max-cost", type=float, default=5.0,
                   help="per-run estimate gate; without --budget it is also this run's hard spending cap")
    p.add_argument("--yes", action="store_true", help="accept an estimate above --max-cost; never exceeds a budget cap")
    p.add_argument("--budget", help="cumulative budget (data/benchmarks/budgets/<name>.json) shared by every run in an approved batch; "
                                    "enforced per AI call, retries and third evaluations included")
    p.add_argument("--budget-cap", type=float, help="USD cap when creating --budget (fixed afterwards)")
    p.add_argument("--authorized-by", help="who approved the budget and when (required to create one)")
    p.add_argument("--estimate-only", action="store_true")
    p.add_argument("--run-name")
    p.add_argument("--adapter-cmd", help="alternative grader command (tests); gets --in/--out")
    p.add_argument("--variant", default="baseline", choices=["baseline", "v3"])
    p.add_argument("--improvements", default=",".join(DEFAULT_IMPROVEMENTS), help="v3 only: subset of brevity,levels,anchors,leak,criterion")
    p.add_argument("--allow-test", action="store_true", help="allow a v3 run on the held-out test split")
    p.add_argument("--offset", type=int, default=0, help="skip the first N selected responses per dataset (a disjoint sample from the same selection order)")
    p.add_argument("--anchor-exclusion", default="all", choices=["all", "none"],
                   help="calibration only: 'all' (default) drops the questions any anchor set could use, so anchor ablations match; "
                        "'none' keeps them, for comparisons where no arm uses anchors")
    p.add_argument("--sample-ids", type=Path, help="frozen sample manifest (JSON with sample_ids): grade exactly these, in this order, "
                                                   "so every arm of a comparison sees identical responses")
    p.add_argument("--partitions", help="test only: comma list (unseen_answers,unseen_questions,unseen_domains); --limit applies per partition")
    args = p.parse_args()
    if args.variant != "baseline" and args.split == "test" and not args.allow_test:
        raise SystemExit("v3 runs on the held-out test split need --allow-test (tune on calibration, compare on validation).")

    samples = load_samples(args.data)
    ds_ids = [DATASETS[k.strip()] for k in args.datasets.split(",")]
    policy, anchors_used = (None, [])
    if args.variant == "v3":
        imps = {x.strip() for x in args.improvements.split(",") if x.strip()}
        unknown = imps - set(IMPROVEMENTS)
        if unknown:
            raise SystemExit(f"unknown improvements: {unknown}")
        policy, anchors_used = build_policy(samples, ds_ids, imps, args.sample_seed)
    # Anchors and their questions are never evaluated. On the calibration
    # split the baseline excludes the same questions, so both variants grade
    # exactly the same responses.
    # On calibration, every variant excludes the questions the full anchor set
    # would use, so ablations (with or without anchors) grade identical responses.
    if args.split == "calibration" and args.anchor_exclusion == "all":
        _, excl = build_policy(samples, ds_ids, set(IMPROVEMENTS), args.sample_seed)
        anchors_used = anchors_used + [a for a in excl if a["sample_id"] not in {x["sample_id"] for x in anchors_used}]
    anchor_ids = {a["sample_id"] for a in anchors_used}
    anchor_qs = {a["question_id"] for a in anchors_used}
    pool = [s for s in samples if s["sample_id"] not in anchor_ids and s["question_id"] not in anchor_qs]
    chosen: list[dict] = []
    wanted = {x.strip() for x in args.partitions.split(",")} if args.partitions else None
    for ds in ds_ids:
        parts = sorted({s.get("test_partition") for s in pool if s["dataset_id"] == ds and s["split"] == "test" and s.get("official_split")}) if args.split == "test" else []
        if parts:  # official test partitions: sample each separately
            for part in parts:
                if wanted is None or part in wanted:
                    chosen += select(pool, ds, "test", args.limit, args.sample_seed, part)
        else:
            picked = select(pool, ds, args.split, (args.offset + args.limit) if args.limit else 0, args.sample_seed)
            chosen += picked[args.offset:]
    if args.sample_ids:
        manifest = json.loads(args.sample_ids.read_text(encoding="utf-8"))
        by_id = {s["sample_id"]: s for s in samples}
        missing = [i for i in manifest["sample_ids"] if i not in by_id]
        if missing:
            raise SystemExit(f"sample manifest has ids not in the data: {missing[:5]}")
        chosen = [by_id[i] for i in manifest["sample_ids"]]
        wrong = [s["sample_id"] for s in chosen if s["split"] != args.split or not s["gradable"] or s["dataset_id"] not in ds_ids]
        if wrong:
            raise SystemExit(f"sample manifest has ids outside the gradable {args.split} split of {args.datasets}: {wrong[:5]}")
        clash = [s["sample_id"] for s in chosen if s["sample_id"] in anchor_ids or s["question_id"] in anchor_qs]
        if clash:
            raise SystemExit(f"sample manifest overlaps anchor questions: {clash[:5]}")
    est = estimate(chosen)
    print(json.dumps({"plan": est}, indent=2))
    if args.estimate_only:
        return
    if est["total_cost_usd"] > args.max_cost and not args.yes:
        raise SystemExit(f"Estimated ${est['total_cost_usd']} exceeds --max-cost ${args.max_cost}; rerun with --yes to approve.")
    run_name = args.run_name or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{args.split}-{args.limit or 'all'}"
    # Hard spending cap: an explicit cumulative budget, or (no --budget) a per-run
    # budget capped at --max-cost. --yes never raises either.
    if args.budget:
        budget_file = budgets.ledger_path(args.budget)
        ledger = budgets.open_or_create(budget_file, args.budget, args.budget_cap, args.authorized_by)
    else:
        budget_file = RUNS / run_name / "budget.json"
        ledger = budgets.open_or_create(budget_file, f"run-{run_name}", args.max_cost, f"per-run default cap (--max-cost ${args.max_cost})")
    left = budgets.remaining(ledger)
    if est["total_cost_usd"] > left:
        raise SystemExit(f"Estimated ${est['total_cost_usd']} exceeds the ${left:.2f} left in budget {ledger['name']!r} "
                         f"(cap ${ledger['cap_usd']}, authorized by: {ledger['authorized_by']}). --yes does not raise a budget; "
                         "a larger spend needs a new approved budget.")
    spent_before = ledger["spent_usd"]

    meta_imps = {x.strip() for x in args.improvements.split(",")} if args.variant == "v3" else set()
    run = run_name
    folder = RUNS / run
    folder.mkdir(parents=True, exist_ok=True)
    inp, out = folder / "input.jsonl", folder / "results.jsonl"
    with inp.open("w", encoding="utf-8") as f:
        for s in chosen:
            f.write(json.dumps(grader_input(s, set(meta_imps)), ensure_ascii=False) + "\n")
    policy_path = None
    if policy:
        policy_path = folder / "policy.json"
        policy_path.write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")
    run_adapter(inp, out, args.concurrency, args.adapter_cmd, policy_path, budget_file, run)
    after = budgets.read(budget_file)
    budget_meta = {"name": after["name"], "cap_usd": after["cap_usd"], "authorized_by": after["authorized_by"],
                   "spent_before_usd": spent_before, "spent_after_usd": after["spent_usd"],
                   "run_spent_usd": round(after["spent_usd"] - spent_before, 6), "remaining_usd": budgets.remaining(after),
                   "stop_reason": after["stop_reason"]}

    results = {r["sample_id"]: r for r in (json.loads(l) for l in out.read_text(encoding="utf-8").split("\n") if l)}
    joined = [{"sample": s, "result": results[s["sample_id"]]} for s in chosen]
    with (folder / "joined.jsonl").open("w", encoding="utf-8") as f:
        for r in joined:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    metrics = build_metrics(joined)
    meta = {"run": run, "sample_manifest": str(args.sample_ids) if args.sample_ids else None, "split": args.split, "limit": args.limit, "samples": len(chosen), "offset": args.offset, "variant": args.variant,
            "improvements": sorted({x.strip() for x in args.improvements.split(",")}) if args.variant == "v3" else [],
            "anchor_sample_ids": sorted(anchor_ids), "anchor_question_ids": sorted(anchor_qs), "ran_at": datetime.now(timezone.utc).isoformat(), "estimate": est,
            "manifest": json.loads((args.data / "manifest.json").read_text(encoding="utf-8")) if (args.data / "manifest.json").exists() else None,
            "budget": budget_meta,
            "manifest_additional": json.loads((args.data / "manifest_additional.json").read_text(encoding="utf-8")) if (args.data / "manifest_additional.json").exists() else None}
    log = (folder / "adapter.log").read_text(encoding="utf-8")
    if '"modelName":"' in log:
        meta["model"] = log.split('"modelName":"', 1)[1].split('"', 1)[0]
    (folder / "metrics.json").write_text(json.dumps({"meta": meta, **metrics}, indent=2, ensure_ascii=False), encoding="utf-8")
    (folder / "report.md").write_text(report_md(meta, metrics), encoding="utf-8")
    print(report_md(meta, metrics))
    print(f"\nrun folder: {folder.relative_to(REPO_ROOT)}")
    stopped = sum(1 for r in joined if r["result"].get("reason") == "budget_exhausted")
    print(f"budget {budget_meta['name']}: run spent ${budget_meta['run_spent_usd']}, ${budget_meta['remaining_usd']} of ${budget_meta['cap_usd']} left")
    if stopped:
        print(f"BUDGET STOP: {stopped} responses not graded. {budget_meta['stop_reason']}")


if __name__ == "__main__":
    main()
