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
- **On a paid plan**, at Anam's public prices from 21 Nov ($0.24 to $0.11 per minute): 1.0 to 2.2 cents per minute of call, so a 3-minute lesson costs about **$0.35 to $0.75**.
- **DeepSeek model**, for the tutor's replies and the screen visuals: about **$0.009 per call**, at the safe upper-bound price.

## Worth knowing
- **Free plan:** a session can last 3 minutes at most, and only 1 can run at a time. Real lessons would be cut off at 3 minutes.
- **Speed step 6** (the avatar starts speaking from the first checked sentence): it can now be built and measured. It needs a few more test calls (about 4 minutes of the remaining free minutes).
