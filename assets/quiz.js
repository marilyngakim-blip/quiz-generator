(function () {
  const { decorateHero, subjectOf, levelOf, store, currentKid, bestKey, getHistory, addLocalHistory, pctOf } = window.KUIZ;
  const app = document.getElementById('app');
  const LETTERS = ['A', 'B', 'C', 'D'];
  const quizId = new URLSearchParams(location.search).get('id');
  const config = window.KUIZ_CONFIG || {};
  decorateHero();

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  function showError(msg) {
    document.getElementById('title').textContent = 'Alamak! 😅';
    app.innerHTML = '';
    app.append(el('div', { class: 'card lift' }, el('p', { class: 'error', text: msg }),
      el('a', { class: 'btn', href: 'index.html', text: 'Kembali ke senarai' })));
  }

  if (!quizId || !/^[a-z0-9._-]+$/i.test(quizId)) { showError('Pautan kuiz tidak sah.'); return; }

  fetch('quizzes/' + quizId + '.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(render)
    .catch(() => showError('Kuiz tidak dijumpai.'));

  function render(quiz) {
    const sub = subjectOf(quiz.title);
    document.title = quiz.title;
    document.getElementById('title').textContent = sub.emoji + ' ' + quiz.title;
    document.getElementById('subtitle').textContent = quiz.questions.length + ' soalan · jawapan ditunjuk selepas hantar';
    app.innerHTML = '';

    const kid = currentKid();
    const nama = el('input', { type: 'text', autocomplete: 'name', maxlength: '80' });
    if (kid) nama.value = kid.nama;
    app.append(el('div', { class: 'card lift' },
      el('label', { class: 'field' }, 'Nama', nama)));

    const form = el('form');
    quiz.questions.forEach((q, i) => {
      const card = el('div', { class: 'card q-card', id: 'q' + (i + 1) });
      card.append(el('div', { class: 'q-no', text: 'Soalan ' + (i + 1) }), el('div', { class: 'q-text', text: q.q }));
      if (q.image) card.append(el('img', { class: 'q-img', src: 'quizzes/' + q.image, alt: 'Rajah soalan ' + (i + 1) }));
      q.options.forEach((opt, j) => {
        const input = el('input', { type: 'radio', name: 'q' + i, value: LETTERS[j] });
        const label = el('label', { class: 'opt' }, input, el('span', { class: 'L', text: LETTERS[j] }), el('span', { text: opt }));
        input.addEventListener('change', () => {
          markChosen(card, label);
          updateProgress();
          saveDraft();
        });
        card.append(label);
      });
      form.append(card);
    });

    const bar = el('i');
    const barLabel = el('div', { class: 'progress-label' });
    const msg = el('p', { class: 'error' });
    const btn = el('button', { type: 'submit', class: 'btn', text: 'Hantar jawapan 🚀' });
    form.append(el('div', { class: 'sticky' }, el('div', { class: 'progress' }, bar), barLabel, msg, btn));
    app.append(form);

    let cloudPending = null; // draf yang menunggu untuk dihantar ke Google Sheet
    function updateProgress() {
      const done = form.querySelectorAll('input[type=radio]:checked').length;
      bar.style.width = (done / quiz.questions.length * 100) + '%';
      const status = !cloud ? ' · 💾 disimpan automatik'
        : cloudState === 'saving' ? ' · ⏳ menyimpan…'
        : cloudState === 'fail' ? ' · 💾 disimpan dalam peranti ini sahaja'
        : ' · ☁️ disimpan';
      barLabel.textContent = done + ' / ' + quiz.questions.length + ' dijawab' + (done ? status : '');
    }

    /* ---------- Simpan jawapan separuh jalan ---------- */
    // Disimpan serta-merta dalam peranti ini, dan di Google Sheet (tab "Draf") supaya boleh
    // disambung di peranti lain. Tanda kuiz: draf diabaikan jika soalan diterbitkan semula.
    const sig = quiz.questions.length + ':' + quiz.questions.map(q => q.q.length).join(',');
    const cloud = !quiz.demoKey && !!config.APPS_SCRIPT_URL;
    let draftName = nama.value.trim().toLowerCase();
    let touched = false;   // anak sudah memilih jawapan sejak laman dibuka
    let cloudTimer = null;
    let cloudState = '';   // '' | 'saving' | 'ok' | 'fail'
    const keyFor = n => 'draf.' + quiz.id + '.' + (n || '-');
    const collect = () => quiz.questions.map((_, i) => {
      const c = form.querySelector('input[name="q' + i + '"]:checked');
      return c ? c.value : '';
    });
    function saveDraft() {
      touched = true;
      const answers = collect();
      const d = answers.some(Boolean) ? { sig, answers, at: Date.now() } : null;
      if (d) store.set(keyFor(draftName), JSON.stringify(d)); else store.del(keyFor(draftName));
      queueCloud(draftName, d);
    }
    function queueCloud(n, d) {
      if (!cloud || !n) return;
      cloudPending = { action: d ? 'saveDraft' : 'clearDraft', quizId: quiz.id, nama: n, data: d ? JSON.stringify(d) : '' };
      cloudState = 'saving';
      updateProgress();
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(flushCloud, 1500);
    }
    function flushCloud() {
      clearTimeout(cloudTimer);
      const body = cloudPending;
      cloudPending = null;
      if (!body) return;
      postJSON(body)
        .then(r => { cloudState = r && r.ok ? 'ok' : 'fail'; })
        .catch(() => { cloudState = 'fail'; })
        .then(updateProgress);
    }
    function parseDraft(text) {
      try {
        const d = JSON.parse(text || 'null');
        return d && d.sig === sig && Array.isArray(d.answers) && d.answers.some(Boolean) ? d : null;
      } catch (e) { return null; }
    }
    function applyAnswers(answers) {
      quiz.questions.forEach((_, i) => {
        const card = document.getElementById('q' + (i + 1));
        card.querySelectorAll('.opt').forEach(o => o.classList.remove('chosen'));
        form.querySelectorAll('input[name="q' + i + '"]').forEach(r => {
          r.checked = r.value === answers[i];
          if (r.checked) markChosen(card, r.parentElement);
        });
      });
      updateProgress();
    }
    function firstUnanswered() {
      const i = collect().findIndex(a => !a);
      return i < 0 ? null : document.getElementById('q' + (i + 1));
    }

    const banner = el('div', { class: 'card resume hidden' });
    app.insertBefore(banner, form);
    function showBanner(d, fromOtherDevice) {
      const done = d.answers.filter(Boolean).length;
      const when = new Date(d.at).toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const go = el('button', { type: 'button', class: 'btn', text: '➜ Sambung menjawab' });
      const reset = el('button', { type: 'button', class: 'btn ghost', text: '🔄 Mula semula' });
      go.addEventListener('click', () => {
        const t = firstUnanswered() || form.querySelector('.sticky');
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      reset.addEventListener('click', () => {
        if (!confirm('Padam semua jawapan yang disimpan dan mula semula?')) return;
        store.del(keyFor(draftName));
        applyAnswers([]);
        queueCloud(draftName, null);
        flushCloud();
        banner.classList.add('hidden');
      });
      banner.innerHTML = '';
      banner.append(
        el('p', { class: 'resume-title', text: fromOtherDevice ? '☁️ Selamat kembali! Jawapan dari peranti lain dipulihkan.' : '💾 Selamat kembali! Jawapan kamu disimpan.' }),
        el('p', { class: 'muted', text: done + ' / ' + quiz.questions.length + ' soalan sudah dijawab · disimpan ' + when }),
        el('div', { class: 'actions' }, go, reset));
      banner.classList.remove('hidden');
    }
    function restore() {
      const n = draftName;
      const local = parseDraft(store.get(keyFor(n)));
      if (local) { applyAnswers(local.answers); showBanner(local, false); } else { banner.classList.add('hidden'); }
      if (!cloud || !n) return;
      // Ambil draf dari Google Sheet; guna yang paling baharu.
      postJSON({ action: 'loadDraft', quizId: quiz.id, nama: n }).then(r => {
        if (n !== draftName) return;
        if (!r || !r.ok) { cloudState = 'fail'; updateProgress(); return; }
        const remote = parseDraft(r.data);
        if (local && (!remote || local.at > remote.at)) { if (!touched) queueCloud(n, local); return; }
        if (!remote || touched) return;
        store.set(keyFor(n), JSON.stringify(remote));
        applyAnswers(remote.answers);
        showBanner(remote, true);
        cloudState = 'ok';
        updateProgress();
      }).catch(() => { cloudState = 'fail'; updateProgress(); });
    }
    // Hantar draf terakhir jika laman ditutup sebelum sempat disimpan.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' || !cloudPending) return;
      clearTimeout(cloudTimer);
      if (navigator.sendBeacon && navigator.sendBeacon(config.APPS_SCRIPT_URL, JSON.stringify(cloudPending))) cloudPending = null;
      else flushCloud();
    });
    // Tukar nama: pindah ke draf nama itu (jika belum menjawab), atau simpan di bawah nama baharu.
    nama.addEventListener('change', () => {
      const n = nama.value.trim().toLowerCase();
      if (n === draftName) return;
      const hadAnswers = collect().some(Boolean);
      const old = draftName;
      draftName = n;
      if (hadAnswers) {
        store.del(keyFor(old));
        if (cloud && old) postJSON({ action: 'clearDraft', quizId: quiz.id, nama: old }).catch(() => {});
        saveDraft();
      } else {
        restore();
      }
      loadPrev();
    });

    /* ---------- Markah cubaan sebelum ini ---------- */
    const histCard = el('div', { class: 'card history hidden' });
    app.insertBefore(histCard, banner);
    quiz._prev = [];
    function loadPrev() {
      const n = nama.value.trim();
      quiz._prev = [];
      histCard.classList.add('hidden');
      if (quiz.demoKey || !n) return;
      getHistory(n, quiz.id).then(h => {
        if (nama.value.trim() !== n) return;
        const prev = h.items.filter(r => r.quizId === quiz.id).sort((a, b) => a.attempt - b.attempt);
        quiz._prev = prev;
        if (!prev.length) return;
        histCard.innerHTML = '';
        histCard.append(el('h3', { text: '📊 Markah kamu sebelum ini' }));
        prev.forEach(r => histCard.append(histRow(r, false, null)));
        histCard.append(el('p', { class: 'muted', text: 'Ini cubaan ke-' + (prev[prev.length - 1].attempt + 1) +
          '. Jom cuba dapat markah lebih tinggi! 💪' }));
        histCard.classList.remove('hidden');
      });
    }

    restore();
    loadPrev();
    updateProgress();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      msg.textContent = '';
      if (!nama.value.trim()) {
        msg.textContent = 'Isi nama dahulu ya. 😊';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const answers = quiz.questions.map((_, i) => {
        const c = form.querySelector('input[name="q' + i + '"]:checked');
        return c ? c.value : '';
      });
      const blank = answers.filter(a => !a).length;
      if (blank && !confirm(blank + ' soalan belum dijawab. Hantar juga?')) return;

      clearTimeout(cloudTimer);
      cloudPending = null;
      btn.disabled = true;
      btn.textContent = 'Menyemak… ⏳';
      try {
        const result = quiz.demoKey
          ? gradeLocally(quiz, answers)
          // Lajur "Kelas" di Google Sheet diisi dengan tahap kuiz (contoh Tingkatan 2).
          : await gradeOnServer(quiz, answers, nama.value.trim(), levelOf(quiz.title) || '-');
        store.del(keyFor(draftName)); // sudah dihantar: draf tidak diperlukan lagi
        // Sheet memadam draf semasa menyemak; padam sekali lagi sekiranya simpanan lewat tiba selepas itu.
        if (cloud && draftName) postJSON({ action: 'clearDraft', quizId: quiz.id, nama: draftName }).catch(() => {});
        banner.remove();
        histCard.remove();
        if (!quiz.demoKey) {
          const prev = quiz._prev || [];
          result.attempt = result.attempt || (prev.length ? prev[prev.length - 1].attempt + 1 : 1);
          addLocalHistory(nama.value.trim(), { quizId: quiz.id, title: quiz.title, attempt: result.attempt,
            score: result.score, total: result.total, pct: pctOf(result), at: new Date().toISOString() });
        }
        showResult(quiz, form, result, nama);
      } catch (e) {
        msg.textContent = e.message || 'Jawapan tidak dapat dihantar. Cuba lagi.';
        btn.disabled = false;
        btn.textContent = 'Hantar jawapan 🚀';
      }
    });
  }

  function markChosen(card, label) {
    card.querySelectorAll('.opt').forEach(o => o.classList.remove('chosen'));
    label.classList.add('chosen');
  }

  // Hanya untuk kuiz contoh (demoKey). Kuiz sebenar disemak di Google Sheet.
  function gradeLocally(quiz, answers) {
    let score = 0, total = 0;
    const results = quiz.questions.map((q, i) => {
      const answer = quiz.demoKey[i];
      const marks = q.marks || 1;
      const correct = answers[i] === answer;
      total += marks;
      if (correct) score += marks;
      return { chosen: answers[i], answer, correct };
    });
    return { ok: true, score, total, attempt: null, results };
  }

  async function postJSON(body) {
    const res = await fetch(config.APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain mengelakkan semakan CORS tambahan oleh Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function gradeOnServer(quiz, answers, nama, kelas) {
    if (!config.APPS_SCRIPT_URL) throw new Error('Kuiz belum disambungkan ke Google Sheet (APPS_SCRIPT_URL kosong dalam config.js).');
    const data = await postJSON({ action: 'submit', quizId: quiz.id, nama, kelas, answers });
    if (!data.ok) throw new Error(data.error || 'Ralat semasa menyemak jawapan.');
    return data;
  }

  function cheer(pct) {
    if (pct === 100) return ['⭐⭐⭐', 'Sempurna! Hebatnya kamu! 🏆'];
    if (pct >= 80) return ['⭐⭐⭐', 'Cemerlang! Teruskan! 🎉'];
    if (pct >= 60) return ['⭐⭐', 'Bagus! Sikit lagi nak cemerlang! 💪'];
    if (pct >= 40) return ['⭐', 'Boleh tahan! Semak jawapan dan cuba lagi 📚'];
    return ['🌱', 'Tak apa, setiap cubaan buat kita lebih pandai! 💛'];
  }

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#ff8a3d', '#ffc145', '#2bb3a3', '#5b8def', '#ff6b6b'];
    for (let i = 0; i < 80; i++) {
      const c = el('span', { class: 'confetti' });
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (2.2 + Math.random() * 2) + 's';
      c.style.animationDelay = (Math.random() * .6) + 's';
      c.style.borderRadius = i % 2 ? '50%' : '3px';
      document.body.append(c);
      setTimeout(() => c.remove(), 5000);
    }
  }

  // Satu baris markah: "Cubaan 2 (sekarang)   34/40 · 85%  📈 +6"
  function histRow(r, now, delta) {
    const right = el('span', { text: r.score + '/' + r.total + ' · ' + pctOf(r) + '%' });
    if (delta != null && delta !== 0) right.append(el('span', { class: 'delta ' + (delta > 0 ? 'up' : 'down'),
      text: '  ' + (delta > 0 ? '📈 +' : '📉 ') + delta }));
    return el('div', { class: 'hist-row' + (now ? ' now' : '') },
      el('span', { text: 'Cubaan ' + r.attempt + (now ? ' (sekarang)' : '') }), right);
  }

  // Markah semua cubaan untuk kuiz ini, termasuk yang baru dihantar.
  function compareBlock(quiz, result) {
    const prev = (quiz._prev || []).filter(r => r.attempt < (result.attempt || Infinity));
    if (!prev.length) return null;
    const last = prev[prev.length - 1];
    const box = el('div', { class: 'card history', style: 'text-align:left;margin:12px 0' },
      el('h3', { text: '📊 Perbandingan markah' }));
    prev.forEach(r => box.append(histRow(r, false, null)));
    box.append(histRow({ attempt: result.attempt, score: result.score, total: result.total }, true, result.score - last.score));
    return box;
  }

  function showResult(quiz, form, result, nama) {
    nama.disabled = true;
    form.querySelectorAll('input').forEach(i => { i.disabled = true; });
    form.querySelector('.sticky').remove();

    result.results.forEach((r, i) => {
      const card = document.getElementById('q' + (i + 1));
      card.querySelectorAll('.opt').forEach((o, j) => {
        o.classList.remove('chosen');
        if (LETTERS[j] === r.answer) o.classList.add('correct');
        else if (LETTERS[j] === r.chosen) o.classList.add('wrong');
      });
      card.querySelector('.q-no').after(el('span', { class: 'badge ' + (r.correct ? 'ok' : 'bad'),
        text: r.correct ? '✓ Betul' : (r.chosen ? '✗ Salah' : '✗ Tidak dijawab') }));
      if (!r.correct) card.append(el('p', { class: 'muted', text: 'Jawapan betul: ' + r.answer }));
    });

    const pct = result.total ? Math.round(result.score / result.total * 100) : 0;
    const [stars, words] = cheer(pct);

    // Simpan markah terbaik dalam pelayar ini.
    const key = bestKey(quiz.id, nama.value);
    const prev = store.get(key);
    const prevScore = prev ? Number(prev.split('/')[0]) : -1;
    const isBest = result.score > prevScore;
    if (isBest) store.set(key, result.score + '/' + result.total);

    const ring = el('div', { class: 'ring' }, el('div', {}, String(result.score), el('small', { text: 'daripada ' + result.total })));
    ring.style.setProperty('--p', pct);
    const summary = el('div', { class: 'card lift result' },
      el('div', { class: 'stars', text: stars }),
      ring,
      el('h2', { text: words }),
      el('p', { class: 'muted', text: pct + '%' + (result.attempt ? ' · Cubaan ke-' + result.attempt : '') +
        (isBest && prevScore >= 0 ? ' · 🎖️ Rekod baharu!' : '') }),
      compareBlock(quiz, result),
      el('p', { class: 'muted', text: 'Tatal ke bawah untuk semak jawapan.' }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn teal', href: location.href, text: '🔁 Cuba lagi' }),
        el('a', { class: 'btn', href: 'index.html', text: '🏠 Kuiz lain' })));
    app.prepend(summary);
    app.children[1].classList.remove('lift');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (pct >= 80) confetti();
  }
})();
