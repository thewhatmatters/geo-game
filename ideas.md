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
