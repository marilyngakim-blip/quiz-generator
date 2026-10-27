(function () {
  const { SITE, LAIN, decorateHero, subjectOf, store, currentKid, bestKey } = window.KUIZ;
  const $ = id => document.getElementById(id);
  let quizzes = [];
  let filter = null; // nama subjek yang dipilih

  $('title').textContent = SITE.TAJUK || 'Jom Kuiz!';
  $('subtitle').textContent = SITE.SUBTAJUK || '';
  decorateHero();

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

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
      b.append(el('span', 'e', k.emoji || '🙂'), el('b', null, k.nama), el('small', null, k.kelas || ''));
      b.addEventListener('click', () => { store.set('anak', k.nama); renderKids(); renderList(); });
      box.append(b);
    });
  }

  /* ---------- Petak subjek ---------- */
  function renderSubjects() {
    const counts = new Map();
    quizzes.forEach(q => { const s = subjectOf(q.title); counts.set(s.nama, (counts.get(s.nama) || 0) + 1); });
    const list = (SITE.SUBJEK || []).slice();
    if (counts.get(LAIN.nama)) list.push(LAIN);

    const box = $('subjects');
    box.innerHTML = '';
    list.forEach(s => {
      const n = counts.get(s.nama) || 0;
      const b = el('button', 'subject' + (n ? '' : ' empty-subject') + (filter === s.nama ? ' active' : ''));
      b.type = 'button';
      b.style.setProperty('--c', s.warna);
      b.append(el('span', 'e', s.emoji), el('b', null, s.nama), el('small', null, n ? n + ' kuiz' : 'Akan datang'));
      b.addEventListener('click', () => {
        filter = filter === s.nama ? null : s.nama;
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
    const shown = quizzes.filter(q => !filter || subjectOf(q.title).nama === filter);
    const s = filter && ((SITE.SUBJEK || []).find(x => x.nama === filter) || LAIN);
    $('listTitle').textContent = s ? s.emoji + ' ' + s.nama : 'Semua kuiz';
    $('showAll').classList.toggle('hidden', !filter);

    const box = $('list');
    box.innerHTML = '';
    if (!shown.length) {
      box.append(el('div', 'empty', filter ? 'Belum ada kuiz untuk subjek ini. Nantikan! 🌱' : 'Belum ada kuiz.'));
      return;
    }
    shown.forEach((q, i) => {
      const sub = subjectOf(q.title);
      const a = el('a', 'qcard');
      a.href = 'quiz.html?id=' + encodeURIComponent(q.id);
      a.style.setProperty('--c', sub.warna);
      a.style.animationDelay = (i * 40) + 'ms';
      const body = el('div');
      body.append(el('h3', null, q.title), el('div', 'meta', q.questionCount + ' soalan'));
      const best = me && store.get(bestKey(q.id, me.nama));
      if (best) body.append(el('span', 'best', '⭐ Terbaik ' + me.nama + ': ' + best));
      a.append(el('span', 'e', sub.emoji), body, el('span', 'go', '➜'));
      box.append(a);
    });
  }

  $('showAll').addEventListener('click', () => { filter = null; renderSubjects(); renderList(); });

  renderKids();
  fetch('quizzes/index.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(items => {
      quizzes = items.filter(q => q.id !== 'contoh')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      renderSubjects();
      renderList();
    })
    .catch(() => {
      $('list').innerHTML = '';
      $('list').append(el('div', 'empty', 'Senarai kuiz tidak dapat dimuatkan. Cuba muat semula.'));
      renderSubjects();
    });
})();
