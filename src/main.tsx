import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { bootRound } from "./lib/game/boot";

// Dev-only playtest override: ?date=YYYY-MM-DD boots that local-date puzzle
// instead of today's. Stripped from production builds (import.meta.env.DEV
// is compile-time), so the shipped game can't be date-hopped by URL.
function devDateOverride(): string | null {
  return import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("date")
    : null;
}

const root = createRoot(document.getElementById("root")!);
let bootDate = "";

function renderBoot(): void {
  const boot = bootRound(new Date(), {
    width: window.innerWidth,
    height: window.innerHeight,
  }, devDateOverride());
  if (boot.date === bootDate) return;
  bootDate = boot.date;
  root.render(<StrictMode><App key={boot.date} boot={boot} /></StrictMode>);
}

renderBoot();

// A sleeping/open tab crosses midnight without reloading. Visibility is the
// natural re-entry seam: returning on a new local date boots a fresh keyed App.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderBoot();
});
