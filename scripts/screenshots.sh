#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
IMG_DIR="$REPO_ROOT/docs/img"
WATERMARK="${1:-sample}"

command -v magick >/dev/null || { echo "Error: imagemagick not found"; exit 1; }
[[ -d "$IMG_DIR" ]] || { echo "Error: $IMG_DIR not found"; exit 1; }
echo "Adding '$WATERMARK' watermark to screenshots in $IMG_DIR"

count=0
for img in "$IMG_DIR"/*.png; do
    if [[ -f "$img" ]]; then
        echo "Processing: $(basename "$img")"
        magick "$img" \
            -gravity NorthEast \
            -pointsize 24 \
            -fill 'rgba(255,255,255,0.7)' \
            -annotate +10+10 "$WATERMARK" \
            "$img"
        ((count++))
    fi
done

echo "Done. Watermarked $count image(s)."
