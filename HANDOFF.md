# Handoff — Geo daily geography guessing game (design → build-ready)

_Updated 2026-07-11 · session refresh checkpoint_

## Goal
Design and scope "geo," a Wordle-style daily geography guessing game
(Hangman-style letter guessing against a countdown clock, with the
target country's outline — and its neighbors' — drawing themselves in
as hints), then get it to a build-ready state for an autonomous loop.
Design is now fully locked; the project has moved from pure design into
"ready to scaffold and build" territory this session.

## Current state
- `CLAUDE.md`, `PRD.md`, `PRD.html` — fully current, reflect every
  locked design/stack decision including the final one this session
  (Hangman keyboard input: on-screen keyboard as source of truth,
  physical keydown layered on top, same pattern as Wordle).
- `prd.json` — written and validated (13 dependency-ordered user
  stories, 0 errors/warnings from `decompose-prd`'s `validate.py`).
  Covers scaffold → data pipeline → daily-selection logic → outline
  animation → Hangman game loop → neighbor reveal → streak/share →
  trivia content.
- `run-tasks.sh` (the agent-loop runner) has **not** been created yet —
  it was offered but the user moved on to other requests before
  answering. Still an open offer, not a decision either way.
- Still nothing scaffolded — no `node_modules`, no `src/`, not yet a
  git repository.
- Vault-wiring is in progress as of this handoff (the user's next
  requested step, right after this file).

## Next steps
1. **Wire this project into the OKF vault** (`wire-vault` skill) — in
   progress this turn.
2. Decide on `run-tasks.sh`: create it from
   `~/.claude/skills/decompose-prd/assets/run-tasks.sh` if/when the user
   wants to actually run the autonomous loop. Not created automatically.
3. When the loop runs: **US-013 (trivia content) must not be treated as
   done on generation alone** — it's flagged in `prd.json` to require
   explicit human review before the facts are considered final.
4. Watch the three flagged implementation ambiguities once real code
   exists (see Key decisions) — they were reasonable defaults chosen to
   unblock the loop, not settled design calls; revisit if they look
   wrong in practice.

## Key decisions (and why)
Full rationale lives in `CLAUDE.md` / `PRD.md` — read those first, don't
re-derive. Two decisions from *this* session specifically, since they
postdate the last handoff:

- **Keyboard input resolved:** on-screen A-Z keyboard is the visual
  source of truth (only way to show per-letter guessed/correct/wrong
  state on the keys); physical keydown is layered on top as a desktop
  convenience, dispatching to the same handler. Not a fork — one
  component, two input paths. This was the last thing blocking a clean
  `decompose-prd` pass.
- **`prd.json` has 3 stories where a genuine PRD ambiguity had to be
  resolved to make the story buildable**, each flagged in that story's
  `notes` field rather than silently assumed:
  - US-004: which neighbors get picked when a country has >3 — uses the
    same date-seeded hash as daily-country selection, for consistency.
  - US-006: exact wrong-guess time penalties (-20s/-15s/-10s tiers) are
    explicitly placeholder, wired as an easily-tunable config table.
  - US-008: neighbor compass placement committed to an 8-point compass
    (N/NE/E/SE/S/SW/W/NW) with adjacent-anchor offset on collision.

## Open questions / risks
- Whether/when to create and run `run-tasks.sh` — unresolved, purely
  the user's call.
- The three flagged ambiguities above are defaults, not final decisions
  — likely to need a look once there's something on screen.
- Remaining tuning-only items from `PRD.md`'s Open Questions (penalty
  tier exact values, 60s base budget, share-string visual format) still
  need real playtesting once a build exists — not blockers, just not
  finalized.
- Trivia content (US-013) needs an actual human review pass before
  shipping — don't let an autonomous loop run mark it done without one.

## Files & commands in play
- `/Users/digitalalchemist/Development/geo/CLAUDE.md` — locked design/
  stack source of truth.
- `/Users/digitalalchemist/Development/geo/PRD.md` (+ `PRD.html`) — full
  PRD form of the same decisions.
- `/Users/digitalalchemist/Development/geo/prd.json` — 13-story
  dependency-ordered build plan for an autonomous loop. Re-validate
  after any manual edit: `python3
  ~/.claude/skills/decompose-prd/scripts/validate.py --in=prd.json`.
- Runner template (not yet copied in):
  `~/.claude/skills/decompose-prd/assets/run-tasks.sh`.
- Original vault research (superseded in parts, genre-precedent
  background still useful):
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/OBSDN/ideas/geography-outline-quiz-game.md`
- Paper design mock referenced this session:
  `https://app.paper.design/file/01KX9FDGB9Q8CVZ1EJJEKKC4C8/1-0`
- No build/test/run commands yet — nothing scaffolded (US-001 in
  `prd.json` is exactly this step).

## Git state
Not a git repository yet. No commits, nothing to check in.

## Don't redo
- Don't re-open the keyboard-input question (on-screen vs. physical) —
  resolved this session, see Key decisions.
- Don't reintroduce multiple-choice as the core guess mechanic — it was
  deliberately replaced by Hangman letter-guessing earlier this session.
- Don't reach for Leaflet or MapLibre GL for map rendering — considered
  and rejected, see `CLAUDE.md` Gotchas.
- Don't scope Supabase back into v1 without asking — deliberately
  deferred in favor of `localStorage`.
- Don't scale the wrong-guess time penalty off raw country-name length —
  it's keyed off *unique* letter count specifically.
- Don't mark US-013 (trivia content) as fully passing on LLM generation
  alone — human review is a required gate, not a formality.
