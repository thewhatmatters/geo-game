import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { bootRound } from "./lib/game/boot";

// Dev-only playtest override: ?date=YYYY-MM-DD boots that UTC day's puzzle
// instead of today's. Stripped from production builds (import.meta.env.DEV
// is compile-time), so the shipped game can't be date-hopped by URL.
function resolveBootDate(): Date {
  if (import.meta.env.DEV) {
    const param = new URLSearchParams(window.location.search).get("date");
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
      const parsed = new Date(`${param}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}

// The app's only reads of the wall clock and the viewport — everything
// below receives them through the RoundBoot prop (see lib/game/boot.ts).
const boot = bootRound(resolveBootDate(), {
  width: window.innerWidth,
  height: window.innerHeight,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App boot={boot} />
  </StrictMode>,
);
