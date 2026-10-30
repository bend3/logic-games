# Adding a game

Checklist, using Sudoku as the example (its registry entry already exists with `comingSoon: true`).

1. **Create the module folder** `js/sudoku/`:
   - `logic.js` – pure rules/solver/generator, no DOM (testable with Node).
   - `sudoku.js` – exports `mount(root)` returning an unmount function (see the contract in [architecture.md](architecture.md#game-contract)).
   - Optional `worker.js` if generation can take more than ~50 ms on a phone.
2. **Register it** in `js/games.js`: remove `comingSoon`, set `tagline`, and add `load: () => import('./sudoku/sudoku.js')`.
3. **Persist** with `store` from `js/storage.js` under `sudoku:game` (include `solved`), `sudoku:settings`, `sudoku:stats`.
4. **Offline:** add every new file to `FILES` in `sw.js` and bump `VERSION`.
5. **Styles:** add a section to `css/style.css`, scoped under the game's root class (e.g. `.sudoku`). Reuse `.btn`, `.ctl`, `.sheet`, `.toggles`, `.switch`, `.overlay`, `.hint-box`.

## Patterns to reuse from Queens

Copy and adapt from `js/queens/queens.js` rather than abstracting early:

- **Help dialog** driven by a `HELP_OPTIONS` array + `PRESETS` (none/some/lots). Every assist feature must be toggleable – this is a core product requirement.
- **Derived assists** (like auto-cross) computed at render time instead of stored, so toggling is instant and reversible. For Sudoku: auto pencil marks, highlight same digits, highlight conflicts.
- **Undo history** as arrays of `[index, previousValue]` per user action.
- **Hint = explainable logical step** from a solver that returns `{ place, cross/remove, focus, message }`, plus a "mistake" hint when the board contradicts the solution.
- **Difficulty** = hardest rule level the logical solver needs; generator rejects puzzles without a unique solution or that need guessing.
- **Timer** paused on `visibilitychange`, saved with the game; best time only without hints.
- **New game dialog** (`.choice` button groups) and **win overlay**.
