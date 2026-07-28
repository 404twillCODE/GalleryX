#!/bin/bash
# Clears macOS Gatekeeper quarantine so an unsigned GalleryX download can open.
# Usage: ./scripts/fix-macos-gatekeeper.sh [/path/to/GalleryX.app]

set -euo pipefail

APP="${1:-/Applications/GalleryX.app}"

if [ ! -d "$APP" ]; then
  echo "GalleryX not found at: $APP"
  echo "Drag GalleryX.app into Applications first, or pass the full path:"
  echo "  $0 /path/to/GalleryX.app"
  exit 1
fi

echo "Removing quarantine attributes from: $APP"
xattr -cr "$APP"
echo "Done. You can open GalleryX from Applications now."
open "$APP"
