# Geo Round 2: Score Economy, Hacker Cohesion & the Retention Layer

> Rebuild the round's economy around a first-class score with the clock as pure pacer, commit the UI to a clean "system being cracked" aesthetic with a Street-Fighter-style end-of-round breakdown, and ship the research-backed retention layer: trophy world map, contribution heatmap, earned streak freezes, local-date rollover, and a save code.
>
> *Generated 2026-07-19 by generate-prd from in-session discussion (PRD-round2.notes.md: 12 raw thoughts + 7 grill decisions; research basis: vault `research/synthesis/daily-retention-loops-geo-game.md`).*
>
> **Execution note:** this PRD will be executed by multiple competing agents on separate branches (Orca-managed); the best result is promoted to `ui-updates`. Every requirement is therefore written to be objectively verifiable — typecheck, tests, and screenshot evidence — so competing outputs can be compared. The theme guardrails in "Solution" are binding on all agents.

## Problem

**The round doesn't use its own tension.** The score is a passive restatement of the clock (500 + 10/sec), so nothing about it engages the player mid-solve; guess feedback is static (letters just appear); the UI hierarchy misranks its elements (zoom controls outrank the question and score); and the game's strongest instincts — dot-matrix clock, scrambling labels, draw-in reveals — don't add up to a cohesive identity.

**The clock punishes instead of paces.** Sudden death at 0:00 (and zoom-outs that can drain the clock to zero by themselves) injects an anxiety cliff into a genre whose retention engine is calm daily ritual, and punishes slower players on speed rather than knowledge. The retention research (Ovsiankina resumption, SDT harmonious-engagement evidence, "even a failed round's reveal feels good") argues directly against it.

**The round ends with a shrug.** Outcome is a redundant text strip ("Geo #9 — Failed") above the keyboard, the Copy button floats mid-surface, and there is no moment that stories the score or stages the reason to come back tomorrow.

**The long horizon is empty.** No collection layer (the research's strongest-evidence gap — no competitor ships a solved-countries map and players hand-build them), a hard streak reset the habit literature says is wrong (a single missed day doesn't derail habits; Duolingo's freezes are the best-documented retention mechanic in consumer software), a UTC rollover that hands US players a new country mid-afternoon, and a localStorage-only streak one browser wipe from the genre's worst failure mode: the player who was robbed, not beaten.

## Solution

### M1 — Score economy: the clock becomes a pure pacer

The 60-second clock never gains or loses time. It paces hint reveal (outlines/labels finish at 0:00, unchanged) and provides urgency. All costs and rewards move to a first-class score:

| Event | Effect (initial values; all tunable constants) |
|---|---|
| Correct letter | +100 × combo multiplier |
| Combo | consecutive correct letters step the multiplier ×1 → ×1.5 → ×2 (cap); any wrong letter resets to ×1 |
| Wrong letter | −points scaled by the target's unique-letter count (fewer unique letters = harsher): −200 / −150 / −100 |
| Zoom-out | −10 per step crossed, hard cap −100 total, pay-once (re-crossing seen territory never re-charges; zooming back in never refunds) |
| Time bonus | remaining seconds × 10, awarded at solve; 0 seconds left = no time bonus |
| Give-up or lockout | final score 0 |

**Soft zero + lockout mode.** At 0:00 the round continues: all hints fully drawn, score events still live, no time bonus available. Five attempt pips appear ("SYSTEM LOCKOUT IN 5 ATTEMPTS"); each wrong letter burns one; exhausting them = locked out = the round's only failure besides give-up.

**Tiered solves.** Solved in-time and solved-late are distinct recorded outcomes. Both extend the streak and fill the map (late = lower tier); the tier is visible in the breakdown, map fill, heatmap cell, and share string.

**Score display (in-round).** Prominent live readout showing the running score, the current combo multiplier, and transient event popups (+200 / −100) styled cleanly — urgency without clutter.

### M2 — Round UI, theme cohesion, end-of-round experience

**Hierarchy rework.** Score and question gain prominence; zoom controls recede; the question's position relative to the keyboard is redesigned. The minimal, focused feel is preserved.

**Guess feedback.** Correct letters animate into their slots (slide/decode); wrong guesses get a visible reject moment; the whole letter-placement experience harmonized with the theme.

**Wheel zoom responsiveness.** Scroll-wheel zoom currently feels sluggish (minimal change per wheel event) — retune the delta→zoom mapping.

**Theme (binding guardrails for all executing agents).** Vibe target: *"a clean modern terminal where a system is being cracked in real time"* — Bloomberg terminal / defcon badge, not a 1999 hacker movie.

- The current identity is the base, not up for grabs: black field, monochrome map, Geist Mono, dot-matrix clock.
- Express the theme via motion, typography, and language: decode/scramble animations, terminal-cadence reveals, intrusion-log breakdown labels ("TRACE PENALTY", "SPEED BONUS"), the heatmap grid.
- NO cliché kit: no green-rain, no scanline/CRT filters, no skull ASCII. The existing green stays the single accent (correct keys, heatmap, score positives); red only for negative score events if needed.

**Ocean treatment.** Keep the diagonal hatch identity but make it read as water — very subtle flow/movement, with zoom-dependent density so mid-zoom no longer feels overwhelming.

**Fun fact line.** Beneath the educational trivia question, a lighter surprising fun fact about the target (e.g. "This country has the largest population without a single McDonald's"). New human-reviewed `fun_fact` dataset field. Reveal timing is an open question (it is effectively a hint).

**End-of-round screen, two acts** (replaces the outcome strip and floating Copy button — both removed from the round surface):

- **Act 1 — the breakdown.** Street-Fighter-style itemized score recap: letters (+combo), mistakes, recon cost (zoom), time bonus, total — animated line items, intrusion-log labels, outcome and day number fold in here.
- **Act 2 — the return loop.** World map with today's country animating its fill, compact heatmap window (~10–12 weeks), streak + freeze state, countdown to tomorrow's round, and the share/copy actions (Twitter-ready text + copy button).

### M3 — Retention layer

- **World map = trophy collection (spatial).** Existing WorldMapLayer at full zoom-out; solved countries filled (bright = in-time, dim = late); failed days leave *nothing* (country stays fresh for redemption); "23/190" counter.
- **Heatmap = honest ledger (temporal).** GitHub-contribution-style calendar; per-day cells: bright (in-time), mid (late), distinct failed cell, empty (missed), special freeze-covered cell — making freezes visible and self-explanatory. Full history in a stats panel.
- **Streak freezes.** Earn 1 per 5 consecutive solved days (late solves count — keep the daily bar low), bank caps at 2, auto-apply on a missed day, explicit message on next visit. Break framing celebrates the ended streak's record; never shame.
- **Local-date rollover, clean flip.** Daily hash, day number, records, and streak key off the device's local calendar date; day number = days-since-epoch. Idempotent by date (a recorded date always shows its result — no replays; fly-west edge handled by construction; fly-east skips accepted). No migration shim. `?date=` dev override untouched.
- **Save code.** Short copyable string (versioned, encoded) capturing streak, best, freezes, map, and heatmap state; paste to restore in another browser. Insurance against the "robbed streak" failure mode; later becomes the Supabase sync payload.

## UX flow

1. **Round start** — target + neighbors draw in over 60s exactly as today; question + fun fact area; score readout live at ×1.
2. **Solving** — letters slide/decode into slots on correct (combo climbs, +popup), reject animation + −popup on wrong (combo resets), zoom costs points (−10 … cap −100).
3. **0:00 — lockout mode** — hints complete, five attempt pips appear, guessing continues; no time bonus is now possible.
4. **Round end** (solve, give-up, or lockout) → **Act 1 breakdown**: animated line-item recap → total.
5. **Act 2 return loop** — map fill animation for today's country, heatmap window, streak/freeze state, countdown to tomorrow, share/copy.
6. **Post-round** — map exploration stays free (zoom charges stop, as today); trivia + fun fact remain readable.

## Technical architecture

Existing seams this round builds on (do not regress): the RoundCore pure reducer (`lib/game/round.ts`), the boot seam (`lib/game/boot.ts`, `?date=` injection), the scene/zoom math (`lib/geo/scene.ts`, `lib/game/zoom.ts`).

```
M1 (economy)
  lib/game/round.ts     RoundCore grows: score, combo, zoomPenaltyPaid,
                        lockoutAttempts, outcome ∈ {solved, solved_late,
                        locked_out, gave_up}; all constants exported/tunable
  lib/game/clock.ts     loses penalty/bonus mutation — fixed 60s countdown only
  lib/game/score.ts     rewritten: event-sourced score, no longer f(clock)
  lib/game/zoom.ts      step detection stays; cost becomes a score event

M2 (UI/theme/end screen)
  components/ScoreReadout    live score + multiplier + event popups
  components/EndScreen       Act 1 breakdown + Act 2 return loop
                             (absorbs ShareResult; outcome strip deleted)
  components/Keyboard,
  answer slots               guess feedback animations
  WorldMapLayer              ocean hatch flow + zoom-dependent density
  scripts/generate-*         fun_fact field in the country dataset

M3 (retention)
  lib/streak/           freezes (earn/bank/auto-apply), outcome history
  lib/game/dailyCountry local-date hash + days-since-epoch day number
  components/Heatmap    contribution calendar
  components/WorldMap fill layer (trophy tiers over WorldMapLayer)
  lib/save/             versioned save-code codec (encode/decode/migrate)
```

Verification bar for every story (multi-agent comparability): `npm run typecheck`, `npm run test -- --run` green, plus a screenshot of the affected surface via the dev server (`?date=` override for reproducible days). RoundCore economy changes must land as reducer tests first-class (the reducer being pure is the point of the seam).

## Data model

All persistence stays localStorage (no backend). Illustrative shape — final field names are the implementer's choice, but the save code must version whatever ships:

```jsonc
// per-day outcome ledger (heatmap + streak source of truth)
"geo.days": {
  "2026-07-19": { "outcome": "solved",       // solved | solved_late | failed
                  "score": 1240, "target": "LUX" }
  // missing key = missed day; freeze-covered days recorded when applied:
  // "2026-07-20": { "outcome": "frozen" }
},
// trophy map (spatial; solves only, failure leaves no trace)
"geo.map": { "LUX": { "tier": "in_time", "date": "2026-07-19" } },
// streak + freeze economy
"geo.streak": { "current": 4, "best": 9, "freezes": 1,
                "earnProgress": 3 /* of 5 */ },
// save code = versioned, encoded bundle of the above
"v1.<base64url(json)>"
```

Country dataset gains one field: `fun_fact: string` (LLM-generated, human-reviewed, same pipeline and review bar as the existing trivia question).

## Pricing

Free, no monetization — a standing v1 decision (CLAUDE.md), reaffirmed: no part of this round introduces purchasable anything; freezes are earned only.

## Roadmap

- **M1 — economy.** Clock-as-pacer; event-sourced score with combo; zoom→score cap; soft zero + lockout(5); tiered outcomes; reducer tests for every rule. *Everything else renders on top of this.*
- **M2 — round surface.** Hierarchy rework; guess-feedback animations; wheel-zoom tuning; theme pass within guardrails; ocean flow; fun-fact line; end screen Acts 1+2 (share/copy moves in, outcome strip dies).
- **M3 — retention.** Trophy map; heatmap; freezes + break framing; local-date clean flip; save code.
- **Later (explicitly out of scope this round):** Supabase sync (save code becomes its payload); record-keeping badges (timer-keyed vocabulary from the research); notifications (rejected for v1 per research); streak-based score multiplier (parked in ideas.md).

## Risks

- **The economy is unprecedented in the genre** — no competitor has a countdown, so every value above (letter points, combo curve, penalty tiers, lockout budget) is a guess until playtested. Mitigation: all constants in one place, reducer-tested, tuned live.
- **Score decoupling touches the most-tested code in the repo.** RoundCore/score/clock/zoom tests (128 passing) encode the old economy; stories must migrate tests deliberately, not delete them.
- **Multi-agent divergence.** Competing agents interpreting "hacker theme" or "breakdown screen" differently is the point — but only within the binding guardrails; a submission violating them (green-rain, CRT filters, non-monochrome map) fails review regardless of quality.
- **WorldMapLayer perf debt compounds.** It is unmemoized and 3×-tiled (known audit concern); M3 adds a full-zoom end-screen render plus fill layers. A perf check (no visible jank at end-screen open) belongs in M3 acceptance.
- **Local-date flip orphans in-flight UTC records** — accepted deliberately while the player base is ~1; do not build a shim.
- **Lockout mode is weakest on short names** (a 4-unique-letter target leaves little to guess with 5 free misses); acceptable at current tuning, revisit with the penalty tiers.
- **Fun facts can spoil** — a too-pointed fact is a free hint; the review pass must grade hint-strength, and reveal timing is deliberately open.

## Open questions

- Fun-fact reveal timing: visible from round start, or revealed partway (it is effectively a hint — where does it sit in the hint economy)?
- Exact tuning values: letter points, combo curve/cap, wrong-letter tiers, zoom step cost, time-bonus multiplier, lockout budget — all shipped as constants, all playtest-fodder.
- Day-number continuity: does "Geo #N" numbering continue from the current UTC sequence (today = #9) or restart from the local-date epoch? (Cosmetic, but visible in every share string.)
- Share-string format for the new outcomes: how do solved-late and locked-out render in the emoji/pattern row without spoiling?
- Heatmap failed-cell treatment: color alone is a colorblind trap — needs a shape/glyph distinction; exact encoding undecided.
- Freeze auto-apply edge: applied at next-visit time or lazily recomputed from the ledger? (Affects save-code merge semantics.)
- Fun-fact review bar: same "verifiably true" process as trivia review — who reviews, and is hint-strength part of the rubric?
