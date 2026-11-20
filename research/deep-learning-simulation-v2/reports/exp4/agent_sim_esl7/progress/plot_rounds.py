import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d=json.load(open('rounds.json')); E=d['err']; Q=d['q']
ARMS=[('BASE','Today\'s engine (BASE)','#2a78d6','o'),('NEW','New engine (NEW)','#eb6834','s'),('PP','Plain strong prompt (P+)','#1baf7a','^')]
INK='#0b0b0b'; INK2='#52514e'; GRID='#e4e3df'; SURF='#fcfcfb'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.edgecolor':GRID,'axes.labelcolor':INK2,'xtick.color':INK2,'ytick.color':INK2,'figure.facecolor':SURF,'axes.facecolor':SURF})
OUT='/home/user/enara-staging-alpha/esl7-progress/'
# 1. progress
fig,axs=plt.subplots(1,2,figsize=(12,5.2),gridspec_kw={'width_ratios':[5,2]},dpi=200,sharey=True)
for ax,(title,keys,labels) in zip(axs,[('Outcome 1, session 1 (rounds 1–5)',['start1','1','2','3','4','5'],['Start','R1','R2','R3','R4','R5']),('Outcome 2, session 1 (round 6)',['start2','6'],['Start','R6'])]):
    xs=list(range(len(keys)))
    for a,name,c,m in ARMS:
        ys=[E[f'{a}|{k}']*100 for k in keys]
        ax.plot(xs,ys,color=c,lw=2,marker=m,ms=8,markeredgecolor=SURF,markeredgewidth=2,label=name,solid_capstyle='round')
        dy={'BASE':-7,'NEW':7,'PP':0}[a] if len(xs)==2 else 0
        ax.annotate(f'{a if a!="PP" else "P+"} {ys[-1]:.0f}%',(xs[-1],ys[-1]),xytext=(8,dy),textcoords='offset points',va='center',color=INK,fontsize=10)
    ax.set_xticks(xs,labels); ax.set_xlim(-0.3,len(xs)-1+0.9 if len(xs)>2 else 1.9)
    ax.set_title(title,loc='left',color=INK,fontsize=12)
    ax.grid(axis='y',color=GRID,lw=1); ax.set_axisbelow(True)
    for s in ['top','right','left']: ax.spines[s].set_visible(False)
axs[0].set_ylabel('Chance of making the target error (%)')
axs[0].set_ylim(0,80)
fig.suptitle('ESL7 simulation: learner progress inside the sessions, after each finished round',x=0.01,ha='left',color=INK,fontsize=14,fontweight='bold')
fig.text(0.01,0.905,'72 simulated learners per arm. Lower is better. This is the learner model\'s state during tutoring, not a test score (tests come after rounds 10 and 20).',color=INK2,fontsize=10)
axs[0].legend(loc='lower left',frameon=False,fontsize=10)
fig.tight_layout(rect=(0,0,1,0.88)); fig.savefig(OUT+'esl7_rounds_progress.png'); plt.close(fig)
# 2. leaks per round
import numpy as np
fig,ax=plt.subplots(figsize=(12,4.6),dpi=200)
R=[1,2,3,4,5,6]; w=0.26
for i,(a,name,c,m) in enumerate(ARMS):
    ys=[Q[f'{a}|{r}']['leak'] for r in R]
    xs=np.array(R)+(i-1)*w
    ax.bar(xs,ys,width=w-0.03,color=c,label=name)
    for x,y in zip(xs,ys): ax.annotate(str(y),(x,y),xytext=(0,3),textcoords='offset points',ha='center',fontsize=9,color=INK)
ax.set_xticks(R,[f'Round {r}' for r in R]); ax.set_ylabel('Tutor replies (of 72)')
ax.grid(axis='y',color=GRID); ax.set_axisbelow(True)
for s in ['top','right','left']: ax.spines[s].set_visible(False)
ax.legend(frameon=False,loc='upper center',ncol=3,fontsize=10,bbox_to_anchor=(0.5,1.08)); ax.set_ylim(0,17)
fig.suptitle('ESL7 simulation: replies that gave the answer before 2 real tries, per round',x=0.01,ha='left',color=INK,fontsize=14,fontweight='bold')
fig.text(0.01,0.885,'Fewer is better. Two-task replies were 0 in every round for all three arms.',color=INK2,fontsize=10)
fig.tight_layout(rect=(0,0,1,0.87)); fig.savefig(OUT+'esl7_rounds_answer_leaks.png'); plt.close(fig)
print('ok')
