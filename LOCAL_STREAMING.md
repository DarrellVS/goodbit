# Local network streaming

## The problem

Clips were reaching the browser the long way round. The app is served from a
public hostname behind Cloudflare, and every media URL in the client is relative
(`/api/clips/:id/stream`), so a request for a video made this trip:

```
browser -> ISP -> Cloudflare -> NAS (192.168.178.26) -> LAN -> PC (192.168.178.28)
```

and the bytes came all the way back. That happened even when the browser and the
PC were sitting on the same switch, because the hostname resolves to Cloudflare.
Thumbnails paid the same cost, once per clip in the grid.

## Why the obvious fix does not work

The tempting fix is to keep the page where it is and point media URLs at
`http://192.168.178.28:4000`. Browsers forbid it. An HTTPS page may not load
plain-HTTP subresources — that is mixed content, and Chrome blocks `fetch`,
`<img>` and `<video>` alike. Verified directly rather than assumed:

```
Mixed Content: The page at 'https://example.com/' was loaded over HTTPS, but
requested an insecure resource 'http://192.168.178.28:4000/api/health'.
```

The HTTPS page cannot even *probe* the LAN server to find out whether it is
reachable, so it cannot silently prefer it either. Private Network Access
restrictions on public→private requests apply on top.

That leaves exactly two ways out:

1. Put a browser-trusted TLS certificate on the LAN host, or
2. Do not serve the page over HTTPS in the first place.

Option 2 costs nothing and needs no domain, DNS record, or certificate, so that
is what is implemented. Option 1 is the follow-up, below.

## What was built

**The PC server now serves the client bundle.** It already had the API and the
media; giving it the UI too makes `http://192.168.178.28:4000` a complete origin.
Page, API, thumbnails and video are then all same-origin over HTTP on the LAN —
no mixed content to trip over, and nothing leaves the house.

- `server/src/utils/clientDist.ts` locates `client/dist` by walking up from the
  running module, so it works from both `tsx` (dev) and the compiled output.
  Override with `CLIENT_DIST`.
- `server/src/index.ts` static-serves it after the `/api` mount, with a SPA
  fallback that skips `/api/` so unknown endpoints still 404 instead of
  returning the app shell. Hashed assets get a one-year immutable cache;
  `index.html`, `sw.js` and `registerSW.js` get `no-cache` so new builds land.
- Startup logs the LAN URLs.

**Discovery.** `GET /api/local-info` (authenticated) reports the port, whether
the bundle is being served, and the LAN addresses found on the machine's
interfaces. `server/src/utils/networkInfo.ts` keeps only private IPv4 addresses
and ranks virtual adapters (WSL, Hyper-V, Docker, VPNs) last, since those hand
out private IPs nothing else on the LAN can reach.

**Switching.** `client/src/composables/useLocalMode.ts`:

- Detects whether the current origin is already private.
- Offers the LAN address via a banner in the shell (`LocalModeBanner.vue`) and a
  Settings → Network panel (`NetworkSettings.vue`).
- Switches with a **top-level navigation**, which is not subresource loading and
  so is permitted from an HTTPS page. The current path, query and hash are
  preserved across the hop.
- Carries the origin it came from in `?filmpjeFrom=`, so local mode knows how to
  offer a way back. `?filmpjeStay=1` marks a deliberate return to the internet
  connection so auto-switch does not immediately bounce back.
- Both params are consumed at startup and then stripped by a router guard.
  (They cannot be stripped with `replaceState` in `initLocalMode`: ES import
  hoisting evaluates `router.ts` — and with it `createWebHistory()` — before any
  statement in `main.ts` runs, so the router's first navigation would restore
  them. This was caught in testing.)

**Auto-switch is opt-in and off by default.** `preferLocalNetwork` in Settings →
Network. It is off because an automatic hop to a LAN address strands you on a
connection-error page when you are away from home. When enabled, the attempt
leaves a timestamped breadcrumb in `sessionStorage`; if you press Back, the app
sees the recent failed attempt, turns auto-switch off for that session and says
so. The breadcrumb is time-boxed to 60s, so a switch that actually worked is not
later mistaken for a failure.

## Using it

At home, open `http://192.168.178.28:4000` — bookmark it or install the PWA from
there. Or open the app as usual and click **Switch** in the banner. Settings →
Network shows which connection is in use and lists the detected addresses.

Away from home, use the public hostname as before. Nothing about the remote path
changed.

## Verified

Measured in Chrome on the local origin (`http://192.168.178.28:4000`):

| Check | Result |
|---|---|
| App shell, assets, SPA deep links | 200, no console errors |
| `/api/local-info` | reports `192.168.178.28:4000` on `Ethernet` |
| Thumbnail via `<img>` | 3440×1440 in 4 ms |
| Video via `<video>` | metadata 15 ms, played, `readyState: 4` |
| Range request, 2 MB | HTTP 206 in 5 ms |
| `/api/<unknown>` | 404, not the app shell |
| Existing API endpoints | health, games, tags, stats, collections all 200 |
| Handoff params | captured, stripped, unrelated params preserved |

The authenticated UI (banner and Settings → Network rendering) was not
exercised end to end, because signing in needs Firebase credentials that were
not available. The logic behind it is typechecked and its runtime behaviour was
verified directly through the checks above.

## Follow-up: making it automatic

To have the app prefer the LAN with no click and no risk when away, the LAN host
needs a browser-trusted certificate. The usual approach, and what Plex does:

1. Point a public DNS `A` record at the private address, e.g.
   `local.<yourdomain> -> 192.168.178.28`. Public DNS may hold private IPs.
2. Issue a certificate for that name with a **DNS-01** ACME challenge, so nothing
   needs to be exposed to the internet. The domain is already on Cloudflare, so
   this can be automated with a DNS-scoped API token (the token currently in
   `publisher/.env` is cache-purge scoped and not sufficient).
3. Terminate TLS on the PC server and serve on, say, `:4443`.

With that in place the HTTPS page can fetch `https://local.<yourdomain>:4443`
directly, which means it can *probe* first and switch only when the probe
succeeds — fully automatic, with a safe fallback to the internet path. It also
works from phones on the same wifi without installing anything.

This was not done here: it needs a domain decision and a DNS-scoped credential.
