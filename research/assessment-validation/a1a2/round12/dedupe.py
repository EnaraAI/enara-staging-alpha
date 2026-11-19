# SIMULATION ONLY · DRAFT. Round 12: replace answers that repeat an earlier-round answer to the same item.
# Repeat = same itemId and same normalised answer (case, spaces, curly quotes, final punctuation) in any answers.json
# of rounds 1-11 (research/assessment-validation/a1a2/**/answers.json, round12 excluded). A repeat is replaced by an
# unused spare of the same scoring type, same outcome when possible; it keeps its R12 id. Usage: python3 dedupe.py
import json,glob,os,re
H=os.path.dirname(os.path.abspath(__file__)); A1=os.path.dirname(H)
norm=lambda t:re.sub(r"[.!?]+$","",re.sub(r"\s+"," ",str(t).replace("’","'").replace("‘","'").replace("“",'"').replace("”",'"')).strip().lower()).strip()
seen=set()
for f in glob.glob(f"{A1}/**/answers.json",recursive=True)+glob.glob(f"{A1}/answers.json"):
    if os.path.abspath(f).startswith(H): continue
    try: rows=json.load(open(f))
    except Exception: continue
    for a in rows if isinstance(rows,list) else []:
        if isinstance(a,dict) and a.get("itemId") and "answer" in a: seen.add((a["itemId"],norm(a["answer"])))
raw=json.load(open(f"{H}/answers_raw.json")); spares=json.load(open(f"{H}/spares.json"))
used=set(); out=[]; log=[]; inset=set()
for a in raw:
    k=(a["itemId"],norm(a["answer"]))
    if k not in seen and k not in inset: out.append(a); inset.add(k); continue
    pool=[s for s in spares if s["answerId"] not in used and s["scoring"]==a["scoring"] and (s["itemId"],norm(s["answer"])) not in seen|inset]
    pick=next((s for s in pool if s["outcomeId"]==a["outcomeId"]),pool[0] if pool else None)
    if not pick: raise SystemExit(f"no spare for {a['answerId']}")
    used.add(pick["answerId"]); inset.add((pick["itemId"],norm(pick["answer"])))
    new={**pick,"answerId":a["answerId"]}; out.append(new)
    log.append({"answerId":a["answerId"],"removed":a["answer"],"itemId":a["itemId"],"repeat_of_earlier_round":k in seen,"spare":pick["answerId"],"replacement":pick["answer"],"replacementItem":pick["itemId"]})
json.dump(out,open(f"{H}/answers.json","w"),indent=1,ensure_ascii=False)
json.dump({"_label":"SIMULATION ONLY","earlier_answers_indexed":len(seen),"replaced":log},open(f"{H}/DEDUPE.json","w"),indent=1,ensure_ascii=False)
print("indexed",len(seen),"replaced",len(log),"final",len(out))
