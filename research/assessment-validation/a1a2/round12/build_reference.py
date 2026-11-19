# SIMULATION ONLY · DRAFT. Round 12 reference: majority of 3 scorers; a three-way split takes the middle score.
import json,collections
S=[{d["answerId"]:d["score"] for d in json.load(open(f"scorer_S{i}.json"))} for i in (1,2,3)]
ans=json.load(open("answers.json"))
ref=[];agree3=0;ties=[]
for a in ans:
    k=a["answerId"];v=[s[k] for s in S]
    c=collections.Counter(v).most_common()
    if c[0][1]==3: agree3+=1
    if c[0][1]==1: ties.append(k); m=sorted(v)[1]
    else: m=c[0][0]
    ref.append({"answerId":k,"reference":m,"scores":v})
json.dump(ref,open("REFERENCE.json","w"),indent=1)
print("all3",agree3,"ties",ties)
