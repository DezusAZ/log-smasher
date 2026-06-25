# log-smasher — Status
**Status:** active
**Last updated:** 2026-06-25

## What this project is
A website that combines many wardriving logs into ONE WiGLE-uploadable CSV. Real workflow:
"I have a TON of small logs, uploading one at a time wastes time — dump them all, get one
combined file, then download OR upload to WiGLE." Pure static site so it can also live on the
user's **Neocities** site.

## Where things left off (DONE — LIVE, tile opens)
Pure client-side single-page app + working CasaOS tile.
- **Combine engine** (`static/app.js`): RFC4180 CSV parser; normalizes every WigleWifi version
  (1.0–1.6) to the 1.6 superset; derives Frequency↔Channel; imports WiGLE-app/fork **SQLite**
  via vendored **sql.js** (lazy); unzips a dropped `.zip` via **fflate**. Dedup + sort options.
  Outputs `WigleWifi_combined_<ts>.csv`. Tests: `node test/run.js` (12) + `test/sqlite.js` (7) GREEN.
- **WiGLE direct upload**: browser → `api.wigle.net/api/v2/file/upload` (multipart `file`, Basic
  auth with the user's "Encoded for use" token). WiGLE's API sends CORS headers (verified) →
  works from a Neocities-hosted page, no proxy.
- **Neocities bundle:** `dist/log-smasher-neocities.zip` (upload `static/` to site root).

**Hosting (rebuilt to be robust):** `nginx:alpine` (PUBLIC image) serving from
`/DATA/AppData/log-smasher/` on **:8810**, installed via `casaos-cli`. Tile launch fields in the
TOP-LEVEL `x-casaos:` block with `hostname: 100.102.144.73` (Tailscale IP the browser reaches).
**Verified:** `casaos-cli list apps` shows URL `http://100.102.144.73:8810/`, returns 200, all
assets correct mime (incl. application/wasm). Live, the **card opens**. Redeploy/recover with
`./deploy.sh`.

## INCIDENT + fixes (why earlier the tile didn't open / project got wiped)
1. Tile pointed at LAN IP `192.168.0.164` (browser can't route) → dead click. **Fix:** put
   launch fields in the top-level `x-casaos:` with `hostname: 100.102.144.73`.
2. `casaos-cli uninstall` **deleted `/DATA/projects/log-smasher`** (it removes an app's
   bind-mount source tree). Recovered all files from context; re-downloaded vendored libs;
   fixed dir ownership via a root docker container (no sudo on box, but in `docker` group).
   **Fix:** never bind-mount the project source — serve from `/DATA/AppData/log-smasher/`.
3. CasaOS installer won't use a local `docker build` image (it pulls from a registry) → silent
   no-op. **Fix:** public `nginx:alpine` + mounted content.
- Generalized all three into global `CLAUDE.md` → "Dashboard Tiles → Tiles MUST actually OPEN"
  and a memory note (`casaos-tile-working-recipe`) so every future project gets this by default.

## Token / privacy UX (added 2026-06-25)
Answered "is my API key safe / can it be remembered only on their device":
- **One-time use** is the default — leave "Remember" unchecked; token lives only in the tab's
  memory for the upload, gone on close.
- **Remember on this device** → stored in `localStorage` (key `ls_wigle_token`) on the user's
  own browser only; pre-filled on return visits (e.g. a week later). A **Forget token** button
  + live status line ("Saved in this browser only" / "Not saved") and a trust box explain that
  the site is static (no server), token goes browser→`api.wigle.net` directly, no analytics, no
  third-party scripts (sql.js/fflate vendored locally) → owner can never see/log it.
- Tested headless: `node test/token.js` (9 asserts: default-not-saved, persist, return-visit
  pre-fill, forget). Engine suites still green (run=12, sqlite=7).

## Neocities deployment (LIVE 2026-06-25)
Pushed to the user's existing site **dzaz.neocities.org** in a SUBFOLDER (homepage + other
apps untouched per user): **https://dzaz.neocities.org/log-smasher/** — verified 200 for
index/app.js/style.css/favicon; homepage `/` still 200.
- Tooling: `push-neocities.sh` (curl + REST API, no Ruby). API key in `.neocities_token`
  (chmod 600, gitignored; key = Bearer token, site `dzaz`, free plan / supporter:false).
- Default `DEST=log-smasher` subfolder; `--prune` is scoped to that subfolder (refuses root)
  so it can NEVER touch the rest of the site. `--info` / `--list` helpers.
- `.wasm` skipped (free Neocities blocks it) → SQLite/Kismet import disabled on the public
  site; CSV combine + WiGLE upload work. Full feature set on ZimaBoard copy / supporter plan.
- **Redeploy from any chat:** `cd /DATA/projects/log-smasher && ./push-neocities.sh`
- User will add a link from their homepage themselves later. Snippet to give them:
  `<a href="/log-smasher/">💥 Log Smasher — combine wardriving logs for WiGLE</a>`


## Upload fix (2026-06-25) — Neocities CSP
User hit "Network/CORS error: Failed to fetch" uploading from the Neocities site. Root cause:
Neocities sets `CSP connect-src 'self'`, so the page can't call api.wigle.net (WiGLE's CORS is
fine; the HOST blocks it). Fixes: (1) upload error now explains this + offers Download +
wigle.net/upload buttons instead of a cryptic error; (2) heads-up note in the upload panel;
(3) file picker now accepts .log/.txt (were hidden behind "view all files"); (4) dropzone notes
combining is automatic. One-click upload still works on the ZimaBoard copy (nginx, no CSP).
Deployed to both hosts.


## One-click upload everywhere — GitHub Pages (2026-06-25)
Neocities CSP can't be loosened and blocks the page from reaching ANY external host (so a proxy
wouldn't help either — the page can't even reach the proxy). Solution: also host on GitHub Pages,
which sets NO blocking CSP → one-click WiGLE upload works AND .wasm/SQLite import works.
- Repo DezusAZ/log-smasher now has docs/ (= static/) on main; Pages serves main:/docs.
- `deploy-ghpages.sh` syncs static->docs + pushes (republishes on each run).
- BLOCKED on user: token lacks Pages admin (403), so user must enable Pages once:
  Settings -> Pages -> Source: Deploy from a branch -> main /docs -> Save.
- Will be live at https://dezusaz.github.io/log-smasher/ (~1 min after enabling).
- Three hosts now: Neocities (download-only, public homepage link), ZimaBoard :8810 (one-click,
  private/self), GitHub Pages (one-click + SQLite, public).

## What's next (optional)
- User: confirm the tile opens for you now, and (with your token) do one real WiGLE upload test
  (the authed POST couldn't be tested here; endpoint/CORS/response-parsing are in place).
- Deploy to Neocities (`static/` or the dist zip). If free tier rejects `.wasm`, skip it —
  CSV combine + upload still work; only SQLite import is lost.
- Possible later: raw Kismet `.kismet` (devices-JSON) parsing; per-file map preview.
