# GalleryX

GalleryX is a fast, offline-first photo and video browser for large libraries stored on internal
and external drives. It indexes media in place (nothing is copied, moved, or re-encoded),
generates a local thumbnail cache, and keeps a SQLite database of everything it finds so
browsing, searching, and filtering stay fast even with hundreds of thousands of files.

## Features

- Recursive drive/folder scanning with live file-system watching (add/rename/delete/move), a
  fast stat-free counting pre-pass so newly added drives show a real, working progress bar
  (not a spinner or a guess) while indexing
- Responsive, virtualized masonry gallery for **Photos**, a separate **Videos** gallery, plus
  **Favorites**, **Recently Added**, and a configurable **Exports** smart collection
- **Timeline** view — chronological browsing grouped by year/month/day/shoot/camera/lens/folder/drive,
  with sticky headers, a jump-to-year rail, and automatic "shoot" clustering
- **Check for Duplicates** — exact-duplicate detection (staged size → partial hash → full hash),
  RAW+JPEG pairing, perceptual similar-image detection, burst grouping, and duplicate-video
  detection, all reviewed and confirmed by you before anything is deleted
- Safe deletion — every delete goes to the OS Trash/Recycle Bin by default, is logged to an audit
  table, and is refused outright for offline files or the last remaining copy in a group
- Full-screen photo viewer (zoom/pan) and a full-featured video player (scrubbing, volume,
  fullscreen, picture-in-picture, frame stepping, playback speed)
- External-drive offline protection — disconnected drives keep their indexed photos, cached
  thumbnails, favorites, and ratings visible (marked **Offline**), without deleting anything or
  disabling full-resolution access permanently
- RAW support (ARW, CR2, CR3, NEF, NRW, DNG, RAF, ORF, RW2, PEF, SRW, and more) via embedded
  preview extraction
- Dark, native-feeling UI on both macOS and Windows

## Getting started

```bash
npm install
npm run dev
```

`npm install` triggers `electron-builder install-app-deps`, which rebuilds native dependencies
(`better-sqlite3`, `sharp`) against the Electron runtime automatically.

### Building

```bash
npm run build       # typecheck + production build
npm run dist:mac     # packaged macOS app
npm run dist:win     # packaged Windows app
```

## Video support

Video metadata extraction, thumbnail generation, and format probing are powered by bundled
`ffmpeg`/`ffprobe` binaries (`ffmpeg-static` / `ffprobe-static`) rather than relying on the
operating system's own codec support. This keeps behavior consistent across macOS and Windows
and avoids requiring the user to install anything separately.

**Important limitation:** decoding an *unsupported* video codec for in-app playback is still
ultimately constrained by what Chromium's `<video>` element (Electron's rendering engine) can
decode on the current OS/build — bundling `ffprobe` lets GalleryX reliably *detect and describe*
a file's codec/container even when Chromium can't play it back, but it does not add a universal
software decoder for playback itself. When a video's codec is probed and found undecodable,
GalleryX still indexes the file (metadata, thumbnail-if-possible, search/sort/filter) and shows
an **"Unsupported Codec"** message in the viewer instead of crashing or silently failing.

**HEVC (H.265):** GalleryX indexes HEVC video, extracts its metadata, and generates real
thumbnails for it unconditionally — thumbnail extraction goes through the bundled `ffmpeg`
binary, which decodes HEVC in software regardless of platform. In-app *playback* attempts to use
Chromium's own HEVC decoder, which on recent Electron builds is hardware-accelerated on macOS and
Windows 10/11; there is no bundled software fallback for playback (only for thumbnails/metadata),
so on a machine/build without hardware HEVC decode, the player shows a clear "could not play this
video" message instead of a black screen — the file itself is never dropped from the library.

Video thumbnails are extracted via `ffmpeg` at a configurable position (10% into the clip,
middle, or first usable frame — configurable in Settings) and cached alongside photo thumbnails,
invalidated automatically when the source file's size or modification time changes.

## External drive identity & offline behavior

GalleryX tries to identify each drive by a stable, OS-reported identifier rather than only its
mount path/drive letter, so a drive that reconnects under a new Windows drive letter or a
slightly different macOS mount path is still recognized as the *same* drive:

- **macOS:** `diskutil info` is used to read the volume's UUID and label.
- **Windows:** a PowerShell `Get-Volume`/WMI query is used to read the volume's serial number and
  label.
- **Linux (dev/CI only — not a packaged target):** `findmnt` is used as a best-effort fallback.

**Fallback behavior:** if the platform probe is unavailable, denied by permissions, or the
command fails for any reason, GalleryX falls back to path-based matching (the previous behavior)
rather than failing to add the drive. Stable identity is a best-effort enhancement, not a hard
requirement — everything still works without it, just with slightly less certainty when a drive
reconnects under a different path.

When a drive is offline, its indexed photos/videos remain in the database and browsable via
cached thumbnails and metadata; full-resolution viewing, editing, and deletion are disabled for
those files until the drive is back online.

## Safe deletion (Trash / Recycle Bin)

Deleting a file (e.g. from the Duplicate Center) uses Electron's `shell.trashItem`, which maps to
the OS-native mechanism:

- **macOS:** moves the file to the Trash (undoable from Finder).
- **Windows:** moves the file to the Recycle Bin (undoable from Explorer).

**Fallback behavior:** if a given drive/filesystem doesn't support the Trash/Recycle Bin (some
network shares and certain external drives don't), the move is refused with a clear on-screen
error and the file is left completely untouched — GalleryX never silently falls back to a
permanent delete. Permanent deletion is available as an explicit, off-by-default advanced setting
that still requires the user to opt in per-deletion with an extra warning.

## Development

```bash
npm run typecheck     # TypeScript across main/preload/renderer + tests/scripts
npm test              # run the automated test suite (vitest)
npm run test:watch    # watch mode
```

`better-sqlite3` is a native module that must be built against Electron's Node ABI to run inside
the app, but against your local Node's ABI to run under plain Node (as `vitest`/`tsx` do). The
`test` and `gen:testlibrary` npm scripts handle this automatically via `pretest`/`posttest` hooks
(`npm rebuild` before, `electron-rebuild` after) — just use `npm test` / `npm run gen:testlibrary`
rather than invoking `vitest`/`tsx` directly, or you'll need to rebuild the native module by hand
in between.

### Generating a large synthetic test library

To test gallery/timeline/virtualization performance at scale (tens of thousands of photos and
videos) without needing real media files:

```bash
npm run gen:testlibrary -- --photos=100000 --videos=20000 --reset
```

This writes a standalone SQLite database (default: `.testdata/test-library.sqlite`) full of
realistic-but-synthetic metadata (dates spread across shoots, cameras/lenses, export folders,
favorites, ratings). Point GalleryX at it via **Settings → Database location** to browse it (back
up your real `galleryx.db` first if you want to switch back). Thumbnails will show as broken —
by design, since no real image bytes exist on disk — everything else (query speed, scrolling,
grouping, filters) behaves like a real library of that size.

## Architecture

- **Main process** (`src/main`) — Node.js: SQLite (`better-sqlite3`), thumbnail generation
  (`sharp`, worker threads), metadata extraction (`exifr`, bundled `ffprobe`), file-system
  watching (`chokidar`), settings persistence (`electron-store`), duplicate detection, safe
  deletion, drive identity.
- **Preload** (`src/preload`) — the only bridge between main and renderer; exposes a typed
  `window.gx` API over `contextIsolation`.
- **Renderer** (`src/renderer`) — React + TypeScript + Tailwind CSS, Zustand for state,
  TanStack Virtual for virtualized grids/lists.
- **Shared** (`src/shared`) — types and IPC channel contracts used by all three.

## Marketing website

A separate, animated marketing site lives in [`website/`](./website) (Vite + React + Tailwind +
Framer Motion). It's an independent project — see `website/README.md` for how to run and deploy
it — and isn't part of the Electron app build.
