/**
 * US-020 polish sweep — scripted browser verification.
 *
 * Drives the real app (dev server, so the ?date= override is live) through
 * every terminal outcome at several viewport sizes, with and without
 * prefers-reduced-motion, and asserts the two things a screenshot can't:
 * that no element of the game chrome sticks out past the viewport
 * horizontally, and that reduced motion actually suppresses animation.
 *
 * Usage: npm run dev, then `node scripts/qa-sweep.mjs [baseUrl]`.
 * Screenshots land in docs/qa/us-020/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// require, not import: Playwright is a QA-only tool kept OUT of the app's
// dependencies (see CLAUDE.md's free/minimal-stack constraint). Run this
// with a global/npx install on NODE_PATH — CommonJS resolution honours it,
// ESM's doesn't.
const { chromium } = require("playwright");
const countries = require("../src/data/countries.json");
const CODES = Object.keys(countries).sort();

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = new URL("../docs/qa/us-020/", import.meta.url).pathname;

const LOCKOUT_ATTEMPT_BUDGET = 5;
const ROUND_SECONDS = 60;

/** Same FNV-1a as lib/game/dailyCountry — mirrored so the script can plan. */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function targetFor(date) {
  return countries[CODES[hashString(date) % CODES.length]];
}

function uniqueLetters(name) {
  return [...new Set(name.toUpperCase().replace(/[^A-Z]/g, ""))];
}

/** Letters NOT in the name — the wrong guesses a lockout run burns. */
function wrongLetters(name, count) {
  const inName = new Set(uniqueLetters(name));
  return "ZXQJKVWYBG".split("").filter((l) => !inName.has(l)).slice(0, count);
}

const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "landscape", width: 844, height: 390 },
  { name: "1280", width: 1280, height: 800 },
  { name: "2560", width: 2560, height: 1440 },
  { name: "3840", width: 3840, height: 2160 },
];

const findings = [];
const shots = [];

function note(msg) {
  console.log(msg);
}

/** Per-element rect check — body.scrollWidth lies here (see CLAUDE.md). */
async function checkOverflow(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const w = window.innerWidth;
    // Content inside a horizontal scroller (the 53-week history grid) is
    // clipped by its own box on purpose — the PAGE is what must never
    // scroll sideways, so those descendants don't count.
    const clipped = (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll(
      ".app *, .end-screen *, .stats-overlay *",
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (clipped(el)) continue;
      if (r.right > w + 1 || r.left < -1) {
        out.push({
          sel: el.className?.baseVal ?? el.className ?? el.tagName,
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
    return out.slice(0, 8);
  });
  if (bad.length) {
    findings.push(`OVERFLOW @ ${label}: ${JSON.stringify(bad)}`);
    note(`  ✗ overflow: ${JSON.stringify(bad)}`);
  } else {
    note(`  ✓ no horizontal overflow`);
  }
}

/**
 * The fixed corner clusters (zoom left, score right) float over the same
 * band as the centered masthead — a collision there is invisible to an
 * overflow check because nothing leaves the viewport, it just overlaps.
 */
async function checkOverlap(page, label) {
  const hits = await page.evaluate(() => {
    const corners = [".zoom-controls", ".score-readout"];
    // Centered CONTENT, measured tight: every one of these lives in a
    // full-width block, so the element's own rect spans the whole panel and
    // would "overlap" a corner cluster even with the text nowhere near it.
    // A Range over the text nodes gives the box a reader actually sees.
    const content = [
      ".app__top h1",
      ".streak",
      ".dot-matrix",
      ".lockout__pips",
      ".lockout__label",
      ".trivia-overlay__question",
      ".trivia-overlay__fun-fact",
      ".display-name__group",
      ".keyboard__row",
      ".give-up",
    ];
    const tightRect = (el) => {
      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
      );
      if (!hasText) return el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return r.width ? r : el.getBoundingClientRect();
    };
    const out = [];
    for (const a of corners) {
      const ra = document.querySelector(a)?.getBoundingClientRect();
      if (!ra) continue;
      for (const b of content) {
        for (const el of document.querySelectorAll(b)) {
          const rb = tightRect(el);
          if (!rb.width) continue;
          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX > 1 && overlapY > 1) {
            out.push(`${a} × ${b} (${Math.round(overlapX)}×${Math.round(overlapY)}px)`);
          }
        }
      }
    }
    return [...new Set(out)];
  });
  if (hits.length) {
    findings.push(`OVERLAP @ ${label}: ${hits.join(", ")}`);
    note(`  ✗ overlapping UI: ${hits.join(", ")}`);
  } else {
    note(`  ✓ no overlapping UI`);
  }
}

/** A panel taller than the viewport must scroll, not clip its own headline. */
async function checkPanelReachable(page, label) {
  const result = await page.evaluate(() => {
    const panel = document.querySelector(".end-screen__panel");
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return {
      topCut: r.top < -1,
      bottomCut: r.bottom > window.innerHeight + 1,
      scrollable: panel.scrollHeight > panel.clientHeight + 1,
      overflowY: getComputedStyle(panel).overflowY,
    };
  });
  if (!result) return;
  if (result.topCut || result.bottomCut) {
    findings.push(`CLIPPED @ ${label}: end screen panel runs off the viewport ${JSON.stringify(result)}`);
    note(`  ✗ end screen clipped: ${JSON.stringify(result)}`);
  } else {
    note(`  ✓ end screen fully on screen (scrolls internally: ${result.scrollable})`);
  }
}

async function shoot(page, name) {
  const file = `${OUT}${name}.png`;
  await page.screenshot({ path: file });
  shots.push(`${name}.png`);
}

async function openRound(context, date, { keepStorage = false } = {}) {
  const page = await context.newPage();
  // Every run starts from a clean save unless the caller is deliberately
  // building history across days (see runStreakSequence).
  if (!keepStorage) await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`${BASE}/?date=${date}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="display-name"]');
  return page;
}

async function guess(page, letter) {
  await page.keyboard.press(letter);
  await page.waitForTimeout(120);
}

async function solve(page, name) {
  for (const letter of uniqueLetters(name)) await guess(page, letter);
  await page.waitForSelector('[data-testid="end-screen"]');
}

async function waitForLockout(page) {
  await page.waitForSelector('[data-testid="lockout-strip"]', {
    timeout: (ROUND_SECONDS + 15) * 1000,
  });
}

/** One full outcome run: round surface → (lockout) → end screen → history. */
async function runOutcome(context, { date, outcome, viewport }) {
  const target = targetFor(date);
  const tag = `${outcome}-${viewport.name}`;
  note(`\n▶ ${tag} — ${date} → ${target.name}`);
  const page = await openRound(context, date);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(600);

  await shoot(page, `${tag}-1-round`);
  await checkOverflow(page, `${tag} round`);
  await checkOverlap(page, `${tag} round`);

  if (outcome === "solved") {
    await solve(page, target.name);
  } else if (outcome === "gave_up") {
    await page.click(".give-up");
    await page.waitForSelector('[data-testid="end-screen"]');
  } else {
    await waitForLockout(page);
    await shoot(page, `${tag}-2-lockout`);
    await checkOverflow(page, `${tag} lockout`);
    if (outcome === "solved_late") {
      await solve(page, target.name);
    } else {
      for (const letter of wrongLetters(target.name, LOCKOUT_ATTEMPT_BUDGET)) {
        await guess(page, letter);
      }
      await page.waitForSelector('[data-testid="end-screen"]');
    }
  }

  await page.waitForTimeout(1600); // let the staggered recap finish
  await shoot(page, `${tag}-3-endscreen`);
  await checkOverflow(page, `${tag} end screen`);
  await checkPanelReachable(page, `${tag} end screen`);

  const headline = await page.textContent('[data-testid="end-screen-headline"]');
  const share = await page.textContent('[data-testid="share-string"]');
  const revealsCountry = share.includes(target.name);
  const shouldReveal = outcome === "solved" || outcome === "solved_late";
  if (revealsCountry !== shouldReveal) {
    findings.push(
      `SHARE @ ${tag}: country ${revealsCountry ? "revealed" : "hidden"} for ${outcome}`,
    );
  }
  note(`  headline: ${headline}`);
  note(`  share reveals country: ${revealsCountry} (expected ${shouldReveal})`);

  // Act 2 → full history overlay, then Escape back out.
  await page.locator('[data-testid="end-screen-act2"]').scrollIntoViewIfNeeded();
  await shoot(page, `${tag}-4-act2`);
  await page.click('[data-testid="full-history-button"]');
  await page.waitForSelector('[data-testid="stats-overlay"]');
  await page.waitForTimeout(400);
  await shoot(page, `${tag}-5-history`);
  await checkOverflow(page, `${tag} history`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const closed = (await page.locator('[data-testid="stats-overlay"]').count()) === 0;
  if (!closed) findings.push(`ESCAPE @ ${tag}: history overlay did not close`);
  note(`  escape closes history: ${closed}`);

  await page.close();
  return { outcome, date, country: target.name, headline, revealsCountry };
}

/** The running round at every breakpoint — the responsive half of the sweep. */
async function sweepViewports(context, date, reducedMotion) {
  const target = targetFor(date);
  const suffix = reducedMotion ? "-reduced" : "";
  for (const viewport of VIEWPORTS) {
    const page = await openRound(context, date);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(700);
    note(`\n▶ viewport ${viewport.name}${suffix} — ${target.name}`);
    await shoot(page, `viewport-${viewport.name}${suffix}-round`);
    await checkOverflow(page, `viewport ${viewport.name}${suffix}`);
    await checkOverlap(page, `viewport ${viewport.name}${suffix}`);

    // Mid-round state: a few guesses in, keyboard marked up, slots filling.
    for (const letter of uniqueLetters(target.name).slice(0, 3)) await guess(page, letter);
    await guess(page, wrongLetters(target.name, 1)[0]);
    await page.waitForTimeout(400);
    await shoot(page, `viewport-${viewport.name}${suffix}-mid`);
    await checkOverflow(page, `viewport ${viewport.name}${suffix} mid`);

    // No layout shift from a guess: the slot row's box must be identical
    // before and after a letter lands in it.
    const before = await page.locator('[data-testid="display-name"]').boundingBox();
    const next = uniqueLetters(target.name)[3];
    if (next) await guess(page, next);
    const after = await page.locator('[data-testid="display-name"]').boundingBox();
    // Sub-pixel tolerance: the reject shake is a transform on this same box,
    // and a measurement taken while it settles reads a fraction of a pixel
    // off. Anything that actually reflows moves whole pixels.
    const moved =
      before && after
        ? Math.abs(before.width - after.width) > 0.5 || Math.abs(before.x - after.x) > 0.5
        : false;
    if (moved) {
      findings.push(
        `SHIFT @ viewport ${viewport.name}${suffix}: slots moved ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
      );
      note(`  ✗ slot row shifted on guess`);
    } else {
      note(`  ✓ no slot shift on guess`);
    }
    await page.close();
  }
}

/** Reduced motion has to be observable, not just declared. */
async function checkReducedMotion(context, date) {
  const page = await openRound(context, date);
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const el = document.querySelector(".ocean-hatch__flow");
    const shimmer = el ? getComputedStyle(el).animationName : "n/a";
    const matches = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { shimmer, matches };
  });
  note(`\n▶ reduced-motion probe: media matches=${result.matches}, ocean animation=${result.shimmer}`);
  if (result.matches && result.shimmer !== "none") {
    findings.push(`REDUCED MOTION: ocean shimmer still animating (${result.shimmer})`);
  }
  await page.close();
  return result;
}

/**
 * Zoom and pan pushed past their limits: the map transform must stay a
 * finite, in-range matrix (a NaN there blanks the whole scene), the zoom-out
 * button must disable at the ceiling, and a drag past the pan radius must
 * snap back to center on release.
 */
async function checkZoomPanBounds(context, date) {
  const page = await openRound(context, date);
  await page.waitForTimeout(400);

  // Way past the ceiling — the clamp, not the click count, decides.
  for (let i = 0; i < 25; i++) {
    if (await page.isDisabled('[aria-label="Zoom out"]')) break;
    await page.click('[aria-label="Zoom out"]');
  }
  await page.waitForTimeout(400);
  const zoomedOut = await page.evaluate(() => {
    const g = document.querySelectorAll(".outline-demo__svg g");
    const transforms = [...g].map((el) => el.getAttribute("transform") ?? "");
    return {
      outAtCeiling: document.querySelector('[aria-label="Zoom out"]').disabled,
      inEnabled: !document.querySelector('[aria-label="Zoom in"]').disabled,
      nan: transforms.some((t) => t.includes("NaN") || t.includes("Infinity")),
    };
  });
  if (zoomedOut.nan) findings.push(`ZOOM @ ${date}: NaN/Infinity in the map transform`);
  if (!zoomedOut.outAtCeiling) findings.push(`ZOOM @ ${date}: zoom-out never hit its ceiling`);
  note(
    `\n▶ zoom bounds: ceiling reached=${zoomedOut.outAtCeiling}, zoom-in re-enabled=${zoomedOut.inEnabled}, NaN=${zoomedOut.nan}`,
  );

  // Drag past the pan radius, then release: elastic, so it returns. Done at
  // the zoom ceiling on purpose — that's where the vertical budget has
  // collapsed to zero while the horizontal one is at its widest. The drag
  // has to stay inside the viewport or the browser never dispatches it.
  const box = await page.locator(".outline-demo").boundingBox();
  const cx = box.x + box.width * 0.25;
  const cy = box.y + box.height * 0.25;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + box.width * 0.7, cy + box.height * 0.7, { steps: 12 });
  const dragged = await page.evaluate(
    () => document.querySelector(".outline-demo__svg > g").getAttribute("transform"),
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  const released = await page.evaluate(
    () => document.querySelector(".outline-demo__svg > g").getAttribute("transform"),
  );
  const numbers = [...dragged.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
  const finite = numbers.every(Number.isFinite);
  if (!finite) findings.push(`PAN @ ${date}: non-finite pan transform ${dragged}`);
  if (dragged === released) {
    findings.push(`PAN @ ${date}: drag never moved or never snapped back (${dragged})`);
  }
  // At the ceiling the visible window already spans the world's full height,
  // so vertical drag must be locked even though the drag had a y component.
  const draggedY = Number(dragged.split(" ")[1]?.replace(")", ""));
  const restingY = Number(released.split(" ")[1]?.replace(")", ""));
  if (Math.abs(draggedY - restingY) > 0.5) {
    findings.push(`PAN @ ${date}: vertical drag not locked at the zoom ceiling (${dragged})`);
  }
  note(`  drag clamped to: ${dragged}`);
  note(`  released back to: ${released}`);
  await page.close();
  return { ...zoomedOut, dragged, released };
}

/**
 * A real multi-day run in one browser profile: five consecutive solves
 * (which banks a freeze at FREEZE_EARN_EVERY), one deliberately missed day,
 * then a return — so the streak, the freeze consumption, the heatmap cells
 * and the trophy fills are all checked against a history the app itself
 * built, not a hand-written save.
 */
async function runStreakSequence(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dates = ["2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15"];
  const missed = "2026-07-16";
  const returnDay = "2026-07-17";
  const timeline = [];

  // First page seeds a clean profile; the rest inherit it.
  let keepStorage = false;
  for (const date of dates) {
    const page = await openRound(context, date, { keepStorage });
    keepStorage = true;
    await solve(page, targetFor(date).name);
    await page.waitForTimeout(400);
    const streak = await page.textContent('[data-testid="streak"]');
    timeline.push(`${date} · ${targetFor(date).name} · solved · ${streak.trim()}`);
    await page.close();
  }

  const page = await openRound(context, returnDay, { keepStorage: true });
  await page.waitForTimeout(600);
  const streak = await page.textContent('[data-testid="streak"]');
  const notice = await page
    .locator('[data-testid="streak-notice-masthead"]')
    .textContent()
    .catch(() => null);
  timeline.push(`${missed} · (not played)`);
  timeline.push(`${returnDay} · returned · ${streak.trim()} · notice: ${notice ?? "none"}`);
  await shoot(page, "streak-1-return");

  await page.click(".give-up");
  await page.waitForSelector('[data-testid="end-screen"]');
  await page.waitForTimeout(1500);
  await shoot(page, "streak-2-endscreen");
  await page.click('[data-testid="full-history-button"]');
  await page.waitForSelector('[data-testid="stats-overlay"]');
  await page.waitForTimeout(500);
  await shoot(page, "streak-3-history");

  const cells = await page.evaluate(() => {
    const counts = {};
    // .heatmap__grid only — the legend is built from the same cell class and
    // would add a phantom day to every state.
    for (const cell of document.querySelectorAll(".stats-overlay .heatmap__grid .heatmap__cell")) {
      const state = cell.getAttribute("data-state");
      counts[state] = (counts[state] ?? 0) + 1;
    }
    const claimed = document.querySelector(
      ".stats-overlay .trophy-map__progress-value",
    )?.textContent;
    return { counts, claimed };
  });
  timeline.push(
    `heatmap: ${JSON.stringify(cells.counts)} · trophy map: ${cells.claimed}`,
  );
  note(`\n▶ streak sequence:\n${timeline.map((t) => `  ${t}`).join("\n")}`);

  // Five solves, one covered miss: the streak has to survive.
  if (!streak.includes("Streak: 6") && !streak.includes("Streak: 5")) {
    findings.push(`STREAK: unexpected streak after 5 solves + a covered miss — "${streak.trim()}"`);
  }
  const solvedCells = (cells.counts.solved ?? 0) + (cells.counts.solved_late ?? 0);
  if (solvedCells !== dates.length) {
    findings.push(`HEATMAP: ${solvedCells} solved cells for ${dates.length} solved days`);
  }
  if ((cells.counts.frozen ?? 0) !== 1) {
    findings.push(`HEATMAP: ${cells.counts.frozen ?? 0} frozen cells for 1 covered miss`);
  }
  if (cells.claimed !== `${dates.length}/240`) {
    findings.push(`TROPHY MAP: claimed ${cells.claimed} after ${dates.length} solves`);
  }
  await page.close();
  await context.close();
  return timeline;
}

/** Tab order + focus rings, checked on the live round surface. */
async function checkKeyboardNav(context, date) {
  const page = await openRound(context, date);
  await page.waitForTimeout(400);
  const order = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        const outline = getComputedStyle(el).outlineWidth;
        return `${el.className?.baseVal ?? el.className ?? el.tagName}|outline=${outline}`;
      }),
    );
  }
  note(`\n▶ tab order: ${JSON.stringify(order, null, 0)}`);
  // The zoom cluster sits top-left on screen, so it should be an early tab
  // stop, not something 27 keys down the list.
  if (!order[0]?.includes("zoom-controls__button")) {
    findings.push(`TAB ORDER: first stop is ${order[0]}, expected a zoom control`);
  }
  if (order.every((entry) => entry.endsWith("outline=0px"))) {
    findings.push("FOCUS: no visible outline on any focused control");
  }
  await page.close();
  return order;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const summary = [];

  // Distinct dates per outcome: a completed round is recorded per date, so
  // replaying one would restore the result instead of a fresh round.
  const plan = [
    { date: "2026-07-02", outcome: "solved", viewport: VIEWPORTS[4] },
    { date: "2026-07-03", outcome: "solved", viewport: VIEWPORTS[1] },
    { date: "2026-07-04", outcome: "gave_up", viewport: VIEWPORTS[4] },
    { date: "2026-07-05", outcome: "gave_up", viewport: VIEWPORTS[1] },
    { date: "2026-07-06", outcome: "locked_out", viewport: VIEWPORTS[4] },
    { date: "2026-07-07", outcome: "locked_out", viewport: VIEWPORTS[1] },
    { date: "2026-07-08", outcome: "solved_late", viewport: VIEWPORTS[4] },
    { date: "2026-07-09", outcome: "solved_late", viewport: VIEWPORTS[1] },
  ];

  const normal = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const step of plan) summary.push(await runOutcome(normal, step));

  // 2026-07-21 is "British Indian Ocean Territory": the dataset's long-name
  // AND no-neighbor case in one day — the two edge cases worth sweeping.
  await sweepViewports(normal, "2026-07-21", false);
  await sweepViewports(normal, "2026-07-02", false);
  const tabOrder = await checkKeyboardNav(normal, "2026-07-21");
  const bounds = await checkZoomPanBounds(normal, "2026-07-02");
  await normal.close();

  const timeline = await runStreakSequence(browser);

  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const rm = await checkReducedMotion(reduced, "2026-07-21");
  await sweepViewports(reduced, "2026-07-21", true);
  summary.push(await runOutcome(reduced, {
    date: "2026-07-10",
    outcome: "solved",
    viewport: VIEWPORTS[4],
  }));
  await reduced.close();

  await browser.close();

  const report = [
    "# US-020 QA sweep",
    "",
    `Base: ${BASE}`,
    "",
    "## Outcomes",
    ...summary.map(
      (s) => `- ${s.outcome} · ${s.date} · ${s.country} · ${s.headline} · share reveals country: ${s.revealsCountry}`,
    ),
    "",
    "## Reduced motion",
    `- media matches: ${rm.matches}; ocean shimmer animation: ${rm.shimmer}`,
    "",
    "## Multi-day streak sequence",
    ...timeline.map((t) => `- ${t}`),
    "",
    "## Zoom / pan bounds",
    `- zoom-out ceiling reached: ${bounds.outAtCeiling}; NaN in transform: ${bounds.nan}`,
    `- drag past the radius clamped to: \`${bounds.dragged}\``,
    `- released back to: \`${bounds.released}\``,
    "",
    "## Tab order (first stops)",
    ...tabOrder.map((t) => `- ${t}`),
    "",
    "## Findings",
    findings.length ? findings.map((f) => `- ${f}`).join("\n") : "- none",
    "",
    "## Screenshots",
    ...shots.map((s) => `- ${s}`),
    "",
  ].join("\n");
  await writeFile(`${OUT}report.md`, report);
  note(`\n${findings.length ? `✗ ${findings.length} finding(s)` : "✓ clean"} — report at docs/qa/us-020/report.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
