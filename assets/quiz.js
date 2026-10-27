(function () {
  const app = document.getElementById('app');
  const LETTERS = ['A', 'B', 'C', 'D'];
  const params = new URLSearchParams(location.search);
  const quizId = params.get('id');
  const config = window.KUIZ_CONFIG || {};

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
    app.innerHTML = '';
    app.append(el('p', { class: 'error', text: msg }), el('p', {}, el('a', { href: 'index.html', text: '← Senarai kuiz' })));
  }

  if (!quizId || !/^[a-z0-9._-]+$/i.test(quizId)) {
    showError('Pautan kuiz tidak sah.');
    return;
  }

  fetch('quizzes/' + quizId + '.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(render)
    .catch(() => showError('Kuiz tidak dijumpai.'));

  function render(quiz) {
    document.title = quiz.title;
    app.innerHTML = '';
    app.append(el('h1', { text: quiz.title }), el('p', { class: 'muted', text: quiz.questions.length + ' soalan · Jawapan dipaparkan selepas anda menghantar.' }));

    const nama = el('input', { type: 'text', autocomplete: 'name', maxlength: '80' });
    const kelas = el('input', { type: 'text', maxlength: '30' });
    app.append(el('div', { class: 'card' },
      el('label', { class: 'field' }, 'Nama penuh', nama),
      el('label', { class: 'field' }, 'Kelas', kelas)));

    const form = el('form');
    quiz.questions.forEach((q, i) => {
      const card = el('div', { class: 'card', id: 'q' + (i + 1) });
      card.append(el('div', { class: 'q-no', text: 'Soalan ' + (i + 1) }), el('div', { class: 'q-text', text: q.q }));
      if (q.image) card.append(el('img', { class: 'q-img', src: 'quizzes/' + q.image, alt: 'Rajah soalan ' + (i + 1) }));
      q.options.forEach((opt, j) => {
        const input = el('input', { type: 'radio', name: 'q' + i, value: LETTERS[j] });
        const label = el('label', { class: 'opt' }, input, el('span', { text: LETTERS[j] + '. ' + opt }));
        input.addEventListener('change', () => {
          card.querySelectorAll('.opt').forEach(o => o.classList.remove('chosen'));
          label.classList.add('chosen');
        });
        card.append(label);
      });
      form.append(card);
    });

    const msg = el('p', { class: 'error' });
    const btn = el('button', { type: 'submit', text: 'Hantar jawapan' });
    form.append(el('div', { class: 'sticky' }, msg, btn));
    app.append(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      msg.textContent = '';
      if (!nama.value.trim() || !kelas.value.trim()) {
        msg.textContent = 'Sila isi nama dan kelas.';
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
      btn.textContent = 'Menyemak…';
      try {
        const result = quiz.demoKey
          ? gradeLocally(quiz, answers)
          : await gradeOnServer(quiz, answers, nama.value.trim(), kelas.value.trim());
        showResult(quiz, form, result, nama, kelas, btn);
      } catch (e) {
        msg.textContent = e.message || 'Jawapan tidak dapat dihantar. Cuba lagi.';
        btn.disabled = false;
        btn.textContent = 'Hantar jawapan';
      }
    });
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

  function showResult(quiz, form, result, nama, kelas, btn) {
    nama.disabled = true;
    kelas.disabled = true;
    form.querySelectorAll('input').forEach(i => { i.disabled = true; });
    btn.parentElement.remove();

    result.results.forEach((r, i) => {
      const card = document.getElementById('q' + (i + 1));
      const opts = card.querySelectorAll('.opt');
      opts.forEach((o, j) => {
        o.classList.remove('chosen');
        if (LETTERS[j] === r.answer) o.classList.add('correct');
        else if (LETTERS[j] === r.chosen) o.classList.add('wrong');
      });
      const head = card.querySelector('.q-no');
      head.append(el('span', { class: 'badge ' + (r.correct ? 'ok' : 'bad'), text: r.correct ? '✓ Betul' : (r.chosen ? '✗ Salah' : '✗ Tidak dijawab') }));
      if (!r.correct) card.append(el('p', { class: 'muted', text: 'Jawapan betul: ' + r.answer }));
    });

    const pct = result.total ? Math.round(result.score / result.total * 100) : 0;
    const summary = el('div', { class: 'card' },
      el('p', { class: 'muted', text: 'Markah anda' }),
      el('p', { class: 'score', text: result.score + ' / ' + result.total + '  (' + pct + '%)' }),
      result.attempt ? el('p', { class: 'muted', text: 'Cubaan ke-' + result.attempt + ' · Markah telah direkodkan.' }) : null,
      quiz.demoKey ? el('p', { class: 'muted', text: 'Ini kuiz contoh: markah tidak direkodkan.' }) : null);
    app.insertBefore(summary, app.children[2]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
