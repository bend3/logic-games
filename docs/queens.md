# Queens

## Rules

An N×N board is divided into N colored regions. Place N crowns so that every row, every column and every color has exactly one crown, and no two crowns touch (including diagonally). Supported sizes: 5–10.

## Files

- `js/queens/logic.js` – pure engine (no DOM, runs in browser, worker and Node).
- `js/queens/worker.js` – generates a puzzle for a requested size/difficulty.
- `js/queens/queens.js` – UI and state, exports `mount(root)`.

## Engine (`logic.js`)

### Cell model

Cells are indexed `i = row * n + col`. A board's marks are an array of `EMPTY = 0`, `CROSS = 1`, `QUEEN = 2`.
`regions[i]` is the region (color) index `0..n-1`.

### `makeGeometry(n, regions)`

Precomputes everything the solver needs:

- `rows`, `cols`, `regs`: arrays of cell indexes per unit.
- `peers[i]`: every cell that a crown at `i` rules out (same row, column, region, plus the 8 neighbors).
- `units`: `{ kind: 'color' | 'row' | 'column', index, cells }` — all 3N units, colors first (hint messages read better).
- `coord.row/column/color(i)`: unit index of a cell for each kind.

### Helpers

- `findConflicts(geo, marks)` → `{ bad, zone }`: `bad` = crowns breaking a rule; `zone` = all cells of units containing 2+ crowns (rendered with red stripes).
- `isSolved(geo, marks)`: N crowns and no conflicts (puzzles have a unique solution, so this equals the stored solution).
- `blockedCells(geo, marks)`: union of `peers` of all placed crowns (used for auto-cross).
- `findOtherSolution(n, regions, cols)`: row-by-row backtracking; returns a solution (column per row) different from `cols`, or `null` if `cols` is the only one.

### Logical solver (hints + difficulty)

`findStep(geo, cells)` returns the next human-style deduction, or `null`. A step looks like:

```js
{ rule, level, place: [cellIdx], cross: [cellIdx], focus: [cellIdx], message }
```

`place`/`cross` are what to do; `focus` is the cells that explain *why* (dashed outline in the UI). Rules are tried in this order (cheapest/easiest first):

| Rule | Level | Logic |
| --- | --- | --- |
| `blocked` | 1 | A placed crown rules out its peers → cross them. |
| `single` | 1 | A unit without a crown has exactly one empty cell → crown. (No empty cell → `contradiction`.) |
| `confine` | 2 (k=1) / 3 (k≥2) | k units of one kind whose candidates all lie inside k units of another kind (color↔row, color↔column, row↔column) → cross the other cells of those k units. Covers "this color only fits in one row" and its multi-region generalization. |
| `lookahead` | 3 | A crown in cell c would remove all candidates of some other unit → cross c. |
| `trial` | 4 | Placing a crown in c and propagating rules 1–4 leads to a contradiction → cross c. Last resort. |

`{ rule: 'contradiction' }` means the given state is impossible (only happens with wrong marks).

`applyStep(cells, step)` mutates a marks array. `solveLogically(geo, start)` repeatedly applies steps and returns `{ solved, level }`, where `level` is the hardest rule needed; this is the puzzle's difficulty.

### Generator: `generatePuzzle(n, { balance = 2, minSize = 1, rng = Math.random })`

Loop until success:

1. Place a random valid solution (one crown per row/column, no touching) by randomized backtracking.
2. **Grow** N regions from the crowns: repeatedly pick a region with weight `bias / size^balance` and claim a random empty orthogonal neighbor. `balance > 0` makes small regions grow faster (even sizes); `balance < 0` lets big regions keep growing (tiny 1–2 cell regions, which make the puzzle easy because they immediately block a lot). Boards with a region smaller than `minSize` are rejected.
3. **Repair to uniqueness** (`makeUnique`): while `findOtherSolution` finds an alternative solution, move one of that alternative's crown cells (never an intended crown cell, never out of a region at `minSize`, and only if its region stays connected) into an orthogonally adjacent region. The alternative now has two crowns in one region and none in another, so it is no longer valid; the intended solution is unaffected. Moves from bigger into smaller regions are preferred. Gives up after 150 moves and restarts.
4. Reject unless `solveLogically` solves it (no guessing needed).

Returns `{ n, regions, solution: [cellIdx per row], level, attempts }`.

Don't go back to "grow random regions and reject until unique": with even region sizes almost no random board is unique, so it never finishes. The repair step is what makes balanced boards feasible.

### Difficulty: `DIFFICULTY` and `generateForDifficulty(n, difficulty, budgetMs = 3000)`

`DIFFICULTY` maps each difficulty to a target solver level and a list of generator options (cycled per attempt). `generateForDifficulty` generates until a puzzle's level (levels above 3 count as 3) matches the target or the budget runs out, then returns the closest one. Tune difficulty only here; the worker and the benchmark both use it.

Measured on a desktop with `node tools/bench-queens.mjs [runs]`:

| Difficulty | Options | Tiny regions (≤2 cells) | Smallest / largest region (10×10) | 10×10 time |
| --- | --- | --- | --- | --- |
| easy (level 1) | balance -1 | ~3–4 | 1 / ~45 | ~0.07 s |
| medium (level 2) | balance -0.5 or -1, minSize 2 | ~2–3 (size 2 only) | 2 / ~39 | ~1.6 s |
| hard (level 3+) | balance 2, minSize 3 | 0 | ~3 / ~16 | ~2.5 s |

A single `generatePuzzle` call can overrun the budget, so hard 10×10 may take a few seconds on a phone; background pre-generation usually hides this.

## Worker (`worker.js`)

Message in: `{ n, difficulty: 'easy' | 'medium' | 'hard' }`; posts back `generateForDifficulty(n, difficulty)`. Created with `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })` via `runWorker()` in `queens.js`; each worker handles one puzzle and is terminated afterwards.

## Next puzzle and pre-generation

- The win overlay's **Next puzzle** button (`data-act="next"`) starts a new game immediately with the finished game's `n` and `difficulty` (fallback: `settings`). The **New** button in the controls opens the size/difficulty dialog instead.
- After every puzzle loads (and on mount with a saved game), `startPrefetch(n, difficulty)` generates the following puzzle in a background worker and stores it in `queens:next` with key `"<n>:<difficulty>"`. Storing it means a reload, or playing offline, still has a puzzle ready.
- `newGame(n, difficulty)` takes the stored puzzle if the key matches (no spinner). Otherwise it uses the prefetch still running for that key, or starts a new worker, and shows the spinner while it waits.
- There is only one slot. Choosing a different size/difficulty starts a prefetch for the new key and replaces the slot when it finishes.
- `genToken` discards results of superseded `newGame` calls. `job` (foreground) and `prefetch` (background) workers are terminated on unmount.

## UI (`queens.js`)

### State inside `mount`

- `settings` – merged `DEFAULT_SETTINGS` + `queens:settings`.
- `game` – the saved game (below); `geo` – geometry for it.
- `cellEls` – one `div.cell` per cell (built once per puzzle in `setupBoard`).
- `hint` – currently shown hint step (cleared on every move).
- `drag` – active pointer gesture.

### Saved game shape

```js
{
  n, regions, solution, level,   // puzzle (level = actual solver level, shown in the status bar)
  difficulty,                    // requested 'easy' | 'medium' | 'hard' (reused by Next puzzle; may be missing in old saves)
  marks: number[],               // player's own marks only (EMPTY/CROSS/QUEEN)
  history: [[ [i, prevValue], ... ], ...],  // undo stack; one entry per user action, max 500
  elapsed: ms, hintsUsed, solved
}
```

Saved after every action, when the tab is hidden (`visibilitychange`/`pagehide`) and on unmount.

### Derived vs stored marks

Auto-crosses are **never stored**. `effectiveMarks()` returns the player's marks plus auto-crosses (when `autoX` is on) and the set of auto cells (rendered faded). Removing a crown therefore removes its auto-crosses automatically, and toggling the setting is instant.

### Input

- Tap: cycles the *effective* value `EMPTY → CROSS → QUEEN → EMPTY` (so tapping an auto-crossed cell goes straight to crown).
- Drag (pointer events with `setPointerCapture` on the board, `touch-action: none`): once the pointer enters a second cell, the gesture becomes `cross` (marks empty cells) or `erase` (if it started on a player cross, clears crosses). The whole drag is one undo entry.
- All changes go through `setMark(i, value, changes)` and are committed with `commit(changes)` → history, `afterMove()` (clears hint, checks win, renders, saves).

### Help options

Toggled in the "How much help?" dialog; presets `none` / `some` (default) / `lots` set everything except `timer`.

| Setting | Effect |
| --- | --- |
| `autoX` | Show auto-crosses for cells blocked by crowns. |
| `autoQueen` | After a crown is placed (or the setting is turned on), repeatedly place a crown in any unit with exactly one open cell — only if it matches the solution and there are no conflicts. These changes join the same undo entry. |
| `showConflicts` | Red crowns + striped units for rule breaks. |
| `showMistakes` | Red outline on crowns/crosses that differ from the solution. |
| `hints` | Shows the Hint button. |
| `timer` | Shows the clock (time is always tracked). |

### Hints

1. If any mark contradicts the solution, the hint says so and "Do it" removes those marks.
2. Otherwise `findStep` runs on the effective marks; the message is shown, `place`/`cross` cells pulse, `focus` cells get a dashed outline, and "Do it" applies the step.

Each shown hint increments `hintsUsed`. Best times in `queens:stats` are recorded only for games with zero hints.

### Timer

`elapsed` accumulates via a 1 s interval while the tab is visible and the game is unsolved; it pauses on `visibilitychange` and is flushed before saving.

### Look

LinkedIn-inspired palette in `COLORS` (10 entries, index = region). Region walls are drawn with `.wall-r` / `.wall-b` classes (thick right/bottom border when the neighbor is a different region) plus a thick board border. Crown and X are inline SVG.

## Ideas not yet built

- Keyboard controls / focus navigation on the board.
- Tap-order setting (crown first vs cross first).
- Daily seeded puzzle (pass a seeded `rng` to `generatePuzzle`).
