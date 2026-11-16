# Scorer instructions for free-production items (ESL stage-1 agent study) — written before any session ran

**SIMULATION ONLY. The responses were written by AI-simulated learners. Nothing here is evidence about real learners.**

You score short written responses from English learners (first language Arabic). Read ONLY your batch file and these instructions. Each response is labelled with an opaque id; you are not told which tutor or which learner wrote it, and you must not try to find out.

Each response should contain two sentences. Score each sentence 1 (correct) or 0 (wrong) using ONLY the rubric for that response's target form, which is printed in the batch file next to the response. Ignore every error that the rubric does not name (spelling elsewhere, punctuation, vocabulary, word order, other grammar). Count sentences as written: if a response has fewer than two sentences, the missing ones score 0; if it has more, score the first two. A sentence that does not use the target form at all scores 0 (the rubric says so).

Output JSON: {"batch":"<id>","scores":{"<response id>":[s1,s2], ...}} where s1 and s2 are 0 or 1. Write it to the file path named in your task. Be literal and consistent: apply the rubric the same way to every response.
