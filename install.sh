#!/usr/bin/env sh
# One-command installer for Omni Router (Linux / macOS).
# Usage: ./install.sh [--force]

set -e
root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
args=""
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then
    args="$args --force"
  fi
done
# shellcheck disable=SC2086
node "$root/scripts/install-preset.mjs" $args