# Mishkat engine = v3b + trained scorer — plan

_24 Nov 2026, 11:30 AM Cairo. **Plan only: waiting for Mohamed's "go".** lms-test only, and nothing is deployed while the freeze is on. Training and tests run on GitHub runners; the Modal GPU only for fine-tuning (under $5 a run). Model-marked data: development only, never for claims, never for a real school. Numbers only in the repo._

## In three lines
1. **One engine named Mishkat:** v3b (DeepSeek + rubric) reads the question and the answer and writes the feedback; the trained scorer reads the language; a merge step gives one set of marks. One version number, one report, one switch.
2. **Step A is ready today:** it is the split already merged in PR #104 (`mishkatSplit`, off), renamed and reported as one engine. No new science.
3. **Step B is the experiment:** a *learned* merge, where the trained scorer also takes v3b's five marks as inputs and learns when to trust each. It ships only if it beats both the split and v3b alone.

## Why
| | Language (grammar, spelling, vocabulary) | Content (task, organisation) | Feedback text |
|---|---|---|---|
| Trained scorer | **Better** (Arabic LAILA grammar 0.46 vs 0.16) | Weak (cannot see the question) | None |
| v3b | Weak on human-scored essays | **Better** (short-answer task 0.71 vs 0.44) | **Yes** |

Each half covers the other's gap. Today they are joined by a fixed rule; a learned merge may do better on the criteria where both carry information (essay organisation and task completion are close: 0.90 vs 0.85, 0.71 vs 0.74).

## Step A: one engine (from PR #104)
- **Name and version:** `mishkat-<lang>-<date>-<hash>` covers both halves (scorer bundle id + rubric `v3b`). Every grade records it.
- **Flow:** unchanged from `MISHKAT_SPLIT_PLAN.md` (v3b and the scorer in parallel; the scorer replaces v3b's grammar, spelling and vocabulary; boundary fallback 0.15; "graders disagree" flag at 2 levels; v3b alone if the scorer is down after 3 s).
- **Teacher view:** "Scored by Mishkat" for the whole answer, with the per-criterion source kept in the details.
- **Reports:** one Mishkat column instead of two.
- **Work:** small (labels, version string, report). Full E2E suite on the PR.

## Step B: learned merge (experiment)
- **Inputs per answer:** the scorer's features as today + v3b's five marks (and its confidence) + the question type.
- **Training data:** ENARA's model-marked answers. **Targets: the Sonnet–Opus agreed marks only.** DeepSeek is one of the three markers, so training on the median would teach the merge to copy v3b. AR-ASAG (CC BY 4.0) can be added to Arabic short answers for content.
- **v3b marks for training:** already on file for every answer in the pool, from the marking step. No new DeepSeek spend.
- **Evaluation:** the same 5-fold split by question as today. Reported side by side: v3b alone, the split (Step A), the learned merge.
  - ENARA answers, against the Sonnet–Opus marks;
  - the 200 LAILA and 200 ELLIPSE human-scored essays;
  - length tests (same three bars);
  - Egyptian test set (Zenodo, CC BY 4.0, test only, never trained on).
- **Bar to ship:** per criterion, the learned merge ≥ the split **and** ≥ v3b, within 1 ≥ 0.85, length tests pass. A criterion that misses the bar stays on the Step A rule.
- **Cost at run time:** none extra. Still one DeepSeek call and one scorer call per answer.

## Not in this plan
- **The scorer writing feedback:** it cannot. v3b keeps the feedback, and its per-criterion rationale stays hidden where the scorer's mark is used.
- **Fine-tuning the scorer to read the question:** a separate later step, only if Step B leaves a gap on task completion.
- **Spoken answers:** stay fully with v3b.

## Blockers
- **lms-test is down (Vercel block):** Step A's E2E can run in Docker, but the deploy waits for you. v3b's Egyptian-set numbers wait too.
- **Modal secrets:** needed for the scorer service, not for Step B's training.
- **The switch:** stays off until your second "go", as before.

## Order, on your "go"
1. Step B experiment on GitHub runners (about 1 hour from the feature cache), report with all three columns.
2. Step A PR (naming, version, report), with the learned merge in it only if it passed. Full E2E.
3. Your "go" on the switch, once lms-test is back.
