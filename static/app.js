/* Log Smasher — combine wardriving logs into one WiGLE-uploadable file.
 * 100% client-side. Logs and location data never leave the browser
 * (except the combined file you choose to upload to WiGLE). */
'use strict';

// ---- Canonical WigleWifi-1.6 column order (the output superset) ----
const OUT_COLS = ['MAC','SSID','AuthMode','FirstSeen','Channel','Frequency','RSSI',
  'CurrentLatitude','CurrentLongitude','AltitudeMeters','AccuracyMeters','RCOIs','MfgrId','Type'];

// Map every known header spelling (any WigleWifi version) -> canonical field.
const COL_ALIASES = {
  mac:'MAC', bssid:'MAC',
  ssid:'SSID',
  authmode:'AuthMode', capabilities:'AuthMode', auth:'AuthMode',
  firstseen:'FirstSeen', 'first seen':'FirstSeen', time:'FirstSeen', lasttime:'FirstSeen',
  channel:'Channel',
  frequency:'Frequency', freq:'Frequency',
  rssi:'RSSI', signal:'RSSI', bestlevel:'RSSI', level:'RSSI',
  currentlatitude:'CurrentLatitude', latitude:'CurrentLatitude', lat:'CurrentLatitude', bestlat:'CurrentLatitude', lastlat:'CurrentLatitude',
  currentlongitude:'CurrentLongitude', longitude:'CurrentLongitude', lon:'CurrentLongitude', long:'CurrentLongitude', bestlon:'CurrentLongitude', lastlon:'CurrentLongitude',
  altitudemeters:'AltitudeMeters', altitude:'AltitudeMeters', alt:'AltitudeMeters',
  accuracymeters:'AccuracyMeters', accuracy:'AccuracyMeters',
  rcois:'RCOIs',
  mfgrid:'MfgrId', mfgr:'MfgrId',
  type:'Type',
};

// ---------------------------------------------------------------- state
const state = {
  files: [],        // {name, status, format, count, error}
  records: [],      // canonical row objects
  preHeader: null,  // reused WigleWifi pre-header line (first valid one seen)
};

// ---------------------------------------------------------------- RFC4180 CSV parser
// Returns array of rows, each an array of string fields. Handles quotes,
// embedded commas/newlines, and "" escaping.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  const n = text.length;
  // strip a UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) i = 1;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // last field/row (if file doesn't end in newline)
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- channel <-> frequency
function freqFromChannel(ch, band) {
  ch = parseInt(ch, 10);
  if (!Number.isFinite(ch)) return '';
  // 2.4 GHz
  if (ch >= 1 && ch <= 13) return 2407 + ch * 5;
  if (ch === 14) return 2484;
  // 6 GHz (band hint) vs 5 GHz — without a band hint assume 5 GHz for 36+
  if (band === 6) return 5950 + ch * 5;
  if (ch >= 32 && ch <= 196) return 5000 + ch * 5;
  return '';
}
function channelFromFreq(f) {
  f = parseInt(f, 10);
  if (!Number.isFinite(f)) return '';
  if (f === 2484) return 14;
  if (f >= 2412 && f <= 2472) return (f - 2407) / 5;
  if (f >= 5160 && f <= 5885) return (f - 5000) / 5;       // 5 GHz
  if (f >= 5955 && f <= 7115) return (f - 5950) / 5;       // 6 GHz
  return '';
}

// ---------------------------------------------------------------- record helpers
function blankRecord() {
  const r = {};
  for (const c of OUT_COLS) r[c] = '';
  return r;
}

// Fill in Channel<->Frequency when one is missing (WiFi only).
function deriveChannelFreq(r) {
  const isWifi = (r.Type || 'WIFI').toUpperCase() === 'WIFI';
  if (!isWifi) return;
  if (r.Frequency === '' && r.Channel !== '') r.Frequency = String(freqFromChannel(r.Channel) || '');
  if (r.Channel === '' && r.Frequency !== '') r.Channel = String(channelFromFreq(r.Frequency) || '');
}

// ---------------------------------------------------------------- parse a WiGLE CSV file
function parseWigleCsv(text, fileName) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('empty file');

  // Find the header row (starts with a MAC/BSSID column and has SSID).
  let headerIdx = -1;
  for (let k = 0; k < Math.min(rows.length, 8); k++) {
    const lower = rows[k].map(s => s.trim().toLowerCase());
    if ((lower[0] === 'mac' || lower[0] === 'bssid') && lower.includes('ssid')) { headerIdx = k; break; }
    // capture a WigleWifi pre-header line for reuse
    if (rows[k][0] && rows[k][0].startsWith('WigleWifi') && !state.preHeader) {
      state.preHeader = rows[k].map(f => /[",\n]/.test(f) ? '"' + f.replace(/"/g,'""') + '"' : f).join(',');
    }
  }
  if (headerIdx === -1) throw new Error('no MAC,SSID header row found — not a WiGLE CSV?');

  const header = rows[headerIdx].map(s => s.trim());
  const map = header.map(h => COL_ALIASES[h.toLowerCase()] || null);

  const out = [];
  for (let k = headerIdx + 1; k < rows.length; k++) {
    const raw = rows[k];
    if (raw.length === 1 && raw[0].trim() === '') continue;       // blank line
    if (raw[0] && raw[0].startsWith('WigleWifi')) continue;        // stray pre-header
    if (raw.length < 2) continue;
    const rec = blankRecord();
    let hasMac = false;
    for (let j = 0; j < raw.length && j < map.length; j++) {
      if (!map[j]) continue;
      const v = raw[j];
      rec[map[j]] = v;
      if (map[j] === 'MAC' && v.trim()) hasMac = true;
    }
    if (!hasMac) continue;
    if (!rec.Type) rec.Type = 'WIFI';
    deriveChannelFreq(rec);
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------- SQLite import (WiGLE app / forks)
const WIGLE_TYPE = { W:'WIFI', B:'BT', E:'BLE', G:'GSM', C:'CDMA', L:'LTE', D:'WCDMA', N:'NR' };

function epochToSql(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n < 1e12 ? n * 1000 : n); // accept seconds or millis
  const p = x => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function parseSqlite(arrayBuffer) {
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(arrayBuffer));
  try {
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
      .flatMap(r => r.values.map(v => String(v[0]).toLowerCase()));
    if (!tables.includes('network')) {
      throw new Error('SQLite has no "network" table — for Kismet, export to wiglecsv first');
    }
    // WiGLE app / fork schema: one row per network
    const res = db.exec('SELECT * FROM network');
    if (!res.length) return [];
    const cols = res[0].columns.map(c => c.toLowerCase());
    const idx = name => cols.indexOf(name);
    const out = [];
    for (const v of res[0].values) {
      const get = name => { const i = idx(name); return i >= 0 ? v[i] : ''; };
      const rec = blankRecord();
      rec.MAC = String(get('bssid') || '');
      if (!rec.MAC.trim()) continue;
      rec.SSID = get('ssid') == null ? '' : String(get('ssid'));
      rec.AuthMode = String(get('capabilities') || '');
      rec.FirstSeen = epochToSql(get('lasttime'));
      rec.Frequency = get('frequency') === '' ? '' : String(get('frequency') || '');
      rec.RSSI = get('bestlevel') === '' ? '' : String(get('bestlevel') || '');
      rec.CurrentLatitude = get('bestlat') ? String(get('bestlat')) : (get('lastlat') ? String(get('lastlat')) : '');
      rec.CurrentLongitude = get('bestlon') ? String(get('bestlon')) : (get('lastlon') ? String(get('lastlon')) : '');
      rec.RCOIs = String(get('rcois') || '');
      rec.MfgrId = String(get('mfgrid') || '');
      const t = String(get('type') || 'W').toUpperCase();
      rec.Type = WIGLE_TYPE[t] || (t.length > 1 ? t : 'WIFI');
      deriveChannelFreq(rec);
      out.push(rec);
    }
    return out;
  } finally {
    db.close();
  }
}

let _sqlPromise = null;
function getSqlJs() {
  if (!_sqlPromise) {
    _sqlPromise = window.initSqlJs({ locateFile: () => 'vendor/sql-wasm.wasm' });
  }
  return _sqlPromise;
}

// ---------------------------------------------------------------- serialize output
function csvField(v) {
  v = v == null ? '' : String(v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function buildOutput(records) {
  const pre = state.preHeader
    ? state.preHeader.replace(/^WigleWifi-[0-9.]+/, 'WigleWifi-1.6')
    : 'WigleWifi-1.6,appRelease=LogSmasher,model=,release=,device=,display=,board=,brand=';
  const lines = [pre, OUT_COLS.join(',')];
  for (const r of records) lines.push(OUT_COLS.map(c => csvField(r[c])).join(','));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- dedup / transform
function networkKey(r) { return (r.MAC || '').toUpperCase() + '|' + (r.Type || ''); }
function exactKey(r)   { return networkKey(r) + '|' + r.FirstSeen + '|' + r.CurrentLatitude + '|' + r.CurrentLongitude + '|' + r.SSID; }

function transformRecords(records, opts) {
  let recs = records;
  if (opts.dedupExact) {
    const seen = new Set(), out = [];
    for (const r of recs) { const k = exactKey(r); if (!seen.has(k)) { seen.add(k); out.push(r); } }
    recs = out;
  }
  if (opts.onePerNetwork) {
    const best = new Map();
    for (const r of recs) {
      const k = networkKey(r);
      const cur = best.get(k);
      const rssi = parseInt(r.RSSI, 10);
      const curRssi = cur ? parseInt(cur.RSSI, 10) : -Infinity;
      // keep the strongest signal; RSSI is negative dBm (closer to 0 = stronger)
      if (!cur || (Number.isFinite(rssi) && (!Number.isFinite(curRssi) || rssi > curRssi))) best.set(k, r);
    }
    recs = [...best.values()];
  }
  if (opts.sortByTime) {
    recs = recs.slice().sort((a, b) => (a.FirstSeen || '').localeCompare(b.FirstSeen || ''));
  }
  return recs;
}

// ---------------------------------------------------------------- file ingestion
function looksSqlite(name, buf) {
  if (/\.(sqlite|db|kismet|sqlite3)$/i.test(name)) return true;
  // SQLite magic: "SQLite format 3\0"
  const sig = new Uint8Array(buf.slice(0, 16));
  const magic = 'SQLite format 3\0';
  for (let i = 0; i < magic.length; i++) if (sig[i] !== magic.charCodeAt(i)) return false;
  return true;
}

async function ingestFile(file) {
  const entry = { name: file.name, status: 'parsing', format: '?', count: 0, error: '' };
  state.files.push(entry);
  renderFiles();
  try {
    if (/\.zip$/i.test(file.name)) {
      await ingestZip(file, entry);
      return;
    }
    const buf = await file.arrayBuffer();
    let recs;
    if (looksSqlite(file.name, buf)) {
      entry.format = 'sqlite';
      recs = await parseSqlite(buf);
    } else {
      entry.format = 'csv';
      recs = parseWigleCsv(new TextDecoder('utf-8').decode(buf), file.name);
    }
    state.records.push(...recs);
    entry.count = recs.length;
    entry.status = 'ok';
  } catch (e) {
    entry.status = 'error';
    entry.error = e.message || String(e);
  }
  renderFiles();
}

async function ingestZip(file, entry) {
  entry.format = 'zip';
  const buf = new Uint8Array(await file.arrayBuffer());
  const unzipped = fflate.unzipSync(buf);
  let total = 0, inner = 0;
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith('/')) continue;
    if (/\.(csv|wiglecsv)$/i.test(path)) {
      try { const recs = parseWigleCsv(new TextDecoder('utf-8').decode(data), path); state.records.push(...recs); total += recs.length; inner++; }
      catch (_) { /* skip non-wigle csv inside zip */ }
    } else if (looksSqlite(path, data.buffer)) {
      try { const recs = await parseSqlite(data.buffer); state.records.push(...recs); total += recs.length; inner++; }
      catch (_) { /* skip */ }
    }
  }
  entry.count = total;
  entry.status = inner ? 'ok' : 'error';
  if (!inner) entry.error = 'no WiGLE logs found inside zip';
  else entry.format = `zip (${inner} logs)`;
}

async function handleFiles(fileList) {
  const arr = [...fileList].filter(f => f.size >= 0);
  // process sequentially-ish but allow csv parsing concurrency; keep it simple & ordered
  for (const f of arr) await ingestFile(f);
  recompute();
}

// ---------------------------------------------------------------- recompute + render
function currentOpts() {
  return {
    dedupExact: el('optDedup').checked,
    onePerNetwork: el('optOnePerNet').checked,
    sortByTime: el('optSort').checked,
  };
}

let _output = '';
function recompute() {
  const recs = transformRecords(state.records, currentOpts());
  _output = state.records.length ? buildOutput(recs) : '';
  renderStats(recs);
  el('downloadBtn').disabled = !recs.length;
  el('uploadBtn').disabled = !recs.length;
}

function renderStats(recs) {
  const box = el('stats');
  if (!state.records.length) { box.innerHTML = ''; return; }
  const types = {};
  const macs = new Set();
  let minT = '', maxT = '';
  for (const r of recs) {
    types[r.Type || 'WIFI'] = (types[r.Type || 'WIFI'] || 0) + 1;
    if (r.MAC) macs.add(r.MAC.toUpperCase());
    const t = r.FirstSeen;
    if (t) { if (!minT || t < minT) minT = t; if (!maxT || t > maxT) maxT = t; }
  }
  const typeStr = Object.entries(types).sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => `<span class="chip">${k}: ${v.toLocaleString()}</span>`).join('');
  box.innerHTML = `
    <div class="statgrid">
      <div class="stat"><b>${recs.length.toLocaleString()}</b><span>rows in combined file</span></div>
      <div class="stat"><b>${macs.size.toLocaleString()}</b><span>unique networks</span></div>
      <div class="stat"><b>${state.records.length.toLocaleString()}</b><span>rows read (pre-dedup)</span></div>
      <div class="stat"><b>${state.files.filter(f=>f.status==='ok').length}/${state.files.length}</b><span>files combined</span></div>
    </div>
    <div class="chips">${typeStr}</div>
    ${minT ? `<div class="span">🕑 ${minT} &rarr; ${maxT} (UTC)</div>` : ''}`;
}

function renderFiles() {
  const box = el('filelist');
  if (!state.files.length) { box.innerHTML = ''; return; }
  box.innerHTML = state.files.map(f => {
    const icon = f.status === 'ok' ? '✅' : f.status === 'error' ? '⚠️' : '⏳';
    const detail = f.status === 'error' ? `<span class="err">${esc(f.error)}</span>`
      : `<span class="muted">${f.format} · ${f.count.toLocaleString()} rows</span>`;
    return `<div class="filerow">${icon} <span class="fname">${esc(f.name)}</span> ${detail}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- download
function outputName() {
  const d = new Date();
  const p = x => String(x).padStart(2, '0');
  return `WigleWifi_combined_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;
}
function download() {
  const blob = new Blob([_output], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = outputName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------- WiGLE upload
async function uploadToWigle() {
  const token = el('apiToken').value.trim();
  const status = el('uploadStatus');
  if (!token) { status.innerHTML = '<span class="err">Enter your WiGLE "Encoded for use" API token first.</span>'; return; }
  if (el('rememberToken').checked) saveToken(token);
  else forgetToken();

  const fd = new FormData();
  fd.append('file', new Blob([_output], { type: 'text/csv' }), outputName());
  fd.append('donate', el('donate').checked ? 'on' : 'off');

  status.innerHTML = '<span class="muted">⏳ Uploading to WiGLE…</span>';
  el('uploadBtn').disabled = true;
  try {
    const res = await fetch('https://api.wigle.net/api/v2/file/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + token, 'Accept': 'application/json' },
      body: fd,
    });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (_) {}
    if (res.status === 401) { status.innerHTML = '<span class="err">401 Unauthorized — check your API token.</span>'; }
    else if (res.ok && data && data.success !== false) {
      const tid = data.results && data.results[0] && (data.results[0].transid || data.results[0].filename) || data.transids || '';
      status.innerHTML = `<span class="ok">✅ Uploaded! ${tid ? 'transid: ' + esc(String(tid)) : 'WiGLE accepted the file.'} It will appear after WiGLE processes it.</span>`;
    } else {
      status.innerHTML = `<span class="err">Upload failed (${res.status}): ${esc((data && (data.message||data.error)) || text.slice(0,200))}</span>`;
    }
  } catch (e) {
    status.innerHTML = `<span class="err">Network/CORS error: ${esc(e.message||String(e))}</span>`;
  } finally {
    el('uploadBtn').disabled = !_output;
  }
}

// ---------------------------------------------------------------- reset
function resetAll() {
  state.files = []; state.records = []; state.preHeader = null; _output = '';
  el('fileInput').value = ''; el('folderInput').value = '';
  renderFiles(); renderStats([]);
  el('downloadBtn').disabled = true; el('uploadBtn').disabled = true;
  el('uploadStatus').innerHTML = '';
}

// ---------------------------------------------------------------- token persistence (this browser only)
// The token lives ONLY in the user's own browser localStorage — never transmitted to this
// site (there is no server). saveToken/forgetToken are the single source of truth.
const TOKEN_KEY = 'ls_wigle_token';
function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {} renderTokenStatus(); }
function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
  el('apiToken').value = '';
  el('rememberToken').checked = false;
  renderTokenStatus();
}
function renderTokenStatus() {
  const box = el('tokenStatus');
  const saved = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } })();
  if (saved) {
    box.innerHTML = `🔒 <span class="ok">Saved in this browser only</span> — pre-filled for next time, readable by no one but you. ` +
      `<button type="button" id="forgetBtn" class="link">Forget token</button>`;
    el('forgetBtn').addEventListener('click', forgetToken);
  } else {
    box.innerHTML = '<span class="muted">Not saved — entered for one-time use (gone when you close this tab).</span>';
  }
}

// ---------------------------------------------------------------- helpers + wiring
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function wire() {
  const drop = el('dropzone');
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => {
    const items = e.dataTransfer;
    if (items.files && items.files.length) handleFiles(items.files);
  });
  el('fileInput').addEventListener('change', e => handleFiles(e.target.files));
  el('folderInput').addEventListener('change', e => handleFiles(e.target.files));
  el('downloadBtn').addEventListener('click', download);
  el('uploadBtn').addEventListener('click', uploadToWigle);
  el('resetBtn').addEventListener('click', resetAll);
  ['optDedup','optOnePerNet','optSort'].forEach(id => el(id).addEventListener('change', recompute));

  // restore a token the user previously saved on THIS browser
  let saved = null; try { saved = localStorage.getItem(TOKEN_KEY); } catch (_) {}
  if (saved) { el('apiToken').value = saved; el('rememberToken').checked = true; }

  // toggling "Remember" saves/forgets immediately (no need to upload first)
  el('rememberToken').addEventListener('change', e => {
    if (e.target.checked) { const t = el('apiToken').value.trim(); if (t) saveToken(t); else renderTokenStatus(); }
    else forgetToken();
  });
  // keep an already-saved token in sync while editing it
  el('apiToken').addEventListener('input', () => {
    if (el('rememberToken').checked) {
      const t = el('apiToken').value.trim();
      if (t) saveToken(t); else { try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} renderTokenStatus(); }
    }
  });
  renderTokenStatus();
}
document.addEventListener('DOMContentLoaded', wire);
