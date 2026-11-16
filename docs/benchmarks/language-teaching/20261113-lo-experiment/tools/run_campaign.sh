#!/bin/bash
# One LO campaign: tutoring split into SHARDS parallel harness processes (each its own throwaway
# database), merged, then the assessment stage. Needs the API key in a file: ENARA_KEY_FILE=/path/to/keyfile
# Usage: run_campaign.sh <campaign number> [shards=2]
set -u
N=$1; SHARDS=${2:-2}
: "${ENARA_KEY_FILE:?set ENARA_KEY_FILE to a file containing the API key}"
REPO="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$REPO/backend"
D=../docs/benchmarks/language-teaching/20261113-lo-experiment
R=$D/campaign_$N
mkdir -p $R/live
sha256sum src/services/languageTeachingContext.ts src/services/languageLearningState.ts src/controllers/tutor.controller.ts benchmarks/ltc-v2/run_fixture_v2.ts benchmarks/ltc-v2/lo_assess.ts $D/lo_cases.jsonl $D/lo_assessment_bank.json > $R/config_hashes.txt
echo "tutor start $(date -u +%T) shards=$SHARDS"
for k in $(seq 0 $((SHARDS-1))); do
  ids=$(python3 -c "import json;ids=[json.loads(l)['id'] for l in open('$D/lo_cases.jsonl')];print(','.join(ids[$k::$SHARDS]))")
  timeout 7000 npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode live --authorized-paid-run --cap 14 --key-file "$ENARA_KEY_FILE" --cases $D/lo_cases.jsonl --only "$ids" --out $R/live_s$k > $R/live_s$k.log 2>&1 &
done
wait
python3 - "$R" "$SHARDS" <<'PY'
import json,sys
R,S=sys.argv[1],int(sys.argv[2])
raw=[];att=[];st={'meteredUsd':0,'simulatedLearnerUsd':0,'providerAttempts':0,'stopped':[],'shards':S}
for k in range(S):
    d=f'{R}/live_s{k}'
    raw+=open(f'{d}/raw_results.jsonl').read().splitlines()
    att+=open(f'{d}/provider_attempts.jsonl').read().splitlines()
    s=json.load(open(f'{d}/run_status.json'))
    for x in ('meteredUsd','simulatedLearnerUsd','providerAttempts'): st[x]+=s.get(x,0)
    if s.get('stopped'): st['stopped'].append(s['stopped'])
open(f'{R}/live/raw_results.jsonl','w').write('\n'.join(l for l in raw if l)+'\n')
open(f'{R}/live/provider_attempts.jsonl','w').write('\n'.join(l for l in att if l)+'\n')
json.dump(st,open(f'{R}/live/run_status.json','w'),indent=1)
print('merged',len([l for l in raw if l]),'learners',round(st['meteredUsd'],2),'USD')
PY
timeout 6000 npx tsx benchmarks/ltc-v2/lo_assess.ts --cases $D/lo_cases.jsonl --bank $D/lo_assessment_bank.json --raw $R/live/raw_results.jsonl --out $R --cap 6 --samples 3 --concurrency 10 --key-file "$ENARA_KEY_FILE" > $R/assess.log 2>&1
echo "assess exit $? $(tail -1 $R/assess.log | cut -c1-200)"
echo done $(date -u +%T)
