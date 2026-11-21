# Plan: temporary agent bridge, then the avatar cost test (21 Nov 2026)

Tutor track only. lms-test only, test.enara.app stays frozen. Small PRs, E2E must pass. No keys in chat.

## 1. Anam price (done, see below)
I could not open anam.ai from this session (the network blocks it). The numbers below come from search results that quote anam.ai/pricing, checked 21 Nov 2026. Please confirm them against your own usage page.

## 2. Bridge PR (`claude/tutor-lms-agentbridge`)
**Switch**
- `TUTOR_AGENT_BRIDGE=true`, on for lms-test only.
- The deploy pipeline's allow-list gets this one exact name.

**Where it cuts in**
- Every Anthropic call that serves a learner goes through one choke point: the tutor chat and stream, the grader and the closing check.
- With the switch on, that call does not go to Anthropic. Instead it saves the exact request (model, system prompt including the learner brief and all switch lines, the messages, max tokens) as one row in a new collection, `agent_bridge_requests`. Then it waits for the reply.
- The engine's own checks (child trim, one task, marker parsing, grading) run on the reply as usual.
- Calls that don't serve a learner (teacher tools, reports, imports) answer "offline for maintenance".

**Queue endpoints**
- `GET /api/agent-bridge/next` claims the oldest waiting request.
- `POST /api/agent-bridge/:id/reply` posts the answer.
- Both need `Authorization: Bearer <TUTOR_AGENT_BRIDGE_SECRET>`: at least 32 characters, compared in constant time.
- Both return 404 when the switch is off. You set the secret in Vercel and on your machine.

**Allow-list**
- `TUTOR_AGENT_BRIDGE_USERS` holds your test account emails or IDs, comma separated. You set it.
- Anyone else gets "The tutor is offline for maintenance."

**Timeout**
- No reply within **55 s** means "Please try again".
- It can't be 60 s: lms-test's server stops any request at 60 s in total (`vercel.json` maxDuration 60).

**Other limits**
- Avatar calls are off while the bridge is on (a 503 with "offline for maintenance").
- Rows are deleted after 24 hours (TTL), and replies are deleted once read. Nothing else is stored.

**Local script (`scripts/agent-bridge/bridge.mjs`, Node 22, no dependencies)**
- Every 1 s it claims a request and runs `claude -p`, with the request's system prompt as the system prompt and the messages as the prompt. It uses no tools and one turn only.
- It posts the text back and logs only IDs and timings, never the text.

**README (`scripts/agent-bridge/README.md`, one page)**
- How to start it.
- How to check it works (send "hi" from an allowed account and see the reply).
- How to turn the bridge off (set `TUTOR_AGENT_BRIDGE=false` and redeploy).

**Tests**
- Unit tests:
  - switch on and off;
  - the allow-list;
  - the secret (missing, wrong, short);
  - the timeout;
  - the reply going through the engine's checks;
  - avatar blocked.
- E2E scenario 19:
  - a test plays the local script: it claims the request and posts a reply, and the allowed student sees it;
  - a student who isn't allowed gets the maintenance line;
  - the avatar start is refused.

**Note:** answers come from your Claude Code model, not the engine's own model (Haiku or Opus), so their speed and cost are not real tutor numbers.

## 3. When you say "key set"
1. Small PR: switch the bridge off and remove its code, endpoints, collection and script. Avatar calls come back. E2E must pass.
2. Redeploy, then run the avatar test (it's ready): 20 adult and 5 child-like voices, 4 sentences each, at most 30 calls.
3. Report:
   - speech-to-text accuracy, adult vs child;
   - reply time, median and slowest 10%;
   - Anam minutes and LLM dollars per session;
   - cost per session at the price you confirm.

## 4. Azure and pronunciation
No change until your go.

## Report
One line per deploy, and 3 lines at the end.
