# Mix: narration clips at their timeline offsets + music ducked under the voice -> AAC track muxed with the silent video.
import json, subprocess, sys, os
mode, silent, music, out = sys.argv[1:5]
plan = json.loads(subprocess.check_output(['node', 'render.js', 'plan', mode], cwd=os.path.dirname(os.path.abspath(__file__))))
here = os.path.dirname(os.path.abspath(__file__))
args = ['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', music]
fl = []
for i, a in enumerate(plan['audio']):
    args += ['-i', os.path.join(here, 'audio', a['id'] + '.wav')]
    ms = int(a['at'] * 1000)
    fl.append(f"[{i+2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms},volume=1.6[n{i}]")
n = len(plan['audio'])
fl.append(''.join(f'[n{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0[voice]")
fl.append("[voice]asplit=2[v1][v2]")
fl.append("[1:a]volume=0.32[m]")
fl.append("[m][v2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=600[md]")
fl.append(f"[v1][md]amix=inputs=2:normalize=0,alimiter=limit=0.9,atrim=0:{plan['total']}[aout]")
args += ['-filter_complex', ';'.join(fl), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
subprocess.check_call(args)
print('mixed', out)
