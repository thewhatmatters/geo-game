# Geo

The daily geography guessing game — one country per day, Hangman-style
letter guessing against a countdown clock. This context covers the round
lifecycle and the seams the architecture review named.

## Language

**RoundBoot**:
The bundle of everything a round derives from the two load-time inputs
(date, viewport): the daily selection, the projected scene, and the day
number. Resolved once by `bootRound()` at the composition point
(main.tsx); nothing below that seam reads the wall clock or `window`.
_Avoid_: config, initial props, app state

**Daily selection**:
The deterministic pick of today's target country and its (up to) three
neighbor codes, hashed from the UTC date so every player gets the same
puzzle. _Avoid_: puzzle config, level

**Scene**:
The target-anchored projection frame: viewBox, pxScale (on-screen px →
viewBox units), neighbor slots, and the zoom ceiling. Owned by
`computeGeoScene`. _Avoid_: map state, camera
