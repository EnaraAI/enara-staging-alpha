#!/usr/bin/env bash
# Stops the e2e stack and removes its volumes (every run starts clean).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down -v --remove-orphans
