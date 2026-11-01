#!/bin/bash
# The camera RAW readers for a Mac build (Alex, 1 Nov: "read and convert BRAW and RED here too"). RoarPlay builds them
# against the makers' SDKs (Blackmagic RAW, RED R3D), which never enter a repository, and proves them on Alex's own
# clips; RoarMorph takes them ready from RoarPlay's newest Mac release: roarplay-braw with BlackmagicRawAPI.framework,
# roarplay-r3d with RED's redistributable libraries. All universal (Apple Silicon and Intel).
# Leaves them in build/helper for the app's Resources/bin (package.json mac extraResources).
set -euo pipefail
cd "$(dirname "$0")/.."
W=$(mktemp -d)
gh release download -R alexisdigipro-hub/roarplay -p 'RoarPlay-Mac-arm64.dmg' -D "$W"
hdiutil attach -nobrowse -readonly -mountpoint "$W/dmg" "$W/RoarPlay-Mac-arm64.dmg" >/dev/null
BIN="$W/dmg/RoarPlay.app/Contents/Resources/bin"
ls -la "$BIN"
rm -rf build/helper && mkdir -p build/helper
ditto "$BIN/roarplay-braw" build/helper/roarplay-braw
ditto "$BIN/BlackmagicRawAPI.framework" build/helper/BlackmagicRawAPI.framework
ditto "$BIN/roarplay-r3d" build/helper/roarplay-r3d
for f in "$BIN"/*.dylib; do ditto "$f" "build/helper/$(basename "$f")"; done
hdiutil detach "$W/dmg" -quiet || true
xattr -cr build/helper || true
lipo -info build/helper/roarplay-braw build/helper/roarplay-r3d
ls -la build/helper
# each one starts and answers (its makers' libraries load beside it): a clip that is not there is refused by name
for k in braw r3d; do
  OUT=$(build/helper/roarplay-$k info "$W/none.$k" 2>&1 || true); echo "roarplay-$k: $OUT"
  case "$OUT" in *"Not a"*|*"cannot be read"*) ;; *) echo "::error title=Camera reader::roarplay-$k did not start: $OUT"; exit 1 ;; esac
done
echo "camera readers: ok"
