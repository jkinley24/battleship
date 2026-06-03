# Bugs Found & Fixed

This document records the issues found while building and debugging the Battleship game, how each was diagnosed, and how it was fixed. Testing was done both through the browser UI and by driving the game's internal functions from the browser console (the game is a classic script, so `state`, `fireAt`, `aiPickTarget`, etc. are reachable for automated checks).

---

## 1. Invalid CSS color values broke the enemy-cell hover effect

**Symptom:** Hovering over a cell in *Enemy Waters* produced no visual highlight, so it was hard to tell which cell you were about to fire at.

**Root cause:** Two CSS custom properties had malformed (non-hex) values:

```css
--grid-line: #1d3consequence;   /* not a valid color */
--water-hover: #1d4straight;    /* not a valid color */
```

The enemy hover rule `.board.enemy .cell:not(.fired):hover { background: var(--water-hover); }` resolved to an invalid value, so the browser ignored it and no hover color appeared.

**Fix:** Replaced the invalid tokens with valid hex colors (`--grid-line: #1d3a52`, `--water-hover: #1d4b73`). Hover highlight now renders correctly.

---

## 2. "Hard" AI was no better than random — caused by registering hits on misses

**Symptom:** While validating the AI, an automated console simulation showed the *Hard* AI needing ~94 shots on average to clear the board — essentially the same as the random *Easy* AI (~95). The hunt-and-target logic appeared to provide no benefit.

**Diagnosis:** The bug was in the *test harness*, but it exposed a real correctness requirement of the AI. The simulation called `aiRegisterHit()` after **every** shot, including misses. Registering a miss as a hit polluted the AI's target queue with neighbors of empty water and forced it into "target" mode constantly, destroying its efficiency.

**Fix / verification:** Confirmed the real game loop (`aiTurn`) only calls `aiRegisterHit()` on a `hit` or `sunk` result — never on a miss — which is the correct behavior. After correcting the simulation to match, the Hard AI averages **~59 shots** vs ~95 for random, with no repeated or out-of-bounds shots across 50 simulated games. This locked in the invariant: **the target queue must only ever be seeded from actual hits.**

---

## 3. Double-firing during the AI's turn

**Symptom (potential):** After the player missed and the turn handed off to the AI (which fires on a short delay), rapid clicking on *Enemy Waters* could let the player sneak in extra shots during the AI's turn.

**Fix:** Added a `state.busy` input lock. It is set to `true` the moment the player misses (before the AI's `setTimeout`) and only cleared when the AI's turn fully ends on a miss. `onEnemyCellClick` early-returns while `busy` is set or when it isn't the player's turn. Verified that clicks during the AI's thinking delay are ignored.

---

## 4. Placement validation: out-of-bounds and overlapping ships

**Symptom (potential):** Ships could be placed off the edge of the board or on top of each other.

**Fix / verification:** `canPlace()` checks every cell a ship would occupy for board bounds and existing occupancy before allowing placement, and the same check powers the live hover preview (green = valid, red = invalid). Verified in the UI that a horizontal Carrier near the right edge previews red and cannot be placed, and confirmed via console that random placement of the full fleet never overlaps (17 ship cells == 17 occupied cells across many trials).

---

## 5. Already-fired cells could be re-targeted

**Symptom (potential):** Clicking the same enemy cell twice, or the AI re-selecting a cell it already shot, would waste turns or corrupt state.

**Fix:** `onEnemyCellClick` returns early if the targeted cell is already `hit`. The AI's `aiPickTarget()` filters out any already-hit cell both when draining its target queue and when hunting. Confirmed across 50 simulated AI games that no shot ever lands on a previously-fired cell.

---

# Redesign: Naval Command Center (shipbattle.dev parity)

The UI/UX was reworked into a multi-screen "naval command center" inspired by
[shipbattle.dev](https://shipbattle.dev). The following issues were found and fixed
during that rewrite.

## 6. Invalid CSS color token (regression of the original hover bug)

**Symptom:** During the rewrite a CSS custom property was generated with a malformed
value: `--ship-edge: #5e7governs;` — not a valid color.

**Why it matters:** Exactly like bug #1, an invalid `var()` value is silently dropped
by the browser. Any rule relying on that token would have rendered with no color and
no error. Caught on review of the new `styles.css`.

**Fix:** Replaced with a valid hex (`--ship-edge: #6a7f96`). Reinforces the standing
rule: **all CSS custom properties must hold valid values, since failures are silent.**

---

## 7. Coordinate headers shifted the grid cell lookup

**Symptom:** The redesigned boards add a row of column labels (1–10) and a column of
row labels (A–J), so each board grid is 11×11 of DOM children, not 10×10. The original
`cellEl()` math assumed a flat 10×10 grid and pointed at the wrong element.

**Fix:** `buildGrid()` now emits a corner + 10 header cells, then for each row a header
+ 10 play cells. `cellEl(container, r, c)` indexes with `(r + 1) * (SIZE + 1) + (c + 1)`
to skip the header row and per-row header. Verified by firing at known enemy ship cells
read from `state.enemyShips` and confirming the correct cells flip to hit/miss.

---

## 8. Strict alternating turns vs. "extra shot on hit"

**Behavior change:** The original build let the player fire again after a hit. The
reference site uses **strict alternation** — exactly one shot per side per turn,
regardless of hit or miss. The battle loop was changed so both `onEnemyCellClick` and
`aiTurn` always pass the turn after resolving a shot. The `state.busy` input-lock is
still held during the AI's delayed turn so the player can't sneak in shots. Verified in
the browser: after a player hit, the status switches to the enemy's turn and the player
board cannot be re-fired until control returns.

---

## 9. Admiral (probability-density) AI — legality & termination

**Risk:** The new hard AI builds a probability map by sliding every remaining ship over
the board. Bugs here could pick an already-fired cell, ignore known misses, or fail to
finish a wounded ship.

**Fix / verification:** Placements are rejected if they cross a known miss; cells that
already cover an unresolved hit get a large weight so the AI prioritizes sinking wounded
ships; the final selection skips any already-fired cell and falls back to a random
untried cell if the map is empty. Confirmed `aiPickProbability()` returns a valid,
unfired coordinate (e.g. `[4,4]`) with no exceptions, and that hunt/target queue
draining takes precedence so partially-hit ships are pursued immediately.
