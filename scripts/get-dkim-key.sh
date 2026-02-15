#!/bin/bash
# ============================================================
# Get the DKIM public key for a domain from the SMTP server
# Usage: ./get-dkim-key.sh <CONTAINER_NAME> <DOMAIN>
# ============================================================

CONTAINER="$1"
DOMAIN="$2"

if [ -z "$CONTAINER" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <CONTAINER_NAME> <DOMAIN>"
    exit 1
fi

docker exec "$CONTAINER" cat "/etc/opendkim/keys/${DOMAIN}/default.txt" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "Error: DKIM key not found for domain ${DOMAIN}" >&2
    exit 1
fi
