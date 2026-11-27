# Expressive avatar: screenshots (lms-test)

Each PNG is the avatar's own video frame about 1 s after the cue (switch off: the same moment of the reply). Names: `<who>--<moment>--<on|off>.png`. "on"/"off" is liveExpressive for that call (a CI-only per-call test override). Learners speak with synthetic voices (Piper). Newest run first.

## Drawing workaround (PR 3), from the E2E run (no paid call)
Anam's Free plan minutes for this period are used up, so these two come from E2E 48 (the same call window, a voice-only call with a fake tutor):
- `e2e--drawing-panel-left--on.png`: switch on, a face turned to the viewer's left (Anne): the drawing opens on the left, pulses with "Look here · انظر هنا", and the captions show the tutor saying "Look at the picture." No cue tag anywhere.
- `e2e--drawing-panel-right--off.png`: switch off: the drawing opens on the right as before, no pulse.

## Run 46042501033 (2026-11-27T17:54 UTC)

### adult (hassan.shaker), switch on
Call: speech=avatar, style band=adult, Cara 4.1 Express=true, slower voice=false, voice=-. Problems: pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.

| Moment | File | Learner said | Cue sent | Anam applied | Tutor said (heard from its audio) |
|---|---|---|---|---|---|
| idle | `adult--idle--on.png` | | | | |
| new-question | `adult--new-question--on.png` | Hello. Can you give me one short question about this lesson, please? | - | - |  |
| wrong | `adult--wrong--on.png` | She get up at seven and she go to school. | supportive | - | Good try, and the sentence order is right. Look at the verb after she, in both parts, and check the ending. I'm putting the sentence on the screen so you can se |
| stuck1 | `adult--stuck1--on.png`<br>`adult--stuck1-then--on.png` | I don't know. | concerned, supportive | concerned, supportive | That's fine, it's a small step. Look at the screen and find the two verbs, get and go. When we talk about she, those verbs usually need a little ending. Try say |
| stuck2 | `adult--stuck2--on.png`<br>`adult--stuck2-then--on.png` | I don't know. I am confused. | concerned, supportive | supportive, supportive | That's okay, let's slow down. Just one verb for now: get. When the person is she, that verb takes an s at the end. So try just this part on its own, she and get |
| right | `adult--right--on.png` | She gets up at seven and she goes to school. | happy, curious | curious | Yes, that's right now. Both verbs have the s after she. Next, write one sentence about a person you know and their daily routine. |
| drawing | `adult--drawing--on.png`<br>`adult--drawing-panel--on.png` | Can you draw a picture for me, please? | - | curious |  |

### child (khaled.nasser), switch on
Call: speech=avatar, style band=child, Cara 4.1 Express=true, slower voice=true, voice=ELEVENLABS eleven_flash_v2_5. Problems: pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.; pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.; pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.

| Moment | File | Learner said | Cue sent | Anam applied | Tutor said (heard from its audio) |
|---|---|---|---|---|---|
| idle | `child--idle--on.png` | | | | |
| new-question | `child--new-question--on.png` | Hello. Can you give me one short question about this lesson, please? | - | - | Hello! It's good to see you again. Let's warm up with a quick one. Tell me one thing you do every morning. |
| wrong | `child--wrong--on.png` | She get up at seven and she go to school. | supportive | supportive | Good try! You have the routine right, and the picture on the screen shows it. But after she, the action word needs an s at the end. Say your sentence again. |
| stuck1 | `child--stuck1--on.png`<br>`child--stuck1-then--on.png` | I don't know. | concerned, supportive | concerned, supportive | That's okay, it's a small step. Look at the screen: "The cat run fast" is wrong, but "The cat runs fast" is right. The wrong one is missing the s. Compare that  |
| stuck2 | `child--stuck2--on.png`<br>`child--stuck2-then--on.png` | I don't know. I am confused. | concerned, supportive | concerned, supportive | That's okay, let's take it slowly. Look at the screen: the cat runs. The s goes on the action word. Now find the action words in your sentence, get up and go. T |
| right | `child--right--on.png` | She gets up at seven and she goes to school. | warm, curious | curious | That's right! She gets up and she goes, both with the s. Well done for sticking with it.

Write a sentence about a boy called Omar and his morning. |
| drawing | `child--drawing--on.png`<br>`child--drawing-panel--on.png` | Can you draw a picture for me, please? | curious | curious | I'm putting a picture on the screen of Omar's morning. Look at it, then write your sentence about Omar. Remember the s on the action words, like gets and goes.  |

### adult (hassan.shaker), switch off
Call: speech=avatar, style band=-, Cara 4.1 Express=false, slower voice=false, voice=-. Problems: pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.; pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.; pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.

| Moment | File | Learner said | Cue sent | Anam applied | Tutor said (heard from its audio) |
|---|---|---|---|---|---|
| idle | `adult--idle--off.png` | | | | |
| new-question | `adult--new-question--off.png` | Hello. Can you give me one short question about this lesson, please? | - | - | Sure. Here's one for you. Say one sentence about someone in your family and their morning, using he or she. For example, my brother gets up at six and has break |
| wrong | `adult--wrong--off.png` | She get up at seven and she go to school. | - | - | I've put a small picture on the screen showing a morning routine. Your sentence has the right idea, but look at the verb after she. With he or she, the verb nee |
| stuck1 | `adult--stuck1--off.png`<br>`adult--stuck1-then--off.png` | I don't know. | - | - | That's fine, it's a small thing. Listen to the difference. I get up at seven. She gets up at seven. The verb takes an s sound after she. Now say your sentence a |
| stuck2 | `adult--stuck2--off.png`<br>`adult--stuck2-then--off.png` | I don't know. I am confused. | - | - |  |
| right | `adult--right--off.png` | She gets up at seven and she goes to school. | - | - | That's right. She gets up and she goes both have the s sound now. Next, tell me one thing a person you know does every evening, using he or she. |
| drawing | `adult--drawing--off.png`<br>`adult--drawing-panel--off.png` | Can you draw a picture for me, please? | - | - | I'm putting a picture on the screen for you now. It shows a morning routine, someone getting up, having breakfast and going to school. Have a look at it and tel |

### child (khaled.nasser), switch off
Call: speech=avatar, style band=-, Cara 4.1 Express=false, slower voice=false, voice=-. Problems: pageerror Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.

| Moment | File | Learner said | Cue sent | Anam applied | Tutor said (heard from its audio) |
|---|---|---|---|---|---|
| idle | `child--idle--off.png` | | | | |
| new-question | `child--new-question--off.png` | Hello. Can you give me one short question about this lesson, please? | - | - |  |
| wrong | `child--wrong--off.png` | She get up at seven and she go to school. | - | - | Good try! The words are in the right order. But after she, the action word needs a small ending. Look at the picture on the screen, then say your sentence again |
| stuck1 | `child--stuck1--off.png`<br>`child--stuck1-then--off.png` | I don't know. | - | - | That's okay, it's a small thing. Look at the screen: "The cat run fast" is wrong, but "The cat runs fast" is right. The ending is missing in the first one. Now  |
| stuck2 | `child--stuck2--off.png`<br>`child--stuck2-then--off.png` | I don't know. I am confused. | - | - |  |
| right | `child--right--off.png` | The cat run fast | - | - |  |
| drawing | `child--drawing--off.png`<br>`child--drawing-panel--off.png` | Can you draw a picture for me, please? | - | - |  |

Files in this run: 40
