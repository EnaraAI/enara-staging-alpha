#!/usr/bin/env bash
# Keeps research experiments alive: every 20 s, for each config, if the run has no finished.json and no live process, resume it (runs are resumable:
# finished blocks are skipped). Usage: supervise.sh exp5b_main exp5c_main
REPO=/home/user/enara-staging-alpha; R=$REPO/research/deep-learning-simulation-v2; LOG=${SUP_LOG:-/tmp/supervisor.log}
while true; do
  alive=0
  for cfg in "$@"; do
    id=$(python3 -c "import json;print(json.load(open('$R/config/$cfg.json'))['experimentId'])")
    if [ -f "$R/runs/$id/finished.json" ]; then continue; fi
    alive=1
    if ! pgrep -f "cli.ts run .*$cfg.json" >/dev/null; then
      echo "$(date -u +%FT%TZ) restarting $cfg" >> "$LOG"
      (cd $REPO/backend && ENARA_KEY_FILE=/home/user/.enara_key setsid nohup npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/$cfg.json >> /tmp/${cfg}_run.log 2>&1 < /dev/null &)
    fi
  done
  [ $alive -eq 0 ] && { echo "$(date -u +%FT%TZ) all finished" >> "$LOG"; exit 0; }
  sleep 20
done
