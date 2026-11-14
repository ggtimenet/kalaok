# KalaOK — Media availability and two-screen functional test

The original 8 YouTube karaoke video IDs in the demonstration catalogue **have not been confirmed to permit embedding**. YouTube error `150` (equivalent to `101`) means an uploader or rights-holder forbids playback in embedded players. The website cannot override this setting. A `watch` URL or a successful oEmbed metadata response is not enough to prove embedding works.

## New user-facing behavior
- The catalogue marks YouTube videos as **嵌入權限未驗證**.
- On embedded YouTube errors 101/150, the display and remote both show a clear reason. The user can open the original YouTube link or search for another karaoke version from the same artist. The site does **not** try to bypass embedding restrictions, copy streams, or fetch unauthorized media.
- All testers can choose **▶ 播放 10 秒原創測試影片（驗證遙控功能）**. This is a locally generated H.264/AAC MP4 (generated with FFmpeg from its built-in color/test graphics and synthetic tone; no third-party music/video content). It is **not a karaoke song**.
- On the TV/desktop, the tester might need to press **📺 在此啟動播放** once, due to browser audio autoplay policies.
- Once the local video plays, the phone can pause, resume, and switch queue items; the player sends actual HTML5 `playing`, `pause`, `ended` and `error` events to the account room. This distinguishes real playback from merely sending a command.

## Technical notes
- The new diagnostic media route is `GET /media/sync-test.mp4`, with HTTP range support for browsers.
- The Node.js container uses the existing Dockerfile; `web/media/sync-test.mp4` is copied into the container with the rest of `web/`.
- YouTube IFrame API and the HTML5 video element are both supported. Remote-control screens instantiate neither external YouTube playback nor local media playback.
- Status `error` for blocked videos is per account/current playback, not an unverified global blacklist.

## Verified on 2026-11-14
Two independent Chromium user profiles on isolated test container, same demo account:
1. Device A becomes display; device B becomes remote.
2. Device B sends play, pause, resume, next, previous; A receives actions.
3. B selects `s09` (local diagnostic video) and A switches to `/media/sync-test.mp4`.
4. A makes a trusted, real mouse click on the local playback control; the video reaches `readyState >= 2` and `paused === false`, with `display.status=playing`.
5. B sends pause; A's HTMLVideoElement becomes paused. B resumes; video becomes unpaused and status returns to playing.
6. The original 8 YouTube video sources were **not** proven playable in actual user browsers; their embedding restrictions must be checked individually or replaced with approved sources.

See [YouTube IFrame Player API error codes](https://developers.google.com/youtube/iframe_api_reference#onError) and [YouTube Data API status.embeddable](https://developers.google.com/youtube/v3/docs/videos#status.embeddable). Even an `embeddable=true` value may be overridden by Content ID or regional policies.
