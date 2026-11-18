#!/usr/bin/env bash
# Points the two e2e hosts at this machine (Caddy publishes :443).
set -euo pipefail
for h in "${MOODLE_HOST:-moodle.school.test}" "${ENARA_HOST:-enara.tool.test}"; do
  grep -q " $h\$" /etc/hosts || echo "127.0.0.1 $h" | sudo tee -a /etc/hosts >/dev/null
done
