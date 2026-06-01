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
