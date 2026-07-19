# Round 2 PRD — raw capture

Working notes for the retention-research round. Raw thoughts land here
one at a time, get discussed, then promote to the PRD. Nothing in this
file is final until promoted.

Research basis: vault `research/synthesis/daily-retention-loops-geo-game.md`

## Process

- **One PRD, three phased milestones**: M1 score economy + clock-as-pacer
  → M2 round UI + theme + end-of-round breakdown → M3 retention layer
  (map, freezes, rollover) in the end screen's Act 2.
- **Execution model: multiple agents run the PRD simultaneously; best
  result wins promotion to the `ui-updates` branch.** Stories must
  therefore be self-contained and objectively verifiable (typecheck,
  tests, screenshots) so competing outputs can be compared.

## Decided so far (from the aborted grill)

- **Scope: all five candidates are in play** — solved-countries world
  map, earned streak freezes, local-date rollover, end-screen retention
  surface, timer rework — plus new ideas welcome as we go.
- **Timer @ 0:00 — soft zero, tiered solve.** Round continues at 0 pts
  with all hints fully drawn. Solving late still extends the streak and
  fills the map, but as a distinct lower tier (NYT gold/blue star
  analogue: in-time solve vs late solve). Give-up / never-solve is the
  only true fail.
- **Post-zero wrong-guess budget.** After 0:00, a small fixed budget of
  wrong guesses (~3–5, tune in playtest) prevents brute-forcing the
  alphabet; exhausting it = failed.

## Open (not yet discussed)

- Map layer: tier colors, seeding, where it renders, localStorage schema
- End-screen composition & ordering
- Save-state fragility (research gotcha #1: localStorage wipe = robbed
  streak — export code? share-string backup?)
- Badges (timer-keyed vocabulary)

## Raw thoughts (capture below, newest at bottom)

### Thought 1 — score indicator needs to be more interactive

Doesn't like the current score indicator. Wants it more interactive and
engaging while solving: show multipliers, discrete +200 / −100 events in
a really nice, clean way — a sense of urgency, player more engaged
during the attempt.

### Thought 2 — UI hierarchy reorganization

Likes the minimal, focused feel — keep that. But rethink where the
question lives relative to the keyboard. Reorganize the UI to give MORE
hierarchy to: the score, and the question. LESS hierarchy to: the
zoom-in/zoom-out controls.

### Thought 3 — mouse-wheel zoom feels sluggish

Scroll-wheel zoom in/out is very slow — minimal change per scroll.
Unsure if intentional by design, but it feels sluggish. (Likely tuning:
wheel delta → zoom step mapping in the zoom handler.)

### Thought 4 — "hacker" system-experience feel as the cohesive theme

The experience should capture the feeling of doing something hack-y — a
hacker/system experience: the player trying to figure something out
while stuff is happening in the background. This is where the clock
earns its place — urgency fits the hacking fantasy — but today the
experience isn't fully cohesive around that theme. (Ties back to
thought 2's UI rework; suggests the reveal animations, dot-matrix clock,
scrambling neighbor labels etc. should all read as one "system being
cracked" aesthetic.)

### Thought 5 — post-game review / score breakdown screen

When the round completes, show a game review/breakdown: time left on
the clock (+ what it added to the score), wrong letters and what they
cost, etc. — itemized, very visual. Reference: the score breakdown
screen after a Street Fighter match. Capture some element of that.
(Dovetails with the research's "end screen as the retention surface" —
this becomes the round-recap half of that screen.)

### Thought 6 — make the ocean hatching feel like water

Likes the diagonal ocean hatch lines. Wants to explore making them
actually FLOW like water — can be very subtle, but give the appearance
of an ocean. Problem today: at slight zoom-out (not far out) the lines
are overwhelming. Rethink how the ocean feel is surfaced around land —
possibly zoom-dependent density/animation.

### Thought 7 — letter-placement feedback is stale

The moment of guessing a letter (it appearing — or not — in the answer
blanks) needs UI love. Ideas: a placed letter slides into its slot, etc.
Think the whole guess-feedback experience through; today it's a bit
stale. (Wrong-guess feedback moment included. Should harmonize with the
hacker/system theme from thought 4 and the score events from thought 1.)

### Thought 8 — drop the "Geo #9 — Failed" strip above the keyboard

The "Geo #N — Failed/Solved" text above the keyboard isn't necessary —
the player already knows the outcome (confetti on success, etc.). Fold
outcome + day number into the end-of-round breakdown screen (thought 5)
with score, multipliers, bonuses — surfaced after the review, not as a
persistent strip above the keyboard where it currently sits.

### Thought 9 — move Copy/share into the end-of-round review

The always-visible Copy button isn't needed where it is. Share/copy
belongs in the end-of-round review (thought 5): share results to
Twitter/social from there, plus a copy button for manual pasting into a
tweet/post. Nothing share-related on the main round surface.

### DECIDED (grill Q1) — everything moves to score; clock is a pure pacer

The 60s clock never shrinks or grows: it paces hint reveal and provides
urgency, nothing else. All penalties and bonuses live in points. Time
remaining at solve = a time bonus line in the end breakdown (30s left →
bonus; 0s left → no time bonus). Exact bonus model: Claude to propose,
tune in playtest.

### Thought 12 — add a FUN fact beneath the trivia question

The trivia questions are great and educational — keep them. Add a fun
fact at the very bottom of the question area: lighter, surprising tone.
Reference example: "This country has the largest population without a
single McDonald's." (Answer: Nigeria.) Dataset implication: a second
LLM-generated, human-reviewed `fun_fact` field per country alongside the
existing trivia question. Sub-question for the PRD (open): shown from
round start, or revealed later in the round? — a fun fact this pointed
is effectively another hint, so timing is part of the hint economy.

### DECIDED (grill Q7) — post-zero wrong-guess budget = 5, lockout framing

At 0:00 the round enters "lockout mode": five attempt pips appear
("SYSTEM LOCKOUT IN 5 ATTEMPTS"); each wrong letter burns one;
exhausting them = locked out = the round's true fail. Tunable constant.

### DECIDED (grill Q6) — hacker-theme boundaries

Vibe target: **"a clean modern terminal where a system is being cracked
in real time"** — Bloomberg terminal / defcon badge, not a 1999 hacker
movie. Guardrails (binding on all executing agents):

- Current identity is the BASE, not up for grabs: black field,
  monochrome map, Geist Mono, dot-matrix clock.
- Theme expressed through motion, typography, language: decode/scramble
  animations, terminal-cadence reveals, intrusion-log breakdown labels
  ("TRACE PENALTY", "SPEED BONUS"), the heatmap grid.
- NO cliché kit: no green-rain, no scanline/CRT filters, no skull
  ASCII. Existing green stays the single accent (correct keys, heatmap,
  score positives); red only for negative score events if needed.

### DECIDED (grill Q5 + thought 11) — map/heatmap split

Two long-horizon artifacts, clean separation of duties:

- **World map = pure trophy collection (spatial).** Only solves mark it:
  bright fill = solved in time, dim fill = solved late. Failed days
  leave NOTHING — country stays fresh for a redemption run. Rendered via
  existing WorldMapLayer at full zoom-out; "23/190" counter; per-country
  localStorage record (tier + local date), serialized into the save code.
- **Heatmap = the honest ledger (temporal).** GitHub-contribution-style
  calendar; every day a cell: bright = in-time solve, mid = late solve,
  distinct failed cell, empty = missed, special cell = freeze-covered
  (makes freezes visible + explainable for free). This is the streak's
  visual body (Silverman & Barasch: the visible representation IS the
  mechanic) and on-theme for the hacker aesthetic.
- **Placement:** end screen Act 2 = map (today's country animates its
  fill) + compact heatmap window (~10–12 weeks); full history in a
  stats panel.

### Thought 11 — GitHub-style contribution heatmap for daily outcomes

Show the player's day-by-day history as a GitHub-commit-heatmap-style
calendar grid: solved / failed / missed, per day. (Direct genre
precedent: NYT Crossword's gold/blue star completion calendar — the
research cited it as the adjacent pattern. Cell states available:
solved-in-time, solved-late, failed, missed, freeze-covered.)

### DECIDED (grill Q4) — local-date rollover, clean flip

Daily hash, day number, solve records, and streak all key off the
device's LOCAL calendar date string. Day number = days-since-epoch of
the local date. Idempotent by date: a local date with a recorded result
shows that result — no replays, fly-west edge handled by construction;
fly-east skips accepted (freezes soften them). `?date=` dev override
untouched. **No migration shim — one-time clean flip while the player
base is ~1.**

### DECIDED (grill Q3) — freeze economics + no login + save code

- Freezes: earn 1 per 5 consecutive solved days (late solves count —
  keep the daily bar low), bank caps at 2, auto-apply on a missed day,
  clear message on next visit. Duolingo economics, LinkedIn precedent.
- **No login this round.** Streak + freezes stay localStorage,
  account-free (genre table stakes). Supabase sync remains deferred;
  when it lands: magic-link or anonymous device token, never passwords.
- **M3 story: export/import save code.** Short copyable string encoding
  streak, best, freezes, and solved-countries map state; restore by
  pasting in another browser. De-risks the "robbed streak on data wipe"
  gotcha; becomes the Supabase sync payload later.

**Proposed score model (suggestion, not yet confirmed):**

- Correct letter: +100 × combo multiplier; combo builds with consecutive
  correct letters (×1 → ×1.5 → ×2, capped), shown live next to the score
  (thought 1's multiplier display). Wrong letter resets combo.
- Wrong letter: −points scaled by the unique-letter tiers that used to
  scale the TIME penalty (illustrative: −200 / −150 / −100).
- Zoom-out: −10 per step, hard cap −100 total, pay-once (thought 10).
- Time bonus at solve: remainingSeconds × 10 (existing multiplier).
- Late solve (after 0:00): no time bonus; everything else still counts.
- Give-up / budget exhausted: 0.
- Breakdown line items fall straight out: Letters (+combo), Mistakes,
  Recon cost (zoom), Time bonus, Total — hacker-flavored labels welcome
  ("TRACE PENALTY", "SPEED BONUS").

### Thought 10 — zoom penalties hit SCORE, not the clock (capped)

Today, zooming out completely can drain the timer to zero = failure.
Wrong. Zooming should at most cost POINTS, never time. Model: each
zoom-out step shows e.g. −10 on the score (tying into the live score
readout), with a hard cap of ~−100 total for zooming all the way out.
Once the max penalty is paid, it's paid: zoom back in and out freely,
no re-charging, and zooming back in never refunds points. (Structural
implication: score stops being a pure presentation of remaining seconds
— zoom penalties make it an independently tracked value. Clock keeps
wrong-guess penalties; zoom moves to score-only. Replaces the current
ZOOM_PENALTY_SECONDS / WORLD_REVEAL_SURCHARGE_SECONDS time-cost model.)

