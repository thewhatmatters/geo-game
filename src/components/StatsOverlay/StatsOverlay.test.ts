import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatsOverlay } from "./StatsOverlay";

const base = { ledger: {}, today: "2026-07-21", onClose: () => {} };

describe("StatsOverlay dialog semantics", () => {
  it("announces itself as a modal dialog with a focusable panel", () => {
    const html = renderToStaticMarkup(createElement(StatsOverlay, base));

    expect(html).toContain('role="dialog"');
    // Modal here is real: the overlay traps Tab and closes on Escape.
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Full result history"');
    // The panel takes focus on open, so it has to be programmatically
    // focusable without joining the tab order.
    expect(html).toContain('tabindex="-1"');
  });

  it("names Escape on the close control", () => {
    const html = renderToStaticMarkup(createElement(StatsOverlay, base));
    expect(html).toContain('data-testid="stats-overlay-close"');
    expect(html).toContain("(ESC)");
  });
});
