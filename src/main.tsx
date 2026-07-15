import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { bootRound } from "./lib/game/boot";

// The app's only reads of the wall clock and the viewport — everything
// below receives them through the RoundBoot prop (see lib/game/boot.ts).
const boot = bootRound(new Date(), {
  width: window.innerWidth,
  height: window.innerHeight,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App boot={boot} />
  </StrictMode>,
);
