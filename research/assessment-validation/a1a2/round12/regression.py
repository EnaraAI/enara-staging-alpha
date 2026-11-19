# SIMULATION ONLY · DRAFT. Round 12 regression: compare two grader runs (before/after the E/F/no-slip change) on rounds 5-11.
# Usage: python3 regression.py <before_dir> <after_dir> [out.json]   (each dir holds round5.json ... round11.json from round8/rerun.ts)
import json,sys,os
H=os.path.dirname(os.path.abspath(__file__)); A1=os.path.dirname(H)
B,N=sys.argv[1],sys.argv[2]
load=lambda p:json.load(open(p))
sc=lambda d:{x["answerId"]:(x["score"] or 0) for x in d}
EC=lambda a:a["itemType"]=="error_correction"
out={"_label":"SIMULATION ONLY"}
# 1. Outside error correction: rounds 5-8 against each round's own reference; no NEW disagreement allowed.
newdis=[];fixed=[];rows={}
for r in (5,6,7,8):
    ans={a["answerId"]:a for a in load(f"{A1}/round{r}/answers.json")}
    ref={x["answerId"]:x["reference"] for x in load(f"{A1}/round{r}/REFERENCE.json")}
    b=sc(load(f"{B}/round{r}.json"));n=sc(load(f"{N}/round{r}.json"))
    non=[k for k in ans if not EC(ans[k])]
    changed=[k for k in non if b[k]!=n[k]]
    for k in non:
        if b[k]==ref[k] and n[k]!=ref[k]: newdis.append({"round":r,"answerId":k,"itemType":ans[k]["itemType"],"answer":ans[k]["answer"],"ref":ref[k],"before":b[k],"after":n[k]})
        if b[k]!=ref[k] and n[k]==ref[k]: fixed.append({"round":r,"answerId":k,"itemType":ans[k]["itemType"],"answer":ans[k]["answer"],"ref":ref[k],"before":b[k],"after":n[k]})
    rows[f"round{r}"]={"non_ec_n":len(non),"non_ec_agree_before":sum(b[k]==ref[k] for k in non),"non_ec_agree_after":sum(n[k]==ref[k] for k in non),"non_ec_changed":len(changed)}
out["outside_error_correction"]={"rows":rows,"new_disagreements":newdis,"fixed":fixed,"pass":not newdis}
# 2. Error correction against the 1A references: rounds 8-9 (round10/REFERENCE.json, 153) + round 11 (120) = 273.
ref1a={x["answerId"]:x["reference"] for x in load(f"{A1}/round10/REFERENCE.json")+load(f"{A1}/round11/REFERENCE.json")}
allans={};bs={};ns={}
for r in (8,9,11):
    for a in load(f"{A1}/round{r}/answers.json"): allans[a["answerId"]]=a
    bs.update(sc(load(f"{B}/round{r}.json")));ns.update(sc(load(f"{N}/round{r}.json")))
ec=[k for k in ref1a]
def stats(s):
    ag=sum(s[k]==ref1a[k] for k in ec);fa=sum(s[k]==1 and ref1a[k]==0 for k in ec);fr=sum(s[k]==0 and ref1a[k]==1 for k in ec);z=sum(ref1a[k]==0 for k in ec)
    return {"n":len(ec),"agree":ag,"pct":round(100*ag/len(ec),1),"too_lenient":fa,"too_strict":fr,"ref0":z}
chg=[{"answerId":k,"answer":allans[k]["answer"],"ref1A":ref1a[k],"before":bs[k],"after":ns[k]} for k in ec if bs[k]!=ns[k]]
out["error_correction_1A"]={"before":stats(bs),"after":stats(ns),"changed":chg}
# 3. Round 8 controlled items under 1A (post hoc, not evidence): R8 reference with EC rows from the 1A re-score.
ans8={a["answerId"]:a for a in load(f"{A1}/round8/answers.json")}
ref8={x["answerId"]:x["reference"] for x in load(f"{A1}/round8/REFERENCE.json")}
ref8.update({k:v for k,v in ref1a.items() if k.startswith("R8-")})
ex=[k for k in ans8 if ans8[k]["scoring"]=="exact"]
def r8(s):
    z=[k for k in ex if ref8[k]==0]
    return {"agree":f"{sum(s[k]==ref8[k] for k in ex)}/{len(ex)}","false_accepts":f"{sum(s[k]==1 for k in z)}/{len(z)}","misses":[{"answerId":k,"answer":ans8[k]["answer"],"ref":ref8[k],"grader":s[k]} for k in ex if s[k]!=ref8[k]]}
out["round8_controlled_1A_posthoc"]={"before":r8(sc(load(f"{B}/round8.json"))),"after":r8(sc(load(f"{N}/round8.json")))}
if len(sys.argv)>3: json.dump(out,open(sys.argv[3],"w"),indent=1,ensure_ascii=False)
o=out
print("outside EC: new disagreements",len(newdis),"| fixed",len(fixed),"|",{k:(v["non_ec_agree_before"],v["non_ec_agree_after"],v["non_ec_n"]) for k,v in rows.items()})
print("EC 1A before",o["error_correction_1A"]["before"],"\nEC 1A after ",o["error_correction_1A"]["after"])
print("R8 1A before",{k:v for k,v in o["round8_controlled_1A_posthoc"]["before"].items() if k!="misses"},"after",{k:v for k,v in o["round8_controlled_1A_posthoc"]["after"].items() if k!="misses"})
