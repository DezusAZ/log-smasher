// Node harness: load app.js merge engine with browser stubs and test it.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const sandbox = {
  document: { addEventListener(){}, getElementById(){ return {}; } },
  window: {}, localStorage: { getItem(){return null;}, setItem(){}, removeItem(){} },
  TextDecoder, console,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

// Pull the function declarations off the context.
const { parseWigleCsv, transformRecords, buildOutput } = sandbox;

function assert(cond, msg){ if(!cond){ console.error('❌ FAIL:', msg); process.exitCode = 1; } else console.log('✅', msg); }

const files = ['log_a_v16.csv','log_b_v14.csv','log_c_dup.csv'];
let all = [];
for (const f of files) {
  const recs = parseWigleCsv(fs.readFileSync(path.join(__dirname, f), 'utf8'), f);
  console.log(`  ${f}: ${recs.length} rows`);
  all = all.concat(recs);
}
assert(all.length === 8, `read 8 total rows (got ${all.length})`);

// SSID with comma preserved
const cafe = all.find(r => r.SSID.includes('Café'));
assert(cafe && cafe.SSID === 'Café, Free', `comma SSID preserved: "${cafe && cafe.SSID}"`);

// v1.4 file got Frequency derived from Channel (ch6 -> 2437, ch149 -> 5745)
const neigh = all.find(r => r.MAC === 'AA:BB:CC:DD:EE:04');
assert(neigh.Frequency === '5745', `ch149 -> 5745 derived (got ${neigh.Frequency})`);
const home14 = all.find(r => r.MAC==='AA:BB:CC:DD:EE:01' && r.FirstSeen==='2026-06-02 09:00:00');
assert(home14.Frequency === '2437', `ch6 -> 2437 derived (got ${home14.Frequency})`);

// empty SSID row kept (hidden nets are valid)
assert(all.some(r => r.SSID === '' && r.MAC==='AA:BB:CC:DD:EE:03'), 'hidden/empty SSID row kept');

// dedup exact: the two identical HomeNet rows in file B collapse; the dup of file A in file C collapses
const dedup = transformRecords(all, {dedupExact:true, onePerNetwork:false, sortByTime:false});
assert(dedup.length === 6, `exact dedup 8 -> 6 (got ${dedup.length})`);

// one-per-network: EE:01 appears at two times/locations -> collapse to 1, keep strongest RSSI (-55 > -60)
const onenet = transformRecords(all, {dedupExact:true, onePerNetwork:true, sortByTime:false});
const home = onenet.filter(r => r.MAC==='AA:BB:CC:DD:EE:01');
assert(home.length === 1, `one-per-network collapses EE:01 (got ${home.length})`);
assert(home[0] && home[0].RSSI === '-55', `kept strongest RSSI -55 (got ${home[0] && home[0].RSSI})`);

// output format: pre-header upgraded to 1.6, correct header, field count 14
const out = buildOutput(dedup);
const lines = out.trim().split('\n');
assert(lines[0].startsWith('WigleWifi-1.6,'), `pre-header is 1.6 (got "${lines[0].slice(0,20)}")`);
assert(lines[1] === 'MAC,SSID,AuthMode,FirstSeen,Channel,Frequency,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,RCOIs,MfgrId,Type', 'header line exact 1.6');
// the café row must be quoted in output
assert(out.includes('"Café, Free"'), 'comma SSID re-quoted on output');
// BLE type preserved
assert(dedup.some(r => r.Type === 'BLE'), 'BLE type preserved');
console.log('\nSample output:\n' + lines.slice(0,5).join('\n'));
