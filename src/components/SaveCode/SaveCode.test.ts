import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveCode } from "./SaveCode";
import { StatsOverlay } from "../StatsOverlay/StatsOverlay";
import { encodeSaveCode } from "../../lib/save";
import { SAVE_SCHEMA_VERSION } from "../../lib/storage/outcomes";

const CODE = encodeSaveCode({
  version: SAVE_SCHEMA_VERSION,
  ledger: { "2026-07-18": { outcome: "solved", score: 940, target: "PER" } },
  trophyMap: { PER: { tier: "in_time", date: "2026-07-18" } },
});

const noop = () => ({ ok: true, message: "" });

describe("SaveCode", () => {
  it("shows the code alongside a copy button and a paste field", () => {
    const html = renderToStaticMarkup(createElement(SaveCode, { code: CODE, onImport: noop }));
    expect(html).toContain(CODE);
    expect(html).toContain('data-testid="save-code-export"');
    expect(html).toContain('data-testid="save-code-input"');
    expect(html).toContain('data-testid="save-code-import"');
  });

  it("labels the paste field for screen readers", () => {
    const html = renderToStaticMarkup(createElement(SaveCode, { code: CODE, onImport: noop }));
    expect(html).toContain('for="save-code-input"');
    expect(html).toContain('id="save-code-input"');
  });

  it("shows no result line before an import is attempted", () => {
    const html = renderToStaticMarkup(createElement(SaveCode, { code: CODE, onImport: noop }));
    expect(html).not.toContain('data-testid="save-code-result"');
  });
});

describe("StatsOverlay save-code panel", () => {
  const base = { ledger: {}, trophyMap: {}, today: "2026-07-21", onClose: () => {} };

  it("renders the panel in the stats area when a code is supplied", () => {
    const html = renderToStaticMarkup(
      createElement(StatsOverlay, { ...base, saveCode: CODE, onImportCode: noop }),
    );
    expect(html).toContain('data-testid="save-code"');
    expect(html).toContain(CODE);
  });

  it("omits the panel when no code is supplied", () => {
    const html = renderToStaticMarkup(createElement(StatsOverlay, base));
    expect(html).not.toContain('data-testid="save-code"');
  });
});
