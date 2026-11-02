'use strict';
let lulus = 0;
async function langkah(nama, fn) {
  const t = Date.now();
  try {
    await fn();
    lulus++;
    console.log('  ✓ ' + nama + '  (' + (Date.now() - t) + ' ms)');
  } catch (e) {
    console.log('  ✗ ' + nama);
    throw e;
  }
}
function selesai() { console.log('\nLULUS: ' + lulus + ' ujian'); }
function ralatKonsol(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FAILED|404/.test(m.text())) errors.push('console: ' + m.text()); });
  return errors;
}
module.exports = { langkah, selesai, ralatKonsol };
