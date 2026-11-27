*Plan for items 4–9. **Go given by Mohamed, 27 Nov 2026**: PR 0 first, then 4 → 5 → 6 → 7 (both phases) → 8 → 9. Items 1–3 (mute, captions, time used) are being built now.*

**Owner decisions (27 Nov 2026):**
- The legal review is complete and approved: minors are included in 7, 8 and 9 from the start.
- Text read from a learner's written work is stored like a typed answer; the image never.
- Kept as built: an explicit camera-on button every call, never remembered; images processed in memory and never stored; attention signals on-device only; no learner video in group calls; a teacher observer in every minors' group call.
- A **parent-consent record per child** is required before their first camera or group use (section "Consent" below).
- **All subjects, not only English** (owner, 27 Nov 2026): the live tutor teaches any subject (maths, science, Arabic, social studies, English…) in Arabic and English. Every item below covers all subjects: role-play scenes per subject, expressive cues from every subject's right/wrong verdict, the progress map per subject, written work and object lessons in any subject, and simulations that include maths, science and Arabic as well as English.

# Live tutor upgrade: plan for items 4–9

27 Nov 2026. Read from `lms-test-live` (avatar.controller.ts, engineV2.ts, avatarVisuals.ts, kidsPack.ts, errorsToWorkOn.ts, learnerMemory.ts, LiveAvatarModal.tsx, parents Progress.tsx), the Anam docs (Anam MCP) and web prices. No calls were made.

**Rules for every item:** lms-test only. Each item has its own `ENARA_ENGINE_V2` switch, named-only and off by default. Small PRs, full E2E, deploy to lms-test. Scenes, objects and cues come from code banks. Children get fixed safe content. test.enara.app is not touched.

## What the Anam docs say (checked 27 Nov 2026)
| Question | Answer | Source |
|---|---|---|
| Emotions | **Yes.** "Director Notes" give a style for the whole session (`supportive`, `warm`, `happy`…, expressivity 0–1, a custom style and an idle prompt). Inline cues such as `[happy] [warm] [supportive] [curious] [concerned] [surprised]` last for one turn. In audio-passthrough mode (our ElevenLabs path) the cues go over the data channel (`director_note_cue`). **Cara 4 faces only** (`avatarModel: "cara-4.1-express"`). | anam.ai/docs/personas/director-notes |
| Gestures, gaze, pose | **No.** "Not exact gesture controls… no deterministic gesture, gaze, or pose control." Hands stay out of view. A custom style is "followed less consistently". | same page; custom-avatar-best-practices |
| Voice style | Speed and emotion work on Cartesia Sonic 3 voices (speed 0.6–1.5) and on ElevenLabs v1/v2 voices (speed 0.7–1.2). **ElevenLabs v4 voices: no speed** (the request fails with a 400 error). Speed can change mid-call (`persona_config` data message). Expressivity cannot. | personas/voices/configuration; mid-session-updates; changelog 3 Nov 2026 |
| Several people in one session | **Not in a direct SDK session** (the docs describe nothing of the kind). **Yes through LiveKit:** the avatar joins a room, and every participant sees it. **Yes through Meetings** (Meet/Zoom/Teams, `groupCall`), but there the persona answers only when someone says its name. | integrations/livekit/overview; personas/meetings |
| Recording | Anam **keeps a recording and transcript of every session by default** (recordings for up to 30 days). ENARA does not turn this off today: `anamPersonaConfig` sends no `dataRetention` setting. LiveKit sessions are not recorded by Anam. | personas/session/recordings |

**Fix before items 7 and 9:** PR 0, switch `anamNoRecording`, sets `sessionOptions.dataRetention.recording=false`. ENARA keeps its own text transcript. Also check that our faces are Cara 4. Today no `avatarModel` is sent.

## The six items
| # | Item | Switch | Small PRs | Waits for legal review | Rough cost per 10-min call* |
|---|---|---|---|---|---|
| 4 | Role-play lessons | `liveRolePlay` | 1. scene bank + checker (data only) · 2. engine: scene chosen by code, corrections in character, debrief from `ruleBank` · 3. scene card in side panel · 4. 5-learner simulation | Nothing (a teacher reviews the child scenes) | same as today, $1.18–2.48 (+~$0.005 tokens) |
| 5 | Expressive avatar | `liveExpressive` | 1. Cara 4 + baseline style by age band · 2. code picks cue from the turn's verdict · 3. child calm/slow voice · 4. simulation + 3 calls | Nothing | same as today |
| 6 | Progress map | `liveProgressMap` | 1. map endpoint from stored evidence · 2. end-of-call map · 3. parents portal card · 4. Playwright EN/AR | Nothing (parents already see progress) | $0 extra (no model) |
| 7 | Camera | `liveCamera` (phase 1), `liveAttention` (phase 2) | 0. consent flag + screens (below) · 1. vision endpoint on our Modal deployment + 50-sample handwriting test · 2. "Show my work" button + snapshot · 3. reading and correcting · 4. phase 2 on-device signals | Cleared. Minors need the parent-consent record | +$0.01 (phase 1); +$0 on-device (phase 2) |
| 8 | Real-world lessons | `liveObjectLesson` | 1. object bank (adult and child lists) · 2. photo → object id from the list → lesson by code · 3. "words to review" in memory | Cleared. Minors need the parent-consent record | +$0.003 per photo |
| 9 | Small group calls | `liveGroup` | 1. LiveKit room + Anam plugin spike · 2. per-learner speech-to-text + turn manager · 3. per-learner records · 4. moderation + teacher observer (required for minors, checked by code) · 5. lobby UI | Cleared. Minors need the parent-consent record and a teacher observer | $1.61–3.00 per call = **$0.54–1.00 per learner** (3 learners) |

*Today's 10-minute call: Anam $1.10–2.40 + DeepSeek $0.08 = **$1.18–2.48** (`docs/tutor/AVATAR_TEST_REPORT.md`, branch `claude/tutor-lms-avatarcost-run`, 22 Nov 2026; Anam public prices of 21 Nov 2026).

### 4. Role-play lessons
- **Scene bank** (`roleplayScenes.ts` + `data/roleplay/SCENES.json`). Each scene has: setting (shop, airport, doctor, school office, restaurant), CEFR band, allowed age bands, tags from the existing `INTERESTS` list, the character, the learner's goal, the target outcomes (`ruleBank` ids), 6–10 fixed beats, allowed words and an end condition.
- **Children** get a separate fixed list (fruit shop, school library, lost pencil, café order…) built from Starters words in `kidsPack`. There is no doctor scene and no free topic.
- **Choosing a scene.** Code picks it from level, interests and scenes the learner has not had recently (`sessionMemory`). The model only voices the current beat.
- **Staying in the scene.** A post-check removes content from outside the scene and regenerates the reply once.
- **Errors.** Corrected inside the scene by a recast in character, as `realChat` does today. Each error is logged with its code and goes to `errorsToWorkOn`.
- **Debrief.** The rule line and a right/wrong pair from `ruleBank`, then one new item.

### 5. Expressive avatar
- **Cues chosen by code, not by the model.** The engine already knows the verdict:
  - right answer → `[happy]` or `[warm]`;
  - wrong answer → `[supportive]`;
  - new question → `[curious]`;
  - stuck → `[concerned]` then `[supportive]`.
- The cue goes inline in the talk stream (Anam voice), or over the data channel (`director_note_cue`) when ElevenLabs is the voice. `[angry]`, `[sad]`, `[distressed]` and `[laughter]` are blocked.
- **Children:** the `supportive` style, expressivity 0.3 (adults 0.5) and speed 0.85 where the voice allows it. Check the Egyptian Arabic voice's provider first.
- **What Anam cannot do** (we will not promise these):
  - look toward the drawing;
  - nod or point on command;
  - an exact facial expression;
  - change expressivity mid-call;
  - slow an ElevenLabs v4 voice;
  - any of this on a face that is not Cara 4.
- **Workaround for "look at the drawing":** put the panel on the side the face is turned to, pulse the panel when it opens, and have the tutor say "look at the picture".

### 6. Progress map
- **The map:** a path of the course's outcomes ordered by level (Pre-A1 → A1 → A2…). Each stop is marked *new*, *practising* or *secure*, with an arrow for each stop that moved in this call. No scores.
- **Built by code from stored evidence:**
  - the session summary (`summarizeTurns`);
  - `errorsToWorkOn` status;
  - independent right answers (`recordTutorOutcome`).
- **Where it shows:** on the call's end screen, and as a card on the parents' Progress screen, in the "This term" view, with the latest call under "This week". Arabic mirrors right to left. No transcript is shown to parents.

### 7. Camera (vision)
- **Phase 1: written work.**
  1. The learner presses **"Show my work"**, every time.
  2. A camera preview appears with an "on" light. One snapshot is taken and the camera track stops.
  3. The tutor says "Let me look…" straight away (a separate utterance), then reads the work and corrects one point with the usual method.
- **Phase 2: attention signals.**
  - The learner presses "Camera on for this call" each call; it is never remembered.
  - Signals are worked out **in the browser** with MediaPipe face landmarks: no face, looking away, head down. Only these signals reach the server, never frames.
  - Signals only slow the tutor or change the method: a pause, a check question, a shorter step.
  - We do **not** read emotions from the face. "Confused" comes from answers and speech, which the engine already does: stuck learners and `clarity`.
- **What is processed and kept:**
  - One JPEG at most 1024 px, kept in memory: browser → ENARA API → our Modal vision server.
  - Back comes text: what is written and the correction. The image buffer is then dropped.
  - The image is never written to disk, the database, logs or the transcript. Logs keep size and latency only, and prompt logging is off on the model server.
  - Anam never sees the camera; it only gets the tutor's text.
  - The text read from the page is kept like a typed answer (owner decision).
- **Minors:** included from the start (legal review approved, 27 Nov 2026). Before a child's first camera use, code checks the parent-consent record; without it the button explains that a parent or the school must allow it first.
- **Stored:** the text read from the written work is stored like a typed answer. The image is never stored.
- **No camera:** nothing else changes. The learner can type or say the answer instead. If Moodle blocks the camera, use "Open in a new tab", as for the microphone today. A camera error never ends the call.

**Vision options** (per frame: a low-res 512 px image, ~600 prompt tokens, 50 output tokens; per check: one 1024 px image, 300 output tokens; frame rate 0.2 fps = 12 frames/min):
| Option | Price (source, date) | Per frame | Per min at 0.2 fps | Per written-work check | Latency | Data leaves ENARA? |
|---|---|---|---|---|---|---|
| **DeepSeek V4.1 Flash with vision on our Modal endpoint** (same model family as the tutor) | ENARA's upper-bound metering $1/M in, $4/M out (r2 ledger, 22 Nov 2026); images ≤384 tokens on V4 vision (api-docs.deepseek.com, 21 Aug 2026; up to 1,024 reported) | $0.0012–0.0018 | **$0.014–0.022** | **$0.002–0.003** | est. 1.5–3 s (tutor's text turn is 1.13 s median today); to measure | **No** |
| Qwen3-VL-8B on Modal L4 | L4 $0.80/h (modal.com/pricing via third parties, Oct 2026) | ~$0.0001–0.0002 if busy | ~$0.002 + $0.80/h kept warm | ~$0.0005–0.0009 | no published figure; cold start unless warm | No |
| Gemini 3.7 Flash (API) | $0.375/$1.875 per M until 31 Dec 2026, then $0.75/$3.75; image 280 (low) / 1,120 (high) tokens (ai.google.dev pricing and media-resolution, read 27 Nov 2026) | ~$0.0009 (2027 price) | ~$0.010 | ~$0.0024 | time to first token 0.3–2.2 s (Vercel gateway; Google forum, 2026) | Yes (Google) |
| GPT-5.4 mini (API) | $0.75/$4.50 per M; image = 32 px patches × 1.2 (developers.openai.com pricing; OpenAI forum, read 27 Nov 2026) | ~$0.0009 | ~$0.011 | ~$0.0032 | not found; to measure | Yes (OpenAI) |
| DeepSeek API (not self-hosted) | $0.30/$1.20 per M at peak (propakistani.pk, 11 Sep 2026) | ~$0.0004–0.0006 | ~$0.005–0.007 | ~$0.0007 | not found | Yes (DeepSeek servers); not for minors |
| On-device face landmarks (phase 2) | free | $0 | **$0** | n/a | real time in the browser | **No** |

- **Recommendation:**
  - **Phase 1:** DeepSeek V4.1 Flash with vision on our own Modal deployment. No new vendor, no Anthropic, and no frame leaves ENARA.
  - **First check whether the current endpoint runs text-only.** The vLLM recipe has a text-only option that skips the vision encoder (recipes.vllm.ai, read 27 Nov 2026). If it does, deploy vision as a separate Modal app so the tutor is not disturbed.
  - **Gate:** at least 45 of 50 real Arabic and English handwriting samples read correctly. If DeepSeek fails, use Qwen3-VL-8B on Modal.
  - **Phase 2:** on-device only.
- **Caveat on prices:** Web prices are from search snippets, because the pricing pages were blocked from this session. Check them before budgeting.

### 8. Real-world lessons
- **Taking the photo:** one photo after a button press. The photo goes to the same vision endpoint as item 7.
- **Naming the object:**
  - The prompt gives a **closed list of object ids** from `objectBank.ts`: about 150 for adults and teens, about 60 Starters words for children (toys, fruit, school things, kitchen items).
  - The model answers with one id from the list or "unsure"; anything else counts as "unsure".
  - A person in the photo also counts as "unsure", and the tutor says: "Show me just the object."
- **The lesson:**
  - The side panel shows **ENARA's own drawing** of the object, not the photo.
  - The lesson is built by code from the bank: the word, a sentence frame and two tasks.
  - The word goes to a new "words to review" list, on the `spacedReview` steps.
- **Handling:** the photo is processed in memory and dropped, as in item 7. Only the object id is stored.

### 9. Small group calls (2–3 learners)
- **Approach: a LiveKit room with Anam's LiveKit plugin.**
  - The avatar joins the room as a participant, and all learners see one avatar video.
  - An ENARA agent (Node `@livekit/agents`) in each room:
    1. takes each learner's own audio track;
    2. runs per-learner speech-to-text (ElevenLabs Scribe realtime), so no guessing who spoke;
    3. passes the turn to the turn manager;
    4. calls the existing engine with **that learner's** context and memory;
    5. sends the reply through ElevenLabs Flash voice to Anam.
- **Rejected:**
  - **Our own mixing into the browser SDK.** Showing the video to everyone needs a media server anyway, which is LiveKit again.
  - **Anam Meetings** (Meet/Zoom/Teams). Third-party platforms with private chat and their own recording; the persona answers only when named; there is no per-learner control.
- **Turn-taking:**
  - The tutor names who answers ("Sara, your turn") and goes round in order.
  - Only the named learner's answer is graded.
  - Others use a "raise hand" button, and hands are queued.
  - Silence for 10 s → a hint, then the turn passes.
  - No learner takes more than 2 turns in a row; turns are balanced by count.
  - Peers answer each other only in tutor-set tasks (role-play pairs from item 4).
- **Each learner's record:** their own turns, errors and outcomes, plus the tutor turns addressed to them, written to their own record.
- **Safety:**
  - Audio only for learners; no learner video.
  - First names only. No chat, no direct messages, no contact details.
  - Groups are formed by the teacher, within the same school, class and age band.
  - Moderation: each transcribed turn is checked (EN/AR word list + `injectionCheck`). On a hit the tutor redirects; on a repeat the learner is muted and the teacher alerted.
  - Under 18: a teacher is present as a silent observer with mute and remove controls. Proposed as required; legal to confirm.
  - No recording: LiveKit egress is off; Anam does not record LiveKit sessions; ENARA keeps text per learner only.

## Costs per call for 7 and 9 (10-minute call)
| | Assumptions | Per call | Per learner |
|---|---|---|---|
| Today, 1:1 | Anam $0.11–0.24/min; DeepSeek ~$0.008/min (report, 22 Nov 2026) | $1.18–2.48 | $1.18–2.48 |
| 7, phase 1 | + 4 written-work checks × $0.002–0.003 (self-hosted DeepSeek) | $1.19–2.49 | same |
| 7, phase 2 on-device | no frames sent | $1.18–2.48 | same |
| 7, phase 2 server frames (not recommended) | 120 frames × $0.0012–0.0018 | $1.32–2.70 | same |
| 9, 3 learners | one Anam session $1.10–2.40 (we assume the LiveKit plugin costs the same per minute; **confirm with Anam**); voice 5 min × ~1,000 chars × $0.05/1k = $0.25 (elevenlabs.io/pricing/api, 27 Nov 2026); speech-to-text 3 × 10 min at $0.22–0.39/h = $0.11–0.20 (same page; figures conflict); DeepSeek 1.5× turns = $0.12; LiveKit 5 participants × 10 min × $0.0005 = $0.03, our agent self-hosted (livekit.com/pricing, 27 Nov 2026) | **$1.61–3.00** | **$0.54–1.00** |
| 9, 2 learners | same, 2 speech-to-text streams | $1.57–2.90 | $0.79–1.45 |

## Testing plan
- **Playwright on every new screen**, in EN and AR, on desktop and phone:
  - role-play start and scene card;
  - progress map at the end of a call and in the parents portal;
  - "Show my work": allow, deny, no camera, Moodle iframe;
  - object photo, including "unsure" and a person in the photo;
  - group lobby, turn light, raise hand, teacher observer.
- Anam and the camera are faked: Chromium's fake media device, fed a handwriting image.
- **One scripted avatar call per feature** on lms-test, using the existing `deploy/lms-test/avatarcost` harness with synthetic voices, 60 s each.
  - Each call costs 11–24 cents at paid prices (one free minute on the free plan). The vision part is under 1 cent. Six calls in total, plus one 3-voice group call.
- **5-learner simulation for items 4 and 5** against today's live tutor, switches off vs on, on the text path (DeepSeek only, about $0.01 per session; no Anam).
  - The five profiles: A1 adult, A2 teen, B1 adult, child aged 8, child aged 11. One of them is scripted to get stuck.
  - **Score 1, "would a teacher accept this reply"** (yes/no + reason). DeepSeek pre-screens and a teacher rates a sample. **Bar: ≥90% accepted.**
  - **Score 2, stuck learners:** 3+ failed tries on one point with no change of method, or the session ends with no unassisted right answer. **Bar: no worse than today.**
  - **Item 5 checks:** cue matches the verdict in ≥95% of turns, never a blocked cue, children always calm.

## Consent (new, for 7, 8 and 9)
- **Record:** one consent record per child per use: `camera` (items 7 and 8) and `groupCalls` (item 9). Fields: child, use, granted or withdrawn, who set it (parent or school admin), when. Every change is kept as history; withdrawing works at once.
- **Who needs it:** learners under 18 (age from the birth date the school entered; no birth date = treated as a minor). Adults do not.
- **Checked by code, on the server:** the vision endpoint, the object-photo endpoint and joining a group room refuse a minor without a current consent (a clear message, never a silent failure). The browser only shows or hides the button.
- **Screens:**
  - Parents portal → child → "Permissions": two switches (camera, group calls), each with a plain explanation of what is processed and that images are never stored. A parent with several children sets each child separately.
  - School admin → student → "Permissions": the same switches, for families without the portal (the school keeps the signed paper form; the screen records who set it and when).
  - Teacher view: a read-only badge per student (camera allowed / group calls allowed).
  - In the call: without consent, "Show my work", object photo and group join explain that a parent or the school must allow it first.
- **Switch:** `liveConsent` (ships before 7, required by 7, 8 and 9 for minors).
- **Tests:** Playwright for both screens in EN/AR; server tests that a minor without consent is refused on every path and that withdrawing works at once.

## Order
1. PR 0 `anamNoRecording` (+ check that our faces are Cara 4)
2. 4 role-play → 5 expressive → 6 progress map
3. `liveConsent` (consent record and screens)
4. 7 camera, phase 1 then phase 2 (adults and minors with consent)
5. 8 real-world lessons (adults and minors with consent)
6. 9 group calls (adults; minors with consent and a teacher observer)
