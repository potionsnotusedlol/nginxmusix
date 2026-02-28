# NginxMusix

Private Apple Music-like web player for self-hosted libraries.

## What is implemented

- SPA shell with hash routing and persistent top playback bar
- Sidebar with collapse toggle, search, and theme selector (`system`, `dark`, `light`)
- Responsive desktop/mobile layout
- Pages: Home, Songs, Playlists, Tags, Playlist detail, Tag-filter detail
- Search across title/artist/album/tags
- Multi-tag AND filtering
- Queue replacement playback behavior from playlists/tags/search results
- Playback state persistence (queue, track, position, play/pause, volume, repeat, shuffle)
- Node + Express API with SQLite storage
- Metadata ingest from `data/library.json` via `node server/rescan.js`
- Static media/covers endpoints with byte-range support
- Example deployment files for nginx/systemd (not auto-applied)

## Project layout

- `client/` frontend SPA
- `server/` API + DB layer + rescan command
- `data/` metadata and media storage
- `deploy/` nginx/systemd examples

## Local setup

1. Install Node.js LTS.
2. Install dependencies:
   - `npm install`
3. Build library database:
   - `npm run rescan`
4. Start API + frontend static host:
   - `npm start`
5. Open:
   - `http://localhost:3000`

## Music workflow

1. Add audio files to `data/music/`.
2. Update metadata in `data/library.json`.
3. Re-run:
   - `npm run rescan`

## Notes

- This repository currently includes one sample track file and cover.
- Actual nginx/systemd integration should be performed only after codebase validation in your target server environment.
