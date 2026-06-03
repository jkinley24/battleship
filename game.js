"use strict";

/* ============================================================
   Battleship vs AI
   - Pure client-side game. No backend required.
   - Player places ships, then trades shots with an AI opponent.
   ============================================================ */

const SIZE = 10;
const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

// Cell state helpers: each board is a 2D array of cell objects.
function makeBoard() {
  const grid = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      row.push({ shipId: null, hit: false });
    }
    grid.push(row);
  }
  return grid;
}

// ---- Game state ----
let state;

function newState() {
  return {
    phase: "setup", // setup | playing | over
    playerBoard: makeBoard(),
    enemyBoard: makeBoard(),
    // ships[boardName] = array of {name,size,cells:[[r,c]...],hits:int,sunk:bool}
    playerShips: [],
    enemyShips: [],
    orientation: "H", // H | V
    selectedShipIndex: 0, // index into SHIPS for placement
    placed: new Array(SHIPS.length).fill(false),
    turn: "player", // player | ai
    ai: newAIState(),
    difficulty: "hard",
    busy: false, // lock input while AI thinks / animations run
  };
}

// ---- AI state (hunt & target) ----
function newAIState() {
  return {
    mode: "hunt",
    targetQueue: [], // cells to try next when in target mode
    hits: [], // current chain of hits on an un-sunk ship
  };
}

// ============================================================
// DOM references
// ============================================================
const el = {
  status: document.getElementById("status"),
  setupControls: document.getElementById("setup-controls"),
  gameControls: document.getElementById("game-controls"),
  playerBoard: document.getElementById("player-board"),
  enemyBoard: document.getElementById("enemy-board"),
  btnRotate: document.getElementById("btn-rotate"),
  btnRandom: document.getElementById("btn-random"),
  btnStart: document.getElementById("btn-start"),
  btnResetSetup: document.getElementById("btn-reset-setup"),
  btnNewGame: document.getElementById("btn-new-game"),
  orientationLabel: document.getElementById("orientation-label"),
  shipTray: document.getElementById("ship-tray"),
  difficulty: document.getElementById("difficulty"),
};

// ============================================================
// Rendering
// ============================================================
function buildGrid(container, boardName) {
  container.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.dataset.board = boardName;
      container.appendChild(cell);
    }
  }
}

function cellEl(container, r, c) {
  return container.children[r * SIZE + c];
}

function render() {
  // Player board: show ships, hits, misses
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const d = cellEl(el.playerBoard, r, c);
      const cs = state.playerBoard[r][c];
      d.className = "cell";
      if (cs.shipId !== null) d.classList.add("ship");
      if (cs.hit && cs.shipId !== null) d.classList.add("hit");
      if (cs.hit && cs.shipId === null) d.classList.add("miss");
    }
  }
  markSunk(state.playerBoard, state.playerShips, el.playerBoard);

  // Enemy board: hide ships, show only hits/misses
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const d = cellEl(el.enemyBoard, r, c);
      const cs = state.enemyBoard[r][c];
      d.className = "cell";
      if (cs.hit && cs.shipId !== null) d.classList.add("hit", "fired");
      if (cs.hit && cs.shipId === null) d.classList.add("miss", "fired");
    }
  }
  markSunk(state.enemyBoard, state.enemyShips, el.enemyBoard);
}

function markSunk(board, ships, container) {
  for (const ship of ships) {
    if (ship.sunk) {
      for (const [r, c] of ship.cells) {
        cellEl(container, r, c).classList.add("sunk");
      }
    }
  }
}

function setStatus(msg, cls) {
  el.status.textContent = msg;
  el.status.className = "status" + (cls ? " " + cls : "");
}

// ============================================================
// Ship placement
// ============================================================
function canPlace(board, r, c, size, orientation) {
  for (let i = 0; i < size; i++) {
    const rr = orientation === "H" ? r : r + i;
    const cc = orientation === "H" ? c + i : c;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return false;
    if (board[rr][cc].shipId !== null) return false;
  }
  return true;
}

function placeShip(board, ships, shipDef, r, c, orientation, shipId) {
  const cells = [];
  for (let i = 0; i < shipDef.size; i++) {
    const rr = orientation === "H" ? r : r + i;
    const cc = orientation === "H" ? c + i : c;
    board[rr][cc].shipId = shipId;
    cells.push([rr, cc]);
  }
  ships.push({ name: shipDef.name, size: shipDef.size, cells, hits: 0, sunk: false });
}

function placeAllRandom(board, ships) {
  ships.length = 0;
  for (const cell of board.flat()) cell.shipId = null;
  for (let id = 0; id < SHIPS.length; id++) {
    const def = SHIPS[id];
    let placed = false;
    let guard = 0;
    while (!placed && guard < 1000) {
      guard++;
      const orientation = Math.random() < 0.5 ? "H" : "V";
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      if (canPlace(board, r, c, def.size, orientation)) {
        placeShip(board, ships, def, r, c, orientation, id);
        placed = true;
      }
    }
  }
}

function renderShipTray() {
  el.shipTray.innerHTML = "";
  SHIPS.forEach((s, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ship-chip";
    if (i === state.selectedShipIndex && !state.placed[i]) chip.classList.add("selected");
    if (state.placed[i]) chip.classList.add("placed");
    chip.append(`${s.name} `);
    const pips = document.createElement("span");
    pips.className = "pips";
    for (let p = 0; p < s.size; p++) {
      const pip = document.createElement("span");
      pip.className = "pip";
      pips.appendChild(pip);
    }
    chip.appendChild(pips);
    chip.addEventListener("click", () => {
      if (state.placed[i]) return;
      state.selectedShipIndex = i;
      renderShipTray();
    });
    el.shipTray.appendChild(chip);
  });
}

function nextUnplacedShip() {
  for (let i = 0; i < SHIPS.length; i++) {
    if (!state.placed[i]) return i;
  }
  return -1;
}

function allPlaced() {
  return state.placed.every(Boolean);
}

function updateStartButton() {
  el.btnStart.disabled = !allPlaced();
}

// Preview on hover during setup
function clearPreview() {
  for (const d of el.playerBoard.children) {
    d.classList.remove("preview-ok", "preview-bad");
  }
}

function showPreview(r, c) {
  clearPreview();
  if (state.phase !== "setup") return;
  const idx = state.selectedShipIndex;
  if (state.placed[idx]) return;
  const def = SHIPS[idx];
  const ok = canPlace(state.playerBoard, r, c, def.size, state.orientation);
  for (let i = 0; i < def.size; i++) {
    const rr = state.orientation === "H" ? r : r + i;
    const cc = state.orientation === "H" ? c + i : c;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
    cellEl(el.playerBoard, rr, cc).classList.add(ok ? "preview-ok" : "preview-bad");
  }
}

// ============================================================
// Firing logic
// ============================================================
function fireAt(board, ships, r, c) {
  // returns {result: 'miss'|'hit'|'sunk', ship?}
  const cs = board[r][c];
  cs.hit = true;
  if (cs.shipId === null) {
    return { result: "miss" };
  }
  const ship = ships[cs.shipId];
  ship.hits++;
  if (ship.hits >= ship.size) {
    ship.sunk = true;
    return { result: "sunk", ship };
  }
  return { result: "hit", ship };
}

function allSunk(ships) {
  return ships.every((s) => s.sunk);
}

function onEnemyCellClick(e) {
  if (state.phase !== "playing" || state.turn !== "player" || state.busy) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  if (state.enemyBoard[r][c].hit) return; // already fired here

  const res = fireAt(state.enemyBoard, state.enemyShips, r, c);
  render();

  if (res.result === "miss") {
    setStatus("You missed. Enemy's turn…");
    state.turn = "ai";
    state.busy = true;
    setTimeout(aiTurn, 650);
  } else if (res.result === "hit") {
    setStatus("Direct hit! Fire again.");
  } else if (res.result === "sunk") {
    setStatus(`You sunk the enemy ${res.ship.name}! Fire again.`);
    if (allSunk(state.enemyShips)) {
      endGame("player");
      return;
    }
  }
}

// ============================================================
// AI turn
// ============================================================
function aiPickTarget() {
  const ai = state.ai;
  // Target mode: drain the queue of promising cells
  if (state.difficulty === "hard" && ai.targetQueue.length > 0) {
    while (ai.targetQueue.length > 0) {
      const [r, c] = ai.targetQueue.shift();
      if (inBounds(r, c) && !state.playerBoard[r][c].hit) {
        return [r, c];
      }
    }
  }
  // Hunt mode: pick a random un-fired cell (parity for hard)
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.playerBoard[r][c].hit) continue;
      if (state.difficulty === "hard" && (r + c) % 2 !== 0) continue;
      candidates.push([r, c]);
    }
  }
  let pool = candidates;
  if (pool.length === 0) {
    // fall back to any remaining cell (parity exhausted)
    pool = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!state.playerBoard[r][c].hit) pool.push([r, c]);
      }
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function aiRegisterHit(r, c, sunk) {
  const ai = state.ai;
  if (sunk) {
    ai.mode = "hunt";
    ai.hits = [];
    ai.targetQueue = [];
    return;
  }
  ai.mode = "target";
  ai.hits.push([r, c]);
  // Enqueue orthogonal neighbors
  const neighbors = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
  for (const [nr, nc] of neighbors) {
    if (inBounds(nr, nc) && !state.playerBoard[nr][nc].hit) {
      ai.targetQueue.push([nr, nc]);
    }
  }
  // If we have 2+ hits in a line, prioritize continuing that line
  if (ai.hits.length >= 2) {
    prioritizeLine();
  }
}

function prioritizeLine() {
  const ai = state.ai;
  const rows = ai.hits.map((h) => h[0]);
  const cols = ai.hits.map((h) => h[1]);
  const sameRow = rows.every((x) => x === rows[0]);
  const sameCol = cols.every((x) => x === cols[0]);
  let line = [];
  if (sameRow) {
    const r = rows[0];
    const cs = cols.slice().sort((a, b) => a - b);
    line = [
      [r, cs[0] - 1],
      [r, cs[cs.length - 1] + 1],
    ];
  } else if (sameCol) {
    const c = cols[0];
    const rs = rows.slice().sort((a, b) => a - b);
    line = [
      [rs[0] - 1, c],
      [rs[rs.length - 1] + 1, c],
    ];
  }
  const valid = line.filter(([r, c]) => inBounds(r, c) && !state.playerBoard[r][c].hit);
  // Put line-extension cells at the front of the queue
  state.ai.targetQueue = valid.concat(state.ai.targetQueue);
}

function aiTurn() {
  if (state.phase !== "playing") return;
  const [r, c] = aiPickTarget();
  const res = fireAt(state.playerBoard, state.playerShips, r, c);
  render();

  if (res.result === "miss") {
    setStatus("Enemy missed. Your turn.");
    state.turn = "player";
    state.busy = false;
  } else if (res.result === "hit") {
    aiRegisterHit(r, c, false);
    setStatus("Enemy hit your ship! Enemy fires again…");
    setTimeout(aiTurn, 650);
  } else if (res.result === "sunk") {
    aiRegisterHit(r, c, true);
    setStatus(`Enemy sunk your ${res.ship.name}! Enemy fires again…`);
    if (allSunk(state.playerShips)) {
      endGame("ai");
      return;
    }
    setTimeout(aiTurn, 650);
  }
}

// ============================================================
// Game flow
// ============================================================
function startBattle() {
  if (!allPlaced()) return;
  placeAllRandom(state.enemyBoard, state.enemyShips);
  state.phase = "playing";
  state.turn = "player";
  state.busy = false;
  state.difficulty = el.difficulty.value;
  el.setupControls.classList.add("hidden");
  el.gameControls.classList.remove("hidden");
  setStatus("Battle begins! Click Enemy Waters to fire.");
  render();
}

function endGame(winner) {
  state.phase = "over";
  state.busy = true;
  if (winner === "player") {
    setStatus("🎉 Victory! You sank the entire enemy fleet.", "win");
  } else {
    setStatus("💥 Defeat. Your fleet has been destroyed.", "lose");
  }
  // Reveal enemy ships
  for (const ship of state.enemyShips) {
    for (const [r, c] of ship.cells) {
      cellEl(el.enemyBoard, r, c).classList.add("ship");
    }
  }
}

function resetSetup() {
  state.playerShips.length = 0;
  for (const cell of state.playerBoard.flat()) {
    cell.shipId = null;
    cell.hit = false;
  }
  state.placed.fill(false);
  state.selectedShipIndex = 0;
  renderShipTray();
  updateStartButton();
  render();
  setStatus("Place your ships to begin.");
}

function newGame() {
  state = newState();
  state.difficulty = el.difficulty.value;
  el.gameControls.classList.add("hidden");
  el.setupControls.classList.remove("hidden");
  renderShipTray();
  updateStartButton();
  render();
  setStatus("Place your ships to begin.");
}

// ============================================================
// Event wiring
// ============================================================
function onPlayerCellClick(e) {
  if (state.phase !== "setup") return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  const idx = state.selectedShipIndex;
  if (state.placed[idx]) {
    const next = nextUnplacedShip();
    if (next === -1) return;
    state.selectedShipIndex = next;
  }
  const def = SHIPS[state.selectedShipIndex];
  if (!canPlace(state.playerBoard, r, c, def.size, state.orientation)) {
    setStatus("Can't place a ship there.");
    return;
  }
  placeShip(state.playerBoard, state.playerShips, def, r, c, state.orientation, state.selectedShipIndex);
  state.placed[state.selectedShipIndex] = true;
  const next = nextUnplacedShip();
  if (next !== -1) state.selectedShipIndex = next;
  clearPreview();
  renderShipTray();
  updateStartButton();
  render();
  if (allPlaced()) {
    setStatus("All ships placed. Click Start Battle!");
  } else {
    setStatus(`Place your ${SHIPS[state.selectedShipIndex].name} (${SHIPS[state.selectedShipIndex].size}).`);
  }
}

function wire() {
  buildGrid(el.playerBoard, "player");
  buildGrid(el.enemyBoard, "enemy");

  el.playerBoard.addEventListener("click", onPlayerCellClick);
  el.playerBoard.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    showPreview(Number(cell.dataset.r), Number(cell.dataset.c));
  });
  el.playerBoard.addEventListener("mouseleave", clearPreview);

  el.enemyBoard.addEventListener("click", onEnemyCellClick);

  el.btnRotate.addEventListener("click", () => {
    state.orientation = state.orientation === "H" ? "V" : "H";
    el.orientationLabel.textContent = state.orientation === "H" ? "Horizontal" : "Vertical";
  });

  el.btnRandom.addEventListener("click", () => {
    if (state.phase !== "setup") return;
    placeAllRandom(state.playerBoard, state.playerShips);
    state.placed.fill(true);
    renderShipTray();
    updateStartButton();
    render();
    setStatus("Ships placed randomly. Click Start Battle!");
  });

  el.btnStart.addEventListener("click", startBattle);
  el.btnResetSetup.addEventListener("click", resetSetup);
  el.btnNewGame.addEventListener("click", newGame);
  el.difficulty.addEventListener("change", () => {
    state.difficulty = el.difficulty.value;
  });
}

// ============================================================
// Boot
// ============================================================
state = newState();
wire();
renderShipTray();
render();
setStatus(`Place your ${SHIPS[0].name} (${SHIPS[0].size}). Use Rotate to change orientation.`);
