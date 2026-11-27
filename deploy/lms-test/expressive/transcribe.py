# What the tutor actually said in each recorded reply (persona audio from the call), to check that no cue word was
# spoken aloud. faster-whisper tiny.en on CPU. Usage: python transcribe.py out_dir  (reads audio/*.webm, writes spoken.json)
import glob, json, os, sys

from faster_whisper import WhisperModel

out_dir = sys.argv[1]
model = WhisperModel('tiny.en', device='cpu', compute_type='int8')
result = {}
for path in sorted(glob.glob(os.path.join(out_dir, 'audio', '*.webm'))):
    segments, _ = model.transcribe(path, beam_size=1, language='en')
    result[os.path.basename(path)[:-5]] = ' '.join(s.text.strip() for s in segments).strip()
json.dump(result, open(os.path.join(out_dir, 'spoken.json'), 'w'), indent=1, ensure_ascii=False)
print(f'transcribed {len(result)} replies')
