# ⚓ Battleship — Play vs AI

A single-page, zero-dependency Battleship game you can play online against an AI opponent. Pure HTML/CSS/JavaScript — no backend, no build step.

**Play it:** https://battleship-icpqslcr.devinapps.com

## Features

- **10×10 classic Battleship** with the standard fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
- **Two ways to place ships**
  - Manual placement with live hover preview (green = valid, red = invalid), plus a Rotate toggle for horizontal/vertical.
  - One-click **Place Randomly**.
- **AI opponent** with two difficulties:
  - **Easy** — fires at random unfired cells.
  - **Hard** — *hunt & target* strategy with checkerboard parity during hunt, neighbor targeting after a hit, and line extension once two hits line up. Wins in ~59 shots on average vs ~95 for random.
- Hit / miss / sunk feedback, fleet-destroyed win & lose states, and a New Game button.
- Responsive layout; works on desktop and mobile.

## How to play

1. Place all five ships (manually or via **Place Randomly**).
2. Click **Start Battle**.
3. Click cells in **Enemy Waters** to fire. A hit lets you fire again; a miss passes the turn to the AI.
4. Sink the entire enemy fleet before the AI sinks yours.

## Run locally

No dependencies. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project structure

```
index.html   # markup + layout
styles.css   # styling/theme
game.js      # game state, rendering, placement, firing, and AI logic
BUGS.md      # bugs found during development and how they were fixed
```

## How the AI works (Hard mode)

- **Hunt:** fire only on cells where `(row + col)` is even (checkerboard parity). Since the smallest ship is length 2, parity guarantees every ship is still found while halving the search space.
- **Target:** after a hit, queue the four orthogonal neighbors. Once two hits share a row or column, prioritize extending that line in both directions, which sinks ships quickly.
- On a sink, clear the target queue and return to hunt mode.
