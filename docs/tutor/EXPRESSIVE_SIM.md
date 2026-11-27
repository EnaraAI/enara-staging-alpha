# Expressive avatar (item 5): simulation and screenshots

27 Nov 2026, lms-test only. Switch: `liveExpressive` (named-only `ENARA_ENGINE_V2` feature, not part of "all").

## What the switch does
- **Face and style.** On a Cara 4 face the call asks Anam for `cara-4.1-express` and a Director Notes style.
  - Adults and teens: warm, expressivity 0.5.
  - Children, and learners whose age is not known: supportive, expressivity 0.3, and voice speed 0.85 where the voice allows it.
  - A face without Cara 4.1 Express gets today's call.
- **Cues chosen by code** from the turn's verdict, in every subject.
  - Right: happy (children warm). Wrong: supportive. New question or drawing: curious. Stuck: concerned, then supportive.
  - No verdict: a neutral cue (warm or curious).
  - Angry, sad, distressed and laughter are never sent, and every cue tag the model writes is removed.
  - A cue is never spoken, shown, captioned or stored as text.
- **Drawing.** Anam cannot turn the face, so the panel sits on the face's side and pulses ("Look here / انظر هنا"). The tutor says "Look at the picture." (Arabic: "لننظرْ إلى الصورة.").

## How the simulation works (`deploy/lms-test/expressive/sim.mjs`)
- **The calls.** It uses the live tutor's text path on lms-test: `POST /api/avatar/session`, then `/api/avatar/query-stream`. No video is connected and no paid voice is used. The tutor is DeepSeek V4.1 Flash.
- **The learner.** DeepSeek plays the learner through the maintenance route `llm-compare`. No Anthropic model is used.
- **The two arms.** Each learner is played twice, side by side, with the switch off and on. This uses the CI-only per-call override; the CI token is never in a page.
- **The six learners**, each a seed account of the same age band, in their own course:

  | Learner | Account | Subject | Lesson language |
  |---|---|---|---|
  | A1 adult | hassan.shaker | English | English |
  | B1 adult | nadine.soliman | English | English |
  | A2 teen | farida.fahmy | maths | English |
  | teen | nadine.nasser | science | Arabic |
  | child aged 8 | khaled.nasser | Arabic language | Arabic |
  | child aged 11 | menna.osman | maths | English |

  - menna.osman is scripted to get stuck: "I don't know", then "I don't understand. Why?".
  - Every session has eight turns, one of them a drawing request.
- **The checks:**
  - **Cue matches verdict.** The first cue of each "on" reply against the verdict stored with that reply (the language engine's for English, the hidden grading line's for the other subjects). Bar: at least 95%.
  - **Blocked cues.** No blocked cue is ever sent, and no cue is sent with the switch off.
  - **Children calm.** Their calls get the child style, and a right answer is cued warm, never happy.
  - **No cue spoken or shown.** No cue tag in any streamed or stored reply.
  - **Teacher would accept.** DeepSeek pre-screens 20 "on" replies spread over the six learners. Bar: at least 90%.
  - **Stuck learners, no worse.** Each learner message gets an independent label (right / wrong / stuck / other). A session counts as stuck if it has 3+ failed tries in a row or no right answer at all.
  - **Arabic lessons stay in Arabic** (added after run 3). The number of Arabic-medium replies that open in English must be no worse with the switch on.

## Runs
| Run | After | Cue matches verdict | Blocked | Children calm | Cue shown | Teacher accept | Stuck off → on | Arabic replies in English (off / on) |
|---|---|---|---|---|---|---|---|---|
| 1 (46048454372) | PR 2b | 30/30 | 0 | yes | 0 | 19/20 | 0 → 1 (on-arm turns timed out on lms-test) | 0 / 2 |
| 2 (46067233332) | PR 4 | 40/40 | 0 | yes | 0 | **15/20** | 1 → 1 | 0 / 1 |
| 3 (46071044923) | PR 5a | 48/48 | 0 | yes | 0 | 19/20 | 1 → 0 | **0 / 3** |
| 4 | PR 5b | see below | | | | | | |

### What the runs found, and what changed
- **Run 1.**
  - menna.osman has no science course, so she now does maths.
  - Many "on" turns hit lms-test 503/504 timeouts. Off and on now run side by side, and a turn is retried once. Run 3 latency: median 1.9 s off, 2.4 s on.
  - An Arabic lesson was answered in English twice with the switch on: the English hidden grading line pulled the reply out of Arabic. Fixed in PR 4: an Arabic lesson stays in Arabic.
- **Run 2.** The teacher check passed 15/20. The five "no"s:
  - two were the judge being unavailable;
  - "انظر إلى الصورة" is masculine, and the learner was a girl;
  - the look line came before the greeting;
  - one Arabic lesson reply was in English.

  Fixed in PR 5a:
  - the Arabic line is now "لننظرْ إلى الصورة.";
  - the look line follows the first sentence;
  - the language rule is also given in Arabic;
  - the judge is retried.
- **Run 3.** Every bar passed. But the 8-year-old's Arabic lesson still had 3 English replies in 8 with the switch on (0 off), and the teacher pre-screen let them through. Fixed in PR 5b: an Arabic-medium reply that opens in English is made again without the hidden line (in Arabic, neutral cue). The simulation now checks this.

## Screenshots (real calls, branch `live-expressive-shots`)
- **Calls.** Four real calls (adult hassan.shaker, child khaled.nasser in the kids app, switch on and off), about 11.6 Anam minutes.
- **What Anam did.**
  - It ran `cara-4.1-express` with the requested style: warm 0.5 for the adult, supportive 0.3 for the child.
  - It confirmed every cue we sent (`DIRECTOR_NOTE_CUE_APPLIED`): supportive, concerned, then supportive, curious.
  - The tutor's own audio, transcribed, never starts with a cue word.
  - On Leo's face the change is subtle (head, brows, mouth). The clearest difference is the child's right answer.
- **Limits.**
  - lms-test's Anam account is on the Free plan: 3-minute sessions and 30 minutes per period, now used up until 22 Dec. Three late frames are black (the session ended at 180 s).
  - The drawing workaround shots come from E2E 48 (no paid call).
- **Voices.**
  - English: ElevenLabs `eleven_flash_v2_5`, which allows a speed, so children get 0.85.
  - The Arabic voice set by env was not found in Anam's voice catalogue (`GET /v1/voices/{id}`), so its provider is unknown and no speed is sent for Arabic.

## What Anam cannot do (not promised)
- Look toward the drawing, nod or point on command.
- Show an exact expression.
- Change expressivity mid-call.
- Slow an ElevenLabs v3/v4 voice.
- Any of this on a face that is not Cara 4.
