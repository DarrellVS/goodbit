Filmpje
========

Local Vue + Node app to preview and manage game clips stored by game folder.

Prerequisites
-------------
- Node.js 18+
- Windows 10/11

Folder layout
-------------
- Server (API + SQLite via TypeORM): `server/`
- Client (Vue 3 + Vite): `client/`

Your clips are expected at:
```
C:\Users\darre\Videos\<GameName>\*.mp4|*.mov
```
The top-level folder name is treated as the game name.

Quick start
-----------
Open two terminals.

Terminal A (API):
```
cd server
npm i
npm run dev
```
The API listens on `http://localhost:4000`.

Terminal B (Web UI):
```
cd client
npm i
npm run dev
```
Open `http://localhost:5173` in your browser.

On first server start, a scan runs automatically. Use the “Rescan” button in the UI to pick up new/removed files.

Features
--------
- Sidebar game filter (counts per game)
- Search by custom name and filename
- Inline rename (stored in DB; files are never renamed)
- Preview with seeking (HTTP Range streaming for MP4/MOV)
- Delete -> moves to Windows Recycle Bin, and removes DB entry

Configuration
-------------
Environment variables (optional):
- `VIDEOS_ROOT` (default `C:\Users\darre\Videos`) – where clips live
- `DB_PATH` (default `VIDEOS_ROOT\\filmpje.db`) – SQLite database location
- `PORT` (default `4000`) – API port

For PowerShell, you can set variables like:
```
$env:VIDEOS_ROOT = "C:\\Users\\darre\\Videos"
$env:PORT = "4001"
```

Notes
-----
- Only `*.mp4` and `*.mov` files one level under each game folder are indexed.
- No authentication.
- Thumbnails are not generated to keep setup simple.

Troubleshooting
---------------
- If videos fail to play, ensure they are H.264/AAC in MP4 or MOV (Chrome-compatible).
- If the app shows zero games, click “Rescan” after adding clips.
- Delete uses the Recycle Bin via `trash` package.


