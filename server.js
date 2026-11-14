'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.KALAOK_DATA_DIR || '/data';
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const USERS_JSON = process.env.KALAOK_DEMO_USERS_B64;
const KEY_HEX = process.env.KALAOK_SESSION_SECRET || '';
if (!USERS_JSON || !/^[0-9a-f]{64,}$/i.test(KEY_HEX)) {
  console.error('Missing server-side demo users or session key');
  process.exit(1);
}
const users = JSON.parse(Buffer.from(USERS_JSON, 'base64').toString('utf8'));
const userByName = new Map(users.map(u => [u.username, u]));
const signingKey = Buffer.from(KEY_HEX, 'hex');
const songs = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', 'songs.json'), 'utf8'));
const songById = new Map(songs.map(s => [s.id, s]));
const trials = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
let state;
if (fs.existsSync(STATE_PATH)) {
  state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
} else {
  state = {};
  users.forEach((u, i) => {
    state[u.username] = {
      queue: i === 0 ? ['s01', 's06'] : i === 1 ? ['s04'] : ['s11'],
      favorites: i === 0 ? ['s01', 's08'] : i === 1 ? ['s04', 's09'] : ['s07', 's11', 's13']
    };
  });
  saveState();
}
function saveState() {
  const temp = STATE_PATH + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATE_PATH);
}
function userState(username) {
  if (!state[username]) state[username] = { queue: [], favorites: [] };
  return state[username];
}
const commonHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; img-src 'self' https://i.ytimg.com; connect-src 'self' https://www.youtube.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"
};
function send(res, status, data, extra = {}) {
  res.writeHead(status, {
    ...commonHeaders, 'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8', ...extra
  });
  res.end(JSON.stringify(data));
}
function cookieValue(header) {
  const hit = (header || '').split(';').map(v => v.trim()).find(v => v.startsWith('kalaok_demo='));
  return hit ? hit.substring('kalaok_demo='.length) : null;
}
function b64(s) { return Buffer.from(s).toString('base64url'); }
function signature(payload) { return crypto.createHmac('sha256', signingKey).update(payload).digest('base64url'); }
function issueCookie(username) {
  const payload = b64(JSON.stringify({ u: username, exp: Date.now() + 24 * 60 * 60 * 1000 }));
  return payload + '.' + signature(payload);
}
function authenticated(req) {
  const token = cookieValue(req.headers.cookie);
  if (!token) return null;
  const chunks = token.split('.');
  if (chunks.length !== 2) return null;
  const sig = signature(chunks[0]);
  if (sig.length !== chunks[1].length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(chunks[1]))) return null;
  try {
    const payload = JSON.parse(Buffer.from(chunks[0], 'base64url').toString());
    if (!payload.u || !userByName.has(payload.u) || Date.now() > payload.exp) return null;
    const u = userByName.get(payload.u);
    return { username: u.username, displayName: u.displayName };
  } catch { return null; }
}
function cookieHeader(value, remove = false) {
  return 'kalaok_demo=' + (remove ? '' : value) +
    '; Path=/; HttpOnly; SameSite=Lax' +
    (process.env.COOKIE_SECURE === 'false' ? '' : '; Secure') +
    (remove ? '; Max-Age=0' : '; Max-Age=86400');
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10000) { reject(new Error('Request too large')); req.destroy(); }
    });
    req.on('end', () => {
      try {
        const obj = JSON.parse(raw || '{}');
        if (obj === null || Array.isArray(obj) || typeof obj !== 'object') throw new Error('Invalid JSON');
        resolve(obj);
      } catch { reject(new Error('Invalid JSON request')); }
    });
    req.on('error', reject);
  });
}
function revealSongs(ids) { return ids.map(id => songById.get(id)).filter(Boolean); }
function safeText(v, max = 100) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
const staticRoutes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    if (route === '/healthz') {
      res.writeHead(200, { ...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('ok\n');
    }
    if (req.method === 'GET' && staticRoutes[route]) {
      const [filename, type] = staticRoutes[route];
      const bytes = fs.readFileSync(path.join(__dirname, 'web', filename));
      res.writeHead(200, { ...commonHeaders, 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return res.end(bytes);
    }
    if (!route.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && origin !== 'https://' + req.headers.host &&
          !(process.env.COOKIE_SECURE === 'false' && origin === 'http://' + req.headers.host)) {
        return send(res, 403, { error: 'Invalid origin' });
      }
      if (!(req.headers['content-type'] || '').startsWith('application/json'))
        return send(res, 415, { error: 'JSON required' });
    }
    if (req.method === 'GET' && route === '/api/info') {
      return send(res, 200, { mode: 'demo', songCount: songs.length, userCount: users.length });
    }
    if (req.method === 'POST' && route === '/api/login') {
      const body = await readJson(req);
      const username = safeText(body.username, 40).toLowerCase();
      const password = safeText(body.password, 128);
      const user = userByName.get(username);
      const now = Date.now();
      const record = trials.get(username) || { count: 0, since: now };
      if (now - record.since > 5 * 60 * 1000) { record.count = 0; record.since = now; }
      if (record.count >= 10) return send(res, 429, { error: '嘗試次數太多，請稍後再試。' });
      let valid = false;
      if (user && password) {
        const calculated = crypto.scryptSync(password, Buffer.from(user.salt, 'hex'), 32, { N: 16384, r: 8, p: 1 });
        const expected = Buffer.from(user.hash, 'hex');
        valid = expected.length === calculated.length && crypto.timingSafeEqual(expected, calculated);
      }
      if (!valid) {
        record.count++;
        trials.set(username, record);
        return send(res, 401, { error: '測試帳號或密碼不正確。' });
      }
      trials.delete(username);
      return send(res, 200, { user: { username: user.username, displayName: user.displayName } },
        { 'Set-Cookie': cookieHeader(issueCookie(username)) });
    }
    const me = authenticated(req);
    if (!me) return send(res, 401, { error: '請先使用測試帳號登入。' });
    const mine = userState(me.username);
    if (req.method === 'POST' && route === '/api/logout') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', true) });
    }
    if (req.method === 'GET' && route === '/api/me') return send(res, 200, { user: me });
    if (req.method === 'GET' && route === '/api/songs') {
      const q = safeText(url.searchParams.get('q'), 80).toLocaleLowerCase('zh-TW');
      const genre = safeText(url.searchParams.get('genre'), 50);
      const matched = songs.filter(s => (!genre || genre === '全部' || s.genre === genre) &&
        (!q || (s.title + ' ' + s.artist + ' ' + s.language).toLocaleLowerCase('zh-TW').includes(q)));
      return send(res, 200, { songs: matched, total: matched.length });
    }
    if (req.method === 'GET' && route === '/api/queue')
      return send(res, 200, { songs: revealSongs(mine.queue) });
    if (req.method === 'GET' && route === '/api/favorites')
      return send(res, 200, { songs: revealSongs(mine.favorites) });
    if (req.method === 'POST' && route === '/api/queue') {
      const { songId } = await readJson(req);
      if (typeof songId !== 'string' || !songById.has(songId)) return send(res, 400, { error: '找不到歌曲。' });
      if (mine.queue.includes(songId)) return send(res, 200, { ok: true, duplicate: true, songs: revealSongs(mine.queue) });
      if (mine.queue.length >= 30) return send(res, 409, { error: '最多只能加入 30 首測試歌曲。' });
      mine.queue.push(songId);
      saveState();
      return send(res, 200, { ok: true, songs: revealSongs(mine.queue) });
    }
    if (req.method === 'POST' && route === '/api/queue/remove') {
      const { songId } = await readJson(req);
      mine.queue = mine.queue.filter(id => id !== songId);
      saveState();
      return send(res, 200, { ok: true, songs: revealSongs(mine.queue) });
    }
    if (req.method === 'POST' && route === '/api/favorites/toggle') {
      const { songId } = await readJson(req);
      if (typeof songId !== 'string' || !songById.has(songId)) return send(res, 400, { error: '找不到歌曲。' });
      const at = mine.favorites.indexOf(songId);
      if (at >= 0) mine.favorites.splice(at, 1);
      else mine.favorites.push(songId);
      saveState();
      return send(res, 200, { ok: true, favorite: at < 0, songs: revealSongs(mine.favorites) });
    }
    send(res, 404, { error: 'Unknown demo API' });
  } catch (err) {
    console.error('Request failed:', err.message);
    if (!res.headersSent) send(res, 400, { error: '要求無法處理，請稍後再試。' });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log('KalaOK demo listening on port ' + PORT));
