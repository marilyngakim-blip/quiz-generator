// Ranking kelas murid: 10 teratas + kedudukan sendiri.
(function () {
  const { api, el, masa, param, perluLogin, topbar } = window.T4;
  const s = perluLogin();
  if (!s) return;
  const app = document.getElementById('app');
  document.getElementById('top').append(topbar('🏆 Ranking ' + s.kelas, s.nama, el('a', { href: 'index.html', text: 'Muka depan' })));
  const pingat = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '');

  async function lukis(id) {
    app.innerHTML = '';
    const pilih = el('select', { class: 'input', id: 'pilih-kuiz', 'aria-label': 'Pilih kuiz' },
      el('option', { value: 'semua', text: 'Keseluruhan (semua kuiz)' }));
    const box = el('div', {}, el('div', { class: 'loading', text: 'Memuatkan ranking…' }));
    app.append(el('div', { class: 'toolbar' }, el('label', { class: 'field' }, el('span', { text: 'Ranking bagi' }), pilih)), box);
    pilih.addEventListener('change', () => {
      history.replaceState(null, '', 'ranking.html?id=' + encodeURIComponent(pilih.value));
      lukis(pilih.value);
    });

    const [home, r] = await Promise.all([api('home', { token: s.token }), api('ranking', { token: s.token, quizId: id })]);
    if ((r && r.auth) || (home && home.auth)) return location.replace('index.html');
    if (home && home.ok) home.buka.concat(home.tutup).forEach(q => pilih.append(el('option', { value: q.id, text: q.tajuk })));
    pilih.value = id;
    box.innerHTML = '';
    if (!r || !r.ok) { box.append(el('div', { class: 'card' }, el('p', { class: 'error', text: (r && r.error) || 'Ralat.' }))); return; }

    const semua = id === 'semua';
    const baris = x => el('tr', { class: x.saya ? 'me' : '' },
      el('td', { class: 'rank' }, el('span', { class: 'medal', text: pingat(x.rank) }), ' ' + x.rank),
      el('td', { text: x.nama + (x.saya ? ' (anda)' : '') }),
      el('td', { class: 'num', text: semua ? x.pct + '%' : x.score + '/' + x.total }),
      el('td', { class: 'num', text: semua ? x.dijawab + '/' + x.kuiz : masa(x.time) }));
    const body = el('tbody', {}, r.top.map(baris));
    if (r.saya && !r.top.some(x => x.saya)) {
      body.append(el('tr', { class: 'gap' }, el('td', { colspan: '4', text: '⋯' })));
      body.append(baris(Object.assign({ saya: true }, r.saya)));
    }
    box.append(el('div', { class: 'card' },
      el('h1', { text: r.tajuk }),
      el('p', { class: 'muted small', text: r.kelas + ' · ' + r.bil + ' murid sudah menjawab' +
        (r.ranking ? ' · dikira guna markah cubaan ' + (r.ranking === 'Terbaik' ? 'terbaik' : 'pertama') : '') }),
      r.saya ? el('p', { class: 'gred', style: 'display:inline-block', id: 'kedudukan-saya', text: 'Kedudukan anda: ' + r.saya.rank + ' daripada ' + r.bil }) : el('p', { class: 'notice', text: 'Anda belum menjawab' + (semua ? ' mana-mana kuiz.' : ' kuiz ini.') }),
      r.top.length ? el('div', { class: 'tbl-wrap' }, el('table', { id: 'ranking' },
        el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Nama' }),
          el('th', { class: 'num', text: semua ? 'Purata' : 'Markah' }), el('th', { class: 'num', text: semua ? 'Kuiz dijawab' : 'Masa' }))),
        body)) : el('p', { class: 'empty', text: 'Belum ada markah.' }),
      el('p', { class: 'muted small', text: semua
        ? 'Purata peratus semua kuiz kelas anda yang sudah dibuka (kuiz tidak dijawab dikira 0). Seri: jumlah masa lebih singkat di atas.'
        : 'Hanya 10 teratas dipaparkan. Seri: markah sama → masa diambil lebih singkat di atas.' }),
      el('p', { class: 'muted small', text: 'Ranking dikemas kini setiap minit.' })));
  }

  lukis(param('id') || 'semua');
})();
