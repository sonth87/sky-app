#!/usr/bin/env bash
# Rebuilds device-layout's library bundle and packs it into .vendor/ so
# packages/device-shell can install it as `file:../../.vendor/*.tgz`.
#
# device-layout is a separate repo (reused across other projects — see
# docs/architecture/overview.md §6 "Quyết định đã chốt"), not a workspace
# member here. Re-run this after pulling device-layout changes.
set -euo pipefail

DEVICE_LAYOUT_DIR="${DEVICE_LAYOUT_DIR:-$HOME/PROJECTS/device-layout}"
VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.vendor"

if [ ! -d "$DEVICE_LAYOUT_DIR" ]; then
  echo "device-layout not found at $DEVICE_LAYOUT_DIR (set DEVICE_LAYOUT_DIR to override)" >&2
  exit 1
fi

echo "Building device-layout library bundle..."
(cd "$DEVICE_LAYOUT_DIR" && pnpm build:lib)

echo "Packing into $VENDOR_DIR ..."
rm -f "$VENDOR_DIR"/sonth87-device-layout-*.tgz
(cd "$DEVICE_LAYOUT_DIR" && pnpm pack --pack-destination "$VENDOR_DIR")

echo "Done. Run 'pnpm install' in sky-app to pick up the new tarball."
