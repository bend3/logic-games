# Logic Games – project guide

Start here. This folder explains the repo for anyone (human or AI agent) picking it up.

| Doc | Read it when |
| --- | --- |
| [architecture.md](architecture.md) | You need to understand the shell, routing, storage, offline support or the game contract. |
| [queens.md](queens.md) | You are changing the Queens game (rules engine, generator, hints, UI, help options). |
| [adding-a-game.md](adding-a-game.md) | You are adding a new game (e.g. Sudoku). |
| [deployment.md](deployment.md) | You are running it locally, publishing, or debugging stale/offline behavior. |

## What this is

A collection of logic puzzles hosted for free on GitHub Pages and installable as a PWA, so it works offline on a phone.
Goals set by the owner:

- **Unlimited puzzles** – generated on the device, not one per day.
- **Pause and resume at any time** – every move is saved automatically.
- **Player controls the amount of help** – each assist feature can be toggled per game.
- **Room for more games** – games plug into a small registry. Queens is done; Sudoku is listed as "coming soon".
- **Queens should look and feel like LinkedIn's Queens.**

## Tech choices (and why)

- **Vanilla HTML/CSS/JS with ES modules, no build step, no dependencies.** GitHub Pages serves the repo as-is; nothing to install or compile.
- **Relative URLs everywhere.** The site is served from `https://<user>.github.io/<repo>/`, not the domain root. Never use paths starting with `/`.
- **`localStorage`** for saves and settings (small JSON, synchronous, works offline).
- **Service worker with a versioned precache** for offline use.
- **Web Worker** for puzzle generation so large boards don't freeze the UI.

## Repository layout

```
index.html               App shell: top bar + <main id="app">. Loads js/app.js.
manifest.webmanifest     PWA manifest (name, colors, icons, standalone display).
sw.js                    Service worker: precache list + VERSION. Must list every runtime file.
css/style.css            All styles (shell, home, shared buttons/dialogs, Queens board).
icons/                   icon.svg (source design) + icon-192.png / icon-512.png (generated).
js/app.js                Hash router, home screen, service worker registration.
js/games.js              Game registry (id, name, tagline, icon SVG, lazy loader, comingSoon).
js/storage.js            localStorage wrapper with "logic-games:" key prefix.
js/queens/logic.js       Pure Queens engine: geometry, conflicts, logical solver, generator. No DOM.
js/queens/worker.js      Module Web Worker that runs the generator against a difficulty target.
js/queens/queens.js      Queens UI: board, input, help settings, hints, timer, dialogs, persistence.
tools/make-icons.py      Dependency-free script that renders the PNG icons.
tools/bench-queens.mjs   Node benchmark for the Queens generator (speed, difficulty, region sizes).
docs/                    This documentation (not used at runtime, not precached).
```

## Conventions

- Keep modules small and framework-free; DOM built with template strings + `querySelector`.
- Game logic that can be pure lives in a separate DOM-free module (e.g. `logic.js`) so it can be run/tested with Node: `node -e "import('./js/queens/logic.js').then(m => console.log(m.generatePuzzle(8)))"`.
- UI text is plain English; no emojis in the UI (icons are inline SVG).
- Styling uses CSS custom properties in `:root` with a `prefers-color-scheme: dark` override. Puzzle colors stay fixed pastel in both themes.
- Bump `VERSION` in `sw.js` on every deploy that changes a runtime file; otherwise installed apps keep serving the old cached files.
- When adding/renaming any runtime file, also update `FILES` in `sw.js`.
