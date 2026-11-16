import json,collections
ans={a["answerId"]:a for a in json.load(open("answers.json"))}
ref={r["answerId"]:r["reference"] for r in json.load(open("REFERENCE.json"))}
det={d["answerId"]:d for d in json.load(open("GRADER_DET.json"))}
sti={d["answerId"]:d for d in json.load(open("GRADER_STANDIN.json"))}
def qwk(a,b,K=3):
    n=len(a);O=[[0]*K for _ in range(K)]
    for x,y in zip(a,b):O[x][y]+=1
    ra=[sum(r) for r in O];cb=[sum(O[i][j] for i in range(K)) for j in range(K)]
    num=sum(((i-j)**2)*O[i][j] for i in range(K) for j in range(K))
    den=sum(((i-j)**2)*ra[i]*cb[j]/n for i in range(K) for j in range(K))
    return 1-num/den
def model(k):
    # production flow: deterministic first; misses/undecided go to stand-in
    if k in sti: return sti[k]["score"]
    return det[k]["score"] or 0
out={}
for name,f in [("deterministic",lambda k:det[k]["score"] or 0),("det+standin",model)]:
    ex=[k for k in ans if ans[k]["scoring"]=="exact"];fr=[k for k in ans if ans[k]["scoring"]!="exact"]
    agr=sum(f(k)==ref[k] for k in ex)/len(ex)
    q=qwk([ref[k] for k in fr],[f(k) for k in fr])
    dis=[{"answerId":k,"outcome":ans[k]["outcomeId"],"itemType":ans[k]["itemType"],"scoring":ans[k]["scoring"],"answer":ans[k]["answer"],"ref":ref[k],"grader":f(k),"note":(det[k].get("note") if name=="deterministic" else (sti.get(k) or det[k]).get("note"))} for k in ans if f(k)!=ref[k]]
    bytype=collections.defaultdict(lambda:[0,0])
    for k in ans: t=ans[k]["itemType"]+"/"+ans[k]["scoring"]; bytype[t][1]+=1; bytype[t][0]+=f(k)==ref[k]
    out[name]={"exact_agreement":round(agr,4),"n_exact":len(ex),"free_qwk":round(q,3),"n_free":len(fr),"by_type":{t:f"{a}/{n}" for t,(a,n) in bytype.items()},"disagreements":dis}
    print(name,"exact",round(agr*100,1),"qwk",round(q,3),"disagree",len(dis))
json.dump(out,open("AGREEMENT3.json","w"),indent=1)
