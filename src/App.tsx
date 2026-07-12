import { useEffect, useMemo, useRef } from "react";
import { Keyboard } from "./components/Keyboard";
import { CountryOutline } from "./components/CountryOutline";
import { NeighborsLayer } from "./components/NeighborsLayer";
import { TriviaOverlay } from "./components/TriviaOverlay";
import { ShareResult } from "./components/ShareResult";
import { getDailyCountry } from "./lib/game/dailyCountry";
import { useGameRound } from "./lib/game/useGameRound";
import { computeNeighborSlots } from "./lib/geo/compass";
import { useStreak } from "./lib/streak/useStreak";
import { generateShareString, getDayNumber } from "./lib/share";

const daily = getDailyCountry(new Date());
const neighborSlots = computeNeighborSlots(daily);
const dayNumber = getDayNumber(new Date());

function App() {
  const round = useGameRound(daily.target);
  const { streak, recordOutcome } = useStreak();
  const recordedRef = useRef(false);

  useEffect(() => {
    if (round.status === "running" || recordedRef.current) return;
    recordedRef.current = true;
    recordOutcome(round.status === "solved" ? "solved" : "failed");
  }, [round.status, recordOutcome]);

  const shareString = useMemo(() => {
    if (round.status === "running") return null;
    return generateShareString({
      dayNumber,
      status: round.status,
      remainingSeconds: round.remainingSeconds,
      guesses: round.guesses,
      targetName: daily.target.name,
    });
  }, [round.status, round.remainingSeconds, round.guesses]);

  return (
    <div className="app">
      <h1>Geo</h1>
      <p className="streak" data-testid="streak">
        Streak: {streak.current_streak} (best {streak.longest_streak})
      </p>
      <p className="clock" data-testid="clock">
        {Math.ceil(round.remainingSeconds)}s
      </p>
      <div className="outline-demo">
        <CountryOutline
          path={daily.target.path}
          completion={round.outlineCompletion}
          className="outline-demo__svg"
        />
        <TriviaOverlay code={daily.targetCode} />
        <NeighborsLayer
          slots={neighborSlots}
          visible={round.neighborsVisible}
          completion={round.neighborCompletion}
        />
      </div>
      <p className="display-name" data-testid="display-name">
        {round.displayName}
      </p>
      {round.status !== "running" && (
        <p className="round-outcome" data-testid="round-outcome">
          {round.status === "solved" ? "Solved!" : "Failed"}
        </p>
      )}
      {shareString && <ShareResult shareString={shareString} />}
      <Keyboard
        guesses={round.guesses}
        onGuess={round.guessLetter}
        disabled={round.status !== "running"}
      />
      <button
        type="button"
        className="give-up"
        onClick={round.giveUp}
        disabled={round.status !== "running"}
      >
        Give up
      </button>
    </div>
  );
}

export default App;
