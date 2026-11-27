# Synthetic learner speech for the live tutor checks (copied from deploy/lms-test/avatarcost on claude/tutor-lms-avatarcost-run).
# Piper neural TTS voices (en_US); the child-like voice is a female Piper voice
# shifted up in pitch (formants move with it) and slowed: it is SYNTHETIC, not a real child.
# Usage: python tts.py plan.json voices_dir out_dir call_id [call_id ...]
# Writes out_dir/<call>/s<n>.wav (48 kHz mono 16-bit, 0.25 s lead-in/out) and
# out_dir/<call>/call.wav (sentences joined with 12 s gaps, for the fake capture device).
import json, os, subprocess, sys, wave

from piper import PiperVoice

plan_path, voices_dir, out_dir, *ids = sys.argv[1:]
plan = json.load(open(plan_path))
calls = {c['id']: c for c in plan['calls']}
loaded = {}


def voice(name):
    if name not in loaded:
        model = os.path.join(voices_dir, os.path.basename(plan['voices'][name]['model']) + '.onnx')
        loaded[name] = PiperVoice.load(model)
    return loaded[name]


def ff(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


for cid in ids:
    call = calls[cid]
    vconf = plan['voices'][call['voice']]
    d = os.path.join(out_dir, cid)
    os.makedirs(d, exist_ok=True)
    parts = []
    for n, text in enumerate(call['sentences']):
        raw = os.path.join(d, f's{n}.raw.wav')
        with wave.open(raw, 'wb') as wf:
            voice(call['voice']).synthesize_wav(text, wf)
        out = os.path.join(d, f's{n}.wav')
        filt = []
        shift = vconf.get('childShift')
        if shift:
            ratio = 2 ** (shift['semitones'] / 12)
            # Resample-style shift: pitch and formants go up together (child-like), then tempo back down and slower.
            sr = wave.open(raw).getframerate()
            filt.append(f'asetrate={int(sr * ratio)},aresample=48000,atempo={1 / ratio * shift["tempo"]:.4f}')
        filt.append('aresample=48000,adelay=250:all=1,apad=pad_dur=0.25')
        ff('-i', raw, '-af', ','.join(filt), '-ac', '1', '-ar', '48000', '-sample_fmt', 's16', out)
        os.remove(raw)
        parts.append(out)
    # One file for --use-file-for-fake-audio-capture: sentences with 12 s silences.
    lst = os.path.join(d, 'list.txt')
    gap = os.path.join(d, 'gap.wav')
    ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '12', '-sample_fmt', 's16', gap)
    with open(lst, 'w') as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(gap)}'\nfile '{os.path.abspath(p)}'\n")
        f.write(f"file '{os.path.abspath(gap)}'\n")
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(d, 'call.wav'))
    os.remove(lst)
    os.remove(gap)
    print(f'{cid}: {len(parts)} sentences, voice {call["voice"]}')
