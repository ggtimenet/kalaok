'use strict';

const el = id => document.getElementById(id);
const state = { genre: '全部', user: null, songs: [], queue: [], favorites: [] };
let searchTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
async function request(endpoint, method, payload) {
  const opts = { method: method || 'GET', credentials: 'same-origin', headers: {} };
  if (payload !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(payload);
  }
  const response = await fetch('/api/' + endpoint, opts);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失敗，請稍後再試。');
  return data;
}
function notify(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}
function switchPane(isLoggedIn) {
  el('loginPane').hidden = isLoggedIn;
  el('appPane').hidden = !isLoggedIn;
  if (isLoggedIn && state.user) el('displayName').textContent = state.user.displayName;
}
function cover(index) {
  const colors = [
    ['#7456cc','#4c98ba'], ['#eb718d','#9654bc'], ['#60a6e3','#7155a8'],
    ['#ec9564','#aa5876'], ['#42b1a3','#475fa0']
  ];
  return colors[index % colors.length];
}
function renderSongs() {
  const panel = el('songsList');
  const favorites = new Set(state.favorites.map(s => s.id));
  const queue = new Set(state.queue.map(s => s.id));
  el('songCount').textContent = state.songs.length + ' 首歌曲';
  if (!state.songs.length) {
    panel.innerHTML = '<div class="empty">目前找不到符合條件的測試歌曲，請試試其他關鍵字。</div>';
    return;
  }
  panel.innerHTML = state.songs.map((song, i) => {
    const c = cover(i);
    return '<article class="song">' +
      '<div class="song-index">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div class="cover" style="--c1:' + c[0] + ';--c2:' + c[1] + '" aria-hidden="true">♫</div>' +
      '<div class="song-main"><div class="song-title">' + escapeHtml(song.title) +
      '</div><div class="song-meta">' + escapeHtml(song.artist) + ' · ' + escapeHtml(song.language) + ' · ' + escapeHtml(song.genre) + '</div></div>' +
      '<span class="song-length">' + escapeHtml(song.duration) + '</span>' +
      '<button class="icon-button' + (favorites.has(song.id) ? ' active' : '') +
      '" data-action="favorite" data-id="' + escapeHtml(song.id) + '" type="button" aria-label="切換收藏" title="收藏">' + (favorites.has(song.id) ? '♥' : '♡') + '</button>' +
      '<button class="add-button" data-action="queue" data-id="' + escapeHtml(song.id) +
      '" type="button">' + (queue.has(song.id) ? '已點播' : '+ 點歌') + '</button></article>';
  }).join('');
}
function renderQueue() {
  const box = el('queueList');
  el('queueCount').textContent = String(state.queue.length);
  if (!state.queue.length) {
    box.innerHTML = '<div class="empty">還沒有點播歌曲。<br>試著從左側加入一首！</div>';
    return;
  }
  box.innerHTML = state.queue.map((song, i) =>
    '<div class="queue-item"><span class="order-num">' + String(i + 1).padStart(2, '0') +
    '</span><span class="queue-copy"><strong>' + escapeHtml(song.title) +
    '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
    '<button class="remove" data-action="remove" data-id="' + escapeHtml(song.id) + '" type="button" aria-label="移除歌曲">×</button></div>'
  ).join('');
}
function renderFavorites() {
  const box = el('favoriteList');
  el('favoriteCount').textContent = String(state.favorites.length);
  if (!state.favorites.length) {
    box.innerHTML = '<div class="empty">收藏清單目前是空的。</div>';
    return;
  }
  box.innerHTML = state.favorites.map(song =>
    '<div class="favorite-item"><span class="queue-copy"><strong>' + escapeHtml(song.title) +
    '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
    '<button class="remove" data-action="favorite" data-id="' + escapeHtml(song.id) + '" type="button" aria-label="移除收藏">×</button></div>'
  ).join('');
}
async function refresh() {
  const params = new URLSearchParams({ q: el('searchInput').value, genre: state.genre });
  const [result, queue, favorites] = await Promise.all([
    request('songs?' + params.toString()), request('queue'), request('favorites')
  ]);
  state.songs = result.songs;
  state.queue = queue.songs;
  state.favorites = favorites.songs;
  renderSongs(); renderQueue(); renderFavorites();
}
async function initialize() {
  try {
    const me = await request('me');
    state.user = me.user;
    switchPane(true);
    await refresh();
  } catch {
    state.user = null;
    switchPane(false);
  }
}
el('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = el('loginButton');
  button.disabled = true;
  try {
    const result = await request('login', 'POST', {
      username: el('username').value, password: el('password').value
    });
    state.user = result.user;
    el('password').value = '';
    switchPane(true);
    await refresh();
    notify('登入成功！歡迎進入 KalaOK 測試環境。');
  } catch (err) { notify(err.message); }
  finally { button.disabled = false; }
});
el('logoutButton').addEventListener('click', async () => {
  try { await request('logout', 'POST', {}); }
  catch (err) { notify(err.message); return; }
  state.user = null;
  state.songs = []; state.queue = []; state.favorites = [];
  el('password').value = '';
  switchPane(false);
  notify('已登出測試帳號。');
});
el('genreFilters').addEventListener('click', async event => {
  const button = event.target.closest('button[data-genre]');
  if (!button) return;
  state.genre = button.dataset.genre;
  el('genreFilters').querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
  try { await refresh(); } catch (err) { notify(err.message); }
});
el('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh().catch(err => notify(err.message)), 230);
});
async function handleAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === 'favorite') {
      const result = await request('favorites/toggle', 'POST', { songId: id });
      notify(result.favorite ? '已加入我的最愛 ♡' : '已取消收藏');
    } else if (action === 'queue') {
      const result = await request('queue', 'POST', { songId: id });
      notify(result.duplicate ? '這首歌已在點播清單中。' : '已成功加入點播清單！');
    } else if (action === 'remove') {
      await request('queue/remove', 'POST', { songId: id });
      notify('已從點播清單移除。');
    }
    await refresh();
  } catch (err) { notify(err.message); }
  finally { button.disabled = false; }
}
el('songsList').addEventListener('click', handleAction);
el('queueList').addEventListener('click', handleAction);
el('favoriteList').addEventListener('click', handleAction);
initialize();
