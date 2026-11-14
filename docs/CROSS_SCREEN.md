# Same-account two-screen control (preview)

The KalaOK preview at https://kalaok.ggtime.net/ supports one **display screen** (TV or desktop browser) and one or more **remote-control screens** (mobile or other browser) logged into the **same demo account**.

## How to test
1. On the TV/desktop browser, sign in with a demo account, click **📺 設為播放螢幕**.
2. On a phone, sign in with **the exact same account**, click **📱 設為遙控器**.
3. The phone shows **播放螢幕在線**. Tap any song's **▶ 播放** to request playback on the TV.
4. On the phone, use **暫停／繼續、上一首、下一首**. The TV and phone should update the selected song and status within approximately 1–2 seconds.
5. You can add songs to the shared queue from either screen. All three existing demo accounts remain isolated from each other.
6. To change TVs, use **接管播放螢幕**. Only one TV can be the designated player at once; the previous TV stops receiving commands.

## How it works
- Existing signed HttpOnly account cookie authenticates each device independently.
- Server holds account-scoped `room` state: increasing command `revision`, `songId`, `action` (play/pause/resume/previous/next/stop), last update and active display lease.
- Endpoints (all authentication required): `GET /api/room`; `POST /api/room/display` to register/take over; `POST /api/room/heartbeat`; `POST /api/room/release`; `POST /api/room/command`; `POST /api/room/ack`.
- The mobile remote **does not instantiate the YouTube player**. The display polls every 1.4 seconds, executes each command revision using YouTube's official IFrame API, and reports actual API events or playback failure to the server.
- `room.display.status` differentiates *requested* from *playing*, *paused*, *buffering*, *blocked* and *error*. A successful command request does **not** prove audio or video started.
- Room state persists separately as `/data/rooms.json`. The existing `/data/state.json` queues/favorites and account credentials remain untouched by the migration.

## Real restrictions and safety
- YouTube embedding may be forbidden by the uploader or restricted in the test browser, region or environment (e.g. IFrame error 150). In that case the user may open the original YouTube page; there is no attempt to bypass embed or rights restrictions.
- Remote commands often cannot initiate autoplay until a user interacts with the playback screen. Use the TV's play button once if prompted.
- This is a demonstration with a single Node.js server and per-account JSON state, not a production multi-instance realtime service. It uses periodic polling, not WebSocket, casting or screen mirroring.
- These videos belong to their rightsholders; the preview never downloads/hosts them, and does not claim commercial karaoke licensing.

## Test evidence (2026-11-14)
- API: two independently authenticated sessions for the same account; separate account isolation; display ownership conflict; takeover and old-owner rejection; play, pause, resume, previous and next; acknowledgement and stale-ack validation.
- Browser: two **separate headless Chromium profiles** logged in with the same demo account; one switched to display, one remained remote; remote commands propagated to the display; YouTube iframe was created only on display; no page JavaScript exceptions.
- Full YouTube audiovisual playback remains unverified because the headless test environment had previously produced YouTube IFrame error 150, including on the official sample video.
