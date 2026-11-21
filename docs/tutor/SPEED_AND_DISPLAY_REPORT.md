# Speed and reply display: report (21 Nov 2026, lms-test only)

test.enara.app stayed frozen. No Modal or Vercel setting was changed.

## Deploys (one line each)
| PR | What | Status |
|---|---|---|
| #71 | Speed: per-step timings, shared prompt, no grading call when nothing to grade, smaller grading call, streamed and checked replies; warm-up ping and idle probe (switches off) | Live (the first health check timed out at the Moodle roster step and rolled back by itself; one re-run passed) |
| #72 | Replies show properly for learners: Markdown, maths, Arabic right-to-left, citations, kids plain mode; the avatar speaks words only; new E2E check (no raw `**` or `#`) | Live |
| #73 | Young learners' replies stop at a sentence end when the word limit is reached; **speed switched on** (`dsFast`) | Live |

## Speed (100 test turns, streamed, before → after)
| | Before | After |
|---|---|---|
| First words, median | 1.66 s | **1.27 s** |
| First words, slowest 10% | 2.56 s | **1.71 s** |
| Whole reply, median | 1.66 s | 1.55 s |
| Grading line right | 98 | 99 |
| Turns with no grading call | 0 | 38 |
| Tokens per turn (in / out) | 2,984 / 165 | 2,408 / 125 (cheaper) |

- **The target was 1.0 s, and we are at 1.27 s.** Most of what is left is the grading call itself (median 0.9 s). Getting lower needs a faster model server.
- **Avatar (step 6):** waits for Anam minutes, as you asked.

## Idle timeout and the warm-up ping (step 7, as changed)
- **Idle timeout:** a tiny request after quiet gaps of 1, 2, 4, 6, 9, 13, 18, 25 and **40 minutes** always answered in **0.56–0.90 s**. The server never went cold, so it stays warm for **at least 40 minutes** after the last call. Three things could explain this, and from outside I can't tell which:
  - the server's own idle time is longer than 40 minutes;
  - Modal keeps one server always on (minimum containers);
  - other traffic to the same server (outside lms-test) keeps it awake.

  Your Modal dashboard (the app's settings) shows which one it is.
- **With vs without the warm-up:** there was no cold start to remove, so the warm-up gains **0 s** today. A first reply after 40 quiet minutes was as fast as any other.
- **Cost of the warm-up ping:** about 20 input tokens and 1 output token per ping, and at most one every 4 minutes (360 a day). That is **under $0.01 a day** in tokens at the upper-bound price. The real cost would be GPU time, but only when a ping wakes a cold server; today that never happens, so the cost is about **$0**.
- **A fixed ping every hour, compared with the idle timeout:**
  - **Idle time shorter than an hour (call it T):** each hourly ping wakes the server, which then stays up for about T minutes. That costs about 24 × (start-up + T) GPU-minutes a day, and the server is warm only T minutes out of every 60. Learners arriving in the cold part still wait.
  - **Idle time of an hour or more:** the hourly ping keeps the server warm all day, which means paying for a GPU 24 hours a day.
  - **Today:** the server already stays warm for at least 40 minutes, and nobody has hit a cold start. An hourly ping would add cost and gain nothing measurable.
- **My suggestion:** keep the warm-up ping **off** (it is built, behind the `dsWarmup` switch). Switch it on only if learners start hitting cold starts. The on-open ping is the cheap option because it pings only when someone is actually using the tutor.

## Reply display (all places a learner sees a tutor reply)
- **One shared display** in the student chat, the course tutor, the review tutor and the kids chats. Live-call transcripts show in the chat history; the live call window itself has no captions.
- **What shows properly:** bold, italics, lists, line breaks and inline code.
- **Safety:** HTML in a reply shows as text and never runs. Only web links work, opening in a new tab.
- **Streaming:** no stars flashing.
- **Arabic:** right-to-left per paragraph, and numbers and English words keep their order.
- **Maths:** x², √, × and ÷ show cleanly; 3/4 shows as ¾.
- **Sources:** [1] shows as a small marker with the source name on hover.
- **Kids:** plain text only.
- **Avatar speech:** Markdown symbols and source markers are removed before speaking, and maths is read as words (in Arabic for Arabic replies).
- **Tests:** unit tests, plus a new E2E check, which passed on the PR.
- **Worth knowing:**
  - the staff assistant gets the same maths formatting too;
  - the app has no separate under-9 setting, so the whole kids app uses plain mode.

## Waiting for you
1. **Anam minutes:** then speed step 6 (the avatar speaks sooner) and the rest of the avatar test.
2. **Optional:** whether the Modal app keeps a server always on. That explains the "never cold" result.
3. **The Anthropic key** ("key set"), to switch back.
