# Geo — Daily Geography Outline Quiz

> A daily geography game: guess the country by letter, Hangman-style, against a countdown clock, while its outline — and its neighbors' — draw themselves in.
>
> *Generated 2026-07-11 by generate-prd from in-session discussion. Revised same day after a full design-grill session; see revision note below.*

**Revision note:** this PRD supersedes the original draft's core-mechanic
assumption. The vault research proposed multiple-choice guessing across
4 discrete hint stages; a design-grill session on the same day locked a
different mechanic (Hangman-style letter guessing against a single
countdown clock, with continuous rather than staged hints). This
revision reflects the locked design.

## Problem

Players who enjoy daily puzzle games (Wordle, Globle, Worldle, Flagle)
want a geography-flavored entry in that genre, but a single flash-card
"guess the country from its outline" round is over in ~10 seconds and
doesn't sustain the daily-ritual habit those games rely on. Existing
country-guessing games prove the genre works, but none combine a
*drawing* reveal with a *neighbor-cascade* hint structure under real
time pressure — that combination is the differentiator this product is
betting on.

## Solution

A single daily target country, identical for every player. The player
guesses individual letters (literal Hangman) to fill in the target
country's name, racing a flat **60-second countdown clock**. Each wrong
letter guess costs time — the penalty scales inversely with the target's
*unique* letter count (a name with few unique letters, like "Chad," is
otherwise too easy, so misses cost more; a name with many unique letters,
like "Kazakhstan," costs less per miss since there's more ground to
cover). The clock drives everything: the target's outline draws itself
alone for the first ~40–50% of the round, then three neighboring
countries' outlines begin appearing too, positioned at their real-world
compass direction relative to the target, each with a name label that
reveals letters in randomized order automatically. The round ends when
the player solves it, gives up, or the clock hits zero. A streak counter
(persisted locally for now) tracks consecutive days solved, and a
spoiler-safe shareable result — day number, time remaining or "failed,"
and a colored guess-pattern row — lets players compare outcomes without
revealing the answer to those who haven't solved it yet.

## UX flow

1. **Round start.** Clock begins at 0:60. The target country's outline
   starts drawing. A trivia fact about the country is shown overlaid on
   the outline while it draws. Hangman-style blanks for the target's
   name are shown, with no letters filled yet.
2. **Guessing.** The player guesses letters one at a time. A correct
   letter fills every instance of that letter in the name at once
   (standard Hangman behavior). A wrong letter subtracts time from the
   clock — the exact amount depends on the target's unique-letter-count
   tier (illustrative: -20s for ≤5 unique letters, -15s for 6–9, -10s
   for 10+; needs playtesting).
3. **Neighbor reveal (staggered onset).** Once time remaining drops
   below the ~40–50% threshold, three neighbor-country outlines begin
   drawing in at their real-world compass position around the target
   (nearest-anchor snapping, with a collision rule for neighbors sharing
   a direction). Each neighbor's redacted name label reveals its letters
   in randomized order as time continues to elapse — this is automatic,
   not something the player guesses.
4. **Round end.** Three ways out: (a) the player fills in the full
   target name correctly → **solved**, streak increments; (b) the
   player taps "give up" → **failed** immediately, streak resets; (c)
   the clock reaches 0:00 → **failed**, streak resets.
5. **Result & share.** On solve: share string shows the day number, time
   remaining, a spoiler-safe guess-pattern row (colored squares for
   correct/wrong letters, no letters shown), and the country's flag/name
   (safe to reveal — the player already solved it). On failure: same
   format minus the flag/country identity, which stays hidden.

## Technical architecture

```
Scaffold:      Vite + React + TypeScript
                 - Fully static app for now — no backend at all until
                   Supabase lands later — so a zero-config static build
                   is the right fit (deploy target not yet chosen, but
                   trivially Vercel/Netlify either way)

Frontend:      React + Framer Motion
                 - Outline draw-on via `pathLength`/`pathSpacing`
                   animation props, reused for the target AND all 3
                   neighbor slots
                 - Hangman input UI: on-screen keyboard is the visual
                   source of truth (shows per-letter guessed/correct/
                   wrong state on the keys), with physical keydown
                   layered on top as a desktop convenience — both paths
                   dispatch to the same guess-submission handler, same
                   pattern Wordle uses. Plus a countdown readout
                   (small, numeric, top-right corner).

Geo data:      world-atlas TopoJSON, 50m resolution
                 - 10m rejected: stutters on complex coastlines
                   (Indonesia, Philippines, Norway)
                 - 110m rejected: too coarse to be recognizable
                 - Rendered with an equal-area or equirectangular
                   projection (not Mercator — pole distortion, e.g.
                   oversized Greenland, hurts recognizability)

Neighbor data: restcountries.com `borders` field
                 - per-country array of neighboring ISO codes
                 - compass-direction slot assignment computed from each
                   neighbor's centroid relative to the target's
                 - countries with >3 neighbors: deterministic subset,
                   seeded identically to the daily-country selection
                 - countries with 0 neighbors (islands): included in
                   rotation as harder days, no neighbor hints shown

Daily puzzle:  Deterministic client-side hash, no backend
                 - `hash(UTC date) mod country_count` picks today's
                   target country; the same scheme picks the neighbor
                   subset when the target has >3 neighbors
                 - Every player computes the same result locally —
                   guarantees the "same country for everyone" rule
                   without a server, and works for any future date
                   automatically (no schedule file to maintain)
                 - Requires the full country/outline/trivia dataset to
                   ship in the client bundle, acceptable at ~190
                   countries

Game state:    Client-side state machine — clock, penalty application,
               letter-guess tracking, hint-threshold triggers

Persistence:   localStorage for streak state, for now.
                 - Supabase (Postgres) explicitly DEFERRED — not part
                   of the initial build. When added later, its only
                   job is cross-device streak sync; there is no
                   numeric leaderboard planned even then.

Trivia:        Static per-country fact data, LLM-generated for all
               ~190 countries with a one-time human review pass before
               shipping (not hand-curated from scratch, not pulled live
               from an API at runtime).
```

Rejected alternatives (kept as a record so they aren't re-litigated):
Leaflet and MapLibre GL — both built for pannable/zoomable tile maps,
wrong tool for several fixed-viewport animated outlines. GSAP + DrawSVG
is a viable fallback for finer animation control if Framer Motion's
`pathLength` proves insufficient (GSAP went fully free in April 2025).

## Data model

```
Country
  iso_code        string (primary key, e.g. "CH")
  name             string
  unique_letters   int (derived from name; drives penalty tier)
  outline_path     SVG path data (from world-atlas TopoJSON, 50m)
  centroid         { lat, lng }  (drives compass-slot placement)
  neighbor_codes   string[]  (from restcountries.com `borders`)
  trivia_fact      string  (LLM-generated, human-reviewed)
  is_island        boolean  (0 land neighbors)

DailyPuzzle
  date                 date (UTC, primary key — same country for
                          every player on a given date)
  target_iso_code      string (FK -> Country.iso_code)
  neighbor_iso_codes   string[]  (up to 3, deterministic subset when
                          the target has more than 3 neighbors, seeded
                          by `date`)
  neighbor_slots       { iso_code, compass_direction }[]  (resolved
                          anchor position per neighbor, with collision
                          handling applied)

PenaltyTier   (config, not per-country data)
  min_unique_letters   int
  max_unique_letters   int
  penalty_seconds      int
  # illustrative starting values: (0,5,20) (6,9,15) (10,null,10)

PlayerRound   (localStorage, client-side, for now)
  puzzle_date      date
  outcome          "solved" | "failed" | "gave_up"
  time_remaining   int | null  (seconds, null if failed)
  share_string     string

StreakState   (localStorage, client-side, for now — Supabase later
               for cross-device sync only)
  current_streak     int
  longest_streak     int
  last_played_date   date
```

## Pricing

Free, no monetization, for v1 — a deliberate constraint carried through
the entire stack (free/open geo data, free animation tooling, no paid
backend tier required while using localStorage). Revisit only if the
game finds real traction; not in scope now.

## Roadmap

- **v0 (prototype):** Single hard-coded country, draw-on outline
  animation working end to end with real 50m TopoJSON data, no
  Hangman/clock/scoring yet. Validates the core animation feel and
  projection choice.
- **v1 (MVP):** Full loop — Hangman letter guessing, 60s clock with
  unique-letter-scaled penalties, staggered target→neighbor hint reveal
  with compass-accurate positioning, give-up action, localStorage-backed
  streak, spoiler-safe share string, LLM-generated+reviewed trivia for
  all countries, disputed-territory handling left at data-source
  default.
- **Later:** Supabase-backed cross-device streak sync (still no numeric
  leaderboard), playtested tuning of the 60s budget and penalty tiers,
  refined compass-anchor collision handling, possible untimed/practice
  mode for accessibility.

## Risks

- **60-second flat clock may be miscalibrated** for very long or very
  short country names even with unique-letter-scaled penalties — needs
  aggressive playtesting across name-length extremes (e.g. "Chad" vs.
  "Democratic Republic of the Congo") to avoid rounds feeling either
  unwinnable or trivial.
- **Coastline complexity can stutter the draw animation** for countries
  with highly detailed borders (Indonesia, Philippines, Norway's
  fjords) even at 50m resolution, and now this risk applies to up to 4
  simultaneous outlines (target + 3 neighbors) instead of 1.
- **Compass-slot collisions are unresolved in detail.** Multiple
  neighbors can round to the same direction anchor (e.g. a country with
  two neighbors both roughly east); the exact resolution rule isn't
  designed yet and affects visual layout correctness.
- **Deliberation time is now part of the score**, not just guess
  accuracy — a player who thinks slowly between correct guesses loses
  real time even without a wrong answer. This is an accepted tradeoff of
  a countdown-based daily game, but worth monitoring in early feedback.
- **Inheriting the geo-data source's disputed-territory defaults**
  (rather than an explicit reviewed policy) means edge cases could
  surprise players; accepted as a low-priority risk for a hobby project.
- **LLM-generated trivia needs a real review pass** — ungrounded or
  subtly wrong trivia would undermine trust in the whole game if it
  ships unreviewed.

## Open questions

- Exact time-penalty values per unique-letter tier (illustrative only:
  -20s/-15s/-10s) — needs playtesting.
- Exact compass-anchor scheme (how many anchor points, e.g. 8-point
  compass) and the collision-resolution rule when multiple neighbors
  round to the same direction.
- Exact deterministic-subset selection algorithm for countries with
  more than 3 neighbors (seeded by date, but the selection rule itself
  — e.g. largest shared border, alphabetical, hashed order — isn't
  specified).
- Exact visual format of the share string's guess-pattern row (colors,
  emoji set).
- Trivia fact review process specifics — who reviews, what bar
  "verifiably true" needs to clear before a fact ships.
- Timing/trigger for migrating streak persistence from localStorage to
  Supabase (deferred indefinitely for now, no target date).
