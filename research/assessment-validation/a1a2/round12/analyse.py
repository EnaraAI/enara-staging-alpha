# SIMULATION ONLY · DRAFT. Round 12 analysis: current vs fixed grader against the 3-scorer reference.
# Usage: python3 analyse.py  (reads answers.json, REFERENCE.json, GRADER_CURRENT.json, GRADER_FIXED.json; writes ANALYSIS.json)
import json,os,collections
H=os.path.dirname(os.path.abspath(__file__))
L=lambda f:json.load(open(f"{H}/{f}"))
ans={a["answerId"]:a for a in L("answers.json")}; ref={r["answerId"]:r["reference"] for r in L("REFERENCE.json")}
PRIMARY={"gap_fill","controlled_gap_fill","multiple_choice","controlled_choice"}
def qwk(a,b,K=3):
    n=len(a);O=[[0]*K for _ in range(K)]
    for x,y in zip(a,b):O[x][y]+=1
    ra=[sum(r) for r in O];cb=[sum(O[i][j] for i in range(K)) for j in range(K)]
    num=sum(((i-j)**2)*O[i][j] for i in range(K) for j in range(K)); den=sum(((i-j)**2)*ra[i]*cb[j]/n for i in range(K) for j in range(K))
    return 1-num/den if den else 1.0
ex=[k for k in ans if ans[k]["scoring"]=="exact"]; fr=[k for k in ans if ans[k]["scoring"]!="exact"]
def run(f):
    g={d["answerId"]:(d["score"] or 0) for d in L(f)}
    bt=collections.defaultdict(lambda:[0,0])
    for k in ex: bt[ans[k]["itemType"]][1]+=1; bt[ans[k]["itemType"]][0]+=g[k]==ref[k]
    pr=[k for k in ex if ans[k]["itemType"] in PRIMARY]; z=[k for k in ex if ref[k]==0]
    miss=[{"answerId":k,"itemId":ans[k]["itemId"],"itemType":ans[k]["itemType"],"answer":ans[k]["answer"],"ref":ref[k],"grader":g[k],"direction":"too lenient" if g[k]>ref[k] else "too strict"} for k in ex if g[k]!=ref[k]]
    fmiss=[{"answerId":k,"itemType":ans[k]["itemType"],"answer":ans[k]["answer"],"ref":ref[k],"grader":g[k]} for k in fr if g[k]!=ref[k]]
    agree=sum(g[k]==ref[k] for k in ex); pa=sum(g[k]==ref[k] for k in pr); fa=sum(g[k]==1 for k in z)
    nonEC=[m for m in miss if m["itemType"]!="error_correction"]
    return {"controlled":{"agree":agree,"n":len(ex),"pct":round(100*agree/len(ex),1)},
            "primary":{"agree":pa,"n":len(pr),"pct":round(100*pa/len(pr),1)},
            "by_type":{t:f"{a}/{n}" for t,(a,n) in sorted(bt.items())},
            "false_accepts":{"n":fa,"ref0":len(z),"rate_pct":round(100*fa/len(z),1)},
            "free_qwk":round(qwk([ref[k] for k in fr],[g[k] for k in fr]),3),"n_free":len(fr),
            "controlled_misses":miss,"controlled_misses_outside_ec":len(nonEC),"free_disagreements":fmiss}
cur=run("GRADER_CURRENT.json"); fix=run("GRADER_FIXED.json")
c95=fix["controlled"]["agree"]>=0.95*fix["controlled"]["n"]; p95=fix["primary"]["agree"]>=0.95*fix["primary"]["n"]
faok=fix["false_accepts"]["n"]*cur["false_accepts"]["ref0"]<=cur["false_accepts"]["n"]*fix["false_accepts"]["ref0"]; qok=fix["free_qwk"]>=0.80
only_ec=fix["controlled_misses_outside_ec"]==0
verdict="PASS" if c95 and faok and qok else ("PASS with error correction secondary (owner decision 1)" if (not c95) and only_ec and p95 and faok and qok else "FAIL")
out={"_label":"SIMULATION ONLY","current_grader":cur,"fixed_grader":fix,"checks":{"controlled_ge_95":c95,"primary_ge_95":p95,"fa_not_higher":faok,"free_qwk_ge_080":qok,"misses_only_error_correction":only_ec},"verdict":verdict}
json.dump(out,open(f"{H}/ANALYSIS.json","w"),indent=1,ensure_ascii=False)
for n,r in (("current",cur),("fixed",fix)):
    print(n,"controlled",r["controlled"],"primary",r["primary"],"FA",r["false_accepts"],"QWK",r["free_qwk"],r["by_type"])
print(out["checks"],"->",verdict)
