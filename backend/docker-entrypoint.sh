#!/bin/sh
set -eu

# Docker creates a named volume as root. Grant the unprivileged Node process
# ownership at container start, then immediately drop root privileges.
mkdir -p /app/data
chown -R node:node /app/data
exec su-exec node "$@"
