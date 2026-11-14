'use strict';

// One screen owns the YouTube player; any other browser logged into the same demo
// account can control its shared room via authenticated, account-scoped API polling.
const el = id => document.getElementById(id);
const state = {
  genre: '全部', user: null, songs: [], queue: [], favorites: [],
  playingId: null, room: null, role: 'remote', lastAppliedRevision: -1,
  lastRoomListSignature: '', lastHeartbeat: 0
};
const DEVICE_ID = (() => {
  const key = 'kalaok-device-id-v1';
  let id = sessionStorage.getItem(key);
  if (!id || !/^device-[\w-]{12,}$/.test(id)) {
    id = 'device-' + (crypto.randomUUID ? crypto.randomUUID() :
      Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join(''));
    sessionStorage.setItem(key,id);
  }
  return id;
})();
let searchTimer = null;
let toastTimer = null;
let roomPollTimer = null;
let roomPolling = false;
let ytPlayer = null;
let playerReady = false;
let ytApiRequested = false;
let pendingVideoId = null;
let pendingPlayerAction = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
async function request(endpoint, method = 'GET', payload) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (payload !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(payload);
  }
  const response = await fetch('/api/' + endpoint, opts);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || '操作失敗，請稍後再試。');
    err.status = response.status;
    throw err;
  }
  return data;
}
function notify(message) {
  el('toast').textContent = message;
  el('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el('toast').hidden = true; }, 3900);
}
function setPlayerStatus(message) {
  el('playerStatus').textContent = message;
}
function switchPane(loggedIn) {
  el('loginPane').hidden = loggedIn;
  el('appPane').hidden = !loggedIn;
  if (loggedIn && state.user) el('displayName').textContent = state.user.displayName;
}
function setRoleUI() {
  el('screenModeButton').classList.toggle('selected', state.role === 'screen');
  el('remoteModeButton').classList.toggle('selected', state.role === 'remote');
  el('remotePreview').hidden = state.role !== 'remote';
  el('youtube-player').hidden = state.role === 'remote';
}
function cover(index) {
  const colors = [['#7456cc','#4c98ba'],['#eb718d','#9654bc'],
    ['#60a6e3','#7155a8'],['#ec9564','#aa5876'],['#42b1a3','#475fa0']];
  return colors[index % colors.length];
}
function allVisibleSongs() {
  return [...state.songs, ...state.queue, ...state.favorites,
    ...(state.room?.song ? [state.room.song] : [])];
}
function findSong(id) { return allVisibleSongs().find(s => s.id === id); }
function sourceLabel(song) {
  return song.sourceChannel ? song.sourceChannel + ' · YouTube 伴唱影片' : 'YouTube 伴唱影片';
}
function renderSongs() {
  const panel = el('songsList');
  const favoriteIds = new Set(state.favorites.map(s => s.id));
  const queueIds = new Set(state.queue.map(s => s.id));
  el('songCount').textContent = state.songs.length + ' 首影片';
  if (!state.songs.length) {
    panel.innerHTML = '<div class="empty">沒有符合條件的歌曲，請試試其他關鍵字。</div>';
    return;
  }
  panel.innerHTML = state.songs.map((song, i) => {
    const c = cover(i);
    const playing = state.playingId === song.id;
    return '<article class="song' + (playing ? ' is-playing' : '') + '">' +
      '<div class="song-index">' + String(i + 1).padStart(2,'0') + '</div>' +
      '<button class="cover song-select" style="--c1:' + c[0] + ';--c2:' + c[1] +
      '" data-action="play" data-id="' + escapeHtml(song.id) +
      '" type="button" aria-label="播放：' + escapeHtml(song.title) + '">▶</button>' +
      '<div class="song-main"><button type="button" class="song-title song-select song-title-button"' +
      ' data-action="play" data-id="' + escapeHtml(song.id) +
      '" aria-label="播放：' + escapeHtml(song.title) + '">' + escapeHtml(song.title) +
      '</button><div class="song-meta">' + escapeHtml(song.artist) + ' · ' +
      escapeHtml(song.language) + ' · ' + escapeHtml(sourceLabel(song)) + '</div></div>' +
      '<button class="icon-button' + (favoriteIds.has(song.id) ? ' active' : '') +
      '" data-action="favorite" data-id="' + escapeHtml(song.id) +
      '" type="button" aria-label="切換收藏">' + (favoriteIds.has(song.id) ? '♥' : '♡') + '</button>' +
      '<button class="add-button" data-action="queue" data-id="' + escapeHtml(song.id) +
      '" type="button">' + (queueIds.has(song.id) ? '已加入' : '+ 點歌') + '</button>' +
      '<button class="play-action" data-action="play" data-id="' + escapeHtml(song.id) +
      '" type="button">' + (playing ? '♪ 已選' : '▶ 播放') + '</button></article>';
  }).join('');
}
function renderQueue() {
  const box = el('queueList');
  el('queueCount').textContent = String(state.queue.length);
  if (!state.queue.length) {
    box.innerHTML = '<div class="empty">待播清單是空的。<br>從左側加入或播放歌曲！</div>';
  } else {
    box.innerHTML = state.queue.map((song, i) =>
      '<div class="queue-item' + (state.playingId === song.id ? ' is-playing' : '') + '">' +
      '<button class="queue-play" data-action="play" data-id="' +
      escapeHtml(song.id) + '" type="button" aria-label="播放 ' +
      escapeHtml(song.title) + '">▶</button>' +
      '<span class="queue-copy"><strong>' + escapeHtml(song.title) +
      '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
      '<button class="remove" data-action="remove" data-id="' + escapeHtml(song.id) +
      '" type="button" aria-label="移除 ' + escapeHtml(song.title) + '">×</button></div>'
    ).join('');
  }
  updateControlButtons();
}
function renderFavorites() {
  const box = el('favoriteList');
  el('favoriteCount').textContent = String(state.favorites.length);
  box.innerHTML = state.favorites.length ? state.favorites.map(song =>
    '<div class="favorite-item"><button class="queue-play" data-action="play" data-id="' +
    escapeHtml(song.id) + '" type="button" aria-label="播放 ' + escapeHtml(song.title) +
    '">▶</button><span class="queue-copy"><strong>' + escapeHtml(song.title) +
    '</strong><small>' + escapeHtml(song.artist) + '</small></span>' +
    '<button class="remove" data-action="favorite" data-id="' + escapeHtml(song.id) +
    '" type="button" aria-label="移除收藏">×</button></div>'
  ).join('') : '<div class="empty">收藏清單目前是空的。</div>';
}
function updateControlButtons() {
  const active = !!state.room?.songId;
  const index = state.queue.findIndex(song => song.id === state.room?.songId);
  el('playPauseButton').disabled = !active;
  el('playPauseButton').textContent = state.room?.action === 'pause' ? '▶ 繼續播放' : 'Ⅱ 暫停播放';
  el('playPauseButton').classList.toggle('selected', state.room?.action === 'pause');
  el('previousButton').disabled = index <= 0;
  el('nextButton').disabled = index < 0 || index >= state.queue.length - 1;
}
function updateRoomPresentation(room) {
  if (!room) return;
  if (state.room && room.revision < state.room.revision) return;
  const oldSong = state.room?.songId;
  state.room = room;
  state.playingId = room.songId;
  const signature = JSON.stringify([
    room.queue.map(s => s.id), room.favorites.map(s => s.id), room.songId
  ]);
  if (signature !== state.lastRoomListSignature) {
    state.queue = room.queue;
    state.favorites = room.favorites;
    state.lastRoomListSignature = signature;
    renderSongs(); renderQueue(); renderFavorites();
  }
  const online = room.display.online;
  const badge = el('syncStatus');
  badge.classList.toggle('online',online);
  badge.classList.toggle('offline',!online);
  badge.textContent = online ?
    '● 播放螢幕在線' + (room.display.name ? ' · ' + room.display.name : '') :
    '○ 播放螢幕離線';
  el('takeoverButton').hidden = !(state.role === 'remote' && online);
  if (room.song) {
    el('nowTitle').textContent = room.song.title;
    el('nowArtist').textContent = room.song.artist + ' · ' + sourceLabel(room.song);
    el('youtubeSource').href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(room.song.videoId);
    el('youtubeSource').hidden = false;
  } else {
    el('nowTitle').textContent = '選擇歌曲開始播放';
    el('nowArtist').textContent = '在同帳號的任一裝置上選歌';
    el('youtubeSource').hidden = true;
  }
  const ack = room.display.ackRevision >= room.revision && room.revision > 0;
  const labels = {
    requested: '播放器收到指令，但尚未確認影片已開始',
    playing: 'YouTube 已回報正在播放',
    paused: '播放螢幕已回報暫停',
    buffering: 'YouTube 正在緩衝',
    blocked: '瀏覽器阻擋自動播放；請到播放螢幕點一下播放器',
    error: 'YouTube 播放失敗，請改用下方原始連結',
    ended: '這首歌已播完',
    ready: '播放螢幕準備就緒',
    waiting: '正在等待播放螢幕回報',
    pending: '指令已送出，等待播放螢幕接收'
  };
  const feedback = !online ? '播放螢幕尚未上線。可先排歌，待它登入後接收。' :
    !ack ? '指令已同步到伺服器，等待播放螢幕確認。' :
    (labels[room.display.status] || '正在同步') +
    (room.display.detail ? ' · ' + room.display.detail : '');
  el('roomFeedback').textContent = feedback;
  if (state.role === 'remote') {
    setPlayerStatus(room.song ?
      (room.action === 'pause' ? '遠端已要求暫停播放' :
       room.action === 'play' || room.action === 'resume' ? '遠端已要求播放' : '已同步播放狀態') :
      '在手機上選歌、播放、暫停或切換上一首／下一首。');
  }
  updateControlButtons();
  if (state.role === 'screen' && room.revision !== state.lastAppliedRevision) {
    state.lastAppliedRevision = room.revision;
    if (room.revision > 0) applyScreenCommand(room);
  }
}
function loadYouTubeApi() {
  if (state.role !== 'screen') return;
  if (window.YT && typeof window.YT.Player === 'function') {
    initYouTubePlayer();
    return;
  }
  if (ytApiRequested) return;
  ytApiRequested = true;
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => {
    setPlayerStatus('無法載入 YouTube 播放器；請使用 YouTube 原始連結。');
    reportScreen('error', '播放器腳本載入失敗');
  };
  document.head.appendChild(script);
}
window.onYouTubeIframeAPIReady = function() { initYouTubePlayer(); };
function reportScreen(status, detail = '') {
  if (state.role !== 'screen' || !state.room || !state.room.revision) return;
  const revision = state.room.revision;
  request('room/ack','POST',{deviceId:DEVICE_ID,revision,status,detail})
    .then(result => updateRoomPresentation(result.room))
    .catch(() => {});
}
function initYouTubePlayer() {
  if (state.role !== 'screen' || !pendingVideoId || ytPlayer ||
      !window.YT || typeof window.YT.Player !== 'function') return;
  ytPlayer = new window.YT.Player('youtube-player',{
    videoId:pendingVideoId,
    width:'100%',height:'100%',
    playerVars:{
      enablejsapi:1,playsinline:1,rel:0,origin:window.location.origin
    },
    events:{
      onReady:()=>{
        playerReady=true;
        const id=pendingVideoId;
        const action=pendingPlayerAction;
        pendingVideoId=null;
        pendingPlayerAction=null;
        if (id && state.role === 'screen') {
          if (action === 'pause') ytPlayer.cueVideoById(id);
          else ytPlayer.loadVideoById(id);
          reportScreen('requested','已載入 YouTube iframe，等待播放回報');
        }
      },
      onStateChange:event=>{
        if (state.role !== 'screen') return;
        const types=window.YT?.PlayerState;
        if (!types) return;
        if (event.data === types.PLAYING) {
          setPlayerStatus('YouTube 正在播放');
          reportScreen('playing');
        } else if (event.data === types.PAUSED) {
          setPlayerStatus('播放已暫停');
          reportScreen('paused');
        } else if (event.data === types.BUFFERING) {
          setPlayerStatus('影片緩衝中…');
          reportScreen('buffering');
        } else if (event.data === types.ENDED) {
          setPlayerStatus('歌曲播放完畢，準備播放下一首…');
          reportScreen('ended');
          const i=state.queue.findIndex(s=>s.id===state.room?.songId);
          if (i>=0 && i<state.queue.length-1) {
            sendRoomCommand('next').catch(err=>notify(err.message));
          }
        }
      },
      onAutoplayBlocked:()=>{
        setPlayerStatus('瀏覽器阻擋遠端自動播放；請在播放螢幕上點擊「繼續播放」。');
        reportScreen('blocked','需要在播放螢幕上手動啟用');
      },
      onError:event=>{
        setPlayerStatus('YouTube 錯誤 '+event.data+'。可以在 YouTube 原站開啟影片。');
        reportScreen('error','YouTube 錯誤 '+event.data);
      }
    }
  });
}
function applyScreenCommand(room) {
  if (state.role !== 'screen') return;
  const song=room.song;
  if (!song || !/^[\w-]{11}$/.test(song.videoId || '')) return;
  const action=room.action;
  if (action === 'stop') {
    try { if (playerReady) ytPlayer.stopVideo(); } catch {}
    reportScreen('paused','已停止');
    return;
  }
  if (action === 'pause') {
    pendingPlayerAction='pause';
    if (playerReady && ytPlayer) {
      try { ytPlayer.pauseVideo(); reportScreen('paused'); }
      catch { reportScreen('error','無法暫停播放器'); }
    } else {
      pendingVideoId=song.videoId;
      loadYouTubeApi();
      reportScreen('requested','暫停指令已收到，播放器準備中');
    }
    return;
  }
  pendingPlayerAction='play';
  if (playerReady && ytPlayer) {
    try {
      const current=ytPlayer.getVideoData()?.video_id;
      if (current===song.videoId) ytPlayer.playVideo();
      else ytPlayer.loadVideoById(song.videoId);
      reportScreen('requested','已傳送播放指令給 YouTube');
    } catch {
      reportScreen('error','無法控制 YouTube 播放器');
    }
  } else {
    pendingVideoId=song.videoId;
    loadYouTubeApi();
    reportScreen('requested','正在載入 YouTube 播放器');
  }
}
async function pollRoom() {
  if (!state.user || roomPolling) return;
  roomPolling=true;
  try {
    if (state.role === 'screen' && Date.now()-state.lastHeartbeat > 4500) {
      try {
        await request('room/heartbeat','POST',{deviceId:DEVICE_ID});
        state.lastHeartbeat=Date.now();
      } catch(err) {
        if (err.status===409) {
          notify('播放螢幕已被另一台裝置接管；本裝置切換為遙控器。');
          if (playerReady) { try { ytPlayer.stopVideo(); } catch {} }
          state.role='remote';
          sessionStorage.setItem('kalaok-role','remote');
          setRoleUI();
        }
      }
    }
    const result=await request('room');
    updateRoomPresentation(result.room);
  } catch(err) {
    if(err.status===401) {
      stopRoomPolling();
      state.user=null;
      switchPane(false);
      notify('登入階段已結束，請重新登入。');
    }
  } finally {
    roomPolling=false;
  }
}
function startRoomPolling() {
  stopRoomPolling();
  pollRoom();
  roomPollTimer=setInterval(pollRoom,1400);
}
function stopRoomPolling() {
  if(roomPollTimer) clearInterval(roomPollTimer);
  roomPollTimer=null;
}
async function sendRoomCommand(command,songId) {
  const body={command};
  if(songId) body.songId=songId;
  const response=await request('room/command','POST',body);
  updateRoomPresentation(response.room);
  return response.room;
}
async function switchToScreen(takeover=false) {
  try {
    const result=await request('room/display','POST',{
      deviceId:DEVICE_ID,
      name:/Mobile|Android|iPhone/i.test(navigator.userAgent) ?
        '手機播放螢幕' : '電視／電腦播放螢幕',
      takeover
    });
    state.role='screen';
    state.lastAppliedRevision=-1;
    state.lastHeartbeat=Date.now();
    sessionStorage.setItem('kalaok-role','screen');
    el('takeoverButton').hidden=true;
    setRoleUI();
    updateRoomPresentation(result.room);
    if (state.room?.songId) loadYouTubeApi();
    notify('已設為播放螢幕。可用另一台裝置登入同帳號遙控。');
  } catch(err) {
    state.role='remote';
    sessionStorage.setItem('kalaok-role','remote');
    setRoleUI();
    if (err.status===409) el('takeoverButton').hidden=false;
    notify(err.message);
  }
}
async function switchToRemote() {
  if (state.role === 'screen') {
    if(playerReady && ytPlayer) { try { ytPlayer.stopVideo(); } catch {} }
    try { await request('room/release','POST',{deviceId:DEVICE_ID}); } catch {}
  }
  state.role='remote';
  sessionStorage.setItem('kalaok-role','remote');
  setRoleUI();
  await pollRoom();
  notify('本裝置已切換為遙控器。');
}
async function refresh() {
  const params=new URLSearchParams({q:el('searchInput').value,genre:state.genre});
  const result=await request('songs?'+params);
  state.songs=result.songs;
  renderSongs();
}
async function signedIn() {
  switchPane(true);
  state.role='remote';
  state.lastRoomListSignature='';
  setRoleUI();
  await refresh();
  startRoomPolling();
  if (sessionStorage.getItem('kalaok-role')==='screen') await switchToScreen();
}
async function initialize() {
  try {
    const me=await request('me');
    state.user=me.user;
    await signedIn();
  } catch {
    state.user=null;
    switchPane(false);
  }
}
el('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=el('loginButton');
  button.disabled=true;
  try {
    const result=await request('login','POST',{
      username:el('username').value,password:el('password').value
    });
    state.user=result.user;
    el('password').value='';
    await signedIn();
    notify('登入成功。電視／電腦請設為播放螢幕；手機請選遙控器。');
  } catch(err) { notify(err.message); }
  finally { button.disabled=false; }
});
el('logoutButton').addEventListener('click',async()=>{
  if(state.role==='screen') {
    try {await request('room/release','POST',{deviceId:DEVICE_ID});}catch{}
    if(playerReady && ytPlayer){try{ytPlayer.stopVideo()}catch{}}
  }
  try{await request('logout','POST',{});}catch{}
  stopRoomPolling();
  state.user=null;
  state.room=null;
  state.role='remote';
  state.lastAppliedRevision=-1;
  state.lastRoomListSignature='';
  state.songs=[];state.queue=[];state.favorites=[];state.playingId=null;
  sessionStorage.setItem('kalaok-role','remote');
  el('password').value='';
  setRoleUI();
  switchPane(false);
});
el('screenModeButton').addEventListener('click',()=>switchToScreen());
el('takeoverButton').addEventListener('click',()=>switchToScreen(true));
el('remoteModeButton').addEventListener('click',switchToRemote);
el('genreFilters').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-genre]');
  if(!button)return;
  state.genre=button.dataset.genre;
  el('genreFilters').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));
  try{await refresh();}catch(err){notify(err.message);}
});
el('searchInput').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>refresh().catch(err=>notify(err.message)),260);
});
async function handleAction(event) {
  const button=event.target.closest('button[data-action]');
  if(!button || button.disabled)return;
  const songId=button.dataset.id,action=button.dataset.action;
  button.disabled=true;
  try {
    if(action==='play') {
      await sendRoomCommand('play',songId);
      notify(state.role==='screen'?'已向本機播放器送出播放指令。':'已傳送播放指令到同帳號播放螢幕。');
    } else if(action==='queue') {
      const result=await request('queue','POST',{songId});
      notify(result.duplicate?'這首歌已在共用待播清單。':'已加入共用待播清單。');
      await pollRoom();
    } else if(action==='favorite') {
      await request('favorites/toggle','POST',{songId});
      await pollRoom();
    } else if(action==='remove') {
      await request('queue/remove','POST',{songId});
      await pollRoom();
    }
  }catch(err){notify(err.message);}
  finally{button.disabled=false;}
}
el('songsList').addEventListener('click',handleAction);
el('queueList').addEventListener('click',handleAction);
el('favoriteList').addEventListener('click',handleAction);
el('playPauseButton').addEventListener('click',async()=>{
  if (!state.room?.songId) return;
  const command=state.room.action==='pause'?'resume':'pause';
  try {await sendRoomCommand(command);}
  catch(err){notify(err.message);}
});
el('previousButton').addEventListener('click',async()=>{
  try {await sendRoomCommand('previous');}
  catch(err){notify(err.message);}
});
el('nextButton').addEventListener('click',async()=>{
  try {await sendRoomCommand('next');}
  catch(err){notify(err.message);}
});
initialize();
