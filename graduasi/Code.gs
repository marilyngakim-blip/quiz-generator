/**
 * Backend Google Apps Script — Sistem Pendaftaran & Kehadiran
 * Majlis Graduasi Tingkatan 5 SMK Langkon
 *
 * Cara pasang (ringkas — lihat README.md untuk langkah penuh):
 * 1. Buka Google Sheet baharu > Extensions > Apps Script.
 * 2. Tampal semua kod ini ke dalam Code.gs dan simpan.
 * 3. Jalankan fungsi `setup` sekali (benarkan akses bila diminta).
 * 4. Deploy > New deployment > Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 5. Salin URL Web app ke CONFIG.API_URL dalam index.html.
 *
 * Kata laluan admin disimpan dalam Script Properties (ADMIN_PASSWORD),
 * bukan dalam laman web. Tukar dengan menjalankan `tukarKataLaluan`.
 */

const SHEET_GRAD = 'Graduan';
const SHEET_VIS = 'Pengunjung';
const GRAD_HEADERS = ['id', 'nama', 'kelas', 'noMurid', 'meja', 'kerusi', 'gambar', 'status', 'masaHadir'];
const VIS_HEADERS = ['id', 'masa', 'nama', 'telefon', 'hubungan', 'graduan', 'bilangan'];
const TZ = 'Asia/Kuching';
const DEFAULT_PASSWORD = 'graduasi2026';

/** Jalankan sekali untuk cipta helaian dan kata laluan lalai. */
function setup() {
  getSheet_(SHEET_GRAD, GRAD_HEADERS);
  getSheet_(SHEET_VIS, VIS_HEADERS);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', DEFAULT_PASSWORD);
}

/** Tukar teks di bawah, kemudian jalankan fungsi ini sekali. */
function tukarKataLaluan() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', 'TUKAR_KATA_LALUAN_INI');
}

// ---------- HTTP ----------

function doGet() {
  // Data awam sahaja: maklumat pengunjung (no. telefon) tidak didedahkan.
  return json_({
    ok: true,
    graduan: readAll_(SHEET_GRAD, GRAD_HEADERS),
    bilPengunjung: Math.max(0, getSheet_(SHEET_VIS, VIS_HEADERS).getLastRow() - 1),
    bilTetamu: sumVisitors_()
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Data tidak sah' });
  }

  const action = body.action;
  const publicActions = ['visitor'];
  if (publicActions.indexOf(action) === -1 && !isAdmin_(body.password)) {
    return json_({ ok: false, error: 'Kata laluan admin salah' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (action) {
      case 'login': return json_({ ok: true });
      case 'add': return json_({ ok: true, record: addGrad_(body.record) });
      case 'bulkAdd': return json_({ ok: true, count: bulkAdd_(body.records) });
      case 'update': return json_(updateGrad_(body.record));
      case 'delete': return json_(deleteRow_(SHEET_GRAD, GRAD_HEADERS, body.id));
      case 'attendance': return json_(markAttendance_(body.id, body.status));
      case 'listVisitors': return json_({ ok: true, pengunjung: readAll_(SHEET_VIS, VIS_HEADERS) });
      case 'deleteVisitor': return json_(deleteRow_(SHEET_VIS, VIS_HEADERS, body.id));
      case 'visitor': return json_(addVisitor_(body.visitor));
      default: return json_({ ok: false, error: 'Tindakan tidak dikenali' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Logik ----------

function addGrad_(r) {
  const rec = makeGrad_(r);
  getSheet_(SHEET_GRAD, GRAD_HEADERS).appendRow(GRAD_HEADERS.map(h => rec[h]));
  return rec;
}

function bulkAdd_(records) {
  const rows = (records || []).filter(r => r && clean_(r.nama))
    .map(r => { const rec = makeGrad_(r); return GRAD_HEADERS.map(h => rec[h]); });
  if (!rows.length) return 0;
  const sh = getSheet_(SHEET_GRAD, GRAD_HEADERS);
  const range = sh.getRange(sh.getLastRow() + 1, 1, rows.length, GRAD_HEADERS.length);
  range.setNumberFormat('@').setValues(rows);
  return rows.length;
}

function makeGrad_(r) {
  r = r || {};
  const nama = clean_(r.nama);
  if (!nama) throw new Error('Nama diperlukan');
  return {
    id: newId_(),
    nama: nama,
    kelas: clean_(r.kelas),
    noMurid: clean_(r.noMurid),
    meja: clean_(r.meja),
    kerusi: clean_(r.kerusi),
    gambar: clean_(r.gambar),
    status: '',
    masaHadir: ''
  };
}

function updateGrad_(r) {
  const found = findRow_(SHEET_GRAD, GRAD_HEADERS, r && r.id);
  if (!found) return { ok: false, error: 'Rekod tidak dijumpai' };
  ['nama', 'kelas', 'noMurid', 'meja', 'kerusi', 'gambar'].forEach(k => {
    if (r[k] !== undefined) found.record[k] = clean_(r[k]);
  });
  writeRow_(found);
  return { ok: true, record: found.record };
}

function markAttendance_(id, status) {
  const found = findRow_(SHEET_GRAD, GRAD_HEADERS, id);
  if (!found) return { ok: false, error: 'Graduan tidak dijumpai' };
  const rec = found.record;
  if (status === 'reset') {
    rec.status = '';
    rec.masaHadir = '';
  } else {
    if (rec.status === 'Hadir') return { ok: true, already: true, record: rec };
    rec.status = 'Hadir';
    rec.masaHadir = now_();
  }
  writeRow_(found);
  return { ok: true, record: rec };
}

function addVisitor_(v) {
  v = v || {};
  const nama = clean_(v.nama);
  if (!nama) return { ok: false, error: 'Nama diperlukan' };
  const bil = Math.min(20, Math.max(1, parseInt(v.bilangan, 10) || 1));
  const rec = {
    id: newId_(),
    masa: now_(),
    nama: nama,
    telefon: clean_(v.telefon),
    hubungan: clean_(v.hubungan),
    graduan: clean_(v.graduan),
    bilangan: bil
  };
  getSheet_(SHEET_VIS, VIS_HEADERS).appendRow(VIS_HEADERS.map(h => rec[h]));
  return { ok: true, id: rec.id, masa: rec.masa };
}

// ---------- Helaian ----------

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    // Simpan semua lajur sebagai teks supaya ID / no. telefon tidak berubah format.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  }
  return sh;
}

function readAll_(name, headers) {
  const sh = getSheet_(name, headers);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getDisplayValues()
    .filter(row => row[0] !== '')
    .map(row => toObj_(headers, row));
}

function findRow_(name, headers, id) {
  if (!id) return null;
  const sh = getSheet_(name, headers);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, headers.length).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return { sheet: sh, headers: headers, rowNum: i + 2, record: toObj_(headers, rows[i]) };
    }
  }
  return null;
}

function writeRow_(found) {
  found.sheet.getRange(found.rowNum, 1, 1, found.headers.length)
    .setValues([found.headers.map(h => found.record[h])]);
}

function deleteRow_(name, headers, id) {
  const found = findRow_(name, headers, id);
  if (!found) return { ok: false, error: 'Rekod tidak dijumpai' };
  found.sheet.deleteRow(found.rowNum);
  return { ok: true };
}

function sumVisitors_() {
  return readAll_(SHEET_VIS, VIS_HEADERS)
    .reduce((t, v) => t + (parseInt(v.bilangan, 10) || 1), 0);
}

// ---------- Utiliti ----------

function isAdmin_(pw) {
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || DEFAULT_PASSWORD;
  return typeof pw === 'string' && pw === saved;
}

function toObj_(headers, row) {
  const o = {};
  headers.forEach((h, i) => { o[h] = row[i]; });
  return o;
}

function clean_(v) {
  // Buang aksara formula supaya input tidak dijalankan sebagai formula Sheets.
  // '+' dikekalkan untuk no. telefon (+60...) kecuali diikuti bukan digit.
  return String(v == null ? '' : v).trim()
    .replace(/^[=@]+/, '')
    .replace(/^[+\-](?=\D)/, '')
    .slice(0, 300);
}

function newId_() {
  return 'G' + Utilities.getUuid().replace(/-/g, '').slice(0, 7).toUpperCase();
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
