# GoodBit for Stream Deck

Keys for the clip you just saved, without leaving the game.

| Key | What it does |
|---|---|
| **Save the replay** | Presses the key OBS already has for Save Replay, and ticks only once the clip has landed |
| **Tag the last clip** | Adds the tag you set on the key to the newest clip |
| **Publish the last clip** | Uploads it to your publisher. A tick means *started*: GoodBit's own card says when it is up |
| **Discard the last clip (hold)** | Sends it to the Recycle Bin, on a **long press only** |
| **Today's clips** | How many you saved today, and the total, refreshed every half minute |

**Saving the replay changes nothing in OBS.** GoodBit presses the hotkey OBS already listens for
(F8 unless you bound another), the same as your keyboard would, so there is no websocket to switch on
and nothing listening on the network. The key goes to whatever is in front, which is the game, just
as your own key press does. It ticks only when a new recording actually appears; otherwise the key
says why: *OBS off*, *No key in OBS*, *Key not supported* (a mouse button), or *Buffer off?*.

## Setting it up

1. In GoodBit: **Settings, Connections, Stream Deck**, turn on *Let the Stream Deck reach this
   library*, then press **Install the plugin**. The Stream Deck app asks; say yes.
2. Drag GoodBit keys onto the Stream Deck. GoodBit writes the address and the token into the plugin's
   own folder (`connection.json`), so there is nothing to paste. Anything you do paste into a key's
   settings wins over that file.

## Discard, and why it is careful

A key pressed mid-game by somebody not looking at a screen has no room for a confirmation, so:

- It is **off in GoodBit** until you switch on *Let a key throw away the last clip*.
- The key has to be **held**. A tap says "Hold" and does nothing.
- GoodBit **keeps any clip you have named, tagged, starred, marked, written a note on or published**,
  and the key says "Kept". The file goes to the Recycle Bin and can be fetched back, but the name,
  tags, notes and marks cannot, and at that point somebody already decided the clip was worth
  keeping.

## What the token is, and is not

GoodBit listens on `127.0.0.1` only, so nothing off this computer can reach it, and it refuses any
request that comes from a web page. The token stops web pages and other machines. It lives in this
plugin's settings, so **anything already running as you can read it**: that is the honest limit of
what a desktop app can promise, and the same as the Claude connection beside it.

## Building

```bash
npm install
npm run check                  # typecheck and build
npx streamdeck validate io.github.darrellvs.goodbit.sdPlugin
npx streamdeck pack io.github.darrellvs.goodbit.sdPlugin --output dist --force
```

Needs Stream Deck 7.1 or newer, which runs the plugin on its own bundled Node 24.

The icons are [Phosphor](https://phosphoricons.com/) (MIT), bold weight, rendered to the sizes
Elgato requires by `node scripts/render-icons.mjs`: key images on GoodBit's dark ground, list icons
as a single light glyph on transparent, and the plugin icon is GoodBit's own app icon.

## Where this lives, and why here

A subfolder of the GoodBit repository rather than a repository of its own, following `publisher/`,
which is already a second artefact with its own toolchain shipped from here. It is not built or
released by the app's own pipeline: `npm run build` at the root does not touch it, and it is versioned
separately in its `manifest.json`.
