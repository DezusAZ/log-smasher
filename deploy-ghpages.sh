#!/bin/bash
# Publish the site to GitHub Pages (https://dezusaz.github.io/log-smasher/).
# GitHub Pages sets NO restrictive CSP, so one-click WiGLE upload works there (unlike Neocities),
# and .wasm is served (so SQLite import works too).
#
# Pages serves from  main:/docs , so this syncs static/ -> docs/ and pushes.
# One-time: enable Pages in the repo (Settings -> Pages -> Source: Deploy from branch ->
#           Branch: main  /docs -> Save). After that, every run of this script republishes.
set -euo pipefail
cd "$(dirname "$0")"
export GIT_CONFIG_GLOBAL=/DATA/.claude/gitconfig

rm -rf docs && mkdir docs
cp -a static/. docs/
touch docs/.nojekyll              # serve files verbatim (no Jekyll mangling of vendor/, etc.)

git add -A
if git diff --cached --quiet; then echo "no changes to publish"; exit 0; fi
git commit -q -m "Publish to GitHub Pages $(date '+%Y-%m-%d %H:%M')"
git push -q origin main
echo "pushed. GitHub Pages will rebuild in ~1 min → https://dezusaz.github.io/log-smasher/"
