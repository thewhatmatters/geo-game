# Ideas (parking lot)

Things worth doing eventually, deliberately not scoped or designed yet —
notes to pick up later, not commitments.

## Social sharing on solve

A dedicated share-to-social action when a round is solved, beyond the
existing spoiler-safe copy-to-clipboard share string (`ShareResult`).
Rough shape, needs real design before building:

- Likely the native Web Share API (`navigator.share`) where available,
  falling back to direct intent links (X/Twitter, Facebook) or the
  existing clipboard copy — same layered-fallback shape the rest of this
  project already uses (e.g. dual-mode skills).
- Probably wants to carry the score (see `src/lib/game/score.ts`) and/or
  the confetti moment as the shareable "hook," not just the existing
  guess-pattern row.
- Ties into the already-flagged **B2** roadmap item in `PRD.md`
  (social login) — sharing *to* an account vs. sharing a generic link are
  different scopes; this note is about the generic link/share-sheet
  version, which doesn't need an account at all and could ship well
  before B2's login work.
- Needs a decision on what's actually in the shared content (score only?
  country name, only if solved — spoiler-safe rule already established
  elsewhere? a generated image/card, like Wordle's colored-square grid?).

Tabled for now — revisit when there's appetite to actually design it.

## Streak-based score multiplier/bonus

A score bonus for consecutive-day play, reusing the streak tracking that
already exists (`src/lib/streak/`, `useStreak`'s `current_streak` —
already increments on a solve, already resets to 0 on a failure or a
missed day, per `recordRoundOutcome`). No new tracking needed, just a
new bonus table (same "tunable table, not inline arithmetic" shape as
`PENALTY_TIERS` in `clock.ts`) applied against `streak.current_streak`
and added into that day's score once the round resolves.

Draft tiers (illustrative, not final — needs the same playtesting pass
as every other tuning constant in this project), escalating rather than
flat-rate, capped at a 7-day streak so it doesn't grow unbounded:

| Streak length | Bonus |
|---|---|
| 1 day | — (baseline) |
| 2 days | +20 |
| 3 days | +40 |
| 4 days | +70 |
| 5 days | +100 |
| 6 days | +140 |
| 7+ days (cap) | +200 |

**Decided**: the multiplier rides on the existing solve-streak exactly
as-is — it requires solving each day (a failed/given-up round still
zeroes `current_streak`), not a separate "opened the app" concept. No
new state needed. The tier values above remain undecided/illustrative —
only this one facet of the idea has been settled.

## SVG depth-cue polish (salvaged from the shelved 2.5D migration)

The Three.js 2.5D direction was explored, spiked, and deliberately
shelved on 2026-07-14 (full record: `prd-3d-migration.md` status note +
`docs/research/research-threejs-migration-geo.md`). What survives is the
*motivation* — "things raising, more visual appeal" — deliverable as
depth cues in the existing SVG stack, no WebGL, no new deps, each an
afternoon-sized independent task:

- **Soft shadow under the target outline** (SVG `feDropShadow` /
  `feGaussianBlur` filter) — the single cheapest "it's an object, not a
  line drawing" cue.
- **Lift-and-settle on solve** — brief scale-up + shadow-spread + settle
  transform on the solved country; pairs with the existing confetti
  moment.
- **Gentle parallax on drag-pan** — offset the world layer slightly less
  than the target layer while panning (two layers already exist), giving
  cheap depth separation. The pan machinery is already in App.tsx.
- **Richer surface treatment** — subtle SVG gradient or grain on the
  target's post-draw fill instead of the current flat
  `rgba(255,255,255,0.12)`.

Not scoped or committed — same parking-lot status as everything else in
this file.
