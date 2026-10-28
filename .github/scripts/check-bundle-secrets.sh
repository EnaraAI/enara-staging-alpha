#!/usr/bin/env bash
# Fails if a built frontend bundle contains anything that looks like a provider
# credential or a direct call to a provider that must go through the backend.
set -euo pipefail
dir="${1:-frontend/dist}"
patterns=(
  'sk-[A-Za-z0-9_-]{20,}'          # Anthropic / Beyond Presence style keys
  'sk_[A-Za-z0-9]{20,}'            # ElevenLabs keys
  'AIza[0-9A-Za-z_-]{30,}'         # Google API keys
  'AKIA[0-9A-Z]{16}'               # AWS access keys
  '-----BEGIN [A-Z ]*PRIVATE KEY'  # private keys
  'modal\.run'                     # old orchestrator, browser must not call it
  'api\.bey\.dev'                  # Beyond Presence API
  'api\.anthropic\.com'            # Claude API is backend-only
)
found=0
for p in "${patterns[@]}"; do
  if grep -rEn --include='*.js' --include='*.html' --include='*.css' -e "$p" "$dir" | cut -c1-200; then
    echo "::error::Possible secret or direct provider call in the frontend bundle: /$p/"
    found=1
  fi
done
exit $found
