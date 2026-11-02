// Peringkat 4: menu Sheet – import murid, jana PIN, terbit kuiz bergambar, import Google Form, buka/tutup.
//   node t4/ujian/ujian-4-menu.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startServer } = require('./server');
const { langkah, selesai, ralatKonsol } = require('./alat');

// PNG 1x1 yang sah
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const srv = await startServer();
  const g = srv.gas;
  const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));

  await langkah('4a. Sediakan Sheet: semua tab dan tajuk lajur', async () => {
    const log = g.runMenu('sediakanSheet');
    ['Murid', 'Kuiz', 'Input Kuiz', 'Kunci', 'Markah', 'Draf', 'Import Murid'].forEach(n => assert(g.ss.getSheetByName(n), n));
    assert.deepStrictEqual(g.rows('Murid')[0], ['IDMurid', 'Nama', 'Kelas', 'PIN', 'Aktif']);
    assert.deepStrictEqual(g.rows('Kuiz')[0].slice(0, 9), ['QuizId', 'Tajuk', 'Topik', 'Buka', 'Tutup', 'Had masa (minit)', 'Kelas sasaran', 'Cubaan dibenarkan', 'Ranking guna']);
    assert.deepStrictEqual(g.rows('Kunci')[0], ['QuizId', 'No', 'Jawapan', 'Markah']);
    assert.deepStrictEqual(g.rows('Draf')[0], ['QuizId', 'IDMurid', 'Masa', 'Data']);
    assert.strictEqual(g.rows('Markah')[0].length, 11);
    assert.match(log[0].msg, /Sheet sudah sedia/);
    // Menu
    g.call('onOpen');
    const items = g.ui.menus[0].items.map(x => x[1]);
    ['importMurid', 'janaPin', 'terbitkanKuiz', 'importDariForm', 'bukaKuiz', 'tutupKuiz'].forEach(f => assert(items.includes(f), f));
  });

  await langkah('4b. Import senarai murid (tampal APDM): hanya Nama + Kelas, No. KP dibuang', async () => {
    const imp = g.ss.getSheetByName('Import Murid');
    const data = [
      ['SENARAI MURID APDM', '', '', ''],
      ['Bil', 'Nama', 'No. KP', 'Kelas'],
      ['1', 'AHMAD FAIZ BIN KAMAL', '090101-12-1234', '4 BESTARI'],
      ['2', 'CHONG MEI LING', '090202-12-5678', '4 Bestari'],
      ['3', 'RAJESH A/L KUMAR', '090303-12-9012', '4 Dinamik'],
      ['4', 'CHONG MEI LING', '090202-12-5678', '4 bestari'], // pendua
      ['', '', '', '']
    ];
    imp.getRange(1, 1, data.length, 4).setValues(data);
    const log = g.runMenu('importMurid');
    const murid = g.rows('Murid').slice(1);
    assert.strictEqual(murid.length, 3);
    assert.deepStrictEqual(murid.map(r => r[2]), ['4 BESTARI', '4 BESTARI', '4 Dinamik'], 'ejaan kelas diseragamkan');
    murid.forEach(r => assert.match(String(r[3]), /^\d{4}$/, 'PIN 4 digit (teks)'));
    assert.deepStrictEqual(murid.map(r => r[0]), ['M0001', 'M0002', 'M0003']);
    assert(!JSON.stringify(g.rows('Murid')).includes('090101'), 'tiada No. KP');
    assert.strictEqual(g.ss.getSheetByName('Import Murid').getLastRow(), 0, 'tab import dikosongkan');
    assert.match(log[0].msg, /3 murid baharu[\s\S]*1 murid sudah ada/);
    // Import tanpa lajur Kelas → tanya kelas
    imp.getRange(1, 1, 2, 1).setValues([['Nama'], ['SITI HAJAR']]);
    g.runMenu('importMurid', [{ button: 'OK', text: '4 Dinamik' }]);
    assert.deepStrictEqual(g.rows('Murid')[4].slice(0, 3), ['M0004', 'SITI HAJAR', '4 Dinamik']);
  });

  await langkah('4c. Jana PIN rawak: kosong sahaja / semua (PIN 0xxx kekal 4 digit)', async () => {
    const sh = g.ss.getSheetByName('Murid');
    sh.getRange(2, 4).setValue('');
    const lama = g.rows('Murid').slice(1).map(r => r[3]);
    g.runMenu('janaPin', ['YES']);
    const baru = g.rows('Murid').slice(1).map(r => r[3]);
    assert.match(String(baru[0]), /^\d{4}$/);
    assert.deepStrictEqual(baru.slice(1), lama.slice(1), 'PIN sedia ada tidak diubah');
    // Token lama tidak sah selepas semua PIN ditukar
    const m = g.rows('Murid')[2];
    const tok = g.post({ action: 'login', id: m[0], pin: String(m[3]).padStart(4, '0') }).token;
    assert(g.post({ action: 'home', token: tok }).ok);
    g.runMenu('janaPin', ['NO']);
    assert.strictEqual(g.post({ action: 'home', token: tok }).auth, true, 'sesi lama tamat bila PIN ditukar');
    // PIN bermula 0 dikekalkan walaupun guru menaip 427 sebagai nombor
    sh.getRange(2, 4).setNumberFormat('0').setValue(427);
    g.call('bust_');
    assert.strictEqual(g.post({ action: 'login', id: 'M0001', pin: '0427' }).ok, true);
  });

  await langkah('4d. Terbitkan kuiz bergambar (pautan Drive) → soalan + gambar ke GitHub, kunci di Sheet sahaja', async () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
    g.drive.set(id, new g.Blob(signed(PNG), 'image/png', 'rajah.png'));
    const input = g.ss.getSheetByName('Input Kuiz');
    input.getRange('B1:B2').setValues([['Matematik T4 Bab 3 Penaakulan'], ['Bab 3']]);
    input.getRange(7, 1, 2, 8).setNumberFormat('@').setValues([
      ['Rajah menunjukkan graf. Apakah kecerunan?', '1', '2', '3', '4', 'B', '2', 'https://drive.google.com/file/d/' + id + '/view?usp=sharing'],
      ['= 2 + 3 ialah', '4', '5', '6', '7', 'b', '', '']
    ]);
    const log = g.runMenu('terbitkanKuiz', ['YES', 'NO']);
    assert.match(log[log.length - 1].title, /BERJAYA/, JSON.stringify(log));
    const qid = 'matematik-t4-bab-3-penaakulan';
    const json = JSON.parse(g.gh.get('t4/kuiz/' + qid + '.json').buf.toString());
    assert.strictEqual(json.questions[0].image, 'img/' + qid + '/q1.png');
    assert(g.gh.get('t4/kuiz/img/' + qid + '/q1.png').buf.equals(PNG), 'gambar dimuat naik');
    assert.strictEqual(json.questions[1].q, '= 2 + 3 ialah');
    assert(!/"(answer|Answer|jawapan)"/.test(JSON.stringify(json)), 'tiada kunci jawapan dalam JSON awam');
    assert.deepStrictEqual(g.rows('Kunci').filter(r => r[0] === qid).map(r => [r[1], r[2], r[3]]), [[1, 'B', 2], [2, 'B', 1]]);
    assert.match(g.gh.get('t4/config.js').buf.toString(), /APPS_SCRIPT_URL: "http:\/\/127\.0\.0\.1/);
    const row = g.rows('Kuiz').find(r => r[0] === qid);
    assert.strictEqual(row[3], '', 'NO = belum dibuka');
    // Terbit semula: gambar sama tidak dimuat naik semula
    const puts = g.fetchLog.filter(f => f.method === 'put').length;
    g.runMenu('terbitkanKuiz', ['YES']);
    const puts2 = g.fetchLog.filter(f => f.method === 'put' && true).length;
    assert.strictEqual(puts2 - puts, 1, 'hanya JSON dikemas kini');
    assert.strictEqual(g.rows('Kunci').filter(r => r[0] === qid).length, 2, 'kunci tidak berganda');
  });

  await langkah('4e. Buka / Tutup kuiz dari menu (baris dipilih)', async () => {
    const qid = 'matematik-t4-bab-3-penaakulan';
    const kuiz = g.ss.getSheetByName('Kuiz');
    const r = g.rows('Kuiz').findIndex(x => x[0] === qid) + 1;
    g.ss.setActiveSheet(kuiz);
    kuiz.active = r;
    g.runMenu('bukaKuiz');
    const row = g.rows('Kuiz')[r - 1];
    assert(row[3] instanceof g.Date && row[4] instanceof g.Date && row[4] - row[3] > 6 * 864e5, 'dibuka 7 hari');
    const m = g.rows('Murid')[1];
    const tok = g.post({ action: 'login', id: m[0], pin: String(m[3]).padStart(4, '0') }).token;
    assert(g.post({ action: 'home', token: tok }).buka.some(q => q.id === qid), 'murid nampak kuiz');
    g.runMenu('tutupKuiz');
    const h = g.post({ action: 'home', token: tok });
    assert(!h.buka.some(q => q.id === qid), 'tidak lagi dibuka');
    assert.strictEqual(g.post({ action: 'start', token: tok, quizId: qid }).ok, false);
    // Melalui prompt QuizId
    g.ss.setActiveSheet(g.ss.getSheetByName('Murid'));
    g.runMenu('bukaKuiz', [{ button: 'OK', text: qid }]);
    assert(g.post({ action: 'home', token: tok }).buka.some(q => q.id === qid));
    // Kelas sasaran: hanya 4 Dinamik
    kuiz.getRange(r, 7).setValue('4 Dinamik');
    g.call('bust_');
    assert(!g.post({ action: 'home', token: tok }).buka.some(q => q.id === qid), '4 BESTARI tidak nampak');
    assert.strictEqual(g.post({ action: 'start', token: tok, quizId: qid }).ok, false);
  });

  await langkah('4f. Gambar dipaparkan di laman kuiz murid', async () => {
    const qid = 'matematik-t4-bab-3-penaakulan';
    g.ss.getSheetByName('Kuiz').getRange(g.rows('Kuiz').findIndex(x => x[0] === qid) + 1, 7).setValue('Semua');
    g.call('bust_');
    const m = g.rows('Murid')[1];
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = ralatKonsol(page);
    await page.goto(srv.base + 't4/');
    await page.getByRole('button', { name: m[2], exact: true }).click();
    await page.getByRole('button', { name: m[1] }).click();
    await page.fill('#pin', String(m[3]).padStart(4, '0'));
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.locator('[data-quiz="' + qid + '"]').getByRole('button', { name: 'Mula' }).click();
    await page.waitForSelector('#kad .opt');
    // Cari soalan bergambar
    for (let k = 0; k < 2 && !(await page.locator('#kad img.qimg').count()); k++) await page.click('#seterusnya');
    const ok = await page.locator('#kad img.qimg').evaluate(i => i.complete && i.naturalWidth === 1);
    assert(ok, 'gambar dimuatkan');
    assert(!(await page.locator('#kad').innerText()).includes('null'));
    assert.deepStrictEqual(errors, []);
    await browser.close();
  });

  await langkah('4g. Import dari Google Form (Forms API, termasuk gambar soalan)', async () => {
    const formId = '1FormIdPalsuUntukUjian000000000';
    g.urls.set('https://lh3.googleusercontent.com/gambar-s2', new g.Blob(signed(PNG), 'image/png'));
    const opt = v => ({ value: v });
    g.forms[formId] = {
      app: { getTitle: () => 'Kuiz Form Bab 5', getItems: () => [] },
      api: { items: [
        { title: 'Nama', textQuestion: {} },
        { title: '2 + 2 = ?', questionItem: { question: { choiceQuestion: { type: 'RADIO', options: ['3', '4', '5', '6'].map(opt) },
          grading: { pointValue: 2, correctAnswers: { answers: [{ value: '4' }] } } } } },
        { title: 'Rajah di bawah', questionItem: { image: { contentUri: 'https://lh3.googleusercontent.com/gambar-s2' }, question: {
          choiceQuestion: { type: 'RADIO', options: ['P', 'Q', 'R', 'S'].map(opt) }, grading: { correctAnswers: { answers: [{ value: 'S' }] } } } } },
        { title: 'Tiada kunci', questionItem: { question: { choiceQuestion: { type: 'RADIO', options: ['1', '2', '3', '4'].map(opt) } } } }
      ] }
    };
    const log = g.runMenu('importDariForm', [{ button: 'OK', text: 'https://docs.google.com/forms/d/' + formId + '/edit' }]);
    const msg = log[log.length - 1].msg;
    assert.match(msg, /2 soalan disalin[\s\S]*1 gambar/);
    assert.match(msg, /Tiada kunci/);
    const rows = g.ss.getSheetByName('Input Kuiz').getRange(7, 1, 3, 8).getValues();
    assert.deepStrictEqual(rows[0].slice(0, 7), ['2 + 2 = ?', '3', '4', '5', '6', 'B', '2'].map((v, i) => (i === 6 ? rows[0][6] : v)));
    assert.strictEqual(Number(rows[0][6]), 2);
    assert.strictEqual(rows[1][5], 'D');
    assert.match(rows[1][7], /^https:\/\/drive\.google\.com\/file\/d\//, 'gambar disimpan di Drive');
    assert.strictEqual(rows[2][0], '', 'baris lama dikosongkan');
    assert.strictEqual(g.ss.getSheetByName('Input Kuiz').getRange('B1').getValue(), 'Kuiz Form Bab 5');
    // Pautan murid ditolak
    const l2 = g.runMenu('importDariForm', [{ button: 'OK', text: 'https://docs.google.com/forms/d/e/abc/viewform' }]);
    assert.match(l2[l2.length - 1].msg, /pautan untuk murid/);
    // Terbitkan: gambar Drive → GitHub
    g.ss.getSheetByName('Input Kuiz').getRange('B2').setValue('Bab 5');
    const l3 = g.runMenu('terbitkanKuiz', ['YES', 'YES']);
    assert.match(l3[l3.length - 1].title, /BERJAYA/);
    assert(g.gh.get('t4/kuiz/img/kuiz-form-bab-5/q2.png'));
  });

  await langkah('4h. Ralat mesra: soalan tidak lengkap & token GitHub kosong', async () => {
    const input = g.ss.getSheetByName('Input Kuiz');
    input.getRange(7, 6).setValue('E');
    let log = g.runMenu('terbitkanKuiz');
    assert.match(log[0].msg, /Baris 7: Answer mesti A, B, C atau D/);
    input.getRange(7, 6).setValue('B');
    const tok = g.props.GITHUB_TOKEN;
    delete g.props.GITHUB_TOKEN;
    log = g.runMenu('terbitkanKuiz', ['YES']);
    assert.match(log[log.length - 1].msg, /GITHUB_TOKEN belum diisi/);
    g.props.GITHUB_TOKEN = tok;
  });

  await langkah('4i. Data contoh: 2 kelas × 5 murid + kuiz 10 soalan', async () => {
    g.runMenu('masukkanDataContoh', ['YES']);
    const m = g.rows('Murid').filter(r => /^M90/.test(r[0]));
    assert.strictEqual(m.length, 10);
    assert.deepStrictEqual([...new Set(m.map(r => r[2]))], ['4 Bestari', '4 Cemerlang']);
    const log = g.runMenu('terbitkanKuiz', ['YES', 'YES']);
    assert.match(log[log.length - 1].title, /BERJAYA – 10 soalan/);
    // Simpan salinan JSON kuiz contoh untuk repo
    const out = path.join(__dirname, '..', 'kuiz', 'matematik-tingkatan-4-kuiz-contoh.json');
    const j = JSON.parse(g.gh.get('t4/kuiz/matematik-tingkatan-4-kuiz-contoh.json').buf.toString());
    j.createdAt = '2026-11-02T00:00:00.000Z';
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(j, null, 2) + '\n');
  });

  await srv.close();
  selesai();
})().catch(e => { console.error(e); process.exit(1); });
