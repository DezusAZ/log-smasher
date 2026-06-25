#!/bin/bash
# Push the Log Smasher site to Neocities via the REST API (curl only — no Ruby/gem needed).
#
#   API key  : read from /DATA/projects/log-smasher/.neocities_token (chmod 600, gitignored)
#   Source   : ./static  (the exact files that make up the site)
#   Dest     : a SUBDIRECTORY on the site, set by DEST (default "log-smasher"). This keeps the
#              rest of your Neocities site (homepage + other apps) untouched. DEST="" = site root.
#
# Usage:
#   ./push-neocities.sh              # upload static/ -> <site>/log-smasher/ (skips .wasm on free)
#   DEST=tools ./push-neocities.sh   # upload to a different subfolder
#   DEST="" ./push-neocities.sh      # upload to the site ROOT (overwrites homepage — careful!)
#   ALLOW_WASM=1 ./push-neocities.sh # also upload .wasm (Neocities SUPPORTER plan only)
#   ./push-neocities.sh --list       # list ALL files currently on the site
#   ./push-neocities.sh --info       # show site info (name, URL, size, hits)
#   ./push-neocities.sh --prune      # upload, then delete remote files under DEST/ no longer local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/static"
TOKENFILE="${NEOCITIES_TOKEN_FILE:-/DATA/projects/neocities-deploy/.neocities_token}"  # shared device-wide key
API="https://neocities.org/api"
DEST="${DEST-log-smasher}"                      # default subfolder; DEST="" means site root
PREFIX=""; [ -n "$DEST" ] && PREFIX="${DEST%/}/" # e.g. "log-smasher/"

[ -s "$TOKENFILE" ] || { echo "❌ No API key in $TOKENFILE"; echo "   See README → 'Connect to Neocities'."; exit 1; }
KEY="$(tr -d ' \t\r\n' < "$TOKENFILE")"
auth=(-H "Authorization: Bearer $KEY")

case "${1:-push}" in
  --info) curl -s "${auth[@]}" "$API/info"; echo; exit 0 ;;
  --list) curl -s "${auth[@]}" "$API/list"; echo; exit 0 ;;
esac

# ---- collect files under static/ ----
cd "$SRC"
mapfile -d '' FILES < <(find . -type f -print0)
upargs=(); uploaded=0; skipped=()
for f in "${FILES[@]}"; do
  rel="${f#./}"
  if [[ "$rel" == *.wasm && "${ALLOW_WASM:-0}" != "1" ]]; then skipped+=("$rel"); continue; fi
  upargs+=(-F "${PREFIX}${rel}=@$rel"); uploaded=$((uploaded+1))
done

echo "📤 Uploading $uploaded file(s) -> ${PREFIX:-<root>} on Neocities…"
resp="$(curl -s "${auth[@]}" "${upargs[@]}" "$API/upload")"
echo "   → $resp"
if [ "${#skipped[@]}" -gt 0 ]; then
  echo "⏭  Skipped ${#skipped[@]} .wasm file(s) (not allowed on free Neocities): ${skipped[*]}"
  echo "   SQLite/Kismet .db import will be disabled on the site; CSV combine + WiGLE upload still work."
  echo "   Supporter plan? run  ALLOW_WASM=1 ./push-neocities.sh"
fi

# ---- optional prune: delete remote files UNDER DEST/ that no longer exist locally ----
if [ "${1:-}" = "--prune" ]; then
  if [ -z "$PREFIX" ]; then
    echo "🛑 Refusing to --prune at the site ROOT (would risk your whole site). Set a DEST subfolder."
  else
    echo "🧹 Pruning remote files under ${PREFIX} not present locally…"
    curl -s "${auth[@]}" "$API/list" \
      | grep -oE '"path": *"[^"]+"' | sed 's/.*"path": *"//;s/"$//' \
      | while read -r rpath; do
          [ -z "$rpath" ] && continue
          case "$rpath" in "$PREFIX"*) ;; *) continue ;; esac   # only inside our subfolder
          local_rel="${rpath#$PREFIX}"
          if [ ! -f "$SRC/$local_rel" ]; then
            echo "   deleting $rpath"
            curl -s "${auth[@]}" -d "filenames[]=$rpath" "$API/delete" >/dev/null
          fi
        done
  fi
fi
echo "✅ Done.  → https://dzaz.neocities.org/${PREFIX}"
