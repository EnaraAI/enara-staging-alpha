# SIMULATION ONLY. NO API. ESL6 power analysis (writes config/agent_sim_esl6/POWER.json). Usage: python3 -I src/offline/esl6_power.py <out.json>
import json,random,math,statistics as st,sys
from collections import defaultdict
R='/home/user/enara-staging-alpha/research/deep-learning-simulation-v2/'
rows=json.load(open(R+'reports/exp4/agent_sim_esl5/POST.json'))
by=defaultdict(lambda:defaultdict(dict))
for r in rows: by[r['learner']][r['arm']][r['rep']]=r
EF=sorted(l for l in by if by[l]['PP'][1]['explicitFirst'])
avg=lambda l,a:(by[l][a][1]['controlled']+by[l][a][2]['controlled'])/2
d=[avg(l,'LE')-avg(l,'PP') for l in EF]
sd5=st.stdev(d); mean5=st.mean(d)
nz=json.load(open(R+'reports/exp4/agent_sim_esl6/validation/NOISE_RESULT.json'))['perLearner']
nd=[v['run2']['delayed']-v['run1']['delayed'] for v in nz.values()]
sdpair=math.sqrt(sum(x*x for x in nd)/len(nd))  # SD of run2-run1 around 0
sig_n=sdpair/math.sqrt(2)
sdinf=math.sqrt(sd5**2+sig_n**2)
cen=[(x-mean5)/sd5 for x in d]
def pval(x,rng,B):
    o=abs(sum(x))-1e-12;h=0
    for _ in range(B):
        if abs(sum(v if rng.random()<.5 else -v for v in x))>=o:h+=1
    return (h+1)/(B+1)
def simpow(n,sd,reps=2000,B=2000,seed=6):
    rng=random.Random(seed);hit=0
    for _ in range(reps):
        x=[0.06+sd*cen[rng.randrange(len(cen))] for _ in range(n)]
        if pval(x,rng,B)<0.05:hit+=1
    return hit/reps
z=1.959964+0.841621
out={'_label':'SIMULATION ONLY','source':'ESL5 per-learner LE - P+ controlled diffs (explicit-first, mean of 2 reps, n=108, reports/exp4/agent_sim_esl5/POST.json)',
 'sdDiffESL5':round(sd5,4),'meanDiffESL5':round(mean5,4),
 'noise':{'source':'reports/exp4/agent_sim_esl6/validation/NOISE_RESULT.json, delayed score, run2-run1 per learner (30)','sdRun2MinusRun1':round(sdpair,4),'perRunJudgingSD':round(sig_n,4),'addedVarianceForArmDiffOfRepMeans':'2 arms x sigma^2/2 = sigma^2'},
 'sdDiffUsed':round(sdinf,4),'sdFormula':'sqrt(sdDiffESL5^2 + perRunJudgingSD^2)','target':0.06,'alpha':0.05,'twoSided':True,
 'normalApproxNfor80':math.ceil((z*sdinf/0.06)**2),
 'normalApprox':{},'simPower':{},
 'simMethod':'2000 simulated studies per n; per-learner diffs = 0.06 + sdDiffUsed x (ESL5 diff standardised, resampled); Monte Carlo sign-flip 2000 draws per study; seed 6',
 'simPowerAtESL5SD':{}}
from math import erf
Phi=lambda x:.5*(1+erf(x/math.sqrt(2)))
for n in (120,150,180,200):
    out['normalApprox'][str(n)]=round(Phi(0.06*math.sqrt(n)/sdinf-1.959964),3)
    out['simPower'][str(n)]=simpow(n,sdinf)
    out['simPowerAtESL5SD'][str(n)]=simpow(n,sd5)
    print(n,out['normalApprox'][str(n)],out['simPower'][str(n)],out['simPowerAtESL5SD'][str(n)],flush=True)
json.dump(out,open(sys.argv[1],'w'),indent=1)
print(json.dumps(out,indent=1))
