#!/usr/bin/env bash
# Generates every secret and test password for one run into e2e/.env
# (git-ignored). Nothing comes from repository secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
rnd() { openssl rand -hex "$1"; }
{
  echo "JWT_SECRET=$(rnd 32)"
  echo "INGEST_HMAC_SECRET=$(rnd 32)"
  echo "CRON_SECRET=$(rnd 32)"
  echo "MAINTENANCE_TOKEN=$(rnd 32)"
  echo "LMS_KEK=$(openssl rand -base64 32)"
  # Test-only passwords (fake accounts in throwaway containers).
  echo "E2E_ENARA_PASSWORD=Enara-$(rnd 8)"
  echo "E2E_MOODLE_PASSWORD=Moodle-$(rnd 8)!A1"
} > .env
chmod 600 .env
echo "e2e/.env written"
