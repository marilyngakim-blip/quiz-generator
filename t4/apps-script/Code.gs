/**
 * KUIZ MATEMATIK TINGKATAN 4 – Google Apps Script
 *
 * Tampal keseluruhan fail ini dalam Extensions → Apps Script bagi Google Sheet anda.
 * Lihat t4/README.md untuk langkah penuh.
 *
 * Tab Sheet:
 *   Murid  : IDMurid | Nama | Kelas | PIN | Aktif (Y/T)
 *   Kuiz   : QuizId | Tajuk | Topik | Buka | Tutup | Had masa (minit) | Kelas sasaran |
 *            Cubaan dibenarkan | Ranking guna (Pertama/Terbaik) | Tunjuk jawapan (Selepas tutup/Serta-merta)
 *   Input Kuiz : B1 tajuk, B2 topik, soalan bermula A7:
 *            Question | A | B | C | D | Answer | Marks | Gambar (pautan Drive)
 *   Kunci  : QuizId | No | Jawapan | Markah             (kunci jawapan – TIDAK dihantar ke GitHub)
 *   Markah : Masa | QuizId | IDMurid | Nama | Kelas | Cubaan | Markah | Jumlah | Peratus |
 *            Masa diambil (saat) | Jawapan
 *   Draf   : QuizId | IDMurid | Masa | Data
 *   Import Murid : tempat menampal senarai dari Excel/APDM (dikosongkan selepas import)
 *
 * Script properties (Project Settings → Script properties):
 *   GURU_PASSWORD = kata laluan laman guru (guru.html)
 *   GITHUB_TOKEN  = token GitHub (Contents: Read and write, repo ini sahaja)
 *   GITHUB_REPO   = marilyngakim-blip/quiz-generator
 *   WEBAPP_URL    = URL Web App (/exec) selepas Deploy
 *   GITHUB_BRANCH = main  (pilihan)
 *   PAGES_URL     = https://marilyngakim-blip.github.io/quiz-generator/  (pilihan)
 *   SESSION_SECRET dijana sendiri oleh skrip – jangan ubah (jika diubah, semua murid perlu log masuk semula).
 */

const T4_DIR = 't4';
const TAB = {
  MURID: 'Murid', KUIZ: 'Kuiz', INPUT: 'Input Kuiz', KUNCI: 'Kunci',
  MARKAH: 'Markah', DRAF: 'Draf', IMPORT: 'Import Murid'
};
const HEAD = {
  'Murid': ['IDMurid', 'Nama', 'Kelas', 'PIN', 'Aktif'],
  'Kuiz': ['QuizId', 'Tajuk', 'Topik', 'Buka', 'Tutup', 'Had masa (minit)', 'Kelas sasaran',
    'Cubaan dibenarkan', 'Ranking guna', 'Tunjuk jawapan'],
  'Kunci': ['QuizId', 'No', 'Jawapan', 'Markah'],
  'Markah': ['Masa', 'QuizId', 'IDMurid', 'Nama', 'Kelas', 'Cubaan', 'Markah', 'Jumlah', 'Peratus',
    'Masa diambil (saat)', 'Jawapan'],
  'Draf': ['QuizId', 'IDMurid', 'Masa', 'Data']
};
const FIRST_ROW = 7;
const LETTERS = ['A', 'B', 'C', 'D'];
const GRACE_MS = 2 * 60 * 1000;      // kelonggaran rangkaian selepas masa tamat
const CACHE_TTL = 60;                // saat: ranking/statistik dikemas kini setiap minit
const TOKEN_HARI = 30;
const PIN_MAX_SALAH = 5;
const PIN_KUNCI_SAAT = 300;          // 5 minit
const HAD_MASA_MS = 4.5 * 60 * 1000; // Google menghentikan skrip selepas 6 minit
const masaHampirTamat_ = mula => Date.now() - mula > HAD_MASA_MS;

/* ================================================================== */
/* Web App                                                             */
/* ================================================================== */

function doGet() {
  return json_({ ok: true, message: 'Kuiz T4 aktif.' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Permintaan tidak sah.' });
  }
  const routes = {
    classes: kelasSenarai_, students: muridSenarai_, login: login_,
    home: home_, start: mula_, saveDraft: simpanDraf_, submit: hantar_, review: semakJawapan_,
    ranking: rankingMurid_,
    guruLogin: guruLogin_, guruDashboard: guruDashboard_, guruBelum: guruBelum_,
    guruRanking: guruRanking_, guruItem: guruItem_, guruCsv: guruCsv_
  };
  const fn = routes[req.action];
  if (!fn) return json_({ ok: false, error: 'Tindakan tidak sah.' });
  try {
    return json_(fn(req));
  } catch (err) {
    if (err && err.userMsg) return json_({ ok: false, error: err.userMsg, auth: !!err.auth });
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'Ralat pelayan: ' + (err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ralat_(msg, auth) {
  const e = new Error(msg);
  e.userMsg = msg;
  e.auth = !!auth;
  return e;
}

function sibuk_() {
  return { ok: false, error: 'Pelayan sibuk. Cuba sebentar lagi.', retry: true };
}

/* ================================================================== */
/* Utiliti data                                                        */
/* ================================================================== */

const norm_ = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw ralat_('Tab "' + name + '" tiada dalam Sheet. Jalankan menu KUIZ T4 → Sediakan Sheet.');
  return sh;
}

function dataRows_(name, ncols) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ncols).getValues();
}

// Tarikh dari sel Sheet (objek Date) atau teks "2026-11-03 08:00" / "3/11/2026 8:00" (waktu Malaysia).
function toMs_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - 8, +(m[5] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0) - 8, +(m[5] || 0));
  return null;
}

function pinStr_(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d{1,4}$/.test(s) ? ('0000' + s).slice(-4) : s;
}

function gred_(p) {
  return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'A-' : p >= 65 ? 'B+' : p >= 60 ? 'B' :
    p >= 55 ? 'C+' : p >= 50 ? 'C' : p >= 45 ? 'D' : p >= 40 ? 'E' : 'G';
}
const GRED = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G'];

// Elak teks dibaca sebagai formula.
function safe_(s) {
  s = String(s == null ? '' : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ---------- Cache (±60 s) ---------- */

function cache_() { return CacheService.getScriptCache(); }

// Versi cache: ditukar oleh menu supaya perubahan guru terus berkesan.
function ver_() {
  const c = cache_();
  let v = c.get('ver');
  if (!v) { v = String(Date.now()); c.put('ver', v, 21600); }
  return v;
}

function bust_() { cache_().put('ver', Date.now().toString(36) + Math.random().toString(36).slice(2, 8), 21600); }

function cached_(key, fn, ttl) {
  const c = cache_();
  const k = ver_() + ':' + key;
  const hit = c.get(k);
  if (hit) return JSON.parse(hit);
  const val = fn();
  const s = JSON.stringify(val);
  if (s.length < 95000) c.put(k, s, ttl || CACHE_TTL);
  return val;
}

function uncache_(key) { cache_().remove(ver_() + ':' + key); }

/* ---------- Murid, Kuiz, Kunci, Markah ---------- */

function muridAll_() {
  return cached_('murid', () => dataRows_(TAB.MURID, 5).map(r => ({
    id: String(r[0]).trim(), nama: String(r[1]).trim(), kelas: String(r[2]).trim(),
    pin: pinStr_(r[3]), aktif: !/^(t|tidak|n|no)$/i.test(String(r[4]).trim())
  })).filter(m => m.id && m.nama && m.kelas));
}

function muridAktif_() { return muridAll_().filter(m => m.aktif); }

function kelasAll_() {
  const seen = {};
  muridAktif_().forEach(m => { if (!seen[norm_(m.kelas)]) seen[norm_(m.kelas)] = m.kelas; });
  return Object.keys(seen).map(k => seen[k]).sort((a, b) => a.localeCompare(b, 'ms', { numeric: true }));
}

function kuizAll_() {
  return cached_('kuiz', () => dataRows_(TAB.KUIZ, 10).filter(r => String(r[0]).trim()).map(r => {
    const kelas = String(r[6]).trim();
    const cub = String(r[7]).trim();
    return {
      id: String(r[0]).trim(), tajuk: String(r[1]).trim(), topik: String(r[2]).trim(),
      buka: toMs_(r[3]), tutup: toMs_(r[4]),
      had: Number(r[5]) > 0 ? Number(r[5]) : 0,
      kelas: !kelas || /^semua$/i.test(kelas) ? [] : kelas.split(/[,;\n]+/).map(norm_).filter(Boolean),
      cubaan: cub === '' ? 1 : (/tanpa|∞/i.test(cub) || Number(cub) === 0 ? 0 : Math.max(1, Math.floor(Number(cub)) || 1)),
      ranking: /terbaik/i.test(String(r[8])) ? 'Terbaik' : 'Pertama',
      tunjuk: /serta|segera|terus|^y/i.test(String(r[9]).trim()) ? 'Serta-merta' : 'Selepas tutup'
    };
  }));
}

function kuiz_(id) { return kuizAll_().find(q => q.id === id) || null; }

const untukKelas_ = (q, kelas) => !q.kelas.length || q.kelas.indexOf(norm_(kelas)) >= 0;
const sudahBuka_ = (q, now) => q.buka != null && q.buka <= now;
const sudahTutup_ = (q, now) => q.tutup != null && q.tutup <= now;
const dibuka_ = (q, now) => sudahBuka_(q, now) && !sudahTutup_(q, now);
const bolehLihatJawapan_ = (q, now) => q.tunjuk === 'Serta-merta' || sudahTutup_(q, now);

function kelasKuiz_(q) {
  const all = kelasAll_();
  return q.kelas.length ? all.filter(k => q.kelas.indexOf(norm_(k)) >= 0) : all;
}

function kunci_(quizId) {
  return cached_('kunci:' + quizId, () => dataRows_(TAB.KUNCI, 4)
    .filter(r => String(r[0]).trim() === quizId)
    .sort((a, b) => a[1] - b[1])
    .map(r => ({ jawapan: String(r[2]).trim().toUpperCase(), markah: Number(r[3]) || 1 })), 300);
}

function markahRows_() {
  return dataRows_(TAB.MARKAH, 11).filter(r => r[1] !== '').map(r => ({
    at: r[0] instanceof Date ? r[0].getTime() : toMs_(r[0]),
    quizId: String(r[1]).trim(), id: String(r[2]).trim(), nama: String(r[3]), kelas: String(r[4]),
    attempt: Number(r[5]) || 1, score: Number(r[6]) || 0, total: Number(r[7]) || 0,
    pct: Number(r[8]) || 0, time: Number(r[9]) || 0, jawapan: String(r[10] || '')
  }));
}

function markahMurid_(id, segar) {
  const fn = () => markahRows_().filter(r => r.id === id);
  if (segar) { uncache_('mk:' + id); return fn(); }
  return cached_('mk:' + id, fn);
}

// Cubaan yang dikira untuk ranking/statistik: Pertama atau Terbaik.
function pilihCubaan_(rows, mode) {
  const best = {};
  rows.forEach(r => {
    const b = best[r.id];
    if (!b) { best[r.id] = r; return; }
    if (mode === 'Terbaik') {
      if (r.score > b.score || (r.score === b.score && (r.time < b.time || (r.time === b.time && r.attempt < b.attempt)))) best[r.id] = r;
    } else if (r.attempt < b.attempt) {
      best[r.id] = r;
    }
  });
  return best;
}

// Susun: markah tinggi dahulu, seri → masa lebih singkat. Kedudukan sama jika kedua-duanya sama.
function susunRanking_(list, key) {
  list.sort((a, b) => (b[key] - a[key]) || (a.time - b.time) || a.nama.localeCompare(b.nama));
  list.forEach((r, i) => {
    const p = list[i - 1];
    r.rank = p && p[key] === r[key] && p.time === r.time ? p.rank : i + 1;
  });
  return list;
}

/* ================================================================== */
/* Sesi (token ringkas, tanpa PIN)                                     */
/* ================================================================== */

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SESSION_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', s);
  }
  return s;
}

function hmac_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret_())).replace(/=+$/, '');
}

function tandatangan_(obj) {
  const p = Utilities.base64EncodeWebSafe(JSON.stringify(obj), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return p + '.' + hmac_(p);
}

function bacaToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || hmac_(parts[0]) !== parts[1]) return null;
  try {
    let p = parts[0];
    while (p.length % 4) p += '=';
    const obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString('UTF-8'));
    return obj.e > Date.now() ? obj : null;
  } catch (e) {
    return null;
  }
}

// Token menjadi tidak sah jika PIN murid ditukar.
const tagPin_ = m => hmac_('pin:' + m.id + ':' + m.pin).slice(0, 10);

function murid_(req) {
  const t = bacaToken_(req.token);
  if (!t || t.r !== 'm') throw ralat_('Sesi tamat. Sila log masuk semula.', true);
  const m = muridAll_().find(x => x.id === t.u);
  if (!m || !m.aktif || tagPin_(m) !== t.p) throw ralat_('Sesi tamat. Sila log masuk semula.', true);
  return m;
}

function kuizMurid_(m, quizId) {
  const q = kuiz_(String(quizId || ''));
  if (!q || !untukKelas_(q, m.kelas) || !sudahBuka_(q, Date.now())) throw ralat_('Kuiz tidak dijumpai atau belum dibuka.');
  return q;
}

/* ================================================================== */
/* Murid: log masuk                                                    */
/* ================================================================== */

function kelasSenarai_() {
  return { ok: true, kelas: cached_('kelas', kelasAll_) };
}

function muridSenarai_(req) {
  const k = norm_(req.kelas);
  return {
    ok: true,
    murid: muridAktif_().filter(m => norm_(m.kelas) === k)
      .map(m => ({ id: m.id, nama: m.nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'ms'))
  };
}

function login_(req) {
  const id = String(req.id || '').trim();
  const pin = String(req.pin || '').trim();
  const c = cache_();
  const kunci = c.get('pinlock:' + id);
  if (kunci) {
    const min = Math.max(1, Math.ceil((Number(kunci) - Date.now()) / 60000));
    return { ok: false, error: 'Terlalu banyak cubaan PIN salah. Cuba lagi dalam ' + min + ' minit.', locked: true };
  }
  const m = muridAktif_().find(x => x.id === id);
  if (!m || !m.pin || m.pin !== pin) {
    const n = (Number(c.get('pinfail:' + id)) || 0) + 1;
    if (n >= PIN_MAX_SALAH) {
      c.put('pinlock:' + id, String(Date.now() + PIN_KUNCI_SAAT * 1000), PIN_KUNCI_SAAT);
      c.remove('pinfail:' + id);
      return { ok: false, error: 'PIN salah ' + PIN_MAX_SALAH + ' kali. Log masuk dikunci 5 minit.', locked: true };
    }
    c.put('pinfail:' + id, String(n), PIN_KUNCI_SAAT);
    return { ok: false, error: 'PIN salah. Tinggal ' + (PIN_MAX_SALAH - n) + ' cubaan lagi.' };
  }
  c.remove('pinfail:' + id);
  const token = tandatangan_({ r: 'm', u: m.id, p: tagPin_(m), e: Date.now() + TOKEN_HARI * 864e5 });
  return { ok: true, token: token, nama: m.nama, kelas: m.kelas };
}

/* ================================================================== */
/* Murid: muka depan                                                   */
/* ================================================================== */

function ringkasCubaan_(r) {
  return { attempt: r.attempt, score: r.score, total: r.total, pct: r.pct, time: r.time, at: r.at };
}

function home_(req) {
  const m = murid_(req);
  const now = Date.now();
  const mine = markahMurid_(m.id);
  const drafts = drafMurid_(m.id);
  const list = kuizAll_().filter(q => untukKelas_(q, m.kelas) && sudahBuka_(q, now) && kunci_(q.id).length);
  const out = list.map(q => {
    const att = mine.filter(r => r.quizId === q.id).sort((a, b) => a.attempt - b.attempt);
    const last = att.length ? att[att.length - 1].attempt : 0;
    const d = drafts[q.id];
    const sedang = !!(d && d.a === last + 1);
    const open = dibuka_(q, now);
    return {
      id: q.id, tajuk: q.tajuk, topik: q.topik, buka: q.buka, tutup: q.tutup, had: q.had,
      cubaan: q.cubaan, ranking: q.ranking, n: kunci_(q.id).length,
      attempts: att.map(ringkasCubaan_), sedang: sedang && open, open: open,
      bolehMula: open && (sedang || !q.cubaan || att.length < q.cubaan),
      bolehSemak: att.length > 0 && bolehLihatJawapan_(q, now)
    };
  });
  const buka = out.filter(q => q.open).sort((a, b) => (a.tutup || 9e15) - (b.tutup || 9e15));
  const tutup = out.filter(q => !q.open).sort((a, b) => b.tutup - a.tutup).slice(0, 10);
  return { ok: true, now: now, nama: m.nama, kelas: m.kelas, buka: buka, tutup: tutup };
}

/* ================================================================== */
/* Murid: draf (sambung di peranti lain)                               */
/* ================================================================== */
// Satu baris setiap QuizId + IDMurid. Baris tidak dipadam (hanya dikosongkan) supaya
// nombor baris kekal dan boleh disimpan dalam cache.

function drafSheet_() { return sheet_(TAB.DRAF); }

function drafCari_(sh, quizId, id) {
  const c = cache_();
  const ck = 'drow:' + quizId + ':' + id;
  const r = Number(c.get(ck));
  if (r >= 2 && r <= sh.getLastRow()) {
    const v = sh.getRange(r, 1, 1, 2).getValues()[0];
    if (String(v[0]) === quizId && String(v[1]) === id) return r;
  }
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const v = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < v.length; i++) {
    if (String(v[i][0]) === quizId && String(v[i][1]) === id) {
      c.put(ck, String(i + 2), 21600);
      return i + 2;
    }
  }
  return -1;
}

function drafBaca_(sh, row) {
  if (row < 2) return null;
  try {
    const d = JSON.parse(String(sh.getRange(row, 4).getValue() || 'null'));
    return d && d.a ? d : null;
  } catch (e) {
    return null;
  }
}

function drafTulis_(sh, row, quizId, id, d) {
  const values = [[quizId, id, new Date(), d ? JSON.stringify(d) : '']];
  if (row > 1) {
    sh.getRange(row, 1, 1, 4).setValues(values);
  } else {
    row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 4).setValues(values);
    cache_().put('drow:' + quizId + ':' + id, String(row), 21600);
  }
  uncache_('df:' + id);
}

function drafMurid_(id) {
  return cached_('df:' + id, () => {
    const out = {};
    dataRows_(TAB.DRAF, 4).forEach(r => {
      if (String(r[1]) !== id || !r[3]) return;
      try { const d = JSON.parse(r[3]); out[String(r[0])] = { a: d.a }; } catch (e) { /* abaikan */ }
    });
    return out;
  });
}

function tarikhAkhir_(q, mulaMs) {
  let d = q.tutup || null;
  if (q.had) d = d ? Math.min(d, mulaMs + q.had * 60000) : mulaMs + q.had * 60000;
  return d;
}

function jawapanSah_(arr, n) {
  if (!Array.isArray(arr)) return null;
  if (arr.length > n) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = String(arr[i] || '').toUpperCase().slice(0, 1);
    out.push(LETTERS.indexOf(a) >= 0 ? a : '');
  }
  return out;
}

function kunciTulis_(timeoutMs) {
  const lock = LockService.getScriptLock();
  return lock.tryLock(timeoutMs) ? lock : null;
}

function mula_(req) {
  const m = murid_(req);
  const q = kuizMurid_(m, req.quizId);
  const now = Date.now();
  if (!dibuka_(q, now)) return { ok: false, error: 'Kuiz ini sudah ditutup.' };
  const key = kunci_(q.id);
  if (!key.length) return { ok: false, error: 'Kuiz ini belum diterbitkan.' };
  const lock = kunciTulis_(15000);
  if (!lock) return sibuk_();
  try {
    const done = markahMurid_(m.id, true).filter(r => r.quizId === q.id);
    const attempt = done.reduce((x, r) => Math.max(x, r.attempt), 0) + 1;
    const sh = drafSheet_();
    const row = drafCari_(sh, q.id, m.id);
    let d = drafBaca_(sh, row);
    if (d && d.a !== attempt) d = null;
    if (!d) {
      if (q.cubaan && done.length >= q.cubaan) {
        return { ok: false, error: 'Anda sudah menggunakan semua ' + q.cubaan + ' cubaan bagi kuiz ini.' };
      }
      d = { a: attempt, s: now, ans: [], t: now };
      drafTulis_(sh, row, q.id, m.id, d);
    }
    const akhir = tarikhAkhir_(q, d.s);
    if (akhir && now > akhir + GRACE_MS) {
      // Masa tamat semasa murid tiada (contoh telefon ditutup): hantar jawapan yang tersimpan.
      const res = selesai_(m, q, key, jawapanSah_(d.ans, key.length) || [], d.s, now, done, sh, row);
      res.finished = true;
      return res;
    }
    return {
      ok: true, now: now, attempt: attempt, startedAt: d.s, deadline: akhir, answers: d.ans || [], savedAt: d.t || d.s,
      n: key.length, had: q.had, cubaan: q.cubaan, tajuk: q.tajuk, tutup: q.tutup,
      sebelum: done.sort((a, b) => a.attempt - b.attempt).map(ringkasCubaan_)
    };
  } finally {
    lock.releaseLock();
  }
}

function simpanDraf_(req) {
  const m = murid_(req);
  const q = kuizMurid_(m, req.quizId);
  const key = kunci_(q.id);
  const ans = jawapanSah_(req.answers, key.length);
  if (!ans) return { ok: false, error: 'Data jawapan tidak sah.' };
  const now = Date.now();
  const lock = kunciTulis_(10000);
  if (!lock) return sibuk_();
  try {
    const sh = drafSheet_();
    const row = drafCari_(sh, q.id, m.id);
    const d = drafBaca_(sh, row);
    if (!d || d.a !== Number(req.attempt)) return { ok: false, error: 'Draf tidak dijumpai. Muat semula laman.', reload: true };
    const akhir = tarikhAkhir_(q, d.s);
    if (akhir && now > akhir + GRACE_MS) return { ok: false, error: 'Masa sudah tamat.', expired: true };
    d.ans = ans;
    d.t = now;
    drafTulis_(sh, row, q.id, m.id, d);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, at: now };
}

/* ================================================================== */
/* Murid: hantar & semak                                               */
/* ================================================================== */

function hantar_(req) {
  const m = murid_(req);
  const q = kuizMurid_(m, req.quizId);
  const sid = String(req.submitId || '').replace(/[^\w-]/g, '').slice(0, 60);
  const c = cache_();
  const sk = 'sub:' + m.id + ':' + sid;
  if (sid) { const hit = c.get(sk); if (hit) return JSON.parse(hit); }
  const key = kunci_(q.id);
  if (!key.length) return { ok: false, error: 'Kuiz ini belum diterbitkan.' };
  let ans = jawapanSah_(req.answers, key.length);
  if (!ans || (Array.isArray(req.answers) && req.answers.length !== key.length)) {
    return { ok: false, error: 'Bilangan jawapan tidak sepadan dengan kuiz. Muat semula laman dan cuba lagi.' };
  }
  const now = Date.now();
  const lock = kunciTulis_(25000);
  if (!lock) return sibuk_();
  let res;
  try {
    if (sid) { const hit = c.get(sk); if (hit) return JSON.parse(hit); }
    const done = markahMurid_(m.id, true).filter(r => r.quizId === q.id);
    const attempt = done.reduce((x, r) => Math.max(x, r.attempt), 0) + 1;
    const sh = drafSheet_();
    const row = drafCari_(sh, q.id, m.id);
    let d = drafBaca_(sh, row);
    if (d && d.a !== attempt) d = null;
    let mulaMs;
    if (d) {
      mulaMs = d.s;
      const akhir = tarikhAkhir_(q, mulaMs);
      // Lewat melebihi kelonggaran: guna jawapan terakhir yang disimpan sebelum masa tamat.
      if (akhir && now > akhir + GRACE_MS) ans = jawapanSah_(d.ans, key.length) || ans.map(() => '');
    } else {
      // Tiada draf (contoh dipadam guru): terima hanya jika kuiz masih dibuka dan cubaan masih ada.
      if (q.tutup && now > q.tutup + GRACE_MS) return { ok: false, error: 'Kuiz ini sudah ditutup.' };
      if (q.cubaan && done.length >= q.cubaan) return { ok: false, error: 'Anda sudah menggunakan semua cubaan bagi kuiz ini.' };
      const el = Math.min(Math.max(Number(req.elapsed) || 0, 1), q.had ? q.had * 60 : 6 * 3600);
      mulaMs = now - el * 1000;
    }
    res = selesai_(m, q, key, ans, mulaMs, now, done, sh, row);
    if (sid) c.put(sk, JSON.stringify(res), 900);
  } finally {
    lock.releaseLock();
  }
  return res;
}

function gredkan_(key, ans) {
  let score = 0, total = 0;
  const results = key.map((k, i) => {
    const correct = ans[i] === k.jawapan;
    total += k.markah;
    if (correct) score += k.markah;
    return { chosen: ans[i] || '', answer: k.jawapan, correct: correct, marks: k.markah };
  });
  return { score: score, total: total, results: results };
}

// Dipanggil semasa lock dipegang: rekod markah, kosongkan draf, pulangkan keputusan.
function selesai_(m, q, key, ans, mulaMs, now, done, sh, row) {
  const g = gredkan_(key, ans);
  const attempt = done.reduce((x, r) => Math.max(x, r.attempt), 0) + 1;
  const akhir = tarikhAkhir_(q, mulaMs);
  const time = Math.max(1, Math.round((Math.min(now, akhir || now) - mulaMs) / 1000));
  const pct = g.total ? Math.round(g.score / g.total * 100) : 0;
  sheet_(TAB.MARKAH).appendRow([new Date(now), q.id, m.id, safe_(m.nama), safe_(m.kelas), attempt,
    g.score, g.total, pct, time, safe_(ans.map(a => a || '-').join(' '))]);
  if (row > 1) drafTulis_(sh, row, q.id, m.id, null);
  uncache_('mk:' + m.id);
  const show = bolehLihatJawapan_(q, now);
  const used = done.length + 1;
  return {
    ok: true, quizId: q.id, attempt: attempt, score: g.score, total: g.total, pct: pct, gred: gred_(pct),
    time: time, sebelum: done.sort((a, b) => a.attempt - b.attempt).map(ringkasCubaan_),
    showAnswers: show, results: show ? g.results : null, tutup: q.tutup,
    bakiCubaan: q.cubaan ? Math.max(0, q.cubaan - used) : null,
    bolehUlang: dibuka_(q, now) && (!q.cubaan || used < q.cubaan)
  };
}

function semakJawapan_(req) {
  const m = murid_(req);
  const q = kuizMurid_(m, req.quizId);
  const now = Date.now();
  if (!bolehLihatJawapan_(q, now)) {
    return { ok: false, error: 'Jawapan betul akan dipaparkan selepas kuiz ditutup.', tutup: q.tutup };
  }
  const att = markahMurid_(m.id).filter(r => r.quizId === q.id).sort((a, b) => a.attempt - b.attempt);
  if (!att.length) return { ok: false, error: 'Anda belum menjawab kuiz ini.' };
  const pilih = att.find(r => r.attempt === Number(req.attempt)) || att[att.length - 1];
  const key = kunci_(q.id);
  const ans = pilih.jawapan.split(' ').map(a => a === '-' ? '' : a);
  const g = gredkan_(key, ans);
  return {
    ok: true, quizId: q.id, tajuk: q.tajuk, attempt: pilih.attempt, score: pilih.score, total: pilih.total,
    pct: pilih.pct, gred: gred_(pilih.pct), time: pilih.time, results: g.results, cubaan: att.map(ringkasCubaan_)
  };
}

/* ================================================================== */
/* Ranking                                                             */
/* ================================================================== */

function rankingKuiz_(q, kelas) {
  return cached_('rk:' + q.id + ':' + norm_(kelas), () => {
    const ahli = {};
    muridAktif_().forEach(m => { if (norm_(m.kelas) === norm_(kelas)) ahli[m.id] = m; });
    const picks = pilihCubaan_(markahRows_().filter(r => r.quizId === q.id && ahli[r.id]), q.ranking);
    const list = Object.keys(picks).map(id => ({
      id: id, nama: ahli[id].nama, score: picks[id].score, total: picks[id].total,
      pct: picks[id].pct, time: picks[id].time, attempt: picks[id].attempt
    }));
    return susunRanking_(list, 'score');
  });
}

// Keseluruhan: purata peratus semua kuiz kelas itu yang sudah dibuka (tidak dijawab = 0).
function rankingKeseluruhan_(kelas) {
  return cached_('rkall:' + norm_(kelas), () => {
    const now = Date.now();
    const quizzes = kuizAll_().filter(q => untukKelas_(q, kelas) && sudahBuka_(q, now) && kunci_(q.id).length);
    const ahli = muridAktif_().filter(m => norm_(m.kelas) === norm_(kelas));
    const ids = {};
    ahli.forEach(m => { ids[m.id] = { id: m.id, nama: m.nama, sum: 0, time: 0, dijawab: 0 }; });
    const rows = markahRows_().filter(r => ids[r.id]);
    quizzes.forEach(q => {
      const picks = pilihCubaan_(rows.filter(r => r.quizId === q.id), q.ranking);
      Object.keys(picks).forEach(id => {
        ids[id].sum += picks[id].pct;
        ids[id].time += picks[id].time;
        ids[id].dijawab++;
      });
    });
    const list = Object.keys(ids).map(id => {
      const x = ids[id];
      return { id: id, nama: x.nama, pct: quizzes.length ? Math.round(x.sum / quizzes.length * 10) / 10 : 0,
        time: x.time, dijawab: x.dijawab, kuiz: quizzes.length };
    }).filter(x => x.dijawab > 0);
    return susunRanking_(list, 'pct');
  });
}

function rankingMurid_(req) {
  const m = murid_(req);
  let list, q = null;
  if (req.quizId === 'semua') {
    list = rankingKeseluruhan_(m.kelas);
  } else {
    q = kuizMurid_(m, req.quizId);
    list = rankingKuiz_(q, m.kelas);
  }
  // Murid yang baru menghantar mesti nampak dirinya walaupun cache belum tamat.
  if (!list.some(r => r.id === m.id) && markahMurid_(m.id).some(r => !q || r.quizId === q.id)) {
    uncache_(q ? 'rk:' + q.id + ':' + norm_(m.kelas) : 'rkall:' + norm_(m.kelas));
    list = q ? rankingKuiz_(q, m.kelas) : rankingKeseluruhan_(m.kelas);
  }
  // Hanya 10 teratas + kedudukan murid itu sendiri (tiada IDMurid murid lain).
  const awam = r => {
    const o = { rank: r.rank, nama: r.nama, pct: r.pct, time: r.time };
    if (q) { o.score = r.score; o.total = r.total; } else { o.dijawab = r.dijawab; o.kuiz = r.kuiz; }
    return o;
  };
  const me = list.find(r => r.id === m.id);
  return {
    ok: true, kelas: m.kelas, tajuk: q ? q.tajuk : 'Keseluruhan', ranking: q ? q.ranking : null,
    bil: list.length, top: list.slice(0, 10).map(r => Object.assign(awam(r), { saya: r.id === m.id })),
    saya: me ? awam(me) : null
  };
}

/* ================================================================== */
/* Guru                                                                */
/* ================================================================== */

function guruLogin_(req) {
  const c = cache_();
  if (c.get('gurulock')) return { ok: false, error: 'Terlalu banyak cubaan salah. Cuba lagi dalam 5 minit.' };
  const pass = String(PropertiesService.getScriptProperties().getProperty('GURU_PASSWORD') || '');
  if (!pass) return { ok: false, error: 'Kata laluan guru belum ditetapkan (Script property GURU_PASSWORD).' };
  if (String(req.password || '') !== pass) {
    const n = (Number(c.get('gurufail')) || 0) + 1;
    if (n >= PIN_MAX_SALAH) { c.put('gurulock', '1', PIN_KUNCI_SAAT); c.remove('gurufail'); }
    else c.put('gurufail', String(n), PIN_KUNCI_SAAT);
    return { ok: false, error: 'Kata laluan salah.' };
  }
  c.remove('gurufail');
  return { ok: true, token: tandatangan_({ r: 'g', p: hmac_('guru:' + pass).slice(0, 10), e: Date.now() + 12 * 3600e3 }) };
}

function guru_(req) {
  const t = bacaToken_(req.token);
  const pass = String(PropertiesService.getScriptProperties().getProperty('GURU_PASSWORD') || '');
  if (!t || t.r !== 'g' || !pass || t.p !== hmac_('guru:' + pass).slice(0, 10)) {
    throw ralat_('Sesi guru tamat. Sila log masuk semula.', true);
  }
}

function statistik_(pcts) {
  const g = {};
  GRED.forEach(x => { g[x] = 0; });
  pcts.forEach(p => { g[gred_(p)]++; });
  return {
    purata: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10 : null,
    tertinggi: pcts.length ? Math.max.apply(null, pcts) : null,
    terendah: pcts.length ? Math.min.apply(null, pcts) : null,
    gred: g
  };
}

function guruDashboard_(req) {
  guru_(req);
  return cached_('dash', () => {
    const now = Date.now();
    const murid = muridAktif_();
    const rows = markahRows_();
    const quizzes = kuizAll_().slice().sort((a, b) => (b.buka || 0) - (a.buka || 0)).map(q => {
      const qr = rows.filter(r => r.quizId === q.id);
      const picks = pilihCubaan_(qr, q.ranking);
      const kelas = kelasKuiz_(q).map(k => {
        const ahli = murid.filter(m => norm_(m.kelas) === norm_(k));
        const pcts = ahli.filter(m => picks[m.id]).map(m => picks[m.id].pct);
        return Object.assign({ kelas: k, jumlah: ahli.length, sudah: pcts.length, belum: ahli.length - pcts.length,
          penyertaan: ahli.length ? Math.round(pcts.length / ahli.length * 100) : 0 }, statistik_(pcts));
      });
      const jumlah = kelas.reduce((a, k) => a + k.jumlah, 0);
      const sudah = kelas.reduce((a, k) => a + k.sudah, 0);
      const ids = {};
      murid.forEach(m => { if (untukKelas_(q, m.kelas)) ids[m.id] = 1; });
      const semua = statistik_(Object.keys(picks).filter(id => ids[id]).map(id => picks[id].pct));
      return {
        id: q.id, tajuk: q.tajuk, topik: q.topik, buka: q.buka, tutup: q.tutup, had: q.had, cubaan: q.cubaan,
        ranking: q.ranking, tunjuk: q.tunjuk, status: !sudahBuka_(q, now) ? 'Belum dibuka' : sudahTutup_(q, now) ? 'Ditutup' : 'Dibuka',
        n: kunci_(q.id).length, kelas: kelas,
        semua: Object.assign({ jumlah: jumlah, sudah: sudah, penyertaan: jumlah ? Math.round(sudah / jumlah * 100) : 0 }, semua)
      };
    });
    return { ok: true, now: now, kelas: kelasAll_(), bilMurid: murid.length, quizzes: quizzes };
  });
}

function guruKuiz_(req) {
  guru_(req);
  const q = kuiz_(String(req.quizId || ''));
  if (!q) throw ralat_('Kuiz tidak dijumpai.');
  return q;
}

function guruBelum_(req) {
  const q = guruKuiz_(req);
  const ada = {};
  markahRows_().forEach(r => { if (r.quizId === q.id) ada[r.id] = 1; });
  const murid = muridAktif_();
  const kelas = kelasKuiz_(q).map(k => {
    const ahli = murid.filter(m => norm_(m.kelas) === norm_(k));
    return {
      kelas: k, jumlah: ahli.length,
      belum: ahli.filter(m => !ada[m.id]).map(m => m.nama).sort((a, b) => a.localeCompare(b, 'ms'))
    };
  });
  return { ok: true, quizId: q.id, tajuk: q.tajuk, tutup: q.tutup, kelas: kelas };
}

function guruRanking_(req) {
  guru_(req);
  let kelas, perKelas, q = null;
  if (req.quizId === 'semua') {
    kelas = kelasAll_();
    perKelas = kelas.map(k => ({ kelas: k, list: rankingKeseluruhan_(k), jumlah: muridAktif_().filter(m => norm_(m.kelas) === norm_(k)).length }));
  } else {
    q = guruKuiz_(req);
    kelas = kelasKuiz_(q);
    perKelas = kelas.map(k => ({ kelas: k, list: rankingKuiz_(q, k), jumlah: muridAktif_().filter(m => norm_(m.kelas) === norm_(k)).length }));
  }
  const antara = perKelas.map(x => ({
    kelas: x.kelas, bil: x.list.length, jumlah: x.jumlah,
    purata: x.list.length ? Math.round(x.list.reduce((a, r) => a + r.pct, 0) / x.list.length * 10) / 10 : null
  }));
  antara.sort((a, b) => (b.purata == null ? -1 : b.purata) - (a.purata == null ? -1 : a.purata));
  antara.forEach((x, i) => { x.rank = i + 1; });
  return {
    ok: true, tajuk: q ? q.tajuk : 'Keseluruhan', ranking: q ? q.ranking : null, antara: antara,
    kelas: perKelas.map(x => ({ kelas: x.kelas, list: x.list.map(r => {
      const o = Object.assign({}, r);
      delete o.id;
      return o;
    }) }))
  };
}

function guruItem_(req) {
  const q = guruKuiz_(req);
  const key = kunci_(q.id);
  const kelasPilih = norm_(req.kelas);
  const murid = {};
  muridAll_().forEach(m => { murid[m.id] = m; });
  const rows = markahRows_().filter(r => r.quizId === q.id && murid[r.id] &&
    (!kelasPilih || norm_(murid[r.id].kelas) === kelasPilih));
  const picks = pilihCubaan_(rows, q.ranking);
  const ids = Object.keys(picks);
  const items = key.map((k, i) => {
    const kira = { A: 0, B: 0, C: 0, D: 0, '-': 0 };
    ids.forEach(id => {
      const a = (picks[id].jawapan.split(' ')[i] || '-');
      kira[kira[a] != null ? a : '-']++;
    });
    let peng = null;
    LETTERS.forEach(L => {
      if (L !== k.jawapan && kira[L] > 0 && (!peng || kira[L] > kira[peng])) peng = L;
    });
    return {
      no: i + 1, jawapan: k.jawapan, markah: k.markah, kira: kira,
      betul: ids.length ? Math.round(kira[k.jawapan] / ids.length * 100) : null,
      pengganggu: peng, pengganggu_bil: peng ? kira[peng] : 0
    };
  });
  return { ok: true, quizId: q.id, tajuk: q.tajuk, ranking: q.ranking, bil: ids.length, items: items };
}

function guruCsv_(req) {
  guru_(req);
  const semua = req.quizId === 'semua';
  const q = semua ? null : guruKuiz_(req);
  const kuiz = {};
  kuizAll_().forEach(x => { kuiz[x.id] = x; });
  const rows = markahRows_().filter(r => semua || r.quizId === q.id);
  // Tandakan cubaan yang dikira untuk ranking.
  const dikira = {};
  Object.keys(kuiz).forEach(id => {
    const picks = pilihCubaan_(rows.filter(r => r.quizId === id), kuiz[id].ranking);
    Object.keys(picks).forEach(s => { dikira[id + '|' + s + '|' + picks[s].attempt] = 1; });
  });
  return {
    ok: true,
    header: ['Masa', 'QuizId', 'Tajuk', 'IDMurid', 'Nama', 'Kelas', 'Cubaan', 'Markah', 'Jumlah', 'Peratus', 'Gred',
      'Masa diambil (saat)', 'Dikira untuk ranking', 'Jawapan'],
    rows: rows.map(r => [r.at ? new Date(r.at).toISOString() : '', r.quizId, kuiz[r.quizId] ? kuiz[r.quizId].tajuk : '',
      r.id, r.nama, r.kelas, r.attempt, r.score, r.total, r.pct, gred_(r.pct), r.time,
      dikira[r.quizId + '|' + r.id + '|' + r.attempt] ? 'Ya' : '', r.jawapan])
  };
}

/* ================================================================== */
/* Menu dalam Sheet                                                    */
/* ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KUIZ T4')
    .addItem('1. Sediakan Sheet (kali pertama)', 'sediakanSheet')
    .addItem('Masukkan data contoh (2 kelas, 10 murid, 1 kuiz)', 'masukkanDataContoh')
    .addSeparator()
    .addItem('Import senarai murid (dari tab Import Murid)', 'importMurid')
    .addItem('Jana PIN rawak', 'janaPin')
    .addSeparator()
    .addItem('Kosongkan Input Kuiz', 'kosongkanInput')
    .addItem('Import dari Google Form', 'importDariForm')
    .addItem('Terbitkan kuiz ke GitHub', 'terbitkanKuiz')
    .addSeparator()
    .addItem('Buka kuiz (baris dipilih di tab Kuiz)', 'bukaKuiz')
    .addItem('Tutup kuiz (baris dipilih di tab Kuiz)', 'tutupKuiz')
    .addItem('Kemas kini laman sekarang (kosongkan cache)', 'kosongkanCache')
    .addToUi();
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function tajukTab_(sh, head) {
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function sediakanSheet() {
  const ss = SpreadsheetApp.getActive();
  try { ss.setSpreadsheetTimeZone('Asia/Kuala_Lumpur'); } catch (e) { /* abaikan */ }
  Object.keys(HEAD).forEach(name => tajukTab_(getOrCreate_(ss, name), HEAD[name]));
  const murid = ss.getSheetByName(TAB.MURID);
  murid.getRange('A:A').setNumberFormat('@');
  murid.getRange('D:D').setNumberFormat('@'); // PIN kekal 4 digit (contoh 0427)
  ss.getSheetByName(TAB.KUIZ).getRange('D:E').setNumberFormat('yyyy-mm-dd hh:mm');
  ss.getSheetByName(TAB.MARKAH).getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  ss.getSheetByName(TAB.MARKAH).getRange('K:K').setNumberFormat('@');
  ss.getSheetByName(TAB.DRAF).getRange('D:D').setNumberFormat('@');
  ss.getSheetByName(TAB.KUNCI).getRange('C:C').setNumberFormat('@');

  const input = getOrCreate_(ss, TAB.INPUT);
  input.getRange('A1:A2').setValues([['Tajuk:'], ['Topik:']]);
  input.getRange('A4').setValue('Pautan murid:');
  input.getRange('A6:H6').setValues([['Question', 'A', 'B', 'C', 'D', 'Answer', 'Marks', 'Gambar (pautan Drive)']]).setFontWeight('bold');
  input.setFrozenRows(6);
  getOrCreate_(ss, TAB.IMPORT);
  bust_();
  SpreadsheetApp.getUi().alert('Sheet sudah sedia.\n\nLangkah seterusnya (lihat README):\n' +
    '1. Tampal senarai murid di tab "' + TAB.IMPORT + '" → KUIZ T4 → Import senarai murid.\n' +
    '2. KUIZ T4 → Jana PIN rawak.\n3. Tampal soalan di tab "' + TAB.INPUT + '" → Terbitkan kuiz ke GitHub.');
}

function kosongkanCache() {
  bust_();
  SpreadsheetApp.getActive().toast('Laman murid dan guru akan memaparkan data terkini.', 'KUIZ T4', 5);
}

// onEdit (pencetus mudah): perubahan guru di tab Murid/Kuiz/Kunci berkesan serta-merta.
function onEdit(e) {
  try {
    const n = e && e.range && e.range.getSheet().getName();
    if (n === TAB.MURID || n === TAB.KUIZ || n === TAB.KUNCI) bust_();
  } catch (err) { /* abaikan */ }
}

/* ---------- Import senarai murid ---------- */

function importMurid() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const imp = getOrCreate_(ss, TAB.IMPORT);
  const values = imp.getDataRange().getDisplayValues()
    .map(r => r.map(x => String(x).trim()))
    .filter(r => r.some(Boolean));
  if (!values.length) {
    ui.alert('Tab "' + TAB.IMPORT + '" kosong',
      'Salin senarai murid dari Excel / APDM (termasuk baris tajuk lajur seperti "Nama" dan "Kelas"), ' +
      'kemudian tampal di sel A1 tab "' + TAB.IMPORT + '" dan jalankan menu ini sekali lagi.\n\n' +
      'Hanya lajur Nama dan Kelas yang disalin. Lajur lain (No. KP, jantina, dll.) diabaikan.', ui.ButtonSet.OK);
    return;
  }
  // Cari baris tajuk (mengandungi "Nama").
  let h = values.slice(0, 10).findIndex(r => r.some(x => /^nama(\s+murid|\s+pelajar)?$/i.test(x)));
  let cNama, cKelas, data;
  if (h >= 0) {
    cNama = values[h].findIndex(x => /^nama(\s+murid|\s+pelajar)?$/i.test(x));
    cKelas = values[h].findIndex(x => /^(kelas|nama kelas)$/i.test(x));
    if (cKelas < 0) cKelas = values[h].findIndex(x => /kelas/i.test(x));
    data = values.slice(h + 1);
  } else {
    cNama = 0;
    cKelas = values[0].length > 1 ? 1 : -1;
    data = values;
  }
  let kelasLalai = '';
  if (cKelas < 0) {
    const r = ui.prompt('Kelas', 'Tiada lajur Kelas. Taip nama kelas untuk semua murid ini (contoh: 4 Bestari):', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
    kelasLalai = r.getResponseText().trim().replace(/\s+/g, ' ');
  }

  const murid = getOrCreate_(ss, TAB.MURID);
  tajukTab_(murid, HEAD.Murid);
  const sedia = dataRows_(TAB.MURID, 5);
  const ada = {};
  const ejaanKelas = {};
  let maxId = 0;
  sedia.forEach(r => {
    ada[norm_(r[1]) + '|' + norm_(r[2])] = 1;
    ejaanKelas[norm_(r[2])] = String(r[2]).trim();
    const m = String(r[0]).match(/^M(\d+)$/);
    if (m) maxId = Math.max(maxId, Number(m[1]));
  });
  const baru = [];
  let sama = 0, kosong = 0;
  data.forEach(r => {
    const nama = String(r[cNama] || '').replace(/\s+/g, ' ').trim();
    let kelas = (cKelas >= 0 ? String(r[cKelas] || '') : kelasLalai).replace(/\s+/g, ' ').trim();
    if (!nama || !kelas || /^\d+$/.test(nama)) { kosong++; return; }
    kelas = ejaanKelas[norm_(kelas)] || kelas;
    ejaanKelas[norm_(kelas)] = kelas;
    const k = norm_(nama) + '|' + norm_(kelas);
    if (ada[k]) { sama++; return; }
    ada[k] = 1;
    maxId++;
    baru.push(['M' + ('0000' + maxId).slice(-4), safe_(nama), safe_(kelas), pinRawak_(), 'Y']);
  });
  if (baru.length) {
    const start = murid.getLastRow() + 1;
    murid.getRange(start, 1, baru.length, 1).setNumberFormat('@');
    murid.getRange(start, 4, baru.length, 1).setNumberFormat('@');
    murid.getRange(start, 1, baru.length, 5).setValues(baru);
  }
  imp.clear(); // senarai asal mungkin mengandungi No. KP – jangan simpan
  bust_();
  const kelasBaru = {};
  baru.forEach(r => { kelasBaru[r[2]] = (kelasBaru[r[2]] || 0) + 1; });
  ui.alert('Import selesai',
    baru.length + ' murid baharu ditambah ke tab "' + TAB.MURID + '" (PIN dijana automatik).\n' +
    Object.keys(kelasBaru).map(k => '  • ' + k + ': ' + kelasBaru[k] + ' murid').join('\n') +
    (sama ? '\n\n' + sama + ' murid sudah ada (dilangkau).' : '') +
    (kosong ? '\n' + kosong + ' baris tanpa nama/kelas dilangkau.' : '') +
    '\n\nTab "' + TAB.IMPORT + '" telah dikosongkan (maklumat peribadi lain tidak disimpan).', ui.ButtonSet.OK);
}

// PIN 4 digit, elak yang mudah diteka (1111, 1234, 4321).
function pinRawak_() {
  for (;;) {
    const p = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
    if (/^(\d)\1{3}$/.test(p) || '0123456789'.indexOf(p) >= 0 || '9876543210'.indexOf(p) >= 0) continue;
    return p;
  }
}

function janaPin() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(TAB.MURID);
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('Tab "' + TAB.MURID + '" kosong. Import senarai murid dahulu.'); return; }
  const ans = ui.alert('Jana PIN rawak',
    'YES = jana PIN untuk murid yang BELUM ada PIN sahaja.\n' +
    'NO = jana PIN baharu untuk SEMUA murid (PIN lama tidak boleh digunakan lagi; murid perlu log masuk semula).',
    ui.ButtonSet.YES_NO_CANCEL);
  if (ans !== ui.Button.YES && ans !== ui.Button.NO) return;
  const range = sh.getRange(2, 4, last - 1, 1);
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  const pins = range.getValues();
  let n = 0;
  const out = pins.map((r, i) => {
    if (!String(ids[i][0]).trim()) return [r[0]];
    if (ans === ui.Button.NO || !String(r[0]).trim()) { n++; return [pinRawak_()]; }
    return [pinStr_(r[0])];
  });
  range.setNumberFormat('@').setValues(out);
  bust_();
  ui.alert('Selesai', n + ' PIN dijana di lajur D tab "' + TAB.MURID + '".\n\n' +
    'Untuk mengedarkan: tapis lajur Kelas (Data → Create a filter), kemudian cetak atau salin Nama + PIN ' +
    'bagi setiap kelas. Jangan kongsi Sheet ini dengan murid.', ui.ButtonSet.OK);
}

/* ---------- Buka / Tutup kuiz ---------- */

function barisKuizDipilih_() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sh = sheet_(TAB.KUIZ);
  let row = -1;
  const act = ss.getActiveSheet();
  if (act && act.getName() === TAB.KUIZ) {
    const r = act.getActiveRange();
    if (r && r.getRow() >= 2 && String(sh.getRange(r.getRow(), 1).getValue()).trim()) row = r.getRow();
  }
  if (row < 0) {
    const res = ui.prompt('Pilih kuiz', 'Taip QuizId (lajur A tab Kuiz), atau batal dan klik satu baris kuiz di tab Kuiz dahulu:', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return null;
    const id = res.getResponseText().trim();
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
    const i = ids.findIndex(r => String(r[0]).trim() === id);
    if (i < 0) { ui.alert('QuizId "' + id + '" tiada dalam tab Kuiz.'); return null; }
    row = i + 2;
  }
  return { sh: sh, row: row, id: String(sh.getRange(row, 1).getValue()), tajuk: String(sh.getRange(row, 2).getValue()) };
}

function bukaKuiz() {
  const p = barisKuizDipilih_();
  if (!p) return;
  const now = new Date();
  const tutup = toMs_(p.sh.getRange(p.row, 5).getValue());
  p.sh.getRange(p.row, 4).setValue(now);
  let msg = 'Kuiz "' + p.tajuk + '" dibuka sekarang.';
  if (!tutup || tutup <= now.getTime()) {
    const t = new Date(now.getTime() + 7 * 864e5);
    p.sh.getRange(p.row, 5).setValue(t);
    msg += '\nTarikh tutup ditetapkan 7 hari lagi (' + Utilities.formatDate(t, 'Asia/Kuala_Lumpur', 'd/M/yyyy HH:mm') + '). Ubah di lajur E jika perlu.';
  }
  bust_();
  SpreadsheetApp.getUi().alert(msg);
}

function tutupKuiz() {
  const p = barisKuizDipilih_();
  if (!p) return;
  p.sh.getRange(p.row, 5).setValue(new Date());
  bust_();
  SpreadsheetApp.getUi().alert('Kuiz "' + p.tajuk + '" ditutup sekarang. Murid kini boleh melihat jawapan betul ' +
    '(jika lajur Tunjuk jawapan = Selepas tutup).');
}

/* ---------- Data contoh ---------- */

function masukkanDataContoh() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(TAB.MURID) || !ss.getSheetByName(TAB.INPUT)) {
    ui.alert('Jalankan "1. Sediakan Sheet (kali pertama)" dahulu.');
    return;
  }
  if (ui.alert('Data contoh', 'Tambah 10 murid palsu (4 Bestari, 4 Cemerlang) ke tab Murid dan 10 soalan contoh ke ' +
    'tab Input Kuiz? Soalan sedia ada di Input Kuiz akan diganti.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const nama = [
    ['M9001', 'ALIA SOFEA BINTI AHMAD', '4 Bestari'], ['M9002', 'BRYAN LIM WEI JIE', '4 Bestari'],
    ['M9003', 'DANIAL HAKIMI BIN ROSLAN', '4 Bestari'], ['M9004', 'KAVITHA A/P MURUGAN', '4 Bestari'],
    ['M9005', 'NUR IMAN BINTI ZULKIFLI', '4 Bestari'], ['M9006', 'AIDAN CHONG KAH MENG', '4 Cemerlang'],
    ['M9007', 'FARAH NADIA BINTI ISMAIL', '4 Cemerlang'], ['M9008', 'HARIZ IRFAN BIN SALLEH', '4 Cemerlang'],
    ['M9009', 'PRIYA A/P RAMESH', '4 Cemerlang'], ['M9010', 'SITI AISYAH BINTI OMAR', '4 Cemerlang']
  ];
  const sh = ss.getSheetByName(TAB.MURID);
  const sedia = {};
  dataRows_(TAB.MURID, 1).forEach(r => { sedia[String(r[0])] = 1; });
  const rows = nama.filter(r => !sedia[r[0]]).map(r => r.concat([pinRawak_(), 'Y']));
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, 5).setNumberFormat('@').setValues(rows);
  }
  const input = ss.getSheetByName(TAB.INPUT);
  const last = Math.max(input.getLastRow(), FIRST_ROW);
  input.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 8).clearContent();
  input.getRange('B1:B2').setValues([['Matematik Tingkatan 4 – Kuiz Contoh'], ['Ulang kaji Bab 1–10']]);
  input.getRange(FIRST_ROW, 1, SOALAN_CONTOH.length, 8).setNumberFormat('@').setValues(SOALAN_CONTOH);
  bust_();
  ui.alert('Data contoh dimasukkan',
    rows.length + ' murid palsu ditambah (IDMurid M9001–M9010, PIN di lajur D).\n10 soalan di tab Input Kuiz.\n\n' +
    'Seterusnya: KUIZ T4 → Terbitkan kuiz ke GitHub. Padam murid palsu sebelum kegunaan sebenar.', ui.ButtonSet.OK);
}

// 10 soalan contoh Matematik KSSM Tingkatan 4 (satu soalan setiap bab).
const SOALAN_CONTOH = [
  ['Punca-punca bagi persamaan kuadratik x² − 5x + 6 = 0 ialah', 'x = 2 dan x = 3', 'x = −2 dan x = −3', 'x = 1 dan x = 6', 'x = −1 dan x = 6', 'A', '1', ''],
  ['Tukarkan 1011₂ kepada nombor dalam asas sepuluh.', '9', '10', '11', '13', 'C', '1', ''],
  ['Antara berikut, yang manakah suatu pernyataan?', 'Tolong tutup pintu itu.', '5 ialah nombor perdana.', 'Adakah 9 nombor genap?', 'x + 3 = 7', 'B', '1', ''],
  ['Diberi set semesta ξ = {1, 2, 3, …, 10}, P = {gandaan 2} dan Q = {gandaan 3}. Cari n(P ∩ Q).', '2', '3', '8', '1', 'D', '1', ''],
  ['Sebuah graf mempunyai 5 bucu dan 7 tepi. Hasil tambah darjah semua bucu ialah', '7', '12', '14', '35', 'C', '1', ''],
  ['Selesaikan ketaksamaan linear 3x − 4 > 11.', 'x > 5', 'x < 5', 'x > 15', 'x < 15', 'A', '1', ''],
  ['Laju sebuah objek bertambah secara seragam daripada 0 m/s kepada 20 m/s dalam masa 5 saat. Hitung pecutan objek itu.', '0.25 m/s²', '4 m/s²', '25 m/s²', '100 m/s²', 'B', '1', ''],
  ['Cari julat bagi set data berikut: 5, 8, 3, 12, 7, 10', '3', '5', '7', '9', 'D', '1', ''],
  ['Sebiji dadu adil dilambung dan sekeping syiling adil dilambung serentak. Hitung kebarangkalian mendapat nombor 6 dan gambar.', '1/12', '1/8', '1/6', '2/3', 'A', '1', ''],
  ['Pendapatan bulanan Encik Rahman ialah RM3 500. Perbelanjaan tetapnya RM1 800 dan perbelanjaan tidak tetapnya RM1 200. Hitung aliran tunai bulanannya.', 'RM1 700', 'RM1 200', 'RM2 300', 'RM500', 'D', '1', '']
];

/* ================================================================== */
/* Input Kuiz & Terbitkan                                              */
/* ================================================================== */

function kosongkanInput() {
  const ui = SpreadsheetApp.getUi();
  const sheet = sheet_(TAB.INPUT);
  if (ui.alert('Kosongkan Input Kuiz?', 'Tajuk (B1), topik (B2), pautan (B4) dan semua soalan dari baris 7 akan dipadam. ' +
    'Kuiz yang sudah diterbitkan tidak terjejas.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sheet.getRange('B1:B4').clearContent();
  const last = Math.max(sheet.getLastRow(), FIRST_ROW);
  sheet.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 8).clearContent();
  ui.alert('Input Kuiz sudah kosong. Isi tajuk di B1, topik di B2 dan tampal soalan di A7.');
}

function slug_(title) {
  return String(title).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function short_(s) {
  s = String(s).split('\n')[0];
  return s.length > 50 ? s.slice(0, 50) + '…' : s;
}

function bacaSoalan_(sheet) {
  const last = sheet.getLastRow();
  if (last < FIRST_ROW) throw new Error('Tiada soalan. Tampal soalan bermula di A7.');
  const values = sheet.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 8).getDisplayValues();
  const rows = [];
  const errors = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i].map(x => String(x).trim());
    if (v.slice(0, 7).every(x => x === '')) break; // berhenti pada baris kosong pertama
    const rowNo = FIRST_ROW + i;
    const answer = v[5].toUpperCase();
    const marks = v[6] === '' ? 1 : Number(v[6]);
    if (!v[0]) errors.push('Baris ' + rowNo + ': soalan kosong');
    if (v.slice(1, 5).some(x => x === '')) errors.push('Baris ' + rowNo + ': ada pilihan A–D kosong');
    if (LETTERS.indexOf(answer) < 0) errors.push('Baris ' + rowNo + ': Answer mesti A, B, C atau D');
    if (!(marks > 0)) errors.push('Baris ' + rowNo + ': Marks tidak sah');
    // Ruang di hadapan "=" (dari import) dibuang.
    const clean = s => s.replace(/^ (?==)/, '');
    rows.push({ question: clean(v[0]), options: v.slice(1, 5).map(clean), answer: answer, marks: marks, image: v[7] });
  }
  if (errors.length) throw new Error('Soalan perlu dibetulkan dahulu:\n' + errors.slice(0, 15).join('\n'));
  if (!rows.length) throw new Error('Tiada soalan. Tampal soalan bermula di A7.');
  return rows;
}

function simpanKunci_(id, rows) {
  const sh = sheet_(TAB.KUNCI);
  const lain = dataRows_(TAB.KUNCI, 4).filter(r => String(r[0]).trim() !== id && String(r[0]).trim() !== '');
  const semua = lain.concat(rows.map((r, i) => [id, i + 1, r.answer, r.marks]));
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (semua.length) sh.getRange(2, 1, semua.length, 4).setValues(semua);
}

function simpanBarisKuiz_(id, title, topik, bukaSekarang) {
  const sh = sheet_(TAB.KUIZ);
  const rows = dataRows_(TAB.KUIZ, 10);
  const i = rows.findIndex(r => String(r[0]).trim() === id);
  if (i >= 0) {
    sh.getRange(i + 2, 2, 1, 2).setValues([[safe_(title), safe_(topik)]]);
    return false;
  }
  const now = new Date();
  sh.appendRow([id, safe_(title), safe_(topik), bukaSekarang ? now : '', bukaSekarang ? new Date(now.getTime() + 7 * 864e5) : '',
    '', 'Semua', 3, 'Pertama', 'Selepas tutup']);
  return true;
}

function terbitkanKuiz() {
  const mula = Date.now();
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = sheet_(TAB.INPUT);
    const title = String(sheet.getRange('B1').getValue()).trim();
    const topik = String(sheet.getRange('B2').getValue()).trim();
    if (!title) throw new Error('Isi tajuk kuiz di B1.');
    const id = slug_(title);
    if (!id) throw new Error('Tajuk di B1 tidak sah.');
    const rows = bacaSoalan_(sheet);
    const props = PropertiesService.getScriptProperties();
    const webAppUrl = (props.getProperty('WEBAPP_URL') || '').trim();
    if (!webAppUrl) throw new Error('Script property WEBAPP_URL belum diisi. Lihat README, Langkah 4.');

    const baru = !kuizAll_().some(q => q.id === id) && !dataRows_(TAB.KUIZ, 1).some(r => String(r[0]).trim() === id);
    const sahkan = ui.alert('Semak sebelum terbit',
      'Tajuk: ' + title + '\nQuizId: ' + id + '\nJumlah soalan: ' + rows.length +
      '\n\nSoalan 1: ' + short_(rows[0].question) +
      '\nSoalan ' + rows.length + ': ' + short_(rows[rows.length - 1].question) +
      (baru ? '' : '\n\n⚠️ Kuiz ini sudah wujud. Soalan dan kunci akan DIGANTI (markah lama kekal).') +
      '\n\nTeruskan terbit?', ui.ButtonSet.YES_NO);
    if (sahkan !== ui.Button.YES) return;

    // 1. Hantar soalan (TANPA jawapan) ke GitHub. Gambar yang sama tidak dimuat naik semula.
    const imgCtx = { mula: mula, sedia: ghListDir_(T4_DIR + '/kuiz/img/' + id), siap: {}, dimuatNaik: 0,
      jumlah: rows.filter(r => /^https?:\/\//i.test(r.image || '')).length, diproses: 0 };
    const publicQuiz = {
      id: id, title: title, topik: topik, createdAt: new Date().toISOString(),
      questions: rows.map((r, i) => {
        const q = { q: r.question, options: r.options, marks: r.marks };
        if (r.image) q.image = gambarKeGitHub_(id, i + 1, r.image, imgCtx);
        return q;
      })
    };
    ghPutText_(T4_DIR + '/kuiz/' + id + '.json', JSON.stringify(publicQuiz, null, 2) + '\n', 'Terbitkan kuiz T4: ' + title);

    // 2. Kunci jawapan kekal dalam Sheet sahaja.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { simpanKunci_(id, rows); } finally { lock.releaseLock(); }

    // 3. Pastikan laman tahu URL Web App.
    const configJs = '// Dijana oleh Apps Script. Jangan ubah secara manual.\nwindow.T4_CONFIG = {\n  APPS_SCRIPT_URL: ' +
      JSON.stringify(webAppUrl) + '\n};\n';
    if (ghGetText_(T4_DIR + '/config.js') !== configJs) ghPutText_(T4_DIR + '/config.js', configJs, 'Kemas kini URL Web App (T4)');

    // 4. Baris dalam tab Kuiz.
    let bukaSekarang = false;
    if (baru) {
      bukaSekarang = ui.alert('Buka kuiz sekarang?',
        'YES = buka sekarang untuk SEMUA kelas selama 7 hari (3 cubaan, ranking cubaan pertama).\n' +
        'NO = belum dibuka; isi tarikh Buka/Tutup di tab Kuiz kemudian.\n\nSemua tetapan boleh diubah di tab Kuiz.',
        ui.ButtonSet.YES_NO) === ui.Button.YES;
    }
    simpanBarisKuiz_(id, title, topik, bukaSekarang);
    bust_();

    const link = pagesUrl_() + T4_DIR + '/';
    sheet.getRange('B4').setValue(link);
    ui.alert('BERJAYA – ' + rows.length + ' soalan',
      'Laman murid (kemas kini dalam ~1 minit):\n' + link + '\n\nLaman guru: ' + link + 'guru.html' +
      (imgCtx.jumlah ? '\n\nGambar: ' + imgCtx.dimuatNaik + ' dimuat naik, ' + (imgCtx.diproses - imgCtx.dimuatNaik) + ' sudah sedia ada.' : '') +
      '\n\nTetapan kuiz (tarikh, had masa, kelas sasaran, cubaan) di tab "' + TAB.KUIZ + '".', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Gagal menerbitkan kuiz', e.message || e.userMsg || String(e), ui.ButtonSet.OK);
  }
}

/**
 * Lajur H: pautan fail Google Drive, pautan gambar https://… lain, atau laluan dalam repo (img/…).
 * Pautan dimuat turun dan dimuat naik ke GitHub sebagai t4/kuiz/img/<kuiz>/q<n>.<ext>.
 */
function gambarKeGitHub_(quizId, n, ref, ctx) {
  if (!/^https?:\/\//i.test(ref)) return ref;
  if (ctx.siap[ref]) return ctx.siap[ref];
  if (masaHampirTamat_(ctx.mula)) {
    throw new Error('Masa hampir tamat: ' + ctx.diproses + ' daripada ' + ctx.jumlah + ' gambar sudah siap. ' +
      'Klik "Terbitkan kuiz ke GitHub" sekali lagi untuk sambung (gambar yang siap tidak dimuat naik semula).');
  }
  let blob;
  try {
    const m = ref.match(/\/d\/([\w-]{20,})/) || ref.match(/[?&]id=([\w-]{20,})/);
    blob = (/(drive|docs)\.google\.com/.test(ref) && m) ? DriveApp.getFileById(m[1]).getBlob() : UrlFetchApp.fetch(ref).getBlob();
  } catch (e) {
    throw new Error('Gambar soalan ' + n + ' tidak dapat dibuka: ' + e.message + '\n(Pastikan fail Drive milik akaun ini.)');
  }
  const type = String(blob.getContentType() || '');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type];
  if (!ext) throw new Error('Fail di lajur H soalan ' + n + ' bukan gambar (' + (type || 'jenis tidak diketahui') + ').');
  const bytes = blob.getBytes();
  if (!bytes.length) throw new Error('Gambar soalan ' + n + ' kosong (0 bait).');
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Gambar soalan ' + n + ' melebihi 5 MB. Kecilkan dahulu.');
  const name = 'q' + n + '.' + ext;
  const path = 'img/' + quizId + '/' + name;
  const lama = ctx.sedia[name];
  if (lama !== gitBlobSha_(bytes)) {
    ghPutBase64_(T4_DIR + '/kuiz/' + path, Utilities.base64Encode(bytes), 'Gambar soalan ' + n + ': ' + quizId, lama || null);
    ctx.dimuatNaik++;
  }
  ctx.diproses++;
  ctx.siap[ref] = path;
  return path;
}

function gitBlobSha_(bytes) {
  const head = Utilities.newBlob('blob ' + bytes.length + '\u0000').getBytes();
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, head.concat(bytes));
  return d.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function pagesUrl_() {
  let url = (PropertiesService.getScriptProperties().getProperty('PAGES_URL') || '').trim();
  if (!url) {
    const repo = repo_();
    url = 'https://' + repo.split('/')[0].toLowerCase() + '.github.io/' + repo.split('/')[1] + '/';
  }
  return url.endsWith('/') ? url : url + '/';
}

/* ================================================================== */
/* Import dari Google Form                                             */
/* ================================================================== */

/**
 * Salin soalan aneka pilihan (4 pilihan, ada kunci jawapan) dari Google Form kuiz ke tab Input Kuiz,
 * termasuk gambar soalan (disimpan dalam folder Drive "Kuiz T4 – Gambar", pautan di lajur H).
 */
function importDariForm() {
  const mula = Date.now();
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Import dari Google Form', 'Tampal pautan EDIT Google Form (yang berakhir dengan /edit):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    const text = res.getResponseText().trim();
    if (/\/forms\/d\/e\//.test(text) || /forms\.gle/.test(text)) {
      throw new Error('Ini pautan untuk murid. Buka Form untuk diedit dan salin pautan dari bar alamat (…/forms/d/…/edit).');
    }
    const m = text.match(/\/forms\/d\/([\w-]+)/);
    const formId = m ? m[1] : text;
    const form = FormApp.openById(formId);
    const sheet = sheet_(TAB.INPUT);
    let data, apiNote = '';
    try {
      data = bacaFormApi_(formId);
    } catch (e) {
      data = bacaFormApp_(form);
      apiNote = 'Gambar yang dilekatkan terus pada soalan tidak dapat dibaca (' + String(e.message).slice(0, 120) +
        '). Hanya item gambar berasingan disalin. Tambah gambar lain secara manual di lajur H.';
    }
    const rows = [], skipped = [], imgErrors = [];
    let images = 0;
    data.list.forEach(it => {
      if (it.options.length !== 4) { skipped.push('"' + short_(it.title) + '" – ada ' + it.options.length + ' pilihan (perlu 4)'); return; }
      if (it.correct.length !== 1) { skipped.push('"' + short_(it.title) + '" – tiada kunci jawapan'); return; }
      let imageUrl = '';
      if (it.image && masaHampirTamat_(mula)) {
        imgErrors.push('S' + (rows.length + 1) + ': masa tamat – tampal pautan gambar di lajur H secara manual');
      } else if (it.image) {
        try {
          imageUrl = simpanGambarDrive_(it.image(), form.getTitle() + ' – S' + (rows.length + 1));
          images++;
        } catch (e) {
          imgErrors.push('S' + (rows.length + 1) + ': ' + String(e.message).slice(0, 80));
        }
      }
      rows.push([it.title].concat(it.options, [LETTERS[it.correct[0]], it.marks || 1, imageUrl])
        .map(v => typeof v === 'string' && v.charAt(0) === '=' ? ' ' + v : v));
    });
    if (!rows.length) throw new Error('Tiada soalan aneka pilihan 4-pilihan dengan kunci jawapan dalam Form ini.' +
      (skipped.length ? '\n\nDilangkau:\n' + skipped.slice(0, 10).join('\n') : ''));
    const last = Math.max(sheet.getLastRow(), FIRST_ROW);
    sheet.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 8).clearContent();
    sheet.getRange(FIRST_ROW, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
    sheet.getRange('B1').setValue(safe_(form.getTitle()));
    sheet.getRange('B4').clearContent();
    let msg = rows.length + ' soalan disalin ke tab "' + TAB.INPUT + '"' + (images ? ', termasuk ' + images + ' gambar (lajur H)' : '') +
      '.\n\nLangkah seterusnya:\n1. Semak tajuk (B1) dan isi topik (B2).\n2. Semak soalan.\n3. KUIZ T4 → Terbitkan kuiz ke GitHub.';
    if (skipped.length) msg += '\n\nDilangkau (' + skipped.length + '):\n' + skipped.slice(0, 10).join('\n') + (skipped.length > 10 ? '\n…' : '');
    if (imgErrors.length) msg += '\n\nGambar gagal disalin:\n' + imgErrors.slice(0, 5).join('\n');
    if (data.optionImages) msg += '\n\n' + data.optionImages + ' soalan ada gambar pada pilihan jawapan. Gambar pilihan tidak disokong; hanya teks pilihan disalin.';
    if (apiNote) msg += '\n\n' + apiNote;
    if (data.others) msg += '\n\n' + data.others + ' item lain (contoh Nama, Kelas, tajuk bahagian) tidak disalin.';
    ui.alert('Import selesai', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Import gagal', e.message || String(e), ui.ButtonSet.OK);
  }
}

function bacaFormApi_(formId) {
  const res = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId), {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Forms API ' + res.getResponseCode());
  const data = JSON.parse(res.getContentText());
  const out = { list: [], others: 0, optionImages: 0 };
  let pending = null;
  (data.items || []).forEach(it => {
    if (it.imageItem && it.imageItem.image) { pending = it.imageItem.image; return; }
    const qi = it.questionItem;
    const cq = qi && qi.question && qi.question.choiceQuestion;
    if (!cq || cq.type === 'CHECKBOX') { out.others++; return; }
    const opts = (cq.options || []).filter(o => !o.isOther);
    if (opts.some(o => o.image)) out.optionImages++;
    const grading = qi.question.grading || {};
    const correctVals = ((grading.correctAnswers || {}).answers || []).map(a => a.value);
    const img = qi.image || pending;
    pending = null;
    out.list.push({
      title: (it.title || '') + (it.description ? '\n' + it.description : ''),
      options: opts.map(o => o.value || ''),
      correct: opts.map((o, i) => correctVals.indexOf(o.value) >= 0 ? i : -1).filter(i => i >= 0),
      marks: grading.pointValue || 1,
      image: img && img.contentUri ? () => muatGambarUri_(img.contentUri) : null
    });
  });
  return out;
}

function bacaFormApp_(form) {
  const out = { list: [], others: 0, optionImages: 0 };
  let pending = null;
  form.getItems().forEach(item => {
    const type = item.getType();
    if (type === FormApp.ItemType.IMAGE) {
      const blob = item.asImageItem().getImage();
      pending = () => blob;
      return;
    }
    let q;
    if (type === FormApp.ItemType.MULTIPLE_CHOICE) q = item.asMultipleChoiceItem();
    else if (type === FormApp.ItemType.LIST) q = item.asListItem();
    else { out.others++; return; }
    const choices = q.getChoices();
    out.list.push({
      title: item.getTitle() + (item.getHelpText() ? '\n' + item.getHelpText() : ''),
      options: choices.map(c => c.getValue()),
      correct: choices.map((c, i) => c.isCorrectAnswer() ? i : -1).filter(i => i >= 0),
      marks: q.getPoints() || 1,
      image: pending
    });
    pending = null;
  });
  return out;
}

function muatGambarUri_(uri) {
  const attempts = [{}, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }, {}];
  let code = 0;
  for (let i = 0; i < attempts.length; i++) {
    if (i === 2) Utilities.sleep(1500);
    const res = UrlFetchApp.fetch(uri, Object.assign({ muteHttpExceptions: true }, attempts[i]));
    code = res.getResponseCode();
    const blob = res.getBlob();
    if (code === 200 && blob.getBytes().length > 0) return blob;
  }
  throw new Error(code === 200 ? 'gambar kosong diterima dari Google Form' : 'muat turun gambar gagal (' + code + ')');
}

function simpanGambarDrive_(blob, name) {
  const NAMA_FOLDER = 'Kuiz T4 – Gambar';
  const it = DriveApp.getFoldersByName(NAMA_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
  if (!blob.getBytes().length) throw new Error('gambar kosong');
  return folder.createFile(blob.setName(name)).getUrl();
}

/* ================================================================== */
/* GitHub API                                                          */
/* ================================================================== */

function repo_() {
  const repo = (PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || '').trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Script property GITHUB_REPO belum diisi (contoh: marilyngakim-blip/quiz-generator).');
  return repo;
}

function branch_() {
  return (PropertiesService.getScriptProperties().getProperty('GITHUB_BRANCH') || 'main').trim();
}

function ghRequest_(path, options) {
  const token = (PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || '').trim();
  if (!token) throw new Error('Script property GITHUB_TOKEN belum diisi.');
  const url = 'https://api.github.com/repos/' + repo_() + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  const opts = Object.assign({
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  }, options || {});
  return UrlFetchApp.fetch(url + (opts.method ? '' : '?ref=' + encodeURIComponent(branch_())), opts);
}

function ghGetFile_(path) {
  const res = ghRequest_(path);
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

function ghGetText_(path) {
  const file = ghGetFile_(path);
  if (!file) return null;
  return Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
}

function ghPutText_(path, text, message) {
  ghPutBase64_(path, Utilities.base64Encode(text, Utilities.Charset.UTF_8), message);
}

function ghListDir_(path) {
  const res = ghRequest_(path);
  if (res.getResponseCode() === 404) return {};
  if (res.getResponseCode() !== 200) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  const out = {};
  const list = JSON.parse(res.getContentText());
  (Array.isArray(list) ? list : []).forEach(f => { out[f.name] = f.sha; });
  return out;
}

// knownSha: undefined = semak di GitHub; null = fail baharu; teks = sha fail sedia ada.
function ghPutBase64_(path, base64, message, knownSha) {
  const file = knownSha === undefined ? ghGetFile_(path) : (knownSha ? { sha: knownSha } : null);
  const body = { message: message, content: base64, branch: branch_() };
  if (file) body.sha = file.sha;
  const res = ghRequest_(path, { method: 'put', contentType: 'application/json', payload: JSON.stringify(body) });
  if (res.getResponseCode() >= 300) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}
