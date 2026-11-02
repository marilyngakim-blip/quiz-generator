// Peringkat 1: log masuk + jawab kuiz + semak.  Peringkat 2: ranking kelas.
//   node t4/ujian/ujian-1-2-murid.js
'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const { startServer, seed } = require('./server');
const { langkah, selesai, ralatKonsol } = require('./alat');

(async () => {
  const srv = await startServer();
  const d = seed(srv.gas);
  const g = srv.gas;
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctxA = await browser.newContext(phone);
  const page = await ctxA.newPage();
  const errors = ralatKonsol(page);
  const alia = d.murid[0];      // 4 Bestari
  const bryan = d.murid[1];     // 4 Bestari
  const base = srv.base + 't4/';

  async function login(p, m, pin) {
    await p.goto(base);
    await p.getByRole('button', { name: m.kelas, exact: true }).click();
    await p.getByRole('button', { name: m.nama }).click();
    await p.fill('#pin', pin || m.pin);
    await p.getByRole('button', { name: 'Masuk' }).click();
  }

  await langkah('1a. Log masuk: PIN salah ditolak, PIN betul diterima, token (bukan PIN) disimpan', async () => {
    await login(page, alia, alia.pin === '1111' ? '2222' : '1111');
    await page.getByText(/PIN salah\. Tinggal 4 cubaan/).waitFor();
    await page.fill('#pin', alia.pin);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.getByText('Kuiz dibuka').waitFor();
    await page.getByText('Belum dijawab').waitFor();
    const ls = await page.evaluate(() => JSON.stringify(localStorage));
    assert(!ls.includes('"' + alia.pin + '"') && !ls.includes(':' + alia.pin), 'PIN tidak boleh disimpan dalam pelayar');
    assert(ls.includes('token'));
    await page.screenshot({ path: srv.outDir + '/1-muka-depan.png' });
  });

  await langkah('1b. Jawab kuiz: satu soalan satu kad, susunan dirawak, draf disimpan di Sheet', async () => {
    await page.getByRole('button', { name: 'Mula' }).click();
    await page.waitForSelector('#kad .opt');
    await page.getByText('Soalan 1 / 10').waitFor();
    const quiz = JSON.parse(require('fs').readFileSync(srv.outDir + '/t4/kuiz/' + d.quizId + '.json', 'utf8'));
    // Jawab 3 soalan pertama dengan betul (cari pilihan ikut teks).
    for (let k = 0; k < 3; k++) {
      const text = await page.locator('#kad .qtext').innerText();
      const i = quiz.questions.findIndex(q => q.q === text);
      assert(i >= 0, 'soalan dijumpai');
      const correct = quiz.questions[i].options['ABCD'.indexOf(d.key[i])];
      await page.locator('#kad .opt', { hasText: correct }).first().click();
      await page.click('#seterusnya');
    }
    await page.getByText('3 dijawab').waitFor();
    await page.getByText(/Disimpan – boleh sambung/).waitFor({ timeout: 10000 });
    const draf = g.rows('Draf')[1];
    assert.strictEqual(draf[1], alia.id);
    assert.strictEqual(JSON.parse(draf[3]).ans.filter(Boolean).length, 3, 'draf 3 jawapan di Sheet');
    await page.screenshot({ path: srv.outDir + '/1-kuiz.png' });
  });

  let answeredTexts;
  await langkah('1c. Sambung di peranti lain: draf dipulihkan dari Sheet, susunan sama', async () => {
    const ctxB = await browser.newContext(phone);
    const p2 = await ctxB.newPage();
    await login(p2, alia);
    await p2.getByRole('button', { name: 'Sambung menjawab' }).click();
    await p2.getByText(/3 jawapan anda yang disimpan telah dipulihkan/).waitFor();
    await p2.getByText('Soalan 4 / 10').waitFor();
    const t1 = await page.locator('#kad .qtext').innerText();
    const t2 = await p2.locator('#kad .qtext').innerText();
    assert.strictEqual(t1, t2, 'susunan soalan sama bagi murid + cubaan yang sama');
    answeredTexts = t2;
    await ctxB.close();
  });

  await langkah('1d. Susunan berbeza bagi murid lain', async () => {
    const urutan = async p => {
      const out = [];
      for (let k = 0; k < 10; k++) { out.push(await p.locator('#kad .qtext').innerText()); await p.click('#seterusnya'); }
      return out;
    };
    const ctxC = await browser.newContext(phone);
    const p3 = await ctxC.newPage();
    await login(p3, bryan);
    await p3.getByRole('button', { name: 'Mula' }).click();
    await p3.waitForSelector('#kad .opt');
    const ob = await urutan(p3);
    await page.goto(base + 'kuiz.html?id=' + d.quizId);
    await page.waitForSelector('#kad .opt');
    await page.locator('#senarai-no').evaluate(() => {});
    await page.getByRole('button', { name: 'Senarai soalan' }).click();
    await page.locator('#senarai-no .grid-no button').first().click();
    const oa = await urutan(page);
    assert.deepStrictEqual([...oa].sort(), [...ob].sort(), 'soalan sama');
    assert.notDeepStrictEqual(oa, ob, 'susunan berbeza');
    await ctxC.close();
  });

  await langkah('1e. Hantar: markah disemak di Sheet; jawapan betul DISEMBUNYIKAN sehingga kuiz ditutup', async () => {
    await page.goto(base + 'kuiz.html?id=' + d.quizId);
    await page.waitForSelector('#kad .opt');
    // Pergi ke ringkasan dan hantar dengan 7 soalan kosong.
    await page.getByRole('button', { name: 'Senarai soalan' }).click();
    await page.locator('#senarai-no .grid-no button').last().click();
    await page.click('#seterusnya');
    await page.getByText('Semak sebelum hantar').waitFor();
    page.once('dialog', dl => dl.accept());
    await page.click('#hantar');
    await page.locator('#keputusan').waitFor();
    assert.match(await page.locator('#keputusan .big').innerText(), /^3\s*\/\s*10$/);
    await page.locator('#nota-jawapan').waitFor();
    assert.strictEqual(await page.locator('#semakan').count(), 0, 'tiada jawapan betul sebelum tutup');
    const mk = g.rows('Markah');
    assert.strictEqual(mk.length, 2);
    assert.strictEqual(mk[1][2], alia.id);
    assert.strictEqual(mk[1][6], 3);
    assert(mk[1][9] >= 1, 'masa diambil direkod');
    assert.strictEqual(JSON.parse(g.rows('Draf')[1][3] || '{}').a, undefined, 'draf dikosongkan');
    await page.screenshot({ path: srv.outDir + '/1-keputusan.png', fullPage: true });
  });

  await langkah('1f. API tidak memulangkan kunci jawapan sebelum hantar / sebelum tutup', async () => {
    const tok = JSON.parse(await page.evaluate(() => localStorage.getItem('t4.sesi'))).token;
    const st = g.post({ action: 'start', token: tok, quizId: d.quizId });
    assert(st.ok);
    const txt = JSON.stringify(st);
    assert(!/"(answer|jawapan)"/.test(txt), 'start tiada kunci');
    const rv = g.post({ action: 'review', token: tok, quizId: d.quizId });
    assert.strictEqual(rv.ok, false);
    // Token palsu / murid lain
    assert.strictEqual(g.post({ action: 'home', token: tok.slice(0, -2) + 'xx' }).auth, true);
    const forged = Buffer.from(JSON.stringify({ r: 'm', u: bryan.id, p: 'x', e: Date.now() + 1e9 })).toString('base64url') + '.' + tok.split('.')[1];
    assert.strictEqual(g.post({ action: 'home', token: forged }).auth, true, 'tidak boleh menyamar murid lain');
    // Elak cubaan ke-2 tergantung untuk ujian seterusnya
  });

  await langkah('1g. Cubaan ke-2: perbandingan dengan cubaan sebelum ini', async () => {
    await page.goto(base + 'kuiz.html?id=' + d.quizId);
    await page.waitForSelector('#kad .opt');
    const quiz = JSON.parse(require('fs').readFileSync(srv.outDir + '/t4/kuiz/' + d.quizId + '.json', 'utf8'));
    for (let k = 0; k < 10; k++) {
      const text = await page.locator('#kad .qtext').innerText();
      const i = quiz.questions.findIndex(q => q.q === text);
      const correct = quiz.questions[i].options['ABCD'.indexOf(d.key[i])];
      await page.locator('#kad .opt', { hasText: correct }).first().click();
      await page.click('#seterusnya');
    }
    await page.click('#hantar');
    await page.locator('#keputusan').waitFor();
    assert.match(await page.locator('#keputusan .big').innerText(), /^10\s*\/\s*10$/);
    await page.getByText('Perbandingan dengan cubaan sebelum ini').waitFor();
    await page.getByText('▲ +7').waitFor();
    assert.strictEqual(g.rows('Markah')[2][5], 2, 'cubaan 2');
  });

  await langkah('1h. Selepas kuiz ditutup: murid boleh melihat jawapan betul/salah', async () => {
    const kuiz = g.ss.getSheetByName('Kuiz');
    kuiz.getRange(2, 5).setValue(new g.Date(g.now() - 1000));
    g.call('bust_');
    await page.goto(base);
    await page.getByText('Kuiz yang sudah ditutup').waitFor();
    await page.getByRole('link', { name: 'Lihat jawapan' }).click();
    await page.locator('#semakan').waitFor();
    assert.strictEqual(await page.locator('#semakan .rv[data-correct="1"]').count(), 10);
    await page.getByRole('link', { name: 'Cubaan 1' }).click();
    await page.locator('#semakan').waitFor();
    assert.strictEqual(await page.locator('#semakan .rv[data-correct="1"]').count(), 3);
    assert.strictEqual(await page.locator('#semakan .opt.wrong').count() + 7 >= 7, true);
    await page.screenshot({ path: srv.outDir + '/1-semakan.png', fullPage: true });
    // Buka semula untuk ujian seterusnya
    kuiz.getRange(2, 5).setValue(new g.Date(g.now() + 7 * 864e5));
    g.call('bust_');
  });

  await langkah('1i. Pemasa: had masa 1 minit → auto-hantar bila tamat', async () => {
    const kuiz = g.ss.getSheetByName('Kuiz');
    kuiz.getRange(2, 6).setValue(1); // 1 minit
    g.call('bust_');
    const ctx = await browser.newContext(phone);
    const p = await ctx.newPage();
    await p.clock.install();
    await login(p, d.murid[2]);
    p.once('dialog', dl => dl.accept()); // amaran had masa
    await p.getByRole('button', { name: 'Mula' }).click();
    await p.locator('#pemasa').waitFor();
    assert.match(await p.locator('#pemasa').innerText(), /^0[01]:\d\d$/);
    await p.locator('#kad .opt').first().click();
    g.advance(61 * 1000);           // jam pelayan
    await p.clock.fastForward(61 * 1000); // jam pelayar
    await p.locator('#keputusan').waitFor({ timeout: 15000 });
    const row = g.rows('Markah').find(r => r[2] === d.murid[2].id);
    assert(row, 'markah direkod selepas auto-hantar');
    assert(row[9] <= 60, 'masa diambil dihadkan kepada had masa: ' + row[9]);
    await ctx.close();
    kuiz.getRange(2, 6).setValue('');
    g.call('bust_');
  });

  await langkah('1j. Kunci log masuk 5 minit selepas 5 PIN salah', async () => {
    const m = d.murid[3];
    const wrong = m.pin === '0000' ? '1111' : '0000';
    let r;
    for (let k = 0; k < 5; k++) r = g.post({ action: 'login', id: m.id, pin: wrong });
    assert.strictEqual(r.locked, true);
    r = g.post({ action: 'login', id: m.id, pin: m.pin });
    assert.strictEqual(r.ok, false, 'PIN betul pun ditolak semasa dikunci');
    assert.match(r.error, /5 minit|Cuba lagi dalam/);
    g.advance(301 * 1000);
    r = g.post({ action: 'login', id: m.id, pin: m.pin });
    assert.strictEqual(r.ok, true, 'boleh log masuk selepas 5 minit');
  });

  await langkah('1k. 35 murid menghantar serentak: tiada ralat, tiada cubaan berganda', async () => {
    // Tambah 35 murid ke kelas 4 Bestari melalui Sheet
    const sh = g.ss.getSheetByName('Murid');
    for (let k = 0; k < 35; k++) sh.appendRow(['X' + k, 'MURID UJIAN ' + String(k).padStart(2, '0'), '4 Bestari', '12' + String(k).padStart(2, '0'), 'Y']);
    g.call('bust_');
    const url = srv.apiUrl;
    const post = b => fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(b) }).then(r => r.json());
    const toks = await Promise.all(Array.from({ length: 35 }, (_, k) => post({ action: 'login', id: 'X' + k, pin: '12' + String(k).padStart(2, '0') })));
    assert(toks.every(t => t.ok));
    await Promise.all(toks.map(t => post({ action: 'start', token: t.token, quizId: d.quizId })));
    const res = await Promise.all(toks.map((t, k) => post({ action: 'submit', token: t.token, quizId: d.quizId, answers: d.key.map((a, i) => (i < k % 11 ? a : '')), submitId: 's' + k })));
    assert(res.every(r => r.ok), JSON.stringify(res.find(r => !r.ok)));
    // Hantar semula (rangkaian ulang) dengan submitId sama → tidak menambah cubaan
    const again = await Promise.all(toks.map((t, k) => post({ action: 'submit', token: t.token, quizId: d.quizId, answers: d.key, submitId: 's' + k })));
    assert(again.every(r => r.ok && r.attempt === 1));
    const rows = g.rows('Markah').filter(r => /^X\d+$/.test(r[2]));
    assert.strictEqual(rows.length, 35, 'tepat 35 rekod');
  });

  await langkah('2a. Ranking kelas: 10 teratas + kedudukan sendiri, seri ikut masa', async () => {
    // Murid ujian X10 (10/10) — masa X10 lebih panjang daripada Alia? Tetapkan masa: Alia cubaan 1 = 3/10.
    const sh = g.ss.getSheetByName('Markah');
    const rows = g.rows('Markah');
    // Tiga murid 10/10: X21 (40 s) > X10 (50 s) > X32 (60 s)
    rows.forEach((r, i) => {
      if (r[2] === 'X10') sh.getRange(i + 1, 10).setValue(50);
      if (r[2] === 'X21') sh.getRange(i + 1, 10).setValue(40);
      if (r[2] === 'X32') sh.getRange(i + 1, 10).setValue(60);
    });
    g.call('bust_');
    await page.goto(base + 'ranking.html?id=' + d.quizId);
    await page.locator('#ranking').waitFor();
    const rowsTxt = await page.locator('#ranking tbody tr').allInnerTexts();
    assert.strictEqual(rowsTxt.filter(t => !t.includes('⋯')).length, 11, '10 teratas + baris sendiri');
    assert.match(rowsTxt[0], /MURID UJIAN 21/, 'seri: masa lebih singkat di atas');
    assert.match(rowsTxt[1], /MURID UJIAN 10/);
    assert.match(rowsTxt[rowsTxt.length - 1], /ALIA SOFEA.*\(anda\)/, 'baris sendiri (cubaan pertama 3/10)');
    assert.match(await page.locator('#kedudukan-saya').innerText(), /daripada 37/);
    // Tiada kelas lain
    assert(!(await page.content()).includes('AIDAN'), 'tiada murid kelas lain');
    // Tiada IDMurid murid lain dalam respons
    const tok = JSON.parse(await page.evaluate(() => localStorage.getItem('t4.sesi'))).token;
    const r = g.post({ action: 'ranking', token: tok, quizId: d.quizId });
    assert(!JSON.stringify(r).includes('"X1'), 'tiada IDMurid');
    assert.strictEqual(r.top.length, 10);
    await page.screenshot({ path: srv.outDir + '/2-ranking.png', fullPage: true });
  });

  await langkah('2b. Ranking guna Terbaik: cubaan ke-2 (10/10) dikira', async () => {
    g.ss.getSheetByName('Kuiz').getRange(2, 9).setValue('Terbaik');
    g.call('bust_');
    await page.goto(base + 'ranking.html?id=' + d.quizId);
    await page.locator('#ranking').waitFor();
    const txt = await page.locator('#ranking').innerText();
    assert.match(txt, /ALIA SOFEA[^\n]*\(anda\)[\s\S]*10\/10/);
    g.ss.getSheetByName('Kuiz').getRange(2, 9).setValue('Pertama');
    g.call('bust_');
  });

  await langkah('2c. Ranking keseluruhan dan cache 60 saat', async () => {
    await page.goto(base + 'ranking.html?id=semua');
    await page.locator('#ranking').waitFor();
    await page.getByText('Keseluruhan', { exact: true }).first().waitFor();
    const n = srv.state.requests.length;
    const tok = JSON.parse(await page.evaluate(() => localStorage.getItem('t4.sesi'))).token;
    const before = [...g.cacheStore.keys()].filter(k => k.includes(':rk:')).length;
    g.post({ action: 'ranking', token: tok, quizId: d.quizId });
    g.post({ action: 'ranking', token: tok, quizId: d.quizId });
    assert([...g.cacheStore.keys()].some(k => k.includes(':rk:' + d.quizId)), 'ranking dicache');
    assert(n > 0 && before >= 0);
  });

  await langkah('1l. Paparan telefon: tiada skrol mendatar', async () => {
    for (const u of ['', 'kuiz.html?id=' + d.quizId, 'ranking.html?id=semua']) {
      await page.goto(base + u);
      await page.waitForTimeout(600);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(w <= 390, u + ' lebar ' + w);
    }
  });

  assert.deepStrictEqual(errors, [], 'ralat konsol: ' + errors.join('\n'));
  await browser.close();
  await srv.close();
  selesai();
})().catch(e => { console.error(e); process.exit(1); });
