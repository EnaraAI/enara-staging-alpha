# SIMULATION ONLY
# SIMULATION ONLY · DRAFT. Agreement of a grader run with a reference: exact items (% agreement) and free/transfer (QWK).
import json,sys,collections
ans={a["answerId"]:a for a in json.load(open(sys.argv[1]))}
ref={r["answerId"]:r["reference"] for r in json.load(open(sys.argv[2]))}
det={d["answerId"]:(d["score"] or 0) for d in json.load(open(sys.argv[3]))}
def qwk(a,b,K=3):
    n=len(a);O=[[0]*K for _ in range(K)]
    for x,y in zip(a,b):O[x][y]+=1
    ra=[sum(r) for r in O];cb=[sum(O[i][j] for i in range(K)) for j in range(K)]
    num=sum(((i-j)**2)*O[i][j] for i in range(K) for j in range(K))
    den=sum(((i-j)**2)*ra[i]*cb[j]/n for i in range(K) for j in range(K))
    return 1-num/den if den else 1.0
ex=[k for k in ans if ans[k]["scoring"]=="exact"];fr=[k for k in ans if ans[k]["scoring"]!="exact"]
agr=sum(det[k]==ref[k] for k in ex)/len(ex) if ex else None
q=qwk([ref[k] for k in fr],[det[k] for k in fr]) if fr else None
dis=[{"answerId":k,"itemType":ans[k]["itemType"],"scoring":ans[k]["scoring"],"answer":ans[k]["answer"],"ref":ref[k],"grader":det[k]} for k in ans if det[k]!=ref[k]]
bt=collections.defaultdict(lambda:[0,0])
for k in ans: t=ans[k]["itemType"]; bt[t][1]+=1; bt[t][0]+=det[k]==ref[k]
out={"exact_agreement":agr,"n_exact":len(ex),"free_qwk":q,"n_free":len(fr),"by_type":{t:f"{a}/{n}" for t,(a,n) in bt.items()},"disagreements":dis}
if len(sys.argv)>4: json.dump(out,open(sys.argv[4],"w"),indent=1)
print(f"exact {sum(det[k]==ref[k] for k in ex)}/{len(ex)} = {agr*100:.1f}%" if ex else "exact n/a", "| free QWK", round(q,3) if q is not None else "n/a", f"(n={len(fr)})", "| disagreements", len(dis))
