# Local network streaming

## The problem

Clips were reaching the browser the long way round. The app is served from a
public hostname behind Cloudflare, and every media URL in the client was
relative (`/api/clips/:id/stream`), so a request for a video made this trip:

```
browser -> ISP -> Cloudflare -> NAS (192.168.178.26) -> LAN -> PC (192.168.178.28)
```

and the bytes came all the way back. That happened even when the browser and the
PC were sitting on the same switch, because the hostname resolves to Cloudflare.
Thumbnails paid the same cost, once per clip in the grid.

## What actually constrains this

The obvious fix is to point media URLs at `http://192.168.178.28:4000` while the
page stays on HTTPS. The usual objection is mixed content: browsers block
plain-HTTP subresources on an HTTPS page.

Measured in the browser this project actually runs in, that objection does not
hold for private-network addresses. From `https://filmpje.darrellvs.nl`, all of
these succeeded against `http://192.168.178.28:4000`:

| Method | Result |
|---|---|
| `fetch('/api/health')` | 200 |
| `<img>` thumbnail | loaded, 3440px wide |
| `<video>` stream | metadata loaded, duration 27.03s |

The same held from an unrelated origin (`https://example.com`), so this is not a
per-site "allow insecure content" override. Chrome permits requests to
private-network and loopback addresses. A console warning about mixed content is
still logged — that warning is what initially led to the wrong conclusion here,
and it is *not* the same thing as the request being blocked.

Browsers that do block it are handled by construction: the reachability probe
below fails, and the app falls back to the internet path.

## What was built

**Media URLs are pointed at the LAN address when it answers.** The page can stay
exactly where it is — no origin switching, no certificates, no DNS changes.

- `server/src/utils/networkInfo.ts` enumerates private IPv4 addresses on the
  machine's interfaces, ranking virtual adapters (WSL, Hyper-V, Docker, VPNs)
  last since other devices cannot reach those.
- `GET /api/local-info` (authenticated) advertises them.
- `client/src/composables/useLocalMode.ts` fetches that list on shell mount and
  probes each candidate's `/api/health` with a 1.5s timeout. The first to answer
  becomes `mediaBase`; if none do, `mediaBase` stays empty and media loads
  relative to the page as before.
- `client/src/utils/mediaUrl.ts` is the single place media URLs are built, so
  every thumbnail, stream and frame strip picks up the base. `TrimPage.vue` and
  `ClipVideoPlayer.vue` used to build URLs inline and now go through it too.

`mediaBase` is deliberately **not** persisted. A remembered LAN address would be
wrong the moment the same browser opens the app from somewhere else and would
point media at an unreachable host. Probing costs a few milliseconds on the LAN
and the result is reused for the tab's lifetime.

Settings → Network shows which origin clips are streaming from, lists the
detected addresses, and has a toggle (`preferLocalNetwork`, on by default). It
is safe on by default because it falls back on its own when the PC is not
reachable — there is nothing to strand you when away from home.

**The server also serves the client bundle.** `http://192.168.178.28:4000` is
therefore a complete app on its own, useful when the internet is down. This is
independent of the media routing above, which works from any origin.

## Verified

On the local origin (`http://192.168.178.28:4000`):

| Check | Result |
|---|---|
| App shell, assets, SPA deep links | 200, no console errors |
| `/api/local-info` | reports `192.168.178.28:4000` on `Ethernet` |
| Thumbnail via `<img>` | 3440×1440 in 4 ms |
| Video via `<video>` | metadata 15 ms, played, `readyState: 4` |
| Range request, 2 MB | HTTP 206 in 5 ms |
| `/api/<unknown>` | 404, not the app shell |
| Existing API endpoints | health, games, tags, stats, collections all 200 |

Cross-origin media loading from `https://filmpje.darrellvs.nl` was verified as
in the table further up.

End-to-end confirmation of the automatic switch on the public hostname is
pending a deploy — `filmpje.darrellvs.nl` is served by the `darrellvs/filmpje`
image on the NAS, so it needs `client/docker-compose.bat` to be run before the
new bundle is live there.
