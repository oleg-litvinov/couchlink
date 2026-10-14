#!/usr/bin/env bash
# Build the Vega app from a mirror at a path without spaces.
# The Vega toolchain's manifest builder shells out with unquoted paths, so a
# checkout under e.g. "~/My Projects/" fails with "No such file or directory".
# Usage: scripts/build_vega.sh [Release|Debug]
set -euo pipefail
BUILD_TYPE="${1:-Release}"
SRC="$(cd "$(dirname "$0")/../app" && pwd)"
MIRROR="${VEGA_BUILD_DIR:-$HOME/.cache/couchlink-vega}"

mkdir -p "$MIRROR"
rsync -a --delete \
  --exclude 'apps/expo-multi-tv' --exclude 'apps/vega/build' --exclude '.git' \
  "$SRC/" "$MIRROR/"

cd "$MIRROR/apps/vega"
./node_modules/.bin/react-native build-vega --build-type "$BUILD_TYPE"

rm -rf "$SRC/apps/vega/build"
cp -R "$MIRROR/apps/vega/build" "$SRC/apps/vega/build"
find "$SRC/apps/vega/build" -name '*.vpkg' -print
