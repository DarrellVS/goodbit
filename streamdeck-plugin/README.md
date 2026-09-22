# GoodBit for Stream Deck

Keys for the clip you just saved, without leaving the game.

| Key | What it does |
|---|---|
| **Tag the last clip** | Adds the tag you set on the key to the newest clip |
| **Publish the last clip** | Uploads it to your publisher. A tick means *started*: GoodBit's own card says when it is up |
| **Discard the last clip (hold)** | Sends it to the Recycle Bin, on a **long press only** |
| **Today's clips** | How many you saved today, and the total, refreshed every half minute |

**There is no key to save the replay**, on purpose. GoodBit has no way into OBS to press it, and
Elgato's own **OBS Studio** plugin already does exactly that key. Put it next to these.

## Setting it up

1. In GoodBit: **Settings, Connections, Stream Deck**, turn on *Let the Stream Deck reach this
   library*. Copy the address and the token.
2. Install the plugin (double-click `dist/io.github.darrellvs.goodbit.streamDeckPlugin`, or build
   it, below).
3. Drag a GoodBit key onto the Stream Deck, and paste the address and token into it. They are shared
   by every GoodBit key, so this is once.

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

The icons are **placeholders**: flat colour squares at the sizes Elgato requires, so the plugin
validates and installs. Real artwork is still to do.

## Where this lives, and why here

A subfolder of the GoodBit repository rather than a repository of its own, following `publisher/`,
which is already a second artefact with its own toolchain shipped from here. It is not built or
released by the app's own pipeline: `npm run build` at the root does not touch it, and it is versioned
separately in its `manifest.json`.
