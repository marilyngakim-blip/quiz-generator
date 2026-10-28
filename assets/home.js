(function () {
  const { SITE, LAIN, decorateHero, subjectOf, levelOf, store, currentKid, getHistory, byQuiz, pctOf } = window.KUIZ;
  const $ = id => document.getElementById(id);
  let quizzes = [];
  let subject = null;                       // nama subjek yang dipilih
  let level = (currentKid() || {}).tahap || null; // tahap yang dipaparkan (null = semua)
  let status = 'all';                       // all | done | todo
  let history = new Map();                  // quizId → [cubaan…] anak yang dipilih
  let historySource = '';

  $('title').textContent = SITE.TAJUK || 'Jom Kuiz!';
  $('subtitle').textContent = SITE.SUBTAJUK || '';
  decorateHero();

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Kuiz tanpa tahap dalam tajuk dipaparkan untuk semua tahap.
  // Item boleh jadi kuiz (dari index.json) atau pautan aplikasi (SITE.PAUTAN) dengan subjek/tahap sendiri.
  const itemLevel = q => q.tahap || levelOf(q.title);
  const itemSubject = q => (q.subjek && (SITE.SUBJEK || []).find(s => s.nama === q.subjek)) || subjectOf(q.title);
  const inLevel = q => !level || !itemLevel(q) || itemLevel(q) === level;
  const subjectsForLevel = () => (SITE.SUBJEK || []).filter(s => !level || !s.tahap || s.tahap.indexOf(level) >= 0);

  function renderAll() { renderKids(); renderLevels(); renderSubjects(); renderList(); }

  /* ---------- Pilih anak ---------- */
  function renderKids() {
    const kids = SITE.ANAK || [];
    if (!kids.length) return;
    $('who').classList.remove('hidden');
    const me = currentKid();
    $('hello').textContent = me ? 'Hai, ' + me.nama + '! ' + (me.emoji || '👋') : 'Hai! 👋';
    const box = $('kids');
    box.innerHTML = '';
    kids.forEach(k => {
      const b = el('button', 'kid' + (me && me.nama === k.nama ? ' active' : ''));
      b.type = 'button';
      b.append(el('span', 'e', k.emoji || '🙂'), el('b', null, k.nama), el('small', null, k.tahap || ''));
      b.addEventListener('click', () => {
        store.set('anak', k.nama);
        level = k.tahap || null;
        subject = null;
        status = 'all';
        history = new Map();
        renderAll();
        loadHistory();
      });
      box.append(b);
    });
  }

  /* ---------- Rekod markah anak ---------- */
  function loadHistory() {
    const me = currentKid();
    if (!me) { renderRecord(); return; }
    $('record').classList.remove('hidden');
    $('record').textContent = '⏳ Memuatkan rekod ' + me.nama + '…';
    getHistory(me.nama).then(h => {
      if ((currentKid() || {}).nama !== me.nama) return; // anak lain sudah dipilih
      history = byQuiz(h.items);
      historySource = h.source;
      renderRecord();
      renderList();
    });
  }

  function renderRecord() {
    const me = currentKid();
    const box = $('record');
    $('statusFilter').classList.toggle('hidden', !me);
    if (!me) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '';
    const quizIds = [...history.keys()].filter(id => quizzes.some(q => q.id === id));
    if (!quizIds.length) {
      box.append(el('b', null, '📋 Rekod ' + me.nama), el('span', null, 'Belum ada kuiz dijawab. Jom mula! 🚀'));
      return;
    }
    const latest = quizIds.map(id => { const a = history.get(id); return a[a.length - 1]; });
    const tries = quizIds.reduce((n, id) => n + history.get(id).length, 0);
    const avg = Math.round(latest.reduce((n, r) => n + pctOf(r), 0) / latest.length);
    const btn = el('button', 'chip-btn', 'Lihat kuiz yang sudah dijawab');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      status = 'done'; subject = null; level = null;
      renderLevels(); renderSubjects(); renderList();
      $('listTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.append(...[
      el('b', null, '📋 Rekod ' + me.nama),
      el('span', null, quizIds.length + ' kuiz dijawab · ' + tries + ' cubaan · purata markah terkini ' + avg + '%'),
      historySource === 'local' ? el('small', 'muted', '(rekod dalam peranti ini – Google Sheet tidak dapat dihubungi)') : null,
      btn].filter(Boolean));
  }

  /* ---------- Pilih tahap ---------- */
  function renderLevels() {
    const box = $('levels');
    box.innerHTML = '';
    [null].concat(SITE.TAHAP || []).forEach(t => {
      const b = el('button', 'chip-btn' + (level === t ? ' active' : ''), t || 'Semua tahap');
      b.type = 'button';
      b.addEventListener('click', () => {
        level = t;
        if (subject && !subjectsForLevel().some(s => s.nama === subject)) subject = null;
        renderLevels(); renderSubjects(); renderList();
      });
      box.append(b);
    });
  }

  /* ---------- Petak subjek ---------- */
  function renderSubjects() {
    const counts = new Map();
    quizzes.filter(inLevel).forEach(q => { const s = itemSubject(q); counts.set(s.nama, (counts.get(s.nama) || 0) + 1); });
    const list = subjectsForLevel();
    if (counts.get(LAIN.nama)) list.push(LAIN);

    const box = $('subjects');
    box.innerHTML = '';
    list.forEach(s => {
      const n = counts.get(s.nama) || 0;
      const b = el('button', 'subject' + (n ? '' : ' empty-subject') + (subject === s.nama ? ' active' : ''));
      b.type = 'button';
      b.style.setProperty('--c', s.warna);
      b.append(el('span', 'e', s.emoji), el('b', null, s.nama), el('small', null, n ? n + ' kuiz' : 'Akan datang'));
      b.addEventListener('click', () => {
        subject = subject === s.nama ? null : s.nama;
        renderSubjects();
        renderList();
        $('listTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      box.append(b);
    });
  }

  /* ---------- Senarai kuiz ---------- */
  function renderList() {
    const me = currentKid();
    const answered = q => !q.url && history.has(q.id);
    const shown = quizzes.filter(q => inLevel(q) && (!subject || itemSubject(q).nama === subject) &&
      (status === 'all' || (status === 'done' ? answered(q) : !q.url && !answered(q))));
    document.querySelectorAll('#statusFilter button').forEach(b => b.classList.toggle('active', b.dataset.f === status));
    const s = subject && ((SITE.SUBJEK || []).find(x => x.nama === subject) || LAIN);
    const head = status === 'done' ? '✅ Sudah dijawab' : status === 'todo' ? '⏳ Belum dijawab' : 'Semua kuiz';
    $('listTitle').textContent = (s ? s.emoji + ' ' + s.nama : head) + (level ? ' · ' + level : '');
    $('showAll').classList.toggle('hidden', !subject);

    const box = $('list');
    box.innerHTML = '';
    if (!shown.length) {
      box.append(el('div', 'empty', status === 'done' ? 'Belum ada kuiz yang dijawab di sini. Jom cuba satu! 🚀'
        : status === 'todo' ? 'Semua kuiz di sini sudah dijawab. Hebat! 🎉'
        : subject ? 'Belum ada kuiz untuk subjek ini. Nantikan! 🌱' : 'Belum ada kuiz untuk tahap ini. Nantikan! 🌱'));
      return;
    }
    shown.forEach((q, i) => {
      const sub = itemSubject(q);
      const a = el('a', 'qcard');
      a.href = q.url || 'quiz.html?id=' + encodeURIComponent(q.id);
      a.style.setProperty('--c', sub.warna);
      a.style.animationDelay = (i * 40) + 'ms';
      const body = el('div');
      const tries = me && !q.url ? history.get(q.id) : null;
      body.append(el('h3', null, q.title),
        el('div', 'meta', q.ket || q.questionCount + ' soalan' + (tries ? ' · ✅ dijawab ' + tries.length + '×' : '')));
      if (tries) {
        // Markah setiap cubaan; yang terakhir ditonjolkan.
        const row = el('div', 'tries');
        tries.forEach((r, k) => row.append(el('span', 'try' + (k === tries.length - 1 ? ' latest' : ''),
          'Cubaan ' + r.attempt + ': ' + r.score + '/' + r.total)));
        body.append(row);
      }
      a.append(el('span', 'e', sub.emoji), body, el('span', 'go', '➜'));
      box.append(a);
    });
  }

  function links() {
    return (SITE.PAUTAN || []).map((p, i) => ({ id: 'pautan-' + i, title: p.tajuk, url: p.url, subjek: p.subjek, tahap: p.tahap, ket: p.ket }));
  }

  $('showAll').addEventListener('click', () => { subject = null; renderSubjects(); renderList(); });
  document.querySelectorAll('#statusFilter button').forEach(b => b.addEventListener('click', () => {
    status = b.dataset.f;
    renderList();
  }));

  renderKids();
  renderLevels();
  fetch('quizzes/index.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(items => {
      quizzes = links().concat(items.filter(q => q.id !== 'contoh')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      renderSubjects();
      renderList();
      loadHistory();
    })
    .catch(() => {
      quizzes = links();
      renderSubjects();
      if (quizzes.length) { renderList(); return; }
      $('list').innerHTML = '';
      $('list').append(el('div', 'empty', 'Senarai kuiz tidak dapat dimuatkan. Cuba muat semula.'));
      renderSubjects();
    });
})();
