# Live avatar test: results (22 Nov 2026, lms-test, tutor on DeepSeek)

- **Setup:** Anam account "Enara" (free plan). Synthetic voices, 4 sentences per call.
- **Calls:** 12 completed in total: 11 today (1 check + 10) and 1 on 21 Nov. All 11 today completed with no errors.

## Speech-to-text (Anam)
| Voices | Sentences | Exactly right | Right in meaning | Word error rate |
|---|---|---|---|---|
| Adult (5 voices, 6 calls today) | 24 | 19 | **23** | 5% |
| Child-like (5 calls) | 20 | 18 | **18** | 2% |

**Adult differences** (mostly only the format):
- "It is" → "It's", "twelve" → "12", "seven" → "7", "Sara" → "Sarah";
- **one real mistake:** "Ali" → "Ollie".

**Child-like mistakes** (both real):
- "My friends come…" → "**I** friends come…";
- "My pencil is green" → "**Eye** pencil is green".

The child-like voices are an adult voice raised in pitch, not real children, so real children may do worse.

## Speed (from the end of the learner's sentence)
| | Adult | Child-like |
|---|---|---|
| First text from the tutor (median) | 1.49 s | 1.52 s |
| Avatar starts speaking (median / slowest 10%) | 2.53 s / 3.85 s | 2.28 s / 2.66 s |

The tutor's own time on the server was 1.13 s at the median. The rest is speech-to-text, voice and video on Anam's side.

## Cost
- **Anam minutes:** 13.8 used today (calls of 64–94 s). **16.2 of the 30 free minutes are left** this month.
- **On a paid plan**, at Anam's public prices from 21 Nov: **$0.11 to $0.24 per minute** (11 to 24 cents).
- **DeepSeek model**, for the tutor's replies and the screen visuals: about $0.009 per 70-second call, so about **$0.008 per minute**, at the safe upper-bound price.

| Avatar lesson | Anam ($0.11–0.24/min) | DeepSeek | **Total** |
|---|---|---|---|
| 3 minutes | $0.33–0.72 | $0.02 | **$0.35–0.74** |
| 10 minutes | $1.10–2.40 | $0.08 | **$1.18–2.48** |
| 20 minutes | $2.20–4.80 | $0.16 | **$2.36–4.96** |

Anam is almost all of the cost. On the free plan a session stops at 3 minutes, so 10- and 20-minute lessons need a paid plan.

## Worth knowing
- **Free plan:** a session can last 3 minutes at most, and only 1 can run at a time. Real lessons would be cut off at 3 minutes.
- **Speed step 6** (the avatar starts speaking from the first checked sentence): it can now be built and measured. It needs a few more test calls (about 4 minutes of the remaining free minutes).

## Speed step 6 (22 Nov, 3 more calls, 12 sentences)
The change: the avatar speaks an English-lesson reply sentence by sentence (`avatarSentences`, live in #76).

| | Before (10 calls) | With step 6 (3 calls) |
|---|---|---|
| First text from the tutor (median) | 1.51 s | 1.60 s |
| Avatar starts speaking (median) | 2.37 s | 2.63 s |
| Slowest 10% | 3.22 s | 3.00 s |

- **No measurable gain.** DeepSeek replies are short (2–3 sentences) and come within about 1 s. Most of the wait is the grading call and Anam's voice and video, not waiting for the rest of the reply.
- **One outlier:** one sentence (call a09) took 32.7 s before any text. The server's own time for that turn was 4.5 s, so most of the delay was outside the tutor. The cause is not known yet.
- **Anam minutes:** these 3 calls used **4.35 minutes**, slightly over the 4 asked (calls of 79–109 s). **11.9 free minutes are left** this month.
- **Speech-to-text:** 12 of 12 sentences heard exactly.
