// Jalankan semua ujian peringkat 1–4:  node t4/ujian/jalankan-semua.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
for (const f of ['ujian-1-2-murid.js', 'ujian-3-guru.js', 'ujian-4-menu.js']) {
  console.log('\n▶ ' + f);
  execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
}
console.log('\nSEMUA UJIAN LULUS');
