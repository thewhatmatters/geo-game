import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EndScreen } from "./EndScreen";
import type { ScoreEvent } from "../../lib/game/round";

const emptyEvents: ScoreEvent[] = [];

describe("EndScreen outcomes", () => {
  it("renders locked_out with lockout headline and data-outcome", () => {
    const html = renderToStaticMarkup(
      createElement(EndScreen, {
        status: "locked_out",
        eventScore: 400,
        scoreEvents: emptyEvents,
        remainingSeconds: 0,
        dayNumber: 9,
        shareString: "Geo #9\nLOCKED OUT\n⬛⬛",
        currentStreak: 0,
        freezes: 0,
        today: "2026-07-21",
      }),
    );

    expect(html).toContain('data-testid="end-screen"');
    expect(html).toContain('data-outcome="locked_out"');
    expect(html).toContain("GEO #9 — LOCKOUT");
    expect(html).toContain("end-screen--locked-out");
    expect(html).toContain("end-screen__headline--lockout");
  });

  it("renders gave_up and solved outcomes distinctly", () => {
    const gaveUp = renderToStaticMarkup(
      createElement(EndScreen, {
        status: "gave_up",
        eventScore: 200,
        scoreEvents: emptyEvents,
        remainingSeconds: 12,
        dayNumber: 3,
        shareString: "Geo #3\nGAVE UP",
        currentStreak: 0,
        freezes: 1,
        today: "2026-07-21",
      }),
    );
    expect(gaveUp).toContain('data-outcome="gave_up"');
    expect(gaveUp).toContain("GEO #3 — ABORTED");

    const solved = renderToStaticMarkup(
      createElement(EndScreen, {
        status: "solved",
        eventScore: 800,
        scoreEvents: emptyEvents,
        remainingSeconds: 40,
        dayNumber: 3,
        shareString: "Geo #3 🇮🇸\n0:40",
        currentStreak: 2,
        freezes: 0,
        today: "2026-07-21",
      }),
    );
    expect(solved).toContain('data-outcome="solved"');
    expect(solved).toContain("GEO #3 — ACCESS GRANTED");
    expect(solved).toContain("end-screen__headline--granted");
  });
});
