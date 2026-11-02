// Fungsi dikongsi oleh semua laman T4.
(function () {
  const CFG = window.T4_CONFIG || {};

  const store = {
    get(k) { try { return localStorage.getItem('t4.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('t4.' + k, v); } catch (e) { /* abaikan */ } },
    del(k) { try { localStorage.removeItem('t4.' + k); } catch (e) { /* abaikan */ } },
    json(k) { try { return JSON.parse(this.get(k) || 'null'); } catch (e) { return null; } }
  };

  // Sesi murid: token ringkas dari Apps Script (PIN tidak disimpan).
  const sesi = {
    get() { const s = store.json('sesi'); return s && s.token ? s : null; },
    set(s) { store.set('sesi', JSON.stringify(s)); },
    clear() { store.del('sesi'); }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Panggil Web App. text/plain mengelakkan semakan CORS tambahan oleh Apps Script.
  // Cuba semula jika rangkaian gagal atau pelayan sibuk.
  async function api(action, data, opts) {
    opts = opts || {};
    if (!CFG.APPS_SCRIPT_URL) throw new Error('Laman ini belum disambungkan ke Google Sheet (config.js).');
    const tries = opts.tries || 3;
    let last;
    for (let i = 0; i < tries; i++) {
      if (i) await sleep(Math.min(8000, 800 * Math.pow(2, i - 1)) + Math.random() * 500);
      try {
        const res = await fetch(CFG.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action: action }, data || {}))
        });
        const json = await res.json();
        if (json && json.retry && i < tries - 1) { last = json; continue; }
        if (json && json.auth && !opts.keepAuth) {
          if (opts.guru) { try { sessionStorage.removeItem('t4.guru'); } catch (e) { /* abaikan */ } }
          else sesi.clear();
        }
        return json;
      } catch (e) {
        last = { ok: false, error: 'Tidak dapat menghubungi pelayan. Semak sambungan internet.', network: true };
      }
    }
    return last;
  }

  function beacon(action, data) {
    if (!CFG.APPS_SCRIPT_URL || !navigator.sendBeacon) return false;
    try {
      return navigator.sendBeacon(CFG.APPS_SCRIPT_URL, new Blob([JSON.stringify(Object.assign({ action: action }, data))], { type: 'text/plain;charset=utf-8' }));
    } catch (e) { return false; }
  }

  function el(tag, attrs) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x != null && node.append(x));
      else node.append(c);
    }
    return node;
  }

  const HARI = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
  const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  function tarikh(ms) {
    if (!ms) return '–';
    const d = new Date(ms);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h < 12 ? 'pg' : 'ptg';
    h = h % 12 || 12;
    return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + ', ' + h + ':' + m + ' ' + ap;
  }

  function masa(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h) return h + ' j ' + m + ' min';
    if (m) return m + ' min ' + String(s).padStart(2, '0') + ' s';
    return s + ' s';
  }

  function baki(ms) {
    if (ms <= 0) return 'sekarang';
    const min = Math.ceil(ms / 60000);
    if (min < 60) return min + ' minit';
    const j = Math.round(min / 60);
    if (j < 48) return j + ' jam';
    return Math.round(j / 24) + ' hari';
  }

  function gred(p) {
    return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'A-' : p >= 65 ? 'B+' : p >= 60 ? 'B' :
      p >= 55 ? 'C+' : p >= 50 ? 'C' : p >= 45 ? 'D' : p >= 40 ? 'E' : 'G';
  }

  // Rawak berbiji (sama setiap kali bagi murid + kuiz + cubaan yang sama).
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    return h1 >>> 0;
  }
  function shuffle(n, seedStr) {
    let a = hash(seedStr);
    const rnd = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function param(k) { return new URLSearchParams(location.search).get(k); }

  function perluLogin() {
    const s = sesi.get();
    if (!s) { location.replace('index.html'); return null; }
    return s;
  }

  function topbar(title, sub, right) {
    return el('header', { class: 'topbar' },
      el('div', { class: 'brand' }, title, sub ? el('small', { text: sub }) : null), right || null);
  }

  window.T4 = { CFG, store, sesi, api, beacon, el, tarikh, masa, baki, gred, shuffle, param, perluLogin, topbar, sleep };
})();
