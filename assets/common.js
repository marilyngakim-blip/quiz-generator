// Fungsi dikongsi oleh muka depan dan laman kuiz.
(function () {
  const SITE = window.SITE || {};
  const LAIN = { nama: 'Lain-lain', emoji: '📝', warna: '#a0826d' };

  // Matahari berputar + ikon terapung di bahagian .hero
  const SUN = `<svg class="sun" viewBox="-100 -100 200 200" aria-hidden="true">
    <g fill="#ffd166">${Array.from({ length: 12 }, (_, i) =>
      `<rect x="-7" y="-96" width="14" height="30" rx="7" transform="rotate(${i * 30})"/>`).join('')}</g>
    <circle r="56" fill="#ffc145"/><circle r="56" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
  </svg>`;
  const FLOATS = [['⭐', 8, 16], ['✏️', 90, 72], ['📚', 5, 74], ['💡', 80, 10], ['🎈', 93, 42], ['✨', 3, 42]];

  function decorateHero() {
    document.querySelectorAll('.hero').forEach(hero => {
      const small = hero.classList.contains('small');
      hero.insertAdjacentHTML('afterbegin', SUN);
      FLOATS.slice(0, small ? 3 : FLOATS.length).forEach(([e, x, y], i) => {
        const s = document.createElement('span');
        s.className = 'float';
        s.textContent = e;
        s.style.left = x + '%';
        s.style.top = y + '%';
        s.style.animationDelay = (-i * 0.7) + 's';
        hero.prepend(s);
      });
    });
  }

  function subjectOf(title) {
    const t = String(title || '').toLowerCase();
    return (SITE.SUBJEK || []).find(s => t.startsWith(s.nama.toLowerCase())) || LAIN;
  }

  // Simpanan pelayar: hanya untuk kemudahan (anak dipilih, markah terbaik).
  const store = {
    get(k) { try { return localStorage.getItem('kuiz.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('kuiz.' + k, v); } catch (e) { /* abaikan */ } }
  };

  function currentKid() {
    const name = store.get('anak');
    return (SITE.ANAK || []).find(k => k.nama === name) || null;
  }

  function bestKey(quizId, nama) {
    return 'best.' + quizId + '.' + String(nama || '').trim().toLowerCase();
  }

  window.KUIZ = { SITE, LAIN, decorateHero, subjectOf, store, currentKid, bestKey };
})();
