const fs=require('fs'),vm=require('vm'),path=require('path');
(async()=>{
  const initSqlJs=require('../static/vendor/sql-wasm.js');
  const SQL=await initSqlJs({locateFile:()=>path.join(__dirname,'../static/vendor/sql-wasm.wasm')});
  // Build a WiGLE-app-schema DB in memory and export bytes.
  const db=new SQL.Database();
  db.run(`CREATE TABLE network(bssid TEXT,ssid TEXT,frequency INT,capabilities TEXT,
    lasttime INT,lastlat REAL,lastlon REAL,type TEXT,bestlevel INT,bestlat REAL,bestlon REAL,rcois TEXT,mfgrid INT);`);
  // lasttime in epoch millis (WiGLE app stores millis). 1780653600000 = 2026-06-05 10:00:00 UTC
  db.run(`INSERT INTO network VALUES
    ('AA:BB:CC:DD:EE:01','HomeNet',2437,'[WPA2-PSK-CCMP][ESS]',1780653600000,33.1,-111.9,'W',-55,33.1,-111.9,'',0),
    ('11:22:33:44:55:66','MyWatch',0,'',1780653660000,33.2,-111.8,'E',-40,33.2,-111.8,'',0);`);
  const bytes=db.export(); db.close();

  // Load app.js engine with stubs, injecting initSqlJs as window.initSqlJs.
  const src=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
  const sandbox={document:{addEventListener(){}},window:{initSqlJs:(o)=>initSqlJs({locateFile:()=>path.join(__dirname,'../static/vendor/sql-wasm.wasm')})},
    localStorage:{getItem(){return null}},TextDecoder,console};
  vm.createContext(sandbox); vm.runInContext(src,sandbox);
  const recs=await sandbox.parseSqlite(bytes.buffer);
  const A=(c,m)=>{if(!c){console.error('❌',m);process.exitCode=1}else console.log('✅',m)};
  A(recs.length===2,`parsed 2 networks (got ${recs.length})`);
  A(recs[0].MAC==='AA:BB:CC:DD:EE:01','bssid->MAC');
  A(recs[0].FirstSeen==='2026-06-05 10:00:00',`epoch->SQL time (got ${recs[0].FirstSeen})`);
  A(recs[0].Type==='WIFI','type W->WIFI');
  A(recs[0].Channel==='6',`freq 2437 -> channel 6 (got ${recs[0].Channel})`);
  A(recs[0].RSSI==='-55','bestlevel->RSSI');
  A(recs[1].Type==='BLE','type E->BLE');
  console.log('sample:',JSON.stringify(recs[0]));
})().catch(e=>{console.error('THREW',e);process.exitCode=1});
