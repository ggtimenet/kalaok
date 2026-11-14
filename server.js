'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.KALAOK_DATA_DIR || '/data';
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const ROOMS_PATH = path.join(DATA_DIR, 'rooms.json');
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

/** Account-scoped cross-screen control state, independent from existing queue data. */
let rooms;
try {
  rooms = fs.existsSync(ROOMS_PATH) ? JSON.parse(fs.readFileSync(ROOMS_PATH, 'utf8')) : {};
} catch (error) {
  console.error('Cannot read existing room state', error.message);
  process.exit(1);
}
function persistRooms() {
  const tmp = ROOMS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rooms, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ROOMS_PATH);
}
function roomFor(username) {
  if (!rooms[username]) {
    rooms[username] = {
      revision: 0, songId: null, action: 'stop',
      updatedAt: Date.now(), display: null, feedback: null
    };
  }
  return rooms[username];
}
function activeDisplay(room) {
  return !!(room.display && Date.now() - room.display.lastSeen < 20000);
}
function roomView(username) {
  const room = roomFor(username);
  const live = activeDisplay(room);
  return {
    revision: room.revision,
    songId: room.songId,
    song: songById.get(room.songId) || null,
    action: room.action,
    updatedAt: room.updatedAt,
    display: {
      online: live,
      name: live ? room.display.name : null,
      lastSeen: live ? room.display.lastSeen : null,
      ackRevision: live ? room.display.ackRevision || 0 : 0,
      status: live ? room.display.status || 'waiting' : 'offline',
      detail: live ? room.display.detail || '' : ''
    },
    queue: revealSongs(userState(username).queue),
    favorites: revealSongs(userState(username).favorites)
  };
}
function safeDeviceId(input) {
  return typeof input === 'string' && /^[a-zA-Z0-9_-]{12,80}$/.test(input) ? input : null;
}
function updateCommand(room, action, songId) {
  room.revision = (Number(room.revision) || 0) + 1;
  room.action = action;
  room.songId = songId;
  room.updatedAt = Date.now();
  room.feedback = null;
  if (room.display) {
    room.display.status = 'pending';
    room.display.detail = '';
  }
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

    // Shared account room. Devices authenticate independently with the same demo account.
    if (req.method === 'GET' && route === '/api/room')
      return send(res, 200, { room: roomView(me.username) });

    // Only one active player screen per account; phones/tablets are controllers.
    if (req.method === 'POST' && route === '/api/room/display') {
      const body = await readJson(req);
      const deviceId = safeDeviceId(body.deviceId);
      if (!deviceId) return send(res, 400, { error: '無效的裝置識別碼。' });
      const room = roomFor(me.username);
      if (activeDisplay(room) && room.display.deviceId !== deviceId && body.takeover !== true)
        return send(res, 409, { error: '目前已有播放螢幕在線；如需更換，請使用接管播放螢幕。' });
      room.display = {
        deviceId, name: safeText(body.name, 45) || '播放螢幕',
        lastSeen: Date.now(), ackRevision: 0, status: 'ready', detail: '待命'
      };
      persistRooms();
      return send(res, 200, { room: roomView(me.username) });
    }


    if (req.method === 'POST' && route === '/api/room/release') {
      const body = await readJson(req);
      const room = roomFor(me.username);
      if (room.display && room.display.deviceId === safeDeviceId(body.deviceId)) {
        room.display.lastSeen = 0;
        room.display.status = 'offline';
        persistRooms();
      }
      return send(res, 200, { room: roomView(me.username) });
    }

    if (req.method === 'POST' && route === '/api/room/heartbeat') {
      const body = await readJson(req);
      const room = roomFor(me.username);
      if (!room.display || room.display.deviceId !== safeDeviceId(body.deviceId))
        return send(res, 409, { error: '這個裝置已不是指定播放螢幕。' });
      room.display.lastSeen = Date.now();
      return send(res, 200, { room: roomView(me.username) });
    }

    if (req.method === 'POST' && route === '/api/room/ack') {
      const body = await readJson(req);
      const room = roomFor(me.username);
      if (!room.display || room.display.deviceId !== safeDeviceId(body.deviceId))
        return send(res, 409, { error: '目前播放螢幕已切換。' });
      if (!Number.isSafeInteger(body.revision) || body.revision !== room.revision)
        return send(res, 409, { error: '播放指令已更新，忽略過期回報。' });
      if (!['requested', 'playing', 'paused', 'buffering', 'blocked', 'error', 'ended', 'ready'].includes(body.status))
        return send(res, 400, { error: '不支援的播放回報。' });
      room.display.ackRevision = body.revision;
      room.display.status = body.status;
      room.display.detail = safeText(body.detail, 120);
      room.display.lastSeen = Date.now();
      persistRooms();
      return send(res, 200, { room: roomView(me.username) });
    }

    if (req.method === 'POST' && route === '/api/room/command') {
      const body = await readJson(req);
      const room = roomFor(me.username);
      const queue = mine.queue.filter(id => songById.has(id));
      const command = safeText(body.command, 20);
      const allowed = ['play', 'pause', 'resume', 'previous', 'next', 'stop'];
      if (!allowed.includes(command))
        return send(res, 400, { error: '不支援的遙控指令。' });
      let id = room.songId;
      let action = command;
      if (command === 'play') {
        id = typeof body.songId === 'string' ? body.songId : id || queue[0];
        if (!songById.has(id)) return send(res, 400, { error: '請先選擇歌曲。' });
        if (!queue.includes(id)) {
          if (queue.length >= 30) return send(res, 409, { error: '歌單最多 30 首。' });
          mine.queue.push(id);
          saveState();
        }
      } else if (command === 'previous' || command === 'next') {
        if (!queue.length) return send(res, 409, { error: '待播清單是空的。' });
        const i = queue.indexOf(id);
        const target = command === 'next'
          ? (i === -1 ? 0 : Math.min(i + 1, queue.length - 1))
          : (i === -1 ? 0 : Math.max(i - 1, 0));
        id = queue[target];
        action = 'play';
      } else if (!id || !songById.has(id)) {
        return send(res, 409, { error: '目前沒有可控制的歌曲。' });
      }
      updateCommand(room, action, id);
      persistRooms();
      return send(res, 200, { room: roomView(me.username) });
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
