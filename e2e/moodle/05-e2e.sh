#!/bin/sh
# ENARA e2e: trust Caddy's local root CA (server-to-server https to the tool
# and to Moodle itself), and make moodledata writable for Apache.
set -e
CA=/ca/root.crt
i=0
while [ ! -s "$CA" ] && [ $i -lt 60 ]; do sleep 1; i=$((i+1)); done
cp "$CA" /usr/local/share/ca-certificates/caddy-e2e-root.crt
update-ca-certificates >/dev/null 2>&1 || update-ca-certificates
mkdir -p /var/www/moodledata
chown -R www-data:www-data /var/www/moodledata
echo "e2e: Caddy root CA trusted"
