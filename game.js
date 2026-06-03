"use strict";

/* ============================================================
   Battleship — Naval Command Center
   Pure client-side game (no backend).

   Screens: home -> difficulty -> placement -> battle -> game over
   AI difficulties:
     - recruit : fires at random untried cells
     - captain : hunt & target (queue neighbors of a hit, extend lines)
     - admiral : probability-density map (+ hunt/target + checkerboard)
   Turns strictly alternate (one shot per side per turn).
   ============================================================ */

const SIZE = 10;
const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];
const TOTAL_SHIP_CELLS = SHIPS.reduce((s, x) => s + x.size, 0); // 17
const ROW_LETTERS = "ABCDEFGHIJ";

const DIFF_LABEL = { recruit: "RECRUIT", captain: "CAPTAIN", admiral: "ADMIRAL" };

const RANKS = [
  { name: "ENSIGN", wins: 0 },
  { name: "LIEUTENANT", wins: 1 },
  { name: "COMMANDER", wins: 3 },
  { name: "CAPTAIN", wins: 6 },
  { name: "ADMIRAL", wins: 10 },
];

// ============================================================
// Board helpers
// ============================================================
function makeBoard() {
  const grid = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) row.push({ shipId: null, hit: false });
    grid.push(row);
  }
  return grid;
}
function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function coordName(r, c) { return ROW_LETTERS[r] + (c + 1); }

// ============================================================
// Game state
// ============================================================
let state;

function newState() {
  return {
    phase: "setup", // setup | playing | over
    difficulty: "captain",
    playerBoard: makeBoard(),
    enemyBoard: makeBoard(),
    playerShips: [],
    enemyShips: [],
    orientation: "H",
    selectedShipIndex: 0,
    placed: new Array(SHIPS.length).fill(false),
    placementOrder: [], // ship ids in the order they were placed (for undo)
    turn: "player",
    busy: false,
    ai: newAIState(),
    log: [],
    turns: 0,
    allyHits: 0,
    enemyHits: 0,
    showEnemyShots: true,
    hoverCell: null,
  };
}
function newAIState() {
  return { mode: "hunt", targetQueue: [] };
}

// ============================================================
// Persisted stats / rank
// ============================================================
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem("bs_stats")) || { games: 0, wins: 0, losses: 0 };
  } catch (_) { return { games: 0, wins: 0, losses: 0 }; }
}
function saveStats(s) { try { localStorage.setItem("bs_stats", JSON.stringify(s)); } catch (_) {} }
function currentRank() {
  const wins = loadStats().wins;
  let rank = RANKS[0].name;
  for (const r of RANKS) if (wins >= r.wins) rank = r.name;
  return rank;
}
function refreshRankLabels() {
  const rank = currentRank();
  document.getElementById("home-rank").textContent = rank;
  document.querySelectorAll(".place-rank, .battle-rank").forEach((e) => (e.textContent = rank));
}

// ============================================================
// DOM
// ============================================================
const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  difficulty: $("screen-difficulty"),
  place: $("screen-place"),
  battle: $("screen-battle"),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  window.scrollTo(0, 0);
}

// ============================================================
// Audio (synthesized — no asset files)
// ============================================================
const audio = {
  ctx: null,
  sfxOn: true,
  musicOn: false,
  musicNodes: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  blip(freq, dur, type, vol) {
    if (!this.sfxOn) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.18));
    o.start(t); o.stop(t + (dur || 0.18) + 0.02);
  },
  sonar() { this.blip(660, 0.18, "sine", 0.12); },
  hit() { this.blip(180, 0.28, "square", 0.16); setTimeout(() => this.blip(110, 0.22, "sawtooth", 0.14), 60); },
  miss() { this.blip(300, 0.16, "sine", 0.08); },
  sunk() { [330, 247, 165].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, "square", 0.16), i * 110)); },
  win() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, "triangle", 0.16), i * 140)); },
  lose() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, "sawtooth", 0.14), i * 160)); },
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  },
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.musicNodes) return;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    g.connect(ctx.destination);
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = 82.4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    o1.connect(g); o2.connect(g);
    o1.start(); o2.start(); lfo.start();
    this.musicNodes = { g, o1, o2, lfo };
  },
  stopMusic() {
    if (!this.musicNodes) return;
    const { g, o1, o2, lfo } = this.musicNodes;
    try { o1.stop(); o2.stop(); lfo.stop(); g.disconnect(); } catch (_) {}
    this.musicNodes = null;
  },
};

// ============================================================
// Board rendering
// ============================================================
function buildGrid(container, boardName) {
  container.innerHTML = "";
  // top-left corner
  container.appendChild(corner());
  // column headers 1..10
  for (let c = 0; c < SIZE; c++) container.appendChild(coordCell(String(c + 1)));
  for (let r = 0; r < SIZE; r++) {
    container.appendChild(coordCell(ROW_LETTERS[r]));
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.dataset.board = boardName;
      cell.setAttribute("aria-label", `Row ${ROW_LETTERS[r]}, Column ${c + 1}`);
      container.appendChild(cell);
    }
  }
}
function corner() { const d = document.createElement("div"); d.className = "coord"; return d; }
function coordCell(txt) { const d = document.createElement("div"); d.className = "coord"; d.textContent = txt; return d; }
function cellEl(container, r, c) {
  // grid layout: row 0 = headers (11 cells), then each row = 1 header + 10 cells
  const idx = (r + 1) * (SIZE + 1) + (c + 1);
  return container.children[idx];
}

function paintBoard(container, board, ships, reveal) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const d = cellEl(container, r, c);
      const cs = board[r][c];
      d.className = "cell";
      if (cs.shipId !== null && reveal) d.classList.add("ship");
      if (cs.hit && cs.shipId !== null) d.classList.add("hit");
      if (cs.hit && cs.shipId === null) d.classList.add("miss");
    }
  }
  for (const ship of ships) {
    if (ship.sunk) for (const [r, c] of ship.cells) cellEl(container, r, c).classList.add("sunk");
  }
}

// ============================================================
// Placement
// ============================================================
function canPlace(board, r, c, size, orientation) {
  for (let i = 0; i < size; i++) {
    const rr = orientation === "H" ? r : r + i;
    const cc = orientation === "H" ? c + i : c;
    if (!inBounds(rr, cc)) return false;
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
  ships[shipId] = { name: shipDef.name, size: shipDef.size, cells, hits: 0, sunk: false };
}
function placeAllRandom(board, ships) {
  for (const cell of board.flat()) cell.shipId = null;
  ships.length = 0;
  for (let id = 0; id < SHIPS.length; id++) {
    const def = SHIPS[id];
    let placed = false, guard = 0;
    while (!placed && guard < 2000) {
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

function renderShipList() {
  const list = $("ship-list");
  list.innerHTML = "";
  SHIPS.forEach((s, i) => {
    const item = document.createElement("div");
    item.className = "ship-item";
    item.tabIndex = 0;
    if (i === state.selectedShipIndex && !state.placed[i]) item.classList.add("selected");
    if (state.placed[i]) item.classList.add("placed");
    const fig = Array.from({ length: s.size }, () => "<i></i>").join("");
    item.innerHTML = `<span class="ship-figure">${fig}</span><span class="ship-name">${s.name}</span><span class="ship-size">${s.size}</span>`;
    item.addEventListener("click", () => {
      if (state.placed[i]) return;
      state.selectedShipIndex = i;
      renderShipList();
    });
    list.appendChild(item);
  });
}
function nextUnplacedShip() {
  for (let i = 0; i < SHIPS.length; i++) if (!state.placed[i]) return i;
  return -1;
}
function allPlaced() { return state.placed.every(Boolean); }
function updatePlaceButtons() {
  $("btn-deploy").disabled = !allPlaced();
  $("btn-undo").disabled = state.placementOrder.length === 0;
}
function clearPreview() {
  for (const d of $("place-board").children) d.classList.remove("preview-ok", "preview-bad");
}
function showPreview(r, c) {
  clearPreview();
  if (state.phase !== "setup") return;
  const idx = state.selectedShipIndex;
  if (idx < 0 || state.placed[idx]) return;
  const def = SHIPS[idx];
  const ok = canPlace(state.playerBoard, r, c, def.size, state.orientation);
  for (let i = 0; i < def.size; i++) {
    const rr = state.orientation === "H" ? r : r + i;
    const cc = state.orientation === "H" ? c + i : c;
    if (!inBounds(rr, cc)) continue;
    cellEl($("place-board"), rr, cc).classList.add(ok ? "preview-ok" : "preview-bad");
  }
}
function renderPlacement() {
  paintBoard($("place-board"), state.playerBoard, state.playerShips, true);
  renderShipList();
  updatePlaceButtons();
}

function onPlaceCellClick(e) {
  if (state.phase !== "setup") return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
  let idx = state.selectedShipIndex;
  if (idx < 0 || state.placed[idx]) {
    idx = nextUnplacedShip();
    if (idx === -1) return;
    state.selectedShipIndex = idx;
  }
  const def = SHIPS[idx];
  if (!canPlace(state.playerBoard, r, c, def.size, state.orientation)) {
    setPlaceStatus("Can't place a vessel there.");
    audio.miss();
    return;
  }
  placeShip(state.playerBoard, state.playerShips, def, r, c, state.orientation, idx);
  state.placed[idx] = true;
  state.placementOrder.push(idx);
  audio.sonar();
  const next = nextUnplacedShip();
  if (next !== -1) state.selectedShipIndex = next;
  clearPreview();
  renderPlacement();
  if (allPlaced()) setPlaceStatus("All vessels positioned. Deploy when ready.");
  else setPlaceStatus(`Place your ${SHIPS[state.selectedShipIndex].name} (${SHIPS[state.selectedShipIndex].size}).`);
}

function undoLastShip() {
  const id = state.placementOrder.pop();
  if (id === undefined) return;
  const ship = state.playerShips[id];
  if (ship) for (const [r, c] of ship.cells) state.playerBoard[r][c].shipId = null;
  state.playerShips[id] = undefined;
  state.placed[id] = false;
  state.selectedShipIndex = id;
  renderPlacement();
  setPlaceStatus(`Removed ${SHIPS[id].name}. Place it again.`);
}

function setPlaceStatus(msg) { $("place-status").textContent = msg; }

// ============================================================
// Firing
// ============================================================
function fireAt(board, ships, r, c) {
  const cs = board[r][c];
  cs.hit = true;
  if (cs.shipId === null) return { result: "miss" };
  const ship = ships[cs.shipId];
  ship.hits++;
  if (ship.hits >= ship.size) { ship.sunk = true; return { result: "sunk", ship }; }
  return { result: "hit", ship };
}
function allSunk(ships) { return ships.every((s) => s && s.sunk); }

function addLog(who, r, c, result) {
  state.log.push({ who, coord: coordName(r, c), result });
  renderLog();
}
function renderLog() {
  $("log-count").textContent = `${state.log.length} MOVES`;
  const box = $("log-entries");
  box.innerHTML = state.log
    .map((e, i) => {
      const who = e.who === "you" ? "YOU" : "ENEMY";
      return `<div class="log-entry"><span class="who ${e.who}">#${i + 1} ${who}→${e.coord}</span><span class="res ${e.result}">${e.result.toUpperCase()}</span></div>`;
    })
    .reverse()
    .join("");
}

function renderBattle() {
  paintBoard($("battle-player-board"), state.playerBoard, state.playerShips, true);
  paintBoard($("battle-enemy-board"), state.enemyBoard, state.enemyShips, state.phase === "over");
  // hide enemy shots on player board if toggled off (both misses and hits/sunk markers)
  if (!state.showEnemyShots) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const cs = state.playerBoard[r][c];
      if (cs.hit) cellEl($("battle-player-board"), r, c).classList.remove("miss", "hit", "sunk");
    }
  }
  renderFleetStatus();
  renderScore();
  $("turn-counter").textContent = "◎ " + state.turns;
}

function renderFleetStatus() {
  const box = $("fleet-status-list");
  box.innerHTML = "";
  state.playerShips.forEach((ship, id) => {
    if (!ship) return;
    const remaining = ship.size - ship.hits;
    const row = document.createElement("div");
    row.className = "fleet-row" + (ship.sunk ? " sunk" : "");
    const fig = Array.from({ length: ship.size }, () => "<i></i>").join("");
    const pips = Array.from({ length: ship.size }, (_, i) => `<i class="${i >= remaining ? "gone" : ""}"></i>`).join("");
    row.innerHTML = `<span class="ship-figure">${fig}</span><span class="ship-name">${ship.name}</span><span class="pips">${pips}</span>`;
    box.appendChild(row);
  });
}

function renderScore() {
  $("score-ally").textContent = state.allyHits;
  $("score-enemy").textContent = state.enemyHits;
  $("fill-ally").style.width = (state.allyHits / TOTAL_SHIP_CELLS) * 100 + "%";
  $("fill-enemy").style.width = (state.enemyHits / TOTAL_SHIP_CELLS) * 100 + "%";
}

function setBattleStatus(msg, alert) {
  const el = $("battle-status");
  el.textContent = msg;
  el.className = "top-status" + (alert ? " alert" : "");
}

function flashCell(container, r, c) {
  const d = cellEl(container, r, c);
  if (d) { d.classList.add("shot-flash"); setTimeout(() => d.classList.remove("shot-flash"), 360); }
}

// ============================================================
// Player firing
// ============================================================
function onEnemyCellClick(e) {
  if (state.phase !== "playing" || state.turn !== "player" || state.busy) return;
  const cell = e.target.closest(".cell");
  if (!cell || cell.classList.contains("coord")) return;
  const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
  if (Number.isNaN(r) || state.enemyBoard[r][c].hit) return;

  const res = fireAt(state.enemyBoard, state.enemyShips, r, c);
  addLog("you", r, c, res.result);
  flashCell($("battle-enemy-board"), r, c);
  renderBattle();

  if (res.result === "miss") {
    audio.miss();
    setBattleStatus("Splash — miss. Enemy is firing…");
    endPlayerTurn();
  } else {
    state.allyHits++;
    renderScore();
    if (res.result === "sunk") {
      audio.sunk();
      setBattleStatus(`Direct hit! Enemy ${res.ship.name} destroyed.`);
    } else {
      audio.hit();
      setBattleStatus("Direct hit on an enemy vessel!");
    }
    renderBattle();
    if (allSunk(state.enemyShips)) { endGame("player"); return; }
    // strict alternating turns: still pass to enemy after a hit
    endPlayerTurn();
  }
}

function endPlayerTurn() {
  state.turn = "ai";
  state.busy = true;
  setTimeout(aiTurn, 700);
}

// ============================================================
// AI
// ============================================================
function aiPickTarget() {
  if (state.difficulty === "recruit") return aiPickRandom();
  if (state.difficulty === "admiral") return aiPickProbability();
  return aiPickHuntTarget(); // captain
}

function aiPickRandom() {
  const pool = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!state.playerBoard[r][c].hit) pool.push([r, c]);
  return pool[Math.floor(Math.random() * pool.length)];
}

function aiPickHuntTarget() {
  const ai = state.ai;
  while (ai.targetQueue.length > 0) {
    const [r, c] = ai.targetQueue.shift();
    if (inBounds(r, c) && !state.playerBoard[r][c].hit) return [r, c];
  }
  // hunt with checkerboard parity
  const parity = [], any = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (state.playerBoard[r][c].hit) continue;
    any.push([r, c]);
    if ((r + c) % 2 === 0) parity.push([r, c]);
  }
  const pool = parity.length ? parity : any;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Probability-density targeting (admiral)
function aiPickProbability() {
  const ai = state.ai;
  // If we have unresolved hits, stay in target mode using hunt/target queue first.
  while (ai.targetQueue.length > 0) {
    const [r, c] = ai.targetQueue.shift();
    if (inBounds(r, c) && !state.playerBoard[r][c].hit) return [r, c];
  }
  const board = state.playerBoard;
  const remainingSizes = state.playerShips.filter((s) => s && !s.sunk).map((s) => s.size);
  if (remainingSizes.length === 0) return aiPickRandom();

  const prob = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  // open cell = not yet fired; a known miss blocks placement
  const isMiss = (r, c) => board[r][c].hit && board[r][c].shipId === null;
  const isOpenHit = (r, c) => board[r][c].hit && board[r][c].shipId !== null; // a hit on a not-yet-sunk ship

  for (const size of remainingSizes) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        // horizontal
        if (c + size <= SIZE) {
          let ok = true, coversHit = 0;
          for (let i = 0; i < size; i++) {
            const cc = c + i;
            if (isMiss(r, cc)) { ok = false; break; }
            if (isOpenHit(r, cc)) coversHit++;
          }
          if (ok) {
            const weight = 1 + coversHit * 12;
            for (let i = 0; i < size; i++) if (!board[r][c + i].hit) prob[r][c + i] += weight;
          }
        }
        // vertical
        if (r + size <= SIZE) {
          let ok = true, coversHit = 0;
          for (let i = 0; i < size; i++) {
            const rr = r + i;
            if (isMiss(rr, c)) { ok = false; break; }
            if (isOpenHit(rr, c)) coversHit++;
          }
          if (ok) {
            const weight = 1 + coversHit * 12;
            for (let i = 0; i < size; i++) if (!board[r + i][c].hit) prob[r + i][c] += weight;
          }
        }
      }
    }
  }
  let best = null, bestVal = -1;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c].hit) continue;
    if (prob[r][c] > bestVal) { bestVal = prob[r][c]; best = [r, c]; }
  }
  return best || aiPickRandom();
}

// Cells that are hit but belong to a ship that is not yet sunk (unresolved damage).
function openHits() {
  const res = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const cs = state.playerBoard[r][c];
    if (cs.hit && cs.shipId !== null) {
      const ship = state.playerShips[cs.shipId];
      if (ship && !ship.sunk) res.push([r, c]);
    }
  }
  return res;
}

// Rebuild the AI target queue from the board's unresolved hits. Recomputing from
// the board (instead of a running list) means a sunk ship's cells drop out
// automatically and adjacent wounded ships are tracked as separate clusters, so
// the AI never "forgets" a wounded ship or builds a firing line across two ships.
function aiRegisterHit(r, c, sunk) {
  if (state.difficulty === "recruit") return; // no memory
  const hits = openHits();
  if (hits.length === 0) { state.ai.mode = "hunt"; state.ai.targetQueue = []; return; }
  state.ai.mode = "target";
  state.ai.targetQueue = aiTargetsFromHits(hits);
}
function aiTargetsFromHits(hits) {
  const SIZE2 = SIZE;
  const key = (r, c) => r * SIZE2 + c;
  const hitSet = new Set(hits.map(([r, c]) => key(r, c)));
  const seen = new Set();
  const queue = [];
  const open = (r, c) => inBounds(r, c) && !state.playerBoard[r][c].hit;
  // group adjacent hits into clusters (one cluster ≈ one wounded ship)
  for (const [r, c] of hits) {
    if (seen.has(key(r, c))) continue;
    const stack = [[r, c]], cluster = [];
    seen.add(key(r, c));
    while (stack.length) {
      const [cr, cc] = stack.pop();
      cluster.push([cr, cc]);
      for (const [nr, nc] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]) {
        if (hitSet.has(key(nr, nc)) && !seen.has(key(nr, nc))) { seen.add(key(nr, nc)); stack.push([nr, nc]); }
      }
    }
    const rows = cluster.map((h) => h[0]), cols = cluster.map((h) => h[1]);
    const sameRow = rows.every((x) => x === rows[0]);
    const sameCol = cols.every((x) => x === cols[0]);
    if (cluster.length >= 2 && sameRow) {
      const rr = rows[0], cs = cols.slice().sort((a, b) => a - b);
      for (const cc of [cs[0] - 1, cs[cs.length - 1] + 1]) if (open(rr, cc)) queue.push([rr, cc]);
    } else if (cluster.length >= 2 && sameCol) {
      const cc = cols[0], rs = rows.slice().sort((a, b) => a - b);
      for (const rr of [rs[0] - 1, rs[rs.length - 1] + 1]) if (open(rr, cc)) queue.push([rr, cc]);
    } else {
      // single hit (or an L-shaped cluster of touching ships) — probe all neighbors
      for (const [hr, hc] of cluster)
        for (const [nr, nc] of [[hr - 1, hc], [hr + 1, hc], [hr, hc - 1], [hr, hc + 1]])
          if (open(nr, nc)) queue.push([nr, nc]);
    }
  }
  return queue;
}

function aiTurn() {
  if (state.phase !== "playing") return;
  const [r, c] = aiPickTarget();
  const res = fireAt(state.playerBoard, state.playerShips, r, c);
  addLog("enemy", r, c, res.result);
  flashCell($("battle-player-board"), r, c);

  if (res.result === "miss") {
    if (state.showEnemyShots) audio.miss();
  } else {
    state.enemyHits++;
    aiRegisterHit(r, c, res.result === "sunk");
    if (res.result === "sunk") audio.sunk(); else audio.hit();
  }
  renderBattle();

  if (res.result === "sunk" && allSunk(state.playerShips)) { endGame("ai"); return; }

  // end AI turn -> back to player (strict alternation)
  state.turns++;
  state.turn = "player";
  state.busy = false;
  if (res.result === "miss") setBattleStatus("Enemy missed. Your turn — fire at the enemy grid!");
  else if (res.result === "sunk") setBattleStatus(`Enemy sank your ${res.ship.name}! Your turn.`, true);
  else setBattleStatus("Enemy scored a hit! Your turn.", true);
  renderBattle();
}

// ============================================================
// Game flow
// ============================================================
function startPlacement(difficulty) {
  state = newState();
  state.difficulty = difficulty;
  audio.ensure();
  refreshRankLabels();
  buildGrid($("place-board"), "place");
  renderPlacement();
  setPlaceStatus(`Place your ${SHIPS[0].name} (${SHIPS[0].size}).`);
  syncAudioButtons();
  showScreen("place");
}

function deploy() {
  if (!allPlaced()) return;
  placeAllRandom(state.enemyBoard, state.enemyShips);
  state.phase = "playing";
  state.turn = "player";
  state.busy = false;
  buildGrid($("battle-player-board"), "bp");
  buildGrid($("battle-enemy-board"), "be");
  $("battle-log").classList.add("hidden");
  state.log = [];
  renderLog();
  renderBattle();
  setBattleStatus("Battle stations! Fire at the enemy grid!");
  syncAudioButtons();
  showScreen("battle");
}

function endGame(winner) {
  state.phase = "over";
  state.busy = true;
  renderBattle(); // reveals enemy ships
  const stats = loadStats();
  stats.games++;
  if (winner === "player") { stats.wins++; } else { stats.losses++; }
  saveStats(stats);
  refreshRankLabels();

  const overlay = $("overlay");
  const card = overlay.querySelector(".overlay-card");
  if (winner === "player") {
    audio.win();
    card.classList.remove("defeat");
    $("overlay-badge").textContent = "★";
    $("overlay-title").textContent = "VICTORY";
    $("overlay-title").classList.add("glow");
    $("overlay-sub").textContent = "Enemy fleet destroyed. Well fought, Commander.";
  } else {
    audio.lose();
    card.classList.add("defeat");
    $("overlay-badge").textContent = "☠";
    $("overlay-title").textContent = "DEFEAT";
    $("overlay-sub").textContent = "Your fleet lies at the bottom of the sea.";
  }
  $("overlay-stats").innerHTML =
    `Difficulty: <b>${DIFF_LABEL[state.difficulty]}</b><br>` +
    `Turns: <b>${state.turns}</b> &nbsp; Shots landed: <b>${state.allyHits}</b><br>` +
    `Record: <b>${stats.wins}W</b> / <b>${stats.losses}L</b> &nbsp; Rank: <b>${currentRank()}</b>`;
  overlay.classList.remove("hidden");
}

// ============================================================
// Modal (stats / docs)
// ============================================================
function openModal(title, html) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }

function showStats() {
  const s = loadStats();
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  openModal("SERVICE RECORD", `
    <div class="stat-row"><span>Battles fought</span><b>${s.games}</b></div>
    <div class="stat-row"><span>Victories</span><b>${s.wins}</b></div>
    <div class="stat-row"><span>Defeats</span><b>${s.losses}</b></div>
    <div class="stat-row"><span>Win rate</span><b>${rate}%</b></div>
    <div class="stat-row"><span>Current rank</span><b>${currentRank()}</b></div>
  `);
}
function showDocs() {
  openModal("FIELD MANUAL", `
    <p><b>Objective.</b> Sink all five enemy vessels before they sink yours.</p>
    <p><b>Deploy.</b> Select a vessel, then click your grid to position it. Press <kbd>R</kbd> to rotate, or use Randomize.</p>
    <p><b>Fire.</b> Click a cell on <b>Enemy Waters</b>. Turns alternate — one shot each. A small dot marks a miss; a red ✕ marks a hit.</p>
    <p><b>Threat levels.</b> Recruit fires randomly; Captain hunts &amp; targets after a hit; Admiral adds a probability-density map for ruthless accuracy.</p>
    <p><b>Fleet:</b> Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).</p>
  `);
}
// ============================================================
// Audio button sync
// ============================================================
function syncAudioButtons() {
  document.querySelectorAll("#place-sfx, #battle-sfx").forEach((b) => {
    b.classList.toggle("active", audio.sfxOn);
    b.textContent = audio.sfxOn ? "🔊" : "🔇";
    b.title = audio.sfxOn ? "Mute Sonar" : "Unmute Sonar";
  });
  document.querySelectorAll("#place-music, #battle-music").forEach((b) => {
    b.classList.toggle("active", audio.musicOn);
    b.title = audio.musicOn ? "Stop Music" : "Play Music";
  });
}

// ============================================================
// Wiring
// ============================================================
function wire() {
  // Home
  $("btn-single").addEventListener("click", () => { audio.ensure(); refreshRankLabels(); showScreen("difficulty"); });
  $("btn-stats").addEventListener("click", showStats);
  $("btn-docs").addEventListener("click", showDocs);

  // Difficulty
  document.querySelectorAll(".threat-card").forEach((card) =>
    card.addEventListener("click", () => startPlacement(card.dataset.diff))
  );
  $("diff-back").addEventListener("click", () => showScreen("home"));

  // Placement
  const pb = $("place-board");
  pb.addEventListener("click", onPlaceCellClick);
  pb.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".cell");
    if (cell && !cell.classList.contains("coord")) {
      state.hoverCell = [Number(cell.dataset.r), Number(cell.dataset.c)];
      showPreview(state.hoverCell[0], state.hoverCell[1]);
    }
  });
  pb.addEventListener("mouseleave", () => { state.hoverCell = null; clearPreview(); });
  $("btn-rotate").addEventListener("click", toggleOrientation);
  $("btn-random").addEventListener("click", () => {
    placeAllRandom(state.playerBoard, state.playerShips);
    state.placed.fill(true);
    state.placementOrder = SHIPS.map((_, i) => i);
    audio.sonar();
    renderPlacement();
    setPlaceStatus("Fleet positioned at random. Deploy when ready.");
  });
  $("btn-undo").addEventListener("click", undoLastShip);
  $("btn-deploy").addEventListener("click", deploy);
  $("place-menu").addEventListener("click", () => showScreen("home"));

  // Battle
  $("battle-enemy-board").addEventListener("click", onEnemyCellClick);
  $("battle-menu").addEventListener("click", () => { if (confirm("Abandon this battle and return to base?")) showScreen("home"); });
  $("log-fab").addEventListener("click", () => $("battle-log").classList.toggle("hidden"));
  $("log-close").addEventListener("click", () => $("battle-log").classList.add("hidden"));
  $("toggle-shots").addEventListener("click", () => {
    state.showEnemyShots = !state.showEnemyShots;
    $("toggle-shots").classList.toggle("off", !state.showEnemyShots);
    $("toggle-shots").title = state.showEnemyShots ? "Hide enemy shots" : "Show enemy shots";
    renderBattle();
  });

  // Audio toggles
  document.querySelectorAll("#place-sfx, #battle-sfx").forEach((b) =>
    b.addEventListener("click", () => { audio.sfxOn = !audio.sfxOn; if (audio.sfxOn) audio.sonar(); syncAudioButtons(); })
  );
  document.querySelectorAll("#place-music, #battle-music").forEach((b) =>
    b.addEventListener("click", () => { audio.toggleMusic(); syncAudioButtons(); })
  );

  // Overlay
  $("overlay-again").addEventListener("click", () => { $("overlay").classList.add("hidden"); startPlacement(state.difficulty); });
  $("overlay-home").addEventListener("click", () => { $("overlay").classList.add("hidden"); showScreen("home"); });

  // Modal
  $("modal-close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      if (!screens.place.classList.contains("hidden")) { toggleOrientation(); }
    }
    if (e.key === "Escape") { closeModal(); }
  });
}

function toggleOrientation() {
  state.orientation = state.orientation === "H" ? "V" : "H";
  $("orientation-label").textContent = state.orientation === "H" ? "Horiz" : "Vert";
  // refresh the live preview so the rotated footprint shows without moving the mouse
  if (state.hoverCell && !screens.place.classList.contains("hidden")) {
    showPreview(state.hoverCell[0], state.hoverCell[1]);
  }
}

// ============================================================
// Boot
// ============================================================
state = newState();
wire();
refreshRankLabels();
showScreen("home");
