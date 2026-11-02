// Pelayan ujian: laman statik (seperti GitHub Pages) + Apps Script palsu (Code.gs sebenar).
//   node t4/ujian/server.js         → http://localhost:8080/t4/  (guru: kata laluan "guru123")
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGas } = require('./gas-mock');

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp' };

function listen(server, port) {
  return new Promise(res => server.listen(port, '127.0.0.1', () => res(server.address().port)));
}

function readBody(req) {
  return new Promise(res => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => res(b)); });
}

async function startServer(opts = {}) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 't4-gh-'));
  const gas = createGas({ outDir });
  const state = { delayMs: opts.delayMs || 0, requests: [], fail: 0 };

  const web = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const rel = path.normalize(p).replace(/^([/\\])+/, '');
    if (rel.startsWith('..')) { res.writeHead(403); return res.end(); }
    // Fail yang "diterbitkan" oleh Sheet (outDir) didahulukan, kemudian fail repo.
    const file = [path.join(outDir, rel), path.join(ROOT, rel)].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });

  const api = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(obj));
    };
    const body = req.method === 'POST' ? await readBody(req) : '';
    try {
      if (url.pathname === '/exec') {
        if (req.method !== 'POST') return send(200, JSON.parse(gas.call('doGet').getContent()));
        if (state.fail > 0) { state.fail--; res.destroy(); return; } // rangkaian terputus
        if (state.delayMs) await new Promise(r => setTimeout(r, state.delayMs));
        let action = '';
        try { action = JSON.parse(body).action; } catch (e) { /* abaikan */ }
        state.requests.push({ action, at: Date.now(), body });
        return send(200, gas.post(body));
      }
      // Kawalan ujian
      if (url.pathname === '/__clock') { gas.advance(Number(JSON.parse(body).advanceMs) || 0); return send(200, { ok: true, now: gas.now() }); }
      if (url.pathname === '/__sheet') return send(200, gas.rows(url.searchParams.get('name')));
      if (url.pathname === '/__menu') { const b = JSON.parse(body); return send(200, { log: gas.runMenu(b.fn, b.answers) }); }
      if (url.pathname === '/__delay') { state.delayMs = Number(JSON.parse(body).ms) || 0; return send(200, { ok: true }); }
      if (url.pathname === '/__fail') { state.fail = Number(JSON.parse(body).n) || 0; return send(200, { ok: true }); }
      send(404, { error: 'tiada' });
    } catch (e) {
      send(500, { error: String(e && e.stack || e) });
    }
  });

  const webPort = await listen(web, opts.port || 0);
  const apiPort = await listen(api, opts.apiPort || 0);
  const base = 'http://127.0.0.1:' + webPort + '/';
  const apiUrl = 'http://127.0.0.1:' + apiPort + '/exec';
  Object.assign(gas.props, {
    GURU_PASSWORD: 'guru123', GITHUB_TOKEN: 'token-palsu', GITHUB_REPO: 'marilyngakim-blip/quiz-generator',
    WEBAPP_URL: apiUrl, PAGES_URL: base
  });
  return {
    base, apiUrl, apiBase: 'http://127.0.0.1:' + apiPort, gas, outDir, state,
    close: () => new Promise(r => { web.close(); api.close(r); })
  };
}

// Sediakan Sheet + data contoh + terbitkan kuiz contoh (melalui menu sebenar).
function seed(gas) {
  gas.runMenu('sediakanSheet');
  gas.runMenu('masukkanDataContoh', ['YES']);
  gas.runMenu('terbitkanKuiz', ['YES', 'YES']);
  const murid = gas.rows('Murid').slice(1).map(r => ({ id: r[0], nama: r[1], kelas: r[2], pin: r[3] }));
  return { murid, quizId: 'matematik-tingkatan-4-kuiz-contoh', key: 'ACBDCABDAD'.split('') };
}

module.exports = { startServer, seed };

if (require.main === module) {
  startServer({ port: Number(process.env.PORT) || 8080 }).then(s => {
    const d = seed(s.gas);
    console.log('Laman murid : ' + s.base + 't4/');
    console.log('Laman guru  : ' + s.base + 't4/guru.html  (kata laluan: guru123)');
    console.log('Web App     : ' + s.apiUrl);
    console.log('Murid contoh:');
    d.murid.forEach(m => console.log('  ' + m.kelas.padEnd(12) + m.nama.padEnd(28) + 'PIN ' + m.pin));
  });
}
