# Handoff — Geo: playtesting session (scoring, mobile fixes, vault curation)

_Updated 2026-07-13 · session refresh checkpoint_

## Goal

Playtest the "geo" daily geography guessing game end to end in a real
browser, fixing bugs and adding polish/features as they surface. This is
an ongoing iterative playtesting loop, not a single feature build — the
overarching goal is a shippable, well-tuned v1 per `CLAUDE.md`/`PRD.md`.

## Current state

Commit `5d40e5b` on branch `loop/geo-daily-quiz` captured most of this
session's work (world map/zoom/pan, scoring, keyboard theme, dot-matrix
clock — see that commit and the vault for full detail). Since that
commit, three more things happened, all typechecked/tested (99 passing)
/built/verified live, **not yet committed** (see Git state):

- **Streak-based score multiplier — idea drafted, one facet decided.**
  Tabled in `ideas.md` and the vault as a still-unbuilt Idea (illustrative
  escalating tier table, 2 days → +20 up to a 7+ day cap → +200,
  reusing the existing `useStreak`/`current_streak` machinery, no new
  state). One open question WAS resolved this session: the multiplier
  keys off the existing *solve*-streak, not a new login/open-based
  concept — captured as its own vault Decision, cross-linked from the
  Idea. **Nothing implemented yet** — this is still just documentation
  (repo `ideas.md` + vault), no code changes.
- **Mobile responsiveness — two real bugs found and fixed.** Verified
  live at 320/360/375/393px viewports (not just visual inspection):
  1. `.keyboard__key`'s old fixed `min-width: 2.75rem` had no shrink
     path, so the 10-key top row overflowed and clipped Q/P on every
     phone narrower than ~480px. Fixed with
     `clamp(1.7rem, 8vw, 2.75rem)` on both `min-width`/`min-height`
     (`src/index.css` `.keyboard__key`), plus a responsive
     `.keyboard__row` gap.
  2. `.zoom-controls` was pinned `bottom-right`, landing directly on
     top of the keyboard's `M` key on phone-height viewports (never
     accounted for the keyboard's variable height). Moved to
     `top-left`, paired visually with `.score-display` (`top-right`) —
     the top corners are reliably clear regardless of round state.
- **Terminology correction**: the vault-harvest skill is actually named
  `curate-vault`, not `curate-knowledge` (user caught this; confirmed
  via the actual `~/.claude/skills/` listing). Use `curate-vault` going
  forward — the old name will 404 on `cd`.

## Next steps

1. **CLAUDE.md is still stale** — carried over from before: its "locked
   mechanics" section predates most of this whole extended session
   (zoom/pan, streak bonus, live score, dot-matrix clock, confetti, and
   now the mobile-responsive keyboard sizing). Still unresolved whether
   to fold it in.
2. If the streak-multiplier idea gets picked up for real: the tier
   values (2 days → +20 etc.) are still illustrative/undecided — that's
   the next open question on that specific feature, not the
   solve-vs-login one (already settled).
3. Nothing else is blocked — working tree is committed and clean.

## Key decisions (and why)

- **Streak multiplier keys off solve, not login.** Reuses
  `current_streak` exactly as-is (already resets to 0 on a failed/given-up
  round) rather than building a new, separate "app opened" streak —
  decided via `AskUserQuestion` specifically to avoid new persisted state
  for a feature that isn't otherwise scoped/committed yet. Full
  rationale: vault `projects/geo/decisions/streak-multiplier-keys-off-solve-not-login.md`.
- **Zoom controls live top-left now, not bottom-right.** Not just a
  mobile patch — bottom-right was fundamentally fragile because
  `.app__bottom`'s height varies a lot (trivia, letter boxes,
  round-outcome, share result, keyboard, give-up button all stack
  there, and grow once a round ends). Top corners don't have that
  problem. This fix generalizes past the specific mobile bug that
  surfaced it.
- **`document.body.scrollWidth` is not a reliable overflow check inside
  a `position: fixed` app shell.** Learned the hard way this session:
  the very first overflow-detection script used exactly that check and
  reported `false` on every mobile viewport despite screenshots showing
  clearly clipped content — because `.app` is `position: fixed`, and
  fixed subtrees don't propagate overflow into `body.scrollWidth`. Now a
  durable vault gotcha
  (`web/position-fixed-hides-overflow-from-body-scrollwidth.md`) — future
  mobile-overflow checks in this repo (or any `position:fixed`-shell app)
  should use `getBoundingClientRect()` against the viewport, or a
  screenshot, not scrollWidth alone.

## Open questions / risks

- CLAUDE.md/PRD.md's "locked" mechanics have drifted further from
  what's actually implemented (see Next steps #2) — the gap keeps
  growing each session this isn't addressed.
- The streak-multiplier tier values are still just illustrative
  round numbers, not derived from any real playtesting or retention
  modeling.
- Mobile verification this session covered phone-width portrait
  viewports only (320–393px) — landscape orientation and tablet widths
  haven't been checked.

## Files & commands in play

- Branch: `loop/geo-daily-quiz`, HEAD at `9837ea0`.
- `npm run dev` / `npm run typecheck` / `npm run test -- --run` / `npm run build`
- This round's touched files: `src/index.css` (`.keyboard__key`,
  `.keyboard__row`, `.zoom-controls`), `ideas.md`, `HANDOFF.md`.
- Vault skill is `~/.claude/skills/curate-vault/` (NOT `curate-knowledge`
  — that path no longer exists).

## Git state

Branch `loop/geo-daily-quiz`. Clean — this round's work (mobile fixes +
docs) was committed as `9837ea0` ("Fix mobile keyboard overflow and
zoom-control collision") at the end of the session, per explicit user
confirmation. Not pushed anywhere.

## Don't redo

- Everything from the prior handoff's "Don't redo" still applies
  (keyboard keycap color/weight iterations, solved-country label
  placement, dot-matrix clock color) — see commit `5d40e5b`'s message
  and the vault decisions for the settled state on each.
- **Don't reposition `.zoom-controls` back to bottom-right** — tried,
  caused a real collision with the keyboard's bottom row on
  phone-height viewports, confirmed via live screenshot before the fix.
- **Don't rely on `document.body.scrollWidth` alone to check for mobile
  horizontal overflow in this repo** — the whole UI lives inside
  `.app { position: fixed; inset: 0; }`, which hides overflow from that
  check entirely (see the vault gotcha above). Use
  `getBoundingClientRect()` per-element or a screenshot instead.
