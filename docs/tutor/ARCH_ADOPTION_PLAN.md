# Plan: what we take from ARCHITECTURE.md (main), for a general tutor (21 Nov 2026)

Owner go: "adapt from them what you have mentioned and start building."
Tutor track. lms-test only. Each item is its own switch (named-only, off by default), in its own small PR. E2E must pass, then it's turned on for lms-test.
**No new provider:** embeddings wait for your provider choice.

| # | PR | Switch | What it does |
|---|---|---|---|
| A | Reliability | `modelFallback` | Retry with backoff on 429/5xx. On 401/403, 429 or 5xx after retries, use `ANTHROPIC_API_KEY_FALLBACK` if it is set, and a fallback model. The deploy health check makes one real 1-token call and fails the deploy if the key is rejected. An alert line goes in the step summary. |
| B | Grade marker for all subjects | `gradeAllSubjects` | Practice questions in any subject carry the hidden marker, linked to the lesson objective. This feeds the chat right/wrong record, session summaries, errors closing through practice, and spaced review. |
| C | Retrieval across languages | `ragRewrite`, `ragReuse` | If retrieval is weak, make one cheap rewrite (Arabic ↔ English keywords) and search again. For "explain again" or "I don't understand", reuse the last turn's passages. |
| D | Not in your materials | `groundedRefusal` | When no passage fits, the tutor says the school's materials don't cover it (it may add a short, clearly labelled general answer). An `outOfScope` flag on the turn is counted for teachers. |
| E | Topic memory | `topicMemory` | Per session: the objectives and passages covered, and one line on where the learner got stuck, written by code. It feeds the "last time" line for all subjects. |
| F | Test set per subject | none (eval only) | About 20 fixed questions each for maths, science and an Arabic-language subject, with expected passages. It scores retrieval hits and grounded, cited answers. It runs on demand while there's no key, and on each PR once there is one. |
| G | Method from evidence | `methodFromEvidence` | The planner prefers the method that worked for this learner (`whatWorks`, at least 3 sessions); otherwise it uses the default. |
| H | One repair | `repairOnce` | If a hard check fails (answer leaked, two tasks, missing marker), regenerate once, then fall back to today's trim. |
| I | Input safety | `injectionCheck` | A code check for prompt-injection patterns in learner text and passages. Flagged text is neutralised and logged as IDs only. |

**Order:** A → B → C → D → E → F → G → H → I.

**Without a working key:** each PR ships with unit tests and E2E (AI stays paused in E2E). Behaviour is measured with test set F once the key works.
