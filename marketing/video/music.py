# Original background music for the ENARA film, composed in code (no samples): soft ambient pads over a slow chord loop
# (Cmaj9 - Am9 - Fmaj9 - Gsus), a gentle sub pulse and a light shimmer. Owned by ENARA; no third-party licence.
import sys, numpy as np, soundfile as sf
SR = 44100
dur = float(sys.argv[1]); out = sys.argv[2]
t = np.arange(int(dur * SR)) / SR
def hz(n): return 440 * 2 ** ((n - 69) / 12)
chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 55, 57, 62]]
bar = 8.0
mix = np.zeros_like(t)
for k in range(int(np.ceil(dur / bar)) + 1):
    c = chords[k % 4]; s = k * bar; e = s + bar + 2.0
    m = (t >= s) & (t < e); tt = t[m] - s
    env = np.minimum(1, tt / 2.5) * np.minimum(1, np.maximum(0, (e - s - tt) / 2.5))
    for j, n in enumerate(c):
        f = hz(n + 12)
        v = 0.5 * np.sin(2 * np.pi * f * tt) + 0.18 * np.sin(2 * np.pi * 2 * f * tt + 0.3) + 0.08 * np.sin(2 * np.pi * (f * 1.003) * tt)
        mix[m] += env * v * (0.11 if j else 0.16)
    sub = hz(c[0] - 12)
    pulse = 0.5 + 0.5 * np.cos(2 * np.pi * tt / 2.0)
    mix[m] += env * 0.10 * np.sin(2 * np.pi * sub * tt) * pulse
sh = 0.02 * np.sin(2 * np.pi * hz(88) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 5.3))
mix += sh
# gentle low-pass (one-pole) and stereo widening
a = 0.12; y = np.zeros_like(mix); acc = 0.0
for i in range(len(mix)): acc += a * (mix[i] - acc); y[i] = acc
fade = np.minimum(1, t / 3) * np.minimum(1, (dur - t) / 4)
y = y * fade; y /= np.max(np.abs(y)) + 1e-9; y *= 0.6
d = int(0.012 * SR); left = y; right = np.concatenate([np.zeros(d), y[:-d]])
sf.write(out, np.stack([left, right], 1), SR)
print('ok', dur)
