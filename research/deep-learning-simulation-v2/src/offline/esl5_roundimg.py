# SIMULATION ONLY. Per-round progress image for ESL5 (descriptive, not the pre-registered analysis).
import json, glob, os, sys
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
D = sys.argv[1]; R = int(sys.argv[2])
tp = os.path.join(D, 'round_images', 'TRAJ.json')
traj = json.load(open(tp)) if os.path.exists(tp) else {}
m = {'LE': [], 'PP': []}; leaks = {'LE': 0, 'PP': 0}; rel = 0
for f in glob.glob(os.path.join(D, 'sessions', '*.json')):
    s = json.load(open(f)); a = s['arm']
    t = s['turns'][R - 1] if len(s['turns']) >= R else None
    if t: leaks[a] += t.get('earlyLeakFinal', 0) > 0; rel += a == 'LE' and bool(t.get('answerReleased'))
    if s['state']['band'] != 'B2': m[a].append(s['state']['s']['W1'] + s['state']['s']['W2'])
traj[str(R)] = {a: round(sum(v) / len(v), 3) for a, v in m.items()} | {'leakLE': leaks['LE'], 'leakPP': leaks['PP'], 'releasesLE': rel}
json.dump(traj, open(tp, 'w'), indent=1)
rs = sorted(int(k) for k in traj); le = [traj[str(r)]['LE'] for r in rs]; pp = [traj[str(r)]['PP'] for r in rs]
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2), dpi=150)
ax[0].plot([0] + rs, [3.5] + le, 'o-', color='#2a6fdb', label='A0+LE+esl5'); ax[0].plot([0] + rs, [3.5] + pp, 's-', color='#d9822b', label='P+')
ax[0].set_xlim(0, 10.3); ax[0].set_ylim(0, 3.7); ax[0].set_xlabel('round'); ax[0].set_ylabel('mean W1+W2 strength (lower is better)'); ax[0].legend(frameon=False); ax[0].grid(alpha=.3)
ax[0].set_title('Wrong-belief strength, explicit-first learners (n=108)', fontsize=10)
x = range(len(rs)); w = .38
ax[1].bar([i - w/2 for i in x], [traj[str(r)]['leakLE'] for r in rs], w, color='#2a6fdb', label='early leaks A0+LE+esl5')
ax[1].bar([i + w/2 for i in x], [traj[str(r)]['leakPP'] for r in rs], w, color='#d9822b', label='early leaks P+')
ax[1].plot(list(x), [traj[str(r)]['releasesLE'] for r in rs], 'k^--', label='releases after 2 tries (A0+LE+esl5)')
ax[1].set_xticks(list(x)); ax[1].set_xticklabels(rs); ax[1].set_xlabel('round'); ax[1].set_ylabel('turns'); ax[1].legend(frameon=False, fontsize=8); ax[1].set_title('Leaks and answer releases per round', fontsize=10)
gap = round(pp[-1] - le[-1], 2)
fig.suptitle(f'SIMULATION ONLY - ESL5 round {R}: A0+LE+esl5 {le[-1]:.2f} vs P+ {pp[-1]:.2f} (gap {gap:+.2f}, positive favours A0+LE+esl5)', fontsize=10)
fig.tight_layout(); out = os.path.join(D, 'round_images', f'round{R}.png'); fig.savefig(out); print(out, traj[str(R)])
