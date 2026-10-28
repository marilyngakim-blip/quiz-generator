(function () {
  const { SITE, LAIN, decorateHero, subjectOf, levelOf, store, currentKid, bestKey } = window.KUIZ;
  const $ = id => document.getElementById(id);
  let quizzes = [];
  let subject = null;                       // nama subjek yang dipilih
  let level = (currentKid() || {}).tahap || null; // tahap yang dipaparkan (null = semua)

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
  const inLevel = q => !level || !levelOf(q.title) || levelOf(q.title) === level;
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
        renderAll();
      });
      box.append(b);
    });
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
    quizzes.filter(inLevel).forEach(q => { const s = subjectOf(q.title); counts.set(s.nama, (counts.get(s.nama) || 0) + 1); });
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
    const shown = quizzes.filter(q => inLevel(q) && (!subject || subjectOf(q.title).nama === subject));
    const s = subject && ((SITE.SUBJEK || []).find(x => x.nama === subject) || LAIN);
    $('listTitle').textContent = (s ? s.emoji + ' ' + s.nama : 'Semua kuiz') + (level ? ' · ' + level : '');
    $('showAll').classList.toggle('hidden', !subject);

    const box = $('list');
    box.innerHTML = '';
    if (!shown.length) {
      box.append(el('div', 'empty', subject ? 'Belum ada kuiz untuk subjek ini. Nantikan! 🌱' : 'Belum ada kuiz untuk tahap ini. Nantikan! 🌱'));
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

  $('showAll').addEventListener('click', () => { subject = null; renderSubjects(); renderList(); });

  renderKids();
  renderLevels();
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
