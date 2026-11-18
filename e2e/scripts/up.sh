#!/usr/bin/env bash
# Starts the e2e stack and provisions Moodle. Needs: MOODLE_SRC (a Moodle
# checkout), the image enara-e2e:local, e2e/.env (scripts/gen-env.sh) and
# /etc/hosts entries for the two hosts (scripts/hosts.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${MOODLE_SRC:?MOODLE_SRC must point at a Moodle checkout}"
rm -rf .run && mkdir -p .run
t0=$(date +%s)
docker compose up -d --wait postgres mongo enara-spa caddy
docker compose up ca
docker compose up -d moodle enara
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .run/caddy-root.crt

echo "Waiting for Apache in the moodle container"
for i in $(seq 1 120); do
  if docker compose exec -T moodle sh -c 'curl -s -o /dev/null http://127.0.0.1/ 2>/dev/null'; then break; fi
  sleep 2
done

echo "Installing Moodle ($(cd "$MOODLE_SRC" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown))"
docker compose exec -T -u www-data moodle php admin/cli/install_database.php \
  --agree-license --lang=en --adminuser=admin --adminpass="$E2E_MOODLE_PASSWORD" \
  --adminemail=admin@school.test --fullname="ENARA E2E Moodle" --shortname=e2e --summary="Fake test site" \
  --supportemail=admin@school.test > .run/moodle-install.log 2>&1 || { tail -40 .run/moodle-install.log; exit 1; }
t1=$(date +%s)
docker compose exec -T -u www-data moodle php /e2e/e2e_cli.php provision --password="$E2E_MOODLE_PASSWORD" | tail -1 | tee .run/moodle-provision.json
docker compose exec -T -u www-data moodle php /e2e/e2e_cli.php version | tail -1 | tee .run/moodle-version.json

echo "Waiting for ENARA"
docker compose up -d --wait enara
curl --noproxy '*' -fsS --cacert .run/caddy-root.crt "https://${ENARA_HOST:-enara.tool.test}/health"; echo
# Owner rule: the e2e stack never sends real email (no Resend key; LMS emails
# on only in capture mode: rendered and recorded, never sent).
if docker compose exec -T enara sh -c 'test -n "${RESEND_API_KEY:-}" || { test "${LMS_EMAILS_ENABLED:-}" = true && test "${LMS_EMAIL_CAPTURE:-}" != true; }'; then
  echo "ERROR: ENARA has an email key, or LMS emails on without capture; the e2e stack must never send email" >&2; exit 1
fi
echo "email sending: off (no RESEND_API_KEY; LMS emails captured only)"
# The LTI key set is served by the API, not the image's SPA fallback.
curl --noproxy '*' -fsS --cacert .run/caddy-root.crt "https://${ENARA_HOST:-enara.tool.test}/.well-known/jwks.json" | grep -q '"keys"' \
  || { echo "ERROR: /.well-known/jwks.json is not the LTI key set" >&2; exit 1; }
curl --noproxy '*' -fsS --cacert .run/caddy-root.crt -o /dev/null -w "moodle login page %{http_code}\n" "https://${MOODLE_HOST:-moodle.school.test}/login/index.php"
echo "{\"moodleInstallSeconds\": $((t1-t0)), \"upSeconds\": $(( $(date +%s)-t0 ))}" > .run/up-timings.json
cat .run/up-timings.json
