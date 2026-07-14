# Geo

A daily geography guessing game. One target country per day, identical for
every player. Guess its name Hangman-style against a 60-second countdown,
while its outline draws itself and — as the clock runs — three neighboring
countries' outlines and labels gradually reveal too.

## Running it

```
npm install
npm run dev        # local dev server
npm run typecheck
npm run test
npm run build
```

## Game rules

- One flat **60-second clock** per round. Guess letters (on-screen keyboard
  or physical keydown) to fill in the target country's name.
- Zooming out (scroll/pinch, or the +/- buttons) reveals more surrounding
  map context, up to the whole world — but costs time, and panning while
  zoomed is bounded to whatever that zoom level already reveals.
- Round ends when the name is fully guessed (**solved**), the clock hits
  0:00, or you hit **Give up** (both the latter are **failed**).

## Scoring

The score is a live number shown top-right for the whole round — it isn't a
separate point tally kept in sync with the clock, it's a direct rescale of
`remainingSeconds`, since every bonus and penalty below already just adds or
subtracts from that one clock (see `src/lib/game/score.ts`):

```
score = remainingSeconds × 10, plus a flat +500 completion bonus on solve
```

- **Base value**: `500` points, added only if you solve the round. A
  failed/given-up round always scores `0` — no reward for not solving.
- **Per-second multiplier**: `10` points per second left on the clock. This
  is why the score ticks down live in real time while the round is running,
  and why it visibly jumps up or down on the events below (each shown as a
  floating `+20`/`-150` popup next to the score).

**What changes the clock (and therefore the score):**

| Event | Time change | Score change |
|---|---|---|
| Correct-guess streak (every 2 correct letters in a row, reset by any wrong guess) | +2s | +20 |
| Wrong guess, target has ≤5 unique letters | -20s | -200 |
| Wrong guess, target has 6-9 unique letters | -15s | -150 |
| Wrong guess, target has 10+ unique letters | -10s | -100 |
| Crossing a new zoom-out step (every 0.5 zoom crossed) | -5s | -50 |
| Reaching full zoom (the whole world visible), one-time | -20s | -200 |

A correct-guess bonus can never push the clock past its starting 60s (it's
clamped there), which sets the **absolute maximum score at 1,100 points** —
`500 + 60s × 10`, i.e. solving with the full clock still intact: zero wrong
guesses and no zoom-outs.
