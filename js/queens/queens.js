import { store } from '../storage.js';
import {
  EMPTY, CROSS, QUEEN, makeGeometry, findConflicts, isSolved, blockedCells, findStep, applyStep,
} from './logic.js';

const COLORS = ['#bba3e2', '#ffc992', '#96beff', '#b3dfa0', '#dfdfdf', '#ff7b60', '#e6f388', '#b9b29e', '#dfa0bf', '#a3d2d8'];
const CROWN = '<svg viewBox="0 0 24 24" class="crown" aria-hidden="true"><path d="M3 18 1.5 7.5l5.5 4L12 4l5 7.5 5.5-4L21 18z"/><rect x="3" y="19.5" width="18" height="2.5" rx="1"/></svg>';
const X = '<svg viewBox="0 0 24 24" class="x" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
const SIZES = [5, 6, 7, 8, 9, 10];
const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const LEVEL_NAME = (level) => (level <= 1 ? 'Easy' : level === 2 ? 'Medium' : 'Hard');

const HELP_OPTIONS = [
  ['autoX', 'Auto-cross', 'Cross out every cell a crown blocks: its row, column, color and neighbors.'],
  ['autoQueen', 'Auto-place crowns', 'Place a crown when a row, column or color has only one cell left.'],
  ['showConflicts', 'Show rule breaks', 'Highlight crowns that share a row, column or color, or touch.'],
  ['showMistakes', 'Show mistakes', 'Highlight crowns and crosses that do not match the solution.'],
  ['hints', 'Hint button', 'Explains the next logical step, and can do it for you.'],
  ['timer', 'Timer', 'Show the clock while you play.'],
];
const PRESETS = {
  none: { autoX: false, autoQueen: false, showConflicts: false, showMistakes: false, hints: false },
  some: { autoX: false, autoQueen: false, showConflicts: true, showMistakes: false, hints: true },
  lots: { autoX: true, autoQueen: true, showConflicts: true, showMistakes: true, hints: true },
};
const DEFAULT_SETTINGS = { ...PRESETS.some, timer: true, size: 8, difficulty: 'medium' };

const formatTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : m;
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

export function mount(root) {
  const settings = { ...DEFAULT_SETTINGS, ...store.get('queens:settings', {}) };
  let game = store.get('queens:game');
  let geo = null;
  let cellEls = [];
  let hint = null;
  let drag = null;
  let job = null;
  let prefetch = null;
  let genToken = 0;
  let tickTimer = null;
  let tickStart = 0;

  root.innerHTML = `
    <section class="queens">
      <div class="status">
        <span class="info"></span>
        <span class="clock" aria-label="Time"></span>
      </div>
      <div class="board-wrap">
        <div class="board" role="grid" aria-label="Queens board"></div>
        <div class="overlay" hidden></div>
      </div>
      <div class="hint-box" hidden>
        <p class="hint-text"></p>
        <div class="hint-actions">
          <button type="button" class="btn ghost" data-act="hint-close">Close</button>
          <button type="button" class="btn primary" data-act="hint-apply">Do it</button>
        </div>
      </div>
      <nav class="controls">
        <button type="button" class="ctl" data-act="undo">${icon('undo')}<span>Undo</span></button>
        <button type="button" class="ctl" data-act="clear">${icon('clear')}<span>Clear</span></button>
        <button type="button" class="ctl" data-act="hint">${icon('hint')}<span>Hint</span></button>
        <button type="button" class="ctl" data-act="help">${icon('help')}<span>Help</span></button>
        <button type="button" class="ctl" data-act="new">${icon('new')}<span>New</span></button>
      </nav>
      <p class="rules">Place one crown in each row, column and color. Crowns can't touch, not even diagonally.
        Tap once for a cross, twice for a crown. Drag to cross out many cells.</p>

      <dialog class="sheet help-dialog">
        <form method="dialog">
          <h2>How much help?</h2>
          <div class="presets">
            <button type="button" class="btn" data-preset="none">None</button>
            <button type="button" class="btn" data-preset="some">Some</button>
            <button type="button" class="btn" data-preset="lots">Lots</button>
          </div>
          <ul class="toggles">
            ${HELP_OPTIONS.map(([key, label, desc]) => `
              <li><label>
                <span><strong>${label}</strong><small>${desc}</small></span>
                <input type="checkbox" class="switch" name="${key}">
              </label></li>`).join('')}
          </ul>
          <button class="btn primary wide">Done</button>
        </form>
      </dialog>

      <dialog class="sheet new-dialog">
        <form method="dialog">
          <h2>New game</h2>
          <h3>Size</h3>
          <div class="choice" data-group="size">
            ${SIZES.map((s) => `<button type="button" class="btn" data-value="${s}">${s}×${s}</button>`).join('')}
          </div>
          <h3>Difficulty</h3>
          <div class="choice" data-group="difficulty">
            ${Object.entries(DIFFICULTIES).map(([k, v]) => `<button type="button" class="btn" data-value="${k}">${v}</button>`).join('')}
          </div>
          <div class="row">
            <button class="btn ghost" value="cancel">Cancel</button>
            <button class="btn primary" value="start">Start</button>
          </div>
        </form>
      </dialog>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const board = $('.board');
  const overlay = $('.overlay');
  const clock = $('.clock');
  const info = $('.info');
  const hintBox = $('.hint-box');
  const helpDialog = $('.help-dialog');
  const newDialog = $('.new-dialog');

  // ---------- persistence ----------
  const save = () => store.set('queens:game', game);
  const saveSettings = () => store.set('queens:settings', settings);

  // ---------- timer ----------
  function startClock() {
    if (tickTimer || !game || game.solved || document.hidden) return;
    tickStart = Date.now();
    tickTimer = setInterval(() => { flushClock(); renderClock(); }, 1000);
  }
  function flushClock() {
    if (!tickTimer) return;
    const now = Date.now();
    game.elapsed += now - tickStart;
    tickStart = now;
  }
  function stopClock() {
    flushClock();
    clearInterval(tickTimer);
    tickTimer = null;
  }
  function renderClock() {
    clock.hidden = !settings.timer;
    clock.textContent = game ? formatTime(game.elapsed) : '';
  }
  const onVisibility = () => {
    if (document.hidden) { stopClock(); if (game) save(); } else startClock();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onVisibility);

  // ---------- puzzle setup ----------
  function loadPuzzle(p, difficulty) {
    game = {
      n: p.n, regions: p.regions, solution: p.solution, level: p.level, difficulty,
      marks: new Array(p.n * p.n).fill(EMPTY), history: [], elapsed: 0, hintsUsed: 0, solved: false,
    };
    save();
    setupBoard();
  }

  function setupBoard() {
    const { n, regions } = game;
    geo = makeGeometry(n, regions);
    hint = null;
    board.style.setProperty('--n', n);
    board.replaceChildren();
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const r = (i / n) | 0, c = i % n;
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = i;
      el.setAttribute('role', 'gridcell');
      el.style.background = COLORS[regions[i]];
      if (c < n - 1 && regions[i + 1] !== regions[i]) el.classList.add('wall-r');
      if (r < n - 1 && regions[i + n] !== regions[i]) el.classList.add('wall-b');
      cellEls.push(el);
      board.append(el);
    }
    info.textContent = `${n}×${n} · ${LEVEL_NAME(game.level)}`;
    render();
    stopClock();
    startClock();
  }

  const puzzleKey = (n, difficulty) => `${n}:${difficulty}`;

  function runWorker(n, difficulty) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const promise = new Promise((resolve) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = () => resolve(null);
      worker.postMessage({ n, difficulty });
    }).finally(() => worker.terminate());
    return { key: puzzleKey(n, difficulty), worker, promise };
  }

  // The ready puzzle is kept in storage so it survives reloads and works offline.
  function startPrefetch(n, difficulty) {
    const key = puzzleKey(n, difficulty);
    if (store.get('queens:next')?.key === key || prefetch?.key === key) return;
    prefetch?.worker.terminate();
    const current = prefetch = runWorker(n, difficulty);
    current.promise.then((p) => {
      if (prefetch !== current) return;
      prefetch = null;
      if (p) store.set('queens:next', { key, puzzle: p });
    });
  }

  async function newGame(n, difficulty) {
    const token = ++genToken;
    stopClock();
    hintBox.hidden = true;
    job?.worker.terminate();
    job = null;
    const key = puzzleKey(n, difficulty);
    const ready = store.get('queens:next');
    let p;
    if (ready?.key === key && ready.puzzle?.regions) {
      store.remove('queens:next');
      p = ready.puzzle;
    } else {
      overlay.hidden = false;
      overlay.className = 'overlay loading';
      overlay.innerHTML = '<div class="spinner"></div><p>Making a puzzle…</p>';
      if (prefetch?.key === key) {
        job = prefetch;
        prefetch = null;
      } else {
        job = runWorker(n, difficulty);
      }
      p = await job.promise;
      if (token !== genToken) return;
      job = null;
    }
    if (!p) {
      overlay.innerHTML = '<p>Could not create a puzzle.</p>';
      return;
    }
    overlay.hidden = true;
    loadPuzzle(p, difficulty);
    startPrefetch(n, difficulty);
  }

  function nextPuzzle() {
    newGame(game?.n ?? settings.size, game?.difficulty ?? settings.difficulty);
  }

  // ---------- derived state ----------
  function effectiveMarks() {
    const cells = game.marks.slice();
    const auto = new Set();
    if (settings.autoX) {
      for (const j of blockedCells(geo, game.marks)) {
        if (cells[j] === EMPTY) { cells[j] = CROSS; auto.add(j); }
      }
    }
    return { cells, auto };
  }

  function mistakes() {
    const sol = new Set(game.solution);
    const out = [];
    game.marks.forEach((m, i) => {
      if ((m === QUEEN && !sol.has(i)) || (m === CROSS && sol.has(i))) out.push(i);
    });
    return out;
  }

  // ---------- rendering ----------
  function render() {
    if (!game) return;
    const { cells, auto } = effectiveMarks();
    const conflicts = settings.showConflicts ? findConflicts(geo, game.marks) : { bad: new Set(), zone: new Set() };
    const wrong = new Set(settings.showMistakes ? mistakes() : []);
    const hintTargets = new Set(hint ? [...hint.place, ...hint.cross] : []);
    const hintFocus = new Set(hint ? hint.focus : []);
    cells.forEach((m, i) => {
      const el = cellEls[i];
      const html = m === QUEEN ? CROWN : m === CROSS ? X : '';
      if (el.dataset.m !== String(m)) { el.innerHTML = html; el.dataset.m = m; }
      el.classList.toggle('auto', auto.has(i));
      el.classList.toggle('conflict', conflicts.bad.has(i));
      el.classList.toggle('conflict-zone', conflicts.zone.has(i) && !conflicts.bad.has(i));
      el.classList.toggle('mistake', wrong.has(i));
      el.classList.toggle('hint-target', hintTargets.has(i));
      el.classList.toggle('hint-focus', hintFocus.has(i) && !hintTargets.has(i));
      el.setAttribute('aria-label', `Row ${((i / game.n) | 0) + 1}, column ${(i % game.n) + 1}${m === QUEEN ? ', crown' : m === CROSS ? ', cross' : ''}`);
    });
    root.querySelector('[data-act="hint"]').hidden = !settings.hints;
    root.querySelector('[data-act="undo"]').disabled = !game.history.length || game.solved;
    root.querySelector('[data-act="clear"]').disabled = game.solved || game.marks.every((m) => m === EMPTY);
    board.classList.toggle('locked', game.solved);
    renderClock();
  }

  function showWin() {
    const stats = store.get('queens:stats', {});
    const s = stats[game.n] ?? { solved: 0, bestMs: null };
    const isBest = game.hintsUsed === 0 && (s.bestMs === null || game.elapsed < s.bestMs);
    s.solved++;
    if (isBest) s.bestMs = game.elapsed;
    stats[game.n] = s;
    store.set('queens:stats', stats);
    showWinOverlay(isBest);
  }

  function showWinOverlay(isBest = false) {
    const s = store.get('queens:stats', {})[game.n];
    overlay.hidden = false;
    overlay.className = 'overlay win';
    overlay.innerHTML = `
      <div class="win-card">
        <h2>Solved!</h2>
        <p class="big">${formatTime(game.elapsed)}</p>
        <p>${game.hintsUsed ? `${game.hintsUsed} hint${game.hintsUsed > 1 ? 's' : ''} used` : 'No hints'}${isBest ? ' · New best!' : ''}</p>
        ${s?.bestMs != null ? `<p class="muted">Best ${game.n}×${game.n} without hints: ${formatTime(s.bestMs)}</p>` : ''}
        <div class="row">
          <button type="button" class="btn ghost" data-act="view">View board</button>
          <button type="button" class="btn primary" data-act="next">Next puzzle</button>
        </div>
      </div>`;
  }

  // ---------- moves ----------
  function commit(changes) {
    if (!changes.length) return;
    game.history.push(changes);
    if (game.history.length > 500) game.history.shift();
    afterMove();
  }

  function setMark(i, value, changes) {
    if (game.marks[i] === value) return;
    changes.push([i, game.marks[i]]);
    game.marks[i] = value;
  }

  function autoPlaceQueens(changes) {
    if (!settings.autoQueen) return;
    const sol = new Set(game.solution);
    for (;;) {
      if (findConflicts(geo, game.marks).bad.size) return;
      const cells = game.marks.slice();
      for (const j of blockedCells(geo, game.marks)) if (cells[j] === EMPTY) cells[j] = CROSS;
      let placed = false;
      for (const u of geo.units) {
        if (u.cells.some((i) => cells[i] === QUEEN)) continue;
        const open = u.cells.filter((i) => cells[i] === EMPTY);
        if (open.length === 1 && sol.has(open[0])) {
          setMark(open[0], QUEEN, changes);
          placed = true;
          break;
        }
      }
      if (!placed) return;
    }
  }

  function afterMove() {
    hint = null;
    hintBox.hidden = true;
    if (isSolved(geo, game.marks)) {
      game.solved = true;
      stopClock();
      render();
      save();
      showWin();
      return;
    }
    render();
    save();
  }

  function tap(i) {
    const { cells } = effectiveMarks();
    const next = cells[i] === EMPTY ? CROSS : cells[i] === CROSS ? QUEEN : EMPTY;
    const changes = [];
    setMark(i, next, changes);
    if (next === QUEEN) autoPlaceQueens(changes);
    commit(changes);
  }

  function undo() {
    const changes = game.history.pop();
    if (!changes) return;
    for (let k = changes.length - 1; k >= 0; k--) game.marks[changes[k][0]] = changes[k][1];
    afterMove();
  }

  function clearBoard() {
    const changes = [];
    game.marks.forEach((m, i) => setMark(i, EMPTY, changes));
    commit(changes);
  }

  // ---------- hints ----------
  function showHint() {
    if (game.solved) return;
    const wrong = mistakes();
    if (wrong.length) {
      hint = { kind: 'fix', place: [], cross: wrong, focus: [] };
      showHintBox(`There ${wrong.length === 1 ? 'is a mistake' : `are ${wrong.length} mistakes`} on the board. "Do it" removes ${wrong.length === 1 ? 'it' : 'them'}.`);
    } else {
      const { cells } = effectiveMarks();
      const step = findStep(geo, cells);
      if (!step || step.rule === 'contradiction') return;
      hint = { kind: 'step', ...step };
      showHintBox(step.message);
    }
    game.hintsUsed++;
    save();
    render();
  }

  function showHintBox(text) {
    $('.hint-text').textContent = text;
    hintBox.hidden = false;
  }

  function applyHint() {
    if (!hint) return;
    const changes = [];
    if (hint.kind === 'fix') {
      for (const i of hint.cross) setMark(i, EMPTY, changes);
    } else {
      const cells = game.marks.slice();
      applyStep(cells, hint);
      cells.forEach((m, i) => setMark(i, m, changes));
      if (hint.place.length) autoPlaceQueens(changes);
    }
    commit(changes);
  }

  // ---------- input ----------
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('.cell');
    return el && board.contains(el) ? Number(el.dataset.i) : null;
  };

  function dragOver(i) {
    const { cells } = effectiveMarks();
    if (drag.mode === 'cross' && cells[i] === EMPTY) setMark(i, CROSS, drag.changes);
    else if (drag.mode === 'erase' && game.marks[i] === CROSS) setMark(i, EMPTY, drag.changes);
    render();
  }

  board.addEventListener('pointerdown', (e) => {
    if (!game || game.solved || e.button > 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    drag = { start: i, last: i, mode: null, changes: [] };
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || i === drag.last) return;
    if (!drag.mode) {
      drag.mode = game.marks[drag.start] === CROSS ? 'erase' : 'cross';
      dragOver(drag.start);
    }
    drag.last = i;
    dragOver(i);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode) commit(d.changes);
    else tap(d.start);
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'undo': undo(); break;
      case 'clear': clearBoard(); break;
      case 'hint': showHint(); break;
      case 'hint-apply': applyHint(); break;
      case 'hint-close': hint = null; hintBox.hidden = true; render(); break;
      case 'help': openHelp(); break;
      case 'new': openNew(); break;
      case 'next': nextPuzzle(); break;
      case 'view': overlay.hidden = true; break;
    }
  });

  // ---------- dialogs ----------
  function syncHelpForm() {
    for (const [key] of HELP_OPTIONS) helpDialog.querySelector(`[name="${key}"]`).checked = settings[key];
  }
  function openHelp() {
    syncHelpForm();
    helpDialog.showModal();
  }
  helpDialog.addEventListener('change', (e) => {
    if (!e.target.name) return;
    settings[e.target.name] = e.target.checked;
    saveSettings();
    if (e.target.name === 'autoQueen' && e.target.checked && game && !game.solved) {
      const changes = [];
      autoPlaceQueens(changes);
      commit(changes);
    }
    render();
  });
  helpDialog.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (!p) return;
    Object.assign(settings, PRESETS[p.dataset.preset]);
    saveSettings();
    syncHelpForm();
    render();
  });

  const pending = { size: settings.size, difficulty: settings.difficulty };
  function syncNewForm() {
    for (const group of newDialog.querySelectorAll('.choice')) {
      for (const b of group.children) b.classList.toggle('selected', b.dataset.value === String(pending[group.dataset.group]));
    }
  }
  function openNew() {
    pending.size = settings.size;
    pending.difficulty = settings.difficulty;
    syncNewForm();
    newDialog.showModal();
  }
  newDialog.addEventListener('click', (e) => {
    const b = e.target.closest('.choice .btn');
    if (!b) return;
    const group = b.parentElement.dataset.group;
    pending[group] = group === 'size' ? Number(b.dataset.value) : b.dataset.value;
    syncNewForm();
  });
  newDialog.addEventListener('close', () => {
    if (newDialog.returnValue !== 'start') return;
    settings.size = pending.size;
    settings.difficulty = pending.difficulty;
    saveSettings();
    newGame(settings.size, settings.difficulty);
  });

  // ---------- start ----------
  if (game?.regions) {
    setupBoard();
    if (game.solved) showWinOverlay();
    startPrefetch(game.n, game.difficulty ?? settings.difficulty);
  } else {
    newGame(settings.size, settings.difficulty);
  }

  return () => {
    stopClock();
    if (game) save();
    job?.worker.terminate();
    prefetch?.worker.terminate();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onVisibility);
  };
}

function icon(name) {
  const paths = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    clear: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    hint: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    help: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.9 2.9M16.9 16.9l2.9 2.9M1 12h4M19 12h4M4.2 19.8l2.9-2.9M16.9 7.1l2.9-2.9"/>',
    new: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}
