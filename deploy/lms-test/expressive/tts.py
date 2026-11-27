# Synthetic learner speech for the expressive-avatar screenshot run (deploy/lms-test/expressive), made on demand:
# the learner's next words depend on what the tutor just asked. Piper neural TTS voices (en_US); the child-like voice
# is a female Piper voice shifted up in pitch and slowed: SYNTHETIC, not a real child.
# Protocol: one JSON object per stdin line {"text", "voice", "out"}; writes a 48 kHz mono 16-bit WAV and prints "ok <out>".
# Usage: python tts.py voices_dir
import json, os, subprocess, sys, wave

from piper import PiperVoice

voices_dir = sys.argv[1]
VOICES = {
    'adult': {'model': 'en_US-ryan-medium'},
    'child': {'model': 'en_US-amy-medium', 'shift': {'semitones': 5.5, 'tempo': 0.9}},
}
loaded = {}


def voice(name):
    if name not in loaded:
        loaded[name] = PiperVoice.load(os.path.join(voices_dir, VOICES[name]['model'] + '.onnx'))
    return loaded[name]


for line in sys.stdin:
    if not line.strip():
        continue
    req = json.loads(line)
    name, out = req['voice'], req['out']
    raw = out + '.raw.wav'
    with wave.open(raw, 'wb') as wf:
        voice(name).synthesize_wav(req['text'], wf)
    filt = []
    shift = VOICES[name].get('shift')
    if shift:
        ratio = 2 ** (shift['semitones'] / 12)
        sr = wave.open(raw).getframerate()
        filt.append(f'asetrate={int(sr * ratio)},aresample=48000,atempo={1 / ratio * shift["tempo"]:.4f}')
    filt.append('aresample=48000,adelay=250:all=1,apad=pad_dur=0.4')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', ','.join(filt), '-ac', '1', '-ar', '48000', '-sample_fmt', 's16', out], check=True)
    os.remove(raw)
    print(f'ok {out}', flush=True)
