#!/bin/bash
# ============================================================
# Remove a domain from the SMTP server (Postfix + OpenDKIM)
# Usage: ./remove-domain.sh <CONTAINER_NAME> <DOMAIN>
# ============================================================
set -e

CONTAINER="$1"
DOMAIN="$2"

if [ -z "$CONTAINER" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <CONTAINER_NAME> <DOMAIN>"
    exit 1
fi

echo "[remove-domain] Removing domain: ${DOMAIN} from container: ${CONTAINER}"

# 1. Remove from Postfix virtual_domains
echo "[remove-domain] Removing from virtual_domains..."
docker exec "$CONTAINER" bash -c "sed -i '/^${DOMAIN} /d' /etc/postfix/virtual_domains && postmap /etc/postfix/virtual_domains"

# 2. Remove from OpenDKIM TrustedHosts
echo "[remove-domain] Removing from TrustedHosts..."
docker exec "$CONTAINER" bash -c "sed -i '/^${DOMAIN}$/d' /etc/opendkim/TrustedHosts && sed -i '/^\*\.${DOMAIN}$/d' /etc/opendkim/TrustedHosts"

# 3. Remove from OpenDKIM KeyTable
echo "[remove-domain] Removing from KeyTable..."
docker exec "$CONTAINER" bash -c "sed -i '/default._domainkey.${DOMAIN}/d' /etc/opendkim/KeyTable"

# 4. Remove from OpenDKIM SigningTable
echo "[remove-domain] Removing from SigningTable..."
docker exec "$CONTAINER" bash -c "sed -i '/*@${DOMAIN}/d' /etc/opendkim/SigningTable"

# 5. Remove DKIM keys
echo "[remove-domain] Removing DKIM keys..."
docker exec "$CONTAINER" bash -c "rm -rf /etc/opendkim/keys/${DOMAIN}"

# 6. Reload services
echo "[remove-domain] Reloading Postfix..."
docker exec "$CONTAINER" postfix reload

echo "[remove-domain] Reloading OpenDKIM..."
docker exec "$CONTAINER" supervisorctl restart opendkim

echo "[remove-domain] Done. Domain ${DOMAIN} removed successfully."
