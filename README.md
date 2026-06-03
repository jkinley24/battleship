# ⚓ Battleship — Naval Command Center

A single-page, zero-dependency Battleship game you can play online against three
distinct AI opponents. Pure HTML/CSS/JavaScript — no backend, no build step.

The UI and gameplay are modeled on a
neon-green-on-navy terminal/command-center aesthetic, a multi-screen flow, a
battle log, fleet-status readouts, and selectable threat levels.

**Play it:** https://battleship-icpqslcr.devinapps.com

## Features

- **Naval command center home screen** — animated title, rank badge, AI briefing
  cards, and synthesized sonar/combat audio (toggleable).
- **Three AI threat levels**
  - **Recruit (easy)** — fires at random unfired cells, no memory.
  - **Captain (medium)** — *hunt & target*: random search with checkerboard parity,
    then probes neighbors of a hit and extends along the ship's axis.
  - **Admiral (hard)** — *probability density*: each turn it counts how many ways
    every remaining ship could legally sit over each cell and fires at the
    highest-probability square, layered on top of hunt & target.
- **10×10 classic fleet:** Carrier (5), Battleship (4), Cruiser (3), Submarine (3),
  Destroyer (2), with labeled rows (A–J) and columns (1–10).
- **Ship placement** — tap a vessel then tap the grid (live green/red preview),
  press <kbd>R</kbd> to rotate, **Undo Last Ship**, or **Randomize**.
- **Battle HUD** — ALLY/ENEMY hit meters, turn counter, per-ship **Fleet Status**
  health pips, a toggleable **Battle Log** of every shot, and a "hide enemy shots"
  toggle.
- **Strict alternating turns** (one shot per side per turn), hit/miss/sunk visuals,
  and victory/defeat screens.
- **Persistent service record** — wins/losses saved in `localStorage` drive a rank
  that climbs from Ensign to Admiral.
- Responsive layout; works on desktop and mobile.

## How to play

1. From the home screen choose **Single Player**, then pick a **threat level**.
2. Position all five ships (tap-to-place with <kbd>R</kbd> to rotate, or **Randomize**),
   then **Deploy All Vessels**.
3. Click cells in **Enemy Waters** to fire. Turns alternate — one shot each.
4. Sink the entire enemy fleet before the AI sinks yours.

## Run locally

No dependencies. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project structure

```
index.html   # screens: home, threat select, placement, battle, overlays
styles.css   # naval command-center theme (Rajdhani + Share Tech Mono)
game.js      # screen state machine, placement, firing, AI, audio, stats
BUGS.md      # bugs found during development and how they were fixed
```

## How the AI works

**Captain — hunt & target**
- *Hunt:* fire only on cells where `(row + col)` is even (checkerboard parity).
  Since the smallest ship is length 2, parity still finds every ship while halving
  the search space.
- *Target:* after a hit, queue the four orthogonal neighbors. Once two hits share a
  row or column, prioritize extending that line in both directions.
- On a sink, clear the queue and return to hunt mode.

**Admiral — probability density**
- For every not-yet-sunk ship size, slide it over the grid in both orientations and
  count, for each cell, how many legal placements cover it (a known miss blocks a
  placement). Placements that also cover an existing unresolved hit are weighted
  heavily, so the AI naturally finishes off wounded ships.
- Fire at the maximum-probability cell each turn. This concentrates fire where ships
  are most likely to be and mops up gaps efficiently.

## Credits

Built with [Devin](https://devin.ai).
