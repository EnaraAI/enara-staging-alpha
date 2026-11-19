import json,glob,os,sys,math,random,statistics as st
D=sys.argv[1]
PP={'articles':[['W1','W2'],['W1'],['W1'],['W1','W2']],'copula':[['W1','W2'],['W1'],['W1','W2'],['W1','W2']],'thirdS':[['W1'],['W1','W2'],['W1','W2'],['W1']]}
pe=lambda s:0.8 if s>=2 else 0.4 if s==1 else 0.05
def items(k): return [math.prod(1-pe(k['s'][w]) for w in pr) for pr in PP[k['form']]]
data={}
for f in glob.glob(D+'/*.json'):
    d=json.load(open(f)); L=d['learnerIdx']
    if L>=608: continue
    t=d['turns']
    st_after={r:(t[r]['stateBefore'] if r<len(t) else d['state']) for r in (1,2,3,4,5,6,7,8,9,10)}
    assert len(t)==10
    for r,k in st_after.items():
        ps=items(k); data.setdefault((L,r),{}).setdefault(d['arm'],[]).append((sum(ps)/4, sum(p*(1-p) for p in ps)/16))
print('round  meanLE  meanPP  diff   sd(exp diff)  sd(+item noise)')
res={}
for r in range(1,11):
    diffs=[];var=[]
    for L in sorted({k[0] for k in data}):
        a=data[(L,r)]; le=a['LE']; pp=a['PP']
        diffs.append(st.mean(x[0] for x in le)-st.mean(x[0] for x in pp))
        var.append(sum(x[1] for x in le)/4+sum(x[1] for x in pp)/4)
    m=st.mean(diffs); sd=st.pstdev(diffs); sdt=math.sqrt(sd**2+st.mean(var))
    LE=st.mean(st.mean(x[0] for x in data[(L,r)]['LE']) for L in {k[0] for k in data}); P=LE-m
    res[r]=(m,sdt); print(f'{r:5d}  {LE:.3f}  {P:.3f}  {m:+.3f}  {sd:.3f}  {sdt:.3f}')
json.dump(res,open(os.path.dirname(D)+'/rounds.json','w'))
