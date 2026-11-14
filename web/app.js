'use strict';

// KalaOK migration test: official YouTube IFrame Player API; no media is downloaded or proxied.
const el = id => document.getElementById(id);
const state = { genre: '全部', user: null, songs: [], queue: [], favorites: [], playingId: null };
let searchTimer = null;
let toastTimer = null;
let ytPlayer = null;
let playerReady = false;
let ytApiRequested = false;
let pendingVideoId = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
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
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}
function setPlayerStatus(message) {
  el('playerStatus').textContent = message;
}
function switchPane(isLoggedIn) {
  el('loginPane').hidden = isLoggedIn;
  el('appPane').hidden = !isLoggedIn;
  if (isLoggedIn && state.user) el('displayName').textContent = state.user.displayName;
}
function cover(index) {
  const colors = [
    ['#7456cc', '#4c98ba'], ['#eb718d', '#9654bc'], ['#60a6e3', '#7155a8'],
    ['#ec9564', '#aa5876'], ['#42b1a3', '#475fa0']
  ];
  return colors[index % colors.length];
}
function allVisibleSongs() {
  return [...state.songs, ...state.queue, ...state.favorites];
}
function findSong(id) {
  return allVisibleSongs().find(song => song.id === id);
}
function sourceLabel(song) {
  return song.sourceChannel ? song.sourceChannel + ' · YouTube 伴唱影片' : 'YouTube 伴唱影片';
}
function renderSongs() {
  const panel = el('songsList');
  const favorites = new Set(state.favorites.map(s => s.id));
  const queue = new Set(state.queue.map(s => s.id));
  el('songCount').textContent = state.songs.length + ' 首影片';
  if (!state.songs.length) {
    panel.innerHTML = '<div class="empty">目前找不到符合條件的 YouTube 伴唱影片，請試試其他關鍵字。</div>';
    return;
  }
  panel.innerHTML = state.songs.map((song, i) => {
    const c = cover(i);
    const playing = state.playingId === song.id;
    return '<article class="song' + (playing ? ' is-playing' : '') + '">' +
      '<div class="song-index">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<button class="cover song-select" style="--c1:' + c[0] + ';--c2:' + c[1] +
      '" data-action="play" data-id="' + escapeHtml(song.id) + '" type="button" aria-label="立即播放：' +
      escapeHtml(song.title) + '">▶</button>' +
      '<div class="song-main"><button type="button" class="song-title song-select song-title-button" data-action="play" data-id="' +
      escapeHtml(song.id) + '" aria-label="立即播放：' + escapeHtml(song.title) + '">' +
      escapeHtml(song.title) + '</button><div class="song-meta">' +
      escapeHtml(song.artist) + ' · ' + escapeHtml(song.language) + ' · ' +
      escapeHtml(sourceLabel(song)) + '</div></div>' +
      '<button class="icon-button' + (favorites.has(song.id) ? ' active' : '') +
      '" data-action="favorite" data-id="' + escapeHtml(song.id) +
      '" type="button" aria-label="切換收藏" title="收藏">' + (favorites.has(song.id) ? '♥' : '♡') + '</button>' +
      '<button class="add-button" data-action="queue" data-id="' + escapeHtml(song.id) +
      '" type="button">' + (queue.has(song.id) ? '已加入' : '+ 點歌') + '</button>' +
      '<button class="play-action" data-action="play" data-id="' + escapeHtml(song.id) +
      '" type="button">' + (playing ? '♪ 播放中' : '▶ 播放') + '</button></article>';
  }).join('');
}
function renderQueue() {
  const box = el('queueList');
  el('queueCount').textContent = String(state.queue.length);
  if (!state.queue.length) {
    box.innerHTML = '<div class="empty">待播清單是空的。<br>從左側加入或播放歌曲！</div>';
    updateControlButtons();
    return;
  }
  box.innerHTML = state.queue.map((song, i) =>
    '<div class="queue-item' + (state.playingId === song.id ? ' is-playing' : '') +
    '"><button class="queue-play" data-action="play" data-id="' + escapeHtml(song.id) +
    '" type="button" aria-label="播放 ' + escapeHtml(song.title) + '">▶</button>' +
    '<span class="queue-copy"><strong>' + escapeHtml(song.title) +
    '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
    '<button class="remove" data-action="remove" data-id="' +
    escapeHtml(song.id) + '" type="button" aria-label="移除 ' +
    escapeHtml(song.title) + '">×</button></div>'
  ).join('');
  updateControlButtons();
}
function renderFavorites() {
  const box = el('favoriteList');
  el('favoriteCount').textContent = String(state.favorites.length);
  if (!state.favorites.length) {
    box.innerHTML = '<div class="empty">收藏清單目前是空的。</div>';
    return;
  }
  box.innerHTML = state.favorites.map(song =>
    '<div class="favorite-item"><button class="queue-play" data-action="play" data-id="' +
    escapeHtml(song.id) + '" type="button" aria-label="播放 ' + escapeHtml(song.title) +
    '">▶</button><span class="queue-copy"><strong>' + escapeHtml(song.title) +
    '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
    '<button class="remove" data-action="favorite" data-id="' + escapeHtml(song.id) +
    '" type="button" aria-label="移除收藏">×</button></div>'
  ).join('');
}
function updateControlButtons() {
  el('playPauseButton').disabled = !state.playingId;
  const i = state.queue.findIndex(song => song.id === state.playingId);
  el('nextButton').disabled = !state.playingId || i < 0 || i >= state.queue.length - 1;
}
function loadYouTubeApi() {
  if (window.YT && typeof window.YT.Player === 'function') {
    initYouTubePlayer();
    return;
  }
  if (ytApiRequested) return;
  ytApiRequested = true;
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => setPlayerStatus('YouTube 播放器載入失敗。可點下方連結到 YouTube 播放。');
  document.head.appendChild(script);
}
window.onYouTubeIframeAPIReady = function () {
  initYouTubePlayer();
};
function initYouTubePlayer() {
  if (!state.user || !pendingVideoId || ytPlayer || !window.YT || typeof window.YT.Player !== 'function') return;
  ytPlayer = new window.YT.Player('youtube-player', {
    videoId: pendingVideoId,
    width: '100%', height: '100%',
    playerVars: { enablejsapi: 1, playsinline: 1, rel: 0, origin: window.location.origin },
    events: {
      onReady: () => {
        playerReady = true;
        if (pendingVideoId) {
          const id = pendingVideoId;
          pendingVideoId = null;
          ytPlayer.loadVideoById(id);
        } else {
          setPlayerStatus('播放器已就緒，請點選歌曲旁的「▶ 播放」。');
        }
      },
      onStateChange: event => {
        const states = window.YT?.PlayerState;
        if (!states) return;
        if (event.data === states.ENDED && state.playingId) {
          const i = state.queue.findIndex(song => song.id === state.playingId);
          if (i !== -1 && i < state.queue.length - 1) {
            startSong(state.queue[i + 1].id, false, true);
          } else {
            setPlayerStatus('播放完畢。可從待播清單再選一首歌曲。');
          }
        } else if (event.data === states.PLAYING) {
          setPlayerStatus('YouTube 播放中（伴唱影片由原頻道提供）。');
        } else if (event.data === states.PAUSED) {
          setPlayerStatus('已暫停，可按「播放 / 暫停」繼續。');
        } else if (event.data === states.BUFFERING) {
          setPlayerStatus('正在載入 YouTube 影片…');
        }
      },
      onAutoplayBlocked: () => {
        setPlayerStatus('瀏覽器阻止了自動播放。請點一下影片中央的播放鍵繼續。');
      },
      onError: event => {
        setPlayerStatus('這支 YouTube 影片無法在此頁內播放（錯誤 ' +
          String(event.data) + '）。請點下方連結改在 YouTube 開啟。');
      }
    }
  });
}
function startSong(songId, addToQueue = true, automatically = false) {
  const song = findSong(songId);
  if (!song || !/^[\w-]{11}$/.test(song.videoId || '')) {
    notify('這首歌尚無可用的 YouTube 影片。');
    return;
  }
  state.playingId = song.id;
  el('nowTitle').textContent = song.title;
  el('nowArtist').textContent = song.artist + ' · ' + sourceLabel(song);
  const link = el('youtubeSource');
  link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(song.videoId);
  link.hidden = false;
  setPlayerStatus(automatically ?
    '正在播放下一首；若手機限制自動播放，請按播放器內的播放鍵。' :
    '正在開啟 YouTube 伴唱影片…');
  if (playerReady && ytPlayer) {
    try { ytPlayer.loadVideoById(song.videoId); }
    catch { pendingVideoId = song.videoId; setPlayerStatus('播放器尚未就緒，請稍後點播放。'); }
  } else {
    pendingVideoId = song.videoId;
    loadYouTubeApi();
  }
  renderSongs(); renderQueue();
  if (addToQueue && !state.queue.some(s => s.id === song.id)) {
    request('queue', 'POST', { songId }).then(result => {
      state.queue = result.songs;
      renderSongs(); renderQueue();
    }).catch(error => notify(error.message));
  }
}
async function refresh() {
  const params = new URLSearchParams({ q: el('searchInput').value, genre: state.genre });
  const [result, queue, favorites] = await Promise.all([
    request('songs?' + params), request('queue'), request('favorites')
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
    loadYouTubeApi();
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
      username: el('username').value,
      password: el('password').value
    });
    state.user = result.user;
    el('password').value = '';
    switchPane(true);
    await refresh();
    loadYouTubeApi();
    notify('登入成功！請點選「▶ 播放」試聽 YouTube 伴唱影片。');
  } catch (err) { notify(err.message); }
  finally { button.disabled = false; }
});
el('logoutButton').addEventListener('click', async () => {
  try { await request('logout', 'POST', {}); }
  catch (err) { notify(err.message); return; }
  if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
    try { ytPlayer.stopVideo(); } catch {}
  }
  state.user = null;
  state.playingId = null;
  state.songs = [];
  state.queue = [];
  state.favorites = [];
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
  searchTimer = setTimeout(() => refresh().catch(error => notify(error.message)), 230);
});
async function handleAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === 'play') {
    startSong(id);
    return;
  }
  button.disabled = true;
  try {
    if (action === 'favorite') {
      const result = await request('favorites/toggle', 'POST', { songId: id });
      notify(result.favorite ? '已加入我的最愛 ♡' : '已取消收藏');
    } else if (action === 'queue') {
      const result = await request('queue', 'POST', { songId: id });
      notify(result.duplicate ? '這首歌已在待播清單。點「▶ 播放」可開始播放。' :
        '已加入待播清單！點「▶ 播放」即可使用 YouTube 播放。');
    } else if (action === 'remove') {
      await request('queue/remove', 'POST', { songId: id });
      if (state.playingId === id && ytPlayer && playerReady) {
        try { ytPlayer.stopVideo(); } catch {}
        state.playingId = null;
        setPlayerStatus('目前播放的歌曲已從待播清單移除。');
      }
      notify('已從待播清單移除。');
    }
    await refresh();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
el('songsList').addEventListener('click', handleAction);
el('queueList').addEventListener('click', handleAction);
el('favoriteList').addEventListener('click', handleAction);
el('playPauseButton').addEventListener('click', () => {
  if (!ytPlayer || !playerReady) {
    notify('YouTube 播放器尚未完成載入，可使用影片的 YouTube 連結。');
    return;
  }
  try {
    if (ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  } catch { notify('播放器暫時無法控制，請點播放器內的播放鍵。'); }
});
el('nextButton').addEventListener('click', () => {
  const i = state.queue.findIndex(song => song.id === state.playingId);
  if (i >= 0 && i < state.queue.length - 1) startSong(state.queue[i + 1].id, false);
  else notify('目前已是待播清單最後一首。');
});
initialize();
