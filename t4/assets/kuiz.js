// Laman menjawab kuiz: satu soalan satu kad, pemasa, draf automatik, keputusan.
(function () {
  const { api, beacon, el, store, tarikh, masa, shuffle, param, perluLogin, topbar } = window.T4;
  const L = ['A', 'B', 'C', 'D'];
  const s = perluLogin();
  if (!s) return;
  const quizId = param('id') || '';
  const app = document.getElementById('app');
  const top = document.getElementById('top');
  const barBox = document.getElementById('bar');

  function setTop(title) {
    top.innerHTML = '';
    top.append(topbar(title || 'Kuiz', s.nama + ' · ' + s.kelas, el('a', { href: 'index.html', text: 'Muka depan' })));
  }

  function show(...nodes) {
    app.innerHTML = '';
    nodes.forEach(n => n && app.append(n));
  }

  function gagal(msg) {
    barBox.innerHTML = '';
    show(el('div', { class: 'card' }, el('p', { class: 'error', text: msg }),
      el('div', { class: 'actions' }, el('a', { class: 'btn', href: 'index.html', text: 'Kembali ke muka depan' }))));
  }

  setTop();
  if (!/^[a-z0-9._-]+$/i.test(quizId)) return gagal('Pautan kuiz tidak sah.');

  async function muatSoalan() {
    const r = await fetch('kuiz/' + encodeURIComponent(quizId) + '.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Soalan kuiz tidak dijumpai.');
    return r.json();
  }

  function semakAuth(r) {
    if (r && r.auth) { location.replace('index.html'); return true; }
    return false;
  }

  /* ================= Paparan soalan (dikongsi: menjawab & semakan) ================= */

  function teksSoalan(q, label) {
    return [
      el('div', { class: 'qno', text: label }),
      el('div', { class: 'qtext', text: q.q }),
      q.image ? el('img', { class: 'qimg', src: 'kuiz/' + q.image, alt: 'Rajah bagi ' + label.toLowerCase(), loading: 'lazy' }) : null
    ].filter(Boolean);
  }

  // Senarai semakan: betul/salah setiap soalan. order/optOrder = susunan yang dilihat murid (atau null = asal).
  function senaraiSemakan(quiz, results, order, optOrder) {
    const box = el('div', { class: 'card', id: 'semakan' }, el('h2', { text: 'Semakan jawapan' }));
    (order || quiz.questions.map((_, i) => i)).forEach((i, pos) => {
      const q = quiz.questions[i];
      const r = results[i];
      const opts = el('div', { class: 'opts' });
      (optOrder ? optOrder[i] : [0, 1, 2, 3]).forEach((o, j) => {
        const cls = L[o] === r.answer ? 'opt correct' : L[o] === r.chosen ? 'opt wrong' : 'opt';
        opts.append(el('button', { class: cls, type: 'button', disabled: true },
          el('span', { class: 'L', text: L[j] }), el('span', { class: 'T', text: q.options[o] })));
      });
      const badge = r.correct ? el('span', { class: 'badge ok', text: '✓ Betul' })
        : el('span', { class: 'badge no', text: r.chosen ? '✗ Salah' : '✗ Tidak dijawab' });
      box.append(el('div', { class: 'rv', 'data-correct': r.correct ? '1' : '0' }, teksSoalan(q, 'Soalan ' + (pos + 1)), badge, el('div', { style: 'height:8px' }), opts));
    });
    return box;
  }

  function jadualCubaan(list, semasa) {
    const rows = list.map((a, i) => {
      const prev = list[i - 1];
      const d = prev ? a.score - prev.score : null;
      return el('tr', { class: a.attempt === semasa ? 'me' : '' },
        el('td', { text: 'Cubaan ' + a.attempt + (a.attempt === semasa ? ' (ini)' : '') }),
        el('td', { class: 'num' }, a.score + '/' + a.total + ' (' + a.pct + '%)',
          d ? el('span', { class: 'delta ' + (d > 0 ? 'up' : 'down'), text: ' ' + (d > 0 ? '▲ +' : '▼ ') + d }) : null),
        el('td', { class: 'num', text: masa(a.time) }));
    });
    return el('div', { class: 'tbl-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Cubaan' }), el('th', { class: 'num', text: 'Markah' }), el('th', { class: 'num', text: 'Masa' }))),
      el('tbody', {}, rows)));
  }

  function kadMarkah(r, tajuk) {
    return el('div', { class: 'card score', id: 'keputusan' },
      el('p', { class: 'muted', text: tajuk + ' · Cubaan ke-' + r.attempt }),
      el('div', { class: 'big' }, String(r.score), el('small', { text: ' / ' + r.total })),
      el('div', { class: 'gred', text: r.pct + '% · Gred ' + r.gred }),
      el('p', { class: 'muted', text: 'Masa diambil: ' + masa(r.time) }));
  }

  /* ================= Keputusan selepas hantar ================= */

  function keputusan(r, quiz, order, optOrder) {
    barBox.innerHTML = '';
    store.del('draf.' + quizId);
    store.del('sub.' + quizId + '.' + r.attempt);
    const semua = (r.sebelum || []).concat([{ attempt: r.attempt, score: r.score, total: r.total, pct: r.pct, time: r.time }]);
    const banding = r.sebelum && r.sebelum.length
      ? el('div', { class: 'card' }, el('h2', { text: 'Perbandingan dengan cubaan sebelum ini' }), jadualCubaan(semua, r.attempt))
      : null;
    const actions = el('div', { class: 'actions' },
      el('a', { class: 'btn', href: 'ranking.html?id=' + encodeURIComponent(quizId), text: '🏆 Ranking kelas' }),
      el('a', { class: 'btn ghost', href: 'index.html', text: 'Muka depan' }),
      r.bolehUlang ? el('a', { class: 'btn ghost', href: 'kuiz.html?id=' + encodeURIComponent(quizId),
        text: 'Cuba lagi' + (r.bakiCubaan != null ? ' (baki ' + r.bakiCubaan + ')' : '') }) : null);
    const jawapan = r.showAnswers && r.results
      ? senaraiSemakan(quiz, r.results, order, optOrder)
      : el('div', { class: 'notice', id: 'nota-jawapan', text: 'Jawapan betul akan dipaparkan selepas kuiz ditutup' +
        (r.tutup ? ' pada ' + tarikh(r.tutup) : '') + '. Lihat semula di muka depan → "Lihat jawapan".' });
    show(el('div', { class: 'notice', style: 'background:var(--ok-bg);color:var(--ok)', text: '✓ Jawapan anda telah dihantar dan direkodkan.' }),
      kadMarkah(r, quiz.title), actions, banding, jawapan);
    window.scrollTo(0, 0);
  }

  /* ================= Semakan selepas kuiz ditutup ================= */

  async function semak() {
    let quiz, r;
    try {
      [quiz, r] = await Promise.all([muatSoalan(), api('review', { token: s.token, quizId: quizId, attempt: Number(param('cubaan')) || 0 })]);
    } catch (e) { return gagal(e.message); }
    if (semakAuth(r)) return;
    if (!r || !r.ok) return gagal((r && r.error || 'Ralat.') + (r && r.tutup ? ' (' + tarikh(r.tutup) + ')' : ''));
    setTop(quiz.title);
    const pilih = r.cubaan.length > 1 ? el('div', { class: 'actions' }, r.cubaan.map(a => el('a', {
      class: 'btn sm ' + (a.attempt === r.attempt ? '' : 'ghost'),
      href: 'kuiz.html?semak=1&id=' + encodeURIComponent(quizId) + '&cubaan=' + a.attempt, text: 'Cubaan ' + a.attempt
    }))) : null;
    show(kadMarkah(r, quiz.title), pilih, senaraiSemakan(quiz, r.results, null, null),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: 'index.html', text: 'Muka depan' })));
  }

  /* ================= Menjawab ================= */

  async function mula() {
    let quiz, st;
    try {
      [quiz, st] = await Promise.all([muatSoalan(), api('start', { token: s.token, quizId: quizId }, { tries: 4 })]);
    } catch (e) { return gagal(e.message); }
    if (semakAuth(st)) return;
    if (!st || !st.ok) return gagal((st && st.error) || 'Ralat.');
    setTop(quiz.title);
    document.title = quiz.title;
    const n = quiz.questions.length;
    if (n !== st.n) return gagal('Soalan kuiz tidak sepadan dengan kunci jawapan di Sheet. Maklumkan kepada guru supaya menerbitkan semula kuiz ini.');

    // Susunan soalan & pilihan dirawakkan bagi setiap murid dan cubaan (jawapan tetap dihantar ikut susunan asal).
    const seed = quizId + '|' + s.id + '|' + st.attempt;
    const order = shuffle(n, seed);
    const optOrder = quiz.questions.map((_, i) => shuffle(4, seed + '|' + i));
    if (st.finished) return keputusan(st, quiz, order, optOrder);

    let ans = Array.from({ length: n }, (_, i) => (st.answers || [])[i] || '');
    const local = store.json('draf.' + quizId);
    let dirty = false;
    if (local && local.attempt === st.attempt && local.t > (st.savedAt || 0) && Array.isArray(local.ans)) {
      ans = Array.from({ length: n }, (_, i) => local.ans[i] || '');
      dirty = true; // simpanan peranti lebih baharu: hantar ke Sheet
    }
    const offset = st.now - Date.now();
    const serverNow = () => Date.now() + offset;
    let pos = Math.max(0, order.findIndex(i => !ans[i]));
    const resumed = ans.some(Boolean);

    /* ---------- Bar atas ---------- */
    const fill = el('i');
    const lblNo = el('span', { id: 'lbl-no' });
    const lblDone = el('span', { class: 'muted' });
    const timerEl = el('span', { class: 'timer hidden', id: 'pemasa', role: 'timer' });
    const saveEl = el('span', { class: 'save', id: 'simpan' });
    barBox.innerHTML = '';
    barBox.append(el('div', { class: 'qbar' }, el('div', { class: 'in' },
      el('div', { class: 'meta' }, el('span', {}, lblNo, ' · ', lblDone), timerEl),
      el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Kemajuan' }, fill),
      el('div', { class: 'meta' }, saveEl))));

    function kemasBar() {
      const done = ans.filter(Boolean).length;
      fill.style.width = (done / n * 100) + '%';
      lblNo.textContent = pos < n ? 'Soalan ' + (pos + 1) + ' / ' + n : 'Semak & hantar';
      lblDone.textContent = done + ' dijawab';
    }
    function status(t, bad) {
      saveEl.textContent = t;
      saveEl.classList.toggle('bad', !!bad);
    }

    /* ---------- Draf automatik ---------- */
    let saving = false, tmr = null, tamat = false, hantarSedang = false;
    function simpanPeranti() { store.set('draf.' + quizId, JSON.stringify({ attempt: st.attempt, ans: ans, t: serverNow() })); }
    function jadual(ms) { clearTimeout(tmr); tmr = setTimeout(flush, ms); }
    function berubah() {
      simpanPeranti();
      dirty = true;
      status('Belum disimpan…');
      jadual(2500);
    }
    async function flush() {
      if (!dirty || saving || tamat) return;
      saving = true;
      dirty = false;
      status('Menyimpan…');
      const r = await api('saveDraft', { token: s.token, quizId: quizId, attempt: st.attempt, answers: ans.slice() }, { tries: 2 });
      saving = false;
      if (semakAuth(r)) return;
      if (r && r.ok) status('☁️ Disimpan – boleh sambung di peranti lain');
      else if (r && r.expired) { masaTamat(); return; }
      else if (r && r.reload) { status('Draf tidak sah. Muat semula laman.', true); return; }
      else { dirty = true; status('⚠️ Belum disimpan ke pelayan – jawapan disimpan dalam peranti ini', true); jadual(10000); return; }
      if (dirty) jadual(2500);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty && !tamat) {
        if (beacon('saveDraft', { token: s.token, quizId: quizId, attempt: st.attempt, answers: ans.slice() })) dirty = false;
      }
    });
    window.addEventListener('beforeunload', ev => {
      if (dirty && !tamat) { ev.preventDefault(); ev.returnValue = ''; }
    });

    /* ---------- Pemasa ---------- */
    const akhir = st.deadline;
    if (akhir && (st.had || akhir - serverNow() < 3600e3)) {
      timerEl.classList.remove('hidden');
      const tick = () => {
        const left = akhir - serverNow();
        if (left <= 0) { timerEl.textContent = '00:00'; masaTamat(); return; }
        const t = Math.ceil(left / 1000);
        const h = Math.floor(t / 3600);
        timerEl.textContent = (h ? h + ':' : '') + String(Math.floor(t % 3600 / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        timerEl.classList.toggle('low', left < 60000);
        timerEl.setAttribute('aria-label', 'Baki masa ' + masa(t));
        setTimeout(tick, 1000 - (serverNow() % 1000) + 5);
      };
      tick();
    }
    function masaTamat() {
      if (tamat) return;
      tamat = true;
      hantar(true);
    }

    /* ---------- Kad soalan ---------- */
    const card = el('div', { class: 'card', id: 'kad' });
    const gridBox = el('div', { class: 'card hidden', id: 'senarai-no' });
    const gridBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Senarai soalan', 'aria-expanded': 'false', onclick: () => {
      gridBox.classList.toggle('hidden');
      gridBtn.setAttribute('aria-expanded', String(!gridBox.classList.contains('hidden')));
      lukisGrid();
    } });
    const msg = el('p', { class: 'error', role: 'alert' });

    function lukisGrid() {
      gridBox.innerHTML = '';
      gridBox.append(el('p', { class: 'muted small', text: 'Tekan nombor untuk pergi ke soalan itu.' }),
        el('div', { class: 'grid-no' }, order.map((i, p) => el('button', {
          type: 'button', class: (ans[i] ? 'done ' : '') + (p === pos ? 'cur' : ''), text: String(p + 1),
          'aria-label': 'Soalan ' + (p + 1) + (ans[i] ? ' (dijawab)' : ' (belum dijawab)'),
          onclick: () => pergi(p)
        }))));
    }

    function pergi(p) {
      pos = Math.max(0, Math.min(n, p));
      lukis();
      window.scrollTo({ top: 0 });
    }

    function lukis() {
      kemasBar();
      card.innerHTML = '';
      msg.textContent = '';
      if (pos >= n) return lukisRingkasan();
      const i = order[pos];
      const q = quiz.questions[i];
      const opts = el('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Pilihan jawapan' });
      optOrder[i].forEach((o, j) => {
        const b = el('button', { class: 'opt', type: 'button', role: 'radio', 'aria-checked': String(ans[i] === L[o]), 'data-l': L[j] },
          el('span', { class: 'L', text: L[j] }), el('span', { class: 'T', text: q.options[o] }));
        b.addEventListener('click', () => {
          if (tamat || hantarSedang) return;
          ans[i] = ans[i] === L[o] ? '' : L[o]; // tekan sekali lagi untuk batal
          opts.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', 'false'));
          if (ans[i]) b.setAttribute('aria-checked', 'true');
          kemasBar();
          if (!gridBox.classList.contains('hidden')) lukisGrid();
          berubah();
        });
        opts.append(b);
      });
      const akhirSoalan = pos === n - 1;
      card.append(...teksSoalan(q, 'Soalan ' + (pos + 1)), opts,
        el('div', { class: 'nav' },
          el('button', { class: 'btn ghost', type: 'button', text: '← Sebelum', disabled: pos === 0, onclick: () => pergi(pos - 1) }),
          el('button', { class: 'btn', type: 'button', id: 'seterusnya', text: akhirSoalan ? 'Semak & hantar' : 'Seterusnya →', onclick: () => pergi(pos + 1) })));
      if (!gridBox.classList.contains('hidden')) lukisGrid();
    }

    function lukisRingkasan() {
      const belum = order.map((i, p) => (ans[i] ? null : p)).filter(p => p != null);
      card.append(el('h2', { text: 'Semak sebelum hantar' }),
        el('p', { text: 'Anda telah menjawab ' + (n - belum.length) + ' daripada ' + n + ' soalan.' }),
        belum.length ? el('div', {}, el('p', { class: 'error', text: 'Belum dijawab:' }),
          el('div', { class: 'grid-no' }, belum.map(p => el('button', { type: 'button', text: String(p + 1), onclick: () => pergi(p) })))) : null,
        msg,
        el('div', { class: 'nav' },
          el('button', { class: 'btn ghost', type: 'button', text: '← Kembali', onclick: () => pergi(n - 1) }),
          el('button', { class: 'btn ok', type: 'button', id: 'hantar', text: 'Hantar jawapan', onclick: () => hantar(false) })));
    }

    document.addEventListener('keydown', ev => {
      if (ev.target.tagName === 'INPUT' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key.toUpperCase();
      if (L.includes(k) && pos < n) { const b = card.querySelector('.opt[data-l="' + k + '"]'); if (b) b.click(); }
      else if (ev.key === 'ArrowRight' && pos < n) pergi(pos + 1);
      else if (ev.key === 'ArrowLeft' && pos > 0) pergi(pos - 1);
    });

    /* ---------- Hantar ---------- */
    async function hantar(auto) {
      if (hantarSedang) return;
      const blank = ans.filter(a => !a).length;
      if (!auto && blank && !confirm(blank + ' soalan belum dijawab. Hantar juga?')) return;
      hantarSedang = true;
      tamat = true;
      clearTimeout(tmr);
      const sk = 'sub.' + quizId + '.' + st.attempt;
      let sid = store.get(sk);
      if (!sid) { sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); store.set(sk, sid); }
      simpanPeranti();
      card.innerHTML = '';
      card.append(el('div', { class: 'loading', text: auto ? '⏱ Masa tamat. Menghantar jawapan anda…' : 'Menghantar jawapan…' }));
      const r = await api('submit', { token: s.token, quizId: quizId, answers: ans.slice(), submitId: sid,
        elapsed: Math.round((serverNow() - st.startedAt) / 1000) }, { tries: 5 });
      if (semakAuth(r)) return;
      if (r && r.ok) return keputusan(r, quiz, order, optOrder);
      hantarSedang = false;
      card.innerHTML = '';
      card.append(el('p', { class: 'error', role: 'alert', text: (r && r.error) || 'Jawapan tidak dapat dihantar.' }),
        el('p', { class: 'muted', text: 'Jawapan anda masih disimpan dalam peranti ini. Semak internet dan cuba lagi.' }),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', id: 'hantar-semula', text: 'Cuba hantar semula', onclick: () => hantar(true) })));
    }

    const intro = resumed ? el('div', { class: 'notice', id: 'sambung', text: 'Selamat kembali! ' + ans.filter(Boolean).length +
      ' jawapan anda yang disimpan telah dipulihkan.' }) : null;
    show(intro, el('div', { class: 'actions no-print', style: 'margin-top:12px' }, gridBtn), gridBox, card);
    lukis();
    status(dirty ? 'Belum disimpan…' : resumed ? '☁️ Disimpan' : 'Jawapan disimpan automatik');
    if (dirty) jadual(500);
  }

  if (param('semak')) semak(); else mula();
})();
