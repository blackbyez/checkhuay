#!/usr/bin/env bash
# ============================================================
# generate-icons.sh — SVG → PNG via headless Chrome
# Outputs into project root (used by manifest.json + og:image).
# ============================================================
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "✗ Chrome not found at $CHROME"
  echo "  Install Chrome or edit \$CHROME in this script."
  exit 1
fi

render() {
  local svg="$1" out="$2" w="$3" h="$4"
  echo "  → $out (${w}×${h})"
  "$CHROME" \
    --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 \
    --default-background-color=00000000 \
    --window-size="${w},${h}" \
    --screenshot="$DIR/$out" \
    "file://$DIR/$svg" \
    > /dev/null 2>&1
}

echo "Generating icons from assets/*.svg..."
render "assets/icon.svg"     "icon-512.png"          512  512
render "assets/icon.svg"     "icon-192.png"          192  192
render "assets/icon.svg"     "apple-touch-icon.png"  180  180
render "assets/og-image.svg" "og-image.png"         1200  630

echo ""
echo "✓ Done. Files generated in project root:"
ls -la "$DIR"/*.png 2>/dev/null | awk '{print "  " $9, "(" $5 " bytes)"}'
echo ""
echo "Next: node build.js && wrangler pages deploy dist ..."
