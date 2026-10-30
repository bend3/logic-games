// Pure Queens logic (no DOM): geometry, logical solver (hints + validation) and generator.
export const EMPTY = 0;
export const CROSS = 1;
export const QUEEN = 2;

export function makeGeometry(n, regions) {
  const rows = [], cols = [], regs = [];
  for (let k = 0; k < n; k++) { rows.push([]); cols.push([]); regs.push([]); }
  for (let i = 0; i < n * n; i++) {
    rows[(i / n) | 0].push(i);
    cols[i % n].push(i);
    regs[regions[i]].push(i);
  }
  const peers = [];
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n;
    const set = new Set([...rows[r], ...cols[c], ...regs[regions[i]]]);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) set.add(rr * n + cc);
      }
    }
    set.delete(i);
    peers.push([...set]);
  }
  const units = [
    ...regs.map((cells, index) => ({ kind: 'color', index, cells })),
    ...rows.map((cells, index) => ({ kind: 'row', index, cells })),
    ...cols.map((cells, index) => ({ kind: 'column', index, cells })),
  ];
  const coord = {
    row: (i) => (i / n) | 0,
    column: (i) => i % n,
    color: (i) => regions[i],
  };
  return { n, regions, rows, cols, regs, peers, units, coord };
}

export function findConflicts(geo, marks) {
  const bad = new Set(), zone = new Set();
  for (const u of geo.units) {
    const q = u.cells.filter((i) => marks[i] === QUEEN);
    if (q.length > 1) {
      q.forEach((i) => bad.add(i));
      u.cells.forEach((i) => zone.add(i));
    }
  }
  const n = geo.n;
  for (let i = 0; i < n * n; i++) {
    if (marks[i] !== QUEEN) continue;
    const r = (i / n) | 0, c = i % n;
    for (const [dr, dc] of [[1, -1], [1, 0], [1, 1], [0, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < n && cc >= 0 && cc < n && marks[rr * n + cc] === QUEEN) {
        bad.add(i);
        bad.add(rr * n + cc);
      }
    }
  }
  return { bad, zone };
}

export function isSolved(geo, marks) {
  let queens = 0;
  for (const m of marks) if (m === QUEEN) queens++;
  return queens === geo.n && findConflicts(geo, marks).bad.size === 0;
}

// Cells that can't hold a queen because of the queens already placed.
export function blockedCells(geo, marks) {
  const set = new Set();
  marks.forEach((m, i) => { if (m === QUEEN) geo.peers[i].forEach((j) => set.add(j)); });
  return set;
}

// Returns a solution (column per row) that differs from `cols`, or null if `cols` is the only one.
export function findOtherSolution(n, regions, cols) {
  const colUsed = new Array(n).fill(false);
  const regUsed = new Array(n).fill(false);
  const pos = new Array(n);
  const place = (r) => {
    if (r === n) return pos.some((c, i) => c !== cols[i]);
    for (let c = 0; c < n; c++) {
      const reg = regions[r * n + c];
      if (colUsed[c] || regUsed[reg] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
      colUsed[c] = regUsed[reg] = true;
      pos[r] = c;
      if (place(r + 1)) return true;
      colUsed[c] = regUsed[reg] = false;
    }
    return false;
  };
  return place(0) ? pos : null;
}

// ---------- Logical solver ----------
// Each step: { rule, level, place: [], cross: [], focus: [], message }
// level: 1 = basic, 2 = simple pattern, 3 = advanced pattern, 4 = trial

const plural = (kind, k) => (k === 1 ? kind : `${kind}s`);

function unitStatus(u, cells) {
  let q = 0;
  const cand = [];
  for (const i of u.cells) {
    if (cells[i] === QUEEN) q++;
    else if (cells[i] === EMPTY) cand.push(i);
  }
  return { q, cand };
}

function blockedStep(geo, cells) {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== QUEEN) continue;
    const cross = geo.peers[i].filter((j) => cells[j] === EMPTY);
    if (cross.length) {
      return {
        rule: 'blocked', level: 1, place: [], cross, focus: [i],
        message: 'A crown blocks its row, column and color, and all cells touching it. Cross those out.',
      };
    }
  }
  return null;
}

function singleStep(geo, cells) {
  for (const u of geo.units) {
    const { q, cand } = unitStatus(u, cells);
    if (q > 0) continue;
    if (cand.length === 0) return { rule: 'contradiction' };
    if (cand.length === 1) {
      return {
        rule: 'single', level: 1, place: cand, cross: [], focus: u.cells,
        message: `Only one cell is left in this ${u.kind}, so it must hold the crown.`,
      };
    }
  }
  return null;
}

const subsetCache = new Map();
function subsetsBySize(m) {
  if (!subsetCache.has(m)) {
    const bySize = Array.from({ length: m + 1 }, () => []);
    for (let mask = 1; mask < 1 << m; mask++) bySize[popcount(mask)].push(mask);
    subsetCache.set(m, bySize);
  }
  return subsetCache.get(m);
}
function popcount(x) {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

const CONFINE_PAIRS = [
  ['color', 'row'], ['color', 'column'],
  ['row', 'color'], ['column', 'color'],
  ['row', 'column'], ['column', 'row'],
];

// k units of one kind whose candidates fit inside k units of another kind
function confineStep(geo, cells) {
  const prepared = CONFINE_PAIRS.map(([a, b]) => {
    const open = [];
    for (const u of geo.units) {
      if (u.kind !== a) continue;
      const { q, cand } = unitStatus(u, cells);
      if (q > 0) continue;
      let mask = 0;
      for (const i of cand) mask |= 1 << geo.coord[b](i);
      open.push({ u, cand, mask });
    }
    return { a, b, open };
  });
  const maxK = Math.max(...prepared.map((p) => p.open.length));
  for (let k = 1; k < maxK; k++) {
    for (const { a, b, open } of prepared) {
      if (k >= open.length) continue;
      for (const sub of subsetsBySize(open.length)[k]) {
        let union = 0;
        for (let t = 0; t < open.length; t++) if (sub & (1 << t)) union |= open[t].mask;
        const size = popcount(union);
        if (size < k) return { rule: 'contradiction' };
        if (size > k) continue;
        const cross = [];
        const focus = [];
        for (let t = 0; t < open.length; t++) {
          const inside = sub & (1 << t);
          for (const i of open[t].cand) {
            if (inside) focus.push(i);
            else if (union & (1 << geo.coord[b](i))) cross.push(i);
          }
        }
        if (!cross.length) continue;
        const message = k === 1
          ? `This ${a} only fits in one ${b}, so the rest of that ${b} can be crossed out.`
          : `These ${k} ${plural(a, k)} only fit in ${k} ${plural(b, k)}, so the other cells in those ${plural(b, k)} can be crossed out.`;
        return { rule: 'confine', level: k === 1 ? 2 : 3, place: [], cross, focus, message };
      }
    }
  }
  return null;
}

function lookaheadStep(geo, cells) {
  const blocked = new Uint8Array(cells.length);
  for (let c = 0; c < cells.length; c++) {
    if (cells[c] !== EMPTY) continue;
    blocked.fill(0);
    blocked[c] = 1;
    for (const j of geo.peers[c]) blocked[j] = 1;
    for (const u of geo.units) {
      if (u.cells.includes(c)) continue;
      const { q, cand } = unitStatus(u, cells);
      if (q > 0) continue;
      if (cand.every((j) => blocked[j])) {
        return {
          rule: 'lookahead', level: 3, place: [], cross: [c], focus: [c, ...cand],
          message: `A crown in the marked cell would leave no room for a crown in the highlighted ${u.kind}.`,
        };
      }
    }
  }
  return null;
}

function basicStep(geo, cells) {
  return blockedStep(geo, cells) ?? singleStep(geo, cells) ?? confineStep(geo, cells) ?? lookaheadStep(geo, cells);
}

export function applyStep(cells, step) {
  for (const i of step.place) cells[i] = QUEEN;
  for (const i of step.cross) cells[i] = CROSS;
}

function queenCount(cells) {
  let q = 0;
  for (const m of cells) if (m === QUEEN) q++;
  return q;
}

function propagate(geo, cells) {
  for (;;) {
    if (queenCount(cells) === geo.n) return 'solved';
    const step = basicStep(geo, cells);
    if (!step) return 'stuck';
    if (step.rule === 'contradiction') return 'contradiction';
    applyStep(cells, step);
  }
}

function trialStep(geo, cells) {
  for (let c = 0; c < cells.length; c++) {
    if (cells[c] !== EMPTY) continue;
    const sim = cells.slice();
    sim[c] = QUEEN;
    if (propagate(geo, sim) === 'contradiction') {
      return {
        rule: 'trial', level: 4, place: [], cross: [c], focus: [c],
        message: 'If a crown were placed here, following the rules would soon leave a color, row or column with no room. Cross it out.',
      };
    }
  }
  return null;
}

export function findStep(geo, cells) {
  return basicStep(geo, cells) ?? trialStep(geo, cells);
}

export function solveLogically(geo, start) {
  const cells = start.slice();
  let level = 0;
  for (;;) {
    if (queenCount(cells) === geo.n) return { solved: true, level };
    const step = findStep(geo, cells);
    if (!step || step.rule === 'contradiction') return { solved: false, level };
    level = Math.max(level, step.level);
    applyStep(cells, step);
  }
}

// ---------- Generator ----------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomQueens(n, rng) {
  const pos = [], used = new Array(n).fill(false);
  const place = (r) => {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()], rng)) {
      if (used[c] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
      used[c] = true;
      pos[r] = c;
      if (place(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  place(0);
  return pos;
}

function growRegions(n, queenCols, rng, balance) {
  const regions = new Array(n * n).fill(-1);
  const ids = shuffle([...Array(n).keys()], rng);
  const bias = ids.map(() => 0.5 + rng());
  const size = new Array(n).fill(1);
  queenCols.forEach((c, r) => { regions[r * n + c] = ids[r]; });
  let remaining = n * n - n;
  const frontier = (id) => {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== -1) continue;
      const r = (i / n) | 0, c = i % n;
      if ((r > 0 && regions[i - n] === id) || (r < n - 1 && regions[i + n] === id) ||
          (c > 0 && regions[i - 1] === id) || (c < n - 1 && regions[i + 1] === id)) out.push(i);
    }
    return out;
  };
  while (remaining > 0) {
    // Small regions grow faster (higher balance = more even sizes); bias adds some variety.
    const w = size.map((s, id) => bias[id] / s ** balance);
    for (;;) {
      const total = w.reduce((a, b) => a + b, 0);
      let pick = rng() * total, id = 0;
      while (pick > w[id] && id < n - 1) pick -= w[id++];
      const options = frontier(id);
      if (options.length) {
        regions[options[Math.floor(rng() * options.length)]] = id;
        size[id]++;
        remaining--;
        break;
      }
      w[id] = 0;
    }
  }
  return regions;
}

function orthNeighbors(n, i) {
  const r = (i / n) | 0, c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

function staysConnectedWithout(n, regions, id, removed) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === id && i !== removed) cells.push(i);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    for (const j of orthNeighbors(n, stack.pop())) {
      if (regions[j] === id && j !== removed && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

// Kills alternative solutions one by one: moving one of an alternative's crown cells into a
// neighboring region gives that region two crowns in the alternative while the intended solution stays valid.
function makeUnique(n, regions, cols, rng, minSize, maxSteps = 150) {
  const intended = new Set(cols.map((c, r) => r * n + c));
  const size = new Array(n).fill(0);
  regions.forEach((id) => size[id]++);
  for (let step = 0; step < maxSteps; step++) {
    const other = findOtherSolution(n, regions, cols);
    if (!other) return true;
    const moves = [], weights = [];
    other.forEach((c, r) => {
      const x = r * n + c;
      if (intended.has(x)) return;
      const from = regions[x];
      if (size[from] <= minSize) return;
      const targets = new Set(orthNeighbors(n, x).map((j) => regions[j]).filter((id) => id !== from));
      if (!targets.size || !staysConnectedWithout(n, regions, from, x)) return;
      for (const to of targets) {
        moves.push([x, from, to]);
        weights.push(2 ** Math.max(-4, Math.min(4, size[from] - size[to])));
      }
    });
    if (!moves.length) return false;
    let pick = rng() * weights.reduce((a, b) => a + b, 0), k = 0;
    while (pick > weights[k] && k < moves.length - 1) pick -= weights[k++];
    const [x, from, to] = moves[k];
    regions[x] = to;
    size[from]--;
    size[to]++;
  }
  return false;
}

export function generatePuzzle(n, { balance = 2, minSize = 1, rng = Math.random } = {}) {
  for (let attempt = 1; ; attempt++) {
    const queenCols = randomQueens(n, rng);
    const regions = growRegions(n, queenCols, rng, balance);
    const size = new Array(n).fill(0);
    regions.forEach((id) => size[id]++);
    if (Math.min(...size) < minSize) continue;
    if (!makeUnique(n, regions, queenCols, rng, minSize)) continue;
    const geo = makeGeometry(n, regions);
    const res = solveLogically(geo, new Array(n * n).fill(EMPTY));
    if (!res.solved) continue;
    return { n, regions, solution: queenCols.map((c, r) => r * n + c), level: res.level, attempts: attempt };
  }
}

// balance < 0 gives uneven sizes with tiny regions (easier); balance > 0 gives even sizes (harder).
// Options are cycled per attempt.
export const DIFFICULTY = {
  easy: { level: 1, options: [{ balance: -1 }] },
  medium: { level: 2, options: [{ balance: -0.5, minSize: 2 }, { balance: -1, minSize: 2 }] },
  hard: { level: 3, options: [{ balance: 2, minSize: 3 }] },
};

// Generates until the solver level matches the difficulty (levels above 3 count as 3), or the
// time budget runs out, then returns the closest puzzle.
export function generateForDifficulty(n, difficulty, budgetMs = 3000) {
  const { level, options } = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;
  const deadline = Date.now() + budgetMs;
  let best = null, bestDist = Infinity;
  for (let k = 0; bestDist > 0 && (k === 0 || Date.now() < deadline); k++) {
    const p = generatePuzzle(n, options[k % options.length]);
    const dist = Math.abs(Math.min(p.level, 3) - level);
    if (dist < bestDist) { best = p; bestDist = dist; }
  }
  return best;
}
