(function () {
  const { decorateHero, subjectOf, levelOf, store, currentKid, bestKey } = window.KUIZ;
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
      const card = el('div', { class: 'card', id: 'q' + (i + 1) });
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

    function updateProgress() {
      const done = form.querySelectorAll('input[type=radio]:checked').length;
      bar.style.width = (done / quiz.questions.length * 100) + '%';
      barLabel.textContent = done + ' / ' + quiz.questions.length + ' dijawab' + (done ? ' · 💾 disimpan automatik' : '');
    }

    /* ---------- Simpan jawapan separuh jalan (dalam peranti ini) ---------- */
    // Tanda kuiz: jika soalan diterbitkan semula dengan bilangan/teks berbeza, draf lama diabaikan.
    const sig = quiz.questions.length + ':' + quiz.questions.map(q => q.q.length).join(',');
    let draftName = nama.value.trim().toLowerCase();
    const keyFor = n => 'draf.' + quiz.id + '.' + (n || '-');
    const collect = () => quiz.questions.map((_, i) => {
      const c = form.querySelector('input[name="q' + i + '"]:checked');
      return c ? c.value : '';
    });
    function saveDraft() {
      const answers = collect();
      if (answers.every(a => !a)) store.del(keyFor(draftName));
      else store.set(keyFor(draftName), JSON.stringify({ sig, answers, at: Date.now() }));
    }
    function loadDraft(n) {
      try {
        const d = JSON.parse(store.get(keyFor(n)) || 'null');
        return d && d.sig === sig && Array.isArray(d.answers) ? d : null;
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
    function showBanner(d) {
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
        banner.classList.add('hidden');
      });
      banner.innerHTML = '';
      banner.append(
        el('p', { class: 'resume-title', text: '💾 Selamat kembali! Jawapan kamu disimpan.' }),
        el('p', { class: 'muted', text: done + ' / ' + quiz.questions.length + ' soalan sudah dijawab · disimpan ' + when }),
        el('div', { class: 'actions' }, go, reset));
      banner.classList.remove('hidden');
    }
    function restore() {
      const d = loadDraft(draftName);
      if (d) { applyAnswers(d.answers); showBanner(d); } else { banner.classList.add('hidden'); }
    }
    // Tukar nama: pindah ke draf nama itu (jika belum menjawab), atau simpan di bawah nama baharu.
    nama.addEventListener('change', () => {
      const n = nama.value.trim().toLowerCase();
      if (n === draftName) return;
      const hadAnswers = collect().some(Boolean);
      const old = draftName;
      draftName = n;
      if (hadAnswers) { store.del(keyFor(old)); saveDraft(); } else restore();
    });
    restore();
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

      btn.disabled = true;
      btn.textContent = 'Menyemak… ⏳';
      try {
        const result = quiz.demoKey
          ? gradeLocally(quiz, answers)
          // Lajur "Kelas" di Google Sheet diisi dengan tahap kuiz (contoh Tingkatan 2).
          : await gradeOnServer(quiz, answers, nama.value.trim(), levelOf(quiz.title) || '-');
        store.del(keyFor(draftName)); // sudah dihantar: draf tidak diperlukan lagi
        banner.remove();
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

  async function gradeOnServer(quiz, answers, nama, kelas) {
    if (!config.APPS_SCRIPT_URL) throw new Error('Kuiz belum disambungkan ke Google Sheet (APPS_SCRIPT_URL kosong dalam config.js).');
    const res = await fetch(config.APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain mengelakkan semakan CORS tambahan oleh Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submit', quizId: quiz.id, nama, kelas, answers })
    });
    const data = await res.json();
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
