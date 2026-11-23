# Mishkat development data — MODEL-MARKED

**Model-marked: development only. Not for claims. Never for a real school.** (Owner decision, 23 Nov 2026.)

- `pool-en.json` (500) and `pool-ar.json` (494) are synthetic learner answers. Every record has `source: "model-marked"`.
  - Benchmark answers come from `data/assessment-bench` (language, science, humanities and listening).
  - New answers are marked `origin: "new"`; `writer` is `deepseek` or `sonnet`.
  - Arabic is Modern Standard Arabic (fusha) only. Weak answers may contain one or two colloquial slips. Six benchmark answers written mostly in colloquial are left out.
- Marks come from three independent markers on the v3b language rubric (human markers' scale): DeepSeek, Claude Sonnet and Claude Opus. An answer is kept only when at least 2 of the 3 are within 1 point on every criterion; its label is the median.
- Owner corrections (`source: "owner"`) and, later, teacher marks (`source: "teacher"`) replace model marks.
- No LAILA or ELLIPSE text is ever stored here.
