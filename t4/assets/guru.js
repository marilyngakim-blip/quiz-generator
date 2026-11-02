// Laman guru: papan pemuka, belum menjawab, ranking, analisis item, CSV.
(function () {
  const { api, el, tarikh, masa } = window.T4;
  const app = document.getElementById('app');
  const top = document.getElementById('top');
  const GRED = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G'];
  const ss = {
    get() { try { return sessionStorage.getItem('t4.guru'); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem('t4.guru', v); } catch (e) { /* abaikan */ } },
    del() { try { sessionStorage.removeItem('t4.guru'); } catch (e) { /* abaikan */ } }
  };
  let dash = null;
  let tab = 'dash';
  const soalanCache = {};

  function g(action, data) {
    return api(action, Object.assign({ token: ss.get() }, data || {}), { guru: true }).then(r => {
      if (r && r.auth) { ss.del(); login(); throw new Error('auth'); }
      return r;
    });
  }

  function setTop(right) {
    top.innerHTML = '';
    top.append(window.T4.topbar('📊 Laman Guru – Kuiz Matematik T4', null, right));
  }

  /* ---------------- Log masuk ---------------- */
  function login() {
    setTop(null);
    const pass = el('input', { class: 'input', type: 'password', id: 'kata-laluan', autocomplete: 'current-password' });
    const msg = el('p', { class: 'error', role: 'alert' });
    const btn = el('button', { class: 'btn block', type: 'submit', text: 'Masuk' });
    const form = el('form', {}, el('label', { class: 'field' }, el('span', { text: 'Kata laluan guru' }), pass), msg, btn);
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      btn.disabled = true;
      const r = await api('guruLogin', { password: pass.value });
      btn.disabled = false;
      if (!r || !r.ok) { msg.textContent = (r && r.error) || 'Ralat.'; return; }
      ss.set(r.token);
      mula();
    });
    app.innerHTML = '';
    app.append(el('div', { class: 'card', style: 'max-width:420px;margin:32px auto' }, el('h1', { text: 'Log masuk guru' }), form));
    pass.focus();
  }

  /* ---------------- Rangka ---------------- */
  const TABS = [['dash', 'Papan pemuka'], ['belum', 'Belum menjawab'], ['rank', 'Ranking'], ['item', 'Analisis item'], ['csv', 'Muat turun CSV']];
  const isi = el('div', { id: 'isi' });

  async function mula() {
    setTop(el('div', { class: 'who' },
      el('button', { class: 'link', type: 'button', text: 'Muat semula', style: 'color:#fff', onclick: () => muatDash().then(lukis) }), ' · ',
      el('button', { class: 'link', type: 'button', text: 'Log keluar', style: 'color:#fff', onclick: () => { ss.del(); login(); } })));
    app.innerHTML = '';
    app.append(el('nav', { class: 'tabs', id: 'tabs' }, TABS.map(([k, t]) => el('button', { type: 'button', 'data-tab': k, text: t, onclick: () => { tab = k; lukis(); } }))), isi);
    isi.innerHTML = '';
    isi.append(el('div', { class: 'loading', text: 'Memuatkan data…' }));
    try { await muatDash(); } catch (e) { return; }
    lukis();
  }

  async function muatDash() {
    const r = await g('guruDashboard');
    if (!r || !r.ok) { isi.innerHTML = ''; isi.append(el('p', { class: 'error', text: (r && r.error) || 'Ralat.' })); throw new Error('x'); }
    dash = r;
  }

  function lukis() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    isi.innerHTML = '';
    ({ dash: lukisDash, belum: lukisBelum, rank: lukisRank, item: lukisItem, csv: lukisCsv })[tab]();
  }

  function pilihKuiz(id, semua, onChange) {
    const s = el('select', { class: 'input', id: id },
      semua ? el('option', { value: 'semua', text: semua }) : null,
      dash.quizzes.map(q => el('option', { value: q.id, text: q.tajuk + ' (' + q.status + ')' })));
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  const pct = v => (v == null ? '–' : v + '%');
  const bar = (v, cls) => el('div', { class: 'bar ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, v || 0)) + '%' }));
  const tbl = (head, rows, attrs) => el('div', { class: 'tbl-wrap' }, el('table', attrs || {},
    el('thead', {}, el('tr', {}, head.map(h => el('th', { class: /^(Purata|Tertinggi|Terendah|Markah|Masa|%|Bil|Sudah|Penyertaan|A|B|C|D|Kosong|#)/.test(h) ? 'num' : '', text: h })))),
    el('tbody', {}, rows)));

  /* ---------------- 1. Papan pemuka ---------------- */
  function lukisDash() {
    isi.append(el('p', { class: 'muted small', text: dash.bilMurid + ' murid aktif dalam ' + dash.kelas.length + ' kelas · data dikemas kini setiap minit · peratus dikira guna cubaan yang ditetapkan (Pertama/Terbaik).' }));
    if (!dash.quizzes.length) { isi.append(el('div', { class: 'card empty', text: 'Belum ada kuiz. Terbitkan kuiz dari Google Sheet.' })); return; }
    dash.quizzes.forEach(q => {
      const s = q.semua;
      const badge = q.status === 'Dibuka' ? 'ok' : q.status === 'Ditutup' ? '' : 'warn';
      const rows = q.kelas.map(k => el('tr', {},
        el('td', { text: k.kelas }),
        el('td', { class: 'num', text: k.sudah + '/' + k.jumlah }),
        el('td', {}, el('div', { class: 'small', text: k.penyertaan + '%' }), bar(k.penyertaan, k.penyertaan < 50 ? 'no' : 'ok')),
        el('td', { class: 'num', text: pct(k.purata) }),
        el('td', { class: 'num', text: pct(k.tertinggi) }),
        el('td', { class: 'num', text: pct(k.terendah) }),
        el('td', {}, el('div', { class: 'gred-row' }, GRED.map(x => el('span', {}, x, el('b', { text: String(k.gred[x]) })))))));
      isi.append(el('div', { class: 'card', 'data-quiz': q.id },
        el('div', { class: 'row', style: 'display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap' },
          el('h2', { text: q.tajuk }), el('span', { class: 'badge ' + badge, text: q.status })),
        el('p', { class: 'muted small', text: [q.topik, q.n + ' soalan', q.had ? q.had + ' minit' : 'tiada had masa',
          'cubaan: ' + (q.cubaan || 'tanpa had'), 'ranking: ' + q.ranking, 'jawapan: ' + q.tunjuk].filter(Boolean).join(' · ') }),
        el('p', { class: 'muted small', text: 'Buka: ' + tarikh(q.buka) + ' · Tutup: ' + tarikh(q.tutup) }),
        el('div', { class: 'stats' },
          el('div', { class: 'stat' }, el('b', { text: s.sudah + '/' + s.jumlah }), el('span', { text: 'sudah menjawab' })),
          el('div', { class: 'stat' }, el('b', { text: s.penyertaan + '%' }), el('span', { text: 'penyertaan' })),
          el('div', { class: 'stat' }, el('b', { text: pct(s.purata) }), el('span', { text: 'purata' })),
          el('div', { class: 'stat' }, el('b', { text: pct(s.tertinggi) + ' / ' + pct(s.terendah) }), el('span', { text: 'tertinggi / terendah' }))),
        tbl(['Kelas', 'Sudah', 'Penyertaan', 'Purata', 'Tertinggi', 'Terendah', 'Taburan gred (SPM)'], rows),
        el('div', { class: 'actions' },
          el('button', { class: 'btn sm ghost', type: 'button', text: 'Belum menjawab', onclick: () => { tab = 'belum'; lukis(); lukisBelumQuiz(q.id); } }),
          el('button', { class: 'btn sm ghost', type: 'button', text: 'Analisis item', onclick: () => { tab = 'item'; lukis(); lukisItemQuiz(q.id); } }))));
    });
  }

  /* ---------------- 2. Belum menjawab ---------------- */
  const belumBox = el('div');
  function lukisBelum() {
    if (!dash.quizzes.length) return isi.append(el('div', { class: 'card empty', text: 'Belum ada kuiz.' }));
    const s = pilihKuiz('pilih-belum', null, lukisBelumQuiz);
    isi.append(el('div', { class: 'toolbar' }, el('label', { class: 'field' }, el('span', { text: 'Kuiz' }), s)), belumBox);
    lukisBelumQuiz(s.value);
  }
  function teksBelum(r, k) {
    return 'Kuiz: ' + r.tajuk + '\nKelas: ' + k.kelas + '\nTarikh tutup: ' + tarikh(r.tutup) +
      '\nBelum menjawab (' + k.belum.length + ' daripada ' + k.jumlah + '):\n' +
      (k.belum.length ? k.belum.map((n, i) => (i + 1) + '. ' + n).join('\n') : '(semua sudah menjawab)');
  }
  async function salin(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select();
      try { document.execCommand('copy'); } catch (x) { /* abaikan */ } t.remove();
    }
    const o = btn.textContent; btn.textContent = '✓ Disalin'; setTimeout(() => { btn.textContent = o; }, 1500);
  }
  function cetak(card) {
    card.classList.add('print-me');
    document.body.classList.add('printing-one');
    const done = () => { card.classList.remove('print-me'); document.body.classList.remove('printing-one'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
  async function lukisBelumQuiz(id) {
    const sel = document.getElementById('pilih-belum');
    if (sel) sel.value = id;
    belumBox.innerHTML = '';
    belumBox.append(el('div', { class: 'loading', text: 'Memuatkan…' }));
    let r;
    try { r = await g('guruBelum', { quizId: id }); } catch (e) { return; }
    belumBox.innerHTML = '';
    if (!r.ok) return belumBox.append(el('p', { class: 'error', text: r.error }));
    const semua = r.kelas.map(k => teksBelum(r, k)).join('\n\n');
    belumBox.append(el('div', { class: 'actions no-print' },
      el('button', { class: 'btn sm', type: 'button', text: 'Salin semua kelas', onclick: e => salin(semua, e.target) }),
      el('button', { class: 'btn sm ghost', type: 'button', text: 'Cetak semua', onclick: () => window.print() })));
    r.kelas.forEach(k => {
      const card = el('div', { class: 'card', 'data-kelas': k.kelas },
        el('h2', { text: k.kelas + ' – ' + k.belum.length + ' belum menjawab' }),
        el('p', { class: 'muted small', text: r.tajuk + ' · ' + (k.jumlah - k.belum.length) + '/' + k.jumlah + ' sudah menjawab · tutup ' + tarikh(r.tutup) }),
        k.belum.length ? el('ol', { class: 'names' }, k.belum.map(n => el('li', { text: n }))) : el('p', { class: 'badge ok', text: 'Semua sudah menjawab 🎉' }));
      card.append(el('div', { class: 'actions no-print' },
        el('button', { class: 'btn sm ghost', type: 'button', text: 'Salin', onclick: e => salin(teksBelum(r, k), e.target) }),
        el('button', { class: 'btn sm ghost', type: 'button', text: 'Cetak', onclick: () => cetak(card) })));
      belumBox.append(card);
    });
  }

  /* ---------------- 3. Ranking ---------------- */
  const rankBox = el('div');
  function lukisRank() {
    const s = pilihKuiz('pilih-rank', 'Keseluruhan (semua kuiz)', lukisRankQuiz);
    isi.append(el('div', { class: 'toolbar' }, el('label', { class: 'field' }, el('span', { text: 'Ranking bagi' }), s)), rankBox);
    lukisRankQuiz(s.value);
  }
  async function lukisRankQuiz(id) {
    rankBox.innerHTML = '';
    rankBox.append(el('div', { class: 'loading', text: 'Memuatkan…' }));
    let r;
    try { r = await g('guruRanking', { quizId: id }); } catch (e) { return; }
    rankBox.innerHTML = '';
    if (!r.ok) return rankBox.append(el('p', { class: 'error', text: r.error }));
    const semua = id === 'semua';
    rankBox.append(el('div', { class: 'card', id: 'antara-kelas' }, el('h2', { text: 'Antara kelas – ' + r.tajuk }),
      el('p', { class: 'muted small', text: 'Purata peratus murid yang sudah menjawab' + (semua ? ' (purata keseluruhan setiap murid).' : '.') }),
      tbl(['#', 'Kelas', 'Purata', 'Bil'], r.antara.map(x => el('tr', {},
        el('td', { class: 'rank', text: String(x.rank) }), el('td', { text: x.kelas }),
        el('td', { class: 'num', text: pct(x.purata) }), el('td', { class: 'num', text: x.bil + '/' + x.jumlah }))))));
    r.kelas.forEach(k => rankBox.append(el('div', { class: 'card', 'data-kelas': k.kelas }, el('h2', { text: k.kelas }),
      k.list.length ? tbl(['#', 'Nama', semua ? 'Purata' : 'Markah', semua ? 'Kuiz' : '%', 'Masa'], k.list.map(x => el('tr', {},
        el('td', { class: 'rank', text: String(x.rank) }), el('td', { text: x.nama }),
        el('td', { class: 'num', text: semua ? x.pct + '%' : x.score + '/' + x.total }),
        el('td', { class: 'num', text: semua ? x.dijawab + '/' + x.kuiz : x.pct + '%' }),
        el('td', { class: 'num', text: masa(x.time) })))) : el('p', { class: 'empty', text: 'Belum ada markah.' }))));
  }

  /* ---------------- 4. Analisis item ---------------- */
  const itemBox = el('div');
  let itemKelas = '';
  function lukisItem() {
    if (!dash.quizzes.length) return isi.append(el('div', { class: 'card empty', text: 'Belum ada kuiz.' }));
    const s = pilihKuiz('pilih-item', null, v => lukisItemQuiz(v));
    const k = el('select', { class: 'input', id: 'pilih-kelas' }, el('option', { value: '', text: 'Semua kelas' }), dash.kelas.map(x => el('option', { value: x, text: x })));
    k.value = itemKelas;
    k.addEventListener('change', () => { itemKelas = k.value; lukisItemQuiz(s.value); });
    isi.append(el('div', { class: 'toolbar' }, el('label', { class: 'field' }, el('span', { text: 'Kuiz' }), s),
      el('label', { class: 'field' }, el('span', { text: 'Kelas' }), k)), itemBox);
    lukisItemQuiz(s.value);
  }
  async function soalan(id) {
    if (!soalanCache[id]) {
      soalanCache[id] = fetch('kuiz/' + encodeURIComponent(id) + '.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return soalanCache[id];
  }
  async function lukisItemQuiz(id) {
    const sel = document.getElementById('pilih-item');
    if (sel) sel.value = id;
    itemBox.innerHTML = '';
    itemBox.append(el('div', { class: 'loading', text: 'Memuatkan…' }));
    let r, quiz;
    try { [r, quiz] = await Promise.all([g('guruItem', { quizId: id, kelas: itemKelas }), soalan(id)]); } catch (e) { return; }
    itemBox.innerHTML = '';
    if (!r.ok) return itemBox.append(el('p', { class: 'error', text: r.error }));
    const lemah = r.items.filter(x => x.betul != null && x.betul < 50);
    itemBox.append(el('div', { class: 'card' }, el('h2', { text: r.tajuk }),
      el('p', { class: 'muted small', text: r.bil + ' murid · cubaan ' + r.ranking.toLowerCase() + ' · huruf ikut susunan asal di Sheet (murid melihat pilihan dalam susunan rawak).' }),
      lemah.length ? el('p', { class: 'notice', text: 'Soalan lemah (< 50% betul): ' + lemah.map(x => x.no).join(', ') }) : null,
      tbl(['No', 'Soalan', '% betul', 'A', 'B', 'C', 'D', 'Kosong', 'Pengganggu utama'], r.items.map(x => {
        const q = quiz && quiz.questions[x.no - 1];
        return el('tr', { 'data-no': String(x.no) },
          el('td', { class: 'rank', text: String(x.no) }),
          el('td', { class: 'small', style: 'min-width:180px', text: q ? (q.q.length > 90 ? q.q.slice(0, 90) + '…' : q.q) : '' }),
          el('td', { class: 'num' + (x.betul != null && x.betul < 50 ? ' weak' : ''), style: 'min-width:80px' },
            el('div', { text: pct(x.betul) }), bar(x.betul, x.betul < 50 ? 'no' : 'ok')),
          ['A', 'B', 'C', 'D'].map(L => el('td', { class: 'num' + (L === x.jawapan ? ' key' : ''), title: q ? q.options['ABCD'.indexOf(L)] : '', text: String(x.kira[L]) })),
          el('td', { class: 'num', text: String(x.kira['-']) }),
          el('td', { class: 'small', text: x.pengganggu ? x.pengganggu + ' (' + x.pengganggu_bil + ' murid)' + (q ? ': ' + q.options['ABCD'.indexOf(x.pengganggu)] : '') : '–' }));
      }), { id: 'jadual-item' }),
      el('p', { class: 'muted small', text: 'Lajur hijau = jawapan betul.' })));
  }

  /* ---------------- 5. CSV ---------------- */
  function lukisCsv() {
    const s = pilihKuiz('pilih-csv', 'Semua kuiz', () => {});
    const btn = el('button', { class: 'btn', type: 'button', id: 'muat-turun', text: '⬇ Muat turun CSV' });
    const msg = el('p', { class: 'muted small' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      msg.textContent = 'Menyediakan…';
      let r;
      try { r = await g('guruCsv', { quizId: s.value }); } catch (e) { btn.disabled = false; return; }
      btn.disabled = false;
      if (!r.ok) { msg.textContent = r.error; return; }
      const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = '﻿' + [r.header].concat(r.rows).map(row => row.map(q).join(',')).join('\r\n');
      const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
        download: 'markah-' + s.value + '-' + new Date().toISOString().slice(0, 10) + '.csv' });
      document.body.append(a); a.click(); a.remove();
      msg.textContent = r.rows.length + ' baris dimuat turun. Buka dengan Excel atau Google Sheets.';
    });
    isi.append(el('div', { class: 'card' }, el('h2', { text: 'Muat turun markah (CSV)' }),
      el('p', { class: 'muted small', text: 'Semua cubaan disenaraikan. Lajur "Dikira untuk ranking" menandakan cubaan yang digunakan untuk statistik.' }),
      el('div', { class: 'toolbar' }, el('label', { class: 'field' }, el('span', { text: 'Kuiz' }), s), btn), msg));
  }

  if (!window.T4.CFG.APPS_SCRIPT_URL) {
    setTop(null);
    app.innerHTML = '';
    app.append(el('div', { class: 'card' }, el('p', { class: 'error', text: 'Laman belum disambungkan ke Google Sheet (config.js). Terbitkan kuiz pertama dari Sheet.' })));
  } else if (ss.get()) mula(); else login();
})();
