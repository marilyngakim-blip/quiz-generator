// Peringkat 3: papan pemuka guru + belum menjawab + ranking + analisis item + CSV.
//   node t4/ujian/ujian-3-guru.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');
const { startServer, seed } = require('./server');
const { langkah, selesai, ralatKonsol } = require('./alat');

(async () => {
  const srv = await startServer();
  const d = seed(srv.gas);
  const g = srv.gas;
  const base = srv.base + 't4/';

  // Data: 4 Bestari – 3 murid menjawab; 4 Cemerlang – 1 murid.
  const jawab = (m, ans) => {
    const t = g.post({ action: 'login', id: m.id, pin: m.pin }).token;
    g.post({ action: 'start', token: t, quizId: d.quizId });
    g.advance(30000);
    const r = g.post({ action: 'submit', token: t, quizId: d.quizId, answers: ans });
    assert(r.ok, JSON.stringify(r));
    return r;
  };
  const k = d.key;
  const salahS1 = k.map((a, i) => (i === 0 ? 'B' : a));          // 9/10, S1 pilih B
  jawab(d.murid[0], k);                                          // 10/10 (100%)
  jawab(d.murid[1], salahS1);                                    // 9/10 (90%)
  jawab(d.murid[2], k.map((a, i) => (i < 4 ? a : (i === 0 ? 'B' : '')))); // 4/10 (40%)
  jawab(d.murid[5], salahS1.map((a, i) => (i < 6 ? a : 'A')));   // 4 Cemerlang 6/10
  jawab(d.murid[6], k.map(() => 'C'));                          // 4 Cemerlang 2/10

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
  const errors = ralatKonsol(page);

  await langkah('3a. Laman guru dilindungi kata laluan (salah ditolak)', async () => {
    await page.goto(base + 'guru.html');
    await page.fill('#kata-laluan', 'salah');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.getByText('Kata laluan salah.').waitFor();
    assert.strictEqual(g.post({ action: 'guruDashboard', token: 'x.y' }).auth, true, 'API guru tanpa token ditolak');
    // Token murid tidak boleh digunakan untuk API guru
    const tm = g.post({ action: 'login', id: d.murid[0].id, pin: d.murid[0].pin }).token;
    assert.strictEqual(g.post({ action: 'guruBelum', token: tm, quizId: d.quizId }).auth, true);
    await page.fill('#kata-laluan', 'guru123');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.locator('[data-quiz]').first().waitFor();
  });

  await langkah('3b. Papan pemuka: sudah/belum, penyertaan, purata, tertinggi/terendah, gred SPM', async () => {
    const card = page.locator('[data-quiz="' + d.quizId + '"]');
    const txt = await card.innerText();
    assert.match(txt, /5\/10\s*\n?\s*sudah menjawab/);
    assert.match(txt, /50%\s*\n?\s*penyertaan/);
    const rows = await card.locator('tbody tr').allInnerTexts();
    assert.match(rows[0], /4 Bestari\s+3\/5\s+60%\s+76\.7%\s+100%\s+40%/);
    assert.match(rows[0], /A\+\s*2/);
    assert.match(rows[0], /E\s*1/);
    assert.match(rows[1], /4 Cemerlang\s+2\/5\s+40%\s+40%\s+60%\s+20%/);
    await page.screenshot({ path: srv.outDir + '/3-papan.png', fullPage: true });
  });

  await langkah('3c. Belum menjawab mengikut kelas + salin', async () => {
    await page.getByRole('button', { name: 'Belum menjawab' }).first().click();
    const best = page.locator('[data-kelas="4 Bestari"]');
    await best.waitFor();
    const t = await best.innerText();
    assert.match(t, /2 belum menjawab/);
    assert.match(t, /KAVITHA A\/P MURUGAN/);
    assert.match(t, /NUR IMAN BINTI ZULKIFLI/);
    assert(!/ALIA SOFEA/.test(t), 'murid yang sudah menjawab tidak disenaraikan');
    const cem = await page.locator('[data-kelas="4 Cemerlang"]').innerText();
    assert.match(cem, /3 belum menjawab/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await best.getByRole('button', { name: 'Salin' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /Kelas: 4 Bestari[\s\S]*1\. KAVITHA A\/P MURUGAN\n2\. NUR IMAN BINTI ZULKIFLI/);
    await page.screenshot({ path: srv.outDir + '/3-belum.png', fullPage: true });
  });

  await langkah('3d. Ranking penuh setiap kelas dan antara kelas', async () => {
    await page.click('[data-tab="rank"]');
    await page.selectOption('#pilih-rank', d.quizId);
    await page.locator('#antara-kelas tbody tr').first().waitFor();
    const antara = await page.locator('#antara-kelas tbody tr').allInnerTexts();
    assert.match(antara[0], /1\s+4 Bestari\s+76\.7%\s+3\/5/);
    assert.match(antara[1], /2\s+4 Cemerlang\s+40%/);
    const best = await page.locator('[data-kelas="4 Bestari"] tbody tr').allInnerTexts();
    assert.strictEqual(best.length, 3, 'senarai penuh (semua yang menjawab)');
    assert.match(best[0], /^1\s+ALIA/);
    await page.selectOption('#pilih-rank', 'semua');
    await page.getByText('Antara kelas – Keseluruhan').waitFor();
  });

  await langkah('3e. Analisis item: % betul dan pengganggu paling kerap', async () => {
    await page.click('[data-tab="item"]');
    await page.locator('#jadual-item tr[data-no="1"]').waitFor();
    const r1 = await page.locator('#jadual-item tr[data-no="1"]').innerText();
    // S1: betul A; Alia A, Bryan B, Danial A, Aidan B, Farah C → 40% betul, pengganggu B (2)
    assert.match(r1, /40%/);
    assert.match(r1, /B \(2 murid\)/);
    assert.match(r1, /Punca-punca/);
    const r7 = await page.locator('#jadual-item tr[data-no="7"]').innerText();
    assert.match(r7, /40%/);
    await page.getByText(/Soalan lemah/).waitFor();
    await page.selectOption('#pilih-kelas', '4 Bestari');
    await page.getByText('3 murid ·', { exact: false }).waitFor();
    assert.match(await page.locator('#jadual-item tr[data-no="1"]').innerText(), /67%/);
    await page.screenshot({ path: srv.outDir + '/3-item.png', fullPage: true });
  });

  await langkah('3f. Muat turun CSV markah', async () => {
    await page.click('[data-tab="csv"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#muat-turun')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    assert(csv.startsWith('﻿Masa,QuizId'), 'BOM + tajuk');
    const lines = csv.trim().split(/\r\n/);
    assert.strictEqual(lines.length, 6);
    assert.match(csv, /ALIA SOFEA BINTI AHMAD,4 Bestari,1,10,10,100,A\+,30,Ya/);
    assert.match(dl.suggestedFilename(), /^markah-semua-\d{4}-\d\d-\d\d\.csv$/);
  });

  await langkah('3g. Papan pemuka mesra telefon (tiada skrol mendatar halaman)', async () => {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p.goto(base + 'guru.html');
    await p.fill('#kata-laluan', 'guru123');
    await p.getByRole('button', { name: 'Masuk' }).click();
    await p.locator('[data-quiz]').first().waitFor();
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    assert(w <= 390, 'lebar ' + w);
    await p.screenshot({ path: srv.outDir + '/3-telefon.png', fullPage: true });
  });

  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('Tangkapan skrin: ' + srv.outDir);
  await browser.close();
  await srv.close();
  selesai();
})().catch(e => { console.error(e); process.exit(1); });
