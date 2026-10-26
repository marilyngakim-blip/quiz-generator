/**
 * Backend Google Apps Script — Sistem Pendaftaran & Kehadiran
 * Majlis Apresiasi PRAKASA Murid Tingkatan 5 SMK Langkon
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

const SHEET_MURID = 'Murid';
const SHEET_VIS = 'Pengunjung';
const MURID_HEADERS = ['id', 'nama', 'kelas', 'jantina', 'meja', 'kerusi', 'gambar', 'status', 'masaHadir', 'bilIbuBapa', 'ibuBapa'];
const VIS_HEADERS = ['id', 'masa', 'nama', 'telefon', 'hubungan', 'murid', 'bilangan'];
const EDITABLE = ['nama', 'kelas', 'jantina', 'meja', 'kerusi', 'gambar', 'bilIbuBapa', 'ibuBapa'];
const PRIVATE_FIELDS = ['ibuBapa']; // tidak dipaparkan kepada orang awam
const TZ = 'Asia/Kuching';
const DEFAULT_PASSWORD = 'prakasa2026';

/** Jalankan sekali untuk cipta helaian dan kata laluan lalai. */
function setup() {
  // Jika Sheet dicipta daripada fail CSV, helaian pertama dinamakan semula kepada "Murid".
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_MURID)) {
    const first = ss.getSheets()[0];
    if (String(first.getRange(1, 1).getValue()).trim() === 'id') first.setName(SHEET_MURID);
  }
  getSheet_(SHEET_MURID, MURID_HEADERS).setFrozenRows(1);
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
  return json_(publicData_());
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Data tidak sah' });
  }

  const action = body.action;
  if (action !== 'visitor' && !isAdmin_(body.password)) {
    return json_({ ok: false, error: 'Kata laluan admin salah' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (action) {
      case 'login': return json_({ ok: true });
      case 'adminData': return json_(Object.assign(publicData_(), { murid: readAll_(SHEET_MURID, MURID_HEADERS) }));
      case 'add': return json_({ ok: true, record: addMurid_(body.record) });
      case 'bulkAdd': return json_(Object.assign({ ok: true }, bulkUpsert_(body.records)));
      case 'update': return json_(updateMurid_(body.record));
      case 'delete': return json_(deleteRow_(SHEET_MURID, MURID_HEADERS, body.id));
      case 'attendance': return json_(markAttendance_(body.id, body.status));
      case 'resetAll': return json_(resetAll_());
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

function publicData_() {
  const murid = readAll_(SHEET_MURID, MURID_HEADERS).map(m => {
    PRIVATE_FIELDS.forEach(k => delete m[k]);
    return m;
  });
  const vis = readAll_(SHEET_VIS, VIS_HEADERS);
  return {
    ok: true,
    murid: murid,
    bilPengunjung: vis.length,
    bilTetamu: vis.reduce((t, v) => t + (parseInt(v.bilangan, 10) || 1), 0)
  };
}

// ---------- Murid ----------

function makeMurid_(r) {
  r = r || {};
  const nama = clean_(r.nama);
  if (!nama) throw new Error('Nama diperlukan');
  const rec = { id: newId_(), status: '', masaHadir: '' };
  EDITABLE.forEach(k => { rec[k] = clean_(r[k]); });
  rec.nama = nama;
  if (r.status === 'Hadir') rec.status = 'Hadir';
  return rec;
}

function addMurid_(r) {
  const rec = makeMurid_(r);
  getSheet_(SHEET_MURID, MURID_HEADERS).appendRow(MURID_HEADERS.map(h => rec[h]));
  return rec;
}

/**
 * Import senarai: murid yang sama (nama + kelas) dikemas kini, yang baharu ditambah.
 * Medan kosong dalam import tidak memadam data sedia ada.
 */
function bulkUpsert_(records) {
  const sh = getSheet_(SHEET_MURID, MURID_HEADERS);
  const existing = readAll_(SHEET_MURID, MURID_HEADERS);
  const key = r => (clean_(r.nama) + '|' + clean_(r.kelas)).toLowerCase();
  const index = {};
  existing.forEach((r, i) => { index[key(r)] = i; });

  const added = [];
  let updated = 0;
  (records || []).forEach(r => {
    if (!r || !clean_(r.nama)) return;
    const i = index[key(r)];
    if (i === undefined) {
      const rec = makeMurid_(r);
      index[key(rec)] = -1;
      added.push(MURID_HEADERS.map(h => rec[h]));
    } else if (i >= 0) {
      const rec = existing[i];
      EDITABLE.forEach(k => { const v = clean_(r[k]); if (v) rec[k] = v; });
      if (r.status === 'Hadir' && rec.status !== 'Hadir') rec.status = 'Hadir';
      updated++;
    }
  });

  if (updated) {
    sh.getRange(2, 1, existing.length, MURID_HEADERS.length)
      .setValues(existing.map(rec => MURID_HEADERS.map(h => rec[h])));
  }
  if (added.length) {
    sh.getRange(sh.getLastRow() + 1, 1, added.length, MURID_HEADERS.length)
      .setNumberFormat('@').setValues(added);
  }
  return { added: added.length, updated: updated };
}

function updateMurid_(r) {
  const found = findRow_(SHEET_MURID, MURID_HEADERS, r && r.id);
  if (!found) return { ok: false, error: 'Rekod tidak dijumpai' };
  EDITABLE.forEach(k => { if (r[k] !== undefined) found.record[k] = clean_(r[k]); });
  writeRow_(found);
  return { ok: true, record: found.record };
}

function markAttendance_(id, status) {
  const found = findRow_(SHEET_MURID, MURID_HEADERS, id);
  if (!found) return { ok: false, error: 'Murid tidak dijumpai' };
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

function resetAll_() {
  const sh = getSheet_(SHEET_MURID, MURID_HEADERS);
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    const col = MURID_HEADERS.indexOf('status') + 1;
    sh.getRange(2, col, n, 2).clearContent(); // status + masaHadir
  }
  return { ok: true };
}

// ---------- Pengunjung ----------

function addVisitor_(v) {
  v = v || {};
  const nama = clean_(v.nama);
  if (!nama) return { ok: false, error: 'Nama diperlukan' };
  const rec = {
    id: newId_(),
    masa: now_(),
    nama: nama,
    telefon: clean_(v.telefon),
    hubungan: clean_(v.hubungan),
    murid: clean_(v.murid),
    bilangan: Math.min(20, Math.max(1, parseInt(v.bilangan, 10) || 1))
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
    .slice(0, 500);
}

function newId_() {
  return 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 7).toUpperCase();
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
