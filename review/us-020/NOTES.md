# US-020 evidence package

Automated Playwright QA for polish pass + full-flow outcomes (branch `thewhatmatters/us-020-grok`).

## Acceptance coverage

| Criterion | Evidence |
|---|---|
| prefers-reduced-motion | `*-rm.png` screenshots; unit tests in `src/lib/ui/motion.test.ts`; CSS + Framer hooks |
| Responsive 320→4K | `round-surface-mobile-320`, `mobile-390`, `desktop-1280`; CSS breakpoints |
| Overlay enter/exit | EndScreen / StatsOverlay motion; Escape closes stats |
| Edge cases | empty fun_fact (TriviaOverlay tests), islands (NeighborsLayer null), long names (AnswerDisplay density), locked_out UI |
| Keyboard a11y | Tab focus shots; Escape closes stats; native Enter/Space on buttons |
| Focus-visible | global `:focus-visible` in `index.css` |
| No layout shift | fixed answer cells, tabular score + reserved multiplier slot |
| Browser verify | this directory |
| Typecheck / tests | `npm test` 303 pass; `tsc --noEmit` clean; `npm run build` ok |

## Outcomes (desktop 1280 + mobile 390)

- **solved in-time:** `solved-intime-*.png`, `solved-act2-*.png` — share reveals flag/name
- **solved late:** `solved-late-*.png`, `lockout-mode-solved-late-*.png`
- **locked out:** `locked-out-*.png`, `lockout-mode-locked-out-*.png` — share hides country
- **gave up:** `gave-up-act1-*.png`, `gave-up-act2-*.png`

## Multi-day + freeze

- Solves: `multiday-solve-2026-07-01` … `05.png`
- Deliberate miss: `multiday-miss-freeze.png`
- History / trophy / heatmap: `multiday-stats-heatmap-trophy.png`

## Horizontal overflow checks

UI chrome (`.app__top/bottom`, score, zoom, keyboard, answer slots, end-screen panel) is clean at 320/390/1280 — no element right edge past the viewport.

World-map SVG paths intentionally extend past the viewport (cover + antimeridian wrap) and are excluded.

Stats overlay's 53-week heatmap scrolls horizontally inside the panel (`overflow-x: auto`; min-width 34rem) so glyphs stay legible on phone — the page itself does not scroll sideways.


## Screenshot index (44 files)

- `focus-tab-desktop-1280-rm.png`
- `focus-tab-desktop-1280.png`
- `focus-tab-mobile-320.png`
- `focus-tab-mobile-390-rm.png`
- `focus-tab-mobile-390.png`
- `gave-up-act1-desktop-1280-rm.png`
- `gave-up-act1-desktop-1280.png`
- `gave-up-act1-mobile-320.png`
- `gave-up-act1-mobile-390-rm.png`
- `gave-up-act1-mobile-390.png`
- `gave-up-act2-desktop-1280-rm.png`
- `gave-up-act2-desktop-1280.png`
- `gave-up-act2-mobile-320.png`
- `gave-up-act2-mobile-390-rm.png`
- `gave-up-act2-mobile-390.png`
- `locked-out-desktop-1280.png`
- `locked-out-mobile-390.png`
- `lockout-mode-locked-out-desktop-1280.png`
- `lockout-mode-locked-out-mobile-390.png`
- `lockout-mode-solved-late-desktop-1280.png`
- `lockout-mode-solved-late-mobile-390.png`
- `multiday-miss-freeze.png`
- `multiday-solve-2026-07-01.png`
- `multiday-solve-2026-07-02.png`
- `multiday-solve-2026-07-03.png`
- `multiday-solve-2026-07-04.png`
- `multiday-solve-2026-07-05.png`
- `multiday-stats-heatmap-trophy.png`
- `round-surface-desktop-1280-rm.png`
- `round-surface-desktop-1280.png`
- `round-surface-mobile-320.png`
- `round-surface-mobile-390-rm.png`
- `round-surface-mobile-390.png`
- `solved-act2-desktop-1280.png`
- `solved-act2-mobile-390.png`
- `solved-intime-desktop-1280.png`
- `solved-intime-mobile-390.png`
- `solved-late-desktop-1280.png`
- `solved-late-mobile-390.png`
- `stats-overlay-desktop-1280-rm.png`
- `stats-overlay-desktop-1280.png`
- `stats-overlay-mobile-320.png`
- `stats-overlay-mobile-390-rm.png`
- `stats-overlay-mobile-390.png`
