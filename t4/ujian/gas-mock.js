// Google Apps Script palsu (dalam memori) untuk menguji Code.gs sebenar dalam Node.
// Hanya fungsi yang digunakan oleh Code.gs disediakan.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const TZ_OFFSET_MS = 8 * 3600e3; // Asia/Kuala_Lumpur

const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const toBuf = data => Array.isArray(data) ? Buffer.from(data.map(b => b & 255)) : Buffer.from(String(data), 'utf8');

function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }

function createGas(opts = {}) {
  const outDir = opts.outDir; // fail yang "diterbitkan" ke GitHub ditulis di sini
  const ctx = vm.createContext({ console, __clock: { offset: 0 } });
  vm.runInContext(`
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(RealDate.now() + __clock.offset); else super(...a); }
      static now() { return RealDate.now() + __clock.offset; }
    }
    Date = FakeDate;
  `, ctx);
  const CDate = vm.runInContext('Date', ctx);
  const now = () => CDate.now();

  /* ---------------- Spreadsheet ---------------- */
  class Sheet {
    constructor(ss, name) { this.ss = ss; this.name = name; this.data = []; this.colFmt = {}; this.cellFmt = {}; this.active = null; this.frozen = 0; }
    getName() { return this.name; }
    getLastRow() { for (let r = this.data.length; r > 0; r--) if ((this.data[r - 1] || []).some(v => v !== '' && v != null)) return r; return 0; }
    getLastColumn() { let m = 0; this.data.forEach(row => { for (let c = row.length; c > m; c--) if (row[c - 1] !== '' && row[c - 1] != null) { m = c; break; } }); return m; }
    getMaxRows() { return Math.max(1000, this.data.length); }
    getRange(a, b, c, d) {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/);
        if (!m) throw new Error('A1 tidak disokong: ' + a);
        const c1 = m[1] ? colToNum(m[1]) : 1, r1 = m[2] ? +m[2] : 1;
        const c2 = m[3] !== undefined ? (m[3] ? colToNum(m[3]) : 26) : c1;
        const r2 = m[3] !== undefined ? (m[4] ? +m[4] : (m[2] ? r1 : this.getMaxRows())) : r1;
        const whole = m[2] === '' ;
        return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1, whole);
      }
      return new Range(this, a, b, c || 1, d || 1);
    }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(arr) { const r = this.getLastRow() + 1; new Range(this, r, 1, 1, arr.length).setValues([arr]); return this; }
    deleteRow(r) { this.data.splice(r - 1, 1); return this; }
    clear() { this.data = []; return this; }
    clearContents() { return this.clear(); }
    setFrozenRows(n) { this.frozen = n; return this; }
    getActiveRange() { return this.active ? new Range(this, this.active, 1, 1, 1) : null; }
    activate() { this.ss.active = this; return this; }
    fmt(r, c) { return this.cellFmt[r + ',' + c] || this.colFmt[c] || ''; }
    get(r, c) { const row = this.data[r - 1]; const v = row ? row[c - 1] : undefined; return v == null ? '' : v; }
    set(r, c, v) {
      while (this.data.length < r) this.data.push([]);
      const row = this.data[r - 1];
      while (row.length < c) row.push('');
      // Tingkah laku Sheets: teks nombor menjadi nombor kecuali format teks (@); "'" di depan = teks.
      if (typeof v === 'string') {
        if (v.charAt(0) === "'") v = v.slice(1);
        else if (this.fmt(r, c) !== '@' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') v = Number(v);
      }
      row[c - 1] = v;
    }
  }

  function display(v) {
    if (v instanceof CDate) {
      const d = new Date(v.getTime() + TZ_OFFSET_MS);
      const p = n => String(n).padStart(2, '0');
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    }
    return String(v);
  }

  class Range {
    constructor(sh, r, c, nr, nc, whole) { Object.assign(this, { sh, r, c, nr, nc, whole }); }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    getSheet() { return this.sh; }
    getNumRows() { return this.nr; }
    rowsUsed() { return this.whole ? Math.max(0, Math.min(this.nr, this.sh.getLastRow() - this.r + 1)) : this.nr; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.rowsUsed(); i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) {
          const v = this.sh.get(this.r + i, this.c + j);
          row.push(v instanceof CDate ? new CDate(v.getTime()) : v);
        }
        out.push(row);
      }
      return out;
    }
    getDisplayValues() { return this.getValues().map(r => r.map(display)); }
    getValue() { return this.sh.get(this.r, this.c); }
    getDisplayValue() { return display(this.getValue()); }
    setValue(v) { this.sh.set(this.r, this.c, v); return this; }
    setValues(vals) {
      if (vals.length !== this.nr || vals.some(r => r.length !== this.nc)) {
        throw new Error('Saiz data (' + vals.length + 'x' + (vals[0] || []).length + ') tidak sepadan dengan julat (' + this.nr + 'x' + this.nc + ')');
      }
      vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v)));
      return this;
    }
    clearContent() {
      for (let i = 0; i < this.rowsUsed(); i++) for (let j = 0; j < this.nc; j++) {
        const row = this.sh.data[this.r + i - 1]; if (row && row.length >= this.c + j) row[this.c + j - 1] = '';
      }
      return this;
    }
    setNumberFormat(f) {
      if (this.whole) { for (let j = 0; j < this.nc; j++) this.sh.colFmt[this.c + j] = f; }
      else for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.cellFmt[(this.r + i) + ',' + (this.c + j)] = f;
      return this;
    }
    setFontWeight() { return this; }
    setNote() { return this; }
    setBackground() { return this; }
  }

  class Spreadsheet {
    constructor() { this.sheets = []; this.active = null; this.toasts = []; this.tz = 'Asia/Kuala_Lumpur'; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets.slice(); }
    getActiveSheet() { return this.active || this.sheets[0] || null; }
    setActiveSheet(s) { this.active = s; return s; }
    toast(msg) { this.toasts.push(msg); }
    setSpreadsheetTimeZone(tz) { this.tz = tz; }
  }
  const ss = new Spreadsheet();

  /* ---------------- UI (jawapan dirancang oleh ujian) ---------------- */
  const Button = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO', CLOSE: 'CLOSE' };
  const ButtonSet = { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO', YES_NO_CANCEL: 'YES_NO_CANCEL' };
  const ui = {
    queue: [], log: [], menus: [],
    alert(a, b, c) {
      const title = b === undefined || ButtonSet[b] ? '' : a;
      const msg = b === undefined || ButtonSet[b] ? a : b;
      const set = ButtonSet[b] ? b : (c || 'OK');
      this.log.push({ type: 'alert', title, msg: String(msg) });
      if (set === 'OK') return Button.OK;
      const next = this.queue.shift();
      if (!next) throw new Error('Ujian tidak menyediakan jawapan untuk dialog: ' + (title || msg).slice(0, 80));
      return Button[next];
    },
    prompt(title, msg) {
      this.log.push({ type: 'prompt', title, msg });
      const next = this.queue.shift();
      if (!next || typeof next !== 'object') throw new Error('Ujian tidak menyediakan jawapan untuk prompt: ' + title);
      return { getSelectedButton: () => Button[next.button || 'OK'], getResponseText: () => next.text || '' };
    },
    createMenu(name) { const m = { name, items: [] }; this.menus.push(m); const api = { addItem: (l, f) => { m.items.push([l, f]); return api; }, addSeparator: () => api, addToUi: () => api }; return api; },
    Button, ButtonSet
  };

  /* ---------------- Perkhidmatan lain ---------------- */
  const cacheStore = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get(k) { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= now()) { cacheStore.delete(k); return null; } return e.v; },
      put(k, v, ttl) { if (String(v).length > 100000) throw new Error('Nilai cache terlalu besar'); cacheStore.set(k, { v: String(v), exp: now() + (ttl || 600) * 1000 }); },
      remove(k) { cacheStore.delete(k); }
    })
  };
  const props = Object.assign({}, opts.props || {});
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty(k, v) { props[k] = String(v); return this; },
      deleteProperty(k) { delete props[k]; return this; },
      getProperties: () => Object.assign({}, props)
    })
  };
  const lock = { held: 0, calls: 0 };
  const LockService = {
    getScriptLock: () => ({
      tryLock() { lock.held++; lock.calls++; return true; },
      waitLock() { lock.held++; lock.calls++; },
      releaseLock() { if (lock.held > 0) lock.held--; },
      hasLock: () => lock.held > 0
    })
  };

  class Blob {
    constructor(bytes, type, name) { this.bytes = bytes; this.type = type || ''; this.name = name || ''; }
    getBytes() { return this.bytes.slice(); }
    getDataAsString() { return toBuf(this.bytes).toString('utf8'); }
    getContentType() { return this.type; }
    setName(n) { this.name = n; return this; }
    getName() { return this.name; }
  }
  const b64pad = s => s + '='.repeat((4 - s.length % 4) % 4);
  const Utilities = {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_1: 'sha1', SHA_256: 'sha256', MD5: 'md5' },
    base64Encode: d => toBuf(d).toString('base64'),
    base64EncodeWebSafe: d => b64pad(toBuf(d).toString('base64url')),
    base64Decode: s => signed(Buffer.from(String(s), 'base64')),
    base64DecodeWebSafe: s => signed(Buffer.from(String(s), 'base64url')),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
    computeDigest: (alg, v) => signed(crypto.createHash(alg).update(toBuf(v)).digest()),
    newBlob: (d, type, name) => new Blob(Array.isArray(d) ? d.slice() : signed(Buffer.from(String(d), 'utf8')), type, name),
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    formatDate(d, tz, fmt) {
      const x = new Date(d.getTime() + TZ_OFFSET_MS); const p = n => String(n).padStart(2, '0');
      return fmt.replace('yyyy', x.getUTCFullYear()).replace('HH', p(x.getUTCHours())).replace('mm', p(x.getUTCMinutes()))
        .replace(/\bM\b/, x.getUTCMonth() + 1).replace(/\bd\b/, x.getUTCDate());
    }
  };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
  };

  // GitHub palsu: fail disimpan dalam memori dan ditulis ke outDir.
  const gh = new Map(); // path -> { buf, sha }
  const gitSha = buf => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');
  const drive = new Map(); // id -> Blob
  const urls = new Map();  // url -> Blob
  const forms = {};        // formId -> { api: json, app: object }
  const fetchLog = [];
  function response(code, body, blob) {
    return { getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getBlob: () => blob || new Blob([], '') };
  }
  const UrlFetchApp = {
    fetch(url, o = {}) {
      fetchLog.push({ url, method: o.method || 'get' });
      let m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/contents\/([^?]*)/);
      if (m) {
        if (!/^Bearer \S+/.test((o.headers || {}).Authorization || '')) return response(401, { message: 'Bad credentials' });
        const p = m[2].split('/').map(decodeURIComponent).join('/');
        if (!o.method) {
          const f = gh.get(p);
          if (f) return response(200, { sha: f.sha, content: f.buf.toString('base64').replace(/(.{60})/g, '$1\n') });
          const kids = [...gh.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
          if (kids.length) return response(200, kids.map(k => ({ name: k.slice(p.length + 1), sha: gh.get(k).sha })));
          return response(404, { message: 'Not Found' });
        }
        const body = JSON.parse(o.payload);
        const f = gh.get(p);
        if (f && body.sha !== f.sha) return response(409, { message: 'sha does not match' });
        if (!f && body.sha) return response(422, { message: 'sha given for new file' });
        const buf = Buffer.from(body.content, 'base64');
        gh.set(p, { buf, sha: gitSha(buf), message: body.message });
        if (outDir) { const fp = path.join(outDir, p); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, buf); }
        return response(f ? 200 : 201, { content: { sha: gitSha(buf) } });
      }
      m = url.match(/^https:\/\/forms\.googleapis\.com\/v1\/forms\/([^?]+)/);
      if (m) {
        const f = forms[decodeURIComponent(m[1])];
        return f && f.api ? response(200, f.api) : response(403, { error: 'forbidden' });
      }
      if (urls.has(url)) return response(200, '', urls.get(url));
      if (o.muteHttpExceptions) return response(404, 'not found');
      throw new Error('Alamat tidak dapat dicapai: ' + url);
    }
  };
  let fileSeq = 0;
  const DriveApp = {
    getFileById(id) { const b = drive.get(id); if (!b) throw new Error('Fail tidak dijumpai: ' + id); return { getBlob: () => b }; },
    getFoldersByName() { let done = false; return { hasNext: () => !done && false, next() { done = true; } }; },
    createFolder(name) {
      return {
        name,
        createFile(blob) {
          const id = 'drv' + String(++fileSeq).padStart(25, '0');
          drive.set(id, blob);
          return { getUrl: () => 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk', getId: () => id };
        }
      };
    }
  };
  const FormApp = {
    ItemType: { IMAGE: 'IMAGE', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', LIST: 'LIST', TEXT: 'TEXT' },
    openById(id) { const f = forms[id]; if (!f) throw new Error('Form tidak dijumpai'); return f.app; }
  };

  Object.assign(ctx, {
    SpreadsheetApp: { getActive: () => ss, getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {} },
    CacheService, PropertiesService, LockService, Utilities, ContentService, UrlFetchApp, DriveApp, FormApp,
    ScriptApp: { getOAuthToken: () => 'oauth-palsu' },
    Session: { getScriptTimeZone: () => 'Asia/Kuala_Lumpur' }
  });
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });

  function call(fn, ...args) {
    const f = vm.runInContext(fn, ctx);
    const r = f(...args);
    if (lock.held) { const h = lock.held; lock.held = 0; throw new Error('Lock tidak dilepaskan selepas ' + fn + ' (' + h + ')'); }
    return r;
  }
  function post(body) {
    const out = call('doPost', { postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
    return JSON.parse(out.getContent());
  }
  function runMenu(fn, answers) {
    ui.queue = (answers || []).slice();
    const before = ui.log.length;
    call(fn);
    const left = ui.queue.length;
    ui.queue = [];
    if (left) throw new Error(fn + ': ' + left + ' jawapan dialog tidak digunakan');
    return ui.log.slice(before);
  }
  function rows(name) { const s = ss.getSheetByName(name); return s ? s.getDataRange().getValues() : null; }

  return {
    ctx, ss, ui, props, gh, drive, urls, forms, fetchLog, cacheStore, lock, Date: CDate, Blob,
    call, post, runMenu, rows,
    setClock(ms) { ctx.__clock.offset = ms; },
    advance(ms) { ctx.__clock.offset += ms; },
    now
  };
}

module.exports = { createGas };
