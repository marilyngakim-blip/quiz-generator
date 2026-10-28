/**
 * KUIZ WEB – Google Apps Script
 *
 * Tugas skrip ini:
 *  1. Menu "KUIZ WEB → Terbitkan Kuiz ke GitHub": membaca soalan dari tab "Input Kuiz",
 *     menyimpan kunci jawapan di tab "Kunci" (tidak didedahkan kepada murid),
 *     dan menghantar soalan (TANPA jawapan) ke repo GitHub.
 *  2. Web App (doPost): menyemak jawapan murid, merekod markah di tab "Markah",
 *     dan memulangkan keputusan + jawapan betul kepada laman kuiz.
 *
 * Susun atur tab "Input Kuiz" sama seperti Sheet Quiz Generator:
 *   B1 = Tajuk kuiz, contoh: Sejarah Tingkatan 2 (1.3-1.4)
 *   Baris 6 = tajuk lajur, soalan bermula di A7
 *   A Question | B A | C B | D C | E D | F Answer | G Marks | H Gambar (pilihan)
 *
 * Script properties (Project Settings → Script properties):
 *   GITHUB_TOKEN  = token GitHub (Contents: Read and write, untuk repo ini sahaja)
 *   GITHUB_REPO   = marilyngakim-blip/quiz-generator
 *   GITHUB_BRANCH = main            (pilihan, lalai: main)
 *   WEBAPP_URL    = URL Web App (/exec) selepas Deploy
 *   PAGES_URL     = https://marilyngakim-blip.github.io/quiz-generator/   (pilihan)
 */

const TAB_INPUT = 'Input Kuiz';
const TAB_KUNCI = 'Kunci';
const TAB_MARKAH = 'Markah';
const TAB_DRAF = 'Draf'; // jawapan separuh jalan (supaya boleh sambung di peranti lain)
const FIRST_ROW = 7;
const LETTERS = ['A', 'B', 'C', 'D'];

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KUIZ WEB')
    .addItem('Import dari Google Form', 'importDariForm')
    .addItem('Terbitkan Kuiz ke GitHub', 'terbitkanKuiz')
    .addSeparator()
    .addItem('Sediakan Sheet (kali pertama)', 'sediakanSheet')
    .addToUi();
}

function sediakanSheet() {
  const ss = SpreadsheetApp.getActive();
  const input = getOrCreate_(ss, TAB_INPUT);
  input.getRange('A1').setValue('Tajuk:');
  input.getRange('A6:H6').setValues([['Question', 'A', 'B', 'C', 'D', 'Answer', 'Marks', 'Gambar (pilihan)']]).setFontWeight('bold');
  input.setFrozenRows(6);

  const kunci = getOrCreate_(ss, TAB_KUNCI);
  if (kunci.getLastRow() === 0) {
    kunci.appendRow(['QuizId', 'Tajuk', 'No', 'Jawapan', 'Markah']);
    kunci.getRange('1:1').setFontWeight('bold');
    kunci.setFrozenRows(1);
  }

  const markah = getOrCreate_(ss, TAB_MARKAH);
  if (markah.getLastRow() === 0) {
    markah.appendRow(['Masa', 'QuizId', 'Tajuk', 'Nama', 'Kelas', 'Cubaan', 'Markah', 'Jumlah', 'Peratus', 'Jawapan murid']);
    markah.getRange('1:1').setFontWeight('bold');
    markah.setFrozenRows(1);
  }
  SpreadsheetApp.getUi().alert('Sheet sudah sedia. Tampal soalan di tab "' + TAB_INPUT + '" bermula A7, dan tajuk di B1.');
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/* ------------------------------------------------------------------ */
/* Import dari Google Form                                             */
/* ------------------------------------------------------------------ */

/**
 * Salin soalan aneka pilihan (4 pilihan, ada kunci jawapan) dari Google Form kuiz
 * ke tab "Input Kuiz", termasuk gambar soalan. Gambar disimpan dalam folder Drive
 * "Kuiz Web – Gambar" dan pautannya diletak di lajur H. Semasa "Terbitkan", gambar
 * dimuat naik ke GitHub.
 */
function importDariForm() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Import dari Google Form',
    'Tampal pautan EDIT Google Form (yang berakhir dengan /edit):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  try {
    const text = res.getResponseText().trim();
    if (/\/forms\/d\/e\//.test(text) || /forms\.gle/.test(text)) {
      throw new Error('Ini pautan untuk murid. Buka Form → klik ⋮ atau salin pautan dari bar alamat semasa mengedit (…/forms/d/…/edit).');
    }
    const m = text.match(/\/forms\/d\/([\w-]+)/);
    const formId = m ? m[1] : text;
    const form = FormApp.openById(formId);

    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(TAB_INPUT);
    if (!sheet) throw new Error('Tab "' + TAB_INPUT + '" tiada. Jalankan "Sediakan Sheet" dahulu.');

    // Forms API boleh membaca gambar yang dilekatkan pada soalan. Jika tidak dapat,
    // guna FormApp (hanya item gambar berasingan dapat dibaca).
    let data;
    let apiNote = '';
    try {
      data = bacaFormApi_(formId);
    } catch (e) {
      data = bacaFormApp_(form);
      apiNote = 'Gambar yang dilekatkan terus pada soalan tidak dapat dibaca (' + String(e.message).slice(0, 120) +
        '). Hanya item gambar berasingan disalin. Tambah gambar lain secara manual di lajur H.';
    }

    const rows = [];
    const skipped = [];
    const imgErrors = [];
    let images = 0;
    data.list.forEach(it => {
      const title = it.title;
      if (it.options.length !== 4) { skipped.push('"' + short_(title) + '" – ada ' + it.options.length + ' pilihan (perlu 4)'); return; }
      if (it.correct.length !== 1) { skipped.push('"' + short_(title) + '" – tiada kunci jawapan'); return; }
      let imageUrl = '';
      if (it.image) {
        try {
          imageUrl = simpanGambarDrive_(it.image(), form.getTitle() + ' – S' + (rows.length + 1));
          images++;
        } catch (e) {
          imgErrors.push('S' + (rows.length + 1) + ': ' + String(e.message).slice(0, 80));
        }
      }
      // Ruang di hadapan "=" menghalang teks dibaca sebagai formula (dibuang semasa terbit).
      rows.push([title].concat(it.options, [LETTERS[it.correct[0]], it.marks || 1, imageUrl])
        .map(v => typeof v === 'string' && v.charAt(0) === '=' ? ' ' + v : v));
    });
    if (!rows.length) throw new Error('Tiada soalan aneka pilihan 4-pilihan dengan kunci jawapan dalam Form ini.' +
      (skipped.length ? '\n\nDilangkau:\n' + skipped.slice(0, 10).join('\n') : ''));

    const last = Math.max(sheet.getLastRow(), FIRST_ROW);
    sheet.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 8).clearContent();
    // Format teks supaya jawapan seperti 1/2 atau 007 tidak ditukar menjadi tarikh/nombor.
    sheet.getRange(FIRST_ROW, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
    sheet.getRange('B1').setValue(safe_(form.getTitle()));
    sheet.getRange('B2').clearContent();

    let msg = rows.length + ' soalan disalin ke tab "' + TAB_INPUT + '"' +
      (images ? ', termasuk ' + images + ' gambar (lajur H)' : '') + '. Tajuk di B1: "' + form.getTitle() + '".\n\n' +
      'Langkah seterusnya:\n1. Semak/ubah tajuk di B1 (awal tajuk = nama subjek, contoh "Sejarah Tingkatan 2 (1.3)").\n' +
      '2. Semak soalan.\n3. KUIZ WEB → Terbitkan Kuiz ke GitHub.';
    if (skipped.length) msg += '\n\nDilangkau (' + skipped.length + '):\n' + skipped.slice(0, 10).join('\n') + (skipped.length > 10 ? '\n…' : '');
    if (imgErrors.length) msg += '\n\nGambar gagal disalin:\n' + imgErrors.slice(0, 5).join('\n');
    if (data.optionImages) msg += '\n\n' + data.optionImages + ' soalan ada gambar pada pilihan jawapan. Gambar pilihan tidak disokong; hanya teks pilihan disalin.';
    if (apiNote) msg += '\n\n' + apiNote;
    if (data.others) msg += '\n\n' + data.others + ' item lain (contoh Nama, Kelas, tajuk bahagian) tidak disalin.';
    ui.alert('Import selesai', msg, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Import gagal', e.message, ui.ButtonSet.OK);
  }
}

// Baca Form melalui Google Forms API (termasuk gambar soalan).
function bacaFormApi_(formId) {
  const res = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId), {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Forms API ' + res.getResponseCode());
  const data = JSON.parse(res.getContentText());
  const out = { list: [], others: 0, optionImages: 0 };
  let pending = null; // item gambar berasingan → dilekatkan pada soalan berikutnya
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

// Cara simpanan: FormApp (tidak dapat membaca gambar yang dilekatkan pada soalan).
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
  // Kadang-kadang Google memulangkan respons kosong; cuba semula (tanpa/dengan token) sebelum menyerah.
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
  const NAMA_FOLDER = 'Kuiz Web – Gambar';
  const it = DriveApp.getFoldersByName(NAMA_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
  if (!blob.getBytes().length) throw new Error('gambar kosong');
  return folder.createFile(blob.setName(name)).getUrl();
}

function short_(s) {
  s = String(s).split('\n')[0];
  return s.length > 50 ? s.slice(0, 50) + '…' : s;
}

/* ------------------------------------------------------------------ */
/* Terbitkan kuiz                                                      */
/* ------------------------------------------------------------------ */

function terbitkanKuiz() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(TAB_INPUT);
    if (!sheet) throw new Error('Tab "' + TAB_INPUT + '" tiada. Jalankan "Sediakan Sheet" dahulu.');

    const title = String(sheet.getRange('B1').getValue()).trim();
    if (!title) throw new Error('Isi tajuk kuiz di B1.');
    const id = slug_(title);

    const rows = bacaSoalan_(sheet);
    const props = PropertiesService.getScriptProperties();
    const webAppUrl = (props.getProperty('WEBAPP_URL') || '').trim();
    if (!webAppUrl) throw new Error('Script property WEBAPP_URL belum diisi. Lihat README, Langkah 2.');

    const existing = ghGetText_('quizzes/' + id + '.json');
    if (existing) {
      const ans = ui.alert('Kuiz "' + title + '" sudah wujud.', 'Ganti dengan soalan baharu? (Markah lama kekal dalam tab Markah.)', ui.ButtonSet.YES_NO);
      if (ans !== ui.Button.YES) return;
    }

    // 1. Simpan kunci jawapan dalam Sheet.
    simpanKunci_(ss, id, title, rows);

    // 2. Hantar soalan (tanpa jawapan) ke GitHub.
    const publicQuiz = {
      id: id,
      title: title,
      createdAt: new Date().toISOString(),
      questions: rows.map((r, i) => {
        const q = { q: r.question, options: r.options, marks: r.marks };
        if (r.image) q.image = gambarKeGitHub_(id, i + 1, r.image);
        return q;
      })
    };
    ghPutText_('quizzes/' + id + '.json', JSON.stringify(publicQuiz, null, 2) + '\n', 'Terbitkan kuiz: ' + title);

    // 3. Kemas kini senarai kuiz.
    let index = [];
    const indexText = ghGetText_('quizzes/index.json');
    if (indexText) { try { index = JSON.parse(indexText); } catch (e) { index = []; } }
    index = index.filter(it => it.id !== id);
    index.push({ id: id, title: title, questionCount: rows.length, createdAt: publicQuiz.createdAt });
    ghPutText_('quizzes/index.json', JSON.stringify(index, null, 2) + '\n', 'Kemas kini senarai kuiz');

    // 4. Pastikan laman tahu URL Web App.
    const configJs = '// Dijana oleh Apps Script. Jangan ubah secara manual.\nwindow.KUIZ_CONFIG = {\n  APPS_SCRIPT_URL: ' + JSON.stringify(webAppUrl) + '\n};\n';
    if (ghGetText_('config.js') !== configJs) ghPutText_('config.js', configJs, 'Kemas kini URL Web App');

    const link = pagesUrl_() + 'quiz.html?id=' + encodeURIComponent(id);
    sheet.getRange('A2').setValue('Pautan murid:');
    sheet.getRange('B2').setValue(link);
    ui.alert('BERJAYA – Jumlah Soalan: ' + rows.length,
      'Pautan murid (tersedia dalam ~1 minit):\n' + link + '\n\nPautan juga disimpan di B2.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Gagal menerbitkan kuiz', e.message, ui.ButtonSet.OK);
  }
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
    rows.push({ question: v[0], options: v.slice(1, 5), answer: answer, marks: marks, image: v[7] });
  }
  if (errors.length) throw new Error('Soalan perlu dibetulkan dahulu:\n' + errors.slice(0, 15).join('\n'));
  if (!rows.length) throw new Error('Tiada soalan. Tampal soalan bermula di A7.');
  return rows;
}

function simpanKunci_(ss, id, title, rows) {
  const sheet = ss.getSheetByName(TAB_KUNCI);
  if (!sheet) throw new Error('Tab "' + TAB_KUNCI + '" tiada. Jalankan "Sediakan Sheet" dahulu.');
  const last = sheet.getLastRow();
  if (last > 1) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === id) sheet.deleteRow(i + 2);
    }
  }
  const data = rows.map((r, i) => [id, title, i + 1, r.answer, r.marks]);
  sheet.getRange(sheet.getLastRow() + 1, 1, data.length, 5).setValues(data);
}

/**
 * Lajur H boleh berisi:
 *  - pautan fail Google Drive (contoh dari import Form, atau gambar yang anda muat naik ke Drive)
 *  - pautan gambar https://… lain
 *  - laluan fail dalam repo (contoh img/rajah1.png dalam folder quizzes/)
 * Pautan dimuat turun dan dimuat naik ke GitHub sebagai quizzes/img/<kuiz>/q<n>.<ext>.
 */
function gambarKeGitHub_(quizId, n, ref) {
  if (!/^https?:\/\//i.test(ref)) return ref;
  let blob;
  try {
    const m = ref.match(/\/d\/([\w-]{20,})/) || ref.match(/[?&]id=([\w-]{20,})/);
    blob = (/(drive|docs)\.google\.com/.test(ref) && m)
      ? DriveApp.getFileById(m[1]).getBlob()
      : UrlFetchApp.fetch(ref).getBlob();
  } catch (e) {
    throw new Error('Gambar soalan ' + n + ' tidak dapat dibuka: ' + e.message);
  }
  const type = String(blob.getContentType() || '');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type];
  if (!ext) throw new Error('Fail di lajur H soalan ' + n + ' bukan gambar (' + (type || 'jenis tidak diketahui') + ').');
  if (!blob.getBytes().length) throw new Error('Gambar soalan ' + n + ' kosong (0 bait). Gantikan pautan di lajur H dengan gambar yang betul.');
  if (blob.getBytes().length > 5 * 1024 * 1024) throw new Error('Gambar soalan ' + n + ' melebihi 5 MB. Kecilkan dahulu.');
  const path = 'img/' + quizId + '/q' + n + '.' + ext;
  ghPutBase64_('quizzes/' + path, Utilities.base64Encode(blob.getBytes()), 'Gambar soalan ' + n + ': ' + quizId);
  return path;
}

function slug_(title) {
  return title.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pagesUrl_() {
  const props = PropertiesService.getScriptProperties();
  let url = (props.getProperty('PAGES_URL') || '').trim();
  if (!url) {
    const repo = repo_();
    url = 'https://' + repo.split('/')[0].toLowerCase() + '.github.io/' + repo.split('/')[1] + '/';
  }
  return url.endsWith('/') ? url : url + '/';
}

/* ------------------------------------------------------------------ */
/* GitHub API                                                          */
/* ------------------------------------------------------------------ */

function repo_() {
  const repo = (PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || '').trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Script property GITHUB_REPO belum diisi (contoh: marilyngakim-blip/quiz-generator).');
  return repo;
}

function ghRequest_(path, options) {
  const props = PropertiesService.getScriptProperties();
  const token = (props.getProperty('GITHUB_TOKEN') || '').trim();
  if (!token) throw new Error('Script property GITHUB_TOKEN belum diisi.');
  const url = 'https://api.github.com/repos/' + repo_() + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  const opts = Object.assign({
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  }, options || {});
  return UrlFetchApp.fetch(url + (opts.method ? '' : '?ref=' + encodeURIComponent(branch_())), opts);
}

function branch_() {
  return (PropertiesService.getScriptProperties().getProperty('GITHUB_BRANCH') || 'main').trim();
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

function ghPutBase64_(path, base64, message) {
  const file = ghGetFile_(path);
  const body = {
    message: message,
    content: base64,
    branch: branch_()
  };
  if (file) body.sha = file.sha;
  const res = ghRequest_(path, { method: 'put', contentType: 'application/json', payload: JSON.stringify(body) });
  if (res.getResponseCode() >= 300) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}

/* ------------------------------------------------------------------ */
/* Web App: semak jawapan murid                                        */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, message: 'Kuiz Web aktif.' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'submit') return json_(semak_(req));
    if (req.action === 'saveDraft') return json_(simpanDraf_(req));
    if (req.action === 'loadDraft') return json_(ambilDraf_(req));
    if (req.action === 'clearDraft') return json_(padamDrafReq_(req));
    if (req.action === 'history') return json_(sejarah_(req));
    return json_({ ok: false, error: 'Tindakan tidak sah.' });
  } catch (err) {
    return json_({ ok: false, error: 'Ralat pelayan: ' + err.message });
  }
}

function semak_(req) {
  const quizId = String(req.quizId || '');
  const nama = String(req.nama || '').trim().slice(0, 80);
  const kelas = String(req.kelas || '').trim().slice(0, 30);
  const answers = Array.isArray(req.answers) ? req.answers.map(a => String(a || '').toUpperCase().slice(0, 1)) : [];
  if (!quizId || !nama || !kelas) return { ok: false, error: 'Nama, kelas dan kuiz diperlukan.' };

  const ss = SpreadsheetApp.getActive();
  const kunciSheet = ss.getSheetByName(TAB_KUNCI);
  const key = kunciSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0] === quizId)
    .sort((a, b) => a[2] - b[2]);
  if (!key.length) return { ok: false, error: 'Kuiz ini tidak dijumpai atau sudah ditutup.' };
  if (answers.length !== key.length) return { ok: false, error: 'Bilangan jawapan tidak sepadan. Muat semula laman dan cuba lagi.' };

  let score = 0, total = 0;
  const results = key.map((r, i) => {
    const answer = String(r[3]).toUpperCase();
    const marks = Number(r[4]) || 1;
    const correct = answers[i] === answer;
    total += marks;
    if (correct) score += marks;
    return { chosen: answers[i], answer: answer, correct: correct };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let attempt = 1;
  try {
    const markah = ss.getSheetByName(TAB_MARKAH);
    const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
    const last = markah.getLastRow();
    if (last > 1) {
      markah.getRange(2, 2, last - 1, 4).getValues().forEach(r => {
        if (r[0] === quizId && norm(r[2]) === norm(nama) && norm(r[3]) === norm(kelas)) attempt++;
      });
    }
    markah.appendRow([new Date(), quizId, key[0][1], safe_(nama), safe_(kelas), attempt, score, total,
      total ? Math.round(score / total * 100) : 0, answers.map(a => a || '-').join(' ')]);
    padamDraf_(quizId, nama); // sudah dihantar: draf tidak diperlukan lagi
  } finally {
    lock.releaseLock();
  }

  return { ok: true, score: score, total: total, attempt: attempt, results: results };
}

/* ------------------------------------------------------------------ */
/* Web App: rekod markah seorang anak (semua kuiz, semua cubaan)       */
/* ------------------------------------------------------------------ */

// Tab Markah: Masa | QuizId | Tajuk | Nama | Kelas | Cubaan | Markah | Jumlah | Peratus | Jawapan
function sejarah_(req) {
  const key = drafKey_(req.nama);
  if (!key) return { ok: false, error: 'Nama diperlukan.' };
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_MARKAH);
  const last = sh ? sh.getLastRow() : 0;
  if (last < 2) return { ok: true, items: [] };
  const items = sh.getRange(2, 1, last - 1, 9).getValues()
    .filter(r => drafKey_(r[3]) === key && (!req.quizId || r[1] === req.quizId))
    .map(r => ({
      quizId: String(r[1]), title: String(r[2]), attempt: Number(r[5]) || 1,
      score: Number(r[6]) || 0, total: Number(r[7]) || 0, pct: Number(r[8]) || 0,
      at: r[0] instanceof Date ? r[0].toISOString() : String(r[0])
    }));
  return { ok: true, items: items };
}

/* ------------------------------------------------------------------ */
/* Web App: draf jawapan (sambung kuiz di peranti lain)                */
/* ------------------------------------------------------------------ */

// Satu baris setiap kuiz + nama: QuizId | Nama (huruf kecil) | Masa | Data (JSON jawapan)
function drafSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TAB_DRAF);
  if (!sh) {
    sh = ss.insertSheet(TAB_DRAF);
    sh.appendRow(['QuizId', 'Nama', 'Masa', 'Data']);
    sh.getRange('1:1').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('@');
  }
  return sh;
}

function drafKey_(nama) {
  return String(nama || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

function drafRow_(sh, quizId, key) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const v = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < v.length; i++) if (v[i][0] === quizId && v[i][1] === key) return i + 2;
  return -1;
}

function simpanDraf_(req) {
  const quizId = String(req.quizId || '');
  const key = drafKey_(req.nama);
  const data = String(req.data || '');
  if (!quizId || !key) return { ok: false, error: 'Kuiz dan nama diperlukan.' };
  if (data.length > 20000) return { ok: false, error: 'Draf terlalu besar.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = drafSheet_();
    const row = drafRow_(sh, quizId, key);
    const values = [[quizId, key, new Date(), data]];
    if (row > 0) sh.getRange(row, 1, 1, 4).setValues(values);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues(values);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function ambilDraf_(req) {
  const quizId = String(req.quizId || '');
  const key = drafKey_(req.nama);
  if (!quizId || !key) return { ok: false, error: 'Kuiz dan nama diperlukan.' };
  const sh = drafSheet_();
  const row = drafRow_(sh, quizId, key);
  if (row < 0) return { ok: true, data: null };
  return { ok: true, data: String(sh.getRange(row, 4).getValue()) };
}

function padamDrafReq_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { padamDraf_(String(req.quizId || ''), req.nama); } finally { lock.releaseLock(); }
  return { ok: true };
}

// Dipanggil semasa lock sudah dipegang.
function padamDraf_(quizId, nama) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_DRAF);
  if (!sh) return;
  const row = drafRow_(sh, quizId, drafKey_(nama));
  if (row > 0) sh.deleteRow(row);
}

// Elak teks murid dibaca sebagai formula.
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
