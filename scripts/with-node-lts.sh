#!/usr/bin/env bash
# Prefer Homebrew Node 22 LTS when available (avoids Angular's odd-version warning).
set -euo pipefail

NODE22_BIN="/opt/homebrew/opt/node@22/bin"
if [[ ! -x "${NODE22_BIN}/node" ]]; then
  NODE22_BIN="/usr/local/opt/node@22/bin"
fi

if [[ -x "${NODE22_BIN}/node" ]]; then
  export PATH="${NODE22_BIN}:${PATH}"
fi

exec "$@"
