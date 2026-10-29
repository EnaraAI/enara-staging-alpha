# ENARA F-3b: live validation of small-scope grounded chat

Date: 2026-10-29 (UTC). The code under test is the uncommitted F-3b working tree on `staging-alpha` (HEAD `d52784d`). That's `educatorChat.ts` with hash `6daab8b625ce…` and `curriculumRetrieval.ts` with hash `1c42e3f76465…`, as recorded in the F-3b provenance snapshot.

The owner approved the paid run as proposed: Opus, a $1 hard cap and at most 194 attempts. The owner then approved the follow-up diagnostic runs and decided how borderline cases count (§3).

## 1. Setup

- **Harness:** `/tmp/claude-0/f3b-live/run.ts`, outside the repository.
- **Database:** an isolated in-memory MongoDB with a synthetic school and teacher, and 8 synthetic EN/AR text documents uploaded with a rights attestation through the real `/api/documents` route.
- **Route:** the real `/api/educator-chat/ask`, with the real `aiGateway`, the P0d `OrgBudget` and `usage_ledger`.
- **Model:** `claude-opus-5-5`, the default `ANTHROPIC_TUTOR_MODEL`. The staging value wasn't read.
- **Budget:** `OrgBudget` caps of daily = monthly = per-user = **$1.00**, with enforcement on. Every attempt reserves its upper bound before the provider is called.
- **API key:** passed from a local `.env` into the process environment with the owner's permission. It was never printed or stored.
- **No staging, production or remote data** was touched, other than the Anthropic API.
- **Probes:** 50, run twice in a seeded random order, one at a time, each in a new conversation.
- **Groups:**
  - supported EN (12), supported AR (8), supported with 2–3 documents (5);
  - off-topic EN (15), off-topic AR and mixed-language (7);
  - 4+ passage regression (3).
- **Rate limit:** the per-school AI limit was waited out 4 times. This costs nothing, because it's checked before any budget reservation.

Before the live run, a dry run against a local stub API produced 100/100 correct gradings. A dry run with a $0.10 test cap stopped on `AI_BUDGET_EXCEEDED` after charging $0.0616.

## 2. Main run results (100 runs)

| Group | Passed |
|---|---|
| Supported EN, 1 document | 24/24 |
| Supported, 2–3 documents (EN + AR) | 10/10 |
| Supported AR, 1 document | 14/16 |
| Off-topic EN | 29/30 |
| Off-topic AR and mixed-language | 12/14 |
| 4+ passages (must make no call) | 6/6 |

- **Spend:** 94 provider attempts and 94 ledger rows. The 6 runs with 4+ passages made no call, as expected. Total **$0.3484**, using 32,240 input and 10,971 output tokens. No budget stop, no retries needed, no harness errors.
- **Latency, for calls that reached the model:** median 1.7 s, 95th percentile 4.9 s.

## 3. Failures, with diagnosis (diagnostic re-runs, answers captured)

**Off-topic "Explain water to my students" (`xe13` EN, failed 1 of 2; `xa07` AR, failed 2 of 2).**
- The re-run captured the answers. Each one is **grounded and explicitly scoped**. For example: "Your uploaded material only covers water's role in photosynthesis [1]… Plants use water as one of the raw ingredients… [1]". The Arabic answer says the sources mention water only in the context of photosynthesis and that no other information is included.
- Every cited claim is in the passage.
- **Owner decision:** a grounded, scoped explanation of a topic's role in the passage counts as **supported**. These answers are therefore **not false positives**, and the probe is reclassified as *borderline: either a decline or a scoped, grounded answer is acceptable*.

**Supported AR "كيف يمتص الكلوروفيل ضوء الشمس؟" (`ar01`, failed 2 of 2 in the main run and 2 of 2 in the re-run).**
- I captured the raw model reply: Opus answered exactly `NOT_IN_SOURCES` every time.
- **Diagnosis:** the question asks *how* chlorophyll absorbs sunlight. The passage says only *that* it does ("يمتص الكلوروفيل ضوء الشمس"), so declining is a defensible strict reading.
- The expectation came from the keyword-only P8 probes, where a matching passage counted as supported. The comparable English probe, "How does chlorophyll use sunlight?", was answered, because the passage does say how the plant uses that energy.
- The probe is reclassified as *ambiguous: a decline is acceptable*.
- **This is not a code defect, but it is a recall consideration.** With a strict "how" reading, the model may decline Arabic or English mechanism questions that a teacher would expect it to answer from a "states that" passage.

## 4. Pass criteria

Criteria as proposed, applied after the owner's §3 decision:

| Criterion | Target | Raw result | After reclassification |
|---|---|---|---|
| Cited answers to off-topic questions | 0 | 3 | **0** (all 3 were grounded, scoped answers to the borderline "water" probe) |
| Supported EN answered with a correct citation | ≥ 95% | 100% (24/24, plus 6/6 in multi-document runs) | 100% |
| Supported AR answered with a correct citation | ≥ 95% | 87.5% (14/16) | 100% of unambiguous probes (14/14); the 2 `ar01` declines are acceptable as an ambiguous probe |
| 4+ passages make no provider call | 0 | 0 | 0 |
| Median latency | ≤ 3 s | 1.7 s | 1.7 s |
| Spend matches the ledger | yes | 94 attempts = 94 rows | yes |

**Verdict:** F-3b **passes with reclassified probes**. Two probe expectations were changed by owner decision, and both are disclosed here. The raw run did **not** meet two criteria as originally written. Anyone reviewing this should accept or reject the reclassification explicitly.

Limits of this evidence:
- one model (Opus);
- synthetic one-sentence documents;
- n = 2 runs per probe.

## 5. Findings

- **F-9 (new, latent, P3): Arabic-Indic citation digits are not parsed.**
  - `citationsIn` matches `[(\d{1,2})]`, and in JavaScript `\d` matches only ASCII digits. So `[١]` and `[۱]` give **zero citations** (verified locally), and the answer becomes `unsupported`.
  - This was not observed in this run; Opus used `[1]` in every captured Arabic answer.
  - It fails safe, refusing rather than miscitting, but it could hide valid Arabic answers from other models or prompts.
  - Suggested fix (not implemented): normalize Arabic-Indic digits before parsing, and add a test.
- **The "how" strictness** in §3 is a recall consideration, not a defect.

## 6. Spend

| Run | Attempts | USD (ledger) |
|---|---|---|
| Main run (100 runs) | 94 | 0.3484 |
| Diagnostic re-run with answers (xa07, xe13, ar01 × 2) | 6 | 0.0447 |
| Raw-reply capture (ar01 × 2) | 2 | 0.0097 |
| **Total** | **102** | **$0.4028** |

Every run stayed under its own $1 cap, and the total is under the approved $1. Each run used a fresh isolated database and budget, so the cap applied per run. The overall total of $0.40 is within the original approval.

## 7. Files

- **This folder (new, untracked):**
  - this report;
  - `F3B_LIVE_RESULTS.json` (main run, per-run results, no answer text);
  - `F3B_DIAGNOSTIC_RERUNS.json` (re-run answers and raw replies; synthetic content only).
- **No code, test or earlier report was changed by this validation.** The harness stays outside the repository.
- No secrets in any file. I checked this folder for key patterns.

## 8. Status

- **F-3b:** passes the live validation with the owner-approved reclassification in §3–4. It's ready for review together with the rest of P8.
- **F-9:** new latent finding, not fixed.
- **F-5:** still unresolved on the live deployment.
- The $4 English assessment benchmark is still unapproved.
- No deployment is authorized, and external testing remains NO-GO.
