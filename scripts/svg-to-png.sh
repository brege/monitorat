#!/usr/bin/env bash

# This script converts SVG to PNG with rounded corners.
# Usage: svg-to-png.sh [input.svg] [output.ico]

set -euo pipefail
if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert is required but not installed." >&2
  exit 1
fi
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required but not installed." >&2
  exit 1
fi
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SVG="${1:-${SCRIPT_DIR}/../docs/img/favicon.svg}"
OUTPUT="${2:-${SCRIPT_DIR}/../www/favicon.ico}"
TMP_PNG=$(mktemp --suffix=.png)
trap 'rm -f "${TMP_PNG}"' EXIT
rsvg-convert -w 256 -h 256 "${SVG}" -o "${TMP_PNG}"
magick "${TMP_PNG}" \
  \( +clone -alpha off -fill white -colorize 100 -draw 'roundrectangle 0,0 255,255 30,30' \) \
  -compose DstIn -composite "${OUTPUT}"
