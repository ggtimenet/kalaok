# YouTube KTV test catalogue replacement · 2026-11-14

The first eight YouTube karaoke entries were replaced with video IDs actually indexed to an independently identifiable creator channel, **Lugn Karaoke**. These are traditional seasonal songs chosen as a lower-risk *test catalogue*, not a commercially licensed professional KTV library.

| Internal ID | Song | YouTube video ID | Official channel |
|---|---|---|---|
| s01 | Jingle Bells | 8EJ5JRbu47Y | Lugn |
| s02 | We Wish You a Merry Christmas | XcJYhPggqiA | Lugn |
| s03 | O Christmas Tree | QlODif5yHvU | Lugn |
| s04 | Deck the Halls | zr7xRpVVS3c | Lugn |
| s05 | The Twelve Days of Christmas | uLmfvnj-b3k | Lugn |
| s06 | Silent Night | hSfi3By69vo | Lugn |
| s07 | Joy to the World | rNa8Q2EqImY | Lugn |
| s08 | O Tannenbaum | NCQlvcoXY_Q | Lugn |

The original locally produced 10-second MP4 and Google for Developers IFrame sample remain unchanged as s09/s10.

## Evidence and limits

- Verified matching video **titles, authors and IDs** from public search listings. Lugn also describes the channel and its instrumentals on https://www.lugn.ch/en. Some individual uploads credit the YouTube Audio Library for the *instrumental recording*.
- **Not verified:** `status.embeddable` from the official YouTube Data API, playback on the user's real devices, region restrictions, Content ID policies, and rights for commercial karaoke use. The `embedStatus` for s01–s08 intentionally remains `unverified`.
- YouTube may still return errors 101/150 (uploader disallows embedding). The website does not circumvent the restriction; it offers an original YouTube link and an independent safe local playback test.
- No copyrighted video/audio is downloaded, cached, proxied or re-hosted.

Google documents `status.embeddable`, and notes that even when true, third-party claims may block playback: https://developers.google.com/youtube/data/reference/rest/v3/videos#status.embeddable . The IFrame player reports 101/150 for embedding restrictions: https://developers.google.com/youtube/iframe_api_reference#onError .

## Testing

The isolated Docker test returned 10 song entries. Two independent Chrome browser profiles successfully signed into the same test account, selected Jingle Bells from the remote, instantiated its YouTube iframe on the display screen only, and synchronized play/pause/resume/next/previous without JavaScript exceptions.

This browser test checks the remote-control workflow and the embed iframe **only**, not actual YouTube streaming permission. The user must try playback from a normal local browser to confirm whether each video is usable.

The existing account-specific queue and favorite IDs were preserved; the displayed song names now map to the updated demo catalogue.
