#!/bin/bash
# Simulator validity check: groups B, C, D for all 120 simulated learners (no tutor). ENARA_KEY_FILE required.
set -u
: "${ENARA_KEY_FILE:?set ENARA_KEY_FILE}"
REPO="$(cd "$(dirname "$0")/../../../../.." && pwd)"; cd "$REPO/backend"
D=../docs/benchmarks/language-teaching/20261113-lo-experiment
mkdir -p $D/validity && echo '{"caseId":"none","turns":[]}' > $D/validity/empty_raw.jsonl
npx tsx benchmarks/ltc-v2/lo_assess.ts --cases $D/lo_cases.jsonl --bank $D/lo_assessment_bank.json --raw $D/validity/empty_raw.jsonl --out $D/validity --cap 4 --samples 3 --concurrency 12 --key-file "$ENARA_KEY_FILE" > $D/validity/validity.log 2>&1
tail -1 $D/validity/validity.log | cut -c1-200
