# 💥 Log Smasher

Combine a pile of wardriving logs into **one** [WiGLE](https://wigle.net)-uploadable CSV —
then download it, or upload it straight to WiGLE with your API token.

**100% client-side.** All parsing/merging happens in your browser. Your logs and location
data never touch a server — except the combined file *you* choose to upload to WiGLE
(which goes browser → WiGLE directly over HTTPS).

## What it does

- Drop **many** files at once (or a whole folder, or a `.zip` of logs).
- Accepts:
  - WiGLE CSV — every version (`WigleWifi-1.0` … `1.6`), mixed freely. `.csv` / `.wiglecsv`
  - WiGLE-app / fork **SQLite** databases — `.sqlite` / `.sqlite3` / `.db`
  - Kismet `.kismet` *if* it uses a `network` table (otherwise export wiglecsv first)
- Normalizes everything to the current **`WigleWifi-1.6`** column set (the superset WiGLE expects),
  deriving `Frequency`↔`Channel` for older logs that lack one.
- Options: remove exact duplicate rows · collapse to one row per network (keep strongest signal) · sort by first-seen time.
- **Download** the combined `WigleWifi_combined_<timestamp>.csv`, or **Upload to WiGLE** directly.

## Use it

- **Hosted on the ZimaBoard:** http://100.102.144.73:8810/ (CasaOS tile "Log Smasher").
- **Run anywhere static:** it's just static files — open `static/index.html`, or serve `static/`.

## Deploy to Neocities

It's a pure static site, so Neocities hosts it as-is.

1. Upload everything inside **`static/`** to your Neocities site (drag the files into the
   Neocities file manager, or upload `dist/log-smasher-neocities.zip` and unzip there).
   Make sure `index.html` lands at the **site root**.
2. Done — visit your site.

**Note on the `.wasm` file:** `vendor/sql-wasm.wasm` powers the SQLite reader and is loaded
*lazily* — only when you drop a `.sqlite`/`.kismet` file. The core flow (combine CSVs →
download / upload) needs **no wasm**. If Neocities' free tier rejects `.wasm` uploads, just
skip that one file: CSV combining and WiGLE upload still work; only SQLite import is disabled.

## Connect to Neocities (push from project chats)

The site is pushed to Neocities with the REST API over `curl` — `./push-neocities.sh`.

**One-time setup — get your Neocities API key:**
- **From the dashboard:** log in at neocities.org → your site → **Settings** (Manage Site
  Settings) → **API Key** section → "I understand, show my API key" → copy it.
- **Or fetch it via curl** (returns `{"api_key":"..."}`):
  ```
  curl "https://neocities.org/api/key" -u "YOURUSER:YOURPASSWORD"
  ```

Put the key in the gitignored, `chmod 600` token file:
```
/DATA/projects/log-smasher/.neocities_token
```

**Then push anytime:**
```
./push-neocities.sh            # upload everything in static/ (skips .wasm on free plan)
./push-neocities.sh --info     # show site name, URL, size, hits
./push-neocities.sh --list     # list files currently on the site
./push-neocities.sh --prune    # upload, then delete remote files no longer in static/
ALLOW_WASM=1 ./push-neocities.sh   # also push .wasm (Neocities SUPPORTER plan only)
```

**`.wasm` caveat:** free Neocities doesn't allow `.wasm`, so `vendor/sql-wasm.wasm` is skipped.
The site still combines CSVs and uploads to WiGLE; only the SQLite/Kismet `.db` import is
disabled there. It works fully on the self-hosted ZimaBoard copy (and on a supporter plan).

## Getting your WiGLE API token

[wigle.net/account](https://wigle.net/account) → **Show my token** → copy the
**"Encoded for use"** value (a base64 string). Paste it into the upload panel. It's sent only
to `api.wigle.net` with HTTPS Basic auth (WiGLE's API allows this cross-origin — verified).

## How it's hosted here (and how to redeploy)

`nginx:alpine` (a **public** image) serving content from **`/DATA/AppData/log-smasher/`** on
port **8810**, managed by CasaOS. The project **source** lives in `/DATA/projects/log-smasher/`
and is **never** bind-mounted into the container — because `casaos-cli ... uninstall` deletes an
app's bind-mount source tree (it wiped this project once; now isolated).

To push edits or recover the tile, just run:

```
./deploy.sh        # syncs static/ + nginx.conf -> /DATA/AppData/log-smasher, then installs the CasaOS app
```

The tile's launch fields (top-level `x-casaos:` in `docker-compose.yml`) use
`hostname: 100.102.144.73` (the Tailscale IP your browser reaches) — that's what makes the
card actually open. See `/DATA/.claude/CLAUDE.md` → "Dashboard Tiles" for the full recipe.

## Tests

```
node test/run.js      # CSV parsing, version normalization, dedup, output format (12 asserts)
node test/sqlite.js   # SQLite (WiGLE-app schema) import via sql.js (7 asserts)
```

## Files

```
static/                 ← the entire app (this is what you put on Neocities)
  index.html app.js style.css favicon.svg
  vendor/  sql-wasm.js sql-wasm.wasm fflate.min.js   (vendored, offline)
nginx.conf              ← serves static/ on :8810 with correct wasm mime
Dockerfile              ← optional self-contained image (not used by the CasaOS tile)
docker-compose.yml      ← public nginx + CasaOS tile (mounts /DATA/AppData/log-smasher)
deploy.sh               ← sync to AppData + (re)install the tile — run this to deploy/recover
dist/log-smasher-neocities.zip   ← ready-to-upload bundle
test/                   ← Node test harness + fixtures
```
