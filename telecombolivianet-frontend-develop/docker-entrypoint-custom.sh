#!/bin/sh
set -e
echo "=== [DEBUG] /etc/resolv.conf ==="
cat /etc/resolv.conf
echo "================================="
exec /docker-entrypoint.sh "$@"
