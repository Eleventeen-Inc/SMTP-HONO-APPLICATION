#!/bin/bash
# ============================================================
# Add a domain to the SMTP server (Postfix + OpenDKIM)
# Usage: ./add-domain.sh <CONTAINER_NAME> <DOMAIN>
# ============================================================
set -e

CONTAINER="$1"
DOMAIN="$2"

if [ -z "$CONTAINER" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <CONTAINER_NAME> <DOMAIN>"
    exit 1
fi

echo "[add-domain] Adding domain: ${DOMAIN} to container: ${CONTAINER}"

# 1. Add to Postfix virtual_domains
echo "[add-domain] Adding to virtual_domains..."
docker exec "$CONTAINER" bash -c "echo '${DOMAIN} OK' >> /etc/postfix/virtual_domains && postmap /etc/postfix/virtual_domains"

# 2. Create mail directory
echo "[add-domain] Creating mail directory..."
docker exec "$CONTAINER" bash -c "mkdir -p /var/mail/vhosts/${DOMAIN} && chown -R vmail:vmail /var/mail/vhosts/${DOMAIN}"

# 3. Add to OpenDKIM TrustedHosts
echo "[add-domain] Adding to TrustedHosts..."
docker exec "$CONTAINER" bash -c "echo '${DOMAIN}' >> /etc/opendkim/TrustedHosts && echo '*.${DOMAIN}' >> /etc/opendkim/TrustedHosts"

# 4. Add to OpenDKIM KeyTable
echo "[add-domain] Adding to KeyTable..."
docker exec "$CONTAINER" bash -c "echo 'default._domainkey.${DOMAIN} ${DOMAIN}:default:/etc/opendkim/keys/${DOMAIN}/default.private' >> /etc/opendkim/KeyTable"

# 5. Add to OpenDKIM SigningTable
echo "[add-domain] Adding to SigningTable..."
docker exec "$CONTAINER" bash -c "echo '*@${DOMAIN} default._domainkey.${DOMAIN}' >> /etc/opendkim/SigningTable"

# 6. Generate DKIM key
echo "[add-domain] Generating DKIM key..."
docker exec "$CONTAINER" bash -c "mkdir -p /etc/opendkim/keys/${DOMAIN} && opendkim-genkey -b 2048 -s default -d ${DOMAIN} -D /etc/opendkim/keys/${DOMAIN}/ && chown -R opendkim:opendkim /etc/opendkim/keys/${DOMAIN} && chmod 600 /etc/opendkim/keys/${DOMAIN}/default.private"

# 7. Reload services
echo "[add-domain] Reloading Postfix..."
docker exec "$CONTAINER" postfix reload

echo "[add-domain] Reloading OpenDKIM..."
docker exec "$CONTAINER" supervisorctl restart opendkim

echo "[add-domain] Done. Domain ${DOMAIN} added successfully."
