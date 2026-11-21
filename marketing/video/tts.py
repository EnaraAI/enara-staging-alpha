# Narration for the ENARA school film: one WAV per scene from narration.json, with an open TTS model whose licence allows commercial use
# (Kokoro-82M, Apache-2.0). Writes out/<id>.wav (24 kHz mono) and out/durations.json. Marketing only; no product code.
import json, os, sys
import numpy as np, soundfile as sf
from kokoro import KPipeline

cfg = json.load(open(os.path.join(os.path.dirname(__file__), 'narration.json')))
os.makedirs('out', exist_ok=True)
pipe = KPipeline(lang_code='a')
dur = {}
for s in cfg['scenes']:
    parts = [a for _, _, a in pipe(s['text'], voice=cfg['voice'], speed=cfg['speed'])]
    audio = np.concatenate([np.asarray(p, dtype=np.float32) for p in parts])
    sf.write(f"out/{s['id']}.wav", audio, 24000)
    dur[s['id']] = round(len(audio) / 24000, 3)
    print(s['id'], dur[s['id']])
json.dump(dur, open('out/durations.json', 'w'), indent=1)
print('TOTAL', round(sum(dur.values()), 1))
